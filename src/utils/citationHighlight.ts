function tokens(value: string) {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

export function findCitationSpanRange(spanTexts: string[], quote: string) {
  const targetTokens = tokens(quote);
  const flattened = spanTexts.flatMap((text, spanIndex) => tokens(text).map((token) => ({ token, spanIndex })));
  for (let length = Math.min(14, targetTokens.length); length >= Math.min(4, targetTokens.length); length -= 1) {
    for (let targetStart = 0; targetStart <= targetTokens.length - length; targetStart += 1) {
      const needle = targetTokens.slice(targetStart, targetStart + length);
      const start = flattened.findIndex((_, index) => needle.every((token, offset) => flattened[index + offset]?.token === token));
      if (start < 0) continue;
      return {
        firstSpan: flattened[start].spanIndex,
        lastSpan: flattened[start + length - 1].spanIndex,
      };
    }
  }
  return null;
}
