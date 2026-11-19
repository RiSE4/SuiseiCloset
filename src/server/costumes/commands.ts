import type { CostumeSourceCreateResponse } from '../../features/costumes/costume-model';
import type { Context, User } from '../types';
import { fail, json, readJson } from '../http';
import type { Costume, CostumeSource } from '../../features/costumes/costume-record';
import { makeSearchText, parseKeywordsJson } from '../../features/costumes/keywords';
import { columnList, detail, sourceColumns, sourceDto } from './queries';
import { relatedKey } from './relations';
import { costumeInput, has, InputError, sourceInput } from './validation';
import { allocateCostumeIdSql, nextCostumeIdSql } from './costume-id';

/**監査用ログの共通定義 */
const audit = (ctx: Context, user: User, action: string, id?: string) => {
  const targetId = id === undefined ? 'CAST(last_insert_rowid() AS TEXT)' : '?';
  const statement = ctx.env.DB.prepare(`
    INSERT INTO audit_log(actor_discord_id, action, target_id)
    VALUES(?, ?, CASE WHEN changes() = 1 THEN ${targetId} ELSE NULL END)
  `);

  return id === undefined
    ? statement.bind(user.discord_id, action)
    : statement.bind(user.discord_id, action, id);
};

/** 必須のJSON本文を読み、不正な形式や未指定の場合は入力エラーにする。 */
async function requiredJson(ctx: Context): Promise<Record<string, unknown>> {
  const body = await readJson(ctx);
  if (!body) {
    throw new InputError('JSONが必要です');
  }
  return body;
}

/** 資料の取得。更新前の読み込みと、登録・更新後の返却で共用する。 */
function loadSource(ctx: Context, id: number): Promise<CostumeSource | null> {
  return ctx.env.DB.prepare(
    `SELECT ${sourceColumns} FROM costume_source WHERE id = ?`
  ).bind(id).first<CostumeSource>();
}

/** 関連先のグループ設定を、衣装本体と同じバッチへ追加するためのSQLを作る。 */
function relatedUpdate(ctx: Context, id: string, familyKey: string, guard?: { id: string; name?: string; keywords?: string }): D1PreparedStatement {
  return ctx.env.DB.prepare(`
    UPDATE costume
    SET family_key = CASE WHEN family_key IS NULL THEN ? ELSE '' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?${guard ? ` AND EXISTS(SELECT 1 FROM costume WHERE id = ?${guard.name !== undefined ? ' AND name = ? AND keywords_json = ?' : ''})` : ''}
  `).bind(familyKey, id, ...(guard ? [guard.id, ...(guard.name !== undefined ? [guard.name, guard.keywords] : [])] : []));
}

/** Only server-owned column names enter SQL; all request values remain bound parameters. */
function patchSet(fields: Record<string, unknown>, columns: Record<string, string>) {
  const keys = Object.keys(columns).filter(key => has(fields, key));
  return { assignments: keys.map(key => `${columns[key]} = ?`), values: keys.map(key => fields[key]) };
}

/** 資料を区分の優先順・現在のカード順で0から連番にする。 */
function normalizeSourceOrder(ctx: Context, costumeId: string): D1PreparedStatement {
  return ctx.env.DB.prepare(`
    WITH ranked AS MATERIALIZED (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY CASE source_type WHEN 'THREE_VIEW' THEN 0 WHEN 'VIDEO' THEN 1 ELSE 2 END,
          sort_order, id
      ) - 1 AS position
      FROM costume_source WHERE costume_id = ?
    )
    UPDATE costume_source
    SET sort_order = (SELECT position FROM ranked WHERE ranked.id = costume_source.id)
    WHERE costume_id = ?
  `).bind(costumeId, costumeId);
}


/**
 * 衣装の新規登録
 */
export async function createCostume(ctx: Context, user: User): Promise<Response> {
  const body = await requiredJson(ctx);
  const fields = costumeInput(body, true);
  const name = fields.name;
  const debutDate = fields.debutDate ?? null;
  const category = fields.category ?? '';
  const description = fields.description ?? '';
  const thumbnailUrl = fields.thumbnailUrl ?? null;
  const keywords = fields.keywords ?? [];
  const isPublished = fields.isPublished ? 1 : 0;

  const relatedId = fields.relatedCostumeId;
  const relation = relatedId ? await relatedKey(ctx, relatedId, null, null) : null;
  const family = relation?.key ?? null;
  const statements: D1PreparedStatement[] = [];

  // 読み取り後に関連先の所属が変わっていたら空文字を設定し、CHECK制約で競合を検出する。
  if (relatedId && relation?.targetNeedsUpdate) {
    statements.push(relatedUpdate(ctx, relatedId, relation.key));
  }

  // 登録時にも関連先の存在とキーを再確認し、条件が崩れていればバッチ全体を失敗させる。
  const familyExpression = relatedId
    ? "CASE WHEN EXISTS(SELECT 1 FROM costume WHERE id = ? AND family_key = ?) THEN ? ELSE '' END"
    : '?';
  const familyParams = relatedId ? [relatedId, family, family] : [null];
  const insertStatement = ctx.env.DB.prepare(`
    INSERT INTO costume(
      id, name, debut_date, category, description, thumbnail_url,
      family_key, keywords_json, search_text, is_published
    )
    VALUES(${nextCostumeIdSql}, ?, ?, ?, ?, ?, ${familyExpression}, ?, ?, ?)
    RETURNING id
  `).bind(
    name, debutDate, category, description, thumbnailUrl,
    ...familyParams, JSON.stringify(keywords), makeSearchText(name, keywords),
    isPublished
  );

  // 直前のINSERTのrowidから採番された衣装IDを取得し、同じバッチで監査記録する。
  const auditStatement = ctx.env.DB.prepare(`
    INSERT INTO audit_log(actor_discord_id, action, target_id)
    VALUES(?, 'costume.create', CASE WHEN changes() = 1
      THEN (SELECT id FROM costume WHERE rowid = last_insert_rowid()) ELSE NULL END)
  `).bind(user.discord_id);
  statements.push(ctx.env.DB.prepare(allocateCostumeIdSql));
  const insertIndex = statements.length;
  statements.push(insertStatement, auditStatement);
  const batchResults = await ctx.env.DB.batch(statements);
  const id = (batchResults[insertIndex].results?.[0] as { id?: string } | undefined)?.id;
  if (typeof id !== 'string' || !/^costume-\d+$/.test(id)) {
    throw new Error('衣装登録のIDを取得できません');
  }

  return detail(ctx, id, true, 201);
}

/**
 * 衣装の更新
 */
export async function updateCostume(ctx: Context, user: User, id: string): Promise<Response> {
  const loadCurrent = () => ctx.env.DB.prepare(
    `SELECT ${columnList} FROM costume WHERE id = ?`
  ).bind(id).first<Costume>();
  let current = await loadCurrent();
  if (!current) return fail('衣装が見つかりません', 404);
  const fields = costumeInput(await requiredJson(ctx), false);
  const changesSearch = has(fields, 'name') || has(fields, 'keywords');

  // Bound retries prevent contention from creating an unbounded request. No new HTTP conflict contract.
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) current = await loadCurrent();
    if (!current) return fail('衣装が見つかりません', 404);
    const patch = patchSet(fields, {
      name: 'name', debutDate: 'debut_date', category: 'category', description: 'description',
      thumbnailUrl: 'thumbnail_url', isPublished: 'is_published',
    });
    if (has(fields, 'isPublished')) {
      const index = patch.assignments.indexOf('is_published = ?');
      patch.values[index] = fields.isPublished ? 1 : 0;
    }
    const guard = changesSearch ? { id, name: current.name, keywords: current.keywords_json } : undefined;
    if (has(fields, 'keywords')) {
      patch.assignments.push('keywords_json = ?');
      patch.values.push(JSON.stringify(fields.keywords));
    }
    if (changesSearch) {
      const name = fields.name ?? current.name;
      const keywords = fields.keywords ?? parseKeywordsJson(current.keywords_json);
      patch.assignments.push('search_text = ?');
      patch.values.push(makeSearchText(name, keywords));
    }

    const statements: D1PreparedStatement[] = [];
    if (has(fields, 'relatedCostumeId')) {
      const relatedId = fields.relatedCostumeId;
      const relation = relatedId ? await relatedKey(ctx, relatedId, id, current.family_key) : null;
      const family = relation?.key ?? null;
      if (relatedId && relation?.targetNeedsUpdate) {
        // A failed search CAS must not leave changes on the related target either.
        statements.push(relatedUpdate(ctx, relatedId, relation.key, guard ?? { id }));
      }
      patch.assignments.push(relatedId
        ? "family_key = CASE WHEN family_key IS ? AND EXISTS(SELECT 1 FROM costume WHERE id = ? AND family_key = ?) THEN ? ELSE '' END"
        : "family_key = CASE WHEN family_key IS ? THEN ? ELSE '' END");
      patch.values.push(...(relatedId ? [current.family_key, relatedId, family, family] : [current.family_key, null]));
    }
    patch.assignments.push('updated_at = CURRENT_TIMESTAMP');
    const updateIndex = statements.length;
    statements.push(ctx.env.DB.prepare(`
      UPDATE costume SET ${patch.assignments.join(', ')}
      WHERE id = ?${changesSearch ? ' AND name = ? AND keywords_json = ?' : ''}
      RETURNING id
    `).bind(...patch.values, id, ...(guard ? [guard.name, guard.keywords] : [])));
    // A CAS miss is a no-op: no audit entry. Audit failure still rolls back the entire batch.
    statements.push(ctx.env.DB.prepare(`
      INSERT INTO audit_log(actor_discord_id, action, target_id)
      SELECT ?, 'costume.update', ? WHERE changes() = 1
    `).bind(user.discord_id, id));
    const results = await ctx.env.DB.batch(statements);
    if (results[updateIndex].results.length > 0) return detail(ctx, id, true);
  }
  throw new Error('Costume update retry limit reached');
}

/**
 * 衣装の削除
 */
export async function deleteCostume(ctx: Context, user: User, id: string): Promise<Response> {
  const exists = await ctx.env.DB.prepare(
    'SELECT 1 FROM costume WHERE id = ?'
  ).bind(id).first();

  if (!exists) {
    return fail('衣装が見つかりません', 404);
  }

  const deleteStatement = ctx.env.DB.prepare('DELETE FROM costume WHERE id = ?').bind(id);
  const auditStatement = audit(ctx, user, 'costume.delete', id);
  await ctx.env.DB.batch([deleteStatement, auditStatement]);

  return json({ ok: true });
}

/**
 * 資料の追加
 */
export async function createSource(ctx: Context, user: User, costumeId: string): Promise<Response> {
  const costumeExists = await ctx.env.DB.prepare(
    'SELECT 1 FROM costume WHERE id = ?'
  ).bind(costumeId).first();

  if (!costumeExists) {
    return fail('衣装が見つかりません', 404);
  }

  const body = await requiredJson(ctx);

  const fields = sourceInput(body, true);
  const insertStatement = ctx.env.DB.prepare(`
    INSERT INTO costume_source(costume_id, source_type, title, thumbnail_url, source_url, sort_order)
    VALUES(?, ?, ?, ?, ?, COALESCE(?, (
      SELECT COALESCE(MAX(sort_order), -1) + 1 FROM costume_source
      WHERE costume_id = ? AND source_type = ?
    ))) RETURNING id
  `).bind(costumeId, fields.sourceType, fields.title, fields.thumbnailUrl ?? null, fields.sourceUrl,
    fields.sortOrder ?? null, costumeId, fields.sourceType);

  const auditStatement = audit(ctx, user, 'source.create');
  const batchResults = await ctx.env.DB.batch([insertStatement, auditStatement, normalizeSourceOrder(ctx, costumeId)]);

  const rawId = (batchResults[0].results?.[0] as { id?: number } | undefined)?.id;
  const sourceId = Number(rawId);

  if (!Number.isSafeInteger(sourceId) || sourceId < 1) {
    throw new Error('資料登録のIDを取得できません');
  }

  const row = await loadSource(ctx, sourceId);

  const response: CostumeSourceCreateResponse = row ? sourceDto(row) : { id: sourceId };
  return json(response, 201);
}

/**
 * 資料の更新
 */
export async function updateSource(ctx: Context, user: User, id: number): Promise<Response> {
  const current = await loadSource(ctx, id);

  if (!current) {
    return fail('資料が見つかりません', 404);
  }

  const body = await requiredJson(ctx);

  const fields = sourceInput(body, false);
  const patch = patchSet(fields, {
    sourceType: 'source_type', title: 'title', thumbnailUrl: 'thumbnail_url',
    sourceUrl: 'source_url', sortOrder: 'sort_order',
  });
  patch.assignments.push('updated_at = CURRENT_TIMESTAMP');
  const updateStatement = ctx.env.DB.prepare(
    `UPDATE costume_source SET ${patch.assignments.join(', ')} WHERE id = ?`
  ).bind(...patch.values, id);

  const auditStatement = audit(ctx, user, 'source.update', String(id));
  await ctx.env.DB.batch([updateStatement, auditStatement, normalizeSourceOrder(ctx, current.costume_id)]);

  const updatedRow = await loadSource(ctx, id);

  // Preserve the existing 500 when the saved source cannot be reloaded.
  if (!updatedRow) throw new Error('Saved source could not be reloaded');
  return json(sourceDto(updatedRow));
}

/** 
 * 資料の削除
 */
export async function deleteSource(ctx: Context, user: User, id: number): Promise<Response> {
  const exists = await ctx.env.DB.prepare(
    'SELECT costume_id FROM costume_source WHERE id = ?'
  ).bind(id).first<{ costume_id: string }>();

  if (!exists) {
    return fail('資料が見つかりません', 404);
  }

  const deleteStatement = ctx.env.DB.prepare('DELETE FROM costume_source WHERE id = ?').bind(id);
  const auditStatement = audit(ctx, user, 'source.delete', String(id));
  await ctx.env.DB.batch([deleteStatement, auditStatement, normalizeSourceOrder(ctx, exists.costume_id)]);

  return json({ ok: true });
}

/** 管理画面のカード順を、区分の優先順で0から保存する。 */
export async function reorderSources(ctx: Context, user: User, costumeId: string): Promise<Response> {
  const body = await requiredJson(ctx);
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    throw new InputError('資料の順序が不正です');
  }

  const costume = await ctx.env.DB.prepare('SELECT 1 FROM costume WHERE id = ?').bind(costumeId).first();
  if (!costume) return fail('衣装が見つかりません', 404);

  const rows = await ctx.env.DB.prepare(
    'SELECT id, source_type FROM costume_source WHERE costume_id = ?'
  ).bind(costumeId).all<{ id: number; source_type: string }>();
  const types = new Map(rows.results.map(row => [row.id, row.source_type]));
  if (ids.length !== rows.results.length || ids.some(id => !types.has(id))) {
    return fail('資料の一覧が変更されました。再読み込みしてください', 409);
  }

  const orderedIds = ['THREE_VIEW', 'VIDEO', 'OTHER'].flatMap(type => ids.filter(id => types.get(id) === type));
  const statement = ctx.env.DB.prepare(`
    WITH ordered AS MATERIALIZED (
      SELECT CAST(value AS INTEGER) AS id, CAST(key AS INTEGER) AS position FROM json_each(?)
    )
    UPDATE costume_source
    SET sort_order = (SELECT position FROM ordered WHERE ordered.id = costume_source.id),
      updated_at = CURRENT_TIMESTAMP
    WHERE costume_id = ?
  `).bind(JSON.stringify(orderedIds), costumeId);
  const auditStatement = ctx.env.DB.prepare(
    'INSERT INTO audit_log(actor_discord_id, action, target_id) VALUES(?, ?, ?)'
  ).bind(user.discord_id, 'source.reorder', costumeId);
  await ctx.env.DB.batch([statement, auditStatement]);
  return json({ ids: orderedIds });
}
