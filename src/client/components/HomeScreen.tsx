import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MAX_NICKNAME_LENGTH } from '../../shared/types.js';
import { playSound } from '../audio/sound-engine.js';
import { SoundToggle } from './SoundToggle.js';

type HomeScreenProps = {
  initialNickname: string;
  initialRoomCode?: string;
  directJoin?: boolean;
  busy?: boolean;
  error?: string | null;
  onCreate: (nickname: string) => void;
  onJoin: (nickname: string, roomCode: string) => void;
};

export function HomeScreen({
  initialNickname,
  initialRoomCode = '',
  directJoin = false,
  busy = false,
  error,
  onCreate,
  onJoin,
}: HomeScreenProps) {
  const [nickname, setNickname] = useState(initialNickname);
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [localError, setLocalError] = useState<string | null>(null);

  const showLocalError = (message: string) => {
    playSound('failure');
    setLocalError(message);
  };

  const validNickname = (): string | null => {
    const value = nickname.trim();
    if (!value) {
      showLocalError('Enter a nickname.');
      return null;
    }
    if (value.length > MAX_NICKNAME_LENGTH) {
      showLocalError(`Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.`);
      return null;
    }
    setLocalError(null);
    return value;
  };

  const createRoom = () => {
    const value = validNickname();
    if (value) onCreate(value);
  };

  const joinRoom = () => {
    const value = validNickname();
    if (!value) return;
    if (!roomCode.trim()) {
      showLocalError('Enter a room code.');
      return;
    }
    onJoin(value, roomCode.trim().toUpperCase());
  };

  const submitCreate = (event: FormEvent) => {
    event.preventDefault();
    createRoom();
  };

  const submitJoin = (event: FormEvent) => {
    event.preventDefault();
    joinRoom();
  };

  const handleNicknameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (directJoin) joinRoom();
    else createRoom();
  };

  return (
    <main className="home-shell">
      <section className="home-panel" aria-labelledby="scribbly-title">
        <SoundToggle className="home-sound-toggle" />
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64">
            <path d="M13 43c10-26 22 13 39-25M15 22c9 10 17-12 35 19" />
          </svg>
        </div>
        <h1 id="scribbly-title">Scribbly</h1>
        <p className="home-tagline">Draw. Guess. Have fun.</p>

        {directJoin && (
          <div className="direct-room">
            Joining <strong>{initialRoomCode}</strong>
          </div>
        )}

        <label className="field-label" htmlFor="nickname">
          Nickname
        </label>
        <input
          id="nickname"
          className="text-input"
          value={nickname}
          maxLength={MAX_NICKNAME_LENGTH}
          autoComplete="nickname"
          autoFocus
          placeholder="Your nickname"
          onChange={(event) => setNickname(event.target.value)}
          onKeyDown={handleNicknameKeyDown}
        />

        {directJoin ? (
          <form onSubmit={submitJoin}>
            <button className="primary-button home-primary" type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={submitCreate}>
              <button className="primary-button home-primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create Room'}
              </button>
            </form>
            <div className="or-divider"><span>or join</span></div>
            <form className="join-row" onSubmit={submitJoin}>
              <label className="sr-only" htmlFor="room-code">Room code</label>
              <input
                id="room-code"
                className="text-input room-code-input"
                value={roomCode}
                maxLength={6}
                placeholder="ROOM CODE"
                autoCapitalize="characters"
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              />
              <button className="secondary-button" type="submit" disabled={busy}>Join</button>
            </form>
          </>
        )}

        {(localError || error) && <p className="form-error" role="alert">{localError || error}</p>}
      </section>
    </main>
  );
}
