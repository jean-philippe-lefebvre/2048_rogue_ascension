/* web-haptics v0.2.0 — vendored minimal build for vanilla JS
 * Source: https://github.com/lochie/web-haptics
 * License: MIT
 *
 * Only keeps navigator.vibrate() path (no DOM debug UI, no audio).
 * Exposes global `Haptics` singleton.
 */

const Haptics = (() => {
  'use strict';

  const PATTERNS = {
    success: [30, 60, 40],          // ascending double-tap
    buzz:    [1000],                 // long vibration
    error:   [40, 40, 40, 40, 40, 40, 50],
  };

  const isSupported = typeof navigator !== 'undefined'
    && typeof navigator.vibrate === 'function';

  /**
   * Trigger a haptic pattern.
   * @param {string|number|number[]} input — preset name, duration (ms), or vibrate() pattern
   */
  function trigger(input) {
    if (!isSupported) return;
    if (typeof input === 'string') {
      const p = PATTERNS[input];
      if (!p) { console.warn('[haptics] Unknown preset:', input); return; }
      navigator.vibrate(p);
    } else if (typeof input === 'number') {
      navigator.vibrate(input);
    } else if (Array.isArray(input)) {
      navigator.vibrate(input);
    }
  }

  function cancel() {
    if (isSupported) navigator.vibrate(0);
  }

  return { isSupported, trigger, cancel };
})();
