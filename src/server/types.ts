/**
 * Cloudflare Pages Functionsの環境変数のバインド先
 */
export interface Env {
    DB: D1Database;
    DISCORD_CLIENT_ID: string;
    DISCORD_CLIENT_SECRET: string;
    DISCORD_REDIRECT_URI: string;
    APP_ORIGIN: string;
    OAUTH_ENABLED?: string;
    DEV_AUTH_ENABLED?: string;
    DEV_DISCORD_ID?: string;
}

/** 
 * セッションのユーザー情報
 */
export type User = {
    discord_id: string;
    display_name: string;
    role: 'admin' | 'editor' | 'member';
    enabled: number
};

/**
 * 環境変数とリクエストを含むPages Functionsの実行コンテキスト
 */
export type Context = EventContext<Env, string, Record<string, unknown>>;
