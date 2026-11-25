<script setup lang="ts">
import { computed } from 'vue';
import { validateColorPalette, type ColorPalette } from '../color-palette';
const props = defineProps<{ palette?: ColorPalette | null }>();
const colors = computed(() => {
  try { return validateColorPalette(props.palette ?? null); } catch { return null; }
});
const segments = computed(() => {
  let offset = 0;
  return colors.value?.map(color => {
    const x = offset; offset += color.ratio * 1000;
    return { ...color, x, width: color.ratio * 1000 };
  });
});
</script>

<template>
  <svg v-if="segments" class="color-palette-bar" viewBox="0 0 1000 12" preserveAspectRatio="none" role="img"
    aria-label="サムネイルの主要色">
    <rect v-for="(color, index) in segments" :key="index" :x="color.x" y="0" :width="color.width" height="12"
      :fill="color.hex" />
  </svg>
</template>

<style scoped>
.color-palette-bar {
  display: block;
  width: 100%;
  height: 12px;
  box-sizing: border-box;
  outline: 1px solid #8886;
  outline-offset: -1px;
  margin-top: 12px;
}
</style>
