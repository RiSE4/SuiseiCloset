<script setup lang="ts">
import { ref } from 'vue';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import { normalizeKeyword } from '../keywords';

const props = defineProps<{ modelValue: string[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const draft = ref('');
const error = ref('');

/** 80文字・32件の上限と正規化後の重複を確認し、入力したキーワードを追加 */
function add() {
  const value = draft.value.trim();
  error.value = '';
  if (!value) return;
  if (value.length > 80) {
    error.value = 'キーワードは80文字以内にしてください。'; return;
  }
  if (props.modelValue.length >= 32) {
    error.value = 'キーワードは32件までです。'; return;
  }
  if (props.modelValue.some(item => normalizeKeyword(item) === normalizeKeyword(value))) {
    error.value = '同じキーワードが登録されています。'; return;
  }
  emit('update:modelValue', [...props.modelValue, value]);
  draft.value = '';
}
/** Enterでキーワードを確定 */
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  add();
}
/** 指定位置のキーワードを除いた新しい配列を親へ通知する */
function remove(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
}
</script>

<template>
  <div class="keyword-editor">
    <div class="keyword-list" v-if="modelValue.length"><span v-for="(item, index) in modelValue"
        :key="`${item}-${index}`" class="keyword-chip editable"><span>{{ item }}</span><button type="button"
          :disabled="disabled" :aria-label="`${item}を削除`" @click="remove(index)">
          <FontAwesomeIcon :icon="faXmark" aria-hidden="true" />
        </button></span></div>

    <p v-else class="field-hint">キーワードはまだありません。</p>

    <div class="inline-input"><input v-model="draft" type="text" maxlength="80" :disabled="disabled"
        aria-label="追加するキーワード" placeholder="例: メガネ" @keydown="onKeydown"><button type="button" class="button secondary"
        :disabled="disabled || !draft.trim()" @click="add">追加</button></div>
    <p v-if="error" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>
