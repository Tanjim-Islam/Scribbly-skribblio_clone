import { useState } from 'react';
import type { ActionResult, GameSettings, PublicRoomState } from '../../shared/types.js';
import { playSound } from '../audio/sound-engine.js';
import type { ScribblySocket } from '../socket.js';
import { PlayerList } from './PlayerList.js';
import { SoundToggle } from './SoundToggle.js';

type LobbyProps = {
  socket: ScribblySocket;
  room: PublicRoomState;
  selfId: string;
  onLeave: () => void;
  onError: (message: string) => void;
};

export function Lobby({ socket, room, selfId, onLeave, onError }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const isHost = room.hostId === selfId;

  const updateSettings = (patch: Partial<GameSettings>) => {
    const settings = { ...room.settings, ...patch } as GameSettings;
    socket.emit('room:updateSettings', settings, (result) => {
      if (!result.ok) onError(result.error);
      else playSound('tap');
    });
  };

  const start = () => {
    setStarting(true);
    socket.emit('game:start', (result: ActionResult) => {
      setStarting(false);
      if (!result.ok) onError(result.error);
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${room.code}`);
      playSound('tap');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      onError('Could not copy the link.');
    }
  };

  return (
    <main className="room-shell lobby-shell">
      <header className="room-header">
        <a className="mini-brand" href="/" onClick={(event) => { event.preventDefault(); onLeave(); }}>
          <span className="mini-scribble">S</span> Scribbly
        </a>
        <div className="room-code-block">
          <span>Room</span>
          <strong>{room.code}</strong>
          <button className="quiet-button" type="button" onClick={copyLink}>{copied ? 'Copied' : 'Copy Link'}</button>
        </div>
        <div className="room-actions">
          <SoundToggle />
          <button className="quiet-button leave-button" type="button" onClick={onLeave}>Leave</button>
        </div>
      </header>

      <div className="lobby-content">
        <div className="lobby-players-card">
          <PlayerList players={room.players} selfId={selfId} gameActive={false} />
        </div>
        <section className="settings-panel" aria-labelledby="settings-heading">
          <p className="eyebrow">Game room</p>
          <h1 id="settings-heading">Ready to scribble?</h1>
          <div className="setting-grid">
            <label>
              <span>Rounds</span>
              {isHost ? (
                <select value={room.settings.rounds} onChange={(event) => updateSettings({ rounds: Number(event.target.value) as GameSettings['rounds'] })}>
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              ) : <strong>{room.settings.rounds}</strong>}
            </label>
            <label>
              <span>Drawing time</span>
              {isHost ? (
                <select value={room.settings.drawTime} onChange={(event) => updateSettings({ drawTime: Number(event.target.value) as GameSettings['drawTime'] })}>
                  {[60, 80, 100, 120].map((value) => <option key={value} value={value}>{value} sec</option>)}
                </select>
              ) : <strong>{room.settings.drawTime} sec</strong>}
            </label>
          </div>
          {isHost ? (
            <>
              <button className="primary-button start-button" type="button" onClick={start} disabled={room.players.length < 2 || starting}>
                {starting ? 'Starting…' : 'Start Game'}
              </button>
              {room.players.length < 2 && <p className="compact-note">Waiting for one more player.</p>}
            </>
          ) : <p className="waiting-note"><span className="waiting-dot" /> Waiting for the host to start</p>}
        </section>
      </div>
    </main>
  );
}
