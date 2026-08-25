import React, { useState } from 'react';
import { Save, FileText, Trash2, Plus, Edit2, Check, Sparkles, LayoutList, Code, HelpCircle, ArrowUp, ArrowDown, Bold, Italic, Heading, List, ListOrdered, Quote, Code2 } from 'lucide-react';
import { PageNote, NoteBlock } from '../types';
import Markdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';

interface NotesPanelProps {
  note: PageNote;
  onChange: (content: string, blocks?: NoteBlock[]) => void;
  onClear: () => void;
  onSave: () => void;
}

export function NotesPanel({ note, onChange, onClear, onSave }: NotesPanelProps) {
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newContent, setNewContent] = useState('');

  // Extract or convert blocks
  const blocks: NoteBlock[] = note.blocks && note.blocks.length > 0 
    ? note.blocks 
    : note.content?.trim() 
      ? [{ id: 'legacy-1', content: note.content, createdAt: Date.now(), isAiGenerated: false }]
      : [];

  const updateBlocksAndContent = (updatedBlocks: NoteBlock[]) => {
    // Generate combined markdown content string for backward compatibility & raw view
    const combinedContent = updatedBlocks
      .map(b => (b.question ? `### Q: ${b.question}\n${b.content}` : b.content))
      .join('\n\n---\n\n');

    onChange(combinedContent, updatedBlocks);
  };

  const applyFormatting = (
    textareaId: string,
    prefix: string,
    suffix: string = '',
    content: string,
    setContent: (val: string) => void
  ) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement;
    if (!textarea) {
      setContent(content + prefix + suffix);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || 'text';
    const replacement = `${prefix}${selectedText}${suffix}`;
    const nextVal = content.substring(0, start) + replacement + content.substring(end);
    setContent(nextVal);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
    }, 0);
  };

  const handleStartEditBlock = (block: NoteBlock) => {
    setEditingBlockId(block.id);
    setEditQuestion(block.question || '');
    setEditContent(block.content);
  };

  const handleSaveBlockEdit = (id: string) => {
    const updated = blocks.map(b => {
      if (b.id === id) {
        return {
          ...b,
          question: editQuestion.trim() || undefined,
          content: editContent,
        };
      }
      return b;
    });
    updateBlocksAndContent(updated);
    setEditingBlockId(null);
  };

  const handleDeleteBlock = (id: string) => {
    const updated = blocks.filter(b => b.id !== id);
    updateBlocksAndContent(updated);
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(index, 1);
    newBlocks.splice(targetIndex, 0, moved);
    updateBlocksAndContent(newBlocks);
  };

  const handleAddNewBlock = () => {
    if (!newContent.trim()) return;
    const block: NoteBlock = {
      id: uuidv4(),
      question: newQuestion.trim() || undefined,
      content: newContent,
      createdAt: Date.now(),
      isAiGenerated: false,
    };

    const updated = [...blocks, block];
    updateBlocksAndContent(updated);

    setNewQuestion('');
    setNewContent('');
    setIsAddingNew(false);
  };

  const handleRawTextChange = (rawText: string) => {
    onChange(rawText, blocks);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-slate-50/60 shrink-0">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-emerald-500" />
          <h3 className="font-semibold text-slate-800 text-sm">
            Notes for Page {note.pageNumber}
          </h3>
          <span className="text-[11px] text-slate-400 font-medium">
            ({blocks.length} {blocks.length === 1 ? 'block' : 'blocks'})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-200/60 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Formatted Cards View"
            >
              <LayoutList size={13} />
              Cards
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                viewMode === 'raw'
                  ? 'bg-white text-slate-800 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Raw Editor"
            >
              <Code size={13} />
              Raw
            </button>
          </div>

          <button
            onClick={onClear}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Clear all page notes"
          >
            <Trash2 size={16} />
          </button>
          
          <button
            onClick={onSave}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-all shadow-2xs border border-emerald-700/20"
          >
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-3 lg:p-4 bg-slate-50/30">
        {viewMode === 'raw' ? (
          <textarea
            value={note.content}
            onChange={(e) => handleRawTextChange(e.target.value)}
            placeholder="Write notes here..."
            className="w-full h-full p-4 bg-white rounded-xl border border-slate-200 shadow-2xs text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 leading-relaxed font-mono resize-none text-slate-800"
          />
        ) : (
          <div className="space-y-4">
            {blocks.length === 0 && !isAddingNew ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <FileText size={24} />
                </div>
                <h4 className="font-semibold text-slate-700 text-sm">No notes for Page {note.pageNumber} yet</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto mb-4">
                  Add your own study thoughts below or click "Edit & Insert to Notes" from the AI Assistant.
                </p>
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus size={15} />
                  Add New Note Card
                </button>
              </div>
            ) : (
              blocks.map((block, idx) => (
                <div
                  key={block.id}
                  className={`group relative rounded-xl border p-4 transition-all shadow-2xs ${
                    block.isAiGenerated
                      ? 'bg-indigo-50/50 border-indigo-100/80 hover:border-indigo-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Left Accent Stripe */}
                  <div
                    className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-xl ${
                      block.isAiGenerated ? 'bg-indigo-500' : 'bg-emerald-500'
                    }`}
                  />

                  {editingBlockId === block.id ? (
                    /* Block Edit Form */
                    <div className="space-y-3 pl-2">
                      <input
                        type="text"
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        placeholder="Question / Title (optional)..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      />

                      {/* Text Formatting Toolbar */}
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                        <button
                          type="button"
                          onClick={() => applyFormatting(`edit-block-${block.id}`, '**', '**', editContent, setEditContent)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                          title="Bold Text"
                        >
                          <Bold size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormatting(`edit-block-${block.id}`, '*', '*', editContent, setEditContent)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                          title="Italic Text"
                        >
                          <Italic size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormatting(`edit-block-${block.id}`, '### ', '', editContent, setEditContent)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                          title="Heading Title"
                        >
                          <Heading size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormatting(`edit-block-${block.id}`, '* ', '', editContent, setEditContent)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                          title="Bullet List"
                        >
                          <List size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormatting(`edit-block-${block.id}`, '1. ', '', editContent, setEditContent)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                          title="Numbered List"
                        >
                          <ListOrdered size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => applyFormatting(`edit-block-${block.id}`, '> ', '', editContent, setEditContent)}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                          title="Quote Block"
                        >
                          <Quote size={14} />
                        </button>
                      </div>

                      <textarea
                        id={`edit-block-${block.id}`}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        className="w-full p-3 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed text-slate-800 font-sans"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingBlockId(null)}
                          className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveBlockEdit(block.id)}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700"
                        >
                          <Check size={14} /> Save Block
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Formatted Rendered Card */
                    <div className="pl-2 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {block.isAiGenerated ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-100/70 px-2 py-0.5 rounded-full">
                              <Sparkles size={11} /> AI Note
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                              <FileText size={11} /> User Note
                            </span>
                          )}
                        </div>

                        {/* Card Action Toolbar */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleMoveBlock(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            onClick={() => handleMoveBlock(idx, 'down')}
                            disabled={idx === blocks.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-20"
                            title="Move Down"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            onClick={() => handleStartEditBlock(block)}
                            className="p-1 text-slate-400 hover:text-emerald-600 rounded-md"
                            title="Edit Note Block"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={() => handleDeleteBlock(block.id)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded-md"
                            title="Delete Note Block"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {block.question && (
                        <h4 className="font-semibold text-xs text-indigo-900 border-b border-indigo-100/60 pb-1.5 flex items-center gap-1.5">
                          <HelpCircle size={13} className="text-indigo-500 shrink-0" />
                          <span>Q: {block.question}</span>
                        </h4>
                      )}

                      <div className="prose prose-sm prose-slate max-w-none text-xs leading-relaxed text-slate-800">
                        <Markdown>{block.content}</Markdown>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Add New Note Card Form */}
            {isAddingNew ? (
              <div className="bg-white border border-emerald-200 rounded-xl p-4 space-y-3 shadow-sm animate-in fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
                    <Plus size={14} className="text-emerald-600" />
                    New Note Card
                  </h4>
                  <button
                    onClick={() => setIsAddingNew(false)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
                
                <input
                  type="text"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  placeholder="Heading / Question title (optional)..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />

                {/* Text Formatting Toolbar */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-medium px-1">Formatting:</span>
                  <button
                    type="button"
                    onClick={() => applyFormatting('new-note-textarea', '**', '**', newContent, setNewContent)}
                    className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                    title="Bold (**text**)"
                  >
                    <Bold size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('new-note-textarea', '*', '*', newContent, setNewContent)}
                    className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                    title="Italic (*text*)"
                  >
                    <Italic size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('new-note-textarea', '### ', '', newContent, setNewContent)}
                    className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                    title="Heading Title"
                  >
                    <Heading size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('new-note-textarea', '* ', '', newContent, setNewContent)}
                    className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                    title="Bullet Point"
                  >
                    <List size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('new-note-textarea', '1. ', '', newContent, setNewContent)}
                    className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                    title="Numbered List"
                  >
                    <ListOrdered size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyFormatting('new-note-textarea', '> ', '', newContent, setNewContent)}
                    className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-white rounded transition-colors"
                    title="Quote"
                  >
                    <Quote size={13} />
                  </button>
                </div>

                <textarea
                  id="new-note-textarea"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Type your study note here..."
                  rows={3}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 leading-relaxed text-slate-800"
                />

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setIsAddingNew(false)}
                    className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNewBlock}
                    disabled={!newContent.trim()}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-2xs disabled:opacity-50"
                  >
                    Add Note Card
                  </button>
                </div>
              </div>
            ) : (
              blocks.length > 0 && (
                <button
                  onClick={() => setIsAddingNew(true)}
                  className="w-full py-2.5 border border-dashed border-slate-300 hover:border-emerald-500 text-slate-500 hover:text-emerald-700 bg-white/60 hover:bg-emerald-50/40 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  Add Custom Note Card
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
