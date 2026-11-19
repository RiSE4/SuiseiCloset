import type { Context, Env } from '../types';

/** OAuthの認証の要否の設定 */
export const oauthEnabled = (env: Env) => env.OAUTH_ENABLED !== 'false';

/**
 * 開発用ログインの利用条件を確認
 */
export function devLoginAllowed(ctx: Context, origin: string) {
  const localHost = (host: string) => host === 'localhost' || host === '127.0.0.1';

  return ctx.env.DEV_AUTH_ENABLED === 'true'
    && localHost(new URL(ctx.request.url).hostname)
    && localHost(new URL(origin).hostname)
    && /^\d{17,20}$/.test(ctx.env.DEV_DISCORD_ID || '');
}
