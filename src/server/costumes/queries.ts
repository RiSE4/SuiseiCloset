import type { AdminCostumeDto, CostumeDetailDto, CostumeListResponse, CostumeSourceDto, CostumeSummaryDto } from '../../features/costumes/costume-model';
import type { Costume, CostumeSource } from '../../features/costumes/costume-record';
import { parseKeywordsJson } from '../../features/costumes/keywords';
import { fail, json } from '../http';
import type { Context } from '../types';
import { paging } from './validation';

/** D1列定義：衣装 */
export const columnList = 'id,name,debut_date,category,description,thumbnail_url,family_key,keywords_json,search_text,is_published,created_at,updated_at';

/** D1列定義：関連資料 */
export const sourceColumns = 'id,costume_id,source_type,title,thumbnail_url,source_url,sort_order,created_at,updated_at';

/** D1の衣装レコードを、画面用DTOに変換 */
const summary = (row: Costume): CostumeSummaryDto => ({
  id: row.id, name: row.name, debutYear: row.debut_date ? Number(row.debut_date.slice(0, 4)) : null, category: row.category,
  description: row.description, thumbnailUrl: row.thumbnail_url,
});

/** D1の資料レコードを、画面用DTOに変換 */
export const sourceDto = (row: CostumeSource): CostumeSourceDto => ({
  id: row.id, sourceType: row.source_type, title: row.title,
  thumbnailUrl: row.thumbnail_url, sourceUrl: row.source_url, sortOrder: row.sort_order,
});

/**
 * 公開されている衣装で使用されるカテゴリを取得
 */
export async function categories(ctx: Context, admin = false): Promise<Response> {
  const rows = await ctx.env.DB.prepare(
    `SELECT DISTINCT category FROM costume WHERE ${admin ? '' : 'is_published=1 AND '}category<>'' ORDER BY category`
  ).all<{ category: string }>();

  return json({
    items: rows.results.map(row => row.category)
  });
}

/** 登録済み衣装に設定されている年を重複なく絞り込み候補として返す。 */
export async function publicationYears(ctx: Context, admin = false): Promise<Response> {
  const rows = await ctx.env.DB.prepare(
    `SELECT DISTINCT CAST(substr(debut_date, 1, 4) AS INTEGER) AS debut_year FROM costume WHERE debut_date IS NOT NULL${admin ? '' : ' AND is_published = 1'} ORDER BY debut_year DESC`
  ).all<{ debut_year: number }>();
  return json({ items: rows.results.map(row => row.debut_year) });
}

/**
 * 条件に一致する衣装一覧と件数を取得
 */
export async function list(ctx: Context, admin: boolean): Promise<Response> {
  const { limit, offset, q, category, pubYear, published } = paging(new URL(ctx.request.url), admin);

  //閲覧用では必ず公開衣装に限定
  const clauses = [admin ? '1=1' : 'is_published=1'];
  const params: (string | number)[] = [];

  if (admin && published !== null) {
    clauses.push(`is_published=${published === 'true' ? 1 : 0}`);
  }
  //キーワード（部分一致）
  if (q) {
    clauses.push('instr(search_text, ?) > 0');
    params.push(q);
  }
  //カテゴリ（完全一致）
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }
  if (pubYear !== null) {
    clauses.push('debut_date >= ? AND debut_date < ?');
    params.push(`${pubYear}-01-01`, `${pubYear + 1}-01-01`);
  }
  const where = clauses.join(' AND ');

  const totalQuery = `SELECT count(*) AS total FROM costume WHERE ${where}`;
  const totalResult = await ctx.env.DB.prepare(totalQuery).bind(...params).first<{ total: number }>();
  const dataQuery = `SELECT ${columnList} FROM costume WHERE ${where} ORDER BY debut_date DESC, id LIMIT ? OFFSET ?`;
  const rows = await ctx.env.DB.prepare(dataQuery).bind(...params, limit, offset).all<Costume>();

  const items = rows.results.map((row) => {
    const baseSummary = summary(row);

    if (admin) {
      return {
        ...baseSummary,
        debutDate: row.debut_date,
        isPublished: row.is_published === 1,
        familyKey: row.family_key,
      };
    }

    return baseSummary;
  });

  return json(
    {
      items,
      total: totalResult?.total ?? 0,
      limit,
      offset,
    } satisfies CostumeListResponse
  );
}

/**
 * 衣装本体・資料・同じfamily_keyの関連衣装をまとめて取得する。自分自身は関連一覧から除く。
 * 閲覧用では本体と関連衣装を公開済みに限定し、対象がなければ404を返す。
 * @param status - 応答のHTTPステータス。通常は200、新規登録直後は201。
 */

/**
 * 衣装の詳細情報を取得
 */
export async function detail(ctx: Context, id: string, admin: boolean, status = 200): Promise<Response> {
  const costumeQuery = `SELECT ${columnList} FROM costume WHERE id = ?${admin ? '' : ' AND is_published = 1'}`;
  const row = await ctx.env.DB.prepare(costumeQuery).bind(id).first<Costume>();

  if (!row) {
    return fail('衣装が見つかりません', 404);
  }

  //紐づくcostume_sourceの取得
  const sourceQuery = `
    SELECT ${sourceColumns} 
    FROM costume_source 
    WHERE costume_id = ? 
    ORDER BY CASE source_type WHEN 'THREE_VIEW' THEN 0 WHEN 'VIDEO' THEN 1 ELSE 2 END, sort_order, id
  `;
  const sourcesResult = await ctx.env.DB.prepare(sourceQuery).bind(id).all<CostumeSource>();

  // 3. 同じfamily_keyを持つ関連衣装の取得（自分自身は除外）
  let relatedResults: Costume[] = [];
  if (row.family_key) {
    const relatedQuery = `
      SELECT ${columnList} 
      FROM costume 
      WHERE family_key = ? AND id <> ?${admin ? '' : ' AND is_published = 1'} 
      ORDER BY debut_date DESC, id
    `;
    const relatedResponse = await ctx.env.DB.prepare(relatedQuery).bind(row.family_key, id).all<Costume>();
    relatedResults = relatedResponse.results;
  }

  const baseDto: CostumeDetailDto = {
    ...summary(row),
    keywords: parseKeywordsJson(row.keywords_json),
    sources: sourcesResult.results.map(sourceDto),
    relatedCostumes: relatedResults.map(summary),
  };

  //管理用プロペティを追加して返却
  if (admin) {
    const adminDto: AdminCostumeDto = {
      ...baseDto,
      debutDate: row.debut_date,
      isPublished: row.is_published === 1,
      familyKey: row.family_key,
    };
    return json(adminDto, status);
  }

  return json(baseDto, status);
}
