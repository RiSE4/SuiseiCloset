<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { safeExternalUrl, sourceMedia } from '../media';
import XEmbed from './XEmbed.vue';
import YouTubeEmbed from './YouTubeEmbed.vue';

const props = defineProps<{ sourceUrl: string; imageUrl: string; title: string }>();
const media = computed(() => sourceMedia(props.sourceUrl));
const sourceHref = computed(() => safeExternalUrl(props.sourceUrl));
const postId = ref<string | null>(null);
const image = ref<string | null>(null);
const state = ref<'empty' | 'loading' | 'ready' | 'failed'>('empty');
let debounce: ReturnType<typeof setTimeout> | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;

watch(() => [props.sourceUrl, props.imageUrl], () => {
  clearTimeout(debounce); clearTimeout(timeout);
  image.value = null; postId.value = null; state.value = 'empty';
  // 編集中の一投稿だけを自動表示し、URL入力中の連続生成を避ける。
  const target = media.value;
  if (target.kind === 'youtube') return;
  if (target.kind === 'x') {
    debounce = setTimeout(() => { postId.value = target.id; }, 300);
    return;
  }
  const safe = safeExternalUrl(props.imageUrl.trim());
  if (!safe) return;
  debounce = setTimeout(() => {
    image.value = safe; state.value = 'loading';
    timeout = setTimeout(() => { state.value = 'failed'; }, 12000);
  }, 300);
}, { immediate: true });

function imageResult(event: Event, failed = false) {
  if (!(event.target instanceof HTMLImageElement) || event.target.getAttribute('src') !== image.value) return;
  clearTimeout(timeout); state.value = failed ? 'failed' : 'ready';
}
onBeforeUnmount(() => { clearTimeout(debounce); clearTimeout(timeout); });
</script>

<template>
  <section class="source-edit-preview" aria-label="編集中の資料プレビュー">
    <template v-if="media.kind === 'youtube'">
      <YouTubeEmbed :key="media.embedUrl" :src="media.embedUrl" :title="title || '資料'" />
    </template>
    <template v-else-if="media.kind === 'x'">
      <div v-if="postId" class="source-post-preview" tabindex="0" role="region" aria-label="投稿プレビュー（スクロールして全体を確認できます）">
        <XEmbed :key="postId" :post-id="postId" hide-conversation />
      </div>
      <div v-else class="source-loading" role="status">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>Xの投稿を読み込んでいます…</span>
      </div>
    </template>
    <template v-else>
      <a v-if="image && state !== 'failed'" :href="image" target="_blank" rel="noopener noreferrer">
        <img :key="image" :src="image" :alt="`${title || '資料'}の画像プレビュー`" decoding="async" @load="imageResult($event)"
          @error="imageResult($event, true)">
      </a>
      <p v-if="state === 'loading'" class="field-hint" role="status">画像を読み込んでいます…</p>
      <p v-else-if="state === 'failed'" class="field-hint" role="status">画像を表示できませんでした。URLや公開状態を確認してください。</p>
      <p v-else-if="state === 'empty'" class="field-hint">画像URLを入力するとプレビューを表示します。</p>
    </template>
    <slot name="attribution" />
    <a v-if="sourceHref && media.kind !== 'external'" class="source-edit-preview-link" :href="sourceHref" target="_blank"
      rel="noopener noreferrer">{{ media.kind === 'youtube' ? 'YouTube' : 'X' }}を開く ↗</a>
  </section>
</template>
