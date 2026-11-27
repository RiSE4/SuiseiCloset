import { normalizeKeyword } from '../../features/costumes/keywords';
import { MAX_INDEX_LENGTH, MAX_INDEX_TERMS, searchSource, serializeWordIndex, type SearchIndex, type SearchSource } from '../../lib/search-normalization/index-data';
import { compactSearchTerms } from '../../lib/search-normalization/compact';
import { validWordIndex, matchesWordIndex } from '../../lib/search-normalization/word-search';

/** 編集権限を持つクライアントの生成候補を保存 */
export function validSearchIndex(value: unknown): value is SearchIndex {
  if (!value || typeof value !== 'object')
    return false;

  const index = value as SearchIndex;
  const source = index.source;
  const validSource = Boolean(source) && typeof source.name === 'string' && source.name.length <= 150 &&
    typeof source.description === 'string' && source.description.length <= 4000 && Array.isArray(source.keywords) &&
    source.keywords.length <= 32 && source.keywords.every(value => typeof value === 'string' && value.length <= 80);

  if (!validSource) return false;
  if (index.version === 2) return validWordIndex(index);

  return index.version === 1 &&
    Array.isArray(index.terms) &&
    index.terms.length > 0 &&
    index.terms.length <= MAX_INDEX_TERMS &&
    index.terms.every(term => typeof term === 'string' &&
      term.length > 0 && term.length <= 20_000 &&
      !/\s/u.test(term) &&
      normalizeKeyword(term) === term) &&
    index.terms.join(' ').length <= MAX_INDEX_LENGTH;
}

export function searchTextFor(index: SearchIndex, source: SearchSource): string | null {
  const canonical = searchSource(source.name, source.keywords, source.description);

  if (index.source.name !== canonical.name || index.source.description !== canonical.description ||
    JSON.stringify(index.source.keywords) !== JSON.stringify(canonical.keywords)) return null;

  const originals = [canonical.name, ...canonical.keywords, canonical.description].map(normalizeKeyword).filter(Boolean);

  if (index.version === 2) {
    if (originals.some(value => !matchesWordIndex(index, value)))
      return null;

    return serializeWordIndex(index);
  }
  if (originals.some(value => !index.terms.some(term => term.includes(value)))) return null;
  // 旧クライアントが未圧縮の候補を送った場合も、保存前に同じ規則で整理
  return compactSearchTerms(index.terms).join(' ');
}
