import { extractColorPalette, PALETTE_CONFIG } from './color-palette';

/** Only called by an explicit admin save/regenerate action; no proxy or credentials. */
export async function analyzeThumbnail(url: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PALETTE_CONFIG.timeoutMs);
  let bitmap: ImageBitmap | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const source = new URL(url);
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('画像URLが不正です');
    const response = await fetch(source, { mode: 'cors', credentials: 'omit', redirect: 'error', signal: controller.signal });
    if (!response.ok || !/^image\/(png|jpeg|webp)$/.test(response.headers.get('Content-Type')?.split(';')[0] || '')) throw new Error('対応するPNG・JPEG・WebP画像を取得できません');
    if (Number(response.headers.get('Content-Length')) > PALETTE_CONFIG.maxBytes || !response.body) throw new Error('画像サイズが上限を超えています');
    reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PALETTE_CONFIG.maxBytes) throw new Error('画像サイズが上限を超えています');
      chunks.push(new Uint8Array(value));
    }
    bitmap = await createImageBitmap(new Blob(chunks));
    if (controller.signal.aborted) throw new Error('画像解析がタイムアウトしました');
    if (bitmap.width * bitmap.height > PALETTE_CONFIG.maxPixels) throw new Error('画像の解像度が上限を超えています');
    const scale = Math.min(1, PALETTE_CONFIG.analysisSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('画像解析を利用できません');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const palette = extractColorPalette(context.getImageData(0, 0, canvas.width, canvas.height).data);
    if (!palette) throw new Error('解析対象の色がありません');
    return palette;
  } finally {
    window.clearTimeout(timer); controller.abort(); bitmap?.close();
    await reader?.cancel().catch(() => {});
  }
}
