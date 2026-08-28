import React, { useState, useEffect, useRef } from 'react';
import { PDFViewer } from './PDFViewer';
import { NotesPanel } from './NotesPanel';
import { AIAssistant } from './AIAssistant';
import { AccountIdentity, AccountSummary, StudyDocument, PageNote, AIInteraction, NoteBlock, AnnotationStroke } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Download, BookOpen, GripVertical, GripHorizontal, FileText, Sparkles, LayoutGrid, Eye, Check } from 'lucide-react';
import { get, set } from 'idb-keyval';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { exportStudyPackPDF } from '../utils/pdfExport';
import { toRichTextHtml } from './RichTextEditor';
import { loadCloudWorkspace, saveCloudPage } from '../services/cloudData';

interface StudyInterfaceProps {
  document: StudyDocument;
  onBack: () => void;
  account: AccountSummary | AccountIdentity | null;
  onAccountChange: (account: AccountSummary | AccountIdentity | null) => void;
  onUpdateDocument: (document: StudyDocument) => void;
}

export function StudyInterface({ document, onBack, account, onAccountChange, onUpdateDocument }: StudyInterfaceProps) {
  const [pageNumber, setPageNumber] = useState(1);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [pageText, setPageText] = useState('');
  const [documentContext, setDocumentContext] = useState('');
  const [isDocumentContextLoading, setIsDocumentContextLoading] = useState(true);
  const [notes, setNotes] = useState<Record<number, PageNote>>({});
  const [isNotesLoaded, setIsNotesLoaded] = useState(false);
  const [annotations, setAnnotations] = useState<Record<number, AnnotationStroke[]>>({});
  const [areAnnotationsLoaded, setAreAnnotationsLoaded] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const cloudSaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Universal Layout Mode: 'split' (all 3 panes visible) | 'tabs' (1 pane visible with tab navigation) | 'pdf-only'
  const [layoutMode, setLayoutMode] = useState<'split' | 'tabs' | 'pdf-only'>('split');

  // Active Tab when in 'tabs' mode: 'pdf' | 'notes' | 'ai'
  const [activeTab, setActiveTab] = useState<'pdf' | 'notes' | 'ai'>('pdf');

  // Keep narrow screens in the tabbed layout so panels cannot overlap.
  useEffect(() => {
    const syncLayout = () => {
      if (window.innerWidth < 768) setLayoutMode((current) => current === 'split' ? 'tabs' : current);
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  useEffect(() => {
    setPageImage(null);
    setPageText('');
  }, [pageNumber]);

  // Load notes from IndexedDB on mount
  useEffect(() => {
    async function loadNotes() {
      try {
        const savedNotes = await get(`notes_${document.id}`);
        if (savedNotes) {
          setNotes(savedNotes);
        }
      } catch (e) {
        console.error("Failed to load notes", e);
      } finally {
        setIsNotesLoaded(true);
      }
    }
    loadNotes();
  }, [document.id]);

  useEffect(() => {
    if (!account || !isNotesLoaded || !areAnnotationsLoaded) return;
    loadCloudWorkspace(account.userId, document.id)
      .then((cloud) => {
        setNotes((current) => ({ ...current, ...cloud.notes }));
        setAnnotations((current) => ({ ...current, ...cloud.annotations }));
      })
      .catch((error) => console.error('Failed to load cloud study data', error));
  }, [account, document.id, isNotesLoaded, areAnnotationsLoaded]);

  // Save notes to IndexedDB whenever they change
  useEffect(() => {
    if (isNotesLoaded) {
      set(`notes_${document.id}`, notes).catch(e => console.error("Failed to save notes", e));
    }
  }, [notes, document.id, isNotesLoaded]);

  useEffect(() => {
    get<Record<number, AnnotationStroke[]>>(`annotations_${document.id}`)
      .then((saved) => { if (saved) setAnnotations(saved); })
      .catch((error) => console.error('Failed to load annotations', error))
      .finally(() => setAreAnnotationsLoaded(true));
  }, [document.id]);

  useEffect(() => {
    if (!areAnnotationsLoaded) return;
    set(`annotations_${document.id}`, annotations).catch((error) => console.error('Failed to save annotations', error));
  }, [annotations, areAnnotationsLoaded, document.id]);

  const currentNote: PageNote = notes[pageNumber] || {
    id: uuidv4(),
    documentId: document.id,
    pageNumber,
    content: '',
    blocks: [],
    aiHistory: [],
  };

  const queueCloudSave = (page: number, note: PageNote, strokes: AnnotationStroke[]) => {
    if (!account) return;
    if (cloudSaveTimers.current[page]) clearTimeout(cloudSaveTimers.current[page]);
    cloudSaveTimers.current[page] = setTimeout(() => {
      saveCloudPage(account.userId, document.id, page, note, strokes)
        .catch((error) => console.error('Failed to synchronize page study data', error));
      delete cloudSaveTimers.current[page];
    }, 700);
  };

  const handleNoteChange = (content: string, blocks?: NoteBlock[]) => {
    const nextNote = {
      ...currentNote,
      content,
      blocks: blocks || currentNote.blocks || [],
    };
    setNotes(prev => ({
      ...prev,
      [pageNumber]: nextNote,
    }));
    queueCloudSave(pageNumber, nextNote, annotations[pageNumber] || []);
  };

  const handleClearNote = () => {
    if (window.confirm(`Are you sure you want to clear all notes for Page ${pageNumber}?`)) {
      handleNoteChange('', []);
    }
  };

  const handleAddInteraction = (interaction: AIInteraction) => {
    const nextNote = {
      ...currentNote,
      aiHistory: [...(currentNote.aiHistory || []), interaction],
    };
    setNotes(prev => ({
      ...prev,
      [pageNumber]: nextNote,
    }));
    queueCloudSave(pageNumber, nextNote, annotations[pageNumber] || []);
  };

  const handleInsertToNotes = (editedText: string, questionHeader?: string) => {
    const newBlock: NoteBlock = {
      id: uuidv4(),
      question: questionHeader,
      content: toRichTextHtml(editedText),
      createdAt: Date.now(),
      isAiGenerated: true,
    };

    const existingBlocks = currentNote.blocks && currentNote.blocks.length > 0
      ? currentNote.blocks
      : currentNote.content?.trim()
        ? [{ id: 'legacy-1', content: currentNote.content, createdAt: Date.now(), isAiGenerated: false }]
        : [];

    const updatedBlocks = [...existingBlocks, newBlock];

    const updatedContent = updatedBlocks
      .map(b => (b.question ? `### Q: ${b.question}\n${b.content}` : b.content))
      .join('\n\n---\n\n');

    handleNoteChange(updatedContent, updatedBlocks);

    // If in single-tab mode, switch to notes tab so user sees inserted block
    if (layoutMode === 'tabs') {
      setActiveTab('notes');
    }
  };

  const handleRemainingChange = (remaining: number) => {
    if (!account || !('aiRemaining' in account)) return;
    onAccountChange({
      ...account,
      aiRemaining: remaining,
      aiUsage: Math.max(0, account.aiLimit - remaining),
    });
  };

  const handleDocumentLoaded = (totalPages: number) => {
    if (document.totalPages !== totalPages) {
      onUpdateDocument({ ...document, totalPages, updatedAt: Date.now() });
    }
  };

  const pdfViewerProps = {
    file: document.fileData,
    pageNumber,
    setPageNumber,
    onPageRenderSuccess: setPageImage,
    onPageTextReady: setPageText,
    onDocumentContextReady: setDocumentContext,
    onDocumentContextLoadingChange: setIsDocumentContextLoading,
    onDocumentLoaded: handleDocumentLoaded,
    annotations: annotations[pageNumber] || [],
    onAnnotationsChange: (strokes: AnnotationStroke[]) => {
      setAnnotations((current) => ({ ...current, [pageNumber]: strokes }));
      queueCloudSave(pageNumber, currentNote, strokes);
    },
  };

  const aiAssistantProps = {
    pageNumber,
    pageImage,
    pageText,
    documentContext,
    isDocumentContextLoading,
    history: currentNote.aiHistory || [],
    account,
    onRemainingChange: handleRemainingChange,
    onAddInteraction: handleAddInteraction,
    onInsertToNotes: handleInsertToNotes,
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await exportStudyPackPDF(
        document.title || 'Study_Pack',
        document.fileData,
        notes,
        annotations,
        (progress) => setExportProgress(progress)
      );
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export notes. Please check the console for details.");
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50 font-sans">
      {/* Top Header */}
      <header className="flex items-center justify-between px-3 lg:px-6 py-2.5 bg-white border-b border-slate-200 shadow-2xs z-30 shrink-0 gap-2">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Back to Library"
          >
            <ArrowLeft size={19} />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen size={19} className="text-indigo-600 shrink-0" />
            <h1 className="text-sm sm:text-base font-semibold text-slate-800 truncate max-w-[140px] sm:max-w-xs md:max-w-md">
              {document.title}
            </h1>
          </div>
        </div>

        {/* Global Layout Switcher for Laptop, Tablet & Mobile */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => setLayoutMode('split')}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                layoutMode === 'split' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="3-Pane Split View (All 3 boxes visible at once)"
            >
              <LayoutGrid size={14} />
              <span className="hidden md:inline">3-Pane Split</span>
              <span className="md:hidden">Split</span>
            </button>

            <button
              onClick={() => setLayoutMode('tabs')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                layoutMode === 'tabs' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Single Screen Tab View (PDF / Notes / AI)"
            >
              <FileText size={14} />
              <span className="hidden md:inline">Single Tab</span>
              <span className="md:hidden">Tabs</span>
            </button>

            <button
              onClick={() => setLayoutMode('pdf-only')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                layoutMode === 'pdf-only' ? 'bg-white text-indigo-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Document Reader Full Screen"
            >
              <Eye size={14} />
              <span className="hidden md:inline">Document Focus</span>
              <span className="md:hidden">Document</span>
            </button>
          </div>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            <Download size={15} />
            <span className="hidden sm:inline">
              {isExporting ? (exportProgress || 'Exporting...') : 'Export Pack'}
            </span>
            <span className="sm:hidden">{isExporting ? '...' : 'Export'}</span>
          </button>
        </div>
      </header>

      {/* Tab Selector Bar when in 'tabs' layout mode */}
      {layoutMode === 'tabs' && (
        <div className="flex items-center justify-around bg-white border-b border-slate-200 px-2 py-1.5 shrink-0 z-20 shadow-2xs">
          <button
            onClick={() => setActiveTab('pdf')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'pdf'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <BookOpen size={16} />
            <span>Document Reader</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'notes'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText size={16} />
            <span>Notes (P. {pageNumber})</span>
            {currentNote.blocks && currentNote.blocks.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center font-bold">
                {currentNote.blocks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'ai'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Sparkles size={16} />
            <span>AI Assistant</span>
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <main className="flex-1 overflow-hidden p-2 lg:p-3 relative">
        {layoutMode === 'pdf-only' ? (
          /* Document Reader Full Screen */
          <div className="h-full w-full p-1">
            <PDFViewer {...pdfViewerProps} />
          </div>
        ) : layoutMode === 'tabs' ? (
          /* Single Tab View */
          <div className="h-full w-full relative">
            {activeTab === 'pdf' && (
              <div className="h-full w-full flex flex-col relative">
                <PDFViewer {...pdfViewerProps} />
                
                {/* Floating Navigation Quick Bar */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/90 text-white p-1.5 rounded-full shadow-lg backdrop-blur-md z-30">
                  <button
                    onClick={() => setActiveTab('ai')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-full text-xs font-medium transition-colors"
                  >
                    <Sparkles size={14} />
                    Ask AI (Page {pageNumber})
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-full text-xs font-medium transition-colors"
                  >
                    <FileText size={14} />
                    Page Notes
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div className="h-full w-full">
                <NotesPanel
                  note={currentNote}
                  onChange={handleNoteChange}
                  onClear={handleClearNote}
                  onSave={() => {
                    set(`notes_${document.id}`, notes).catch(e => console.error("Failed to save notes", e));
                  }}
                />
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="h-full w-full">
                <AIAssistant {...aiAssistantProps} />
              </div>
            )}
          </div>
        ) : (
          /* 3-Pane Split View - Visible simultaneously on laptop, desktop, tablet, or mobile */
          <PanelGroup orientation="horizontal" className="h-full w-full">
            {/* Left Panel: PDF Viewer */}
            <Panel defaultSize={50} minSize={25} className="flex flex-col">
              <div className="h-full w-full p-1">
                <PDFViewer {...pdfViewerProps} />
              </div>
            </Panel>

            <PanelResizeHandle className="flex items-center justify-center w-3 h-full hover:bg-indigo-100/60 transition-colors rounded-full group cursor-col-resize">
              <GripVertical className="text-slate-300 group-hover:text-indigo-500 w-4 h-4" />
            </PanelResizeHandle>

            {/* Right Panel: Notes & AI Assistant in Vertical Split */}
            <Panel defaultSize={50} minSize={25} className="flex flex-col">
              <PanelGroup orientation="vertical" className="h-full w-full">
                {/* Notes Section */}
                <Panel defaultSize={45} minSize={20} className="p-1">
                  <NotesPanel
                    note={currentNote}
                    onChange={handleNoteChange}
                    onClear={handleClearNote}
                    onSave={() => {
                      set(`notes_${document.id}`, notes).catch(e => console.error("Failed to save notes", e));
                    }}
                  />
                </Panel>

                <PanelResizeHandle className="flex items-center justify-center h-3 w-full hover:bg-emerald-100/60 transition-colors rounded-full group cursor-row-resize">
                  <GripHorizontal className="text-slate-300 group-hover:text-emerald-500 w-4 h-4" />
                </PanelResizeHandle>

                {/* AI Assistant Section */}
                <Panel defaultSize={55} minSize={25} className="p-1">
                  <AIAssistant {...aiAssistantProps} />
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        )}
      </main>
    </div>
  );
}
