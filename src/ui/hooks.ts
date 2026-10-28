import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../game/store';

/** Перерисовать компонент при любом изменении хранилища. */
export function useStore(store: Store): void {
  const [, setN] = useState(0);
  useEffect(() => store.subscribe(() => setN((n) => n + 1)), [store]);
}

/** Размер элемента; обновляется при изменении окна и содержимого. */
export function useSize<T extends HTMLElement>(): [preact.RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
