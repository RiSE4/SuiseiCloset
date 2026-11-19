<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faGrip } from '@fortawesome/free-solid-svg-icons';
import type { CostumeSourceDto, SourceType } from '../costume-model';
import { validateHttpsUrl } from '../validate-https-url';
import { ApiError } from '../../../shared/api/request';
import { createCostumeSource, deleteCostumeSource, reorderCostumeSources, updateCostumeSource } from '../costume-api';
import CostumeSourceCard from './CostumeSourceCard.vue';

const props = defineProps<{
  costumeId: string;
  sources: CostumeSourceDto[];
  reload: () => Promise<void>
}>();

const groups: { type: SourceType; title: string }[] = [
  { type: 'THREE_VIEW', title: '三面図・設定画' },
  { type: 'VIDEO', title: '元配信・元動画' },
  { type: 'OTHER', title: 'その他資料' },
];

/** 既存の番号を並びの判断に使い、区分の優先順でカードを並べる */
function sortedSources(sources: CostumeSourceDto[]) {
  return groups.flatMap(group => sources.filter(source => source.sourceType === group.type)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
}
const orderedSources = ref(sortedSources(props.sources));
const grouped = computed(() => groups.map(group => ({ ...group, items: orderedSources.value.filter(source => source.sourceType === group.type) })));
const manager = ref<HTMLElement | null>(null);
const sortables: Sortable[] = [];

const form = reactive({
  sourceType: 'THREE_VIEW' as SourceType,
  title: '',
  thumbnailUrl: '',
  sourceUrl: ''
});

//nullなら新規追加、数値があればその資料の更新として扱う
const editingId = ref<number | null>(null);

const busy = ref(false);
const error = ref('');
const status = ref('');
const announcement = ref('');

/** カード配置を一括保存し、サーバー側の0始まりの番号を再取得 */
async function persistOrder(next: CostumeSourceDto[], previous = orderedSources.value) {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  orderedSources.value = next;

  try {
    await reorderCostumeSources(props.costumeId, next.map(source => source.id));
    orderedSources.value = next.map((source, index) => ({ ...source, sortOrder: index }));
  } catch (cause) {
    orderedSources.value = previous;
    error.value = cause instanceof ApiError && cause.status === 409
      ? '資料の一覧が変更されました。画面を再読み込みしてください。'
      : cause instanceof Error ? cause.message : '表示順を保存できませんでした。';
    busy.value = false;
    return;
  }
  try {
    await props.reload();
  } catch {
    error.value = '表示順は保存されましたが、一覧を再取得できませんでした。画面を再読み込みしてください。';
  } finally {
    busy.value = false;
  }
}

/** 古い通し番号も、画面に並んだ順に自動で0から保存し直す */
function normalizeIfNeeded() {
  if (!busy.value && orderedSources.value.some((source, index) => source.sortOrder !== index)) {
    void persistOrder([...orderedSources.value]);
  }
}

/** ドラッグ後はSortableのDOM操作を戻し、Vueの配列順で表示を確定する */
function finishDrag(event: Sortable.SortableEvent, type: SourceType) {
  const { oldIndex, newIndex, item, from } = event;

  if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
  item.remove();
  from.insertBefore(item, from.children[oldIndex] ?? null);

  const previous = [...orderedSources.value];
  const items = grouped.value.find(group => group.type === type)?.items ?? [];
  const moved = items[oldIndex];

  if (!moved) return;
  const reordered = [...items];
  reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, moved);

  const next = groups.flatMap(group => group.type === type ? reordered : grouped.value.find(value => value.type === group.type)?.items ?? []);
  announcement.value = `${moved.title}を${newIndex + 1}番目に移動しました。`;
  void persistOrder(next, previous);
}

/** キーボードでも同じ並び替えを行えるようにする */
function moveWithKey(event: KeyboardEvent, source: CostumeSourceDto) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

  event.preventDefault();
  if (busy.value) return;

  const items = grouped.value.find(group => group.type === source.sourceType)?.items ?? [];
  const from = items.findIndex(item => item.id === source.id);
  const to = from + (event.key === 'ArrowUp' ? -1 : 1);
  if (from < 0 || to < 0 || to >= items.length) return;

  const reordered = [...items];
  reordered.splice(from, 1);
  reordered.splice(to, 0, source);

  const next = groups.flatMap(group => group.type === source.sourceType ? reordered : grouped.value.find(value => value.type === group.type)?.items ?? []);
  announcement.value = `${source.title}を${to + 1}番目に移動しました。`;
  void persistOrder(next, [...orderedSources.value]);
}

function initSortables() {
  for (const sortable of sortables.splice(0)) sortable.destroy();
  for (const grid of Array.from(manager.value?.querySelectorAll<HTMLElement>('.source-admin-grid') ?? [])) {
    const type = grid.dataset.sourceType as SourceType;

    sortables.push(Sortable.create(grid, {
      draggable: '.source-admin-item', handle: '.source-drag-handle', animation: 180,
      delay: 200, delayOnTouchOnly: true, touchStartThreshold: 5,
      ghostClass: 'source-drag-placeholder', chosenClass: 'source-drag-chosen',
      disabled: busy.value, onEnd: event => finishDrag(event, type)
    }));
  }
}

watch(() => props.sources, async sources => {
  orderedSources.value = sortedSources(sources);
  await nextTick();
  if (manager.value) initSortables();
  normalizeIfNeeded();
});
watch(busy, value => { for (const sortable of sortables) sortable.option('disabled', value); });
onMounted(() => { initSortables(); normalizeIfNeeded(); });
onBeforeUnmount(() => { for (const sortable of sortables.splice(0)) sortable.destroy(); });

/** 入力フォームを新規追加の初期状態へ戻す */
function reset() {
  editingId.value = null; Object.assign(form, {
    sourceType: 'THREE_VIEW', title: '',
    thumbnailUrl: '',
    sourceUrl: ''
  }); error.value = '';
}

/** 選んだ資料をフォームへコピーし、編集位置までスクロール */
function edit(source: CostumeSourceDto) {
  editingId.value = source.id;
  Object.assign(form, {
    sourceType: source.sourceType,
    title: source.title,
    thumbnailUrl: source.thumbnailUrl || '',
    sourceUrl: source.sourceUrl
  });

  error.value = ''; status.value = '';
  document.getElementById('source-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/**
 * タイトルとHTTPS URLを検証し、APIへの送信データを作る
 */
function payload() {
  const title = form.title.trim();
  if (!title || title.length > 150) throw Error('資料タイトルを150文字以内で入力してください。');

  const sourceUrl = validateHttpsUrl(form.sourceUrl.trim());
  if (sourceUrl.length > 2048) throw Error('参照先URLが長すぎます。');

  const thumbnailUrl = form.thumbnailUrl.trim() ? validateHttpsUrl(form.thumbnailUrl.trim()) : null;
  if (thumbnailUrl && thumbnailUrl.length > 2048) throw Error('画像URLが長すぎます。');

  return { sourceType: form.sourceType, title, sourceUrl, thumbnailUrl };
}
/** 入力を検証して資料を追加または更新し、親が保持する資料一覧を再取得 */
async function save() {
  if (busy.value) return;
  error.value = ''; status.value = '';
  let data: ReturnType<typeof payload>;
  try {
    data = payload();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '資料の入力を確認してください。';
    return;
  }

  busy.value = true;
  const editing = editingId.value !== null;

  try {
    if (editingId.value === null) {
      await createCostumeSource(props.costumeId, data);
    } else {
      await updateCostumeSource(editingId.value, data);
    }

    reset();
    status.value = editing ? '資料を更新しました。' : '資料を追加しました。';
  } catch (cause) {
    error.value = cause instanceof ApiError && cause.status === 404 ? '衣装または資料が見つかりません。画面を再読み込みしてください。' : cause instanceof Error ? cause.message : '資料を保存できませんでした。';
    busy.value = false;
    return;
  }

  // 保存後の一覧取得は別に扱い、保存自体の失敗と区別して利用者へ知らせる
  try {
    await props.reload();
  } catch {
    error.value = '資料は保存されましたが、一覧を再取得できませんでした。画面を再読み込みしてください。';
  } finally {
    busy.value = false;
  }
}

/** 確認後に資料を削除し、一覧を再取得する。処理中の二重操作は受け付けない */
async function remove(source: CostumeSourceDto) {
  if (busy.value || !window.confirm(`「${source.title}」を削除しますか？`)) return;
  busy.value = true; error.value = ''; status.value = '';

  try {
    await deleteCostumeSource(source.id); status.value = `「${source.title}」を削除しました。`;
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : '資料を削除できませんでした。'; busy.value = false;
    return;
  }

  try {
    await props.reload();
  } catch {
    error.value = '資料は削除されましたが、一覧を再取得できませんでした。画面を再読み込みしてください。';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section ref="manager" class="admin-section source-manager" aria-labelledby="sources-title">
    <div class="admin-section-heading">
      <div>
        <p class="eyebrow">SOURCES</p>
        <h2 id="sources-title">外部資料</h2>
      </div><span>{{ sources.length }}件</span>
    </div>
    <p class="field-hint">衣装の基本情報とは別に保存されます。画像URLは表示用、参照先URLは開く先です。カードの持ち手をドラッグすると並び順が保存されます。</p>
    <p class="reorder-announcement" role="status" aria-live="polite">{{ announcement }}</p>
    <p v-if="status" class="message success" role="status">{{ status }}</p>
    <p v-if="error" class="message error" role="alert">{{ error }}</p>
    <p v-if="orderedSources.length === 0" class="empty-note">資料が登録されていません。下のフォームから追加できます。</p>

    <div v-for="group in grouped" :key="group.type" class="source-admin-group">
      <h3>{{ group.title }} <small>{{ group.items.length }}件</small></h3>
      <div v-if="group.items.length" class="source-admin-grid" :data-source-type="group.type">
        <div v-for="source in group.items" :key="source.id" class="source-admin-item">
          <CostumeSourceCard :source="source" />
          <p class="source-url">{{ source.sourceUrl }}</p>
          <div class="row-actions"><button type="button" class="button secondary" :disabled="busy"
              @click="edit(source)">編集</button><button type="button" class="button danger-outline" :disabled="busy"
              @click="remove(source)">削除</button></div>
          <button type="button" class="card-drag-handle source-drag-handle" :disabled="busy"
            :aria-label="`${source.title}を並べ替え。矢印キーでも移動できます`" title="押したままドラッグして移動" @contextmenu.prevent
            @keydown="moveWithKey($event, source)">
            <FontAwesomeIcon :icon="faGrip" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <form id="source-form" class="source-form" @submit.prevent="save">
      <h3>{{ editingId === null ? '資料を追加' : '資料を編集' }}</h3>
      <div class="admin-form-grid">
        <label class="form-field"><span>資料区分 <b>必須</b></span><select v-model="form.sourceType" :disabled="busy">
            <option value="THREE_VIEW">三面図・設定画</option>
            <option value="VIDEO">元配信・元動画</option>
            <option value="OTHER">その他資料</option>
          </select></label>
        <label class="form-field"><span>資料タイトル <b>必須</b></span><input v-model="form.title" maxlength="150" required
            :disabled="busy" placeholder="例: 衣装設定画"></label>
        <label class="form-field wide"><span>参照先URL <b>必須</b></span><input v-model="form.sourceUrl" type="url"
            maxlength="2048" required pattern="https://.*" :disabled="busy" placeholder="https://..."></label>
        <label class="form-field wide"><span>画像URL（任意）</span><input v-model="form.thumbnailUrl" type="url"
            maxlength="2048" pattern="https://.*" :disabled="busy" placeholder="https://..."></label>
      </div>
      <div class="row-actions"><button type="submit" class="button primary" :disabled="busy">{{ busy ? '保存中…' :
        editingId === null ? '資料を追加' : '資料の変更を保存' }}</button><button v-if="editingId !== null" type="button"
          class="button secondary" :disabled="busy" @click="reset">編集をやめる</button></div>
    </form>
  </section>
</template>
