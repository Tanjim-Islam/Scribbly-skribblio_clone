import { describe, expect, it } from 'vitest';
import { SOUND_CUE_DEFINITIONS, type SoundCue } from '../../src/client/audio/sound-engine.js';

const expectedCues: SoundCue[] = [
  'tap',
  'room-ready',
  'player-joined',
  'player-left',
  'game-start',
  'turn-start',
  'your-turn',
  'word-selected',
  'wrong-guess',
  'correct-guess',
  'someone-guessed',
  'turn-ended',
  'game-ended',
  'low-time',
  'undo',
  'clear',
  'leave',
  'failure',
  'toggle-on',
  'toggle-off',
];

describe('sound cues', () => {
  it('covers meaningful room and gameplay moments', () => {
    expect(Object.keys(SOUND_CUE_DEFINITIONS).sort()).toEqual([...expectedCues].sort());
  });

  it('keeps every cue short, quiet, and within a comfortable pitch range', () => {
    for (const notes of Object.values(SOUND_CUE_DEFINITIONS)) {
      expect(notes.length).toBeGreaterThan(0);
      const cueDuration = Math.max(...notes.map((note) => note.offsetMs + note.durationMs));
      expect(cueDuration).toBeLessThanOrEqual(600);
      for (const note of notes) {
        expect(note.gain).toBeGreaterThan(0);
        expect(note.gain).toBeLessThanOrEqual(0.025);
        expect(note.frequency).toBeGreaterThanOrEqual(250);
        expect(note.frequency).toBeLessThanOrEqual(800);
        expect(note.durationMs).toBeGreaterThanOrEqual(70);
        expect(note.durationMs).toBeLessThanOrEqual(300);
      }
    }
  });
});
