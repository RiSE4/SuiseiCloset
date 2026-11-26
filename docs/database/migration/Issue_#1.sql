-- Issue #1 一般公開に向けた著作権・外部サービス利用規約の調査と機能改修

-- costume_sourceからsource_typeを廃止した。それに伴い、sort_orderの整合性が崩れる。
-- そのためカラムを削除する前にsort_orderを更新し、更新後にカラムを削除する。

-- sort_orderの上書き
WITH ordered AS MATERIALIZED (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY costume_id
    ORDER BY CASE source_type WHEN 'THREE_VIEW' THEN 0 WHEN 'VIDEO' THEN 1 ELSE 2 END,
      sort_order, id
  ) AS position
  FROM costume_source
)
UPDATE costume_source
SET sort_order = (SELECT position FROM ordered WHERE ordered.id = costume_source.id);
-- カラムの削除
ALTER TABLE costume_source DROP COLUMN source_type;

-- カラーパレットの追加
ALTER TABLE costume ADD COLUMN color_palette TEXT DEFAULT NULL CHECK(color_palette IS NULL OR json_valid(color_palette));
ALTER TABLE costume ADD COLUMN palette_revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER costume_thumbnail_palette AFTER UPDATE OF thumbnail_url ON costume
WHEN NEW.thumbnail_url IS NOT OLD.thumbnail_url
BEGIN
  UPDATE costume SET color_palette = NULL, palette_revision = OLD.palette_revision + 1 WHERE id = NEW.id;
END;

-- 共通サムネイルの参照元をカスタム
ALTER TABLE costume ADD COLUMN thumbnail_source_title TEXT;
ALTER TABLE costume ADD COLUMN thumbnail_source_url TEXT
  CHECK(thumbnail_source_url IS NULL OR trim(thumbnail_source_url) = '' OR thumbnail_source_url LIKE 'https://%');

