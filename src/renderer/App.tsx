import React, { useEffect, useRef, useState } from 'react';
import { GardenGame } from './game/GardenGame';
import { TaskInput } from './components/TaskInput';

export function App() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<GardenGame | null>(null);
  const [streamText, setStreamText] = useState('');

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

    return () => {
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, []);

  const handleSubmitTask = (prompt: string) => {
    setStreamText('');
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
            {streamText}
          </div>
        )}
        <TaskInput onSubmit={handleSubmitTask} />
      </div>
    </div>
  );
}
