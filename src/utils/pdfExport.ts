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

function richContentToStructuredText(value: string): string {
  if (!value) return '';

  const withStructure = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<h1\b[^>]*>/gi, '\n# ')
    .replace(/<h2\b[^>]*>/gi, '\n## ')
    .replace(/<h3\b[^>]*>/gi, '\n### ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:h1|h2|h3|li|p|div|ul|ol)>/gi, '\n');

  const parsed = new DOMParser().parseFromString(withStructure, 'text/html');
  return (parsed.body.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
  Parse markdown string into structured text lines for jsPDF rendering
 */
export function parseMarkdownToCleanLines(text: string): CleanLine[] {
  if (!text) return [];

  const rawLines = richContentToStructuredText(text).split('\n');
  const cleanLines: CleanLine[] = [];

  for (let line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('# ')) {
      cleanLines.push({
        text: stripMarkdown(trimmed.substring(2)),
        type: 'h1',
        raw: line,
      });
    } else if (trimmed.startsWith('## ')) {
      cleanLines.push({
        text: stripMarkdown(trimmed.substring(3)),
        type: 'h2',
        raw: line,
      });
    } else if (trimmed.startsWith('### ')) {
      cleanLines.push({
        text: stripMarkdown(trimmed.substring(4)),
        type: 'h3',
        raw: line,
      });
    } else if (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('+ ')) {
      cleanLines.push({
        text: stripMarkdown(trimmed.substring(2)),
        type: 'bullet',
        raw: line,
      });
    } else if (/^\d+\.\s/.test(trimmed)) {
      const match = trimmed.match(/^\d+\.\s/);
      const prefix = match ? match[0] : '';
      cleanLines.push({
        text: `${prefix}${stripMarkdown(trimmed.substring(prefix.length))}`,
        type: 'bullet',
        raw: line,
      });
    } else {
      cleanLines.push({
        text: stripMarkdown(trimmed),
        type: 'normal',
        raw: line,
      });
    }
  }

  return cleanLines;
}

/**
 * Strips markdown symbols like **, *, `, ### while preserving text
 */
export function stripMarkdown(text: string): string {
  if (!text) return '';
  return richContentToStructuredText(text)
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/___(.*?)___/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/^#+\s*/g, '')
    .trim();
}

function hasNoteContent(note?: PageNote) {
  return Boolean(note && (note.content?.trim() || note.blocks?.length));
}

function renderWholeDocumentNotes(doc: jsPDF, note: PageNote, documentTitle: string) {
  const margin = 15;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const contentWidth = pageWidth - margin * 2;
  const notesTop = margin + 27;
  const notesBottom = pageHeight - margin;
  const cardPadding = 11;
  const cardGap = 6;
  let currentY = notesTop;
  let pageCount = 0;

  const finalizePage = () => {
    const compactHeight = Math.min(pageHeight, Math.max(72, currentY - cardGap + 25.4));
    doc.internal.pageSize.height = compactHeight;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(148, 163, 184);
    doc.text(`Whole-document notes - ${documentTitle}`, pageWidth / 2, compactHeight - 6, { align: 'center' });
  };

  const startPage = (continued: boolean) => {
    if (pageCount > 0) {
      finalizePage();
      doc.addPage('a4', 'portrait');
    }
    pageCount += 1;
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, margin, contentWidth, 20, 3, 3, 'F');
    doc.setFillColor(79, 70, 229);
    doc.rect(margin, margin, 4, 20, 'F');
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`Notes about the whole document${continued ? ' (continued)' : ''}`, margin + 8, margin + 9);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text((doc.splitTextToSize(documentTitle, contentWidth - 16) as string[])[0] || documentTitle, margin + 8, margin + 15);
    currentY = notesTop;
  };

  const blocks: NoteBlock[] = note.blocks?.length
    ? note.blocks
    : note.content?.trim()
      ? [{ id: 'document-legacy', content: note.content, createdAt: Date.now(), isAiGenerated: false }]
      : [];

  startPage(false);
  for (const block of blocks) {
    const parsedLines = parseMarkdownToCleanLines(block.content);
    if (block.question) parsedLines.unshift({ text: `Q: ${stripMarkdown(block.question)}`, type: 'question', raw: block.question });
    const lines: RenderLine[] = [];
    for (const item of parsedLines) {
      const heading = item.type === 'question' || item.type === 'h1' || item.type === 'h2' || item.type === 'h3';
      const fontSize = item.type === 'h1' || item.type === 'h2' ? 12 : heading ? 11 : 10;
      const indent = item.type === 'bullet' ? 6 : 0;
      const text = item.type === 'bullet' ? `- ${item.text}` : item.text;
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', heading ? 'bold' : 'normal');
      const wrapped = doc.splitTextToSize(text, contentWidth - 12 - indent) as string[];
      wrapped.forEach((line, index) => lines.push({ text: line, type: item.type, indent, fontSize, isBold: heading, height: fontSize * 0.45 + 2, gapAfter: index === wrapped.length - 1 ? 1.5 : 0 }));
    }

    let lineIndex = 0;
    while (lineIndex < lines.length) {
      const available = notesBottom - currentY - cardPadding;
      let chunkHeight = 0;
      let chunkEnd = lineIndex;
      while (chunkEnd < lines.length) {
        const nextHeight = lines[chunkEnd].height + lines[chunkEnd].gapAfter;
        if (chunkEnd > lineIndex && chunkHeight + nextHeight > available) break;
        if (chunkEnd === lineIndex && nextHeight > available) break;
        chunkHeight += nextHeight;
        chunkEnd += 1;
      }
      if (chunkEnd === lineIndex) {
        startPage(true);
        continue;
      }

      const blockHeight = cardPadding + chunkHeight;
      const isAi = Boolean(block.isAiGenerated);
      doc.setFillColor(isAi ? 245 : 248, isAi ? 247 : 250, isAi ? 255 : 252);
      doc.setDrawColor(isAi ? 224 : 226, isAi ? 231 : 232, isAi ? 255 : 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, currentY, contentWidth, blockHeight, 2, 2, 'FD');
      doc.setFillColor(isAi ? 99 : 16, isAi ? 102 : 185, isAi ? 241 : 129);
      doc.rect(margin, currentY, 2.5, blockHeight, 'F');
      let textY = currentY + 7;
      for (const line of lines.slice(lineIndex, chunkEnd)) {
        doc.setFontSize(line.fontSize);
        doc.setFont('helvetica', line.isBold ? 'bold' : 'normal');
        doc.setTextColor(line.type === 'question' ? 67 : 51, line.type === 'question' ? 56 : 65, line.type === 'question' ? 202 : 85);
        doc.text(line.text, margin + 6 + line.indent, textY);
        textY += line.height + line.gapAfter;
      }
      currentY += blockHeight + cardGap;
      lineIndex = chunkEnd;
      if (lineIndex < lines.length) startPage(true);
    }
  }
  finalizePage();
}

/**
 * Export PDF Study Pack with high-resolution page images and beautifully styled note boxes
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

  if (onProgress) onProgress("Loading document...");
  const source = fileData instanceof Blob
    ? { data: new Uint8Array(await fileData.arrayBuffer()) }
    : fileData;
  const loadingTask = pdfjsLib.getDocument(source);
  const pdf = await loadingTask.promise;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const contentWidth = pageWidth - margin * 2;
  const hasWholeDocumentNotes = hasNoteContent(notes[0]);
  if (hasWholeDocumentNotes) {
    if (onProgress) onProgress('Formatting whole-document notes...');
    renderWholeDocumentNotes(doc, notes[0], documentTitle);
  }

  for (let pageIdx = 1; pageIdx <= pdf.numPages; pageIdx++) {
    if (onProgress) onProgress(`Rendering page ${pageIdx} of ${pdf.numPages}...`);

    // 1. Render original PDF page
    const page = await pdf.getPage(pageIdx);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = window.document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (context) {
      await page.render({ canvasContext: context, viewport } as any).promise;
      drawAnnotationsOnCanvas(context, canvas.width, canvas.height, annotations[pageIdx] || []);
      const imgData = canvas.toDataURL('image/jpeg', 0.85);

      if (pageIdx > 1 || hasWholeDocumentNotes) doc.addPage('a4', 'portrait');

      const imgProps = doc.getImageProperties(imgData);
      const pdfRatio = imgProps.width / imgProps.height;
      let renderWidth = contentWidth;
      let renderHeight = contentWidth / pdfRatio;

      if (renderHeight > pageHeight - margin * 2) {
        renderHeight = pageHeight - margin * 2;
        renderWidth = renderHeight * pdfRatio;
      }

      const xOffset = (pageWidth - renderWidth) / 2;
      const yOffset = margin;

      doc.addImage(imgData, 'JPEG', xOffset, yOffset, renderWidth, renderHeight);
      
      // Footer page number label on PDF slide page
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Page ${pageIdx} of ${pdf.numPages} - ${documentTitle}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

      // 2. Render Formatted Notes Page if notes exist for this page
      const pageNote = notes[pageIdx];
      const hasContent = pageNote && (pageNote.content?.trim() || (pageNote.blocks && pageNote.blocks.length > 0));

      if (hasContent) {
        const notesTop = margin + 20;
        const notesBottom = pageHeight - margin;
        const cardPadding = 11;
        const cardGap = 6;
        let currentY = notesTop;
        let notesPageCount = 0;

        const finalizeNotesPage = () => {
          const compactHeight = Math.min(pageHeight, Math.max(66, currentY - cardGap + 25.4));
          doc.internal.pageSize.height = compactHeight;
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(148, 163, 184);
          doc.text(`Notes for Page ${pageIdx} - ${documentTitle}`, pageWidth / 2, compactHeight - 6, { align: 'center' });
        };

        const startNotesPage = (continued: boolean) => {
          if (notesPageCount > 0) finalizeNotesPage();
          doc.addPage('a4', 'portrait');
          notesPageCount += 1;

          doc.setFillColor(243, 244, 246);
          doc.roundedRect(margin, margin, contentWidth, 14, 3, 3, 'F');
          doc.setFillColor(79, 70, 229);
          doc.rect(margin, margin, 4, 14, 'F');

          doc.setFontSize(13);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(30, 41, 59);
          doc.text(`Study Notes - Page ${pageIdx}${continued ? ' (continued)' : ''}`, margin + 8, margin + 9.5);

          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(100, 116, 139);
          const titleLine = (doc.splitTextToSize(documentTitle, 62) as string[])[0] || documentTitle;
          doc.text(titleLine, pageWidth - margin - 5, margin + 9.5, { align: 'right' });
          currentY = notesTop;
        };

        startNotesPage(false);

        // Build list of blocks to render
        let blocksToRender: NoteBlock[] = [];
        if (pageNote.blocks && pageNote.blocks.length > 0) {
          blocksToRender = pageNote.blocks;
        } else if (pageNote.content?.trim()) {
          blocksToRender = [{
            id: 'legacy-1',
            content: pageNote.content,
            createdAt: Date.now(),
            isAiGenerated: false
          }];
        }

        for (const block of blocksToRender) {
          const isAi = Boolean(block.isAiGenerated);

          const parsedLines = parseMarkdownToCleanLines(block.content);
          if (block.question) {
            parsedLines.unshift({
              text: `Q: ${stripMarkdown(block.question)}`,
              type: 'question',
              raw: block.question
            });
          }

          const linesToDraw: RenderLine[] = [];

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
              fontSize = 11;
              isBold = true;
              indent = 0;
            } else if (item.type === 'bullet') {
              fontSize = 10;
              isBold = false;
              indent = 6;
              textToWrap = `- ${item.text}`;
            }

            doc.setFontSize(fontSize);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');

            const maxW = contentWidth - 12 - indent;
            const wrapped = doc.splitTextToSize(textToWrap, maxW);

            wrapped.forEach((lineStr: string, index: number) => {
              linesToDraw.push({
                text: lineStr,
                type: item.type,
                indent,
                fontSize,
                isBold,
                height: (fontSize * 0.45) + 2,
                gapAfter: index === wrapped.length - 1 ? 1.5 : 0,
              });
            });
          }

          if (linesToDraw.length === 0) continue;
          const cardBgColor = isAi ? [245, 247, 255] : [248, 250, 252]; // soft indigo vs soft slate
          const cardBorderColor = isAi ? [224, 231, 255] : [226, 232, 240];
          const accentColor = isAi ? [99, 102, 241] : [16, 185, 129]; // indigo vs emerald
          const totalBlockHeight = cardPadding + linesToDraw.reduce((height, line) => height + line.height + line.gapAfter, 0);
          const freshPageCapacity = notesBottom - notesTop;

          if (totalBlockHeight <= freshPageCapacity && currentY + totalBlockHeight > notesBottom) {
            startNotesPage(true);
          }

          let lineIndex = 0;
          while (lineIndex < linesToDraw.length) {
            const availableLineHeight = notesBottom - currentY - cardPadding;
            let chunkHeight = 0;
            let chunkEnd = lineIndex;

            while (chunkEnd < linesToDraw.length) {
              const nextLine = linesToDraw[chunkEnd];
              const nextHeight = nextLine.height + nextLine.gapAfter;
              if (chunkEnd > lineIndex && chunkHeight + nextHeight > availableLineHeight) break;
              if (chunkEnd === lineIndex && nextHeight > availableLineHeight) break;
              chunkHeight += nextHeight;
              chunkEnd += 1;
            }

            if (chunkEnd === lineIndex) {
              startNotesPage(true);
              continue;
            }

            const blockHeight = cardPadding + chunkHeight;
            const boxY = currentY;
            doc.setFillColor(cardBgColor[0], cardBgColor[1], cardBgColor[2]);
            doc.setDrawColor(cardBorderColor[0], cardBorderColor[1], cardBorderColor[2]);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, boxY, contentWidth, blockHeight, 2, 2, 'FD');
            doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
            doc.rect(margin, boxY, 2.5, blockHeight, 'F');

            let textY = boxY + 7;
            for (const line of linesToDraw.slice(lineIndex, chunkEnd)) {
              doc.setFontSize(line.fontSize);
              doc.setFont('helvetica', line.isBold ? 'bold' : 'normal');
              if (line.type === 'question') doc.setTextColor(67, 56, 202);
              else if (line.type === 'h1' || line.type === 'h2' || line.type === 'h3') doc.setTextColor(30, 41, 59);
              else doc.setTextColor(51, 65, 85);
              doc.text(line.text, margin + 6 + line.indent, textY);
              textY += line.height + line.gapAfter;
            }

            currentY += blockHeight + cardGap;
            lineIndex = chunkEnd;
            if (lineIndex < linesToDraw.length) startNotesPage(true);
          }
        }

        finalizeNotesPage();
      }
    }
  }

  doc.save(`${documentTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_Study_Pack.pdf`);
}
