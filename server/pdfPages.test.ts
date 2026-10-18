import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { deletePdfPage, insertPdfPages, removePageData } from '../src/utils/pdfPages.ts';
import type { PageNote } from '../src/types.ts';

test('Insert and remove PDF pages preserves the original and remaining page sizes', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([400, 600]); pdf.addPage([500, 700]); pdf.addPage([600, 800]);
  const original = new Blob([new Uint8Array(await pdf.save())]);
  const inserted = await insertPdfPages(original, 2);
  const deleted = await deletePdfPage(inserted.blob, 3);
  assert.deepEqual((await PDFDocument.load(await deleted.blob.arrayBuffer())).getPages().map(page => page.getWidth()), [400, 500, 600]);
  assert.equal((await PDFDocument.load(await original.arrayBuffer())).getPageCount(), 3);
  const last = await deletePdfPage(original, 3);
  assert.equal(last.totalPages, 2);
  await assert.rejects(() => deletePdfPage(original, 0), /valid page/);
  const one = await PDFDocument.create(); one.addPage();
  const singlePage = new Blob([new Uint8Array(await one.save())]);
  await assert.rejects(() => deletePdfPage(singlePage, 1), /at least one/);
});

test('Page deletion removes only its study data and remaps surviving references', () => {
  const note = (pageNumber: number) => ({ id: String(pageNumber), documentId: 'old', pageNumber, content: `Note ${pageNumber}`, aiHistory: [{ id: 'chat', references: [{ pageNumber: 2 }, { pageNumber: 3 }] }] }) as PageNote;
  const result = removePageData({ 0: note(0), 1: note(1), 2: note(2), 3: note(3) }, { 2: [], 3: [] }, 2, 'edited');
  assert.equal(result.notes[2].content, 'Note 3');
  assert.equal(result.notes[2].documentId, 'edited');
  assert.ok(result.notes[0]);
  assert.deepEqual(result.notes[2].aiHistory[0].references?.map(ref => ref.pageNumber), [2]);
  assert.deepEqual(Object.keys(result.annotations), ['2']);
});
