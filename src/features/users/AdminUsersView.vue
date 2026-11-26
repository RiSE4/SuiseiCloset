<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { authState, refreshAuth } from '../auth/auth';
import { ApiError } from '../../shared/api/request';
import { deleteObserver, listObservers, saveObserver, type Observer } from './users-api';

interface Row {
  key: string;
  original: Observer | null;
  draft: Observer;
  editing: boolean;
  busy: boolean;
  error: string;
  confirmingDelete: boolean;
}
const rows = ref<Row[]>([]);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const count = computed(() => rows.value.filter(row => row.original).length);
const hasNew = computed(() => rows.value.some(row => !row.original));
const controller = new AbortController();
const isSelf = (row: Row) => row.original?.discord_id === authState.user?.discord_id;

async function load() {
  loading.value = true;
  error.value = '';

  try {
    const data = await listObservers(controller.signal);
    rows.value = data.users.map(user => ({
      key: user.discord_id,
      original: { ...user },
      draft: { ...user },
      editing: false,
      busy: false,
      error: '',
      confirmingDelete: false
    }));
  } catch (cause) {
    if (controller.signal.aborted) {
      return;
    }
    error.value = cause instanceof Error ? cause.message : '観測者を読み込めませんでした。';

    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      await refreshAuth();
    }
  } finally {
    if (!controller.signal.aborted) {
      loading.value = false;
    }
  }
}

onMounted(load);
onBeforeUnmount(() => controller.abort());

async function add() {
  notice.value = '';
  rows.value.unshift({
    key: 'new-observer',
    original: null,
    draft: {
      discord_id: '',
      role: 'member',
      display_name: '',
      enabled: 1
    },
    editing: true,
    busy: false,
    error: '',
    confirmingDelete: false
  });

  await nextTick();
  document.getElementById('observer-new-observer-id')?.focus();
}

function edit(row: Row) {
  notice.value = '';
  row.error = '';
  row.editing = true;
  row.confirmingDelete = false;
}

async function remove(row: Row) {
  if (!row.original || row.busy) return;
  row.busy = true;
  row.error = '';
  notice.value = '';

  try {
    await deleteObserver(row.original.discord_id);
    rows.value = rows.value.filter(item => item !== row);
    notice.value = '観測者を削除しました。';
  } catch (cause) {
    row.error = cause instanceof Error ? cause.message : '削除できませんでした。';

    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      await refreshAuth();
    }

  } finally {
    row.busy = false;
  }
}

function cancel(row: Row) {
  if (!row.original) {
    rows.value = rows.value.filter(item => item !== row);
  } else {
    row.draft = { ...row.original }; row.editing = false; row.error = '';
  }
}

async function save(row: Row) {
  row.error = '';
  notice.value = '';
  const id = row.draft.discord_id.trim();

  if (!/^\d{17,20}$/.test(id)) {
    row.error = 'Discord IDは17～20桁の数字で入力してください。'; return;
  }

  const value = { ...row.draft, discord_id: id };
  row.busy = true;

  try {
    await saveObserver(value, row.original?.discord_id);
    const created = !row.original;
    row.original = { ...value };
    row.draft = { ...value };
    row.key = id;
    row.editing = false;

    notice.value = created ? '観測者を追加しました。' : '観測者の情報を保存しました。';
  } catch (cause) {
    row.error = cause instanceof Error ? cause.message : '保存できませんでした。';
    if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
      await refreshAuth();
    }
  } finally {
    row.busy = false;
  }
}
</script>

<template>
  <section class="admin-page observer-page" aria-labelledby="observer-title">
    <div class="page-intro archive-intro observer-intro">
      <p class="eyebrow">Edit Observers</p>
      <h1 id="observer-title">観測者の編集</h1>
      <button class="button primary observer-intro-action" type="button" :disabled="loading || !!error || hasNew"
        @click="add">観測者を追加</button>
    </div>

    <p v-if="notice" class="message success" role="status">{{ notice }}</p>
    <div v-if="loading" class="state-panel" role="status">観測者を読み込んでいます…</div>
    <div v-else-if="error" class="state-panel" role="alert">
      <p>{{ error }}</p><button class="button secondary" type="button" @click="load">再試行</button>
    </div>

    <template v-else>
      <div class="result-heading">
        <h2>登録済みの観測者</h2><span class="result-count"><strong>{{ count }}</strong><small>人</small></span>
      </div>
      <p v-if="!rows.length" class="empty-note">観測者はまだ登録されていません。</p>

      <div class="observer-list">
        <form v-for="row in rows" :key="row.key" class="observer-row" :class="{ 'is-editing': row.editing }"
          :aria-label="row.original ? `${row.original.discord_id}の編集` : '観測者の追加'" :aria-busy="row.busy"
          @submit.prevent="save(row)">
          <div class="observer-identity"><strong>{{ row.original ? (row.original.display_name || '名前未取得') : '新しい観測者'
          }}</strong><small v-if="isSelf(row)">あなた</small><small
              v-else-if="row.original && !row.original.enabled">無効</small></div>
          <label class="form-field" :for="`observer-${row.key}-id`"><span>Discord ID</span><input
              :id="`observer-${row.key}-id`" v-model="row.draft.discord_id" type="text" inputmode="numeric"
              autocomplete="off" maxlength="20" pattern="[0-9]{17,20}" required
              :disabled="!row.editing || row.busy || isSelf(row)"
              :aria-describedby="row.error ? `observer-${row.key}-error` : undefined"></label>
          <label class="form-field"><span>権限</span><select v-model="row.draft.role"
              :disabled="!row.editing || row.busy || isSelf(row)">
              <option value="member">Member</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select></label>

          <div class="observer-actions">
            <template v-if="row.editing"><button class="button primary" type="submit" :disabled="row.busy">{{ row.busy ?
              '保存中…' : '保存' }}</button><button class="button secondary" type="button" :disabled="row.busy"
                @click="cancel(row)">キャンセル</button></template>
            <template v-else>
              <button class="button secondary" type="button" :disabled="isSelf(row) || row.busy || row.confirmingDelete"
                @click="edit(row)">編集</button>
              <button class="button danger-outline" type="button"
                :disabled="isSelf(row) || row.busy || row.confirmingDelete"
                @click="row.confirmingDelete = true; row.error = ''; notice = ''">削除</button>
            </template>
          </div>

          <div v-if="row.confirmingDelete" class="observer-delete-confirm">
            <p>{{ row.original?.discord_id }} を削除しますか？この観測者はログインできなくなります。</p>
            <button class="button danger" type="button" :disabled="row.busy" @click="remove(row)">{{ row.busy ? '削除中…' :
              '削除する'
            }}</button>
            <button class="button secondary" type="button" :disabled="row.busy"
              @click="row.confirmingDelete = false">キャンセル</button>
          </div>

          <p v-if="row.error" :id="`observer-${row.key}-error`" class="field-error observer-row-error" role="alert">{{
            row.error
          }}</p>
        </form>
      </div>
    </template>
  </section>
</template>
