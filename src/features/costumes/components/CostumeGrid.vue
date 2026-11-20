<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import { vPackedGrid } from '../../../shared/packed-grid';
import type { CostumeSummaryDto } from '../costume-model';
import CostumeTile from './CostumeTile.vue';

const props = defineProps<{ items: CostumeSummaryDto[]; from?: string }>();
const items = ref([...props.items]);
const container = ref<HTMLElement>();
const announcement = ref('');
const sortables: Sortable[] = [];
type Position = { x: number; y: number };
let positions = new Map<HTMLElement, Position>();
const animations = new Map<HTMLElement, Animation>();

function capturePositions() {
  const snapshot = new Map<HTMLElement, Position>();
  for (const card of Array.from(container.value?.querySelectorAll<HTMLElement>('.costume-tile') ?? [])) {

    // つかんでいるカードの座標はSortableだけが管理
    if (card === Sortable.dragged || card.classList.contains('card-drag-chosen')) continue;
    const rect = card.getBoundingClientRect();
    snapshot.set(card, { x: rect.left + window.scrollX, y: rect.top + window.scrollY });
  }
  return snapshot;
}

// 段組みの再配置で動く全カードを、直前に見えていた位置から新しい位置へ補間
function animatePositions(snapshot: Map<HTMLElement, Position>) {
  for (const animation of animations.values()) animation.cancel();
  animations.clear();

  // iOS WebKitでは、クリップされたカードのtransformアニメーションが再描画を欠くことがある
  if (window.matchMedia('(prefers-reduced-motion: reduce), (hover: none) and (pointer: coarse)').matches) return;

  for (const [card, previous] of snapshot) {
    if (!card.isConnected) continue;
    if (card === Sortable.dragged || card.classList.contains('card-drag-chosen')) continue;

    const rect = card.getBoundingClientRect();
    const x = previous.x - rect.left - window.scrollX;
    const y = previous.y - rect.top - window.scrollY;
    if (Math.abs(x) < 1 && Math.abs(y) < 1) continue;

    const animation = card.animate([
      { transform: `translate(${x}px, ${y}px)` },
      { transform: 'translate(0, 0)' },
    ], { duration: 360, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    animations.set(card, animation);
    animation.onfinish = () => { if (animations.get(card) === animation) animations.delete(card); };
  }
}
// 検索結果が切り替わったら、その結果の初期順序に戻す
watch(() => props.items, value => { items.value = [...value]; });

function move(from: number, to: number, snapshot = capturePositions()) {
  if (to < 0 || to >= items.value.length || from === to) return;
  const next = [...items.value];
  const [item] = next.splice(from, 1);

  if (!item) return;
  next.splice(to, 0, item);
  items.value = next;
  announcement.value = `${item.name}を${to + 1}番目に移動しました`;
  void nextTick(() => animatePositions(snapshot));
}

function initSortable(element: HTMLElement) {
  sortables.push(Sortable.create(element, {
    draggable: '.costume-tile',
    handle: '.card-drag-handle',
    // Sortableの単体アニメーションではなく、列をまたぐ全体の動きを補間
    animation: 0,
    delay: 250,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    ghostClass: 'card-drag-placeholder',
    fallbackClass: 'card-drag-preview',
    chosenClass: 'card-drag-chosen',

    onChoose(event) {
      // 直前の配置アニメーションが残っていても、ドラッグ開始位置には持ち越さない
      animations.get(event.item)?.cancel();
      animations.delete(event.item);
      container.value?.classList.add('is-reordering');
    },

    onUnchoose() { container.value?.classList.remove('is-reordering'); },
    onMove() { positions = capturePositions(); },
    onChange() { animatePositions(positions); },
    onEnd(event) {
      //SortableのDOM変更を戻してから、Vueの配列更新で順序を確定
      const { oldIndex, newIndex, item, from, to } = event;
      if (oldIndex === undefined || newIndex === undefined || (from === to && oldIndex === newIndex)) return;
      const fromIndex = oldIndex;
      const toIndex = newIndex;
      const snapshot = capturePositions();
      item.remove();
      from.insertBefore(item, from.children[oldIndex] ?? null);
      move(fromIndex, toIndex, snapshot);
    },
  }));
}

function initSortables() {
  if (container.value) initSortable(container.value);
}

function destroySortables() {
  for (const sortable of sortables.splice(0)) sortable.destroy();
}

onMounted(initSortables);

onBeforeUnmount(() => {
  destroySortables();
  for (const animation of animations.values()) animation.cancel();
});
</script>

<template>
  <div v-packed-grid ref="container" class="costume-grid packed-grid">
    <CostumeTile v-for="(item, index) in items" :key="item.id" :costume="item" :from="from" movable
      @move="move(index, index + $event)" />
  </div>
  <p class="reorder-announcement" role="status" aria-live="polite">{{ announcement }}</p>
</template>
