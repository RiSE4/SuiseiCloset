<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CostumeSourceDto } from '../costume-model';
import { safeExternalUrl, sourceMedia } from '../media';
import YouTubeEmbed from './YouTubeEmbed.vue';
import XEmbed from './XEmbed.vue';
import SourceAttribution from './SourceAttribution.vue';
const props = defineProps<{ source: CostumeSourceDto; costumeId: string }>();
const failed = ref(false);
watch(() => [props.source.thumbnailUrl, props.source.sourceUrl], () => { failed.value = false; });
const href = computed(() => safeExternalUrl(props.source.sourceUrl));
const media = computed(() => sourceMedia(props.source.sourceUrl));
const thumbnail = computed(() => safeExternalUrl(props.source.thumbnailUrl));
const linkLabel = computed(() => media.value.kind === 'youtube' ? 'YouTubeを開く' : media.value.kind === 'x' ? 'Xを開く'
  : '資料を開く');
</script>
<template>
  <article class="source-shell">
    <header>
      <h3>{{ source.title }}</h3>
    </header>
    <div class="source-shell-content">
      <YouTubeEmbed v-if="media.kind === 'youtube'" :key="media.embedUrl" :src="media.embedUrl" :title="source.title" />
      <XEmbed v-else-if="media.kind === 'x'" :post-id="media.id" />
      <a v-else-if="href && thumbnail && !failed" :href="href" target="_blank" rel="noopener noreferrer">
        <img class="source-external-image" :src="thumbnail" :alt="`${source.title}のサムネイル`" loading="lazy"
          decoding="async" @error="failed = true">
      </a>
      <p v-else class="source-fallback">{{ failed ? 'この資料の画像を表示できませんでした。' : '元資料へのリンクからご覧ください。' }}</p>
    </div>
    <footer>
      <SourceAttribution :source="source" :costume-id="costumeId" link-account />
      <a v-if="href" :href="href" target="_blank" rel="noopener noreferrer">{{ linkLabel }} ↗</a>
      <span v-else>参照先URLが無効です。</span>
    </footer>
  </article>
</template>
