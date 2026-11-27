export interface SearchSource { name: string; keywords: string[]; description: string }
export interface FlatSearchIndex { version: 1; source: SearchSource; terms: string[] }
export interface WordIndex { version: 2; words: string[]; phrases: number[][][] }
export interface WordSearchIndex extends WordIndex { source: SearchSource }
export type SearchIndex = FlatSearchIndex | WordSearchIndex;
export const MAX_INDEX_LENGTH = 150_000;
export const MAX_INDEX_TERMS = 2500;
export const MAX_INDEX_SLOTS = 10_000;
export const MAX_INDEX_REFERENCES = 50_000;

export function searchSource(name: string, keywords: readonly string[], description = ''): SearchSource {
  return { name: name.trim(), keywords: keywords.map(value => value.trim()), description: description.trim() };
}

export function serializeWordIndex(index: WordIndex): string {
  return JSON.stringify({ version: 2, words: index.words, phrases: index.phrases });
}
