import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, RoomStateEnvelope } from '../shared/types.js';
import { playSound, unlockSound } from './audio/sound-engine.js';
import { FinalResults } from './components/FinalResults.js';
import { GameRoom } from './components/GameRoom.js';
import { HomeScreen } from './components/HomeScreen.js';
import { Lobby } from './components/Lobby.js';
import { getSocket } from './socket.js';

const NICKNAME_KEY = 'scribbly:nickname';

function roomCodeFromPath(): string | null {
  const match = window.location.pathname.match(/^\/room\/([^/]+)\/?$/u);
  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}

export default function App() {
  const [socket] = useState(getSocket);
  const [roomState, setRoomState] = useState<RoomStateEnvelope | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [drawerWord, setDrawerWord] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pathCode, setPathCode] = useState(roomCodeFromPath);
  const errorTimerRef = useRef<number | null>(null);
  const priorStatusRef = useRef<string | null>(null);
  const roomStateRef = useRef<RoomStateEnvelope | null>(null);

  const showError = useCallback((message: string) => {
    playSound('failure');
    setError(message);
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setError(null), 4_000);
  }, []);

  useEffect(() => {
    const unlock = () => { void unlockSound(); };
    window.addEventListener('pointerdown', unlock, { capture: true, once: true });
    window.addEventListener('keydown', unlock, { capture: true, once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    const onState = (next: RoomStateEnvelope) => {
      const previous = roomStateRef.current;
      roomStateRef.current = next;
      const previousStatus = priorStatusRef.current;
      priorStatusRef.current = next.room.status;
      setRoomState(next);

      if (!previous || previous.room.code !== next.room.code) {
        playSound('room-ready');
      } else {
        const previousRoom = previous.room;
        if (next.room.players.length > previousRoom.players.length) playSound('player-joined');
        if (next.room.players.length < previousRoom.players.length) playSound('player-left');

        if (previousRoom.status === 'lobby' && next.room.status === 'playing') {
          playSound('game-start');
        } else if (previousRoom.status === 'finished' && next.room.status === 'lobby') {
          playSound('room-ready');
        } else if (previousRoom.status === 'playing' && next.room.status === 'playing') {
          const previousGame = previousRoom.game;
          const nextGame = next.room.game;
          const newTurn = nextGame?.phase === 'choosing' && (
            previousGame?.phase === 'intermission' ||
            previousGame?.currentDrawerId !== nextGame.currentDrawerId ||
            previousGame?.round !== nextGame.round
          );
          if (newTurn) playSound(nextGame.currentDrawerId === next.selfId ? 'your-turn' : 'turn-start');
          if (previousGame?.phase === 'choosing' && nextGame?.phase === 'drawing') playSound('word-selected');
        }
      }

      if (next.room.game?.phase === 'choosing') {
        setChoices([]);
        setDrawerWord(null);
      }
      if (next.room.status === 'lobby' && previousStatus && previousStatus !== 'lobby') {
        setMessages([]);
        setChoices([]);
        setDrawerWord(null);
      }
    };
    const onChoices = (payload: { choices: string[] }) => setChoices(payload.choices);
    const onSelected = (payload: { word: string }) => {
      setDrawerWord(payload.word);
      setChoices([]);
    };
    const onMessage = (message: ChatMessage) => {
      setMessages((current) => [...current.slice(-99), message]);
      if (message.type === 'chat' && message.playerId === roomStateRef.current?.selfId) playSound('wrong-guess');
    };
    const onCorrectGuess = ({ playerId }: { playerId: string; nickname: string }) => {
      playSound(playerId === roomStateRef.current?.selfId ? 'correct-guess' : 'someone-guessed');
    };
    const onTurnEnded = () => playSound('turn-ended');
    const onGameEnded = () => playSound('game-ended');
    const onActionError = ({ message }: { message: string }) => showError(message);
    const onPopState = () => setPathCode(roomCodeFromPath());
    socket.on('room:state', onState);
    socket.on('word:choices', onChoices);
    socket.on('word:selected', onSelected);
    socket.on('chat:message', onMessage);
    socket.on('guess:correct', onCorrectGuess);
    socket.on('turn:ended', onTurnEnded);
    socket.on('game:ended', onGameEnded);
    socket.on('action:error', onActionError);
    window.addEventListener('popstate', onPopState);
    return () => {
      socket.off('room:state', onState);
      socket.off('word:choices', onChoices);
      socket.off('word:selected', onSelected);
      socket.off('chat:message', onMessage);
      socket.off('guess:correct', onCorrectGuess);
      socket.off('turn:ended', onTurnEnded);
      socket.off('game:ended', onGameEnded);
      socket.off('action:error', onActionError);
      window.removeEventListener('popstate', onPopState);
      if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current);
    };
  }, [showError, socket]);

  const rememberAndNavigate = (nickname: string, roomCode: string) => {
    localStorage.setItem(NICKNAME_KEY, nickname);
    const path = `/room/${roomCode}`;
    window.history.pushState({}, '', path);
    setPathCode(roomCode);
  };

  const createRoom = (nickname: string) => {
    setBusy(true);
    setError(null);
    socket.emit('room:create', { nickname }, (result) => {
      setBusy(false);
      if (result.ok) rememberAndNavigate(nickname, result.data.roomCode);
      else showError(result.error);
    });
  };

  const joinRoom = (nickname: string, roomCode: string) => {
    setBusy(true);
    setError(null);
    socket.emit('room:join', { nickname, roomCode }, (result) => {
      setBusy(false);
      if (result.ok) rememberAndNavigate(nickname, result.data.roomCode);
      else showError(result.error);
    });
  };

  const leaveRoom = () => {
    playSound('leave');
    socket.disconnect();
    setRoomState(null);
    setChoices([]);
    setDrawerWord(null);
    setMessages([]);
    priorStatusRef.current = null;
    roomStateRef.current = null;
    window.history.pushState({}, '', '/');
    setPathCode(null);
    window.setTimeout(() => socket.connect(), 0);
  };

  const rememberedNickname = (() => {
    try {
      return localStorage.getItem(NICKNAME_KEY) ?? '';
    } catch {
      return '';
    }
  })();

  return (
    <>
      {roomState ? (
        roomState.room.status === 'lobby' ? (
          <Lobby socket={socket} room={roomState.room} selfId={roomState.selfId} onLeave={leaveRoom} onError={showError} />
        ) : roomState.room.status === 'finished' ? (
          <FinalResults socket={socket} room={roomState.room} selfId={roomState.selfId} onError={showError} />
        ) : (
          <GameRoom
            socket={socket}
            room={roomState.room}
            selfId={roomState.selfId}
            choices={choices}
            drawerWord={drawerWord}
            messages={messages}
            onLeave={leaveRoom}
            onError={showError}
          />
        )
      ) : (
        <HomeScreen
          key={pathCode ?? 'home'}
          initialNickname={rememberedNickname}
          initialRoomCode={pathCode ?? ''}
          directJoin={Boolean(pathCode)}
          busy={busy}
          error={error}
          onCreate={createRoom}
          onJoin={joinRoom}
        />
      )}
      {error && roomState && <div className="toast" role="alert">{error}</div>}
    </>
  );
}
