/** 正規化済み候補の完全重複と、別の候補に含まれる短い文字列を除く
 */
export function compactSearchTerms(terms: readonly string[]): string[] {
  const unique = [...new Set(terms.filter(Boolean))];
  const retained: string[] = [];
  // 長い候補から調べることで、包含関係が連鎖する場合も最後に残る候補で判定
  for (const term of [...unique].sort((a, b) => b.length - a.length)) {
    if (!retained.some(longer => longer.includes(term))) retained.push(term);
  }
  const keep = new Set(retained);
  return unique.filter(term => keep.has(term));
}
