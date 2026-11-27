import { mkdir, readFile, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { root, dataPath, verifyDataset } from './dataset.mjs';

// 開発・ビルド時のみ
let data;
try {
    data = await readFile(dataPath);
} catch {
    throw new Error('検索辞書がありません。npm run search:prepare を実行してください');
}

verifyDataset(data);
const target = join(root, 'public/search-normalization');

await mkdir(target, { recursive: true });
await cp(dataPath, join(target, 'dataset.jsonl'));
await cp(join(root, 'node_modules/kuromoji/dict'), join(target, 'dict'), { recursive: true });
console.log('検索用辞書を同一オリジン配信用に準備しました');
