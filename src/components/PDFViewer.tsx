import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, X, ZoomIn, ZoomOut } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFViewerProps {
  file: string;
  pageNumber: number;
  setPageNumber: (page: number) => void;
  onPageRenderSuccess: (base64Image: string) => void;
  onPageTextReady: (text: string) => void;
  onDocumentLoaded: (totalPages: number) => void;
}

export function PDFViewer({ file, pageNumber, setPageNumber, onPageRenderSuccess, onPageTextReady, onDocumentLoaded }: PDFViewerProps) {
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textCache = useRef(new Map<number, string>());

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
    const pdfPage = await pdfDocument.getPage(page);
    const content = await pdfPage.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    textCache.current.set(page, text);
    return text;
  }, [pdfDocument]);

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

  function onDocumentLoadSuccess(pdf: PDFDocumentProxy) {
    setPdfDocument(pdf);
    setNumPages(pdf.numPages);
    setLoadError(null);
    textCache.current.clear();
    onDocumentLoaded(pdf.numPages);
  }

  function handleRenderSuccess() {
    if (pageRef.current) {
      const canvas = pageRef.current.querySelector('canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        onPageRenderSuccess(dataUrl);
      }
    }
  }

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(inputPage, 10);
    if (!isNaN(p) && numPages && p >= 1 && p <= numPages) {
      setPageNumber(p);
    } else {
      setInputPage(pageNumber.toString());
    }
  };

  const resetZoom = () => setScale(1.0);

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = searchQuery.trim().toLowerCase();
    if (!normalized || !pdfDocument) return;
    setIsSearching(true);
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
    if (!containerRef.current) return;
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
            onClick={() => setScale(s => Math.max(0.5, Number((s - 0.2).toFixed(2))))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>

          {/* Quick Zoom Presets */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-md text-xs font-semibold">
            <button
              onClick={() => setScale(1.0)}
              className={`px-1.5 py-0.5 rounded ${scale === 1.0 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Fit Page (100%)"
            >
              100%
            </button>
            <button
              onClick={() => setScale(1.4)}
              className={`px-1.5 py-0.5 rounded ${scale === 1.4 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Zoom 140%"
            >
              140%
            </button>
            <button
              onClick={() => setScale(1.8)}
              className={`px-1.5 py-0.5 rounded ${scale === 1.8 ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
              title="Zoom 180%"
            >
              180%
            </button>
          </div>

          <button
            onClick={() => setScale(s => Math.min(3.0, Number((s + 0.2).toFixed(2))))}
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

        <form onSubmit={runSearch} className="order-last sm:order-none w-full sm:w-auto flex items-center gap-1">
          <label className="relative flex-1 sm:w-44">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                if (!event.target.value) { setSearchResults([]); setActiveSearchResult(-1); }
              }}
              placeholder="Search PDF"
              className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:border-indigo-500"
            />
            {isSearching ? <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" /> : searchQuery && <button type="button" onClick={() => { setSearchQuery(''); setSearchResults([]); setActiveSearchResult(-1); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400" aria-label="Clear PDF search"><X size={14} /></button>}
          </label>
          {searchResults.length > 0 && (
            <div className="flex items-center gap-0.5 text-[11px] text-slate-500 whitespace-nowrap">
              <button type="button" onClick={() => moveSearchResult(-1)} className="p-1 hover:bg-slate-100 rounded" aria-label="Previous search result"><ChevronLeft size={14} /></button>
              {activeSearchResult + 1}/{searchResults.length}
              <button type="button" onClick={() => moveSearchResult(1)} className="p-1 hover:bg-slate-100 rounded" aria-label="Next search result"><ChevronRight size={14} /></button>
            </div>
          )}
          {searchQuery && !isSearching && activeSearchResult === -1 && searchResults.length === 0 && <span className="text-[11px] text-slate-400 whitespace-nowrap">No matches</span>}
        </form>
      </div>

      {loadError && <div role="alert" className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">{loadError}</div>}

      {/* Canvas Display Viewport with Click-and-Drag Pan */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 overflow-auto p-4 lg:p-6 flex justify-center items-start bg-slate-200/60 touch-pan-x touch-pan-y transition-colors ${
          scale > 1.0 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default'
        }`}
      >
        <div
          ref={pageRef}
          className="shadow-xl bg-white rounded-xs transition-transform duration-150 ease-out"
          style={{
            // Allow horizontal and vertical expansion when zoomed
            minWidth: scale > 1.0 ? 'max-content' : undefined,
          }}
        >
          <Document
            file={file}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => { console.error('PDF load failed', error); setLoadError('This PDF could not be opened. It may be damaged or password protected.'); }}
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
        </div>
      </div>
    </div>
  );
}
