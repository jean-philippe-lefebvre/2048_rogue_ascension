import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const renderer = {renderMap(){},renderTitle(){},renderEndScreen(){},renderMeta(){},renderEnemy(){},
  hideRoomOverlay(){},showRoomOverlay(){},updateHUD(){},updateActiveRelics(){},buildGrid(){},renderClock(){},renderTierSelector(){},renderRelicChoice(){},renderTiles(){},renderEvent(){}};
const context = vm.createContext({console,Date,location:{protocol:'https:',origin:'https://example.com',pathname:'/game/'},
  localStorage:{getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)},
  Renderer:renderer,Icons:{svg:()=>'<svg></svg>'},showScreen(){},requestAnimationFrame(){},Fx:{resize(){}},Audio2:{fail(){}},
  document:{getElementById:()=>({innerHTML:'',style:{}})},
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller','share'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {Controller,GameState,Storage,Rng,ENEMIES,CHARACTERS,Share} =
  vm.runInContext('({Controller,GameState,Storage,Rng,ENEMIES,CHARACTERS,Share})',context);
const fresh = (tier = 0) => {
  GameState.meta = Storage.defaultMeta();
  GameState.meta.tiers = {alchemist:10,artificer:10,monk:10};
  Controller.selectedCharacter = 'alchemist';
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

test('tier HP scales and A2 swaps one seeded pre-boss rest per floor', () => {
  let {fight,enemy} = battle(0,'normal');
  assert.equal(fight.hp,enemy.hp);
  ({fight,enemy} = battle(4,'normal'));
  assert.equal(fight.hp,Math.ceil(enemy.hp * 1.08));
  const generate = seed => { Rng.seed(seed); return Controller._generateFloors(2).map(floor => floor[4].map(n => n.type)); };
  assert.deepEqual(generate(17),generate(17));
  for (const row of generate(17)) assert.equal(row.filter(type => type === 'normal').length,1);
});

test('character ladders unlock independently and old saves migrate for every character', () => {
  const run = fresh(4);
  GameState.meta.tiers = {alchemist:4,artificer:1,monk:0};
  run.gold=101; run.floorIdx=2;
  Controller._endRun(true);
  assert.equal(GameState.meta.tiers.alchemist,5);
  assert.equal(GameState.meta.tiers.artificer,1);
  assert.equal(GameState.meta.permanentGold,Math.floor(131*1.4));
  Controller.selectedCharacter='artificer'; Controller.selectTier(5);
  assert.equal(Controller.selectedTier,1);
  saved.set(Storage.KEY,JSON.stringify({tierUnlocked:6,upgrades:{extraMoves:3},permanentGold:1000}));
  const migrated=Storage.load();
  assert.deepEqual(Object.fromEntries(Object.entries(migrated.tiers)),{alchemist:6,artificer:6,monk:6});
  assert.equal(migrated.tierUnlocked,undefined);
  GameState.meta={...Storage.defaultMeta(),...migrated};
  Controller.buyUpgrade('singularity');
  assert.equal(GameState.meta.upgrades.singularity,undefined);
  GameState.meta.tiers.monk=7;
  Controller.buyUpgrade('singularity');
  assert.equal(GameState.meta.upgrades.singularity,1);
  saved.delete(Storage.KEY);
});

test('A3 affixes and A4 fog threshold, A5 hearts, A6 Warden, A8 curse', () => {
  let {fight}=battle(3,'elite');
  assert.ok(['armored','enraged','pyro','vampire'].includes(fight.affix));
  let run=fresh(4); assert.equal(run.hearts,3);
  run=fresh(5); assert.equal(run.hearts,2);
  run=fresh(6); assert.equal(run.floors[1].bossId,'guardian');
  run=fresh(8); assert.equal(run.relics.filter(r=>r.isCurse).length,1);
});

test('each affix applies its distinct combat rule', () => {
  const def=ENEMIES.find(e=>e.id==='revenant');
  const fight=vm.runInContext('Combat.create(ENEMIES.find(e=>e.id==="revenant"))',context);
  const Combat=vm.runInContext('Combat',context);
  const Board=vm.runInContext('Board',context);
  fight.affix='armored'; assert.equal(Combat.mergeDamage(fight,{val:4}),2);
  assert.equal(Combat.mergeDamage(fight,{val:8}),8);
  fight.affix='vampire'; fight.hp=100; Combat.actionAffix(fight,Board.empty(),{}, {cells:[]});
  assert.equal(fight.hp,100 + Math.floor(fight.maxHp * 0.02));
  fight.affix='pyro'; const board=Board.empty(),timers={},effect={cells:[]};
  Rng.seed(123); Combat.actionAffix(fight,board,timers,effect);
  assert.equal(Object.keys(timers).length,1); assert.equal(Object.values(timers)[0],5);
  assert.equal(board.flat().filter(v=>v===-2).length,1);
  const elite=battle(3,'elite').fight;
  elite.affix='enraged'; elite.cadence=Math.max(2,def.cadence-1);
  assert.equal(elite.cadence,2);
});

test('Warden threshold follows rank under base 2 and Trinity base 3', () => {
  const Combat=vm.runInContext('Combat',context), Board=vm.runInContext('Board',context);
  const fight=Combat.create(ENEMIES.find(e=>e.id==='guardian'));
  fight.block=0;
  assert.equal(Combat.mergeDamage(fight,{val:8}),0);
  assert.equal(Combat.mergeDamage(fight,{val:16}),16);
  GameState.base=3;
  assert.equal(Combat.mergeDamage(fight,{val:12}),0);
  assert.equal(Combat.mergeDamage(fight,{val:24}),24);
  GameState.base=2;
});

test('A7 traps one in three mystery rooms deterministically', () => {
  const generate=seed => { Rng.seed(seed); return Controller._generateFloors(7).flatMap(f=>f.flat()).filter(n=>n.type==='mystery').map(n=>!!n.ambush); };
  assert.deepEqual(generate(99),generate(99));
  let traps=0, mysteries=0;
  for(let seed=0;seed<100;seed++) { const values=generate(seed); traps+=values.filter(Boolean).length; mysteries+=values.length; }
  assert.ok(traps/mysteries>.25 && traps/mysteries<.4);
});

test('a trapped mystery starts an elite fight and then opens its event', () => {
  const run=fresh(7);
  run.floors[0][0][0]={type:'mystery',ambush:true,available:true,completed:false,connections:[0]};
  Controller.enterRoom(0,0,0);
  assert.equal(run.pendingTrappedMystery,true);
  assert.equal(GameState.room.enemyDef.kind,'elite');
  assert.equal(run.floors[0][0][0].completed,false);
  run.pendingReward={type:'elite',floorIdx:0,rowIdx:0,nodeIdx:0};
  GameState.roomFinished=true;
  Storage.saveRun(run);
  GameState.run=Storage.loadRun(); GameState.room=null;
  Controller.resumeRun();
  Controller._finishBattleReward();
  assert.equal(GameState.run.pendingTrappedMystery,undefined);
  assert.equal(GameState.run.pendingEvent.stage,'choice');
});

test('a surviving trapped mystery loss still leads to its event', () => {
  const run=fresh(7);
  run.floors[0][0][0]={type:'mystery',ambush:true,available:true,completed:false,connections:[0]};
  Controller.enterRoom(0,0,0);
  assert.equal(Controller._checkFailure(true),true);
  assert.equal(run.hearts,1);
  assert.equal(GameState.overlayMode,'trappedEvent');
  assert.equal(run.floors[0][0][0].completed,false);
  Controller.overlayAction();
  assert.equal(run.pendingEvent.stage,'choice');
});

test('A9 adds the Ascendant floor and A10 adds a third boss phase', () => {
  let run=fresh(8); assert.equal(run.floors.length,3);
  run=fresh(9); assert.equal(run.floors.length,4);
  run.relics=run.relics.filter(r=>!r.isCurse);
  assert.equal(run.floors[3][0][0].bossId,'ascendant');
  const drawn=run.floors.slice(0,3).map(f=>ENEMIES.find(e=>e.id===f.bossId).pattern[0]);
  GameState.room={floorIdx:3,rowIdx:0,nodeIdx:0,data:run.floors[3][0][0]};
  Controller._startBattleRoom('boss',3);
  assert.deepEqual(Array.from(GameState.room.combat.pattern),[...drawn,'strike']);
  assert.equal(GameState.movesMax,66);
  const loaded=Storage.loadRun();
  assert.equal(loaded.floors[3][0][0].bossId,'ascendant');
  assert.equal(loaded.battle.floorIdx,3);
  GameState.run=loaded; GameState.room=null;
  Controller.resumeRun();
  assert.equal(GameState.room.combat.id,'ascendant');
  assert.equal(GameState.room.floorIdx,3);
  const {fight,enemy}=battle(10,'boss');
  fight.hp=Math.floor(fight.maxHp*.5); assert.equal(Controller.advancePhase(fight,enemy),true);
  fight.hp=Math.floor(fight.maxHp*.25); assert.equal(Controller.advancePhase(fight,enemy),true);
  assert.equal(fight.phase,3); assert.ok(fight.pattern.includes('strike')); assert.ok(fight.cadence>=2);
  for (const id of ['guardian','ascendant']) {
    const Combat=vm.runInContext('Combat',context), def=ENEMIES.find(e=>e.id===id);
    const boss=Combat.create(def);
    boss.hp=Math.floor(boss.maxHp*.5); assert.equal(Combat.phase(boss,def,10),true);
    boss.hp=Math.floor(boss.maxHp*.25); assert.equal(Combat.phase(boss,def,10),true);
    assert.equal(boss.phase,3); assert.ok(boss.pattern.includes('strike'));
  }
  const Combat=vm.runInContext('Combat',context), necroDef=ENEMIES.find(e=>e.id==='necromancer');
  const necro=Combat.create(necroDef);
  necro.hp=Math.floor(necro.maxHp*.25);
  assert.equal(Combat.phase(necro,necroDef,10),true);
  necro.hp=0;
  assert.equal(Combat.revive(necro),true);
  assert.equal(necro.phase,3);
  const ascDef=ENEMIES.find(e=>e.id==='ascendant');
  const asc=Combat.create(ascDef);
  asc.phase2Pattern=['void','heal','lock','strike'];
  asc.hp=Math.floor(asc.maxHp*.2);
  assert.equal(Combat.phase(asc,ascDef,10),true);
  assert.deepEqual(Array.from(asc.pattern.slice(0,4)),asc.phase2Pattern);
});

test('A8 floor III win ends the run; A9 floor III advances to IV', () => {
  let run=fresh(8); run.pendingReward={type:'boss',floorIdx:2};
  Controller._showBattleReward(); assert.equal(GameState.run,null);
  run=fresh(9); run.floorIdx=2; run.pendingReward={type:'boss',floorIdx:2};
  Controller._showBattleReward();
  assert.ok(GameState.run);
  Controller._finishBattleReward();
  assert.equal(GameState.run.floorIdx,3);
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
  assert.equal(GameState.movesMax,36);
  assert.equal(Controller.startDaily(first),false);
  assert.equal(Controller.startDaily(new Date('2026-09-28T00:00:00Z')),true);
  const tiers={...GameState.meta.tiers};
  Controller._endRun(true);
  assert.deepEqual({...GameState.meta.tiers},tiers);
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

test('affixed elites trade 15 % of their HP for their affix', () => {
  const { fight, enemy } = battle(3, 'elite');
  assert.ok(fight.affix);
  assert.equal(fight.maxHp, Math.ceil(Math.ceil(enemy.hp * 1.06) * 0.85));
});

test('share text counts the hidden floor IV from A9', () => {
  const Share = vm.runInContext('Share', context);
  const run = { tier:9, floorIdx:3, hearts:1, win:true, floors:[[],[],[],[]], stats:{ floorsCleared:4 } };
  assert.match(Share.text(run), /Étage 4\/4 .* 🟨🟨🟨🟨/);
  assert.match(Share.text({ ...run, tier:9, floorIdx:2, floors:[[],[],[]], stats:{ floorsCleared:3 } }), /Étage 3\/3 .* 🟨🟨🟨$/m);
});

test('Shield neutralises the first bomb a Pyro elite plants, whatever its intent', () => {
  const out = vm.runInContext(`(() => {
    GameState.run = { relics:[RELICS.find(r => r.id === 'shield')] }; GameState.room = { relicState:{} }; RelicHooks.invalidate();
    const board = Board.empty(), bombTimers = { '1,1':5 }; board[1][1] = TILE.BOMB;
    RelicHooks.fire('onEnemyIntent', { effect:{ intent:'gnaw', cells:[[2,2],[1,1]], bombCells:[[1,1]] }, board, bombTimers });
    return { cell:board[1][1], timer:bombTimers['1,1'] ?? null };
  })()`, context);
  assert.equal(out.cell, 0);
  assert.equal(out.timer, null);
});
