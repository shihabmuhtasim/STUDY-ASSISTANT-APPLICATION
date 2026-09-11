import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpenCheck, CheckCircle2, ChevronRight, Cloud, CloudOff, FileText, Folder, FolderPlus, Layers3, Loader2, MessageSquareText, NotebookPen, Pencil, Search, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AccountIdentity, AccountSummary, StudyDocument, StudyFolder } from '../types';
import { DOCUMENT_ACCEPT, prepareStudyFile } from '../utils/documentImport';

interface LibraryProps {
  documents: StudyDocument[];
  folders: StudyFolder[];
  onOpenDocument: (doc: StudyDocument) => void;
  onAddDocument: (doc: StudyDocument) => Promise<StudyDocument>;
  onDeleteDocument: (id: string) => void;
  onUpdateDocument: (doc: StudyDocument) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
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

export function Library({ documents, folders, onOpenDocument, onAddDocument, onDeleteDocument, onUpdateDocument, onCreateFolder, onRenameFolder, onDeleteFolder, account, onRequireAuth, driveConnected, driveLinked, driveBusy, cloudMessage, onConnectDrive, onDisconnectDrive, focusRequest }: LibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentsRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<'all' | 'unfiled' | string>('all');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    if (focusRequest > 0) {
      window.requestAnimationFrame(() => documentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [focusRequest]);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...documents]
      .filter((doc) => !normalized || doc.title.toLowerCase().includes(normalized))
      .filter((doc) => selectedFolderId === 'all' || (selectedFolderId === 'unfiled' ? !doc.folderId : doc.folderId === selectedFolderId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [documents, query, selectedFolderId]);

  useEffect(() => {
    if (selectedFolderId !== 'all' && selectedFolderId !== 'unfiled' && !folders.some((folder) => folder.id === selectedFolderId)) setSelectedFolderId('all');
  }, [folders, selectedFolderId]);

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

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName);
    setNewFolderName('');
    setCreatingFolder(false);
  };

  const moveDocument = (document: StudyDocument, folderId?: string) => {
    onUpdateDocument({ ...document, folderId, updatedAt: Date.now() });
  };

  const dropDocument = (event: React.DragEvent, folderId?: string) => {
    event.preventDefault();
    const documentId = event.dataTransfer.getData('text/plain');
    const document = documents.find((item) => item.id === documentId);
    if (document) moveDocument(document, folderId);
  };

  return (
    <main className="library-page min-h-screen">
      <section className="library-hero border-b border-black/10">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-16">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700"><Sparkles size={15} />THE AI STUDY WORKSPACE FOR DOCUMENTS</div>
              <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] text-[#171717] sm:text-6xl">Study documents page by page. Understand them as a whole.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">NoteMyDoc AI keeps every question, explanation, and note connected to the exact page you are reading, while the AI retains the wider document context.</p>
              <p className="mt-6 text-sm font-semibold text-[#171717]">Chat with every page. Keep every note.</p>
            </div>

            <div className="product-preview overflow-hidden rounded-lg border border-slate-800 bg-[#111317] text-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-slate-300">
                <span className="font-semibold text-white">Document workspace</span>
                <span>Page 12 of 48</span>
              </div>
              <div className="grid min-h-[300px] grid-cols-[0.84fr_1.16fr]">
                <div className="border-r border-white/10 bg-white p-4 text-slate-900">
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Lecture 04</p>
                  <h2 className="mt-8 text-base font-semibold leading-snug">Convolutional neural networks</h2>
                  <div className="mt-5 h-1.5 w-24 rounded bg-slate-200" />
                  <div className="mt-2 h-1.5 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-1.5 w-4/5 rounded bg-slate-100" />
                </div>
                <div className="flex flex-col justify-between p-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-indigo-300">AI page assistant</p>
                    <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-200">Explain max pooling in simpler terms.</div>
                    <div className="mt-3 rounded-md bg-white p-3 text-xs leading-5 text-slate-800">Max pooling keeps the strongest signal from each small area, making the network faster while preserving the most useful features.</div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 text-[10px] font-medium">
                    <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-200">Note saved to page 12</span>
                    <span className="rounded border border-indigo-400/30 bg-indigo-400/10 px-2 py-1 text-indigo-200">Whole-document context on</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="specialty-band border-b border-black/10">
        <div className="mx-auto grid max-w-6xl divide-y divide-black/10 px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="py-7 md:pr-7"><BookOpenCheck size={21} className="text-indigo-600" /><h2 className="mt-4 text-xl font-semibold text-[#171717]">Focus on the page.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Ask for summaries, explanations, translations, or quizzes about exactly what is in front of you.</p></div>
          <div className="py-7 md:px-7"><MessageSquareText size={21} className="text-violet-600" /><h2 className="mt-4 text-xl font-semibold text-[#171717]">Ask with full context.</h2><p className="mt-2 text-sm leading-6 text-slate-600">The AI understands the wider document whenever your question depends on another page or topic.</p></div>
          <div className="py-7 md:pl-7"><NotebookPen size={21} className="text-emerald-600" /><h2 className="mt-4 text-xl font-semibold text-[#171717]">Keep notes connected.</h2><p className="mt-2 text-sm leading-6 text-slate-600">Write freely, insert AI answers, and keep every note organized beside the page that inspired it.</p></div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">

        {account && (
          <div className="library-panel mb-5 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
          className={`library-panel rounded-lg border p-7 text-center transition-colors sm:p-9 ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-black/10 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0]; if (file) processFile(file); }}
        >
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-[#171717] text-white"><Upload size={22} /></span>
          <h2 className="mt-3 text-lg font-semibold text-[#171717]">Bring in your next document</h2>
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

        <section ref={documentsRef} id="notemydoc-library" className="mt-10 scroll-mt-24">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div><div className="flex items-center gap-2 text-xs font-semibold text-indigo-700"><Layers3 size={15} />YOUR WORKSPACE</div><h2 className="mt-1 text-xl font-semibold text-[#171717]">Study library <span className="text-sm font-normal text-slate-400">{documents.length}</span></h2></div>
            {documents.length > 0 && (
              <label className="relative block w-full sm:w-72">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents" className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500" />
              </label>
            )}
          </div>

          <div className="custom-scrollbar mb-5 flex items-center gap-2 overflow-x-auto pb-2">
            <button type="button" onClick={() => setSelectedFolderId('all')} className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${selectedFolderId === 'all' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}><Layers3 size={14} />All documents <span className="text-slate-400">{documents.length}</span></button>
            <button type="button" onClick={() => setSelectedFolderId('unfiled')} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropDocument(event)} className={`flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold ${selectedFolderId === 'unfiled' ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`} title="Drop a document here to remove it from its folder"><FileText size={14} />Unfiled <span className="text-slate-400">{documents.filter((item) => !item.folderId).length}</span></button>
            {folders.map((folder) => (
              <div key={folder.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropDocument(event, folder.id)} className={`flex shrink-0 items-center rounded-md border ${selectedFolderId === folder.id ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`} title="Drop a document into this folder">
                <button type="button" onClick={() => setSelectedFolderId(folder.id)} className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold ${selectedFolderId === folder.id ? 'text-indigo-700' : 'text-slate-600'}`}><Folder size={14} />{folder.name}<span className="text-slate-400">{documents.filter((item) => item.folderId === folder.id).length}</span></button>
                <button type="button" onClick={() => { const name = window.prompt('Rename folder', folder.name); if (name) void onRenameFolder(folder.id, name); }} className="p-2 text-slate-400 hover:text-indigo-600" title={`Rename ${folder.name}`} aria-label={`Rename ${folder.name}`}><Pencil size={13} /></button>
                <button type="button" onClick={() => { if (window.confirm(`Delete “${folder.name}”? Documents will move to Unfiled.`)) void onDeleteFolder(folder.id); }} className="p-2 text-slate-400 hover:text-red-600" title={`Delete ${folder.name}`} aria-label={`Delete ${folder.name}`}><Trash2 size={13} /></button>
              </div>
            ))}
            {creatingFolder ? (
              <form onSubmit={(event) => { event.preventDefault(); void createFolder(); }} className="flex shrink-0 items-center gap-1 rounded-md border border-indigo-300 bg-white p-1">
                <input autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Folder name" maxLength={60} className="w-36 px-2 py-1 text-xs outline-none" />
                <button type="submit" className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">Create</button>
                <button type="button" onClick={() => { setCreatingFolder(false); setNewFolderName(''); }} className="p-1 text-slate-400" aria-label="Cancel folder creation"><X size={14} /></button>
              </form>
            ) : <button type="button" onClick={() => account ? setCreatingFolder(true) : onRequireAuth()} className="flex shrink-0 items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"><FolderPlus size={14} />New folder</button>}
          </div>

          {documents.length === 0 ? (
            <div className="py-12 text-center border-t border-slate-200">
              <FileText size={28} className="mx-auto text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No documents yet</p>
              <p className="mt-1 text-sm text-slate-500">Your uploaded documents will appear here.</p>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="py-10 text-center border-t border-slate-200 text-sm text-slate-500">{query ? `No documents match “${query}”.` : 'No documents in this folder yet.'}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredDocuments.map((document) => (
                <article key={document.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', document.id); }} className="library-panel bg-white border border-slate-200 rounded-lg p-4 hover:border-slate-300 hover:shadow-sm transition group">
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
                  <label className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Folder size={13} />
                    <span className="sr-only">Move {document.title} to</span>
                    <select value={document.folderId || ''} onChange={(event) => moveDocument(document, event.target.value || undefined)} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600" aria-label={`Move ${document.title} to folder`}>
                      <option value="">Unfiled</option>
                      {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                    </select>
                  </label>
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
