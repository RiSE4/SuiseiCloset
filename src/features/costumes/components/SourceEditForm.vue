<script setup lang="ts">
import { computed } from 'vue';
import { sourceMedia, youtubeThumbnailUrl } from '../media';
import SourceEditPreview from './SourceEditPreview.vue';
const props = defineProps<{ form: { title: string; sourceUrl: string; thumbnailUrl: string }; disabled?: boolean; busy?: boolean; editing?: boolean }>();
defineEmits<{ save: []; cancel: [] }>();
const media = computed(() => sourceMedia(props.form.sourceUrl));
const automaticThumbnail = computed(() => youtubeThumbnailUrl(props.form.sourceUrl));
const thumbnailInput = computed({
  get: () => automaticThumbnail.value ?? props.form.thumbnailUrl,
  set: (value: string) => { if (!automaticThumbnail.value) props.form.thumbnailUrl = value; }
});
</script>
<template>
  <form @submit.prevent="$emit('save')">
    <h3>{{ editing ? '資料を編集' : '資料を追加' }}</h3>
    <div class="admin-form-grid">
      <label class="form-field wide"><span>資料タイトル <b>必須</b></span><input v-model="form.title" maxlength="150" required
          :disabled="disabled" placeholder="例: 衣装設定画"></label>
      <label class="form-field wide"><span>参照先URL <b>必須</b></span><input v-model="form.sourceUrl" type="url"
          maxlength="2048" required pattern="https://.*" :disabled="disabled" placeholder="https://..."></label>
      <label v-if="media.kind !== 'x'" class="form-field wide"><span>{{ automaticThumbnail ? '画像URL（YouTubeから自動設定）' :
          '画像URL（任意）' }}</span>
        <input v-model="thumbnailInput" type="url" maxlength="2048" pattern="https://.*" :disabled="disabled"
          :readonly="Boolean(automaticThumbnail)" placeholder="https://...">
      </label>
      <SourceEditPreview class="wide" :source-url="form.sourceUrl" :image-url="thumbnailInput" :title="form.title" />
    </div>
    <div class="row-actions">
      <button type="submit" class="button primary" :disabled="disabled">{{ busy ? '保存中…' : editing ? '資料の変更を保存' :
        '資料を追加' }}</button>
      <button type="button" class="button secondary" :disabled="disabled" @click="$emit('cancel')">{{ editing ? 'キャンセル'
        : '入力をリセット' }}</button>
    </div>
  </form>
</template>
