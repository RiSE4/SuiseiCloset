<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
defineProps<{ src: string; title: string }>();
const host = ref<HTMLElement | null>(null);
const ready = ref(false);
const failed = ref(false);
let observer: ResizeObserver | undefined;
onMounted(() => {
  // 公式の最小200×200pxを確保できる場合だけプレーヤーを表示する。
  observer = new ResizeObserver(entries => { ready.value = (entries[0]?.contentRect.width ?? 0) >= 200; });
  if (host.value) observer.observe(host.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <div ref="host" class="youtube-embed">
    <iframe v-if="ready && !failed" :src="src" :title="`${title} — YouTubeプレーヤー`" loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin" @error="failed = true"></iframe>
    <p v-else class="source-fallback">{{ failed ? 'この資料を埋め込み表示できませんでした。' : '元資料へのリンクから動画をご覧いただけます。' }}</p>
  </div>
</template>
