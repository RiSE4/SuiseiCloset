<script setup lang="ts">
import ColorPaletteBar from '../components/ColorPaletteBar.vue';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { RouterLink, onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faShirt, faPen } from '@fortawesome/free-solid-svg-icons';
import type { CostumeDetailDto } from '../costume-model';
import { ApiError } from '../../../shared/api/request';
import { getCostumeDetail, updateCostume, saveCostumePalette } from '../costume-api';
import { analyzeThumbnail } from '../analyze-thumbnail';
import type { ColorPalette } from '../color-palette';
import { validateHttpsUrl } from '../validate-https-url';
import { authState, refreshAuth } from '../../auth/auth';
import { validateKeywords } from '../keywords';
import { isValidDebutDate, normalizeDebutDate } from '../debut-date';
import { safeExternalUrl, sourceMedia } from '../media';
import { loadXWidgets } from '../x-widgets';
import CostumeSourceCard from '../components/CostumeSourceCard.vue';
import CostumeGrid from '../components/CostumeGrid.vue';
import KeywordInput from '../components/KeywordInput.vue';
import ThumbnailAttribution from '../components/ThumbnailAttribution.vue';
import { thumbnailAttribution } from '../thumbnail-attribution';
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
const thumbnail = computed(() => safeExternalUrl(editing.value && canEdit.value
  ? draft.thumbnailUrl.trim() : detail.value?.thumbnailUrl));
const canEdit = computed(() => authState.user?.role === 'admin' && authState.user.enabled === 1);
const editing = ref(false);
const saving = ref(false);
const saveError = ref('');
const paletteMessage = ref('');
const draft = reactive({ name: '', debutDate: '', thumbnailUrl: '', thumbnailSourceTitle: '', thumbnailSourceUrl: '', keywords: [] as string[] });
const displayedAttribution = computed(() => ({
  primarySource: detail.value?.primarySource ?? null,
  thumbnailSourceTitle: editing.value ? draft.thumbnailSourceTitle : detail.value?.thumbnailSourceTitle ?? null,
  thumbnailSourceUrl: editing.value ? draft.thumbnailSourceUrl : detail.value?.thumbnailSourceUrl ?? null,
}));
const previewPalette = ref<ColorPalette | null>(null);
const previewPaletteUrl = ref('');
const previewPaletteMessage = ref('');
const previewChanged = computed(() => editing.value && canEdit.value &&
  draft.thumbnailUrl.trim() !== (detail.value?.thumbnailUrl ?? ''));
const shownPalette = computed(() => previewChanged.value ? previewPalette.value : detail.value?.colorPalette);

watch(thumbnail, () => { imageFailed.value = false; }, { flush: 'sync' });
watch([thumbnail, previewChanged], ([url, changed], _previous, onCleanup) => {
  let active = true;
  previewPalette.value = null;
  previewPaletteUrl.value = '';
  previewPaletteMessage.value = '';
  if (!changed || !url) return;
  previewPaletteMessage.value = 'カラーパレットを解析しています…';
  const timer = window.setTimeout(async () => {
    try {
      const colors = await analyzeThumbnail(url);
      if (!active) return;
      previewPalette.value = colors;
      previewPaletteUrl.value = url;
      previewPaletteMessage.value = '';
    } catch {
      if (active) previewPaletteMessage.value = 'この画像のカラーパレットをプレビューできません。';
    }
  }, 400);
  onCleanup(() => { active = false; window.clearTimeout(timer); });
}, { flush: 'sync' });

async function toggleEditing() {
  if (!detail.value || !canEdit.value || saving.value) return;
  saveError.value = '';
  paletteMessage.value = '';
  if (!editing.value) {
    const attribution = thumbnailAttribution(detail.value);
    Object.assign(draft, {
      name: detail.value.name, debutDate: detail.value.debutDate ?? '',
      thumbnailUrl: detail.value.thumbnailUrl ?? '', keywords: [...detail.value.keywords],
      thumbnailSourceTitle: attribution.title, thumbnailSourceUrl: attribution.url ?? ''
    });
    editing.value = true;
    return;
  }

  const name = draft.name.trim();
  const debutDate = normalizeDebutDate(draft.debutDate.trim()) || null;
  const keywords = [...draft.keywords];
  const thumbnailSourceTitle = draft.thumbnailSourceTitle.trim();
  let thumbnailSourceUrl: string;
  if (!thumbnailSourceTitle || thumbnailSourceTitle.length > 500) {
    saveError.value = '参照元を500文字以内で入力してください。';
    return;
  }
  try {
    thumbnailSourceUrl = validateHttpsUrl(draft.thumbnailSourceUrl.trim());
    if (thumbnailSourceUrl.length > 2048) throw new Error();
  } catch {
    saveError.value = 'リンク先には2048文字以内のHTTPS URLを入力してください。';
    return;
  }
  const originalAttribution = thumbnailAttribution(detail.value);
  const changedAttribution = thumbnailSourceTitle !== originalAttribution.title || thumbnailSourceUrl !== originalAttribution.url;
  let thumbnailUrl: string | null = null;
  try {
    if (draft.thumbnailUrl.trim()) {
      thumbnailUrl = validateHttpsUrl(draft.thumbnailUrl.trim());
      if (thumbnailUrl.length > 2048) throw new Error();
    }
  } catch {
    saveError.value = '共通サムネイルには2048文字以内のHTTPS URLを入力してください。';
    return;
  }
  const changedThumbnail = thumbnailUrl !== detail.value.thumbnailUrl;
  if (!changedAttribution && !changedThumbnail && name === detail.value.name && debutDate === detail.value.debutDate && keywords.length === detail.value.keywords.length &&
    keywords.every((keyword, index) => keyword === detail.value!.keywords[index])) {
    editing.value = false;
    return;
  }
  if (!name || name.length > 150) {
    saveError.value = '衣装名を150文字以内で入力してください。';
    return;
  }
  if (debutDate !== null && !isValidDebutDate(debutDate)) {
    saveError.value = '初出日は2018-01-01～2100-12-31の実在する日付を入力してください。';
    return;
  }
  try {
    validateKeywords(keywords);
    if (keywords.length > 32 || keywords.some(value => value.length > 80)) throw new Error();
  } catch {
    saveError.value = 'キーワードは1件80文字以内、32件までで、重複しないように入力してください。';
    return;
  }
  saving.value = true;
  const cachedPalette = previewPaletteUrl.value === safeExternalUrl(thumbnailUrl) ? previewPalette.value : null;
  try {
    const updated = await updateCostume(detail.value.id, {
      name, debutDate, keywords, thumbnailUrl,
      ...(changedAttribution ? { thumbnailSourceTitle, thumbnailSourceUrl } : {})
    }, detail.value);
    detail.value = {
      ...detail.value, name: updated.name, debutDate: updated.debutDate,
      debutYear: updated.debutYear, keywords: updated.keywords,
      thumbnailUrl: updated.thumbnailUrl, colorPalette: updated.colorPalette,
      thumbnailSourceTitle: updated.thumbnailSourceTitle, thumbnailSourceUrl: updated.thumbnailSourceUrl,
      primarySource: updated.primarySource
    };
    if (changedThumbnail) imageFailed.value = false;
    editing.value = false;
    if (changedThumbnail && updated.thumbnailUrl) {
      paletteMessage.value = 'カラーパレットを解析しています…';
      try {
        const colors = cachedPalette ?? await analyzeThumbnail(updated.thumbnailUrl);
        const result = await saveCostumePalette(updated, colors);
        detail.value = { ...detail.value, colorPalette: result.colorPalette };
        paletteMessage.value = '';
      } catch {
        paletteMessage.value = 'URLは保存しました。カラーパレットを生成できませんでした。管理画面から再生成できます。';
      }
    }
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : '保存できませんでした。もう一度鉛筆ボタンを押してください。';
  } finally {
    saving.value = false;
  }
}

function confirmLeave() {
  if (saving.value) return false;
  return !editing.value || window.confirm('編集中の内容は保存されていません。破棄して移動しますか？');
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate((to, from) => to.params.id === from.params.id || confirmLeave());

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
  editing.value = false;
  saveError.value = '';
  paletteMessage.value = '';
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
        <ColorPaletteBar :palette="shownPalette" />
        <ThumbnailAttribution :costume="displayedAttribution" />
        <label v-if="editing && canEdit" class="form-field detail-thumbnail-url">
          <span>共通サムネイルURL</span>
          <input v-model="draft.thumbnailUrl" type="url" maxlength="2048" placeholder="https://..." :disabled="saving">
        </label>
        <div v-if="editing && canEdit" class="thumbnail-source-fields">
          <label class="form-field"><span>参照元 <b>必須</b></span>
            <input v-model="draft.thumbnailSourceTitle" maxlength="500" :disabled="saving" required>
          </label>
          <label class="form-field"><span>リンク先 <b>必須</b></span>
            <input v-model="draft.thumbnailSourceUrl" type="url" maxlength="2048" placeholder="https://..."
              :disabled="saving" required>
          </label>
        </div>
        <p v-if="previewChanged && previewPaletteMessage" class="field-hint" role="status">{{ previewPaletteMessage }}
        </p>
        <p v-if="paletteMessage" class="field-hint" role="status">{{ paletteMessage }}</p>
      </div>
      <div class="detail-info">
        <button v-if="canEdit" type="button" class="detail-edit-toggle" :class="{ active: editing }"
          :aria-pressed="editing" :aria-label="editing ? '編集を終了して保存' : '衣装の内容を編集'"
          :title="editing ? '編集を終了して保存' : '衣装の内容を編集'" :disabled="saving" @click="toggleEditing">
          <FontAwesomeIcon :icon="faPen" aria-hidden="true" />
        </button>
        <div class="detail-meta"><span v-if="editing && canEdit"><input v-model="draft.debutDate"
              class="detail-date-input" type="text" aria-label="初出日" placeholder="yyyy-mm-dd" :disabled="saving"
              @blur="draft.debutDate = normalizeDebutDate(draft.debutDate.trim())"></span>
          <span v-else-if="detail.debutYear">{{ detail.debutYear }}年</span><span v-if="detail.category">{{
            detail.category }}</span>
        </div>
        <h1><input v-if="editing && canEdit" v-model="draft.name" class="detail-name-input" aria-label="衣装名"
            maxlength="150" :disabled="saving" required><template v-else>{{ detail.name }}</template></h1>
        <p v-if="detail.description" class="detail-description">{{ detail.description }}</p>
        <p v-if="saveError" class="field-error" role="alert">{{ saveError }}</p>

        <section v-if="detail.keywords.length || editing" class="detail-section keyword-section"
          aria-labelledby="keyword-title">
          <h2 id="keyword-title">キーワード</h2>
          <KeywordInput v-if="editing && canEdit" v-model="draft.keywords" :disabled="saving" />
          <div v-else class="keyword-list">
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
            <p class="eyebrow">Sources</p>
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
          <p class="eyebrow">Related Costumes</p>
          <h2 id="related-title">関連衣装</h2>
        </div>
      </div>
      <div class="related-grid">
        <CostumeGrid :items="detail.relatedCostumes" :from="from" />
      </div>
    </section>
  </article>
</template>
