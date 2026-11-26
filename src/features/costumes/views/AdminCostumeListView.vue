<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { ApiError } from '../../../shared/api/request';
import { getAdminCategories, getAdminCostumes, getAdminPublicationYears, updateCostume } from '../costume-api';
import { refreshAuth } from '../../auth/auth';
import { scrollToResults } from '../../../shared/scroll-to-results';
import type { AdminCostumeSummaryDto, CostumeListResponse } from '../costume-model';
import { parseListQuery } from '../list-query';
import { safeExternalUrl } from '../media';
import { rememberAdminList } from '../admin-list-navigation';
import OrbitArtwork from '../components/OrbitArtwork.vue';

const route = useRoute();
const router = useRouter();

/** 検索を実行済みの一覧URLを、新規登録・編集後の戻り先として渡す*/
function costumeDestination(id?: string) {
  return {
    path: id ? `/admin/costumes/${encodeURIComponent(id)}/edit` : '/admin/costumes/new',
    query: { from: route.fullPath }
  };
}
/** URLから検索・ページング条件を復元 */
const filters = computed(() => ({
  ...parseListQuery(route.query),
  published: route.query.published === 'true' ? true : route.query.published === 'false' ? false : null
}));

// 入力中の値は、検索を確定してURLへ反映するまで別に保持
const q = ref(filters.value.q);
const category = ref(filters.value.category);
const pubYear = ref(filters.value.pubYear === null ? '' : String(filters.value.pubYear));
const published = ref(filters.value.published === null ? '' : String(filters.value.published));
const categories = ref<string[]>([]);
const publicationYears = ref<number[]>([]);
const optionsError = ref('');
const result = ref<CostumeListResponse<AdminCostumeSummaryDto> | null>(null);
const resultHeading = ref<HTMLElement | null>(null);
const scrollAfterLoad = ref(false);
const failedImages = ref(new Set<string>());
const loading = ref(true);
const error = ref('');
const togglingId = ref<string | null>(null);
const toggleError = ref<{ id: string; message: string } | null>(null);
const retry = ref(0);
const pageCount = computed(() => Math.max(1, Math.ceil((result.value?.total || 0) / 24)));
let controller: AbortController | undefined;
let optionsController: AbortController | undefined;

/** 公開状態を保存 */
async function togglePublication(item: AdminCostumeSummaryDto) {
  if (loading.value || togglingId.value) return;

  togglingId.value = item.id;
  toggleError.value = null;
  const previous = item.isPublished;
  item.isPublished = !previous;

  try {
    const updated = await updateCostume(item.id, { isPublished: !previous });
    item.isPublished = updated.isPublished;
  } catch (cause) {
    item.isPublished = previous;

    if (cause instanceof ApiError && cause.status === 401) {
      await refreshAuth();
    }

    toggleError.value = {
      id: item.id,
      message: cause instanceof ApiError && cause.status === 403 ? '管理者権限がありません。'
        : cause instanceof ApiError && cause.status === 404 ? '衣装が見つかりません。一覧を再読み込みしてください。'
          : cause instanceof Error ? cause.message : '公開状態を変更できませんでした。'
    };
  } finally {
    togglingId.value = null;
  }
}

/** 管理一覧の遷移用クエリを作成 */
function query(nextQ = q.value, nextCategory = category.value, nextPublished = published.value, page = 1, nextYear = pubYear.value) {
  return {
    ...(nextQ.trim() ? { q: nextQ.trim() } : {}), ...(nextCategory.trim() ? { category: nextCategory.trim() } : {}),
    ...(nextPublished ? { published: nextPublished } : {}), ...(nextYear ? { pubYear: nextYear } : {}), ...(page > 1 ? { page: String(page) } : {})
  };
}
/** 現在のフォーム条件を適用 */
function apply() {
  if (q.value.trim() !== filters.value.q || category.value !== filters.value.category || pubYear.value !== (filters.value.pubYear === null ? '' : String(filters.value.pubYear)) || published.value !== (filters.value.published === null ? '' : String(filters.value.published)) || filters.value.page !== 1) {
    scrollAfterLoad.value = true;
    void router.push({
      path: '/admin/costumes',
      query: query()
    });
  } else {
    // 同じ条件でも再検索し、前回の検索後に変更された公開状態などを反映
    scrollAfterLoad.value = true;
    retry.value++;
  }
}

function resetFilters() {
  q.value = '';
  category.value = '';
  pubYear.value = '';
  published.value = '';
}

//戻る・進む操作などでURLが変わった場合も、入力欄を検索条件に合わせる
watch(() => route.fullPath, path => {

  // 編集画面へ移った際のqueryで一覧の入力値・保存済み条件を上書きしない
  if (route.path !== '/admin/costumes') return;

  rememberAdminList(path);
  const value = filters.value;
  q.value = value.q;
  category.value = value.category;
  pubYear.value = value.pubYear === null ? '' : String(value.pubYear);
  published.value = value.published === null ? '' : String(value.published);
}, { immediate: true, flush: 'sync' });


// 初回表示・条件変更・再試行ごとに取得する。前の通信は中断し、その結果は反映しない
watch([filters, retry], async () => {
  if (route.path !== '/admin/costumes') return;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  error.value = '';

  try {
    const data = await getAdminCostumes({
      q: filters.value.q,
      category: filters.value.category,
      pubYear: filters.value.pubYear,
      published: filters.value.published,
      limit: 24,
      offset: filters.value.offset
    }, signal);

    if (signal.aborted) return;

    // 削除などで総件数が減りページが範囲外になった場合は、最終ページへ補正
    if (filters.value.page > Math.max(1, Math.ceil(data.total / 24))) {
      await router.replace({
        path: '/admin/costumes',
        query: query(filters.value.q,
          filters.value.category,
          filters.value.published === null ? '' : String(filters.value.published),
          Math.max(1, Math.ceil(data.total / 24)),
          filters.value.pubYear === null ? '' : String(filters.value.pubYear))
      });
      return;
    }

    result.value = data;
    failedImages.value = new Set();
  } catch (cause) {
    if (signal.aborted) return;

    // セッション切れは認証状態を再確認し、権限不足は専用のメッセージで表示
    if (cause instanceof ApiError && cause.status === 401) {
      await refreshAuth();
    }

    error.value = cause instanceof ApiError && cause.status === 403
      ? '管理者権限がありません。' : cause instanceof Error ? cause.message : '衣装を取得できませんでした。';
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

onMounted(async () => {
  optionsController = new AbortController();
  const results = await Promise.allSettled([getAdminCategories(optionsController.signal), getAdminPublicationYears(optionsController.signal)]);

  if (optionsController.signal.aborted) return;
  if (results[0].status === 'fulfilled') categories.value = results[0].value.items;
  if (results[1].status === 'fulfilled') publicationYears.value = results[1].value.items;
  if (results.some(result => result.status === 'rejected')) optionsError.value = '絞り込み候補を読み込めませんでした。';
});

onBeforeUnmount(() => {
  controller?.abort();
  optionsController?.abort();
});
</script>

<template>
  <section class="admin-page">
    <div class="page-intro archive-intro admin-intro">
      <p class="eyebrow">Record the Costume</p>
      <h1>衣装を刻む</h1>
      <RouterLink :to="costumeDestination()" class="orbit-decoration admin-intro-action">
        <OrbitArtwork />
        <span class="admin-intro-action-label">新規登録</span>
      </RouterLink>
    </div>

    <form class="search-panel admin-search" role="search" @submit.prevent="apply">
      <label class="search-field"><span>衣装名・キーワード</span><input v-model="q" type="search" maxlength="150"
          placeholder="衣装名やキーワード"></label>
      <label class="category-field"><span>カテゴリ</span><select v-model="category">
          <option value="">すべて</option>
          <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
        </select></label>
      <label class="category-field"><span>初出年</span><select v-model="pubYear">
          <option value="">すべて</option>
          <option v-for="year in publicationYears" :key="year" :value="year">{{ year }}年</option>
        </select></label>
      <label class="category-field"><span>公開状態</span><select v-model="published">
          <option value="">すべて</option>
          <option value="true">公開中</option>
          <option value="false">非公開</option>
        </select></label>
      <div class="search-actions">
        <button class="button primary" type="submit">検索</button>
        <button class="button secondary" type="button" @click="resetFilters">条件をリセット</button>
      </div>
    </form>

    <p v-if="optionsError" class="message warning" role="status">{{ optionsError }}</p>
    <div id="costume-results" ref="resultHeading" class="result-heading">
      <h2>登録済み衣装</h2><span v-if="result && !loading" class="result-count"><strong>{{ result.total
      }}</strong><small>件</small></span>
    </div>

    <div class="costume-results-body" :aria-busy="loading">
      <div v-if="result?.items.length && (loading || !error)" class="admin-costume-grid">
        <article v-for="item in result?.items" :key="item.id" class="admin-costume-card">
          <div
            :class="['admin-card-image', { 'is-empty': !safeExternalUrl(item.thumbnailUrl) || failedImages.has(item.id) }]">
            <img v-if="safeExternalUrl(item.thumbnailUrl) && !failedImages.has(item.id)"
              :src="safeExternalUrl(item.thumbnailUrl)!" :alt="`${item.name}のサムネイル`" loading="lazy"
              @error="failedImages.add(item.id)">
            <div v-else class="image-placeholder" aria-hidden="true"><span>✦</span><small>画像未登録</small></div>
          </div>
          <div class="admin-card-body"><span :class="['status-badge', item.isPublished ? 'published' : 'draft']">{{
            item.isPublished ? '公開中' : '非公開' }}</span>
            <h3>{{ item.name }}</h3>
            <p>{{ item.debutDate || '日付未設定' }}<span v-if="item.category"> · {{ item.category
            }}</span></p>
            <div class="admin-card-actions">
              <RouterLink :to="costumeDestination(item.id)" class="button secondary">編集する</RouterLink>
              <button type="button" :class="['publication-toggle', { 'is-published': item.isPublished }]" role="switch"
                :aria-checked="item.isPublished" :aria-label="`${item.name}の公開状態`" :aria-busy="togglingId === item.id"
                :disabled="loading || togglingId !== null" @click="togglePublication(item)">
                <span :class="['toggle-option', { active: !item.isPublished }]">非公開</span>
                <span :class="['toggle-option', { active: item.isPublished }]">公開</span>
              </button>
            </div>
            <p v-if="toggleError?.id === item.id" class="message error admin-card-error" role="alert">{{
              toggleError.message }}</p>
          </div>
        </article>
      </div>
      <div v-if="loading" class="costume-loading" role="status"><span class="loading-spinner"
          aria-hidden="true"></span><span>衣装を探しています…</span></div>
    </div>

    <div v-if="!loading && error" class="state-panel compact" role="alert">
      <p>{{ error }}</p><button type="button" class="button secondary" @click="retry++">再試行</button>
    </div>

    <div v-else-if="!loading && result?.items.length === 0" class="state-panel compact">
      <p>該当する衣装がありません。</p>
      <RouterLink :to="costumeDestination()" class="button secondary">衣装を登録</RouterLink>
    </div>

    <nav v-if="result && !loading && !error && result.total > 24" class="pagination" aria-label="管理一覧のページ切り替え">
      <RouterLink v-if="filters.page > 1"
        :to="{ path: '/admin/costumes', query: query(filters.q, filters.category, filters.published === null ? '' : String(filters.published), filters.page - 1, filters.pubYear === null ? '' : String(filters.pubYear)) }"
        class="button secondary" @click="scrollAfterLoad = true">前へ</RouterLink>
      <span>{{ filters.page }} / {{ pageCount }} ページ</span>
      <RouterLink v-if="filters.page < pageCount"
        :to="{ path: '/admin/costumes', query: query(filters.q, filters.category, filters.published === null ? '' : String(filters.published), filters.page + 1, filters.pubYear === null ? '' : String(filters.pubYear)) }"
        class="button secondary" @click="scrollAfterLoad = true">次へ</RouterLink>
    </nav>
  </section>
</template>
