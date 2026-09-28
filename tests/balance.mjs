import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ console, Date });
for (const file of ['rng','constants','board','combat'])
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context, { filename:file });
const { Board, Combat, ENEMIES, Rng, TILE } = vm.runInContext('({ Board, Combat, ENEMIES, Rng, TILE })', context);
vm.runInContext('RelicHooks.fire = (_, ctx) => ctx', context);
const bands = { normal:[75,92], elite:[55,75], boss:[[45,70],[40,65],[35,60]] };

function trial(def, seed) {
  Rng.seed(seed);
  const board = Board.empty(), timers = {};
  const fight = Combat.create(def);
  let moves = (def.kind === 'boss' ? [50,56,62] : def.kind === 'elite' ? [40,44,48] : [36,40,44])[def.floor];
  if (def.kind === 'elite') {
    Board.placeValue(board, TILE.OBSTACLE);
    if (def.floor === 2) Board.placeValue(board, TILE.OBSTACLE);
  }
  Board.addRandom(board); Board.addRandom(board);
  while (moves > 0 && Combat.hasLegalMove(fight, board)) {
    let best = null;
    for (const input of Combat.directions) {
      if (Combat.isLocked(fight, input)) continue;
      const dir = Combat.direction(fight, input);
      const copy = board.map(row => [...row]);
      const rng = Rng._state;
      const result = Board.applyMove(copy, dir);
      Rng._state = rng;
      if (!result) continue;
      const damage = Math.floor(result.merges.reduce((n,m) => n + m.val,0) *
        (1 + 0.25 * Math.max(0,result.merges.length-1)) * (fight.invertTurns ? 1.25 : 1));
      const value = damage + 4 * Board.getEmpty(copy).length;
      if (!best || value > best.value) best = { input, value };
    }
    if (!best) break;
    const result = Board.applyMove(board, Combat.direction(fight, best.input));
    Board.remapBombTimers(timers, result.bombMoves);
    Combat.breakHazards(fight, board, result.merges, timers);
    Combat.damage(fight, result.merges);
    const phaseChanged = Combat.phase(fight, def);
    moves--;
    if (fight.hp <= 0) return moves;
    const exploded = Board.tickBombs(board, timers);
    for (let i = 0; i < exploded; i++) Combat.bombExploded(fight);
    Combat.tick(fight, board, phaseChanged);
    const effect = Combat.resolve(fight, board, timers, def.floor);
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
  if (!pass) failed = true;
  console.log(`${def.id.padEnd(14)} ${rate.toFixed(1).padStart(5)}%     ${(wins ? left/wins : 0).toFixed(1).padStart(5)}           ${band.join('–')}% ${pass ? '✓' : '✗'}`);
}
if (failed) process.exitCode = 1;
