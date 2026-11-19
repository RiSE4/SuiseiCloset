/** セッションに格納するユーザー情報 */
export interface AuthUser {
    /** Discord ID */
    discord_id: string;
    /** Discord ユーザー名 */
    display_name: string;
    /** 権限 */
    role: 'admin' | 'editor' | 'member';
    /** 有効フラグ（0: 無効、1: 有効） */
    enabled: number
}
