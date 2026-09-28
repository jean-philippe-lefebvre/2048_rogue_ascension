'use strict';

const Music = {
  _scene: null,
  _context: null,
  _gain: null,
  _voice: null,
  _timer: null,
  _step: 0,
  _nextBeat: 0,
  _walk: 0,
  _random: 1,
  _nodes: [],
  _visibilityBound: false,

  sceneFor(screenId, run = GameState.run, room = GameState.room) {
    if (screenId === 'shopScreen' || (screenId === 'relicScreen' && GameState._restDone)
      || (screenId === 'metaScreen' && GameState._shopReturnToMap))
      return {id:'quiet', floor:-1, bpm:56, notes:[0,2,4,7,9], root:48, drone:false};
    if (screenId !== 'gameScreen' && screenId !== 'relicScreen' || !room?.combat)
      return {id:'title', floor:-1, bpm:50, notes:[0,2,3,5,7,8,10], root:57, drone:true, half:true};
    const floor = Math.min(2,room.floorIdx ?? run?.floorIdx ?? 0);
    const scales = [
      {root:50,notes:[0,3,5,7,9,10],bpm:60},
      {root:52,notes:[0,1,3,5,7,8,10],bpm:72},
      {root:59,notes:[0,2,4,6,8,10],bpm:54},
    ];
    const boss = room.data?.type === 'boss';
    return {id:`floor${floor}${boss ? 'boss' : ''}${boss && room.combat.phase === 2 ? 'phase2' : ''}`,
      floor,boss,phase2:boss && room.combat.phase === 2,drone:true,
      ...scales[floor],bpm:scales[floor].bpm + (boss ? 12 : 0) + (boss && room.combat.phase === 2 ? 8 : 0)};
  },
  tempoFor(screenId, run, room) { return this.sceneFor(screenId,run,room).bpm; },
  _screen() { return typeof document === 'undefined' ? 'titleScreen' : document.querySelector('.screen.active')?.id || 'titleScreen'; },
  forScreen(screenId) {
    const scene = this.sceneFor(screenId);
    const room = GameState.room;
    const seed = (GameState.run?.seed || 1) ^ ((room?.floorIdx || 0) * 1009) ^ ((room?.rowIdx || 0) * 131) ^ ((room?.nodeIdx || 0) * 17);
    if (this._scene?.id === scene.id && this._seed === seed) return;
    this._scene = scene;
    this._seed = seed;
    this._step = 0;
    this._walk = 0;
    this._random = seed >>> 0 || 1;
    if (this._context && this._enabled()) this._start();
  },
  unlock() {
    if (!Audio2._context) return;
    this._context = Audio2._context;
    if (!this._gain) {
      this._gain = this._context.createGain();
      this._gain.gain.value = 0;
      this._gain.connect(Audio2._master);
    }
    if (!this._visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._context.suspend();
        else { this._context.resume(); this._nextBeat = this._context.currentTime + 0.05; }
      });
      this._visibilityBound = true;
    }
    this.syncSetting();
    if (!this._scene) this.forScreen(this._screen());
    else if (!this._voice && this._enabled()) this._start();
  },
  _enabled() { return GameState.meta.settings?.music !== false; },
  // Muting stops the scheduler and the voices outright, so a silent game does no audio work.
  syncSetting() {
    if (this._gain) this._gain.gain.setTargetAtTime(this._enabled() ? 0.22 : 0,this._context.currentTime,0.08);
    if (!this._context) return;
    if (!this._enabled()) {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      const voice = this._voice;
      this._voice = null;
      if (voice) setTimeout(() => this._stopVoice(voice),300);
    } else if (!this._voice && this._scene) this._start();
  },
  _start() {
    const ctx = this._context;
    if (this._timer) clearInterval(this._timer);
    const old = this._voice;
    if (old) {
      old.gain.gain.setTargetAtTime(0,ctx.currentTime,0.25);
      setTimeout(() => this._stopVoice(old),1300);
    }
    const scene = this._scene;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0,ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1,ctx.currentTime + 1.2);
    gain.connect(this._gain);
    const voice = {gain,nodes:[],scene};
    this._voice = voice;
    if (scene.drone) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      filter.connect(gain);
      voice.filter = filter;
      const droneGain = ctx.createGain(); droneGain.gain.value = 0.08;
      droneGain.connect(filter);
      for (const cents of [-6,6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth'; osc.frequency.value = this._hz(scene.root);
        osc.detune.value = cents;
        osc.connect(droneGain); osc.start(); voice.nodes.push(osc);
      }
      if (scene.phase2) filter.frequency.linearRampToValueAtTime(900,ctx.currentTime + 2);
    }
    this._nextBeat = ctx.currentTime + 0.05;
    this._timer = setInterval(() => this._schedule(voice),100);
    this._schedule(voice);
  },
  _stopVoice(voice) {
    for (const node of voice.nodes) { try { node.stop(); } catch {} node.disconnect(); }
    voice.gain.disconnect();
  },
  _hz(midi) { return 440 * 2 ** ((midi - 69) / 12); },
  _rand() {
    let x = this._random;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this._random = x >>> 0;
    return this._random / 4294967296;
  },
  _schedule(voice) {
    if (voice !== this._voice || this._context.state !== 'running') return;
    const ctx = this._context, scene = voice.scene;
    const beat = 60 / scene.bpm;
    while (this._nextBeat < ctx.currentTime + 0.25) {
      const at = this._nextBeat;
      if (!scene.half || this._step % 2 === 0) this._note(voice,at,beat);
      if (scene.floor === 1 && this._step % 2 === 0) this._kick(voice,at);
      if (scene.boss) { this._pulse(voice,at); this._pulse(voice,at + beat / 2); }
      this._nextBeat += beat;
      this._step++;
    }
  },
  _note(voice,at) {
    const ctx = this._context, scene = voice.scene;
    const delta = [1,-1,2,-2][Math.floor(this._rand() * 4)];
    const next = this._walk + delta;
    this._walk = next < 0 || next >= scene.notes.length ? this._walk - delta : next;
    const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), amp = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.value = this._hz(scene.root + scene.notes[this._walk]);
    osc.detune.value = scene.floor === 2 ? 12 : 0;
    if (scene.floor === 2) {
      const vibrato = ctx.createOscillator(), depth = ctx.createGain();
      vibrato.frequency.value = 0.1; depth.gain.value = 6;
      vibrato.connect(depth).connect(osc.detune); vibrato.start(at); vibrato.stop(at + 1.4);
    }
    filter.type = 'lowpass'; filter.frequency.value = 1800;
    amp.gain.setValueAtTime(0,at);
    amp.gain.linearRampToValueAtTime(0.12,at + 0.09);
    amp.gain.exponentialRampToValueAtTime(0.0001,at + 1.29);
    osc.connect(filter).connect(amp).connect(voice.gain);
    const delay = ctx.createDelay(); delay.delayTime.value = 0.38;
    const feedback = ctx.createGain(); feedback.gain.value = 0.32;
    const mix = ctx.createGain(); mix.gain.value = 0.32;
    amp.connect(delay).connect(mix).connect(voice.gain);
    delay.connect(feedback).connect(delay);
    osc.start(at); osc.stop(at + 1.3);
    setTimeout(() => { osc.disconnect(); filter.disconnect(); amp.disconnect(); delay.disconnect(); feedback.disconnect(); mix.disconnect(); },2200);
  },
  _kick(voice,at) {
    const ctx = this._context, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(60,at); osc.frequency.exponentialRampToValueAtTime(40,at + 0.12);
    amp.gain.setValueAtTime(0.08,at); amp.gain.exponentialRampToValueAtTime(0.0001,at + 0.12);
    osc.connect(amp).connect(voice.gain); osc.start(at); osc.stop(at + 0.13);
  },
  _pulse(voice,at) {
    const ctx = this._context, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = this._hz(voice.scene.root - 12);
    amp.gain.setValueAtTime(0.05,at); amp.gain.exponentialRampToValueAtTime(0.0001,at + 0.16);
    osc.connect(amp).connect(voice.gain); osc.start(at); osc.stop(at + 0.17);
  },
};
