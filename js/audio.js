'use strict';

const Audio2 = {
  _context: null,
  _master: null,
  _penta: [0,2,4,7,9,12,14,16,19,21,24],
  get enabled() { return GameState.meta.settings?.sound !== false; },
  syncSetting() {
    if (this._master) this._master.gain.value = this.enabled ? 0.8 : 0;
  },
  unlock() {
    if (!this.enabled) return;
    try {
      if (!this._context) {
        this._context = new (window.AudioContext || window.webkitAudioContext)();
        this._master = this._context.createGain();
        this._master.gain.value = 0.8;
        this._master.connect(this._context.destination);
      }
      if (this._context.state === 'suspended') this._context.resume();
      this.syncSetting();
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
    osc.connect(gain).connect(this._master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  },
  merges(merges) {
    merges.forEach((merge, i) => {
      const semitone = this._penta[Math.min(10, Math.log2(merge.val) - 1)];
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
