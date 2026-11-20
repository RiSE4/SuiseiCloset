<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faWrench } from '@fortawesome/free-solid-svg-icons';
import { ApiError } from '../../../shared/api/request';
import { createCostume, deleteCostume, getAdminCostumeDetail, updateCostume } from '../costume-api';
import { refreshAuth } from '../../auth/auth';
import type { AdminCostumeDto, CostumeCreateRequest, CostumeSourceDto, CostumeSummaryDto } from '../costume-model';
import { validateKeywords } from '../keywords';
import { validateHttpsUrl } from '../validate-https-url';
import { isValidDebutDate, normalizeDebutDate } from '../debut-date';
import { safeExternalUrl } from '../media';
import { adminListBackPath } from '../admin-list-navigation';
import KeywordInput from '../components/KeywordInput.vue';
import RelatedCostumeSelector from '../components/RelatedCostumeSelector.vue';
import CostumeSourceEditor from '../components/CostumeSourceEditor.vue';
import SourceAttribution from '../components/SourceAttribution.vue';

const route = useRoute();
const router = useRouter();
const returnTo = computed(() => adminListBackPath(route.query.from));
/** 同じ画面を新規登録と既存衣装の編集で共用するためのモード判定 */
const isNew = computed(() => route.path === '/admin/costumes/new');
const id = computed(() => String(route.params.id || ''));
/** 編集中の基本情報。日付はYYYY-MM-DDの入力文字列で保持 */
const form = reactive({ name: '', debutDate: '', category: '', description: '', thumbnailUrl: '', keywords: [] as string[] });
const isPublished = ref(false);
/** 関連グループへの所属を指定するために選択中の衣装 */
const related = ref<CostumeSummaryDto | null>(null);
/** サーバーが返した関連衣装の一覧。選択中の1件とは別に保持 */
const relatedCostumes = ref<CostumeSummaryDto[]>([]);
/** 関連先を操作したかどうか。未操作なら更新データから関連先の項目を省く  */
const relatedTouched = ref(false);
/** 資料は子のエディターで個別保存するため、基本情報のformには含めない  */
const sources = ref<CostumeSourceDto[]>([]);
/** 公開詳細と同じく、保存済みの表示順で先頭の資料を共通サムネイルの参照元にする。 */
const primarySource = computed(() => [...sources.value].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)[0]);
/** 読み込みまたは保存が完了した時点のフォームを、未保存判定の比較元にする  */
const baseline = ref(JSON.stringify(form));
/** 基本情報の差分、または関連先の操作があれば未保存と判定する  */
const basicDirty = computed(() => JSON.stringify(form) !== baseline.value || relatedTouched.value);
const sourceOrderDirty = ref(false);
const sourceDraftDirty = ref(false);
const sourceBusy = ref(false);
const sourceEditor = ref<InstanceType<typeof CostumeSourceEditor> | null>(null);
const dirty = computed(() => basicDirty.value || sourceOrderDirty.value);
const previewUrl = computed(() => safeExternalUrl(form.thumbnailUrl));
const imageFailed = ref(false);
const imageLoaded = ref(false);
const loading = ref(!isNew.value);
const busy = ref(false);
const deleting = ref(false);
const missing = ref(false);
const loadError = ref('');
const saveError = ref('');
const status = ref('');
function setSourceMessage(message: { status: string; error: string }) {
  saveError.value = message.error;
  status.value = message.error ? '' : message.status;
}
const invalidField = ref('');
const retry = ref(0);
let controller: AbortController | undefined;

/**
 * サーバーの詳細をフォームへ展開し、資料・関連衣装と未保存判定の基準も更新
 * nullを入力欄用の空文字へ変換し、キーワード配列はコピーして保持
 */
function fill(detail: AdminCostumeDto) {
  saveError.value = '';
  invalidField.value = '';
  Object.assign(form, {
    name: detail.name,
    debutDate: detail.debutDate || '',
    category: detail.category,
    description: detail.description,
    thumbnailUrl: detail.thumbnailUrl || '',
    keywords: [...detail.keywords]
  });
  isPublished.value = detail.isPublished;
  relatedCostumes.value = detail.relatedCostumes;
  related.value = detail.relatedCostumes[0] || null;
  relatedTouched.value = false;
  sources.value = detail.sources;
  baseline.value = JSON.stringify(form);
  imageFailed.value = false;
}
//初回表示・編集対象の切り替え・再試行に対応する。新規登録ならAPI取得せず初期化
watch([id, isNew, retry], async () => {
  controller?.abort();
  if (isNew.value) {
    Object.assign(form, {
      name: '',
      debutDate: '',
      category: '',
      description: '',
      thumbnailUrl: '',
      keywords: []
    });
    isPublished.value = false;
    related.value = null; relatedCostumes.value = [];
    relatedTouched.value = false; sources.value = [];
    baseline.value = JSON.stringify(form);
    loading.value = false;
    missing.value = false;
    loadError.value = '';
    return;
  }
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true; missing.value = false; loadError.value = ''; saveError.value = '';

  // 中断済みの応答で、新たに開いた衣装のフォームを上書きしない
  try {
    const detail = await getAdminCostumeDetail(id.value, signal);
    if (!signal.aborted) fill(detail);
  } catch (cause) {
    if (signal.aborted) return;

    if (cause instanceof ApiError && cause.status === 404) {
      missing.value = true;
    } else if (cause instanceof ApiError && cause.status === 401) {
      await refreshAuth(); loadError.value = 'ログインし直してください。';
    } else {
      loadError.value = cause instanceof Error ? cause.message : '衣装を読み込めませんでした。';
    }
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}, { immediate: true });

watch(previewUrl, () => {
  imageFailed.value = false;
  imageLoaded.value = false;
});

/** 切り替え前の画像の応答を無視し、読み込み完了後にプレビューをフェード表示 */
function setPreviewState(event: Event, failed = false) {
  if (!(event.target instanceof HTMLImageElement) || event.target.getAttribute('src') !== previewUrl.value) return;
  imageFailed.value = failed;
  imageLoaded.value = !failed;
}

/** 関連先の選択・解除を記録し、保存時に所属グループの更新対象とする */
function selectRelated(value: CostumeSummaryDto | null) {
  related.value = value;
  relatedTouched.value = true;
}

/** 不正な項目を記録して検証を打ち切る */
function invalid(field: string, message: string): never {
  invalidField.value = field;
  throw new Error(message);
}

function normalizeDateInput() {
  form.debutDate = normalizeDebutDate(form.debutDate.trim());

  // 保存済みの日付に戻すと保存ボタンが無効になるため、再保存を待たずに解除
  if (invalidField.value === 'debutDate' && (!form.debutDate || isValidDebutDate(form.debutDate))) {
    invalidField.value = '';
    saveError.value = '';
  }
}
/**
 * 入力の必須条件・長さ・URL・キーワードを検証し、APIの送信形式へ変換
 * 入力不正時はinvalidで対象項目を記録して例外をスロー
 */
function payload(): CostumeCreateRequest {
  invalidField.value = '';

  const name = form.name.trim();
  if (!name || name.length > 150) {
    invalid('name', '衣装名を150文字以内で入力してください。');
  }

  const debutDate = normalizeDebutDate(form.debutDate.trim()) || null;
  if (debutDate !== null && !isValidDebutDate(debutDate)) {
    invalid('debutDate', '初出日は2018-01-01～2100-12-31の実在する日付を年月日の順で入力してください（例: 2024/4-1、2024年/4-1日、20240401）。区切りなしは8桁で入力してください。');
  }

  form.debutDate = debutDate || '';
  if (form.category.length > 120) invalid('category', 'カテゴリは120文字以内にしてください。');
  if (form.description.length > 4000) invalid('description', '説明は4000文字以内にしてください。');

  let thumbnailUrl: string | null = null;
  if (form.thumbnailUrl.trim()) {
    try {
      thumbnailUrl = validateHttpsUrl(form.thumbnailUrl.trim());
    } catch {
      invalid('thumbnailUrl', '共通サムネイルにはHTTPS URLを入力してください。');
    }
    if (thumbnailUrl && thumbnailUrl.length > 2048) {
      invalid('thumbnailUrl', '共通サムネイルURLが長すぎます。');
    }
  }

  try {
    validateKeywords(form.keywords);
  }
  catch {
    invalid('keywords', 'キーワードの空欄や重複を修正してください。');
  }

  // 関連先は、新規登録では選択時だけ送り、更新では未操作なら省略、解除ならnullを送る
  return {
    name,
    debutDate,
    category: form.category.trim(),
    description: form.description.trim(),
    thumbnailUrl,
    keywords: [...form.keywords],
    ...(isNew.value ? related.value ? { relatedCostumeId: related.value.id } : {} : relatedTouched.value ? { relatedCostumeId: related.value?.id || null } : {})
  };
}
/**
 * 基本情報を検証して登録または更新する。保存後は応答を反映し、未保存状態を解除
 * 新規登録後は採番された衣装の編集画面へ移動し、資料の追加を可能にする
 */
async function save() {
  if (busy.value || deleting.value || sourceBusy.value) return;
  saveError.value = ''; status.value = '';
  let data: CostumeCreateRequest;

  try {
    data = payload();
  } catch (cause) {
    saveError.value = cause instanceof Error ? cause.message : '入力を確認してください。';
    return;
  }

  if (!isNew.value && !dirty.value) {
    status.value = '変更はありません。';
    return;
  }
  busy.value = true;
  let orderSaved = false;

  try {
    const hadOrderChanges = sourceOrderDirty.value;
    if (sourceEditor.value && !await sourceEditor.value.saveOrder()) {
      if (!saveError.value) saveError.value = '表示順を保存できませんでした。再試行してください。';
      return;
    }
    orderSaved = hadOrderChanges;
    if (!isNew.value && !basicDirty.value) {
      status.value = '表示順を保存しました。';
      return;
    }
    const sourceWarning = saveError.value;
    const detail = isNew.value ? await createCostume(data) : await updateCostume(id.value, data);
    fill(detail);
    if (sourceWarning) saveError.value = sourceWarning;
    status.value = isNew.value ? '衣装を登録しました。資料を追加できます。' : '衣装を保存しました。';

    if (isNew.value) {
      try {
        await router.replace({
          path: `/admin/costumes/${encodeURIComponent(detail.id)}/edit`,
          query: { from: returnTo.value }
        });
      } catch {
        saveError.value = '衣装は登録されましたが編集画面へ移動できませんでした。管理一覧から開いてください。';
      }
    }
  } catch (cause) {
    //関連グループの競合、権限不足、削除済みの対象はそれぞれ理由を表示
    if (cause instanceof ApiError && cause.status === 409)
      saveError.value = '関連衣装のグループが異なるため統合できません。選択を見直してください。';
    else if (cause instanceof ApiError && cause.status === 403)
      saveError.value = '管理者権限がありません。';
    else if (cause instanceof ApiError && cause.status === 404)
      saveError.value = '衣装または関連先が見つかりません。一覧を確認してください。';
    else
      saveError.value = cause instanceof Error ? cause.message : '保存できませんでした。';
    if (orderSaved) saveError.value = `表示順は保存済みです。基本情報の保存に失敗しました。${saveError.value}`;
  } finally {
    busy.value = false;
  }
}
/** 資料の個別保存後に資料と関連衣装を再取得 */
async function reloadSources() {
  const detail = await getAdminCostumeDetail(id.value);
  sources.value = detail.sources;
  relatedCostumes.value = detail.relatedCostumes;
}
/** 衣装情報と紐づく資料の削除 */
async function remove() {
  if (busy.value || deleting.value || sourceBusy.value || !window.confirm(`「${form.name}」を削除しますか？紐づく資料もすべて削除されます。`)) return;
  deleting.value = true; saveError.value = ''; status.value = '';

  try {
    await deleteCostume(id.value); baseline.value = JSON.stringify(form); relatedTouched.value = false;
    try {
      await router.push(returnTo.value);
    } catch {
      saveError.value = '衣装は削除されましたが管理一覧へ移動できませんでした。';
    }
  } catch (cause) {
    saveError.value = cause instanceof ApiError && cause.status === 404 ?
      '衣装が見つかりません。管理一覧を確認してください。' : cause instanceof Error ? cause.message : '削除できませんでした。';
  } finally {
    deleting.value = false;
  }
}

/** 未保存の変更がある場合に、タブを閉じる操作や再読み込みでブラウザーの確認を求める */
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || sourceDraftDirty.value) {
    event.preventDefault(); event.returnValue = '';
  }
}

onMounted(() => window.addEventListener('beforeunload', beforeUnload));

onBeforeUnmount(() => {
  controller?.abort();
  window.removeEventListener('beforeunload', beforeUnload);
});

onBeforeRouteLeave(() => !(dirty.value || sourceDraftDirty.value) || window.confirm('保存していない変更があります。画面を離れますか？'));
</script>

<template>
  <section class="admin-page edit-page">
    <nav class="breadcrumbs" aria-label="パンくずリスト">
      <RouterLink :to="returnTo" class="breadcrumb-link">
        <FontAwesomeIcon :icon="faWrench" aria-hidden="true" />衣装管理
      </RouterLink><span aria-hidden="true">›</span><span aria-current="page">{{ isNew ? '新規登録' : '衣装編集' }}</span>
    </nav>
    <div v-if="loading" class="state-panel" role="status">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>衣装を読み込んでいます…</span>
    </div>
    <div v-else-if="missing" class="state-panel">
      <h1>衣装が見つかりません</h1>
      <RouterLink :to="returnTo" class="button secondary">管理一覧へ</RouterLink>
    </div>
    <div v-else-if="loadError" class="state-panel" role="alert">
      <h1>衣装を読み込めませんでした</h1>
      <p>{{ loadError }}</p><button type="button" class="button secondary" @click="retry++">再試行</button>
    </div>

    <template v-else>
      <div class="admin-heading">
        <div>
          <p class="eyebrow">COSTUME EDITOR</p>
          <h1>{{ isNew ? '衣装を登録' : '衣装を編集' }}</h1>
          <p>{{ isNew ? '基本情報を保存すると、資料を追加できます。' : form.name }}</p>
        </div><span :class="['status-badge', isPublished ? 'published' : 'draft']">{{ isPublished ? '公開中' : '非公開'
        }}</span>
      </div>
      <p v-if="status && !saveError" class="message success" role="status">{{ status }}</p>
      <p v-if="saveError" id="admin-form-error" class="message error" role="alert">{{ saveError }}</p>

      <form novalidate @submit.prevent="save">
        <section class="admin-section" aria-labelledby="basic-title">
          <div class="admin-section-heading">
            <div>
              <p class="eyebrow">BASIC INFO</p>
              <h2 id="basic-title">基本情報</h2>
            </div>
          </div>
          <div class="admin-form-grid">
            <label class="form-field wide"><span>衣装名 <b>必須</b></span><input v-model="form.name" maxlength="150" required
                :disabled="busy || deleting" :aria-invalid="invalidField === 'name'"
                :aria-describedby="invalidField === 'name' ? 'admin-form-error' : undefined"
                placeholder="例: 東洋風スーツ（黒）"></label>
            <label class="form-field"><span>初出日（年月日順・区切り混在可、区切りなしは8桁）</span><input v-model="form.debutDate" type="text"
                :disabled="busy || deleting" :aria-invalid="invalidField === 'debutDate'"
                :aria-describedby="invalidField === 'debutDate' ? 'admin-form-error' : undefined"
                placeholder="例: 2024/4-1、2024年/4-1日、20240401" @blur="normalizeDateInput"></label>
            <label class="form-field"><span>カテゴリ</span><input v-model="form.category" maxlength="120"
                :disabled="busy || deleting" :aria-invalid="invalidField === 'category'"
                :aria-describedby="invalidField === 'category' ? 'admin-form-error' : undefined"
                placeholder="自由入力"></label>
            <label class="form-field wide"><span>説明</span><textarea v-model="form.description" maxlength="4000" rows="5"
                :disabled="busy || deleting" :aria-invalid="invalidField === 'description'"
                :aria-describedby="invalidField === 'description' ? 'admin-form-error' : undefined"
                placeholder="衣装の説明"></textarea></label>
            <label class="form-field wide"><span>共通サムネイルURL</span><input v-model="form.thumbnailUrl" type="url"
                maxlength="2048" pattern="https://.*" :disabled="busy || deleting"
                :aria-invalid="invalidField === 'thumbnailUrl'"
                :aria-describedby="invalidField === 'thumbnailUrl' ? 'admin-form-error' : undefined"
                placeholder="https://..."></label>
          </div>

          <Transition name="preview-fade">
            <div v-if="form.thumbnailUrl" class="admin-image-preview">
              <Transition name="preview-fade" mode="out-in">
                <img v-if="previewUrl && !imageFailed" :key="previewUrl" :src="previewUrl"
                  :class="{ 'is-loaded': imageLoaded }" alt="共通サムネイルのプレビュー" @load="setPreviewState"
                  @error="setPreviewState($event, true)">
                <div v-else key="placeholder" class="image-placeholder"><span>✦</span><small>画像を表示できません</small></div>
              </Transition>
            </div>
          </Transition>
          <SourceAttribution v-if="form.thumbnailUrl && primarySource" class="admin-thumbnail-attribution"
            :source="primarySource" :costume-id="id" admin />
        </section>

        <section class="admin-section" aria-labelledby="keywords-title">
          <div class="admin-section-heading">
            <div>
              <p class="eyebrow">SEARCH WORDS</p>
              <h2 id="keywords-title">キーワード</h2>
            </div>
          </div>
          <p class="field-hint">衣装の差分や特徴など、検索で見つけたい言葉を追加します。</p>
          <KeywordInput v-model="form.keywords" :disabled="busy || deleting" />
        </section>

        <section class="admin-section" aria-labelledby="related-title">
          <div class="admin-section-heading">
            <div>
              <p class="eyebrow">RELATED COSTUMES</p>
              <h2 id="related-title">関連衣装</h2>
            </div>
          </div>
          <p v-if="relatedCostumes.length" class="field-hint">現在の関連衣装: {{relatedCostumes.map(item =>
            item.name).join('、')}}</p>
          <RelatedCostumeSelector :selected="related" :current-id="isNew ? undefined : id" :disabled="busy || deleting"
            @select="selectRelated" />
        </section>

        <div class="admin-save-bar">
          <span class="admin-save-status" role="status">
            <Transition name="save-status" mode="out-in">
              <span :key="isNew ? 'new' : dirty ? 'unsaved' : 'saved'" class="admin-save-status-label"
                :class="{ unsaved: !isNew && dirty }">{{ isNew ? '未登録' : dirty ? '未保存' : '保存済み' }}</span>
            </Transition>
          </span>
          <button type="submit" class="button primary"
            :disabled="busy || deleting || sourceBusy || (!isNew && !dirty)">{{ busy ?
              '保存中…' : isNew ? '衣装を登録' : '変更を保存' }}</button>
          <button type="button" class="button admin-back-button" :disabled="busy || deleting || sourceBusy"
            @click="router.push(returnTo)">一覧に戻る</button>
        </div>
      </form>

      <CostumeSourceEditor v-if="!isNew" ref="sourceEditor" :costume-id="id" :sources="sources" :reload="reloadSources"
        @message="setSourceMessage" :disabled="busy || deleting" @order-change="sourceOrderDirty = $event"
        @draft-change="sourceDraftDirty = $event" @busy-change="sourceBusy = $event" />

      <section v-else class="admin-section">
        <h2>関連資料</h2>
        <p>衣装を登録した後、この画面で三面図・動画・その他資料を追加できます。</p>
      </section>

      <section v-if="!isNew" class="admin-section danger-zone">
        <h2>衣装を削除</h2>
        <p>衣装と紐づく資料が削除されます。この操作は元に戻せません。</p><button type="button" class="button danger"
          :disabled="busy || deleting || sourceBusy" @click="remove">{{ deleting ? '削除中…' : 'この衣装を削除' }}</button>
      </section>
    </template>
  </section>
</template>
