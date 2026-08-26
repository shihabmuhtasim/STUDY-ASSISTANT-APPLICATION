import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronRight, Clock, FileText, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { AccountIdentity, AccountSummary, StudyDocument } from '../types';

interface LibraryProps {
  documents: StudyDocument[];
  onOpenDocument: (doc: StudyDocument) => void;
  onAddDocument: (doc: StudyDocument) => void;
  onDeleteDocument: (id: string) => void;
  onUpdateDocument: (doc: StudyDocument) => void;
  account: AccountSummary | AccountIdentity | null;
}

const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function Library({ documents, onOpenDocument, onAddDocument, onDeleteDocument, onUpdateDocument }: LibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...documents]
      .filter((doc) => !normalized || doc.title.toLowerCase().includes(normalized))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [documents, query]);

  const processFile = (file: File) => {
    setError(null);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError('This PDF is larger than 50 MB. Choose a smaller file for reliable local storage.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setError('The file could not be read. Try selecting it again.');
    reader.onload = (event) => {
      const fileData = event.target?.result;
      if (typeof fileData !== 'string') {
        setError('The file could not be prepared for the study workspace.');
        return;
      }
      const now = Date.now();
      const newDocument: StudyDocument = {
        id: uuidv4(),
        title: file.name.replace(/\.pdf$/i, ''),
        fileData,
        totalPages: 0,
        createdAt: now,
        updatedAt: now,
      };
      onAddDocument(newDocument);
      onOpenDocument(newDocument);
    };
    reader.readAsDataURL(file);
  };

  const commitRename = (document: StudyDocument) => {
    const title = editingTitle.trim();
    if (title && title !== document.title) onUpdateDocument({ ...document, title, updatedAt: Date.now() });
    setEditingId(null);
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-indigo-600 text-white grid place-items-center shrink-0"><BookOpen size={19} /></span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-900 leading-tight">Study Assistant</p>
              <p className="text-xs text-slate-500 truncate">PDF study workspace</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <section className="mb-8 max-w-3xl border-l-4 border-indigo-600 pl-5 sm:pl-6 py-1">
          <h1 className="text-2xl sm:text-3xl font-semibold text-slate-950">Your study library</h1>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-slate-600">Turn every PDF into a focused study space. Read the page, build notes that stay connected to it, and ask the assistant questions without losing your place.</p>
        </section>

        {error && (
          <div role="alert" className="mb-5 flex items-center justify-between gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="p-1 hover:bg-red-100 rounded" aria-label="Dismiss error"><X size={16} /></button>
          </div>
        )}

        <section
          className={`border-2 border-dashed rounded-lg p-7 sm:p-10 text-center transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white'}`}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files?.[0]; if (file) processFile(file); }}
        >
          <Upload size={26} className="mx-auto text-indigo-600" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Add a PDF</h2>
          <p className="mt-1 text-sm text-slate-500">Drop a file here or browse from your device. Maximum 50 MB.</p>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 text-sm">Select PDF</button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) processFile(file); event.target.value = ''; }}
            accept="application/pdf,.pdf"
            className="hidden"
          />
        </section>

        <section className="mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2"><Clock size={18} className="text-slate-400" />Documents <span className="text-sm font-normal text-slate-400">{documents.length}</span></h2>
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
              <p className="mt-1 text-sm text-slate-500">Your uploaded PDFs will appear here.</p>
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
                          <p className="mt-1 text-xs text-slate-500">{document.totalPages > 0 ? `${document.totalPages} pages · ` : ''}Updated {new Date(document.updatedAt).toLocaleDateString()}</p>
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
