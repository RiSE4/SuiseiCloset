import type { Context } from '../types';
import { InputError } from './validation';

/**
 * 関連付け先を確認し、所属するグループキーと相手側のキー更新可否を判定
 * 既存キーがーあれば再利用し、双方とも未所属の場合は新しいキーを作成
 */
export async function relatedKey(ctx: Context, targetId: string, selfId: string | null, oldKey: string | null) {
  if (targetId === selfId) {
    throw new InputError('自分自身には関連付けられません');
  }

  const target = await ctx.env.DB.prepare(
    'SELECT id,family_key FROM costume WHERE id=?'
  ).bind(targetId)
    .first<{
      id: string;
      family_key: string | null
    }>();

  if (!target) {

    throw new InputError('関連衣装が見つかりません', 404);
  }
  if (oldKey && target.family_key && oldKey !== target.family_key) {

    throw new InputError('異なる関連衣装グループは統合できません', 409);
  }
  
  return {
    key: oldKey || target.family_key || `family-${crypto.randomUUID()}`,
    targetNeedsUpdate: !target.family_key
  };
}
