<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faGrip } from '@fortawesome/free-solid-svg-icons';
import type { CostumeSummaryDto } from '../costume-model';
import { safeExternalUrl } from '../media';

const props = defineProps<{ costume: CostumeSummaryDto; from?: string; movable?: boolean }>();
const emit = defineEmits<{ move: [direction: number] }>();
const failed = ref(false);

// 別のサムネイルに切り替わったら、以前の読み込み失敗状態を解除
watch(() => props.costume.thumbnailUrl, () => { failed.value = false; });

/** 表示条件を満たすHTTPS URLだけを画像の参照先 */
const imageUrl = computed(() => safeExternalUrl(props.costume.thumbnailUrl));

/** 詳細への遷移先。一覧の検索条件を復元できるよう、渡された戻り先を引き継ぐ */
const destination = computed(() => ({
  path: `/costumes/${encodeURIComponent(props.costume.id)}`,
  query: props.from ? { from: props.from } : {}
}));
</script>

<template>
  <article class="costume-tile">
    <RouterLink :to="destination" class="costume-tile-link" :draggable="false">
      <div class="tile-image">
        <img v-if="imageUrl && !failed" :src="imageUrl" :alt="`${costume.name}のサムネイル`" :draggable="false" loading="lazy"
          decoding="async" @error="failed = true">
        <div v-else class="image-placeholder" aria-hidden="true"><span>✦</span><small>画像未登録</small></div>
      </div>
      <div class="tile-content">
        <div class="tile-meta"><span v-if="costume.debutYear">{{ costume.debutYear }}年</span><span
            v-if="costume.category">{{ costume.category }}</span></div>
        <h3>{{ costume.name }}</h3>
      </div>
    </RouterLink>

    <button v-if="movable" type="button" class="card-drag-handle" :aria-label="`${costume.name}を並べ替え。矢印キーでも移動できます`"
      title="押したままドラッグして移動" @contextmenu.prevent @click.stop @keydown.left.prevent="emit('move', -1)"
      @keydown.up.prevent="emit('move', -1)" @keydown.right.prevent="emit('move', 1)"
      @keydown.down.prevent="emit('move', 1)">
      <FontAwesomeIcon :icon="faGrip" aria-hidden="true" />
    </button>
  </article>
</template>
