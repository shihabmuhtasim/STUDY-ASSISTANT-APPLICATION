import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { prepareMathMarkdown } from '../utils/mathMarkdown';

export function MathMarkdown({ children }: { children: string }) {
  return <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, output: 'html' }]]}>{prepareMathMarkdown(children)}</Markdown>;
}
