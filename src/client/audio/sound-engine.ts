export type SoundCue =
  | 'tap'
  | 'room-ready'
  | 'player-joined'
  | 'player-left'
  | 'game-start'
  | 'turn-start'
  | 'your-turn'
  | 'word-selected'
  | 'wrong-guess'
  | 'correct-guess'
  | 'someone-guessed'
  | 'turn-ended'
  | 'game-ended'
  | 'low-time'
  | 'hint'
  | 'undo'
  | 'clear'
  | 'leave'
  | 'failure'
  | 'toggle-on'
  | 'toggle-off';

export type SoundTone = Readonly<{
  frequency: number;
  offsetMs: number;
  durationMs: number;
  gain: number;
  wave: OscillatorType;
}>;

const tone = (
  frequency: number,
  offsetMs: number,
  durationMs: number,
  gain: number,
  wave: OscillatorType = 'sine',
): SoundTone => ({ frequency, offsetMs, durationMs, gain, wave });

export const SOUND_CUE_DEFINITIONS: Readonly<Record<SoundCue, readonly SoundTone[]>> = {
  tap: [tone(523.25, 0, 80, 0.012)],
  'room-ready': [tone(392, 0, 120, 0.02), tone(523.25, 80, 180, 0.022)],
  'player-joined': [tone(392, 0, 100, 0.014), tone(523.25, 65, 140, 0.017)],
  'player-left': [tone(329.63, 0, 100, 0.013), tone(261.63, 65, 160, 0.015)],
  'game-start': [tone(261.63, 0, 130, 0.022), tone(392, 90, 150, 0.023), tone(523.25, 185, 230, 0.025)],
  'turn-start': [tone(392, 0, 100, 0.014), tone(493.88, 70, 150, 0.017)],
  'your-turn': [tone(523.25, 0, 110, 0.019), tone(659.25, 75, 180, 0.021)],
  'word-selected': [tone(392, 0, 100, 0.014, 'triangle'), tone(493.88, 55, 140, 0.016, 'triangle')],
  'wrong-guess': [tone(293.66, 0, 100, 0.012, 'triangle'), tone(261.63, 70, 170, 0.014, 'triangle')],
  'correct-guess': [tone(523.25, 0, 130, 0.02), tone(659.25, 75, 150, 0.022), tone(783.99, 155, 230, 0.023)],
  'someone-guessed': [tone(659.25, 0, 100, 0.014), tone(783.99, 70, 150, 0.016)],
  'turn-ended': [tone(523.25, 260, 140, 0.016), tone(392, 340, 210, 0.018)],
  'game-ended': [tone(261.63, 0, 140, 0.021), tone(329.63, 90, 160, 0.022), tone(392, 180, 180, 0.023), tone(523.25, 285, 280, 0.025)],
  'low-time': [tone(440, 0, 150, 0.012, 'triangle')],
  hint: [tone(659.25, 0, 110, 0.014), tone(783.99, 65, 180, 0.017)],
  undo: [tone(440, 0, 90, 0.012, 'triangle'), tone(349.23, 55, 130, 0.014, 'triangle')],
  clear: [tone(349.23, 0, 90, 0.012, 'triangle'), tone(261.63, 55, 160, 0.014, 'triangle')],
  leave: [tone(392, 0, 100, 0.014), tone(293.66, 70, 180, 0.016)],
  failure: [tone(311.13, 0, 110, 0.014, 'triangle'), tone(261.63, 75, 190, 0.016, 'triangle')],
  'toggle-on': [tone(440, 0, 90, 0.013), tone(587.33, 65, 150, 0.016)],
  'toggle-off': [tone(440, 0, 90, 0.013), tone(329.63, 65, 150, 0.015)],
};

const CUE_COOLDOWNS: Partial<Record<SoundCue, number>> = {
  tap: 90,
  'wrong-guess': 350,
  'someone-guessed': 180,
  failure: 300,
};

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let enabled = true;
const lastPlayedAt = new Map<SoundCue, number>();

function getAudioContext(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  const audioWindow = window as AudioWindow;
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    audioContext = new AudioContextConstructor();
  } catch {
    return null;
  }
  return audioContext;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled;
}

export async function unlockSound(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  return context.state === 'running';
}

export function playSound(cue: SoundCue): boolean {
  const context = getAudioContext();
  if (!context) return false;

  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  const cooldown = CUE_COOLDOWNS[cue] ?? 0;
  const previous = lastPlayedAt.get(cue) ?? Number.NEGATIVE_INFINITY;
  if (now - previous < cooldown) return false;
  lastPlayedAt.set(cue, now);

  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  const cueStart = context.currentTime + 0.008;

  for (const note of SOUND_CUE_DEFINITIONS[cue]) {
    const oscillator = context.createOscillator();
    const noteGain = context.createGain();
    const start = cueStart + note.offsetMs / 1_000;
    const end = start + note.durationMs / 1_000;
    const attackEnd = Math.min(end - 0.01, start + 0.014);

    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    noteGain.gain.setValueAtTime(0.0001, start);
    noteGain.gain.exponentialRampToValueAtTime(note.gain, attackEnd);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(noteGain);
    noteGain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
  return true;
}
