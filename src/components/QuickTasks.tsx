import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, ListChecks, Plus, Trash2, X } from 'lucide-react';

interface TaskItem { id: string; text: string; done: boolean }
interface TaskBoard { id: string; title: string; items: TaskItem[] }

export function QuickTasks({ userId }: { userId: string }) {
  const storageKey = `notemydoc-quick-tasks:${userId}`;
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [activeId, setActiveId] = useState('');
  const [newTask, setNewTask] = useState('');
  const skipNextSave = useRef(true);

  useEffect(() => {
    skipNextSave.current = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]') as TaskBoard[];
      const valid = Array.isArray(saved) ? saved.filter((board) => board?.id && board?.title && Array.isArray(board.items)) : [];
      setBoards(valid);
      setActiveId(valid[0]?.id || '');
    } catch { setBoards([]); }
  }, [storageKey]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(boards));
  }, [boards, storageKey]);

  const active = boards.find((board) => board.id === activeId) || boards[0];
  const updateActive = (change: (board: TaskBoard) => TaskBoard) => {
    if (!active) return;
    setBoards((current) => current.map((board) => board.id === active.id ? change(board) : board));
  };
  const addBoard = () => {
    const title = window.prompt('Subject or course name');
    if (!title?.trim()) return;
    const board = { id: crypto.randomUUID(), title: title.trim(), items: [] };
    setBoards((current) => [...current, board]);
    setActiveId(board.id);
    setOpen(true);
  };
  const addTask = () => {
    const text = newTask.trim();
    if (!text || !active) return;
    updateActive((board) => ({ ...board, items: [...board.items, { id: crypto.randomUUID(), text, done: false }] }));
    setNewTask('');
  };

  const remaining = boards.reduce((count, board) => count + board.items.filter((item) => !item.done).length, 0);
  return <section className="library-panel mb-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open}>
      <span className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><ListChecks size={18} /></span><span><span className="block text-sm font-semibold text-slate-900">Study checklist</span><span className="block text-xs text-slate-500">{boards.length ? `${remaining} task${remaining === 1 ? '' : 's'} remaining across ${boards.length} subject${boards.length === 1 ? '' : 's'}` : 'Create subject boards and keep every task in view.'}</span></span></span>
      <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">{open ? 'Hide' : 'Open'}{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
    </button>
    {open && <div className="border-t border-slate-200 p-4">
      <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-3">
        {boards.map((board) => <button key={board.id} type="button" onClick={() => setActiveId(board.id)} className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold ${active?.id === board.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}>{board.title}<span className="ml-2 text-slate-400">{board.items.filter((item) => !item.done).length}</span></button>)}
        <button type="button" onClick={addBoard} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"><Plus size={14} />Add subject</button>
      </div>
      {!active ? <div className="py-6 text-center text-sm text-slate-500">Add a subject to start your checklist.</div> : <div>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-slate-900">{active.title}</h3><button type="button" onClick={() => { setBoards((current) => current.filter((board) => board.id !== active.id)); setActiveId(boards.find((board) => board.id !== active.id)?.id || ''); }} className="p-1.5 text-slate-400 hover:text-red-600" title="Delete subject" aria-label={`Delete ${active.title}`}><Trash2 size={15} /></button></div>
        <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
          {active.items.map((item) => <div key={item.id} className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-slate-50"><button type="button" onClick={() => updateActive((board) => ({ ...board, items: board.items.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry) }))} className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${item.done ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`} aria-label={`${item.done ? 'Mark incomplete' : 'Complete'} ${item.text}`}>{item.done && <Check size={13} />}</button><span className={`min-w-0 flex-1 text-sm ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</span><button type="button" onClick={() => updateActive((board) => ({ ...board, items: board.items.filter((entry) => entry.id !== item.id) }))} className="p-0.5 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-600" aria-label={`Delete ${item.text}`}><X size={14} /></button></div>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); addTask(); }} className="mt-3 flex gap-2"><input value={newTask} onChange={(event) => setNewTask(event.target.value)} placeholder="Add a task" maxLength={200} className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm" /><button type="submit" disabled={!newTask.trim()} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Add</button></form>
      </div>}
    </div>}
  </section>;
}
