// Older answers lost their delimiters. Repair text labels without touching code or valid math.
export function prepareMathMarkdown(value: string): string {
  return value.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    const delimited = part.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math}\n$$\n`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
    return delimited.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((segment, i) => i % 2 ? segment
      : segment.replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, '$1')).join('');
  }).join('');
}
