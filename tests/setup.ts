import '@testing-library/jest-dom/vitest';

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  value: TestResizeObserver,
});

const canvasContext = {
  save: () => undefined,
  restore: () => undefined,
  setTransform: () => undefined,
  clearRect: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  stroke: () => undefined,
  arc: () => undefined,
  fill: () => undefined,
  globalCompositeOperation: 'source-over',
  strokeStyle: '#000000',
  fillStyle: '#000000',
  lineWidth: 1,
  lineCap: 'round',
  lineJoin: 'round',
};

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => canvasContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
