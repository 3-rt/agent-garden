import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GardenGame } from './game/GardenGame';
import { TaskInput } from './components/TaskInput';
import { DirectoryPicker } from './components/DirectoryPicker';
import { OutputPanel, TaskHistoryEntry } from './components/OutputPanel';
import { ApiKeyModal } from './components/ApiKeyModal';
import { StatsPanel, GardenStatsData } from './components/StatsPanel';
import { ThemePicker } from './components/ThemePicker';
import { ThemeManager } from './game/systems/ThemeManager';
import type { AgentInfo } from '../shared/types';

const availableThemes = ThemeManager.getAvailableThemes();

export function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GardenGame | null>(null);
  const [streamText, setStreamText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [directory, setDirectory] = useState('');
  const [savedFile, setSavedFile] = useState('');
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastError, setLastError] = useState('');
  const [agentInfos, setAgentInfos] = useState<AgentInfo[]>([]);
  const [activeAgentId, setActiveAgentId] = useState('');
  const [stats, setStats] = useState<GardenStatsData>({
    filesCreated: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    tokensUsed: 0,
    sessionStart: Date.now(),
  });
  const [currentTheme, setCurrentTheme] = useState('garden');

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

    window.electronAPI?.getHasApiKey().then((has) => {
      if (!has && !process.env.ANTHROPIC_API_KEY) {
        setShowKeyModal(true);
      }
    });

    // Load initial agent info and stats
    window.electronAPI?.getAgentInfo().then((infos) => setAgentInfos(infos));
    window.electronAPI?.getStats().then((s) => setStats(s));

    window.electronAPI?.onAgentStream((chunk) => {
      if (!chunk.done) {
        setStreamText((prev) => prev + chunk.text);
        gameRef.current?.onAgentThought(chunk.agentId, chunk.text);
      } else {
        gameRef.current?.onTaskComplete(chunk.agentId);
      }
    });

    window.electronAPI?.onFileEvent((event) => {
      if (event.type === 'created') {
        gameRef.current?.onFileCreated(event.path);
      } else if (event.type === 'modified') {
        gameRef.current?.onFileModified(event.path);
      }
    });

    window.electronAPI?.onTaskStatus((status) => {
      if (status.status === 'in-progress') {
        setIsProcessing(true);
        setLastError('');
        setActiveAgentId(status.agentId);
        gameRef.current?.onTaskStart(status.agentId);
      } else if (status.status === 'complete') {
        setIsProcessing(false);
      } else if (status.status === 'error') {
        setIsProcessing(false);
      }
    });

    window.electronAPI?.onFileSaved((info) => {
      setSavedFile(info.filename);
      setStreamText((current) => {
        setHistory((prev) => {
          const entry: TaskHistoryEntry = {
            taskId: info.taskId,
            prompt: lastPrompt,
            code: current,
            filename: info.filename,
            timestamp: Date.now(),
          };
          const updated = [...prev, entry];
          return updated.slice(-50);
        });
        return current;
      });
    });

    window.electronAPI?.onDirectoryChanged((dir) => setDirectory(dir));

    window.electronAPI?.onAgentError((error) => {
      setLastError(error.message);
      gameRef.current?.onError(error.agentId);
    });

    window.electronAPI?.onAgentsUpdated((agents) => {
      setAgentInfos(agents);
      for (const agent of agents) {
        gameRef.current?.updateAgentTokens(agent.id, agent.totalTokens);
      }
    });

    window.electronAPI?.onStatsUpdated((s) => setStats(s));

    // Auto-save: listen for periodic save requests from main process
    window.electronAPI?.onSaveRequested(() => {
      if (gameRef.current) {
        const plants = gameRef.current.getPlantStates();
        const theme = gameRef.current.getThemeId();
        window.electronAPI?.saveGardenState(plants, theme);
      }
    });

    return () => {
      // Save state on unmount
      if (gameRef.current) {
        const plants = gameRef.current.getPlantStates();
        const theme = gameRef.current.getThemeId();
        window.electronAPI?.saveGardenState(plants, theme);
      }
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  const handleSubmitTask = useCallback((prompt: string) => {
    setStreamText('');
    setSavedFile('');
    setLastError('');
    setLastPrompt(prompt);
    window.electronAPI?.submitTask(prompt);
  }, []);

  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      handleSubmitTask(lastPrompt);
    }
  }, [lastPrompt, handleSubmitTask]);

  const handleSaveApiKey = useCallback((key: string) => {
    window.electronAPI?.setApiKey(key);
    setShowKeyModal(false);
  }, []);

  const handleThemeChange = useCallback((themeId: string) => {
    setCurrentTheme(themeId);
    gameRef.current?.setTheme(themeId);
    window.electronAPI?.setTheme(themeId);
  }, []);

  const roleColor: Record<string, string> = {
    planter: '#66bb6a',
    weeder: '#ffa726',
    tester: '#42a5f5',
  };

  const plantCount = gameRef.current?.getPlantCount() || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {showKeyModal && (
        <ApiKeyModal
          onSave={handleSaveApiKey}
          onDemoMode={() => setShowKeyModal(false)}
        />
      )}
      <div
        ref={gameContainerRef}
        style={{ flex: 1, minHeight: 0 }}
      />
      <OutputPanel
        currentCode={streamText}
        currentFile={savedFile}
        history={history}
        isProcessing={isProcessing}
      />
      <div style={{ padding: '8px 16px', background: '#16213e', borderTop: '2px solid #0f3460' }}>
        {/* Agent status bar */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '6px',
          fontSize: '11px',
          fontFamily: 'monospace',
        }}>
          {agentInfos.map((agent) => (
            <div
              key={agent.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                background: agent.busy ? '#1a2a1a' : '#0d1117',
                borderRadius: '3px',
                border: `1px solid ${agent.id === activeAgentId && isProcessing ? roleColor[agent.role] || '#555' : '#333'}`,
                color: roleColor[agent.role] || '#aaa',
              }}
            >
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: agent.busy ? '#ffca28' : '#66bb6a',
                display: 'inline-block',
              }} />
              <span>{agent.role}</span>
              <span style={{ color: '#666', fontSize: '10px' }}>
                {Math.round(agent.totalTokens / 1000)}k
              </span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <ThemePicker
              currentTheme={currentTheme}
              themes={availableThemes}
              onSelect={handleThemeChange}
            />
          </div>
        </div>
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
            <button
              onClick={handleRetry}
              disabled={isProcessing}
              style={{
                padding: '2px 10px',
                background: '#4a1515',
                border: 'none',
                borderRadius: '3px',
                color: '#ef9a9a',
                fontFamily: 'monospace',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}
        <TaskInput onSubmit={handleSubmitTask} disabled={isProcessing} />
        <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <DirectoryPicker directory={directory} />
        </div>
      </div>
      <StatsPanel stats={stats} plantCount={plantCount} />
    </div>
  );
}
