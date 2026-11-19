<script setup lang="ts">
defineProps<{ star?: boolean }>();
</script>

<template>
  <svg class="orbit-artwork" viewBox="0 0 148 148" aria-hidden="true" focusable="false">
    <circle class="orbit-ring" cx="74" cy="74" r="73.5" />
    <!-- Coordinates include the tilt so the thin orbit needs no CSS or SVG rotation. -->
    <path class="orbit-track orbit-track-desktop" d="M 159.833 -3.285 C 173.691 12.106 146.497 59.185 99.092 101.868 C 51.688 144.551 2.025 166.676 -11.833 151.285 C -25.691 135.894 1.503 88.815 48.908 46.132 C 96.312 3.449 145.975 -18.676 159.833 -3.285 Z" />
    <path class="orbit-track orbit-track-mobile" d="M 150.172 5.414 C 164.215 21.010 141.496 64.361 99.427 102.240 C 57.358 140.118 11.871 158.182 -2.172 142.586 C -16.215 126.990 6.504 83.639 48.573 45.760 C 90.642 7.882 136.129 -10.182 150.172 5.414 Z" />
    <circle class="orbit-satellite" cx="5.3" cy="49" r="3" />
    <path v-if="star" class="orbit-star"
      d="M74 46 Q79 69 102 74 Q79 79 74 102 Q69 79 46 74 Q69 69 74 46Z" />
  </svg>
</template>
