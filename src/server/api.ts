import type { Context } from './types';
import { checkOrigin, fail, json } from './http';
import { oauthEnabled } from './auth/config';
import { currentUser } from './auth/sessions';
import { costumeApi } from './costumes/handler';
import { userApi } from './users/handler';
import { unexpectedResponse } from './errors';

/**
 * /api配下の入り口
 * 
 * 認証・管理者権限・更新時のOriginを確認し、各機能へ振り分ける
 * 閲覧用APIは設定に応じて未ログインでも利用可能であるが、管理用APIは常に管理者ログインを要求する
 */
export async function api(ctx: Context): Promise<Response> {
  // '/api'を除いたパス要素を各機能に渡す
  const path = new URL(ctx.request.url).pathname.split('/').filter(Boolean).slice(1);
  const method = ctx.request.method;

  try {
    const user = await currentUser(ctx);
    //認証不要の場合はuserがnullでも成功とする
    if (path.length === 1 && path[0] === 'me' && method === 'GET') {
      if (!user && oauthEnabled(ctx.env)) {
        return fail('ログインまたは利用許可が必要です', 401);
      }

      return json({ user, oauth_enabled: oauthEnabled(ctx.env) });
    }

    if (path[0] === 'costumes' || path[0] === 'categories' || path[0] === 'pub-years') {
      if (!user && oauthEnabled(ctx.env)) {
        return fail('ログインまたは利用許可が必要です', 401);
      }

      return await costumeApi(ctx, user, path, method);
    }
    //管理系操作（ログイン必須）
    if (!user) return fail('ログインまたは利用許可が必要です', 401);
    if (path[0] !== 'admin') return fail('見つかりません', 404);
    if (path[1] === 'users' ? user.role !== 'admin' : !['admin', 'editor'].includes(user.role)) {
      return fail('権限がありません', 403);
    }
    if (method !== 'GET' && !checkOrigin(ctx)) return fail('Originが一致しません', 403);

    // ユーザー管理：userApi、衣装/資料の管理：costumeApi
    if (path[1] === 'users') {
      return await userApi(ctx, user, path, method);
    }

    return await costumeApi(ctx, user, path, method);
  } catch (error) {
    const feature = path[0] === 'admin' && path[1] === 'users' ? 'users' :
      ['costumes', 'categories', 'pub-years'].includes(path[0]) || path[0] === 'admin' ? 'costumes' : 'api';
    return unexpectedResponse(error, feature);
  }
}
