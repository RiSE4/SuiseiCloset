ALTER TABLE costume ADD COLUMN color_palette TEXT DEFAULT NULL CHECK(color_palette IS NULL OR json_valid(color_palette));
ALTER TABLE costume ADD COLUMN palette_revision INTEGER NOT NULL DEFAULT 0;
CREATE TRIGGER costume_thumbnail_palette AFTER UPDATE OF thumbnail_url ON costume
WHEN NEW.thumbnail_url IS NOT OLD.thumbnail_url
BEGIN
  UPDATE costume SET color_palette = NULL, palette_revision = OLD.palette_revision + 1 WHERE id = NEW.id;
END;
