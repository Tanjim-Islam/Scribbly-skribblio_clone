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

export function revealWordMask(word: string, revealed: ReadonlySet<number>): string {
  const characters = [...word.trim()];
  let charIndex = 0;
  const parts: string[] = [];
  let tokens: string[] = [];
  for (const character of characters) {
    if (/\s/u.test(character)) {
      if (tokens.length > 0) {
        parts.push(tokens.join(' '));
        tokens = [];
      }
    } else {
      tokens.push(character === '-' ? '-' : revealed.has(charIndex) ? character : '_');
    }
    charIndex += 1;
  }
  if (tokens.length > 0) parts.push(tokens.join(' '));
  return parts.join('   ');
}

export function chooseRevealPositions(secretWord: string, alreadyRevealed: ReadonlySet<number>, count: number): number[] {
  const positionsByLetter = new Map<string, number[]>();
  const characters = [...secretWord.trim()];
  characters.forEach((character, index) => {
    if (/\s/u.test(character) || character === '-' || alreadyRevealed.has(index)) return;
    const positions = positionsByLetter.get(character) ?? [];
    positions.push(index);
    positionsByLetter.set(character, positions);
  });
  return [...positionsByLetter.entries()]
    .sort(([letterA, positionsA], [letterB, positionsB]) => {
      const frequencyDifference = positionsB.length - positionsA.length;
      if (frequencyDifference !== 0) return frequencyDifference;
      const positionDifference = positionsA[0] - positionsB[0];
      if (positionDifference !== 0) return positionDifference;
      return letterA.localeCompare(letterB);
    })
    .slice(0, count)
    .flatMap(([, positions]) => positions);
}

export function editDistance(first: string, second: string): number {
  if (first === second) return 0;
  if (first.length === 0) return second.length;
  if (second.length === 0) return first.length;
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= second.length; column += 1) {
      const substitutionCost = first[row - 1] === second[column - 1] ? 0 : 1;
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + substitutionCost,
      );
    }
    previous = current;
  }
  return previous[second.length];
}

export function isNearGuess(guess: string, secretWord: string): boolean {
  return editDistance(guess, secretWord) === 1;
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
