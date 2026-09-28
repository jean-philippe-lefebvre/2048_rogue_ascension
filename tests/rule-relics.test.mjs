import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const context = vm.createContext({ console, Date,
  localStorage:{getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value)},
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','renderer','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {Board,Combat,Spells,Renderer,Controller,GameState,Storage,Rng,RELICS,RelicHooks,TILE} =
  vm.runInContext('({Board,Combat,Spells,Renderer,Controller,GameState,Storage,Rng,RELICS,RelicHooks,TILE})',context);
const plain = value => JSON.parse(JSON.stringify(value));
const relic = id => RELICS.find(r => r.id === id);
function room(ids=[],size=4,base=2) {
  Rng.seed(42); GameState.size=size; GameState.base=base;
  GameState.meta=Storage.defaultMeta();
  GameState.run={relics:ids.map(relic),character:'alchemist',gold:0,totalScore:0,lastTileVal:0,spells:[]};
  GameState.room={iceHits:{},relicState:{},combat:Combat.create({id:'rat',hp:180,cadence:4,pattern:['gnaw']})};
  GameState.board=Board.empty(); GameState.kinds=Board.emptyKinds(); GameState.portals=[];
  GameState.bombTimers={}; GameState.obstacleAge={}; GameState.movesLeft=20;
  GameState.movesMax=20; GameState.score=0; GameState.mergeCount=0;
  RelicHooks.invalidate(); return GameState;
}

test('5×5 slide, merge, legal move and spawn cover the final row and column',()=>{
  const gs=room([],5);
  gs.board[4][4]=2; gs.board[4][3]=2;
  const result=Board.applyMove(gs.board,'left',{kinds:gs.kinds});
  assert.equal(gs.board[4][0],4);
  assert.deepEqual(plain([result.merges[0].r,result.merges[0].c]),[4,0]);
  assert.equal(Board.canMove(gs.board,gs.kinds),true);
  const full=Array.from({length:5},(_,r)=>Array.from({length:5},(_,c)=>2 ** (r*5+c+1)));
  assert.equal(Board.canMove(full,Board.emptyKinds(5)),false);
  const only=Board.empty(5); for(let r=0;r<5;r++) for(let c=0;c<5;c++) only[r][c]=TILE.OBSTACLE;
  only[4][4]=0; Board.addRandom(only); assert.ok(only[4][4]>0);
});

test('5×5 pivot, flip, gravity, portals and void transform edge cells',()=>{
  const gs=room([],5);
  gs.board[0][4]=8; gs.kinds[0][4]='gold'; gs.portals=[[0,4],[4,0]];
  gs.room.combat.voidCell=[4,4]; gs.room.combat.seals={'0,4':2};
  Spells.apply(gs,'pivot');
  assert.equal(gs.board[4][4],8); assert.equal(gs.kinds[4][4],'gold');
  assert.deepEqual(plain(gs.portals),[[4,4],[0,0]]);
  assert.deepEqual(plain(gs.room.combat.voidCell),[4,0]);
  assert.equal(gs.room.combat.seals['4,4'],2);
  Board.flip(gs.board,gs.kinds,gs.room.combat.seals,gs.bombTimers,gs.room.iceHits,gs.portals,'horizontal');
  assert.equal(gs.board[4][0],8); assert.equal(gs.room.combat.seals['4,0'],2);
  gs.board[0][2]=6; Board.gravity(gs.board,gs.kinds,gs.bombTimers);
  assert.equal(gs.board[4][2],6);
  gs.portals=[[4,0],[4,4]]; gs.board[4][4]=0;
  Board.applyPortals(gs.board,gs.kinds,gs.bombTimers,gs.portals);
  assert.equal(gs.board[4][4],8);
  gs.room.combat.voidCell=[4,4];
  assert.equal(Combat.consumeVoid(gs.room.combat,gs.board,gs.kinds).value,8);
});

test('base-3 rank, spawn series, joker merge, gold and bomb floor',()=>{
  const gs=room([],5,3);
  assert.equal(Board.rank(3),1); assert.equal(Board.rank(6),2); assert.equal(Board.rank(3072),11);
  assert.equal(Renderer.tileClass(3),'t2'); assert.equal(Renderer.tileClass(6),'t4');
  assert.equal(Renderer.tileClass(3072),'t2048');
  for(let i=0;i<12;i++) { const [r,c]=Board.addRandom(gs.board); assert.ok([3,6].includes(gs.board[r][c])); }
  gs.board=Board.empty(); gs.kinds=Board.emptyKinds();
  gs.board[0][0]=TILE.JOKER; gs.board[0][1]=TILE.JOKER;
  Board.applyMove(gs.board,'left',{kinds:gs.kinds}); assert.equal(gs.board[0][0],6);
  gs.board=Board.empty(); gs.kinds=Board.emptyKinds();
  gs.board[0][0]=12; gs.board[0][1]=12; gs.kinds[0][1]='gold';
  assert.equal(Board.applyMove(gs.board,'left',{kinds:gs.kinds}).gold,2);
  gs.board=Board.empty(); gs.board[0][0]=TILE.BOMB; gs.board[0][1]=3;
  Board.tickBombs(gs.board,{'0,0':1},gs.kinds); assert.equal(gs.board[0][1],3);
});

test('base-3 meta upgrades spawn at their specified ranks',()=>{
  const gs=room([],5,3);
  for(let level=1;level<=3;level++) {
    gs.board=Board.empty();
    const [r,c]=Board.addRandom(gs.board,false,level);
    assert.equal(Board.rank(gs.board[r][c]),level+2);
    assert.equal(Board.rank(3 * 2 ** level),level+1);
  }
});

test('base-3 slow, eclipse, enemy tile intents and high-rank hooks',()=>{
  const gs=room(['slow'],5,3);
  const spawn={value:12,board:gs.board,empty:[[0,0]],position:[0,0]};
  RelicHooks.fire('onTileSpawn',spawn); assert.equal(spawn.value,6);
  gs.run.relics=[relic('eclipse')]; RelicHooks.invalidate();
  for(const [value,expected] of [[3,6],[6,6],[12,24],[48,96],[768,1536]]) {
    const ctx={value,board:gs.board,empty:[[0,0]],position:[0,0]};
    RelicHooks.fire('onTileSpawn',ctx); assert.equal(ctx.value,expected);
  }
  gs.board[0][0]=12; gs.board[0][1]=3;
  const fight=gs.room.combat; fight.pattern=['freeze']; fight.intentIn=0;
  Combat.resolve(fight,gs.board,{},0,gs.kinds); assert.equal(gs.kinds[0][0],'ice');
  gs.kinds[0][0]=null; fight.pattern=['gnaw']; fight.patternIndex=0; fight.intentIn=0;
  Combat.resolve(fight,gs.board,{},0,gs.kinds); assert.equal(gs.board[0][0],6);
  fight.pattern=['devour']; fight.patternIndex=0; fight.intentIn=0;
  Combat.resolve(fight,gs.board,{},0,gs.kinds); assert.equal(gs.board[0][1],0);
});

test('rank-mapped relics and thresholds follow the base-3 series',()=>{
  const gs=room(['entropy','slow','eclipse','blade','hourglass','swarm','philosopher','cornerstone'],5,3);
  const spawn={value:3,board:gs.board,empty:[[0,0]],position:[0,0]};
  RelicHooks.fire('onTileSpawn',spawn); assert.equal(spawn.value,6);
  const after={result:{merges:[{r:0,c:0,val:6,normal:true},{r:4,c:4,val:96,normal:true}]},board:gs.board,addMove:0};
  gs.board[0][0]=6; gs.board[4][4]=96;
  RelicHooks.fire('onAfterMove',after);
  assert.equal(after.result.merges[0].val,12); assert.equal(gs.board[0][0],12);
  assert.equal(after.addMove,1); assert.equal(gs.kinds[4][4],'gold');
  const damage={merges:[{r:0,c:0,val:6,damageMultiplier:1},{r:4,c:4,val:12,damageMultiplier:1}],multiplier:1,comboStep:.25};
  RelicHooks.fire('onDamageCalc',damage);
  assert.deepEqual(plain(damage.merges.map(m=>m.damageMultiplier)),[6,6]);
  const fight=gs.room.combat; gs.board[0][1]=TILE.BOMB; const timers={'0,1':5};
  assert.equal(Combat.breakHazards(fight,gs.board,[{r:0,c:0,val:24}],timers).length,1);
  gs.board[0][1]=TILE.BOMB; timers['0,1']=5;
  assert.equal(Controller.breakHazards(fight,gs.board,[{r:0,c:0,val:12}],timers).length,0);
  gs.run.character='artificer';
  assert.equal(Controller.breakHazards(fight,gs.board,[{r:0,c:0,val:12}],timers).length,1);
});

test('Expanse move bonus, Trinity HP, battle save and Undo preserve room rules',()=>{
  const gs=room(['expanse','trinity'],5,3);
  const move={base:36,bonus:0}; RelicHooks.fire('onMovesCalc',move); assert.equal(move.base+move.bonus,40);
  RelicHooks.fire('onRoomStart',{board:gs.board,run:gs.run,type:'normal'});
  assert.equal(gs.room.combat.maxHp,252);
  gs.room.floorIdx=0; gs.room.rowIdx=0; gs.room.nodeIdx=0; gs.room.enemyDef={id:'rat'};
  Storage.saveRun(gs.run);
  const loaded=Storage.loadRun(); assert.equal(loaded.battle.size,5); assert.equal(loaded.battle.base,3);
  assert.equal(loaded.battle.board.length,5);
  const snap=Spells.snapshot(gs); gs.size=4; gs.base=2; Spells.restore(gs,snap);
  assert.equal(gs.size,5); assert.equal(gs.base,3);
  delete loaded.battle.size; delete loaded.battle.base;
  saved.set(Storage.RUN_KEY,JSON.stringify(loaded));
  assert.equal(Storage.loadRun().battle.size,5); assert.equal(Storage.loadRun().battle.base,2);
});

test('Singularity triggers at base-3 rank 7 and doubles the 5×5 board',()=>{
  const gs=room([],5,3);
  gs.run.singularityReady=true;
  gs.room.data={type:'normal'}; gs.room.floorIdx=0;
  gs.room.enemyDef={id:'rat',hp:1000,cadence:100,pattern:['heal']};
  gs.room.combat=Combat.create(gs.room.enemyDef);
  gs.board[4][0]=96; gs.board[4][1]=96;
  gs.board[0][4]=3;
  context.Fx={cellCenter:()=>null};
  const hit=Renderer.enemyHit, render=Renderer.renderEnemy;
  Renderer.enemyHit=()=>{}; Renderer.renderEnemy=()=>{};
  const after=Controller._renderAfterMove, check=Controller._checkFailure;
  Controller._renderAfterMove=()=>{}; Controller._checkFailure=()=>false;
  try {
    Controller.move('left');
    assert.equal(gs.run.singularityReady,false);
    assert.equal(gs.board[4][0],384);
    assert.equal(gs.board[0][0],6);
  } finally {
    Controller._renderAfterMove=after; Controller._checkFailure=check;
    Renderer.enemyHit=hit; Renderer.renderEnemy=render;
  }
});

test('the next battle activates both rule relics without changing an active room',()=>{
  const gs=room([],4,2);
  gs.run.spells=[{id:'swap',charges:2}];
  gs.meta.upgrades.startTile=3;
  gs.meta.upgrades.forgedEntropy=1;
  gs.room={floorIdx:0,rowIdx:0,nodeIdx:0,data:{type:'normal'}};
  Controller._grantRelic(relic('expanse')); Controller._grantRelic(relic('trinity'));
  assert.equal(gs.size,4); assert.equal(gs.base,2);
  const methods=['renderEnemy','hideRoomOverlay','updateHUD','updateActiveRelics','buildGrid','renderClock'];
  const originals=Object.fromEntries(methods.map(key=>[key,Renderer[key]]));
  for(const key of methods) Renderer[key]=()=>{};
  const element={innerHTML:'',scrollTop:0,classList:{add:()=>{},remove:()=>{}}};
  context.document={querySelectorAll:()=>[],getElementById:()=>element,addEventListener:()=>{}};
  context.window={matchMedia:()=>({matches:true})};
  context.Scene={forScreen:()=>{}};
  context.Icons={svg:()=>''};
  context.requestAnimationFrame=()=>{};
  try {
    Controller._startBattleRoom('normal',0);
    assert.equal(gs.size,5); assert.equal(gs.base,3);
    assert.equal(gs.board.length,5); assert.equal(gs.kinds.length,5);
    assert.equal(gs.board.flat().filter(v=>v===12).length,2);
    assert.ok(gs.board.flat().includes(24));
    assert.equal(gs.movesMax,40);
    assert.equal(gs.room.combat.maxHp,Math.ceil(gs.room.enemyDef.hp*1.4));
  } finally {
    Controller._stopClock();
    for(const key of methods) Renderer[key]=originals[key];
  }
});

test('Web stays a curse and Mirror converts its saved tile to the current base', () => {
  const ctx = context;
  const web = vm.runInContext(`(() => { GameState.run = { relics:[RELICS.find(r => r.id === 'web')] }; RelicHooks.invalidate();
    const m = { base:36, bonus:0 }; RelicHooks.fire('onMovesCalc', m); return m.bonus; })()`, ctx);
  assert.equal(web, -3);
  const placed = vm.runInContext(`(() => { GameState.base = 3; GameState.size = 4; const board = Board.empty(4);
    GameState.run = { relics:[RELICS.find(r => r.id === 'mirror')], lastTileVal:16, lastTileRank:4 }; RelicHooks.invalidate();
    RelicHooks.fire('onRoomStart', { board, run:GameState.run, type:'normal' }); return board.flat().filter(v => v > 0); })()`, ctx);
  assert.deepEqual([...placed], [24]);
});
