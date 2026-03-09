import React from 'react';

interface ThemePickerProps {
  currentTheme: string;
  themes: { id: string; name: string }[];
  onSelect: (themeId: string) => void;
}

export function ThemePicker({ currentTheme, themes, onSelect }: ThemePickerProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      fontFamily: 'monospace',
    }}>
      <span style={{ opacity: 0.6, color: '#7ec8e3' }}>Theme:</span>
      <select
        value={currentTheme}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          padding: '2px 6px',
          background: '#1a1a2e',
          border: '1px solid #0f3460',
          borderRadius: '3px',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          fontSize: '11px',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {themes.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
