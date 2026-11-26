/** ローカルD1のパレットがNULLの衣装だけを対象にする。画像はブラウザーのメモリー内だけで扱う。 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const args = process.argv.slice(2);
if (args.some(arg => !/^(--dry-run|--limit=\d+|--delay-ms=\d+)$/.test(arg))) throw new Error('Usage: npm run palette:backfill:local -- [--dry-run] [--limit=100] [--delay-ms=500]. 本番DBへの接続は非対応です。');
const limit = Number(args.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 100);
const delay = Number(args.find(a => a.startsWith('--delay-ms='))?.split('=')[1] ?? 500);
if (limit < 1 || limit > 1000 || delay < 100 || delay > 60_000) throw new Error('limit: 1～1000、delay-ms: 100～60000');
const dryRun = args.includes('--dry-run');
const exec = promisify(execFile);
const temp = await mkdtemp(join(tmpdir(), 'closet-backfill-'));
let server, browser;
async function query(sql) {
  const file = join(temp, 'query.sql');
  await writeFile(file, sql);
  const { stdout } = await exec(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'suisei-closet', '--local', '--file=' + file, '--json'], {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(process.cwd(), '.wrangler/logs') },
    maxBuffer: 8 * 1024 * 1024,
  });
  const results = JSON.parse(stdout);
  if (results.some(result => !result.success)) throw new Error('ローカルD1の操作に失敗しました');
  return results;
}
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
try {
  const [result] = await query(`SELECT id, thumbnail_url, palette_revision FROM costume
    WHERE color_palette IS NULL AND thumbnail_url IS NOT NULL AND trim(thumbnail_url) <> ''
    ORDER BY id LIMIT ${limit};`);
  console.log(`Local D1: NULLパレット対象 ${result.results.length}件（上限${limit}件）${dryRun ? ' / dry-run・取得/更新なし' : ''}`);
  if (dryRun || !result.results.length) process.exitCode = 0;
  else {
    const bundle = await build({ entryPoints: ['src/features/costumes/analyze-thumbnail.ts'], bundle: true, write: false, format: 'iife', globalName: 'paletteAnalysis', platform: 'browser', logLevel: 'silent' });
    // ローカルのオリジンを用意し、画像取得時にブラウザーの通常のCORS検証が働くようにする。
    server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Local palette backfill</title>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    let saved = 0, skipped = 0, failed = 0;
    for (const row of result.results) {
      const start = performance.now();
      try {
        const palette = await page.evaluate(url => paletteAnalysis.analyzeThumbnail(url), row.thumbnail_url);
        const json = JSON.stringify(palette);
        // 書き込み時にNULLと画像のリビジョンを再確認し、既存のパレットは上書きしない。
        const [updated] = await query(`UPDATE costume SET color_palette = ${quote(json)}
          WHERE id = ${quote(row.id)} AND color_palette IS NULL
          AND thumbnail_url = ${quote(row.thumbnail_url)} AND palette_revision = ${Number(row.palette_revision)} RETURNING id;`);
        if (updated.results.length) { saved++; console.log(`${row.id}: saved, ${Math.round(performance.now() - start)}ms incl. download/DB, ${Buffer.byteLength(json)} bytes`); }
        else { skipped++; console.log(`${row.id}: skipped (生成済み／サムネイル変更)`); }
      } catch {
        failed++; console.log(`${row.id}: failed (CORS／画像取得・解析／DB保存). NULLのまま継続します。`);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    console.log(`完了: saved=${saved}, skipped=${skipped}, failed=${failed}。一般閲覧時の解析なし。`);
    if (failed) process.exitCode = 1;
  }
} finally {
  await browser?.close(); server?.close(); await rm(temp, { recursive: true, force: true });
}
