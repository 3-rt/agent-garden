import React from 'react';

interface DirectoryPickerProps {
  directory: string;
}

export function DirectoryPicker({ directory }: DirectoryPickerProps) {
  const handleClick = () => {
    window.electronAPI?.selectDirectory();
  };

  const displayPath = directory.length > 40
    ? '...' + directory.slice(-37)
    : directory;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '11px',
      color: '#7ec8e3',
      fontFamily: 'monospace',
    }}>
      <span style={{ opacity: 0.6 }}>Output:</span>
      <span title={directory}>{displayPath || 'No directory selected'}</span>
      <button
        onClick={handleClick}
        style={{
          padding: '2px 8px',
          background: 'transparent',
          border: '1px solid #0f3460',
          borderRadius: '3px',
          color: '#7ec8e3',
          fontFamily: 'monospace',
          fontSize: '11px',
          cursor: 'pointer',
        }}
      >
        Change
      </button>
    </div>
  );
}
