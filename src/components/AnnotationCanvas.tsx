import React, { useCallback, useEffect, useRef } from 'react';
import { AnnotationStroke } from '../types';

interface AnnotationCanvasProps {
  enabled: boolean;
  tool: 'pen' | 'highlight' | 'eraser';
  color: string;
  strokes: AnnotationStroke[];
  onChange: (strokes: AnnotationStroke[]) => void;
}

export function AnnotationCanvas({ enabled, tool, color, strokes, onChange }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<AnnotationStroke | null>(null);

  const redraw = useCallback((preview?: AnnotationStroke | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    [...strokes, ...(preview ? [preview] : [])].forEach((stroke) => {
      if (stroke.points.length === 0) return;
      context.beginPath();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = stroke.color;
      context.globalAlpha = stroke.tool === 'highlight' ? 0.32 : 1;
      context.lineWidth = Math.max(2, stroke.width * rect.width);
      stroke.points.forEach((point, index) => {
        const x = point.x * rect.width;
        const y = point.y * rect.height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      if (stroke.points.length === 1) context.lineTo(stroke.points[0].x * rect.width + 0.1, stroke.points[0].y * rect.height);
      context.stroke();
      context.globalAlpha = 1;
    });
  }, [strokes]);

  useEffect(() => {
    redraw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (tool === 'eraser') {
      const hit = [...strokes].reverse().find((stroke) => stroke.points.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 0.035));
      if (hit) onChange(strokes.filter((stroke) => stroke.id !== hit.id));
      return;
    }
    drawing.current = {
      id: crypto.randomUUID(),
      tool,
      color,
      width: tool === 'highlight' ? 0.025 : 0.004,
      points: [point],
    };
    redraw(drawing.current);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    drawing.current = { ...drawing.current, points: [...drawing.current.points, pointFromEvent(event)] };
    redraw(drawing.current);
  };

  const finishStroke = () => {
    if (!drawing.current) return;
    onChange([...strokes, drawing.current]);
    drawing.current = null;
  };

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 z-20 h-full w-full ${enabled ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishStroke}
      onPointerCancel={finishStroke}
    />
  );
}
