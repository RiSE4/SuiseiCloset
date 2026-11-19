import type { Context, User } from '../types';
import { fail, json, readJson } from '../http';
import { userExists } from './queries';
import { discordPattern, userInput } from './validation';

/** 観測者とそのセッションを削除し、操作履歴を同じトランザクションに記録する。 */
export async function deleteUser(ctx: Context, actor: User, id: string): Promise<Response> {
  if (!discordPattern.test(id)) return fail('Discord IDが不正です');
  if (id === actor.discord_id) return fail('自分自身は削除できません');
  if (!await userExists(ctx, id)) return fail('ユーザーが見つかりません', 404);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM sessions WHERE discord_id=?').bind(id),
    ctx.env.DB.prepare('DELETE FROM users WHERE discord_id=?').bind(id),
    ctx.env.DB.prepare('INSERT INTO audit_log(actor_discord_id,action,target_id) VALUES(?,?,?)')
      .bind(actor.discord_id, 'user.delete', id)
  ]);
  return json({ ok: true });
}

/**
 * ユーザーの登録または更新、それに紐づく操作履歴をD1に記録
 * 更新でもrole・enabled・display_nameをすべて受け取り、自分自身の無効化や降格は拒否
 * @param actor 操作中の管理者
 * @param create true：新規登録、false:既存ユーザー更新
 * @param providedBody 呼び出し元の本文
 */
export async function saveUser(ctx: Context, actor: User, id: string, create: boolean, providedBody?: Record<string, unknown>): Promise<Response> {
  //Discord IDの形式チェック
  if (!discordPattern.test(id)) {
    return fail('Discord IDは17～20桁の数字で入力してください');
  }

  //リクエストボディのチェック
  const body = providedBody ?? await readJson(ctx);
  if (!body) {
    return fail('JSONが必要です');
  }

  const input = userInput(body, actor, id);
  if ('error' in input) {
    return fail(input.error);
  }

  const { role, enabled, name } = input;
  const nextId = body.discord_id === undefined ? id : body.discord_id;
  if (typeof nextId !== 'string' || !discordPattern.test(nextId)) {
    return fail('Discord IDは17～20桁の数字で入力してください');
  }
  if (!create && id === actor.discord_id && nextId !== id) {
    return fail('自分のDiscord IDは変更できません');
  }
  const existing = await userExists(ctx, id);

  //登録・更新の条件チェック
  if (create && existing) return fail('登録済みです', 409);
  if (!create && !existing) return fail('ユーザーが見つかりません', 404);
  if (nextId !== id && await userExists(ctx, nextId)) return fail('登録済みのDiscord IDです', 409);

  //D1登録用クエリーの組み立て
  const statements: D1PreparedStatement[] = [];
  if (create) {
    //新規登録
    statements.push(
      ctx.env.DB.prepare(
        'INSERT INTO users(discord_id,display_name,role,enabled) VALUES(?,?,?,?)'
      ).bind(id, name, role, enabled ? 1 : 0)
    );
  } else if (nextId !== id) {
    // 主キーの変更は新IDへの移行として扱い、旧IDのセッションを引き継がない。
    statements.push(
      ctx.env.DB.prepare('INSERT INTO users(discord_id,display_name,role,enabled) VALUES(?,?,?,?)')
        .bind(nextId, name, role, enabled ? 1 : 0),
      ctx.env.DB.prepare('DELETE FROM sessions WHERE discord_id=?').bind(id),
      ctx.env.DB.prepare('DELETE FROM users WHERE discord_id=?').bind(id)
    );
  } else {
    //更新
    statements.push(
      ctx.env.DB.prepare(
        'UPDATE users SET display_name=?,role=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE discord_id=?'
      ).bind(name, role, enabled ? 1 : 0, id)
    );

    //ユーザーが無効化された場合は既存セッションを削除し、不正利用を防ぐ
    if (!enabled) {
      statements.push(ctx.env.DB.prepare('DELETE FROM sessions WHERE discord_id=?').bind(id));
    }
  }

  //操作履歴の記録
  statements.push(
    ctx.env.DB.prepare(
      'INSERT INTO audit_log(actor_discord_id,action,target_id,details) VALUES(?,?,?,?)'
    ).bind(actor.discord_id, create ? 'user.create' : 'user.update', id, JSON.stringify({ discord_id: nextId, role, enabled }))
  );

  //トランザクション一括実行
  try {
    await ctx.env.DB.batch(statements);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: users.discord_id/.test(error.message)) {
      return fail('登録済みのDiscord IDです', 409);
    }
    throw error;
  }

  return json({ ok: true }, create ? 201 : 200);
}
