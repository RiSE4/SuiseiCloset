<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { getAdminCostumes } from '../costume-api';
import type { CostumeSummaryDto } from '../costume-model';

const props = defineProps<{ selected: CostumeSummaryDto | null; currentId?: string; disabled?: boolean }>();
const emit = defineEmits<{ select: [value: CostumeSummaryDto | null] }>();
const query = ref('');
const matches = ref<CostumeSummaryDto[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
function stopSearch() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  controller?.abort();
  loading.value = false;
}
/** 直前の検索を中断し、非公開衣装も含めて関連先候補を検索 */
async function search() {
  stopSearch();
  controller = new AbortController();
  const signal = controller.signal;
  loading.value = true;
  error.value = '';

  try {
    const result = await getAdminCostumes({
      q: query.value.trim(), limit: 21,
      offset: 0
    }, signal);

    if (!signal.aborted) {
      matches.value = result.items.filter(item => item.id !== props.currentId).slice(0, 20);
      total.value = result.total;
    }
  } catch (cause) {
    if (!signal.aborted) error.value = cause instanceof Error ? cause.message : '候補を取得できませんでした。';
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}
/** 入力が350ms途切れてから検索し、キー入力ごとのAPI呼び出しを抑える */
function onInput() {
  stopSearch();
  timer = setTimeout(search, 350);
}

/** 選択した衣装を親へ通知し、候補リストと検索入力を閉じる */
function select(item: CostumeSummaryDto) {
  stopSearch();
  matches.value = []; query.value = ''; total.value = 0; error.value = '';
  emit('select', item);
}
onBeforeUnmount(stopSearch);
</script>

<template>
  <div class="related-selector">
    <div v-if="selected" class="selected-related">
      <div><strong>{{ selected.name }}</strong><small>{{ selected.category || 'カテゴリ未設定' }}</small></div><button
        type="button" class="button secondary" :disabled="disabled" @click="emit('select', null)">関連を解除</button>
    </div>
    <p v-else class="field-hint">関連衣装は未選択です。</p>
    <label class="form-field"><span>既存衣装を検索して選択</span><input v-model="query" type="search" maxlength="150"
        :disabled="disabled" placeholder="衣装名を入力" @input="onInput" @focus="search"></label>
    <p v-if="loading" class="field-hint" role="status">候補を検索中…</p>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
    <div v-if="matches.length" class="related-results" role="listbox" aria-label="関連衣装候補">
      <button v-for="item in matches" :key="item.id" type="button" role="option"
        :aria-selected="selected?.id === item.id" :disabled="disabled" @click="select(item)"><span>{{ item.name
        }}</span><small>{{ item.category || 'カテゴリ未設定' }}</small></button>
    </div>
    <p v-if="matches.length && total > matches.length" class="field-hint">最初の{{ matches.length }}件を表示しています。名前を絞り込んでください。
    </p>
  </div>
</template>
