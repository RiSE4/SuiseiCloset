import { requestJson } from '../../shared/api/request';
import type { AdminCostumeDto, AdminCostumeSummaryDto, CostumeCreateRequest, CostumeDetailDto, CostumeListResponse, CostumeSourceCreateRequest, CostumeSourceCreateResponse, CostumeSourceDto, CostumeSourceUpdateRequest, CostumeUpdateRequest } from './costume-model';

/**
 * 衣装一覧の検索結果
 */
export interface CostumeSearch {
  q?: string;
  category?: string;
  pubYear?: number | null;
  limit?: number;
  offset?: number
}

/**
 * 公開されている衣装を検索
 */
export function getCostumes(params: CostumeSearch, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.pubYear !== undefined && params.pubYear !== null) query.set('pubYear', String(params.pubYear));
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  return requestJson<CostumeListResponse>(`/api/costumes?${query}`, signal);
}

/**
 * 公開されている衣装の基本情報、キーワード、資料、関連衣装を取得
 */
export const getCostumeDetail = (id: string, signal?: AbortSignal) => requestJson<CostumeDetailDto>(`/api/costumes/${encodeURIComponent(id)}`, signal);

/**
 * 絞り込み用のカテゴリ一覧を取得
 */
export const getCategories = (signal?: AbortSignal) => requestJson<{ items: string[] }>('/api/categories', signal);
export const getAdminCategories = (signal?: AbortSignal) => requestJson<{ items: string[] }>('/api/admin/categories', signal);

export const getPublicationYears = (signal?: AbortSignal) => requestJson<{ items: number[] }>('/api/pub-years', signal);
export const getAdminPublicationYears = (signal?: AbortSignal) => requestJson<{ items: number[] }>('/api/admin/pub-years', signal);

/**
 * 管理用の検索条件
 */
export interface AdminCostumeSearch extends CostumeSearch {
  published?: boolean | null;
}

/**
 * 管理用：衣装一覧の取得（非公開も含む）
 */
export function getAdminCostumes(params: AdminCostumeSearch, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.pubYear !== undefined && params.pubYear !== null) query.set('pubYear', String(params.pubYear));
  if (params.published !== undefined && params.published !== null) query.set('published', String(params.published));
  query.set('limit', String(params.limit ?? 24));
  query.set('offset', String(params.offset ?? 0));
  return requestJson<CostumeListResponse<AdminCostumeSummaryDto>>(`/api/admin/costumes?${query}`, signal);
}

/**
 * 管理用：衣装の詳細情報の取得
 */
export const getAdminCostumeDetail = (id: string, signal?: AbortSignal) => requestJson<AdminCostumeDto>(`/api/admin/costumes/${encodeURIComponent(id)}`, signal);

/**
 * 管理用：衣装の新規登録と、採番されたIDを含む詳細の返却
 */
export const createCostume = (payload: CostumeCreateRequest) => requestJson<AdminCostumeDto>('/api/admin/costumes', undefined, 'POST', payload);

/**
 * 管理用：更新と、更新結果の返却
 */
export const updateCostume = (id: string, payload: CostumeUpdateRequest) => requestJson<AdminCostumeDto>(`/api/admin/costumes/${encodeURIComponent(id)}`, undefined, 'PATCH', payload);

/**
 * 管理用：衣装及び紐づく資料の削除
 */
export const deleteCostume = (id: string) => requestJson<{ ok: boolean }>(`/api/admin/costumes/${encodeURIComponent(id)}`, undefined, 'DELETE');

/**
 * 管理用：衣装情報の新規追加と、登録された資料の返却
 */
export const createCostumeSource = (id: string, payload: CostumeSourceCreateRequest) => requestJson<CostumeSourceCreateResponse>(`/api/admin/costumes/${encodeURIComponent(id)}/sources`, undefined, 'POST', payload);

/** 管理用：資料カードの並びをまとめて保存。 */
export const reorderCostumeSources = (id: string, ids: number[]) => requestJson<{ ids: number[] }>(`/api/admin/costumes/${encodeURIComponent(id)}/sources/order`, undefined, 'PUT', { ids });

/**
 * 管理用：登録済みの関連資料の更新
 */
export const updateCostumeSource = (id: number, payload: CostumeSourceUpdateRequest) => requestJson<CostumeSourceDto>(`/api/admin/sources/${id}`, undefined, 'PATCH', payload);

/**
 * 管理用：登録済みの関連資料の削除
 */
export const deleteCostumeSource = (id: number) => requestJson<{ ok: boolean }>(`/api/admin/sources/${id}`, undefined, 'DELETE');
