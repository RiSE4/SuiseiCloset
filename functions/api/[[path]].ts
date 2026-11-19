import { api } from '../../src/server/api';
import type { Context, Env } from '../../src/server/types';

/**
 * '/api'ルート
 */
export const onRequest: PagesFunction<Env> = raw => api(raw as Context);
