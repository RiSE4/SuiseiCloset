/**
 * 年月日順の入力を補完
 */
export function normalizeDebutDate(value: string): string {
  const input = value.normalize('NFKC').trim();
  // 数字3組の間は区切りが混在してもよい。日付以外の数字や末尾の文章は取り込まない。
  const separatedDate = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\s*日?$/.exec(input);
  // 年の後の区切りは任意。2026年0201も月日を2桁ずつに分けられる。
  const compactDate = /^(\d{4})\D*(\d{2})(\d{2})\s*日?$/.exec(input);
  const parts = (separatedDate || compactDate)?.slice(1);
  return parts ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}` : value;
}

/** 
 * 衣装の日付をYYYY-MM-DD形式の実在する日付に限定
 */
export function isValidDebutDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2018 || year > 2100 || month < 1 || month > 12) return false;

  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}
