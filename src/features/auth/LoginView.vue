<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { faCrown } from '@fortawesome/free-solid-svg-icons';
import { devLogin } from './auth-api';
import { authState, refreshAuth } from './auth';

const { optional = false } = defineProps<{ optional?: boolean }>();
const route = useRoute();
/** 開発用ログインの二重操作を抑える処理中フラグ */
const busy = ref(false);
const actionError = ref('');

/**
 * 開発用セッションを作成し、認証状態を再取得してログインの成立を確認する
 * 失敗時は画面にメッセージを表示し、成否にかかわらず処理中フラグを解除する
 */
async function signInLocally() {
  busy.value = true;
  actionError.value = '';
  try {
    await devLogin();
    await refreshAuth();

    if (!authState.user) {
      throw new Error('ログイン状態を確認できませんでした。');
    }
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'ログインできませんでした。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="login-page" aria-labelledby="login-title">
    <div class="login-heading">
      <span class="login-crown" aria-hidden="true">
        <svg :viewBox="`0 0 ${faCrown.icon[0]} ${faCrown.icon[1]}`" focusable="false">
          <defs>
            <linearGradient id="login-crown-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#e0f8ff" />
              <stop offset="32%" stop-color="#9ad9f2" />
              <stop offset="65%" stop-color="#638dcc" />
              <stop offset="100%" stop-color="#485797" />
            </linearGradient>
          </defs>
          <path :d="Array.isArray(faCrown.icon[4]) ? faCrown.icon[4].join(' ') : faCrown.icon[4]"
            fill="url(#login-crown-gradient)" />
        </svg>
      </span>
      <p class="eyebrow">Welcome to Suisei Closet</p>
      <h2 id="login-title">{{ optional ? '観測者としてログイン' : '彗星の軌跡を探す' }}</h2>
      <p class="login-description">{{ optional ? '過去の資料を管理' : '星街すいせいの歴代衣装の資料図鑑' }}</p>
    </div>

    <div class="login-card">
      <div class="login-notice">
        <h2>ご利用にあたって</h2>
        <ul>
          <li v-if="optional">衣装一覧・資料の閲覧は、ログインせずに利用できます。</li>
          <li>{{ optional ? '観測者としてログインするには、事前登録されたDiscordアカウントが必要です。' : '事前登録されたDiscordアカウントが必要です。' }}</li>
          <li v-if="!optional">オリジナルの三面図への外部サイトリンクを含みます。</li>
          <li><b>ログイン時、Discordの内部識別子、表示名を認可に使用するために収集します。</b></li>
          <li>衣装情報の管理には管理者権限が必要です。</li>
        </ul>
      </div>

      <p v-if="route.query.denied" class="message error" role="alert">このDiscord IDは登録されていません。管理者に事前登録を依頼してください。</p>
      <p v-else-if="route.query.error" class="message error" role="alert">認証を完了できませんでした。もう一度お試しください。</p>
      <p v-if="actionError" class="message error" role="alert">{{ actionError }}</p>

      <div class="login-actions">
        <a class="button primary" href="/auth/login">Discordでログイン</a>
        <button v-if="authState.devLoginEnabled" class="button secondary" type="button" :disabled="busy"
          @click="signInLocally">{{ busy ? 'ログイン中…' : '開発者ログイン' }}</button>
      </div>
    </div>
    <RouterLink v-if="optional" class="login-back" to="/costumes">ログインせずに衣装一覧へ戻る</RouterLink>
  </section>
</template>
