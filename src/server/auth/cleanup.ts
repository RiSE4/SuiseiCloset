import type { Context } from '../types';
import { reportUnexpected } from '../errors';

/** 正常なセッション発行後だけ、期限切れを各50件まで回収する。失敗は認証に波及させない。 */
export async function cleanupExpiredAuth(ctx: Context): Promise<void> {
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`DELETE FROM oauth_states WHERE state_hash IN (
        SELECT state_hash FROM oauth_states WHERE expires_at <= datetime('now') LIMIT 50
      )`),
      ctx.env.DB.prepare(`DELETE FROM sessions WHERE token_hash IN (
        SELECT token_hash FROM sessions WHERE expires_at <= datetime('now') LIMIT 50
      )`),
    ]);
  } catch (error) {
    reportUnexpected(error, 'auth.cleanup');
  }
}
