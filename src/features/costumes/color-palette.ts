import { deltaE, hexToRgb, mergeSimilarColors, rgbToHex, rgbToLab } from '../../lib/color';
import type { Lab } from '../../lib/color';

export const PALETTE_CONFIG = Object.freeze({
  minColors: 1, maxColors: 10, deltaEThreshold: 7, analysisSize: 128,
  quantizationBits: 3, minAlpha: 16, ratioTolerance: 0.000001,
  maxBytes: 8 * 1024 * 1024, maxPixels: 16_000_000, timeoutMs: 10_000,
});
export interface PaletteColor { hex: string; ratio: number }
export type ColorPalette = PaletteColor[];

/** Shared with the server. Never render unvalidated colors. */
export function validateColorPalette(value: unknown): ColorPalette | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length < PALETTE_CONFIG.minColors || value.length > PALETTE_CONFIG.maxColors) throw new Error('色数が不正です');
  const colors = value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('色が不正です');
    const { hex, ratio } = item as Record<string, unknown>;
    if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex) || typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new Error('色または割合が不正です');
    return { hex: hex.toUpperCase(), ratio };
  });
  if (Math.abs(colors.reduce((sum, color) => sum + color.ratio, 0) - 1) > PALETTE_CONFIG.ratioTolerance) throw new Error('割合の合計が不正です');
  return colors.sort((a, b) => b.ratio - a.ratio || a.hex.localeCompare(b.hex));
}
export function parseColorPalette(value: string | null | undefined): ColorPalette | null {
  try { return validateColorPalette(value ? JSON.parse(value) : null); } catch { return null; }
}

type Group = { r: number; g: number; b: number; count: number; lab: Lab };
const mean = (g: Group) => ({ r: g.r / g.count, g: g.g / g.count, b: g.b / g.count });
function combine(a: Group, b: Group) {
  a.r += b.r; a.g += b.g; a.b += b.b; a.count += b.count;
  a.lab = rgbToLab(mean(a));
}

/** Bounded histogram, fixed seed order, frequency-weighted RGB centroids. */
export function extractColorPalette(pixels: Uint8ClampedArray): ColorPalette | null {
  if (pixels.length % 4 || pixels.length > PALETTE_CONFIG.analysisSize ** 2 * 4) throw new Error('解析サイズが不正です');
  const histogram = new Map<number, Group>();
  const shift = 8 - PALETTE_CONFIG.quantizationBits;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < PALETTE_CONFIG.minAlpha) continue;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    const key = ((r >> shift) << (2 * PALETTE_CONFIG.quantizationBits)) | ((g >> shift) << PALETTE_CONFIG.quantizationBits) | (b >> shift);
    const group = histogram.get(key);
    if (group) { group.r += r; group.g += g; group.b += b; group.count++; }
    else histogram.set(key, { r, g, b, count: 1, lab: rgbToLab({ r, g, b }) });
  }
  const candidates = [...histogram.entries()].sort((a, b) => b[1].count - a[1].count || a[0] - b[0]).map(([, g]) => {
    g.lab = rgbToLab(mean(g)); return g;
  });
  if (!candidates.length) return null;
  const seeds = mergeSimilarColors(candidates.map(g => rgbToHex(mean(g))), PALETTE_CONFIG.deltaEThreshold);
  const seedLabs = seeds.map(hex => rgbToLab(hexToRgb(hex)));
  const groups: Group[] = seeds.map((_, i) => ({ r: 0, g: 0, b: 0, count: 0, lab: seedLabs[i] }));
  for (const candidate of candidates) {
    let nearest = 0, distance = Infinity;
    seedLabs.forEach((lab, i) => { const d = deltaE(candidate.lab, lab); if (d < distance) { nearest = i; distance = d; } });
    combine(groups[nearest], candidate);
  }
  const active = groups.filter(g => g.count);
  // Each merge reuses cached Lab coordinates. At most 512 histogram entries.
  while (active.length > 1) {
    let x = 0, y = 1, distance = Infinity;
    for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
      const d = deltaE(active[i].lab, active[j].lab);
      if (d < distance) { x = i; y = j; distance = d; }
    }
    if (active.length <= PALETTE_CONFIG.maxColors && distance >= PALETTE_CONFIG.deltaEThreshold) break;
    combine(active[x], active[y]); active.splice(y, 1);
  }
  const total = active.reduce((sum, g) => sum + g.count, 0);
  return validateColorPalette(active.map(g => ({ hex: rgbToHex(mean(g)), ratio: g.count / total })));
}
