<script setup lang="ts">
import { computed } from 'vue';
import type { CostumeSummaryDto } from '../costume-model';
import { thumbnailAttribution } from '../thumbnail-attribution';

const props = defineProps<{ costume: Pick<CostumeSummaryDto, 'thumbnailSourceTitle' | 'thumbnailSourceUrl' | 'primarySource'> }>();
const attribution = computed(() => thumbnailAttribution(props.costume));
</script>

<template>
  <p v-if="attribution.title || attribution.url" class="source-attribution">
    参照元：
    <a v-if="attribution.url" :href="attribution.url" target="_blank" rel="noopener noreferrer">
      {{ attribution.title || attribution.url }}
    </a>
    <template v-else>{{ attribution.title }}</template>
  </p>
</template>
