/**
 * 認証情報を含まないHTTPS URLを表示用に整形して返す（未指定・不正なURLはnull）
 * @param value 検証するURL
 * @returns 整形されたURLまたはnull
 */
export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * 対応するYouTube URLから11文字の動画IDを取り出す（取得できない場合はnull）
 * 短縮URL、watch、live、shorts、embedと、nocookieドメインのembedに対応
 */
export function youtubeVideoId(value: string | null | undefined): string | null {
  const safe = safeExternalUrl(value);

  if (!safe) {
    return null;
  }
  const url = new URL(safe);
  const host = url.hostname.toLowerCase();
  let id: string | null = null;

  if (host === 'youtu.be') {
    id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1] || null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.match(/^\/(?:live|shorts|embed)\/([\w-]{11})\/?$/)?.[1] || null;
  } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
    id = url.pathname.match(/^\/embed\/([\w-]{11})\/?$/)?.[1] || null;
  }

  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export type SourceMedia =
  | { kind: 'youtube'; id: string; embedUrl: string }
  | { kind: 'x'; id: string }
  | { kind: 'external' };

/** 参照元リンクには投稿・動画ではなく、各プラットフォームのアカウントURLだけを許可。 */
export function sourceAccountUrl(value: string | null | undefined, kind: SourceMedia['kind']): string | null {
  const safe = safeExternalUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.port) return null;
  if (kind === 'x' && ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname)) {
    const handle = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
    if (handle && !['home', 'search', 'explore', 'intent', 'i', 'settings'].includes(handle.toLowerCase())) return `https://x.com/${handle}`;
  }
  if (kind === 'youtube' && ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)
    && /^\/(?:@[^/]+|(?:channel|user|c)\/[^/]+)\/?$/.test(url.pathname)) {
    return `https://www.youtube.com${url.pathname}`;
  }
  return null;
}

/** 時間指定は秒数またはh/m/s表記だけを許可 */
function startSeconds(value: string | null): number | null {
  if (!value) return null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  const seconds = /^\d+$/.test(value) ? Number(value)
    : match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : NaN;
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 2147483647 ? seconds : null;
}

/** HTTPS・正規ホスト・ID形式から表示方式を導出 */
export function sourceMedia(value: string | null | undefined): SourceMedia {
  const safe = safeExternalUrl(value);
  if (!safe) return { kind: 'external' };

  const url = new URL(safe);
  if (url.port) return { kind: 'external' };

  const videoId = youtubeVideoId(safe);
  if (videoId) {
    const embed = new URL(`https://www.youtube.com/embed/${videoId}`);
    embed.searchParams.set('autoplay', '0');

    const start = startSeconds(url.searchParams.get('start')) ?? startSeconds(url.searchParams.get('t'));
    if (start !== null) embed.searchParams.set('start', String(start));

    return { kind: 'youtube', id: videoId, embedUrl: embed.href };
  }
  if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname)) {
    const id = url.pathname.match(/^\/(?:[A-Za-z0-9_]{1,15}\/status|i\/web\/status)\/([1-9]\d{0,19})(?:\/(?:photo|video)\/[1-9]\d*)?\/?$/)?.[1];
    if (id) return { kind: 'x', id };
  }
  return { kind: 'external' };
}

export const sourceMediaLabel = (value: string) => {
  const media = sourceMedia(value);
  return media.kind === 'youtube' ? 'YouTube' : media.kind === 'x' ? 'X' : '関連資料';
};

/** 正規の動画URLだけから公式サムネイルの参照先を組み立て */
export function youtubeThumbnailUrl(value: string): string | null {
  const media = sourceMedia(value);
  return media.kind === 'youtube' ? `https://i.ytimg.com/vi/${media.id}/hq720.jpg` : null;
}
