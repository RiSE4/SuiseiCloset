/** 
 * API通信共通の例外
 * @param message - エラーメッセージ
 * @param status - HTTPステータスコード 通信が失敗した場合は0
 * @param kind - エラーの種類 通信が失敗した場合は'network'
*/
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind: 'auth' | 'forbidden' | 'not-found' | 'conflict' | 'input' | 'network' | 'server') {
    super(message);
  }
}

/**
 * 同一オリジンのCookieを付けてAPIを呼び出し、JSONレスポンスを返す
 * GET以外はJSON送信用のヘッダーを付け、bodyが指定された場合だけJSON化する
 * 通信中断は元の例外、JSONの解析失敗は解析時の例外をそのまま返す
 * 
 * @param path - 呼び出すAPIのパス
 * @param signal - 画面遷移や検索条件変更時に通信を中断するためのシグナル
 * @param method - HTTPメソッド（省略時はGET）
 * @param body - JSONとして送るデータ（省略時はリクエスト本文を送らない）
 * @returns JSONを型Tとして扱うPromise、実行時のデータ構造の検証は行わない
 * @throws 通信失敗、HTTPエラー、JSON以外の応答ではApiError
 */
export async function requestJson<T>(path: string, signal?: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method, credentials: 'same-origin', signal,
      headers: method === 'GET' ? undefined : {
        'Content-Type': 'application/json', Origin: location.origin
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (error) {
    // 意図的な中断を通信障害に変換せず、呼び出し元が無視できるようにする
    if (signal?.aborted) {
      throw error;
    }
    throw new ApiError('通信できませんでした。接続を確認して再試行してください。', 0, 'network');
  }

  if (!response.ok) {
    // APIのエラーメッセージを優先し、本文が取得できない場合はステータスで補う
    const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json().catch(() => null) as { error?: string } | null : null;
    const kind = response.status === 400 ? 'input' : response.status === 401 ? 'auth' : response.status === 403 ? 'forbidden' : response.status === 404 ? 'not-found' : response.status === 409 ? 'conflict' : 'server';
    throw new ApiError(data?.error || `サーバーからエラーが返されました（${response.status}）。`, response.status, kind);
  }

  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw new ApiError('APIから予期しない応答が返されました。', response.status, 'server');
  }

  return response.json() as Promise<T>;
}
