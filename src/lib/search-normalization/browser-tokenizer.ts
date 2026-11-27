import KuromojiTokenizer from 'kuromoji/src/Tokenizer.js';
import DynamicDictionaries from 'kuromoji/src/dict/DynamicDictionaries.js';

/** 配信側がContent-Encodingでgzipを展開した場合も、未展開の場合も扱う。 */
async function loadBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('日本語辞書を読み込めませんでした');
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  return buffer;
}

/** Kuromoji 0.1.2の同梱辞書を、ブラウザ標準APIで一度だけ読み込む。 */
export async function createBrowserTokenizer(base: string) {
  const names = ['base', 'check', 'tid', 'tid_pos', 'tid_map', 'cc', 'unk', 'unk_pos', 'unk_map', 'unk_char', 'unk_compat', 'unk_invoke'];
  const [trieBase, check, tid, pos, map, cc, unk, unkPos, unkMap, chars, compat, invoke] = await Promise.all(
    names.map(name => loadBuffer(`${base}${name}.dat.gz`)));
  const dictionary = new DynamicDictionaries();
  dictionary.loadTrie(new Int32Array(trieBase), new Int32Array(check));
  dictionary.loadTokenInfoDictionaries(new Uint8Array(tid), new Uint8Array(pos), new Uint8Array(map));
  dictionary.loadConnectionCosts(new Int16Array(cc));
  dictionary.loadUnknownDictionaries(new Uint8Array(unk), new Uint8Array(unkPos), new Uint8Array(unkMap),
    new Uint8Array(chars), new Uint32Array(compat), new Uint8Array(invoke));
  return new KuromojiTokenizer(dictionary);
}
