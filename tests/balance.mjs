import fs from 'node:fs';
import vm from 'node:vm';

const relicId = process.argv.includes('--relic') ? process.argv[process.argv.indexOf('--relic') + 1] : null;
if (relicId && !['expanse','trinity'].includes(relicId)) throw new Error(`Unknown relic: ${relicId}`);
const gameState = { size:relicId === 'expanse' ? 5 : 4, base:relicId === 'trinity' ? 3 : 2 };
const context = vm.createContext({ console, Date, GameState:gameState });
for (const file of ['rng','constants','board','combat'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context, { filename:file });
const { Board, Combat, ENEMIES, Rng, TILE, RELICS, RelicHooks } = vm.runInContext('({ Board, Combat, ENEMIES, Rng, TILE, RELICS, RelicHooks })', context);
const bands = { normal:[75,92], elite:[55,75], boss:[[45,70],[40,65],[35,60]] };

function trial(def, seed) {
  Rng.seed(seed);
  gameState.run = relicId ? { relics:[RELICS.find(r => r.id === relicId)] } : null;
  RelicHooks.invalidate();
  const board = Board.empty(), kinds = Board.emptyKinds(), timers = {}, iceHits = {};
  const fight = Combat.create(def);
  gameState.room = { combat:fight };
  RelicHooks.fire('onRoomStart',{board,run:gameState.run,type:def.kind,floorIdx:def.floor});
  let moves = (def.kind === 'boss' ? [50,56,62] : def.kind === 'elite' ? [40,44,48] : [36,40,44])[def.floor];
  const moveCtx = { base:moves, bonus:0, type:def.kind, floorIdx:def.floor };
  RelicHooks.fire('onMovesCalc',moveCtx);
  moves += moveCtx.bonus;
  if (def.kind === 'elite') {
    Board.placeValue(board, TILE.OBSTACLE);
    if (def.floor === 2) Board.placeValue(board, TILE.OBSTACLE);
  }
  Board.addRandom(board); Board.addRandom(board);
  const portals = def.floor === 2 ? Board.createPortals(board) : [];
  if (def.id === 'stareater') Combat.placeVoid(fight,board,portals);
  while (moves > 0 && Combat.hasLegalMove(fight, board, kinds)) {
    let best = null;
    for (const input of Combat.directions) {
      if (Combat.isLocked(fight, input)) continue;
      const dir = Combat.direction(fight, input);
      const copy = board.map(row => [...row]);
      const copyKinds = kinds.map(row => [...row]);
      const rng = Rng._state;
      const result = Board.applyMove(copy, dir, { kinds:copyKinds, iceHits:{...iceHits}, voidCell:fight.voidCell });
      Rng._state = rng;
      if (!result) continue;
      const damage = Math.floor(result.merges.reduce((n,m) => n + m.val,0) *
        (1 + 0.25 * Math.max(0,result.merges.length-1)) * (fight.invertTurns ? 1.25 : 1));
      const value = damage + 4 * Board.getEmpty(copy).length;
      if (!best || value > best.value) best = { input, value };
    }
    if (!best) break;
    const result = Board.applyMove(board, Combat.direction(fight, best.input), { kinds, iceHits, voidCell:fight.voidCell });
    Board.remapBombTimers(timers, result.bombMoves);
    Combat.breakHazards(fight, board, result.merges, timers);
    Board.applyPortals(board, kinds, timers, portals);
    Combat.consumeVoid(fight,board,kinds);
    Combat.damage(fight, result.merges);
    const phaseChanged = Combat.phase(fight, def);
    moves--;
    if (fight.hp <= 0) return moves;
    if (def.id === 'colossus') Board.gravity(board,kinds,timers);
    const exploded = Board.tickBombs(board, timers, kinds);
    for (let i = 0; i < exploded; i++) Combat.bombExploded(fight);
    Combat.tick(fight, board, phaseChanged);
    const effect = Combat.resolve(fight, board, timers, def.floor, kinds, portals, iceHits);
    if (effect?.strike) moves -= effect.strike;
  }
  return null;
}

console.log('enemy          win rate   avg moves left   band');
let failed = false;
for (const def of ENEMIES) {
  let wins = 0, left = 0;
  for (let seed = 0; seed < 300; seed++) {
    const result = trial(def, seed + 10000);
    if (result !== null) { wins++; left += result; }
  }
  const rate = wins / 3;
  const band = def.kind === 'boss' ? bands.boss[def.floor] : bands[def.kind];
  const pass = rate >= band[0] && rate <= band[1];
  if (!pass && !relicId) failed = true;
  console.log(`${def.id.padEnd(14)} ${rate.toFixed(1).padStart(5)}%     ${(wins ? left/wins : 0).toFixed(1).padStart(5)}           ${band.join('–')}% ${relicId ? '·' : pass ? '✓' : '✗'}`);
}
if (failed) process.exitCode = 1;
