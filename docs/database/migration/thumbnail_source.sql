ALTER TABLE costume ADD COLUMN thumbnail_source_title TEXT;
ALTER TABLE costume ADD COLUMN thumbnail_source_url TEXT
  CHECK(thumbnail_source_url IS NULL OR trim(thumbnail_source_url) = '' OR thumbnail_source_url LIKE 'https://%');
