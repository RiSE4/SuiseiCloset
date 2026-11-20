import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { makeSearchText, validateKeywords } from '../src/features/costumes/keywords.ts';
import { isValidDebutDate } from '../src/features/costumes/debut-date.ts';
import { validateHttpsUrl } from '../src/features/costumes/validate-https-url.ts';
import { allocateCostumeIdSql, nextCostumeIdSql } from '../src/server/costumes/costume-id.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseHeaders = ['衣装名', '初出日（yyyy-mm-dd）', '説明', '共通サムネイルURL', 'キーワード（カンマ区切り）'];
const sourceHeaders = ['資料タイトル', '参照先URL', '画像URL'];
export const csvHeaders = [...baseHeaders, ...Array.from({ length: 5 }, (_, i) => sourceHeaders.map(key => `${key}${i + 1}`)).flat()];

// ExcelのCSV（出典符内のカンマ・改行・二重出典符、CRLF、UTF-8 BOM）を扱う。
export function parseCsv(input) {
  const text = input.replace(/^\uFEFF/, '');
  const rows = [];
  let cells = [], field = '', quoted = false, closed = false, line = 1, rowLine = 1;
  function endCell() { cells.push(field); field = ''; closed = false; }
  function endRow() { endCell(); rows.push({ line: rowLine, cells }); cells = []; }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        if (char === '\r' || char === '\n') {
          if (char === '\r' && text[i + 1] === '\n') i++;
          field += '\n'; line++;
        } else field += char;
      }
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
      line++; rowLine = line;
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw Error(`CSV ${line}行目: 出典符の使い方が不正です`);
      field += char;
    }
  }
  if (quoted) throw Error(`CSV ${rowLine}行目: 出典符が閉じていません`);
  if (cells.length || field || closed) endRow();
  return rows.filter(row => row.cells.some(cell => cell.trim()));
}

function textField(value, label, max, required = false) {
  if (value.length > max) throw Error(`${label}は${max}文字以内にしてください`);
  const result = value.trim();
  if (required && !result) throw Error(`${label}を入力してください`);
  return result;
}

function urlField(value, label, required = false) {
  const result = textField(value, label, 2048, required);
  if (!result) return null;
  try { return validateHttpsUrl(result); }
  catch { throw Error(`${label}は認証情報を含まないHTTPS URLにしてください`); }
}

export function readCostumesCsv(input) {
  const [header, ...rows] = parseCsv(input);
  if (!header) throw Error('CSVにヘッダーがありません');
  const headers = header.cells.map(cell => cell.trim());
  if (new Set(headers).size !== headers.length) throw Error('CSVのヘッダーが重複しています');
  const unknown = headers.filter(key => !csvHeaders.includes(key));
  if (unknown.length) throw Error(`未対応のCSVヘッダー: ${unknown.join(', ')}`);
  const missing = baseHeaders.filter(key => !headers.includes(key));
  if (missing.length) throw Error(`CSVに必要なヘッダーがありません: ${missing.join(', ')}`);
  if (!rows.length) throw Error('CSVに衣装データがありません');
  return rows.map(row => {
    try {
      if (row.cells.length !== headers.length) throw Error(`列数が不正です（期待: ${headers.length}、実際: ${row.cells.length}）`);
      const record = Object.fromEntries(headers.map((key, i) => [key, row.cells[i]]));
      const name = textField(record[baseHeaders[0]], '衣装名', 150, true);
      const debutDate = record[baseHeaders[1]].trim() || null;
      if (debutDate && !isValidDebutDate(debutDate)) throw Error('初出日は2018-01-01～2100-12-31の実在する日付（yyyy-mm-dd）にしてください');
      const description = textField(record[baseHeaders[2]], '説明', 4000);
      const thumbnailUrl = urlField(record[baseHeaders[3]], '共通サムネイルURL');
      const keywordText = record[baseHeaders[4]].trim();
      const keywords = keywordText ? keywordText.split(',').map(value => value.trim()) : [];
      if (keywords.length > 32 || keywords.some(value => value.length > 80)) throw Error('キーワードは32個以内、各80文字以内にしてください');
      validateKeywords(keywords);
      const sources = [];
      for (let number = 1; number <= 5; number++) {
        const values = sourceHeaders.map(key => record[`${key}${number}`] ?? '');
        if (values.every(value => !value.trim())) continue;
        sources.push({
          number,
          title: textField(values[0], `資料タイトル${number}`, 150, true),
          sourceUrl: urlField(values[1], `参照先URL${number}`, true),
          thumbnailUrl: urlField(values[2], `画像URL${number}`),
        });
      }
      return { line: row.line, name, debutDate, description, thumbnailUrl, keywords,
        searchText: makeSearchText(name, keywords),
        sources: sources.map((source, sortOrder) => ({ ...source, sortOrder: sortOrder + 1 })) };
    } catch (error) { throw Error(`CSV ${row.line}行目: ${error.message}`, { cause: error }); }
  });
}

export async function localDbPath(dbFile) {
  if (!path.isAbsolute(dbFile)) throw Error('--dbには既存ローカルD1 SQLiteファイルの絶対パスを指定してください');
  const actual = await realpath(dbFile);
  const stateRoot = await realpath(path.join(root, '.wrangler', 'state'));
  const relative = path.relative(stateRoot, actual);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) ||
      !actual.endsWith('.sqlite') || !(await stat(actual)).isFile()) {
    throw Error('対象DBはこのプロジェクトの .wrangler/state 内にある既存の .sqlite に限定しています');
  }
  return actual;
}

// 衣装と資料はINSERTのみ。採番位置のUPDATEも含めファイル単位で一括コミットする。
export function insertCostumes(db, costumes) {
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE');
  try {
    const allocateId = db.prepare(allocateCostumeIdSql);
    const insertCostume = db.prepare(`
      INSERT INTO costume(id, name, debut_date, description, thumbnail_url, keywords_json, search_text)
      VALUES(${nextCostumeIdSql}, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `);
    const insertSource = db.prepare(`
      INSERT INTO costume_source(costume_id, title, source_url, thumbnail_url, sort_order)
      VALUES(?, ?, ?, ?, ?)
    `);
    const inserted = [];
    for (const costume of costumes) {
      allocateId.run();
      const { id } = insertCostume.get(costume.name, costume.debutDate, costume.description,
        costume.thumbnailUrl, JSON.stringify(costume.keywords), costume.searchText);
      for (const source of costume.sources) {
        insertSource.run(id, source.title, source.sourceUrl, source.thumbnailUrl, source.sortOrder);
      }
      inserted.push({ id, name: costume.name, sources: costume.sources.length });
    }
    db.exec('COMMIT');
    return inserted;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

const usage = `使用法:
  npm run db:csv -- --csv <CSVパス> [--encoding utf8|shift_jis]
  npm run db:csv -- --csv <CSVパス> --apply --db <ローカルD1 SQLite絶対パス> [--encoding utf8|shift_jis]
既定は検証のみ。--applyで新規INSERTします。本番DBには接続しません。`;

async function main(args) {
  if (args.length === 1 && args[0] === '--help') { console.log(usage); return; }
  const options = { encoding: 'utf8', apply: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (seen.has(key)) throw Error(`オプションが重複しています: ${key}`);
    seen.add(key);
    if (key === '--apply') options.apply = true;
    else if (['--csv', '--db', '--encoding'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) {
      options[key.slice(2)] = args[++i];
    } else throw Error(usage);
  }
  if (!options.csv || (options.apply && !options.db) || (!options.apply && options.db) ||
      !['utf8', 'shift_jis'].includes(options.encoding)) throw Error(usage);
  const bytes = await readFile(path.resolve(options.csv));
  let text;
  try { text = new TextDecoder(options.encoding === 'utf8' ? 'utf-8' : 'shift_jis', { fatal: true }).decode(bytes); }
  catch { throw Error(`CSVを${options.encoding}で読み取れません。Excelの「CSV UTF-8」で保存するか、--encoding shift_jisを指定してください`); }
  const costumes = readCostumesCsv(text);
  console.log(JSON.stringify({ mode: options.apply ? 'INSERT' : '検証のみ（DB変更なし）',
    csv: path.resolve(options.csv), costumes: costumes.length,
    sources: costumes.reduce((sum, item) => sum + item.sources.length, 0),
    items: costumes.map(item => ({ line: item.line, name: item.name,
      sources: item.sources.map(source => ({ column: source.number, title: source.title, sortOrder: source.sortOrder })) })) }, null, 2));
  if (!options.apply) return;
  const dbFile = await localDbPath(options.db);
  const db = new DatabaseSync(dbFile);
  try {
    const inserted = insertCostumes(db, costumes);
    console.log(JSON.stringify({ db: dbFile, inserted, message: '全件を非公開で新規登録しました。管理画面で確認・公開してください。' }, null, 2));
  } finally { db.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
