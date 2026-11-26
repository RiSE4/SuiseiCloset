import type { Context } from './types';
import { oauthEnabled } from './auth/config';

/** D1への制限に達しないようにキャッシュを呼び出し */
export async function publicRead(ctx: Context, load: () => Promise<Response>): Promise<Response> {
  const url = new URL(ctx.request.url);
  const eligiblePath = /^\/api\/(?:categories|pub-years|costumes(?:\/costume-\d{3,92})?)\/?$/.test(url.pathname);
  const allowedParams = url.pathname.replace(/\/$/, '') === '/api/costumes' ? ['q', 'category', 'pubYear', 'limit', 'offset'] : [];
  const params = [...url.searchParams.keys()];

  if (oauthEnabled(ctx.env) || ctx.request.method !== 'GET' || !eligiblePath ||
    ctx.request.headers.has('Cookie') || ctx.request.headers.has('Authorization') ||
    url.href.length > 2048 || params.some(key => !allowedParams.includes(key)) ||
    new Set(params).size !== params.length || typeof caches === 'undefined') return load();

  // Cookieやリクエストヘッダーをキーに混入させない
  url.searchParams.sort();
  const key = new Request(url.href);
  let cache: Cache;

  try {
    cache = await caches.open('suisei-public-v1');
    const hit = await cache.match(key);

    if (hit) {
      const response = new Response(hit.body, hit);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
  } catch {
    return load();
  }

  const response = await load();

  if (response.status === 200 && !response.headers.has('Set-Cookie') &&
    response.headers.get('Content-Type')?.includes('application/json')) {
    const stored = response.clone();
    stored.headers.set('Cache-Control', 'public, max-age=30');
    ctx.waitUntil(cache.put(key, stored).catch(() => { }));
  }

  return response;
}
