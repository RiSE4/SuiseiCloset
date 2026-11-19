import type { LocationQuery, LocationQueryRaw } from 'vue-router';

/** 編集画面の戻り先は管理一覧とその検索条件だけを許可する。 */
export function adminListReturnPath(value: unknown): string {
  return typeof value === 'string' && (value === '/admin/costumes' || value.startsWith('/admin/costumes?'))
    ? value : '/admin/costumes';
}

/**
 * クエリパラメータの値から最初の有効な文字列を取り出す
 * 同名のクエリが存在する場合は最初の文字列の値を使用
 * @param value クエリパラメータの値
 * @returns 抽出した文字列
 */
const one = (value: string | null | (string | null)[] | undefined): string =>
  typeof value === 'string' ? value : Array.isArray(value) ? value.find((item): item is string => typeof item === 'string') || '' : '';

/**
 * クエリの検索条件をパースし、リクエスト用パラメータ及びページング情報を返却
 * 検索キーワードは150文字、カテゴリは120文字で制限、不正ページは1へ戻す
 * @param query クエリオブジェクト
 * @returns パース済の検索条件とページング用オブジェクト
 */
export function parseListQuery(query: LocationQuery) {
  const q = one(query.q).trim().slice(0, 150);
  const category = one(query.category).trim().slice(0, 120);
  const rawPubYear = one(query.pubYear);
  const pubYear = /^\d{4}$/.test(rawPubYear) && Number(rawPubYear) >= 2018 && Number(rawPubYear) <= 2100 ? Number(rawPubYear) : null;
  const rawPage = one(query.page);
  // APIのoffset上限1000000を超えないよう、ページ番号の上限を41667にする。
  const page = /^(?:[1-9]\d*)$/.test(rawPage) && Number(rawPage) <= 41667 ? Number(rawPage) : 1;
  return { q, category, pubYear, page, limit: 24, offset: (page - 1) * 24 };
}

/**
 * 検索条件の各パラメータからクエリオブジェクトを生成
 * @param q 検索キーワード
 * @param category カテゴリ名
 * @param page ページ番号（デフォルト：1）
 * @returns URLに含めるクエリパラメータオブジェクト
 */
export function listQuery(q: string, category: string, page = 1, pubYear: number | null = null): LocationQueryRaw {
  return {
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(category ? { category } : {}),
    ...(pubYear !== null ? { pubYear: String(pubYear) } : {}),
    ...(page > 1 ? { page: String(page) } : {})
  };
}
