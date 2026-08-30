import type { ActionResult, PublicRoomState } from '../../shared/types.js';
import type { ScribblySocket } from '../socket.js';

type FinalResultsProps = {
  socket: ScribblySocket;
  room: PublicRoomState;
  selfId: string;
  onError: (message: string) => void;
};

export function FinalResults({ socket, room, selfId, onError }: FinalResultsProps) {
  const standings = [...room.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
  const isHost = room.hostId === selfId;
  const back = () => socket.emit('game:returnToLobby', (result: ActionResult) => {
    if (!result.ok) onError(result.error);
  });
  return (
    <main className="results-shell">
      <section className="results-card">
        <div className="finish-scribble" aria-hidden="true">✦</div>
        <p className="eyebrow">Game complete</p>
        <h1>Final standings</h1>
        <ol className="standings">
          {standings.map((player, index) => (
            <li key={player.id} className={index === 0 ? 'winner' : ''}>
              <span className="place">{index + 1}</span>
              <span>{player.nickname}{player.id === selfId ? ' (you)' : ''}</span>
              <strong>{player.score}</strong>
            </li>
          ))}
        </ol>
        {isHost ? (
          <button className="primary-button" type="button" onClick={back}>Back to Lobby</button>
        ) : <p className="waiting-note"><span className="waiting-dot" /> Waiting for the host</p>}
        <span className="results-room">Room {room.code}</span>
      </section>
    </main>
  );
}
