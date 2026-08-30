import type { PublicPlayer } from '../../shared/types.js';

type PlayerListProps = {
  players: PublicPlayer[];
  selfId: string;
  gameActive: boolean;
};

const avatarColors = ['#ef6a53', '#3974c8', '#4a9b6d', '#a85cab', '#d08a2f', '#437f88', '#b34b68', '#6c67ba'];

function colorFor(value: string): string {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return avatarColors[hash % avatarColors.length];
}

export function PlayerList({ players, selfId, gameActive }: PlayerListProps) {
  const displayed = gameActive
    ? [...players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname))
    : players;
  return (
    <section className="player-panel" aria-label="Players">
      <div className="panel-heading">
        <h2>Players</h2>
        <span>{players.length}/8</span>
      </div>
      <ol className="player-list">
        {displayed.map((player) => (
          <li className={`player-row ${player.hasGuessed ? 'player-row--guessed' : ''}`} key={player.id}>
            <span className="avatar" style={{ backgroundColor: colorFor(player.nickname) }} aria-hidden="true">
              {player.nickname.slice(0, 1).toUpperCase()}
            </span>
            <span className="player-name">
              <span>{player.nickname}{player.id === selfId ? ' (you)' : ''}</span>
              <span className="player-badges">
                {player.isHost && <span className="badge badge--host">Host</span>}
                {player.isDrawer && <span className="badge badge--drawer">Drawing</span>}
                {player.hasGuessed && <span className="badge badge--guessed">Guessed</span>}
              </span>
            </span>
            {gameActive && <strong className="player-score">{player.score}</strong>}
          </li>
        ))}
      </ol>
    </section>
  );
}
