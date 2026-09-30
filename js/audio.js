'use strict';

const Audio2 = {
  _context: null,
  _master: null,
  _effects: null,
  _penta: [0,2,4,7,9,12,14,16,19,21,24],
  get enabled() { return GameState.meta.settings?.sound !== false; },
  syncSetting() {
    if (this._effects) this._effects.gain.value = this.enabled ? 1 : 0;
    if (typeof Music !== 'undefined') Music.syncSetting();
  },
  unlock() {
    if (!this.enabled && GameState.meta.settings?.music === false) return;
    try {
      if (!this._context) {
        this._context = new (window.AudioContext || window.webkitAudioContext)();
        this._master = this._context.createGain();
        this._master.gain.value = 0.8;
        this._master.connect(this._context.destination);
        this._effects = this._context.createGain();
        this._effects.connect(this._master);
      }
      if (this._context.state === 'suspended') this._context.resume();
      this.syncSetting();
      if (typeof Music !== 'undefined') Music.unlock();
    } catch { /* Audio is optional on unsupported browsers. */ }
  },
  tone(frequency, duration, type, peak, delay = 0, endFrequency = null) {
    if (!this.enabled || !this._context) return;
    const ctx = this._context;
    const at = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this._effects);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  },
  merges(merges) {
    merges.forEach((merge, i) => {
      // Rank, not log2: Trinity tiles (3, 6, 12...) are not powers of two.
      const step = Math.round(Board.rank(merge.val)) - 1;
      const semitone = this._penta[Math.max(0, Math.min(10, step))] ?? 0;
      const frequency = 261.63 * 2 ** (semitone / 12);
      const delay = i * 0.055;
      this.tone(frequency, 0.28, 'triangle', 0.13, delay);
      if (merges.length > 1) this.tone(frequency * 1.5, 0.3, 'sine', 0.06, delay);
    });
  },
  bump() { this.tone(90, 0.08, 'square', 0.04); },
  win() { [0,4,7,12].forEach((s, i) => this.tone(392 * 2 ** (s / 12), 0.35, 'triangle', 0.12, i * 0.11)); },
  fail() { this.tone(110, 0.5, 'sawtooth', 0.08, 0, 55); },
  relic() { this.tone(660, 0.28, 'sine', 0.09); this.tone(990, 0.28, 'sine', 0.09, 0.09); },
};
