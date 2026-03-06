import React, { useState } from 'react';

interface ApiKeyModalProps {
  onSave: (key: string) => void;
  onDemoMode: () => void;
}

export function ApiKeyModal({ onSave, onDemoMode }: ApiKeyModalProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key should start with sk-ant-');
      return;
    }
    onSave(trimmed);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: '#16213e',
        border: '1px solid #0f3460',
        borderRadius: '8px',
        padding: '24px',
        width: '420px',
        fontFamily: 'monospace',
      }}>
        <h2 style={{ margin: '0 0 8px', fontSize: '16px', color: '#c8e6c9' }}>
          Agent Garden Setup
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#7ec8e3', lineHeight: 1.5 }}>
          Enter your Anthropic API key to enable Claude-powered code generation.
          Your key is stored locally and encrypted.
        </p>

        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(''); }}
          placeholder="sk-ant-..."
          style={{
            width: '100%',
            padding: '8px 12px',
            background: '#1a1a2e',
            border: `1px solid ${error ? '#ef5350' : '#0f3460'}`,
            borderRadius: '4px',
            color: '#e0e0e0',
            fontFamily: 'monospace',
            fontSize: '13px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {error && (
          <div style={{ color: '#ef5350', fontSize: '11px', marginTop: '4px' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
          <button onClick={onDemoMode} style={linkStyle}>
            Use Demo Mode
          </button>
          <button onClick={handleSave} style={primaryStyle}>
            Save Key
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryStyle: React.CSSProperties = {
  padding: '8px 20px',
  background: '#0f3460',
  border: 'none',
  borderRadius: '4px',
  color: '#e0e0e0',
  fontFamily: 'monospace',
  fontSize: '13px',
  cursor: 'pointer',
};

const linkStyle: React.CSSProperties = {
  padding: '8px 12px',
  background: 'transparent',
  border: 'none',
  color: '#7ec8e3',
  fontFamily: 'monospace',
  fontSize: '12px',
  cursor: 'pointer',
  textDecoration: 'underline',
};
