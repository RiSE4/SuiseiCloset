import { validateColorPalette } from '../../features/costumes/color-palette';
import { fail, json, readJson } from '../http';
import type { Context, User } from '../types';
import { InputError } from './validation';

export async function savePalette(ctx: Context, user: User, id: string) {
  const body = await readJson(ctx);
  if (!body || Object.keys(body).some(key => !['thumbnailUrl', 'revision', 'palette'].includes(key)) || typeof body.thumbnailUrl !== 'string' || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) throw new InputError('パレットの入力が不正です');
  let palette;
  try { palette = validateColorPalette(body.palette); } catch { throw new InputError('カラーパレットが不正です'); }
  const results = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`UPDATE costume SET color_palette = ?
      WHERE id = ? AND thumbnail_url = ? AND palette_revision = ? RETURNING id`)
      .bind(palette ? JSON.stringify(palette) : null, id, body.thumbnailUrl, body.revision),
    ctx.env.DB.prepare(`INSERT INTO audit_log(actor_discord_id, action, target_id)
      SELECT ?, 'costume.palette', ? WHERE changes() = 1`).bind(user.discord_id, id),
  ]);
  if (!results[0].results.length) return fail('サムネイルが変更または削除されました。再読み込みしてください', 409);
  return json({ colorPalette: palette });
}
