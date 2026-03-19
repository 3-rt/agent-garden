import React, { useState } from 'react';

interface HookSetupModalProps {
  onClose: () => void;
  onAutoConfigured: () => void;
}

function hookEntry(url: string) {
  return [{ hooks: [{ type: 'http', url }] }];
}

const HOOK_CONFIG = {
  hooks: {
    SessionStart: hookEntry('http://localhost:7890/hooks/SessionStart'),
    SessionEnd: hookEntry('http://localhost:7890/hooks/SessionEnd'),
    Stop: hookEntry('http://localhost:7890/hooks/Stop'),
    PreToolUse: hookEntry('http://localhost:7890/hooks/PreToolUse'),
    PostToolUse: hookEntry('http://localhost:7890/hooks/PostToolUse'),
    UserPromptSubmit: hookEntry('http://localhost:7890/hooks/UserPromptSubmit'),
    Notification: hookEntry('http://localhost:7890/hooks/Notification'),
  },
};

export function HookSetupModal({ onClose, onAutoConfigured }: HookSetupModalProps) {
  const [step, setStep] = useState(1);
  const [autoConfigResult, setAutoConfigResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  const configSnippet = JSON.stringify(HOOK_CONFIG, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(configSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAutoConfigure = async () => {
    const result = await window.electronAPI?.autoConfigureHooks();
    if (result) {
      setAutoConfigResult(result);
      if (result.success) {
        setStep(3);
        onAutoConfigured();
      }
    }
  };

  const handleVerify = async () => {
    const result = await window.electronAPI?.checkHookConfig();
    if (result) {
      setVerifyResult(result.hooksConfigured);
      if (result.hooksConfigured) {
        onAutoConfigured();
      }
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: '#16213e',
    border: '2px solid #0f3460',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#c9d1d9',
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 16px',
    background: '#1b5e20',
    border: 'none',
    borderRadius: '3px',
    color: '#a5d6a7',
    fontFamily: 'monospace',
    fontSize: '12px',
    cursor: 'pointer',
    marginRight: '8px',
  };

  const btnSecondary: React.CSSProperties = {
    ...btnStyle,
    background: 'transparent',
    border: '1px solid #444',
    color: '#888',
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px 0', color: '#66bb6a' }}>
          Configure Claude Code Hooks
        </h3>

        {/* Step indicators */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              style={{
                padding: '2px 8px',
                borderRadius: '3px',
                background: step === s ? '#1b5e20' : '#0d1117',
                color: step === s ? '#66bb6a' : '#555',
                border: `1px solid ${step === s ? '#388e3c' : '#333'}`,
              }}
            >
              Step {s}
            </span>
          ))}
        </div>

        {step === 1 && (
          <>
            <p style={{ color: '#8899aa', marginBottom: '12px' }}>
              Add the following to your <code>~/.claude/settings.json</code> to enable hook integration:
            </p>
            <pre style={{
              background: '#0d1117',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #333',
              overflow: 'auto',
              fontSize: '11px',
              lineHeight: '1.4',
            }}>
              {configSnippet}
            </pre>
            <div style={{ marginTop: '12px' }}>
              <button style={btnStyle} onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button style={btnStyle} onClick={() => setStep(2)}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p style={{ color: '#8899aa', marginBottom: '12px' }}>
              You can apply the configuration automatically, or paste it manually.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button style={btnStyle} onClick={handleAutoConfigure}>
                Auto-Configure (writes to ~/.claude/settings.json)
              </button>
              {autoConfigResult && !autoConfigResult.success && (
                <div style={{ color: '#ef5350', padding: '8px', background: '#1a0a0a', borderRadius: '4px' }}>
                  {autoConfigResult.error}
                </div>
              )}
              <button style={btnSecondary} onClick={() => setStep(3)}>
                I configured it manually, verify
              </button>
              <button style={btnSecondary} onClick={() => setStep(1)}>
                Back
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ color: '#8899aa', marginBottom: '12px' }}>
              Let's verify your configuration is correct.
            </p>
            <button style={btnStyle} onClick={handleVerify}>
              Verify Setup
            </button>
            {verifyResult === true && (
              <div style={{ color: '#66bb6a', padding: '8px', marginTop: '8px' }}>
                Hooks configured! You're all set.
              </div>
            )}
            {verifyResult === false && (
              <div style={{ color: '#ef5350', padding: '8px', marginTop: '8px' }}>
                Hooks not detected in settings. Check ~/.claude/settings.json and try again.
              </div>
            )}
            <div style={{ marginTop: '12px' }}>
              <button style={btnSecondary} onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
