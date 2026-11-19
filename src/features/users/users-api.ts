import { requestJson } from '../../shared/api/request';

export interface Observer {
  discord_id: string;
  display_name: string;
  role: 'admin' | 'editor' | 'member';
  enabled: number;
}

export const listObservers = (signal?: AbortSignal) =>
  requestJson<{ users: Observer[] }>('/api/admin/users', signal);

export const deleteObserver = (id: string) =>
  requestJson<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(id)}`, undefined, 'DELETE');

export const saveObserver = (user: Observer, originalId?: string) =>
  requestJson<{ ok: boolean }>(originalId ? `/api/admin/users/${encodeURIComponent(originalId)}` : '/api/admin/users', undefined,
    originalId ? 'PATCH' : 'POST', { ...user, enabled: user.enabled === 1 });
