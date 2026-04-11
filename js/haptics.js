/* web-haptics v0.2.0 — vendored for vanilla JS (no bundler)
 * Source: https://github.com/lochie/web-haptics  — MIT License
 *
 * iOS: hidden <input type="checkbox" switch> toggled via label.click()
 *      triggers native Taptic Engine feedback.
 * Android: navigator.vibrate() patterns.
 *
 * Exposes global `Haptics` singleton.
 */

const Haptics = (() => {
  'use strict';

  /* ── Preset patterns ── */
  const PRESETS = {
    success: { pattern: [{ duration: 30, intensity: 0.5 }, { delay: 60, duration: 40, intensity: 1 }] },
    nudge:   { pattern: [{ duration: 80, intensity: 0.8 }, { delay: 80, duration: 50, intensity: 0.3 }] },
    buzz:    { pattern: [{ duration: 1000, intensity: 1 }] },
    error:   { pattern: [{ duration: 40, intensity: 0.7 }, { delay: 40, duration: 40, intensity: 0.7 }, { delay: 40, duration: 40, intensity: 0.9 }, { delay: 40, duration: 50, intensity: 0.6 }] },
  };

  const PWM_CYCLE = 20;

  const canVibrate = typeof navigator !== 'undefined'
    && typeof navigator.vibrate === 'function';

  /* ── Convert preset vibrations → flat navigator.vibrate() array ── */
  function toVibrateArray(vibrations) {
    const result = [];
    for (const vib of vibrations) {
      const delay = vib.delay || 0;
      if (delay > 0) {
        if (result.length > 0 && result.length % 2 === 0) {
          result[result.length - 1] += delay;
        } else {
          if (result.length === 0) result.push(0);
          result.push(delay);
        }
      }
      const intensity = Math.max(0, Math.min(1, vib.intensity ?? 0.5));
      if (intensity >= 1) {
        result.push(vib.duration);
      } else if (intensity > 0) {
        const onTime = Math.max(1, Math.round(PWM_CYCLE * intensity));
        const offTime = PWM_CYCLE - onTime;
        let remaining = vib.duration;
        while (remaining >= PWM_CYCLE) {
          result.push(onTime);
          result.push(offTime);
          remaining -= PWM_CYCLE;
        }
        if (remaining > 0) {
          result.push(Math.max(1, Math.round(remaining * intensity)));
          const remOff = remaining - Math.max(1, Math.round(remaining * intensity));
          if (remOff > 0) result.push(remOff);
        }
      }
    }
    return result;
  }

  /* ── iOS fallback: hidden <input switch> checkbox ── */
  let _label = null;
  let _domReady = false;
  let _rafId = null;
  let _resolve = null;

  const TOGGLE_MIN = 16;
  const TOGGLE_MAX = 184;

  function _ensureDOM() {
    if (_domReady) return;
    if (typeof document === 'undefined') return;

    const id = 'web-haptics-1';
    _label = document.createElement('label');
    _label.setAttribute('for', id);
    _label.textContent = 'Haptic feedback';
    _label.style.position = 'fixed';
    _label.style.top = '-9999px';
    _label.style.left = '-9999px';
    _label.style.opacity = '0';
    _label.style.pointerEvents = 'none';
    _label.style.zIndex = '-1';
    _label.style.userSelect = 'none';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.setAttribute('switch', '');
    cb.id = id;
    cb.style.all = 'initial';
    cb.style.appearance = 'auto';
    cb.style.position = 'fixed';
    cb.style.top = '-9999px';
    cb.style.opacity = '0';

    _label.appendChild(cb);
    document.body.appendChild(_label);
    _domReady = true;
  }

  function _stopPattern() {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_resolve) { _resolve(); _resolve = null; }
  }

  /** Replay the pattern via label.click() — mirrors web-haptics runPattern */
  function _runIOSPattern(vibrations) {
    _ensureDOM();
    if (!_label) return;
    _stopPattern();

    // First click synchronously (user gesture context)
    const firstDelay = vibrations[0]?.delay ?? 0;
    if (firstDelay === 0) _label.click();

    // Build phase timeline
    const phases = [];
    let cumulative = 0;
    for (const vib of vibrations) {
      const delay = vib.delay ?? 0;
      const intensity = Math.max(0, Math.min(1, vib.intensity ?? 0.5));
      if (delay > 0) { cumulative += delay; phases.push({ end: cumulative, isOn: false, intensity: 0 }); }
      cumulative += vib.duration;
      phases.push({ end: cumulative, isOn: true, intensity });
    }
    const totalDuration = cumulative;

    let startTime = 0;
    let lastToggleTime = -1;
    let firstClickFired = firstDelay === 0;

    _resolve = null;
    return new Promise(resolve => {
      _resolve = resolve;
      const loop = (time) => {
        if (startTime === 0) startTime = time;
        const elapsed = time - startTime;
        if (elapsed >= totalDuration) { _rafId = null; _resolve = null; resolve(); return; }

        let phase = phases[0];
        for (const p of phases) { if (elapsed < p.end) { phase = p; break; } }

        if (phase.isOn) {
          const toggleInterval = TOGGLE_MIN + (1 - phase.intensity) * TOGGLE_MAX;
          if (lastToggleTime === -1) {
            lastToggleTime = time;
            if (!firstClickFired) { _label.click(); firstClickFired = true; }
          } else if (time - lastToggleTime >= toggleInterval) {
            _label.click();
            lastToggleTime = time;
          }
        }
        _rafId = requestAnimationFrame(loop);
      };
      _rafId = requestAnimationFrame(loop);
    });
  }

  /* ── Public API ── */

  function trigger(input) {
    if (typeof input === 'string') {
      const preset = PRESETS[input];
      if (!preset) { console.warn('[haptics] Unknown preset:', input); return; }
      if (canVibrate) {
        navigator.vibrate(toVibrateArray(preset.pattern));
      } else {
        _runIOSPattern(preset.pattern);
      }
      return;
    }
    if (typeof input === 'number') {
      if (canVibrate) navigator.vibrate(input);
      else _runIOSPattern([{ duration: input, intensity: 1 }]);
    }
  }

  function cancel() {
    _stopPattern();
    if (canVibrate) navigator.vibrate(0);
  }

  return { trigger, cancel };
})();
