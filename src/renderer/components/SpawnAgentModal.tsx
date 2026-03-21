import React, { useState, useEffect, useRef } from 'react';

interface SpawnAgentModalProps {
  directories: string[];
  onSpawn: (prompt: string | undefined, directory: string | undefined) => void;
  onClose: () => void;
}

export function SpawnAgentModal({ directories, onSpawn, onClose }: SpawnAgentModalProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedDir, setSelectedDir] = useState(directories[0] || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    onSpawn(prompt.trim() || undefined, selectedDir || undefined);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '6px',
        padding: '16px',
        width: '360px',
        fontFamily: 'monospace',
        color: '#c9d1d9',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>
          Spawn Agent
        </div>

        <label style={{ fontSize: '11px', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
          Task (leave empty for interactive)
        </label>
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. fix the login bug"
          style={{
            width: '100%',
            padding: '6px 8px',
            background: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#c9d1d9',
            fontFamily: 'monospace',
            fontSize: '12px',
            marginBottom: '12px',
            boxSizing: 'border-box',
          }}
        />

        {directories.length > 1 && (
          <>
            <label style={{ fontSize: '11px', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
              Directory
            </label>
            <select
              value={selectedDir}
              onChange={(e) => setSelectedDir(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                background: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '4px',
                color: '#c9d1d9',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            >
              {directories.map((d) => (
                <option key={d} value={d}>{d.split('/').pop()}</option>
              ))}
            </select>
          </>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: '#8b949e',
              fontFamily: 'monospace',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >Cancel</button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '4px 12px',
              background: '#238636',
              border: '1px solid #2ea043',
              borderRadius: '4px',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >Spawn</button>
        </div>
      </div>
    </div>
  );
}
