import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GardenGame } from './game/GardenGame';
import { TaskInput } from './components/TaskInput';
import { DirectoryPicker } from './components/DirectoryPicker';
import { OutputPanel, TaskHistoryEntry } from './components/OutputPanel';
import { ApiKeyModal } from './components/ApiKeyModal';

export function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GardenGame | null>(null);
  const [streamText, setStreamText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [directory, setDirectory] = useState('');
  const [savedFile, setSavedFile] = useState('');
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');
  const [lastError, setLastError] = useState('');

  useEffect(() => {
    if (gameContainerRef.current && !gameRef.current) {
      gameRef.current = new GardenGame(gameContainerRef.current);
    }

    // Check if API key exists on load
    window.electronAPI?.getHasApiKey().then((has) => {
      if (!has && !process.env.ANTHROPIC_API_KEY) {
        setShowKeyModal(true);
      }
    });

    window.electronAPI?.onAgentStream((chunk) => {
      if (!chunk.done) {
        setStreamText((prev) => prev + chunk.text);
        gameRef.current?.onAgentThought(chunk.text);
      } else {
        gameRef.current?.onTaskComplete();
      }
    });

    window.electronAPI?.onFileEvent((event) => {
      if (event.type === 'created') {
        gameRef.current?.onFileCreated(event.path);
      } else if (event.type === 'modified') {
        gameRef.current?.onFileModified(event.path);
      }
    });

    window.electronAPI?.onTaskStatus((status) => {
      if (status.status === 'in-progress') {
        setIsProcessing(true);
        setLastError('');
      } else if (status.status === 'complete') {
        setIsProcessing(false);
      } else if (status.status === 'error') {
        setIsProcessing(false);
      }
    });

    window.electronAPI?.onFileSaved((info) => {
      setSavedFile(info.filename);
      // Add to history
      setStreamText((current) => {
        setHistory((prev) => {
          const entry: TaskHistoryEntry = {
            taskId: info.taskId,
            prompt: lastPrompt,
            code: current,
            filename: info.filename,
            timestamp: Date.now(),
          };
          const updated = [...prev, entry];
          return updated.slice(-50); // keep last 50
        });
        return current;
      });
    });

    window.electronAPI?.onDirectoryChanged((dir) => {
      setDirectory(dir);
    });

    window.electronAPI?.onAgentError((error) => {
      setLastError(error.message);
      gameRef.current?.onError();
    });

    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  const handleSubmitTask = useCallback((prompt: string) => {
    setStreamText('');
    setSavedFile('');
    setLastError('');
    setLastPrompt(prompt);
    gameRef.current?.onTaskStart();
    window.electronAPI?.submitTask(prompt);
  }, []);

  const handleRetry = useCallback(() => {
    if (lastPrompt) {
      handleSubmitTask(lastPrompt);
    }
  }, [lastPrompt, handleSubmitTask]);

  const handleSaveApiKey = useCallback((key: string) => {
    window.electronAPI?.setApiKey(key);
    setShowKeyModal(false);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {showKeyModal && (
        <ApiKeyModal
          onSave={handleSaveApiKey}
          onDemoMode={() => setShowKeyModal(false)}
        />
      )}
      <div
        ref={gameContainerRef}
        style={{ flex: 1, minHeight: 0 }}
      />
      <OutputPanel
        currentCode={streamText}
        currentFile={savedFile}
        history={history}
        isProcessing={isProcessing}
      />
      <div style={{ padding: '8px 16px', background: '#16213e', borderTop: '2px solid #0f3460' }}>
        {lastError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
            padding: '6px 10px',
            background: '#1a0a0a',
            borderRadius: '4px',
            border: '1px solid #4a1515',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#ef5350',
          }}>
            <span style={{ flex: 1 }}>{lastError}</span>
            <button
              onClick={handleRetry}
              disabled={isProcessing}
              style={{
                padding: '2px 10px',
                background: '#4a1515',
                border: 'none',
                borderRadius: '3px',
                color: '#ef9a9a',
                fontFamily: 'monospace',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}
        <TaskInput onSubmit={handleSubmitTask} disabled={isProcessing} />
        <div style={{ marginTop: '6px' }}>
          <DirectoryPicker directory={directory} />
        </div>
      </div>
    </div>
  );
}
