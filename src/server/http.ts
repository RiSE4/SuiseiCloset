import type { Context } from './types';

/**
 * Content-Typeの推測を抑止するヘッダー付きJSONの返却（キャッシュの禁止）
 */
export const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff'
    }
  });

/**
 * クライアント共通エラーの作成
 */
export const fail = (message: string, status = 400) => json({ error: message }, status);

/**
 * リクエストヘッダーから指定した名前のCookieの値を取得
 */
export const cookie = (request: Request, name: string): string => {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return '';

  const targetCookie = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${name}=`));

  return targetCookie ? targetCookie.slice(name.length + 1) : '';
};

/**
 * レスポンス：302の作成
 */
export function redirect(url: string, cookies: string[] = []) {
  const h = new Headers({
    'Location': url,
    'Cache-Control': 'no-store'
  });
  cookies.forEach(v => h.append('Set-Cookie', v));
  return new Response(null, {
    status: 302,
    headers: h
  });
}

/**
 * 更新リクエストを許可するOriginを返却
 * 開発環境の場合、設定URL/接続先がループバックアドレスなら接続先Originを使用
 */
export function requestOrigin(ctx: Context) {
  const configured = new URL(ctx.env.APP_ORIGIN);
  const request = new URL(ctx.request.url);
  const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1';

  if (ctx.env.DEV_AUTH_ENABLED === 'true' && isLoopback(configured.hostname) && isLoopback(request.hostname)) {
    return request.origin;
  }

  return configured.origin;
}

/**
 * Originヘッダーが許可されたものか確認
 */
export function checkOrigin(ctx: Context) {
  return ctx.request.headers.get('Origin') === requestOrigin(ctx);
}

/**
 * application/json本文の読み込み
 */
export async function readJson(ctx: Context, limit = 20000): Promise<Record<string, unknown> | null> {
  if (!ctx.request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (Number(ctx.request.headers.get('Content-Length') || 0) > limit) {
      void ctx.request.body?.cancel().catch(() => {});
      return null;
    }
    if (!ctx.request.body) return null;
    reader = ctx.request.body.getReader();
    const bytes = new Uint8Array(limit);
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength > limit - size) {
        void reader.cancel().catch(() => {});
        return null;
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  } finally {
    reader?.releaseLock();
  }
}
