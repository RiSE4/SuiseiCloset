import type { ObjectDirective } from 'vue';

/** DOM順を維持し、列を順番に割り当てて各列の縦の空白だけを詰める。 */
const cleanup = new WeakMap<HTMLElement, () => void>();
const refresh = new WeakMap<HTMLElement, () => void>();
export const vPackedGrid: ObjectDirective<HTMLElement> = {
  mounted(grid) {
    let frame = 0;
    let disposed = false;
    const observed = new Set<HTMLElement>();
    const layout = () => {
      frame = 0;
      if (disposed || !grid.isConnected) return;
      const cards = Array.from(grid.children).filter((el): el is HTMLElement => el instanceof HTMLElement);
      const style = getComputedStyle(grid);
      // computed列数には幅変更前のgridColumnが作った暗黙列も含まれるため、CSSの指定値を使う。
      const columns = Math.max(1, parseInt(style.getPropertyValue('--packed-columns'), 10) || 1);
      const gap = parseFloat(style.columnGap) || 16;
      const starts = Array(columns).fill(1) as number[];
      cards.forEach((card, index) => { card.style.gridColumn = String(index % columns + 1); });
      cards.forEach((card, index) => {
        const column = index % columns;
        const span = Math.ceil(card.getBoundingClientRect().height + gap);
        card.style.gridRow = `${starts[column]} / span ${Math.max(1, span)}`;
        starts[column] += Math.max(1, span);
      });
    };
    const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(layout); };
    const observer = new ResizeObserver(schedule);
    const sync = () => {
      for (const card of observed) if (card.parentElement !== grid) { observer.unobserve(card); observed.delete(card); }
      for (const child of Array.from(grid.children)) if (child instanceof HTMLElement && !observed.has(child)) {
        observed.add(child); observer.observe(child);
      }
      schedule();
    };
    observer.observe(grid);
    const mutations = new MutationObserver(sync);
    mutations.observe(grid, { childList: true });
    refresh.set(grid, () => { sync(); cancelAnimationFrame(frame); layout(); });
    cleanup.set(grid, () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); mutations.disconnect(); });
    sync();
  },
  updated(grid) { refresh.get(grid)?.(); },
  unmounted(grid) { cleanup.get(grid)?.(); cleanup.delete(grid); refresh.delete(grid); }
};
