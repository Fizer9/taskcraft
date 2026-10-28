// Что за устройство: от этого зависят подсказки и отчёт об ошибке.

export function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPad с iPadOS 13+ представляется Маком, но у Мака нет сенсорного экрана.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Открыто с экрана «Домой», без адресной строки. */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}
