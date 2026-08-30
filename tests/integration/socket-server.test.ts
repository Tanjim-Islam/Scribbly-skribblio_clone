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

let activeServer: ScribblyServer | null = null;
let clients: TestClient[] = [];

afterEach(async () => {
  await closeClients(clients);
  clients = [];
  if (activeServer) await activeServer.stop();
  activeServer = null;
});

async function setup(options = {}) {
  const started = await startTestServer(options);
  activeServer = started.server;
  return started;
}

async function addClient(url: string): Promise<TestClient> {
  const client = await connectClient(url);
  clients.push(client);
  return client;
}

function trackState(client: TestClient): { current: RoomStateEnvelope | null } {
  const tracked: { current: RoomStateEnvelope | null } = { current: null };
  client.on('room:state', (state) => { tracked.current = state; });
  return tracked;
}

async function createRoom(client: TestClient, nickname = 'Alice'): Promise<string> {
  const result = await emitAck<{ roomCode: string }>(client, 'room:create', { nickname });
  if (!result.ok) throw new Error(result.error);
  return result.data.roomCode;
}

async function joinRoom(client: TestClient, nickname: string, roomCode: string): Promise<void> {
  const result = await emitAck<{ roomCode: string }>(client, 'room:join', { nickname, roomCode });
  if (!result.ok) throw new Error(result.error);
}

describe('Socket.IO room lifecycle', () => {
  it('creates a room with Alice as host and broadcasts Bob joining', async () => {
    const { url } = await setup();
    const alice = await addClient(url);
    const bob = await addClient(url);
    const aliceState = trackState(alice);
    const bobState = trackState(bob);
    const code = await createRoom(alice);
    await waitUntil(() => aliceState.current?.room.code === code);
    expect(aliceState.current?.room.players[0]).toMatchObject({ nickname: 'Alice', isHost: true, score: 0 });

    await joinRoom(bob, 'Bob', code);
    await waitUntil(() => aliceState.current?.room.players.length === 2 && bobState.current?.room.players.length === 2);
    expect(aliceState.current?.room.players.map((player) => player.nickname)).toEqual(['Alice', 'Bob']);
    expect(bobState.current?.selfId).toBe(bob.id);
  });

  it('rejects invalid rooms and case-insensitive duplicate nicknames', async () => {
    const { url } = await setup();
    const alice = await addClient(url);
    const other = await addClient(url);
    const invalid = await emitAck<{ roomCode: string }>(other, 'room:join', { nickname: 'Bob', roomCode: 'ABCDEF' });
    expect(invalid).toEqual({ ok: false, error: 'Room not found.' });

    const code = await createRoom(alice);
    const duplicate = await emitAck<{ roomCode: string }>(other, 'room:join', { nickname: '  aLiCe ', roomCode: code });
    expect(duplicate).toEqual({ ok: false, error: 'That nickname is already in this room.' });
  });

  it('caps rooms at eight players and rejects the ninth', async () => {
    const { url } = await setup();
    const alice = await addClient(url);
    const code = await createRoom(alice);
    for (let index = 2; index <= 8; index += 1) {
      const player = await addClient(url);
      await joinRoom(player, `Player ${index}`, code);
    }
    const ninth = await addClient(url);
    const result = await emitAck<{ roomCode: string }>(ninth, 'room:join', { nickname: 'Ninth', roomCode: code });
    expect(result).toEqual({ ok: false, error: 'Room is full.' });
  });

  it('enforces host-only settings and minimum-player start', async () => {
    const { url } = await setup();
    const alice = await addClient(url);
    const bob = await addClient(url);
    const aliceState = trackState(alice);
    const code = await createRoom(alice);
    expect(await emitAck(alice, 'game:start')).toEqual({ ok: false, error: 'At least two players are needed.' });
    await joinRoom(bob, 'Bob', code);

    expect(await emitAck(bob, 'room:updateSettings', { rounds: 1, drawTime: 60 })).toEqual({
      ok: false,
      error: 'Only the host can change settings.',
    });
    expect(await emitAck(alice, 'room:updateSettings', { rounds: 2, drawTime: 100 })).toEqual({ ok: true });
    await waitUntil(() => aliceState.current?.room.settings.rounds === 2);
    expect(aliceState.current?.room.settings).toEqual({ rounds: 2, drawTime: 100 });
    expect(await emitAck(bob, 'game:start')).toEqual({ ok: false, error: 'Only the host can start the game.' });
  });

  it('transfers host to the longest-connected player and deletes an empty room', async () => {
    const { server, url } = await setup();
    const alice = await addClient(url);
    const bob = await addClient(url);
    const charlie = await addClient(url);
    const bobState = trackState(bob);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    await joinRoom(charlie, 'Charlie', code);
    alice.disconnect();
    await waitUntil(() => bobState.current?.room.hostId === bob.id);
    expect(bobState.current?.room.players.find((player) => player.id === bob.id)?.isHost).toBe(true);
    bob.disconnect();
    charlie.disconnect();
    await waitUntil(() => server.engine.rooms.size === 0);
    expect(server.engine.rooms.size).toBe(0);
  });

  it('recovers a brief transport interruption without dropping room membership', async () => {
    const { server, url } = await setup({ timings: { disconnectGraceMs: 500 } });
    const alice = await connectClient(url, {
      reconnection: true,
      reconnectionDelay: 10,
      reconnectionDelayMax: 20,
      reconnectionAttempts: 5,
    });
    clients.push(alice);
    const state = trackState(alice);
    const code = await createRoom(alice);
    await waitUntil(() => state.current?.room.code === code);
    const originalId = alice.id;
    const reconnected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Client did not reconnect.')), 1_500);
      alice.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    alice.io.engine.close();
    await reconnected;
    await waitUntil(() => state.current?.room.players.length === 1);
    expect(alice.recovered).toBe(true);
    expect(alice.id).toBe(originalId);
    expect(server.engine.rooms.get(code)?.players.size).toBe(1);
  });
});

describe('authoritative game protocol', () => {
  it('keeps the word private, authorizes drawing, scores guesses, and ends early', async () => {
    const { url } = await setup({
      words: ['cat', 'ice cream', 'rocket', 'bridge'],
      random: () => 0,
      timings: { wordChoiceMs: 500, intermissionMs: 100, drawDurationMs: 1_000 },
    });
    const alice = await addClient(url);
    const bob = await addClient(url);
    const charlie = await addClient(url);
    const aliceState = trackState(alice);
    const bobState = trackState(bob);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    await joinRoom(charlie, 'Charlie', code);

    let bobChoiceEvents = 0;
    bob.on('word:choices', () => { bobChoiceEvents += 1; });
    const choicesPromise = waitForEvent(alice, 'word:choices');
    expect(await emitAck(alice, 'game:start')).toEqual({ ok: true });
    const [{ choices }] = await choicesPromise;
    expect(choices).toHaveLength(3);
    await waitUntil(() => aliceState.current?.room.game?.phase === 'choosing');
    expect(bobChoiceEvents).toBe(0);

    const unauthorizedChoice = await emitAck(bob, 'word:choose', { choice: choices[0] });
    expect(unauthorizedChoice).toEqual({ ok: false, error: 'Only the current drawer can choose a word.' });

    const bobPayloads: unknown[] = [];
    bob.onAny((event, ...args) => bobPayloads.push([event, ...args]));
    const selectedPromise = waitForEvent(alice, 'word:selected');
    const drawingStatePromise = waitForEvent(bob, 'room:state', (state) => state.room.game?.phase === 'drawing');
    expect(await emitAck(alice, 'word:choose', { choice: choices[0] })).toEqual({ ok: true });
    const [{ word }] = await selectedPromise;
    const [drawingState] = await drawingStatePromise;
    expect(drawingState.room.game?.maskedWord).not.toContain(word);
    expect(JSON.stringify(bobPayloads).toLowerCase()).not.toContain(`"${word.toLowerCase()}"`);

    let unauthorizedDraws = 0;
    charlie.on('draw:begin', () => { unauthorizedDraws += 1; });
    bob.emit('draw:begin', {
      strokeId: 'bad-stroke', tool: 'brush', color: '#20211f', width: 0.008, points: [{ x: 0.2, y: 0.3 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(unauthorizedDraws).toBe(0);

    const malformedPromise = waitForEvent(alice, 'action:error');
    alice.emit('draw:begin', {
      strokeId: 'outside-canvas', tool: 'brush', color: '#20211f', width: 0.008, points: [{ x: 1.2, y: 0.3 }],
    });
    expect((await malformedPromise)[0].message).toBe('Invalid drawing command.');

    const beginPromise = waitForEvent(charlie, 'draw:begin');
    alice.emit('draw:begin', {
      strokeId: 'stroke-1', tool: 'brush', color: '#e24d3d', width: 0.008, points: [{ x: 0.1, y: 0.2 }],
    });
    expect((await beginPromise)[0].strokeId).toBe('stroke-1');
    const pointsPromise = waitForEvent(charlie, 'draw:points');
    alice.emit('draw:points', { strokeId: 'stroke-1', points: [{ x: 0.4, y: 0.5 }] });
    expect((await pointsPromise)[0].points).toEqual([{ x: 0.4, y: 0.5 }]);
    const endPromise = waitForEvent(charlie, 'draw:end');
    alice.emit('draw:end', { strokeId: 'stroke-1' });
    await endPromise;
    const undoPromise = waitForEvent(charlie, 'canvas:undo');
    alice.emit('canvas:undo');
    expect((await undoPromise)[0]).toEqual({ strokeId: 'stroke-1' });
    const clearPromise = waitForEvent(charlie, 'canvas:clear');
    alice.emit('canvas:clear');
    await clearPromise;

    const wrongMessagePromise = waitForEvent(alice, 'chat:message', (message) => message.type === 'chat');
    expect(await emitAck(bob, 'chat:send', { message: 'x'.repeat(121) })).toEqual({
      ok: false,
      error: 'Messages must be 120 characters or fewer.',
    });
    expect(await emitAck(bob, 'chat:send', { message: 'dog?' })).toEqual({ ok: true });
    expect((await wrongMessagePromise)[0]).toMatchObject({ nickname: 'Bob', text: 'dog?' });

    const bobCorrectPromise = waitForEvent(alice, 'guess:correct', (payload) => payload.nickname === 'Bob');
    expect(await emitAck(bob, 'chat:send', { message: `  ${word.toUpperCase()}  ` })).toEqual({ ok: true });
    await bobCorrectPromise;
    await waitUntil(() => Boolean(bobState.current?.room.players.find((player) => player.id === bob.id)?.hasGuessed));
    const afterBob = bobState.current!.room;
    expect(afterBob.players.find((player) => player.id === bob.id)!.score).toBeGreaterThanOrEqual(100);
    expect(afterBob.players.find((player) => player.id === alice.id)!.score).toBe(50);
    const bobScore = afterBob.players.find((player) => player.id === bob.id)!.score;
    expect(await emitAck(bob, 'chat:send', { message: word })).toEqual({ ok: false, error: 'You already guessed the word.' });
    expect(bobState.current!.room.players.find((player) => player.id === bob.id)!.score).toBe(bobScore);

    const turnEndPromise = waitForEvent(alice, 'turn:ended');
    expect(await emitAck(charlie, 'chat:send', { message: word })).toEqual({ ok: true });
    const [summary] = await turnEndPromise;
    expect(summary.reason).toBe('all-guessed');
    expect(summary.word).toBe(word);
    expect(summary.awards.find((award) => award.playerId === alice.id)?.points).toBe(100);
    const correctAnnouncements = bobPayloads.filter(
      (payload) => Array.isArray(payload) && payload[0] === 'chat:message' && JSON.stringify(payload).includes('guessed the word'),
    );
    expect(JSON.stringify(correctAnnouncements).toLowerCase()).not.toContain(`"${word.toLowerCase()}"`);
  });

  it('ends on the authoritative timer', async () => {
    const { url } = await setup({
      words: ['cat', 'dog', 'rocket'],
      timings: { wordChoiceMs: 100, intermissionMs: 100, drawDurationMs: 45 },
    });
    const alice = await addClient(url);
    const bob = await addClient(url);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    const choicesPromise = waitForEvent(alice, 'word:choices');
    await emitAck(alice, 'game:start');
    const [{ choices }] = await choicesPromise;
    const endedPromise = waitForEvent(alice, 'turn:ended', () => true, 1_000);
    await emitAck(alice, 'word:choose', { choice: choices[0] });
    expect((await endedPromise)[0].reason).toBe('time-up');
  });

  it('automatically selects one of the private choices when the drawer waits', async () => {
    const { url } = await setup({
      words: ['cat', 'dog', 'rocket'],
      timings: { wordChoiceMs: 25, intermissionMs: 100, drawDurationMs: 300 },
    });
    const alice = await addClient(url);
    const bob = await addClient(url);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    const choicesPromise = waitForEvent(alice, 'word:choices');
    const selectedPromise = waitForEvent(alice, 'word:selected');
    await emitAck(alice, 'game:start');
    const [{ choices }] = await choicesPromise;
    const [{ word }] = await selectedPromise;
    expect(choices).toContain(word);
  });

  it('moves on when the drawer leaves and transfers host', async () => {
    const { url } = await setup({ timings: { wordChoiceMs: 500, intermissionMs: 20, drawDurationMs: 500 } });
    const alice = await addClient(url);
    const bob = await addClient(url);
    const charlie = await addClient(url);
    const bobState = trackState(bob);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    await joinRoom(charlie, 'Charlie', code);
    await emitAck(alice, 'game:start');
    const skippedPromise = waitForEvent(bob, 'turn:ended');
    alice.disconnect();
    expect((await skippedPromise)[0].reason).toBe('drawer-left');
    await waitUntil(() => bobState.current?.room.game?.currentDrawerId === bob.id && bobState.current.room.game.phase === 'choosing');
    expect(bobState.current?.room.hostId).toBe(bob.id);
  });

  it('finishes early when the last unguessed player disconnects', async () => {
    const { url } = await setup({
      words: ['cat', 'dog', 'rocket'],
      timings: { wordChoiceMs: 200, intermissionMs: 100, drawDurationMs: 1_000 },
    });
    const alice = await addClient(url);
    const bob = await addClient(url);
    const charlie = await addClient(url);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    await joinRoom(charlie, 'Charlie', code);
    const choicesPromise = waitForEvent(alice, 'word:choices');
    await emitAck(alice, 'game:start');
    const [{ choices }] = await choicesPromise;
    await emitAck(alice, 'word:choose', { choice: choices[0] });
    await emitAck(bob, 'chat:send', { message: choices[0] });
    const endedPromise = waitForEvent(alice, 'turn:ended');
    charlie.disconnect();
    expect((await endedPromise)[0].reason).toBe('all-guessed');
  });

  it('returns the final remaining player to a clean lobby', async () => {
    const { url } = await setup({ timings: { wordChoiceMs: 200, intermissionMs: 100, drawDurationMs: 1_000 } });
    const alice = await addClient(url);
    const bob = await addClient(url);
    const aliceState = trackState(alice);
    const code = await createRoom(alice);
    await joinRoom(bob, 'Bob', code);
    await emitAck(alice, 'game:start');
    bob.disconnect();
    await waitUntil(() => aliceState.current?.room.status === 'lobby');
    expect(aliceState.current?.room.players).toHaveLength(1);
    expect(aliceState.current?.room.players[0].score).toBe(0);
    expect(aliceState.current?.room.game).toBeNull();
  });
});
