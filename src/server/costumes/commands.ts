import type { CostumeSourceCreateResponse } from '../../features/costumes/costume-model';
import type { Context, User } from '../types';
import { fail, json, readJson } from '../http';
import type { Costume, CostumeSource } from '../../features/costumes/costume-record';
import { parseKeywordsJson } from '../../features/costumes/keywords';
import { searchTextFor } from './search-index';
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
async function requiredJson(ctx: Context, limit = 20000): Promise<Record<string, unknown>> {
  const body = await readJson(ctx, limit);
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
function relatedUpdate(ctx: Context, id: string, familyKey: string, guard?: { id: string; name?: string; keywords?: string; description?: string }): D1PreparedStatement {
  return ctx.env.DB.prepare(`
    UPDATE costume
    SET family_key = CASE WHEN family_key IS NULL THEN ? ELSE '' END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?${guard ? ` AND EXISTS(SELECT 1 FROM costume WHERE id = ?${guard.name !== undefined ? ' AND name = ? AND keywords_json = ? AND description = ?' : ''})` : ''}
  `).bind(familyKey, id, ...(guard ? [guard.id, ...(guard.name !== undefined ? [guard.name, guard.keywords, guard.description] : [])] : []));
}

function patchSet(fields: Record<string, unknown>, columns: Record<string, string>) {
  const keys = Object.keys(columns).filter(key => has(fields, key));
  return { assignments: keys.map(key => `${columns[key]} = ?`), values: keys.map(key => fields[key]) };
}

/** 衣装内の資料を現在の順序で1から連番にする。 */
function normalizeSourceOrder(ctx: Context, costumeId: string): D1PreparedStatement {
  return ctx.env.DB.prepare(`
    WITH ranked AS MATERIALIZED (
      SELECT id, ROW_NUMBER() OVER (
        ORDER BY sort_order, id
      ) AS position
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
  const body = await requiredJson(ctx, 1024 * 1024);
  const fields = costumeInput(body, true);
  const name = fields.name;
  const debutDate = fields.debutDate ?? null;
  const category = fields.category ?? '';
  const description = fields.description ?? '';
  const thumbnailUrl = fields.thumbnailUrl ?? null;
  const keywords = fields.keywords ?? [];
  const isPublished = fields.isPublished ? 1 : 0;
  if (!fields.searchIndex) throw new InputError('検索用データが必要です。画面を再読み込みして保存してください');
  const searchText = searchTextFor(fields.searchIndex, { name, keywords, description });
  if (searchText === null) throw new InputError('検索用データと衣装情報が一致しません');

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
      id, name, debut_date, category, description, thumbnail_url, thumbnail_source_title, thumbnail_source_url,
      family_key, keywords_json, search_text, is_published
    )
    VALUES(${nextCostumeIdSql}, ?, ?, ?, ?, ?, ?, ?, ${familyExpression}, ?, ?, ?)
    RETURNING id
  `).bind(
    name, debutDate, category, description, thumbnailUrl,
    fields.thumbnailSourceTitle ?? null, fields.thumbnailSourceUrl ?? null,
    ...familyParams, JSON.stringify(keywords), searchText,
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
  const fields = costumeInput(await requiredJson(ctx, 1024 * 1024), false);
  const changesSearch = has(fields, 'name') || has(fields, 'keywords') || has(fields, 'description') || has(fields, 'searchIndex');
  if (changesSearch && !fields.searchIndex) throw new InputError('検索用データが必要です。画面を再読み込みして保存してください');

  // 競合によって処理が無制限に続かないよう再試行回数に上限設定
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) current = await loadCurrent();
    if (!current) return fail('衣装が見つかりません', 404);
    const patch = patchSet(fields, {
      name: 'name', debutDate: 'debut_date', category: 'category', description: 'description',
      thumbnailUrl: 'thumbnail_url', isPublished: 'is_published',
      thumbnailSourceTitle: 'thumbnail_source_title', thumbnailSourceUrl: 'thumbnail_source_url',
    });
    if (has(fields, 'isPublished')) {
      const index = patch.assignments.indexOf('is_published = ?');
      patch.values[index] = fields.isPublished ? 1 : 0;
    }
    const guard = changesSearch ? { id, name: current.name, keywords: current.keywords_json, description: current.description } : undefined;
    if (has(fields, 'keywords')) {
      patch.assignments.push('keywords_json = ?');
      patch.values.push(JSON.stringify(fields.keywords));
    }
    if (changesSearch) {
      const name = fields.name ?? current.name;
      const keywords = fields.keywords ?? parseKeywordsJson(current.keywords_json);
      const description = fields.description ?? current.description;
      const searchText = searchTextFor(fields.searchIndex!, { name, keywords, description });
      if (searchText === null) return fail('衣装情報が変更されました。画面を再読み込みして保存してください', 409);
      patch.assignments.push('search_text = ?');
      patch.values.push(searchText);
    }

    const statements: D1PreparedStatement[] = [];
    if (has(fields, 'relatedCostumeId')) {
      const relatedId = fields.relatedCostumeId;
      const relation = relatedId ? await relatedKey(ctx, relatedId, id, current.family_key) : null;
      const family = relation?.key ?? null;
      if (relatedId && relation?.targetNeedsUpdate) {
        // 検索情報の比較更新が失敗した場合は、関連先にも変更を残さない
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
      WHERE id = ?${changesSearch ? ' AND name = ? AND keywords_json = ? AND description = ?' : ''}
      RETURNING id
    `).bind(...patch.values, id, ...(guard ? [guard.name, guard.keywords, guard.description] : [])));
    // 比較更新の条件が不一致なら更新も監査記録も行わない
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
    INSERT INTO costume_source(costume_id, title, thumbnail_url, source_url, sort_order)
    VALUES(?, ?, ?, ?, (
      SELECT COALESCE(MAX(sort_order), 0) + 1 FROM costume_source WHERE costume_id = ?
    )) RETURNING id
  `).bind(costumeId, fields.title, fields.thumbnailUrl ?? null, fields.sourceUrl, costumeId);

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
    title: 'title', thumbnailUrl: 'thumbnail_url', sourceUrl: 'source_url',
  });
  patch.assignments.push('updated_at = CURRENT_TIMESTAMP');
  const updateStatement = ctx.env.DB.prepare(
    `UPDATE costume_source SET ${patch.assignments.join(', ')} WHERE id = ?`
  ).bind(...patch.values, id);

  const auditStatement = audit(ctx, user, 'source.update', String(id));
  await ctx.env.DB.batch([updateStatement, auditStatement, normalizeSourceOrder(ctx, current.costume_id)]);

  const updatedRow = await loadSource(ctx, id);

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

/** 全件の所属と集合をバッチ内でも確認し、配列順を原子的に保存する。 */
export async function reorderSources(ctx: Context, user: User, costumeId: string): Promise<Response> {
  const body = await requiredJson(ctx);
  const ids = body.ids;
  if (Object.keys(body).some(key => key !== 'ids') || !Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    throw new InputError('資料の順序が不正です');
  }

  const costume = await ctx.env.DB.prepare('SELECT 1 FROM costume WHERE id = ?').bind(costumeId).first();
  if (!costume) return fail('衣装が見つかりません', 404);

  const rows = await ctx.env.DB.prepare(
    'SELECT id FROM costume_source WHERE costume_id = ?'
  ).bind(costumeId).all<{ id: number }>();
  const currentIds = new Set(rows.results.map(row => row.id));
  if (ids.length !== rows.results.length || ids.some(id => !currentIds.has(id))) {
    return fail('資料の一覧が変更されました。再読み込みしてください', 409);
  }

  const statement = ctx.env.DB.prepare(`
    WITH ordered AS MATERIALIZED (
      SELECT CAST(value AS INTEGER) AS id, CAST(key AS INTEGER) + 1 AS position FROM json_each(?)
    )
    UPDATE costume_source
    SET sort_order = (SELECT position FROM ordered WHERE ordered.id = costume_source.id),
      updated_at = CURRENT_TIMESTAMP
    WHERE costume_id = ?
  `).bind(JSON.stringify(ids), costumeId);
  // NOT NULL違反でバッチ全体を取り消す。事前SELECTと更新の間の追加・削除も検出する。
  const auditStatement = ctx.env.DB.prepare(`
    INSERT INTO audit_log(actor_discord_id, action, target_id)
    VALUES(?, 'source.reorder', CASE WHEN
      EXISTS(SELECT 1 FROM costume WHERE id = ?)
      AND (SELECT COUNT(*) FROM costume_source WHERE costume_id = ?) = ?
      AND NOT EXISTS(SELECT 1 FROM json_each(?) AS requested WHERE NOT EXISTS(
        SELECT 1 FROM costume_source WHERE costume_id = ? AND id = requested.value
      )) THEN ? ELSE NULL END)
  `).bind(user.discord_id, costumeId, costumeId, ids.length, JSON.stringify(ids), costumeId, costumeId);
  try {
    await ctx.env.DB.batch([auditStatement, statement]);
  } catch (error) {
    if (String(error).includes('NOT NULL constraint failed: audit_log.target_id')) {
      return fail('資料の一覧が変更されました。再読み込みしてください', 409);
    }
    throw error;
  }
  return json({ ids });
}
