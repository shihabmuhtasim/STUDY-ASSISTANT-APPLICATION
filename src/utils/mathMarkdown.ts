// Older answers lost their delimiters. Repair text labels without touching code or valid math.
export function prepareMathMarkdown(value: string): string {
  const repairLabels = (math: string) => math.replace(/\\(text|mathrm|operatorname)\{([^{}]*)\}/g,
    (_, command, label) => `\\${command}{${label.replace(/(?<!\\)_/g, '\\_')}}`);
  return value.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    const delimited = part.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math}\n$$\n`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math}$`);
    return delimited.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((segment, i) => {
      if (i % 2) return repairLabels(segment);
      return segment.split('\n').map(line => {
        // Recover legacy equations that arrived without math delimiters.
        if (/\\(?:frac|times|cdot|sum|sqrt)\b/.test(line)) {
          const start = line.search(/\\[a-zA-Z]+/);
          return `${line.slice(0, start)}$${repairLabels(line.slice(start))}$`;
        }
        return line.replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, '$1');
      }).join('\n');
    }).join('');
  }).join('');
}
