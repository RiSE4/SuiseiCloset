
/**
 * 衣装データ
 */
export interface Costume {
  id: string;
  name: string;
  debut_date: string | null;
  category: string;
  description: string;
  color_palette: string | null;
  palette_revision: number;
  thumbnail_url: string | null;
  thumbnail_source_title: string | null;
  thumbnail_source_url: string | null;
  /** 同じキーの衣装を関連衣装として扱う（未所属はnull）*/
  family_key: string | null;
  /** キーワード配列をJSON文字列で保存 */
  keywords_json: string;
  /** 衣装名とキーワードを正規化して結合した、部分一致検索用の文字列*/
  search_text: string;
  /** 公開フラグ（0:非公開、1:公開） */
  is_published: 0 | 1;
  created_at: string;
  updated_at: string;
}

/**
 * 衣装の関連資料
 */
export interface CostumeSource {
  id: number;
  costume_id: string;
  title: string;
  thumbnail_url: string | null;
  source_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
