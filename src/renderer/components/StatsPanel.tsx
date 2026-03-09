import React from 'react';

export interface GardenStatsData {
  filesCreated: number;
  tasksCompleted: number;
  tasksFailed: number;
  tokensUsed: number;
  sessionStart: number;
}

interface StatsPanelProps {
  stats: GardenStatsData;
  plantCount: number;
}

export function StatsPanel({ stats, plantCount }: StatsPanelProps) {
  const uptime = Math.floor((Date.now() - stats.sessionStart) / 60000);
  const successRate = stats.tasksCompleted + stats.tasksFailed > 0
    ? Math.round((stats.tasksCompleted / (stats.tasksCompleted + stats.tasksFailed)) * 100)
    : 100;

  // Garden health: weighted score
  const health = Math.min(100, Math.round(
    (successRate * 0.5) +
    (Math.min(plantCount, 20) / 20 * 30) +
    (Math.min(stats.tasksCompleted, 10) / 10 * 20)
  ));

  const healthColor = health >= 80 ? '#66bb6a' : health >= 50 ? '#ffca28' : '#ef5350';

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
      <StatItem label="Tokens" value={formatTokens(stats.tokensUsed)} color="#ab47bc" />
      <StatItem label="Uptime" value={`${uptime}m`} color="#555" />
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
