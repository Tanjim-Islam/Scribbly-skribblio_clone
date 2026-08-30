// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PublicRoomState } from '../../src/shared/types.js';

const socketMock = vi.hoisted(() => ({
  connected: true,
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../../src/client/socket.js', () => ({
  getSocket: () => socketMock,
}));

import App from '../../src/client/App.js';
import { ChatPanel } from '../../src/client/components/ChatPanel.js';
import { FinalResults } from '../../src/client/components/FinalResults.js';
import { GameRoom } from '../../src/client/components/GameRoom.js';
import { HomeScreen } from '../../src/client/components/HomeScreen.js';
import { Lobby } from '../../src/client/components/Lobby.js';
import type { ScribblySocket } from '../../src/client/socket.js';

const fakeSocket = socketMock as unknown as ScribblySocket;

function lobbyRoom(hostId = 'alice'): PublicRoomState {
  return {
    code: 'H7K3QF',
    hostId,
    status: 'lobby',
    settings: { rounds: 3, drawTime: 80 },
    maxPlayers: 8,
    players: [
      { id: 'alice', nickname: 'Alice', score: 0, isHost: hostId === 'alice', isDrawer: false, hasGuessed: false },
      { id: 'bob', nickname: 'Bob', score: 0, isHost: hostId === 'bob', isDrawer: false, hasGuessed: false },
    ],
    game: null,
  };
}

function gameRoom(drawerId = 'alice', phase: 'choosing' | 'drawing' | 'intermission' = 'drawing'): PublicRoomState {
  return {
    ...lobbyRoom(),
    status: 'playing',
    players: [
      { id: 'alice', nickname: 'Alice', score: 50, isHost: true, isDrawer: drawerId === 'alice', hasGuessed: false },
      { id: 'bob', nickname: 'Bob', score: 420, isHost: false, isDrawer: drawerId === 'bob', hasGuessed: drawerId !== 'bob' },
    ],
    game: {
      phase,
      round: 1,
      totalRounds: 3,
      currentDrawerId: drawerId,
      currentDrawerName: drawerId === 'alice' ? 'Alice' : 'Bob',
      maskedWord: phase === 'drawing' ? '_ _ _' : null,
      deadline: Date.now() + 60_000,
      lastTurn: null,
    },
  };
}

describe('home screen', () => {
  it('validates a blank nickname before creating', async () => {
    const onCreate = vi.fn();
    render(<HomeScreen initialNickname="" onCreate={onCreate} onJoin={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Create Room' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a nickname.');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('submits create and join forms with Enter', async () => {
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    render(<HomeScreen initialNickname=" Alice " onCreate={onCreate} onJoin={onJoin} />);
    const nickname = screen.getByLabelText('Nickname');
    await userEvent.type(nickname, '{Enter}');
    expect(onCreate).toHaveBeenCalledWith('Alice');
    await userEvent.type(screen.getByLabelText('Room code'), 'h7k3qf{Enter}');
    expect(onJoin).toHaveBeenCalledWith('Alice', 'H7K3QF');
  });

  it('prefills the remembered nickname from localStorage', () => {
    localStorage.setItem('scribbly:nickname', 'Alice');
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(screen.getByLabelText('Nickname')).toHaveValue('Alice');
    expect(Object.keys(localStorage)).toEqual(['scribbly:nickname']);
  });
});

describe('lobby controls', () => {
  it('shows editable settings and start to the host', () => {
    render(<Lobby socket={fakeSocket} room={lobbyRoom()} selfId="alice" onLeave={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByLabelText('Rounds')).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeEnabled();
  });

  it('shows read-only settings to a non-host', () => {
    render(<Lobby socket={fakeSocket} room={lobbyRoom()} selfId="bob" onLeave={vi.fn()} onError={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(screen.getByText('Waiting for the host to start')).toBeInTheDocument();
  });
});

describe('game UI privacy and roles', () => {
  it('shows only the mask and no drawing toolbar to a guesser', () => {
    render(
      <GameRoom
        socket={fakeSocket}
        room={gameRoom('alice')}
        selfId="bob"
        choices={[]}
        drawerWord="cat"
        messages={[]}
        onLeave={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('_ _ _')).toBeInTheDocument();
    expect(screen.queryByText('cat')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Drawing tools')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('You guessed it!')).toBeDisabled();
  });

  it('shows the private word and drawing tools only to the drawer', () => {
    render(
      <GameRoom
        socket={fakeSocket}
        room={gameRoom('alice')}
        selfId="alice"
        choices={[]}
        drawerWord="cat"
        messages={[]}
        onLeave={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText('cat')).toBeInTheDocument();
    expect(screen.getByLabelText('Drawing tools')).toBeInTheDocument();
    expect(screen.getByLabelText('Eraser')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('You are drawing')).toBeDisabled();
  });
});

describe('chat keyboard behavior', () => {
  it('sends a guess with Enter', async () => {
    const emit = vi.fn((event, payload, ack) => {
      if (event === 'chat:send') ack({ ok: true });
      return fakeSocket;
    });
    const chatSocket = { ...socketMock, emit } as unknown as ScribblySocket;
    render(<ChatPanel socket={chatSocket} messages={[]} canChat guessed={false} isDrawer={false} onError={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Guess or message'), 'cat{Enter}');
    expect(emit).toHaveBeenCalledWith('chat:send', { message: 'cat' }, expect.any(Function));
    expect(screen.getByLabelText('Guess or message')).toHaveValue('');
  });
});

describe('final results', () => {
  it('sorts standings by score and lets only the host return', () => {
    const room = lobbyRoom();
    room.status = 'finished';
    room.players[0].score = 300;
    room.players[1].score = 600;
    render(<FinalResults socket={fakeSocket} room={room} selfId="alice" onError={vi.fn()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Bob');
    expect(rows[1]).toHaveTextContent('Alice');
    expect(screen.getByRole('button', { name: 'Back to Lobby' })).toBeInTheDocument();
  });
});
