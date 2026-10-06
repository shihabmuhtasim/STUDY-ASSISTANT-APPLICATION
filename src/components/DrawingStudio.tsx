import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Eraser, Minus, Square, Circle, Type, Undo2, Redo2, Trash2, ImagePlus, Check, X, PaintBucket, Move, Maximize2 } from 'lucide-react';
import type { NoteBlock, DrawingTextBox } from '../types';

type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'ellipse' | 'text' | 'fill';
export function DrawingStudio({ initial, onSave, onClose }: {
  initial?: NoteBlock['drawing']; onSave: (drawing: NonNullable<NoteBlock['drawing']>) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number; snapshot: ImageData } | null>(null);
  const history = useRef<Array<{ image: ImageData; boxes: DrawingTextBox[] }>>([]);
  const cursor = useRef(-1);
  const [revision, setRevision] = useState(0);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#111111');
  const [width, setWidth] = useState(4);
  const [boxes, setBoxes] = useState<DrawingTextBox[]>(initial?.textBoxes || []);
  const boxesRef = useRef(boxes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState(28);
  const [displayScale, setDisplayScale] = useState(1);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ box: DrawingTextBox; x: number; y: number; resize: boolean } | null>(null);
  const changeBoxes = (next: DrawingTextBox[]) => { boxesRef.current = next; setBoxes(next); };
  const updateBox = (id: string, changes: Partial<DrawingTextBox>) => changeBoxes(boxesRef.current.map(box => box.id === id ? { ...box, ...changes } : box));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const commit = () => {
    const c = canvas.current!;
    history.current = history.current.slice(0, cursor.current + 1);
    history.current.push({ image: c.getContext('2d')!.getImageData(0, 0, c.width, c.height), boxes: structuredClone(boxesRef.current) });
    if (history.current.length > 20) history.current.shift();
    cursor.current = history.current.length - 1;
    setRevision(v => v + 1);
  };
  useEffect(() => {
    dialog.current?.showModal();
    const c = canvas.current!, ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    if (initial) {
      const img = new Image();
      img.onload = () => { ctx.drawImage(img, 0, 0, c.width, c.height); commit(); setReady(true); };
      img.onerror = () => { setError('Could not open the drawing.'); };
      img.src = initial.baseDataUrl || initial.dataUrl;
    } else { commit(); setReady(true); }
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(() => setDisplayScale(canvas.current!.getBoundingClientRect().width / 1200));
    observer.observe(canvas.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!displayScale) return;
    let changed = false;
    const fitted = boxes.map(box => {
      const input = surface.current?.querySelector<HTMLTextAreaElement>(`[data-box-id="${box.id}"]`);
      if (!input || input.scrollHeight <= input.clientHeight + 1) return box;
      const height = Math.min(800, Math.ceil(input.scrollHeight / displayScale) + 4);
      if (height <= box.height) return box;
      changed = true;
      return { ...box, height, y: Math.min(box.y, 800 - height) };
    });
    if (changed) changeBoxes(fitted);
  }, [boxes, displayScale]);
  const saveDrawing = () => {
    const base = canvas.current!;
    const result = document.createElement('canvas'); result.width = base.width; result.height = base.height;
    const ctx = result.getContext('2d')!; ctx.drawImage(base, 0, 0);
    for (const box of boxesRef.current) {
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
      ctx.font = `${box.fontSize}px Arial`; ctx.textBaseline = 'top'; ctx.fillStyle = box.color;
      let y = box.y;
      for (const paragraph of box.text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/(?<=\s)/)) {
          if (line && ctx.measureText(line + word).width > box.width) { ctx.fillText(line, box.x, y); y += box.fontSize * 1.25; line = ''; }
          for (const character of word) {
            if (line && ctx.measureText(line + character).width > box.width) { ctx.fillText(line, box.x, y); y += box.fontSize * 1.25; line = ''; }
            line += character;
          }
        }
        ctx.fillText(line, box.x, y); y += box.fontSize * 1.25;
      }
      ctx.restore();
    }
    onSave({ dataUrl: result.toDataURL('image/png'), baseDataUrl: base.toDataURL('image/png'), textBoxes: boxesRef.current, width: base.width, height: base.height, size: initial?.size || 100 });
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const c = event.currentTarget, rect = c.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * c.width / rect.width, y: (event.clientY - rect.top) * c.height / rect.height };
  };
  const fill = (x: number, y: number) => {
    const c = canvas.current!, ctx = c.getContext('2d')!, image = ctx.getImageData(0, 0, c.width, c.height);
    const data = image.data, seed = Math.floor(y) * c.width + Math.floor(x);
    const target = [...data.slice(seed * 4, seed * 4 + 4)];
    const replacement = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16), 255];
    if (target.every((v, i) => v === replacement[i])) return;
    const stack = [seed];
    while (stack.length) {
      const n = stack.pop()!, offset = n * 4;
      if (!target.every((v, i) => data[offset + i] === v)) continue;
      data.set(replacement, offset);
      if (n % c.width > 0) stack.push(n - 1);
      if (n % c.width < c.width - 1) stack.push(n + 1);
      if (n >= c.width) stack.push(n - c.width);
      if (n < c.width * (c.height - 1)) stack.push(n + c.width);
    }
    ctx.putImageData(image, 0, 0); commit();
  };
  const down = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || event.button !== 0) return;
    const c = event.currentTarget, ctx = c.getContext('2d')!, p = point(event);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (tool === 'text') {
      const id = crypto.randomUUID();
      changeBoxes([...boxesRef.current, { id, x: Math.min(p.x, 880), y: Math.min(p.y, 660), width: 300, height: 120, text: '', fontSize, color }]);
      setSelectedId(id); commit();
      requestAnimationFrame(() => surface.current?.querySelector<HTMLTextAreaElement>(`[data-box-id="${id}"]`)?.focus());
      return;
    }
    setSelectedId(null);
    if (tool === 'fill') { fill(p.x, p.y); return; }
    c.setPointerCapture(event.pointerId);
    start.current = { ...p, snapshot: ctx.getImageData(0, 0, c.width, c.height) };
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    if (tool === 'pen' || tool === 'eraser') { ctx.lineTo(p.x + 0.1, p.y); ctx.stroke(); }
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const origin = start.current; if (!origin) return;
    const ctx = event.currentTarget.getContext('2d')!, p = point(event);
    if (tool === 'pen' || tool === 'eraser') { ctx.lineTo(p.x, p.y); ctx.stroke(); return; }
    ctx.putImageData(origin.snapshot, 0, 0); ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(origin.x, origin.y); ctx.lineTo(p.x, p.y); }
    if (tool === 'rectangle') ctx.rect(origin.x, origin.y, p.x - origin.x, p.y - origin.y);
    if (tool === 'ellipse') ctx.ellipse((origin.x + p.x) / 2, (origin.y + p.y) / 2, Math.abs(p.x - origin.x) / 2, Math.abs(p.y - origin.y) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  const end = () => { if (start.current) { start.current = null; commit(); } };
  const undo = (delta: number) => { const next = cursor.current + delta; if (next < 0 || next >= history.current.length) return; cursor.current = next; canvas.current!.getContext('2d')!.putImageData(history.current[next].image, 0, 0); changeBoxes(structuredClone(history.current[next].boxes)); setSelectedId(null); setRevision(v => v + 1); };
  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, box: DrawingTextBox, resize = false) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(box.id); drag.current = { box, x: event.clientX, y: event.clientY, resize };
  };
  const moveBox = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = drag.current; if (!active) return;
    const dx = (event.clientX - active.x) / displayScale, dy = (event.clientY - active.y) / displayScale;
    const b = active.box;
    updateBox(b.id, active.resize ? { width: Math.max(80, Math.min(1200 - b.x, b.width + dx)), height: Math.max(40, Math.min(800 - b.y, b.height + dy)) } : { x: Math.max(0, Math.min(1200 - b.width, b.x + dx)), y: Math.max(0, Math.min(800 - b.height, b.y + dy)) });
  };
  const endDrag = () => { if (drag.current) { drag.current = null; commit(); } };
  const tools = [['pen', Pencil, 'Pen'], ['eraser', Eraser, 'Eraser'], ['line', Minus, 'Line'], ['rectangle', Square, 'Rectangle'], ['ellipse', Circle, 'Ellipse'], ['text', Type, 'Text'], ['fill', PaintBucket, 'Fill']] as const;
  const button = 'grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 disabled:opacity-30';
  return <dialog ref={dialog} onCancel={e => { e.preventDefault(); onClose(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-white p-0 text-slate-800" aria-label="Drawing studio">
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3"><h2 className="mr-auto font-semibold">Drawing</h2><button disabled={!ready} onClick={saveDrawing} className="flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-white disabled:opacity-30"><Check size={17} />Add to notes</button><button onClick={onClose} className={button} title="Close drawing" aria-label="Close drawing"><X size={18} /></button></header>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-2" role="toolbar" aria-label="Drawing tools">
        {tools.map(([value, Icon, label]) => <button key={value} disabled={!ready} title={label} aria-label={label} aria-pressed={tool === value} onClick={() => setTool(value)} className={`${button} ${tool === value ? 'bg-indigo-100 text-indigo-700' : ''}`}><Icon size={19} /></button>)}
        <input type="color" value={boxes.find(box => box.id === selectedId)?.color || color} onChange={e => { setColor(e.target.value); if (selectedId) { updateBox(selectedId, { color: e.target.value }); commit(); } }} aria-label="Drawing color" className="h-10 w-10" />
        <label className="flex items-center gap-2 text-sm">Size<input type="range" min="1" max="40" value={width} onChange={e => setWidth(+e.target.value)} aria-label="Brush size" /></label>
        <button className={button} disabled={cursor.current <= 0} onClick={() => undo(-1)} title="Undo" aria-label="Undo"><Undo2 size={18} /></button><button className={button} disabled={cursor.current >= history.current.length - 1} onClick={() => undo(1)} title="Redo" aria-label="Redo"><Redo2 size={18} /></button>
        <button className={button} disabled={!ready} onClick={() => { if (!window.confirm('Clear this drawing? You can undo this.')) return; const c = canvas.current!, ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); changeBoxes([]); setSelectedId(null); commit(); }} title="Clear canvas" aria-label="Clear canvas"><Trash2 size={18} /></button>
        <label className={`${button} cursor-pointer`} title="Add image"><ImagePlus size={18} /><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Add image to drawing" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; try { const image = await createImageBitmap(file), c = canvas.current!; const scale = Math.min(c.width / image.width, c.height / image.height, 1); c.getContext('2d')!.drawImage(image, (c.width - image.width * scale) / 2, (c.height - image.height * scale) / 2, image.width * scale, image.height * scale); image.close(); commit(); } catch { setError('Could not open this image. Use PNG, JPEG, or WebP.'); } }} /></label>
        {(tool === 'text' || selectedId) && <label className="flex items-center gap-2 text-sm">Font size<input type="number" min="8" max="144" value={boxes.find(box => box.id === selectedId)?.fontSize ?? fontSize} aria-label="Text font size" className="w-20 rounded-md border border-slate-200 p-2" onChange={e => { const size = Math.max(8, Math.min(144, Number(e.target.value) || 8)); setFontSize(size); if (selectedId) { updateBox(selectedId, { fontSize: size }); commit(); } }} /></label>}
      </div>
      {error && <p role="alert" className="p-2 text-red-700">{error}</p>}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 p-4" style={{ containerType: 'size' }}>
        <div ref={surface} className="relative max-h-full max-w-full" style={{ aspectRatio: '3 / 2', width: 'min(100cqw, 150cqh)' }}>
          <canvas ref={canvas} width={1200} height={800} onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="block h-full w-full touch-none border border-slate-300 bg-white" style={{ cursor: tool === 'text' ? 'text' : 'crosshair' }} data-revision={revision} />
          {boxes.map(box => <div key={box.id} className={`absolute border ${box.id === selectedId ? 'border-indigo-500' : 'border-dashed border-slate-300'}`} style={{ left: `${box.x / 12}%`, top: `${box.y / 8}%`, width: `${box.width / 12}%`, height: `${box.height / 8}%` }}>
            <textarea data-box-id={box.id} aria-label="Drawing text box" value={box.text} placeholder="Type here..." className="block h-full w-full resize-none border-0 bg-transparent p-0 outline-none" style={{ color: box.color, font: `${box.fontSize * displayScale}px/1.25 Arial`, overflowWrap: 'break-word' }} onFocus={() => setSelectedId(box.id)} onChange={e => updateBox(box.id, { text: e.target.value })} onBlur={() => commit()} />
            <div className="absolute -top-8 right-0 flex h-8 rounded bg-white text-slate-600 shadow">
              <button title="Move text box" aria-label="Move drawing text box" className="touch-none cursor-move p-1.5" onPointerDown={e => beginDrag(e, box)} onPointerMove={moveBox} onPointerUp={endDrag} onPointerCancel={endDrag}><Move size={16} /></button>
              <button title="Resize text box" aria-label="Resize drawing text box" className="touch-none cursor-se-resize p-1.5" onPointerDown={e => beginDrag(e, box, true)} onPointerMove={moveBox} onPointerUp={endDrag} onPointerCancel={endDrag}><Maximize2 size={16} /></button>
              <button title="Delete text box" aria-label="Delete drawing text box" className="p-1.5 hover:text-red-600" onClick={() => { changeBoxes(boxesRef.current.filter(item => item.id !== box.id)); setSelectedId(null); commit(); }}><Trash2 size={16} /></button>
            </div>
          </div>)}
        </div>
      </div>
    </div>
  </dialog>;
}
