<script setup lang="ts">
import { computed } from 'vue';
import type { CostumeSourceDto } from '../costume-model';
import { safeExternalUrl, sourceAccountUrl, sourceMedia } from '../media';

const props = defineProps<{ source: Pick<CostumeSourceDto, 'id' | 'sourceUrl' | 'attribution'>; costumeId: string; linkAccount?: boolean; admin?: boolean }>();
const href = computed(() => safeExternalUrl(props.source.sourceUrl));
const pageTitle = computed(() => props.source.attribution?.title ?? null);
const authorUrl = computed(() => props.source.attribution?.authorUrl ?? null);
const accountHref = computed(() => props.linkAccount ? sourceAccountUrl(authorUrl.value, sourceMedia(props.source.sourceUrl).kind) : null);
const attribution = computed(() => `参照元：${pageTitle.value || href.value}`);
</script>

<template>
  <p v-if="href" class="source-attribution" :title="attribution"><template v-if="accountHref">参照元：<a :href="accountHref" target="_blank" rel="noopener noreferrer">{{ pageTitle || accountHref }}</a></template><template v-else>{{ attribution }}</template></p>
</template>
