import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: string;
  pageNumber: number;
  setPageNumber: (page: number) => void;
  onPageRenderSuccess: (base64Image: string) => void;
}

export function PDFViewer({ file, pageNumber, setPageNumber, onPageRenderSuccess }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.0);
  const [inputPage, setInputPage] = useState('1');
  const [isPanning, setIsPanning] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  const pageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  function handleRenderSuccess() {
    if (pageRef.current) {
      const canvas = pageRef.current.querySelector('canvas');
      if (canvas) {
        const dataUrl = canvas.toDataURL('image/png');
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
    <div className="flex flex-col h-full bg-slate-100/80 rounded-xl overflow-hidden border border-slate-200 shadow-2xs select-none">
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
      </div>

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
