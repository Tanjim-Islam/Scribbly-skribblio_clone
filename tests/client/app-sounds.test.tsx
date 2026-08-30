// @vitest-environment jsdom
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, PublicRoomState, RoomStateEnvelope, TurnSummary } from '../../src/shared/types.js';

const soundMocks = vi.hoisted(() => ({
  play: vi.fn(),
  unlock: vi.fn().mockResolvedValue(true),
}));

const socketHarness = vi.hoisted(() => {
  const handlers = new Map<string, (...args: never[]) => void>();
  return {
    handlers,
    socket: {
      connected: true,
      on: vi.fn((event: string, handler: (...args: never[]) => void) => { handlers.set(event, handler); }),
      off: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

vi.mock('../../src/client/audio/sound-engine.js', () => ({
  isSoundEnabled: () => true,
  playSound: soundMocks.play,
  setSoundEnabled: vi.fn(),
  unlockSound: soundMocks.unlock,
}));

vi.mock('../../src/client/socket.js', () => ({
  getSocket: () => socketHarness.socket,
}));

import App from '../../src/client/App.js';

const players = [
  { id: 'alice', nickname: 'Alice', score: 0, isHost: true, isDrawer: false, hasGuessed: false },
  { id: 'bob', nickname: 'Bob', score: 0, isHost: false, isDrawer: false, hasGuessed: false },
];

function room(
  status: PublicRoomState['status'],
  phase: 'choosing' | 'drawing' | 'intermission' | null,
  drawerId = 'alice',
): PublicRoomState {
  return {
    code: 'H7K3QF',
    hostId: 'alice',
    status,
    settings: { rounds: 1, drawTime: 60 },
    maxPlayers: 8,
    players: players.map((player) => ({ ...player, isDrawer: status === 'playing' && player.id === drawerId })),
    game: phase ? {
      phase,
      round: 1,
      totalRounds: 1,
      currentDrawerId: drawerId,
      currentDrawerName: drawerId === 'alice' ? 'Alice' : 'Bob',
      maskedWord: phase === 'drawing' ? '_ _ _' : null,
      deadline: Date.now() + 60_000,
      lastTurn: null,
    } : null,
  };
}

function send(event: string, payload: unknown) {
  const handler = socketHarness.handlers.get(event);
  if (!handler) throw new Error(`Missing ${event} handler`);
  act(() => handler(payload as never));
}

describe('application sound events', () => {
  beforeEach(() => {
    socketHarness.handlers.clear();
    soundMocks.play.mockClear();
    soundMocks.unlock.mockClear();
  });

  it('maps room and game events to distinct sound cues', () => {
    render(<App />);

    const onePlayerLobby = room('lobby', null);
    onePlayerLobby.players = onePlayerLobby.players.slice(0, 1);
    send('room:state', { selfId: 'alice', room: onePlayerLobby } satisfies RoomStateEnvelope);
    send('room:state', { selfId: 'alice', room: room('lobby', null) } satisfies RoomStateEnvelope);
    send('room:state', { selfId: 'alice', room: room('playing', 'choosing') } satisfies RoomStateEnvelope);
    send('room:state', { selfId: 'alice', room: room('playing', 'drawing') } satisfies RoomStateEnvelope);

    const wrongGuess: ChatMessage = {
      id: 'm1',
      type: 'chat',
      playerId: 'alice',
      nickname: 'Alice',
      text: 'dog',
      at: Date.now(),
    };
    send('chat:message', wrongGuess);
    send('guess:correct', { playerId: 'alice', nickname: 'Alice' });

    const turnSummary: TurnSummary = {
      drawerName: 'Alice',
      word: 'cat',
      reason: 'all-guessed',
      awards: [],
    };
    send('turn:ended', turnSummary);
    send('game:ended', { standings: players });

    expect(soundMocks.play.mock.calls.map(([cue]) => cue)).toEqual([
      'room-ready',
      'player-joined',
      'game-start',
      'word-selected',
      'wrong-guess',
      'correct-guess',
      'turn-ended',
      'game-ended',
    ]);
  });
});
