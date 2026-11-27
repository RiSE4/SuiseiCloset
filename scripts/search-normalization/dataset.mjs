import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const dataPath = fileURLToPath(new URL('../../.cache/search-normalization/dataset.jsonl', import.meta.url));
export const lock = JSON.parse(await readFile(new URL('./dataset-lock.json', import.meta.url), 'utf8'));
export function verifyDataset(data) {
  if (data.length !== lock.bytes || createHash('sha256').update(data).digest('hex') !== lock.sha256) {
    throw new Error('公開辞書のサイズまたはSHA-256が固定版と一致しません');
  }
}

export async function prepareDataset() {
  try {
    verifyDataset(await readFile(dataPath));
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(lock.url);
  if (!response.ok)
    throw new Error(`辞書取得失敗: HTTP ${response.status}`);

  const data = Buffer.from(await response.arrayBuffer());
  verifyDataset(data);
  await mkdir(new URL('../../.cache/search-normalization/', import.meta.url), { recursive: true });
  await writeFile(dataPath + '.tmp', data);
  await rename(dataPath + '.tmp', dataPath);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await prepareDataset();
  console.log(`固定辞書の準備完了: ${lock.revision} / ${lock.bytes} bytes / SHA-256検証済み`);
}
