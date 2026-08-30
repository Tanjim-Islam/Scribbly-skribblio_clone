import type { DrawStroke, NormalizedPoint } from '../../shared/types.js';

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
