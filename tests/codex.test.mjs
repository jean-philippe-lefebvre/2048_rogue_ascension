import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const saves = new Map();
const context = vm.createContext({console,Date,setTimeout:()=>0,
  localStorage:{getItem:key=>saves.get(key) ?? null,setItem:(key,value)=>saves.set(key,value),removeItem:key=>saves.delete(key)},
  Renderer:{showAchievement(){},renderEndScreen(){},renderTitle(){},renderEnemy(){},updateHUD(){},renderMap(){}},
  Audio2:{win(){}}, Fx:{roomSuccess(){}}, showScreen(){},
});
for (const file of ['i18n','rng','constants','storage','state','board','combat','spells','controller'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const {Controller,Storage,GameState,RELICS,ACHIEVEMENTS,UNLOCKS,achievementMet,ENEMIES,Board,TILE} =
  vm.runInContext('({Controller,Storage,GameState,RELICS,ACHIEVEMENTS,UNLOCKS,achievementMet,ENEMIES,Board,TILE})',context);
const plain = value => JSON.parse(JSON.stringify(value));
const reset = () => {
  saves.clear(); GameState.meta = Storage.defaultMeta();
  GameState.run = {relics:[],spells:[],gold:0,hearts:3,tier:0,seed:123,character:'alchemist',floorIdx:0,
    stats:{biggestTile:0,bestDamage:0,goldEarned:0,floorsCleared:0},floors:[[[{type:'boss',bossId:'jailer'}]]],totalScore:0};
  GameState.room = null;
};

test('all achievement conditions have a threshold and rewards unlock their intended content', () => {
  reset();
  const facts = {
    firstblood:{event:'fight'}, jailbreak:{event:'boss',floor:0}, forged:{event:'boss',floor:1},
    gaze:{event:'run',win:true}, chain5:{event:'move',merges:5}, tile1024:{event:'record',rank:10},
    tile2048:{event:'record',rank:11}, rich:{event:'gold',gold:200}, flawless:{event:'run',win:true,hearts:3},
    pyro:{event:'bomb',count:10}, scholar:{event:'spell',count:50},
    ascetic:{event:'run',win:true,tier:5}, legend:{event:'run',win:true,tier:10},
    cartographer:{event:'run',win:true,tier:3}, usurer:{event:'run',win:true,tier:6},
  };
  assert.equal(ACHIEVEMENTS.length,15);
  for (const def of ACHIEVEMENTS) {
    const fact = facts[def.id];
    assert.ok(fact && achievementMet(def,fact),def.id);
    GameState.meta.achievements = GameState.meta.achievements.filter(id => id !== def.id);
    assert.equal(Controller.checkAchievements(fact).includes(def.id),true,def.id);
    assert.equal(Controller.checkAchievements(fact).includes(def.id),false,`${def.id} repeats`);
    if (def.reward) assert.equal(UNLOCKS[def.reward],def.id);
  }
  assert.equal(achievementMet(ACHIEVEMENTS.find(a=>a.id==='flawless'),{event:'run',win:false,hearts:3}),false);
  assert.equal(achievementMet(ACHIEVEMENTS.find(a=>a.id==='jailbreak'),{event:'boss',floor:1}),false);
  assert.equal(achievementMet(ACHIEVEMENTS.find(a=>a.id==='chain5'),{event:'move',merges:4}),false);
});

test('relic, enemy, records and 20 newest run entries persist', () => {
  reset();
  Controller._grantRelic(RELICS.find(r=>r.id==='magnet'));
  assert.deepEqual(plain(GameState.meta.codex.relics),['magnet']);
  Controller._grantRelic(RELICS.find(r=>r.id==='magnet'));
  assert.deepEqual(plain(GameState.meta.codex.relics),['magnet']);
  GameState.board = Board.empty(); GameState.board[0][0]=1024;
  Controller.recordMoveStats(GameState.board,321);
  Controller.earnedGold(200);
  assert.equal(GameState.meta.records.tile,1024);
  assert.equal(GameState.meta.records.hit,321);
  assert.equal(GameState.meta.records.gold,200);
  assert.ok(GameState.meta.achievements.includes('tile1024'));
  assert.ok(GameState.meta.achievements.includes('rich'));
  GameState.room = {floorIdx:0,rowIdx:0,nodeIdx:0,data:{type:'boss'},enemyDef:ENEMIES.find(e=>e.id==='jailer')};
  GameState.movesLeft=5; GameState.roomFinished=false;
  Controller._completeCurrentRoom = () => {};
  Controller._renderAfterMove = () => {};
  Controller._winRoom({merges:[]},'left');
  assert.equal(GameState.meta.codex.enemies.jailer,1);
  assert.ok(GameState.meta.achievements.includes('firstblood'));
  assert.ok(GameState.meta.achievements.includes('jailbreak'));
  for (let i=0;i<22;i++) { GameState.run.seed=i; Controller.recordRun('abandoned'); }
  assert.equal(GameState.meta.codex.runs.length,20);
  assert.equal(GameState.meta.codex.runs[0].seed,21);
  assert.equal(GameState.meta.codex.runs.at(-1).seed,2);
});

test('locked relics cannot enter normal, shop, rest, destiny or event pools and characters cannot be selected', () => {
  reset();
  const pool = Controller._getUnownedRelics();
  for (const id of ['chainreact','cornerstone','philosopher','wildcard']) assert.ok(!pool.some(r=>r.id===id));
  assert.equal(Controller.characterUnlocked('artificer'),false);
  assert.equal(Controller.characterUnlocked('monk'),false);
  assert.equal(Controller.chooseCharacter('artificer'),false);
  GameState.run.gold=999;
  assert.equal(Controller.shopAvailable({type:'relic',id:'chainreact',price:1,bought:false}),false);
  Controller.checkAchievements({event:'move',merges:5});
  assert.ok(Controller._getUnownedRelics().some(r=>r.id==='chainreact'));
  assert.equal(Controller.shopAvailable({type:'relic',id:'chainreact',price:1,bought:false}),true);
});

test('old saves migrate from evidence and a currently owned locked relic stays usable', () => {
  reset();
  saves.set(Storage.KEY,JSON.stringify({totalRuns:25,tierUnlocked:10,records:{tile:1024,hit:0,gold:200},codex:{relics:[],enemies:{},runs:[
    {result:'victory',tier:5,hearts:3,bosses:[0,1],seed:1},
  ]}}));
  const loaded = Storage.load();
  assert.ok(loaded.achievements.includes('jailbreak'));
  assert.ok(loaded.achievements.includes('forged'));
  assert.ok(loaded.achievements.includes('gaze'));
  assert.ok(loaded.achievements.includes('flawless'));
  assert.ok(loaded.achievements.includes('ascetic'));
  assert.ok(loaded.achievements.includes('tile1024'));
  assert.ok(loaded.achievements.includes('rich'));
  assert.ok(!loaded.achievements.includes('legend'));
  GameState.meta = loaded;
  GameState.run.relics.push(RELICS.find(r=>r.id==='wildcard'));
  assert.equal(Controller.relicUnlocked('wildcard'),true);
  assert.equal(Controller.relicUnlocked('chainreact'),false);
  saves.set(Storage.KEY,JSON.stringify({totalRuns:25,tierUnlocked:10}));
  assert.equal(Storage.load().achievements.includes('gaze'),false);
});

test('bomb defuses and spell casts accumulate across runs', () => {
  reset();
  GameState.room={combat:{seals:{}},data:{type:'normal'},floorIdx:0};
  GameState.board=Board.empty(); GameState.board[0][1]=TILE.BOMB;
  const timers={'0,1':3};
  GameState.meta.progress.bombs=9;
  const broken=Controller.breakHazards(GameState.room.combat,GameState.board,[{r:0,c:0,val:16}],timers);
  assert.equal(broken.length,1);
  assert.equal(GameState.meta.progress.bombs,10);
  assert.ok(GameState.meta.achievements.includes('pyro'));
  Controller.checkAchievements({event:'spell',count:49});
  assert.ok(!GameState.meta.achievements.includes('scholar'));
  Controller.checkAchievements({event:'spell',count:50});
  assert.ok(GameState.meta.achievements.includes('scholar'));
});
