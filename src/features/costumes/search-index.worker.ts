import { createNormalizer } from '../../lib/search-normalization/normalizer';
import { createBrowserTokenizer } from '../../lib/search-normalization/browser-tokenizer';
import type { SearchSource } from '../../lib/search-normalization/index-data';
import { buildSearchIndex } from '../../lib/search-normalization/index-builder';
import datasetLock from '../../../scripts/search-normalization/dataset-lock.json';

const base = `${import.meta.env.BASE_URL}search-normalization/`;
let pending: Promise<ReturnType<typeof createNormalizer>> | undefined;

async function initialize() {
  const response = await fetch(`${base}dataset.jsonl`);

  if (!response.ok)
    throw new Error('検索用辞書を読み込めませんでした。再試行してください。');

  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');

  if (bytes.byteLength !== datasetLock.bytes || sha256 !== datasetLock.sha256)
    throw new Error('検索用辞書が一致しません');

  const data = new TextDecoder().decode(bytes);
  const english = new Map<string, string[]>();

  for (const line of data.trim().split('\n')) {
    const entry = JSON.parse(line) as { word: string; kata: string[] };
    english.set(entry.word.toLowerCase(), entry.kata);
  }
  const tokenizer = await createBrowserTokenizer(`${base}dict/`);
  return createNormalizer(tokenizer, english);
}
self.onmessage = async (event: MessageEvent<{ id: number; source: SearchSource }>) => {
  const { id, source } = event.data;
  try {
    pending ??= initialize().catch(error => { pending = undefined; throw error; });
    const normalize = await pending;
    self.postMessage({ id, index: buildSearchIndex(source, normalize) });
  } catch {
    self.postMessage({ id, error: '検索用の読み仮名を生成できませんでした。再試行してください。' });
  }
};
