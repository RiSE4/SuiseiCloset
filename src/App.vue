<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faCrown, faShirt, faWrench, faUser } from '@fortawesome/free-solid-svg-icons';
import { authState, refreshAuth } from './features/auth/auth';
import { logout } from './features/auth/auth-api';

const route = useRoute();
const router = useRouter();
const actionError = ref('');
const busy = ref(false);
const menuOpen = ref(false);
const adminRoute = computed(() => route.matched.some(record => record.meta.requiresAdmin));
const editorRoute = computed(() => route.matched.some(record => record.meta.requiresEditor));
const canEditCostumes = computed(() => ['admin', 'editor'].includes(authState.user?.role || ''));
const loginRoute = computed(() => route.path === '/' || route.path === '/login');
const publicStatic = computed(() => route.meta.publicStatic === true);
const loginPath = computed(() => authState.oauthEnabled ? '/' : '/login');

watch([() => authState.status, () => route.fullPath], () => {
  if (publicStatic.value) return;
  if (authState.status === 'loading' || authState.status === 'error') {
    return;
  }

  if (authState.user && loginRoute.value) {
    void router.replace('/costumes');
  } else if (!authState.user && !authState.oauthEnabled && route.path === '/') {
    void router.replace(route.query.error || route.query.denied ? { path: '/login', query: route.query } : '/costumes');
  } else if (!authState.user && authState.oauthEnabled && route.path !== '/') {
    void router.replace({ path: '/', query: route.path === '/login' ? route.query : {} });
  }
});

onMounted(() => { if (!publicStatic.value) void refreshAuth(); });
watch(publicStatic, (isStatic, wasStatic) => {
  if (wasStatic && !isStatic) void refreshAuth();
});

watch(() => route.fullPath, () => { menuOpen.value = false; });
watch(menuOpen, open => { document.body.style.overflow = open ? 'hidden' : ''; });

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape')
    menuOpen.value = false;
}

function onResize() {
  if (window.innerWidth > 650)
    menuOpen.value = false;
}

onMounted(() => {
  window.addEventListener('keydown', onEscape);
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape);
  window.removeEventListener('resize', onResize);
  document.body.style.overflow = '';
});

async function signOut() {
  busy.value = true;
  actionError.value = '';

  try {
    await logout();
    await refreshAuth();

    if (authState.status !== 'required') {
      await router.push('/costumes');
    }
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : 'ログアウトできませんでした。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="app-shell">
    <header v-if="route.path !== '/'" class="site-header" :class="{ 'menu-is-open': menuOpen }">
      <div class="shell header-inner">

        <RouterLink to="/costumes" class="brand" aria-label="SuiseiCloset 衣装一覧">
          <span class="brand-mark" aria-hidden="true">
            <svg class="brand-crown" :viewBox="`0 0 ${faCrown.icon[0]} ${faCrown.icon[1]}`" focusable="false">
              <defs>
                <linearGradient id="brand-crown-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#e0f8ff" />
                  <stop offset="32%" stop-color="#9ad9f2" />
                  <stop offset="65%" stop-color="#638dcc" />
                  <stop offset="100%" stop-color="#485797" />
                </linearGradient>
              </defs>
              <path :d="Array.isArray(faCrown.icon[4]) ? faCrown.icon[4].join(' ') : faCrown.icon[4]"
                fill="url(#brand-crown-gradient)" />
            </svg>
          </span><span class="brand-title">SuiseiCloset</span>
        </RouterLink>

        <nav aria-label="メインナビゲーション" class="header-nav">
          <RouterLink to="/costumes">衣装一覧</RouterLink>
          <RouterLink v-if="canEditCostumes" to="/admin/costumes">衣装管理</RouterLink>
          <RouterLink v-if="authState.user?.role === 'admin'" to="/admin/users">観測者の編集</RouterLink>
          <span v-if="authState.user" class="user-name">{{ authState.user.display_name || authState.user.discord_id
          }}</span>
          <button v-if="authState.user" type="button" class="header-action" :disabled="busy"
            @click="signOut">ログアウト</button>
          <RouterLink v-else-if="authState.status === 'required' || authState.status === 'ready'" :to="loginPath"
            class="header-action">ログイン</RouterLink>
        </nav>

        <button type="button" class="menu-toggle" :aria-label="menuOpen ? 'メニューを閉じる' : 'メニューを開く'"
          :aria-expanded="menuOpen" aria-controls="mobile-menu"
          @click="menuOpen = !menuOpen"><span></span><span></span><span></span></button>
      </div>
    </header>

    <Transition name="mobile-menu">
      <div v-if="menuOpen && route.path !== '/'" class="mobile-menu-layer">
        <button type="button" class="mobile-menu-backdrop" aria-label="メニューを閉じる" @click="menuOpen = false"></button>

        <aside id="mobile-menu" class="mobile-menu-panel" aria-label="メニュー">
          <div v-if="authState.user" class="mobile-menu-profile">
            <p class="mobile-menu-observer"><span aria-hidden="true">✦</span>観測者</p>
            <p class="mobile-menu-user">{{ authState.user.display_name || authState.user.discord_id }}</p>
            <button class="signout-button" type="button" :disabled="busy"
              @click="menuOpen = false; signOut()">ログアウト</button>
          </div>

          <div v-else-if="authState.status === 'ready' && !authState.oauthEnabled" class="mobile-menu-profile">
            <p class="mobile-menu-observer"><span aria-hidden="true">✦</span>観測者としてログイン</p>
            <RouterLink class="mobile-menu-login mobile-menu-login-primary" to="/login" @click="menuOpen = false">ログイン
            </RouterLink>
          </div>

          <p id="mobile-menu-label" class="mobile-menu-label">メニュー</p>

          <nav aria-labelledby="mobile-menu-label" class="mobile-menu-nav">
            <RouterLink class="mobile-menu-link" :class="{ 'is-active': route.path.startsWith('/costumes') }"
              to="/costumes" @click="menuOpen = false">
              <FontAwesomeIcon :icon="faShirt" class="mobile-menu-icon" aria-hidden="true" />
              <span>衣装一覧</span>
            </RouterLink>

            <RouterLink v-if="canEditCostumes" class="mobile-menu-link"
              :class="{ 'is-active': route.path.startsWith('/admin/costumes') }" to="/admin/costumes"
              @click="menuOpen = false">
              <FontAwesomeIcon :icon="faWrench" class="mobile-menu-icon" aria-hidden="true" />
              <span>衣装管理</span>
            </RouterLink>

            <RouterLink v-if="authState.user?.role === 'admin'" class="mobile-menu-link"
              :class="{ 'is-active': route.path.startsWith('/admin/users') }" to="/admin/users"
              @click="menuOpen = false">
              <FontAwesomeIcon :icon="faUser" class="mobile-menu-icon" aria-hidden="true" />
              <span>観測者の編集</span>
            </RouterLink>
          </nav>

          <div v-if="!authState.user && authState.oauthEnabled" class="mobile-menu-account">
            <RouterLink v-if="authState.status === 'required' || authState.status === 'ready'" class="mobile-menu-login"
              :to="loginPath" @click="menuOpen = false">ログイン</RouterLink>
          </div>
        </aside>
      </div>
    </Transition>

    <main class="shell page-main" :class="{ 'login-main': loginRoute }">
      <p v-if="actionError" class="message error" role="alert">{{ actionError }}</p>
      <RouterView v-if="publicStatic" />
      <div v-else-if="authState.status === 'loading'" class="state-panel" role="status">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>認証状態を確認しています…</span>
      </div>

      <RouterView v-else-if="loginRoute" />
      <div v-else-if="authState.status === 'error'" class="state-panel" role="alert">
        <h1>接続を確認できませんでした</h1>
        <p>{{ authState.message }}</p>
        <button class="button primary" type="button" @click="refreshAuth">再試行</button>
      </div>

      <div v-else-if="authState.oauthEnabled && !authState.user" class="state-panel" role="status">ログインページに移動しています…
      </div>

      <div v-else-if="(adminRoute || editorRoute) && !authState.user" class="state-panel auth-panel">
        <span class="state-star" aria-hidden="true">✦</span>
        <h1>管理画面へログイン</h1>
        <p>{{ adminRoute ? '観測者の編集にはadmin権限が必要です。' : '衣装管理にはeditorまたはadmin権限が必要です。' }}</p>
        <div class="auth-actions">
          <RouterLink class="button primary" :to="loginPath">ログイン前の注意事項を確認</RouterLink>
        </div>
      </div>

      <div v-else-if="(adminRoute && authState.user?.role !== 'admin') || (editorRoute && !canEditCostumes)"
        class="state-panel" role="alert">
        <h1>管理画面を利用できません</h1>
        <p>{{ adminRoute ? '観測者の編集にはadmin権限が必要です。' : '衣装管理にはeditorまたはadmin権限が必要です。' }}</p>
        <RouterLink to="/costumes" class="button secondary">衣装一覧へ</RouterLink>
      </div>
      <RouterView v-else />
    </main>

    <footer class="site-footer shell">© 2026 Avio.<br>掲載されている資料の著作権は製作者に帰属します。<br>
      本サイトは非公式のファンメイドです。関係する権利者による公式の提供・承認・後援を示すものではありません。<br>
      <nav class="footer-links" aria-label="サイト情報">
        <RouterLink to="/about">サービス概要</RouterLink>
        <a href="/third-party-licenses.txt" target="_blank" rel="noopener">Third Party Licenses</a>
      </nav>
    </footer>
  </div>
</template>
