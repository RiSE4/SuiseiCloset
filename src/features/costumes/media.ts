import type { CostumeSourceDto } from './costume-model';

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

/**
 * 指定された画像URLを優先し、画像が使えないVIDEO資料ではYouTubeの画像を補完
 * @param source CostumeSourceDto
 * @returns 画像URLまたはnull
 */
export function sourceThumbnail(source: CostumeSourceDto): string | null {
  const explicit = safeExternalUrl(source.thumbnailUrl);

  if (explicit) {

    return explicit;
  }
  if (source.sourceType !== 'VIDEO') {
    return null;
  }
  const id = youtubeVideoId(source.sourceUrl);

  return id ? `https://i.ytimg.com/vi/${id}/hq720.jpg` : null;
}
