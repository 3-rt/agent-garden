import React from 'react';
import type { GardenStats, HookConnectionStatus } from '../../shared/types';

interface StatsPanelProps {
  stats: GardenStats;
  plantCount: number;
  hookStatus?: HookConnectionStatus;
}

export function StatsPanel({ stats, plantCount, hookStatus }: StatsPanelProps) {
  const uptime = Math.floor((Date.now() - stats.sessionStart) / 60000);
  const successRate = stats.tasksCompleted + stats.tasksFailed > 0
    ? Math.round((stats.tasksCompleted / (stats.tasksCompleted + stats.tasksFailed)) * 100)
    : 100;

  const health = Math.min(100, Math.round(
    (successRate * 0.5) +
    (Math.min(plantCount, 20) / 20 * 30) +
    (Math.min(stats.tasksCompleted, 10) / 10 * 20)
  ));

  const healthColor = health >= 80 ? '#66bb6a' : health >= 50 ? '#ffca28' : '#ef5350';

  const hookDot = hookStatus === 'connected' ? '#66bb6a'
    : hookStatus === 'waiting' ? '#ffca28'
    : '#555';
  const hookLabel = hookStatus === 'connected' ? 'Connected'
    : hookStatus === 'waiting' ? 'Waiting'
    : 'Not configured';

  return (
    <div style={{
      display: 'flex',
      gap: '16px',
      padding: '6px 12px',
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#8899aa',
      background: '#0d1117',
      borderTop: '1px solid #1b2838',
      flexWrap: 'wrap',
    }}>
      <StatItem label="Health" value={`${health}%`} color={healthColor} />
      <StatItem label="Plants" value={`${plantCount}`} color="#66bb6a" />
      <StatItem label="Files" value={`${stats.filesCreated}`} color="#42a5f5" />
      <StatItem label="Tasks" value={`${stats.tasksCompleted}`} color="#7ec8e3" />
      <StatItem label="Errors" value={`${stats.tasksFailed}`} color={stats.tasksFailed > 0 ? '#ef5350' : '#555'} />
      <StatItem label="Agents" value={`${stats.activeAgents}`} color="#ab47bc" />
      <StatItem label="Uptime" value={`${uptime}m`} color="#555" />
      <span>
        <span style={{ opacity: 0.5 }}>Hooks: </span>
        <span style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: hookDot,
          marginRight: '4px',
          verticalAlign: 'middle',
        }} />
        <span style={{ color: hookDot }}>{hookLabel}</span>
      </span>
    </div>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span>
      <span style={{ opacity: 0.5 }}>{label}: </span>
      <span style={{ color }}>{value}</span>
    </span>
  );
}
