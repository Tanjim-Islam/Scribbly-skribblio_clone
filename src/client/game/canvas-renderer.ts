import type { DrawStroke, NormalizedPoint } from '../../shared/types.js';

export type FillColor = {
  r: number;
  g: number;
  b: number;
};

export const FILL_TOLERANCE = 32;

export function parseHexColor(hex: string): FillColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function floodFill(
  imageData: ImageData,
  startX: number,
  startY: number,
  color: FillColor,
  tolerance = FILL_TOLERANCE,
): void {
  const { width, height, data } = imageData;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;
  const startIndex = (startY * width + startX) * 4;
  const source = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
  if (
    Math.abs(source[0] - color.r) <= tolerance &&
    Math.abs(source[1] - color.g) <= tolerance &&
    Math.abs(source[2] - color.b) <= tolerance &&
    Math.abs(source[3] - 255) <= tolerance
  ) {
    return;
  }
  const matchesSource = (index: number): boolean =>
    Math.abs(data[index] - source[0]) <= tolerance &&
    Math.abs(data[index + 1] - source[1]) <= tolerance &&
    Math.abs(data[index + 2] - source[2]) <= tolerance &&
    Math.abs(data[index + 3] - source[3]) <= tolerance;
  const stack: number[] = [startIndex];
  while (stack.length > 0) {
    const index = stack.pop()!;
    if (!matchesSource(index)) continue;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = 255;
    const x = (index >> 2) % width;
    if (x > 0) stack.push(index - 4);
    if (x < width - 1) stack.push(index + 4);
    if (index >= width * 4) stack.push(index - width * 4);
    if (index < (height - 1) * width * 4) stack.push(index + width * 4);
  }
}

export function applyFill(context: CanvasRenderingContext2D, point: NormalizedPoint, color: string): void {
  const { width, height } = context.canvas;
  const startX = Math.min(width - 1, Math.max(0, Math.floor(point.x * width)));
  const startY = Math.min(height - 1, Math.max(0, Math.floor(point.y * height)));
  const imageData = context.getImageData(0, 0, width, height);
  floodFill(imageData, startX, startY, parseHexColor(color));
  context.putImageData(imageData, 0, 0);
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawStroke,
  width: number,
  height: number,
  fromPointIndex = 0,
): void {
  if (stroke.points.length === 0) return;
  context.save();
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = Math.max(1, stroke.width * Math.min(width, height));
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const startIndex = Math.max(0, Math.min(fromPointIndex, stroke.points.length - 1));
  const first = stroke.points[startIndex];
  if (stroke.points.length === 1) {
    drawDot(context, first, width, height);
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(first.x * width, first.y * height);
  for (let index = startIndex + 1; index < stroke.points.length; index += 1) {
    const point = stroke.points[index];
    context.lineTo(point.x * width, point.y * height);
  }
  context.stroke();
  context.restore();
}

function drawDot(
  context: CanvasRenderingContext2D,
  point: NormalizedPoint,
  width: number,
  height: number,
): void {
  context.beginPath();
  context.arc(point.x * width, point.y * height, context.lineWidth / 2, 0, Math.PI * 2);
  context.fill();
}
