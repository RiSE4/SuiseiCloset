/**
 * 資料の区分
 * 三面図・設定画 / 元配信・元動画 / その他の資料
 */
export type SourceType = 'THREE_VIEW' | 'VIDEO' | 'OTHER';

/**
 * APIで受け渡す衣装資料
 * レコードから画面向けのDTOに変換
 */
export interface CostumeSourceDto {
  id: number;
  sourceType: SourceType;
  title: string;
  thumbnailUrl: string | null;
  sourceUrl: string;
  sortOrder: number;
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
  sourceType: SourceType;
  title: string;
  thumbnailUrl?: string | null;
  sourceUrl: string;
  sortOrder?: number;
}


/**
 * 資料の部分更新用データ（省略時は現在値を再利用）
 */
export type CostumeSourceUpdateRequest = Partial<CostumeSourceCreateRequest>;
