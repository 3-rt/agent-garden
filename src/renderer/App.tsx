import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GardenGame } from './game/GardenGame';
import { DirectoryPicker } from './components/DirectoryPicker';
import { StatsPanel } from './components/StatsPanel';
import { ThemePicker } from './components/ThemePicker';
import { SetupBanner } from './components/SetupBanner';
import { HookSetupModal } from './components/HookSetupModal';
import { ThemeManager } from './game/systems/ThemeManager';
import type { CCAgentSession, OrchestrationPlan, GardenStats, HookConnectionStatus } from '../shared/types';

const availableThemes = ThemeManager.getAvailableThemes();

export function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GardenGame | null>(null);
  const [directory, setDirectory] = useState('');
  const [additionalDirectories, setAdditionalDirectories] = useState<string[]>([]);
  const [lastError, setLastError] = useState('');
  const [stats, setStats] = useState<GardenStats>({
    filesCreated: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    activeAgents: 0,
    sessionStart: Date.now(),
  });
  const [hookStatus, setHookStatus] = useState<HookConnectionStatus>('waiting');
  const [showSetupBanner, setShowSetupBanner] = useState(false);
  const [cliInstalled, setCliInstalled] = useState(true);
  const [hooksConfigured, setHooksConfigured] = useState(true);
  const [showHookSetupModal, setShowHookSetupModal] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('garden');
  const [ccAgents, setCCAgents] = useState<CCAgentSession[]>([]);
  const [plans, setPlans] = useState<OrchestrationPlan[]>([]);
  const [goalInput, setGoalInput] = useState('');

  useEffect(() => {
    if (gameContainerRef.current && !gameRef.current) {
      gameRef.current = new GardenGame(gameContainerRef.current);

      // Restore garden state after a short delay (scene needs to initialize)
      setTimeout(() => {
        window.electronAPI?.getGardenState().then((state) => {
          if (state && gameRef.current) {
            gameRef.current.restorePlants(state.plants);
            if (state.theme) {
              gameRef.current.setTheme(state.theme);
              setCurrentTheme(state.theme);
            }
            if (state.stats) {
              setStats(state.stats);
            }
          }
        });
      }, 500);
    }

    // Load initial stats
    window.electronAPI?.getStats().then((s) => setStats(s));

    window.electronAPI?.onFileEvent((event) => {
      if (event.type === 'created') {
        gameRef.current?.onFileCreated(event.path, event.directory, event.creatorRole);
      } else if (event.type === 'modified') {
        gameRef.current?.onFileModified(event.path);
      } else if (event.type === 'deleted') {
        gameRef.current?.onFileDeleted(event.path, event.directory);
      }
    });

    window.electronAPI?.onDirectoryChanged((dir) => setDirectory(dir));

    // Directory management (Phase 5f)
    window.electronAPI?.getDirectories().then((dirs) => {
      if (dirs) {
        setDirectory(dirs.primary);
        setAdditionalDirectories(dirs.additional);
      }
    });
    window.electronAPI?.onDirectoriesUpdated((dirs) => {
      setDirectory(dirs.primary);
      setAdditionalDirectories(dirs.additional);
    });
    window.electronAPI?.onStatsUpdated((s) => setStats(s));

    // Hook status
    window.electronAPI?.getHookStatus().then((s) => setHookStatus(s));
    window.electronAPI?.onHookStatusChanged((s) => setHookStatus(s));

    // Check hook configuration on mount
    (async () => {
      const config = await window.electronAPI?.checkHookConfig();
      if (config) {
        setCliInstalled(config.cliInstalled);
        setHooksConfigured(config.hooksConfigured);
        if (!config.hooksConfigured) {
          setHookStatus('not-configured');
          const dismissed = await window.electronAPI?.checkBannerDismissed();
          if (!dismissed) {
            setShowSetupBanner(true);
          }
        }
      }
    })();

    // Claude Code agent events
    window.electronAPI?.getCCAgents().then((agents) => {
      setCCAgents(agents);
      for (const agent of agents) {
        const label = agent.directory
          ? agent.directory.split('/').pop() || agent.agentId
          : agent.agentId;
        gameRef.current?.addAgent(agent.agentId, agent.role, label);
      }
    });

    window.electronAPI?.onCCAgentConnected((session) => {
      setCCAgents((prev) => [...prev, session]);
      const label = session.directory
        ? session.directory.split('/').pop() || session.agentId
        : session.agentId;
      gameRef.current?.addAgent(session.agentId, session.role, label);
    });

    window.electronAPI?.onCCAgentActivity((data) => {
      let detail: string | undefined;
      if (data.prompt) detail = data.prompt;
      else if (data.tool && data.file) detail = `${data.tool}: ${data.file}`;
      else if (data.tool) detail = data.tool;

      gameRef.current?.showActivity(data.agentId, data.event, detail);
    });

    window.electronAPI?.onCCAgentDisconnected((data) => {
      setCCAgents((prev) => prev.filter((a) => a.agentId !== data.agentId));
      gameRef.current?.removeAgent(data.agentId);
    });

    window.electronAPI?.onCCAgentOutput((data) => {
      gameRef.current?.onAgentThought(data.agentId, data.text);
    });

    window.electronAPI?.onCCAgentExited((data) => {
      if (data.code === 0 || data.code === null) {
        gameRef.current?.onTaskComplete(data.agentId);
      } else {
        gameRef.current?.onError(data.agentId);
      }
      // Remove sprite after a short delay so the completion/error animation is visible
      setTimeout(() => {
        setCCAgents((prev) => prev.filter((a) => a.sessionId !== data.sessionId));
        gameRef.current?.removeAgent(data.agentId);
      }, 3000);
    });

    // Head Gardener orchestration events
    window.electronAPI?.getPlans().then((p) => setPlans(p));

    window.electronAPI?.onPlanCreated((plan) => {
      setPlans((prev) => [...prev, plan]);
    });

    window.electronAPI?.onSubtaskUpdated((data) => {
      setPlans((prev) =>
        prev.map((p) =>
          p.id === data.planId
            ? {
                ...p,
                subtasks: p.subtasks.map((s) =>
                  s.id === data.subtask.id ? data.subtask : s
                ),
              }
            : p
        )
      );
    });

    window.electronAPI?.onPlanCompleted((plan) => {
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)));
    });

    // Auto-save: listen for periodic save requests from main process
    window.electronAPI?.onSaveRequested(() => {
      if (gameRef.current) {
        const plants = gameRef.current.getPlantStates();
        const theme = gameRef.current.getThemeId();
        window.electronAPI?.saveGardenState(plants, theme);
      }
    });

    return () => {
      if (gameRef.current) {
        const plants = gameRef.current.getPlantStates();
        const theme = gameRef.current.getThemeId();
        window.electronAPI?.saveGardenState(plants, theme);
      }
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  const handleThemeChange = useCallback((themeId: string) => {
    setCurrentTheme(themeId);
    gameRef.current?.setTheme(themeId);
    window.electronAPI?.setTheme(themeId);
  }, []);

  const handleSubmitGoal = useCallback(async () => {
    if (!goalInput.trim()) return;
    const goal = goalInput.trim();
    setGoalInput('');
    await window.electronAPI?.submitGoal(goal);
  }, [goalInput]);

  const handleSpawnAgent = useCallback(async () => {
    const prompt = window.prompt('Task for the new agent (leave empty for interactive):');
    if (prompt === null) return;

    // If multiple directories are available, let user pick
    let targetDir = directory || undefined;
    const allDirs = [directory, ...additionalDirectories].filter(Boolean);
    if (allDirs.length > 1) {
      const dirNames = allDirs.map((d, i) => `${i + 1}. ${d.split('/').pop()}`).join('\n');
      const choice = window.prompt(`Choose directory (1-${allDirs.length}):\n${dirNames}`, '1');
      if (choice === null) return;
      const idx = parseInt(choice, 10) - 1;
      if (idx >= 0 && idx < allDirs.length) {
        targetDir = allDirs[idx];
      }
    }

    const result = await window.electronAPI?.spawnAgent('unassigned', prompt || undefined, targetDir);
    if (!result) {
      setLastError('Failed to spawn agent. Is Claude CLI installed?');
    }
  }, [directory, additionalDirectories]);

  const handleStopAgent = useCallback((sessionId: string) => {
    window.electronAPI?.stopAgent(sessionId);
  }, []);

  const handleOpenTerminal = useCallback((sessionId: string) => {
    window.electronAPI?.openTerminal(sessionId);
  }, []);

  const roleColor: Record<string, string> = {
    planter: '#66bb6a',
    weeder: '#ffa726',
    tester: '#42a5f5',
    unassigned: '#ce93d8',
  };

  const plantCount = gameRef.current?.getPlantCount() || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {showSetupBanner && (
        <SetupBanner
          cliInstalled={cliInstalled}
          hooksConfigured={hooksConfigured}
          onConfigureClick={() => setShowHookSetupModal(true)}
          onDismiss={() => {
            setShowSetupBanner(false);
            window.electronAPI?.dismissBanner();
          }}
        />
      )}
      <div
        ref={gameContainerRef}
        style={{ flex: 1, minHeight: 0 }}
      />
      <div style={{ padding: '8px 16px', background: '#16213e', borderTop: '2px solid #0f3460' }}>
        {/* Claude Code agent status bar */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '6px',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}>
          {ccAgents.map((agent) => (
            <div
              key={agent.agentId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                background: agent.status === 'working' ? '#1a1a2a' : '#0d1117',
                borderRadius: '3px',
                border: `1px solid ${agent.status === 'working' ? roleColor[agent.role] || '#ce93d8' : '#333'}`,
                color: roleColor[agent.role] || '#ce93d8',
              }}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: agent.status === 'working' ? '#ffca28' : agent.status === 'idle' ? '#66bb6a' : '#666',
                display: 'inline-block',
              }} />
              <span>{agent.directory ? agent.directory.split('/').pop() : agent.role}</span>
              <span style={{ color: '#666', fontSize: '10px' }}>
                {agent.source === 'process' ? 'ps' : agent.source === 'spawned' ? 'spawned' : 'hook'}
              </span>
              {agent.source === 'spawned' && (
                <>
                  <button
                    onClick={() => handleOpenTerminal(agent.sessionId)}
                    style={{
                      padding: '0 4px', background: 'transparent', border: '1px solid #444',
                      borderRadius: '2px', color: '#7ec8e3', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace',
                    }}
                    title="Open in terminal"
                  >term</button>
                  <button
                    onClick={() => handleStopAgent(agent.sessionId)}
                    style={{
                      padding: '0 4px', background: 'transparent', border: '1px solid #4a1515',
                      borderRadius: '2px', color: '#ef5350', fontSize: '9px', cursor: 'pointer', fontFamily: 'monospace',
                    }}
                    title="Stop agent"
                  >stop</button>
                </>
              )}
            </div>
          ))}
          <button
            onClick={handleSpawnAgent}
            style={{
              padding: '2px 8px',
              background: '#0d1117',
              border: '1px solid #388e3c',
              borderRadius: '3px',
              color: '#66bb6a',
              fontFamily: 'monospace',
              fontSize: '11px',
              cursor: 'pointer',
            }}
            title="Spawn a new Claude Code agent"
          >+ Agent</button>
          <div style={{ marginLeft: 'auto' }}>
            <ThemePicker
              currentTheme={currentTheme}
              themes={availableThemes}
              onSelect={handleThemeChange}
            />
          </div>
        </div>
        {/* Head Gardener: goal input + plan status */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '6px',
          alignItems: 'center',
        }}>
          <input
            type="text"
            value={goalInput}
            onChange={(e) => setGoalInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitGoal(); }}
            placeholder="Submit a goal to the Head Gardener..."
            style={{
              flex: 1,
              padding: '4px 8px',
              background: '#0d1117',
              border: '1px solid #388e3c',
              borderRadius: '3px',
              color: '#c9d1d9',
              fontFamily: 'monospace',
              fontSize: '12px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSubmitGoal}
            disabled={!goalInput.trim()}
            style={{
              padding: '4px 12px',
              background: '#1b5e20',
              border: 'none',
              borderRadius: '3px',
              color: '#a5d6a7',
              fontFamily: 'monospace',
              fontSize: '11px',
              cursor: goalInput.trim() ? 'pointer' : 'default',
              opacity: goalInput.trim() ? 1 : 0.5,
            }}
          >
            Delegate
          </button>
        </div>
        {plans.filter((p) => p.status === 'in-progress').map((plan) => (
          <div key={plan.id} style={{
            marginBottom: '4px',
            padding: '4px 8px',
            background: '#0d1117',
            borderRadius: '3px',
            border: '1px solid #1b5e20',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#a5d6a7',
          }}>
            <div style={{ marginBottom: '2px', color: '#66bb6a' }}>
              {plan.goal}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {plan.subtasks.map((st) => (
                <span key={st.id} style={{
                  padding: '1px 6px',
                  borderRadius: '2px',
                  background: st.status === 'complete' ? '#1b5e20'
                    : st.status === 'error' ? '#4a1515'
                    : st.status === 'assigned' ? '#1a1a2a'
                    : '#0d1117',
                  color: st.status === 'complete' ? '#66bb6a'
                    : st.status === 'error' ? '#ef5350'
                    : st.status === 'assigned' ? '#7ec8e3'
                    : '#666',
                  border: `1px solid ${
                    st.status === 'complete' ? '#388e3c'
                    : st.status === 'error' ? '#4a1515'
                    : st.status === 'assigned' ? '#0f3460'
                    : '#333'
                  }`,
                }}>
                  {st.role}: {st.prompt.slice(0, 40)}{st.prompt.length > 40 ? '...' : ''}
                  {st.status === 'complete' ? ' done' : st.status === 'error' ? ' err' : st.status === 'assigned' ? ' ...' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
        {lastError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            padding: '6px 10px',
            background: '#1a0a0a',
            borderRadius: '4px',
            border: '1px solid #4a1515',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#ef5350',
          }}>
            <span style={{ flex: 1 }}>{lastError}</span>
          </div>
        )}
        <div style={{ marginTop: '6px' }}>
          <DirectoryPicker directory={directory} additionalDirectories={additionalDirectories} />
        </div>
      </div>
      <StatsPanel stats={stats} plantCount={plantCount} hookStatus={hookStatus} />
      {showHookSetupModal && (
        <HookSetupModal
          onClose={() => setShowHookSetupModal(false)}
          onAutoConfigured={() => {
            setHooksConfigured(true);
            setShowSetupBanner(false);
            setHookStatus('waiting');
          }}
        />
      )}
    </div>
  );
}
