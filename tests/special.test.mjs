import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const context = vm.createContext({
  console, Date,
  localStorage: { getItem:key => saved.get(key) ?? null, setItem:(key,value) => saved.set(key,value) },
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context, {filename:file});
const { Board, Combat, Controller, GameState, Storage, Rng, TILE, ENEMIES } =
  vm.runInContext('({Board,Combat,Controller,GameState,Storage,Rng,TILE,ENEMIES})', context);
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({board:Board.empty(), kinds:Board.emptyKinds()});

// Keep spawns deterministic and away from the cells under test.
function move(board, kinds, dir, iceHits = {}) {
  Rng.seed(12);
  return Board.applyMove(board, dir, {kinds,iceHits});
}

test('kinds follow numbered tiles in all four directions', () => {
  for (const [dir, from, to] of [
    ['left',[0,3],[0,0]], ['right',[0,0],[0,3]],
    ['up',[3,0],[0,0]], ['down',[0,0],[3,0]],
  ]) {
    const {board,kinds} = empty();
    board[from[0]][from[1]] = 16; kinds[from[0]][from[1]] = 'gold';
    move(board,kinds,dir);
    assert.equal(board[to[0]][to[1]],16,dir);
    assert.equal(kinds[to[0]][to[1]],'gold',dir);
    assert.equal(kinds[from[0]][from[1]],null,dir);
  }
});

test('gold merge pays by result and propagates from either contributor', () => {
  for (const goldAt of [0,1]) {
    const {board,kinds} = empty();
    board[0][0] = board[0][1] = 8; kinds[0][goldAt] = 'gold';
    const result = move(board,kinds,'left');
    assert.equal(board[0][0],16);
    assert.equal(kinds[0][0],'gold');
    assert.equal(result.gold,2);
    assert.equal(result.merges[0].gold,2);
  }
  const {board,kinds} = empty();
  board[0][0] = board[0][1] = 32; kinds[0][1] = 'gold';
  assert.equal(move(board,kinds,'left').gold,8);
});

test('gold payout reaches the run before relic gold hooks', () => {
  vm.runInContext("globalThis.Fx = { burst:()=>{} }; globalThis.Audio2 = { merges:()=>{} }; globalThis.Renderer = { enemyHit:()=>{}, renderEnemy:()=>{} }", context);
  const {board,kinds} = empty();
  board[0][0] = board[0][1] = 8; kinds[0][1] = 'gold';
  const def = {id:'probe',hp:1000,cadence:100,pattern:['heal']};
  GameState.meta = Storage.defaultMeta();
  GameState.run = {gold:0,totalScore:0,relics:[vm.runInContext("RELICS.find(r => r.id === 'greed')", context)]};
  GameState.room = {floorIdx:0,rowIdx:0,nodeIdx:0,data:{type:'normal'},enemyDef:def,combat:Combat.create(def),relicState:{},iceHits:{}};
  GameState.board = board; GameState.kinds = kinds; GameState.portals = [];
  GameState.bombTimers = {}; GameState.obstacleAge = {};
  GameState.score = 0; GameState.mergeCount = 0; GameState.movesLeft = 10; GameState.movesMax = 10;
  GameState.roomFinished = false;
  const render = Controller._renderAfterMove, failure = Controller._checkFailure;
  Controller._renderAfterMove = () => {};
  Controller._checkFailure = () => false;
  vm.runInContext('RelicHooks.invalidate()',context);
  Controller.move('left');
  assert.equal(GameState.run.gold,3);
  Controller._renderAfterMove = render;
  Controller._checkFailure = failure;
  GameState.run = null;
  vm.runInContext('RelicHooks.invalidate()',context);
});

test('ice blocks movement and merges, cracks then thaws after adjacent merges', () => {
  const {board,kinds} = empty(), hits = {};
  board[0] = [8,8,0,0]; board[1][0] = 16; kinds[1][0] = 'ice';
  let result = move(board,kinds,'left',hits);
  assert.equal(result.merges.length,1);
  assert.equal(board[1][0],16); assert.equal(kinds[1][0],'ice');
  assert.equal(hits['1,0'],1);
  board[2] = [8,8,0,0];
  result = move(board,kinds,'left',hits);
  assert.equal(result.merges.length,1);
  assert.equal(kinds[1][0],null);
  assert.equal(hits['1,0'],undefined);
  assert.deepEqual(plain(result.thawed),[{r:1,c:0}]);
  const locked = [[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]];
  const frozen = Board.emptyKinds();
  frozen[0][0] = 'ice';
  assert.equal(Board.canMove(locked,frozen),false);
  const sealed = Array.from({length:4},()=>Array(4).fill(2));
  const sealedKinds = Array.from({length:4},()=>Array(4).fill('ice'));
  sealed[0][0] = 0; sealedKinds[0][0] = null;
  assert.equal(Board.canMove(sealed,sealedKinds),false);
  assert.equal(Combat.hasLegalMove(Combat.create({id:'probe',hp:10,cadence:2,pattern:['heal']}),sealed,sealedKinds),false);
});

test('joker and multiplier merge once in movement order', () => {
  assert.deepEqual(plain(Board.slideRow([TILE.JOKER,8,8,0]).row),[16,8,0,0]);
  assert.deepEqual(plain(Board.slideRow([TILE.JOKER,TILE.JOKER,0,0]).row),[4,0,0,0]);
  assert.deepEqual(plain(Board.slideRow([TILE.MULT,16,0,0]).row),[32,0,0,0]);
  assert.deepEqual(plain(Board.slideRow([16,TILE.MULT,0,0]).row),[32,0,0,0]);
  assert.deepEqual(plain(Board.slideRow([TILE.JOKER,TILE.BOMB,8,0]).row),[TILE.JOKER,TILE.BOMB,8,0]);
  assert.deepEqual(plain(Board.slideRow([TILE.JOKER,TILE.MULT,0,0]).row),[TILE.JOKER,TILE.MULT,0,0]);
  assert.deepEqual(plain(Board.slideRow([TILE.JOKER,8,0,0],0,[null,'ice',null,null]).row),[TILE.JOKER,8,0,0]);
  const {board,kinds} = empty();
  board[0][0] = TILE.JOKER; board[0][1] = 8; kinds[0][1] = 'gold';
  const result = move(board,kinds,'left');
  assert.equal(result.merges[0].val,16);
  assert.equal(result.gold,2);
  assert.equal(kinds[0][0],'gold');
});

test('Blade upgrades only a true 2 plus 2 merge', () => {
  const hooks = vm.runInContext('RelicHooks', context);
  GameState.run = {relics:[vm.runInContext("RELICS.find(r => r.id === 'blade')", context)]};
  hooks.invalidate();
  for (const [a,b,expected] of [[2,2,8],[TILE.JOKER,2,4],[TILE.MULT,2,4],[TILE.JOKER,TILE.JOKER,4]]) {
    const {board,kinds} = empty();
    board[0][0] = a; board[0][1] = b;
    const result = move(board,kinds,'left');
    hooks.fire('onAfterMove',{result,board});
    assert.equal(board[0][0],expected,`${a} + ${b}`);
  }
  GameState.run = null;
  hooks.invalidate();
});

test('portal teleports or swaps kind and bomb timer', () => {
  const {board,kinds} = empty(), timers = {};
  const portals = [[0,0],[3,3]];
  board[0][0] = 16; kinds[0][0] = 'gold';
  Board.applyPortals(board,kinds,timers,portals);
  assert.equal(board[3][3],16); assert.equal(kinds[3][3],'gold');
  board[0][0] = TILE.BOMB; timers['0,0'] = 7;
  Board.applyPortals(board,kinds,timers,portals);
  assert.equal(board[3][3],TILE.BOMB); assert.equal(timers['3,3'],7);
  assert.equal(board[0][0],16); assert.equal(kinds[0][0],'gold');
  assert.equal(timers['0,0'],undefined);
  Rng.seed(3);
  const pair = Board.createPortals(board);
  assert.equal(pair.length,2);
  assert.ok(Math.abs(pair[0][0]-pair[1][0])+Math.abs(pair[0][1]-pair[1][1])>1);
});

test('freeze prefers an 8+, falls back to numbered, and avoids empty boards', () => {
  const freeze = (board,kinds) => {
    const fight = Combat.create({id:'test',hp:100,cadence:1,pattern:['freeze']});
    fight.intentIn = 0;
    return Combat.resolve(fight,board,{},2,kinds,[[1,1],[3,3]]);
  };
  const {board,kinds} = empty();
  board[0][0] = 2; board[0][1] = 8;
  assert.deepEqual(plain(freeze(board,kinds).cells),[[0,1]]);
  assert.equal(kinds[0][1],'ice');
  assert.deepEqual(plain(freeze(board,kinds).cells),[[0,0]]);
  assert.equal(kinds[0][0],'ice');
  assert.deepEqual(plain(freeze(board,kinds).cells),[]);
});

test('explosion retains numbered kind and destroys joker and multiplier', () => {
  const {board,kinds} = empty(), timers = {'1,1':1};
  board[1][1] = TILE.BOMB;
  board[0][1] = 16; kinds[0][1] = 'gold';
  board[1][0] = TILE.JOKER; board[1][2] = TILE.MULT;
  Board.tickBombs(board,timers,kinds);
  assert.equal(board[0][1],8); assert.equal(kinds[0][1],'gold');
  assert.equal(board[1][0],0); assert.equal(board[1][2],0);
});

test('battle snapshot persists kinds, portals and ice cracks; old saves default cleanly', () => {
  const {board,kinds} = empty();
  board[0][0] = 8; kinds[0][0] = 'ice';
  GameState.run = {hearts:3,relics:[],floors:[[],[],[[{type:'normal'}]]]};
  GameState.room = {floorIdx:2,rowIdx:0,nodeIdx:0,enemyDef:ENEMIES[10],combat:Combat.create(ENEMIES[10]),relicState:{},iceHits:{'0,0':1}};
  GameState.board = board; GameState.kinds = kinds; GameState.portals = [[0,1],[3,3]];
  GameState.obstacleAge = {}; GameState.bombTimers = {};
  GameState.roomFinished = false;
  Storage.saveRun(GameState.run);
  const battle = Storage.loadRun().battle;
  assert.equal(battle.kinds[0][0],'ice');
  assert.equal(battle.iceHits['0,0'],1);
  assert.deepEqual(plain(battle.portals),[[0,1],[3,3]]);
  vm.runInContext("globalThis.document = { getElementById:()=>({innerHTML:''}) }; globalThis.Icons = { svg:()=>'' }; globalThis.Renderer = { hideRoomOverlay:()=>{}, renderEnemy:()=>{}, updateHUD:()=>{}, updateActiveRelics:()=>{}, buildGrid:()=>{} }; globalThis.showScreen = ()=>{}; globalThis.requestAnimationFrame = ()=>{}", context);
  GameState.run = Storage.loadRun();
  Controller.resumeRun();
  assert.equal(GameState.kinds[0][0],'ice');
  assert.deepEqual(plain(GameState.portals),[[0,1],[3,3]]);
  assert.equal(GameState.room.iceHits['0,0'],1);
  saved.set(Storage.RUN_KEY,JSON.stringify({hearts:3,relics:[],battle:{board}}));
  const old = Storage.loadRun().battle;
  assert.deepEqual(plain(old.kinds),plain(Board.emptyKinds()));
  assert.deepEqual(plain(old.portals),[]);
  assert.deepEqual(plain(old.iceHits),{});
  assert.ok(Controller.resumeRun);
});
