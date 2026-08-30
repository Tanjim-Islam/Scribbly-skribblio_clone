import { afterEach, describe, expect, it } from 'vitest';
import type { RoomStateEnvelope } from '../../src/shared/types.js';
import type { ScribblyServer } from '../../src/server/create-server.js';
import {
  closeClients,
  connectClient,
  emitAck,
  startTestServer,
  type TestClient,
  waitForEvent,
  waitUntil,
} from '../helpers/socket-test-utils.js';

let server: ScribblyServer | null = null;
let clients: TestClient[] = [];

afterEach(async () => {
  await closeClients(clients);
  clients = [];
  if (server) await server.stop();
  server = null;
});

describe('three-player multiplayer game', () => {
  it('plays two complete rounds, reaches results, and reuses the room', async () => {
    const started = await startTestServer({
      words: ['apple', 'bridge', 'camera', 'dragon', 'penguin', 'rocket'],
      random: () => 0.31,
      timings: { wordChoiceMs: 500, intermissionMs: 18, drawDurationMs: 700 },
    });
    server = started.server;
    const alice = await connectClient(started.url);
    const bob = await connectClient(started.url);
    const charlie = await connectClient(started.url);
    clients = [alice, bob, charlie];

    const latest: { current: RoomStateEnvelope | null } = { current: null };
    alice.on('room:state', (state) => { latest.current = state; });
    const privateChoices = new Map<string, string[]>();
    const privateWords = new Map<string, string>();
    const clientById = new Map<string, TestClient>([
      [alice.id!, alice],
      [bob.id!, bob],
      [charlie.id!, charlie],
    ]);
    for (const client of clients) {
      client.on('word:choices', ({ choices }) => privateChoices.set(client.id!, choices));
      client.on('word:selected', ({ word }) => privateWords.set(client.id!, word));
    }

    const create = await emitAck<{ roomCode: string }>(alice, 'room:create', { nickname: 'Alice' });
    if (!create.ok) throw new Error(create.error);
    const code = create.data.roomCode;
    expect(await emitAck(bob, 'room:join', { nickname: 'Bob', roomCode: code })).toMatchObject({ ok: true });
    expect(await emitAck(charlie, 'room:join', { nickname: 'Charlie', roomCode: code })).toMatchObject({ ok: true });
    await waitUntil(() => latest.current?.room.players.length === 3);
    expect(await emitAck(alice, 'room:updateSettings', { rounds: 2, drawTime: 60 })).toEqual({ ok: true });

    let gameEndEvents = 0;
    alice.on('game:ended', () => { gameEndEvents += 1; });
    expect(await emitAck(alice, 'game:start')).toEqual({ ok: true });

    const observedTurns: { round: number; drawer: string }[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
      await waitUntil(() => latest.current?.room.game?.phase === 'choosing');
      const choosingState = latest.current!;
      const game = choosingState.room.game!;
      const drawerId = game.currentDrawerId!;
      const drawer = clientById.get(drawerId)!;
      observedTurns.push({ round: game.round, drawer: game.currentDrawerName! });
      await waitUntil(() => privateChoices.has(drawerId));
      const choices = privateChoices.get(drawerId)!;
      privateChoices.delete(drawerId);
      const choice = choices[turn % choices.length];

      const drawingPromise = waitForEvent(alice, 'room:state', (state) => state.room.game?.phase === 'drawing');
      expect(await emitAck(drawer, 'word:choose', { choice })).toEqual({ ok: true });
      await drawingPromise;
      await waitUntil(() => privateWords.has(drawerId));
      const secret = privateWords.get(drawerId)!;
      privateWords.delete(drawerId);
      expect(secret).toBe(choice);

      const guessers = clients.filter((client) => client.id !== drawerId);
      if (turn === 0) {
        const wrongPromise = waitForEvent(alice, 'chat:message', (message) => message.type === 'chat');
        expect(await emitAck(guessers[0], 'chat:send', { message: 'not the word' })).toEqual({ ok: true });
        expect((await wrongPromise)[0].text).toBe('not the word');
      }
      expect(await emitAck(guessers[0], 'chat:send', { message: `  ${secret.toUpperCase()}  ` })).toEqual({ ok: true });
      const intermissionPromise = waitForEvent(alice, 'room:state', (state) => state.room.game?.phase === 'intermission');
      expect(await emitAck(guessers[1], 'chat:send', { message: secret })).toEqual({ ok: true });
      const [intermission] = await intermissionPromise;
      expect(intermission.room.game?.lastTurn?.word).toBe(secret);
      expect(intermission.room.game?.lastTurn?.reason).toBe('all-guessed');
    }

    await waitUntil(() => latest.current?.room.status === 'finished', 2_000);
    expect(gameEndEvents).toBe(1);
    expect(observedTurns).toEqual([
      { round: 1, drawer: 'Alice' },
      { round: 1, drawer: 'Bob' },
      { round: 1, drawer: 'Charlie' },
      { round: 2, drawer: 'Alice' },
      { round: 2, drawer: 'Bob' },
      { round: 2, drawer: 'Charlie' },
    ]);
    const finalRoom = latest.current!.room;
    expect(finalRoom.players.every((player) => player.score > 0)).toBe(true);
    const sortedScores = [...finalRoom.players].sort((a, b) => b.score - a.score).map((player) => player.score);
    expect(sortedScores).toEqual([...sortedScores].sort((a, b) => b - a));

    expect(await emitAck(alice, 'game:returnToLobby')).toEqual({ ok: true });
    await waitUntil(() => latest.current?.room.status === 'lobby');
    expect(latest.current?.room.players).toHaveLength(3);
    expect(latest.current?.room.players.every((player) => player.score === 0)).toBe(true);
    expect(latest.current?.room.settings).toEqual({ rounds: 2, drawTime: 60 });
    expect(latest.current?.room.game).toBeNull();

    const secondGameChoices = waitForEvent(alice, 'word:choices');
    expect(await emitAck(alice, 'game:start')).toEqual({ ok: true });
    expect((await secondGameChoices)[0].choices).toHaveLength(3);
    await waitUntil(() => latest.current?.room.status === 'playing');
  });
});
