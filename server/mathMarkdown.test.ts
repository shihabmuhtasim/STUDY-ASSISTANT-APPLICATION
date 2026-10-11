import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareMathMarkdown } from '../src/utils/mathMarkdown.ts';

test('Old bare text commands become readable without changing ordinary prose', () => {
  assert.equal(prepareMathMarkdown('It means: \\text{Total Facility Power} = \\text{IT Equipment Power}'), 'It means: Total Facility Power = IT Equipment Power');
  assert.equal(prepareMathMarkdown('The price is $20 and a code example is `\\text{x}`.'), 'The price is $20 and a code example is `\\text{x}`.');
});
test('Math delimiters and formulas are preserved or normalized', () => {
  assert.equal(prepareMathMarkdown('$\\frac{a}{b}$'), '$\\frac{a}{b}$');
  assert.equal(prepareMathMarkdown('\\(x^2\\)'), '$x^2$');
  assert.equal(prepareMathMarkdown('\\[x^2\\]'), '\n$$\nx^2\n$$\n');
  assert.equal(prepareMathMarkdown('$\\text{Power} = 1$'), '$\\text{Power} = 1$');
});
