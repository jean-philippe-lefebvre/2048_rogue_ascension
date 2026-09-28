import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saved = new Map();
const context = vm.createContext({ console, Date,
  localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
  showScreen:()=>{}, Renderer:{renderMap:()=>{}},
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {RELICS,RelicHooks,GameState,Storage,Board,Controller,Rng,TILE,CHARACTERS} =
  vm.runInContext('({RELICS,RelicHooks,GameState,Storage,Board,Controller,Rng,TILE,CHARACTERS})',context);
const relic = id => RELICS.find(r=>r.id===id);
const plain = x => JSON.parse(JSON.stringify(x));
function setup(ids=[]) {
  Rng.seed(123); GameState.meta=Storage.defaultMeta();
  GameState.run={character:'alchemist',gold:0,spells:[{id:'swap',charges:2}],relics:ids.map(relic),floorIdx:0};
  GameState.room={relicState:{},iceHits:{}}; GameState.board=Board.empty(); GameState.kinds=Board.emptyKinds();
  RelicHooks.invalidate(); return GameState;
}

test('all non-curse relics have valid families and seeded offers prefer shared tags',()=>{
  const valid=new Set(['gold','blast','chain','small','corner','control','tempo','spell']);
  for(const r of RELICS) assert.equal(r.isCurse ? r.tags.length===0 : r.tags.length>=1 && r.tags.length<=2 && r.tags.every(t=>valid.has(t)),true,r.id);
  setup(['greed']);
  const pool=[relic('magnet'),relic('focus')];
  Rng.seed(6); const withTag=Controller._pickRandom(pool,1)[0].id;
  Rng.seed(6); GameState.run.relics=[]; const withoutTag=Controller._pickRandom(pool,1)[0].id;
  assert.equal(withTag,'magnet'); assert.equal(withoutTag,'focus');
});

test('new spawn, room and ice relic hooks apply their rules',()=>{
  const gs=setup(['magnet','philosopher','catring','grimoire','frostbite','wildcard']);
  const spawn={value:2,position:[0,0],board:gs.board,empty:[[0,0]]};
  const original=Rng.next; Rng.next=()=>0.01; RelicHooks.fire('onTileSpawn',spawn); Rng.next=original;
  assert.equal(spawn.kind,'gold');
  // Through the real spawn path the gold kind lands on the tile, wherever the hooks placed it.
  gs.board.forEach(row=>row.fill(0)); gs.kinds.forEach(row=>row.fill(null));
  Rng.next=()=>0.01; const at=Board.addRandom(gs.board); Rng.next=original;
  assert.equal(gs.kinds[at[0]][at[1]],'gold'); assert.ok(gs.board[at[0]][at[1]]>0);
  RelicHooks.fire('onRoomStart',{board:gs.board,run:gs.run,type:'normal'});
  assert.equal(gs.board.flat().includes(TILE.MULT),true); assert.equal(gs.run.spells[0].charges,3);
  const result={merges:[{val:64,r:2,c:2}],cracked:[{r:1,c:1}],thawed:[]};
  gs.kinds[1][1]='ice'; gs.room.iceHits['1,1']=1;
  RelicHooks.fire('onAfterMove',{result,board:gs.board,freeMove:false});
  RelicHooks.fire('onIceThaw',{result,kinds:gs.kinds,iceHits:gs.room.iceHits});
  assert.equal(gs.kinds[2][2],'gold'); assert.equal(gs.kinds[1][1],null);
  assert.equal(gs.room.iceHits['1,1'],undefined);
  gs.run._wildcardMoves=11; RelicHooks.fire('onMoveCommitted',{result:{merges:[]},board:gs.board});
  assert.equal(gs.board.flat().includes(TILE.JOKER),true);
});

test('damage multipliers, chain steps, focus once, and powder floor correctly',()=>{
  const gs=setup(['focus','chainreact','cornerstone','swarm','powder']);
  const fight={hp:1000,maxHp:1000,block:0,invertTurns:1};
  const merges=[{val:4,r:0,c:0},{val:8,r:1,c:1}];
  assert.equal(Controller.damage(fight,merges).raw,Math.floor((4*2*3+8*3)*1.5*1.25*2));
  assert.equal(Controller.damage(fight,merges).raw,Math.floor((4*2*3+8*3)*1.5*1.25));
  const ctx={fight,damage:0}; RelicHooks.fire('onBombExplosion',ctx); assert.equal(ctx.damage,100);
});

test('repurposed relics and each character start and passive',()=>{
  let gs=setup(['haste','shield']);
  const moves={bonus:0}; RelicHooks.fire('onMovesCalc',moves); assert.equal(moves.bonus,4);
  gs.board[0][0]=TILE.BOMB; gs.board[0][1]=TILE.BOMB;
  const effect={intent:'bomb',cells:[[0,0],[0,1]]};
  RelicHooks.fire('onEnemyIntent',{effect,board:gs.board,bombTimers:{'0,0':3,'0,1':3}});
  assert.equal(gs.board[0][0],0); assert.equal(gs.board[0][1],TILE.BOMB);
  gs.board[1][0]=TILE.BOMB; RelicHooks.fire('onEnemyIntent',{effect:{intent:'bomb',cells:[[1,0]]},board:gs.board,bombTimers:{'1,0':3}});
  assert.equal(gs.board[1][0],TILE.BOMB);
  assert.deepEqual(plain(CHARACTERS.map(c=>c.id)),['alchemist','artificer','monk','cartographer','usurer']);
  for(const character of CHARACTERS) {
    GameState.meta=Storage.defaultMeta(); Controller._generateFloors=()=>[];
    Controller._beginRun(character.id);
    assert.equal(GameState.run.character,character.id);
    assert.equal(GameState.run.relics[0].id,character.relic);
    assert.deepEqual(plain(GameState.run.spells),[{id:character.spell,charges:2}]);
    if(character.id==='alchemist') assert.equal(Controller.shopPrice(55),44);
  }
  setup(['magnet']); gs.run.character='monk';
  assert.equal(Controller.damage({hp:1000,maxHp:1000,block:0,invertTurns:0},[{val:4},{val:4}]).raw,10);
  gs=setup(['chainreact']); gs.run.character='monk';
  assert.equal(Controller.damage({hp:1000,maxHp:1000,block:0,invertTurns:0},[{val:4},{val:4}]).raw,12);
  gs=setup(); gs.run.character='artificer'; gs.board[0][1]=TILE.BOMB; gs.bombTimers={'0,1':3};
  assert.equal(Controller.breakHazards({seals:{}},gs.board,[{r:0,c:0,val:8}],gs.bombTimers).length,1);
  assert.equal(gs.board[0][1],0);
});

test('character and fourth spell charge survive saves; old run migrates to alchemist',()=>{
  const gs=setup(['grimoire']); gs.run.character='artificer'; gs.run.spells[0].charges=4;
  Storage.saveRun(gs.run); assert.equal(Storage.loadRun().character,'artificer'); assert.equal(Storage.loadRun().spells[0].charges,4);
  saved.set(Storage.RUN_KEY,JSON.stringify({relics:[],spells:[{id:'smash',charges:2}]}));
  assert.equal(Storage.loadRun().character,'alchemist'); assert.equal(Storage.loadRun().spells[0].id,'smash');
});

test('Undo restores the Wild Card move counter', () => {
  const gs = setup(['wildcard']);
  gs.movesLeft = 10; gs.score = 0; gs.mergeCount = 0; gs.portals = []; gs.bombTimers = {}; gs.obstacleAge = {};
  gs.room.combat = { hp: 10 }; gs.run.totalScore = 0; gs.run.lastTileVal = 0; gs.run._wildcardMoves = 11;
  const Spells = vm.runInContext('Spells', context);
  const snap = Spells.snapshot(gs);
  RelicHooks.fire('onMoveCommitted', { result: { merges: [] }, board: gs.board });
  assert.equal(gs.run._wildcardMoves, 12);
  Spells.restore(gs, snap);
  assert.equal(gs.run._wildcardMoves, 11);
});

test('the Usurer cannot pay for Undo with gold that Undo takes back', () => {
  // Any display or sound call the cast makes is a no-op here; keep existing stubs.
  const lenient = obj => new Proxy(obj || {}, { get: (t, k) => (k in t ? t[k] : () => null) });
  for (const key of ['Audio2', 'Fx', 'Renderer', 'Music']) context[key] = lenient(context[key]);
  const gs = setup();
  gs.run.character = 'usurer'; gs.run.spells = [{ id:'undo', charges:0 }]; gs.run.gold = 30;
  gs.movesLeft = 10; gs.score = 0; gs.mergeCount = 0; gs.portals = []; gs.bombTimers = {}; gs.obstacleAge = {};
  gs.room.combat = vm.runInContext('Combat.create(ENEMIES[0])', context); gs.room.data = { type:'normal' }; gs.run.totalScore = 0; gs.run.lastTileVal = 0; gs.run.hearts = 3;
  gs.board[0][0] = 2; gs.board[0][1] = 2;
  const Spells = vm.runInContext('Spells', context);
  gs.run.gold = 5; gs.room.undo = Spells.snapshot(gs); gs.run.gold = 30;
  assert.equal(Controller._castSpell(0, []), false);
  assert.equal(gs.run.gold, 30);
  gs.run.gold = 40; gs.room.undo = Spells.snapshot(gs); gs.run.gold = 60;
  assert.equal(Controller._castSpell(0, []), true);
  assert.equal(gs.run.gold, 15);
});
