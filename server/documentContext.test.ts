import assert from 'node:assert/strict';
import test from 'node:test';
import { buildQuestionDocumentContext } from '../src/utils/documentContext.ts';

test('whole-document context retrieves a relevant page from late in the file', () => {
  const pages = Array.from({ length: 40 }, (_, index) => index === 36
    ? 'The rare backpropagation exception is explained with gradient clipping and numerical stability.'
    : `General lecture material for page ${index + 1}.`);
  const context = buildQuestionDocumentContext(pages, 'Explain the backpropagation exception and gradient clipping', 1, 'document');
  assert.match(context, /\[Page 37 detailed\]/);
  assert.ok(context.length <= 48_000);
});

test('page scope always prioritizes the current page', () => {
  const pages = ['first page', 'second page focused material', 'third page'];
  const context = buildQuestionDocumentContext(pages, 'summarize', 2, 'page');
  assert.ok(context.indexOf('[Page 2 detailed]') < context.indexOf('[Page 1 detailed]'));
});
