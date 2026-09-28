import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const context = vm.createContext({ console, Date,
  localStorage:{getItem:key => saved.get(key) ?? null,setItem:(key,value) => saved.set(key,value),removeItem:key => saved.delete(key)},
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {Spells,Controller,GameState,Storage,Board,Combat,Rng,TILE,EVENTS,SPELLS,RELICS} =
  vm.runInContext('({Spells,Controller,GameState,Storage,Board,Combat,Rng,TILE,EVENTS,SPELLS,RELICS})',context);
const plain = value => JSON.parse(JSON.stringify(value));
context.Renderer = { renderShop:()=>{}, renderTiles:()=>{}, renderEnemy:()=>{}, updateHUD:()=>{}, renderSpells:()=>{}, renderPortals:()=>{}, enemyHit:()=>{}, showRoomOverlay:()=>{} };
context.Audio2 = { relic:()=>{}, fail:()=>{} };
context.Fx = { cellCenter:()=>null };
const showShop = Controller._showShop, showEvent = Controller._showEvent;
Controller._showShop = () => {};
Controller._showEvent = () => {};

function setup() {
  Rng.seed(47);
  vm.runInContext('RelicHooks.invalidate()',context);
  GameState.meta = Storage.defaultMeta();
  GameState.run = {gold:100,hearts:3,totalScore:0,lastTileVal:0,relics:[],spells:[{id:'smash',charges:2}],seenEvents:[],bossHpMult:1,
    floors:[[[{type:'normal',connections:[0],available:true,completed:false}],[{type:'shop',connections:[0],available:true,completed:false}]]],floorIdx:0};
  const enemyDef={id:'test',hp:1000,cadence:10,pattern:['heal']};
  GameState.room = {floorIdx:0,rowIdx:0,nodeIdx:0,data:{type:'normal'},enemyDef,combat:Combat.create(enemyDef),
    relicState:{},iceHits:{},undo:null};
  GameState.board = Board.empty(); GameState.kinds = Board.emptyKinds(); GameState.portals = [];
  GameState.bombTimers = {}; GameState.obstacleAge = {};
  GameState.movesLeft = 12; GameState.movesMax = 12; GameState.score = 5; GameState.mergeCount = 0; GameState.roomFinished = false; GameState.stuck = false; GameState.spellTarget = null;
  return GameState;
}

test('smash thaws ice, clears seals, obstacles and bombs without detonating', () => {
  const gs=setup();
  gs.board[0]=[8,TILE.OBSTACLE,TILE.BOMB,0]; gs.kinds[0][0]='ice'; gs.room.iceHits['0,0']=1;
  gs.room.combat.seals['0,1']=4; gs.bombTimers['0,2']=2;
  assert.equal(Spells.apply(gs,'smash',[[0,0]]),true);
  assert.equal(gs.board[0][0],8); assert.equal(gs.kinds[0][0],null);
  Spells.apply(gs,'smash',[[0,1]]); Spells.apply(gs,'smash',[[0,2]]);
  assert.deepEqual(plain(gs.board[0]),[8,0,0,0]);
  assert.deepEqual(plain(gs.room.combat.seals),{}); assert.deepEqual(plain(gs.bombTimers),{});
});

test('swap moves kinds and bomb timer; pivot rotates every spatial layer', () => {
  const gs=setup();
  gs.board[0][0]=8; gs.kinds[0][0]='gold'; gs.board[2][3]=TILE.BOMB; gs.bombTimers['2,3']=3;
  assert.equal(Spells.apply(gs,'swap',[[0,0],[2,3]]),true);
  assert.equal(gs.board[2][3],8); assert.equal(gs.kinds[2][3],'gold'); assert.equal(gs.bombTimers['0,0'],3);
  gs.room.combat.seals['1,2']=5; gs.room.iceHits['3,0']=1; gs.portals=[[0,1],[3,2]];
  Spells.apply(gs,'pivot');
  assert.equal(gs.board[0][3],TILE.BOMB); assert.equal(gs.bombTimers['0,3'],3);
  assert.equal(gs.board[3][1],8); assert.equal(gs.kinds[3][1],'gold');
  assert.equal(gs.room.combat.seals['2,2'],5); assert.equal(gs.room.iceHits['0,0'],1);
  assert.deepEqual(plain(gs.portals),[[1,3],[2,0]]);
});

test('joker and catalyst use seeded empty cells and refuse a full board', () => {
  const gs=setup();
  gs.board=Array.from({length:4},()=>Array(4).fill(2)); gs.board[2][1]=0;
  assert.equal(Spells.apply(gs,'joker'),true); assert.equal(gs.board[2][1],TILE.JOKER);
  assert.equal(Spells.apply(gs,'catalyst'),false);
  gs.board[1][2]=0; assert.equal(Spells.apply(gs,'catalyst'),true); assert.equal(gs.board[1][2],TILE.MULT);
});

test('undo restores battle, gold and score once; casting leaves intent and moves untouched', () => {
  const gs=setup();
  gs.run.spells=[{id:'undo',charges:2},{id:'pivot',charges:2}];
  gs.run.singularityReady=true; gs.run._phoenixReady=true;
  gs.board[0][0]=16; gs.room.combat.hp=900; gs.room.combat.intentIn=7; gs.run.gold=70;
  const rngBefore=Rng._state;
  gs.room.undo=Spells.snapshot(gs);
  Rng.next(); gs.run.spells[0].charges=3; gs.run.spells[1].charges=3;
  gs.run.singularityReady=false; gs.run._phoenixReady=false;
  gs.board[0][0]=0; gs.room.combat.hp=700; gs.room.combat.intentIn=4; gs.run.gold=99; gs.score=45; gs.movesLeft=9;
  assert.equal(Controller._castSpell(0,[]),true);
  assert.equal(gs.board[0][0],16); assert.equal(gs.room.combat.hp,900);
  assert.equal(gs.room.combat.intentIn,7); assert.equal(gs.run.gold,70); assert.equal(gs.score,5); assert.equal(gs.movesLeft,12);
  assert.equal(gs.run.spells[0].charges,1); assert.equal(Spells.canCast(gs,'undo'),false);
  assert.equal(gs.run.spells[1].charges,2); assert.equal(Rng._state,rngBefore);
  assert.equal(gs.run.singularityReady,true); assert.equal(gs.run._phoenixReady,true);
  const before=plain([gs.room.combat,gs.movesLeft,gs.board]);
  Controller._castSpell(1,[]);
  assert.equal(gs.room.combat.intentIn,before[0].intentIn); assert.equal(gs.movesLeft,before[1]);
});

test('three merges recharge first non-full spell and stop at three', () => {
  const gs=setup();
  gs.run.spells=[{id:'smash',charges:2},{id:'pivot',charges:0}];
  for (let r=0;r<3;r++) gs.board[r]=[2,2,0,0];
  const render=Controller._renderAfterMove, fail=Controller._checkFailure;
  Controller._renderAfterMove=()=>{}; Controller._checkFailure=()=>false;
  Controller.move('left');
  Controller._renderAfterMove=render; Controller._checkFailure=fail;
  assert.equal(gs.run.spells[0].charges,3); assert.equal(gs.run.spells[1].charges,0);
  assert.equal(Spells.charge(gs.run),true); assert.equal(gs.run.spells[1].charges,1);
  gs.run.spells.forEach(s=>s.charges=3); assert.equal(Spells.charge(gs.run),false);
});

test('a locked board stays open for Smash, while accepting defeat ends it', () => {
  const gs=setup();
  gs.board=[[2,4,2,4],[4,2,4,2],[2,4,2,4],[4,2,4,2]];
  gs.movesLeft=5;
  assert.equal(Combat.hasLegalMove(gs.room.combat,gs.board,gs.kinds),false);
  assert.equal(Controller._checkFailure(),false);
  assert.equal(gs.stuck,true); assert.equal(gs.roomFinished,false); assert.equal(gs.run.hearts,3);
  assert.equal(Controller._checkFailure(true),true);
  assert.equal(gs.stuck,false); assert.equal(gs.roomFinished,true); assert.equal(gs.run.hearts,2);
});

test('Undo at zero moves restores play without losing a heart', () => {
  const gs=setup();
  gs.run.spells=[{id:'undo',charges:1}];
  gs.board[0][0]=2;
  gs.room.undo=Spells.snapshot(gs);
  gs.movesLeft=0;
  assert.equal(Controller._checkFailure(),false);
  assert.equal(gs.stuck,true); assert.equal(gs.roomFinished,false);
  assert.equal(Controller._castSpell(0,[]),true);
  assert.equal(gs.movesLeft,12); assert.equal(gs.stuck,false); assert.equal(gs.run.hearts,3);
});

test('target cursor moves over cells and confirms only a valid target', () => {
  const gs=setup();
  gs.board[0][0]=8; gs.board[0][2]=4;
  context.document={
    getElementById:id => id==='gameScreen' ? {classList:{contains:()=>true}} : {getAnimations:()=>[]},
    querySelector:()=>null,
  };
  assert.equal(Controller.selectSpell(0),true);
  assert.deepEqual(plain(gs.spellTarget.cursor),[0,0]);
  Controller.moveTargetCursor('right');
  assert.deepEqual(plain(gs.spellTarget.cursor),[0,1]);
  assert.equal(Controller.confirmSpellCursor(),false);
  Controller.moveTargetCursor('right');
  assert.equal(Controller.confirmSpellCursor(),true);
  assert.equal(gs.board[0][2],0); assert.equal(gs.spellTarget,null); assert.equal(gs.movesLeft,12);
});

test('merchant rolls seeded offers, applies prices and purchase conditions', () => {
  const gs=setup(); gs.room={floorIdx:0,rowIdx:1,nodeIdx:0,data:{type:'shop'}};
  Rng.seed(9); Controller._doShopRoom(); const offers=plain(gs.run.pendingShop);
  Rng.seed(9); Controller._doShopRoom(); assert.deepEqual(plain(gs.run.pendingShop),offers);
  assert.equal(offers.filter(o=>o.type==='relic').length,3);
  for (const offer of offers.filter(o=>o.type==='relic')) assert.equal(offer.price,{common:35,rare:55,epic:80,legendary:120}[RELICS.find(r=>r.id===offer.id).rarity]);
  assert.equal(offers.find(o=>o.type==='spell').price,45);
  const chargeIndex=offers.findIndex(o=>o.type==='charge');
  assert.equal(Controller.buyShop(chargeIndex),true); assert.equal(gs.run.gold,80); assert.equal(gs.run.spells[0].charges,3);
  assert.equal(Controller.buyShop(chargeIndex),false);
  assert.equal(Controller.shopAvailable(offers.find(o=>o.type==='heal')),false);
  gs.run.spells.push({id:'swap',charges:2}); assert.equal(Controller.shopAvailable(offers.find(o=>o.type==='spell')),false);
  gs.run.relics.push(RELICS.find(r=>r.isCurse)); assert.equal(Controller.shopAvailable(offers.find(o=>o.type==='cleanse')),true);
});

test('all eight event choices have translated labels and consequences, with restrictions', () => {
  const gs=setup();
  for (const event of EVENTS) for (const option of event.options) {
    for (const lang of ['fr','en']) for (const suffix of ['label','effect'])
      assert.ok(vm.runInContext(`I18n._data.${lang}['event.${event.id}.${option}.${suffix}']`,context));
  }
  gs.run.gold=0; gs.run.hearts=1;
  assert.equal(Controller.eventOptionStatus('peddler','buy'),'gold');
  assert.equal(Controller.eventOptionStatus('peddler','sell'),'hearts');
  assert.equal(Controller.eventOptionStatus('fountain','toss'),'gold');
  assert.equal(Controller.eventOptionStatus('dice','betGold'),'gold');
  assert.equal(Controller.eventOptionStatus('ambush','flee'),'gold');
  gs.run.spells[0].charges=3; assert.equal(Controller.eventOptionStatus('altar','pray'),'charges');
});

test('event outcomes modify state and persist next fight and boss pact', () => {
  const gs=setup();
  const choose=(id,option)=>{gs.run.pendingEvent={id,stage:'choice'}; return Controller.chooseEvent(option);};
  choose('altar','pray'); assert.equal(gs.run.spells[0].charges,3);
  choose('peddler','sell'); assert.equal(gs.run.hearts,2); assert.equal(gs.run.gold,140);
  choose('fountain','drink'); assert.equal(gs.run.hearts,3);
  choose('chest','disarm'); assert.equal(gs.run.gold,170); assert.equal(gs.run.nextFight.movesDelta,-6);
  choose('library','pages'); assert.equal(gs.run.gold,182);
  choose('pact','sign'); assert.equal(gs.run.bossHpMult,1.15); assert.ok(gs.run.relics.some(r=>r.rarity==='epic'));
  choose('dice','betGold'); assert.ok([162,207].includes(gs.run.gold));
  choose('ambush','flee'); assert.ok(gs.run.gold>=0);
  choose('altar','take'); assert.ok(gs.run.relics.some(r=>r.isCurse));
});

test('event relic promises still resolve when that rarity is already owned', () => {
  const gs=setup();
  gs.run.relics=RELICS.filter(r=>r.rarity==='rare');
  const before=gs.run.relics.length;
  assert.equal(Controller._eventRelic('rare'),true);
  assert.equal(gs.run.relics.length,before+1);
});

test('every event option advances to an outcome or starts its declared battle', () => {
  const startBattle=Controller._startBattleRoom;
  Controller._startBattleRoom=()=>{};
  for (const event of EVENTS) for (const option of event.options) {
    const gs=setup();
    gs.run.spells[0].charges=1;
    gs.run.hearts=3;
    gs.run.gold=100;
    gs.run.pendingEvent={id:event.id,stage:'choice'};
    assert.equal(Controller.chooseEvent(option),true,`${event.id}.${option}`);
    if (event.id==='ambush' && option==='fight') {
      assert.equal(gs.run.pendingAmbushRare,true);
      assert.equal(gs.run.pendingEvent,undefined);
    } else {
      assert.equal(gs.run.pendingEvent.stage, event.id==='library' && option==='study' ? 'spell' : 'outcome');
      if (gs.run.pendingEvent.stage==='outcome')
        assert.notEqual(vm.runInContext(`I18n.t('event.outcome.${gs.run.pendingEvent.outcome}')`,context),`event.outcome.${gs.run.pendingEvent.outcome}`);
    }
  }
  Controller._startBattleRoom=startBattle;
});

test('the next fight penalty is consumed once and pact raises boss HP', () => {
  const gs=setup();
  context.document={getElementById:()=>({innerHTML:''})};
  context.Icons={svg:()=>''}; context.showScreen=()=>{}; context.requestAnimationFrame=()=>{};
  Object.assign(context.Renderer,{hideRoomOverlay:()=>{},updateActiveRelics:()=>{},buildGrid:()=>{}});
  gs.run.nextFight={movesDelta:-6};
  gs.spellTarget={slot:1,targets:[]};
  gs.room.enemyDef=vm.runInContext("ENEMIES.find(e => e.id === 'rat')",context);
  Controller._startBattleRoom('normal',0);
  assert.equal(gs.movesMax,30); assert.equal(gs.run.nextFight,undefined);
  assert.equal(gs.spellTarget,null);
  gs.run.bossHpMult=1.15;
  gs.room={floorIdx:0,rowIdx:0,nodeIdx:0,data:{type:'boss'},enemyDef:vm.runInContext("ENEMIES.find(e => e.id === 'jailer')",context)};
  Controller._startBattleRoom('boss',0);
  assert.equal(gs.room.combat.maxHp,Math.ceil(294*1.15));
});

test('save round trip keeps decision state and migrates an old run', () => {
  const gs=setup(); gs.room=null;
  gs.run.spells=[{id:'smash',charges:1},{id:'swap',charges:3}]; gs.run.pendingShop=[{type:'charge',price:20,bought:false}];
  gs.run.pendingEvent={id:'pact',stage:'choice'}; gs.run.nextFight={movesDelta:-6}; gs.run.bossHpMult=1.15; gs.run.seenEvents=['pact'];
  Storage.saveRun(gs.run); const loaded=Storage.loadRun();
  for (const key of ['spells','pendingShop','pendingEvent','nextFight','bossHpMult','seenEvents']) assert.deepEqual(plain(loaded[key]),plain(gs.run[key]));
  saved.set(Storage.RUN_KEY,JSON.stringify({hearts:3,relics:[],battle:null}));
  assert.deepEqual(plain(Storage.loadRun().spells),[{id:'smash',charges:2}]);
});

test('merchant and event screens resume with their room coordinates', () => {
  const gs=setup();
  gs.run.pendingRoom={floorIdx:0,rowIdx:1,nodeIdx:0};
  gs.run.pendingShop=[{type:'charge',price:20,bought:false}];
  gs.room=null;
  Controller.resumeRun();
  assert.equal(gs.room.data.type,'shop');
  delete gs.run.pendingShop;
  gs.run.pendingEvent={id:'pact',stage:'choice'};
  gs.room=null;
  Controller.resumeRun();
  assert.equal(gs.room.rowIdx,1);
});

test('an active stuck battle persists its rescue prompt state', () => {
  const gs=setup();
  gs.stuck=true;
  Storage.saveRun(gs.run);
  assert.equal(Storage.loadRun().battle.stuck,true);
});

test('event relics never duplicate an owned relic and fall back to gold', () => {
  const ctx = context;
  vm.runInContext(`
    GameState.run = { gold: 0, relics: RELICS.filter(r => !r.isCurse), spells: [] };
    RelicHooks.invalidate();
  `, ctx);
  const granted = vm.runInContext(`Controller._eventRelic('rare')`, ctx);
  const state = vm.runInContext(`({ gold: GameState.run.gold, n: GameState.run.relics.length, total: RELICS.filter(r => !r.isCurse).length })`, ctx);
  assert.equal(granted, false);
  assert.equal(state.n, state.total);
  assert.equal(state.gold, 25);
});
