import {
  MAX_CHAT_LENGTH,
  MAX_NICKNAME_LENGTH,
  ROOM_CODE_LENGTH,
  type BrushWidth,
  type DrawStroke,
  type GameSettings,
  type NormalizedPoint,
} from '../../shared/types.js';

export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ALLOWED_ROUNDS = new Set([1, 2, 3, 4, 5]);
export const ALLOWED_DRAW_TIMES = new Set([60, 80, 100, 120]);
export const ALLOWED_BRUSH_WIDTHS = new Set<BrushWidth>([0.004, 0.008, 0.016]);

export function validateNickname(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Enter a nickname.' };
  const nickname = value.trim();
  if (!nickname) return { ok: false, error: 'Enter a nickname.' };
  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return { ok: false, error: `Nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.` };
  }
  if (/[\p{Cc}\p{Cf}]/u.test(nickname)) {
    return { ok: false, error: 'Nickname contains unsupported characters.' };
  }
  return { ok: true, value: nickname };
}

export function normalizeGuess(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ');
}

export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((character) => ROOM_ALPHABET.includes(character)) ? code : null;
}

export function validateSettings(value: unknown): value is GameSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return ALLOWED_ROUNDS.has(settings.rounds as number) && ALLOWED_DRAW_TIMES.has(settings.drawTime as number);
}

export function validateChatMessage(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: 'Message is invalid.' };
  const message = value.trim();
  if (!message) return { ok: false, error: 'Type a message first.' };
  if (message.length > MAX_CHAT_LENGTH) {
    return { ok: false, error: `Messages must be ${MAX_CHAT_LENGTH} characters or fewer.` };
  }
  if (/\p{Cc}/u.test(message)) {
    return { ok: false, error: 'Message contains unsupported characters.' };
  }
  return { ok: true, value: message };
}

export function validatePoint(value: unknown): value is NormalizedPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 1 &&
    point.y >= 0 &&
    point.y <= 1
  );
}

export function validateStroke(value: unknown): value is DrawStroke {
  if (!value || typeof value !== 'object') return false;
  const stroke = value as Partial<DrawStroke>;
  return (
    typeof stroke.strokeId === 'string' &&
    /^[A-Za-z0-9_-]{1,40}$/u.test(stroke.strokeId) &&
    (stroke.tool === 'brush' || stroke.tool === 'eraser') &&
    typeof stroke.color === 'string' &&
    /^#[0-9A-Fa-f]{6}$/u.test(stroke.color) &&
    ALLOWED_BRUSH_WIDTHS.has(stroke.width as BrushWidth) &&
    Array.isArray(stroke.points) &&
    stroke.points.length === 1 &&
    stroke.points.every(validatePoint)
  );
}

export function validatePointBatch(value: unknown): value is NormalizedPoint[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 64 && value.every(validatePoint);
}

export function validateStrokeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,40}$/u.test(value);
}
