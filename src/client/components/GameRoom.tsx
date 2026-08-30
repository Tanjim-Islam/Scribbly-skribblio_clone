import { useEffect, useMemo, useState } from 'react';
import type {
  ActionResult,
  BrushWidth,
  ChatMessage,
  DrawingTool,
  PublicRoomState,
  TurnSummary,
} from '../../shared/types.js';
import type { ScribblySocket } from '../socket.js';
import { ChatPanel } from './ChatPanel.js';
import { DrawingCanvas } from './DrawingCanvas.js';
import { DrawingToolbar } from './DrawingToolbar.js';
import { PlayerList } from './PlayerList.js';

type GameRoomProps = {
  socket: ScribblySocket;
  room: PublicRoomState;
  selfId: string;
  choices: string[];
  drawerWord: string | null;
  messages: ChatMessage[];
  onLeave: () => void;
  onError: (message: string) => void;
};

function useCountdown(deadline: number | null): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, (deadline ?? Date.now()) - Date.now()));
  useEffect(() => {
    const update = () => setRemaining(Math.max(0, (deadline ?? Date.now()) - Date.now()));
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [deadline]);
  return Math.ceil(remaining / 1_000);
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function GameRoom({ socket, room, selfId, choices, drawerWord, messages, onLeave, onError }: GameRoomProps) {
  const game = room.game;
  const [color, setColor] = useState('#20211f');
  const [width, setWidth] = useState<BrushWidth>(0.008);
  const [tool, setTool] = useState<DrawingTool>('brush');
  const seconds = useCountdown(game?.deadline ?? null);
  const me = room.players.find((player) => player.id === selfId);
  const isDrawer = game?.currentDrawerId === selfId;
  const drawing = game?.phase === 'drawing';
  const canChat = Boolean(drawing && !isDrawer && !me?.hasGuessed);
  const resetKey = `${game?.round ?? 0}:${game?.currentDrawerId ?? 'none'}`;

  const statusText = useMemo(() => {
    if (!game) return '';
    if (game.phase === 'choosing') return isDrawer ? 'Choose a word' : `${game.currentDrawerName} is choosing a word…`;
    if (game.phase === 'drawing') return isDrawer ? 'Your turn to draw' : `${game.currentDrawerName} is drawing`;
    if (game.phase === 'intermission') return 'Turn complete';
    return 'Game complete';
  }, [game, isDrawer]);

  const choose = (choice: string) => {
    socket.emit('word:choose', { choice }, (result: ActionResult) => {
      if (!result.ok) onError(result.error);
    });
  };

  if (!game) return null;

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="round-label"><span>Round</span><strong>{game.round}/{game.totalRounds}</strong></div>
        <div className="word-display" aria-live="polite">
          <span>{statusText}</span>
          <strong className={drawerWord ? 'drawer-secret' : ''}>
            {drawing ? (isDrawer ? drawerWord || '…' : game.maskedWord || '…') : '•••'}
          </strong>
        </div>
        <div className={`timer ${seconds <= 10 && drawing ? 'timer--urgent' : ''}`} aria-label={`${seconds} seconds remaining`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 13V9m-3-6h6" /></svg>
          <strong>{formatTime(seconds)}</strong>
        </div>
        <button className="quiet-button game-leave" type="button" onClick={onLeave}>Leave</button>
      </header>

      <div className="game-grid">
        <PlayerList players={room.players} selfId={selfId} gameActive />

        <section className="canvas-column" aria-label="Game canvas">
          <div className="canvas-frame">
            <DrawingCanvas socket={socket} enabled={Boolean(isDrawer && drawing)} tool={tool} color={color} width={width} resetKey={resetKey} />
            {game.phase === 'choosing' && (
              <div className="canvas-overlay">
                {isDrawer ? (
                  <div className="word-choice-box">
                    <p>Pick a word</p>
                    <div>{choices.map((choice) => <button type="button" key={choice} onClick={() => choose(choice)}>{choice}</button>)}</div>
                  </div>
                ) : (
                  <div className="waiting-card"><span className="pencil-wiggle">✎</span><strong>{game.currentDrawerName} is choosing…</strong></div>
                )}
              </div>
            )}
            {game.phase === 'intermission' && game.lastTurn && <TurnOverlay summary={game.lastTurn} />}
          </div>

          {isDrawer && drawing ? (
            <DrawingToolbar
              color={color}
              width={width}
              tool={tool}
              onColor={setColor}
              onWidth={setWidth}
              onTool={setTool}
              onUndo={() => socket.emit('canvas:undo')}
              onClear={() => socket.emit('canvas:clear')}
            />
          ) : (
            <div className="watching-strip">
              {me?.hasGuessed ? <><span>✓</span> You guessed it!</> : game.phase === 'drawing' ? 'Watch closely and guess in chat' : 'Fresh canvas next turn'}
            </div>
          )}
        </section>

        <ChatPanel
          key={resetKey}
          socket={socket}
          messages={messages}
          canChat={canChat}
          guessed={Boolean(me?.hasGuessed)}
          isDrawer={Boolean(isDrawer)}
          onError={onError}
        />
      </div>
    </main>
  );
}

function TurnOverlay({ summary }: { summary: TurnSummary }) {
  return (
    <div className="canvas-overlay canvas-overlay--result" aria-live="assertive">
      <div className="turn-card">
        {summary.reason === 'drawer-left' && !summary.word ? (
          <h2>{summary.drawerName} left, turn skipped</h2>
        ) : (
          <>
            <p>The word was</p>
            <h2>{summary.word}</h2>
          </>
        )}
        {summary.awards.length > 0 ? (
          <ul>{summary.awards.map((award) => <li key={award.playerId}><span>{award.nickname}</span><strong>+{award.points}</strong></li>)}</ul>
        ) : <span className="no-guesses">No correct guesses this time.</span>}
      </div>
    </div>
  );
}
