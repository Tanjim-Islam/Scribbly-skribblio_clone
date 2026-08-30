import { useCallback, useEffect, useRef } from 'react';
import type { BrushWidth, DrawStroke, DrawingTool, NormalizedPoint } from '../../shared/types.js';
import type { ScribblySocket } from '../socket.js';
import { drawStroke } from '../game/canvas-renderer.js';

type DrawingCanvasProps = {
  socket: ScribblySocket;
  enabled: boolean;
  tool: DrawingTool;
  color: string;
  width: BrushWidth;
  resetKey: string;
};

export function DrawingCanvas({ socket, enabled, tool, color, width, resetKey }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const strokesRef = useRef(new Map<string, DrawStroke>());
  const strokeOrderRef = useRef<string[]>([]);
  const activeStrokeRef = useRef<string | null>(null);
  const pendingPointsRef = useRef<NormalizedPoint[]>([]);

  const canvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { width: 0, height: 0 };
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ratio = window.devicePixelRatio || 1;
    const { width: cssWidth, height: cssHeight } = canvasSize();
    const bitmapWidth = Math.max(1, Math.round(cssWidth * ratio));
    const bitmapHeight = Math.max(1, Math.round(cssHeight * ratio));
    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
      canvas.width = bitmapWidth;
      canvas.height = bitmapHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    for (const strokeId of strokeOrderRef.current) {
      const stroke = strokesRef.current.get(strokeId);
      if (stroke) drawStroke(context, stroke, cssWidth, cssHeight);
    }
  }, [canvasSize]);

  const drawLatest = useCallback(
    (stroke: DrawStroke, previousLength: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const ratio = window.devicePixelRatio || 1;
      const size = canvasSize();
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawStroke(context, stroke, size.width, size.height, Math.max(0, previousLength - 1));
    },
    [canvasSize],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    redraw();
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(() => {
    strokesRef.current.clear();
    strokeOrderRef.current = [];
    activeStrokeRef.current = null;
    pendingPointsRef.current = [];
    redraw();
  }, [redraw, resetKey]);

  useEffect(() => {
    const onBegin = (stroke: DrawStroke) => {
      strokesRef.current.set(stroke.strokeId, { ...stroke, points: [...stroke.points] });
      strokeOrderRef.current.push(stroke.strokeId);
      drawLatest(stroke, 0);
    };
    const onPoints = ({ strokeId, points }: { strokeId: string; points: NormalizedPoint[] }) => {
      const stroke = strokesRef.current.get(strokeId);
      if (!stroke) return;
      const previousLength = stroke.points.length;
      stroke.points.push(...points);
      drawLatest(stroke, previousLength);
    };
    const onUndo = ({ strokeId }: { strokeId: string | null }) => {
      if (!strokeId) return;
      strokesRef.current.delete(strokeId);
      strokeOrderRef.current = strokeOrderRef.current.filter((id) => id !== strokeId);
      redraw();
    };
    const onClear = () => {
      strokesRef.current.clear();
      strokeOrderRef.current = [];
      redraw();
    };
    socket.on('draw:begin', onBegin);
    socket.on('draw:points', onPoints);
    socket.on('canvas:undo', onUndo);
    socket.on('canvas:clear', onClear);
    return () => {
      socket.off('draw:begin', onBegin);
      socket.off('draw:points', onPoints);
      socket.off('canvas:undo', onUndo);
      socket.off('canvas:clear', onClear);
    };
  }, [drawLatest, redraw, socket]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): NormalizedPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  };

  const flushPoints = useCallback(() => {
    frameRef.current = null;
    const strokeId = activeStrokeRef.current;
    if (!strokeId || pendingPointsRef.current.length === 0) return;
    while (pendingPointsRef.current.length > 0) {
      socket.emit('draw:points', { strokeId, points: pendingPointsRef.current.splice(0, 64) });
    }
  }, [socket]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const strokeId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const point = pointFromEvent(event);
    const stroke: DrawStroke = { strokeId, tool, color, width, points: [point] };
    activeStrokeRef.current = strokeId;
    strokesRef.current.set(strokeId, stroke);
    strokeOrderRef.current.push(strokeId);
    drawLatest(stroke, 0);
    socket.emit('draw:begin', stroke);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const strokeId = activeStrokeRef.current;
    if (!enabled || !strokeId || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    const nativeEvent = event.nativeEvent;
    const events = typeof nativeEvent.getCoalescedEvents === 'function' ? nativeEvent.getCoalescedEvents() : [nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    const points = events.map((pointerEvent) => ({
      x: Math.max(0, Math.min(1, (pointerEvent.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (pointerEvent.clientY - rect.top) / rect.height)),
    }));
    const stroke = strokesRef.current.get(strokeId);
    if (!stroke) return;
    const previousLength = stroke.points.length;
    stroke.points.push(...points);
    pendingPointsRef.current.push(...points);
    drawLatest(stroke, previousLength);
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(flushPoints);
  };

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const strokeId = activeStrokeRef.current;
    if (!strokeId) return;
    event.preventDefault();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const stroke = strokesRef.current.get(strokeId);
    if (stroke) {
      const finalPoint = pointFromEvent(event);
      const lastPoint = stroke.points[stroke.points.length - 1];
      if (Math.abs(finalPoint.x - lastPoint.x) + Math.abs(finalPoint.y - lastPoint.y) > 0.0001) {
        const previousLength = stroke.points.length;
        stroke.points.push(finalPoint);
        pendingPointsRef.current.push(finalPoint);
        drawLatest(stroke, previousLength);
      }
    }
    flushPoints();
    socket.emit('draw:end', { strokeId });
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      className={`drawing-canvas ${enabled ? 'drawing-canvas--active' : ''}`}
      aria-label={enabled ? 'Drawing canvas, draw with pointer or touch' : 'Drawing canvas'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}
