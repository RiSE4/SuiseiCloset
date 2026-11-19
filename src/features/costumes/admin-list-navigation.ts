import { adminListReturnPath } from './list-query';

const storageKey = 'suisei-closet.admin-costumes.last-list';
let lastListPath = '/admin/costumes';

/**
 * 一覧を離れる前に、実行済みの検索条件をタブ内で保持
 */
export function rememberAdminList(path: string): void {
  lastListPath = adminListReturnPath(path);
  try {
    window.sessionStorage?.setItem(storageKey, lastListPath);
  } catch {
    //ストレージを利用できない場合は握りつぶす
  }
}

/**
 * URLの戻り先を優先し、ない場合は最後に表示した管理一覧を復元
 */
export function adminListBackPath(from: unknown): string {
  if (typeof from === 'string' && adminListReturnPath(from) === from) {
    return from;
  }

  try {
    const saved = window.sessionStorage?.getItem(storageKey);

    if (typeof saved === 'string' && adminListReturnPath(saved) === saved) {
      return saved;
    }
  } catch {
    //ストレージを利用できない場合は握りつぶす
  }
  return lastListPath;
}
