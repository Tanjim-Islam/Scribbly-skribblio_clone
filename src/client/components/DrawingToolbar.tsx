import type { BrushWidth, DrawingTool } from '../../shared/types.js';
import { playSound } from '../audio/sound-engine.js';

const colors = [
  '#20211f', '#6b6f72', '#e24d3d', '#ed8528', '#f4c542', '#3e9b5f',
  '#3976cf', '#7256b7', '#d4578d', '#875335', '#27a5a5', '#ffffff',
];

type DrawingToolbarProps = {
  color: string;
  width: BrushWidth;
  tool: DrawingTool;
  onColor: (color: string) => void;
  onWidth: (width: BrushWidth) => void;
  onTool: (tool: DrawingTool) => void;
  onUndo: () => void;
  onClear: () => void;
};

export function DrawingToolbar({ color, width, tool, onColor, onWidth, onTool, onUndo, onClear }: DrawingToolbarProps) {
  return (
    <div className="drawing-toolbar" aria-label="Drawing tools">
      <div className="palette" role="group" aria-label="Colors">
        {colors.map((swatch) => (
          <button
            key={swatch}
            className={`color-swatch ${tool === 'brush' && color === swatch ? 'color-swatch--selected' : ''}`}
            style={{ backgroundColor: swatch }}
            type="button"
            aria-label={`${swatch} color`}
            aria-pressed={tool === 'brush' && color === swatch}
            onClick={() => { playSound('tap'); onColor(swatch); onTool('brush'); }}
          >
            {tool === 'brush' && color === swatch && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      <span className="toolbar-separator" />
      <div className="size-group" role="group" aria-label="Brush size">
        {([
          [0.004, 'Small'],
          [0.008, 'Medium'],
          [0.016, 'Large'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={`tool-button size-button ${width === value ? 'tool-button--selected' : ''}`}
            type="button"
            aria-label={`${label} brush`}
            aria-pressed={width === value}
            onClick={() => { playSound('tap'); onWidth(value); }}
          >
            <span className={`size-dot size-dot--${label.toLowerCase()}`} />
          </button>
        ))}
      </div>
      <button
        className={`tool-button eraser-button ${tool === 'eraser' ? 'tool-button--selected' : ''}`}
        type="button"
        aria-label="Eraser"
        aria-pressed={tool === 'eraser'}
        onClick={() => { playSound('tap'); onTool(tool === 'eraser' ? 'brush' : 'eraser'); }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 19-4-4 10-10a2.8 2.8 0 0 1 4 0l2 2a2.8 2.8 0 0 1 0 4l-8 8H7Zm0 0h13M9 9l6 6" /></svg>
      </button>
      <button className="tool-button" type="button" aria-label="Undo last stroke" onClick={() => { playSound('undo'); onUndo(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" /></svg>
      </button>
      <button className="tool-button clear-button" type="button" aria-label="Clear canvas" onClick={() => { playSound('clear'); onClear(); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" /></svg>
        <span>Clear</span>
      </button>
    </div>
  );
}
