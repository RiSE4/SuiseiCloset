<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons';
import { createXPost, loadXWidgets } from '../x-widgets';
const props = defineProps<{ postId: string; hideConversation?: boolean }>();
const host = ref<HTMLElement | null>(null);
const state = ref<'waiting' | 'loading' | 'ready' | 'failed'>('waiting');
let resize: ResizeObserver | undefined;
let mutations: MutationObserver | undefined;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let target: HTMLDivElement | undefined;
let stopPost: (() => void) | undefined;
function reset() {
  generation++; clearTimeout(timer);
  stopPost?.(); stopPost = undefined; mutations?.disconnect();
  target?.remove(); target = undefined; state.value = 'waiting';
}
async function render() {
  if (state.value !== 'waiting' || !host.value || host.value.clientWidth < 250) return;
  state.value = 'loading';
  const token = ++generation;
  const container = document.createElement('div');
  target = container; host.value.appendChild(container);
  const fail = () => {
    if (token !== generation) return;
    clearTimeout(timer); state.value = 'failed';
  };
  try {
    const api = await loadXWidgets();
    await nextTick();
    if (token !== generation || !container.isConnected) return;
    // スクリプト待機と投稿の生成待機を分ける。遅い応答も破棄せず復帰可能にする。
    timer = setTimeout(fail, 20000);
    mutations = new MutationObserver(() => {
      // 画面下のiframeもブラウザの遅延ロード待ちにしない。
      container.querySelectorAll('iframe').forEach(frame => { if (frame.loading !== 'eager') frame.loading = 'eager'; });
    });
    mutations.observe(container, { childList: true, subtree: true });
    stopPost = createXPost(api, props.postId, container, {
      dnt: true, align: 'center', lang: 'ja',
      ...(props.hideConversation ? { conversation: 'none' } : {})
    }, () => {
      if (token !== generation) return;
      clearTimeout(timer); state.value = 'ready';
      mutations?.disconnect();
    }, fail);
  } catch { fail(); }
}
watch(() => [props.postId, props.hideConversation], () => { reset(); void nextTick(render); });
onMounted(() => {
  resize = new ResizeObserver(() => { void render(); });
  if (host.value) resize.observe(host.value);
  void render();
});
onBeforeUnmount(() => { reset(); resize?.disconnect(); });
</script>
<template>
  <div ref="host" class="x-embed" :class="{ 'is-failed': state === 'failed' }" :aria-busy="state === 'loading'">
    <div v-if="state === 'loading'" class="source-loading" role="status">
      <span class="loading-spinner" aria-hidden="true"></span>
      <span>Xの投稿を読み込んでいます…</span>
    </div>
    <div v-else-if="state === 'failed'" class="source-embed-error" role="status">
      <span class="source-embed-error-icon" aria-hidden="true">
        <FontAwesomeIcon :icon="faCircleExclamation" />
      </span>
      <div>
        <p class="source-embed-error-title">この資料を埋め込み表示できませんでした。</p>
        <p class="source-embed-error-description">元資料へのリンクからご確認ください。</p>
      </div>
    </div>
    <p v-else-if="state !== 'ready'" class="source-fallback" role="status">表示できない場合は元資料へのリンクをご利用ください。</p>
  </div>
</template>
