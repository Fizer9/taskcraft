// Фокус не должен проваливаться в начало страницы, когда кнопка, на которой он стоял, исчезла:
// «Готово» сменилось карточкой «Сделано!», лист закрылся, а открывшей его кнопки уже нет.
// С клавиатурой и с экранным диктором иначе приходится искать своё место заново.

/** Где стоял фокус: сам элемент и его предки снизу вверх, пока он был на странице. */
export interface FocusSpot {
  el: HTMLElement;
  up: HTMLElement[];
}

export function spotOf(el: Element | null): FocusSpot | null {
  if (!(el instanceof HTMLElement) || el === document.body) return null;
  const up: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) up.push(p);
  return { el, up };
}

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)';

const usable = (el: HTMLElement) => el.isConnected && !el.closest('[inert]') && !(el as HTMLButtonElement).disabled;

/** Элемента с фокусом больше нет на странице или им нельзя пользоваться. */
export function isLost(spot: FocusSpot): boolean {
  return !usable(spot.el);
}

/** Вернуть фокус: на сам элемент, а если его уже нет, на заголовок или первую кнопку ближайшего уцелевшего блока вокруг. */
export function restoreFocus(spot: FocusSpot): void {
  if (usable(spot.el)) return spot.el.focus();
  const pick = (box: HTMLElement, sel: string) => [...box.querySelectorAll<HTMLElement>(sel)].find(usable);
  for (const box of spot.up) {
    if (!usable(box)) continue;
    const head = pick(box, 'h1, h2, h3');
    if (head) {
      head.tabIndex = -1;
      head.focus({ preventScroll: true });
      return;
    }
    const first = pick(box, FOCUSABLE);
    if (first) return first.focus({ preventScroll: true });
  }
}
