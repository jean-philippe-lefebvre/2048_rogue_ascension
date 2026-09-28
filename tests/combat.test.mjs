import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const context = vm.createContext({
  console, Date, setTimeout:() => {},
  localStorage: { getItem:key => saved.get(key) ?? null, setItem:(key,value) => saved.set(key,value), removeItem:key => saved.delete(key) },
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context, { filename:file });
const { Combat, Board, ENEMIES, Rng, TILE, Storage, GameState, Controller } =
  vm.runInContext('({ Combat, Board, ENEMIES, Rng, TILE, Storage, GameState, Controller })', context);
const enemy = id => ENEMIES.find(e => e.id === id);

test('combo damage floors total and shield absorbs first', () => {
  const fight = Combat.create(enemy('rat'));
  fight.block = 12;
  const hit = Combat.damage(fight, [{val:4},{val:8},{val:16}]);
  assert.equal(hit.raw, 42); assert.equal(hit.absorbed, 12);
  assert.equal(fight.block, 0); assert.equal(fight.hp, fight.maxHp - 30);
  Combat.damage(fight, [{val:999}]);
  assert.equal(fight.hp, 0);
});

test('seals expire and strong adjacent merges break only temporary seals', () => {
  Rng.seed(1);
  const fight = Combat.create(enemy('sentinel'));
  const board = Board.empty();
  board[0][0] = TILE.OBSTACLE; fight.seals['0,0'] = 1;
  Combat.tick(fight, board); assert.equal(board[0][0], 0);
  board[0][0] = TILE.OBSTACLE; board[0][2] = TILE.OBSTACLE;
  fight.seals['0,0'] = 6;
  assert.equal(Combat.breakHazards(fight, board, [{r:1,c:0,val:8}], {}).length, 0);
  assert.equal(Combat.breakHazards(fight, board, [{r:1,c:0,val:16}], {}).length, 1);
  assert.equal(board[0][0], 0); assert.equal(board[0][2], TILE.OBSTACLE);
});

test('bomb explosion halves adjacent numbered tiles and leaves seals intact', () => {
  const board = Board.empty(), timers = { '1,1':1 };
  const fight = Combat.create(enemy('sentinel'));
  fight.seals['2,1'] = 6;
  board[1][1] = TILE.BOMB;
  board[0][1] = 16;
  board[1][0] = 2;
  board[1][2] = 4;
  board[2][1] = TILE.OBSTACLE;
  assert.equal(Board.tickBombs(board, timers), 1);
  assert.equal(board[1][1], 0);
  assert.equal(board[0][1], 8);
  assert.equal(board[1][0], 2);
  assert.equal(board[1][2], 2);
  assert.equal(board[2][1], TILE.OBSTACLE);
  assert.equal(fight.seals['2,1'], 6);
  assert.equal(Object.keys(timers).length, 0);
});

test('a strong adjacent merge defuses a bomb without healing Smith', () => {
  const fight = Combat.create(enemy('smith'));
  fight.hp -= 50;
  const before = fight.hp, board = Board.empty(), timers = { '1,1':1 };
  board[1][1] = TILE.BOMB;
  assert.equal(Combat.breakHazards(fight, board, [{r:1,c:2,val:8}], timers).length, 0);
  const broken = Combat.breakHazards(fight, board, [{r:1,c:2,val:16}], timers);
  assert.deepEqual(JSON.parse(JSON.stringify(broken)), [{r:1,c:1,kind:'bomb'}]);
  assert.equal(board[1][1], 0);
  assert.equal(Object.keys(timers).length, 0);
  const exploded = Board.tickBombs(board, timers);
  for (let i = 0; i < exploded; i++) Combat.bombExploded(fight);
  assert.equal(exploded, 0);
  assert.equal(fight.hp, before);
});

test('a moving bomb keeps its own timer before defuse or explosion', () => {
  const board = Board.empty(), timers = { '0,2':5 };
  board[0][2] = TILE.BOMB;
  board[0][3] = 2;
  const result = Board.applyMove(board, 'left');
  Board.remapBombTimers(timers, result.bombMoves);
  assert.equal(board[0][0], TILE.BOMB);
  assert.equal(timers['0,0'], 5);
  assert.equal(Board.tickBombs(board, timers), 0);
  assert.equal(timers['0,0'], 4);
});

test('lock rejects its direction without consuming a move; invert maps and boosts damage', () => {
  const fight = Combat.create(enemy('warden'));
  fight.locked = 'left'; fight.lockTurns = 3;
  assert.equal(Combat.isLocked(fight, 'left'), true);
  const moves = 4;
  if (!Combat.isLocked(fight,'left')) throw Error('locked move accepted');
  assert.equal(moves, 4);
  fight.invertTurns = 2;
  assert.equal(Combat.direction(fight, 'left'), 'right');
  assert.equal(Combat.damage(fight,[{val:8}]).raw, 10);
  const board = Board.empty(); Combat.tick(fight, board);
  assert.equal(fight.lockTurns, 2); assert.equal(fight.invertTurns, 1);
  vm.runInContext("globalThis.Fx = { nudge:() => {} }; globalThis.Audio2 = { bump:() => {} }", context);
  GameState.run = { hearts:3, relics:[], gold:0, totalScore:0 };
  GameState.room = { combat:fight };
  GameState.board = [[2,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]];
  GameState.movesLeft = 4; GameState.roomFinished = false;
  assert.equal(Controller.move('left'), 'buzz');
  assert.equal(GameState.movesLeft, 4);
});

test('boss phase changes at 50% and heal caps at max HP', () => {
  const def = enemy('jailer'), fight = Combat.create(def);
  fight.hp = def.hp / 2 + 1; assert.equal(Combat.phase(fight, def), false);
  fight.hp = def.hp / 2; assert.equal(Combat.phase(fight, def), true);
  assert.equal(fight.phase, 2); assert.equal(fight.patternIndex, 0);
  assert.equal(fight.intentIn, 3); assert.equal(Combat.intent(fight), 'seal2');
  const healer = Combat.create(enemy('ghoul'));
  healer.hp = healer.maxHp - 1; healer.intentIn = 0; healer.patternIndex = 2;
  Combat.resolve(healer, Board.empty(), {}, 0);
  assert.equal(healer.hp, healer.maxHp);
});

test('heart loss ends run at zero, legacy saved run gets three, leftover gold floors', () => {
  const run = { hearts:3 };
  assert.equal(Combat.loseHeart(run), false);
  assert.equal(Combat.loseHeart(run), false);
  assert.equal(Combat.loseHeart(run), true);
  assert.equal(run.hearts, 0);
  assert.equal(Combat.leftoverGold(5), 2);
  saved.set(Storage.RUN_KEY, JSON.stringify({ gold:1, relics:[] }));
  assert.equal(Storage.loadRun().hearts, 3);
});

test('active battle and pending reward survive run serialization', () => {
  GameState.run = { seed:123, hearts:2, relics:[], gold:7, floors:[] };
  GameState.room = { floorIdx:0, rowIdx:0, nodeIdx:0, enemyDef:enemy('rat'),
    combat:Combat.create(enemy('rat')), relicState:{} };
  GameState.board = Board.empty(); GameState.board[0][0] = 4;
  GameState.obstacleAge = {}; GameState.bombTimers = {};
  GameState.movesLeft = 12; GameState.movesMax = 36;
  GameState.roomFinished = false;
  Storage.saveRun(GameState.run);
  const loaded = Storage.loadRun();
  assert.equal(loaded.hearts, 2);
  assert.equal(loaded.battle.movesLeft, 12);
  assert.equal(loaded.battle.board[0][0], 4);
  GameState.roomFinished = true;
  GameState.run.pendingReward = { floorIdx:0, type:'boss' };
  Storage.saveRun(GameState.run);
  const completed = Storage.loadRun();
  assert.equal(completed.battle, null);
  assert.equal(completed.pendingReward.type, 'boss');
});

test('Shield relic neutralizes a newly planted enemy bomb', () => {
  GameState.run = { relics:[vm.runInContext("RELICS.find(r => r.id === 'shield')", context)] };
  vm.runInContext('RelicHooks.invalidate()', context);
  const board = Board.empty(), timers = {};
  const fight = Combat.create(enemy('salamander'));
  fight.intentIn = 0;
  const effect = Combat.resolve(fight, board, timers, 1);
  vm.runInContext('RelicHooks', context).fire('onEnemyIntent', { effect, board, bombTimers:timers });
  assert.equal(effect.intent, 'bomb');
  assert.equal(Board.getEmpty(board).length, 16);
  assert.equal(Object.keys(timers).length, 0);
});

test('leftover moves join room reward before relic multiplier', () => {
  vm.runInContext("globalThis.Renderer = { renderEnemy:() => {}, showRoomOverlay:() => {} }; globalThis.Fx = { roomSuccess:() => {} }; globalThis.Audio2 = { win:() => {} }", context);
  GameState.meta = Storage.defaultMeta();
  GameState.run = { seed:1, hearts:3, gold:0, relics:[vm.runInContext("RELICS.find(r => r.id === 'crown')", context)] };
  GameState.room = { floorIdx:0, data:{ type:'boss' } };
  GameState.movesLeft = 5;
  const complete = Controller._completeCurrentRoom, render = Controller._renderAfterMove;
  Controller._completeCurrentRoom = () => {};
  Controller._renderAfterMove = () => {};
  vm.runInContext('RelicHooks.invalidate()', context);
  Controller._winRoom({ merges:[] }, 'left');
  assert.equal(GameState.run.gold, 28);
  Controller._completeCurrentRoom = complete;
  Controller._renderAfterMove = render;
});

test('same seed chooses same enemy and same intent targets', () => {
  const play = seed => {
    Rng.seed(seed);
    const selected = Combat.pick(0, 'normal');
    const fight = Combat.create(enemy('sentinel'));
    const board = Board.empty(); fight.intentIn = 0;
    const effect = Combat.resolve(fight, board, {}, 2);
    const locked = Combat.create(enemy('warden'));
    locked.patternIndex = 1; Combat.announce(locked);
    return { id:selected.id, cells:JSON.stringify(effect.cells), direction:locked.intentDirection, board:JSON.stringify(board) };
  };
  assert.deepEqual(play(42), play(42));
});

test('a shield is worth 8 % of max HP and drops when the next intent fires', () => {
  const def = { id:'probe', floor:0, kind:'normal', hp:300, cadence:1, pattern:['shield','strike'] };
  const fight = Combat.create(def);
  const board = Board.empty();
  Combat.tick(fight, board, false);
  Combat.resolve(fight, board, {}, 0);
  assert.equal(fight.block, 24);
  Combat.tick(fight, board, false);
  Combat.resolve(fight, board, {}, 0);
  assert.equal(fight.block, 0);
});
