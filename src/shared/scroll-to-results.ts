/** 結果の再描画後、ブラウザー標準の滑らかなスクロールを開始する。 */
export function scrollToResults(element: HTMLElement | null) {
  if (!element) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
