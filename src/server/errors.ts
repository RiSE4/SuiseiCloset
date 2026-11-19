import { fail } from './http';

type Operation = 'api' | 'users' | 'costumes' | 'auth.callback' | 'auth.login' | 'auth.logout' | 'auth.dev';

/**
 * 予期しないエラーを安全に記録し、500エラーを返却
 * @param error - キャッチされた不明なエラーオブジェクト
 * @param operation - 失敗した処理を表す識別子
 * @returns HTTP 500
 */
export function unexpectedResponse(error: unknown, operation: Operation): Response {
  reportUnexpected(error, operation);
  return fail('処理に失敗しました', 500);
}

/**
 * 機密情報を含む可能性があるエラーメッセージ・スタックトレース・生オブジェクトを
 * ログに出力しないようにするため、エラーの種別（type）と原因カテゴリ（kind）だけを抽出
 * @param error - 分類対象のエラー
 * @param operation - 発生元の処理名
 */export function reportUnexpected(error: unknown, operation: Operation): void {
  let kind = 'unexpected';
  let type = 'unknown';

  if (error instanceof Error) {
    type = error instanceof SyntaxError ? 'SyntaxError' : error instanceof TypeError ? 'TypeError' : 'Error';
    // 分類判定のみを行い、message や cause 自体はログへ流さない。
    let cause: unknown = error;

    for (let depth = 0; cause instanceof Error && depth < 4; depth++, cause = cause.cause) {
      if (/constraint|SQLITE_CONSTRAINT/i.test(cause.message)) { kind = 'database_constraint'; break; }
      if (/D1|SQLITE|database|\bDB\b/i.test(cause.message)) { kind = 'database'; break; }
      if (/retry limit/i.test(cause.message)) { kind = 'contention'; break; }
      if (cause instanceof SyntaxError) { kind = 'invalid_json'; break; }
      if (/fetch|network|ECONN|timeout/i.test(cause.message)) { kind = 'network'; break; }
    }
  }
  console.error('Unexpected server error', { operation, type, kind });
}
