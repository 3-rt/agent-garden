import React from 'react';

interface SetupBannerProps {
  cliInstalled: boolean;
  hooksConfigured: boolean;
  onConfigureClick: () => void;
  onDismiss: () => void;
}

export function SetupBanner({ cliInstalled, hooksConfigured, onConfigureClick, onDismiss }: SetupBannerProps) {
  if (hooksConfigured) return null;

  const message = !cliInstalled
    ? 'Claude Code CLI not found. Install it first, then configure hooks.'
    : 'Claude Code hooks not detected. The garden works with limited visibility (process scanning only).';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      background: '#1a1a0a',
      borderBottom: '1px solid #4a4a15',
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffca28',
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      {cliInstalled && (
        <button
          onClick={onConfigureClick}
          style={{
            padding: '4px 12px',
            background: '#1b5e20',
            border: 'none',
            borderRadius: '3px',
            color: '#a5d6a7',
            fontFamily: 'monospace',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          Configure Hooks
        </button>
      )}
      <button
        onClick={onDismiss}
        style={{
          padding: '2px 8px',
          background: 'transparent',
          border: '1px solid #444',
          borderRadius: '3px',
          color: '#666',
          fontFamily: 'monospace',
          fontSize: '11px',
          cursor: 'pointer',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
