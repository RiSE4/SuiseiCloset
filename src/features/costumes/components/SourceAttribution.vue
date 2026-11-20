<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { requestJson } from '../../../shared/api/request';
import type { CostumeSourceDto } from '../costume-model';
import { safeExternalUrl } from '../media';

const props = defineProps<{ source: Pick<CostumeSourceDto, 'id' | 'sourceUrl'>; costumeId: string }>();
const href = computed(() => safeExternalUrl(props.source.sourceUrl));
const pageTitle = ref<string | null>(null);
const attribution = computed(() => `出典：${pageTitle.value || href.value}`);
let titleRequest: AbortController | undefined;

watch(() => [props.costumeId, props.source.id, props.source.sourceUrl], async () => {
  titleRequest?.abort();
  pageTitle.value = null;
  if (!href.value) return;
  const controller = new AbortController();
  titleRequest = controller;
  try {
    const result = await requestJson<{ title: string | null }>(`/api/costumes/${encodeURIComponent(props.costumeId)}/sources/${props.source.id}/title`, controller.signal);
    if (!controller.signal.aborted) pageTitle.value = result.title;
  } catch { /* 名称を取得できない場合は元資料のURLを表示する。 */ }
}, { immediate: true });

onBeforeUnmount(() => titleRequest?.abort());
</script>

<template>
  <p v-if="href" class="source-attribution" :title="attribution">{{ attribution }}</p>
</template>
