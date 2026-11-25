-- テーブル作成用DDL
-- Cloudflare D1（SQLite）を使用する想定
PRAGMA foreign_keys = ON;

-- 利用ユーザー
CREATE TABLE users (
  discord_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'member')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- セッション情報
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_user ON sessions(discord_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);


-- OAuth認証中の一時保管
CREATE TABLE oauth_states (state_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL);

-- 監査ログ
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_discord_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- costume.idのAUTO_INCREMENT用（costume-NNN）
-- 新規DBは0から開始し、衣装登録と同じトランザクションでseqを加算
INSERT INTO sqlite_sequence(name, seq) VALUES('costume_id_sequence', 0);

-- 衣装
CREATE TABLE costume (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  debut_date TEXT CHECK(debut_date IS NULL OR (debut_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND debut_date BETWEEN '2018-01-01' AND '2100-12-31')),
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  thumbnail_url TEXT CHECK(thumbnail_url IS NULL OR thumbnail_url LIKE 'https://%'),
  color_palette TEXT DEFAULT NULL CHECK(color_palette IS NULL OR json_valid(color_palette)),
  palette_revision INTEGER NOT NULL DEFAULT 0,
  family_key TEXT CHECK(family_key IS NULL OR length(trim(family_key)) > 0),
  keywords_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(keywords_json) AND json_type(keywords_json) = 'array'),
  search_text TEXT NOT NULL DEFAULT '',
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX costume_family ON costume(family_key) WHERE family_key IS NOT NULL;
CREATE INDEX costume_debut_date ON costume(debut_date DESC, id);
CREATE TRIGGER costume_keywords_insert BEFORE INSERT ON costume
WHEN EXISTS (SELECT 1 FROM json_each(NEW.keywords_json) WHERE type <> 'text' OR length(trim(value)) = 0)
  OR EXISTS (SELECT 1 FROM json_each(NEW.keywords_json) GROUP BY value HAVING count(*) > 1)
BEGIN SELECT RAISE(ABORT, 'keywords_json must contain unique nonempty strings'); END;
CREATE TRIGGER costume_keywords_update BEFORE UPDATE OF keywords_json ON costume
WHEN EXISTS (SELECT 1 FROM json_each(NEW.keywords_json) WHERE type <> 'text' OR length(trim(value)) = 0)
  OR EXISTS (SELECT 1 FROM json_each(NEW.keywords_json) GROUP BY value HAVING count(*) > 1)
BEGIN SELECT RAISE(ABORT, 'keywords_json must contain unique nonempty strings'); END;

-- 衣装に紐づく資料
CREATE TABLE costume_source (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  costume_id TEXT NOT NULL REFERENCES costume(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  thumbnail_url TEXT CHECK(thumbnail_url IS NULL OR thumbnail_url LIKE 'https://%'),
  source_url TEXT NOT NULL CHECK(source_url LIKE 'https://%'),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX costume_source_costume ON costume_source(costume_id, sort_order, id);

CREATE TRIGGER costume_thumbnail_palette AFTER UPDATE OF thumbnail_url ON costume
WHEN NEW.thumbnail_url IS NOT OLD.thumbnail_url
BEGIN
  UPDATE costume SET color_palette = NULL, palette_revision = OLD.palette_revision + 1 WHERE id = NEW.id;
END;
