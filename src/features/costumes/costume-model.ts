/**
 * APIで受け渡す衣装資料
 * レコードから画面向けのDTOに変換
 */
export interface CostumeSourceDto {
  id: number;
  title: string;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sortOrder: number;
  attribution?: SourceAttribution;
}

/** 一覧・詳細のレスポンスに含める参照元情報。 */
export interface SourceAttribution {
  title: string | null;
  authorUrl: string | null;
}

/** Creation may succeed even when the subsequent SELECT no longer finds the row. */
export type CostumeSourceCreateResponse = CostumeSourceDto | { id: number };

/**
 * 基本情報DTO
 */
export interface CostumeSummaryDto {
  id: string;
  name: string;
  debutYear: number | null;
  category: string;
  description: string;
  thumbnailUrl: string | null;
  primarySource: Pick<CostumeSourceDto, 'id' | 'sourceUrl' | 'attribution'> | null;
}

/**
 * 詳細画面用DTO
 */
export interface CostumeDetailDto extends CostumeSummaryDto {
  keywords: string[];
  sources: CostumeSourceDto[];
  relatedCostumes: CostumeSummaryDto[];
}

/** 
 * 管理用：基本情報DTO
 */
export interface AdminCostumeSummaryDto extends CostumeSummaryDto {
  debutDate: string | null;
  isPublished: boolean;
  familyKey: string | null;
}

/** 
 * 管理用：編集情報DTO
 */
export interface AdminCostumeDto extends CostumeDetailDto, AdminCostumeSummaryDto { }

/**
 * ページング結果
 */
export interface CostumeListResponse<T extends CostumeSummaryDto = CostumeSummaryDto> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * 新規登録用データ
 */
export interface CostumeCreateRequest {
  name: string;
  debutDate?: string | null;
  category?: string;
  description?: string;
  thumbnailUrl?: string | null;
  keywords?: string[];
  relatedCostumeId?: string | null;
  isPublished?: boolean;
}

/**
 * 衣装の部分更新用データ（省略時は現在値を再利用）
 */
export type CostumeUpdateRequest = Partial<CostumeCreateRequest>;

/**
 * 資料の登録データ（URLはhttps必須）  
 */
export interface CostumeSourceCreateRequest {
  title: string;
  thumbnailUrl?: string | null;
  sourceUrl: string;
}


/**
 * 資料の部分更新用データ（省略時は現在値を再利用）
 */
export type CostumeSourceUpdateRequest = Partial<CostumeSourceCreateRequest>;
