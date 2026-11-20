<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, TransitionGroup, watch } from 'vue';
import Sortable from 'sortablejs';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faChevronDown, faChevronUp, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import type { CostumeSourceDto } from '../costume-model';
import { validateHttpsUrl } from '../validate-https-url';
import { safeExternalUrl, sourceMediaLabel, youtubeThumbnailUrl } from '../media';
import SourceEditForm from './SourceEditForm.vue';
import SourceAttribution from './SourceAttribution.vue';
import { ApiError } from '../../../shared/api/request';
import { createCostumeSource, deleteCostumeSource, reorderCostumeSources, updateCostumeSource } from '../costume-api';

const props = defineProps<{ costumeId: string; sources: CostumeSourceDto[]; reload: () => Promise<void>; disabled?: boolean }>();
const emit = defineEmits<{ 'order-change': [dirty: boolean]; 'draft-change': [dirty: boolean]; 'busy-change': [busy: boolean]; message: [message: { status: string; error: string }] }>();
const sorted = (sources: CostumeSourceDto[]) => [...sources].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
const orderedSources = ref(sorted(props.sources));
const savedIds = ref(orderedSources.value.map(source => source.id));
const orderDirty = computed(() => JSON.stringify(orderedSources.value.map(source => source.id)) !== JSON.stringify(savedIds.value));
const form = reactive({ title: '', thumbnailUrl: '', sourceUrl: '' });
const editForm = reactive({ title: '', thumbnailUrl: '', sourceUrl: '' });
const editBaseline = ref(JSON.stringify(editForm));
const formBaseline = ref(JSON.stringify(form));
const editingId = ref<number | null>(null);
const busy = ref(false);
const locked = computed(() => busy.value || props.disabled);
const manager = ref<HTMLElement | null>(null);
let sortable: Sortable | undefined;

watch(locked, value => sortable?.option('disabled', Boolean(value)));

onMounted(() => {
  if (!manager.value) return;

  sortable = Sortable.create(manager.value, {
    draggable: '.source-admin-item',
    handle: '.source-drag-handle',
    animation: 0,
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    ghostClass: 'source-drag-placeholder',
    disabled: Boolean(locked.value),
    onEnd: ({ oldIndex, newIndex, item, from }) => {
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return;
      item.remove(); from.insertBefore(item, from.children[oldIndex] ?? null);
      move(oldIndex, newIndex);
    }
  });
});
onBeforeUnmount(() => sortable?.destroy());

const error = ref('');
const status = ref('');
watch([status, error], () => emit('message', { status: status.value, error: error.value }), { flush: 'sync' });

const announcement = ref('');
watch(orderDirty, value => emit('order-change', value), { immediate: true });
watch(() => JSON.stringify(form) !== formBaseline.value || (editingId.value !== null && JSON.stringify(editForm) !== editBaseline.value), value => emit('draft-change', value), { immediate: true });
watch(busy, value => emit('busy-change', value));

watch(() => props.sources, sources => {
  const refreshed = sorted(sources);
  if (orderDirty.value) {
    const byId = new Map(refreshed.map(source => [source.id, source]));
    const retained = orderedSources.value.flatMap(source => byId.has(source.id) ? [byId.get(source.id)!] : []);
    const retainedIds = new Set(retained.map(source => source.id));
    orderedSources.value = [...retained, ...refreshed.filter(source => !retainedIds.has(source.id))];
  } else orderedSources.value = refreshed;
  savedIds.value = refreshed.map(source => source.id);
});
function move(from: number, to: number) {
  if (locked.value || to < 0 || to >= orderedSources.value.length) return;
  const next = [...orderedSources.value];
  const [source] = next.splice(from, 1);

  if (!source) return;
  next.splice(to, 0, source); orderedSources.value = next;
  announcement.value = `${source.title}を${to + 1}番目に移動しました。保存すると確定します。`;
}

function reset() {
  Object.assign(form, { title: '', thumbnailUrl: '', sourceUrl: '' });
  formBaseline.value = JSON.stringify(form);
}

function clearEdit() {
  editingId.value = null;
  Object.assign(editForm, { title: '', thumbnailUrl: '', sourceUrl: '' });
  editBaseline.value = JSON.stringify(editForm);
}

function closeEdit() {
  if (JSON.stringify(editForm) !== editBaseline.value && !window.confirm('編集中の資料の入力を破棄しますか？')) return;
  clearEdit();
}

function edit(source: CostumeSourceDto) {
  if (editingId.value === source.id) { closeEdit(); return; }
  if (editingId.value !== null && JSON.stringify(editForm) !== editBaseline.value && !window.confirm('編集中の資料の入力を破棄しますか？')) return;
  editingId.value = source.id;
  Object.assign(editForm, { title: source.title, thumbnailUrl: source.thumbnailUrl || '', sourceUrl: source.sourceUrl });
  editBaseline.value = JSON.stringify(editForm);
  error.value = ''; status.value = '';
}

function payload(values: typeof form) {
  const title = values.title.trim();
  if (!title || title.length > 150) throw Error('資料タイトルを150文字以内で入力してください。');
  const sourceUrl = validateHttpsUrl(values.sourceUrl.trim());
  const imageUrl = youtubeThumbnailUrl(values.sourceUrl) ?? values.thumbnailUrl;
  const thumbnailUrl = imageUrl.trim() ? validateHttpsUrl(imageUrl.trim()) : null;
  if (sourceUrl.length > 2048 || (thumbnailUrl && thumbnailUrl.length > 2048)) throw Error('URLは2048文字以内で入力してください。');
  return { title, sourceUrl, thumbnailUrl };
}

async function reloadAfter(message: string) {
  try { await props.reload(); await nextTick(); }
  catch { error.value = `${message}が、一覧を再取得できませんでした。画面を再読み込みしてください。`; }
}

async function save(editing = false) {
  if (locked.value || (editing && editingId.value === null)) return;
  error.value = ''; status.value = '';
  let data: ReturnType<typeof payload>;
  try { data = payload(editing ? editForm : form); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '資料の入力を確認してください。'; return; }
  busy.value = true;
  try {
    if (!editing) {
      const result = await createCostumeSource(props.costumeId, data);
      // 再取得に失敗しても保存済み資料を保持し、二重登録を防止
      const source: CostumeSourceDto = { ...data, id: result.id, sortOrder: savedIds.value.length + 1 };
      orderedSources.value = [...orderedSources.value, source]; savedIds.value = [...savedIds.value, source.id];
    } else {
      const source = await updateCostumeSource(editingId.value!, data);
      orderedSources.value = orderedSources.value.map(item => item.id === source.id ? source : item);
    }
    if (editing) clearEdit(); else reset();
    status.value = '資料を保存しました。';
    await reloadAfter('資料は保存されました');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '資料を保存できませんでした。';
  } finally {
    busy.value = false;
  }
}
async function remove(source: CostumeSourceDto) {
  if (locked.value || !window.confirm(`「${source.title}」を削除しますか？`)) return;
  busy.value = true; error.value = ''; status.value = '';
  try {
    await deleteCostumeSource(source.id);
    orderedSources.value = orderedSources.value.filter(item => item.id !== source.id);
    savedIds.value = savedIds.value.filter(id => id !== source.id);
    if (editingId.value === source.id) clearEdit();
    status.value = '資料を削除しました。'; await reloadAfter('資料は削除されました');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '資料を削除できませんでした。';
  }
  finally { busy.value = false; }
}
/** 親の保存バーからだけ呼ぶ。失敗時は並び順を保持して再試行。 */
async function saveOrder(): Promise<boolean> {
  if (!orderDirty.value) return true;
  if (busy.value) return false;
  busy.value = true; error.value = ''; status.value = '';
  const ids = orderedSources.value.map(source => source.id);

  try {
    await reorderCostumeSources(props.costumeId, ids);
    savedIds.value = ids;
    orderedSources.value = orderedSources.value.map((source, index) => ({ ...source, sortOrder: index + 1 }));

    await nextTick(); status.value = '表示順を保存しました。';
    await reloadAfter('表示順は保存されました');
    return true;
  } catch (cause) {
    error.value = cause instanceof ApiError && cause.status === 409
      ? '資料の一覧が変更されました。入力と並び順は保持しています。再読み込みして確認してください。'
      : cause instanceof Error ? cause.message : '表示順を保存できませんでした。';
    return false;
  } finally {
    busy.value = false;
  }
}

defineExpose({ saveOrder });
</script>
<template>
  <section class="admin-section source-manager" aria-labelledby="sources-title">
    <div class="admin-section-heading">
      <div>
        <p class="eyebrow">SOURCES</p>
        <h2 id="sources-title">関連資料</h2>
      </div><span>{{ orderedSources.length }}件</span>
    </div>
    <p class="field-hint">資料の追加・編集・削除は個別に保存されます。表示順はドラッグ・上下ボタンで変更し、画面下の「保存」で確定します。番号は保存後に更新されます。</p>
    <p class="reorder-announcement" role="status" aria-live="polite">{{ announcement }}</p>
    <p v-if="orderDirty" class="field-hint">表示順に未保存の変更があります。</p>
    <p v-if="!orderedSources.length" class="empty-note">資料が登録されていません。</p>
    <div ref="manager" class="source-admin-grid">
      <TransitionGroup name="source-reorder">
        <article v-for="(source, index) in orderedSources" :key="source.id" class="source-admin-item"
          :class="{ 'is-editing': editingId === source.id }">
          <button type="button" class="source-drag-handle" :disabled="locked" :aria-label="`${source.title}をドラッグして並べ替え`"
            title="ドラッグして移動" @contextmenu.prevent>
            <FontAwesomeIcon :icon="faGripVertical" aria-hidden="true" />
          </button>
          <span class="source-position" :aria-label="`保存済み表示順 ${source.sortOrder}`">{{
            String(source.sortOrder).padStart(2, '0') }}</span>
          <div class="source-admin-info">
            <h3>{{ source.title }}</h3>
            <a v-if="safeExternalUrl(source.sourceUrl)" class="source-platform"
              :href="safeExternalUrl(source.sourceUrl)!" target="_blank" rel="noopener noreferrer"
              :title="source.sourceUrl" :aria-label="`${source.title}の参照先を開く: ${source.sourceUrl}`">{{
                sourceMediaLabel(source.sourceUrl) }}<span aria-hidden="true"> ↗</span></a>
            <span v-else class="source-platform">{{ sourceMediaLabel(source.sourceUrl) }}</span>
          </div>
          <div class="source-row-actions">
            <div class="source-move-actions">
              <button type="button" class="source-move-button" :disabled="locked || index === 0"
                :aria-label="`${source.title}を上へ移動`" title="上へ移動" @click="move(index, index - 1)">
                <FontAwesomeIcon :icon="faChevronUp" aria-hidden="true" />
              </button>
              <button type="button" class="source-move-button" :disabled="locked || index === orderedSources.length - 1"
                :aria-label="`${source.title}を下へ移動`" title="下へ移動" @click="move(index, index + 1)">
                <FontAwesomeIcon :icon="faChevronDown" aria-hidden="true" />
              </button>
            </div>
            <div class="source-edit-actions">
              <button type="button" class="button secondary" :disabled="locked" :aria-label="`${source.title}を編集`"
                :aria-expanded="editingId === source.id" :aria-controls="`source-edit-${source.id}`"
                @click="edit(source)">{{ editingId === source.id ? '閉じる' : '編集' }}</button>
              <button type="button" class="button danger-outline" :disabled="locked" :aria-label="`${source.title}を削除`"
                @click="remove(source)">削除</button>
            </div>
          </div>
          <SourceEditForm v-if="editingId === source.id" :id="`source-edit-${source.id}`" class="source-inline-editor"
            :form="editForm" :disabled="locked" :busy="busy" editing @save="save(true)" @cancel="closeEdit">
            <template #attribution>
              <SourceAttribution v-if="editForm.sourceUrl.trim() === source.sourceUrl" :source="source"
                :costume-id="costumeId" admin />
              <p v-else-if="safeExternalUrl(editForm.sourceUrl.trim())" class="source-attribution">参照元：{{ safeExternalUrl(editForm.sourceUrl.trim()) }}</p>
            </template>
          </SourceEditForm>

        </article>
      </TransitionGroup>
    </div>
    <SourceEditForm id="source-form" class="source-form" :form="form" :disabled="locked" :busy="busy" @save="save()"
      @cancel="reset" />
  </section>
</template>
