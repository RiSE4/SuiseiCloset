<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { CostumeListResponse } from '../costume-model';
import { ApiError } from '../../../shared/api/request';
import { getCategories, getCostumes, getPublicationYears } from '../costume-api';
import { refreshAuth } from '../../auth/auth';
import { scrollToResults } from '../../../shared/scroll-to-results';
import { listQuery, parseListQuery } from '../list-query';
import CostumeGrid from '../components/CostumeGrid.vue';
import OrbitArtwork from '../components/OrbitArtwork.vue';

const route = useRoute();
const router = useRouter();
/** 一覧の検索条件はURLを基準にし、再読み込みや戻る操作でも復元できるようにする。 */
const filters = computed(() => parseListQuery(route.query));
/** 入力中の条件は検索ボタンを押すまでURLへ反映しない。 */
const draft = ref(filters.value.q);
const draftCategory = ref(filters.value.category);
const draftYear = ref(filters.value.pubYear === null ? '' : String(filters.value.pubYear));
const categories = ref<string[]>([]);
const publicationYears = ref<number[]>([]);
/** カテゴリの取得エラーは、衣装一覧の取得エラーと分けて表示する。 */
const categoryError = ref('');
const yearError = ref('');
const result = ref<CostumeListResponse | null>(null);
const resultHeading = ref<HTMLElement | null>(null);
const scrollAfterLoad = ref(false);
const loading = ref(true);
const error = ref('');
/** 条件を変えずに再取得するため、再試行ボタンで増やす値。 */
const retryCount = ref(0);
/** 0件でも1ページとして表示する。 */
const pageCount = computed(() => Math.max(1, Math.ceil((result.value?.total || 0) / 24)));
let controller: AbortController | undefined;
let categoryController: AbortController | undefined;
let yearController: AbortController | undefined;

watch(() => route.fullPath, () => {
  draft.value = filters.value.q;
  draftCategory.value = filters.value.category;
  draftYear.value = filters.value.pubYear === null ? '' : String(filters.value.pubYear);
});

// 初回表示・検索条件変更・再試行時に取得し直す
watch([filters, retryCount], async () => {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  error.value = '';

  try {
    const data = await getCostumes({
      q: filters.value.q,
      category: filters.value.category,
      pubYear: filters.value.pubYear,
      limit: 24,
      offset: filters.value.offset
    }, signal);

    // 古い検索結果で現在の一覧やページ番号を上書きしない+
    if (signal.aborted) return;

    // 件数が減って現在のページが範囲外になった場合は、最終ページへ補正
    if (data.total > 0 && filters.value.page > Math.ceil(data.total / 24)) {
      await router.replace({
        path: '/costumes',
        query: listQuery(
          filters.value.q,
          filters.value.category,
          Math.ceil(data.total / 24),
          filters.value.pubYear)
      });
      return;
    }
    result.value = data;
  } catch (cause) {
    if (signal.aborted) return;

    if (cause instanceof ApiError && cause.status === 401) {
      await refreshAuth();
    } else {
      error.value = cause instanceof Error ? cause.message : '衣装を取得できませんでした。';
    }
  } finally {
    if (!signal.aborted) {
      loading.value = false;

      if (scrollAfterLoad.value) {
        scrollAfterLoad.value = false;
        await nextTick();
        scrollToResults(resultHeading.value);
      }
    }
  }
}, { immediate: true });

// カテゴリ一覧は検索結果と独立して初回に取得
onMounted(async () => {
  categoryController = new AbortController();
  try {
    categories.value = (await getCategories(categoryController.signal)).items;
  } catch (cause) {
    if (!categoryController.signal.aborted) {
      categoryError.value = cause instanceof Error ? cause.message : 'カテゴリを取得できませんでした。';
    }
  }
});

onMounted(async () => {
  yearController = new AbortController();
  try {
    publicationYears.value = (await getPublicationYears(yearController.signal)).items;
  } catch (cause) {
    if (!yearController.signal.aborted) {
      yearError.value = cause instanceof Error ? cause.message : '初出日を取得できませんでした。';
    }
  }
});

// 画面を離れたら通信を中断
onBeforeUnmount(() => {
  controller?.abort();
  categoryController?.abort();
  yearController?.abort();
});

/** フォーム送信時だけ全条件をまとめて適用 */
function submit() {
  const q = draft.value.trim();
  const year = draftYear.value ? Number(draftYear.value) : null;

  if (q !== filters.value.q || draftCategory.value !== filters.value.category || year !== filters.value.pubYear || filters.value.page !== 1) {
    scrollAfterLoad.value = true;
    void router.push({
      path: '/costumes',
      query: listQuery(q, draftCategory.value, 1, year)
    });
  } else {
    scrollToResults(resultHeading.value);
  }
}

function resetFilters() {
  draft.value = '';
  draftCategory.value = '';
  draftYear.value = '';
}
</script>

<template>
  <section class="list-view">
    <div class="page-intro archive-intro">
      <p class="eyebrow">Search the Costume</p>
      <h1>衣装を探す</h1>
      <span class="orbit-decoration" aria-hidden="true">
        <OrbitArtwork star />
      </span>
    </div>

    <form class="search-panel" role="search" @submit.prevent="submit">
      <label class="search-field"><span>衣装名・キーワード</span><input v-model="draft" type="search" maxlength="150"
          placeholder="衣装名、メガネ、ジャケットなし…"></label>
      <label class="category-field"><span>カテゴリ</span><select v-model="draftCategory">
          <option value="">すべて</option>
          <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
        </select></label>
      <label class="category-field"><span>初出年</span><select v-model="draftYear">
          <option value="">すべて</option>
          <option v-for="year in publicationYears" :key="year" :value="year">{{ year }}年</option>
        </select></label>
      <div class="search-actions">
        <button class="button primary search-button" type="submit">検索</button>
        <button class="button secondary" type="button" @click="resetFilters">条件をリセット</button>
      </div>
    </form>

    <p v-if="categoryError" class="message warning" role="status">カテゴリを読み込めませんでした。{{ categoryError }}</p>
    <p v-if="yearError" class="message warning" role="status">初出日を読み込めませんでした。{{ yearError }}</p>

    <div id="costume-results" ref="resultHeading" class="result-heading">
      <h2>検索結果</h2><span v-if="result && !loading" class="result-count"><strong>{{ result.total
          }}</strong><small>件</small></span>
    </div>
    <div class="costume-results-body" :aria-busy="loading">
      <CostumeGrid v-if="result && result.items.length && (loading || !error)" :items="result.items"
        :from="route.fullPath" />
      <div v-if="loading" class="costume-loading" role="status"><span class="loading-spinner"
          aria-hidden="true"></span><span>衣装を探しています…</span></div>
    </div>
    <div v-if="!loading && error" class="state-panel compact" role="alert">
      <p>{{ error }}</p><button class="button secondary" type="button" @click="retryCount++">再試行</button>
    </div>
    <div v-else-if="!loading && result && result.items.length === 0" class="state-panel compact">
      <p>該当する衣装がありません。検索条件を変えてみてください。</p>
    </div>

    <nav v-if="result && !loading && !error && result.total > 24" class="pagination" aria-label="ページ切り替え">
      <RouterLink v-if="filters.page > 1"
        :to="{ path: '/costumes', query: listQuery(filters.q, filters.category, filters.page - 1, filters.pubYear) }"
        class="button secondary" @click="scrollAfterLoad = true">前へ</RouterLink>
      <span>{{ filters.page }} / {{ pageCount }} ページ</span>
      <RouterLink v-if="filters.page < pageCount"
        :to="{ path: '/costumes', query: listQuery(filters.q, filters.category, filters.page + 1, filters.pubYear) }"
        class="button secondary" @click="scrollAfterLoad = true">次へ</RouterLink>
    </nav>
  </section>
</template>
