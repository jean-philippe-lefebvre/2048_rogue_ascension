import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({GameState:{run:null,room:null,_restDone:null}});
vm.runInContext(fs.readFileSync(new URL('../js/music.js',import.meta.url),'utf8'),context);
const Music = vm.runInContext('Music',context);
const room = (floor,type='normal',phase=1) => ({floorIdx:floor,data:{type},combat:{phase}});

test('music scene scales and tempo follow every context without AudioContext', () => {
  assert.equal(Music.tempoFor('titleScreen'),50);
  assert.equal(Music.tempoFor('mapScreen'),50);
  assert.equal(Music.sceneFor('titleScreen').half,true);
  assert.equal(Music.sceneFor('titleScreen').root,57);
  assert.equal(Music.tempoFor('shopScreen'),56);
  context.GameState._restDone=()=>{};
  assert.equal(Music.sceneFor('relicScreen').drone,false);
  context.GameState._restDone=null;
  const expected=[60,72,54];
  for (let floor=0;floor<3;floor++) {
    assert.equal(Music.tempoFor('gameScreen',{},room(floor)),expected[floor]);
    assert.equal(Music.tempoFor('gameScreen',{},room(floor,'boss')),expected[floor]+12);
    assert.equal(Music.tempoFor('gameScreen',{},room(floor,'boss',2)),expected[floor]+20);
  }
  assert.deepEqual(Array.from(Music.sceneFor('gameScreen',{},room(0)).notes),[0,3,5,7,9,10]);
  assert.deepEqual(Array.from(Music.sceneFor('gameScreen',{},room(1)).notes),[0,1,3,5,7,8,10]);
  assert.deepEqual(Array.from(Music.sceneFor('gameScreen',{},room(2)).notes),[0,2,4,6,8,10]);
  assert.deepEqual([0,1,2].map(floor=>Music.sceneFor('gameScreen',{},room(floor)).root),[50,52,59]);
});
