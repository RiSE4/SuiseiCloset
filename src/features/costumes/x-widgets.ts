export interface XWidgets {
  widgets: { createTweet(id: string, target: HTMLElement, options: Record<string, unknown>): Promise<HTMLElement | undefined> };
  ready?: (callback: (api: XWidgets) => void) => void;
  events?: {
    bind(name: string, callback: (event: { target: HTMLElement }) => void): void;
    unbind(name: string, callback: (event: { target: HTMLElement }) => void): void
  };
}
declare global { interface Window { twttr?: Partial<XWidgets> } }

let loading: Promise<XWidgets> | undefined;

/** 同時要求を共有し、失敗時は自動再試行せず次回の画面表示で再試行 */
export function loadXWidgets(): Promise<XWidgets> {
  if (window.twttr?.widgets?.createTweet) return Promise.resolve(window.twttr as XWidgets);
  if (loading) return loading;

  loading = new Promise<XWidgets>((resolve, reject) => {
    const src = 'https://platform.twitter.com/widgets.js';
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    const script = existing ?? document.createElement('script');

    const cleanup = () => {
      clearTimeout(timer);
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
    };

    const failed = () => {
      cleanup(); script.remove(); loading = undefined;
      reject(new Error('Xウィジェットを読み込めませんでした'));
    };

    const loaded = () => {
      if (window.twttr?.widgets?.createTweet) { cleanup(); resolve(window.twttr as XWidgets); }
      else if (window.twttr?.ready) {
        window.twttr.ready(api => { cleanup(); resolve(api); });
      } else failed();
    };

    const timer = setTimeout(failed, 15000);
    script.addEventListener('load', loaded, { once: true });
    script.addEventListener('error', failed, { once: true });

    if (!existing) {
      script.src = src; script.async = true;
      script.referrerPolicy = 'strict-origin-when-cross-origin';
      document.head.appendChild(script);
    }
  });

  return loading;
}

/** Promiseのほか公式renderedイベントも受け取り、投稿ごとに購読を解除 */
export function createXPost(api: XWidgets, id: string, target: HTMLElement, options: Record<string, unknown>,
  ready: () => void, failed: () => void): () => void {
  let active = true;
  let rendered = false;

  const cleanup = () => { api.events?.unbind('rendered', onRendered); };
  const complete = () => {
    if (!active || rendered) return;
    rendered = true; cleanup(); ready();
  };

  const onRendered = (event: { target: HTMLElement }) => {
    if (target.contains(event.target)) complete();
  };

  api.events?.bind('rendered', onRendered);

  try {
    void api.widgets.createTweet(id, target, options).then(result => {
      if (result) complete();
      else if (active && !rendered) { cleanup(); failed(); }
    }).catch(() => { if (active && !rendered) { cleanup(); failed(); } });
  } catch {
    cleanup();
    if (active) failed();
  }

  return () => { active = false; cleanup(); };
}
