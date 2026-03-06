import React, { useRef, useEffect, useState } from 'react';

export interface TaskHistoryEntry {
  taskId: string;
  prompt: string;
  code: string;
  filename: string;
  timestamp: number;
}

interface OutputPanelProps {
  currentCode: string;
  currentFile: string;
  history: TaskHistoryEntry[];
  isProcessing: boolean;
}

export function OutputPanel({ currentCode, currentFile, history, isProcessing }: OutputPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (codeRef.current && isProcessing) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [currentCode, isProcessing]);

  const handleCopy = () => {
    const text = currentCode || '';
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (!currentCode && history.length === 0) return null;

  return (
    <div style={{
      background: '#0d1b2a',
      borderTop: '1px solid #1b2838',
    }}>
      {/* Toggle bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 12px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '11px',
          fontFamily: 'monospace',
          color: '#7ec8e3',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{expanded ? '\u25BC' : '\u25B6'} Code</span>
          {currentFile && (
            <span style={{ color: '#66bb6a' }}>{currentFile}</span>
          )}
          {isProcessing && (
            <span style={{ color: '#ffca28' }}>streaming...</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {history.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowHistory(!showHistory); }}
              style={pillButtonStyle}
            >
              History ({history.length})
            </button>
          )}
          {currentCode && (
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy(); }}
              style={pillButtonStyle}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Code display */}
      {expanded && (
        <div>
          {showHistory ? (
            <div style={{
              maxHeight: '200px',
              overflow: 'auto',
              padding: '0 12px 8px',
            }}>
              {history.slice().reverse().map((entry) => (
                <HistoryItem key={entry.taskId} entry={entry} />
              ))}
            </div>
          ) : (
            <pre
              ref={codeRef}
              style={{
                maxHeight: '200px',
                overflow: 'auto',
                padding: '8px 12px',
                margin: 0,
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#c8d6e5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.5,
              }}
            >
              {currentCode || 'No output yet.'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ entry }: { entry: TaskHistoryEntry }) {
  const [open, setOpen] = useState(false);
  const time = new Date(entry.timestamp).toLocaleTimeString();

  return (
    <div style={{ marginBottom: '4px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: 'pointer',
          fontSize: '11px',
          fontFamily: 'monospace',
          color: '#7ec8e3',
          padding: '2px 0',
        }}
      >
        <span>{open ? '\u25BC' : '\u25B6'}</span>{' '}
        <span style={{ color: '#66bb6a' }}>{entry.filename}</span>{' '}
        <span style={{ opacity: 0.5 }}>{time}</span>{' '}
        <span style={{ opacity: 0.4 }}>{entry.prompt.slice(0, 40)}</span>
      </div>
      {open && (
        <pre style={{
          maxHeight: '120px',
          overflow: 'auto',
          padding: '4px 8px',
          margin: '2px 0 0 12px',
          fontSize: '10px',
          fontFamily: 'monospace',
          color: '#a0b0c0',
          background: '#0a1520',
          borderRadius: '3px',
          whiteSpace: 'pre-wrap',
        }}>
          {entry.code}
        </pre>
      )}
    </div>
  );
}

const pillButtonStyle: React.CSSProperties = {
  padding: '1px 8px',
  background: 'transparent',
  border: '1px solid #1b2838',
  borderRadius: '3px',
  color: '#7ec8e3',
  fontFamily: 'monospace',
  fontSize: '10px',
  cursor: 'pointer',
};
