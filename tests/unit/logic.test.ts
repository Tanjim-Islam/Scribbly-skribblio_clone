import { describe, expect, it } from 'vitest';
import { calculateGuessScore, createRoomCode, getTurnTransition, maskWord } from '../../src/server/game/logic.js';
import { pickWordChoices, WORD_BANK } from '../../src/server/game/words.js';
import {
  normalizeGuess,
  normalizeRoomCode,
  validateNickname,
  validateSettings,
} from '../../src/server/game/validation.js';

describe('nickname validation', () => {
  it('trims a valid nickname', () => {
    expect(validateNickname('  Alice  ')).toEqual({ ok: true, value: 'Alice' });
  });

  it('rejects empty names', () => {
    expect(validateNickname('   ')).toEqual({ ok: false, error: 'Enter a nickname.' });
  });

  it('accepts 20 characters and rejects 21', () => {
    expect(validateNickname('a'.repeat(20)).ok).toBe(true);
    expect(validateNickname('a'.repeat(21)).ok).toBe(false);
  });

  it('rejects control characters', () => {
    expect(validateNickname('Ali\u0000ce').ok).toBe(false);
  });
});

describe('room codes', () => {
  it('creates a six-character unambiguous code', () => {
    expect(createRoomCode(new Set(), () => 0)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/u);
  });

  it('retries safely after a collision', () => {
    const first = createRoomCode(new Set(), () => 0);
    let calls = 0;
    const next = createRoomCode(new Set([first]), () => {
      calls += 1;
      return calls <= 6 ? 0 : 0.5;
    });
    expect(next).not.toBe(first);
    expect(normalizeRoomCode(next.toLowerCase())).toBe(next);
  });

  it('rejects ambiguous and malformed codes', () => {
    expect(normalizeRoomCode('ABC10I')).toBeNull();
    expect(normalizeRoomCode('ABC')).toBeNull();
  });
});

describe('settings', () => {
  it.each([
    { rounds: 1, drawTime: 60 },
    { rounds: 3, drawTime: 80 },
    { rounds: 5, drawTime: 120 },
  ])('accepts valid settings $rounds/$drawTime', (settings) => {
    expect(validateSettings(settings)).toBe(true);
  });

  it.each([
    { rounds: 0, drawTime: 80 },
    { rounds: 6, drawTime: 80 },
    { rounds: 3, drawTime: 30 },
    { rounds: '3', drawTime: 80 },
  ])('rejects invalid settings', (settings) => {
    expect(validateSettings(settings)).toBe(false);
  });
});

describe('guess normalization', () => {
  it.each([
    ['Cat', 'cat'],
    ['  cat ', 'cat'],
    ['ice   cream', 'ice cream'],
    ['ＣＡＴ', 'cat'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeGuess(input)).toBe(expected);
  });
});

describe('scoring', () => {
  it('awards 500 at maximum time', () => expect(calculateGuessScore(80_000, 80_000)).toBe(500));
  it('awards 300 at half time', () => expect(calculateGuessScore(40_000, 80_000)).toBe(300));
  it('awards the 100 point floor near zero', () => expect(calculateGuessScore(1, 80_000)).toBe(100));
  it('clamps values outside the time range', () => {
    expect(calculateGuessScore(100_000, 80_000)).toBe(500);
    expect(calculateGuessScore(-1_000, 80_000)).toBe(100);
  });
});

describe('turn progression', () => {
  it('moves to the next player', () => {
    expect(getTurnTransition(1, 0, 3, 3)).toEqual({ kind: 'next-turn', round: 1, turnIndex: 1 });
  });
  it('moves to the next round', () => {
    expect(getTurnTransition(1, 2, 3, 3)).toEqual({ kind: 'next-round', round: 2, turnIndex: 0 });
  });
  it('completes after the final drawer in the final round', () => {
    expect(getTurnTransition(3, 2, 3, 3)).toEqual({ kind: 'complete', round: 3, turnIndex: 2 });
  });
});

describe('word selection', () => {
  it('contains a few hundred curated words', () => expect(WORD_BANK.length).toBeGreaterThanOrEqual(300));
  it('offers exactly three unique choices', () => {
    const choices = pickWordChoices(['apple', 'bridge', 'cat', 'dragon'], () => 0.25);
    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
  });
  it('masks letters while preserving phrase spacing', () => {
    expect(maskWord('ice cream')).toBe('_ _ _   _ _ _ _ _');
  });
});
