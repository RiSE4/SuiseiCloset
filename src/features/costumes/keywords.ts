/**
 * 文字列を正規化NFKC正規化
 * @param value 対象の文字列
 * @returns 正規化された文字列
 */
export function normalizeKeyword(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, char =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/\s+/gu, '');
}

/**
 * 入力値が有効化判定（空文字を含まないか、正規化後に重複がないか）
 * @param value 検証対象の値
 * @returns 受け取った配列をそのまま返す
 * @throws 配列・要素の形式が不正、または重複がある場合にthrow
 */
export function validateKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new TypeError('キーワードは空でない文字列の配列にしてください');
  }
  const seen = new Set<string>();

  for (const item of value) {
    const key = normalizeKeyword(item);
    if (!key || seen.has(key)) {
      throw new TypeError('キーワードが重複しているか空です');
    }
    seen.add(key);
  }
  return value;
}

/**
 * 保存済みのキーワードJSONをパースし、キーワードの配列として検証
 * @param json 保存済みのJSON
 * @returns 検証済みのキーワード配列
 * @throws {SyntaxError} JSONのパースに失敗した場合
 * @throws {TypeError} キーワードの形式が不正、または重複の場合
 */
export function parseKeywordsJson(json: string): string[] {
  return validateKeywords(JSON.parse(json));
}

/**
 * 衣装名とキーワード群を正規化し、空白区切りで検索用文字列を生成
 * @param name 衣装名
 * @param keywords キーワード
 * @returns {TypeError} キーワードの形式が不正、または重複の場合
 */
export function makeSearchText(name: string, keywords: unknown): string {
  return [name, ...validateKeywords(keywords)].map(normalizeKeyword).filter(Boolean).join(' ');
}
