<script setup lang="ts">
import ColorPaletteBar from '../components/ColorPaletteBar.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faShirt } from '@fortawesome/free-solid-svg-icons';
import type { CostumeDetailDto } from '../costume-model';
import { ApiError } from '../../../shared/api/request';
import { getCostumeDetail } from '../costume-api';
import { refreshAuth } from '../../auth/auth';
import { safeExternalUrl, sourceMedia } from '../media';
import { loadXWidgets } from '../x-widgets';
import CostumeSourceCard from '../components/CostumeSourceCard.vue';
import CostumeGrid from '../components/CostumeGrid.vue';
import SourceAttribution from '../components/SourceAttribution.vue';
import { vPackedGrid } from '../../../shared/packed-grid';

const route = useRoute();

//読み込んだ公開衣装の詳細
const detail = ref<CostumeDetailDto | null>(null);
const loading = ref(true);
//業務エラー
const missing = ref(false);
//システムエラー
const error = ref('');
const imageFailed = ref(false);
//更新カウンター
const retryCount = ref(0);
const thumbnail = computed(() => safeExternalUrl(detail.value?.thumbnailUrl));

const from = computed(() => {
  const value = route.query.from;
  return typeof value === 'string' && (value === '/costumes' || value.startsWith('/costumes?')) ? value : '/costumes';
});

const orderedSources = computed(() => [...(detail.value?.sources ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));

let controller: AbortController | undefined;

//初回表示・衣装IDの変更・再試行で詳細を取得
watch([() => route.params.id, retryCount], async () => {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const id = String(route.params.id || '');
  detail.value = null;
  imageFailed.value = false;
  missing.value = false;
  loading.value = true;
  error.value = '';

  try {
    detail.value = await getCostumeDetail(id, signal);
    if (!signal.aborted && detail.value.sources.some(source => sourceMedia(source.sourceUrl).kind === 'x')) {
      // DOM構築やスクロールを待たず、必要な詳細でだけSDKを先行取得する。
      void loadXWidgets().catch(() => { });
    }
  } catch (cause) {
    if (signal.aborted) {
      return;
    }

    if (cause instanceof ApiError && cause.status === 404) {
      missing.value = true;
    } else if (cause instanceof ApiError && cause.status === 401) {
      await refreshAuth();
    } else {
      error.value = cause instanceof Error ? cause.message : '衣装を取得できませんでした。';
    }
  } finally {
    if (!signal.aborted) {
      loading.value = false;
    }
  }
}, { immediate: true });

// 詳細画面を離れたら、実行中の取得処理を中断
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div v-if="loading" class="state-panel" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>衣装を読み込んでいます…</span>
  </div>

  <div v-else-if="missing" class="state-panel">
    <h1>衣装が見つかりません</h1>
    <p>削除されたか、公開されていない衣装です。</p>
    <RouterLink to="/costumes" class="button primary">衣装一覧へ</RouterLink>
  </div>

  <div v-else-if="error" class="state-panel" role="alert">
    <h1>衣装を表示できませんでした</h1>
    <p>{{ error }}</p><button class="button secondary" type="button" @click="retryCount++">再試行</button>
  </div>

  <article v-else-if="detail" class="detail-view">
    <nav class="breadcrumbs" aria-label="パンくずリスト">
      <RouterLink :to="from" class="breadcrumb-link">
        <FontAwesomeIcon :icon="faShirt" aria-hidden="true" />衣装一覧
      </RouterLink><span aria-hidden="true">›</span><span aria-current="page">{{ detail.name }}</span>
    </nav>

    <div class="detail-overview">
      <div class="detail-thumbnail">
        <div class="detail-hero-image">
          <img v-if="thumbnail && !imageFailed" :src="thumbnail" :alt="`${detail.name}のサムネイル`" decoding="async"
            @error="imageFailed = true">
          <div v-else class="image-placeholder" aria-label="衣装画像は未登録です"><span>✦</span><small>画像未登録</small></div>
        </div>
        <ColorPaletteBar :palette="detail.colorPalette" />
        <SourceAttribution v-if="detail.primarySource" :source="detail.primarySource" :costume-id="detail.id"
          link-account />
      </div>
      <div class="detail-info">
        <div class="detail-meta"><span v-if="detail.debutYear">{{ detail.debutYear }}年</span><span
            v-if="detail.category">{{ detail.category }}</span></div>
        <h1>{{ detail.name }}</h1>
        <p v-if="detail.description" class="detail-description">{{ detail.description }}</p>

        <section v-if="detail.keywords.length" class="detail-section keyword-section" aria-labelledby="keyword-title">
          <h2 id="keyword-title">キーワード</h2>
          <div class="keyword-list">
            <RouterLink v-for="keyword in detail.keywords" :key="keyword"
              :to="{ path: '/costumes', query: { q: keyword } }" class="keyword-chip">{{ keyword }}</RouterLink>
          </div>
        </section>

      </div>
    </div>

    <div v-if="orderedSources.length" class="detail-sources">
      <section class="detail-section" aria-labelledby="sources-title">
        <div class="section-title">
          <div>
            <p class="eyebrow">SOURCES</p>
            <h2 id="sources-title">関連資料</h2>
          </div>
        </div>
        <div v-packed-grid class="source-grid packed-grid">
          <CostumeSourceCard v-for="source in orderedSources" :key="source.id" :source="source"
            :costume-id="detail.id" />
        </div>
      </section>
    </div>

    <section v-if="detail.relatedCostumes.length" class="detail-section" aria-labelledby="related-title">
      <div class="section-title">
        <div>
          <p class="eyebrow">RELATED COSTUMES</p>
          <h2 id="related-title">関連衣装</h2>
        </div>
      </div>
      <div class="related-grid">
        <CostumeGrid :items="detail.relatedCostumes" :from="from" />
      </div>
    </section>
  </article>
</template>
