import React, { useState } from 'react';

interface TaskInputProps {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
}

export function TaskInput({ onSubmit, disabled }: TaskInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit(value.trim());
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "Agent is working..." : "Give your garden agent a task..."}
        style={{
          flex: 1,
          padding: '8px 12px',
          background: '#1a1a2e',
          border: '1px solid #0f3460',
          borderRadius: '4px',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          fontSize: '14px',
          outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={disabled}
        style={{
          padding: '8px 20px',
          background: disabled ? '#0a2040' : '#0f3460',
          border: 'none',
          borderRadius: '4px',
          color: disabled ? '#666' : '#e0e0e0',
          fontFamily: 'monospace',
          fontSize: '14px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {disabled ? 'Working...' : 'Plant'}
      </button>
    </form>
  );
}
