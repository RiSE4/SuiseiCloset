-- Explicit local-only test account. Never run against the remote D1 database.
INSERT OR IGNORE INTO users(discord_id,display_name,role,enabled) VALUES('999999999999999999','ローカル管理者','admin',1);
