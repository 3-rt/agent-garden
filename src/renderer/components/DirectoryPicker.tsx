import React from 'react';

interface DirectoryPickerProps {
  directory: string;
  additionalDirectories: string[];
}

export function DirectoryPicker({ directory, additionalDirectories }: DirectoryPickerProps) {
  const handleChangePrimary = () => {
    window.electronAPI?.selectDirectory();
  };

  const handleAddDirectory = () => {
    window.electronAPI?.addDirectory();
  };

  const handleRemoveDirectory = (dir: string) => {
    window.electronAPI?.removeDirectory(dir);
  };

  const truncate = (p: string) => {
    const name = p.split('/').pop() || p;
    return name.length > 30 ? '...' + name.slice(-27) : name;
  };

  const btnStyle: React.CSSProperties = {
    padding: '1px 6px',
    background: 'transparent',
    border: '1px solid #0f3460',
    borderRadius: '3px',
    color: '#7ec8e3',
    fontFamily: 'monospace',
    fontSize: '10px',
    cursor: 'pointer',
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '11px',
      color: '#7ec8e3',
      fontFamily: 'monospace',
      flexWrap: 'wrap',
    }}>
      {/* Primary directory */}
      <span style={{ opacity: 0.6 }}>Primary:</span>
      <span title={directory}>{truncate(directory) || 'No directory selected'}</span>
      <button onClick={handleChangePrimary} style={btnStyle}>Change</button>

      {/* Additional directories */}
      {additionalDirectories.map((dir) => (
        <span
          key={dir}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '1px 6px',
            background: '#0d1117',
            border: '1px solid #0f3460',
            borderRadius: '3px',
          }}
        >
          <span style={{ opacity: 0.6 }}>+</span>
          <span title={dir}>{truncate(dir)}</span>
          <button
            onClick={() => handleRemoveDirectory(dir)}
            style={{
              ...btnStyle,
              border: '1px solid #4a1515',
              color: '#ef5350',
              fontSize: '9px',
              padding: '0 3px',
            }}
            title={`Remove ${dir}`}
          >x</button>
        </span>
      ))}

      <button onClick={handleAddDirectory} style={{ ...btnStyle, color: '#66bb6a', borderColor: '#388e3c' }}>
        + Dir
      </button>
    </div>
  );
}
