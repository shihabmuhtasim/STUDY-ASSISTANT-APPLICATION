import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Edit2, FileText, GripVertical, Plus, Save, Settings2, Sparkles, Trash2, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { NoteBlock, PageNote } from '../types';
import { RichTextEditor, richTextToPlainText, toRichTextHtml } from './RichTextEditor';

interface NotesPanelProps {
  note: PageNote;
  title?: string;
  defaultHeading?: string;
  onDefaultHeadingChange?: (heading: string) => void;
  onChange: (content: string, blocks?: NoteBlock[]) => void;
  onClear: () => void;
  onSave: () => void;
}

export function NotesPanel({ note, title, defaultHeading = '', onDefaultHeadingChange, onChange, onClear, onSave }: NotesPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [adding, setAdding] = useState(() => !(note.blocks?.length || note.content?.trim()));
  const [newTitle, setNewTitle] = useState(defaultHeading);
  const [newContent, setNewContent] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [headingSettingsOpen, setHeadingSettingsOpen] = useState(false);
  const [headingDraft, setHeadingDraft] = useState(defaultHeading);

  const blocks: NoteBlock[] = note.blocks?.length
    ? note.blocks
    : note.content?.trim()
      ? [{ id: 'legacy-1', content: note.content, createdAt: Date.now(), isAiGenerated: false }]
      : [];

  useEffect(() => setHeadingDraft(defaultHeading), [defaultHeading]);

  const saveBlocks = (updated: NoteBlock[]) => {
    const plainText = updated.map((block) => `${block.question ? `${block.question}\n` : ''}${richTextToPlainText(toRichTextHtml(block.content))}`).join('\n\n');
    onChange(plainText, updated);
  };

  const move = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= blocks.length) return;
    const updated = [...blocks];
    const [item] = updated.splice(index, 1);
    updated.splice(destination, 0, item);
    saveBlocks(updated);
  };

  const moveBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const updated = [...blocks];
    const from = updated.findIndex((block) => block.id === draggedId);
    const to = updated.findIndex((block) => block.id === targetId);
    if (from < 0 || to < 0) return;
    const [item] = updated.splice(from, 1);
    updated.splice(to, 0, item);
    saveBlocks(updated);
    setDraggedId(null);
  };

  const startEdit = (block: NoteBlock) => {
    setEditingId(block.id);
    setEditTitle(block.question || '');
    setEditContent(toRichTextHtml(block.content));
  };

  const saveEdit = (id: string) => {
    if (!richTextToPlainText(editContent).trim()) return;
    saveBlocks(blocks.map((block) => block.id === id ? { ...block, question: editTitle.trim() || undefined, content: editContent } : block));
    setEditingId(null);
  };

  const addBlock = () => {
    if (!richTextToPlainText(newContent).trim()) return;
    saveBlocks([...blocks, {
      id: uuidv4(),
      question: newTitle.trim() || undefined,
      content: newContent,
      createdAt: Date.now(),
      isAiGenerated: false,
    }]);
    setNewTitle(defaultHeading);
    setNewContent('');
    setAdding(false);
  };

  return (
    <div className="notes-panel flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText size={18} className="shrink-0 text-emerald-600" />
          <h3 className="truncate text-sm font-semibold text-slate-800">{title || `Notes for Page ${note.pageNumber}`}</h3>
          <span className="text-xs text-slate-400">{blocks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setHeadingSettingsOpen((value) => !value)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600" title="Set a default heading for new note cards" aria-expanded={headingSettingsOpen}><Settings2 size={16} /></button>
          <button type="button" onClick={onClear} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title={`Clear ${title ? 'whole-document' : 'page'} notes`}><Trash2 size={16} /></button>
          <button type="button" onClick={onSave} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"><Save size={14} /> Save</button>
        </div>
      </div>

      {headingSettingsOpen && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <input value={headingDraft} onChange={(event) => setHeadingDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { onDefaultHeadingChange?.(headingDraft.trim()); setNewTitle(headingDraft.trim()); setHeadingSettingsOpen(false); } }} placeholder="Default heading for this document (optional)" className="min-w-52 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500" />
          <button type="button" onClick={() => { onDefaultHeadingChange?.(headingDraft.trim()); setNewTitle(headingDraft.trim()); setHeadingSettingsOpen(false); }} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">Apply</button>
        </div>
      )}

      <div className="custom-scrollbar flex-1 overflow-y-auto bg-slate-50/60 p-3 lg:p-4">
        <div className="space-y-3">
          {blocks.map((block, index) => (
            <article
              key={block.id}
              draggable={editingId !== block.id}
              onDragStart={() => setDraggedId(block.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveBefore(block.id)}
              className={`rounded-lg border bg-white p-3 shadow-xs transition-colors ${draggedId === block.id ? 'border-emerald-400 opacity-60' : 'border-slate-200 hover:border-slate-300'}`}
            >
              {editingId === block.id ? (
                <div className="space-y-3">
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} placeholder="Title (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
                  <RichTextEditor value={editContent} onChange={setEditContent} minHeight={120} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">Cancel</button>
                    <button type="button" onClick={() => saveEdit(block.id)} className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"><Check size={14} /> Save card</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase text-slate-500">
                      <GripVertical size={15} className="cursor-grab text-slate-400" />
                      {block.isAiGenerated ? <><Sparkles size={13} className="text-indigo-500" /> AI note</> : <><FileText size={13} className="text-emerald-500" /> Note</>}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20" title="Move up"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20" title="Move down"><ArrowDown size={14} /></button>
                      <button type="button" onClick={() => startEdit(block)} className="p-1 text-slate-400 hover:text-emerald-600" title="Edit card"><Edit2 size={14} /></button>
                      <button type="button" onClick={() => saveBlocks(blocks.filter((item) => item.id !== block.id))} className="p-1 text-slate-400 hover:text-red-600" title="Delete card"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {block.question && <h4 className="mb-2 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-900">{block.question}</h4>}
                  <div className="rich-note-content text-sm leading-relaxed text-slate-800" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(toRichTextHtml(block.content)) }} />
                </>
              )}
            </article>
          ))}

          {adding ? (
            <div className="note-editor-surface space-y-3 rounded-lg border border-emerald-200 bg-white p-3 shadow-xs">
              <div className="flex items-center justify-between"><h4 className="text-sm font-semibold text-slate-800">New note card</h4><button type="button" onClick={() => setAdding(false)} className="p-1 text-slate-400" aria-label="Cancel new note"><X size={16} /></button></div>
              <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Title (optional)" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-emerald-500" />
              <RichTextEditor value={newContent} onChange={setNewContent} />
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className="rounded px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">Cancel</button><button type="button" onClick={addBlock} className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"><Plus size={14} /> Add card</button></div>
            </div>
          ) : (
            <button type="button" onClick={() => { setNewTitle(defaultHeading); setAdding(true); }} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white/70 py-4 text-sm font-medium text-emerald-700 hover:border-emerald-400 hover:bg-white"><Plus size={16} /> Add note card</button>
          )}
        </div>
      </div>
    </div>
  );
}
