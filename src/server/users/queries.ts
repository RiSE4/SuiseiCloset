import type { Context } from '../types';
import { json } from '../http';

/**
 * 登録済みユーザーの取得
 */
export async function listUsers(ctx: Context): Promise<Response> {
  return json({
    users: (
      await ctx.env.DB.prepare('SELECT discord_id,display_name,role,enabled,updated_at FROM users ORDER BY updated_at DESC').all()
    ).results
  });
}

/**
 * ユーザーが登録済みかチェック
 */
export async function userExists(ctx: Context, id: string) {
  return ctx.env.DB.prepare('SELECT 1 FROM users WHERE discord_id=?').bind(id).first();
}
