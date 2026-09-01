import { describe, expect, it } from 'vitest';
import { floodFill, parseHexColor } from '../../src/client/game/canvas-renderer.js';

if (typeof ImageData === 'undefined') {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    constructor(
      public readonly width: number,
      public readonly height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
  (globalThis as { ImageData?: unknown }).ImageData = TestImageData;
}

function canvasFromRows(rows: string[]): ImageData {
  const width = rows[0].length;
  const height = rows.length;
  const imageData = new ImageData(width, height);
  const { data } = imageData;
  rows.forEach((row, y) => {
    [...row].forEach((character, x) => {
      if (character === ' ') return;
      const index = (y * width + x) * 4;
      if (character === 'b') {
        data[index] = 0;
        data[index + 1] = 0;
        data[index + 2] = 0;
        data[index + 3] = 255;
      } else {
        throw new Error(`Unknown test character: ${character}`);
      }
    });
  });
  return imageData;
}

function describeCanvas(imageData: ImageData): string[] {
  const { width, height, data } = imageData;
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const [r, g, b, a] = [data[index], data[index + 1], data[index + 2], data[index + 3]];
      if (a === 0) row += ' ';
      else if (r === 0 && g === 0 && b === 0) row += 'b';
      else if (r === 255 && g === 0 && b === 0) row += 'r';
      else if (r === 0 && g === 0 && b === 255) row += 'u';
      else row += '?';
    }
    rows.push(row);
  }
  return rows;
}

describe('flood fill', () => {
  it('parses hex colors', () => {
    expect(parseHexColor('#3976cf')).toEqual({ r: 57, g: 118, b: 207 });
  });

  it('fills the region bounded by other colours', () => {
    const canvas = canvasFromRows([
      'bbbbbbb',
      'b  b  b',
      'b  b  b',
      'b  b  b',
      'bbbbbbb',
    ]);
    floodFill(canvas, 1, 1, { r: 255, g: 0, b: 0 });
    expect(describeCanvas(canvas)).toEqual([
      'bbbbbbb',
      'brrb  b',
      'brrb  b',
      'brrb  b',
      'bbbbbbb',
    ]);
  });

  it('fills a second fill inside the first fill', () => {
    const canvas = canvasFromRows([
      'bbbbbbb',
      'b  b  b',
      'b  b  b',
      'b  b  b',
      'bbbbbbb',
    ]);
    floodFill(canvas, 1, 1, { r: 255, g: 0, b: 0 });
    floodFill(canvas, 2, 1, { r: 0, g: 0, b: 255 });
    expect(describeCanvas(canvas)).toEqual([
      'bbbbbbb',
      'buub  b',
      'buub  b',
      'buub  b',
      'bbbbbbb',
    ]);
  });

  it('does nothing when the start pixel is already the fill colour', () => {
    const canvas = canvasFromRows([
      'bbbbb',
      'b   b',
      'bbbbb',
    ]);
    floodFill(canvas, 1, 1, { r: 255, g: 0, b: 0 });
    floodFill(canvas, 1, 1, { r: 255, g: 0, b: 0 });
    expect(describeCanvas(canvas)).toEqual([
      'bbbbb',
      'brrrb',
      'bbbbb',
    ]);
  });

  it('ignores out-of-bounds start points', () => {
    const canvas = canvasFromRows([
      'bbb',
      'b b',
      'bbb',
    ]);
    floodFill(canvas, -1, 0, { r: 255, g: 0, b: 0 });
    floodFill(canvas, 0, 99, { r: 255, g: 0, b: 0 });
    expect(describeCanvas(canvas)).toEqual([
      'bbb',
      'b b',
      'bbb',
    ]);
  });
});
