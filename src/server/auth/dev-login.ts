import type { Context } from '../types';
import { requestOrigin } from '../http';
import { createSession } from './sessions';

/**
 * 開発用ログインボタンの表示可否
 */
export function devConfig(devAllowed: boolean): Response {
  return Response.json({ enabled: devAllowed }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * 開発用ログイン
 */
export async function devLogin(ctx: Context, devAllowed: boolean): Promise<Response> {

  //開発ログインが許可されていない、またはOriginが一致しない場合は拒否
  const origin = ctx.request.headers.get('Origin');
  if (!devAllowed || origin !== requestOrigin(ctx)) {
    return new Response('Forbidden', { status: 403 });
  }

  //テストユーザーが登録済みかつ有効か確認
  const devDiscordId = ctx.env.DEV_DISCORD_ID!;
  const isRegistered = await ctx.env.DB.prepare(
    'SELECT 1 FROM users WHERE discord_id = ? AND enabled = 1'
  ).bind(devDiscordId).first();

  if (!isRegistered) {
    return new Response('Test user is not registered in D1', { status: 403 });
  }

  //セッションの発行、Cookie設定とキャッシュ無効化ヘッダーを付与して返却
  const session = await createSession(ctx, devDiscordId);
  return new Response(null, {
    status: 204,
    headers: {
      'Set-Cookie': session,
      'Cache-Control': 'no-store'
    }
  });
}
