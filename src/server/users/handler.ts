import type { Context, User } from '../types';
import { fail, readJson } from '../http';
import { deleteUser, saveUser } from './commands';
import { listUsers } from './queries';

/**
 * /api/admin/users配下の一覧・登録・更新を振り分け
 * 管理者権限と更新時のOriginは'/api'の入口で確認済みであることが前提
 */
export async function userApi(ctx: Context, user: User, path: string[], method: string): Promise<Response> {
  if (path.length === 2 && method === 'GET') {
    return listUsers(ctx);
  }

  if (path.length === 2 && method === 'POST') {
    const body = await readJson(ctx);

    return typeof body?.discord_id === 'string'
      ? saveUser(ctx, user, body.discord_id, true, body)
      : fail('Discord IDが必要です');
  }

  if (path.length === 3 && method === 'PATCH') {
    return saveUser(ctx, user, path[2], false);
  }
  if (path.length === 3 && method === 'DELETE') {
    return deleteUser(ctx, user, path[2]);
  }

  return fail('見つかりません', 404);
}
