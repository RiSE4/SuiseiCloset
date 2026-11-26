import { fileURLToPath } from 'node:url';

// Pagesの配信ディレクトリに依存せず、開発用Request.cfキャッシュはプロジェクト直下へ置く。
process.env.MINIFLARE_CACHE_DIR = fileURLToPath(new URL('../.wrangler/cache/', import.meta.url));
