export const ROOM_CODE_LENGTH = 6;
export const MAX_PLAYERS = 8;
export const MAX_NICKNAME_LENGTH = 20;
export const MAX_CHAT_LENGTH = 120;

export type GameSettings = {
  rounds: 1 | 2 | 3 | 4 | 5;
  drawTime: 60 | 80 | 100 | 120;
};

export const DEFAULT_SETTINGS: GameSettings = {
  rounds: 3,
  drawTime: 80,
};

export type GamePhase = 'choosing' | 'drawing' | 'intermission' | 'finished';
export type TurnEndReason = 'all-guessed' | 'time-up' | 'drawer-left';

export type PublicPlayer = {
  id: string;
  nickname: string;
  score: number;
  isHost: boolean;
  isDrawer: boolean;
  hasGuessed: boolean;
};

export type TurnAward = {
  playerId: string;
  nickname: string;
  points: number;
};

export type TurnSummary = {
  drawerName: string;
  word: string | null;
  reason: TurnEndReason;
  awards: TurnAward[];
};

export type PublicGameState = {
  phase: GamePhase;
  round: number;
  totalRounds: number;
  currentDrawerId: string | null;
  currentDrawerName: string | null;
  maskedWord: string | null;
  deadline: number | null;
  lastTurn: TurnSummary | null;
};

export type PublicRoomState = {
  code: string;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  settings: GameSettings;
  maxPlayers: number;
  players: PublicPlayer[];
  game: PublicGameState | null;
};

export type RoomStateEnvelope = {
  selfId: string;
  room: PublicRoomState;
};

export type NormalizedPoint = {
  x: number;
  y: number;
};

export type DrawingTool = 'brush' | 'eraser';
export type BrushWidth = 0.004 | 0.008 | 0.016;

export type DrawStroke = {
  strokeId: string;
  tool: DrawingTool;
  color: string;
  width: BrushWidth;
  points: NormalizedPoint[];
};

export type ChatMessage = {
  id: string;
  type: 'chat' | 'system' | 'guess';
  playerId: string | null;
  nickname: string | null;
  text: string;
  at: number;
};

export type ActionSuccess<T = undefined> = T extends undefined
  ? { ok: true }
  : { ok: true; data: T };
export type ActionFailure = { ok: false; error: string };
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;
export type ActionAck<T = undefined> = (result: ActionResult<T>) => void;

export type ClientToServerEvents = {
  'room:create': (payload: { nickname: string }, ack: ActionAck<{ roomCode: string }>) => void;
  'room:join': (payload: { nickname: string; roomCode: string }, ack: ActionAck<{ roomCode: string }>) => void;
  'room:updateSettings': (payload: GameSettings, ack: ActionAck) => void;
  'game:start': (ack: ActionAck) => void;
  'word:choose': (payload: { choice: string }, ack: ActionAck) => void;
  'chat:send': (payload: { message: string }, ack: ActionAck) => void;
  'draw:begin': (stroke: DrawStroke) => void;
  'draw:points': (payload: { strokeId: string; points: NormalizedPoint[] }) => void;
  'draw:end': (payload: { strokeId: string }) => void;
  'canvas:undo': () => void;
  'canvas:clear': () => void;
  'game:returnToLobby': (ack: ActionAck) => void;
};

export type ServerToClientEvents = {
  'room:state': (payload: RoomStateEnvelope) => void;
  'action:error': (payload: { message: string }) => void;
  'word:choices': (payload: { choices: string[]; deadline: number }) => void;
  'word:selected': (payload: { word: string }) => void;
  'chat:message': (message: ChatMessage) => void;
  'guess:correct': (payload: { playerId: string; nickname: string }) => void;
  'draw:begin': (stroke: DrawStroke) => void;
  'draw:points': (payload: { strokeId: string; points: NormalizedPoint[] }) => void;
  'draw:end': (payload: { strokeId: string }) => void;
  'canvas:undo': (payload: { strokeId: string | null }) => void;
  'canvas:clear': () => void;
  'turn:ended': (summary: TurnSummary) => void;
  'game:ended': (payload: { standings: PublicPlayer[] }) => void;
};
