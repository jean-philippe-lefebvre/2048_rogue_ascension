'use strict';

// All game decisions share one reproducible stream.
const Rng = {
  _seed: 0,
  _state: 0,
  seed(n) { this._seed = n >>> 0; this._state = this._seed; return this._seed; },
  getSeed() { return this._seed; },
  next() {
    this._state = (this._state + 0x6D2B79F5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },
  int(n) { return Math.floor(this.next() * n); },
  pick(arr) { return arr[this.int(arr.length)]; },
};

Rng.seed(Date.now());
