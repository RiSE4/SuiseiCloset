import type { CostumeSummaryDto } from './costume-model';
import { safeExternalUrl, sourceAccountUrl, sourceMedia } from './media';

/** 空欄の項目はそれぞれ先頭資料の値で補完 */
export function thumbnailAttribution(costume: Pick<CostumeSummaryDto, 'thumbnailSourceTitle' | 'thumbnailSourceUrl' | 'primarySource'>) {
  const source = costume.primarySource;
  const fallbackUrl = sourceAccountUrl(source?.attribution?.authorUrl, sourceMedia(source?.sourceUrl).kind)
    ?? safeExternalUrl(source?.sourceUrl);
  return {
    title: costume.thumbnailSourceTitle?.trim() || source?.attribution?.title || fallbackUrl || '',
    url: safeExternalUrl(costume.thumbnailSourceUrl?.trim()) ?? fallbackUrl,
  };
}
