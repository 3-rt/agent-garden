import React, { useState } from 'react';

interface TaskInputProps {
  onSubmit: (prompt: string) => void;
}

export function TaskInput({ onSubmit }: TaskInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSubmit(value.trim());
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Give your garden agent a task..."
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
        style={{
          padding: '8px 20px',
          background: '#0f3460',
          border: 'none',
          borderRadius: '4px',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          fontSize: '14px',
          cursor: 'pointer',
        }}
      >
        Plant
      </button>
    </form>
  );
}
