<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CostumeSourceDto } from '../costume-model';
import { safeExternalUrl, sourceThumbnail } from '../media';

const props = defineProps<{ source: CostumeSourceDto }>();
const failed = ref(false);

watch(() => [props.source.thumbnailUrl, props.source.sourceUrl], () => { failed.value = false; });

const href = computed(() => safeExternalUrl(props.source.sourceUrl));
const thumbnail = computed(() => sourceThumbnail(props.source));

const fallback = computed(() => props.source.sourceType === 'VIDEO' ? '動画' : props.source.sourceType === 'THREE_VIEW' ? '設定画' : '資料');
</script>

<template>
  <a v-if="href" class="source-card" :href="href" target="_blank" rel="noopener noreferrer"
    :aria-label="`${source.title}を新しいタブで開く`">
    <div :class="['source-image', { 'is-empty': !thumbnail || failed }]">
      <img v-if="thumbnail && !failed" :src="thumbnail" :alt="`${source.title}のサムネイル`" loading="lazy" decoding="async"
        @error="failed = true">
      <div v-else class="source-placeholder" aria-hidden="true"><span>✦</span><small>{{ fallback }}</small></div>
    </div>
    <span class="source-title">{{ source.title }}</span><span class="external-mark" aria-hidden="true">↗</span>
  </a>
</template>
