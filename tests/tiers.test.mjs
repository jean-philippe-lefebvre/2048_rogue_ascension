import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const renderer = {renderMap(){},renderTitle(){},renderEndScreen(){},renderMeta(){},renderEnemy(){},
  hideRoomOverlay(){},updateHUD(){},updateActiveRelics(){},buildGrid(){},renderClock(){}};
const context = vm.createContext({console,Date,location:{protocol:'https:',origin:'https://example.com',pathname:'/game/'},
  localStorage:{getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
  Renderer:renderer,Icons:{svg:()=>'<svg></svg>'},showScreen(){},requestAnimationFrame(){},Fx:{resize(){}},
  document:{getElementById:()=>({innerHTML:''})},
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller','share'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {Controller,GameState,Storage,Rng,ENEMIES,CHARACTERS,Share} =
  vm.runInContext('({Controller,GameState,Storage,Rng,ENEMIES,CHARACTERS,Share})',context);
const fresh = (tier = 0) => {
  GameState.meta = Storage.defaultMeta();
  GameState.meta.tierUnlocked = 10;
  Controller.selectedTier = tier;
  Controller._beginRun('alchemist');
  return GameState.run;
};
const battle = (tier, kind, floor = 0) => {
  const run = fresh(tier);
  const enemy = ENEMIES.find(e => e.kind === kind && e.floor === floor);
  GameState.room = {floorIdx:floor,rowIdx:0,nodeIdx:0,data:{type:kind},enemyDef:enemy};
  Controller._startBattleRoom(kind,floor);
  return {run, fight:GameState.room.combat,enemy};
};

test('A1 to A3 scale HP, moves and elite cadence cumulatively', () => {
  let {fight,enemy} = battle(0,'normal');
  assert.equal(fight.hp,enemy.hp); assert.equal(GameState.movesMax,36);
  ({fight,enemy} = battle(1,'normal'));
  assert.equal(fight.hp,Math.ceil(enemy.hp * 1.1)); assert.equal(GameState.movesMax,36);
  ({fight} = battle(2,'normal'));
  assert.equal(GameState.movesMax,34);
  ({fight,enemy} = battle(3,'elite'));
  assert.equal(fight.cadence,Math.max(2,enemy.cadence-1));
  assert.equal(fight.intentIn,fight.cadence); assert.equal(GameState.movesMax,38);
});

test('A4 to A6 adjust shop prices, starting hearts and boss HP', () => {
  let run = fresh(3); assert.equal(Controller.shopPrice(55),44);
  run = fresh(4); assert.equal(Controller.shopPrice(55),52);
  assert.equal(run.hearts,3);
  run = fresh(5); assert.equal(run.hearts,2);
  const {fight,enemy} = battle(6,'boss');
  assert.equal(fight.maxHp,Math.ceil(enemy.hp*1.1*1.15));
});

test('A7 to A10 reduce room gold, add a curse, increase strike cost and advance boss phase', () => {
  let run = fresh(6); assert.equal(Controller.roomGold(40),40);
  run = fresh(7); assert.equal(Controller.roomGold(40),30);
  assert.equal(Controller.tierGold(99,7),168);
  run = fresh(8); assert.equal(run.relics.filter(r=>r.isCurse).length,1);
  assert.equal(Controller.strikeCost({strike:2}),2);
  run = fresh(9); assert.equal(Controller.strikeCost({strike:2}),3);
  let {fight,enemy} = battle(10,'boss');
  fight.hp = Math.floor(fight.maxHp*.65);
  assert.equal(Controller.advancePhase(fight,enemy),true);
  assert.equal(fight.phase,2);
  ({fight,enemy} = battle(9,'boss'));
  fight.hp = Math.floor(fight.maxHp*.65);
  assert.equal(Controller.advancePhase(fight,enemy),false);
});

test('win unlocks the next tier, banks multiplied gold and tracks cleared floors', () => {
  const run = fresh(4);
  GameState.meta.tierUnlocked = 4;
  run.gold = 101; run.totalScore = 300; run.floorIdx = 2;
  Controller._endRun(true);
  assert.equal(GameState.meta.tierUnlocked,5);
  assert.equal(GameState.meta.permanentGold,Math.floor(131*1.4));
  assert.equal(run.stats.floorsCleared,3);
  assert.equal(run.stats.goldEarned,30);
  const lower = fresh(1); GameState.meta.tierUnlocked = 5; lower.gold = 0; lower.floorIdx = 2;
  Controller._endRun(true);
  assert.equal(GameState.meta.tierUnlocked,5);
});

test('old ascension saves migrate without losing upgrade levels and use new unlock mapping', () => {
  saved.set(Storage.KEY,JSON.stringify({ascension:2,upgrades:{extraMoves:3,deepForge:2},permanentGold:1000}));
  const migrated = Storage.load();
  assert.equal(migrated.tierUnlocked,6);
  assert.equal(migrated.upgrades.extraMoves,3);
  assert.equal(migrated.upgrades.deepForge,2);
  GameState.meta = {...Storage.defaultMeta(),...migrated};
  Controller.buyUpgrade('singularity');
  assert.equal(GameState.meta.upgrades.singularity,undefined);
  Controller.buyUpgrade('forgedEntropy');
  assert.equal(GameState.meta.upgrades.forgedEntropy,1);
  GameState.meta.tierUnlocked=7;
  Controller.buyUpgrade('singularity');
  assert.equal(GameState.meta.upgrades.singularity,1);
  saved.delete(Storage.KEY);
});

test('daily seed, rollover, character rotation and one attempt per UTC day', () => {
  GameState.meta = Storage.defaultMeta();
  assert.equal(Controller.dailySeed('2026-09-27'),Controller.dailySeed('2026-09-27'));
  assert.notEqual(Controller.dailySeed('2026-09-27'),Controller.dailySeed('2026-09-28'));
  assert.notEqual(Controller.dailyCharacter('2026-09-27').id,Controller.dailyCharacter('2026-09-28').id);
  assert.ok(CHARACTERS.some(c=>c.id===Controller.dailyCharacter('2026-09-27').id));
  GameState.meta.upgrades = {extraMoves:4,startRelic:1,destiny:1,startTile:2};
  const first = new Date('2026-09-27T23:59:00Z');
  assert.equal(Controller.startDaily(first),true);
  assert.equal(GameState.run.seed,Controller.dailySeed('2026-09-27'));
  assert.equal(GameState.run.tier,3);
  assert.equal(GameState.getUpgradeLevel('extraMoves'),0);
  assert.equal(GameState.run.relics.length,1);
  GameState.room = {floorIdx:0,rowIdx:0,nodeIdx:0,data:{type:'normal'},enemyDef:ENEMIES.find(e=>e.id==='rat')};
  Controller._startBattleRoom('normal',0);
  assert.equal(GameState.movesMax,34);
  assert.equal(Controller.startDaily(first),false);
  assert.equal(Controller.startDaily(new Date('2026-09-28T00:00:00Z')),true);
});

test('share text shows daily date, tier and floor outcome squares', () => {
  const run = {daily:'2026-09-27',tier:3,hearts:2,floorIdx:1,stats:{floorsCleared:1},win:false,abandoned:false};
  assert.equal(Share.text(run),'2048 Rogue · Défi du 27/09 · Étage 2/3 · 2 cœurs · 🟨🟥⬛\nhttps://example.com/game/');
  context.location.protocol = 'file:';
  assert.equal(Share.text(run),'2048 Rogue · Défi du 27/09 · Étage 2/3 · 2 cœurs · 🟨🟥⬛');
  context.location.protocol = 'https:';
  run.daily=null; run.win=true; run.floorIdx=2; run.stats.floorsCleared=3;
  assert.match(Share.text(run),/Palier A3 · Étage 3\/3 · 2 cœurs · 🟨🟨🟨/);
});

test('earned gold and completed boss reward update persisted stats', () => {
  const run = fresh(0);
  Controller.earnedGold(14);
  Controller.recordMoveStats([[2,64],[0,4]],32);
  Controller.recordMoveStats([[2,16],[0,4]],12);
  assert.equal(run.gold,14); assert.equal(run.stats.goldEarned,14);
  assert.equal(run.stats.biggestTile,64); assert.equal(run.stats.bestDamage,32);
  run.pendingReward={type:'boss',floorIdx:0};
  Controller._finishBattleReward();
  assert.equal(run.stats.floorsCleared,1);
  const loaded=Storage.loadRun();
  assert.equal(loaded.stats.goldEarned,14);
  assert.equal(loaded.stats.floorsCleared,1);
  assert.equal(loaded.stats.biggestTile,64);
  assert.equal(loaded.stats.bestDamage,32);
});
