/* web-haptics v0.2.0 — vendored minimal build for vanilla JS
 * Source: https://github.com/lochie/web-haptics
 * License: MIT
 *
 * Two paths: navigator.vibrate() on Android,
 * hidden <input switch> click trick for iOS Taptic Engine.
 * Exposes global `Haptics` singleton.
 */

const Haptics = (() => {
  'use strict';

  /* ── Patterns (vibrate-style: on/off/on ms) ── */
  const PATTERNS = {
    success: [30, 60, 40],
    buzz:    [1000],
    error:   [40, 40, 40, 40, 40, 40, 50],
  };

  const canVibrate = typeof navigator !== 'undefined'
    && typeof navigator.vibrate === 'function';

  /* ── iOS fallback: hidden <input type="checkbox" switch> ── */
  let iosLabel = null;

  function ensureIOSdom() {
    if (iosLabel) return;
    iosLabel = document.createElement('label');
    iosLabel.style.position = 'fixed';
    iosLabel.style.top = '-9999px';
    iosLabel.style.left = '-9999px';
    iosLabel.style.opacity = '0';
    iosLabel.style.pointerEvents = 'none';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.setAttribute('switch', '');
    cb.style.all = 'initial';
    cb.style.appearance = 'auto';
    cb.style.position = 'fixed';
    cb.style.top = '-9999px';

    iosLabel.appendChild(cb);
    document.body.appendChild(iosLabel);
  }

  /** Click the hidden switch N times with delays to simulate a pattern. */
  function iosTap(count, interval) {
    ensureIOSdom();
    iosLabel.click();
    if (count <= 1) return;
    let i = 1;
    const id = setInterval(() => {
      iosLabel.click();
      if (++i >= count) clearInterval(id);
    }, interval);
  }

  /* ── Public API ── */

  function trigger(input) {
    if (typeof input === 'string') {
      const p = PATTERNS[input];
      if (!p) { console.warn('[haptics] Unknown preset:', input); return; }

      if (canVibrate) {
        navigator.vibrate(p);
        return;
      }
      // iOS fallback — approximate the pattern
      if (input === 'success') iosTap(2, 90);
      else if (input === 'buzz')  iosTap(6, 80);
      else if (input === 'error') iosTap(4, 60);
      else iosTap(1, 0);
      return;
    }

    if (canVibrate) {
      navigator.vibrate(typeof input === 'number' ? input : input);
    } else {
      iosTap(1, 0);
    }
  }

  function cancel() {
    if (canVibrate) navigator.vibrate(0);
  }

  return { trigger, cancel };
})();
