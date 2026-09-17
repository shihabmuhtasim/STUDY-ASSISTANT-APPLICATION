import jsPDF from 'jspdf';
import { AnnotationStroke, PageNote, NoteBlock } from '../types';

interface CleanLine {
  text: string;
  type: 'h1' | 'h2' | 'h3' | 'bullet' | 'normal' | 'question';
  raw: string;
}

interface RenderLine {
  text: string;
  type: CleanLine['type'];
  indent: number;
  fontSize: number;
  isBold: boolean;
  height: number;
  gapAfter: number;
}

interface RenderBlock {
  isAi: boolean;
  question?: string;
  lines: RenderLine[];
  height: number;
}

interface NotesPagePlan {
  blocks: Array<{
    block: RenderBlock;
    y: number;
    height: number;
  }>;
  totalContentHeight: number;
  pageHeight: number;
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawAnnotationsOnCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  annotations: AnnotationStroke[]
) {
  for (const annotation of annotations) {
    context.save();
    if (annotation.tool !== 'text') {
      if (annotation.points.length === 0) {
        context.restore();
        continue;
      }
      context.beginPath();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = annotation.color;
      context.globalAlpha = annotation.tool === 'highlight' ? 0.32 : 1;
      context.lineWidth = Math.max(2, annotation.width * width);
      annotation.points.forEach((point, index) => {
        const x = point.x * width;
        const y = point.y * height;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
      context.restore();
      continue;
    }

    const x = annotation.x * width;
    const y = annotation.y * height;
    const boxWidth = annotation.width * width;
    const boxHeight = annotation.height * height;
    const fontSize = Math.max(12, annotation.fontSize * width);
    const lineHeight = fontSize * 1.25;
    context.fillStyle = 'rgba(255,255,255,0.86)';
    context.fillRect(x, y, boxWidth, boxHeight);
    context.beginPath();
    context.rect(x, y, boxWidth, boxHeight);
    context.clip();
    context.font = `${fontSize}px Arial, sans-serif`;
    context.fillStyle = annotation.color;
    const lines = wrapCanvasText(context, annotation.text, Math.max(1, boxWidth - 12));
    lines.forEach((line, index) => {
      const lineY = y + fontSize + 6 + index * lineHeight;
      if (lineY <= y + boxHeight) context.fillText(line, x + 6, lineY);
    });
    context.restore();
  }
}

/**
 * Converts rich HTML and markdown note text into structured lines without raw formatting artifacts.
 */
export function richContentToStructuredText(value: string): string {
  if (!value) return '';

  let text = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h1\b[^>]*>/gi, '\n# ')
    .replace(/<h2\b[^>]*>/gi, '\n## ')
    .replace(/<h3\b[^>]*>/gi, '\n### ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:h1|h2|h3|li|p|div|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  // Strip math and markdown artifacts
  text = text
    .replace(/\\+\$/g, '')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\(\$([^\$\n]+)\$\)/g, '($1)')
    .replace(/\$([^\$\n]+)\$/g, '$1')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\pm\b/g, '±')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_{2,}([^_]+)_{2,}/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

export function stripMarkdown(text: string): string {
  return richContentToStructuredText(text);
}

export function parseMarkdownToCleanLines(text: string): CleanLine[] {
  if (!text) return [];

  const rawLines = richContentToStructuredText(text).split('\n');
  const cleanLines: CleanLine[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      cleanLines.push({ text: trimmed.substring(2).trim(), type: 'h1', raw: line });
    } else if (trimmed.startsWith('## ')) {
      cleanLines.push({ text: trimmed.substring(3).trim(), type: 'h2', raw: line });
    } else if (trimmed.startsWith('### ')) {
      cleanLines.push({ text: trimmed.substring(4).trim(), type: 'h3', raw: line });
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('+ ')) {
      cleanLines.push({ text: trimmed.substring(2).trim(), type: 'bullet', raw: line });
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^\d+\.\s/);
      const prefix = match ? match[0] : '';
      cleanLines.push({ text: `${prefix}${trimmed.substring(prefix.length).trim()}`, type: 'bullet', raw: line });
    } else {
      cleanLines.push({ text: trimmed, type: 'normal', raw: line });
    }
  }

  return cleanLines;
}

function hasNoteContent(note?: PageNote): boolean {
  if (!note) return false;
  if (note.blocks && note.blocks.length > 0) {
    return note.blocks.some((b) => Boolean(b.content?.trim() || b.question?.trim()));
  }
  return Boolean(note.content && richContentToStructuredText(note.content).trim().length > 0);
}

function addCustomPage(doc: jsPDF, widthMm: number, heightMm: number) {
  const orientation = widthMm > heightMm ? 'l' : 'p';
  doc.addPage([widthMm, heightMm], orientation);
}

/**
 * Prepares measured lines and block heights for notes
 */
function prepareRenderBlocks(doc: jsPDF, blocks: NoteBlock[], contentWidth: number): RenderBlock[] {
  const cardPadding = 9;
  const renderBlocks: RenderBlock[] = [];

  for (const block of blocks) {
    const isAi = Boolean(block.isAiGenerated);
    const parsedLines = parseMarkdownToCleanLines(block.content || '');

    if (block.question?.trim()) {
      parsedLines.unshift({
        text: `Q: ${stripMarkdown(block.question)}`,
        type: 'question',
        raw: block.question,
      });
    }

    if (parsedLines.length === 0) continue;

    const lines: RenderLine[] = [];
    let blockTextHeight = 0;

    for (const item of parsedLines) {
      let fontSize = 10;
      let isBold = false;
      let indent = 0;
      let textToWrap = item.text;

      if (item.type === 'question') {
        fontSize = 11;
        isBold = true;
        indent = 0;
      } else if (item.type === 'h1' || item.type === 'h2') {
        fontSize = 12;
        isBold = true;
        indent = 0;
      } else if (item.type === 'h3') {
        fontSize = 10.5;
        isBold = true;
        indent = 0;
      } else if (item.type === 'bullet') {
        fontSize = 9.5;
        isBold = false;
        indent = 5;
        textToWrap = `•  ${item.text}`;
      } else {
        fontSize = 9.5;
      }

      doc.setFontSize(fontSize);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');

      const maxW = contentWidth - 14 - indent;
      const wrapped = doc.splitTextToSize(textToWrap, maxW) as string[];

      wrapped.forEach((lineStr, index) => {
        const lineHeight = fontSize * 0.42 + 2;
        const gapAfter = index === wrapped.length - 1 ? (item.type === 'bullet' ? 1.5 : 2.5) : 0.8;
        lines.push({
          text: lineStr,
          type: item.type,
          indent,
          fontSize,
          isBold,
          height: lineHeight,
          gapAfter,
        });
        blockTextHeight += lineHeight + gapAfter;
      });
    }

    const totalHeight = cardPadding * 2 + blockTextHeight;
    renderBlocks.push({
      isAi,
      question: block.question,
      lines,
      height: totalHeight,
    });
  }

  return renderBlocks;
}

/**
 * Plans notes pages with dynamic heights (minimum 20% of A4 = ~60mm, maximum A4 = 297mm,
 * cut after 1 inch = 25.4mm of the last text).
 */
function planNotesPages(blocks: RenderBlock[], startTop: number): NotesPagePlan[] {
  const maxPageHeight = 297; // A4 height in mm
  const minPageHeight = 60;  // 20% of A4 is ~59.4mm -> 60mm
  const bottomBuffer = 25.4; // 1 inch buffer after the last text
  const cardGap = 6;

  const pages: NotesPagePlan[] = [];
  let currentBlocks: Array<{ block: RenderBlock; y: number; height: number }> = [];
  let currentY = startTop;

  for (const block of blocks) {
    // Check if this block fits on the current page before max A4 limit
    if (currentBlocks.length > 0 && currentY + block.height + bottomBuffer > maxPageHeight) {
      // Finalize current page
      const neededHeight = currentY + bottomBuffer;
      pages.push({
        blocks: currentBlocks,
        totalContentHeight: currentY,
        pageHeight: Math.min(maxPageHeight, Math.max(minPageHeight, neededHeight)),
      });
      currentBlocks = [];
      currentY = startTop;
    }

    currentBlocks.push({
      block,
      y: currentY,
      height: block.height,
    });
    currentY += block.height + cardGap;
  }

  if (currentBlocks.length > 0) {
    const neededHeight = currentY - cardGap + bottomBuffer;
    pages.push({
      blocks: currentBlocks,
      totalContentHeight: currentY - cardGap,
      pageHeight: Math.min(maxPageHeight, Math.max(minPageHeight, neededHeight)),
    });
  }

  return pages;
}

/**
 * Renders notes pages with dynamic page lengths based on content height.
 */
function renderDynamicNotes(
  doc: jsPDF,
  blocksToRender: NoteBlock[],
  headerTitle: string,
  documentTitle: string,
  footerLabel: string
) {
  const margin = 14;
  const pageWidth = 210; // A4 portrait width
  const contentWidth = pageWidth - margin * 2;
  const headerHeight = 16;
  const notesTop = margin + headerHeight + 5;

  const renderBlocks = prepareRenderBlocks(doc, blocksToRender, contentWidth);
  if (renderBlocks.length === 0) return;

  const plannedPages = planNotesPages(renderBlocks, notesTop);

  plannedPages.forEach((pagePlan, pageIndex) => {
    addCustomPage(doc, pageWidth, pagePlan.pageHeight);

    // Header bar
    doc.setFillColor(243, 244, 246); // slate-100
    doc.roundedRect(margin, margin, contentWidth, headerHeight, 2.5, 2.5, 'F');
    doc.setFillColor(79, 70, 229); // indigo-600
    doc.rect(margin, margin, 3.5, headerHeight, 'F');

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59); // slate-800
    const continuedText = pageIndex > 0 ? ' (continued)' : '';
    doc.text(`${headerTitle}${continuedText}`, margin + 7, margin + 10.5);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    const truncatedDocTitle = (doc.splitTextToSize(documentTitle, 65) as string[])[0] || documentTitle;
    doc.text(truncatedDocTitle, pageWidth - margin - 4, margin + 10.5, { align: 'right' });

    // Render cards
    for (const item of pagePlan.blocks) {
      const { block, y } = item;
      const isAi = block.isAi;

      const bgColor: [number, number, number] = isAi ? [245, 247, 255] : [248, 250, 252];
      const borderColor: [number, number, number] = isAi ? [224, 231, 255] : [226, 232, 240];
      const accentColor: [number, number, number] = isAi ? [99, 102, 241] : [16, 185, 129];

      doc.setFillColor(...bgColor);
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, y, contentWidth, block.height, 2, 2, 'FD');

      // Accent left bar
      doc.setFillColor(...accentColor);
      doc.rect(margin, y, 2.5, block.height, 'F');

      let textY = y + 7;
      for (const line of block.lines) {
        doc.setFontSize(line.fontSize);
        doc.setFont('helvetica', line.isBold ? 'bold' : 'normal');

        if (line.type === 'question') doc.setTextColor(67, 56, 202); // indigo-700
        else if (line.type === 'h1' || line.type === 'h2' || line.type === 'h3') doc.setTextColor(30, 41, 59);
        else doc.setTextColor(51, 65, 85);

        doc.text(line.text, margin + 7 + line.indent, textY);
        textY += line.height + line.gapAfter;
      }
    }

    // Dynamic Footer placed 4.5mm from bottom of dynamic page
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`${footerLabel} · ${documentTitle}`, pageWidth / 2, pagePlan.pageHeight - 4.5, { align: 'center' });
  });
}

/**
 * Export PDF Study Pack:
 * - Slides preserve 100% of their native dimensions (no distortion or squishing).
 * - Notes pages have dynamic heights (cut 1 inch after last text, min 20% A4, max 100% A4).
 * - Fixes blank pages and missing notes bug.
 */
export async function exportStudyPackPDF(
  documentTitle: string,
  fileData: string | Blob,
  notes: Record<number, PageNote>,
  annotations: Record<number, AnnotationStroke[]>,
  onProgress?: (progressText: string) => void
) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  if (onProgress) onProgress('Loading original document...');
  const source = fileData instanceof Blob
    ? { data: new Uint8Array(await fileData.arrayBuffer()) }
    : fileData;
  const loadingTask = pdfjsLib.getDocument(source);
  const pdf = await loadingTask.promise;

  // Initialize jsPDF
  const doc = new jsPDF({ unit: 'mm', orientation: 'p' });

  // 1. Whole Document Notes (if any)
  const wholeDocNote = notes[0];
  if (hasNoteContent(wholeDocNote)) {
    if (onProgress) onProgress('Formatting whole-document notes...');
    const blocks: NoteBlock[] = wholeDocNote.blocks?.length
      ? wholeDocNote.blocks
      : wholeDocNote.content?.trim()
        ? [{ id: 'doc-legacy', content: wholeDocNote.content, createdAt: Date.now(), isAiGenerated: false }]
        : [];

    renderDynamicNotes(
      doc,
      blocks,
      'Whole-Document Study Notes',
      documentTitle,
      'Notes for full document'
    );
  }

  // 2. Export each slide + its corresponding notes
  for (let pageIdx = 1; pageIdx <= pdf.numPages; pageIdx++) {
    if (onProgress) onProgress(`Rendering slide ${pageIdx} of ${pdf.numPages}...`);

    const page = await pdf.getPage(pageIdx);
    // 72 points = 1 inch = 25.4 mm
    const defaultViewport = page.getViewport({ scale: 1.0 });
    const slideWidthMm = (defaultViewport.width * 25.4) / 72;
    const slideHeightMm = (defaultViewport.height * 25.4) / 72;

    // High quality canvas render (scale between 1.5 and 2.2)
    const renderScale = Math.min(2.5, Math.max(1.5, 1800 / Math.max(defaultViewport.width, defaultViewport.height)));
    const renderViewport = page.getViewport({ scale: renderScale });
    const canvas = window.document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;

    if (context) {
      await page.render({ canvasContext: context, viewport: renderViewport } as any).promise;
      drawAnnotationsOnCanvas(context, canvas.width, canvas.height, annotations[pageIdx] || []);
      const imgData = canvas.toDataURL('image/jpeg', 0.90);

      // Add slide page with EXACT native dimensions
      addCustomPage(doc, slideWidthMm, slideHeightMm);
      doc.addImage(imgData, 'JPEG', 0, 0, slideWidthMm, slideHeightMm);

      // Slide footer label
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${pageIdx} of ${pdf.numPages} · ${documentTitle}`, slideWidthMm / 2, slideHeightMm - 3.5, { align: 'center' });
    }

    // 3. Render Notes for this page (if any exist)
    const pageNote = notes[pageIdx];
    if (hasNoteContent(pageNote)) {
      if (onProgress) onProgress(`Formatting notes for page ${pageIdx}...`);
      const blocks: NoteBlock[] = pageNote.blocks?.length
        ? pageNote.blocks
        : pageNote.content?.trim()
          ? [{ id: `page-${pageIdx}-legacy`, content: pageNote.content, createdAt: Date.now(), isAiGenerated: false }]
          : [];

      renderDynamicNotes(
        doc,
        blocks,
        `Study Notes — Page ${pageIdx}`,
        documentTitle,
        `Notes for Page ${pageIdx}`
      );
    }
  }

  // Remove the initial blank page created by jsPDF constructor
  if (doc.getNumberOfPages() > 1) {
    doc.deletePage(1);
  }

  if (onProgress) onProgress('Saving Study Pack PDF...');
  const safeFileName = documentTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeFileName}_Study_Pack.pdf`);
}
