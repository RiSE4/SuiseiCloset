import type { User } from '../types';

//Discord IDの正規表現
export const discordPattern = /^\d{17,20}$/;

/** ユーザー更新項目 */
interface UserInput {
  role: User['role'];
  enabled: boolean;
  name: string;
}

/**
 * 文字列をトリム
 */
const string = (v: unknown, max = 1000) => typeof v === 'string' && v.length <= max ? v.trim() : null;

/**
 * role・enabled・display_nameを検証し、自分自身の無効化や降格を拒否
 */
export function userInput(body: Record<string, unknown>, actor: User, id: string): UserInput | { error: string } {
  const role = body.role, enabled = body.enabled, name = string(body.display_name, 100);

  if ((role !== 'admin' && role !== 'editor' && role !== 'member') || typeof enabled !== 'boolean' || name === null) {
    return { error: 'ユーザーの入力値を確認してください' };
  }

  if (id === actor.discord_id && (!enabled || role !== 'admin')) {
    return { error: '自分の管理者権限は解除できません' };
  }

  return { role, enabled, name };
}
