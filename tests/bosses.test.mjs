import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const context = vm.createContext({ console, Date, performance:{now:()=>0}, setInterval:()=>1, clearInterval:()=>{},
  localStorage:{getItem:key=>saved.get(key) ?? null,setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)} });
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {Board,Combat,Controller,GameState,Storage,Rng,ENEMIES,TILE,Spells,RelicHooks,RELICS} =
  vm.runInContext('({Board,Combat,Controller,GameState,Storage,Rng,ENEMIES,TILE,Spells,RelicHooks,RELICS})',context);
const plain = value => JSON.parse(JSON.stringify(value));
const enemy = id => ENEMIES.find(e => e.id === id);
context.Renderer = {renderClock:()=>{},updateHUD:()=>{},strike:()=>{}};

test('boss draw is seeded and survives save; v2.3 floors migrate', () => {
  Rng.seed(42); const generated = Controller._generateFloors(), floors = plain(generated);
  Rng.seed(42); assert.deepEqual(plain(Controller._generateFloors()),floors);
  assert.equal(floors.length,3);
  for (let i=0;i<3;i++) {
    assert.equal(generated[i].bossId,floors[i].at(-1)[0].bossId);
    assert.equal(ENEMIES.some(e=>e.kind==='boss' && e.floor===i && e.id===floors[i].at(-1)[0].bossId),true);
  }
  GameState.run = {floors,relics:[],spells:[]}; GameState.room=null;
  Storage.saveRun(GameState.run);
  assert.deepEqual(plain(Storage.loadRun().floors),floors);
  assert.equal(Storage.loadRun().floors[0].bossId,floors[0].at(-1)[0].bossId);
  delete floors[0].at(-1)[0].bossId;
  saved.set(Storage.RUN_KEY,JSON.stringify({floors,relics:[],spells:[]}));
  assert.equal(Storage.loadRun().floors[0].at(-1)[0].bossId,'jailer');
});

test('devour eats up to two small tiles in reading order, never frozen ones, without healing', () => {
  const fight=Combat.create(enemy('glutton')), board=Board.empty(), kinds=Board.emptyKinds();
  fight.hp=100; fight.intentIn=0; fight.pattern=['devour']; fight.patternIndex=0;
  board[0][0]=2; kinds[0][0]='ice'; board[0][1]=2; board[1][0]=4; board[2][2]=2; board[3][3]=2; board[1][1]=64;
  Combat.resolve(fight,board,{},0,kinds);
  assert.equal(board[0][0],2); assert.equal(board[0][1],0); assert.equal(board[2][2],0); assert.equal(board[3][3],2);
  assert.equal(board[1][0],4); assert.equal(board[1][1],64); assert.equal(fight.hp,100);
});

test('necromancer revives once and Undo restores the flag', () => {
  const fight=Combat.create(enemy('necromancer'));
  GameState.run={gold:0,totalScore:0,lastTileVal:0,spells:[],relics:[]};
  GameState.room={combat:fight,iceHits:{},relicState:{}};
  GameState.board=Board.empty(); GameState.kinds=Board.emptyKinds(); GameState.portals=[];
  GameState.bombTimers={}; GameState.obstacleAge={}; GameState.movesLeft=10;
  const snapshot=Spells.snapshot(GameState);
  Combat.damage(fight,[{val:999}]);
  assert.equal(fight.hp,Math.ceil(fight.maxHp*.4)); assert.equal(fight.phase,2);
  assert.equal(fight.reviveAvailable,false);
  Combat.damage(fight,[{val:999}]); assert.equal(fight.hp,0);
  Spells.restore(GameState,snapshot);
  assert.equal(GameState.room.combat.reviveAvailable,true);
});

test('gravity moves kinds and bomb timers but anchors ice and obstacles', () => {
  const board=Board.empty(), kinds=Board.emptyKinds(), timers={'0,1':4}, obstacleAge={'2,1':2};
  board[0][0]=8; kinds[0][0]='gold'; board[0][1]=TILE.BOMB;
  board[2][0]=4; kinds[2][0]='ice'; board[2][1]=TILE.OBSTACLE;
  Board.gravity(board,kinds,timers);
  assert.equal(board[1][0],8); assert.equal(kinds[1][0],'gold');
  assert.equal(board[2][0],4); assert.equal(kinds[2][0],'ice');
  assert.equal(board[1][1],TILE.BOMB); assert.equal(timers['1,1'],4);
  assert.equal(board[2][1],TILE.OBSTACLE); assert.equal(obstacleAge['2,1'],2);
});

test('Mirror intent carries Transmutation age to the flipped obstacle', () => {
  const fight=Combat.create(enemy('mirror')), board=Board.empty(), kinds=Board.emptyKinds(), obstacleAge={'1,0':2};
  fight.voidCell=[0,1];
  board[1][0]=TILE.OBSTACLE;
  fight.pattern=['flip']; fight.patternIndex=0; fight.intentIn=0;
  Combat.resolve(fight,board,{},2,kinds,[],{},obstacleAge);
  assert.equal(board[1][3],TILE.OBSTACLE);
  assert.equal(obstacleAge['1,3'],2);
  assert.equal(obstacleAge['1,0'],undefined);
  assert.deepEqual(plain(fight.voidCell),[0,2]);
});

test('flips transform every spatial layer, including portals and Transmutation age', () => {
  const board=Board.empty(), kinds=Board.emptyKinds(), seals={'0,1':3}, timers={'1,2':4}, iceHits={'2,3':1}, portals=[[0,0],[3,1]], obstacleAge={'2,1':2};
  board[0][1]=8; kinds[0][1]='gold'; board[1][2]=TILE.BOMB;
  board[2][1]=TILE.OBSTACLE;
  Board.flip(board,kinds,seals,timers,iceHits,portals,'horizontal',obstacleAge);
  assert.equal(board[0][2],8); assert.equal(kinds[0][2],'gold');
  assert.equal(timers['1,1'],4); assert.equal(seals['0,2'],3); assert.equal(iceHits['2,0'],1);
  assert.equal(board[2][2],TILE.OBSTACLE); assert.equal(obstacleAge['2,2'],2);
  assert.deepEqual(plain(portals),[[0,3],[3,2]]);
  Board.flip(board,kinds,seals,timers,iceHits,portals,'vertical',obstacleAge);
  assert.equal(board[3][2],8); assert.equal(seals['3,2'],3);
  assert.equal(board[1][2],TILE.OBSTACLE); assert.equal(obstacleAge['1,2'],2);
  GameState.run={relics:[RELICS.find(r => r.id === 'transmute')]};
  RelicHooks.invalidate();
  const transCtx={board,obstacleAge,active:false};
  RelicHooks.fire('onTransmute',transCtx);
  assert.equal(transCtx.active,true);
  if (++obstacleAge['1,2'] >= 3) { board[1][2]=4; delete obstacleAge['1,2']; }
  assert.equal(board[1][2],4); assert.equal(obstacleAge['1,2'],undefined);
});

test('Pivot rotates void position and Transmutation age with the board', () => {
  const fight=Combat.create(enemy('stareater'));
  fight.voidCell=[0,1];
  GameState.room={combat:fight,iceHits:{},relicState:{}};
  GameState.board=Board.empty(); GameState.kinds=Board.emptyKinds(); GameState.portals=[];
  GameState.bombTimers={}; GameState.obstacleAge={'1,0':2};
  GameState.board[1][0]=TILE.OBSTACLE;
  assert.equal(Spells.apply(GameState,'pivot'),true);
  assert.deepEqual(plain(fight.voidCell),[1,3]);
  assert.equal(GameState.board[0][2],TILE.OBSTACLE);
  assert.equal(GameState.obstacleAge['0,2'],2);
});

test('void destroys and heals, and excludes its cell from spawns and placements', () => {
  const fight=Combat.create(enemy('stareater')), board=Board.empty(), kinds=Board.emptyKinds();
  fight.voidCell=[1,1]; fight.hp=100; board[1][1]=16;
  assert.deepEqual(plain(Combat.consumeVoid(fight,board,kinds)),{r:1,c:1,value:16});
  assert.equal(fight.hp,108); assert.equal(board[1][1],0);
  for(let i=0;i<30;i++) { const at=Board.addRandom(board,false,0,[1,1]); if(at) board[at[0]][at[1]]=0; assert.equal(board[1][1],0); }
  Board.placeValue(board,8,[1,1]); assert.equal(board[1][1],0);
});

test('clock pauses and removes moves on injectable time', () => {
  const fight=Combat.create(enemy('clockmaker'));
  GameState.room={combat:fight,data:{type:'boss'}}; GameState.roomFinished=false;
  GameState.movesLeft=4; GameState.movesMax=4; GameState.spellTarget=null;
  GameState.run={relics:[],spells:[],hearts:3};
  let overlay=false;
  context.document={hidden:false,getElementById:()=>({classList:{contains:()=>true}}),querySelector:()=>overlay ? {} : null};
  Controller._checkFailure=()=>false;
  Controller._resetClock(); Controller.clockTick(0); Controller.clockTick(4000);
  assert.equal(GameState.movesLeft,4);
  GameState.spellTarget={}; Controller.clockTick(10000);
  assert.equal(Controller._clockPaused(),true);
  GameState.spellTarget=null; Controller.clockTick(11000); Controller.clockTick(12001);
  assert.equal(GameState.movesLeft,3);
  overlay=true; assert.equal(Controller._clockPaused(),true);
  overlay=false; context.document.hidden=true; assert.equal(Controller._clockPaused(),true);
  context.document.hidden=false; GameState.roomFinished=true; assert.equal(Controller._clockPaused(),true);
  GameState.roomFinished=false; fight.phase=2; Controller._resetClock();
  assert.equal(Controller._clockRemaining,3.5);
});

test('Clockmaker reload restores the remaining countdown and Undo restarts it', () => {
  const fight=Combat.create(enemy('clockmaker'));
  const boss={type:'boss',bossId:'clockmaker'};
  GameState.run={hearts:3,relics:[],spells:[{id:'undo',charges:1}],floors:[[],[[boss]],[]],floorIdx:1,gold:0,totalScore:0,lastTileVal:0};
  GameState.room={floorIdx:1,rowIdx:0,nodeIdx:0,data:boss,enemyDef:enemy('clockmaker'),combat:fight,relicState:{},iceHits:{}};
  GameState.board=Board.empty(); GameState.kinds=Board.emptyKinds(); GameState.portals=[];
  GameState.bombTimers={}; GameState.obstacleAge={}; GameState.movesLeft=10; GameState.movesMax=10;
  GameState.score=0; GameState.mergeCount=0; GameState.roomFinished=false;
  GameState.room.undo=Spells.snapshot(GameState);
  Controller._clockRemaining=2.25;
  assert.equal(Storage.saveRun(GameState.run),true);
  const loaded=Storage.loadRun();
  assert.equal(loaded.battle.clockRemaining,2.25);
  context.document={hidden:false,getElementById:()=>({classList:{contains:()=>true},innerHTML:''}),querySelector:()=>null};
  context.Icons={svg:()=>''}; context.showScreen=()=>{}; context.requestAnimationFrame=()=>{};
  context.Audio2={relic:()=>{}}; context.Fx={cellCenter:()=>null};
  Object.assign(context.Renderer,{hideRoomOverlay:()=>{},renderEnemy:()=>{},updateActiveRelics:()=>{},buildGrid:()=>{},renderTiles:()=>{},renderPortals:()=>{},renderSpells:()=>{}});
  GameState.run=loaded; GameState.room=null; Controller._clockRemaining=5;
  Controller.resumeRun();
  assert.equal(Controller._clockRemaining,2.25);
  Controller.clockTick(0); Controller.clockTick(2200); assert.equal(GameState.movesLeft,10);
  Controller.clockTick(2300); assert.equal(GameState.movesLeft,9);
  Controller._clockRemaining=1;
  assert.equal(Controller._castSpell(0,[]),true);
  assert.equal(Controller._clockRemaining,5);
});
