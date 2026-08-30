// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ScheduledNote = {
  type: OscillatorType;
  starts: number[];
  stops: number[];
};

const scheduledNotes: ScheduledNote[] = [];
let contextCount = 0;

class FakeAudioParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeOscillator {
  type: OscillatorType = 'sine';
  frequency = new FakeAudioParam();
  private readonly note: ScheduledNote = { type: 'sine', starts: [], stops: [] };

  connect() {}

  start(at: number) {
    this.note.type = this.type;
    this.note.starts.push(at);
    scheduledNotes.push(this.note);
  }

  stop(at: number) {
    this.note.stops.push(at);
  }
}

class FakeGain {
  gain = new FakeAudioParam();
  connect() {}
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 2;
  destination = {};

  constructor() {
    contextCount += 1;
  }

  createOscillator() {
    return new FakeOscillator();
  }

  createGain() {
    return new FakeGain();
  }

  async resume() {
    this.state = 'running';
  }
}

describe('sound engine playback', () => {
  beforeEach(() => {
    vi.resetModules();
    scheduledNotes.length = 0;
    contextCount = 0;
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext as unknown as typeof AudioContext,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'AudioContext');
  });

  it('schedules the complete success chord through Web Audio', async () => {
    const { playSound, SOUND_CUE_DEFINITIONS } = await import('../../src/client/audio/sound-engine.js');
    expect(playSound('correct-guess')).toBe(true);
    expect(contextCount).toBe(1);
    expect(scheduledNotes).toHaveLength(SOUND_CUE_DEFINITIONS['correct-guess'].length);
    expect(scheduledNotes.every((note) => note.starts.length === 1 && note.stops.length === 1)).toBe(true);
    expect(scheduledNotes.map((note) => note.type)).toEqual(['sine', 'sine', 'sine']);
  });

  it('does not create an audio context while muted', async () => {
    const { playSound, setSoundEnabled } = await import('../../src/client/audio/sound-engine.js');
    setSoundEnabled(false);
    expect(playSound('failure')).toBe(false);
    expect(contextCount).toBe(0);
    setSoundEnabled(true);
    expect(playSound('failure')).toBe(true);
    expect(contextCount).toBe(1);
    expect(scheduledNotes).toHaveLength(2);
  });

  it('throttles repeated wrong-guess sounds', async () => {
    const { playSound } = await import('../../src/client/audio/sound-engine.js');
    expect(playSound('wrong-guess')).toBe(true);
    expect(playSound('wrong-guess')).toBe(false);
    expect(scheduledNotes).toHaveLength(2);
  });
});
