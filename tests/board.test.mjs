import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({
  console,
  Date,
  localStorage: { getItem: () => null, setItem: () => {} },
});
for (const file of ['i18n','rng','constants','storage','state','board','controller']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context, { filename: file });
}
const { Board, Rng, Controller } = vm.runInContext('({ Board, Rng, Controller })', context);
const plain = value => JSON.parse(JSON.stringify(value));

test('slideRow merges pairs once, without chaining', () => {
  assert.deepEqual(plain(Board.slideRow([2,2,2,2]).row), [4,4,0,0]);
  assert.deepEqual(plain(Board.slideRow([2,2,4,0]).row), [4,4,0,0]);
});

test('obstacles split segments and bombs move without merging', () => {
  assert.deepEqual(plain(Board.slideRow([2,-1,2,2]).row), [2,-1,4,0]);
  assert.deepEqual(plain(Board.slideRow([0,-2,-2,0]).row), [-2,-2,0,0]);
});

test('canMove is false for a full board with no matching neighbors', () => {
  assert.equal(Board.canMove([
    [2,4,2,4], [4,2,4,2], [2,4,2,4], [4,2,4,2],
  ]), false);
});

test('merge coordinates follow the visible board in every direction', () => {
  for (const [dir, expected] of [
    ['left', [0,0]], ['right', [0,3]], ['up', [0,0]], ['down', [3,0]],
  ]) {
    Rng.seed(7);
    const board = Board.empty();
    if (dir === 'left' || dir === 'right') { board[0][0] = 2; board[0][1] = 2; }
    else { board[0][0] = 2; board[1][0] = 2; }
    const result = Board.applyMove(board, dir);
    assert.deepEqual([result.merges[0].r, result.merges[0].c], expected);
  }
});

test('the same seed produces the same spawn positions and values', () => {
  const sequence = seed => {
    Rng.seed(seed);
    const board = Board.empty();
    const spawns = [];
    for (let i = 0; i < 12; i++) {
      const pos = Board.addRandom(board);
      spawns.push([pos[0], pos[1], board[pos[0]][pos[1]]]);
    }
    return spawns;
  };
  assert.deepEqual(sequence(12345), sequence(12345));
  assert.notDeepEqual(sequence(12345), sequence(12346));
});

test('maps are deterministic and satisfy room constraints over 200 seeds', () => {
  for (let seed = 0; seed < 200; seed++) {
    Rng.seed(seed);
    const floors = plain(Controller._generateFloors());
    Rng.seed(seed);
    assert.deepEqual(plain(Controller._generateFloors()), floors);
    for (const floor of floors) {
      assert.deepEqual(floor[0].map(n => n.type), ['normal','normal','normal']);
      assert.deepEqual(floor[4].map(n => n.type), ['rest','rest','rest']);
      assert.ok(floor[1].every(n => n.type !== 'elite'));
      for (let row = 1; row < 5; row++) {
        floor[row - 1].forEach(parent => {
          if (!['elite','rest'].includes(parent.type)) return;
          for (const col of parent.connections)
            assert.notEqual(floor[row][col].type, parent.type, `seed ${seed}: ${parent.type} twice in a row`);
        });
      }
    }
  }
});
