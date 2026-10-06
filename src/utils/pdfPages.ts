import { PDFDocument } from 'pdf-lib';
import type { AnnotationStroke, PageNote } from '../types';

export async function insertPdfPages(source: Blob | string, afterPage: number, insertion?: Blob) {
  const data = source instanceof Blob ? await source.arrayBuffer() : await (await fetch(source)).arrayBuffer();
  const pdf = await PDFDocument.load(data);
  if (!Number.isInteger(afterPage) || afterPage < 1 || afterPage > pdf.getPageCount()) throw new Error('Choose a valid page first.');
  let added = 1;
  if (insertion) {
    const extra = await PDFDocument.load(await insertion.arrayBuffer());
    const pages = await pdf.copyPages(extra, extra.getPageIndices());
    if (!pages.length) throw new Error('This PDF has no pages.');
    pages.forEach((page, index) => pdf.insertPage(afterPage + index, page));
    added = pages.length;
  } else {
    const { width, height } = pdf.getPage(afterPage - 1).getSize();
    pdf.insertPage(afterPage, [width, height]);
  }
  const bytes = await pdf.save();
  return { blob: new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }), added, totalPages: pdf.getPageCount() };
}

export function shiftPageData(notes: Record<number, PageNote>, annotations: Record<number, AnnotationStroke[]>, after: number, count: number, documentId: string) {
  const shift = (page: number) => page > after ? page + count : page;
  return {
    notes: Object.fromEntries(Object.entries(notes).map(([key, note]) => {
      const pageNumber = shift(Number(key));
      return [pageNumber, { ...note, documentId, pageNumber, aiHistory: note.aiHistory.map(chat => ({ ...chat, references: chat.references?.map(ref => ({ ...ref, pageNumber: shift(ref.pageNumber) })) })) }];
    })) as Record<number, PageNote>,
    annotations: Object.fromEntries(Object.entries(annotations).map(([key, value]) => [shift(Number(key)), value])) as Record<number, AnnotationStroke[]>,
  };
}
