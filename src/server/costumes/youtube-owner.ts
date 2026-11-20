import { sourceAccountUrl } from '../../features/costumes/media';

/** oEmbedの投稿者情報だけを使用し、動画・チャンネルのHTMLは取得しない。 */
export async function fetchYoutubeOwner(videoId: string, fetcher: typeof fetch = fetch): Promise<{ title: string; authorUrl: string | null } | null> {
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = new URL('https://www.youtube.com/oembed');
    url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
    url.searchParams.set('format', 'json');
    const response = await fetcher(url, {
      signal: controller.signal, redirect: 'manual', headers: { Accept: 'application/json' }
    });
    if (!response.ok || !/^application\/json\b/i.test(response.headers.get('Content-Type') ?? '')) {
      await response.body?.cancel(); return null;
    }
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('author_name' in data) || typeof data.author_name !== 'string') return null;
    const title = data.author_name.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!title) return null;
    // author_urlの最新ハンドルへの補正や、チャンネルHTMLによる照合は行わない。
    const authorUrl = sourceAccountUrl('author_url' in data && typeof data.author_url === 'string' ? data.author_url : null, 'youtube');
    return { title, authorUrl };
  } catch { return null; }
  finally { clearTimeout(timeout); }
}
