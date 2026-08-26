import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Move, Trash2 } from 'lucide-react';
import { AnnotationStroke, AnnotationTool, InkAnnotation, TextAnnotation } from '../types';

interface AnnotationCanvasProps {
  enabled: boolean;
  tool: AnnotationTool;
  color: string;
  strokes: AnnotationStroke[];
  onChange: (strokes: AnnotationStroke[]) => void;
}

export function AnnotationCanvas({ enabled, tool, color, strokes, onChange }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<InkAnnotation | null>(null);
  const strokesRef = useRef(strokes);
  const textAreaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const interaction = useRef<{
    kind: 'move' | 'resize';
    id: string;
    startX: number;
    startY: number;
    annotation: TextAnnotation;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

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
      if (stroke.tool === 'text') return;
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
    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      setCanvasSize({ width: rect.width, height: rect.height });
      redraw();
    });
    observer.observe(canvas);
    const rect = canvas.getBoundingClientRect();
    setCanvasSize({ width: rect.width, height: rect.height });
    return () => observer.disconnect();
  }, [redraw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!enabled) return;
    const point = pointFromEvent(event);
    if (tool === 'eraser') {
      const hit = [...strokes].reverse().find((stroke) => stroke.tool !== 'text' && stroke.points.some((item) => Math.hypot(item.x - point.x, item.y - point.y) < 0.035));
      if (hit) onChange(strokes.filter((stroke) => stroke.id !== hit.id));
      return;
    }
    if (tool === 'text') {
      const annotation: TextAnnotation = {
        id: crypto.randomUUID(),
        tool: 'text',
        color,
        x: Math.min(point.x, 0.66),
        y: Math.min(point.y, 0.88),
        width: 0.32,
        height: 0.1,
        fontSize: 0.018,
        text: '',
      };
      onChange([...strokes, annotation]);
      setEditingId(annotation.id);
      requestAnimationFrame(() => textAreaRefs.current.get(annotation.id)?.focus());
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
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

  const updateTextAnnotation = (id: string, changes: Partial<TextAnnotation>) => {
    onChange(strokesRef.current.map((annotation) => (
      annotation.id === id && annotation.tool === 'text' ? { ...annotation, ...changes } : annotation
    )));
  };

  const startTextInteraction = (event: React.PointerEvent<HTMLButtonElement>, annotation: TextAnnotation, kind: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    interaction.current = {
      kind,
      id: annotation.id,
      startX: event.clientX,
      startY: event.clientY,
      annotation,
    };
  };

  const moveTextInteraction = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = interaction.current;
    const root = rootRef.current;
    if (!active || !root || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const rect = root.getBoundingClientRect();
    const dx = (event.clientX - active.startX) / Math.max(1, rect.width);
    const dy = (event.clientY - active.startY) / Math.max(1, rect.height);
    if (active.kind === 'move') {
      updateTextAnnotation(active.id, {
        x: Math.max(0, Math.min(1 - active.annotation.width, active.annotation.x + dx)),
        y: Math.max(0, Math.min(1 - active.annotation.height, active.annotation.y + dy)),
      });
    } else {
      updateTextAnnotation(active.id, {
        width: Math.max(0.16, Math.min(1 - active.annotation.x, active.annotation.width + dx)),
        height: Math.max(0.06, Math.min(1 - active.annotation.y, active.annotation.height + dy)),
      });
    }
  };

  const finishTextInteraction = () => {
    interaction.current = null;
  };

  const cursorClass = tool === 'text' ? 'cursor-text' : 'cursor-crosshair';

  return (
    <div ref={rootRef} className={`absolute inset-0 z-20 ${enabled ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full ${enabled ? `pointer-events-auto ${cursorClass}` : 'pointer-events-none'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
      />
      {strokes.filter((annotation): annotation is TextAnnotation => annotation.tool === 'text').map((annotation) => {
        const isEditing = enabled && editingId === annotation.id;
        return (
          <div
            key={annotation.id}
            className={`absolute overflow-visible border bg-white/85 shadow-sm ${enabled ? 'pointer-events-auto border-dashed border-indigo-400' : 'pointer-events-none border-transparent'}`}
            style={{
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              width: `${annotation.width * 100}%`,
              height: `${annotation.height * 100}%`,
              minHeight: 34,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={() => setEditingId(annotation.id)}
          >
            <textarea
              ref={(node) => {
                if (node) textAreaRefs.current.set(annotation.id, node);
                else textAreaRefs.current.delete(annotation.id);
              }}
              value={annotation.text}
              readOnly={!enabled}
              placeholder={enabled ? 'Type here...' : ''}
              aria-label="PDF text annotation"
              className="h-full w-full resize-none overflow-hidden border-0 bg-transparent px-2 py-1.5 pr-14 leading-snug outline-none"
              style={{ color: annotation.color, fontSize: Math.max(12, annotation.fontSize * canvasSize.width) }}
              onFocus={() => setEditingId(annotation.id)}
              onChange={(event) => updateTextAnnotation(annotation.id, { text: event.target.value })}
              onBlur={() => {
                if (!annotation.text.trim()) {
                  onChange(strokesRef.current.filter((item) => item.id !== annotation.id));
                  setEditingId(null);
                }
              }}
            />
            {enabled && (isEditing || tool === 'text') && (
              <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-white/95 p-0.5 shadow-sm">
                <button
                  type="button"
                  className="cursor-move p-1 text-slate-500 hover:text-indigo-700"
                  title="Move text box"
                  onPointerDown={(event) => startTextInteraction(event, annotation, 'move')}
                  onPointerMove={moveTextInteraction}
                  onPointerUp={finishTextInteraction}
                  onPointerCancel={finishTextInteraction}
                ><Move size={13} /></button>
                <button
                  type="button"
                  className="cursor-se-resize p-1 text-slate-500 hover:text-indigo-700"
                  title="Resize text box"
                  onPointerDown={(event) => startTextInteraction(event, annotation, 'resize')}
                  onPointerMove={moveTextInteraction}
                  onPointerUp={finishTextInteraction}
                  onPointerCancel={finishTextInteraction}
                ><Maximize2 size={13} /></button>
                <button
                  type="button"
                  className="p-1 text-slate-500 hover:text-red-600"
                  title="Delete text box"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onChange(strokesRef.current.filter((item) => item.id !== annotation.id))}
                ><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
