'use strict';

const GRID_SIZE = 4;
const GRID_GAP  = 7;   // px, matches CSS --gap
const GRID_PAD  = 8;   // px, matches CSS --grid-pad

const ROOM_DEFS = {
  normal:  { icon:'sword',    label:'Combat',   color:'var(--text-dim)' },
  elite:   { icon:'skull',    label:'Élite',    color:'var(--red)' },
  rest:    { icon:'campfire', label:'Repos',    color:'var(--green)' },
  shop:    { icon:'merchant', label:'Marchand', color:'var(--gold)' },
  mystery: { icon:'question', label:'Mystère', color:'var(--purple)' },
  boss:    { icon:'eye',      label:'BOSS',     color:'var(--red)' },
};

const SPELLS = [
  { id:'smash', icon:'s-smash', targets:1 },
  { id:'swap', icon:'s-swap', targets:2 },
  { id:'undo', icon:'s-undo', targets:0 },
  { id:'pivot', icon:'s-pivot', targets:0 },
  { id:'joker', icon:'s-joker', targets:0 },
  { id:'catalyst', icon:'s-catalyst', targets:0 },
];

const CHARACTERS = [
  { id:'alchemist', icon:'c-alchemist', relic:'magnet', spell:'swap' },
  { id:'artificer', icon:'c-artificer', relic:'catring', spell:'catalyst' },
  { id:'monk', icon:'c-monk', relic:'focus', spell:'pivot' },
];

const EVENTS = [
  { id:'altar', icon:'ev-altar', options:['take','pray','leave'] },
  { id:'peddler', icon:'merchant', options:['buy','sell','leave'] },
  { id:'fountain', icon:'ev-fountain', options:['drink','toss','leave'] },
  { id:'chest', icon:'ev-chest', options:['force','disarm','leave'] },
  { id:'ambush', icon:'ambush', options:['fight','flee'] },
  { id:'library', icon:'ev-library', options:['study','pages'] },
  { id:'pact', icon:'ev-pact', options:['sign','refuse'] },
  { id:'dice', icon:'slots', options:['betGold','betHeart','leave'] },
];

const ENEMIES = [
  { id:'rat', floor:0, kind:'normal', hp:180, cadence:4, pattern:['gnaw','strike'] },
  { id:'sentinel', floor:0, kind:'normal', hp:202, cadence:4, pattern:['seal','seal','strike'] },
  { id:'ghoul', floor:0, kind:'normal', hp:186, cadence:4, pattern:['gnaw','gnaw','heal'] },
  { id:'revenant', floor:0, kind:'elite', hp:211, cadence:3, pattern:['seal','strike','gnaw'] },
  { id:'salamander', floor:1, kind:'normal', hp:176, cadence:4, pattern:['bomb','strike'] },
  { id:'slag', floor:1, kind:'normal', hp:220, cadence:6, pattern:['shield','seal','seal'] },
  { id:'apprentice', floor:1, kind:'normal', hp:240, cadence:4, pattern:['bomb','gnaw'] },
  { id:'warden', floor:1, kind:'elite', hp:247, cadence:5, pattern:['shield','lock','bomb'] },
  { id:'larva', floor:2, kind:'normal', hp:220, cadence:5, pattern:['gnaw','strike'] },
  { id:'weaver', floor:2, kind:'normal', hp:285, cadence:3, pattern:['seal','lock','seal'] },
  { id:'prophet', floor:2, kind:'normal', hp:200, cadence:3, pattern:['invert','freeze','heal'] },
  { id:'herald', floor:2, kind:'elite', hp:340, cadence:3, pattern:['invert','bomb','freeze','gnaw'] },
  { id:'jailer', floor:0, kind:'boss', hp:294, cadence:3, pattern:['seal','seal','strike'], phase2:{ cadence:3, pattern:['seal2','strike','seal2'] } },
  { id:'smith', floor:1, kind:'boss', hp:338, cadence:5, pattern:['bomb','strike','shield'], phase2:{ cadence:4, pattern:['bomb','lock','bomb','strike'] } },
  { id:'eye', floor:2, kind:'boss', hp:496, cadence:3, pattern:['invert','gnaw','seal'], phase2:{ cadence:2, pattern:['invert','gnaw','strike'] } },
];

// ── Relic Hook System ──
const RelicHooks = {
  _cache: null,
  invalidate() { this._cache = null; },
  fire(hookName, ctx) {
    const run = GameState.run;
    if (!run) return ctx;
    // Build cache on first call per run
    if (!this._cache) {
      this._cache = {};
      for (const relic of run.relics) {
        for (const h of Object.keys(relic.hooks || {})) {
          (this._cache[h] ??= []).push(relic);
        }
      }
    }
    const handlers = this._cache[hookName];
    if (handlers) for (const relic of handlers) relic.hooks[hookName](ctx, run, GameState);
    return ctx;
  }
};

const RELICS = [
  // ══════ COMMON ══════
  { id:'entropy',   icon:'entropy', name:'Entropie',      rarity:'common', desc:'Les nouvelles tuiles sont toujours des 4.',       effect:'+50% valeur tuile',
    hooks: { onTileSpawn: ctx => { ctx.value = Math.max(ctx.value, 4); } } },
  { id:'greed',     icon:'greed', name:'Avidité',        rarity:'common', desc:'Chaque fusion rapporte +1 or.',                   effect:'+1 or par fusion',
    hooks: { onGoldCalc: ctx => { ctx.gold += ctx.merges.length; } } },
  { id:'haste',     icon:'haste', name:'Hâte',           rarity:'common', desc:'+4 coups dans toutes les salles.',                effect:'+4 coups max',
    hooks: { onMovesCalc: ctx => { ctx.bonus += 4; } } },
  { id:'shield',    icon:'shield', name:'Bouclier',       rarity:'common', desc:'La première bombe ennemie de chaque salle est neutralisée.', effect:'Première bombe neutralisée',
    hooks: { onEnemyIntent: (ctx, run, gs) => { if(ctx.effect?.intent !== 'bomb' || !ctx.effect.cells?.length || gs.room?.relicState?._shieldUsed) return; gs.room.relicState._shieldUsed=true; const [r,c]=ctx.effect.cells[0]; ctx.board[r][c]=0; delete ctx.bombTimers[`${r},${c}`]; } } },
  { id:'sprout',    icon:'sprout', name:'Germination',    rarity:'common', desc:'+1 tuile de départ dans chaque salle.',           effect:'3 tuiles au départ',
    hooks: { onRoomStart: ctx => { Board.addRandom(ctx.board, false, 0); } } },
  { id:'collector', icon:'collector', name:'Collecteur',     rarity:'common', desc:'+3 or à chaque salle terminée.',                  effect:'+3 or/salle',
    hooks: { onRoomEnd: ctx => { if(ctx.won) ctx.goldBonus += 3; } } },
  { id:'compass',   icon:'compass', name:'Précision',      rarity:'common', desc:'Les tuiles apparaissent toujours sur les bords.', effect:'Spawn sur les bords',
    hooks: { onTileSpawn: ctx => { const edges=ctx.empty.filter(([r,c])=>r===0||r===GRID_SIZE-1||c===0||c===GRID_SIZE-1); if(edges.length) ctx.position=edges[Rng.int(edges.length)]; } } },

  // ══════ RARE ══════
  { id:'echo',      icon:'echo', name:'Écho',           rarity:'rare', desc:'Après chaque fusion, une tuile apparaît aléatoirement.', effect:'Tuile bonus par fusion',
    hooks: { onAfterMove: ctx => { if(ctx.result.merges.length>0) Board.addRandom(ctx.board, false, 0); } } },
  { id:'magnet',    icon:'magnet', name:'Aimant',         rarity:'rare', desc:'10 % des nouvelles tuiles sont dorées.',               effect:'10 % tuiles dorées',
    hooks: { onTileSpawn: ctx => { if(Rng.next()<0.1) ctx.kind='gold'; } } },
  { id:'tide',      icon:'tide', name:'Marée',          rarity:'rare', desc:'1×/salle : le premier coup sans fusion est gratuit.', effect:'1 coup gratuit/salle',
    hooks: { onAfterMove: (ctx, run, gs) => { const rs=gs.room?.relicState; if(rs && !rs._tideUsed && ctx.result.merges.length===0) { rs._tideUsed=true; ctx.freeMove=true; } } } },
  { id:'blade',     icon:'blade', name:'Lame double',    rarity:'rare', desc:'Les fusions 2+2 donnent 8 au lieu de 4.',          effect:'2+2 → 8',
    hooks: { onAfterMove: ctx => { for(const m of ctx.result.merges) { if(m.normal && m.val===4 && ctx.board[m.r][m.c]>0) { ctx.board[m.r][m.c]=8; m.val=8; } } } } },
  { id:'focus',     icon:'focus', name:'Focus',          rarity:'rare', desc:'Le premier coup avec 2 fusions ou plus inflige ×2 dégâts.',              effect:'Premier combo ×2 dégâts',
    hooks: { onDamageCalc: (ctx, run, gs) => { const rs=gs.room?.relicState; if(rs && !rs._focusUsed && ctx.merges.length>=2) { rs._focusUsed=true; ctx.multiplier*=2; } } } },
  { id:'recycle',   icon:'recycle', name:'Recyclage',      rarity:'rare', desc:'Quand tu rates une salle, récupère la moitié de l\'or.', effect:'50% or sur défaite',
    hooks: { onRoomEnd: ctx => { if(!ctx.won) ctx.goldBonus+=Math.floor(ctx.roomReward/2); } } },

  // ══════ EPIC ══════
  { id:'crystal',   icon:'crystal', name:'Cristal',        rarity:'epic', desc:'Début de salle : la tuile la plus haute double de valeur.', effect:'×2 tuile max au départ',
    hooks: { onRoomStart: ctx => { Board.doubleMax(ctx.board); } } },
  { id:'mirror',    icon:'mirror', name:'Miroir',         rarity:'epic', desc:'Chaque salle commence avec une copie de la dernière tuile créée.', effect:'Tuile bonus au départ',
    hooks: { onRoomStart: (ctx, run) => { if(run.lastTileVal>0) Board.placeValue(ctx.board, run.lastTileVal); } } },
  { id:'hourglass', icon:'hourglass', name:'Sablier',        rarity:'epic', desc:'+1 coup chaque fois que tu fusionnes une tuile ≥ 64.', effect:'+1 coup si fusion ≥ 64',
    hooks: { onAfterMove: ctx => { if(ctx.result.merges.some(m=>m.val>=64)) ctx.addMove+=1; } } },
  { id:'vortex',    icon:'vortex', name:'Vortex',         rarity:'epic', desc:'1×/salle : quand tu atteins 0 coups, gagne +5 coups.', effect:'+5 coups de survie',
    hooks: { onMovesExhausted: (ctx, run, gs) => { const rs=gs.room?.relicState; if(rs && !rs._vortexUsed) { rs._vortexUsed=true; ctx.movesLeft=5; ctx.consumed=true; ctx.overlayIcon='vortex'; ctx.overlayTitle='VORTEX !'; ctx.overlaySub='+5 coups !'; } } } },
  { id:'crown',     icon:'crown', name:'Couronne',       rarity:'epic', desc:'Les salles boss donnent le double d\'or.',           effect:'×2 or boss',
    hooks: { onRoomEnd: ctx => { if(ctx.won && ctx.type==='boss') ctx.goldMultiplier*=2; } } },
  { id:'dupli',     icon:'dupli', name:'Duplication',    rarity:'epic', desc:'Début de salle : la tuile la plus basse est dupliquée.', effect:'Copie tuile min',
    hooks: { onRoomStart: ctx => { let min=Infinity; for(let r=0;r<GRID_SIZE;r++) for(let c=0;c<GRID_SIZE;c++) { const v=ctx.board[r][c]; if(v>0&&v<min) min=v; } if(min<Infinity) Board.placeValue(ctx.board, min); } } },

  // ══════ LEGENDARY ══════
  { id:'phoenix',   icon:'phoenix', name:'Phénix',         rarity:'legendary', desc:'1×/run : si tu rates une salle, rejoue-la avec +10 coups.', effect:'1 seconde vie',
    hooks: { onMovesExhausted: (ctx, run) => { if(run._phoenixReady) { run._phoenixReady=false; ctx.movesLeft=10; ctx.consumed=true; ctx.overlayIcon='flame'; ctx.overlayTitle='PHÉNIX !'; ctx.overlaySub='Le Phénix te sauve ! +10 coups'; } },
             onRunStart: (ctx, run) => { run._phoenixReady = true; } } },
  { id:'transmute', icon:'transmute', name:'Transmutation',  rarity:'legendary', desc:'Les obstacles se transforment en tuile 4 après 3 coups.', effect:'Obstacles → tuile 4',
    hooks: { onTransmute: (ctx) => { ctx.active = true; } } },
  { id:'darkpact',  icon:'darkpact', name:'Pacte sombre',   rarity:'legendary', desc:'-10 coups max, mais chaque fusion donne +2 or.', effect:'-10 coups, +2 or/fusion',
    hooks: { onMovesCalc: ctx => { ctx.bonus -= 10; }, onGoldCalc: ctx => { ctx.gold += ctx.merges.length * 2; } } },
  { id:'eclipse',   icon:'eclipse', name:'Éclipse',        rarity:'legendary', desc:'Les tuiles 2, 8, 32, 128, 512 sont doublées au spawn.', effect:'Tuiles impaires ×2',
    hooks: { onTileSpawn: ctx => { if([2,8,32,128,512].includes(ctx.value)) ctx.value*=2; } } },
  { id:'berserker', icon:'berserker', name:'Berserker',      rarity:'legendary', desc:'+15 coups max, mais les fusions ne rapportent aucun or.', effect:'+15 coups, 0 or',
    hooks: { onMovesCalc: ctx => { ctx.bonus += 15; }, onGoldCalc: ctx => { ctx.gold = 0; } } },

  { id:'philosopher', icon:'philosopher', rarity:'legendary', hooks:{ onAfterMove:(ctx,run,gs) => { for(const m of ctx.result.merges) if(m.val>=64 && gs.kinds?.[m.r]) gs.kinds[m.r][m.c]='gold'; } } },
  { id:'powder', icon:'powder', rarity:'epic', hooks:{ onBombExplosion:ctx => { ctx.damage += Math.floor(ctx.fight.maxHp*0.1); } } },
  { id:'chainreact', icon:'chainreact', rarity:'legendary', hooks:{ onDamageCalc:ctx => { ctx.comboStep=0.5; } } },
  { id:'cornerstone', icon:'cornerstone', rarity:'epic', hooks:{ onDamageCalc:ctx => { for(const m of ctx.merges) if((m.r===0||m.r===GRID_SIZE-1)&&(m.c===0||m.c===GRID_SIZE-1)) m.damageMultiplier*=2; } } },
  { id:'swarm', icon:'swarm', rarity:'rare', hooks:{ onDamageCalc:ctx => { for(const m of ctx.merges) if(m.val===4||m.val===8) m.damageMultiplier*=3; } } },
  { id:'catring', icon:'catring', rarity:'rare', hooks:{ onRoomStart:ctx => { Board.placeValue(ctx.board,TILE.MULT); } } },
  { id:'wildcard', icon:'wildcard', rarity:'epic', hooks:{ onMoveCommitted:(ctx,run) => { if((run._wildcardMoves=(run._wildcardMoves||0)+1)%12===0) Board.placeValue(ctx.board,TILE.JOKER); } } },
  { id:'frostbite', icon:'frostbite', rarity:'rare', hooks:{ onIceThaw:ctx => { for(const {r,c} of ctx.result.cracked) { ctx.kinds[r][c]=null; delete ctx.iceHits[`${r},${c}`]; ctx.result.thawed.push({r,c}); } ctx.result.cracked=[]; } } },
  { id:'grimoire', icon:'grimoire', rarity:'rare', hooks:{ onRoomStart:ctx => { const spell=ctx.run.spells.find(s=>s.charges<4); if(spell) spell.charges++; } } },

  // ══════ CURSES (malus) ══════
  { id:'web',       icon:'web', name:'Toile',          rarity:'curse', isCurse:true, desc:'-3 coups dans toutes les salles.',   effect:'-3 coups max',
    hooks: { onMovesCalc: ctx => { ctx.bonus -= 3; } } },
  { id:'fragile',   icon:'fragile', name:'Fragilité',      rarity:'curse', isCurse:true, desc:'Les obstacles apparaissent aussi dans les salles normales.', effect:'Obstacles partout',
    hooks: { onRoomStart: ctx => { if(ctx.type==='normal') Board.placeValue(ctx.board, TILE.OBSTACLE); } } },
  { id:'sealed',    icon:'sealed', name:'Scellé',         rarity:'curse', isCurse:true, desc:'Les salles de repos ne proposent plus de reliques.', effect:'Repos = boutique seule',
    hooks: {} },
  { id:'cursed',    icon:'cursed', name:'Malédiction',    rarity:'curse', isCurse:true, desc:'1 obstacle indestructible apparaît dans chaque salle.', effect:'+1 obstacle permanent',
    hooks: { onRoomStart: ctx => { Board.placeValue(ctx.board, TILE.OBSTACLE); } } },
  { id:'slow',      icon:'slow', name:'Lenteur',        rarity:'curse', isCurse:true, desc:'Les tuiles générées reculent d\'un cran.', effect:'Tuiles -1 niveau',
    hooks: { onTileSpawn: ctx => { if(ctx.value > 2) ctx.value = ctx.value / 2; } } },
  { id:'tax',       icon:'tax', name:'Taxe',           rarity:'curse', isCurse:true, desc:'-20% de l\'or gagné dans chaque salle.', effect:'-20% or',
    hooks: { onGoldCalc: ctx => { ctx.gold = Math.floor(ctx.gold * 0.8); } } },
];

const RELIC_TAGS = {
  entropy:['small'], greed:['gold'], haste:['tempo'], shield:['control'], sprout:['small'], collector:['gold'], compass:['corner'],
  echo:['small'], magnet:['gold'], tide:['tempo'], blade:['small'], focus:['chain'], recycle:['gold'],
  crystal:['corner'], mirror:['small'], hourglass:['tempo'], vortex:['tempo'], crown:['gold'], dupli:['small'],
  phoenix:['tempo'], transmute:['control'], darkpact:['gold','tempo'], eclipse:['small'], berserker:['tempo'],
  philosopher:['gold'], powder:['blast'], chainreact:['chain'], cornerstone:['corner'], swarm:['small'],
  catring:['blast'], wildcard:['control'], frostbite:['control'], grimoire:['spell'],
};
for (const relic of RELICS) relic.tags = RELIC_TAGS[relic.id] || [];

const ASCENSION_COSTS = [200, 500, 1000];
const MAX_ASCENSION   = ASCENSION_COSTS.length;

const META_DEFS = [
  // ── Base (Ascension 0+) ──
  { id:'extraMoves',  icon:'extraMoves', name:'Élan',           maxLvl:4, costs:[20,40,70,110], ascReq:0, desc:'Coups de base de toutes les salles.',     getEffect: l => `+${l*2} coups de base` },
  { id:'startTile',   icon:'startTile', name:'Tuile de départ', maxLvl:3, costs:[30,60,100],   ascReq:0, desc:'Commence chaque run avec une tuile bonus.', getEffect: l => `Tuile ${[4,8,16][l-1]} au départ` },
  { id:'goldBonus',   icon:'goldBonus', name:'Alchimie',        maxLvl:3, costs:[25,50,90],    ascReq:0, desc:"Or gagné en fin de salle.",               getEffect: l => `+${l*2} or/salle` },
  { id:'relicSlots',  icon:'relicSlots', name:'Besace',          maxLvl:2, costs:[50,100],      ascReq:0, desc:'Plus de choix de reliques proposés.',     getEffect: l => `${l+3} reliques proposées` },
  { id:'startRelic',  icon:'startRelic', name:'Bénédiction',     maxLvl:1, costs:[80],          ascReq:0, desc:'1 relique commune gratuite au départ.',   getEffect: _  => '1 relique gratuite' },

  // ── Ascension 1 ──
  { id:'forgedEntropy', icon:'forgedEntropy', name:'Entropie Forgée', maxLvl:3, costs:[80,160,300], ascReq:1, desc:'Les tuiles générées commencent plus haut.', getEffect: l => `Tuiles de base : ${[4,8,16][l-1]}` },
  { id:'synergy',       icon:'synergy', name:'Synergie',        maxLvl:2, costs:[120,250],   ascReq:1, desc:'Les reliques proposées sont de meilleure rareté.', getEffect: l => `+${l*10} rareté` },

  // ── Ascension 2 ──
  { id:'deepForge',  icon:'deepForge', name:'Forge Profonde', maxLvl:3, costs:[100,200,400], ascReq:2, desc:'Chance de super-fusion (résultat ×2).', getEffect: l => `${l*10}% chance super-fusion` },
  { id:'destiny',    icon:'destiny', name:'Destinée',       maxLvl:1, costs:[250],        ascReq:2, desc:'Choisis 1 relique rare au début de chaque run.', getEffect: _ => '1 relique rare au départ' },

  // ── Ascension 3 ──
  { id:'singularity', icon:'singularity', name:'Singularité', maxLvl:1, costs:[500],        ascReq:3, desc:'1×/run : quand une tuile atteint 128+, tout le board double.', getEffect: _ => 'Doublement total à 128+' },
  { id:'mastery',     icon:'mastery', name:'Maîtrise',    maxLvl:3, costs:[150,300,500], ascReq:3, desc:'Coups bonus dans les salles boss.',                           getEffect: l => `+${l*10}% coups boss` },
];

// Relic drop weights per rarity, indexed by floor (0, 1, 2)
const RARITY_WEIGHTS = {
  common:    [50, 35, 20],
  rare:      [30, 30, 30],
  epic:      [15, 25, 30],
  legendary: [ 5, 10, 20],
  curse:     [ 0,  0,  0], // curses never appear in normal relic offers
};

// Special tile type codes (negative values on board)
const TILE = { OBSTACLE: -1, BOMB: -2, MULT: -3, JOKER: -4 };
