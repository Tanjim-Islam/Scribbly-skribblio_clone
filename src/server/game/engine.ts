import type { Server, Socket } from 'socket.io';
import {
  DEFAULT_SETTINGS,
  MAX_PLAYERS,
  type ActionAck,
  type ActionResult,
  type CanvasFill,
  type ChatMessage,
  type ClientToServerEvents,
  type DrawStroke,
  type GamePhase,
  type GameSettings,
  type PublicPlayer,
  type PublicRoomState,
  type ServerToClientEvents,
  type TurnEndReason,
  type TurnSummary,
} from '../../shared/types.js';
import {
  calculateGuessScore,
  chooseRevealPositions,
  createRoomCode,
  isNearGuess,
  maskWord,
  revealWordMask,
} from './logic.js';
import {
  normalizeGuess,
  normalizeRoomCode,
  validateChatMessage,
  validateFill,
  validateNickname,
  validatePointBatch,
  validateSettings,
  validateStroke,
  validateStrokeId,
} from './validation.js';
import { pickWordChoices, WORD_BANK } from './words.js';

type ScribblyServer = Server<ClientToServerEvents, ServerToClientEvents>;
type ScribblySocket = Socket<ClientToServerEvents, ServerToClientEvents>;

type RoomPlayer = {
  id: string;
  nickname: string;
  score: number;
  joinedOrder: number;
  hasGuessed: boolean;
};

type StoredStroke = DrawStroke & {
  playerId: string;
  ended: boolean;
};

type StoredAction =
  | { kind: 'stroke'; playerId: string; stroke: StoredStroke }
  | { kind: 'fill'; playerId: string; point: CanvasFill['point']; color: string };

type InternalGame = {
  phase: GamePhase;
  round: number;
  turnIndex: number;
  drawerOrder: string[];
  currentDrawerId: string | null;
  choices: string[];
  secretWord: string | null;
  maskedWord: string | null;
  deadline: number | null;
  drawDurationMs: number;
  actions: StoredAction[];
  revealedPositions: Set<number>;
  nearGuesses: Set<string>;
  awards: Map<string, number>;
  lastTurn: TurnSummary | null;
  choiceTimer: ReturnType<typeof setTimeout> | null;
  drawTimer: ReturnType<typeof setTimeout> | null;
  intermissionTimer: ReturnType<typeof setTimeout> | null;
  hintTimers: ReturnType<typeof setTimeout>[];
};

type InternalRoom = {
  code: string;
  hostId: string;
  players: Map<string, RoomPlayer>;
  settings: GameSettings;
  status: 'lobby' | 'playing' | 'finished';
  game: InternalGame | null;
};

export type GameTimings = {
  wordChoiceMs: number;
  intermissionMs: number;
  disconnectGraceMs: number;
  drawDurationMs?: number;
};

export type GameEngineOptions = {
  timings?: Partial<GameTimings>;
  random?: () => number;
  words?: readonly string[];
};

const DEFAULT_TIMINGS: GameTimings = {
  wordChoiceMs: 15_000,
  intermissionMs: 3_500,
  disconnectGraceMs: 5_000,
};

export class GameEngine {
  readonly rooms = new Map<string, InternalRoom>();

  private readonly socketRooms = new Map<string, string>();
  private readonly timings: GameTimings;
  private readonly random: () => number;
  private readonly words: readonly string[];
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private joinedCounter = 0;
  private messageCounter = 0;

  constructor(
    private readonly io: ScribblyServer,
    options: GameEngineOptions = {},
  ) {
    this.timings = { ...DEFAULT_TIMINGS, ...options.timings };
    this.random = options.random ?? Math.random;
    this.words = options.words ?? WORD_BANK;
  }

  attachSocket(socket: ScribblySocket): void {
    const pendingDisconnect = this.disconnectTimers.get(socket.id);
    if (pendingDisconnect) {
      clearTimeout(pendingDisconnect);
      this.disconnectTimers.delete(socket.id);
    }
    if (socket.recovered) {
      const recoveredRoom = this.roomForSocket(socket.id);
      if (recoveredRoom) {
        this.broadcastState(recoveredRoom);
        const game = recoveredRoom.game;
        if (game?.currentDrawerId === socket.id && game.phase === 'choosing' && game.deadline) {
          socket.emit('word:choices', { choices: [...game.choices], deadline: game.deadline });
        }
        if (game?.currentDrawerId === socket.id && game.phase === 'drawing' && game.secretWord) {
          socket.emit('word:selected', { word: game.secretWord });
        }
      }
    }

    socket.on('room:create', async (payload, ack) => {
      const parsed = validateNickname(payload?.nickname);
      if (!parsed.ok) return this.fail(socket, ack, parsed.error);
      if (this.socketRooms.has(socket.id)) return this.fail(socket, ack, 'You are already in a room.');

      const code = createRoomCode(new Set(this.rooms.keys()), this.random);
      const player = this.createPlayer(socket.id, parsed.value);
      const room: InternalRoom = {
        code,
        hostId: socket.id,
        players: new Map([[socket.id, player]]),
        settings: { ...DEFAULT_SETTINGS },
        status: 'lobby',
        game: null,
      };
      this.rooms.set(code, room);
      this.socketRooms.set(socket.id, code);
      await socket.join(code);
      this.ok(ack, { roomCode: code });
      this.broadcastState(room);
    });

    socket.on('room:join', async (payload, ack) => {
      const parsedName = validateNickname(payload?.nickname);
      if (!parsedName.ok) return this.fail(socket, ack, parsedName.error);
      const code = normalizeRoomCode(payload?.roomCode);
      if (!code) return this.fail(socket, ack, 'Enter a valid room code.');
      if (this.socketRooms.has(socket.id)) return this.fail(socket, ack, 'You are already in a room.');
      const room = this.rooms.get(code);
      if (!room) return this.fail(socket, ack, 'Room not found.');
      if (room.status !== 'lobby') return this.fail(socket, ack, 'Game already in progress.');
      if (room.players.size >= MAX_PLAYERS) return this.fail(socket, ack, 'Room is full.');
      const duplicate = [...room.players.values()].some(
        (player) => normalizeGuess(player.nickname) === normalizeGuess(parsedName.value),
      );
      if (duplicate) return this.fail(socket, ack, 'That nickname is already in this room.');

      room.players.set(socket.id, this.createPlayer(socket.id, parsedName.value));
      this.socketRooms.set(socket.id, code);
      await socket.join(code);
      this.ok(ack, { roomCode: code });
      this.broadcastState(room);
      this.emitSystem(room, `${parsedName.value} joined the room.`);
    });

    socket.on('room:updateSettings', (payload, ack) => {
      const room = this.roomForSocket(socket.id);
      if (!room) return this.fail(socket, ack, 'Join a room first.');
      if (room.hostId !== socket.id) return this.fail(socket, ack, 'Only the host can change settings.');
      if (room.status !== 'lobby') return this.fail(socket, ack, 'Settings are locked during a game.');
      if (!validateSettings(payload)) return this.fail(socket, ack, 'Choose valid game settings.');
      room.settings = { rounds: payload.rounds, drawTime: payload.drawTime };
      this.ok(ack);
      this.broadcastState(room);
    });

    socket.on('game:start', (ack) => {
      const room = this.roomForSocket(socket.id);
      if (!room) return this.fail(socket, ack, 'Join a room first.');
      if (room.hostId !== socket.id) return this.fail(socket, ack, 'Only the host can start the game.');
      if (room.status !== 'lobby') return this.fail(socket, ack, 'The game has already started.');
      if (room.players.size < 2) return this.fail(socket, ack, 'At least two players are needed.');

      for (const player of room.players.values()) {
        player.score = 0;
        player.hasGuessed = false;
      }
      room.status = 'playing';
      room.game = this.newGame([...room.players.keys()]);
      this.ok(ack);
      this.beginTurn(room);
    });

    socket.on('word:choose', (payload, ack) => {
      const room = this.roomForSocket(socket.id);
      if (!room?.game || room.status !== 'playing') return this.fail(socket, ack, 'No active turn.');
      const game = room.game;
      if (game.phase !== 'choosing' || game.currentDrawerId !== socket.id) {
        return this.fail(socket, ack, 'Only the current drawer can choose a word.');
      }
      if (typeof payload?.choice !== 'string' || !game.choices.includes(payload.choice)) {
        return this.fail(socket, ack, 'Choose one of the offered words.');
      }
      this.selectWord(room, payload.choice);
      this.ok(ack);
    });

    socket.on('chat:send', (payload, ack) => {
      const room = this.roomForSocket(socket.id);
      if (!room?.game || room.status !== 'playing' || room.game.phase !== 'drawing') {
        return this.fail(socket, ack, 'Chat is available while drawing.');
      }
      const player = room.players.get(socket.id);
      if (!player) return this.fail(socket, ack, 'Player not found.');
      if (room.game.currentDrawerId === socket.id) return this.fail(socket, ack, 'The drawer cannot guess.');
      if (player.hasGuessed) return this.fail(socket, ack, 'You already guessed the word.');
      const parsed = validateChatMessage(payload?.message);
      if (!parsed.ok) return this.fail(socket, ack, parsed.error);

      const normalizedGuess = normalizeGuess(parsed.value);
      if (room.game.secretWord && normalizedGuess === normalizeGuess(room.game.secretWord)) {
        this.handleCorrectGuess(room, player);
      } else if (
        room.game.secretWord &&
        isNearGuess(normalizedGuess, normalizeGuess(room.game.secretWord)) &&
        !room.game.nearGuesses.has(normalizedGuess)
      ) {
        room.game.nearGuesses.add(normalizedGuess);
        this.io.to(room.code).emit('chat:message', this.makeChatMessage('near', `"${parsed.value}" is close.`, player));
      } else {
        this.io.to(room.code).emit('chat:message', this.makeChatMessage('chat', parsed.value, player));
      }
      this.ok(ack);
    });

    socket.on('draw:begin', (payload) => this.handleDrawBegin(socket, payload));
    socket.on('draw:points', (payload) => this.handleDrawPoints(socket, payload));
    socket.on('draw:end', (payload) => this.handleDrawEnd(socket, payload));
    socket.on('canvas:fill', (payload) => this.handleFill(socket, payload));
    socket.on('canvas:undo', () => this.handleUndo(socket));
    socket.on('canvas:clear', () => this.handleClear(socket));

    socket.on('game:returnToLobby', (ack) => {
      const room = this.roomForSocket(socket.id);
      if (!room) return this.fail(socket, ack, 'Join a room first.');
      if (room.hostId !== socket.id) return this.fail(socket, ack, 'Only the host can return to the lobby.');
      if (room.status !== 'finished') return this.fail(socket, ack, 'The game is not finished.');
      this.resetToLobby(room, null);
      this.ok(ack);
    });

    socket.on('disconnect', (reason) => this.handleSocketDisconnect(socket.id, reason));
  }

  destroy(): void {
    for (const room of this.rooms.values()) this.clearTimers(room);
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.rooms.clear();
    this.socketRooms.clear();
  }

  private handleSocketDisconnect(socketId: string, reason: string): void {
    const immediate =
      reason === 'client namespace disconnect' ||
      reason === 'server namespace disconnect' ||
      this.timings.disconnectGraceMs <= 0;
    if (immediate) {
      this.handleDisconnect(socketId);
      return;
    }
    const previous = this.disconnectTimers.get(socketId);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(socketId);
      this.handleDisconnect(socketId);
    }, this.timings.disconnectGraceMs);
    this.disconnectTimers.set(socketId, timer);
  }

  private createPlayer(id: string, nickname: string): RoomPlayer {
    this.joinedCounter += 1;
    return { id, nickname, score: 0, joinedOrder: this.joinedCounter, hasGuessed: false };
  }

  private newGame(drawerOrder: string[]): InternalGame {
    return {
      phase: 'choosing',
      round: 1,
      turnIndex: 0,
      drawerOrder,
      currentDrawerId: null,
      choices: [],
      secretWord: null,
      maskedWord: null,
      deadline: null,
      drawDurationMs: 0,
      actions: [],
      revealedPositions: new Set(),
      nearGuesses: new Set(),
      awards: new Map(),
      lastTurn: null,
      choiceTimer: null,
      drawTimer: null,
      intermissionTimer: null,
      hintTimers: [],
    };
  }

  private beginTurn(room: InternalRoom): void {
    const game = room.game;
    if (!game || room.status !== 'playing') return;
    this.clearTimers(room);
    const drawerId = this.findAvailableDrawer(room, game.turnIndex);
    if (!drawerId) {
      this.finishGame(room);
      return;
    }
    game.turnIndex = game.drawerOrder.indexOf(drawerId);
    game.currentDrawerId = drawerId;
    game.phase = 'choosing';
    game.choices = pickWordChoices(this.words, this.random);
    game.secretWord = null;
    game.maskedWord = null;
    game.deadline = Date.now() + this.timings.wordChoiceMs;
    game.actions = [];
    game.revealedPositions = new Set();
    game.nearGuesses = new Set();
    game.awards = new Map();
    game.lastTurn = null;
    for (const player of room.players.values()) player.hasGuessed = false;

    this.io.to(room.code).emit('canvas:clear');
    this.broadcastState(room);
    this.io.to(drawerId).emit('word:choices', { choices: [...game.choices], deadline: game.deadline });
    const expectedGame = game;
    game.choiceTimer = setTimeout(() => {
      if (room.game === expectedGame && expectedGame.phase === 'choosing') {
        this.selectWord(room, expectedGame.choices[0]);
      }
    }, this.timings.wordChoiceMs);
  }

  private selectWord(room: InternalRoom, word: string): void {
    const game = room.game;
    if (!game || game.phase !== 'choosing' || !game.currentDrawerId || !game.choices.includes(word)) return;
    if (game.choiceTimer) clearTimeout(game.choiceTimer);
    game.choiceTimer = null;
    game.secretWord = word;
    game.revealedPositions = new Set();
    game.maskedWord = maskWord(word);
    game.phase = 'drawing';
    game.drawDurationMs = this.timings.drawDurationMs ?? room.settings.drawTime * 1_000;
    game.deadline = Date.now() + game.drawDurationMs;
    this.io.to(game.currentDrawerId).emit('word:selected', { word });
    this.broadcastState(room);
    const expectedGame = game;
    game.drawTimer = setTimeout(() => {
      if (room.game === expectedGame && expectedGame.phase === 'drawing') {
        this.finishTurn(room, 'time-up');
      }
    }, game.drawDurationMs);
    game.hintTimers = [
      { atMs: Math.floor(game.drawDurationMs * 0.5), count: 1 },
      { atMs: Math.floor(game.drawDurationMs * 0.75), count: 2 },
    ].map(({ atMs, count }) =>
      setTimeout(() => {
        if (room.game === expectedGame && expectedGame.phase === 'drawing') {
          this.revealHint(room, count);
        }
      }, atMs),
    );
  }

  private revealHint(room: InternalRoom, count: number): void {
    const game = room.game;
    if (!game?.secretWord || game.phase !== 'drawing' || !game.maskedWord) return;
    const positions = chooseRevealPositions(game.secretWord, game.revealedPositions, count);
    if (positions.length === 0) return;
    for (const position of positions) game.revealedPositions.add(position);
    game.maskedWord = revealWordMask(game.secretWord, game.revealedPositions);
    const letter = [...game.secretWord][positions[0]];
    this.emitSystem(room, `Hint: the letter "${letter}" is in the word.`);
    this.broadcastState(room);
  }

  private handleCorrectGuess(room: InternalRoom, player: RoomPlayer): void {
    const game = room.game;
    if (!game || game.phase !== 'drawing' || player.hasGuessed) return;
    const remaining = Math.max(0, (game.deadline ?? Date.now()) - Date.now());
    const points = calculateGuessScore(remaining, game.drawDurationMs);
    player.hasGuessed = true;
    player.score += points;
    game.awards.set(player.id, (game.awards.get(player.id) ?? 0) + points);

    const drawer = game.currentDrawerId ? room.players.get(game.currentDrawerId) : null;
    if (drawer) {
      drawer.score += 50;
      game.awards.set(drawer.id, (game.awards.get(drawer.id) ?? 0) + 50);
    }

    this.io.to(room.code).emit('guess:correct', { playerId: player.id, nickname: player.nickname });
    this.io.to(room.code).emit(
      'chat:message',
      this.makeChatMessage('guess', `${player.nickname} guessed the word!`, null),
    );
    this.broadcastState(room);
    if (this.allGuessersFinished(room)) this.finishTurn(room, 'all-guessed');
  }

  private finishTurn(room: InternalRoom, reason: TurnEndReason): void {
    const game = room.game;
    if (!game || room.status !== 'playing' || !['choosing', 'drawing'].includes(game.phase)) return;
    if (game.choiceTimer) clearTimeout(game.choiceTimer);
    if (game.drawTimer) clearTimeout(game.drawTimer);
    game.choiceTimer = null;
    game.drawTimer = null;
    const drawerName = game.currentDrawerId ? room.players.get(game.currentDrawerId)?.nickname ?? 'The drawer' : 'The drawer';
    const awards = [...game.awards.entries()]
      .map(([playerId, points]) => {
        const player = room.players.get(playerId);
        return player ? { playerId, nickname: player.nickname, points } : null;
      })
      .filter((award): award is NonNullable<typeof award> => award !== null)
      .sort((a, b) => b.points - a.points);
    const summary: TurnSummary = {
      drawerName,
      word: game.secretWord,
      reason,
      awards,
    };
    game.phase = 'intermission';
    game.deadline = Date.now() + this.timings.intermissionMs;
    game.lastTurn = summary;
    game.secretWord = null;
    game.maskedWord = null;
    this.io.to(room.code).emit('turn:ended', summary);
    this.broadcastState(room);
    const expectedGame = game;
    game.intermissionTimer = setTimeout(() => {
      if (room.game === expectedGame && expectedGame.phase === 'intermission') this.advanceTurn(room);
    }, this.timings.intermissionMs);
  }

  private advanceTurn(room: InternalRoom): void {
    const game = room.game;
    if (!game || room.status !== 'playing' || game.phase !== 'intermission') return;
    if (game.intermissionTimer) clearTimeout(game.intermissionTimer);
    game.intermissionTimer = null;

    const nextInRound = this.findAvailableDrawer(room, game.turnIndex + 1);
    if (nextInRound) {
      game.turnIndex = game.drawerOrder.indexOf(nextInRound);
      this.beginTurn(room);
      return;
    }
    if (game.round < room.settings.rounds) {
      game.round += 1;
      game.turnIndex = 0;
      const first = this.findAvailableDrawer(room, 0);
      if (first) {
        game.turnIndex = game.drawerOrder.indexOf(first);
        this.beginTurn(room);
        return;
      }
    }
    this.finishGame(room);
  }

  private finishGame(room: InternalRoom): void {
    const game = room.game;
    if (!game) return;
    this.clearTimers(room);
    room.status = 'finished';
    game.phase = 'finished';
    game.currentDrawerId = null;
    game.deadline = null;
    game.secretWord = null;
    game.maskedWord = null;
    const standings = this.publicPlayers(room).sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    this.io.to(room.code).emit('game:ended', { standings });
    this.broadcastState(room);
  }

  private handleDrawBegin(socket: ScribblySocket, payload: DrawStroke): void {
    const room = this.authorizedDrawingRoom(socket.id);
    if (!room?.game) return this.drawError(socket, 'Only the current drawer can draw.');
    if (!validateStroke(payload)) return this.drawError(socket, 'Invalid drawing command.');
    const game = room.game;
    if (
      game.actions.length >= 300 ||
      game.actions.some((action) => action.kind === 'stroke' && action.stroke.strokeId === payload.strokeId)
    ) {
      return this.drawError(socket, 'Invalid drawing command.');
    }
    game.actions.push({
      kind: 'stroke',
      playerId: socket.id,
      stroke: { ...payload, points: [...payload.points], playerId: socket.id, ended: false },
    });
    socket.to(room.code).emit('draw:begin', payload);
  }

  private handleDrawPoints(
    socket: ScribblySocket,
    payload: { strokeId: string; points: { x: number; y: number }[] },
  ): void {
    const room = this.authorizedDrawingRoom(socket.id);
    if (!room?.game) return this.drawError(socket, 'Only the current drawer can draw.');
    if (!validateStrokeId(payload?.strokeId) || !validatePointBatch(payload?.points)) {
      return this.drawError(socket, 'Invalid drawing command.');
    }
    const stroke = this.findActiveStroke(room.game, socket.id, payload.strokeId);
    if (!stroke || stroke.points.length + payload.points.length > 5_000) {
      return this.drawError(socket, 'Invalid drawing command.');
    }
    stroke.points.push(...payload.points);
    socket.to(room.code).emit('draw:points', payload);
  }

  private handleDrawEnd(socket: ScribblySocket, payload: { strokeId: string }): void {
    const room = this.authorizedDrawingRoom(socket.id);
    if (!room?.game) return this.drawError(socket, 'Only the current drawer can draw.');
    if (!validateStrokeId(payload?.strokeId)) return this.drawError(socket, 'Invalid drawing command.');
    const stroke = this.findActiveStroke(room.game, socket.id, payload.strokeId);
    if (!stroke) return this.drawError(socket, 'Invalid drawing command.');
    stroke.ended = true;
    socket.to(room.code).emit('draw:end', payload);
  }

  private findActiveStroke(game: InternalGame, playerId: string, strokeId: string): StoredStroke | null {
    for (let index = game.actions.length - 1; index >= 0; index -= 1) {
      const action = game.actions[index];
      if (
        action.kind === 'stroke' &&
        action.stroke.strokeId === strokeId &&
        action.stroke.playerId === playerId &&
        !action.stroke.ended
      ) {
        return action.stroke;
      }
    }
    return null;
  }

  private handleFill(socket: ScribblySocket, payload: CanvasFill): void {
    const room = this.authorizedDrawingRoom(socket.id);
    if (!room?.game) return this.drawError(socket, 'Only the current drawer can draw.');
    if (!validateFill(payload)) return this.drawError(socket, 'Invalid drawing command.');
    const game = room.game;
    if (game.actions.length >= 300) return this.drawError(socket, 'Invalid drawing command.');
    game.actions.push({ kind: 'fill', playerId: socket.id, point: payload.point, color: payload.color });
    this.io.to(room.code).emit('canvas:fill', { point: payload.point, color: payload.color });
  }

  private handleUndo(socket: ScribblySocket): void {
    const room = this.authorizedDrawingRoom(socket.id);
    if (!room?.game) return this.drawError(socket, 'Only the current drawer can edit the canvas.');
    let index = -1;
    for (let candidate = room.game.actions.length - 1; candidate >= 0; candidate -= 1) {
      if (room.game.actions[candidate].playerId === socket.id) {
        index = candidate;
        break;
      }
    }
    if (index < 0) return;
    const [action] = room.game.actions.splice(index, 1);
    this.io.to(room.code).emit('canvas:undo', {
      strokeId: action.kind === 'stroke' ? action.stroke.strokeId : null,
    });
  }

  private handleClear(socket: ScribblySocket): void {
    const room = this.authorizedDrawingRoom(socket.id);
    if (!room?.game) return this.drawError(socket, 'Only the current drawer can edit the canvas.');
    room.game.actions = [];
    this.io.to(room.code).emit('canvas:clear');
  }

  private authorizedDrawingRoom(socketId: string): InternalRoom | null {
    const room = this.roomForSocket(socketId);
    if (
      !room?.game ||
      room.status !== 'playing' ||
      room.game.phase !== 'drawing' ||
      room.game.currentDrawerId !== socketId
    ) {
      return null;
    }
    return room;
  }

  private handleDisconnect(socketId: string): void {
    const code = this.socketRooms.get(socketId);
    if (!code) return;
    this.socketRooms.delete(socketId);
    const room = this.rooms.get(code);
    if (!room) return;
    const leaving = room.players.get(socketId);
    const wasDrawer = room.game?.currentDrawerId === socketId;
    room.players.delete(socketId);

    if (room.players.size === 0) {
      this.clearTimers(room);
      this.rooms.delete(code);
      return;
    }
    if (room.hostId === socketId) {
      room.hostId = [...room.players.values()].sort((a, b) => a.joinedOrder - b.joinedOrder)[0].id;
    }
    if (room.status === 'playing' && room.players.size < 2) {
      this.resetToLobby(room, `${leaving?.nickname ?? 'A player'} left the room. Not enough players to keep playing.`);
      return;
    }
    if (room.status === 'playing' && wasDrawer && room.game && ['choosing', 'drawing'].includes(room.game.phase)) {
      this.finishTurn(room, 'drawer-left');
      return;
    }
    if (room.status === 'playing' && room.game?.phase === 'drawing' && this.allGuessersFinished(room)) {
      this.finishTurn(room, 'all-guessed');
      return;
    }
    this.broadcastState(room);
    if (leaving) this.emitSystem(room, `${leaving.nickname} left the room.`);
  }

  private resetToLobby(room: InternalRoom, notice: string | null): void {
    this.clearTimers(room);
    room.status = 'lobby';
    room.game = null;
    for (const player of room.players.values()) {
      player.score = 0;
      player.hasGuessed = false;
    }
    this.io.to(room.code).emit('canvas:clear');
    this.broadcastState(room);
    if (notice) this.emitSystem(room, notice);
  }

  private findAvailableDrawer(room: InternalRoom, startIndex: number): string | null {
    const order = room.game?.drawerOrder ?? [];
    for (let index = startIndex; index < order.length; index += 1) {
      if (room.players.has(order[index])) return order[index];
    }
    return null;
  }

  private allGuessersFinished(room: InternalRoom): boolean {
    const drawerId = room.game?.currentDrawerId;
    const guessers = [...room.players.values()].filter((player) => player.id !== drawerId);
    return guessers.length > 0 && guessers.every((player) => player.hasGuessed);
  }

  private roomForSocket(socketId: string): InternalRoom | null {
    const code = this.socketRooms.get(socketId);
    return code ? this.rooms.get(code) ?? null : null;
  }

  private clearTimers(room: InternalRoom): void {
    const game = room.game;
    if (!game) return;
    if (game.choiceTimer) clearTimeout(game.choiceTimer);
    if (game.drawTimer) clearTimeout(game.drawTimer);
    if (game.intermissionTimer) clearTimeout(game.intermissionTimer);
    for (const timer of game.hintTimers) clearTimeout(timer);
    game.choiceTimer = null;
    game.drawTimer = null;
    game.intermissionTimer = null;
    game.hintTimers = [];
  }

  private publicPlayers(room: InternalRoom): PublicPlayer[] {
    return [...room.players.values()]
      .sort((a, b) => a.joinedOrder - b.joinedOrder)
      .map((player) => ({
        id: player.id,
        nickname: player.nickname,
        score: player.score,
        isHost: player.id === room.hostId,
        isDrawer: player.id === room.game?.currentDrawerId,
        hasGuessed: player.hasGuessed,
      }));
  }

  private publicState(room: InternalRoom): PublicRoomState {
    const drawer = room.game?.currentDrawerId ? room.players.get(room.game.currentDrawerId) : null;
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      settings: { ...room.settings },
      maxPlayers: MAX_PLAYERS,
      players: this.publicPlayers(room),
      game: room.game
        ? {
            phase: room.game.phase,
            round: room.game.round,
            totalRounds: room.settings.rounds,
            currentDrawerId: room.game.currentDrawerId,
            currentDrawerName: drawer?.nickname ?? null,
            maskedWord: room.game.phase === 'drawing' ? room.game.maskedWord : null,
            deadline: room.game.deadline,
            lastTurn: room.game.lastTurn,
          }
        : null,
    };
  }

  private broadcastState(room: InternalRoom): void {
    const state = this.publicState(room);
    for (const socketId of room.players.keys()) {
      this.io.to(socketId).emit('room:state', { selfId: socketId, room: state });
    }
  }

  private makeChatMessage(type: ChatMessage['type'], text: string, player: RoomPlayer | null): ChatMessage {
    this.messageCounter += 1;
    return {
      id: `m${this.messageCounter}`,
      type,
      playerId: player?.id ?? null,
      nickname: player?.nickname ?? null,
      text,
      at: Date.now(),
    };
  }

  private emitSystem(room: InternalRoom, text: string): void {
    this.io.to(room.code).emit('chat:message', this.makeChatMessage('system', text, null));
  }

  private drawError(socket: ScribblySocket, message: string): void {
    socket.emit('action:error', { message });
  }

  private ok<T>(ack: ActionAck<T> | undefined, data?: T): void {
    if (typeof ack !== 'function') return;
    const result = data === undefined ? { ok: true } : { ok: true, data };
    ack(result as ActionResult<T>);
  }

  private fail<T>(socket: ScribblySocket, ack: ActionAck<T> | undefined, error: string): void {
    if (typeof ack === 'function') ack({ ok: false, error });
    else socket.emit('action:error', { message: error });
  }
}
