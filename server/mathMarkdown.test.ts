import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareMathMarkdown } from '../src/utils/mathMarkdown.ts';
import katex from 'katex';

test('Old bare text commands become readable without changing ordinary prose', () => {
  assert.equal(prepareMathMarkdown('It means: \\text{Total Facility Power} = \\text{IT Equipment Power}'), 'It means: Total Facility Power = IT Equipment Power');
  assert.equal(prepareMathMarkdown('The price is $20 and a code example is `\\text{x}`.'), 'The price is $20 and a code example is `\\text{x}`.');
});
test('Underscores in AI text labels render without KaTeX errors', () => {
  const formula = String.raw`\text{Embodied_GPU}_{\text{FU}} = \text{embodied_impact_GPU} \times \frac{\text{GPU_hours_training}}{\text{lifespan_hours}} \times \text{usage_rate}`;
  const prepared = prepareMathMarkdown(`Formula Breakdown: $${formula}$`);
  const math = prepared.slice(prepared.indexOf('$') + 1, prepared.lastIndexOf('$'));
  assert.doesNotThrow(() => katex.renderToString(math, { throwOnError: true }));
  assert.match(prepared, /Embodied\\_GPU/);
  assert.match(prepareMathMarkdown(`Formula Breakdown: ${formula}`), /\$\\text/);
  assert.equal(prepareMathMarkdown(`\`${formula}\``), `\`${formula}\``);
  assert.equal(prepareMathMarkdown('$x_i + y^2$'), '$x_i + y^2$');
});
test('Math delimiters and formulas are preserved or normalized', () => {
  assert.equal(prepareMathMarkdown('$\\frac{a}{b}$'), '$\\frac{a}{b}$');
  assert.equal(prepareMathMarkdown('\\(x^2\\)'), '$x^2$');
  assert.equal(prepareMathMarkdown('\\[x^2\\]'), '\n$$\nx^2\n$$\n');
  assert.equal(prepareMathMarkdown('$\\text{Power} = 1$'), '$\\text{Power} = 1$');
});
