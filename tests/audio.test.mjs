import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Fake WebAudio that records every scheduled frequency and rejects non-finite values like the browser does.
const frequencies = [];
const param = record => ({
  setValueAtTime(v) { if (!Number.isFinite(v)) throw new TypeError('non-finite'); if (record) frequencies.push(v); },
  exponentialRampToValueAtTime(v) { if (!Number.isFinite(v)) throw new TypeError('non-finite'); },
});
const node = () => ({ connect: n => n || node() });
const ctx = {
  currentTime: 0,
  createOscillator: () => ({ ...node(), frequency: param(true), start() {}, stop() {} }),
  createGain: () => ({ ...node(), gain: param(false) }),
};
const GameState = { base: 2, meta: { settings: {} } };
const context = vm.createContext({ GameState, console });
for (const file of ['constants', 'board', 'audio'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context, { filename: file });
const Audio2 = vm.runInContext('Audio2', context);
Audio2._context = ctx; Audio2._effects = node();

const pitch = (val, base) => { GameState.base = base; frequencies.length = 0; Audio2.merges([{ val }]); return frequencies[0]; };

test('merge sounds stay finite and match by rank on the Trinity 3, 6, 12... series', () => {
  for (let val = 6; val <= 6144; val *= 2) {
    const trinity = pitch(val, 3);
    assert.ok(Number.isFinite(trinity), `Trinity ${val}`);
    assert.equal(trinity, pitch(val / 3 * 2, 2), `${val} sounds like ${val / 3 * 2}`);
  }
});

test('base 2 merge pitches are unchanged', () => {
  assert.equal(pitch(4, 2), 261.63 * 2 ** (2 / 12));
  assert.equal(pitch(2048, 2), 261.63 * 2 ** (24 / 12));
});
