import { reactive } from 'vue';
import { ApiError } from '../../shared/api/request';
import { getCurrentUser } from './auth-api';
import type { AuthUser } from './auth-types';

/** アプリ全体で共有する認証状態と、ログイン手段の有効状態 */
export const authState = reactive({
  // loading: 確認中、ready: APIの確認成功、required: 未認証、error: 確認失敗
  status: 'loading' as 'loading' | 'ready' | 'required' | 'error',
  user: null as AuthUser | null,
  oauthEnabled: true,
  devLoginEnabled: false,
  message: '',
});

/**
 * ユーザー情報を再取得し、共有状態を更新（401はログイン要求として扱う）
 * 開発用ログインの可否も別途確認し、その取得に失敗した場合はボタンを無効にする
 * 認証確認のエラーはthrowせず、statusとmessageに反映
 */
export async function refreshAuth() {
  authState.status = 'loading';
  authState.message = '';

  try {
    const result = await getCurrentUser();
    authState.user = result.user;
    authState.oauthEnabled = result.oauth_enabled;
    authState.status = 'ready';
  } catch (error) {
    authState.user = null;

    if (error instanceof ApiError && error.status === 401) {
      authState.oauthEnabled = true;
      authState.status = 'required';
    } else {
      authState.status = 'error';
      authState.message = error instanceof Error ? error.message : '認証状態を確認できませんでした。';
    }
  }
  // 認証確認が失敗していても、開発用ログインを利用できるかは確認する
  try {
    const response = await fetch('/auth/dev-config', { credentials: 'same-origin' });
    authState.devLoginEnabled = response.ok && (await response.json() as { enabled?: boolean }).enabled === true;
  } catch {
    authState.devLoginEnabled = false;
  }
}

