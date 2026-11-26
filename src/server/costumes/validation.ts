import type { CostumeCreateRequest, CostumeUpdateRequest, CostumeSourceCreateRequest, CostumeSourceUpdateRequest } from '../../features/costumes/costume-model';
import { normalizeKeyword, validateKeywords } from '../../features/costumes/keywords';
import { validateHttpsUrl } from '../../features/costumes/validate-https-url';
import { isValidDebutDate } from '../../features/costumes/debut-date';

/**
 * 部分更新用：パラメータの有無を判定（nullなどの明示指定をまとめない）
 */
export const has = (body: object, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

/** 衣装の登録・更新で受け付ける項目 */
const costumeKeys = new Set(['name', 'debutDate', 'category', 'description', 'thumbnailUrl', 'thumbnailSourceTitle', 'thumbnailSourceUrl', 'keywords', 'relatedCostumeId', 'isPublished']);

/** 資料の登録・更新で受け付ける項目 */
const sourceKeys = new Set(['title', 'thumbnailUrl', 'sourceUrl']);

/** 衣装IDはcostume-と3桁以上の数字（合計100文字以内）。 */
export const idPattern = /^costume-\d{3,92}$/;

/** 
 * 入力不正や対象の未検出などの共通例外
 */
export class InputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** trim前の長さと文字列型を検証して前後の空白を除く。emptyがfalseなら空文字も拒否する。 */

/**
 * 文字列をトリムして返却
 */
function text(value: unknown, label: string, max: number, empty = true): string {
  if (typeof value !== 'string' || value.length > max) {
    throw new InputError(`${label}が不正です`);
  }

  const result = value.trim();

  if (!empty && !result) {
    throw new InputError(`${label}を入力してください`);
  }

  return result;
}

/**
 * nullによる解除を許可し、それ以外は2048文字以内のHTTPS URLであることを検証
 */
function nullableUrl(value: unknown, label: string): string | null {
  if (value === null) return null;

  if (typeof value !== 'string' || value.length > 2048) {
    throw new InputError(`${label}が不正です`);
  }

  try {
    return validateHttpsUrl(value.trim());
  } catch {
    throw new InputError(`${label}はHTTPS URLにしてください`);
  }
}

/**
 * 必須のURLを検証（nullは受け付けない）
 */
function requiredUrl(value: unknown, label: string): string {
  const url = nullableUrl(value, label);
  if (!url) throw new InputError(`${label}を入力してください`);
  return url;
}

/**
 * 入力オブジェクトに、許可された項目以外が含まれていないことを確認
 */
function checkKeys(body: Record<string, unknown>, keys: Set<string>) {
  if (Object.keys(body).some(key => !keys.has(key))) {
    throw new InputError('未対応の入力項目があります');
  }
}

/**
 * 衣装の送信項目を検証・整形し、指定された項目だけを返却
 */
export function costumeInput(body: Record<string, unknown>, create: true): CostumeCreateRequest;
export function costumeInput(body: Record<string, unknown>, create: false): CostumeUpdateRequest;
export function costumeInput(body: Record<string, unknown>, create: boolean): CostumeUpdateRequest {
  checkKeys(body, costumeKeys);

  if (create && !has(body, 'name')) {
    throw new InputError('nameを入力してください');
  }

  if (!create && !Object.keys(body).length) {
    throw new InputError('更新項目がありません');
  }

  const fields: CostumeUpdateRequest = {};

  if (has(body, 'thumbnailSourceTitle')) {
    fields.thumbnailSourceTitle = body.thumbnailSourceTitle === null ? null : text(body.thumbnailSourceTitle, '参照元', 500) || null;
  }

  if (has(body, 'thumbnailSourceUrl')) {
    fields.thumbnailSourceUrl = body.thumbnailSourceUrl === null || body.thumbnailSourceUrl === '' ||
      (typeof body.thumbnailSourceUrl === 'string' && !body.thumbnailSourceUrl.trim())
      ? null : nullableUrl(body.thumbnailSourceUrl, 'リンク先');
  }

  //name
  if (has(body, 'name')) {
    fields.name = text(body.name, 'name', 150, false);
  }

  //debutDate（2018-01-01〜2100-12-31、またはnull）
  if (has(body, 'debutDate')) {
    if (body.debutDate !== null && !isValidDebutDate(body.debutDate)) {
      throw new InputError('debutDateはYYYY-MM-DD形式の実在する日付にしてください');
    }
    fields.debutDate = body.debutDate;
  }

  //category
  if (has(body, 'category')) {
    fields.category = text(body.category, 'category', 120);
  }

  //description
  if (has(body, 'description')) {
    fields.description = text(body.description, 'description', 4000);
  }

  //thumbnailUrl
  if (has(body, 'thumbnailUrl')) {
    fields.thumbnailUrl = nullableUrl(body.thumbnailUrl, 'thumbnailUrl');
  }

  //keywords（キーワードの検証：最大32個、各80文字以内の文字列配列）
  //件数・長さはここで検証し、trim後の空欄と正規化による重複は共通関数で確認
  if (has(body, 'keywords')) {
    const keywords = body.keywords;
    const isInvalidKeywords =
      !Array.isArray(keywords) ||
      keywords.length > 32 ||
      !keywords.every((value: unknown): value is string => typeof value === 'string' && value.length <= 80);

    if (isInvalidKeywords) {
      throw new InputError('keywordsが不正です');
    }

    try {
      fields.keywords = validateKeywords(keywords.map(value => value.trim()));
    } catch {
      throw new InputError('keywordsは重複しない文字列配列にしてください');
    }
  }

  //relatedCostumeId（関連衣装IDの検証）
  if (has(body, 'relatedCostumeId')) {
    const costumeId = body.relatedCostumeId;
    const isInvalidId = costumeId !== null && (typeof costumeId !== 'string' || !idPattern.test(costumeId));

    if (isInvalidId) {
      throw new InputError('relatedCostumeIdが不正です');
    }
    fields.relatedCostumeId = costumeId;
  }

  //isPublished
  if (has(body, 'isPublished')) {
    if (typeof body.isPublished !== 'boolean') {
      throw new InputError('isPublishedが不正です');
    }
    fields.isPublished = body.isPublished;
  }

  return fields;
}

/**
 * 資料の送信項目を検証・整形し、指定された項目だけを返却する
 */
export function sourceInput(body: Record<string, unknown>, create: true): CostumeSourceCreateRequest;
export function sourceInput(body: Record<string, unknown>, create: false): CostumeSourceUpdateRequest;
export function sourceInput(body: Record<string, unknown>, create: boolean): CostumeSourceUpdateRequest {
  checkKeys(body, sourceKeys);

  //新規登録時の必須項目チェック（タイトル・URL）
  if (create && (!has(body, 'title') || !has(body, 'sourceUrl'))) {
    throw new InputError('タイトル、URLが必要です');
  }

  //更新時の空チェック
  if (!create && !Object.keys(body).length) {
    throw new InputError('更新項目がありません');
  }

  const fields: CostumeSourceUpdateRequest = {};

  //title
  if (has(body, 'title')) {
    fields.title = text(body.title, 'title', 150, false);
  }

  //thumbnailUrl
  if (has(body, 'thumbnailUrl')) {
    fields.thumbnailUrl = nullableUrl(body.thumbnailUrl, 'thumbnailUrl');
  }

  //sourceUrl
  if (has(body, 'sourceUrl')) {
    fields.sourceUrl = requiredUrl(body.sourceUrl, 'sourceUrl');
  }

  return fields;
}

/**
 * 一覧APIのクエリを検証し、検索語を保存時と同じ規則で正規化する。
 * limitは1～100（既定24）、offsetは0～1000000（既定0）。公開状態の絞り込みは管理用だけ許可する。
 */

/**
 * 一覧APIのクエリを検証し、search_textを保存時と同じ規則で正規化する
 * limitは1～100（既定24）、offsetは0～1000000（既定0）
 */
export function paging(url: URL, admin: boolean) {
  const value = (key: string, fallback: number, max: number) => {
    const raw = url.searchParams.get(key);
    if (raw === null) return fallback;
    if (!/^(0|[1-9]\d*)$/.test(raw) || Number(raw) > max) throw new InputError(`${key}が不正です`);
    return Number(raw);
  };

  //ページング（limit / offset）の取得と検証
  const limit = value('limit', 24, 100), offset = value('offset', 0, 1_000_000);
  if (limit < 1) {
    throw new InputError('limitが不正です');
  }

  //検索キーワードとカテゴリの文字数チェック  
  const rawQ = url.searchParams.get('q') || '';
  const rawCategory = url.searchParams.get('category') || '';
  const rawPubYear = url.searchParams.get('pubYear');
  if (rawQ.length > 150 || rawCategory.length > 120) {
    throw new InputError('検索条件が長すぎます');
  }
  if (rawPubYear !== null && (!/^\d{4}$/.test(rawPubYear) || Number(rawPubYear) < 2018 || Number(rawPubYear) > 2100)) {
    throw new InputError('pubYearが不正です');
  }

  //公開状態（published）の絞り込み条件チェック（管理者のみ許可）
  const published = url.searchParams.get('published');
  if (published !== null) {
    const isValidPublished = published === 'true' || published === 'false';
    if (!admin || !isValidPublished) {
      throw new InputError('publishedが不正です');
    }
  }

  //正規化および整形済みのクエリパラメータオブジェクトを返却
  return {
    limit,
    offset,
    q: normalizeKeyword(rawQ),
    category: rawCategory.trim(),
    pubYear: rawPubYear === null ? null : Number(rawPubYear),
    published
  };
}
