import { ROOM_CODE_LENGTH } from '../../shared/types.js';
import { ROOM_ALPHABET } from './validation.js';

export function calculateGuessScore(remainingMs: number, totalMs: number): number {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(totalMs) || totalMs <= 0) return 100;
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  return Math.max(100, Math.min(500, 100 + Math.floor(400 * ratio)));
}

export function maskWord(word: string): string {
  return word
    .trim()
    .split(/\s+/u)
    .map((part) => [...part].map((character) => (character === '-' ? '-' : '_')).join(' '))
    .join('   ');
}

export function createRoomCode(existingCodes: Set<string>, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const alphabetIndex = Math.min(ROOM_ALPHABET.length - 1, Math.floor(random() * ROOM_ALPHABET.length));
      code += ROOM_ALPHABET[alphabetIndex];
    }
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('Could not allocate a room code.');
}

export type TurnTransition =
  | { kind: 'next-turn'; round: number; turnIndex: number }
  | { kind: 'next-round'; round: number; turnIndex: 0 }
  | { kind: 'complete'; round: number; turnIndex: number };

export function getTurnTransition(
  round: number,
  turnIndex: number,
  orderLength: number,
  totalRounds: number,
): TurnTransition {
  if (turnIndex + 1 < orderLength) {
    return { kind: 'next-turn', round, turnIndex: turnIndex + 1 };
  }
  if (round < totalRounds) {
    return { kind: 'next-round', round: round + 1, turnIndex: 0 };
  }
  return { kind: 'complete', round, turnIndex };
}
