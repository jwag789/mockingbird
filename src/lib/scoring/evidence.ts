// Every quote on the scorecard must appear in what the candidate actually
// said. Quotes the model paraphrased or invented are dropped, not shown.

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”«»]/g, '"')
    .replace(/[’‘`]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function trimQuote(quote: string): string {
  return normalizeForMatch(quote)
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, "")
    .replace(/[.,;:!?]+$/, "")
    .trim();
}

/** Split quotes into those found verbatim in the source and those that weren't. */
export function verifyQuotes(
  quotes: string[],
  source: string,
): { verified: string[]; rejected: string[] } {
  const haystack = normalizeForMatch(source);
  const verified: string[] = [];
  const rejected: string[] = [];
  for (const quote of quotes) {
    const needle = trimQuote(quote);
    // Very short "quotes" (a word or two) prove nothing.
    if (needle.split(" ").length >= 3 && haystack.includes(needle)) verified.push(quote.trim());
    else rejected.push(quote);
  }
  return { verified, rejected };
}
