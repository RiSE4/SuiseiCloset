import type { Env } from '../../src/server/types';

/** _headersが適用されないOAuthのリダイレクト・エラーを含む全応答に設定 */
export const onRequest: PagesFunction<Env> = async ctx => {
  const response = await ctx.next();
  response.headers.set('X-Robots-Tag', 'noindex');
  response.headers.set('Cache-Control', 'no-store');
  return response;
};
