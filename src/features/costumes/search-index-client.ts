import type { SearchIndex, SearchSource } from '../../lib/search-normalization/index-data';

let worker: Worker | undefined;
let nextId = 0;
const requests = new Map<number, { resolve: (value: SearchIndex) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
function stop() {
  worker?.terminate(); worker = undefined;
  for (const request of requests.values()) {
    clearTimeout(request.timer);
    request.reject(new Error('検索用の読み仮名を生成できませんでした。再試行してください。'));
  }
  requests.clear();
}
/** 保存時にだけWorkerと辞書を読み込み、両編集画面から同じ生成処理を利用する。 */
export function generateSearchIndex(source: SearchSource): Promise<SearchIndex> {
  if (!worker) {
    worker = new Worker(new URL('./search-index.worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = stop;
    worker.onmessageerror = stop;
    worker.onmessage = (event: MessageEvent<{ id: number; index?: SearchIndex; error?: string }>) => {
      const request = requests.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timer); requests.delete(event.data.id);
      if (event.data.index) request.resolve(event.data.index);
      else request.reject(new Error(event.data.error ?? '読み仮名を生成できませんでした。'));
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    requests.set(id, { resolve, reject, timer: setTimeout(stop, 60_000) });
    worker!.postMessage({ id, source });
  });
}
