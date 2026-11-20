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