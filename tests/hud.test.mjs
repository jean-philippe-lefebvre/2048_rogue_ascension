import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const rendererSource = readFileSync(new URL('../js/renderer.js', import.meta.url), 'utf8');
const context = vm.createContext({localStorage:{getItem:()=>null}});
vm.runInContext(readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8'), context);
vm.runInContext(rendererSource, context);
const hud = vm.runInContext('({ trayVisibleCount: Renderer.trayVisibleCount, relicState: Renderer.relicState, intentHelpParams: Renderer.intentHelpParams, i18n: I18n })', context);

test('relic tray reserves room for the overflow count', () => {
  assert.equal(hud.trayVisibleCount(343, 8), 8);
  assert.equal(hud.trayVisibleCount(100, 8), 1);
  assert.equal(hud.trayVisibleCount(343, 20), 10);
  const at320 = hud.trayVisibleCount(268, 12);
  assert.equal(at320, 8);
  assert.ok(at320 * 25 + at320 * 2 + 36 + 16 <= 268);
  assert.ok((at320 + 1) * 25 + (at320 + 1) * 2 + 36 + 16 > 268);
  assert.equal(hud.trayVisibleCount(268, 20), 7);
  assert.equal(hud.trayVisibleCount(0, 2), 0);
});

test('relic usage follows room and run state', () => {
  const room = { relicState: { _tideUsed: true, _focusUsed: true, _shieldUsed: true } };
  assert.equal(hud.relicState({ id:'tide' }, room, {}), 'usedRoom');
  assert.equal(hud.relicState({ id:'focus' }, room, {}), 'usedRoom');
  assert.equal(hud.relicState({ id:'shield' }, room, {}), 'usedRoom');
  assert.equal(hud.relicState({ id:'vortex' }, room, {}), '');
  assert.equal(hud.relicState({ id:'phoenix' }, room, { _phoenixReady:false }), 'usedRun');
  assert.equal(hud.relicState({ id:'phoenix' }, room, { _phoenixReady:true }), 'availableRun');
  assert.equal(hud.relicState({ id:'wildcard' }, room, {}), 'wildcard');
});

test('visible combat and map screens measure their own trays', () => {
  const screen = () => {
    const classes = new Set(['screen']);
    return {classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},scrollTop:0};
  };
  const game = screen(), map = screen(), scrim = {classList:{remove:()=>{}}};
  const ids = {gameScreen:game,mapScreen:map,hudScrim:scrim};
  context.document = {getElementById:id=>ids[id],querySelectorAll:selector=>selector === '.screen' ? [game,map] : []};
  context.window = {matchMedia:()=>({matches:true})};
  context.Scene = {forScreen:()=>{}};
  context.Music = {forScreen:()=>{}};
  const calls = [];
  vm.runInContext('Renderer.renderRelicTray = id => globalThis.trayCalls.push([id, document.getElementById(id === "mapRelics" ? "mapScreen" : "gameScreen").classList.contains("active")])', Object.assign(context,{trayCalls:calls}));
  vm.runInContext('showScreen("gameScreen"); showScreen("mapScreen")',context);
  assert.equal(JSON.stringify(calls),JSON.stringify([['combatRelicTray',true],['mapRelics',true]]));
});

test('intent help uses live seal, strike and tile values in French', () => {
  const text = (id, params) => hud.i18n.t('intent.'+id+'.help',params);
  assert.match(text('seal',hud.intentHelpParams('seal',{id:'jailer'},0,0,2)), /8 coups.*16/);
  assert.match(text('seal2',hud.intentHelpParams('seal2',{id:'jailer'},0,0,2)), /8 coups/);
  assert.match(text('seal',hud.intentHelpParams('seal',{id:'sentinel'},0,0,2)), /6 coups/);
  assert.equal(text('strike',hud.intentHelpParams('strike',{id:'eye'},2,9,2)), 'Tu perds 4 coups.');
  assert.match(text('seal',hud.intentHelpParams('seal',{id:'sentinel'},0,0,3)), /24/);
  assert.match(text('freeze',hud.intentHelpParams('freeze',{id:'prophet'},2,0,3)), /12/);
  assert.match(text('devour',hud.intentHelpParams('devour',{id:'glutton'},0,0,3)), /3\./);
  context.Board = {base:()=>3};
  assert.equal(hud.intentHelpParams('freeze',{id:'prophet'},2,0).v,12);
});

test('a targeted spell blurs its launch button before rendering targets', () => {
  let blurred = 0;
  const state = {size:4,base:2,run:{spells:[{id:'swap',charges:2}]},room:{combat:{}},board:[[2,2],[0,0]]};
  const controllerContext = vm.createContext({
    GameState:state, GRID_SIZE:4, SPELLS:[{id:'swap',targets:2}],
    Spells:{canCast:()=>true,valid:()=>true}, Renderer:{renderSpells:()=>{}},
    document:{activeElement:{blur:()=>{blurred++;}},getElementById:()=>({classList:{contains:()=>true},getAnimations:()=>[]}),querySelector:()=>null},
  });
  vm.runInContext(readFileSync(new URL('../js/controller.js', import.meta.url), 'utf8'),controllerContext);
  assert.equal(vm.runInContext('Controller.selectSpell(0)',controllerContext),true);
  assert.equal(blurred,1);
  assert.equal(state.spellTarget.slot,0);
});

test('Enter and Space confirm a target even if a button has focus', () => {
  let onKey, confirmations = 0;
  const inputContext = vm.createContext({
    GameState:{spellTarget:{slot:0}},
    document:{activeElement:{tagName:'BUTTON'},addEventListener:()=>{},querySelector:()=>null},
    window:{addEventListener:(event,callback)=>{if(event==='keydown') onKey=callback;}},
    Controller:{confirmSpellCursor:()=>{confirmations++;}},Audio2:{unlock:()=>{}},
  });
  const source = readFileSync(new URL('../js/input.js', import.meta.url), 'utf8').split('// ── BOOT ──')[0];
  vm.runInContext(source,inputContext);
  vm.runInContext('Input.init()',inputContext);
  for (const key of ['Enter',' ']) {
    let prevented = false, stopped = false;
    onKey({key,keyCode:0,preventDefault:()=>{prevented=true;},stopImmediatePropagation:()=>{stopped=true;}});
    assert.equal(prevented,true);
    assert.equal(stopped,true);
  }
  assert.equal(confirmations,2);
});

test('spell card separates the free cast note and targeting hint with a period', () => {
  const pop = {innerHTML:'',style:{}};
  context.GameState = {run:{spells:[{id:'swap',charges:4}]}};
  context.Controller = {spellAvailable:()=>true,spellCapacity:()=>4};
  context.SPELLS = [{id:'swap',icon:'s-swap',targets:2}];
  context.Icons = {svg:()=>'<svg></svg>'};
  context.document = {getElementById:id=>id === 'spellPop' ? pop : {getBoundingClientRect:()=>({top:500})}};
  context.window = {innerHeight:667};
  vm.runInContext('Renderer.openHud = () => {}; Renderer.openSpell(0, null)',context);
  assert.match(pop.innerHTML,/l'ennemi\. Choisis deux tuiles\.<\/small>/);
});
