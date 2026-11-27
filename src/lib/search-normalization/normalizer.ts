import { isHiragana, toHiragana, toRomaji } from 'wanakana';

export type Method = 'unicode' | 'kana' | 'kuromoji' | 'english-dictionary' | 'romaji' | 'fallback' | 'separator';
export interface JapaneseToken { surface_form: string; reading?: string }
export interface Tokenizer { tokenize(value: string): JapaneseToken[] }
export interface WordResult {
  surface: string;
  candidates: string[];
  methods: Method[];
  unconverted: string[];
  analysis?: JapaneseToken[];
}
export interface NormalizationResult {
  original: string;
  normalized: string;
  tokens: WordResult[];
  readings: string[];
  hiragana: string[];
  romaji: string[];
  searchTerms: string[];
  methods: Method[];
  unconverted: string[];
  truncated: boolean;
  elapsedMs: number;
}
export const MAX_INPUT_LENGTH = 10_000;
export const MAX_CANDIDATES = 32;
const unique = (values: string[]) => [...new Set(values)];

/** WanaKanaの再帰深度を抑え、長い説明文でもモーラの境界で区切って変換する。 */
export function romanizeReading(value: string): string {
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) return value;
  if (value.length <= 256) return toRomaji(value);
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(start + 128, value.length);
    while (end > start && end < value.length && (/[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮー]/u.test(value[end]) || /[っんッン]/u.test(value[end - 1]))) end--;
    if (end === start) end = Math.min(start + 128, value.length);
    chunks.push(toRomaji(value.slice(start, end))); start = end;
  }
  return chunks.join('');
}

/** 検索時にも使える軽量な正規化。解析器・英語辞書は不要。 */
export function normalizeSearchKey(value: string): string {
  return toHiragana(value.normalize('NFKC').toLowerCase(), { passRomaji: true, convertLongVowelMark: false }).replace(/\s+/gu, '');
}

/** 小文字化する前にCamelCaseと頭字語境界を分割する。 */
export function splitWords(value: string): string[] {
  const text = value.normalize('NFKC')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return text.match(/[A-Za-z]+(?:'[A-Za-z]+)*|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆]+|\d+|[\s\p{P}\p{S}]+|./gu) ?? [];
}

/** 読み生成は保存や検索から独立。呼び出し側が初期化済み辞書を渡す。 */
export function createNormalizer(tokenizer: Tokenizer, english: ReadonlyMap<string, readonly string[]>, maxCandidates = MAX_CANDIDATES) {
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) {
    throw new RangeError(`候補上限は1～${MAX_CANDIDATES}です`);
  }
  return (original: string): NormalizationResult => {
    if (original.length > MAX_INPUT_LENGTH) throw new RangeError(`入力は${MAX_INPUT_LENGTH}文字以内にしてください`);
    const start = performance.now();
    let truncated = false;
    const tokens: WordResult[] = splitWords(original).map(surface => {
      const normalized = normalizeSearchKey(surface);
      if (/^[\s\p{P}\p{S}]+$/u.test(surface)) {
        return { surface, candidates: [''], methods: ['separator'], unconverted: [] };
      }
      if (/^[A-Za-z]+(?:'[A-Za-z]+)*$/.test(surface)) {
        const candidates: string[] = [];
        const methods: Method[] = [];
        const dictionary = english.get(surface.toLowerCase());
        if (dictionary?.length) {
          candidates.push(...dictionary.map(normalizeSearchKey));
          methods.push('english-dictionary');
        }
        const romaji = surface.length <= 256 ? toHiragana(surface.toLowerCase()) : '';
        // 部分変換（crisis → cりしs等）を採用しない。
        if (isHiragana(romaji)) { candidates.push(romaji); methods.push('romaji'); }
        // 混在語の一部だけ読みへ置き換える候補（例: 数字＋英字＋漢字）も保持する。
        const converted = candidates.length > 0;
        const all = unique([...candidates, normalized].filter(Boolean));
        if (all.length > maxCandidates) truncated = true;
        return { surface, candidates: all.length ? all.slice(0, maxCandidates) : [normalized],
          methods: methods.length ? methods : ['fallback'], unconverted: converted ? [] : [surface] };
      }
      if (/\p{Script=Han}/u.test(surface)) {
        const unconverted: string[] = [];
        const words = tokenizer.tokenize(surface);
        const reading = words.map(word => {
          if (word.reading && word.reading !== '*') return normalizeSearchKey(word.reading);
          if (/\p{Script=Han}/u.test(word.surface_form)) unconverted.push(word.surface_form);
          return normalizeSearchKey(word.surface_form);
        }).join('');
        // 解析器が空や不完全な結果を返しても元の文字列を捨てない。
        if (!words.length || words.map(word => word.surface_form).join('') !== surface) {
          return { surface, candidates: [normalized], methods: ['fallback'], unconverted: [surface] };
        }
        return { surface, candidates: [reading], methods: unconverted.length ? ['kuromoji', 'fallback'] : ['kuromoji'], unconverted,
          analysis: words.map(({ surface_form, reading }) => ({ surface_form, reading })) };
      }
      if (/^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u.test(surface)) {
        return { surface, candidates: [normalized], methods: ['kana'], unconverted: [] };
      }
      const known = /^\d+$/.test(surface);
      return { surface, candidates: [normalized], methods: [known ? 'unicode' : 'fallback'], unconverted: known ? [] : [surface] };
    });
    let readings = [''];
    for (const token of tokens) {
      const next = new Set<string>();
      // 各段階で上限を適用するため、組み合わせ全体を展開しない。
      outer: for (const prefix of readings) for (const suffix of token.candidates) {
        const candidate = prefix + suffix;
        if (next.has(candidate)) continue;
        if (next.size === maxCandidates) { truncated = true; break outer; }
        next.add(candidate);
      }
      readings = [...next];
    }
    readings = readings.filter(Boolean);
    const normalized = normalizeSearchKey(original);
    const romaji = unique(readings.filter(value => !/\p{Script=Han}/u.test(value)).map(romanizeReading));
    return { original, normalized, tokens, readings, hiragana: readings.filter(isHiragana), romaji,
      searchTerms: unique([normalized, ...readings, ...romaji].filter(Boolean)),
      methods: unique(['unicode', ...tokens.flatMap(token => token.methods)]) as Method[],
      unconverted: unique(tokens.flatMap(token => token.unconverted)), truncated, elapsedMs: performance.now() - start };
  };
}
