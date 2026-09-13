import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { CheckCircle2, FileText, KeyRound, Loader2, Mic, Radio, RotateCcw, Square, X } from 'lucide-react';
import type { NoteBlock } from '../types';
import type { VoiceNotesController } from './useVoiceNotes';
import { toRichTextHtml } from './RichTextEditor';

interface Props {
  voice: VoiceNotesController;
  pageNumber: number;
  notes: { pageNumber: number; block: NoteBlock }[];
  onManage: () => void;
  onOpenPage: (page: number) => void;
}

export function VoiceNotesPanel({ voice, pageNumber, notes, onManage, onOpenPage }: Props) {
  const active = voice.session.phase !== 'idle';
  const pending = voice.jobs.filter((job) => job.status !== 'saved');
  return <section className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-800" aria-label="Voice notes workspace">
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="flex items-center gap-3"><Mic size={20} className="text-indigo-600" /><div><h2 className="text-base font-semibold">Voice Notes</h2><p className="text-xs text-slate-500">Page {pageNumber} · {notes.length} saved · {pending.length} pending</p></div></div>
      <button type="button" onClick={onManage} title="Manage your Custom API connections" className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-2 text-xs font-medium"><KeyRound size={14} />Custom API</button>
    </header>
    <div className="space-y-4 border-b border-slate-200 p-5">
      <label className="block text-xs font-medium text-slate-600">Recording model
        <select aria-label="Recording model" disabled={active} value={voice.selectedId || ''} onChange={(event) => voice.select(event.target.value)} className="mt-1.5 h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm">
          <option value="" disabled>Add a Custom API connection</option>
          {voice.connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {active ? <button type="button" onClick={voice.stop} disabled={voice.session.phase === 'finishing'} className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Square size={14} fill="currentColor" />Stop and create notes</button>
          : <><button type="button" disabled={!voice.ready || !voice.selectedId} onClick={() => voice.start('page')} title="Record this page. Stop manually or change pages to create notes." className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"><Mic size={16} />This page</button>
            <button type="button" disabled={!voice.ready || !voice.selectedId} onClick={() => voice.start('continuous')} title="Each page change saves that segment and starts recording the next page." className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><Radio size={16} />Auto by page</button></>}
      </div>
      {active && <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="flex items-center gap-2 text-xs font-semibold" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{voice.session.phase === 'starting' ? 'Starting microphone' : voice.session.phase === 'finishing' ? 'Finishing transcription' : 'Recording'} · Page {voice.session.segment?.pageNumber}{voice.session.mode === 'continuous' ? ' · Auto by page' : ''}</p>
        <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-600" aria-label="Live transcript">{voice.session.segment?.transcript || 'Listening for speech...'}</p>
      </div>}
      {(voice.session.error || voice.notice) && <p className="rounded-md bg-red-50 p-3 text-xs text-red-700" role="alert">{voice.session.error || voice.notice}</p>}
    </div>
    <div className="divide-y divide-slate-200">
      {pending.map((job) => <article key={job.id} className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold">{job.status === 'processing' ? <Loader2 size={16} className="animate-spin text-indigo-600" /> : <Mic size={16} className="text-slate-500" />}Page {job.pageNumber}</h3><span className="text-xs text-slate-500">{job.status === 'processing' ? 'Creating notes...' : 'Needs attention'}</span></div>
        {job.error && <p className="text-sm text-red-700" role="alert">{job.error}</p>}
        <details className="text-xs text-slate-600"><summary className="cursor-pointer font-medium">Transcript</summary><p className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{job.transcript || 'No words were detected.'}</p></details>
        {job.status === 'failed' && job.transcript && <button type="button" disabled={!voice.selectedId} onClick={() => voice.retry(job)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"><RotateCcw size={13} />Retry with selected API</button>}
      </article>)}
      {notes.map(({ pageNumber: page, block }) => <article key={block.id} className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 size={16} className="text-emerald-700" />Page {page} <span className="text-xs font-normal text-slate-500">Saved</span></h3><button type="button" onClick={() => onOpenPage(page)} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium"><FileText size={13} />Open page notes</button></div>
        <div className="rich-note-content text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(toRichTextHtml(block.content)) }} />
      </article>)}
      {!notes.length && !pending.length && !active && <div className="px-5 py-10 text-center"><Mic size={24} className="mx-auto text-slate-400" /><h3 className="mt-3 text-sm font-semibold">Your lecture notes, page by page</h3><p className="mt-1 text-xs text-slate-500">No recordings yet.</p></div>}
    </div>
  </section>;
}

export function VoiceNotesDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close(); }, [open]);
  return <dialog ref={ref} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className="m-auto h-[min(720px,90dvh)] w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-800 shadow-2xl backdrop:bg-black/40" aria-label="Lecture voice notes">
    <div className="flex h-full flex-col"><div className="flex shrink-0 justify-end border-b border-slate-200 px-3 py-1"><button autoFocus type="button" onClick={onClose} aria-label="Close voice controls" title="Close voice controls. Recording continues." className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100"><X size={17} /></button></div><div className="min-h-0 flex-1">{children}</div></div>
  </dialog>;
}
