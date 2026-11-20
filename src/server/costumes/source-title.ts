import { sourceAccountUrl, sourceMedia } from '../../features/costumes/media';
import { fail, json } from '../http';
import type { Context } from '../types';
import { decodeHTML } from 'entities';
import { fetchYoutubeOwner } from './youtube-owner';

export async function extractSourceTitle(bytes: Uint8Array, contentType: string): Promise<string | null> {
  const charset = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
    ?? new TextDecoder().decode(bytes.subarray(0, 4096)).match(/<meta\b[^>]*charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? 'utf-8';
  const html = new TextDecoder(charset).decode(bytes);
  let text = '';
  let found = false;
  let active = false;
  await new HTMLRewriter().on('head title', {
    element(element) {
      active = !found; found = true;
      element.onEndTag(() => { active = false; });
    },
    text(chunk) { if (active && text.length < 2048) text += chunk.text; }
  }).transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).text();
  return decodeHTML(text).replace(/\s+/g, ' ').trim().slice(0, 300) || null;
}

export function titleUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !host.includes('.') || !/^[a-z0-9.-]+$/.test(host) || /^[\d.]+$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host)) return null;
    return url;
  } catch { return null; }
}

export function publicAddress(address: string): boolean {
  if (address.includes(':')) {
    return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0|2|10|20):/i.test(address);
  }
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return false;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a > 0 && a < 224 && a !== 10 && a !== 127 &&
    !(a === 100 && b >= 64 && b <= 127) && !(a === 169 && b === 254) &&
    !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && (b === 168 || b === 0 || b === 2)) &&
    !(a === 198 && (b === 18 || b === 19 || b === 51)) && !(a === 203 && b === 0);
}

async function publicHost(host: string, signal: AbortSignal, resolver = 'cloudflare-dns.com'): Promise<boolean> {
  const responses = await Promise.all(['A', 'AAAA'].map(async type => {
    const url = new URL(resolver === 'dns.google' ? 'https://dns.google/resolve' : 'https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', host); url.searchParams.set('type', type);
    // Workersはredirect:errorに未対応。manualにして非2xxを明示的に拒否する。
    const response = await fetch(url, { headers: { Accept: 'application/dns-json' }, signal, redirect: 'manual' });
    if (!response.ok) throw Error('DNS lookup failed');
    return await response.json() as { Status?: number; Answer?: { type: number; data: string }[] };
  }));
  if (responses.some(result => result.Status !== 0)) return false;
  const addresses = responses.flatMap(result => result.Answer ?? []).filter(answer => answer.type === 1 || answer.type === 28);
  return addresses.length > 0 && addresses.every(answer => publicAddress(answer.data));
}

export async function fetchSourceTitle(value: string, blockedHosts: string[] = [], attempt = 0): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  let title: string | null = null;
  try {
    let url = titleUrl(value);
    for (let redirects = 0; url && redirects <= 3; redirects++) {
      if (blockedHosts.includes(url.hostname)) break;
      if (!await publicHost(url.hostname, controller.signal, attempt === 1 ? 'dns.google' : 'cloudflare-dns.com')) break;
      const response = await fetch(url.href, {
        redirect: 'manual', signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml',
          'User-Agent': attempt ? 'Mozilla/5.0 (compatible; SuiseiCloset/1.0)' : 'SuiseiCloset-SourceTitle/1.0',
          ...(attempt ? { 'Cache-Control': 'no-cache' } : {}) }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('Location');
        await response.body?.cancel();
        url = location ? titleUrl(new URL(location, url).href) : null;
        continue;
      }
      if (!response.ok || !/^text\/html\b|^application\/xhtml\+xml\b/i.test(response.headers.get('Content-Type') ?? '')) {
        await response.body?.cancel(); break;
      }
      const reader = response.body?.getReader();
      if (!reader) break;
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (size < 131072) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          const part = chunk.subarray(0, 131072 - size);
          chunks.push(part); size += part.length;
          // 通常のページはheadだけで読み取りを終える。
          if (new TextDecoder().decode(part).toLowerCase().includes('</head>')) break;
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      title = await extractSourceTitle(bytes, response.headers.get('Content-Type')!);
      break;
    }
  } catch { /* メタデータ失敗で資料閲覧を妨げない。 */ }
  finally { clearTimeout(timeout); }
  return title;
}

/** YouTubeは動画のOwner、Xは公式oEmbedから参照元の名前とURLを取得。 */
export async function fetchSourceAuthor(value: string): Promise<{ title: string | null; authorUrl: string | null } | null> {
  const media = sourceMedia(value);
  if (media.kind === 'external') return null;
  if (media.kind === 'youtube') return fetchYoutubeOwner(media.id);
  const canonical = `https://twitter.com/i/status/${media.id}`;
  const endpoints = ['https://publish.x.com/oembed', 'https://publish.twitter.com/oembed'];
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const url = new URL(endpoint);
      url.searchParams.set('url', canonical); url.searchParams.set('format', 'json');
      if (media.kind === 'x') { url.searchParams.set('omit_script', 'true'); url.searchParams.set('dnt', 'true'); }
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: {Accept: 'application/json'} });
      if (!response.ok) { await response.body?.cancel(); continue; }
      const data = await response.json() as {author_name?: unknown; author_url?: unknown};
      if (typeof data.author_name === 'string') {
        const author = data.author_name.replace(/\s+/g, ' ').trim().slice(0, 300);
        if (author) return { title: author, authorUrl: sourceAccountUrl(typeof data.author_url === 'string' ? data.author_url : null, media.kind) };
      }
    } catch { /* 次の公式エンドポイントへフォールバック。 */ }
    finally { clearTimeout(timeout); }
  }
  return null;
}

async function reliableTitle(url: string, blockedHosts: string[]): Promise<{ title: string | null; authorUrl: string | null }> {
  if (sourceMedia(url).kind !== 'external') return await fetchSourceAuthor(url) ?? { title: null, authorUrl: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const title = await fetchSourceTitle(url, blockedHosts, attempt);
    if (title) return { title, authorUrl: null };
  }
  return { title: null, authorUrl: null };
}
/** 登録済みの資料だけを対象にする。非公開衣装は権限確認済みの管理APIからだけ取得可能。 */
export async function sourceTitle(ctx: Context, costumeId: string, sourceId: number, admin = false): Promise<Response> {
  const source = await ctx.env.DB.prepare(`SELECT s.source_url FROM costume_source s JOIN costume c ON c.id=s.costume_id
    WHERE s.id=? AND s.costume_id=? ${admin ? '' : 'AND c.is_published=1'}`).bind(sourceId, costumeId).first<{ source_url: string }>();
  if (!source) return fail('資料が見つかりません', 404);
  return json(await reliableTitle(source.source_url,
    [new URL(ctx.request.url).hostname, new URL(ctx.env.APP_ORIGIN).hostname]));
}
