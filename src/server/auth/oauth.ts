import type { Context } from '../types';
import { cookie, redirect } from '../http';
import { createSession, sessionCookie } from './sessions';
import { randomToken, sha256 } from './tokens';
import { oauthEnabled } from './config';

/**
 * Cookieの定義
 */
export const stateCookie = (value: string, age: number) =>
  `__Host-closet_state=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

/**
 * OAuth スタート処理
 */
export async function startLogin(ctx: Context): Promise<Response> {
  if (!ctx.env.DISCORD_CLIENT_ID || !ctx.env.DISCORD_REDIRECT_URI || !ctx.env.DISCORD_CLIENT_SECRET) {
    return new Response('OAuth is not configured.', { status: 503 });
  }

  const state = randomToken();

  await ctx.env.DB.prepare(
    "INSERT INTO oauth_states(state_hash,expires_at) VALUES(?,datetime('now','+10 minutes'))"
  ).bind(await sha256(state)).run();

  const params = new URLSearchParams({
    client_id: ctx.env.DISCORD_CLIENT_ID,
    redirect_uri: ctx.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'consent'
  });

  return redirect(`https://discord.com/oauth2/authorize?${params}`, [stateCookie(state, 600)]);
}

/**
 * OAuth コールバック処理
 */
export async function completeLogin(ctx: Context, origin: string): Promise<Response> {
  const loginPage = `${origin}${oauthEnabled(ctx.env) ? '/' : '/login'}`;
  const url = new URL(ctx.request.url);
  const state = url.searchParams.get('state') || '';
  const oldState = cookie(ctx.request, '__Host-closet_state');

  // 1. Stateの形式チェックおよびCookieとの一致確認
  if (!/^[a-f0-9]{64}$/.test(state) || oldState !== state) {
    return redirect(`${loginPage}?error=state`, [stateCookie('', 0)]);
  }

  // 2. データベースから有効なStateを照合し、同時に削除して再利用を防ぐ
  const stateHash = await sha256(state);
  const record = await ctx.env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > datetime('now') RETURNING state_hash"
  ).bind(stateHash).first();

  if (!record) {
    return redirect(`${loginPage}?error=state`, [stateCookie('', 0)]);
  }

  // 3. 認可コードの存在確認
  const code = url.searchParams.get('code');
  if (!code) {
    return redirect(`${loginPage}?error=oauth`, [stateCookie('', 0)]);
  }

  // 4. Discordにアクセストークンを要求
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: ctx.env.DISCORD_CLIENT_ID,
      client_secret: ctx.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: ctx.env.DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenResponse.ok) {
    return redirect(`${loginPage}?error=oauth`, [stateCookie('', 0)]);
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    return redirect(`${loginPage}?error=oauth`, [stateCookie('', 0)]);
  }

  // 5. Discordのユーザープロフィールを取得
  const profileResponse = await fetch('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    }
  });

  if (!profileResponse.ok) {
    return redirect(`${loginPage}?error=oauth`, [stateCookie('', 0)]);
  }

  const profile = (await profileResponse.json()) as {
    id?: string;
    global_name?: string;
    username?: string;
  };

  if (!profile.id || !/^\d{17,20}$/.test(profile.id)) {
    return redirect(`${loginPage}?error=oauth`, [stateCookie('', 0)]);
  }

  // 6. DBに事前登録されており、かつ有効なユーザーであるか確認
  const allowedUser = await ctx.env.DB.prepare(
    'SELECT discord_id FROM users WHERE discord_id = ? AND enabled = 1'
  ).bind(profile.id).first();

  if (!allowedUser) {
    return redirect(`${loginPage}?denied=1`, [stateCookie('', 0), sessionCookie('', 0)]);
  }

  // 7. ユーザーの表示名（display_name）を最新に更新
  const displayName = (profile.global_name || profile.username || '').slice(0, 100);
  await ctx.env.DB.prepare(
    'UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE discord_id = ?'
  ).bind(displayName, profile.id).run();

  // 8. OAuth一時Cookieを削除し、新しいアプリ用セッションを発行してリダイレクト
  const session = await createSession(ctx, profile.id);
  return redirect(origin, [stateCookie('', 0), session]);

}
