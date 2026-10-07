import { useEffect, useRef, useState } from 'react';
import { Plus, RotateCcw, Trash2, X } from 'lucide-react';

export function StarterPromptsEditor({ open, prompts, defaults, onSave, onClose }: {
  open: boolean; prompts: string[]; defaults: string[];
  onSave: (prompts: string[]) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(prompts);
  useEffect(() => {
    if (open) { setDraft([...prompts]); dialog.current?.showModal(); }
    else dialog.current?.close();
  }, [open]);
  return <dialog ref={dialog} onCancel={onClose} aria-label="Starter questions" className="m-auto w-[min(560px,calc(100vw-24px))] max-h-[85dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-black/40">
    <header className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">Starter questions for this document</h2><button type="button" onClick={onClose} title="Close starter questions" aria-label="Close starter questions" className="grid h-8 w-8 place-items-center"><X size={18} /></button></header>
    <div className="space-y-3">
      {draft.map((value, index) => <div key={index} className="flex items-start gap-2">
        <textarea aria-label={`Starter question ${index + 1}`} rows={2} maxLength={1000} value={value} onChange={(event) => setDraft((current) => current.map((item, i) => i === index ? event.target.value : item))} className="min-w-0 flex-1 resize-y rounded-md border border-slate-200 bg-white p-2 text-sm" />
        <button type="button" onClick={() => setDraft((current) => current.filter((_, i) => i !== index))} aria-label={`Delete starter question ${index + 1}`} title="Delete question" className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-slate-100"><Trash2 size={16} /></button>
      </div>)}
      <button type="button" onClick={() => setDraft((current) => [...current, ''])} disabled={draft.length >= 5} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm disabled:opacity-40"><Plus size={15} />Add question</button>
    </div>
    <footer className="mt-5 flex flex-wrap justify-between gap-2">
      <button type="button" onClick={() => setDraft([...defaults])} className="inline-flex items-center gap-2 text-sm"><RotateCcw size={15} />Reset defaults</button>
      <div className="flex gap-2"><button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-sm">Cancel</button><button type="button" onClick={() => { onSave([...new Set(draft.map((item) => item.trim()).filter(Boolean))]); onClose(); }} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Save questions</button></div>
    </footer>
  </dialog>;
}
