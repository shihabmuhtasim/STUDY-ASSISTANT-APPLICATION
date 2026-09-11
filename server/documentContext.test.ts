import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestionContextBundle, buildQuestionDocumentContext } from '../src/utils/documentContext.ts';

test('whole-document context retrieves a relevant page from late in the file', () => {
  const pages = Array.from({ length: 40 }, (_, index) => index === 36
    ? 'The rare backpropagation exception is explained with gradient clipping and numerical stability.'
    : `General lecture material for page ${index + 1}.`);
  const context = buildQuestionDocumentContext(pages, 'Explain the backpropagation exception and gradient clipping', 1, 'document');
  assert.match(context, /\[Page 37\]/);
  assert.ok(context.length <= 20_000);
});

test('page scope always prioritizes the current page', () => {
  const pages = ['first page', 'second page focused material', 'third page'];
  const context = buildQuestionDocumentContext(pages, 'summarize', 2, 'page');
  assert.ok(context.indexOf('[Page 2]') < context.indexOf('[Page 1]'));
});

test('reference mode returns numbered excerpts from the retrieved pages', () => {
  const pages = [
    'Course introduction and general information.',
    'The tenant address is 10 Cours de l Yser, 33800 Bordeaux. The lease begins in September.',
    'Payment instructions and signatures.',
  ];
  const bundle = buildQuestionContextBundle(pages, 'Where is the tenant address?', 1, 'document', true);
  assert.equal(bundle.references[0]?.pageNumber, 2);
  assert.match(bundle.references[0]?.quote || '', /10 Cours de l Yser/);
  assert.match(bundle.context, /\[Source 1 \| Page 2\]/);
});

test('direct whole-document questions use a compact evidence payload', () => {
  const pages = Array.from({ length: 200 }, (_, index) => `Page ${index + 1} lecture content ${'background '.repeat(100)}${index === 148 ? 'unique tensor address alpha' : ''}`);
  const bundle = buildQuestionContextBundle(pages, 'Where is the unique tensor address?', 1, 'document', true);
  assert.ok(bundle.context.length < 10_000);
  assert.equal(bundle.references[0]?.pageNumber, 149);
});

test('whole-document summaries cover every page in a typical document', () => {
  const pages = Array.from({ length: 17 }, (_, index) => `Distinct topic from page ${index + 1}.`);
  const context = buildQuestionDocumentContext(pages, 'Summarize the whole document', 1, 'document');
  for (let page = 1; page <= pages.length; page += 1) assert.match(context, new RegExp(`\\[Page ${page}\\]`));
});

test('manual page ranges restrict evidence while preserving original page numbers', () => {
  const pages = Array.from({ length: 8 }, (_, index) => `Material from page ${index + 1}.`);
  pages[4] = 'The selected pages explain max pooling and feature maps.';
  pages[7] = 'An unrelated page also mentions max pooling.';
  const bundle = buildQuestionContextBundle(pages, 'Explain max pooling', 5, 'page', true, 14_000, { start: 4, end: 6 });
  assert.match(bundle.context, /Page 5/);
  assert.doesNotMatch(bundle.context, /Page 8/);
  assert.ok(bundle.references.every((reference) => reference.pageNumber >= 4 && reference.pageNumber <= 6));
});
