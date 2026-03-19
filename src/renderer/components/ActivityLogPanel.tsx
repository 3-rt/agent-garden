import React from 'react';
import type { ActivityLogEntry } from '../../shared/types';

interface ActivityLogPanelProps {
  entries: ActivityLogEntry[];
  selectedAgentLabel?: string;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onClearAgentFilter: () => void;
}

export function ActivityLogPanel({
  entries,
  selectedAgentLabel,
  searchText,
  onSearchTextChange,
  onClearAgentFilter,
}: ActivityLogPanelProps) {
  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: '#7ec8e3' }}>Activity Log</span>
          <span style={{ color: '#666' }}>{entries.length} shown</span>
          {selectedAgentLabel && (
            <>
              <span style={filterBadgeStyle}>{selectedAgentLabel}</span>
              <button onClick={onClearAgentFilter} style={controlButtonStyle}>
                Clear
              </button>
            </>
          )}
        </div>
        <input
          type="text"
          value={searchText}
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Search logs..."
          style={searchInputStyle}
        />
      </div>
      <div style={listStyle}>
        {entries.length === 0 ? (
          <div style={emptyStateStyle}>
            {searchText.trim() || selectedAgentLabel
              ? 'No log entries match the current filters.'
              : 'No activity yet.'}
          </div>
        ) : (
          entries.map((entry) => <ActivityLogItem key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}

function ActivityLogItem({ entry }: { entry: ActivityLogEntry }) {
  const agentLabel = entry.agentLabel || entry.agentId;
  return (
    <div style={itemStyle}>
      <div style={itemMetaStyle}>
        <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
        {agentLabel && <span>{agentLabel}</span>}
        {entry.status && <span>{entry.status}</span>}
      </div>
      <div style={{ color: '#c9d1d9' }}>{entry.message}</div>
      {(entry.file || entry.tool || entry.planId) && (
        <div style={itemMetaStyle}>
          {entry.file && <span>{entry.file}</span>}
          {entry.tool && <span>{entry.tool}</span>}
          {entry.planId && <span>{entry.planId}</span>}
        </div>
      )}
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  marginTop: '8px',
  background: '#0d1117',
  border: '1px solid #1b2838',
  borderRadius: '4px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  alignItems: 'center',
  padding: '8px 10px',
  borderBottom: '1px solid #1b2838',
  flexWrap: 'wrap',
  fontFamily: 'monospace',
  fontSize: '11px',
};

const listStyle: React.CSSProperties = {
  maxHeight: '220px',
  overflow: 'auto',
  padding: '6px 8px',
};

const itemStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: '3px',
  background: '#111827',
  marginBottom: '6px',
  fontFamily: 'monospace',
  fontSize: '11px',
};

const itemMetaStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  color: '#667788',
  marginBottom: '3px',
  flexWrap: 'wrap',
};

const filterBadgeStyle: React.CSSProperties = {
  padding: '1px 6px',
  border: '1px solid #0f3460',
  borderRadius: '999px',
  color: '#7ec8e3',
};

const controlButtonStyle: React.CSSProperties = {
  padding: '1px 8px',
  background: 'transparent',
  border: '1px solid #1b2838',
  borderRadius: '3px',
  color: '#7ec8e3',
  fontFamily: 'monospace',
  fontSize: '10px',
  cursor: 'pointer',
};

const searchInputStyle: React.CSSProperties = {
  minWidth: '180px',
  padding: '4px 8px',
  background: '#081018',
  border: '1px solid #1b2838',
  borderRadius: '3px',
  color: '#c9d1d9',
  fontFamily: 'monospace',
  fontSize: '11px',
  outline: 'none',
};

const emptyStateStyle: React.CSSProperties = {
  padding: '16px 8px',
  color: '#667788',
  fontFamily: 'monospace',
  fontSize: '11px',
};
