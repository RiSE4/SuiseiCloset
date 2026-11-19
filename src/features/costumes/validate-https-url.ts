/**
 * HTTPS URLを検証（ホストがあること、認証情報を含まないこと）
 * @param value 検証する値
 * @returns 検証されたHTTPS URL
 * @throws 文字列でない、URLとして解析できない、または許可条件を満たさない場合のTypeError
 */
export function validateHttpsUrl(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('HTTPS URLを指定してください');
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TypeError('URLの形式が不正です');
  }

  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
    throw new TypeError('HTTPS URLを指定してください');
  }

  return value;
}
