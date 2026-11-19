import { requestJson } from '../../shared/api/request';
import type { AuthUser } from './auth-types';

/** 現在のユーザーとサーバー側のDiscord OAuth設定の有効状態を取得*/
export const getCurrentUser = () => requestJson<{ user: AuthUser | null; oauth_enabled: boolean }>('/api/me');

/**
 * 開発用エンドポイントでテストユーザーのセッションを作成
 */
export async function devLogin() {
  const response = await fetch('/auth/dev-login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Origin: location.origin
    }
  });

  if (response.ok) {
    return;
  }

  const reason = await response.text();

  if (reason === 'Test user is not registered in D1') {
    throw new Error('ローカルD1にテスト用ユーザーが見つかりません。');
  }

  throw new Error('テストログインに失敗しました。設定と開いているURLを確認してください。');
}

/** 
 * サーバー側のセッションを破棄
 */
export async function logout() {
  const response = await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Origin: location.origin
    }
  });

  if (!response.ok) {
    throw new Error('ログアウトできませんでした。');
  }
}
