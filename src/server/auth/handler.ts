import type { Context } from '../types';
import { devLoginAllowed, oauthEnabled } from './config';
import { devConfig, devLogin } from './dev-login';
import { completeLogin, startLogin, stateCookie } from './oauth';
import { logout } from './sessions';
import { fail, redirect } from '../http';
import { reportUnexpected } from '../errors';

/**
 * '/auth'配下の処理の振り分け
 */
export async function authApi(ctx: Context): Promise<Response> {
  const path = new URL(ctx.request.url).pathname;
  let origin = '';
  try {
    origin = new URL(ctx.env.APP_ORIGIN).origin;
    const devAllowed = devLoginAllowed(ctx, origin);

    if (path === '/auth/dev-config' && ctx.request.method === 'GET') return devConfig(devAllowed);
    if (path === '/auth/dev-login' && ctx.request.method === 'POST') return await devLogin(ctx, devAllowed);
    if (path === '/auth/login' && ctx.request.method === 'GET') return await startLogin(ctx);
    if (path === '/auth/callback' && ctx.request.method === 'GET') return await completeLogin(ctx, origin);
    if (path === '/auth/logout' && ctx.request.method === 'POST') return await logout(ctx);

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    const callback = path === '/auth/callback';
    reportUnexpected(error, callback ? 'auth.callback' : path === '/auth/login' ? 'auth.login' :
      path === '/auth/logout' ? 'auth.logout' : 'auth.dev');
    // A failed callback uses the existing login entry, even if APP_ORIGIN is invalid.
    // No session is issued here; an existing unrelated session is left untouched.
    if (callback) return redirect(`${origin}${oauthEnabled(ctx.env) ? '/' : '/login'}?error=oauth`, [stateCookie('', 0)]);
    return fail('処理に失敗しました', 500);
  }
}
