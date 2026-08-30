import { useState } from 'react';
import { isSoundEnabled, playSound, setSoundEnabled, unlockSound } from '../audio/sound-engine.js';

type SoundToggleProps = {
  className?: string;
};

export function SoundToggle({ className = '' }: SoundToggleProps) {
  const [enabled, setEnabled] = useState(isSoundEnabled);

  const toggle = () => {
    if (enabled) {
      playSound('toggle-off');
      setSoundEnabled(false);
      setEnabled(false);
      return;
    }

    setSoundEnabled(true);
    setEnabled(true);
    void unlockSound().then(() => playSound('toggle-on'));
  };

  return (
    <button
      className={`sound-toggle ${className}`.trim()}
      type="button"
      aria-label={enabled ? 'Mute sounds' : 'Turn sounds on'}
      aria-pressed={enabled}
      onClick={toggle}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 9v6h4l5 4V5L9 9H5Z" />
        {enabled ? <path d="M17 9a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12" /> : <path d="m17 9 5 5m0-5-5 5" />}
      </svg>
    </button>
  );
}
