import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ChevronRight, Cloud, CloudOff, FileText, Layers3, Loader2, MessageSquareText, NotebookPen, Pencil, Search, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AccountIdentity, AccountSummary, StudyDocument } from '../types';
import { DOCUMENT_ACCEPT, prepareStudyFile } from '../utils/documentImport';

interface LibraryProps {
  documents: StudyDocument[];
  onOpenDocument: (doc: StudyDocument) => void;
  onAddDocument: (doc: StudyDocument) => Promise<StudyDocument>;
  onDeleteDocument: (id: string) => void;
  onUpdateDocument: (doc: StudyDocument) => void;
  account: AccountSummary | AccountIdentity | null;
  onRequireAuth: () => void;
  driveConnected: boolean;
  driveLinked: boolean;
  driveBusy: boolean;
  cloudMessage: string | null;
  onConnectDrive: () => void;
  onDisconnectDrive: () => void;
  focusRequest: number;
}

export function Library({ documents, onOpenDocument, onAddDocument, onDeleteDocument, onUpdateDocument, account, onRequireAuth, driveConnected, driveLinked, driveBusy, cloudMessage, onConnectDrive, onDisconnectDrive, focusRequest }: LibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  useEffect(() => {
    if (focusRequest > 0) {
      window.requestAnimationFrame(() => documentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [focusRequest]);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...documents]
      .filter((doc) => !normalized || doc.title.toLowerCase().includes(normalized))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [documents, query]);

  const processFile = async (file: File) => {
    if (isImporting) return;
    if (!account) {
      onRequireAuth();
      return;
    }
    setError(null);
    setIsImporting(true);
    try {
      if (file.size > 50 * 1024 * 1024) void navigator.storage?.persist?.();
      const prepared = await prepareStudyFile(file);
      const now = Date.now();
      const newDocument: StudyDocument = {
        id: uuidv4(),
        title: file.name.replace(/\.[^.]+$/, ''),
        fileData: prepared.fileData,
        sourceFormat: prepared.sourceFormat,
        originalFileName: file.name,
        totalPages: 0,
        createdAt: now,
        updatedAt: now,
      };
      const savedDocument = await onAddDocument(newDocument);
      onOpenDocument(savedDocument);
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'The document could not be prepared for the study workspace.');
    } finally {
      setIsImporting(false);
    }
  };

  const commitRename = (document: StudyDocument) => {
    const title = editingTitle.trim();
    if (title && title !== document.title) onUpdateDocument({ ...document, title, updatedAt: Date.now() });
    setEditingId(null);
  };

  return (
    <main className="min-h-screen bg-[#f7f7f5]">
      <section className="border-b border-black/10 bg-[#fcfcfa]">
        <div className="mx-auto max-w-6xl px-4 py-9 sm:px-6 sm:py-12">
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_390px]">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700"><Sparkles size={15} />AI that studies at your pace</div>
              <h1 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight text-[#171717] sm:text-5xl">Study every page. Keep every insight.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">Clarivo reads the document with you, one page at a time. Ask focused questions, keep unlimited notes beside the source, and stay organized without losing the context of the full document.</p>
            </div>
            <div className="grid grid-cols-1 divide-y divide-black/10 border-y border-black/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
              <div className="flex items-center gap-2.5 px-1 py-3 text-xs font-medium text-slate-700 sm:px-3 lg:px-0"><BookOpenCheck size={17} className="shrink-0 text-indigo-600" /><span>Read one page</span></div>
              <div className="flex items-center gap-2.5 px-1 py-3 text-xs font-medium text-slate-700 sm:px-3 lg:px-0"><MessageSquareText size={17} className="shrink-0 text-violet-600" /><span>Ask with context</span></div>
              <div className="flex items-center gap-2.5 px-1 py-3 text-xs font-medium text-slate-700 sm:px-3 lg:px-0"><NotebookPen size={17} className="shrink-0 text-emerald-600" /><span>Organize every note</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {account && (
          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${driveConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{driveConnected ? <Cloud size={18} /> : <CloudOff size={18} />}</span>
              <div><p className="text-sm font-semibold text-slate-900">Optional Google Drive sync</p><p className="mt-0.5 text-xs text-slate-500">{driveConnected ? 'Connected. New documents synchronize automatically.' : driveLinked ? 'Linked to your account. Local documents remain available; resume cloud sync when needed.' : 'Your documents work locally without Drive. Connect it only for cloud backup and access across devices.'}</p></div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {driveLinked && <button type="button" onClick={onDisconnectDrive} disabled={driveBusy} className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-red-700 disabled:opacity-50">Disconnect</button>}
              <button type="button" onClick={onConnectDrive} disabled={driveBusy} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-60">
                {driveBusy ? <Loader2 size={16} className="animate-spin" /> : driveConnected ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Cloud size={16} />}
                {driveBusy ? 'Synchronizing…' : driveConnected ? 'Sync now' : driveLinked ? 'Resume sync' : 'Connect Google Drive'}
              </button>
            </div>
          </div>
        )}

        {cloudMessage && <p role="status" className="mb-5 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{cloudMessage}</p>}

        {error && (
          <div role="alert" className="mb-5 flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded" aria-label="Dismiss error"><X size={16} /></button>
          </div>
        )}

        <section
          className={`rounded-lg border p-7 text-center transition-colors sm:p-9 ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0]; if (file) processFile(file); }}
        >
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#171717] text-white"><Upload size={22} /></span>
          <h2 className="mt-3 text-lg font-semibold text-[#171717]">Bring in your next study document</h2>
          <p className="mt-1 text-sm text-slate-500">Drop it here or browse PDF, Word, text, Markdown, HTML, RTF, and CSV files.</p>
          <button type="button" disabled={isImporting} onClick={() => !account ? onRequireAuth() : fileInputRef.current?.click()} className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-60">
            {isImporting && <Loader2 size={15} className="animate-spin" />}
            {isImporting ? 'Preparing document…' : !account ? 'Sign in to add a document' : 'Select document'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) processFile(file); event.target.value = ''; }}
            accept={DOCUMENT_ACCEPT}
            className="hidden"
          />
        </section>

        <section ref={documentsRef} id="clarivo-library" className="mt-10 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div><div className="flex items-center gap-2 text-xs font-semibold text-indigo-700"><Layers3 size={15} />YOUR WORKSPACE</div><h2 className="mt-1 text-xl font-semibold text-[#171717]">Study library <span className="text-sm font-normal text-slate-400">{documents.length}</span></h2></div>
            {documents.length > 0 && (
              <label className="relative block w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500" />
              </label>
            )}
          </div>

          {documents.length === 0 ? (
            <div className="py-12 text-center border-t border-slate-200">
              <FileText size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No documents yet</p>
              <p className="mt-1 text-sm text-slate-500">Your uploaded documents will appear here.</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-10 text-center border-t border-slate-200 text-sm text-slate-500">No documents match “{query}”.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDocuments.map((document) => (
                <article key={document.id} className="bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition group">
                  <div className="flex items-start gap-3">
                    <button type="button" onClick={() => onOpenDocument(document)} className="w-10 h-10 bg-emerald-50 text-emerald-700 rounded-lg grid place-items-center shrink-0 hover:bg-emerald-100" aria-label={`Open ${document.title}`}><FileText size={20} /></button>
                    <div className="min-w-0 flex-1">
                      {editingId === document.id ? (
                        <form onSubmit={(event) => { event.preventDefault(); commitRename(document); }}>
                          <input autoFocus value={editingTitle} onChange={(event) => setEditingTitle(event.target.value)} onBlur={() => commitRename(document)} className="w-full px-2 py-1 border border-indigo-300 rounded text-sm font-medium" aria-label="Document title" />
                        </form>
                      ) : (
                        <button type="button" onClick={() => onOpenDocument(document)} className="block w-full text-left">
                          <h3 className="font-medium text-slate-900 truncate" title={document.title}>{document.title}</h3>
                          <p className="mt-1 text-xs text-slate-500">{document.sourceFormat ? `${document.sourceFormat} · ` : ''}{document.totalPages > 0 ? `${document.totalPages} pages · ` : ''}Updated {new Date(document.updatedAt).toLocaleDateString()}</p>
                          {document.cloudStatus && <p className={`mt-1 flex items-center gap-1 text-[11px] ${document.cloudStatus === 'synced' ? 'text-emerald-700' : document.cloudStatus === 'error' ? 'text-red-700' : 'text-slate-500'}`}>{document.cloudStatus === 'synced' ? <CheckCircle2 size={12} /> : <Cloud size={12} />}{document.cloudStatus === 'synced' ? 'Available across devices' : document.cloudStatus === 'syncing' ? 'Synchronizing…' : document.cloudStatus === 'error' ? 'Drive sync needs attention' : 'Stored on this device'}</p>}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button type="button" onClick={() => { setEditingId(document.id); setEditingTitle(document.title); }} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Rename" aria-label={`Rename ${document.title}`}><Pencil size={15} /></button>
                      <button type="button" onClick={() => { if (window.confirm(`Delete “${document.title}” and its local notes?`)) onDeleteDocument(document.id); }} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete" aria-label={`Delete ${document.title}`}><Trash2 size={15} /></button>
                    </div>
                  </div>
                  <button type="button" onClick={() => onOpenDocument(document)} className="mt-4 w-full flex items-center justify-between text-sm font-medium text-indigo-700 hover:text-indigo-900">Continue studying<ChevronRight size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
