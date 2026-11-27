import { normalizeKeyword } from '../../features/costumes/keywords.ts';
import { MAX_INDEX_LENGTH, MAX_INDEX_TERMS, MAX_INDEX_SLOTS, MAX_INDEX_REFERENCES, type WordIndex } from './index-data.ts';

export function validWordIndex(value: unknown): value is WordIndex {
  if (!value || typeof value !== 'object') return false;
  const index = value as WordIndex;
  if (index.version !== 2 || !Array.isArray(index.words) || !index.words.length || index.words.length > MAX_INDEX_TERMS ||
    !index.words.every(word => typeof word === 'string' && word.length <= 20_000 && !/\s/u.test(word) && normalizeKeyword(word) === word) ||
    new Set(index.words).size !== index.words.length || !Array.isArray(index.phrases) ||
    !index.phrases.length || index.phrases.length > 34) return false;
  let slots = 0, references = 0;
  for (const phrase of index.phrases) {
    if (!Array.isArray(phrase) || !phrase.length) return false;
    slots += phrase.length;
    if (slots > MAX_INDEX_SLOTS) return false;
    for (const choices of phrase) {
      if (!Array.isArray(choices) || !choices.length || choices.length > 65) return false;
      references += choices.length;
      if (references > MAX_INDEX_REFERENCES || !choices.every(id => Number.isInteger(id) && id >= 0 && id < index.words.length)) return false;
    }
  }
  return JSON.stringify({ version: 2, words: index.words, phrases: index.phrases }).length <= MAX_INDEX_LENGTH;
}

/** 一致したクエリの位置だけを共有し、読み候補の全組み合わせを展開しない。 */
export function matchesWordIndex(index: WordIndex, key: string): boolean {
  if (!key) return false;
  for (const phrase of index.phrases) {
    let positions = new Set<number>();
    for (const choices of phrase) {
      const next = new Set<number>();
      for (const id of choices) {
        const word = index.words[id];
        if (word.includes(key)) return true;
        for (const consumed of positions) {
          const remaining = key.slice(consumed);
          if (word.startsWith(remaining)) return true;
          if (remaining.startsWith(word)) next.add(consumed + word.length);
        }
        // 先頭・末尾の単語の途中からの部分一致も許可する。
        let start = word.indexOf(key[0], Math.max(0, word.length - key.length + 1));
        while (start !== -1) {
          const suffix = word.slice(start);
          if (key.startsWith(suffix)) next.add(suffix.length);
          start = word.indexOf(key[0], start + 1);
        }
      }
      positions = next;
    }
  }
  return false;
}

export function matchesSearchText(text: string, query: string): boolean {
  const key = normalizeKeyword(query);
  if (!key) return false;
  if (!text.startsWith('{"version":2,')) return text.includes(key);
  try {
    const index: unknown = JSON.parse(text);
    return validWordIndex(index) && matchesWordIndex(index, key);
  } catch { return false; }
}
