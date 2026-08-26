import jsPDF from 'jspdf';
import { PageNote, NoteBlock } from '../types';

interface CleanLine {
  text: string;
  type: 'h1' | 'h2' | 'h3' | 'bullet' | 'normal' | 'question';
  raw: string;
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

/**
 * Export PDF Study Pack with high-resolution page images and beautifully styled note boxes
 */
export async function exportStudyPackPDF(
  documentTitle: string,
  fileData: string,
  notes: Record<number, PageNote>,
  onProgress?: (progressText: string) => void
) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  if (onProgress) onProgress("Loading document...");
  const loadingTask = pdfjsLib.getDocument(fileData);
  const pdf = await loadingTask.promise;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const contentWidth = pageWidth - margin * 2;

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
      const imgData = canvas.toDataURL('image/jpeg', 0.85);

      if (pageIdx > 1) doc.addPage();

      const imgProps = doc.getImageProperties(imgData);
      const pdfRatio = imgProps.width / imgProps.height;
      const targetRatio = contentWidth / (pageHeight - margin * 2);

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
      doc.text(`Page ${pageIdx} of ${pdf.numPages} — ${documentTitle}`, pageWidth / 2, pageHeight - 6, { align: 'center' });

      // 2. Render Formatted Notes Page if notes exist for this page
      const pageNote = notes[pageIdx];
      const hasContent = pageNote && (pageNote.content?.trim() || (pageNote.blocks && pageNote.blocks.length > 0));

      if (hasContent) {
        doc.addPage();
        let currentY = margin;

        // Notes Header Banner
        doc.setFillColor(243, 244, 246); // slate-100
        doc.roundedRect(margin, currentY, contentWidth, 14, 3, 3, 'F');
        
        doc.setFillColor(79, 70, 229); // indigo-600 left accent bar
        doc.rect(margin, currentY, 4, 14, 'F');

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59); // slate-800
        doc.text(`Study Notes — Page ${pageIdx}`, margin + 8, currentY + 9.5);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(documentTitle, pageWidth - margin - 5, currentY + 9.5, { align: 'right' });

        currentY += 20;

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

        // Render each note block in a clean card container
        for (let bIdx = 0; bIdx < blocksToRender.length; bIdx++) {
          const block = blocksToRender[bIdx];
          const isAi = block.isAiGenerated;

          const parsedLines = parseMarkdownToCleanLines(block.content);
          if (block.question) {
            parsedLines.unshift({
              text: `Q: ${stripMarkdown(block.question)}`,
              type: 'question',
              raw: block.question
            });
          }

          // Calculate height needed for this block
          let blockHeight = 12; // Base padding top/bottom
          const linesToDraw: { text: string; type: string; indent: number; fontSize: number; isBold: boolean }[] = [];

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
              textToWrap = `• ${item.text}`;
            }

            doc.setFontSize(fontSize);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');

            const maxW = contentWidth - 12 - indent;
            const wrapped = doc.splitTextToSize(textToWrap, maxW);

            for (const lineStr of wrapped) {
              linesToDraw.push({
                text: lineStr,
                type: item.type,
                indent,
                fontSize,
                isBold
              });
              blockHeight += (fontSize * 0.45) + 2;
            }
            blockHeight += 1.5; // gap between paragraphs
          }

          // Check page overflow
          if (currentY + blockHeight > pageHeight - margin) {
            doc.addPage();
            currentY = margin;
          }

          // Draw note card background box
          const boxY = currentY;
          const cardBgColor = isAi ? [245, 247, 255] : [248, 250, 252]; // soft indigo vs soft slate
          const cardBorderColor = isAi ? [224, 231, 255] : [226, 232, 240];
          const accentColor = isAi ? [99, 102, 241] : [16, 185, 129]; // indigo vs emerald

          doc.setFillColor(cardBgColor[0], cardBgColor[1], cardBgColor[2]);
          doc.setDrawColor(cardBorderColor[0], cardBorderColor[1], cardBorderColor[2]);
          doc.setLineWidth(0.3);
          doc.roundedRect(margin, boxY, contentWidth, blockHeight, 2, 2, 'FD');

          // Draw left accent bar on card
          doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
          doc.rect(margin, boxY, 2.5, blockHeight, 'F');

          // Render lines inside the card
          let textY = boxY + 7;

          for (const l of linesToDraw) {
            doc.setFontSize(l.fontSize);
            doc.setFont('helvetica', l.isBold ? 'bold' : 'normal');

            if (l.type === 'question') {
              doc.setTextColor(67, 56, 202); // indigo-700
            } else if (l.type === 'h1' || l.type === 'h2' || l.type === 'h3') {
              doc.setTextColor(30, 41, 59); // slate-800
            } else {
              doc.setTextColor(51, 65, 85); // slate-700
            }

            doc.text(l.text, margin + 6 + l.indent, textY);
            textY += (l.fontSize * 0.45) + 2;
          }

          currentY += blockHeight + 6; // Space after block
        }

        // Footer on notes page
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(148, 163, 184);
        doc.text(`Notes for Page ${pageIdx} — ${documentTitle}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
      }
    }
  }

  doc.save(`${documentTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_Study_Pack.pdf`);
}
