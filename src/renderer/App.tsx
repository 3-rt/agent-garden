import React, { useEffect, useRef, useState } from 'react';
import { GardenGame } from './game/GardenGame';
import { TaskInput } from './components/TaskInput';
import { DirectoryPicker } from './components/DirectoryPicker';

export function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GardenGame | null>(null);
  const [streamText, setStreamText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [directory, setDirectory] = useState('');
  const [savedFile, setSavedFile] = useState('');

  useEffect(() => {
    if (gameContainerRef.current && !gameRef.current) {
      gameRef.current = new GardenGame(gameContainerRef.current);
    }

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
      } else if (status.status === 'complete' || status.status === 'error') {
        setIsProcessing(false);
      }
    });

    window.electronAPI?.onFileSaved((info) => {
      setSavedFile(info.filename);
    });

    window.electronAPI?.onDirectoryChanged((dir) => {
      setDirectory(dir);
    });

    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  const handleSubmitTask = (prompt: string) => {
    setStreamText('');
    setSavedFile('');
    gameRef.current?.onTaskStart();
    window.electronAPI?.submitTask(prompt);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div
        ref={gameContainerRef}
        style={{ flex: 1, minHeight: 0 }}
      />
      <div style={{ padding: '8px 16px', background: '#16213e', borderTop: '2px solid #0f3460' }}>
        {streamText && (
          <div style={{
            maxHeight: '80px',
            overflow: 'auto',
            fontSize: '12px',
            color: '#7ec8e3',
            marginBottom: '8px',
            whiteSpace: 'pre-wrap',
          }}>
            {savedFile && (
              <div style={{ color: '#66bb6a', marginBottom: '4px' }}>
                Saved: {savedFile}
              </div>
            )}
            {streamText}
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
