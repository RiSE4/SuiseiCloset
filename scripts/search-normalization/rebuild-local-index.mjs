import assert from 'node:assert/strict';
import { readFile, readdir, realpath, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createNormalizer } from '../../src/lib/search-normalization/normalizer.ts';
import { DatabaseSync } from 'node:sqlite';
import { buildSearchIndex } from '../../src/lib/search-normalization/index-builder.ts';
import { searchSource, serializeWordIndex } from '../../src/lib/search-normalization/index-data.ts';
import { matchesSearchText, validWordIndex } from '../../src/lib/search-normalization/word-search.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dataPath = join(root, '.cache/search-normalization/dataset.jsonl');
const lock = JSON.parse(await readFile(new URL('./dataset-lock.json', import.meta.url), 'utf8'));
function verifyDataset(data) {
  if (data.length !== lock.bytes || createHash('sha256').update(data).digest('hex') !== lock.sha256) {
    throw new Error('公開辞書のサイズまたはSHA-256が固定版と一致しません');
  }
}


const require = createRequire(import.meta.url);
let pending;
/** 同時呼び出しを含め、解析器とMapをプロセスごとに一度だけ初期化する。 */
export function loadNormalizer() {
  pending ??= initialize().catch(error => { pending = undefined; throw error; });
  return pending;
}

async function initialize() {
  let data;
  try { data = await readFile(dataPath); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error('辞書がありません。npm run search:prepare を先に実行してください');
    throw error;
  }
  verifyDataset(data);
  const english = new Map();
  let rows = 0;
  for (const line of data.toString('utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (typeof entry.word !== 'string' || !Array.isArray(entry.kata) || entry.kata.some(k => typeof k !== 'string' || !/^[\p{Script=Katakana}ー]+$/u.test(k))) {
      throw new Error(`辞書の構造が不正です: line ${rows + 1}`);
    }
    const key = entry.word.normalize('NFKC').toLowerCase();
    english.set(key, [...new Set([...(english.get(key) ?? []), ...entry.kata])]);
    rows++;
  }
  const kuromoji = require('kuromoji');
  const tokenizer = await new Promise((resolve, reject) => kuromoji.builder({
    dicPath: join(dirname(require.resolve('kuromoji/package.json')), 'dict'),
  }).build((error, value) => error ? reject(error) : resolve(value)));
  return { normalize: createNormalizer(tokenizer, english) };
}


async function findDatabases(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? findDatabases(join(directory, entry.name))
    : entry.name.endsWith('.sqlite') && entry.name !== 'metadata.sqlite' ? [join(directory, entry.name)] : []));
  return nested.flat();
}

/** 接続先をこのプロジェクトの既存ローカルD1に限定する。 */
export async function localDatabasePath() {
  const directory = join(root, '.wrangler/state/v3/d1');
  let paths;
  try { paths = await findDatabases(directory); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!paths.length) return null;
  if (paths.length !== 1) throw new Error('ローカルD1が複数あります。対象DBを特定できません');
  const path = await realpath(paths[0]);
  const part = relative(await realpath(directory), path);
  const workspacePart = relative(await realpath(root), path);
  if (part.startsWith('..') || isAbsolute(part) || workspacePart.startsWith('..') || isAbsolute(workspacePart) ||
    extname(path) !== '.sqlite') throw new Error('ローカルD1以外は参照できません');
  return path;
}


const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error('npm run search:rebuild:local -- [--apply]（既定は読み取り専用の検証）');
const apply = args.includes('--apply');
const path = await localDatabasePath();
if (!path) throw new Error('既存のローカルD1がありません');
const read = new DatabaseSync(path, { readOnly: true });
let rows;
try { rows = read.prepare('SELECT * FROM costume ORDER BY id').all(); } finally { read.close(); }
const { normalize } = await loadNormalizer();
const start = performance.now();
let beforeBytes = 0, afterBytes = 0, words = 0, legacyQueries = 0;
const converted = rows.map(row => {
  const index = buildSearchIndex(searchSource(row.name, JSON.parse(row.keywords_json), row.description), normalize);
  assert(validWordIndex(index), '生成した単語索引が有効であること');
  const text = serializeWordIndex(index);
  if (!row.search_text.startsWith('{"version":2,')) for (const query of row.search_text.split(' ').filter(Boolean)) {
    assert(matchesSearchText(text, query), '既存の検索候補を維持できません。更新を中止しました'); legacyQueries++;
  }
  for (const value of [index.source.name, ...index.source.keywords, index.source.description].filter(Boolean)) {
    assert(matchesSearchText(text, value), '元の項目でも検索できること');
  }
  beforeBytes += Buffer.byteLength(row.search_text); afterBytes += Buffer.byteLength(text); words += index.words.length;
  return { id: row.id, text };
});
const summary = { mode: apply ? 'apply' : 'read-only', costumes: rows.length,
  changed: converted.filter((row, i) => row.text !== rows[i].search_text).length,
  beforeBytes, afterBytes, words, verifiedLegacyQueries: legacyQueries, generationAndVerificationMs: performance.now() - start };
if (apply) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE');
  let committed = false;
  try {
    assert.deepEqual(db.prepare('SELECT * FROM costume ORDER BY id').all(), rows, '生成中にDBが変更されました。再実行してください');
    const directory = join(root, '.backups/search-normalization');
    await mkdir(directory, { recursive: true });
    const backup = join(directory, `search-index-before-words-${Date.now()}.json`);
    await writeFile(backup, JSON.stringify({ database: relative(root, path), rows: rows.map(row => ({ id: row.id, search_text: row.search_text })) }, null, 2), { flag: 'wx' });
    const update = db.prepare('UPDATE costume SET search_text = ? WHERE id = ?');
    for (const row of converted) assert.equal(update.run(row.text, row.id).changes, 1);
    const after = db.prepare('SELECT * FROM costume ORDER BY id').all();
    const others = records => records.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'search_text')));
    assert.deepEqual(others(after), others(rows), '他カラムが変わっていないこと');
    assert.deepEqual(after.map(row => row.search_text), converted.map(row => row.text));
    assert.equal(Object.values(db.prepare('PRAGMA quick_check').get())[0], 'ok');
    db.exec('COMMIT'); committed = true;
    Object.assign(summary, { backup, otherColumnsUnchanged: true, quickCheck: 'ok' });
  } finally { if (!committed) db.exec('ROLLBACK'); db.close(); }
}
console.log(JSON.stringify(summary, null, 2));
