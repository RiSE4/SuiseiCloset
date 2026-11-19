<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import type { CostumeSummaryDto } from '../costume-model';
import CostumeTile from './CostumeTile.vue';

const props = defineProps<{ items: CostumeSummaryDto[]; from?: string; related?: boolean }>();
const items = ref([...props.items]);
const container = ref<HTMLElement>();
const announcement = ref('');
const mobileRelated = ref(props.related === true && typeof window !== 'undefined' && window.matchMedia('(max-width: 650px)').matches);
const columnBreak = computed(() => Math.ceil(items.value.length / 2));
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

function initSortable(element: HTMLElement, group?: string) {
  sortables.push(Sortable.create(element, {
    draggable: '.costume-tile',
    handle: '.card-drag-handle',
    ...(group ? { group } : {}),
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
      const leftColumn = container.value?.firstElementChild;
      const fromIndex = mobileRelated.value && from !== leftColumn ? columnBreak.value + oldIndex : oldIndex;
      const toIndex = mobileRelated.value
        ? to === leftColumn
          ? Math.min(newIndex, columnBreak.value - 1)
          : Math.min(columnBreak.value + newIndex, items.value.length - 1)
        : newIndex;
      const snapshot = capturePositions();
      item.remove();
      from.insertBefore(item, from.children[oldIndex] ?? null);
      move(fromIndex, toIndex, snapshot);
    },
  }));
}

function initSortables() {
  if (!container.value) return;
  if (mobileRelated.value) {
    for (const column of Array.from(container.value.children)) {
      initSortable(column as HTMLElement, 'related-costumes');
    }
  } else {
    initSortable(container.value);
  }
}

function destroySortables() {
  for (const sortable of sortables.splice(0)) sortable.destroy();
}

let mediaQuery: MediaQueryList | undefined;
function onMediaChange(event: MediaQueryListEvent) {
  mobileRelated.value = props.related === true && event.matches;
}

onMounted(() => {
  if (props.related) {
    mediaQuery = window.matchMedia('(max-width: 650px)');
    mediaQuery.addEventListener('change', onMediaChange);
  }
  initSortables();
});

watch(mobileRelated, async () => {
  destroySortables();
  await nextTick();
  initSortables();
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', onMediaChange);
  destroySortables();
  for (const animation of animations.values()) animation.cancel();
});
</script>

<template>
  <div v-if="mobileRelated" ref="container" class="costume-grid">
    <div class="costume-column">
      <CostumeTile v-for="(item, index) in items.slice(0, columnBreak)" :key="item.id" :costume="item" :from="from"
        movable @move="move(index, index + $event)" />
    </div>
    <div class="costume-column">
      <CostumeTile v-for="(item, index) in items.slice(columnBreak)" :key="item.id" :costume="item" :from="from" movable
        @move="move(columnBreak + index, columnBreak + index + $event)" />
    </div>
  </div>
  <div v-else ref="container" class="costume-grid">
    <CostumeTile v-for="(item, index) in items" :key="item.id" :costume="item" :from="from" movable
      @move="move(index, index + $event)" />
  </div>
  <p class="reorder-announcement" role="status" aria-live="polite">{{ announcement }}</p>
</template>
