import { normalizeKeyword } from '../../features/costumes/keywords.ts';
import { romanizeReading, type NormalizationResult } from './normalizer.ts';
import { MAX_INDEX_LENGTH, MAX_INDEX_TERMS, MAX_INDEX_SLOTS, MAX_INDEX_REFERENCES,
  serializeWordIndex, type SearchSource, type WordSearchIndex } from './index-data.ts';

/** 単語は全項目で共有し、連結した全文候補を展開せずに並び順と選択肢を保存する。 */
export function buildSearchIndex(source: SearchSource, normalize: (value: string) => NormalizationResult): WordSearchIndex {
  const words: string[] = [];
  const ids = new Map<string, number>();
  const phrases: number[][][] = [];
  const seen = new Set<string>();
  let slots = 0, references = 0;
  const wordId = (value: string) => {
    const existing = ids.get(value);
    if (existing !== undefined) return existing;
    const id = words.length;
    ids.set(value, id); words.push(value);
    return id;
  };
  for (const value of [source.name, ...source.keywords, source.description].filter(Boolean)) {
    const phrase: number[][] = [];
    const groups: { candidates: string[]; separator: boolean }[] = [];
    for (const token of normalize(value).tokens) {
      const original = normalizeKeyword(token.surface);
      let candidates: string[];
      if (token.methods.includes('separator')) {
        if (!original) continue;
        candidates = [original, ''];
      } else {
        candidates = [...new Set([original, ...token.candidates,
          ...token.candidates.filter(value => !/\p{Script=Han}/u.test(value)).map(romanizeReading)]
          .map(normalizeKeyword).filter(Boolean))];
      }
      if (candidates.length) groups.push({ candidates, separator: token.methods.includes('separator') });
    }
    const following = new Array<typeof groups[number] | undefined>(groups.length);
    let next: typeof groups[number] | undefined;
    for (let i = groups.length - 1; i >= 0; i--) {
      following[i] = next;
      if (!groups[i].separator) next = groups[i];
    }
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      phrase.push(group.candidates.map(wordId));
      // 「ん」＋母音等を別単語にした場合も、連結時のn'aなどで検索できる。
      if (!group.separator && group.candidates.some(value => value.endsWith('n')) &&
        following[i]?.candidates.some(value => /^[aiueoy]/.test(value))) phrase.push(['', "'"].map(wordId));
    }
    const key = JSON.stringify(phrase);
    if (phrase.length && !seen.has(key)) {
      seen.add(key); phrases.push(phrase);
      slots += phrase.length;
      references += phrase.reduce((sum, slot) => sum + slot.length, 0);
    }
  }
  const index: WordSearchIndex = { version: 2, source, words, phrases };
  if (words.length > MAX_INDEX_TERMS || slots > MAX_INDEX_SLOTS || references > MAX_INDEX_REFERENCES ||
    serializeWordIndex(index).length > MAX_INDEX_LENGTH) throw new RangeError('検索用データが上限を超えました');
  return index;
}
