import type { Context, User } from '../types';
import { fail } from '../http';
import { createCostume, createSource, deleteCostume, deleteSource, reorderSources, updateCostume, updateSource } from './commands';
import { categories, detail, list, publicationYears } from './queries';
import { idPattern, InputError } from './validation';
import { unexpectedResponse } from '../errors';

/**
 * 衣装・資料・カテゴリのAPIをパス・HTTPメソッドで振り分ける
 * 認証の要否、権限、更新時のOriginは'/api'の入り口で確認済みであることが前提
 */
export async function costumeApi(ctx: Context, user: User | null, path: string[], method: string): Promise<Response> {
  try {
    const admin = path[0] === 'admin';
    const segments = admin ? path.slice(1) : path;

    // 絞り込み候補には、公開衣装で実際に使われている空でないカテゴリだけを返す
    if (segments.length === 1 && segments[0] === 'categories' && method === 'GET') {
      return await categories(ctx, admin);
    }
    if (segments.length === 1 && segments[0] === 'pub-years' && method === 'GET') {
      return await publicationYears(ctx, admin);
    }

    if (segments[0] === 'costumes') {
      if (segments.length === 1 && method === 'GET') return await list(ctx, admin);
      if (segments.length === 1 && method === 'POST' && admin) return await createCostume(ctx, user!);

      const id = segments[1];
      if (id && !idPattern.test(id)) throw new InputError('衣装IDが不正です');
      if (id && segments.length === 2) {
        if (method === 'GET') return await detail(ctx, id, admin);
        if (admin && method === 'PATCH') return await updateCostume(ctx, user!, id);
        if (admin && method === 'DELETE') return await deleteCostume(ctx, user!, id);
      }

      if (admin && id && segments.length === 3 && segments[2] === 'sources' && method === 'POST') {
        return await createSource(ctx, user!, id);
      }
      if (admin && id && segments.length === 4 && segments[2] === 'sources' && segments[3] === 'order' && method === 'PUT') {
        return await reorderSources(ctx, user!, id);
      }
    }
    // 資料の更新・削除は衣装IDではなく、資料の正の整数IDで対象を特定
    if (admin && segments[0] === 'sources' && segments.length === 2) {
      const id = Number(segments[1]);

      if (!Number.isSafeInteger(id) || id < 1) throw new InputError('資料IDが不正です');
      if (method === 'PATCH') return await updateSource(ctx, user!, id);
      if (method === 'DELETE') return await deleteSource(ctx, user!, id);
    }
    return fail('見つかりません', 404);
  } catch (error) {
    if (error instanceof InputError) {
      return fail(error.message, error.status);
    }

    return unexpectedResponse(error, 'costumes');
  }
}
