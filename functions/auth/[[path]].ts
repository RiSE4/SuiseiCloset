import { authApi } from '../../src/server/auth/handler';
import type { Context, Env } from '../../src/server/types';

/**
 * '/auth'ルート
 */
export const onRequest: PagesFunction<Env> = raw => authApi(raw as Context);
