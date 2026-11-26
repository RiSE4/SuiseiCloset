import type { Context, User } from '../types';
import { cookie, requestOrigin } from '../http';
import { randomToken, sha256 } from './tokens';
import { cleanupExpiredAuth } from './cleanup';

/**
 * Set-Cookieの定義
 * @param age 秒数、0の場合は削除
 */
export const sessionCookie = (value: string, age: number) =>
  `__Host-closet_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

/**
 * セッションに保存されたユーザーと同一ユーザーをD1から取得
 */
export async function currentUser(ctx: Context): Promise<User | null> {
  const token = cookie(ctx.request, '__Host-closet_session');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await sha256(token);

  return ctx.env.DB.prepare(
    "SELECT u.discord_id,u.display_name,u.role,u.enabled FROM sessions s JOIN users u ON u.discord_id=s.discord_id WHERE s.token_hash=? AND s.expires_at > datetime('now') AND u.enabled=1"
  ).bind(hash).first<User>();
}

/**
 * セッションの作成
 */
export async function createSession(ctx: Context, id: string): Promise<string> {
  const session = randomToken(), maxAge = 60 * 60 * 24 * 7;
  await ctx.env.DB.prepare(
    "INSERT INTO sessions(token_hash,discord_id,expires_at) VALUES(?,?,datetime('now','+7 days'))"
  ).bind(await sha256(session), id).run();

  ctx.waitUntil(cleanupExpiredAuth(ctx));
  return sessionCookie(session, maxAge);
}

/**
 * ログアウト処理
 */
export async function logout(ctx: Context): Promise<Response> {
  if (ctx.request.headers.get('Origin') !== requestOrigin(ctx)) {

    return new Response('Forbidden', { status: 403 });
  }
  const token = cookie(ctx.request, '__Host-closet_session');

  if (/^[a-f0-9]{64}$/.test(token)) {
    await ctx.env.DB.prepare(
      'DELETE FROM sessions WHERE token_hash=?'
    ).bind(await sha256(token)).run();
  }

  return new Response(null, {
    status: 204, headers: {
      'Set-Cookie': sessionCookie('', 0),
      'Cache-Control': 'no-store'
    }
  });
}
