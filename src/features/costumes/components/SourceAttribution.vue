<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { requestJson } from '../../../shared/api/request';
import type { CostumeSourceDto } from '../costume-model';
import { safeExternalUrl, sourceAccountUrl, sourceMedia } from '../media';

const props = defineProps<{ source: Pick<CostumeSourceDto, 'id' | 'sourceUrl'>; costumeId: string; linkAccount?: boolean; admin?: boolean }>();
const href = computed(() => safeExternalUrl(props.source.sourceUrl));
const pageTitle = ref<string | null>(null);
const authorUrl = ref<string | null>(null);
const accountHref = computed(() => props.linkAccount ? sourceAccountUrl(authorUrl.value, sourceMedia(props.source.sourceUrl).kind) : null);
const attribution = computed(() => `参照元：${pageTitle.value || href.value}`);
let titleRequest: AbortController | undefined;

watch(() => [props.costumeId, props.source.id, props.source.sourceUrl, props.admin], async () => {
  titleRequest?.abort();
  pageTitle.value = null;
  authorUrl.value = null;
  if (!href.value) return;
  const controller = new AbortController();
  titleRequest = controller;
  try {
    const result = await requestJson<{ title: string | null; authorUrl: string | null }>(`/api/${props.admin ? 'admin/' : ''}costumes/${encodeURIComponent(props.costumeId)}/sources/${props.source.id}/title`, controller.signal);
    if (!controller.signal.aborted) {
      pageTitle.value = result.title;
      authorUrl.value = result.authorUrl;
    }
  } catch { /* 名称を取得できない場合は元資料のURLを表示する。 */ }
}, { immediate: true });

onBeforeUnmount(() => titleRequest?.abort());
</script>

<template>
  <p v-if="href" class="source-attribution" :title="attribution"><template v-if="accountHref">参照元：<a :href="accountHref" target="_blank" rel="noopener noreferrer">{{ pageTitle || accountHref }}</a></template><template v-else>{{ attribution }}</template></p>
</template>
