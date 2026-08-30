import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Eraser, Highlighter, Loader2, PenLine, RotateCcw, Search, Trash2, Type, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { AnnotationStroke, AnnotationTool, PDFCitationTarget } from '../types';
import { AnnotationCanvas } from './AnnotationCanvas';
import { recognizeScannedPage } from '../services/ocr';
import { findCitationSpanRange } from '../utils/citationHighlight';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFViewerProps {
  file: string | Blob;
  pageNumber: number;
  setPageNumber: (page: number) => void;
  onPageRenderSuccess: (base64Image: string) => void;
  onPageTextReady: (text: string) => void;
  onDocumentContextReady: (text: string) => void;
  onDocumentPagesReady: (pages: string[]) => void;
  onDocumentContextLoadingChange: (loading: boolean) => void;
  onDocumentContextProgress: (status: string | null) => void;
  onDocumentLoaded: (totalPages: number) => void;
  annotations: AnnotationStroke[];
  onAnnotationsChange: (strokes: AnnotationStroke[]) => void;
  citationTarget?: PDFCitationTarget | null;
  onCitationDismiss?: () => void;
}

export function PDFViewer({ file, pageNumber, setPageNumber, onPageRenderSuccess, onPageTextReady, onDocumentContextReady, onDocumentPagesReady, onDocumentContextLoadingChange, onDocumentContextProgress, onDocumentLoaded, annotations, onAnnotationsChange, citationTarget = null, onCitationDismiss }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [scale, setScale] = useState(1.0);
  const [inputPage, setInputPage] = useState('1');
  const [isPanning, setIsPanning] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [activeSearchResult, setActiveSearchResult] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [annotationEnabled, setAnnotationEnabled] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('pen');
  const [annotationColor, setAnnotationColor] = useState('#ef4444');
  const [renderVersion, setRenderVersion] = useState(0);
  const [citationHighlightStatus, setCitationHighlightStatus] = useState<'idle' | 'highlighted' | 'page-only'>('idle');

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textCache = useRef(new Map<number, string>());
  const textPromises = useRef(new Map<number, Promise<string>>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const touchPan = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);

  useEffect(() => {
    setInputPage(pageNumber.toString());
  }, [pageNumber]);

  // Keyboard arrow keys for page turning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't turn pages if focused on input/textarea
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.key === 'ArrowLeft') {
        setPageNumber(Math.max(1, pageNumber - 1));
      } else if (e.key === 'ArrowRight') {
        if (numPages) {
          setPageNumber(Math.min(numPages, pageNumber + 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pageNumber, numPages, setPageNumber]);

  const extractPageText = useCallback(async (page: number) => {
    if (!pdfDocument) return '';
    const cached = textCache.current.get(page);
    if (cached !== undefined) return cached;
    const pending = textPromises.current.get(page);
    if (pending) return pending;

    const extraction = (async () => {
      const pdfPage = await pdfDocument.getPage(page);
      const content = await pdfPage.getTextContent();
      let text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length < 40) {
        onDocumentContextProgress(`Scanning page ${page} with OCR...`);
        const viewport = pdfPage.getViewport({ scale: 1.7 });
        const canvas = window.document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (context) {
          await pdfPage.render({ canvasContext: context, viewport } as never).promise;
          const recognized = await recognizeScannedPage(canvas, (progress) => {
            onDocumentContextProgress(`Scanning page ${page} with OCR · ${Math.round(progress * 100)}%`);
          });
          if (recognized.length > text.length) text = recognized;
        }
      }

      textCache.current.set(page, text);
      textPromises.current.delete(page);
      return text;
    })().catch((error) => {
      textPromises.current.delete(page);
      throw error;
    });
    textPromises.current.set(page, extraction);
    return extraction;
  }, [onDocumentContextProgress, pdfDocument]);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDocument) return;
    onPageTextReady('');
    extractPageText(pageNumber)
      .then((text) => { if (!cancelled) onPageTextReady(text); })
      .catch((error) => {
        console.error('Failed to extract page text', error);
        if (!cancelled) onPageTextReady('');
      });
    return () => { cancelled = true; };
  }, [extractPageText, onPageTextReady, pageNumber, pdfDocument]);

  useEffect(() => {
    let cancelled = false;
    if (!pdfDocument) return;
    const buildDocumentContext = async () => {
      onDocumentContextLoadingChange(true);
      onDocumentContextProgress('Reading document text...');
      onDocumentContextReady('');
      onDocumentPagesReady([]);
      const pageBudget = Math.max(40, Math.min(2_000, Math.floor(48_000 / pdfDocument.numPages) - 20));
      const pages: string[] = [];
      const fullPages: string[] = [];
      try {
        for (let page = 1; page <= pdfDocument.numPages; page += 1) {
          if (cancelled) return;
          onDocumentContextProgress(`Indexing page ${page} of ${pdfDocument.numPages}...`);
          const text = await extractPageText(page);
          fullPages.push(text);
          pages.push(`[Page ${page}] ${text.slice(0, pageBudget)}`);
        }
        if (!cancelled) {
          onDocumentPagesReady(fullPages);
          onDocumentContextReady(pages.join('\n').slice(0, 48_000));
        }
      } catch (error) {
        console.error('Failed to prepare document context', error);
      } finally {
        if (!cancelled) {
          onDocumentContextProgress(null);
          onDocumentContextLoadingChange(false);
        }
      }
    };
    void buildDocumentContext();
    return () => { cancelled = true; };
  }, [extractPageText, onDocumentContextLoadingChange, onDocumentContextProgress, onDocumentContextReady, onDocumentPagesReady, pdfDocument]);

  function onDocumentLoadSuccess(pdf: PDFDocumentProxy) {
    setPdfDocument(pdf);
    setNumPages(pdf.numPages);
    setLoadError(null);
    textCache.current.clear();
    textPromises.current.clear();
    onDocumentLoaded(pdf.numPages);
  }

  function handleRenderSuccess() {
    if (pageRef.current) {
      const canvas = pageRef.current.querySelector<HTMLCanvasElement>('.react-pdf__Page__canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        onPageRenderSuccess(dataUrl);
      }
    }
    setRenderVersion((version) => version + 1);
  }

  useEffect(() => {
    const root = pageRef.current;
    root?.querySelectorAll<HTMLElement>('.study-citation-highlight').forEach((element) => element.classList.remove('study-citation-highlight'));
    if (!citationTarget || citationTarget.pageNumber !== pageNumber || !root) {
      setCitationHighlightStatus('idle');
      return;
    }

    setCitationHighlightStatus('page-only');
    const timeout = window.setTimeout(() => {
      const spans = [...root.querySelectorAll<HTMLElement>('.react-pdf__Page__textContent span')];
      const range = findCitationSpanRange(spans.map((span) => span.textContent || ''), citationTarget.quote);
      if (!range) return;
      spans.slice(range.firstSpan, range.lastSpan + 1).forEach((span) => span.classList.add('study-citation-highlight'));
      spans[range.firstSpan]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      setCitationHighlightStatus('highlighted');
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [citationTarget, pageNumber, renderVersion, scale]);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(inputPage, 10);
    if (!isNaN(p) && numPages && p >= 1 && p <= numPages) {
      setPageNumber(p);
    } else {
      setInputPage(pageNumber.toString());
    }
  };

  const setZoom = useCallback((value: number, clientX?: number, clientY?: number) => {
    const next = Math.min(3, Math.max(0.5, Number(value.toFixed(2))));
    const container = containerRef.current;
    if (!container) { setScale(next); return; }
    const rect = container.getBoundingClientRect();
    const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const ratioX = (container.scrollLeft + anchorX) / Math.max(1, container.scrollWidth);
    const ratioY = (container.scrollTop + anchorY) / Math.max(1, container.scrollHeight);
    setScale(next);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      container.scrollLeft = ratioX * container.scrollWidth - anchorX;
      container.scrollTop = ratioY * container.scrollHeight - anchorY;
    }));
  }, []);

  const resetZoom = () => setZoom(1.0);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized || !pdfDocument) return;
    setIsSearching(true);
    setHasSearched(true);
    try {
      const matches: number[] = [];
      for (let page = 1; page <= pdfDocument.numPages; page += 1) {
        const text = await extractPageText(page);
        if (text.toLowerCase().includes(normalized)) matches.push(page);
      }
      setSearchResults(matches);
      setActiveSearchResult(matches.length > 0 ? 0 : -1);
      if (matches.length > 0) setPageNumber(matches[0]);
    } catch (error) {
      console.error('Document search failed', error);
      setLoadError('Search could not finish for this document.');
    } finally {
      setIsSearching(false);
    }
  };

  const moveSearchResult = (direction: -1 | 1) => {
    if (searchResults.length === 0) return;
    const next = (activeSearchResult + direction + searchResults.length) % searchResults.length;
    setActiveSearchResult(next);
    setPageNumber(searchResults[next]);
  };

  // Mouse Drag-to-Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current || annotationEnabled) return;
    // Only initiate drag if left mouse button is clicked
    if (e.button !== 0) return;

    setIsPanning(true);
    setStartPos({
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !containerRef.current) return;
    e.preventDefault();
    const dx = e.clientX - startPos.x;
    const dy = e.clientY - startPos.y;
    containerRef.current.scrollLeft = startPos.scrollLeft - dx;
    containerRef.current.scrollTop = startPos.scrollTop - dy;
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (event: React.WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom(scale + (event.deltaY < 0 ? 0.15 : -0.15), event.clientX, event.clientY);
  };

  const touchDistance = (touches: React.TouchList) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  const handleTouchStart = (event: React.TouchEvent) => {
    if (annotationEnabled || !containerRef.current) return;
    if (event.touches.length === 2) {
      pinchStart.current = { distance: touchDistance(event.touches), scale };
      touchPan.current = null;
    } else if (event.touches.length === 1) {
      const touch = event.touches[0];
      touchPan.current = { x: touch.clientX, y: touch.clientY, scrollLeft: containerRef.current.scrollLeft, scrollTop: containerRef.current.scrollTop };
    }
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    const container = containerRef.current;
    if (annotationEnabled || !container) return;
    event.preventDefault();
    if (event.touches.length === 2 && pinchStart.current) {
      const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const midpointY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      setZoom(pinchStart.current.scale * (touchDistance(event.touches) / pinchStart.current.distance), midpointX, midpointY);
    } else if (event.touches.length === 1 && touchPan.current) {
      const touch = event.touches[0];
      container.scrollLeft = touchPan.current.scrollLeft - (touch.clientX - touchPan.current.x);
      container.scrollTop = touchPan.current.scrollTop - (touch.clientY - touchPan.current.y);
    }
  };

  const handleTouchEnd = () => {
    pinchStart.current = null;
    touchPan.current = null;
  };

  return (
    <div className="flex flex-col h-full bg-slate-100/80 rounded-lg overflow-hidden border border-slate-200 shadow-2xs select-none">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between p-2 bg-white border-b border-slate-200 shadow-2xs z-10 gap-2 shrink-0">
        {/* Page Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
            disabled={pageNumber <= 1}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
            title="Previous Page (Left Arrow)"
          >
            <ChevronLeft size={18} />
          </button>
          
          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">Page</span>
            <input
              type="text"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              onBlur={handlePageInputSubmit}
              className="w-10 px-1 py-0.5 text-center bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <span className="text-xs text-slate-500 font-medium">
              / {numPages || '--'}
            </span>
          </form>

          <button
            onClick={() => setPageNumber(Math.min(numPages || 1, pageNumber + 1))}
            disabled={pageNumber >= (numPages || 1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 transition-colors"
            title="Next Page (Right Arrow)"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Zoom Controls & Presets */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(scale - 0.2)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>

          {/* Quick Zoom Presets */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-xs font-semibold">
            <button
              onClick={() => setZoom(1.0)}
              className={`px-1.5 py-0.5 rounded ${scale === 1.0 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Fit Page (100%)"
            >
              100%
            </button>
            <button
              onClick={() => setZoom(1.4)}
              className={`px-1.5 py-0.5 rounded ${scale === 1.4 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Zoom 140%"
            >
              140%
            </button>
            <button
              onClick={() => setZoom(1.8)}
              className={`px-1.5 py-0.5 rounded ${scale === 1.8 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Zoom 180%"
            >
              180%
            </button>
          </div>

          <button
            onClick={() => setZoom(scale + 0.2)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={16} />
          </button>

          <button
            onClick={resetZoom}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
            title="Reset Zoom to 100%"
          >
            <RotateCcw size={15} />
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button type="button" onClick={() => { setAnnotationEnabled((value) => !value); setAnnotationTool('pen'); }} className={`p-1.5 rounded ${annotationEnabled ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-white'}`} title="Draw on PDF"><PenLine size={15} /></button>
          {annotationEnabled && (
            <>
              <button type="button" onClick={() => setAnnotationTool('pen')} className={`p-1.5 rounded ${annotationTool === 'pen' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`} title="Pen"><PenLine size={15} /></button>
              <button type="button" onClick={() => setAnnotationTool('highlight')} className={`p-1.5 rounded ${annotationTool === 'highlight' ? 'bg-white text-amber-600 shadow-xs' : 'text-slate-500'}`} title="Highlighter"><Highlighter size={15} /></button>
              <button type="button" onClick={() => setAnnotationTool('text')} className={`p-1.5 rounded ${annotationTool === 'text' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`} title="Add text box"><Type size={15} /></button>
              <button type="button" onClick={() => setAnnotationTool('eraser')} className={`p-1.5 rounded ${annotationTool === 'eraser' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'}`} title="Eraser"><Eraser size={15} /></button>
              <input type="color" aria-label="Annotation color" value={annotationColor} onChange={(event) => setAnnotationColor(event.target.value)} className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0" />
              <button type="button" onClick={() => onAnnotationsChange(annotations.slice(0, -1))} disabled={annotations.length === 0} className="p-1.5 text-slate-500 disabled:opacity-25" title="Undo annotation"><Undo2 size={15} /></button>
              <button type="button" onClick={() => annotations.length > 0 && window.confirm('Clear annotations on this page?') && onAnnotationsChange([])} disabled={annotations.length === 0} className="p-1.5 text-slate-500 hover:text-red-600 disabled:opacity-25" title="Clear page annotations"><Trash2 size={15} /></button>
            </>
          )}
        </div>

        <form onSubmit={runSearch} className="order-last sm:order-none w-full sm:w-auto flex items-center gap-1">
          <label className="relative flex-1 sm:w-44">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setHasSearched(false);
                setSearchResults([]);
                setActiveSearchResult(-1);
              }}
              placeholder="Search document"
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:border-indigo-500"
            />
            {isSearching ? <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" /> : searchQuery && <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setActiveSearchResult(-1); setHasSearched(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear document search"><X size={14} /></button>}
          </label>
          <button type="submit" disabled={!searchQuery.trim() || !pdfDocument || isSearching} className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40" title="Search document" aria-label="Search document"><Search size={15} /></button>
          {searchResults.length > 0 && (
            <div className="flex items-center gap-0.5 text-[11px] text-slate-500 whitespace-nowrap">
              <button type="button" onClick={() => moveSearchResult(-1)} className="p-1 hover:bg-slate-100 rounded" aria-label="Previous search result"><ChevronLeft size={14} /></button>
              {activeSearchResult + 1}/{searchResults.length}
              <button type="button" onClick={() => moveSearchResult(1)} className="p-1 hover:bg-slate-100 rounded" aria-label="Next search result"><ChevronRight size={14} /></button>
            </div>
          )}
          {hasSearched && searchQuery && !isSearching && searchResults.length === 0 && <span className="text-[11px] text-slate-400 whitespace-nowrap">No matches</span>}
        </form>
      </div>

      {loadError && <div role="alert" className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">{loadError}</div>}

      {citationTarget && citationTarget.pageNumber === pageNumber && (
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold"><span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-indigo-600 text-[11px] text-white">{citationTarget.number}</span>Source on page {citationTarget.pageNumber}</div>
            <p className="mt-1 line-clamp-2 text-amber-900">{citationTarget.quote}</p>
            {citationHighlightStatus === 'page-only' && <p className="mt-1 text-[11px] text-amber-700">The cited page is open. Exact line highlighting may be unavailable on scanned pages.</p>}
          </div>
          <button type="button" onClick={onCitationDismiss} className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100" aria-label="Close cited source"><X size={14} /></button>
        </div>
      )}

      {/* Canvas Display Viewport with Click-and-Drag Pan */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
        className={`flex-1 overflow-auto bg-slate-200/60 transition-colors ${
          annotationEnabled ? 'cursor-default' : scale > 1.0 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        <div className="flex min-h-full min-w-full w-max items-start justify-center p-4 lg:p-6">
        <div ref={pageRef} className="relative shrink-0 bg-white shadow-xl">
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => { console.error('Document load failed', error); setLoadError('This document could not be opened. It may be damaged or password protected.'); }}
            loading={
              <div className="flex items-center justify-center h-80 text-slate-500 text-sm font-medium">
                Loading document pages...
              </div>
            }
            error={
              <div className="flex items-center justify-center h-80 text-red-500 text-sm font-medium">
                Failed to load document preview.
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              onRenderSuccess={handleRenderSuccess}
              className="block"
            />
          </Document>
          <AnnotationCanvas enabled={annotationEnabled} tool={annotationTool} color={annotationColor} strokes={annotations} onChange={onAnnotationsChange} />
        </div>
        </div>
      </div>
    </div>
  );
}
