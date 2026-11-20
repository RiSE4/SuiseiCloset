import { sourceAccountUrl } from '../../features/costumes/media';

/** 指定されたYouTubeレンダラーのJSONだけを読む。説明欄やおすすめ動画は参照しない。 */
function renderer(html: string, name: string): any {
  const match = new RegExp(`"${name}"\\s*:\\s*\\{`).exec(html);
  if (!match) return null;
  const start = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
    }
  }
  return null;
}

export function youtubeOwner(html: string): { title: string; channelId: string } | null {
  const owner = renderer(html, 'videoOwnerRenderer');
  const channelId = owner?.navigationEndpoint?.browseEndpoint?.browseId;
  const title = owner?.title?.runs?.map((run: { text?: string }) => run.text ?? '').join('').trim();
  return typeof channelId === 'string' && /^UC[\w-]{22}$/.test(channelId) && title
    ? { title: title.slice(0, 300), channelId } : null;
}

export function youtubeOwnerUrl(html: string, channelId: string): string | null {
  const metadata = renderer(html, 'channelMetadataRenderer');
  if (metadata?.externalId !== channelId) return null;
  // YouTube自身のメタデータはhttp表記の場合がある。リンクはHTTPSに統一する。
  const value = metadata.vanityChannelUrl;
  return typeof value === 'string' ? sourceAccountUrl(value.replace(/^http:/, 'https:'), 'youtube') : null;
}

async function youtubePage(path: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`https://www.youtube.com/${path}`, {
      signal: controller.signal, redirect: 'manual', headers: { Accept: 'text/html' }
    });
    if (!response.ok || !/^text\/html\b/i.test(response.headers.get('Content-Type') ?? '')) {
      await response.body?.cancel(); return null;
    }
    const reader = response.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder();
    let html = '';
    let size = 0;
    try {
      while (size < 2 * 1024 * 1024) {
        const { value, done } = await reader.read();
        if (done) break;
        const part = value.subarray(0, 2 * 1024 * 1024 - size);
        size += part.length;
        html += decoder.decode(part, { stream: true });
      }
      return html + decoder.decode();
    } finally { await reader.cancel(); reader.releaseLock(); }
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

export async function fetchYoutubeOwner(videoId: string): Promise<{ title: string; authorUrl: string } | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const html = await youtubePage(`watch?v=${videoId}`);
  const owner = html ? youtubeOwner(html) : null;
  if (!owner) return null;
  const channel = await youtubePage(`channel/${owner.channelId}`);
  return { title: owner.title, authorUrl: (channel && youtubeOwnerUrl(channel, owner.channelId))
    || `https://www.youtube.com/channel/${owner.channelId}` };
}
