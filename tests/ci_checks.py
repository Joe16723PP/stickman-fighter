#!/usr/bin/env python3
"""CI checks for Stickman Fighter (run on every pull_request).

Beat 'em up and Practice harnesses, plus edge clearance at 667x375 and 844x390:
Beat 'em up fighters must stay inside the 2%..98% screen band.
Beat 'em up player sprites (Karate, Staff, Blade) must match a scaleMul-1 Brawler's
on-screen height within 2% at the same depth. Practice keeps drawS().
A downed fighter (knockdown or KO) must draw its own fall clip, play it once, and
hold the last frame. Walk clips must show at least two frames and loop (repeat -1).

The seeded 1v1 parity digest was retired with 1v1 mode.
The YOU tag keeps a white fill, a 2px #1A1210 stroke, and weight 700.
The MOVE / LANE hint uses fill #FFF6E4, that same stroke, and 85% opacity.

Usage: python3 tests/ci_checks.py
"""
import json, subprocess, sys, time, socket
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SEED = 0xC0FFEE42

INIT_SCRIPT = '''
(function(){
  const _raf = window.requestAnimationFrame.bind(window);
  let frozen = false;
  window.requestAnimationFrame = function(cb){
    if (frozen) return 0;
    return _raf(function(now){
      if (!frozen && window.Game && Game.frame) {
        frozen = true;
        window.__gameFrame = Game.frame;
        Game.frame = function(){};
        window.requestAnimationFrame = function(){ return 0; };
      }
      // Do NOT run the boot frame — tests step the sim themselves.
    });
  };
})();
'''

SEED_RNG = '''(seed) => {
  let s = seed >>> 0;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  window.__rngS = () => s;
  return s;
}'''

FREEZE = '''() => {
  if (window.Game) {
    Game.frame = function(){};
    Game.fighting = 0;
    Game.phase = 'title';
  }
  window.requestAnimationFrame = function(){ return 0; };
}'''

CLEARANCE = '''() => {
  const out = {};
  Game.fit();
  BeatEmUp.begin(); Game.phase = 'fight';
  const band = BeatEmUp.horizontalScreenBounds ? BeatEmUp.horizontalScreenBounds() : null;
  out.band = band; out.viewport = [innerWidth, innerHeight];
  return out;
}'''

BLADE_SUPER = '''() => {
  // IAI Crescent Storm: single slash + travelling Blade Wave, 80 frames. Scripted frame by frame (practice lane, fixed step), no sims.
  const prevRandom = Math.random; Math.random = () => 0.999; // keep the 74-damage assertion off a crit roll
  Game.mode = 'practice'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  Game.minX = 0; Game.maxX = Game.W;
  BladeSuper.clear(); if (Fx.clear) Fx.clear();
  if (Input.syncMode) Input.syncMode();
  const pads0 = () => Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[0][a] = 0; Input.was[1][a] = 0; });
  const owner = fighters[0], target = fighters[1], STEP = Game.STEP, r = {};
  const setup = dx => {
    BladeSuper.clear(); pads0(); Game.stop = 0;
    owner.setClass('blade'); owner.reset(Game.W * .35, 1); owner.playerControlled = true;
    target.setClass(null); target.reset(Game.W * .35 + dx, -1);
    // Practice dummies skip ragdoll. This target is a fighter so the knockdown timer still asserts.
    target.playerControlled = true;
    owner.depth = target.depth = 0; owner.meter = 100; owner.startAtk('special');
  };
  const overlapSlash = () => { // put the hurtbox on the drawn cut (as the old harness did) so the slash connects
    const box = owner.strike(); if (!box) return false;
    const seg = box.segment, x = (seg.x1 + seg.x2) / 2, y = (seg.y1 + seg.y2) / 2;
    target.hitbox = {x:x-5, y:y-5, w:10, h:10}; return true;
  };
  // One real step: fighters update, resolve, BladeSuper.update (the game loop order). Returns a trace row.
  const step = (frame, opts = {}) => {
    pads0();
    owner.update(STEP, target, 0); target.update(STEP, owner, 1);
    if (opts.slash && owner.state === 'special' && BladeSuper.pulseForFrame(owner.atkT) === 0) overlapSlash();
    else if (!opts.slash && owner.state === 'special' && owner.atkT > owner.atk.su && owner.atkT <= owner.atk.su + owner.atk.ac) target.hitbox = {x:-9999, y:-9999, w:1, h:1};
    Game.stop = 0; Game.resolve(); BladeSuper.update(STEP);
  };
  // --- A. frame table
  setup(200);
  const a = owner.atk, phases = [16,17,27,28,32,33,48,49,67,68,80].map(f => { const p = BladeSuper.phaseAt(f); return p.part + (p.strike >= 0 ? p.strike : ''); }).join(',');
  const windows = []; let cur = null;
  for (let f = 1; f <= a.su + a.ac + a.re; f++) {
    const p = BladeSuper.pulseForFrame(f);
    if (p >= 0 && (!cur || cur[0] !== p)) { cur = [p, f, f]; windows.push(cur); } else if (p >= 0) cur[2] = f; else cur = null;
  }
  r.table = { su:a.su, ac:a.ac, re:a.re, total:a.su + a.ac + a.re, phases, windows:windows.map(w => w.join('-')).join(','), strikes:BladeSuper.STRIKES.length,
    parts:BladeSuper.STRIKES.map(s => [s.windup, s.active, s.hold, s.gap].join('/')).join(' '), recovery:BladeSuper.RECOVERY_FRAMES, sheath:BladeSuper.SHEATH_FRAMES,
    launch:BladeSuper.LAUNCH_FRAME, faceLock:BladeSuper.FACE_LOCK_FRAME, noto:BladeSuper.NOTO_FRAME, dmg:a.dmg, hitCount:a.hitCount, fractions:(a.superFractions || []).join(','),
    stun:a.stun, stunConst:BladeSuper.STUN_FRAMES, visual:owner.classProfile.superVisualDuration, superHits:owner.classProfile.superHits,
    waveDamage:BladeSuper.WAVE_DAMAGE, range:BladeSuper.RANGE, speed:BladeSuper.SPEED };
  r.tableOk = r.table.su === 16 && r.table.ac === 32 && r.table.re === 32 && r.table.total === 80 && r.table.noto === 80
    && r.table.phases === 'charge,windup0,windup0,active0,active0,hold0,hold0,recovery,recovery,sheath,sheath'
    && r.table.windows === '0-28-32' && r.table.strikes === 1 && r.table.parts === '11/5/16/0' && r.table.recovery === 19 && r.table.sheath === 13
    && r.table.launch === 28 && r.table.faceLock === 28 && r.table.dmg === 74 && r.table.hitCount === 1 && r.table.fractions === '1'
    && r.table.stun === 210 && r.table.stunConst === 210 && r.table.visual === 1 && r.table.superHits === 1 && r.table.waveDamage === 74
    && r.table.range === 420 && r.table.speed === 670
    && r.table.su === Math.round(12 * PACE.special) && r.table.ac === Math.round(8 * PACE.special) + Math.round(4 * PACE.special) + Math.round(12 * PACE.special)
    && r.table.re === Math.round(24 * PACE.special);
  // --- B. integrated runs: hit frame, single damage event, stun held to hit+210, knockdown at hit+210, owner free at 60
  const run = (dx, opts = {}) => {
    setup(dx);
    if (opts.hp) target.hp = opts.hp; // tough target so a second super's hit does not KO it
    const out = { hpEvents:[], launchAt:0, hitFrame:0, knockFrame:0, freeFrame:0, stunGap:false, stunAtHit:0, ownerX:owner.x, ownerMoved:false, face:0 };
    let hp = target.hp;
    for (let f = 1; f <= (opts.frames || 300); f++) {
      const before = BladeSuper.waves.length;
      if (opts.at && opts.at[f]) opts.at[f]();
      step(f, opts);
      if (!out.launchAt && BladeSuper.waves.length > before) out.launchAt = f;
      if (target.hp !== hp) { out.hpEvents.push([f, +(hp - target.hp).toFixed(3)]); hp = target.hp; if (!out.hitFrame) { out.hitFrame = f; out.stunAtHit = target.stun; } }
      if (!out.knockFrame && target.ragdollActive) out.knockFrame = f;
      if (out.hitFrame && f > out.hitFrame && !out.knockFrame && target.stun <= 0 && target.hp > 0) out.stunGap = true;
      if (!out.freeFrame && owner.state !== 'special' && owner.atk === null) out.freeFrame = f;
      if (owner.state === 'special' && Math.abs(owner.x - out.ownerX) > 1e-9) out.ownerMoved = true;
      if (f === 30) out.face = owner.face;
    }
    out.damage = out.hpEvents.reduce((s, e) => s + e[1], 0);
    out.pending = BladeSuper.sequences.reduce((n, s) => n + s.knockdowns.size, 0);
    return out;
  };
  // B1: close target, slash and Wave both overlap it -> one 74 hit on the launch frame (28)
  r.close = run(60, { slash:true });
  // B2: far target in lane, slash misses, the Wave hits on its way
  r.far = run(260);
  // B3: wave first, then a slash that also overlaps -> still one hit
  setup(60); for (let f = 1; f < BladeSuper.LAUNCH_FRAME; f++) step(f);
  owner.update(STEP, target, 0); // atkT === LAUNCH_FRAME (28): Wave launched
  BladeSuper.update(STEP); const afterWave = target.hp; overlapSlash(); Game.resolve(); r.waveFirst = { afterWave, afterSlash:target.hp, launched:!!owner.bladeSuper?.launched };
  // B4: pierce + off-lane: the Wave hits every in-lane target once, never an off-lane one
  setup(800);
  const pierce = new Fighter(Game.W*.35 + 120,'#EF4444',-1,'PIERCE'); pierce.reset(Game.W*.35 + 120,-1); pierce.depth = 0;
  const offLane = new Fighter(Game.W*.35 + 160,'#EF4444',-1,'OFF LANE'); offLane.reset(Game.W*.35 + 160,-1); offLane.depth = 1;
  fighters.push(pierce, offLane);
  for (let f = 1; f <= 60; f++) step(f);
  r.pierce = { pierce:pierce.hp, offLane:offLane.hp };
  fighters.splice(2);
  // C. robustness: owner hit after the slash, target killed during stun, round clear, a new super while pending
  r.ownerHit = run(60, { slash:true, frames:240, at:{ 30:() => owner.takeHit({dmg:5, kb:100, stun:12, chip:0}, target) } });
  r.targetKilled = run(60, { slash:true, frames:240, at:{ 100:() => { target.hp = 0; } } });
  r.roundClear = run(60, { slash:true, frames:240, at:{ 100:() => BladeSuper.clear() } });
  // A new super at frame 90 hits the still-stunned target again (its own 210 timer); the first knockdown still fires at 238.
  r.secondSuper = run(60, { slash:true, frames:240, hp:500, at:{ 90:() => { owner.meter = 100; owner.startAtk('special'); } } });
  const c = r.close, fr = r.far;
  r.pass = !!(r.tableOk
    && c.launchAt === 28 && c.hitFrame === 28 && c.hpEvents.length === 1 && c.damage === 74 && c.stunAtHit === 210 && !c.stunGap
    && c.knockFrame === c.hitFrame + 210 && c.freeFrame === 80 && !c.ownerMoved && c.face === 1 && c.pending === 0
    && fr.launchAt === 28 && fr.hitFrame > 28 && fr.hitFrame <= 28 + Math.ceil(BladeSuper.RANGE / BladeSuper.SPEED * 60) && fr.hpEvents.length === 1 && fr.damage === 74
    && fr.stunAtHit === 210 && !fr.stunGap && fr.knockFrame === fr.hitFrame + 210 && fr.freeFrame === 80
    && r.waveFirst.launched && r.waveFirst.afterWave === 26 && r.waveFirst.afterSlash === 26
    && r.pierce.pierce === 26 && r.pierce.offLane === 100
    && r.ownerHit.hitFrame === 28 && r.ownerHit.knockFrame === 238 && r.ownerHit.hpEvents.length === 1
    && r.targetKilled.hitFrame === 28 && r.targetKilled.pending === 0
    && r.roundClear.hitFrame === 28 && r.roundClear.knockFrame === 0 && r.roundClear.pending === 0
    && r.secondSuper.hitFrame === 28 && r.secondSuper.knockFrame === 238 && r.secondSuper.hpEvents.length === 2
    && r.secondSuper.hpEvents[1][0] === 117 && r.secondSuper.pending === 1);
  BladeSuper.clear(); owner.setClass(Game.selectedClass || null); owner.reset(Game.W * .3, 1); target.reset(Game.W * .7, -1);
  Math.random = prevRandom;
  return r;
}'''

STAFF_AOE = '''() => {
  const out = {orientations:[]};
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0;
  BeatEmUp.stageOver = 0; BeatEmUp.cast = []; BeatEmUp.score = 0; BeatEmUp.combo = 0; BeatEmUp.comboT = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.stop = 0; Game.shake = 0;
  Game.GROUND = Game.H * .72;
  const laneStep = (Depth.SPECIAL_LANES.staff / 2 * Game.H * (BeatEmUp.BAND_BOT - BeatEmUp.BAND_TOP) / 4) / (Game.H * (BeatEmUp.BAND_BOT - BeatEmUp.BAND_TOP));
  const makeOwner = face => {
    const f = fighters[0]; f.setClass('staff'); f.reset(500, face); f.depth = .55; f.face = face;
    f.state = 'special'; f.pose = Pose.staffSuperSpin(f.classProfile, 0, face, false);
    f.atk = {su:16,ac:19,re:22,dmg:86,kb:390,stun:22,chip:0,hitCount:3,
      hitDurations:[4,4,5],hitDelays:[0,7,14],hitDamages:[24,24,38],
      superFractions:[24/86,24/86,38/86],critical:false};
    f.atkT = 17; f.hitDone = 0; f.hitTargets = new Map(); f.specialMeterTargets = new Set(); f.specialEffectDone = 1;
    const entry = {f,depth:f.depth,role:'player',kind:'player',scaleMul:1,ai:null};
    return entry;
  };
  const makeTarget = (x, depth, label) => {
    const f = new Fighter(x,'#EF4444',-1,'AOE TEST'); f.reset(x,-1); f.depth = depth;
    f.grounded = true; f.dodgeT = 0; f.invincibleT = 0;
    const entry = {f,depth,role:'enemy',kind:'regular',scaleMul:1,ai:null,label};
    BeatEmUp.withDepth(entry, () => f.clamp());
    return entry;
  };
  for (const face of [1,-1]) {
    const owner = makeOwner(face);
    const metrics = BeatEmUp.withDepth(owner, () => ({
      normal:owner.f.staffNormalAttackReach(), radius:owner.f.staffSpinRadius(),
      hit:owner.f.staffSpecialHitbox(0),
    }));
    const r = metrics.radius, x = owner.f.x, d = owner.depth;
    const targets = [
      makeTarget(x + r * .72,d,'right'), makeTarget(x - r * .72,d,'left'),
      makeTarget(x,d + laneStep * .72,'front-lane'), makeTarget(x,d - laneStep * .72,'rear-lane'),
      makeTarget(x + r + 5,d,'outside'), makeTarget(x,d + laneStep * 1.1,'off-lane'),
    ];
    BeatEmUp.cast = [owner,...targets];
    BeatEmUp.resolveHits();
    const first = Object.fromEntries(targets.map(target => [target.label,target.f.hp]));
    BeatEmUp.resolveHits();
    const duplicate = Object.fromEntries(targets.map(target => [target.label,target.f.hp]));
    owner.f.atkT = 24;
    BeatEmUp.resolveHits();
    const second = Object.fromEntries(targets.map(target => [target.label,target.f.hp]));
    out.orientations.push({face,normal:metrics.normal,radius:r,first,duplicate,second});
  }
  const owner = makeOwner(1); owner.f.pose = Pose.staffSuperSlam(owner.f.classProfile,1); owner.f.atkT = 31;
  const slam = BeatEmUp.withDepth(owner, () => owner.f.strike());
  const slamTarget = makeTarget(slam.centerX + Math.max(1,slam.radius * .5),owner.depth,'slam');
  BeatEmUp.cast = [owner,slamTarget]; BeatEmUp.resolveHits();
  out.slam = {radius:slam.radius,damage:86*owner.f.atk.superFractions[2],pulse:slam.pulse,
    knockdown:slam.knockdown,hp:slamTarget.f.hp,ragdoll:slamTarget.f.ragdollActive};
  out.pass = out.orientations.every(test => test.radius > test.normal
    && ['right','left','front-lane','rear-lane'].every(key => test.first[key] === 76 && test.duplicate[key] === 76 && test.second[key] === 52)
    && test.first.outside === 100 && test.first['off-lane'] === 100)
    && out.orientations.every(test => Math.abs(test.radius-out.orientations[0].radius) < .01)
    && out.slam.pulse === 2 && out.slam.damage === 38 && out.slam.knockdown
    && out.slam.hp === 62 && out.slam.ragdoll;
  BeatEmUp.cast = [];
  return out;
}'''

LANE_COVERAGE = r"""
() => {
  const prevMode = Game.mode; Game.mode = 'beatemup';
  const offsets = [-3,-2,-1,0,1,2,3], centre = .5, step = .25; // drawn guides sit at depth i/4
  const mk = (cls, tag) => { const f = new Fighter(Game.W*.5,'#fff',1,tag); f.reset(Game.W*.5,1); f.setClass(cls); f.depth = centre; return f; };
  const staffRow = (owner, dx) => offsets.map(k => { const t = mk('blade','T'); t.x = owner.x + dx; t.depth = centre + k*step;
    return Fighter.staffRadialHits({ radius:100, centerX:owner.x, centerDepthY:BeatEmUp.floorDepthPx(centre) }, owner, t) ? 1 : 0; }).join('');
  const bladeRow = owner => offsets.map(k => BladeSuper.laneMatches({ owner, depth:centre }, { depth:centre + k*step }) ? 1 : 0).join('');
  const karateRow = owner => offsets.map(k => BeatEmUp.depthClose(centre, centre + k*step, Depth.specialLaneTolerance(owner) + 1e-9) ? 1 : 0).join('');
  const staff = mk('staff','YOU'), blade = mk('blade','YOU'), karate = mk('freehand','YOU'), cpuStaff = mk('staff','CPU'), cpuBlade = mk('blade','CPU');
  const r = {
    lanePx: Depth.lanePx(),
    staffFullReach: staffRow(staff, 95), staffOutside: staffRow(staff, 105),
    blade: bladeRow(blade), karate: karateRow(karate),
    cpuStaff: staffRow(cpuStaff, 10), cpuBlade: bladeRow(cpuBlade), cpuTol: Depth.specialLaneTolerance(cpuStaff),
  };
  Game.mode = 'practice';
  r.practiceLane = { lanePx: Depth.lanePx(), staff: Depth.specialLaneTolerance(staff), blade: Depth.specialLaneTolerance(blade), karate: Depth.specialLaneTolerance(karate) };
  Game.mode = prevMode;
  r.pass = Math.abs(r.lanePx - 43.2) < 1e-6 && r.staffFullReach === '0111110' && r.staffOutside === '0000000'
    && r.blade === '0011100' && r.karate === '0011100' && r.cpuStaff === '0001000' && r.cpuBlade === '0001000' && r.cpuTol === null
    && r.practiceLane.lanePx === 36 && r.practiceLane.staff === 90 && r.practiceLane.blade === 54 && r.practiceLane.karate === 54;
  return r;
}
"""

BRAWLER = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  // Stats, scaled by stage and difficulty exactly like every other archetype.
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const kinds = ['regular','rusher','guard','heavy','ranged','brawler'];
  const made = Object.fromEntries(kinds.map(k => [k, BeatEmUp.makeEnemy(k, 400, .5)]));
  const br = made.brawler, rk = made.regular;
  r.stats = { hp: br.f.hp, expectHp: Math.round(110 * stageHealth), rookieHp: rk.f.hp, speedMul: br.speedMul, scaleMul: br.scaleMul,
    weapon: br.f.weaponType, dmgMul: br.f.damageMultiplier, special: br.f.specialDamageMultiplier, gain: br.f.meterGainMultiplier,
    tag: br.f.tag, combo: br.f.enemyCombo, profile: br.f.bodyProfile === ArchetypeBodyProfiles.brawler };
  let armed = 0; for (let i = 0; i < 60; i++) if (BeatEmUp.makeEnemy('brawler', 400, .5).f.weaponType) armed++;
  r.armedBrawlers = armed;
  // Shared hurtbox: identical to ROOKIE, never from the profile.
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  r.hurtbox = { brawler: box(br), rookie: box(rk) };
  // Existing archetypes: no profile, no combo, draw bones identical to gameplay bones.
  r.noProfile = kinds.filter(k => k !== 'brawler' && k !== 'rusher' && k !== 'heavy' && k !== 'guard' && k !== 'ranged').every(k => made[k].f.bodyProfile === null && made[k].f.enemyCombo === null
    && BeatEmUp.withDepth(made[k], () => JSON.stringify(ArchetypeSkeleton.drawBones(made[k].f)) === JSON.stringify(made[k].f.bones())));
  // Draw trace: a ROOKIE draws exactly like a plain Fighter that never touched the archetype code.
  const trace = f => { const ops = []; const ctx = new Proxy({}, {
      get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
      set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
    f.draw(ctx); return ops.join('|'); };
  const plain = new Fighter(400, rk.f.color, -1, ''); plain.reset(400, -1); plain.tag = rk.f.tag;
  rk.f.reset(400, -1); br.f.reset(400, -1);
  const tr = BeatEmUp.withDepth(rk, () => ({ rookie: trace(rk.f), plain: trace(plain), brawler: trace(br.f) }));
  r.drawUnchanged = tr.rookie === tr.plain && tr.rookie.length > 0;
  r.brawlerProfileDrawn = tr.brawler !== tr.rookie;
  // Jab-cross: exactly 2 hits, total = one ROOKIE punch.
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const run = e => {
    player.reset(500, 1); player.depth = .5; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.grounded = true;
    e.f.reset(560, -1); e.depth = .5; e.f.face = -1;
    BeatEmUp.cast = [pEntry, e];
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    e.f.startAtk('punch');
    const tot = e.f.atk.su + e.f.atk.ac + e.f.atk.re, hits = [];
    for (let i = 0; i < tot + 2 && e.f.atk; i++) {
      player.x = 500; player.vx = 0; player.stun = 0; player.state = 'idle'; player.invincibleT = 0; BeatEmUp.withDepth(pEntry, () => player.clamp());
      BeatEmUp.withDepth(e, () => { e.f.update(Game.STEP, player, 1); e.f.x = 560; });
      if (e.f.bodyProfile) BeatEmUp.withDepth(e, () => trace(e.f)); // profile draw must survive every combo phase
      const before = player.hp; BeatEmUp.resolveHits();
      if (player.hp < before) hits.push({ frame: e.f.atkT, dmg: +(before - player.hp).toFixed(6) });
    }
    return { tot, hits, total: +(hits.reduce((s, h) => s + h.dmg, 0)).toFixed(6) };
  };
  r.rookiePunch = run(rk); r.jabCross = run(br);
  const tl = EnemyCombo.timeline(EnemyCombos.jabCross);
  r.timeline = { su: tl.su, ac: tl.ac, re: tl.re, total: tl.total, active: tl.hits.map(w => w.activeStart + '-' + w.activeEnd) };
  // Spawns: Stage 1 has brawlers (its lineup is owned by the STAGE1 check since the Stage 1 ticket);
  // Stages 2-3 keep their in-place ROOKIE->brawler swaps (2 of 5); nothing else moves.
  const orig = [null,
                [['regular','heavy','regular'],['rusher','rusher','heavy'],['heavy','heavy','rusher']],
                [['regular','regular','heavy'],['rusher','rusher','regular'],['guard','heavy','guard']]];
  let swapped = 0, rookies = 0, inPlace = true;
  for (let s = 2; s < 3; s++) for (let w = 0; w < 3; w++) { // Stages 1-2 own their lineups (Stage 1/2 tickets)
    const now = BeatEmUp.chapters[s].waves[w].enemyFocus;
    orig[s][w].forEach((k, i) => { if (k === 'regular') { rookies++; if (now[i] === 'brawler') swapped++; } else if (now[i] !== k) inPlace = false; });
    if (now.length !== orig[s][w].length || now.some((k, i) => k !== orig[s][w][i] && !(k === 'brawler' && orig[s][w][i] === 'regular'))) inPlace = false;
  }
  const laterBrawlers = BeatEmUp.chapters.slice(3).some(c => c.waves.some(w => w.enemyFocus.includes('brawler')));
  BeatEmUp.stage = 1;
  r.spawns = { stage1: BeatEmUp.waveDefs(1).map(d => d.kind), swapped, rookies, inPlace, laterBrawlers };
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode;
  const s = r.stats;
  r.pass = s.hp === s.expectHp && s.rookieHp === Math.round(100 * stageHealth) && s.speedMul === .95 && s.scaleMul === 1
    && s.weapon === null && s.dmgMul === EnemyWeaponProfiles.freehand.damage && s.special === .25 && s.gain === .25
    && s.tag === 'BRAWLER' && s.combo === 'jabCross' && s.profile && r.armedBrawlers === 0
    && r.hurtbox.brawler.w === r.hurtbox.rookie.w && r.hurtbox.brawler.h === r.hurtbox.rookie.h
    && Math.abs(r.hurtbox.rookie.w - 42) < 1e-9 && Math.abs(r.hurtbox.rookie.h - 135) < 1e-9
    && r.noProfile && r.drawUnchanged && r.brawlerProfileDrawn
    && r.rookiePunch.hits.length === 1 && r.jabCross.hits.length === 2
    // Pacing pass 2026-11-15: jab 9/3/8, cross 10/3/18 (startup/recovery x1.3, active unchanged).
    && r.jabCross.hits[0].frame === 13 && r.jabCross.hits[1].frame === 40
    && Math.abs(r.jabCross.total - r.rookiePunch.total) < 1e-6 && r.rookiePunch.total > 0
    && r.timeline.su === 12 && r.timeline.ac === 31 && r.timeline.re === 23 && r.timeline.total === 66
    && r.spawns.stage1.includes('brawler') && r.spawns.swapped === 1 && r.spawns.rookies === 3 && r.spawns.inPlace && !r.spawns.laterBrawlers;
  return r;
}
"""

RUSHER = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const ru = BeatEmUp.makeEnemy('rusher', 400, .5), rk = BeatEmUp.makeEnemy('regular', 400, .5);
  r.stats = { hp: ru.f.hp, expectHp: Math.round(80 * stageHealth), speedMul: ru.speedMul, scaleMul: ru.scaleMul, weapon: ru.f.weaponType,
    dmgMul: ru.f.damageMultiplier, tag: ru.f.tag, rush: ru.f.enemyRush, combo: ru.f.enemyCombo, profile: ru.f.bodyProfile === ArchetypeBodyProfiles.rusher };
  let armed = 0; for (let i = 0; i < 60; i++) if (BeatEmUp.makeEnemy('rusher', 400, .5).f.weaponType) armed++;
  r.armed = armed; r.runnerGone = !('runner' in EnemyArchetypes);
  // RUNNER is replaced everywhere: no authored wave spawns 'runner'.
  r.runnerSpawns = BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(k => k === 'runner').length, 0), 0);
  r.rusherSpawns = BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(k => k === 'rusher').length, 0), 0);
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  const hb = { rusher: box(ru), rookie: box(rk) };
  r.hurtboxSame = hb.rusher.w === hb.rookie.w && hb.rusher.h === hb.rookie.h;
  const trace = f => { const ops = []; const ctx = new Proxy({}, {
      get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
      set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
    f.draw(ctx); return ops.join('|'); };
  rk.f.reset(400, -1); ru.f.reset(400, -1);
  r.profileDrawn = BeatEmUp.withDepth(ru, () => trace(ru.f)) !== BeatEmUp.withDepth(rk, () => trace(rk.f));
  // Profile is draw-only: gameplay bones match a plain fighter in the same state.
  r.gameplayBonesSame = BeatEmUp.withDepth(ru, () => JSON.stringify(ru.f.combatBones()) === JSON.stringify(rk.f.combatBones()));
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const sp = EnemyRushes.shoulder, tl = EnemyRush.timeline(sp);
  // gap = distance from rusher to player at rush start; flip = put the player behind after the crouch starts.
  const run = (e, gap, flip = false) => {
    const x0 = 900;
    player.reset(x0 - gap, 1); player.depth = .5; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.grounded = true;
    e.f.reset(x0, -1); e.depth = .5; e.f.face = -1;
    BeatEmUp.cast = [pEntry, e];
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    e.f.startAtk('punch');
    const tot = e.f.atk.su + e.f.atk.ac + e.f.atk.re, hits = [], live = [];
    let frames = 0, chain = false, faces = new Set();
    for (let i = 0; i < 200 && e.f.atk; i++) {
      const px = flip && i >= 2 ? x0 + 60 : x0 - gap;
      player.x = px; player.vx = 0; player.stun = 0; player.state = 'idle'; player.invincibleT = 0; BeatEmUp.withDepth(pEntry, () => player.clamp());
      Input.pad[1].left = 1; // steering input must be ignored during the rush
      BeatEmUp.withDepth(e, () => { e.f.update(Game.STEP, player, 1); });
      Input.pad[1].left = 0;
      frames++;
      if (!e.f.atk) break;
      faces.add(e.f.face);
      if (e.f.canChainPunch()) chain = true;
      BeatEmUp.withDepth(e, () => trace(e.f)); // profile draw must survive every rush phase
      if (BeatEmUp.withDepth(e, () => e.f.strike())) live.push(e.f.atkT);
      const before = player.hp; BeatEmUp.resolveHits();
      if (player.hp < before) hits.push({ frame: e.f.atkT, dmg: +(before - player.hp).toFixed(6), travelled: +(x0 - e.f.x).toFixed(3) });
    }
    return { tot, frames, travelled: +(x0 - e.f.x).toFixed(3), hits, live: live.length ? live[0] + '-' + live[live.length - 1] : '', chain, faces: [...faces] };
  };
  const rookie = (() => {
    player.reset(500, 1); player.depth = .5; player.hp = 100; rk.f.reset(560, -1); rk.depth = .5;
    BeatEmUp.cast = [pEntry, rk]; rk.f.startAtk('punch'); let dmg = 0;
    for (let i = 0; i < 40 && rk.f.atk; i++) { player.x = 500; player.stun = 0; player.state = 'idle'; player.invincibleT = 0;
      BeatEmUp.withDepth(pEntry, () => player.clamp()); BeatEmUp.withDepth(rk, () => { rk.f.update(Game.STEP, player, 1); rk.f.x = 560; });
      const b = player.hp; BeatEmUp.resolveHits(); dmg += b - player.hp; }
    return +dmg.toFixed(6);
  })();
  r.timeline = tl; r.rookiePunch = rookie;
  r.whiff = run(ru, 600);
  r.behind = run(ru, 600, true);
  // Sweep start gaps: any hit must land on a live dash frame (approach never hits).
  r.sweep = [];
  for (let gap = 30; gap <= 300; gap += 10) { const o = run(ru, gap); r.sweep.push({ gap, hit: o.hits.length ? o.hits[0].frame : 0, n: o.hits.length, travelled: o.travelled, frames: o.frames, dmg: o.hits[0]?.dmg || 0 }); }
  const hitsAll = r.sweep.filter(o => o.n);
  r.hitGaps = hitsAll.length ? hitsAll[0].gap + '-' + hitsAll[hitsAll.length - 1].gap : '';
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode;
  const s = r.stats, w = r.whiff;
  r.pass = s.hp === s.expectHp && s.speedMul === 1.35 && s.scaleMul === 1 && s.weapon === null && r.armed === 0
    && s.dmgMul === EnemyWeaponProfiles.freehand.damage && s.tag === 'RUSHER' && s.rush === 'shoulder' && s.combo === null && s.profile
    && r.runnerGone && r.runnerSpawns === 0 && r.rusherSpawns === 18
    && r.hurtboxSame && r.profileDrawn && r.gameplayBonesSame
    && tl.su === 35 && tl.ac === 9 && tl.re === 55 && tl.dashStart === 22 && tl.dashEnd === 44 && tl.total === 99
    // Whiff: full fixed dash + braking skid, live box only on the last paced dash frames, full stumble recovery.
    && w.hits.length === 0 && Math.abs(w.travelled - (sp.distance + sp.brake)) < 1e-6 && w.frames === tl.total && w.live === '36-44'
    && !w.chain && w.faces.length === 1 && w.faces[0] === -1
    // Direction is locked at rush start even if the player jumps behind.
    && r.behind.hits.length === 0 && Math.abs(r.behind.travelled - (sp.distance + sp.brake)) < 1e-6 && r.behind.faces.length === 1
    // Approach never hits; every hit is one ROOKIE punch, stops the dash, and recovers in hitRecovery frames.
    && hitsAll.length >= 5 && r.sweep.every(o => o.n <= 1 && (o.n === 0 || (o.hit >= tl.su + 1 && o.hit <= tl.su + tl.ac)))
    && hitsAll.every(o => Math.abs(o.dmg - r.rookiePunch) < 1e-6 && o.travelled <= sp.distance + 1e-6 && o.frames === o.hit + Math.max(1, Math.round(sp.hitRecovery * PACE.enemy)))
    && r.sweep.every(o => o.travelled <= sp.distance + sp.brake + 1e-6) && r.rookiePunch > 0;
  return r;
}
"""

HEAVY = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const hv = BeatEmUp.makeEnemy('heavy', 400, .5), rk = BeatEmUp.makeEnemy('regular', 400, .5);
  r.stats = { hp: hv.f.hp, expectHp: Math.round(145 * stageHealth), speedMul: hv.speedMul, scaleMul: hv.scaleMul, weapon: hv.f.weaponType,
    dmgMul: hv.f.damageMultiplier, tag: hv.f.tag, slam: hv.f.enemySlam, rush: hv.f.enemyRush, combo: hv.f.enemyCombo, profile: hv.f.bodyProfile === ArchetypeBodyProfiles.heavy };
  let hammers = 0; for (let i = 0; i < 60; i++) if (BeatEmUp.makeEnemy('heavy', 400, .5).f.weaponType === 'sledgehammer') hammers++;
  r.hammers = hammers;
  r.heavySpawns = BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(k => k === 'heavy').length, 0), 0);
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  const hb = { heavy: box(hv), rookie: box(rk) };
  r.hurtboxSame = hb.heavy.w === hb.rookie.w && hb.heavy.h === hb.rookie.h;
  const trace = f => { const ops = []; const ctx = new Proxy({}, {
      get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
      set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
    f.draw(ctx); return ops.join('|'); };
  // Draw-only profile: a plain fighter with the same hammer, scale and state has identical gameplay bones but draws differently.
  const plain = new Fighter(400, hv.f.color, -1, ''); plain.reset(400, -1); plain.weaponType = 'sledgehammer'; hv.f.reset(400, -1);
  r.gameplayBonesSame = BeatEmUp.withDepth(hv, () => JSON.stringify(hv.f.combatBones()) === JSON.stringify(plain.combatBones()));
  r.profileDrawn = BeatEmUp.withDepth(hv, () => trace(hv.f) !== trace(plain));
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const sp = EnemySlams.overhead, tl = EnemySlam.timeline(sp);
  // gap: player in front by gap px (facing tracks the foe through the wind-up). flip: from the first swing frame the
  // player stands the same gap BEHIND, i.e. facing is locked and the swing must not turn around.
  const run = (gap, flip = false) => {
    const x0 = 900;
    player.reset(x0 - gap, 1); player.depth = .5; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.grounded = true;
    hv.f.reset(x0, -1); hv.depth = .5; hv.f.face = -1; hv.f.hp = 999;
    BeatEmUp.cast = [pEntry, hv];
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    hv.f.startAtk('punch');
    const hits = [], live = []; let frames = 0, tipMatch = true, profileFree = true, chain = false, maxTip = -Infinity, moved = false;
    const faces = new Set();
    for (let i = 0; i < 200 && hv.f.atk; i++) {
      const px = flip && i >= tl.su ? x0 + gap : x0 - gap;
      player.x = px; player.vx = 0; player.stun = 0; player.state = 'idle'; player.invincibleT = 0; BeatEmUp.withDepth(pEntry, () => player.clamp());
      Input.pad[1].left = 1; // steering input must be ignored during the slam
      BeatEmUp.withDepth(hv, () => { hv.f.update(Game.STEP, player, 1); });
      Input.pad[1].left = 0;
      frames++;
      if (!hv.f.atk) break;
      if (hv.f.x !== x0) moved = true;
      if (hv.f.atkT > tl.su) faces.add(hv.f.face);
      if (hv.f.canChainPunch()) chain = true;
      BeatEmUp.withDepth(hv, () => {
        trace(hv.f); // profile draw must survive every slam phase
        const st = hv.f.strike(), g = EnemySlam.geometry(hv.f), vis = hv.f.visualWeaponGeometry(hv.f.combatBones());
        if (vis.tip.x !== g.tip.x || vis.tip.y !== g.tip.y) tipMatch = false;      // drawn head sits on the gameplay tip
        const saved = hv.f.bodyProfile; hv.f.bodyProfile = null;
        const st0 = hv.f.strike(); hv.f.bodyProfile = saved;
        if (JSON.stringify(st) !== JSON.stringify(st0)) profileFree = false;       // collision never reads the profile
        if (st) {
          live.push(hv.f.atkT);
          if (st.segment.x2 !== g.tip.x || st.segment.y2 !== g.tip.y || st.segment.r !== g.r) tipMatch = false; // hitbox ends at the tip
          maxTip = Math.max(maxTip, (g.tip.x - x0) * hv.f.face + g.r);
        }
      });
      const before = player.hp; BeatEmUp.resolveHits();
      if (player.hp < before) hits.push({ frame: hv.f.atkT, dmg: +(before - player.hp).toFixed(6) });
    }
    return { frames, hits, live: live.length ? live[0] + '-' + live[live.length - 1] : '', tipMatch, profileFree, chain, moved, maxTip: +maxTip.toFixed(3), faces: [...faces] };
  };
  r.timeline = tl;
  r.whiff = run(600);
  r.behind = []; for (let gap = 20; gap <= 160; gap += 20) { const o = run(gap, true); r.behind.push({ gap, n: o.hits.length, faces: o.faces }); }
  r.sweep = [];
  for (let gap = 0; gap <= 260; gap += 10) { const o = run(gap); r.sweep.push({ gap, n: o.hits.length, frame: o.hits[0]?.frame || 0, dmg: o.hits[0]?.dmg || 0, frames: o.frames, maxTip: o.maxTip, tipMatch: o.tipMatch, profileFree: o.profileFree }); }
  const hitsAll = r.sweep.filter(o => o.n);
  r.hitGaps = hitsAll.length ? hitsAll[0].gap + '-' + hitsAll[hitsAll.length - 1].gap : '';
  r.zoneEnd = r.whiff.maxTip; // furthest hammer tip (+ head radius) in front, px
  const half = hb.rookie.w / 2;
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode;
  const s = r.stats, w = r.whiff;
  r.pass = s.hp === s.expectHp && s.speedMul === .74 && s.scaleMul === 1.12 && s.weapon === 'sledgehammer' && r.hammers === 60
    && s.dmgMul === 1 && s.tag === 'HEAVY' && s.slam === 'overhead' && s.rush === null && s.combo === null && s.profile
    && r.heavySpawns > 0 && r.hurtboxSame && r.gameplayBonesSame && r.profileDrawn
    && tl.su === 39 && tl.ac === 5 && tl.re === 62 && tl.total === 106
    // Whiff: full 82 frames, hitbox only on the 4 swing frames, planted, facing locked through the swing, cannot chain.
    && w.hits.length === 0 && w.frames === 106 && w.live === '40-44' && w.tipMatch && w.profileFree && !w.chain && !w.moved && w.faces.length === 1
    && r.behind.every(o => o.n === 0 && o.faces.length === 1 && o.faces[0] === -1)
    // Zone: hits only in front, only on swing frames, never past the hammer tip; one hit of 12 per slam.
    && hitsAll.length >= 5 && r.sweep.every(o => o.n <= 1 && o.tipMatch && o.profileFree)
    && hitsAll.every(o => o.frame >= tl.su + 1 && o.frame <= tl.su + tl.ac && Math.abs(o.dmg - sp.dmg) < 1e-6 && o.gap - half <= r.zoneEnd + 1e-6)
    && r.sweep.filter(o => o.gap - half > r.zoneEnd).every(o => o.n === 0);
  return r;
}
"""

GRAPPLER = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const gp = BeatEmUp.makeEnemy('grappler', 400, .5), rk = BeatEmUp.makeEnemy('regular', 400, .5);
  r.stats = { hp: gp.f.hp, expectHp: Math.round(115 * stageHealth), speedMul: gp.speedMul, scaleMul: gp.scaleMul, weapon: gp.f.weaponType,
    dmgMul: gp.f.damageMultiplier, tag: gp.f.tag, grab: gp.f.enemyGrab, combo: gp.f.enemyCombo, rush: gp.f.enemyRush, slam: gp.f.enemySlam,
    guard: gp.f.enemyGuard, bash: gp.f.enemyBash, profile: gp.f.bodyProfile === ArchetypeBodyProfiles.grappler };
  let armed = 0; for (let i = 0; i < 60; i++) if (BeatEmUp.makeEnemy('grappler', 400, .5).f.weaponType) armed++;
  r.armed = armed;
  // Archetype only: no authored wave anywhere spawns it.
  r.grapplerSpawns = BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(x => x === 'grappler').length, 0), 0);
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  const hb = { grappler: box(gp), rookie: box(rk) };
  r.hurtboxSame = hb.grappler.w === hb.rookie.w && hb.grappler.h === hb.rookie.h;
  const trace = f => { const ops = []; const ctx = new Proxy({}, {
      get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
      set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
    f.draw(ctx); return ops.join('|'); };
  const plain = new Fighter(400, gp.f.color, -1, ''); plain.reset(400, -1); gp.f.reset(400, -1);
  r.gameplayBonesSame = BeatEmUp.withDepth(gp, () => JSON.stringify(gp.f.combatBones()) === JSON.stringify(plain.combatBones()));
  r.profileDrawn = BeatEmUp.withDepth(gp, () => trace(gp.f) !== trace(plain));
  // Long arms are draw-only: drawn hand farther from the shoulder than the gameplay hand.
  r.longArms = BeatEmUp.withDepth(gp, () => { const d = ArchetypeSkeleton.drawBones(gp.f), c = gp.f.combatBones();
    const cs = c.shL || c.sh; return Math.hypot(d.la.x - d.shL.x, d.la.y - d.shL.y) > Math.hypot(c.la.x - cs.x, c.la.y - cs.y) * 1.15; });
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const sp = EnemyGrabs.clinch, tl = EnemyGrab.timeline(sp);
  const x0 = 900;
  const setup = (px, pdepth = .5) => {
    player.reset(px, px < x0 ? 1 : -1); player.depth = pdepth; pEntry.depth = pdepth; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.grounded = true; player.stun = 0;
    gp.f.reset(x0, -1); gp.depth = .5; gp.f.face = -1; gp.f.hp = 500; gp.f.stun = 0;
    BeatEmUp.cast = [pEntry, gp];
    Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    BeatEmUp.withDepth(pEntry, () => player.clamp()); BeatEmUp.withDepth(gp, () => gp.f.clamp());
  };
  const pStep = () => BeatEmUp.withDepth(pEntry, () => player.update(Game.STEP, gp.f, 0));
  const gStep = () => BeatEmUp.withDepth(gp, () => gp.f.update(Game.STEP, player, 1));
  const frame = () => { pStep(); gStep(); BeatEmUp.resolveHits(); };
  const normal = () => ({ x: 0, y: 0, w: 1, h: 1, dmg: 5, kb: 160, stun: 10, chip: 0, special: false, chain: 0 });
  const s0 = BeatEmUp.withDepth(gp, () => gp.f.drawS());
  // Run one grab against a player at `gap` px in front (grappler faces -1, player at lower x). Player stays still.
  const grab = (gap, opts = {}) => {
    setup(x0 - gap, opts.depth ?? .5);
    if (opts.prep) opts.prep();
    BeatEmUp.withDepth(gp, () => gp.f.startAtk('punch'));
    const o = { caught: 0, frames: 0, strikes: 0, heldFrames: 0, pinned: true, reasons: new Set(), hpLoss: 0, release: '', releaseFrame: 0, noRegrab: 0, phases: [] };
    const hp0 = player.hp;
    for (let i = 0; i < 300 && gp.f.atk; i++) {
      if (opts.hold) opts.hold(i);
      if (player.heldBy) Input.pad[0].left = 1; // input is ignored while held
      frame(); Input.pad[0].left = 0; o.frames++;
      if (opts.every) opts.every(i);
      if (BeatEmUp.withDepth(gp, () => gp.f.strike())) o.strikes++;
      if (gp.f.atk?.lastCheck) o.reasons.add(gp.f.atk.lastCheck);
      if (gp.f.atk?.grabHit && !o.caught) o.caught = gp.f.atk.holdStart;
      if (gp.f.atk && o.phases[o.phases.length - 1] !== gp.f.atkPhase) o.phases.push(gp.f.atkPhase);
      if (player.heldBy) { o.heldFrames++; if (Math.abs(player.x - (gp.f.x + gp.f.atk.grabDir * gp.f.atk.holdOffset)) > 1e-6) o.pinned = false; }
      else if (o.caught && !o.release) { o.release = player.grabRelease; o.releaseFrame = gp.f.atkT || o.frames; o.noRegrab = player.noRegrabT; o.stun = player.stun; o.vxAway = player.vx * -1 > 0; }
    }
    o.hpLoss = +(hp0 - player.hp).toFixed(6); o.travel = +((x0 - gp.f.x)).toFixed(3); o.reasons = [...o.reasons];
    return o;
  };
  const maxGap = sp.reach * s0 + sp.reachStep;
  // Range sweep (same lane).
  r.sweep = []; for (let gap = -20; gap <= 120; gap += 5) { const o = grab(gap); r.sweep.push({ gap, c: o.caught ? 1 : 0, reasons: o.reasons.join('/') }); }
  r.maxGap = +maxGap.toFixed(3);
  // Expected from the spec alone: some reach frame k puts the forward centre gap inside [-overlap, reach x drawS].
  const expectCatch = gap => { for (let k = 1; k <= sp.active; k++) { const g = gap - Math.min(sp.reachStep, k * sp.reachStep / sp.active); if (g >= -sp.overlap - 1e-6 && g <= sp.reach * s0 + 1e-6) return 1; } return 0; };
  r.rangeOk = r.sweep.every(o => o.c === expectCatch(o.gap)) && r.sweep.some(o => o.c) && r.sweep.some(o => !o.c && o.gap > 0);
  // Lane: floor-px gap within the shared enemy tolerance catches, beyond it never.
  const tol = BeatEmUp.depthHitTolerance(gp, pEntry);
  const depthFor = px => { for (let d = .5; d <= 1; d += .0005) if (Math.abs(BeatEmUp.floorDepthPx(d) - BeatEmUp.floorDepthPx(.5)) >= px) return d; return 1; };
  r.tol = tol;
  r.lane = [0, tol - 2, tol + 2, Depth.lanePx()].map(px => ({ px: +px.toFixed(2), c: grab(40, { depth: depthFor(px) }).caught ? 1 : 0 }));
  r.laneOk = r.lane.map(o => o.c).join('') === '1100';
  // Ineligible targets: invulnerable, rolling, airborne, in hitstun.
  r.invuln = grab(40, { prep: () => { player.invincibleT = 5; } }).caught;
  r.roll = grab(40, { every: () => { player.dodgeT = .3; }, prep: () => { player.dodgeT = .3; } }).caught;
  r.air = grab(40, { every: () => { player.grounded = false; player.y = -30; }, prep: () => { player.grounded = false; player.y = -30; } }).caught;
  r.stunned = grab(40, { every: () => { player.stun = 5; }, prep: () => { player.stun = 5; } }).caught;
  // Interrupt: hitting the Grappler during the arms-spread wind-up cancels the grab.
  let intKind = '';
  const intr = grab(40, { hold: i => { if (i === 10 && gp.f.atk) intKind = BeatEmUp.withDepth(gp, () => gp.f.takeHit(normal(), player)); } });
  r.interrupt = { kind: intKind, caught: intr.caught, held: intr.heldFrames, frames: intr.frames };
  // Success: hold -> headbutt -> release.
  const ok = grab(40);
  const atkDmg = sp.dmg * gp.f.damageMultiplier;
  r.success = { caught: ok.caught, held: ok.heldFrames, pinned: ok.pinned, release: ok.release, releaseFrame: ok.releaseFrame, hpLoss: ok.hpLoss, expectDmg: +atkDmg.toFixed(6),
    noRegrab: ok.noRegrab, stun: ok.stun, vxAway: ok.vxAway, frames: ok.frames, strikes: ok.strikes, phases: ok.phases.join(','), coolT: +gp.f.grabCoolT.toFixed(4) };
  // No-regrab window: immediately after the release a fresh grab in range cannot catch; frames until it can.
  let nrFrames = 0; while (player.noRegrabT > 0 && nrFrames < 400) { pStep(); nrFrames++; }
  r.noRegrabFrames = nrFrames + (ok.frames - ok.releaseFrame); // window already running through the Grappler's recovery frames
  const again = grab(40, { prep: () => { player.noRegrabT = sp.noRegrab; } });
  r.regrabBlocked = { caught: again.caught, reasons: again.reasons.join('/') };
  // Release when the Grappler is hit during the hold; held player is immune to other attackers.
  let others = '', heldHp = 0;
  const hit = grab(40, { hold: i => {
    if (player.heldBy && player.heldT === 5) { const hp = player.hp; others = BeatEmUp.withDepth(pEntry, () => player.takeHit(normal(), rk.f)); heldHp = hp - player.hp; }
    if (player.heldBy && player.heldT === 10) BeatEmUp.withDepth(gp, () => gp.f.takeHit(normal(), player));
  } });
  r.holderHit = { release: hit.release, held: hit.heldFrames, hpLoss: hit.hpLoss, others, heldHp, noRegrab: hit.noRegrab };
  // Release when the Grappler dies during the hold (killing hit, and death without a hit).
  const kill = grab(40, { hold: i => { if (player.heldBy && player.heldT === 10) BeatEmUp.withDepth(gp, () => gp.f.takeHit({ ...normal(), dmg: 9999 }, player)); } });
  r.holderKilled = { release: kill.release, held: kill.heldFrames, hpLoss: kill.hpLoss, gpDead: gp.f.hp <= 0 };
  let downRelease = '', downHeld = 0;
  setup(x0 - 40); BeatEmUp.withDepth(gp, () => gp.f.startAtk('punch'));
  for (let i = 0; i < 120; i++) { frame(); if (player.heldBy) { downHeld++; if (player.heldT === 10) { gp.f.hp = 0; BeatEmUp.withDepth(gp, () => gp.f.startRagdoll(null, true)); } } else if (downHeld) { downRelease = player.grabRelease; break; } }
  r.holderDown = { release: downRelease, held: downHeld, playerState: player.state };
  // Miss: nobody in range -> overreach + overcommit, 0.8 s punishable recovery, no hitbox.
  let missPunish = '';
  const miss = grab(300, { hold: i => { if (gp.f.atk && gp.f.atkT === tl.su + tl.ac + 20) missPunish = BeatEmUp.withDepth(gp, () => gp.f.takeHit(normal(), player)); } });
  const missClean = grab(300);
  r.miss = { frames: missClean.frames, travel: missClean.travel, strikes: missClean.strikes, phases: missClean.phases.join(','), punish: missPunish, coolT: gp.f.grabCoolT };
  // AI: tells 'GRAB' only when allowed; holds off during its cooldown / the player's no-regrab window.
  const aiTell = (prep) => { setup(x0 - 50); gp.ai.cool = 0; gp.ai.tellT = 0; gp.ai.tellKind = ''; prep(); BeatEmUp.updateGroupAI(Game.STEP, pEntry); return gp.ai.tellT > 0 ? gp.ai.tellKind : ''; };
  r.ai = { free: aiTell(() => {}), cooling: aiTell(() => { gp.f.grabCoolT = 1; }), noRegrab: aiTell(() => { player.noRegrabT = 1; }), behind: aiTell(() => { player.x = x0 + 60; }) };
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode;
  Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  player.reset(200, 1);
  const s = r.stats, su = r.success, m = r.miss;
  r.pass = s.hp === s.expectHp && s.speedMul === .9 && s.scaleMul === 1 && s.weapon === null && r.armed === 0 && s.dmgMul === EnemyWeaponProfiles.freehand.damage
    && s.tag === 'GRAPPLER' && s.grab === 'clinch' && s.combo === null && s.rush === null && s.slam === null && s.guard === null && s.bash === null && s.profile
    && r.grapplerSpawns === 4 && r.hurtboxSame && r.gameplayBonesSame && r.profileDrawn && r.longArms && sp.label === 'GRAB'
    && r.rangeOk && r.laneOk && !r.invuln && !r.roll && !r.air && !r.stunned
    && r.interrupt.kind === 'hit' && !r.interrupt.caught && r.interrupt.held === 0
    // Catch on the first reach frame in range; hold exactly headbuttAt frames, headbutt = release, then hitRecovery.
    && su.caught === tl.su + 1 && su.held === sp.headbuttAt && su.pinned && su.release === 'headbutt' && su.releaseFrame === tl.su + 1 + sp.headbuttAt
    && Math.abs(su.hpLoss - su.expectDmg) < 1e-6 && su.noRegrab === sp.noRegrab && su.stun === sp.stun && su.vxAway && su.strikes === 0
    && su.frames === tl.su + 1 + sp.headbuttAt + Math.max(1, Math.round(sp.hitRecovery * PACE.enemy)) && su.phases === 'xw,xh,xb,xs,xg' && su.coolT > 0
    && r.noRegrabFrames === Math.round(sp.noRegrab * 60) && !r.regrabBlocked.caught && r.regrabBlocked.reasons.includes('no-regrab')
    && r.holderHit.release === 'holder-hit' && r.holderHit.hpLoss === 0 && r.holderHit.others === 'held' && r.holderHit.heldHp === 0 && Math.abs(r.holderHit.noRegrab - (sp.noRegrab - Game.STEP)) < 1e-9
    && r.holderKilled.release === 'holder-hit' && r.holderKilled.hpLoss === 0 && r.holderKilled.gpDead
    && r.holderDown.release === 'holder-down' && r.holderDown.held > 0 && r.holderDown.held <= 12
    && m.frames === tl.total && Math.abs(m.travel - (sp.reachStep + sp.overStep)) < 1e-6 && m.strikes === 0 && m.phases === 'xw,xr,xm,xg' && m.punish === 'hit' && m.coolT === 0
    && r.ai.free === 'GRAB' && r.ai.cooling === '' && r.ai.noRegrab === '' && r.ai.behind === '';
  return r;
}
"""

DISRUPTOR = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const ds = BeatEmUp.makeEnemy('disruptor', 400, .5), rk = BeatEmUp.makeEnemy('regular', 400, .5);
  r.stats = { hp: ds.f.hp, expectHp: Math.round(85 * stageHealth), speedMul: ds.speedMul, scaleMul: ds.scaleMul, weapon: ds.f.weaponType,
    tag: ds.f.tag, deploy: ds.f.enemyDeploy, combo: ds.f.enemyCombo, rush: ds.f.enemyRush, slam: ds.f.enemySlam, guard: ds.f.enemyGuard,
    bash: ds.f.enemyBash, grab: ds.f.enemyGrab, profile: ds.f.bodyProfile === ArchetypeBodyProfiles.disruptor };
  let armed = 0; for (let i = 0; i < 60; i++) if (BeatEmUp.makeEnemy('disruptor', 400, .5).f.weaponType) armed++;
  r.armed = armed;
  r.spawns = BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(x => x === 'disruptor').length, 0), 0);
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  const hb = { d: box(ds), rookie: box(rk) };
  r.hurtboxSame = hb.d.w === hb.rookie.w && hb.d.h === hb.rookie.h;
  const proxy = ops => new Proxy({}, {
    get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
    set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
  const trace = f => { const ops = []; f.draw(proxy(ops)); return ops.join('|'); };
  const plain = new Fighter(400, ds.f.color, -1, ''); plain.reset(400, -1); ds.f.reset(400, -1);
  r.gameplayBonesSame = BeatEmUp.withDepth(ds, () => JSON.stringify(ds.f.combatBones()) === JSON.stringify(plain.combatBones()));
  r.profileDrawn = BeatEmUp.withDepth(ds, () => trace(ds.f) !== trace(plain));
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const sp = EnemyDeploys.shockZone, tl = EnemyDeploy.timeline(sp);
  const x0 = 900, px0 = x0 - 200;
  const setup = (px = px0, pdepth = .5) => {
    player.reset(px, 1); player.depth = pdepth; pEntry.depth = pdepth; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.grounded = true; player.stun = 0;
    ds.f.reset(x0, -1); ds.depth = .5; ds.f.face = -1; ds.f.hp = 300; ds.f.stun = 0;
    BeatEmUp.cast = [pEntry, ds]; ShockZones.clear();
    Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    BeatEmUp.withDepth(pEntry, () => player.clamp());
  };
  const gStep = () => { if (ds.f.hp > 0) BeatEmUp.withDepth(ds, () => ds.f.update(Game.STEP, player, 1)); };
  const keep = () => { player.stun = 0; player.state = 'idle'; player.vx = 0; player.invincibleT = 0; }; // stand still, re-hittable
  const normal = () => ({ x: 0, y: 0, w: 1, h: 1, dmg: 5, kb: 160, stun: 10, chip: 0, special: false, chain: 0 });
  // Deploy timeline: zone appears on exactly the activation frame at the player's position then; no hitbox ever.
  setup();
  BeatEmUp.withDepth(ds, () => ds.f.startAtk('punch'));
  const dep = { zoneFrame: 0, poseAtZone: '', frames: 0, strikes: 0, faces: new Set(), x0: ds.f.x, phases: [] };
  for (let i = 0; i < 200 && ds.f.atk; i++) {
    if (i === 10) player.x = px0 + 30; // moves during the wind-up: the zone uses the activation-frame position
    gStep(); dep.frames++;
    if (!ds.f.atk) break;
    if (BeatEmUp.withDepth(ds, () => ds.f.strike())) dep.strikes++;
    dep.faces.add(ds.f.face);
    if (dep.phases[dep.phases.length - 1] !== ds.f.atkPhase) dep.phases.push(ds.f.atkPhase);
    if (!dep.zoneFrame && BeatEmUp.hazards.length) { dep.zoneFrame = ds.f.atkT; dep.poseAtZone = ds.f.atkPhase; }
  }
  const z0 = BeatEmUp.hazards[0];
  r.deploy = { zoneFrame: dep.zoneFrame, poseAtZone: dep.poseAtZone, frames: dep.frames, strikes: dep.strikes, faces: [...dep.faces], back: +(ds.f.x - dep.x0).toFixed(3),
    phases: dep.phases.join(','), zoneX: z0?.x, expectX: px0 + 30, zoneDepth: z0?.depth, coolT: ds.f.deployCoolT, zones: BeatEmUp.hazards.length };
  // One-zone limit: a second placement while the first is out is refused.
  r.secondPlace = ShockZones.place(ds.f, player, sp) === null && BeatEmUp.hazards.length === 1;
  // Zone run: player at `dx` from the zone centre and `dpx` floor-px lane offset; returns hit frames.
  const zoneRun = (opts = {}) => {
    setup(px0, opts.depth ?? .5);
    const z = ShockZones.place(ds.f, player, sp);
    player.x = z.x + (opts.dx || 0);
    const o = { hits: [], removedAt: 0, maxT: 0, dmg: 0, stun: 0, xFixed: true, draws: { warn: 0, live: 0 } };
    for (let t = 1; t <= 200; t++) {
      if (opts.each) opts.each(t, z);
      if (opts.kill && t === opts.kill) { ds.f.hp = 0; BeatEmUp.withDepth(ds, () => ds.f.startRagdoll(null, true)); }
      gStep();
      const hp = player.hp;
      ShockZones.update(pEntry);
      if (player.hp < hp) { o.hits.push(z.t); o.dmg = +(hp - player.hp).toFixed(6); o.stun = player.stun; }
      if (!BeatEmUp.hazards.includes(z)) { o.removedAt = t; break; }
      o.maxT = z.t; if (z.x !== z.x0 && z.x0 !== undefined) o.xFixed = false; z.x0 = z.x0 ?? z.x;
      const ph = ShockZones.phase(z); if ((t === 20 || t === 80) && (ph === 'warn' || ph === 'live')) { const ops = []; ShockZones.draw(proxy(ops)); o.draws[ph] = ops.length; }
      keep();
    }
    return o;
  };
  const expectDmg = +(sp.dmg * BeatEmUp.difficulty.damage).toFixed(6);
  r.expectDmg = expectDmg;
  r.inside = zoneRun();
  r.edge = zoneRun({ dx: sp.halfW });
  r.stepOut = zoneRun({ each: (t, z) => { if (t === 30) player.x = z.x + sp.halfW + 1; } });
  r.outside = zoneRun({ dx: sp.halfW + 1 });
  const tol = BeatEmUp.depthHitTolerance({ role: 'enemy', scaleMul: 1 }, pEntry);
  const depthFor = px => { for (let d = .5; d <= 1; d += .0005) if (Math.abs(BeatEmUp.floorDepthPx(d) - BeatEmUp.floorDepthPx(.5)) >= px) return d; return 1; };
  r.tol = tol;
  r.lane = [tol - 2, tol + 2, Depth.lanePx()].map(px => zoneRun({ each: (t) => { if (t === 1) { pEntry.depth = player.depth = depthFor(px); } } }).hits.length);
  r.laneChange = zoneRun({ each: (t) => { if (t === 30) { pEntry.depth = player.depth = depthFor(Depth.lanePx()); } } }).hits.length;
  r.lateEntry = zoneRun({ dx: 200, each: (t, z) => { if (t === 80) player.x = z.x; } }).hits;
  r.invuln = zoneRun({ each: (t) => { if (t < 70) player.invincibleT = 1; else player.invincibleT = 0; } }).hits;
  r.air = zoneRun({ each: () => { player.grounded = false; player.y = -40; } }).hits.length;
  r.blocking = zoneRun({ each: () => { player.blocking = 1; } });
  r.notHoming = zoneRun({ each: (t, z) => { if (t > 5) player.x = z.x + 300 + t; } });
  r.ownerDead = zoneRun({ kill: 10 });
  r.deadPlace = ShockZones.place(ds.f, player, sp) === null;
  // Interrupt: a hit in the wind-up cancels the deploy (no zone).
  setup(); BeatEmUp.withDepth(ds, () => ds.f.startAtk('punch'));
  let intKind = ''; for (let i = 0; i < 80 && ds.f.atk; i++) { if (i === 10) intKind = BeatEmUp.withDepth(ds, () => ds.f.takeHit(normal(), player)); gStep(); }
  r.interrupt = { kind: intKind, zones: BeatEmUp.hazards.length };
  // Cooldown: exactly 4 s of sim time from the activation frame.
  setup(); ShockZones.place(ds.f, player, sp); ShockZones.clear();
  let cool = 0; while (ds.f.deployCoolT > 0 && cool < 600) { gStep(); cool++; }
  r.coolFrames = cool;
  // AI gating: ZAP tell when free, none during cooldown, none while its zone is out, backs off when too close.
  const aiTell = prep => { setup(x0 - 180); ds.ai.cool = 0; ds.ai.tellT = 0; ds.ai.tellKind = ''; ds.f.deployCoolT = 0; prep(); BeatEmUp.updateGroupAI(Game.STEP, pEntry); return ds.ai.tellT > 0 ? ds.ai.tellKind : ''; };
  r.ai = { free: aiTell(() => {}), cooling: aiTell(() => { ds.f.deployCoolT = 1; }), zoneOut: aiTell(() => { ShockZones.place(ds.f, player, sp); ds.f.deployCoolT = 0; }) };
  setup(x0 - 40); ds.ai.cool = 0; BeatEmUp.updateGroupAI(Game.STEP, pEntry); r.ai.close = { tell: ds.ai.tellT > 0, pad: ds._pad && ds._pad.right ? 'away' : ds._pad && ds._pad.left ? 'toward' : '' };
  // Cleanup: zone hooks on every stage / wave / boss / down / lose / begin path.
  r.cleanupHooks = ['resetStage', 'startWave', 'startBoss', 'playerDown', 'loseStage', 'begin'].filter(k => !BeatEmUp[k].toString().includes('ShockZones.clear()'));
  setup(); ShockZones.place(ds.f, player, sp); ShockZones.clear(); r.cleared = BeatEmUp.hazards.length;
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode; ShockZones.clear();
  Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  player.reset(200, 1);
  const s = r.stats, d = r.deploy, end = sp.warn + sp.live;
  const once = o => o.hits.length === 1;
  r.pass = s.hp === s.expectHp && s.speedMul === .9 && s.scaleMul === 1 && s.weapon === null && r.armed === 0 && s.tag === 'DISRUPTOR' && s.deploy === 'shockZone'
    && s.combo === null && s.rush === null && s.slam === null && s.guard === null && s.bash === null && s.grab === null && s.profile && sp.label === 'ZAP'
    && r.spawns === 0 && r.hurtboxSame && r.gameplayBonesSame && r.profileDrawn
    && d.zoneFrame === tl.su + 1 && d.poseAtZone === 'da' && d.frames === tl.total && d.strikes === 0 && d.faces.join() === '-1' && Math.abs(d.back - sp.backStep) < 1e-6
    && d.phases === 'dw,da,dr,dg' && d.zoneX === d.expectX && d.zoneDepth === .5 && d.coolT > 0 && d.zones === 1 && r.secondPlace
    // Warning first: no damage before frame warn+1; exactly one zap of dmg x difficulty with the short stun; removed after warn+live.
    && once(r.inside) && r.inside.hits[0] === sp.warn + 1 && Math.abs(r.inside.dmg - r.expectDmg) < 1e-6 && r.inside.stun === sp.stun
    && r.inside.maxT === end && r.inside.removedAt === end + 1 && r.inside.xFixed && r.inside.draws.warn > 0 && r.inside.draws.live > 0
    && once(r.edge) && r.stepOut.hits.length === 0 && r.outside.hits.length === 0
    && r.lane.join() === '1,0,0' && r.laneChange === 0 && r.lateEntry.join() === '80' && r.invuln.join() === '70' && r.air === 0 && once(r.blocking)
    && r.notHoming.hits.length === 0 && r.notHoming.xFixed
    // Owner dies at frame 10: the zone still finishes its cycle (zaps at warn+1, removed after warn+live); dead owners place nothing.
    && once(r.ownerDead) && r.ownerDead.hits[0] === sp.warn + 1 && r.ownerDead.removedAt === end + 1 && r.deadPlace
    && r.interrupt.kind === 'hit' && r.interrupt.zones === 0
    && r.coolFrames === Math.round(sp.cooldown * 60)
    && r.ai.free === 'ZAP' && r.ai.cooling === '' && r.ai.zoneOut === '' && !r.ai.close.tell && r.ai.close.pad === 'away'
    && r.cleanupHooks.length === 0 && r.cleared === 0;
  return r;
}
"""

RANGED = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast, phase: Game.phase, lockL: BeatEmUp.lockL, lockR: BeatEmUp.lockR };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0; Game.banner = '';
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0; BeatEmUp.lockL = 0; BeatEmUp.lockR = BeatEmUp.worldMax;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const rg = BeatEmUp.makeEnemy('ranged', 400, .5), rk = BeatEmUp.makeEnemy('regular', 400, .5);
  r.stats = { hp: rg.f.hp, expectHp: Math.round(65 * stageHealth), speedMul: rg.speedMul, scaleMul: rg.scaleMul, weapon: rg.f.weaponType, tag: rg.f.tag,
    special: rg.f.specialDamageMultiplier, profile: rg.f.bodyProfile === ArchetypeBodyProfiles.ranged,
    proj: [EnemyProjectile.speed, EnemyProjectile.range, EnemyProjectile.tell, EnemyProjectile.recovery, EnemyProjectile.cooldown].join(',') };
  const count = k => BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(x => x === k).length, 0), 0);
  r.throwerGone = !('thrower' in EnemyArchetypes) && !('thrower' in CpuHotColors.enemy); r.throwerSpawns = count('thrower'); r.rangedSpawns = count('ranged');
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  const hb = { r: box(rg), rookie: box(rk) };
  r.hurtboxSame = hb.r.w === hb.rookie.w && hb.r.h === hb.rookie.h;
  const proxy = ops => new Proxy({}, {
    get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
    set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
  const trace = f => { const ops = []; f.draw(proxy(ops)); return ops.join('|'); };
  const plain = new Fighter(400, rg.f.color, -1, ''); plain.reset(400, -1); rg.f.reset(400, -1);
  r.gameplayBonesSame = BeatEmUp.withDepth(rg, () => JSON.stringify(rg.f.combatBones()) === JSON.stringify(plain.combatBones()));
  const rtrace = BeatEmUp.withDepth(rg, () => trace(rg.f));
  r.profileDrawn = rtrace !== BeatEmUp.withDepth(rg, () => trace(plain)); r.hoodDrawn = rtrace.includes('#3B3550'); r.pouchDrawn = rtrace.includes('#4A3B2A');
  // No head label: the in-game draw path never writes the tag (old THROWER kept one).
  const labelOps = []; BeatEmUp.drawFighter(proxy(labelOps), rg);
  r.headLabel = labelOps.filter(o => o.startsWith('fillText:') && /RANGED|THROWER/.test(o)).length;
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const x0 = 900;
  const setup = (px = x0 - 250) => {
    player.reset(px, 1); player.depth = .5; pEntry.depth = .5; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.stun = 0; player.blocking = 0;
    rg.f.reset(x0, -1); rg.depth = .5; rg.f.hp = 300; rg.f.enemyThrowPose = null;
    Object.assign(rg.ai, { cool: 0, tellT: 0, tellKind: '', throwPhase: '', recoveryT: 0, throwReleaseT: 0 });
    BeatEmUp.cast = [pEntry, rg]; BeatEmUp.enemyProjectiles = [];
    Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    BeatEmUp.withDepth(pEntry, () => player.clamp());
  };
  const frame = (moveProj = true) => {
    BeatEmUp.updateGroupAI(Game.STEP, pEntry);
    const pad = rg._pad || {};
    Input.acts.forEach(a => { Input.pad[1][a] = pad[a] || 0; Input.was[1][a] = 0; });
    BeatEmUp.withDepth(rg, () => rg.f.update(Game.STEP, player, 1));
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    if (moveProj) EnemyProjectile.update(Game.STEP, pEntry);
  };
  const tp = ArchetypeBodyProfiles.ranged.throwPoses, relPose = EnemyCombo.pose(tp.release);
  // Joint angles compare modulo a full turn (the pose blender takes the short way round, so 150deg may be stored as -210deg).
  const wrap = v => { const t = Math.PI * 2; return Math.abs(((v % t) + t + Math.PI) % t - Math.PI); };
  const near = (a, b) => Object.keys(b).every(k => (k === 'hipBob' || k === 'shPull') ? Math.abs(a[k] - b[k]) < 1e-9 : wrap(a[k] - b[k]) < 1e-9);
  // One full shot cycle through the real shared AI.
  setup();
  const cyc = { windupStart: 0, spawn: 0, spawnPoseKey: '', spawnPoseExact: false, prevPoseRelease: false, releaseEnd: 0, recoveryEnd: 0, nextWindup: 0, heldKunai: false, aimHeld: false };
  let proj = null, lastPhase = '';
  for (let i = 1; i <= 400; i++) {
    const before = BeatEmUp.enemyProjectiles.length, keyBefore = rg.f.poseKey;
    frame(false);
    const ph = rg.ai.throwPhase;
    if (ph === 'windup' && !cyc.windupStart) cyc.windupStart = i;
    if (ph === 'windup' && i === cyc.windupStart + 20) { cyc.aimHeld = near(rg.f.pose, EnemyCombo.pose(tp.windup)); cyc.heldKunai = BeatEmUp.withDepth(rg, () => trace(rg.f)).includes('#DCE6F5'); }
    if (BeatEmUp.enemyProjectiles.length > before && !cyc.spawn) {
      cyc.spawn = i; proj = BeatEmUp.enemyProjectiles[0]; cyc.spawnPoseKey = rg.f.poseKey; cyc.spawnPoseExact = near(rg.f.pose, relPose); cyc.prevPoseRelease = keyBefore === 'enemy-throw-release';
      cyc.heldAfter = BeatEmUp.withDepth(rg, () => trace(rg.f)).includes('#DCE6F5');
    }
    if (cyc.spawn && lastPhase === 'release' && ph !== 'release') cyc.releaseEnd = i;
    if (cyc.spawn && lastPhase === 'recovery' && ph !== 'recovery') cyc.recoveryEnd = i;
    if (cyc.recoveryEnd && ph === 'windup' && !cyc.nextWindup) { cyc.nextWindup = i; break; }
    lastPhase = ph;
    player.x = x0 - 250; player.hp = 100; // player holds still (projectile is not stepped here)
  }
  const steps = t => { let n = 0; while (t > 0) { t = Math.max(0, t - Game.STEP); n++; } return n; };
  r.cycle = { ...cyc, aimFrames: cyc.spawn - cyc.windupStart, releaseFrames: cyc.releaseEnd - cyc.spawn, recoveryFrames: cyc.recoveryEnd - cyc.releaseEnd,
    expectAim: steps(EnemyProjectile.tell), expectRelease: steps(.14), expectRecovery: steps(EnemyProjectile.recovery) };
  r.projShape = proj ? { w: proj.width, h: proj.height, speed: proj.speed, range: proj.range, depth: proj.depth, face: proj.face, dmg: +proj.damage.toFixed(6),
    expectDmg: +(EnemyProjectile.damage * BeatEmUp.difficulty.damage).toFixed(6) } : null;
  // No homing: after launch the player moves in x and lane; the kunai keeps its depth, height and direction, moving speed*STEP per frame.
  const flight = (opts) => {
    setup(); let p = null, hits = 0, homing = false;
    for (let i = 0; i < 300; i++) {
      const hp = player.hp; frame(true);
      if (!p && BeatEmUp.enemyProjectiles.length) { p = BeatEmUp.enemyProjectiles[0]; p._d = p.depth; p._y = p.y; p._f = p.face; p._x = p.x; if (opts.after) { opts.after(); BeatEmUp.withDepth(pEntry, () => player.clamp()); } continue; }
      if (p && BeatEmUp.enemyProjectiles.includes(p)) { if (p.depth !== p._d || p.y !== p._y || p.face !== p._f || Math.abs((p.x - p._x) - p.face * p.speed * Game.STEP) > 1e-6) homing = true; p._x = p.x; }
      if (player.hp < hp) hits++;
      if (p && !BeatEmUp.enemyProjectiles.includes(p)) break;
      player.stun = 0;
    }
    return { launched: !!p, hits, homing };
  };
  const depthFor = px => { for (let d = .5; d <= 1; d += .0005) if (Math.abs(BeatEmUp.floorDepthPx(d) - BeatEmUp.floorDepthPx(.5)) >= px) return d; return 1; };
  r.sameLane = flight({});
  r.laneChange = flight({ after: () => { pEntry.depth = player.depth = depthFor(BeatEmUp.DEPTH_HIT_PX + 4); } });
  r.sidestepX = flight({ after: () => { player.x = x0 + 400; } });
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode; Game.phase = prev.phase; BeatEmUp.enemyProjectiles = []; BeatEmUp.lockL = prev.lockL; BeatEmUp.lockR = prev.lockR;
  Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  player.reset(200, 1);
  r.kunaiDrawOps = (() => { const ops = []; BeatEmUp.enemyProjectiles = [{ x: 100, y: 100, face: 1 }]; EnemyProjectile.draw(proxy(ops)); BeatEmUp.enemyProjectiles = []; return ops.length; })();
  const s = r.stats, c = r.cycle;
  r.pass = s.hp === s.expectHp && s.speedMul === 1 && s.scaleMul === 1 && s.weapon === null && s.special === 0 && s.profile && s.proj === '250,560,0.5,0.9,2.5'
    && r.throwerGone && r.throwerSpawns === 0 && r.rangedSpawns === 0 && r.hurtboxSame && r.gameplayBonesSame && r.profileDrawn && r.hoodDrawn && r.pouchDrawn && r.headLabel === 0
    // Release pose lands on exactly the projectile spawn frame (not before, fully posed on it); aim held long enough to read.
    && c.spawn > 0 && c.spawnPoseKey === 'enemy-throw-release' && c.spawnPoseExact && !c.prevPoseRelease && c.aimHeld && c.heldKunai && !c.heldAfter
    && c.aimFrames === c.expectAim && c.releaseFrames === c.expectRelease && c.recoveryFrames === c.expectRecovery && c.nextWindup > 0
    && r.projShape && r.projShape.w === 20 && r.projShape.h === 10 && r.projShape.depth === .5 && r.projShape.face === -1 && Math.abs(r.projShape.dmg - r.projShape.expectDmg) < 1e-6
    && r.sameLane.launched && r.sameLane.hits === 1 && !r.sameLane.homing
    && r.laneChange.launched && r.laneChange.hits === 0 && !r.laneChange.homing
    && r.sidestepX.launched && r.sidestepX.hits === 0 && !r.sidestepX.homing && r.kunaiDrawOps > 10;
  return r;
}
"""

PACING = r"""
() => {
  // Pacing pass (2026-11-15, Lemar WP5 starting point). Practice fighters, 60 fps fixed step, no hits landed.
  const prev = { mode: Game.mode, floor: Fighter.BLEND_FLOOR, random: Math.random };
  Game.mode = 'practice'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0; Game.minX = 0; Game.maxX = Game.W * 4;
  if (Input.syncMode) Input.syncMode();
  const f = fighters[0], foe = fighters[1];
  Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[0][a] = 0; Input.was[1][a] = 0; });
  const run = (cls, kind, chain, floor) => {
    Fighter.BLEND_FLOOR = floor; Math.random = () => .5; // no random crits: compare geometry only
    BladeSuper.clear(); if (Fx.clear) Fx.clear();
    f.setClass(cls); f.reset(Game.W * .3, 1); f.playerControlled = true; f.depth = 0;
    foe.setClass(null); foe.reset(Game.W * 3.5, -1); foe.playerControlled = false; foe.depth = 0;
    if (kind === 'special') f.meter = 100;
    if (chain > 0) { f.chain = chain - 1; f.chainArmed = 1; }
    f.startAtk(kind);
    const a = f.atk, out = { su: a.su, ac: a.ac, re: a.re, live: [] };
    for (let i = 0; i < a.su + a.ac + a.re + 2 && f.atk === a; i++) {
      f.update(Game.STEP, foe, 0);
      if (f.atk === a && f.atkT > a.su && f.atkT <= a.su + a.ac) {
        const s = f.strike(), b = f.combatBones();
        out.live.push(f.atkT + ':' + JSON.stringify(s) + JSON.stringify([b.la, b.ra, b.ll, b.rl, b.x0, b.x1, b.y0, b.y1]));
      }
    }
    return out;
  };
  const classes = { freehand: 2, blade: 2, staff: 2 }, r = { frames: {}, liveSame: true, liveDiff: [], liveFrames: 0 };
  for (const [cls, max] of Object.entries(classes)) {
    const moves = [];
    for (let c = 0; c < max; c++) moves.push(['punch', c]);
    moves.push(['kick', 0], ['special', 0]);
    for (const [kind, c] of moves) {
      const now = run(cls, kind, c, .08), old = run(cls, kind, c, .04);
      r.frames[cls + ' ' + kind + (kind === 'punch' ? c : '')] = [now.su, now.ac, now.re].join('/');
      r.liveFrames += now.live.length;
      // Visual-only blend floor: every active frame's strike box and combat bones match the old .04 floor exactly.
      if (JSON.stringify(now.live) !== JSON.stringify(old.live) || now.live.length !== now.ac) { r.liveSame = false; r.liveDiff.push(cls + ' ' + kind + c); }
    }
  }
  Fighter.BLEND_FLOOR = prev.floor; Math.random = prev.random; BladeSuper.clear(); if (Fx.clear) Fx.clear();
  f.setClass('freehand'); f.reset(Game.W * .3, 1); foe.reset(Game.W * .7, -1);
  // Blend floor applies outside active frames (e.g. a land/roll blend of .045 now lasts .08 s).
  f.aim('roll', Pose.roll(f.classProfile), .045); r.rollBlend = f.blendDur;
  // Movement: 0 -> top speed and top speed -> stop at the new accel/brake.
  const accelT = n => { let v = 0, k = 0; while (v < n) { v = Math.min(n, v + Fighter.GROUND_ACCEL * Game.STEP); k++; } return k; };
  const brakeT = n => { let v = n, k = 0; while (v > 0) { v = Math.max(0, v - Fighter.GROUND_BRAKE * Game.STEP); k++; } return k; };
  r.move = { accel: Fighter.GROUND_ACCEL, brake: Fighter.GROUND_BRAKE, turn: Fighter.TURN_ACCEL, toTop220: accelT(220), stop220: brakeT(220) };
  const fr = r.frames, tot = k => fr[k].split('/').map(Number).reduce((a, b) => a + b, 0), su = k => +fr[k].split('/')[0];
  // Generic special stays 14/10/18. Staff special base is now 16/31/10 (same 57-frame total). Heavy SLAM, enemy specials, boss signatures, stun stay put.
  const sig = k => [Moves[k].su, Moves[k].ac, Moves[k].re].join('/');
  r.untouched = [sig('special'), sig('staffSpecial'), sig('bossBlockParty'), sig('bossDockHaulIn'), sig('bossMarketToss'), sig('bossForgeQuake'), sig('bossShieldCharge'),
    [EnemySlams.overhead.windup, EnemySlams.overhead.active, EnemySlams.overhead.recovery].join('/'),
    [EnemyRushes.shoulder.crouch, EnemyRushes.shoulder.dash, EnemyRushes.shoulder.active, EnemyRushes.shoulder.whiffRecovery].join('/'),
    [EnemyBashes.shield.windup, EnemyBashes.shield.active, EnemyBashes.shield.whiffRecovery].join('/'),
    [EnemyGrabs.clinch.windup, EnemyGrabs.clinch.active, EnemyGrabs.clinch.whiffRecovery].join('/'),
    [EnemyDeploys.shockZone.windup, EnemyDeploys.shockZone.active, EnemyDeploys.shockZone.recovery].join('/'),
    [EnemyProjectile.tell, EnemyProjectile.recovery, EnemyProjectile.cooldown].join('/'),
    [Moves.punch.chainStun.join(','), Moves.kick.stun, Moves.staffPunch.stun, Moves.staffKick.stun].join('/')].join(' ');
  r.expectUntouched = '14/10/18 16/31/10 10/9/16 14/24/16 12/60/18 16/18/20 18/20/18 30/4/48 16/18/7/' + EnemyRushes.shoulder.whiffRecovery
    + ' 14/5/48 27/6/48 24/1/30 0.5/0.9/2.5 10,15,24,24/22/10/22';
  Game.mode = prev.mode;
  const exp = {
    'freehand punch0': '12/4/19', 'freehand punch1': '12/4/19', 'freehand kick': '19/7/31',
    'blade punch0': '12/4/19', 'blade punch1': '12/4/19', 'blade kick': '19/7/31',
    'staff punch0': '12/4/19', 'staff punch1': '12/4/19', 'staff kick': '19/7/31',
  };
  r.expectOk = Object.entries(exp).every(([k, v]) => fr[k] === v);
  const followSu = Object.keys(fr).filter(k => /punch[1-9]/.test(k)).every(k => su(k) >= 5);
  // Class order kept: Karate fastest, Blade middle, Staff slowest (first punch, full string and kick totals).
  const string = c => Object.keys(fr).filter(k => k.startsWith(c + ' punch')).reduce((n, k) => n + tot(k), 0) / Object.keys(fr).filter(k => k.startsWith(c + ' punch')).length;
  r.order = { punch0: [tot('freehand punch0'), tot('blade punch0'), tot('staff punch0')], avgString: [string('freehand'), string('blade'), string('staff')], kick: [tot('freehand kick'), tot('blade kick'), tot('staff kick')] };
  const uniform = (a, n) => a[0] === n && a[1] === n && a[2] === n;
  r.pass = r.liveSame && r.liveFrames > 0 && r.expectOk && followSu && uniform(r.order.punch0, 35) && uniform(r.order.avgString, 35) && uniform(r.order.kick, 57)
    && Math.abs(r.rollBlend - .08) < 1e-9 && r.move.accel === 1000 && r.move.brake === 1400 && r.move.turn === 1700 && r.untouched === r.expectUntouched;
  return r;
}
"""

BOSS_B2A = r"""
() => {
  // Boss B2 PR A: stages 6-8 profiles + signatures, scripted frame by frame (no AI unless noted).
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast, phase: Game.phase, lockL: BeatEmUp.lockL, lockR: BeatEmUp.lockR, random: Math.random, minX: Game.minX, maxX: Game.maxX, ground: Game.GROUND };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0; Game.banner = '';
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0; BeatEmUp.lockL = 0; BeatEmUp.lockR = BeatEmUp.worldMax;
  Game.GROUND = Game.H * .72;
  const STEP = Game.STEP, BH = BossHardness.damage, DIFF = BeatEmUp.difficulty.damage, r = {};
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const gapD = (base, px) => { for (let d = base; d <= 1; d += .0002) if (Math.abs(BeatEmUp.floorDepthPx(d) - BeatEmUp.floorDepthPx(base)) >= px) return d; return 1; };
  const pads0 = () => Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[0][a] = 0; Input.was[1][a] = 0; });
  let e = null;
  const setup = (stage, bx = 900, px = 700, pFace = 1) => {
    BeatEmUp.stage = stage; BeatEmUp.bossProjectiles = []; BossFields.clear(); pads0();
    e = BeatEmUp.makeEnemy('boss', bx, .5); e.ai.phase = 2; e.f.meter = 100; e.f.face = -1;
    player.reset(px, pFace); player.face = pFace; player.depth = .5; pEntry.depth = .5; player.hp = 1000; player.invincibleT = 0; player.dodgeT = 0; player.stun = 0; player.blocking = 0;
    BeatEmUp.cast = [pEntry, e]; Game.minX = -1e4; Game.maxX = 1e5;
    BeatEmUp.withDepth(pEntry, () => player.clamp()); BeatEmUp.withDepth(e, () => e.f.clamp());
    return e;
  };
  const tune = () => { if (e.f.atk && e.f.atk !== e._tunedAtk) { e._tunedAtk = e.f.atk; e.f.atk.dmg *= DIFF; e.f.atk.dmg *= BH; } };
  const frame = (playerUpdate = false) => {
    pads0();
    if (playerUpdate) BeatEmUp.withDepth(pEntry, () => { Game.minX = -1e4; Game.maxX = 1e5; player.update(STEP, e.f, 0); });
    else BeatEmUp.withDepth(pEntry, () => player.clamp());
    BeatEmUp.withDepth(e, () => { Game.minX = -1e4; Game.maxX = 1e5; e.f.update(STEP, player, 1); tune(); });
    BeatEmUp.withDepth(pEntry, () => player.clamp());
    BeatEmUp.resolveHits();
    BossFields.update(pEntry);
  };
  const start = kind => BeatEmUp.withDepth(e, () => { e.f.startAtk(kind); tune(); });
  // --- Profiles / stats
  const prof = s => BeatEmUp.chapters[s - 1].boss.profile;
  r.profiles = [6, 7, 8].map(s => { const p = prof(s), b = setup(s); return [p.weapon, p.reach, BossWeapons[p.weapon].reach, b.scaleMul, +b.speedMul.toFixed(3), p.signature.key, p.counter || ''].join('/'); });
  const base = { bossSniperStock: [7, 3, 11], bossSniperKick: [10, 4, 15], bossKageThrust: [9, 4, 14], bossKageWheel: [12, 5, 16], bossBreakerSwing: [16, 5, 22], bossBreakerShove: [10, 4, 15] };
  r.normalsPaced = Object.entries(base).every(([k, [su, ac, re]]) => Moves[k].su === Math.round(su * 1.3) && Moves[k].ac === ac && Moves[k].re === Math.round(re * 1.3));
  r.normalDmg = Object.keys(base).map(k => Moves[k].dmg).join(',');
  // --- Normals: hitbox ends at the weapon tip (Sniper kick is a foot kick, no weapon segment)
  const normalRun = (stage, kind) => {
    setup(stage, 900, 600); start(kind); let out = null;
    for (let i = 0; i < 80 && e.f.atk; i++) {
      frame();
      if (!out && e.f.atk && e.f.atkT === e.f.atk.su + 1) BeatEmUp.withDepth(e, () => {
        const hit = e.f.strike(), b = e.f.combatBones(), geo = e.f.weaponGeometry(b, true);
        out = { seg: !!hit?.segment, tipMatch: !!hit?.segment && Math.abs(hit.segment.x2 - geo.tip.x) < 1e-9 && Math.abs(hit.segment.y2 - geo.tip.y) < 1e-9,
          reach: geo ? +Math.abs(geo.tip.x - b.ra.x).toFixed(3) : 0, foot: !hit?.segment && !!hit && Math.abs(hit.x + hit.w / 2 - b.ll.x) < 40 };
      });
    }
    return out;
  };
  r.normals = { sniperStock: normalRun(6, 'punch'), sniperKick: normalRun(6, 'kick'), kageThrust: normalRun(7, 'punch'), kageWheel: normalRun(7, 'kick'), breakerSwing: normalRun(8, 'punch'), breakerShove: normalRun(8, 'kick') };
  const n = r.normals;
  r.normalsOk = n.sniperStock.tipMatch && n.sniperStock.reach === 100 && n.sniperKick.foot && n.kageThrust.tipMatch && n.kageThrust.reach === 200 && n.kageWheel.tipMatch && n.kageWheel.reach === 200
    && n.breakerSwing.tipMatch && n.breakerSwing.reach === 210 && n.breakerShove.tipMatch && Math.abs(n.breakerShove.reach - 126) < 1e-6;
  // --- Laser Lock (phase 2): lane locked at the start, bolt full-screen in that lane only
  const laser = (px, movePx = 0, phase = 2, pDepth = .5) => {
    setup(6, 900, px); e.ai.phase = phase; player.depth = pEntry.depth = pDepth;
    start('special');
    const lines = BeatEmUp.bossFields.filter(z => z.kind === 'laser'), o = { su: e.f.atk.su, ac: e.f.atk.ac, depths: lines.map(z => z.depth), fired: [], hp0: player.hp, togetherAtSu: false };
    if (movePx) { player.depth = pEntry.depth = gapD(pDepth, movePx); }
    for (let i = 0; i < 120 && e.f.atk; i++) {
      const before = player.hp; frame();
      if (e.f.atk && e.f.atkT === e.f.atk.su) o.togetherAtSu = lines.every(z => !z.fired && BeatEmUp.bossFields.includes(z));
      lines.forEach(z => { if (z.fired && !z._seen) { z._seen = 1; o.fired.push({ frame: z.firedFrame, depth: z.depth, result: z.result || 'none' }); } });
      player.stun = 0;
    }
    o.dmg = +(o.hp0 - player.hp).toFixed(6); return o;
  };
  r.laserFar = laser(100);                     // ~800px away: full screen
  r.laserLaneLock = laser(600, 15);            // stepped 15px out of the locked lane after the lock
  r.laserEdge = laser(600, 13);                // 13px: still inside the 14px window
  const lf = r.laserFar, expBolt = +(18 * BH * DIFF).toFixed(6);
  r.laserOk = lf.su === 47 && lf.ac === 1 && lf.fired.length === 1 && lf.fired[0].frame === 48 && lf.dmg === expBolt && lf.depths[0] === .5
    && r.laserLaneLock.dmg === 0 && r.laserLaneLock.fired[0].result === 'miss' && r.laserEdge.dmg === expBolt;
  // --- Laser Lock phase 3: lines 0/.5/1 together for 0.6 s, then random order 0.25 s (15 f) apart, each 14px
  const orders = new Set(); let p3ok = true;
  for (let k = 0; k < 8; k++) {
    const o = laser(600, 0, 3, .5);
    orders.add(o.fired.map(f => f.depth).join(','));
    const frames = o.fired.map(f => f.frame);
    p3ok = p3ok && o.su === 47 && o.ac === 40 && o.togetherAtSu && o.depths.slice().sort().join(',') === '0,0.5,1' && frames.join(',') === '48,63,78'
      && o.dmg === expBolt && o.fired.filter(f => f.result === 'hit').length === 1 && o.fired.find(f => f.result === 'hit').depth === .5;
    if (k === 0) { r.phase3Sample = o.fired; r.phase3Su = o.su; }
  }
  r.phase3Orders = orders.size;
  const below1 = px => { for (let d = 1; d >= 0; d -= .0002) if (Math.abs(BeatEmUp.floorDepthPx(1) - BeatEmUp.floorDepthPx(d)) >= px) return d; return 0; };
  const p3near = laser(600, 0, 3, below1(13)), p3gap = laser(600, 0, 3, below1(15)); // 13px / 15px off the depth-1 line
  r.phase3Lane = { near13: p3near.fired.filter(f => f.result === 'hit').map(f => f.depth).join(','), gap15: p3gap.fired.filter(f => f.result === 'hit').length };
  r.phase3Ok = p3ok && r.phase3Orders >= 2 && r.phase3Lane.near13 === '1' && r.phase3Lane.gap15 === 0;
  // --- Shadow Step: teleport behind the player (opposite their facing) in the locked lane, cut 16 at the naginata tip
  const shadow = (pFace, laneMove = 0) => {
    setup(7, 900, 700, pFace); start('special');
    const o = { su: e.f.atk.su, hp0: player.hp, hits: [], tip: null };
    if (laneMove) player.depth = pEntry.depth = gapD(.5, laneMove);
    for (let i = 0; i < 90 && e.f.atk; i++) {
      const before = player.hp, t = e.f.atkT + 1;
      if (t === e.f.atk.su + 2) BeatEmUp.withDepth(e, () => { e.f.atkT++; const hit = e.f.strike(), geo = e.f.weaponGeometry(e.f.combatBones(), true); e.f.atkT--; o.tip = hit && hit.segment ? { match: hit.segment.x2 === geo.tip.x && hit.segment.y2 === geo.tip.y, reach: +Math.abs(geo.tip.x - e.f.combatBones().ra.x).toFixed(3) } : null; });
      frame();
      if (player.hp < before) o.hits.push({ frame: e.f.atkT, dmg: +(before - player.hp).toFixed(6) });
      player.stun = 0;
    }
    o.tele = e.f.sigTeleported; o.after = BeatEmUp.bossFields.some(z => z.kind === 'afterimage') || o.tele != null; o.depth = e.depth;
    return o;
  };
  r.shadowFaceRight = shadow(1); r.shadowFaceLeft = shadow(-1); r.shadowLane = shadow(1, BeatEmUp.ENEMY_DEPTH_HIT_PX + 1);
  const sr = r.shadowFaceRight, sl = r.shadowFaceLeft, expCut = +(16 * BH * DIFF).toFixed(6);
  r.shadowOk = sr.su === 39 && sr.tele && sr.tele.x === 610 && sl.tele.x === 790 && sr.hits.length === 1 && sr.hits[0].dmg === expCut && sl.hits.length === 1
    && sr.hits[0].frame >= 32 && sr.tip && sr.tip.match && sr.tip.reach === 200 && r.shadowLane.hits.length === 0 && r.shadowLane.tele.depth === .5;
  // --- Kage counter stance
  const counterRun = (attack) => {
    setup(7, 900, 830, 1); player.face = 1; e.f.face = -1;
    e.f.bossCounterQueued = true; start('punch');
    const o = { counter: !!e.f.atk?.counter, stance: e.f.atk?.su, end: 0, bossHp0: e.f.hp, hp0: player.hp, parryFrame: 0, hits: [] };
    for (let i = 0; i < 120 && e.f.atk; i++) {
      if (attack && i === 10) BeatEmUp.withDepth(pEntry, () => player.startAtk('punch'));
      const before = player.hp; frame(attack);
      if (e.f.atk?.parried && !o.parryFrame) o.parryFrame = e.f.atk.parryFrame;
      if (player.hp < before) o.hits.push({ frame: e.f.atkT, dmg: +(before - player.hp).toFixed(6) });
      if (!e.f.atk) o.end = i + 1;
      player.stun = 0;
    }
    o.bossDmg = +(o.bossHp0 - e.f.hp).toFixed(6);
    return o;
  };
  r.counterUnused = counterRun(false); r.counterParry = counterRun(true);
  const cu = r.counterUnused, cp = r.counterParry, expRip = +(BossCounters.kage.dmg * BH * DIFF).toFixed(6);
  r.counterOk = cu.counter && cu.stance === 62 && cu.end === 62 && cu.hits.length === 0
    && cp.parryFrame > 0 && cp.parryFrame <= 62 && cp.bossDmg === 0 && cp.hits.length === 1 && cp.hits[0].dmg === expRip && cp.hits[0].frame === cp.parryFrame + 7;
  // AI: only a boss with a counter rolls for it (Math.random pinned low so the roll passes).
  const aiPick = stage => {
    setup(stage, 900, 830); e.f.meter = 0; e.ai.cool = 0; e.ai.mode = 'attack'; Math.random = () => .1;
    BeatEmUp.updateGroupAI(STEP, pEntry); const label = e.ai.tellKind, queued = !!e.ai.counterQueued;
    for (let i = 0; i < 60 && e.ai.tellT > 0; i++) BeatEmUp.updateGroupAI(STEP, pEntry);
    Math.random = prev.random; return { label, queued, armed: !!e.f.bossCounterQueued };
  };
  r.aiKage = aiPick(7); r.aiSniper = aiPick(6);
  r.aiOk = r.aiKage.label === 'COUNTER' && r.aiKage.queued && r.aiKage.armed && r.aiSniper.label !== 'COUNTER' && !r.aiSniper.queued && !r.aiSniper.armed;
  // --- Roadblock: barricade blocks the player's lane for 4 s, then a 400px charge for 20
  const road = (laneMove = 0) => {
    setup(8, 900, 700, 1);
    if (laneMove) player.depth = pEntry.depth = gapD(.5, laneMove);
    start('special');
    const o = { su: e.f.atk.su, hp0: player.hp, hits: [], bar: null, barFrames: 0, minX: 1e9, chargeX0: 0, chargeX1: 0, tip: null };
    let i = 0;
    for (; i < 400; i++) {
      const before = player.hp;
      if (e.f.atk && e.f.atkT + 1 === e.f.atk.su + 20) BeatEmUp.withDepth(e, () => { e.f.atkT++; const hit = e.f.strike(), geo = e.f.weaponGeometry(e.f.combatBones(), true); e.f.atkT--; o.tip = hit && hit.segment ? { match: hit.segment.x2 === geo.tip.x && hit.segment.y2 === geo.tip.y, reach: +Math.abs(geo.tip.x - e.f.combatBones().ra.x).toFixed(3) } : null; });
      const ax = e.f.x; frame(); 
      if (e.f.atk && e.f.atkT === e.f.atk.su + 20) o.chargeX0 = ax; // x before the first charge frame
      if (e.f.atk && e.f.atkT === e.f.atk.su + e.f.atk.ac) o.chargeX1 = e.f.x;
      if (player.hp < before) o.hits.push({ frame: e.f.atkT, dmg: +(before - player.hp).toFixed(6) });
      const bar = BeatEmUp.bossFields.find(z => z.kind === 'barricade');
      if (bar) { if (!o.bar) o.bar = { x: bar.x, depth: bar.depth, side: bar.side, created: e.f.atkT }; o.barFrames++; }
      // after the charge, the player keeps walking back into the barricade's side
      if (!e.f.atk || e.f.atkT > e.f.atk.su + e.f.atk.ac) { player.x -= 6; if (bar) o.minX = Math.min(o.minX, player.x); }
      player.stun = 0;
      if (o.bar && !bar && !e.f.atk) { o.passedAfter = player.x < o.bar.x; if (o.passedAfter) break; }
    }
    o.charge = +Math.abs(o.chargeX1 - o.chargeX0).toFixed(3);
    o.dmg = +(o.hp0 - player.hp).toFixed(6); return o;
  };
  r.roadHit = road(); r.roadOffLane = road(20);
  const rh = r.roadHit, ro = r.roadOffLane, expCharge = +(20 * BH * DIFF).toFixed(6), half = BossSignatures.bossRoadblock.barricadeHalfW + BossSignatures.bossRoadblock.bodyHalf;
  r.roadOk = rh.su === 47 && rh.bar && rh.bar.x === 620 && rh.bar.side === 1 && rh.bar.created === 48 && rh.barFrames === 240
    && rh.hits.length === 1 && rh.hits[0].dmg === expCharge && rh.hits[0].frame >= 56 && rh.hits[0].frame <= 75 && rh.tip && rh.tip.match && rh.tip.reach === 210
    && rh.minX >= 620 + half - 6 - 1e-6 && rh.passedAfter === true
    && ro.hits.length === 0 && ro.charge === 400 && ro.passedAfter === true;
  // --- Draw smoke (no screenshots): each boss in idle/normal/signature, plus every field kind, draws without throwing
  const nop = new Proxy({}, { get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? () => {} : undefined, set: () => true });
  r.drawOk = true;
  try {
    for (const st of [6, 7, 8]) for (const kind of [null, 'punch', 'kick', 'special']) {
      setup(st); if (kind) start(kind); for (let i = 0; i < 40 && (kind ? e.f.atk : i < 2); i++) frame();
      BeatEmUp.drawFighter(nop, e); BossFields.draw(nop);
    }
    BossFields.add({ kind: 'afterimage', owner: e.f, x: 500, depth: .5, face: 1, life: 5, max: 18 }); BossFields.draw(nop);
  } catch (err) { r.drawOk = false; r.drawErr = String(err); }
  // --- Tells
  r.tells = { laser: Moves.bossLaserLock.su, laserP3: r.phase3Su, shadow: Moves.bossShadowStep.su, road: Moves.bossRoadblock.su, aiBossTell: +Math.max(BossHardness.tellMin, .72 / BossHardness.rate).toFixed(4) };
  r.tellOk = r.tells.laser >= 30 && r.tells.shadow >= 30 && r.tells.road >= 30 && r.tells.laserP3 >= 24 && r.tells.aiBossTell >= .5;
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode; Game.phase = prev.phase; BeatEmUp.bossProjectiles = []; BossFields.clear(); BeatEmUp.lockL = prev.lockL; BeatEmUp.lockR = prev.lockR; Math.random = prev.random;
  Game.minX = prev.minX; Game.maxX = prev.maxX; Game.GROUND = prev.ground; pads0(); player.reset(200, 1);
  r.pass = r.profiles.join(' ') === 'crossbow/74/100/1.25/0.92/bossLaserLock/ naginata/76/200/1.28/0.92/bossShadowStep/kage girder/74/210/1.4/0.7/bossRoadblock/'
    && r.normalsPaced && r.normalDmg === '8,10,10,12,18,10' && r.normalsOk && r.laserOk && r.phase3Ok && r.shadowOk && r.counterOk && r.aiOk && r.roadOk && r.tellOk && r.drawOk;
  return r;
}
"""

STAGE1 = r"""
() => {
  // Stage 1 ticket: Brawler + Rusher lineup, configurable spawns (wave -> stage -> built-in), attacker cap 2. Script only.
  const prev = { level: Game.arcadeLevel, mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast, phase: Game.phase, banner: Game.banner, bannerT: Game.bannerT, fighting: Game.fighting, random: Math.random, cameraX: BeatEmUp.cameraX, lockL: BeatEmUp.lockL, lockR: BeatEmUp.lockR, wave: BeatEmUp.wave, queue: BeatEmUp.waveSpawnQueue, timer: BeatEmUp.waveSpawnTimer };
  const r = {};
  Game.mode = 'beatemup'; Game.arcadeLevel = 'normal'; BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0;
  const ch = BeatEmUp.chapters;
  // --- Compositions
  r.stage1 = ch[0].waves.map(w => w.enemyFocus.join(','));
  r.stage1Ok = r.stage1.join(' | ') === 'brawler,brawler | brawler,rusher,brawler | brawler,rusher,brawler,rusher'
    && ch[0].boss.name === 'BLOCK CAPTAIN' && ch[0].boss.profile.signature.key === 'bossBlockParty'
    && !ch[0].waves.some(w => /kunai|thrower|bruiser/i.test(w.title + ' ' + w.storyBeat + ' ' + w.visualCue));
  // --- Stage 1 spawns come from settings, in enemyFocus order
  const S1 = [[[.58, .25], [.78, .75]], [[.3, .3], [.86, .55], [.62, .82]], [[.5, .22], [.86, .5], [.64, .84], [.93, .12]]];
  BeatEmUp.stage = 1;
  r.stage1Defs = [1, 2, 3].map(n => BeatEmUp.waveDefs(n).map(d => d.kind[0] + ':' + d.ox + '/' + d.depth).join(' '));
  r.stage1DefsOk = [1, 2, 3].every(n => { const d = BeatEmUp.waveDefs(n); return d.length === S1[n - 1].length && d.every((x, i) => x.kind === ch[0].waves[n - 1].enemyFocus[i] && x.ox === S1[n - 1][i][0] && x.depth === S1[n - 1][i][1]); });
  // actual spawn x/lane through startWave + updateWaveSpawns (normal difficulty: authored enemies first, then reinforcements)
  const player = BeatEmUp.playerEntry() || { f: fighters[0], depth: .5, role: 'player', kind: 'player', scaleMul: 1 };
  r.stage1Spawned = [];
  let spawnedOk = true;
  for (const n of [1, 2, 3]) {
    BeatEmUp.cast = [player]; BeatEmUp.startWave(n, true, false);
    for (let k = 0; k < 40 && BeatEmUp.waveSpawnQueue.length; k++) BeatEmUp.updateWaveSpawns(10);
    const en = BeatEmUp.cast.filter(e => e.role === 'enemy'), auth = S1[n - 1];
    const floor = n === 2 ? .12 : .42;
    const got = en.slice(0, auth.length).map(e => e.kind[0] + ':' + +((e.f.x - BeatEmUp.lockL) / Game.W).toFixed(4) + '/' + e.depth);
    r.stage1Spawned.push(got.join(' '));
    spawnedOk = spawnedOk && en.length === auth.length * 2 && auth.every((a, i) => en[i].kind === ch[0].waves[n - 1].enemyFocus[i]
      && Math.abs(en[i].f.x - (BeatEmUp.lockL + Game.W * Math.max(floor, a[0]))) < 1e-9 && en[i].depth === a[1]);
  }
  r.stage1SpawnedOk = spawnedOk;
  // --- Stages 2-10: no settings, waveDefs reproduce the old hardcoded layouts exactly
  const OLD2 = [[.16, .18], [.60, .72], [.72, .40], [.28, .54], [.82, .84]], OLD = [[.55, .15], [.62, .55], [.48, .95], [.70, .34], [.40, .76]];
  let fallbackOk = true, checked = 0;
  for (let s = 3; s <= 10; s++) { // Stage 2 sets its own spawns (Stage 2 ticket)
    BeatEmUp.stage = s;
    if (ch[s - 1].spawnLayouts || ch[s - 1].waves.some(w => w.spawns)) fallbackOk = false;
    for (const n of [1, 2, 3]) {
      const L = n === 2 ? OLD2 : OLD, defs = BeatEmUp.waveDefs(n);
      if (defs.length !== ch[s - 1].waves[n - 1].enemyFocus.length) fallbackOk = false;
      defs.forEach((d, i) => { checked++; if (d.kind !== ch[s - 1].waves[n - 1].enemyFocus[i] || d.ox !== L[i % 5][0] || d.depth !== L[i % 5][1] || Object.keys(d).join() !== 'kind,ox,depth') fallbackOk = false; });
    }
  }
  r.fallbackChecked = checked; r.fallbackOk = fallbackOk && checked === 72;
  // --- Fallback chain + clamping (synthetic settings)
  const sf = (c, w, n, i) => { const o = BeatEmUp.spawnFor(c, w, n, i); return o.ox + '/' + o.depth; };
  const cA = { spawnLayouts: { default: [{ ox: .3, depth: .4 }, { depth: .45 }], 1: [{ depth: 1.7 }] } };
  r.chain = [
    sf(cA, { spawns: [{ ox: -.5 }] }, 1, 0),        // wave ox clamped to 0; depth from stage wave-1 layout, clamped to 1
    sf(cA, { spawns: [{ ox: -.5 }] }, 1, 1),        // no wave entry; stage default depth .45, ox built-in .62
    sf(cA, {}, 2, 0),                               // stage default for wave 2
    sf(cA, {}, 3, 2),                               // nothing set: built-in other[2]
    sf({}, { spawns: [{ ox: '0.5', depth: NaN }] }, 2, 1), // non-numbers ignored: built-in wave2[1]
    sf({}, { spawns: [{ ox: 2, depth: -1 }] }, 3, 0),     // clamp both
    sf({}, {}, 2, 6),                               // built-in wraps modulo 5 like before
  ];
  r.chainOk = r.chain.join(' ') === '0/1 0.62/0.45 0.3/0.4 0.48/0.95 0.6/0.72 1/0 0.6/0.72';
  // --- Brawler / Rusher stats unchanged
  const A = EnemyArchetypes;
  r.stats = [A.brawler.health, A.brawler.speed, A.brawler.combo, A.rusher.health, A.rusher.speed, A.rusher.rush].join('/');
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  r.moveHash = hash(JSON.stringify([A.brawler, A.rusher, EnemyCombos.jabCross, EnemyRushes.shoulder]));
  // --- Attacker cap follows difficulty: Easy 2, Normal 3, Hard 4. Four enemies, so the cap is the most that tell.
  BeatEmUp.stage = 1; Game.phase = 'fight'; Game.fighting = 1; Math.random = () => .01;
  const p = fighters[0]; p.reset(600, 1); player.f = p; player.depth = .5; p.hp = 1e4;
  const caps = {};
  for (const level of ['easy', 'normal', 'hard']) {
    Game.arcadeLevel = level;
    BeatEmUp.cast = [player, ...['brawler', 'rusher', 'brawler', 'rusher'].map((k, i) => { const e = BeatEmUp.makeEnemy(k, 600 + (i % 2 ? 1 : -1) * (40 + 4 * i), .5); e.ai.cool = 0; return e; })];
    let maxAct = 0;
    for (let i = 0; i < 300; i++) {
      BeatEmUp.updateGroupAI(Game.STEP, player);
      const act = BeatEmUp.cast.filter(e => e.role === 'enemy' && (e.ai.tellT > 0 || e.f.atk)).length;
      maxAct = Math.max(maxAct, act);
      BeatEmUp.cast.forEach(e => { if (e.role === 'enemy' && e.ai.tellT <= 0) e.ai.cool = 0; });
    }
    caps[level] = maxAct;
  }
  Game.arcadeLevel = 'normal';
  Math.random = prev.random;
  r.attackers = caps;
  r.capOk = caps.easy === 2 && caps.normal === 3 && caps.hard === 4;
  Object.assign(BeatEmUp, { stage: prev.stage, cast: prev.cast, cameraX: prev.cameraX, lockL: prev.lockL, lockR: prev.lockR, wave: prev.wave, waveSpawnQueue: prev.queue, waveSpawnTimer: prev.timer });
  Object.assign(Game, { arcadeLevel: prev.level, mode: prev.mode, phase: prev.phase, banner: prev.banner, bannerT: prev.bannerT, fighting: prev.fighting });
  r.pass = r.stage1Ok && r.stage1DefsOk && r.stage1SpawnedOk && r.fallbackOk && r.chainOk && r.stats === '110/0.95/jabCross/80/1.35/shoulder' && r.moveHash === '29a4f6df' && r.capOk;
  return r;
}
"""

STAGE2 = r"""
() => {
  // Stage 2 ticket: Grappler + Brawler lineup with authored spawns, at most one active Grappler attacker, no grace window. Script only.
  const prev = { level: Game.arcadeLevel, mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast, phase: Game.phase, banner: Game.banner, bannerT: Game.bannerT, fighting: Game.fighting, random: Math.random, cameraX: BeatEmUp.cameraX, lockL: BeatEmUp.lockL, lockR: BeatEmUp.lockR, wave: BeatEmUp.wave, queue: BeatEmUp.waveSpawnQueue, timer: BeatEmUp.waveSpawnTimer };
  const r = {};
  Game.mode = 'beatemup'; Game.arcadeLevel = 'normal'; BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0;
  const ch = BeatEmUp.chapters, c2 = ch[1];
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  // --- Lineup, text, Dockmaster
  r.lineup = c2.waves.map(w => w.enemyFocus.join(','));
  r.lineupOk = r.lineup.join(' | ') === 'grappler,brawler | grappler,brawler,brawler | grappler,grappler,brawler,brawler'
    && c2.boss.name === 'DOCKMASTER' && c2.boss.profile.signature.key === 'bossDockHaulIn' && c2.boss.profile.weapon === 'anchorChain'
    && c2.waves.every(w => /grappler/i.test(w.title + ' ' + w.storyBeat + ' ' + w.visualCue) || /brawler/i.test(w.storyBeat))
    && !c2.waves.some(w => /rusher|heav|bruiser/i.test(w.storyBeat + ' ' + w.visualCue)) && !/rusher|bruiser/i.test(c2.storyIntro);
  // --- Other stages' settings and the Dockmaster, including tightened AI reach
  r.othersHash = hash(JSON.stringify([window.ARCADE_STAGE_SETTINGS.filter((_, i) => i !== 1), c2.boss]));
  // --- Spawns read from settings and actually spawned there
  const S2 = [[[.55, .5], [.92, .15]], [[.6, .5], [.3, .2], [.85, .82]], [[.55, .3], [.88, .8], [.7, .6], [.95, .12]]];
  BeatEmUp.stage = 2;
  r.defs = [1, 2, 3].map(n => BeatEmUp.waveDefs(n).map(d => d.kind[0] + ':' + d.ox + '/' + d.depth).join(' '));
  const player = BeatEmUp.playerEntry() || { f: fighters[0], depth: .5, role: 'player', kind: 'player', scaleMul: 1 };
  let spawnedOk = true; r.spawned = [];
  for (const n of [1, 2, 3]) {
    const d = BeatEmUp.waveDefs(n);
    spawnedOk = spawnedOk && d.length === S2[n - 1].length && d.every((x, i) => x.kind === c2.waves[n - 1].enemyFocus[i] && x.ox === S2[n - 1][i][0] && x.depth === S2[n - 1][i][1]);
    BeatEmUp.cast = [player]; BeatEmUp.startWave(n, true, false);
    for (let k = 0; k < 40 && BeatEmUp.waveSpawnQueue.length; k++) BeatEmUp.updateWaveSpawns(10);
    const en = BeatEmUp.cast.filter(e => e.role === 'enemy'), auth = S2[n - 1], floor = n === 2 ? .12 : .42;
    r.spawned.push(en.slice(0, auth.length).map(e => e.kind[0] + ':' + +((e.f.x - BeatEmUp.lockL) / Game.W).toFixed(4) + '/' + e.depth).join(' '));
    spawnedOk = spawnedOk && en.length === auth.length * 2 && auth.every((a, i) => en[i].kind === c2.waves[n - 1].enemyFocus[i]
      && Math.abs(en[i].f.x - (BeatEmUp.lockL + Game.W * Math.max(floor, a[0]))) < 1e-9 && en[i].depth === a[1]);
  }
  r.spawnOk = spawnedOk && S2.every(w => w.every(([ox], i) => true));
  // --- pickMelee unit cases (fake entries; gameplay fields only)
  const mk = (id, grab, active = false) => ({ id, f: { enemyGrab: grab ? 'clinch' : null, grabVictim: active ? {} : null, atk: null }, ai: { tellT: 0, tellMove: '' } });
  const ids = (list, n = 2) => BeatEmUp.pickMelee(list, n).map(e => e.id).join(',');
  const G1 = mk('G1', 1), G2 = mk('G2', 1), B1 = mk('B1', 0), B2 = mk('B2', 0), G2h = mk('G2h', 1, true);
  const G2t = mk('G2t', 1); G2t.ai.tellT = .3; G2t.ai.tellMove = 'punch';
  const G2w = mk('G2w', 1); G2w.f.atk = { grab: {} };
  r.pick = [ids([G1, G2, B1, B2]), ids([B1, G1, G2, B2]), ids([G1, B1, G2h]), ids([G1, G2t, B1]), ids([G1, B1, B2, G2w]), ids([B1, B2, G1]), ids([G1, B1]), ids([G1, G2])];
  r.pickOk = r.pick.join(' ') === 'G1,B1 B1,G1 G2h,B1 G2t,B1 G2w,B1 B1,B2 G1,B1 G1';
  // with 0-1 Grapplers pickMelee is exactly the old slice
  let sliceSame = true; const pool = [mk('a', 0), mk('b', 0), mk('c', 1), mk('d', 0)];
  for (let k = 0; k < 24; k++) { const l = pool.slice().sort(() => Math.sin(k * 7.3 + l0()) ); function l0() { return 0; } for (const n of [1, 2]) if (ids(l, n) !== l.slice(0, n).map(e => e.id).join(',')) sliceSame = false; pool.push(pool.shift()); }
  r.sliceSame = sliceSame;
  // --- Scripted Wave 3 AI: 2 Grapplers + 2 Brawlers around the player; count telling/attacking each frame
  BeatEmUp.stage = 2; Game.phase = 'fight'; Game.fighting = 1; Math.random = () => .01;
  const p = fighters[0]; p.reset(600, 1); player.f = p; player.depth = .5; p.hp = 1e4;
  const wave3 = () => ['grappler', 'grappler', 'brawler', 'brawler'].map((k, i) => { const e = BeatEmUp.makeEnemy(k, 600 + (i % 2 ? 1 : -1) * (30 + 6 * i), .5); e.f.face = i % 2 ? -1 : 1; e.ai.cool = 0; return e; });
  const run = (frames, hook) => {
    const o = { maxAct: 0, maxGrab: 0, grabTells: {}, brawlerTell: false };
    for (let i = 0; i < frames; i++) {
      if (hook) hook(i);
      BeatEmUp.updateGroupAI(Game.STEP, player);
      const en = BeatEmUp.cast.filter(e => e.role === 'enemy');
      o.maxAct = Math.max(o.maxAct, en.filter(e => e.ai.tellT > 0 || e.f.atk || e.f.grabVictim).length);
      o.maxGrab = Math.max(o.maxGrab, en.filter(e => BeatEmUp.grapplerActive(e)).length);
      en.forEach((e, k) => { if (e.f.enemyGrab && e.ai.tellT > 0) o.grabTells[k] = (o.grabTells[k] || 0) + 1; if (!e.f.enemyGrab && e.ai.tellT > 0) o.brawlerTell = true; if (e.ai.tellT <= 0) e.ai.cool = 0; });
    }
    return o;
  };
  BeatEmUp.cast = [player, ...wave3()];
  r.ai = run(300);
  // one Grappler holding (G index 0): the other Grappler never tells while it holds, Brawlers still attack
  // G1 moved far back so G2 is the nearest enemy: control (G1 idle) -> G2 tells; G1 holding -> G2 never tells, a Brawler takes the slot
  const farG1 = () => { const w = wave3(); w[0].f.x = 820; w[0].f.face = -1; BeatEmUp.cast = [player, ...w]; return w; };
  farG1(); r.aiControl = run(120);
  const w3 = farG1(); w3[0].f.grabVictim = p;
  r.aiHold = run(200);
  w3[0].f.grabVictim = null; Math.random = prev.random;
  r.aiOk = r.ai.maxAct === 3 && r.ai.maxGrab === 1 && r.ai.brawlerTell && r.aiControl.grabTells[1] > 0
    && r.aiHold.maxAct <= 3 && !r.aiHold.grabTells[1] && r.aiHold.brawlerTell;
  // --- No grace window: right after a release (noRegrab running, no heldBy) Brawlers are still eligible and can tell
  const w4 = wave3(); BeatEmUp.cast = [player, ...w4]; p.noRegrabT = 1.5; p.heldBy = null; Math.random = () => .01;
  r.afterRelease = run(60, () => { p.noRegrabT = Math.max(0, p.noRegrabT - Game.STEP); });
  Math.random = prev.random; p.noRegrabT = 0;
  r.noGraceOk = r.afterRelease.brawlerTell;
  // --- No-regrab: a second grab within 1.5 s is refused
  const gp = BeatEmUp.makeEnemy('grappler', 640, .5); BeatEmUp.cast = [player, gp]; gp.f.face = -1;
  p.reset(600, 1); player.depth = .5; p.hp = 1e4; p.stun = 0; p.invincibleT = 0; p.dodgeT = 0;
  BeatEmUp.withDepth(gp, () => gp.f.startAtk('punch'));
  p.noRegrabT = 1.5; const blocked = EnemyGrab.canCatch(gp.f, p); p.noRegrabT = 0; const free = EnemyGrab.canCatch(gp.f, p);
  r.regrab = { blocked, free, window: EnemyGrabs.clinch.noRegrab ?? null };
  r.regrabOk = blocked === 'no-regrab' && free === '';
  // --- Stats unchanged
  const A = EnemyArchetypes;
  r.stats = [A.grappler.health, A.grappler.speed, A.grappler.grab, A.brawler.health, A.brawler.speed, A.brawler.combo].join('/');
  r.moveHash = hash(JSON.stringify([A.grappler, A.brawler, EnemyGrabs.clinch, EnemyCombos.jabCross]));
  Object.assign(BeatEmUp, { stage: prev.stage, cast: prev.cast, cameraX: prev.cameraX, lockL: prev.lockL, lockR: prev.lockR, wave: prev.wave, waveSpawnQueue: prev.queue, waveSpawnTimer: prev.timer });
  Object.assign(Game, { arcadeLevel: prev.level, mode: prev.mode, phase: prev.phase, banner: prev.banner, bannerT: prev.bannerT, fighting: prev.fighting });
  p.reset(200, 1);
  r.pass = r.lineupOk && r.othersHash === '648e1b7d' && r.spawnOk && r.pickOk && r.sliceSame && r.aiOk && r.noGraceOk && r.regrabOk
    && r.stats === '115/0.9/clinch/110/0.95/jabCross' && r.moveHash === '527657bc';
  return r;
}
"""

STAGE1_BG = r"""
async () => {
  // Panorama backdrops (Stage 1 Street Brawl, Stage 2 Dockyard): per-wave anchors, eased glide, unlocked follow, resets,
  // draw window. Script only (no frames rendered). Stage 1 anchors are pinned to their PR #65 values.
  const prev = { W: Game.W, H: Game.H, stage: BeatEmUp.stage, wave: BeatEmUp.wave, mode: Game.mode, phase: Game.phase, banner: Game.banner, fighting: Game.fighting,
    locked: BeatEmUp.locked, showGo: BeatEmUp.showGo, travelT: BeatEmUp.waveTravelT, travelNext: BeatEmUp.waveTravelNext, cam: BeatEmUp.cameraX,
    startX: BeatEmUp.waveTravelStartX, targetX: BeatEmUp.waveTravelTargetX, bg: [BeatEmUp.bgX, BeatEmUp.bgTravelFrom, BeatEmUp.bgTravelTo] };
  const EPS = 1e-9, WS = [640, 960, 1169, 1555];
  const PINNED_S1 = { 640: [0, 723, 1310.7, 2511.7, 859.3], 960: [0, 660.8, 881.1, 2170, 1288.9], 1169: [0, 450.4, 600.5, 2170, 1569.5], 1555: [0, 61.7, 82.3, 2170, 2087.7] };
  const FILES = { 1: 'assets/backgrounds/stage-01-street-brawl.webp', 2: 'assets/backgrounds/stage-02-dockyard.webp' };
  const r = {};
  r.othersSame = BeatEmUp.backgrounds.slice(2).every((b, i) => b === ['stage-03-night-market','stage-04-ironworks','stage-05-undercity','stage-06-rooftop','stage-07-dojo','stage-08-skybridge','stage-09-broadcast-tower','stage-10-coliseum'].map(n => 'assets/backgrounds/' + n + '.webp')[i]);
  r.panoStages = Object.keys(BeatEmUp.PANOS).join();
  r.noPanoElsewhere = [3, 4, 5, 6, 7, 8, 9, 10].every(st => !BeatEmUp.pano(st));
  const stageOk = {};
  const cachedAll = new Map(BeatEmUp.backgroundCache);
  try {
    for (const stage of [1, 2]) {
      const P = BeatEmUp.pano(stage), src = BeatEmUp.backgrounds[stage - 1];
      const out = { src, anchors: {}, glide: {}, draw: {} };
      out.srcOk = src === FILES[stage] && !!P && P.w === 3371 && P.h === 725 && P.seam === 2170 && P.wave2 === 723;
      // the shipped asset actually decodes at the full panorama size
      const img = new Image(); img.src = src;
      try { await img.decode(); out.asset = [img.naturalWidth, img.naturalHeight]; } catch (e) { out.asset = String(e); }
      let anchorsOk = true, glideOk = true, followOk = true, drawOk = true;
      const fake = { complete: true, naturalWidth: P.w, naturalHeight: P.h };
      for (const W of WS) {
        Game.W = W; Game.H = 540; BeatEmUp.stage = stage;
        const viewW = BeatEmUp.bgViewW(), max = P.w - viewW;
        const a = [1, 2, 3, 4].map(n => BeatEmUp.bgAnchor(n));
        out.anchors[W] = a.map(v => +v.toFixed(1)).concat([+viewW.toFixed(1)]);
        const bossLeft = Math.max(P.seam, max);
        anchorsOk = anchorsOk && [a[0], a[1], a[2]].every(v => v >= 0 && v <= max + EPS)
          && a[0] === 0 && a[1] > a[0] && a[2] > a[1] && a[3] > a[2]           // strictly right every step
          && Math.abs(a[3] - bossLeft) < 1e-6                                 // boss starts at the join when the view is wider than the segment
          && a[2] + viewW <= P.seam + 1e-6                                     // wave 3 never shows the Boss segment
          && a[1] <= P.wave2 + EPS
          && out.anchors[W].join() === PINNED_S1[W].join();                    // Stage 1 unchanged; Stage 2 shares its geometry
        // explicit stage argument agrees with the current-stage default
        anchorsOk = anchorsOk && [1, 2, 3, 4].every(n => BeatEmUp.bgAnchor(n, W, 540, stage) === a[n - 1]);
        // glide n -> n+1 through travelToWave + the camera's own smoothstep/duration; unlocked follow first
        Game.mode = 'beatemup'; BeatEmUp.waveTravelT = 0;
        let maxJump = 0; const ends = [];
        for (let n = 1; n <= 3; n++) {
          BeatEmUp.wave = n; BeatEmUp.bgSet(n);
          const start = BeatEmUp.bgX;
          const range = BeatEmUp.bgScrollRange();
          if (start > range.left + 1) {
            BeatEmUp.bgFollow(-50); followOk = followOk && BeatEmUp.bgX < start && BeatEmUp.bgX >= range.left - EPS;
          }
          BeatEmUp.bgX = range.left; BeatEmUp.bgFollow(-50); followOk = followOk && BeatEmUp.bgX === range.left;
          BeatEmUp.bgX = start;
          if (start < range.right - 1) {
            BeatEmUp.bgFollow(W * .1); followOk = followOk && BeatEmUp.bgX > start && BeatEmUp.bgX <= range.right + EPS;
          }
          for (let k = 0; k < 400; k++) BeatEmUp.bgFollow(W * .05);
          followOk = followOk && Math.abs(BeatEmUp.bgX - range.right) < 1e-6;                  // capped at this wave's plate
          BeatEmUp.bgSet(n); BeatEmUp.bgFollow(W * .3);                                         // typical partial walk
          const from = BeatEmUp.bgX;
          BeatEmUp.cameraX = 0; BeatEmUp.worldMax = W * 4.2;
          BeatEmUp.travelToWave(n + 1);
          const D = BeatEmUp.waveTravelDuration, to = BeatEmUp.bgTravelTo;
          glideOk = glideOk && BeatEmUp.bgTravelFrom === from && Math.abs(to - a[n]) < 1e-9;
          let last = from, maxStep = 0, t = BeatEmUp.waveTravelT;
          // exact mirror of the waveTransition step (same progress/easing/duration)
          while (t > 0) {
            const progress = 1 - t / D, eased = progress * progress * (3 - 2 * progress);
            BeatEmUp.bgGlide(eased);
            if (BeatEmUp.bgX < last - EPS) glideOk = false;
            maxStep = Math.max(maxStep, BeatEmUp.bgX - last); last = BeatEmUp.bgX;
            t = Math.max(0, t - Game.STEP);
          }
          // eased step bound: smoothstep slope <= 1.5, so one frame <= 1.5*STEP/D of the distance
          const bound = 1.5 * Game.STEP / D * (to - from) + 1e-6;
          glideOk = glideOk && (to - from) >= 0 && maxStep <= bound;
          maxJump = Math.max(maxJump, maxStep);
          BeatEmUp.waveTravelT = 0;
          const before = BeatEmUp.bgX;
          BeatEmUp.bgSet(n + 1);                                                                 // startWave/startBoss land on the anchor
          const landJump = Math.abs(BeatEmUp.bgX - before);
          glideOk = glideOk && landJump <= bound + 1e-6;
          ends.push(+landJump.toFixed(3));
        }
        out.glide[W] = { maxFrameStep: +maxJump.toFixed(2), landJumps: ends };
        // draw: this stage uses the window
        BeatEmUp.backgroundCache.set(src, fake);
        const calls = [], ctx = { save() {}, restore() {}, drawImage(...args) { calls.push(args.slice(1)); } };
        Game.phase = 'fight'; BeatEmUp.waveTravelNext = 0;
        for (const n of [1, 2, 3, 4]) { BeatEmUp.wave = n; BeatEmUp.bgSet(n); BeatEmUp.stage = stage; BeatEmUp.drawStageBackdrop(ctx); }
        BeatEmUp.wave = 1; BeatEmUp.bgX = -100; BeatEmUp.drawStageBackdrop(ctx); BeatEmUp.bgX = 99999; BeatEmUp.drawStageBackdrop(ctx);
        const streetEnd = Math.max(0, P.seam - viewW);
        const fit = (c, x, w) => c && c.length === 8 && c[1] === 0 && Math.abs(c[0] - x) < 1e-6 && Math.abs(c[2] - w) < 1e-6 && c[3] === P.h && c[4] === 0 && c[5] === 0 && c[6] === W && c[7] === 540;
        const segW = P.w - P.seam;
        const boss = calls[3];
        const bossOk = viewW <= segW + 1e-6
          ? fit(boss, a[3], Math.min(viewW, P.w - a[3]))
          : boss && Math.abs(boss[0] - P.seam) < 1e-4 && Math.abs(boss[2] - segW) < 1e-4 && Math.abs(boss[3] - segW * 540 / W) < 1e-4 && Math.abs(boss[1] - (P.h - boss[3]) / 2) < 1e-4 && boss[6] === W && boss[7] === 540;
        const ok1 = calls.length === 6 && [0, 1, 2].every(i => fit(calls[i], a[i], viewW)) && bossOk && fit(calls[4], 0, viewW) && fit(calls[5], streetEnd, viewW);
        // stages 3-10 keep the stretched draw (checked on stage 3)
        const s3src = BeatEmUp.backgrounds[2];
        BeatEmUp.backgroundCache.set(s3src, { complete: true, naturalWidth: 1983, naturalHeight: 793 });
        const c3 = []; BeatEmUp.stage = 3; BeatEmUp.bgX = 500; BeatEmUp.drawStageBackdrop({ save() {}, restore() {}, drawImage(...args) { c3.push(args.slice(1)); } });
        const ok3 = c3.length === 1 && c3[0].join() === [0, 0, W, 540].join() && BeatEmUp.bgAnchor(4, W, 540, 3) === 0;
        out.draw[W] = ok1 && ok3;
        drawOk = drawOk && ok1 && ok3;
      }
      Object.assign(out, { anchorsOk, glideOk, followOk, drawOk });
      out.pass = out.srcOk && out.asset.join && out.asset.join() === '3371,725' && anchorsOk && glideOk && followOk && drawOk;
      r['stage' + stage] = out;
      stageOk[stage] = out.pass;
    }
    // resets: retry/continue (startCampaignStage) and every wave/boss start land on the anchor; resetStage zeroes
    Game.W = 960; Game.H = 540; BeatEmUp.bgX = 1234; BeatEmUp.resetStage(); r.resetStage = BeatEmUp.bgX;
    BeatEmUp.bgX = 1234; BeatEmUp.stage = 2; BeatEmUp.bgSet(1); r.resetOk = r.resetStage === 0 && BeatEmUp.bgX === 0;
    r.resetOk = r.resetOk && /bgSet\(1\)/.test(BeatEmUp.startCampaignStage.toString()) && /bgSet\(n\)/.test(BeatEmUp.startWave.toString()) && /bgSet\(4\)/.test(BeatEmUp.startBoss.toString());
  } finally {
    BeatEmUp.backgroundCache.clear(); cachedAll.forEach((v, k) => BeatEmUp.backgroundCache.set(k, v));
    Game.W = prev.W; Game.H = prev.H; BeatEmUp.stage = prev.stage; BeatEmUp.wave = prev.wave; Game.mode = prev.mode; Game.phase = prev.phase; Game.banner = prev.banner;
    Game.fighting = prev.fighting; BeatEmUp.locked = prev.locked; BeatEmUp.showGo = prev.showGo; BeatEmUp.waveTravelT = prev.travelT; BeatEmUp.waveTravelNext = prev.travelNext;
    BeatEmUp.cameraX = prev.cam; BeatEmUp.waveTravelStartX = prev.startX; BeatEmUp.waveTravelTargetX = prev.targetX;
    [BeatEmUp.bgX, BeatEmUp.bgTravelFrom, BeatEmUp.bgTravelTo] = prev.bg;
  }
  r.pass = !!(stageOk[1] && stageOk[2] && r.othersSame && r.panoStages === '1,2' && r.noPanoElsewhere && r.resetOk);
  return r;
}
"""

BOSS_B2B = r"""
() => {
  // Boss B2 PR B: stage 9-10 profiles + signatures + boss silhouette cue, scripted frame by frame (no sims).
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast, phase: Game.phase, lockL: BeatEmUp.lockL, lockR: BeatEmUp.lockR, random: Math.random, minX: Game.minX, maxX: Game.maxX, ground: Game.GROUND, bossMaxHp: BeatEmUp.bossMaxHp, cue: BeatEmUp.BOSS_CUE };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0; Game.banner = '';
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0; BeatEmUp.lockL = 0; BeatEmUp.lockR = BeatEmUp.worldMax;
  Game.GROUND = Game.H * .72;
  const STEP = Game.STEP, BH = BossHardness.damage, DIFF = BeatEmUp.difficulty.damage, r = {};
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const gapD = (base, px) => { for (let d = base; d <= 1; d += .0002) if (Math.abs(BeatEmUp.floorDepthPx(d) - BeatEmUp.floorDepthPx(base)) >= px) return d; return 1; };
  const pads0 = () => Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[0][a] = 0; Input.was[1][a] = 0; });
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  let e = null;
  const resetPlayer = (px, pFace = 1) => { player.reset(px, pFace); player.face = pFace; player.depth = .5; pEntry.depth = .5; player.hp = 1000; player.invincibleT = 0; player.dodgeT = 0; player.stun = 0; player.blocking = 0; };
  const setup = (stage, bx = 900, px = 700, pFace = 1, phase = 2) => {
    BeatEmUp.stage = stage; BeatEmUp.bossProjectiles = []; BossFields.clear(); pads0();
    e = BeatEmUp.makeEnemy('boss', bx, .5); e.ai.phase = phase; BossPhases.apply(e.f, phase); e.f.meter = 100; e.f.face = -1;
    resetPlayer(px, pFace);
    BeatEmUp.cast = [pEntry, e]; Game.minX = -1e4; Game.maxX = 1e5;
    BeatEmUp.withDepth(pEntry, () => player.clamp()); BeatEmUp.withDepth(e, () => e.f.clamp());
    return e;
  };
  const tune = () => { if (e.f.atk && e.f.atk !== e._tunedAtk) { e._tunedAtk = e.f.atk; e.f.atk.dmg *= DIFF; e.f.atk.dmg *= BH; } };
  const frame = () => {
    pads0();
    BeatEmUp.withDepth(pEntry, () => player.clamp());
    BeatEmUp.withDepth(e, () => { Game.minX = -1e4; Game.maxX = 1e5; e.f.update(STEP, player, 1); tune(); });
    BeatEmUp.withDepth(pEntry, () => player.clamp());
    BeatEmUp.resolveHits();
    BossFields.update(pEntry);
  };
  const start = kind => BeatEmUp.withDepth(e, () => { e.f.startAtk(kind); tune(); });
  const prof = s => BeatEmUp.chapters[s - 1].boss.profile;
  // --- Profiles
  r.profiles = [9, 10].map(s => { const p = prof(s), b = setup(s, 900, 700, 1, 1); return [p.weapon, p.reach, BossWeapons[p.weapon].reach, b.scaleMul, +b.speedMul.toFixed(3), p.signature.key, b.f.weaponType].join('/'); });
  const base = { bossDirectorJab: [7, 3, 11], bossDirectorSweep: [10, 4, 15], bossChiefSlash: [7, 3, 11], bossChiefCross: [9, 4, 12], bossChiefSmash: [14, 5, 20], bossChiefSweep: [10, 4, 15], bossChiefJab: [6, 3, 10], bossChiefHook: [9, 4, 13] };
  r.normalsPaced = Object.entries(base).every(([k, [su, ac, re]]) => Moves[k].su === Math.round(su * 1.3) && Moves[k].ac === ac && Moves[k].re === Math.round(re * 1.3));
  r.normalDmg = Object.keys(base).map(k => Moves[k].dmg).join(',');
  // --- Normals: key per phase, hitbox ends at the weapon tip, reach = weapon reach
  const normalRun = (stage, kind, phase) => {
    setup(stage, 900, 600, 1, phase); start(kind); const o = { key: Object.keys(Moves).find(k => paceEnemy(Moves[k].su) === e.f.atk.su && paceEnemy(Moves[k].re) === e.f.atk.re && paceEnemy(Moves[k].ac) === e.f.atk.ac && k.startsWith(stage === 9 ? 'bossDirector' : 'bossChief')), weapon: e.f.weaponType };
    for (let i = 0; i < 80 && e.f.atk; i++) {
      frame();
      if (o.tip == null && e.f.atk && e.f.atkT === e.f.atk.su + 1) BeatEmUp.withDepth(e, () => {
        const hit = e.f.strike(), b = e.f.combatBones(), geo = e.f.weaponGeometry(b, true);
        o.tip = !!hit?.segment && near(hit.segment.x2, geo.tip.x) && near(hit.segment.y2, geo.tip.y);
        o.reach = +Math.abs(geo.tip.x - b.ra.x).toFixed(3); o.stun = hit?.stun;
      });
    }
    return o;
  };
  r.normals = {};
  for (const [nm, st, kind, ph] of [['dirJab', 9, 'punch', 1], ['dirSweep', 9, 'kick', 1], ['p1Slash', 10, 'punch', 1], ['p1Cross', 10, 'kick', 1], ['p2Smash', 10, 'punch', 2], ['p2Sweep', 10, 'kick', 2], ['p3Jab', 10, 'punch', 3], ['p3Hook', 10, 'kick', 3]]) r.normals[nm] = normalRun(st, kind, ph);
  const N = r.normals, nOk = (o, key, w, reach) => o.key === key && o.weapon === w && o.tip && o.reach === reach;
  r.normalsOk = nOk(N.dirJab, 'bossDirectorJab', 'shockBaton', 115) && nOk(N.dirSweep, 'bossDirectorSweep', 'shockBaton', 115)
    && nOk(N.p1Slash, 'bossChiefSlash', 'twinBlades', 110) && nOk(N.p1Cross, 'bossChiefCross', 'twinBlades', 110)
    && nOk(N.p2Smash, 'bossChiefSmash', 'sledgehammer', 150) && nOk(N.p2Sweep, 'bossChiefSweep', 'sledgehammer', 150)
    && nOk(N.p3Jab, 'bossChiefJab', 'gauntlets', 90) && nOk(N.p3Hook, 'bossChiefHook', 'gauntlets', 90);
  // --- Director stun: baton hits leave the player in 18 f (0.3 s) of hitstun
  const stunRun = kind => {
    setup(9, 900, 830, 1, 1); start(kind); const o = { dmg: 0, stun: null };
    for (let i = 0; i < 60 && e.f.atk; i++) { const before = player.hp; frame(); if (o.stun == null && player.hp < before) { o.stun = player.stun; o.dmg = +(before - player.hp).toFixed(6); } }
    return o;
  };
  r.stun = { jab: stunRun('punch'), sweep: stunRun('kick') };
  r.stunOk = r.stun.jab.stun === 18 && r.stun.sweep.stun === 18 && near(r.stun.jab.dmg, 8 * BH * DIFF) && near(r.stun.sweep.dmg, 10 * BH * DIFF);
  // --- Live Broadcast: glitch tell 0.5 s, 3 spots marked on active f1, lightning on all 3 exactly 42 f (0.7 s) later, 14 each
  const broadcast = (moveTo = null, laneMove = 0) => {
    setup(9, 900, 700); start('special');
    const o = { su: e.f.atk.su, key: e.f.sigKey, glitchDuringSu: true, glitchAfter: false, spots: null, fired: [], hp0: player.hp, stunAfter: null };
    for (let i = 0; i < 140 && e.f.atk; i++) {
      const before = player.hp; frame();
      const t = e.f.atk ? e.f.atkT : -1, g = BeatEmUp.bossFields.some(z => z.kind === 'glitch');
      if (t > 0 && t <= o.su && !g) o.glitchDuringSu = false;
      if (t > o.su && g) o.glitchAfter = true;
      const spots = BeatEmUp.bossFields.filter(z => z.kind === 'spot');
      if (!o.spots && spots.length) {
        o.spots = spots.map(z => ({ x: z.x, depth: z.depth, markedAt: z.markedAt, fireAt: z.fireAt })); o.markFrame = t; o._z = spots;
        if (moveTo != null) player.x = moveTo;
        if (laneMove) player.depth = pEntry.depth = gapD(.5, laneMove);
      }
      (o._z || []).forEach(z => { if (z.fired && !z._seen) { z._seen = 1; o.fired.push({ frame: z.firedFrame, x: z.x, result: z.result || 'none' }); } });
      if (o.stunAfter == null && player.hp < before) o.stunAfter = player.stun;
      if (player.hp < before) player.stun = 0;
    }
    delete o._z; o.dmg = +(o.hp0 - player.hp).toFixed(6); return o;
  };
  r.bcStay = broadcast(); r.bcGap = broadcast(760); r.bcSide = broadcast(850); r.bcLane = broadcast(null, 15); r.bcEdge = broadcast(null, 13);
  const bs = r.bcStay, expL = 14 * BH * DIFF;
  r.broadcastOk = bs.su === 39 && bs.key === 'bossLiveBroadcast' && bs.glitchDuringSu && !bs.glitchAfter && bs.markFrame === 40 && bs.spots.length === 3
    && bs.spots.map(s => s.x).join(',') === '700,550,850' && bs.spots.every(s => s.depth === .5 && s.fireAt - s.markedAt === 42)
    && bs.fired.length === 3 && bs.fired.every(f => f.frame === 82) && bs.fired.filter(f => f.result === 'hit').length === 1 && near(bs.dmg, expL) && bs.stunAfter === 18
    && r.bcGap.dmg === 0 && r.bcGap.fired.length === 3 && near(r.bcSide.dmg, expL) && r.bcSide.fired.find(f => f.result === 'hit').x === 850
    && r.bcLane.dmg === 0 && near(r.bcEdge.dmg, expL);
  // --- Chief phase loadouts follow the AI phase, never mid-attack
  setup(10, 900, 300, 1, 1); BeatEmUp.bossMaxHp = e.f.hp; const full = e.f.hp; const ws = [e.f.weaponType];
  e.f.hp = full * .5; BeatEmUp.updateGroupAI(STEP, pEntry); ws.push(e.f.weaponType, e.ai.phase);
  e.f.hp = full * .2; start('punch'); BeatEmUp.updateGroupAI(STEP, pEntry); ws.push(e.f.weaponType); e.f.atk = null; e.f.state = 'idle'; BeatEmUp.updateGroupAI(STEP, pEntry); ws.push(e.f.weaponType, e.ai.phase);
  r.phaseWeapons = ws.join('/');
  r.phaseOk = r.phaseWeapons === 'twinBlades/sledgehammer/2/sledgehammer/gauntlets/3';
  // --- Replay: phase 2 picks 3 distinct signatures of bosses 1-9 one at a time, then the Finale; new cycle after
  const pool = BossReplay.pool(9); r.pool = pool.join(',');
  const expectPool = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(s => prof(s).signature.key);
  setup(10, 900, 300, 1, 2); const cycles = [], sets = new Set();
  for (let c = 0; c < 12; c++) { const keys = []; for (let k = 0; k < 4; k++) keys.push(BossReplay.next(e.f)); cycles.push(keys); sets.add(keys.slice(0, 3).join(',')); }
  r.replaySample = cycles.slice(0, 3).map(k => k.join(' '));
  r.replayCycles = cycles.every(k => new Set(k.slice(0, 3)).size === 3 && k.slice(0, 3).every(x => expectPool.includes(x) && x !== 'bossColiseumFinale') && k[3] === 'bossColiseumFinale');
  e.f.bossPhase = 3; const p3 = [BossReplay.next(e.f), BossReplay.next(e.f)]; e.f.bossPhase = 1; const p1 = BossReplay.next(e.f);
  r.replayOk = pool.length === 9 && pool.join(',') === expectPool.join(',') && new Set(expectPool).size === 9 && r.replayCycles && sets.size >= 3
    && p3.every(k => k === 'bossColiseumFinale') && p1 === 'bossColiseumFinale';
  // each replayed signature runs to completion on the Chief and has its effect
  r.replayRuns = {};
  for (const key of expectPool) {
    setup(10, 900, 820, 1, 2); e.f.replayCycle = { picks: [key], idx: 0, n: 0 };
    start('special'); const o = { key: e.f.sigKey, su: e.f.atk?.su, eff: false, done: false };
    for (let i = 0; i < 400; i++) {
      const before = player.hp; frame();
      if (player.hp < before || BeatEmUp.bossProjectiles.length || BeatEmUp.bossFields.length || e.f.sigTeleported) o.eff = true;
      player.stun = 0; player.x = 820; player.vx = 0; if (player.ragdollActive || player.state === 'knockdown') resetPlayer(820);
      if (!e.f.atk) { o.done = e.f.state !== 'special'; break; }
    }
    o.ok = o.key === key && o.su === paceEnemy(key === 'bossLaserLock' ? BossSignatures.bossLaserLock.lockFrames : Moves[key].su) && o.eff && o.done;
    r.replayRuns[key] = o.ok;
  }
  r.replayRunsOk = Object.values(r.replayRuns).length === 9 && Object.values(r.replayRuns).every(Boolean);
  // --- Coliseum Finale: 0.5 s tell, live windows per hit, 10/10/12/14/24 landed in order, last knocks down
  setup(10, 900, 840, 1, 3); start('special');
  const fin = { key: e.f.sigKey, su: e.f.atk.su, ac: e.f.atk.ac, live: [], hits: [] };
  BeatEmUp.withDepth(e, () => { const a = e.f.atk, t0 = e.f.atkT; for (let t = 1; t <= a.ac; t++) { e.f.atkT = a.su + t; e.f.state = 'special'; const h = e.f.strike(); if (h) fin.live.push(t + ':' + h.pulse + (h.knockdown ? 'K' : '')); } e.f.atkT = t0; });
  for (let i = 0; i < 120 && e.f.atk; i++) {
    const before = player.hp; frame();
    if (player.hp < before) fin.hits.push({ t: e.f.atkT - fin.su, dmg: +(before - player.hp).toFixed(6), kd: !!(player.ragdollActive || player.state === 'knockdown') });
    player.stun = 0; player.x = e.f.x + 60; player.vx = 0;
  }
  r.finale = fin;
  const expF = [10, 10, 12, 14, 24];
  r.finaleOk = fin.key === 'bossColiseumFinale' && fin.su === 39 && fin.ac === 46
    && fin.live.join(',') === '1:0,2:0,3:0,8:1,9:1,10:1,15:2,16:2,17:2,22:3,23:3,24:3,29:4K,30:4K,31:4K,32:4K'
    && fin.hits.length === 5 && fin.hits.every((h, i) => Math.abs(h.dmg - expF[i] * BH * DIFF) < 1e-6) && fin.hits.map(h => h.kd).join(',') === 'false,false,false,false,true';
  // --- Tells
  r.tells = { broadcast: Moves.bossLiveBroadcast.su, finale: Moves.bossColiseumFinale.su, tellMin9: prof(9).signature.tellMin, tellMin10: prof(10).signature.tellMin, aiBossTell: +Math.max(BossHardness.tellMin, .72 / BossHardness.rate).toFixed(4) };
  r.tellOk = r.tells.broadcast >= 30 && r.tells.finale >= 30 && r.tells.tellMin9 >= .5 && r.tells.tellMin10 >= .5 && r.tells.aiBossTell >= .5;
  // --- Silhouette cue: draw-only. Recording ctx counts ops; gameplay state is identical with the cue on/off.
  const rec = () => { const c = { n: 0, ellipse: 0 }; return [c, new Proxy({}, { get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { c.n++; if (k === 'ellipse') c.ellipse++; } : undefined, set: () => true })]; };
  const snap = () => JSON.stringify({ x: e.f.x, y: e.f.y, hp: e.f.hp, d: e.depth, hb: e.f.hitbox, st: e.f.state, t: e.f.atkT, px: player.x, php: player.hp, s: BeatEmUp.withDepth(e, () => e.f.strike()) });
  const runCue = (stage, cue) => {
    let rnd = 0; const seed = [.37]; Math.random = () => { rnd++; return seed[0]; };
    BeatEmUp.BOSS_CUE = cue; setup(stage, 900, 840, 1, 1); start('punch'); const [c, ctx] = rec(); const states = [];
    for (let i = 0; i < 40; i++) { frame(); BeatEmUp.drawFighter(ctx, e); states.push(snap()); }
    Math.random = prev.random; return { c, states: states.join('|'), rnd };
  };
  r.cue = {}; let cueOk = true;
  for (let st = 1; st <= 10; st++) {
    const on = runCue(st, true), off = runCue(st, false);
    const ok = on.states === off.states && on.rnd === off.rnd && on.c.ellipse - off.c.ellipse === 3 * 40 && on.c.n > off.c.n;
    r.cue[st] = ok; cueOk = cueOk && ok;
  }
  // regular enemies never draw it
  BeatEmUp.BOSS_CUE = true; const reg = BeatEmUp.makeEnemy('regular', 600, .5); const [c1, x1] = rec(); BeatEmUp.drawFighter(x1, reg); BeatEmUp.BOSS_CUE = false; const [c2, x2] = rec(); BeatEmUp.drawFighter(x2, reg);
  r.cueRegularSame = c1.n === c2.n; BeatEmUp.BOSS_CUE = prev.cue;
  r.cueOk = cueOk && r.cueRegularSame;
  // --- Draw smoke for bosses 9-10 (all Chief phases) and the new field kinds
  const nop = new Proxy({}, { get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? () => {} : undefined, set: () => true });
  r.drawOk = true;
  try {
    for (const [st, ph] of [[9, 1], [9, 3], [10, 1], [10, 2], [10, 3]]) for (const kind of [null, 'punch', 'kick', 'special']) {
      setup(st, 900, 700, 1, ph); if (kind) start(kind); for (let i = 0; i < 80 && (kind ? e.f.atk : i < 2); i++) { frame(); if (i % 10 === 0) { BeatEmUp.drawFighter(nop, e); BossFields.draw(nop); } }
    }
  } catch (err) { r.drawOk = false; r.drawErr = String(err); }
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode; Game.phase = prev.phase; BeatEmUp.bossProjectiles = []; BossFields.clear(); BeatEmUp.lockL = prev.lockL; BeatEmUp.lockR = prev.lockR; Math.random = prev.random;
  Game.minX = prev.minX; Game.maxX = prev.maxX; Game.GROUND = prev.ground; BeatEmUp.bossMaxHp = prev.bossMaxHp; BeatEmUp.BOSS_CUE = prev.cue; pads0(); player.reset(200, 1);
  r.pass = r.profiles.join(' ') === 'shockBaton/74/115/1.3/0.92/bossLiveBroadcast/shockBaton twinBlades/95/110/1.35/0.92/bossColiseumFinale/twinBlades'
    && r.normalsPaced && r.normalDmg === '8,10,9,11,16,12,8,12' && r.normalsOk && r.stunOk && r.broadcastOk && r.phaseOk && r.replayOk && r.replayRunsOk && r.finaleOk && r.tellOk && r.cueOk && r.drawOk;
  return r;
}
"""

GUARD = r"""
() => {
  const prev = { mode: Game.mode, stage: BeatEmUp.stage, cast: BeatEmUp.cast };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0; BeatEmUp.stageOver = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const r = {};
  BeatEmUp.stage = 2;
  const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
  const gd = BeatEmUp.makeEnemy('guard', 400, .5), rk = BeatEmUp.makeEnemy('regular', 400, .5);
  r.stats = { hp: gd.f.hp, expectHp: Math.round(125 * stageHealth), speedMul: gd.speedMul, scaleMul: gd.scaleMul, weapon: gd.f.weaponType,
    dmgMul: gd.f.damageMultiplier, tag: gd.f.tag, guard: gd.f.enemyGuard, bash: gd.f.enemyBash, combo: gd.f.enemyCombo, rush: gd.f.enemyRush, slam: gd.f.enemySlam,
    profile: gd.f.bodyProfile === ArchetypeBodyProfiles.guard };
  let armed = 0; for (let i = 0; i < 60; i++) if (BeatEmUp.makeEnemy('guard', 400, .5).f.weaponType) armed++;
  r.armed = armed; r.toughGone = !('tough' in EnemyArchetypes);
  const count = k => BeatEmUp.chapters.reduce((n, c) => n + c.waves.reduce((m, w) => m + w.enemyFocus.filter(x => x === k).length, 0), 0);
  r.toughSpawns = count('tough'); r.guardSpawns = count('guard');
  const box = e => BeatEmUp.withDepth(e, () => { e.f.clamp(); return { w: e.f.hitbox.w, h: e.f.hitbox.h }; });
  const hb = { guard: box(gd), rookie: box(rk) };
  r.hurtboxSame = hb.guard.w === hb.rookie.w && hb.guard.h === hb.rookie.h;
  const trace = f => { const ops = []; const ctx = new Proxy({}, {
      get: (_, k) => typeof CanvasRenderingContext2D.prototype[k] === 'function' ? (...a) => { ops.push(k + ':' + a.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')); } : undefined,
      set: (_, k, v) => { ops.push(k + '=' + (typeof v === 'number' ? v.toFixed(3) : String(v))); return true; } });
    f.draw(ctx); return ops.join('|'); };
  const plain = new Fighter(400, gd.f.color, -1, ''); plain.reset(400, -1); gd.f.reset(400, -1);
  r.gameplayBonesSame = BeatEmUp.withDepth(gd, () => JSON.stringify(gd.f.combatBones()) === JSON.stringify(plain.combatBones()));
  r.profileDrawn = BeatEmUp.withDepth(gd, () => trace(gd.f) !== trace(plain));
  const player = fighters[0]; player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const G = EnemyGuards.riotShield, sp = EnemyBashes.shield, tl = EnemyBash.timeline(sp);
  const x0 = 900;
  const setup = (px, pdepth = .5) => {
    player.reset(px, px < x0 ? 1 : -1); player.depth = pdepth; pEntry.depth = pdepth; player.hp = 100; player.invincibleT = 0; player.dodgeT = 0; player.grounded = true;
    gd.f.reset(x0, -1); gd.depth = .5; gd.f.face = -1; gd.f.hp = 500; gd.f.guardFace = -1; gd.f.guardTurnT = 0;
    gd.f.guardOpenT = 0; gd.f.guardRecoilT = 0; gd.f.guardChainT = 0; gd.f.guardBlocks = 0;
    BeatEmUp.cast = [pEntry, gd];
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  };
  const step = () => BeatEmUp.withDepth(gd, () => gd.f.update(Game.STEP, player, 1));
  const normal = () => ({ x: 0, y: 0, w: 1, h: 1, dmg: 5, kb: 160, stun: 10, chip: 0, special: false, chain: 0 });
  const hit = (atk = normal()) => { const hp = gd.f.hp, x = gd.f.x; const kind = BeatEmUp.withDepth(gd, () => gd.f.takeHit(atk, player));
    const out = { kind, dmg: +(hp - gd.f.hp).toFixed(6), push: +((gd.f.x - x) * -gd.f.face).toFixed(3) }; gd.f.stun = 0; gd.f.state = 'idle'; gd.f.vx = 0; gd.f.x = x0; return out; };
  // Block rules (front = player at lower x, guard faces -1).
  setup(x0 - 60); r.front = hit();
  r.frontRecoil = gd.f.guardRecoilT > 0 && gd.f.stun === 0;
  setup(x0 + 60); r.back = hit();
  const lanePx = Depth.lanePx(), tol = BeatEmUp.depthHitTolerance(pEntry, gd);
  const depthFor = px => { for (let d = .5; d <= 1; d += .0005) if (Math.abs(BeatEmUp.floorDepthPx(d) - BeatEmUp.floorDepthPx(.5)) >= px) return d; return 1; };
  setup(x0 - 60, depthFor(tol + 2)); r.otherLane = hit();
  setup(x0 - 60, depthFor(tol - 2)); r.sameLaneEdge = hit();
  setup(x0 - 60); r.special = hit({ ...normal(), special: true });
  // End-to-end: a real player punch through resolveHits, front vs back.
  const punch = px => { setup(px); player.face = px < x0 ? 1 : -1; const hp = gd.f.hp; const kinds = [];
    const orig = gd.f.takeHit; gd.f.takeHit = function (a, f) { const k = orig.call(this, a, f); kinds.push(k); return k; };
    BeatEmUp.withDepth(pEntry, () => player.startAtk('punch'));
    for (let i = 0; i < 30 && player.atk; i++) { BeatEmUp.withDepth(pEntry, () => player.update(Game.STEP, gd.f, 0)); player.x = px; gd.f.x = x0; gd.f.face = -1; gd.f.guardFace = -1; BeatEmUp.withDepth(gd, () => gd.f.clamp()); BeatEmUp.resolveHits(); }
    delete gd.f.takeHit;
    return { dmg: +(hp - gd.f.hp).toFixed(6), kinds, pface: player.face, px: player.x }; };
  r.punchFront = punch(x0 - 50); r.punchBack = punch(x0 + 50);
  // Guard break: 3 quick blocks open the shield for exactly openTime; spaced blocks never break it.
  setup(x0 - 60);
  r.breakSeq = [hit().kind, hit().kind, hit().kind];
  r.openT = gd.f.guardOpenT;
  r.duringOpen = hit();
  let openFrames = 0; while (gd.f.guardOpenT > 0 && openFrames < 200) { step(); gd.f.x = x0; openFrames++; }
  r.openFrames = openFrames; r.afterOpen = hit();
  setup(x0 - 60); hit(); hit(); for (let i = 0; i < Math.ceil(G.chainWindow * 60) + 2; i++) { step(); gd.f.x = x0; } const spaced = hit();
  r.spaced = { kind: spaced.kind, open: gd.f.guardOpenT };
  // No false hitbox from the drawn shield: idle / recoil / open frames never produce a strike.
  setup(x0 - 30); let falseHit = false;
  for (let i = 0; i < 40; i++) { if (i === 5) hit(); if (i === 20) gd.f.guardOpenT = .3; step(); gd.f.x = x0; BeatEmUp.withDepth(gd, () => trace(gd.f)); if (BeatEmUp.withDepth(gd, () => gd.f.strike())) falseHit = true; }
  r.noFalseHitbox = !falseHit;
  // Flank window: player jumps behind; facing turns only after turnDelay.
  setup(x0 - 60); step(); player.x = x0 + 80; let flip = 0;
  for (let i = 1; i <= 60; i++) { step(); gd.f.x = x0; if (gd.f.face === 1) { flip = i; break; } }
  r.turnFrames = flip;
  // Bash: timeline, live frames, bounded shove, locked facing, shield up in wind-up, open in recovery.
  const bashRun = (gap, opts = {}) => {
    setup(x0 - gap); gd.f.startAtk('punch');
    const hits = [], live = []; let frames = 0, faces = new Set(), profileFree = true, windBlock = null, recBlock = null, chain = false;
    for (let i = 0; i < 200 && gd.f.atk; i++) {
      player.x = opts.flip && i >= 2 ? x0 + gap : x0 - gap; player.vx = 0; player.stun = 0; player.state = 'idle'; player.invincibleT = 0; BeatEmUp.withDepth(pEntry, () => player.clamp());
      Input.pad[1].left = 1; step(); Input.pad[1].left = 0; frames++;
      if (!gd.f.atk) break;
      faces.add(gd.f.face); if (gd.f.canChainPunch()) chain = true;
      BeatEmUp.withDepth(gd, () => { trace(gd.f); const st = gd.f.strike(); const saved = gd.f.bodyProfile; gd.f.bodyProfile = null; const st0 = gd.f.strike(); gd.f.bodyProfile = saved;
        if (JSON.stringify(st) !== JSON.stringify(st0)) profileFree = false; if (st) live.push(gd.f.atkT); });
      if (opts.probe && gd.f.atkT === 8) { const hp = gd.f.hp; BeatEmUp.withDepth(gd, () => gd.f.takeHit(normal(), player)); windBlock = gd.f.hp === hp; gd.f.guardBlocks = 0; gd.f.guardChainT = 0; gd.f.guardRecoilT = 0; }
      if (opts.probe && gd.f.atkT === tl.su + tl.ac + 10 && gd.f.atk) { const hp = gd.f.hp; BeatEmUp.withDepth(gd, () => gd.f.takeHit(normal(), player)); recBlock = gd.f.hp === hp; break; }
      const before = player.hp; BeatEmUp.resolveHits();
      if (player.hp < before) hits.push({ frame: gd.f.atkT, dmg: +(before - player.hp).toFixed(6) });
    }
    return { frames, travelled: +((x0 - gd.f.x)).toFixed(3), hits, live: live.length ? live[0] + '-' + live[live.length - 1] : '', faces: [...faces], profileFree, windBlock, recBlock, chain };
  };
  r.timeline = tl;
  r.bashWhiff = bashRun(400);
  r.bashFlip = bashRun(400, { flip: true });
  r.bashProbe = bashRun(400, { probe: true });
  r.sweep = []; for (let gap = 30; gap <= 200; gap += 10) { const o = bashRun(gap); r.sweep.push({ gap, n: o.hits.length, frame: o.hits[0]?.frame || 0, dmg: o.hits[0]?.dmg || 0, frames: o.frames, travelled: o.travelled, pf: o.profileFree }); }
  const hitsAll = r.sweep.filter(o => o.n);
  r.hitGaps = hitsAll.length ? hitsAll[0].gap + '-' + hitsAll[hitsAll.length - 1].gap : '';
  const rookiePunch = Atk.of('punch', 0, null, null).dmg * EnemyWeaponProfiles.freehand.damage;
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode;
  const s = r.stats, w = r.bashWhiff;
  r.pass = s.hp === s.expectHp && s.speedMul === .85 && s.scaleMul === 1 && s.weapon === null && r.armed === 0 && s.dmgMul === EnemyWeaponProfiles.freehand.damage
    && s.tag === 'GUARD' && s.guard === 'riotShield' && s.bash === 'shield' && s.combo === null && s.rush === null && s.slam === null && s.profile
    && r.toughGone && r.toughSpawns === 0 && r.guardSpawns === 21 && r.hurtboxSame && r.gameplayBonesSame && r.profileDrawn
    // Front same-lane normal: blocked, 0 damage, small push-back away from the attacker, recoil without stun.
    && r.front.kind === 'block' && r.front.dmg === 0 && r.front.push > 0 && r.front.push <= G.pushMax && r.frontRecoil
    && r.back.kind === 'hit' && r.back.dmg === 5 && r.otherLane.kind === 'hit' && r.sameLaneEdge.kind === 'block' && r.special.kind === 'hit'
    && r.punchFront.kinds.join() === 'block' && r.punchFront.dmg === 0 && r.punchBack.kinds.join() === 'hit' && r.punchBack.dmg > 0
    // Guard break after 3 consecutive blocks: open exactly 1.0 s (60 steps), every hit lands, then the shield is back.
    && r.breakSeq.join() === 'block,block,block' && r.openT === G.openTime && r.duringOpen.kind === 'hit' && r.openFrames === 60 && r.afterOpen.kind === 'block'
    && r.spaced.kind === 'block' && r.spaced.open === 0
    && r.noFalseHitbox && r.turnFrames === Math.round(G.turnDelay * 60)
    // Bash: 14f wind-up, live only on frames 15-19, 28px shove, 48f whiff recovery, locked facing; shield up in wind-up, down in recovery.
    && tl.su === 18 && tl.ac === 7 && tl.re === 62 && tl.total === 87
    && w.hits.length === 0 && w.frames === 87 && w.live === '19-25' && Math.abs(w.travelled - sp.step) < 1e-6 && w.faces.length === 1 && w.profileFree && !w.chain
    && r.bashFlip.hits.length === 0 && r.bashFlip.faces.length === 1 && r.bashProbe.windBlock === true && r.bashProbe.recBlock === false
    && hitsAll.length >= 3 && r.sweep.every(o => o.pf && o.n <= 1 && o.travelled <= sp.step + 1e-6)
    && hitsAll.every(o => o.frame >= tl.su + 1 && o.frame <= tl.su + tl.ac && Math.abs(o.dmg - rookiePunch) < 1e-6 && o.frames === o.frame + Math.max(1, Math.round(sp.hitRecovery * PACE.enemy)));
  return r;
}
"""

CHAIN = r"""
() => {
  const prev = { mode: Game.mode, random: Math.random, phase: Game.phase };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.minX = 0; Game.maxX = 4000;
  Math.random = () => 0.99;
  const f = fighters[0], foe = fighters[1], out = {};
  const inRange = (frames, lo, hi) => frames.length > 0 && frames.every(s => { const n = +s.split(':')[1]; return n >= lo && n <= hi; });
  for (const cls of ['blade', 'freehand', 'staff']) {
    const hits = [];
    const play = (which) => {
      f.setClass(cls); f.reset(300, 1); f.playerControlled = true; f.depth = .5; f.hp = 500; f.attackBoostT = 0; f.chain = 0; f.chainArmed = 0;
      foe.setClass(null); foe.reset(348, -1); foe.playerControlled = false; foe.depth = .5; foe.hp = 500;
      foe.ragdollActive = false; foe.damageBurst = 0; foe.damageBurstT = 0; foe.stun = 0; foe.y = 0; foe.grounded = true;
      if (which === 1) { f.chain = 0; f.chainArmed = 1; }
      f.startAtk(which === 2 ? 'kick' : 'punch');
      const a = f.atk, seen = [];
      for (let i = 0; i < a.su + a.ac + a.re + 2 && f.atk === a; i++) {
        f.update(Game.STEP, foe, 0); f.x = 300;
        if (f.atk === a && f.atkT > 0 && f.atkT <= a.su + a.ac + a.re) seen.push(attackClip(f).clip + ':' + attackClip(f).frame);
        foe.x = 348; foe.stun = 0; foe.invincibleT = 0; foe.vx = 0;
        if (!foe.ragdollActive) { foe.state = 'idle'; foe.y = 0; foe.grounded = true; }
        const before = foe.hp, box = f.atk === a ? f.strike() : null;
        if (box && !f.hitDone) {
          foe.takeHit(box, f);
          if (foe.hp < before) { f.hitDone = 1; hits.push({ base: a.baseDmg, kd: !!foe.ragdollActive, clip: a.clip, frames: seen.slice() }); }
        }
      }
    };
    play(0); play(1); play(2);
    out[cls] = hits;
  }
  const row = (cls, clips) => {
    const h = out[cls];
    return h.length === 3 && h.map(x => x.base).join() === '5,7,9' && h.map(x => x.clip).join() === clips && h[2].kd === true && h[0].kd === false && h[1].kd === false;
  };
  const b = out.blade, s = out.staff, k = out.freehand;
  // Full Karate chain plus a special, in Practice as well as the chain above.
  // Hits 1 and 2 each play punch 0–5, with frame 3 (the extended arm) only while active.
  // A CPU Karate punch with chain 1 stays on punch too. No combo clip is ever drawn.
  const filmHit = (which) => {
    f.setClass('freehand'); f.reset(300, 1); f.playerControlled = true; f.depth = .5; f.hp = 500; f.attackBoostT = 0; f.chain = 0; f.chainArmed = 0; f.meter = 100;
    foe.setClass(null); foe.reset(348, -1); foe.playerControlled = false; foe.depth = .5; foe.hp = 500;
    foe.ragdollActive = false; foe.damageBurst = 0; foe.damageBurstT = 0; foe.stun = 0; foe.y = 0; foe.grounded = true; foe.invincibleT = 0;
    if (which === 1) { f.chain = 0; f.chainArmed = 1; }
    if (which === 'special') f.startAtk('special');
    else f.startAtk(which === 2 ? 'kick' : 'punch');
    const a = f.atk, rows = [], total = a.su + a.ac + a.re;
    for (let i = 0; i < total + 2 && f.atk === a; i++) {
      f.update(Game.STEP, foe, 0); f.x = 300;
      if (f.atk === a && f.atkT > 0 && f.atkT <= total) {
        const shown = attackClip(f);
        const phase = f.atkT <= a.su ? 'su' : f.atkT <= a.su + a.ac ? 'ac' : 're';
        rows.push({ clip: shown.clip, frame: shown.frame, phase });
      }
      foe.x = 348; foe.stun = 0; foe.invincibleT = 0; foe.vx = 0;
      if (!foe.ragdollActive) { foe.state = 'idle'; foe.y = 0; foe.grounded = true; }
    }
    return rows;
  };
  const film = [filmHit(0), filmHit(1), filmHit(2), filmHit('special')];
  const used = (rows) => [...new Set(rows.map(r => r.frame))].sort((x, y) => x - y).join(',');
  const punchSpan = (rows) => rows.length > 0 && rows.every(r => r.clip === 'punch' && r.frame >= 0 && r.frame <= 5);
  const activeIsExtend = (rows) => {
    const active = rows.filter(r => r.phase === 'ac');
    return active.length > 0 && active.every(r => r.clip === 'punch' && r.frame === 3)
      && rows.filter(r => r.phase !== 'ac').every(r => r.frame !== 3);
  };
  const modes = ['beatemup', 'practice'];
  const modeClips = [];
  for (const mode of modes) {
    Game.mode = mode;
    for (const rows of [filmHit(0), filmHit(1), filmHit(2), filmHit('special')]) modeClips.push(...rows.map(r => r.clip));
  }
  Game.mode = 'beatemup';
  f.setClass('freehand'); f.playerControlled = false; f.state = 'punch'; f.atk = { chain: 1, su: 12, ac: 4, re: 19 }; f.atkT = 8; f.hp = 500;
  const cpu = attackClip(f);
  f.playerControlled = true; f.atk = null; f.state = 'idle';
  const noCombo = film.every(rows => rows.every(r => r.clip !== 'combo')) && modeClips.every(c => c !== 'combo') && cpu.clip !== 'combo';
  out.karateFilm = {
    h1: film[0].map(r => r.frame).join(','), h2: film[1].map(r => r.frame).join(','), kick: film[2].map(r => r.frame).join(','),
    special: [...new Set(film[3].map(r => r.clip))].join(','),
    active: film[0].filter(r => r.phase === 'ac').map(r => r.frame).join(',') + '/' + film[1].filter(r => r.phase === 'ac').map(r => r.frame).join(','),
    cpu: cpu.clip + ':' + cpu.frame, modes: modeClips.filter((c, i) => modeClips.indexOf(c) === i).join(','), noCombo,
  };
  const karateClip = punchSpan(film[0]) && punchSpan(film[1]) && used(film[0]) === '0,1,2,3,4,5' && used(film[1]) === '0,1,2,3,4,5'
    && activeIsExtend(film[0]) && activeIsExtend(film[1])
    && film[2].length > 0 && film[2].every(r => r.clip === 'kick')
    && film[3].length > 0 && film[3].every(r => r.clip === 'special')
    && noCombo;
  out.pass = row('blade', 'punch,punch,kick') && row('freehand', 'punch,punch,kick') && row('staff', 'punch,punch,kick')
    && inRange(b[0].frames, 0, 2) && inRange(b[1].frames, 3, 5) && b[2].frames.every(x => x.startsWith('kick:'))
    && inRange(s[0].frames, 0, 2) && inRange(s[1].frames, 3, 5) && s[2].frames.every(x => x.startsWith('kick:'))
    && k[0].frames.every(x => x.startsWith('punch:')) && inRange(k[0].frames, 0, 5) && k[0].frames.includes('punch:3')
    && k[1].frames.every(x => x.startsWith('punch:')) && inRange(k[1].frames, 0, 5) && k[1].frames.includes('punch:3')
    && k[2].frames.every(x => x.startsWith('kick:'))
    && karateClip;
  Game.mode = prev.mode; Game.phase = prev.phase; Math.random = prev.random;
  return out;
}
"""

DODGE = r"""
() => {
  const prev = { mode: Game.mode, phase: Game.phase };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.minX = -1000; Game.maxX = 4000;
  const f = fighters[0], foe = fighters[1];
  f.setClass('freehand'); f.playerControlled = true; foe.playerControlled = false;
  const poke = (special) => {
    const before = f.hp;
    const kind = f.takeHit({ dmg: 4, kb: 0, stun: 0, chip: 0, special: !!special, chain: 0, knockdown: false }, foe);
    const landed = f.hp < before;
    f.hp = before; f.stun = 0; f.vx = 0; f.ragdollActive = false;
    if (f.dodgeT > 0) f.state = 'roll';
    return { kind, landed };
  };
  const rollTo = (steps) => {
    f.reset(300, 1); foe.reset(500, -1); f.hp = 200; f.dodgeT = 0; f.dodgeCooldown = 0; f.invincibleT = 0;
    f.startRoll(0, foe);
    for (let i = 0; i < steps; i++) f.update(Game.STEP, foe, 0);
    return f.dodgeT;
  };
  rollTo(18);
  const at30 = poke(false), at30super = poke(true);
  rollTo(27);
  const at45 = poke(false), at45super = poke(true);
  f.reset(300, 1); foe.reset(500, -1); f.hp = 200; f.dodgeT = 0; f.dodgeCooldown = 0;
  Input.pad[0].roll = 0; Input.was[0].roll = 0; Input.tapped[0].roll = 0;
  f.startRoll(0, foe);
  const cd0 = f.dodgeCooldown;
  let ignored = true;
  for (let i = 0; i < 90; i++) f.update(Game.STEP, foe, 0);
  Input.pad[0].roll = 1; Input.was[0].roll = 0; Input.tapped[0].roll = 0;
  const cdBefore = f.dodgeCooldown;
  f.update(Game.STEP, foe, 0);
  if (f.dodgeCooldown > 1.2) ignored = false;
  Input.pad[0].roll = 0; Input.was[0].roll = 0;
  while (f.dodgeCooldown > 0) f.update(Game.STEP, foe, 0);
  Input.pad[0].roll = 1; Input.was[0].roll = 0; Input.tapped[0].roll = 0;
  f.update(Game.STEP, foe, 0);
  const restarted = f.dodgeT > 0.5 && Math.abs(f.dodgeCooldown - PACE.dodgeCooldown) < 1e-6;
  Game.mode = prev.mode; Game.phase = prev.phase;
  Input.pad[0].roll = 0; Input.was[0].roll = 0;
  const pass = at30.kind === 'evade' && !at30.landed && at30super.kind === 'evade' && !at30super.landed
    && at45.landed && at45super.landed && ignored && restarted && Math.abs(cd0 - 1.6) < 1e-9 && cdBefore > 0;
  return { at30, at30super, at45, at45super, cd0, cdBefore, ignored, restarted, pass };
}
"""

SPECIAL_PACE = r"""
() => {
  const prev = { mode: Game.mode, phase: Game.phase, random: Math.random };
  Math.random = () => 0.99;
  Game.mode = 'practice'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  Game.minX = 0; Game.maxX = Game.W;
  const owner = fighters[0], target = fighters[1], STEP = Game.STEP;
  const pads = () => Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.was[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  const film = (cls) => {
    pads(); BladeSuper.clear();
    owner.setClass(cls); owner.reset(Game.W * .35, 1); owner.playerControlled = true; owner.depth = 0; owner.meter = 100; owner.attackBoostT = 0;
    target.setClass(null); target.reset(Game.W * .35 + 500, -1); target.depth = 0; target.hp = 500;
    owner.startAtk('special');
    const a = owner.atk, used = new Set();
    const total = a.su + a.ac + a.re;
    let clipOk = true;
    for (let i = 0; i < total + 2 && owner.atk === a; i++) {
      owner.update(STEP, target, 0); owner.x = Game.W * .35;
      if (owner.atk === a && owner.atkT > 0) {
        const shown = attackClip(owner);
        if (shown.clip !== 'special') clipOk = false;
        used.add(shown.frame);
      }
    }
    const frames = [...used].sort((x, y) => x - y);
    return { su: a.su, ac: a.ac, re: a.re, total, frames, clipOk };
  };
  const karate = film('freehand');
  const staff = film('staff');
  const blade = film('blade');
  pads();
  owner.setClass('freehand'); owner.reset(300, 1); owner.playerControlled = false; owner.bossProfile = null; owner.meter = 100;
  owner.startAtk('special');
  const cpuBaseSu = Math.round(Math.round(1.25 / STEP) * 1.2);
  const cpu = { su: owner.atk.su, ac: owner.atk.ac, re: owner.atk.re };
  const cpuOk = cpu.su === paceEnemy(cpuBaseSu) && cpu.ac === paceEnemy(18) && cpu.re === paceEnemy(22);
  const scale = n => Math.round(n * PACE.special);
  const fromPace = karate.su === scale(12) && karate.ac === scale(18) && karate.re === scale(22) && PACE.special === 1.35;
  const staffBase = Moves.staffSpecial;
  const delays = staffBase.hitDelays.join(',');
  const durs = staffBase.hitDurations.join(',');
  const covered = staffBase.hitDelays[2] + staffBase.hitDurations[2] <= staffBase.ac;
  const staffTotal = staffBase.su + staffBase.ac + staffBase.re;
  const overlap = (o, t) => {
    t.depth = o.depth; t.y = 0; t.grounded = true; t.stun = 0; t.hp = 500;
    t.ragdollActive = false; t.state = 'idle'; t.invincibleT = 0; t.dodgeT = 0;
    const box = o.strike();
    if (box && box.radial) { t.x = box.centerX; t.clamp(); return; }
    t.x = o.x + 40; t.clamp();
    if (!box) return;
    if (box.segment) {
      const seg = box.segment, x = (seg.x1 + seg.x2) / 2, y = (seg.y1 + seg.y2) / 2;
      t.hitbox = { x: x - 8, y: y - 8, w: 16, h: 16 };
    } else t.hitbox = { x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) };
  };
  const land = (cls) => {
    pads(); BladeSuper.clear(); Game.stop = 0;
    owner.setClass(cls); owner.reset(300, 1); owner.playerControlled = true; owner.depth = 0; owner.meter = 100; owner.attackBoostT = 0;
    target.setClass(null); target.reset(360, -1); target.playerControlled = false; target.depth = 0; target.hp = 500;
    owner.startAtk('special');
    const a = owner.atk, seen = [];
    const total = a.su + a.ac + a.re;
    for (let i = 0; i < total + 2 && owner.atk === a; i++) {
      owner.update(STEP, target, 0);
      if (owner.atk !== a) break;
      owner.x = 300;
      overlap(owner, target);
      Game.stop = 0;
      Game.resolve();
      const slashStop = Game.stop;
      BladeSuper.update(STEP);
      const frames = Math.round((slashStop || Game.stop) * 60 + 1e-6);
      if (frames > 0) seen.push(frames);
    }
    return seen;
  };
  const karateStops = land('freehand');
  const staffStops = land('staff');
  const bladeStops = land('blade');
  const full = (row, n) => row.clipOk && row.frames.join(',') === [...Array(n).keys()].join(',');
  const framesOk = full(karate, 24) && full(staff, 12) && full(blade, 12);
  const hitstopOk = karateStops.includes(6) && karateStops.includes(10)
    && staffStops.includes(6) && staffStops.includes(10)
    && bladeStops.includes(10) && !bladeStops.includes(6);
  const pass = !!(fromPace && karate.total === 70 && karate.su === 16 && karate.ac === 24 && karate.re === 30
    && blade.total === 80 && blade.su === 16 && blade.ac === 32 && blade.re === 32
    && BladeSuper.CHARGE_FRAMES === scale(12) && BladeSuper.STRIKE_FRAMES === 32
    && BladeSuper.RECOVERY_FRAMES === 19 && BladeSuper.SHEATH_FRAMES === 13
    && BladeSuper.END_FRAMES === scale(24) && BladeSuper.SPEED === 670 && BladeSuper.STUN_FRAMES === 210
    && BladeSuper.LAUNCH_FRAME === BladeSuper.FACE_LOCK_FRAME
    && delays === '0,12,24' && durs === '5,5,7' && covered && staffTotal === 57 && staff.total === 114
    && PACE.hitstop.special === 6 && PACE.hitstop.specialLast === 10
    && specialHitStop(0, 4) === 6 / 60 && specialHitStop(3, 4) === 10 / 60
    && specialHitStop(1, 3) === 6 / 60 && specialHitStop(2, 3) === 10 / 60
    && specialHitStop(0, 1) === 10 / 60
    && cpuOk && framesOk && hitstopOk);
  owner.playerControlled = true; owner.bossProfile = null; owner.setClass('freehand'); owner.reset(Game.W * .3, 1);
  target.reset(Game.W * .7, -1); BladeSuper.clear();
  Game.mode = prev.mode; Game.phase = prev.phase; Math.random = prev.random; Game.stop = 0;
  const counts = arr => arr.reduce((m, n) => (m[n] = (m[n] || 0) + 1, m), {});
  return { pass, fromPace, cpu, cpuOk, framesOk, hitstopOk,
    karate: { su: karate.su, ac: karate.ac, re: karate.re, total: karate.total, frames: karate.frames.join(',') },
    staff: { su: staff.su, ac: staff.ac, re: staff.re, total: staff.total, delays, durs, base: staffTotal, frames: staff.frames.join(',') },
    blade: { su: blade.su, ac: blade.ac, re: blade.re, total: blade.total, frames: blade.frames.join(','), launch: BladeSuper.LAUNCH_FRAME, speed: BladeSuper.SPEED },
    stops: { karate: counts(karateStops), staff: counts(staffStops), blade: counts(bladeStops) } };
}
"""

PACECFG = r"""
() => {
  const f = fighters[0];
  f.setClass('blade'); f.playerControlled = true; f.chain = 0; f.chainArmed = 0; f.attackBoostT = 0;
  Math.random = () => 0.99;
  f.startAtk('punch');
  const punch = [f.atk.su, f.atk.ac, f.atk.re, f.atk.chainWindow];
  f.chainArmed = 0; f.startAtk('kick');
  const fin = [f.atk.su, f.atk.ac, f.atk.re, f.atk.knockdown ? 1 : 0];
  const prev = BeatEmUp.stage;
  BeatEmUp.stage = 1; BeatEmUp.baseS = 1.5;
  const enemy = BeatEmUp.makeEnemy('regular', 400, .5);
  enemy.f.startAtk('punch');
  const scaled = enemy.f.atk.su === paceEnemy(Moves.punch.su) && enemy.f.atk.ac === paceEnemy(Moves.punch.ac) && enemy.f.atk.re === paceEnemy(Moves.punch.re);
  const boss = BeatEmUp.makeEnemy('boss', 900, .5);
  boss.f.startAtk('punch');
  const bossScaled = boss.f.atk.su === paceEnemy(Moves[boss.f.bossProfile.normal1.key].su);
  BeatEmUp.stage = prev;
  const fromBlock = punch[0] === PACE.punch.su && punch[1] === PACE.punch.ac && punch[2] === PACE.punch.re && punch[3] === PACE.punch.chainWindow
    && fin[0] === PACE.finisher.su && fin[1] === PACE.finisher.ac && fin[2] === PACE.finisher.re
    && BeatEmUp.PACE === PACE.move && EnemyProjectile.speed === PACE.projectileSpeed;
  const pass = fromBlock && punch.join() === '12,4,19,14' && fin.join() === '19,7,31,1'
    && BeatEmUp.PACE === 0.55 && EnemyProjectile.speed === 250 && PACE.enemy === 1.3 && scaled && bossScaled
    && PACE.hitstop.chain === 4 && PACE.hitstop.finisher === 8
    && PACE.dodgeDuration === 0.6 && PACE.dodgeIFrames === 0.36 && PACE.dodgeCooldown === 1.6 && PACE.getUp === 0.8
    && Fighter.GROUND_ACCEL === 1000 && Fighter.GROUND_BRAKE === 1400;
  return { punch, fin, move: BeatEmUp.PACE, speed: EnemyProjectile.speed, scaled, bossScaled, pass };
}
"""

STAGE_CLEAR_DELAY = '''() => {
  // Boss clear waits STAGE_TRANSITION_DELAY (5s, 300 fixed steps) before the next stage.
  // During the wait the fight step does not run: no spawns, no damage, no timer drain.
  const STEP = Game.STEP, delay = STAGE_TRANSITION_DELAY, frames = Math.round(delay / STEP);
  const r = { delay, frames, step: STEP, elapsed: frames * STEP };
  // One real Game.frame step. Preload the accumulator so the rAF clock cannot skip or double a step.
  Game.last = 0;
  const simStep = () => {
    Game.paused = false;
    Game.acc = Game.STEP;
    const present = Game.present;
    Game.present = () => {};
    window.__gameFrame(Game.last);
    Game.present = present;
  };
  const park = () => {
    Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.matchOver = 0;
    Game.winner = ''; Game.banner = ''; Game.timer = 123.5; Game.stop = 0.05; Game.shake = 0;
    BeatEmUp.stageOver = 0; BeatEmUp.stageTransitionT = 0; BeatEmUp.stageTransitionLeft = 0;
    BeatEmUp.stageTransitionStage = 0; BeatEmUp.stageTransitionSwitched = 0;
    BeatEmUp.waveSpawnQueue = []; BeatEmUp.enemyProjectiles = []; BeatEmUp.bossProjectiles = [];
    BeatEmUp.downPending = 0; BeatEmUp.stageIntroT = 0; ShockZones.clear(); BossFields.clear();
    const player = fighters[0];
    player.reset(240, 1); player.hp = 80; player.chip = 80; player.playerControlled = true;
    BeatEmUp.cast = [{ f: player, depth: 0.55, role: 'player', kind: 'player', scaleMul: 1, speedMul: 1, ai: null }];
    return player;
  };
  // Final stage: victory screen, no delay, stage does not advance.
  park();
  BeatEmUp.stage = BeatEmUp.stageTotal; BeatEmUp.wave = 4;
  BeatEmUp.checkWaveState();
  r.final = { stage: BeatEmUp.stage, over: BeatEmUp.stageOver, left: BeatEmUp.stageTransitionLeft, winner: Game.winner, phase: Game.phase };
  Game.stop = 0;
  for (let i = 0; i < frames; i++) simStep();
  r.finalAfter = { stage: BeatEmUp.stage, left: BeatEmUp.stageTransitionLeft, winner: Game.winner, phase: Game.phase };
  // Game over does not arm the delay. Retry still restarts the same stage at once.
  park();
  BeatEmUp.stage = 4; BeatEmUp.wave = 2;
  BeatEmUp.loseStage();
  r.loss = { over: BeatEmUp.stageOver, left: BeatEmUp.stageTransitionLeft, stage: BeatEmUp.stage, phase: Game.phase };
  BeatEmUp.retryOrTitle(true);
  r.retry = { stage: BeatEmUp.stage, left: BeatEmUp.stageTransitionLeft, over: BeatEmUp.stageOver, phase: Game.phase };
  // Stage 2 boss clear arms exactly one 5.0s wait. Stage 3 begins on the 300th step.
  const player = park();
  BeatEmUp.stage = 2; BeatEmUp.wave = 4;
  const timer0 = Game.timer, hp0 = player.hp;
  BeatEmUp.checkWaveState();
  const leftArmed = BeatEmUp.stageTransitionLeft;
  BeatEmUp.checkWaveState();
  const foe = new Fighter(250, '#ff4455', -1, 'THREAT');
  foe.reset(250, -1); foe.hp = 100; foe.chip = 100;
  BeatEmUp.cast.push({ f: foe, depth: 0.55, role: 'enemy', kind: 'regular', scaleMul: 1, speedMul: 1, ai: { cool: 0, mode: 'circle', tellT: 0, tellMove: '', tellKind: '', phase: 1, phaseCallout: 0, orbit: 0, preferDepth: 0.55 } });
  BeatEmUp.waveSpawnQueue = [{ kind: 'regular', ox: 0.5, depth: 0.5, sentinel: 'stay' }];
  const castN = BeatEmUp.cast.length, queueN = BeatEmUp.waveSpawnQueue.length;
  const beforeMash = BeatEmUp.stageTransitionLeft;
  BeatEmUp.goNextStage(); BeatEmUp.goNextStage();
  r.mash = BeatEmUp.stageTransitionLeft === beforeMash;
  r.armed = { stage: BeatEmUp.stage, over: BeatEmUp.stageOver, left: BeatEmUp.stageTransitionLeft, leftArmed, t: BeatEmUp.stageTransitionT, next: BeatEmUp.stageTransitionStage, phase: Game.phase, stop: Game.stop, duration: BeatEmUp.stageTransitionDuration };
  const texts = [];
  const ctx = Game.ctx, orig = ctx.fillText.bind(ctx);
  ctx.fillText = (text, ...rest) => { texts.push(String(text)); return orig(text, ...rest); };
  Game.draw();
  ctx.fillText = orig;
  r.overlay = texts.filter(text => text === 'STAGE 2 CLEAR' || text === 'NEXT STAGE IN' || text === '5');
  let early = null;
  for (let i = 1; i <= frames - 1; i++) {
    simStep();
    if (BeatEmUp.stage !== 2 || Game.phase !== 'matchEnd' || Game.timer !== timer0 || player.hp !== hp0 || foe.hp !== 100
      || BeatEmUp.cast.length !== castN || BeatEmUp.waveSpawnQueue.length !== queueN || BeatEmUp.waveSpawnQueue[0].sentinel !== 'stay') {
      early = { i, stage: BeatEmUp.stage, phase: Game.phase, timer: Game.timer, hp: player.hp, foe: foe.hp, cast: BeatEmUp.cast.length, queue: BeatEmUp.waveSpawnQueue.length };
      break;
    }
  }
  r.early = early;
  r.beforeLast = { stage: BeatEmUp.stage, left: BeatEmUp.stageTransitionLeft, seconds: BeatEmUp.clearCountdownSeconds(), timer: Game.timer, hp: player.hp };
  BeatEmUp.update(STEP);
  r.updateFrozen = player.hp === hp0 && foe.hp === 100 && Game.timer === timer0 && BeatEmUp.cast.length === castN && BeatEmUp.waveSpawnQueue[0].sentinel === 'stay';
  simStep();
  r.after = { stage: BeatEmUp.stage, left: BeatEmUp.stageTransitionLeft, t: BeatEmUp.stageTransitionT, phase: Game.phase, fighting: Game.fighting, over: BeatEmUp.stageOver,
    living: BeatEmUp.cast.filter(e => e.role === 'enemy' && e.f.hp > 0).length };
  simStep();
  r.once = { stage: BeatEmUp.stage, left: BeatEmUp.stageTransitionLeft };
  r.pass = delay === 5 && frames === 300 && r.elapsed === 5
    && r.final.over === 1 && r.final.left === 0 && r.final.stage === BeatEmUp.stageTotal && r.final.winner === 'Campaign complete' && r.final.phase === 'matchEnd'
    && r.finalAfter.stage === BeatEmUp.stageTotal && r.finalAfter.left === 0 && r.finalAfter.winner === 'Campaign complete' && r.finalAfter.phase === 'matchEnd'
    && r.loss.over === -1 && r.loss.left === 0 && r.loss.stage === 4 && r.loss.phase === 'matchEnd'
    && r.retry.stage === 4 && r.retry.left === 0 && r.retry.over === 0 && r.retry.phase === 'intro'
    && r.armed.stage === 2 && r.armed.over === 1 && r.armed.left === frames && r.armed.leftArmed === frames && r.armed.next === 3
    && r.armed.phase === 'matchEnd' && r.armed.stop === 0 && r.armed.t === 5 && r.armed.duration === delay && r.mash
    && r.overlay.indexOf('STAGE 2 CLEAR') >= 0 && r.overlay.indexOf('NEXT STAGE IN') >= 0 && r.overlay.indexOf('5') >= 0
    && !r.early && r.beforeLast.stage === 2 && r.beforeLast.left === 1 && r.beforeLast.seconds === 1 && r.beforeLast.timer === timer0 && r.beforeLast.hp === hp0
    && r.updateFrozen
    && r.after.stage === 3 && r.after.left === 0 && r.after.t === 0 && r.after.phase === 'intro' && r.after.fighting === 0 && r.after.living === 0 && r.after.over === 0
    && r.once.stage === 3 && r.once.left === 0;
  return r;
}'''
SPECIAL_GAIN = r"""() => {
  // Fixed beat 'em up sequence. "Before" is the award the resolver still computes
  // (dealt dmg*2.5, taken dmg*1.5, special/Wave flat 12, then class meter and archetype
  // specialGain). The meter must land on exactly half of that. Meter is a float: no rounding.
  const prevRandom = Math.random;
  Math.random = () => 0.999; // above every critical chance, so each hit's damage stays fixed
  const prev = {
    mode: Game.mode, phase: Game.phase, fighting: Game.fighting, stage: BeatEmUp.stage,
    cast: BeatEmUp.cast, items: BeatEmUp.items.slice(),
  };
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const legacy = (f, n) => n * (f.classProfile?.meter || 1) * f.meterGainMultiplier;
  const r = { mult: SPECIAL_GAIN_MULT };
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0;
  BeatEmUp.stage = 1; BeatEmUp.stageOver = 0; BeatEmUp.items = []; BeatEmUp.enemyProjectiles = [];
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.GROUND = Game.H * .72;
  const player = fighters[0];
  player.setClass('freehand'); player.playerControlled = true;
  const pEntry = { f: player, depth: .5, role: 'player', kind: 'player', scaleMul: 1, ai: null };
  const PX = 500, EX = 550;
  const foe = BeatEmUp.makeEnemy('regular', EX, .5);
  foe.f.meterGainMultiplier = 1; // authored regular specialGain is 0; this target shows the full formulas
  foe.f.damageMultiplier = 1;
  const settle = f => {
    f.stun = 0; f.vx = 0; f.vy = 0; f.y = 0; f.grounded = true; f.dodgeT = 0; f.invincibleT = 0;
    f.ragdollActive = false; f.ragdollKO = false; f.blocking = 0; f.damageBurst = 0; f.damageBurstT = 0;
    f.hitDone = 0; f.atk = null; f.atkT = 0; f.state = 'idle'; f.dashLeft = 0; f.specialMeterTargets = new Set();
  };
  const place = () => {
    player.reset(PX, 1); player.setClass('freehand'); player.playerControlled = true; player.depth = .5; pEntry.depth = .5;
    player.hp = 400; player.meter = 0; player.meterGainMultiplier = 1;
    foe.f.reset(EX, -1); foe.depth = .5; foe.f.face = -1; foe.f.hp = 500; foe.f.meter = 0;
    foe.f.meterGainMultiplier = 1; foe.f.damageMultiplier = 1;
    settle(player); settle(foe.f);
    BeatEmUp.cast = [pEntry, foe];
    Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[0][a] = 0; Input.was[1][a] = 0; });
  };
  // One pinned attack through BeatEmUp.resolveHits. `deal` / `take` are the pre-multiplier bases.
  const swing = (who, kind, opts = {}) => {
    const attacker = who === 'player' ? pEntry : foe;
    const target = who === 'player' ? foe : pEntry;
    const ax = who === 'player' ? PX : EX, tx = who === 'player' ? EX : PX;
    settle(attacker.f); settle(target.f);
    attacker.f.x = ax; target.f.x = tx;
    attacker.f.face = who === 'player' ? 1 : -1;
    target.f.face = who === 'player' ? -1 : 1;
    if (opts.hp != null) target.f.hp = opts.hp;
    if (kind === 'special') attacker.f.meter = 100;
    const meterBeforeA = attacker.f.meter, meterBeforeT = target.f.meter;
    BeatEmUp.withDepth(attacker, () => attacker.f.startAtk(kind));
    const spent = kind === 'special' ? attacker.f.meter : null;
    const gainBase = kind === 'special' ? 0 : meterBeforeA;
    const base = attacker.f.atk ? attacker.f.atk.dmg : null;
    let hits = 0, deal = 0, take = 0;
    const seen = [];
    for (let i = 0; i < 240 && attacker.f.atk; i++) {
      attacker.f.x = ax; target.f.x = tx;
      target.f.stun = 0; target.f.vx = 0; target.f.vy = 0; target.f.y = 0; target.f.grounded = true; target.f.dodgeT = 0;
      if (opts.hp == null) target.f.hp = Math.max(target.f.hp, 200);
      BeatEmUp.withDepth(attacker, () => { attacker.f.update(Game.STEP, target.f, who === 'player' ? 0 : 1); attacker.f.x = ax; });
      BeatEmUp.withDepth(target, () => target.f.clamp());
      const box = BeatEmUp.withDepth(attacker, () => attacker.f.strike());
      const hp = target.f.hp, mA = attacker.f.meter, mT = target.f.meter;
      const had = attacker.f.specialMeterTargets.has(target);
      BeatEmUp.resolveHits();
      const connected = target.f.hp < hp || attacker.f.meter !== mA || target.f.meter !== mT;
      if (!connected || !box) continue;
      hits++;
      const nDeal = box.special ? 0 : box.dmg * 2.5;
      const nTake = box.special ? (had ? 0 : 12) : box.dmg * 1.5;
      deal += nDeal; take += nTake;
      seen.push({ dmg: box.dmg, special: !!box.special, nDeal, nTake });
    }
    return {
      hits, base, spent, deal, take, seen,
      atkMeter: attacker.f.meter - gainBase, defMeter: target.f.meter - meterBeforeT,
      atkNow: attacker.f.meter, defNow: target.f.meter, targetHp: target.f.hp,
    };
  };

  place();
  const sequence = [];
  let legacyPlayer = 0, legacyEnemy = 0;
  const note = (who, kind, opts) => {
    const s = swing(who, kind, opts);
    sequence.push(s);
    if (who === 'player') { legacyPlayer += legacy(player, s.deal); legacyEnemy += legacy(foe.f, s.take); }
    else { legacyPlayer += legacy(player, s.take); legacyEnemy += legacy(foe.f, s.deal); }
    return s;
  };
  note('player', 'punch');
  note('player', 'punch');
  note('player', 'kick');
  note('enemy', 'punch');
  r.sequence = sequence.map(s => ({ hits: s.hits, base: s.base, deal: s.deal, take: s.take, atkMeter: s.atkMeter, defMeter: s.defMeter }));
  r.playerMeter = player.meter; r.enemyMeter = foe.f.meter;
  r.legacyPlayer = legacyPlayer; r.legacyEnemy = legacyEnemy;
  r.half = r.mult === 0.5 && near(player.meter, legacyPlayer * 0.5) && near(foe.f.meter, legacyEnemy * 0.5)
    && near(player.meter * 2, legacyPlayer) && near(foe.f.meter * 2, legacyEnemy)
    && player.meter > 0 && player.meter < 100 && foe.f.meter > 0 && foe.f.meter < 100
    && sequence[0].hits === 1 && sequence[0].base === 5 && sequence[0].seen[0].dmg === 5
    && sequence[1].hits === 1 && sequence[1].base === 5
    && sequence[2].hits === 1 && near(sequence[2].base, 15 * player.classProfile.kick)
    && sequence[3].hits === 1 && sequence[3].base === 5;

  // Special still spends a full meter. The attacker is awarded 0. The defender is awarded the flat 12 once, then halved.
  place();
  const special = swing('player', 'special');
  r.special = { hits: special.hits, spent: special.spent, atkNow: special.atkNow, defNow: special.defNow, take: special.take };
  r.specialOk = special.spent === 0 && special.hits >= 1 && special.atkNow === 0
    && special.take === 12 && near(special.defNow, legacy(foe.f, 12) * 0.5) && near(special.defNow * 2, 12);

  // Blade Wave awards the same flat 12 through its own gainMeter call, once per target.
  place();
  player.setClass('blade'); player.playerControlled = true; player.depth = .5; player.specialMeterTargets = new Set();
  foe.f.meter = 0; foe.f.hp = 400; foe.f.meterGainMultiplier = 1; foe.f.grounded = true; foe.depth = .5; foe.f.depth = .5;
  const seq = BladeSuper.begin(player);
  BladeSuper.hit(seq, foe, true);
  const waveOnce = foe.f.meter;
  BladeSuper.hit(seq, foe, true);
  r.wave = { once: waveOnce, twice: foe.f.meter };
  r.waveOk = near(waveOnce, 12 * 0.5) && foe.f.meter === waveOnce;
  BladeSuper.clear();

  // Authored brawler specialGain 0.25 still applies, and the result is half of today's award.
  place();
  const br = BeatEmUp.makeEnemy('brawler', 560, .5);
  br.f.reset(560, -1); br.depth = .5; br.f.face = -1; br.f.hp = 400; br.f.meter = 0;
  player.reset(500, 1); player.setClass('freehand'); player.playerControlled = true; player.depth = .5; player.hp = 400; player.meter = 0;
  settle(player); settle(br.f); player.x = 500; br.f.x = 560; player.face = 1; br.f.face = -1;
  BeatEmUp.cast = [pEntry, br];
  BeatEmUp.withDepth(br, () => br.f.startAtk('punch'));
  let bHits = 0, bDeal = 0, bTake = 0;
  for (let i = 0; i < 120 && br.f.atk; i++) {
    br.f.x = 560; player.x = 500; player.stun = 0; player.vx = 0; player.vy = 0; player.y = 0;
    player.grounded = true; player.dodgeT = 0; player.hp = 400;
    BeatEmUp.withDepth(br, () => { br.f.update(Game.STEP, player, 1); br.f.x = 560; });
    BeatEmUp.withDepth(pEntry, () => player.clamp());
    const box = BeatEmUp.withDepth(br, () => br.f.strike());
    const hp = player.hp, mA = br.f.meter, mT = player.meter;
    BeatEmUp.resolveHits();
    if ((player.hp < hp || br.f.meter !== mA || player.meter !== mT) && box && !box.special) {
      bHits++; bDeal += box.dmg * 2.5; bTake += box.dmg * 1.5;
    }
  }
  r.brawler = { hits: bHits, gain: br.f.meterGainMultiplier, atk: br.f.meter, def: player.meter, deal: bDeal, take: bTake };
  r.brawlerOk = bHits === 2 && br.f.meterGainMultiplier === 0.25
    && near(br.f.meter, legacy(br.f, bDeal) * 0.5) && near(player.meter, legacy(player, bTake) * 0.5)
    && near(br.f.meter * 2, legacy(br.f, bDeal));

  // A kill adds score, not meter. The killing punch fills the same amount as the same punch on a healthy target.
  place();
  const alive = swing('player', 'punch');
  place();
  const killing = swing('player', 'punch', { hp: 1 });
  r.kill = { alive: alive.atkMeter, killing: killing.atkMeter, foeHp: killing.targetHp };
  r.killOk = alive.hits === 1 && killing.hits === 1 && near(alive.atkMeter, killing.atkMeter) && killing.targetHp <= 0;

  // Medkit and energy drink do not fill the meter.
  place();
  player.meter = 40; player.hp = 50; player.x = PX; player.depth = .5; pEntry.depth = .5;
  BeatEmUp.items = [{ kind: 'medkit', x: PX, depth: .5, life: 18, bob: 0 }];
  BeatEmUp.updateItems(Game.STEP, pEntry);
  const afterMed = { hp: player.hp, meter: player.meter };
  BeatEmUp.items = [{ kind: 'energyDrink', x: PX, depth: .5, life: 18, bob: 0 }];
  BeatEmUp.updateItems(Game.STEP, pEntry);
  r.pickups = { afterMed, hp: player.hp, meter: player.meter, boost: player.attackBoostT };
  r.pickupOk = afterMed.hp === 75 && afterMed.meter === 40 && player.meter === 40 && player.attackBoostT > 0;

  // A kunai hit is not a meter source.
  place();
  player.meter = 17; player.hp = 400;
  BeatEmUp.withDepth(pEntry, () => player.clamp());
  const hp0 = player.hp;
  BeatEmUp.enemyProjectiles = [{
    x: player.x, y: player.hitbox.y + player.hitbox.h / 2, depth: player.depth, face: 1,
    speed: 0, range: 9999, distance: 0, life: 5, damage: 5, width: 80, height: 80, owner: foe.f,
  }];
  EnemyProjectile.update(Game.STEP, pEntry);
  r.projectile = { hp: player.hp, meter: player.meter, left: BeatEmUp.enemyProjectiles.length };
  r.projectileOk = player.hp < hp0 && player.meter === 17 && BeatEmUp.enemyProjectiles.length === 0;

  // Cap stays 100. Spending a full meter still clears it.
  place();
  player.meter = 0; player.gainMeter(1000);
  const capped = player.meter;
  player.meter = 100;
  BeatEmUp.withDepth(pEntry, () => player.startAtk('special'));
  r.cap = capped; r.cost = player.meter;
  r.capOk = capped === 100 && player.meter === 0;

  // Practice keeps the full award. This cut is beat 'em up only.
  Game.mode = 'practice';
  player.meter = 0; player.meterGainMultiplier = 1;
  player.gainMeter(5 * 2.5);
  r.practice = player.meter;
  r.practiceOk = near(player.meter, legacy(player, 5 * 2.5));

  r.ratesOk = FighterClasses.freehand.meter === 1.75 && FighterClasses.staff.meter === 1 && FighterClasses.blade.meter === 1.35
    && EnemyArchetypes.regular.specialGain === 0 && EnemyArchetypes.brawler.specialGain === 0.25
    && EnemyArchetypes.rusher.specialGain === 0.25 && EnemyArchetypes.guard.specialGain === 0.25
    && EnemyArchetypes.heavy.specialGain === 0.45 && EnemyArchetypes.boss.specialGain === 1
    && EnemyArchetypes.ranged.specialGain === 0 && EnemyArchetypes.grappler.specialGain === 0
    && EnemyArchetypes.disruptor.specialGain === 0
    && Moves.special.dmg === 22 && Moves.special.chip === 6 && Moves.special.kb === 390 && Moves.special.stun === 22
    && BladeSuper.WAVE_DAMAGE === 74;

  r.pass = !!(r.half && r.specialOk && r.waveOk && r.brawlerOk && r.killOk && r.pickupOk && r.projectileOk && r.capOk && r.practiceOk && r.ratesOk);
  Math.random = prevRandom;
  Game.mode = prev.mode; Game.phase = prev.phase; Game.fighting = prev.fighting;
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = prev.cast; BeatEmUp.items = prev.items;
  BeatEmUp.enemyProjectiles = []; BladeSuper.clear();
  player.setClass('freehand'); player.reset(Game.W * .3, 1); player.meter = 0;
  return r;
}"""

TITLE_UI = r'''() => {
  const problems = [];
  const overlaps = (a, b) => a && b && a.w > 0 && b.w > 0 && a.h > 0 && b.h > 0
    && a.x < b.x + b.w - 0.6 && a.x + a.w > b.x + 0.6
    && a.y < b.y + b.h - 0.6 && a.y + a.h > b.y + 0.6;
  const cssOf = (r) => {
    const sc = Game.scale || 1;
    return { x: r.x * sc, y: r.y * sc, w: r.w * sc, h: r.h * sc };
  };
  const onScreen = (r, name) => {
    const sl = Game.safeL || 0, st = Game.safeTop || 0, sr = Game.safeR || 0, sb = Game.safeB || 0;
    if (r.x < sl - 0.6 || r.y < st - 0.6 || r.x + r.w > innerWidth - sr + 0.6 || r.y + r.h > innerHeight - sb + 0.6)
      problems.push(name + ' offscreen');
  };
  const checkSet = (name, entries) => {
    entries.forEach((e) => onScreen(e.r, name + ':' + e.name));
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (overlaps(entries[i].r, entries[j].r)) problems.push(name + ' ' + entries[i].name + ' overlaps ' + entries[j].name);
      }
    }
  };
  const tap = (r) => {
    const c = cssOf(r);
    Game.titlePointer({ clientX: c.x + c.w / 2, clientY: c.y + c.h / 2 });
  };
  const out = { pass: true, viewport: [innerWidth, innerHeight], problems: problems };
  const drawn = [];
  const texts = [];
  const origDraw = CanvasRenderingContext2D.prototype.drawImage;
  const origText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.drawImage = function(img) {
    drawn.push(img);
    return origDraw.apply(this, arguments);
  };
  CanvasRenderingContext2D.prototype.fillText = function(text) {
    texts.push(String(text));
    return origText.apply(this, arguments);
  };
  try {
    if (!Game.paintPhaser) { problems.push('paint missing'); return out; }
    Game.fit();
    Game.goTitle();
    Game.selectMode('beatemup');
    Game.selectArcadeLevel('normal');
    Game.selectClass('freehand');
    const layout = Game.titleLayout();
    const titleEntries = [
      { name: 'hero', r: cssOf(layout.hero) },
      { name: 'logo', r: cssOf(layout.logo) },
    ];
    layout.classes.forEach((c, i) => titleEntries.push({ name: 'card' + i, r: cssOf(c) }));
    layout.levels.forEach((c, i) => titleEntries.push({ name: 'seg' + i, r: cssOf(c) }));
    titleEntries.push({ name: 'practice', r: cssOf(layout.practice) });
    titleEntries.push({ name: 'start', r: cssOf(layout.start) });
    titleEntries.push({ name: 'gear', r: cssOf(layout.gear) });
    const startShadow = cssOf(layout.start);
    startShadow.h += (layout.start.shadow || 0) * (Game.scale || 1);
    onScreen(startShadow, 'title:start-shadow');
    checkSet('title', titleEntries);
    layout.classes.forEach((c) => {
      const sprite = cssOf(c.sprite);
      const name = cssOf(c.nameBox);
      if (!c.sprite || !c.nameBox) { problems.push('card parts ' + c.id); return; }
      if (overlaps(sprite, name)) problems.push('label overlaps ' + c.id);
      const clearance = name.y - (sprite.y + sprite.h);
      if (clearance < 3.9) problems.push('label clearance ' + c.id + ' ' + clearance.toFixed(2));
    });
    const cardsBottom = Math.max.apply(null, layout.classes.map((c) => { const r = cssOf(c); return r.y + r.h; }));
    const diff = cssOf(layout.labels.difficulty);
    const segTop = cssOf(layout.segment).y;
    if (diff.h < 10 || cssOf(layout.labels.fighter).h < 10) problems.push('section label short');
    if (diff.y - cardsBottom < 11.5) problems.push('difficulty above ' + (diff.y - cardsBottom).toFixed(1));
    if (segTop - (diff.y + diff.h) < 5.5) problems.push('difficulty below ' + (segTop - diff.y - diff.h).toFixed(1));
    const taps = []
      .concat(layout.classes, layout.levels, [layout.practice, layout.start, layout.gear]);
    taps.forEach((r, i) => { if (cssOf(r).h < 43.5) problems.push('title tap ' + i + ' short ' + cssOf(r).h.toFixed(1)); });
    const heroH = cssOf(layout.hero).h;
    if (heroH < innerHeight * 0.72 - 1) problems.push('hero height ' + heroH.toFixed(1));
    const scene = Game.phaserScene;
    for (const card of Game.titleLayout().classes) {
      tap(card);
      if (Game.selectedClass !== card.id || fighters[0].classId !== card.id) problems.push('class tap ' + card.id);
      fighters[0].animT = 0.25;
      fighters[0].state = 'idle';
      drawn.length = 0;
      texts.length = 0;
      Game.paintPhaser();
      const folder = card.id === 'staff' ? 'staff' : card.id === 'blade' ? 'blade' : 'karate';
      const frame = Math.floor(fighters[0].animT * PACE.spriteFps) % 6;
      const src = scene.textures.get(folder + '-idle-' + frame).getSourceImage();
      const special = 'SPECIAL · ' + FighterClasses[card.id].super;
      const brawler = scene.children.list.some(o => o.visible && o.texture && String(o.texture.key).indexOf('brawler-idle-') === 0);
      if (drawn.filter(img => img === src).length < 2) problems.push('hero sprite ' + folder);
      if (texts.indexOf(special) < 0) problems.push('special ' + special);
      const heroCss = cssOf(Game.titleLayout().hero);
      if (heroCss.h < innerHeight * 0.72 - 1) problems.push('hero ' + card.id + ' ' + heroCss.h.toFixed(1));
      if (brawler) problems.push('brawler still drawn');
      const cardSrc = scene.textures.get(folder + '-idle-' + frame).getSourceImage();
      if (drawn.filter(img => img === cardSrc).length < 1) problems.push('card sprite ' + folder);
    }
    const hard = Game.titleLayout().levels.find(l => l.id === 'hard');
    tap(hard);
    if (Game.arcadeLevel !== 'hard') problems.push('difficulty tap ' + Game.arcadeLevel);
    Game.tryTitleKey('ArrowLeft');
    if (Game.arcadeLevel !== 'normal') problems.push('key left ' + Game.arcadeLevel);
    Game.tryTitleKey('ArrowUp');
    Game.tryTitleKey('Tab');
    if (Game.mode !== 'practice') problems.push('tab mode ' + Game.mode);
    const before = Game.selectedClass;
    Game.tryTitleKey('ArrowRight');
    if (Game.selectedClass === before) problems.push('practice keys did not change class');
    Game.tryTitleKey('Tab');
    if (Game.mode !== 'beatemup') problems.push('tab back ' + Game.mode);
    let fs = 0;
    const root = document.documentElement;
    const prevFs = root.requestFullscreen;
    root.requestFullscreen = () => { fs++; return Promise.resolve(); };
    tap(Game.titleLayout().gear);
    root.requestFullscreen = prevFs;
    if (!fs) problems.push('gear did not toggle fullscreen');
    tap(Game.titleLayout().practice);
    if (Game.mode !== 'practice' || Game.phase !== 'intro') problems.push('practice start ' + Game.mode + '/' + Game.phase);
    Game.goTitle();
    Game.selectMode('practice');
    tap(Game.titleLayout().start);
    if (Game.mode !== 'beatemup' || Game.phase === 'title') problems.push('start ' + Game.mode + '/' + Game.phase);
    Game.goTitle();

    const overlay = (name, layout, buttons) => {
      if (!layout) { problems.push(name + ' missing'); return; }
      if (layout.sheet) onScreen(cssOf(layout.sheet), name + ':sheet');
      const entries = [];
      const add = (label, r) => { if (!r) return; entries.push({ name: label, r: cssOf(r) }); };
      add('title', layout.title);
      add('sub', layout.sub);
      add('sub2', layout.sub2);
      add('number', layout.number);
      (layout.stats || []).forEach((s, i) => add('stat' + i, s));
      buttons.forEach((key) => add(key, layout[key]));
      checkSet(name, entries);
      buttons.forEach((key) => {
        const r = layout[key];
        if (!r) { problems.push(name + ' missing ' + key); return; }
        const h = cssOf(r).h;
        if (h < 47.5) problems.push(name + ' ' + key + ' short ' + h.toFixed(1));
        if (r.shadow) {
          const face = cssOf(r);
          face.h += r.shadow * (Game.scale || 1);
          onScreen(face, name + ':' + key + '-shadow');
        }
      });
    };
    Game.mode = 'beatemup';
    Game.phase = 'fight';
    Game.paused = false;
    BeatEmUp.stage = 1;
    BeatEmUp.wave = 2;
    BeatEmUp.stageOver = 0;
    BeatEmUp.stageTransitionLeft = 0;
    const burger = document.getElementById('main-menu-button');
    const burgerDead = (where) => {
      Game.syncControls();
      const cs = getComputedStyle(burger);
      const hit = document.elementFromPoint(39, 39);
      if (cs.display !== 'none' || cs.pointerEvents !== 'none' || hit === burger || (burger && burger.contains(hit))) problems.push(where + ' hamburger shown');
      burger.click();
      if (Game.actionMenuOpen) problems.push(where + ' hamburger opened');
    };
    Game.syncControls();
    const openCs = getComputedStyle(burger);
    const openHit = document.elementFromPoint(39, 39);
    if (openCs.display === 'none' || openCs.pointerEvents === 'none' || (openHit !== burger && !(burger && burger.contains(openHit)))) problems.push('fight hamburger hidden');
    burger.click();
    if (!Game.actionMenuOpen) problems.push('fight hamburger dead');
    Game.closeActionMenu();
    Game.paused = true;
    const pause = Game.pauseLayout();
    overlay('pause', pause, ['resume', 'fullscreen', 'menu']);
    if (!pause || pause.sub.text !== 'STAGE 1 · WAVE 2' || pause.resume.text !== '▶ RESUME') problems.push('pause copy');
    burgerDead('pause');
    Game.paused = false;
    BeatEmUp.stageOver = 1;
    BeatEmUp.stage = 2;
    BeatEmUp.stageTransitionLeft = 300;
    BeatEmUp.stageTransitionT = 5;
    const count = Game.countdownLayout();
    overlay('countdown', count, []);
    if (!count || count.title.text !== 'STAGE 2 CLEAR' || count.sub.text !== 'NEXT STAGE IN' || count.number.text !== '5') problems.push('countdown copy');
    burgerDead('countdown');
    BeatEmUp.stageTransitionLeft = 0;
    BeatEmUp.stage = 1;
    BeatEmUp.score = 1200;
    BeatEmUp.bestScore = 3400;
    Game.timer = 95;
    BeatEmUp.lives = 2;
    const cleared = Game.resultsLayout();
    overlay('cleared', cleared, ['home', 'primary']);
    if (!cleared || cleared.primary.text !== 'NEXT STAGE ▶' || cleared.sub.text.indexOf('DEFEATED · ') !== 0 || !cleared.sub2 || cleared.sub2.text.indexOf('NEXT · ') !== 0) problems.push('cleared copy');
    if (cleared && (cleared.stats[0].value !== '1200' || cleared.stats[2].value !== BeatEmUp.formatTime(95) || cleared.stats[3].value !== '2')) problems.push('cleared stats');
    if (cleared && cleared.home.text !== '⌂ MENU') problems.push('cleared home ' + (cleared && cleared.home.text));
    burgerDead('cleared');
    BeatEmUp.stageOver = -1;
    const failed = Game.resultsLayout();
    overlay('failed', failed, ['home', 'primary']);
    if (!failed || failed.title.text !== 'STAGE 1 FAILED' || failed.primary.text !== '↻ RETRY STAGE') problems.push('failed copy');
    if (failed && (failed.sub.text !== 'Regroup and retry Backstreet Awakening.' || (failed.sub.lines || []).length !== 1)) problems.push('failed flavor ' + (failed && failed.sub.text));
    if (failed && failed.home.text !== '⌂ MENU') problems.push('failed home ' + (failed && failed.home.text));
    burgerDead('failed');
    Game.paused = false;
    BeatEmUp.stageOver = 0;
    BeatEmUp.stageTransitionLeft = 0;
    Game.goTitle();
    Game.selectClass('freehand');
    Game.selectArcadeLevel('normal');
    Game.selectMode('beatemup');
  } catch (err) {
    problems.push(String(err && err.stack || err));
  } finally {
    CanvasRenderingContext2D.prototype.drawImage = origDraw;
    CanvasRenderingContext2D.prototype.fillText = origText;
    try { localStorage.setItem('stickman-beatemup-class', 'freehand'); } catch (e) {}
    try { localStorage.setItem('stickman-beatemup-level', 'normal'); } catch (e) {}
  }
  out.pass = problems.length === 0;
  return out;
}
'''

BODY_SCALE = r'''() => {
  const BODY = 188;
  const classes = [['freehand', 'karate'], ['staff', 'staff'], ['blade', 'blade']];
  const depths = [0.2, 0.85];
  const out = { pass: true, rows: [], practice: [] };
  const screenOf = () => (Game.scale || 1) * (Game.fitDpr || 1);
  const enemyScale = (depth) => (96 * (BeatEmUp.baseS || 1) * BeatEmUp.depthToScale(depth)) / BODY * screenOf();
  const snap = (f) => ({
    x: f.x, depth: f.depth, hp: f.hp, meter: f.meter,
    hx: f.hitbox.x, hy: f.hitbox.y, hw: f.hitbox.w, hh: f.hitbox.h,
  });
  const same = (a, b) => a.x === b.x && a.depth === b.depth && a.hp === b.hp && a.meter === b.meter
    && a.hx === b.hx && a.hy === b.hy && a.hw === b.hw && a.hh === b.hh;
  const visible = () => Game.phaserScene.children.list.filter(o => o.visible && o.type === 'Image' && o.texture);
  try {
    if (!Game.paintPhaser || !Game.phaserScene) { out.pass = false; out.error = 'paint missing'; return out; }
    Game.frame = function(){};
    Game.fit();
    Game.selectClass('freehand');
    BeatEmUp.begin();
    Game.frame = function(){};
    const player = BeatEmUp.playerEntry();
    const brawler = BeatEmUp.makeEnemy('brawler', player.f.x + 180, 0.55);
    brawler.scaleMul = 1;
    BeatEmUp.cast = [player, brawler];
    BeatEmUp.boss = null;
    BeatEmUp.cameraX = 0;
    BeatEmUp.waveSpawnQueue = [];
    BeatEmUp.eventT = 0;
    BeatEmUp.showGo = 0;
    Game.banner = '';
    Game.phase = 'fight';
    Game.fighting = 1;
    for (const pair of classes) {
      const id = pair[0], folder = pair[1];
      Game.selectClass(id);
      player.f.setClass(id);
      for (const depth of depths) {
        player.depth = depth; player.f.depth = depth; player.scaleMul = 1;
        brawler.depth = depth; brawler.f.depth = depth; brawler.scaleMul = 1;
        player.f.state = 'idle'; brawler.f.state = 'idle';
        player.f.atk = null; brawler.f.atk = null;
        player.f.animT = 0; brawler.f.animT = 0;
        player.f.hp = 100; player.f.y = 0; player.f.ragdollActive = false;
        const before = snap(player.f);
        const beforeEnemy = snap(brawler.f);
        Game.paintPhaser();
        const images = visible();
        const left = images.find(o => String(o.texture.key).indexOf(folder + '-idle-') === 0);
        const right = images.find(o => String(o.texture.key).indexOf('brawler-idle-') === 0);
        const playerH = left ? left.getBounds().height : 0;
        const enemyH = right ? right.getBounds().height : 0;
        const ratio = enemyH ? playerH / enemyH : 0;
        const expected = enemyScale(depth);
        const scaleOk = !!(left && right
          && Math.abs(Math.abs(left.scaleY) - expected) < 1e-3
          && Math.abs(Math.abs(right.scaleY) - expected) < 1e-3);
        const heightOk = !!(left && right && Math.abs(ratio - 1) <= 0.02);
        const gameplayOk = same(before, snap(player.f)) && same(beforeEnemy, snap(brawler.f));
        const row = {
          id, depth, playerH: +playerH.toFixed(2), enemyH: +enemyH.toFixed(2), ratio: +ratio.toFixed(4),
          playerScale: left ? +Math.abs(left.scaleY).toFixed(5) : 0,
          enemyScale: right ? +Math.abs(right.scaleY).toFixed(5) : 0,
          expected: +expected.toFixed(5),
          scaleOk, heightOk, gameplayOk,
          left: left && left.texture.key, right: right && right.texture.key,
        };
        out.rows.push(row);
        if (!scaleOk || !heightOk || !gameplayOk) out.pass = false;
      }
    }
    Game.mode = 'practice';
    Game.startPractice();
    Game.frame = function(){};
    Game.phase = 'fight';
    for (const pair of classes) {
      const id = pair[0], folder = pair[1];
      Game.selectClass(id);
      const f = fighters[0];
      f.state = 'idle'; f.atk = null; f.animT = 0; f.hp = 100; f.ragdollActive = false;
      Game.paintPhaser();
      const img = visible().find(o => String(o.texture.key).indexOf(folder + '-idle-') === 0);
      const expected = (96 * f.drawS()) / BODY * screenOf();
      const scale = img ? Math.abs(img.scaleY) : 0;
      const ok = !!(img && Math.abs(scale - expected) < 1e-3);
      out.practice.push({ id, scale: +scale.toFixed(5), expected: +expected.toFixed(5), drawS: +f.drawS().toFixed(4), ok });
      if (!ok) out.pass = false;
    }
  } catch (err) {
    out.pass = false; out.error = String(err && err.stack || err);
  }
  return out;
}'''

HEAVY_SPRITES = r'''() => {
  // Draw-only. Heavy must paint heavy-* frames (never the vector plate) and the slam
  // index must follow clips.json timing, spread across the attack's existing phases.
  const out = { pass: true, problems: [] };
  const fail = (msg) => { out.pass = false; out.problems.push(msg); };
  const visible = () => Game.phaserScene.children.list.filter(o => o.visible && o.type === 'Image' && o.texture);
  const keyOf = (prefix) => {
    const img = visible().find(o => String(o.texture.key).indexOf(prefix) === 0);
    return img ? String(img.texture.key) : '';
  };
  const holdCounts = (phaseLen, holds) => {
    const art = holds.reduce((sum, n) => sum + n, 0) || 1;
    const len = Math.max(1, phaseLen | 0);
    const counts = holds.map((hold) => Math.floor(hold * len / art));
    let extra = len - counts.reduce((sum, n) => sum + n, 0);
    const order = holds.map((hold, i) => ({ i, rem: (hold * len) % art }));
    order.sort((a, b) => b.rem - a.rem || a.i - b.i);
    for (let k = 0; k < extra && k < order.length; k++) counts[order[k].i]++;
    return counts;
  };
  const expand = (counts, first) => {
    const frames = [];
    counts.forEach((n, i) => { for (let k = 0; k < n; k++) frames.push(first + i); });
    return frames;
  };
  try {
    if (!Game.paintPhaser || !Game.phaserScene) { fail('paint missing'); return out; }
    Game.frame = function(){};
    Game.fit();
    Game.selectClass('freehand');
    BeatEmUp.begin();
    Game.frame = function(){};
    const player = BeatEmUp.playerEntry();
    player.f.setClass('freehand');
    const depth = 0.5;
    const brawler = BeatEmUp.makeEnemy('brawler', player.f.x + 160, depth);
    const heavy = BeatEmUp.makeEnemy('heavy', player.f.x + 320, depth);
    brawler.scaleMul = 1;
    for (const entry of [player, brawler, heavy]) {
      entry.depth = depth; entry.f.depth = depth; entry.f.y = 0; entry.f.hp = 200;
      entry.f.state = 'idle'; entry.f.atk = null; entry.f.animT = 0; entry.f.flash = 0;
      entry.f.ragdollActive = false; entry.f.ragdollKO = false; entry.f.face = 1;
      entry.f._posedClip = ''; entry.f._heavyIdleEpoch = 0;
    }
    BeatEmUp.cast = [player, brawler, heavy];
    BeatEmUp.boss = null; BeatEmUp.cameraX = 0; BeatEmUp.waveSpawnQueue = [];
    BeatEmUp.eventT = 0; BeatEmUp.stageIntroT = 0; BeatEmUp.showGo = 0;
    Game.banner = ''; Game.phase = 'fight'; Game.fighting = 1; Game.mode = 'beatemup';
    const scene = Game.phaserScene;
    const missing = [];
    for (const [name, count] of Object.entries({ idle: 6, walk: 8, slam: 9, hit: 4, fall: 6 })) {
      for (let i = 0; i < count; i++) if (!scene.textures.exists('heavy-' + name + '-' + i)) missing.push(name + ':' + i);
    }
    if (missing.length) fail('missing textures ' + missing.join(','));
    const paint = () => { Game.paintPhaser(); };
    const plates = () => visible().filter(o => String(o.texture.key).indexOf('body-') === 0).map(o => o.texture.key);
    paint();
    const idleKey = keyOf('heavy-');
    out.idle = idleKey;
    out.brawler = keyOf('brawler-idle-');
    out.player = keyOf('karate-idle-');
    if (idleKey !== 'heavy-idle-0') fail('idle drew ' + idleKey);
    if (!out.brawler) fail('brawler sprite missing');
    if (!out.player) fail('player sprite missing');
    if (plates().length) fail('vector plate visible on idle: ' + plates().join(','));
    const imgs = visible();
    const hvImg = imgs.find(o => String(o.texture.key).indexOf('heavy-') === 0);
    const brImg = imgs.find(o => String(o.texture.key).indexOf('brawler-idle-') === 0);
    const plImg = imgs.find(o => String(o.texture.key).indexOf('karate-idle-') === 0);
    const ratio = brImg && hvImg ? Math.abs(hvImg.scaleY) / Math.abs(brImg.scaleY) : 0;
    out.scale = +ratio.toFixed(4);
    out.scaleMul = heavy.scaleMul;
    if (!(Math.abs(ratio - 1.12) < 1e-3) || Math.abs(heavy.scaleMul - 1.12) > 1e-6) fail('scale ' + ratio + ' mul ' + heavy.scaleMul);
    const feet = [plImg, brImg, hvImg].map(o => o ? +o.y.toFixed(3) : null);
    out.feet = feet;
    if (feet.some(y => y == null) || Math.abs(feet[0] - feet[1]) > 0.5 || Math.abs(feet[1] - feet[2]) > 0.5) fail('feet ' + feet.join(','));
    heavy.f.state = 'walk'; heavy.f.walkPx = 0;
    paint();
    if (keyOf('heavy-') !== 'heavy-walk-0') fail('walk drew ' + keyOf('heavy-'));
    if (plates().length) fail('vector plate visible on walk');
    heavy.f.state = 'hit'; heavy.f.animT = 0; heavy.f._posedClip = '';
    paint();
    if (keyOf('heavy-') !== 'heavy-hit-0') fail('hit drew ' + keyOf('heavy-'));
    if (plates().length) fail('vector plate visible on hit');
    heavy.f.state = 'knockdown'; heavy.f.ragdollActive = true; heavy.f.hp = 80; heavy.f.animT = 0; heavy.f._posedClip = '';
    paint();
    if (keyOf('heavy-') !== 'heavy-fall-0') fail('down drew ' + keyOf('heavy-'));
    if (plates().length) fail('vector plate visible on down');
    heavy.f.ragdollActive = false; heavy.f.hp = 200; heavy.f.state = 'idle'; heavy.f.animT = 0.4; heavy.f._posedClip = '';
    heavy.f.startAtk('punch');
    const attack = heavy.f.atk;
    if (!attack || !attack.slam) { fail('slam did not arm'); return out; }
    const su = attack.su, ac = attack.ac, re = attack.re;
    out.phases = [su, ac, re];
    const timing = [10, 10, 10, 4, 14, 12, 10, 8, 4];
    const wind = expand(holdCounts(su, timing.slice(0, 3)), 0);
    const swing = expand(holdCounts(ac, timing.slice(3, 4)), 3);
    const recovery = expand(holdCounts(re, timing.slice(4)), 4);
    const expect = wind.concat(swing, recovery);
    const art = (holds) => holds.reduce((s, n) => s + n, 0);
    const proportional = (frames, holds, len) => {
      const by = {};
      frames.forEach(f => { by[f] = (by[f] || 0) + 1; });
      const total = holds.reduce((s, n) => s + n, 0);
      if (Object.values(by).reduce((s, n) => s + n, 0) !== len) return false;
      return holds.every((h, i) => {
        const c = by[frames[0] + i] || 0;
        const base = Math.floor(h * len / total);
        return c === base || c === base + 1;
      });
    };
    if (art(timing) !== 82 || art(timing.slice(0, 3)) !== 30 || timing[3] !== 4 || art(timing.slice(4)) !== 48) fail('timing table');
    if (!proportional(wind, timing.slice(0, 3), su) || !proportional(swing, [4], ac) || !proportional(recovery, timing.slice(4), re)) fail('holds not proportional');
    const before = { hp: heavy.f.hp, x: heavy.f.x, dmg: attack.dmg, su, ac, re, kb: attack.kb, stun: attack.stun, reach: attack.reach };
    const got = [];
    for (let t = 1; t <= su + ac + re; t++) {
      heavy.f.atkT = t; heavy.f.state = 'punch';
      paint();
      const key = keyOf('heavy-slam-');
      const index = key ? +key.slice('heavy-slam-'.length) : -1;
      got.push(index);
      if (plates().length) { fail('vector plate during slam t=' + t); break; }
    }
    out.slam = got.join(',');
    const same = expect.length === got.length && expect.every((f, i) => f === got[i]);
    if (!same) fail('slam frames ' + got.join(',') + ' expected ' + expect.join(','));
    const swingGot = got.slice(su, su + ac);
    if (swingGot.some(f => f !== 3)) fail('swing frames ' + swingGot.join(','));
    if (got[0] !== 0 || got[su + ac + re - 2] !== 8 || got[got.length - 1] !== 8) fail('slam ends off idle stance');
    const after = { hp: heavy.f.hp, x: heavy.f.x, dmg: attack.dmg, su: attack.su, ac: attack.ac, re: attack.re, kb: attack.kb, stun: attack.stun, reach: attack.reach };
    if (JSON.stringify(before) !== JSON.stringify(after)) fail('paint changed gameplay ' + JSON.stringify(before) + ' -> ' + JSON.stringify(after));
    heavy.f.atk = null; heavy.f.state = 'idle'; heavy.f.atkT = 0;
    paint();
    const back = keyOf('heavy-');
    out.afterSlam = back;
    if (back !== 'heavy-idle-0') fail('slam returned to ' + back);
    if (plates().length) fail('vector plate after slam');
  } catch (err) {
    fail(String(err && err.stack || err));
  }
  return out;
}'''

DEATH_FALL = r'''() => {
  // Knockdown and KO must paint <name>-fall, advance off the standing first frame
  // while animT stays frozen (the beat 'em up death path only calls updateRagdoll),
  // play once, and hold the last frame. idle/walk must not take the sprite back.
  const out = { pass: true, problems: [], rows: [] };
  const fail = (msg) => { out.pass = false; out.problems.push(msg); };
  const visible = () => Game.phaserScene.children.list.filter(o => o.visible && o.type === 'Image' && o.texture);
  const keyOf = (prefix) => {
    const img = visible().find(o => String(o.texture.key).indexOf(prefix) === 0);
    return img ? String(img.texture.key) : '';
  };
  const counts = {
    karate: 8, staff: 8, blade: 8, brawler: 8, rusher: 8,
    grappler: 6, heavy: 6, 'block-captain': 8, dockmaster: 6,
  };
  const readFall = (prefix) => {
    Game.paintPhaser();
    const fall = keyOf(prefix + '-fall-');
    if (!fall) { fail(prefix + ' stood as ' + (keyOf(prefix + '-') || 'nothing')); return -1; }
    return +fall.slice((prefix + '-fall-').length);
  };
  const expectIndex = (elapsed, count) => Math.max(0, Math.min(count - 1, Math.floor(elapsed * 12)));
  const stepRagdoll = (entry, n) => {
    for (let i = 0; i < n; i++) {
      if (entry.f.hp <= 0) {
        if (entry.f.ragdollActive && entry.f.ragdollElapsed < 2) BeatEmUp.withDepth(entry, () => entry.f.updateRagdoll(1 / 60));
      } else BeatEmUp.withDepth(entry, () => entry.f.updateRagdoll(1 / 60));
      entry.f.vx = 0; entry.f.vy = 0; entry.f.y = 0; entry.f.grounded = true;
    }
  };
  try {
    if (!Game.paintPhaser || !Game.phaserScene) { fail('paint missing'); return out; }
    Game.frame = function(){};
    Game.fit();
    Game.selectClass('freehand');
    BeatEmUp.begin();
    Game.frame = function(){};
    const player = BeatEmUp.playerEntry();
    const depth = 0.55;
    const captain = BeatEmUp.makeEnemy('boss', 880, depth);
    captain.f.bossProfile = { signature: { key: 'bossBlockParty' }, scale: 1.25 };
    captain.scaleMul = 1.25;
    const dock = BeatEmUp.makeEnemy('boss', 1000, depth);
    dock.f.bossProfile = { signature: { key: 'bossDockHaulIn' }, scale: 1.28 };
    dock.scaleMul = 1.28;
    const enemies = [
      ['brawler', BeatEmUp.makeEnemy('brawler', 400, depth)],
      ['rusher', BeatEmUp.makeEnemy('rusher', 520, depth)],
      ['grappler', BeatEmUp.makeEnemy('grappler', 640, depth)],
      ['heavy', BeatEmUp.makeEnemy('heavy', 760, depth)],
      ['block-captain', captain],
      ['dockmaster', dock],
    ];
    const prep = (f) => {
      f.y = 0; f.vy = 0; f.vx = 0; f.grounded = true; f.atk = null; f.flash = 0; f.face = 1;
      f.animT = 3; f._clipName = 'idle'; f._staffClip = 'idle'; f._bladeClip = 'idle'; f._posedClip = 'idle';
      f.ragdollActive = false; f.ragdollKO = false; f.ragdollElapsed = 0; f.ragdollAngle = 0;
      f.hp = 100; f.state = 'idle';
    };
    const show = (entries) => {
      BeatEmUp.cast = entries;
      BeatEmUp.boss = null; BeatEmUp.cameraX = 0; BeatEmUp.waveSpawnQueue = [];
      BeatEmUp.eventT = 0; BeatEmUp.stageIntroT = 0; BeatEmUp.showGo = 0; BeatEmUp.stageOver = 0;
      Game.banner = ''; Game.phase = 'fight'; Game.fighting = 1; Game.mode = 'beatemup';
    };
    const heroes = [['karate', 'freehand', player], ['staff', 'staff', player], ['blade', 'blade', player]];
    const run = (label, prefix, entry, lethal) => {
      const count = counts[prefix];
      const f = entry.f;
      prep(f);
      entry.depth = depth; f.depth = depth;
      f.hp = lethal ? 0 : 80;
      f.state = lethal ? 'ko' : 'knockdown';
      f.ragdollActive = true; f.ragdollKO = !!lethal; f.ragdollElapsed = 0;
      f.animT = 4;
      const anim = f.animT;
      const at0 = readFall(prefix);
      if (at0 !== 0) fail(label + ' frame0 ' + at0);
      f.ragdollElapsed = 0.25;
      const midSet = readFall(prefix);
      if (midSet !== expectIndex(0.25, count)) fail(label + ' mid-set ' + midSet);
      f.ragdollElapsed = 0; f.vx = 0; f.vy = 0; f.y = 0; f.grounded = true;
      stepRagdoll(entry, 18);
      const mid = readFall(prefix);
      const midExpect = expectIndex(f.ragdollElapsed, count);
      if (mid !== midExpect || mid < 1 || mid >= count - 1) fail(label + ' mid ' + mid + ' elapsed ' + f.ragdollElapsed);
      let held = mid;
      if (lethal) {
        // KO never gets up. Stay inside the 2s corpse window, past one full clip,
        // and confirm the index does not wrap back to the standing frame.
        stepRagdoll(entry, 70);
        held = readFall(prefix);
        if (held !== count - 1) fail(label + ' hold ' + held + ' elapsed ' + f.ragdollElapsed);
        f.ragdollElapsed = 1.5;
        if (readFall(prefix) !== count - 1) fail(label + ' repeated');
      }
      const shown = lethal ? count - 1 : mid;
      f.state = 'idle';
      if (readFall(prefix) !== shown) fail(label + ' idle overrode');
      f.state = 'walk';
      if (readFall(prefix) !== shown) fail(label + ' walk overrode');
      if (f.animT !== anim) fail(label + ' animT moved');
      out.rows.push({ who: label, frames: count, mid: mid, hold: held, elapsed: +f.ragdollElapsed.toFixed(3) });
    };
    for (const [prefix, classId, entry] of heroes) {
      Game.selectClass(classId);
      player.f.setClass(classId);
      show([player]);
      run(prefix + ' knockdown', prefix, entry, false);
      run(prefix + ' ko', prefix, entry, true);
    }
    for (const [prefix, entry] of enemies) {
      prep(player.f);
      player.f.setClass('freehand');
      show([player, entry]);
      run(prefix + ' knockdown', prefix, entry, false);
      run(prefix + ' ko', prefix, entry, true);
    }
  } catch (err) {
    fail(String(err && err.stack || err));
  }
  return out;
}'''

WALK_CYCLE = r'''() => {
  // Walk playback loops (Phaser repeat -1). The project picks frames by hand, so
  // this samples the painted index: >=2 distinct frames, order 0..n-1, then 0 again.
  const out = { pass: true, problems: [], rows: [] };
  const fail = (msg) => { out.pass = false; out.problems.push(msg); };
  const visible = () => Game.phaserScene.children.list.filter(o => o.visible && o.type === 'Image' && o.texture);
  const keyOf = (prefix) => {
    const img = visible().find(o => String(o.texture.key).indexOf(prefix) === 0);
    return img ? String(img.texture.key) : '';
  };
  try {
    if (!Game.paintPhaser || !Game.phaserScene) { fail('paint missing'); return out; }
    Game.frame = function(){};
    Game.fit();
    BeatEmUp.begin();
    Game.frame = function(){};
    const player = BeatEmUp.playerEntry();
    const depth = 0.55;
    const show = (entries) => {
      BeatEmUp.cast = entries;
      BeatEmUp.boss = null; BeatEmUp.cameraX = 0; BeatEmUp.waveSpawnQueue = [];
      BeatEmUp.eventT = 0; BeatEmUp.stageIntroT = 0; BeatEmUp.showGo = 0; BeatEmUp.stageOver = 0;
      Game.banner = ''; Game.phase = 'fight'; Game.fighting = 1; Game.mode = 'beatemup';
    };
    const alive = (f) => {
      f.hp = 100; f.ragdollActive = false; f.ragdollKO = false; f.ragdollElapsed = 0;
      f.atk = null; f.y = 0; f.flash = 0; f.face = 1; f.depth = depth;
      f._clipName = ''; f._staffClip = ''; f._bladeClip = ''; f._posedClip = '';
    };
    const check = (label, prefix, count, setClock) => {
      const order = [];
      for (let i = 0; i <= count; i++) {
        setClock(i);
        Game.paintPhaser();
        const key = keyOf(prefix + '-walk-');
        order.push(key ? key.slice((prefix + '-walk-').length) : '?');
      }
      const distinct = {};
      for (let i = 0; i < count; i++) distinct[order[i]] = 1;
      const n = Object.keys(distinct).length;
      const expect = [];
      for (let i = 0; i < count; i++) expect.push(String(i));
      expect.push('0');
      const loop = order[count] === '0' && order[count - 1] === String(count - 1);
      if (n < 2) fail(label + ' distinct ' + n + ' [' + order.join(',') + ']');
      if (!loop || order.join(',') !== expect.join(',')) fail(label + ' repeat ' + order.join(',') + ' expected ' + expect.join(','));
      out.rows.push({ who: label, order: order.join(','), distinct: n, repeat: loop ? -1 : 0 });
    };
    const heroes = [['karate', 'freehand', 8], ['staff', 'staff', 8], ['blade', 'blade', 8]];
    for (const [prefix, classId, count] of heroes) {
      Game.selectClass(classId);
      player.f.setClass(classId);
      player.depth = depth;
      alive(player.f);
      player.f.state = 'walk';
      show([player]);
      const fps = PACE.spriteFps;
      check(prefix, prefix, count, (i) => { player.f.state = 'walk'; player.f.animT = (i + 0.5) / fps; player.f.walkPx = 0; });
    }
    const captain = BeatEmUp.makeEnemy('boss', 800, depth);
    captain.f.bossProfile = { signature: { key: 'bossBlockParty' }, scale: 1.25 };
    const dock = BeatEmUp.makeEnemy('boss', 900, depth);
    dock.f.bossProfile = { signature: { key: 'bossDockHaulIn' }, scale: 1.28 };
    const list = [
      ['brawler', BeatEmUp.makeEnemy('brawler', 400, depth), 8],
      ['rusher', BeatEmUp.makeEnemy('rusher', 500, depth), 8],
      ['grappler', BeatEmUp.makeEnemy('grappler', 600, depth), 6],
      ['heavy', BeatEmUp.makeEnemy('heavy', 700, depth), 8],
      ['block-captain', captain, 8],
      ['dockmaster', dock, 6],
    ];
    alive(player.f);
    player.f.setClass('freehand');
    player.f.state = 'idle';
    for (const [prefix, entry, count] of list) {
      entry.depth = depth;
      alive(entry.f);
      entry.f.state = 'walk';
      show([player, entry]);
      const step = 148 / count;
      check(prefix, prefix, count, (i) => { entry.f.state = 'walk'; entry.f.walkPx = (i + 0.5) * step; entry.f.animT = 0; });
    }
  } catch (err) {
    fail(String(err && err.stack || err));
  }
  return out;
}'''

HUD_LABELS = r'''() => {
  // YOU tag (canvas stroke) and the MOVE / LANE hint (CSS). Styles only.
  const rgb = (s) => {
    const text = String(s || '').trim().toLowerCase();
    const m = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return [+m[1], +m[2], +m[3]];
    let hex = text.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
    if (/^[0-9a-f]{6}/.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    return null;
  };
  const same = (a, b) => !!(a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);
  const out = { problems: [] };
  const fail = (msg) => { out.problems.push(msg); };
  const INK = [26, 18, 16], CREAM = [255, 246, 228], WHITE = [255, 255, 255];
  try {
    const hintEl = document.querySelector('.move-stick');
    if (!hintEl) fail('move stick missing');
    else {
      const cs = getComputedStyle(hintEl, '::after');
      const strokeW = cs.webkitTextStrokeWidth || cs.getPropertyValue('-webkit-text-stroke-width');
      const strokeC = cs.webkitTextStrokeColor || cs.getPropertyValue('-webkit-text-stroke-color');
      const content = String(cs.content || '').replace(/^["']|["']$/g, '');
      out.hint = { content, color: cs.color, opacity: cs.opacity, weight: cs.fontWeight, strokeW, strokeC, size: cs.fontSize, top: cs.top };
      if (content.indexOf('MOVE') < 0 || content.indexOf('LANE') < 0) fail('hint text ' + cs.content);
      if (!same(rgb(cs.color), CREAM)) fail('hint fill ' + cs.color);
      if (Math.abs(parseFloat(cs.opacity) - 0.85) > 0.001) fail('hint opacity ' + cs.opacity);
      if (String(cs.fontWeight) !== '700') fail('hint weight ' + cs.fontWeight);
      if (strokeW !== '2px') fail('hint stroke width ' + strokeW);
      if (!same(rgb(strokeC), INK)) fail('hint stroke ' + strokeC);
      if (cs.fontSize !== '9px') fail('hint size ' + cs.fontSize);
      if (cs.top !== '-14px') fail('hint top ' + cs.top);
    }
    if (!Game.paintPhaser) fail('paint missing');
    else {
      Game.frame = function(){};
      Game.fit();
      Game.selectClass('freehand');
      BeatEmUp.begin();
      Game.frame = function(){};
      Game.phase = 'fight';
      Game.fighting = 1;
      Game.banner = '';
      Game.bannerT = 0;
      BeatEmUp.eventT = 0;
      BeatEmUp.stageIntroT = 0;
      BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
      const player = BeatEmUp.playerEntry();
      player.f.tag = 'YOU';
      player.f.ragdollActive = false;
      const seen = [];
      const proto = CanvasRenderingContext2D.prototype;
      const origS = proto.strokeText, origF = proto.fillText;
      proto.strokeText = function(text) {
        if (text === 'YOU') seen.push({ op: 'stroke', stroke: this.strokeStyle, w: this.lineWidth, font: this.font, ox: this.shadowOffsetX, oy: this.shadowOffsetY, blur: this.shadowBlur });
        return origS.apply(this, arguments);
      };
      proto.fillText = function(text) {
        if (text === 'YOU') seen.push({ op: 'fill', fill: this.fillStyle, font: this.font, a: this.globalAlpha });
        return origF.apply(this, arguments);
      };
      try { Game.paintPhaser(); }
      finally { proto.strokeText = origS; proto.fillText = origF; }
      const stroke = seen.filter(s => s.op === 'stroke');
      const fill = seen.filter(s => s.op === 'fill');
      out.you = { strokes: stroke.length, fills: fill.length, stroke: stroke[0] || null, fill: fill[0] || null };
      if (stroke.length !== 1 || fill.length !== 1) fail('YOU draw count stroke ' + stroke.length + ' fill ' + fill.length);
      const s0 = stroke[0], f0 = fill[0];
      const weight700 = (font) => /^(?:700|bold)\b/.test(String(font || ''));
      if (!s0 || !same(rgb(s0.stroke), INK)) fail('YOU stroke ' + (s0 && s0.stroke));
      if (!s0 || s0.w !== 2) fail('YOU stroke width ' + (s0 && s0.w));
      if (!s0 || !weight700(s0.font) || !/12px/.test(String(s0.font))) fail('YOU font ' + (s0 && s0.font));
      if (Fighter.prototype.drawHeadTag.toString().indexOf('700 12px') < 0) fail('YOU weight is not 700');
      if (!s0 || s0.ox !== 0 || s0.oy !== 0 || s0.blur !== 0) fail('YOU shadow ' + (s0 && [s0.ox, s0.oy, s0.blur].join(',')));
      if (!f0 || !same(rgb(f0.fill), WHITE)) fail('YOU fill ' + (f0 && f0.fill));
      if (!f0 || !weight700(f0.font)) fail('YOU fill weight ' + (f0 && f0.font));
      if (!f0 || f0.a !== 1) fail('YOU alpha ' + (f0 && f0.a));
    }
    const other = [];
    const probe = document.createElement('canvas').getContext('2d');
    const probeS = probe.strokeText.bind(probe), probeF = probe.fillText.bind(probe);
    probe.strokeText = function(text) { other.push({ op: 'stroke', text, stroke: this.strokeStyle, w: this.lineWidth, font: this.font }); return probeS.apply(probe, arguments); };
    probe.fillText = function(text) { other.push({ op: 'fill', text, fill: this.fillStyle, font: this.font }); return probeF.apply(probe, arguments); };
    const cpu = fighters[1];
    const saved = { tag: cpu.tag, rag: cpu.ragdollActive, banner: Game.banner, phase: Game.phase };
    cpu.tag = 'CPU'; cpu.ragdollActive = false; Game.banner = ''; Game.phase = 'fight';
    cpu.drawHeadTag(probe);
    cpu.tag = saved.tag; cpu.ragdollActive = saved.rag; Game.banner = saved.banner; Game.phase = saved.phase;
    const cpuStroke = other.filter(e => e.op === 'stroke' && e.text === 'CPU');
    const cpuFill = other.filter(e => e.op === 'fill' && e.text === 'CPU');
    out.cpu = { strokes: cpuStroke.length, fill: cpuFill[0] || null };
    if (cpuStroke.length) fail('CPU tag gained a stroke');
    if (cpuFill.length !== 1 || String(cpuFill[0].font).indexOf('12px') < 0 || /700|bold/i.test(cpuFill[0].font)) fail('CPU font ' + (cpuFill[0] && cpuFill[0].font));
    if (!cpuFill.length || !same(rgb(cpuFill[0].fill), WHITE)) fail('CPU fill ' + (cpuFill[0] && cpuFill[0].fill));
  } catch (err) {
    fail(String(err && err.stack || err));
  }
  out.pass = out.problems.length === 0;
  return out;
}'''

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(ROOT)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.7)
    url = f'http://127.0.0.1:{port}/index.html'
    failures = []
    texture_problems = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            # Real preload (the harness below freezes the boot frame before Phaser creates the scene).
            load_page = browser.new_page(viewport={'width': 844, 'height': 390})
            load_problems = []
            def note_load_response(response):
                if response.status < 400: return
                if '/characters/' in response.url or '/frames/' in response.url:
                    load_problems.append(f'{response.status} {response.url}')
            def note_load_console(msg):
                text = msg.text or ''
                low = text.lower()
                if 'failed to load' in low or 'file load error' in low or 'missing texture' in low:
                    load_problems.append(text)
            load_page.on('response', note_load_response)
            load_page.on('console', note_load_console)
            load_page.goto(url, wait_until='load')
            loaded = {'pass': False, 'error': 'preload did not finish'}
            try:
                load_page.wait_for_function(
                    "() => !!(Game.phaserScene && Game.phaserScene.textures.exists('karate-punch-5') && Game.phaserScene.textures.exists('karate-special-23'))",
                    timeout=20000)
                loaded = load_page.evaluate('''() => {
                  const scene = Game.phaserScene;
                  const need = { idle: 6, walk: 8, punch: 6, kick: 12, fall: 8, roll: 8, special: 24 };
                  const missing = [];
                  for (const [name, count] of Object.entries(need)) {
                    for (let i = 0; i < count; i++) if (!scene.textures.exists('karate-' + name + '-' + i)) missing.push(name + ':' + i);
                  }
                  const combo = [];
                  for (let i = 0; i < 18; i++) if (scene.textures.exists('karate-combo-' + i)) combo.push(i);
                  const keys = scene.textures.getTextureKeys().filter(k => String(k).indexOf('karate-combo') === 0);
                  return { missing, combo, keys, pass: missing.length === 0 && combo.length === 0 && keys.length === 0 };
                }''')
            except Exception as exc:
                loaded = {'pass': False, 'error': str(exc)}
            print('karate texture load', json.dumps({k: v for k, v in loaded.items() if k != 'pass'}))
            if not loaded.get('pass') or load_problems:
                failures.append('Texture load failed: game preload left Karate frames missing, loaded a combo texture, or reported a missing file: '
                                + json.dumps({'loaded': {k: v for k, v in loaded.items() if k != 'pass'}, 'http': load_problems[:8]}))
            else:
                title_art = {'pass': True, 'views': {}}
                for vw, vh in ((667, 375), (844, 390)):
                    load_page.set_viewport_size({'width': vw, 'height': vh})
                    view = load_page.evaluate(TITLE_UI)
                    title_art['views'][f'{vw}x{vh}'] = {k: v for k, v in view.items() if k != 'pass'}
                    if not view.get('pass'): title_art['pass'] = False
                print('title sprites', json.dumps(title_art['views']))
                if not title_art.get('pass'):
                    failures.append('Title menu failed: at 667x375 and 844x390 the hero, logo, class cards, difficulty segments, Practice, START and fullscreen gear must stay on screen inside the safe area without overlapping, every title tap target must be at least 44px, and pause/countdown/cleared/failed sheets must do the same with buttons at least 48px: '
                                    + json.dumps(title_art['views']))
                load_page.set_viewport_size({'width': 844, 'height': 390})
                body_scale = load_page.evaluate(BODY_SCALE)
                print('player body scale', json.dumps({k: v for k, v in body_scale.items() if k != 'pass'}))
                if not body_scale.get('pass'):
                    failures.append('Player body scale failed: Karate, Staff and Blade on-screen heights must match a scaleMul-1 Brawler within 2% at the same Beat \'em up depth (lane scale included), and practice must keep drawS(): '
                                    + json.dumps({k: v for k, v in body_scale.items() if k != 'pass'}))
                heavy_sprites = load_page.evaluate(HEAVY_SPRITES)
                print('heavy sprites', json.dumps({k: v for k, v in heavy_sprites.items() if k != 'pass'}))
                if not heavy_sprites.get('pass'):
                    failures.append('Heavy sprites failed: expected heavy-* frames (no vector plate) at scale 1.12 with feet on the shared floor line, and slam frames following timing [10,10,10,4,14,12,10,8,4] across the existing wind-up, swing, and recovery: '
                                    + json.dumps({k: v for k, v in heavy_sprites.items() if k != 'pass'}))
                death_fall = load_page.evaluate(DEATH_FALL)
                print('death fall', json.dumps({k: v for k, v in death_fall.items() if k != 'pass'}))
                if not death_fall.get('pass'):
                    failures.append('Death fall failed: every posed fighter (karate, staff, blade, brawler, rusher, grappler, heavy, block-captain, dockmaster) must map knockdown and KO to its fall clip, play that clip once from ragdollElapsed while animT stays frozen, hold the last frame, and ignore idle/walk: '
                                    + json.dumps({k: v for k, v in death_fall.items() if k != 'pass'}))
                walk_cycle = load_page.evaluate(WALK_CYCLE)
                print('walk cycle', json.dumps({k: v for k, v in walk_cycle.items() if k != 'pass'}))
                if not walk_cycle.get('pass'):
                    failures.append('Walk cycle failed: every posed walk clip must paint at least 2 distinct frames in order and loop (repeat -1) instead of restarting or clamping: '
                                    + json.dumps({k: v for k, v in walk_cycle.items() if k != 'pass'}))
                hud_labels = load_page.evaluate(HUD_LABELS)
                print('hud labels', json.dumps({k: v for k, v in hud_labels.items() if k != 'pass'}))
                if not hud_labels.get('pass'):
                    failures.append('HUD label contrast failed: the YOU tag must keep a white fill, a 2px #1A1210 stroke, shadow offset 0,0 blur 0, and font weight 700 at 12px; the MOVE/LANE hint must use fill #FFF6E4, a 2px #1A1210 stroke, font weight 700, and 85% opacity. Other head tags stay plain: '
                                    + json.dumps({k: v for k, v in hud_labels.items() if k != 'pass'}))
            load_page.close()
            page = browser.new_page(viewport={'width': 844, 'height': 390})
            def note_response(response):
                url = response.url
                if response.status < 400: return
                if '/characters/' in url or '/frames/' in url:
                    texture_problems.append(f'{response.status} {url}')
            def note_console(msg):
                text = msg.text or ''
                low = text.lower()
                if 'failed to load' in low or 'file load error' in low or 'missing texture' in low:
                    texture_problems.append(text)
            page.on('response', note_response)
            page.on('console', note_console)
            page.add_init_script(INIT_SCRIPT)
            page.goto(url, wait_until='load')
            page.wait_for_function("typeof Game !== 'undefined' && Game.canvas")
            page.wait_for_timeout(100)
            page.evaluate(FREEZE)
            page.evaluate(SEED_RNG, SEED)
            page.evaluate(FREEZE)
            staff_aoe = page.evaluate(STAFF_AOE)
            print('staff AoE harness', json.dumps(staff_aoe))
            if not staff_aoe['pass']:
                failures.append('Staff AoE harness failed: expected all in-radius positions to take 24 per spin, per-pulse dedupe, off-lane/outside misses, symmetric facing, and Slam-only knockdown')
            lane_cov = page.evaluate(LANE_COVERAGE)
            print('special lane coverage', json.dumps(lane_cov))
            if not lane_cov['pass']:
                failures.append('Special lane coverage failed: expected player Staff 5 lanes at full X reach, Blade/Karate 3 lanes, CPU unchanged, practice lane 36px')
            brawler = page.evaluate(BRAWLER)
            print('brawler archetype', json.dumps({k: v for k, v in brawler.items() if k != 'pass'}))
            if not brawler['pass']:
                failures.append('Brawler archetype failed: expected 110hp stage/difficulty-scaled, 0.95 speed, fists only, ROOKIE hurtbox, no profile on existing archetypes (draw unchanged), jab-cross = 2 hits totalling one ROOKIE punch, Stage 1 brawlers and the Stage 3 ROOKIE->brawler swap (1 of 3) in place')
            rusher = page.evaluate(RUSHER)
            print('rusher archetype', json.dumps({k: v for k, v in rusher.items() if k not in ('pass', 'sweep')}))
            if not rusher['pass']:
                print('rusher sweep', json.dumps(rusher['sweep']))
                failures.append('Rusher archetype failed: expected 80hp stage-scaled, 1.35 speed, no weapon, RUNNER fully replaced (18 rusher spawns after Stages 1-2), ROOKIE hurtbox, draw-only profile, 16f crouch + 18f/156px dash with hitbox only on the last 7 dash frames, 18px brake + 42f whiff recovery, locked direction, one-ROOKIE-punch hit that stops the dash')
            heavy = page.evaluate(HEAVY)
            print('heavy archetype', json.dumps({k: v for k, v in heavy.items() if k not in ('pass', 'sweep')}))
            if not heavy['pass']:
                print('heavy sweep', json.dumps(heavy['sweep']))
                failures.append('Heavy archetype failed: expected 145hp stage-scaled, 0.74 speed, 1.12 scale, always a sledgehammer, ROOKIE hurtbox, draw-only profile, 30f wind-up / 4f swing / 48f recovery with the hitbox only on frames 31-34 ending at the hammer tip, front-only bounded zone, one 12-damage hit, planted and facing-locked')
            guard = page.evaluate(GUARD)
            print('guard archetype', json.dumps({k: v for k, v in guard.items() if k not in ('pass', 'sweep')}))
            if not guard['pass']:
                print('guard sweep', json.dumps(guard['sweep']))
                failures.append('Guard archetype failed: expected 125hp stage-scaled, 0.85 speed, no weapon, TOUGH fully replaced (21 spawns), ROOKIE hurtbox, draw-only profile, frontal same-lane normals blocked for 0 (back/other lane/specials land), 3 quick blocks open the guard for exactly 1 s, 0.45 s turn delay, no shield hitbox, 14f/5f/48f bash with a 28px shove live only on frames 15-19 and one-ROOKIE-punch damage')
            grappler = page.evaluate(GRAPPLER)
            print('grappler archetype', json.dumps({k: v for k, v in grappler.items() if k not in ('pass', 'sweep')}))
            stage_src = (ROOT / 'stage-settings.js').read_text(encoding='utf-8')
            if not grappler['pass']:
                print('grappler sweep', json.dumps(grappler['sweep']))
                failures.append('Grappler archetype failed: expected 115hp stage-scaled, 0.9 speed, no weapon, 4 Stage 2 spawns, ROOKIE hurtbox, draw-only long-arm open-hand profile, grab only within reach and the same-lane tolerance, no grab on invulnerable/rolling/airborne/stunned players, wind-up hit cancels it, 27f wind-up -> 30f hold -> headbutt release -> 24f recovery, release on Grappler hit/death, held player immune to others, 1.5 s no-regrab, 0.8 s miss recovery, AI GRAB tell gated by cooldown')
            disruptor = page.evaluate(DISRUPTOR)
            print('disruptor archetype', json.dumps({k: v for k, v in disruptor.items() if k != 'pass'}))
            if not disruptor['pass'] or 'disruptor' in stage_src:
                failures.append('Disruptor archetype failed: expected 85hp stage-scaled, 0.9 speed, no weapon, no stage spawns, ROOKIE hurtbox, draw-only profile, no deploy hitbox, zone created on the activation frame at the player x/lane, 0.8 s harmless warning then 1.5 s live, exactly one zap per zone inside halfW and the shared lane tolerance, step-out / lane change / airborne / invulnerable avoid it, fixed position, finishes its cycle after the Disruptor dies, wind-up hit cancels, 4 s cooldown, one zone per Disruptor, ZAP AI tell gated, zones cleared on every reset path')
            boss_b2a = page.evaluate(BOSS_B2A)
            print('boss b2a', json.dumps({k: v for k, v in boss_b2a.items() if k != 'pass'}))
            if not boss_b2a['pass']:
                failures.append('Boss B2 PR A failed: expected stage 6-8 profiles (crossbow/naginata/girder, reach at the weapon tip, x1.3 paced normals), Laser Lock 0.6 s lane-locked full-screen bolt 18 (phase 3: 0/.5/1 together, random order 15 f apart, 14px each), Shadow Step 0.5 s tell + teleport behind + cut 16 at the naginata tip, Kage counter 0.8 s (parry = no damage, riposte 12 seven frames later, unused ends at 48 f, only Kage rolls it), Roadblock barricade 240 f lane block + 400px charge 20, signature tells >= 0.5 s')
            stage1 = page.evaluate(STAGE1)
            print('stage 1', json.dumps({k: v for k, v in stage1.items() if k != 'pass'}))
            if not stage1['pass']:
                failures.append('Stage 1 failed: expected waves brawler,brawler / brawler,rusher,brawler / brawler,rusher,brawler,rusher with no kunai/bruiser text and the Block Captain unchanged, Stage 1 spawns read from its wave "spawns" (and actually spawned there), stages 3-10 reproducing the old built-in layouts for all 72 slots, wave -> stage[n] -> stage default -> built-in per-field fallback with 0-1 clamping, Brawler/Rusher stats and moves unchanged, and at most 2 simultaneous attackers')
            stage2 = page.evaluate(STAGE2)
            print('stage 2', json.dumps({k: v for k, v in stage2.items() if k != 'pass'}))
            if not stage2['pass']:
                failures.append('Stage 2 failed: expected waves grappler,brawler / grappler,brawler,brawler / grappler,grappler,brawler,brawler with Grappler/Brawler text and the Dockmaster unchanged, other stages byte-identical, authored spawns read and actually spawned, at most one Grappler among the active attackers (an active Grappler keeps its slot, others yield to the next enemy; exact old slice otherwise), the two-attacker cap, Brawlers eligible right after a release (no grace window), no-regrab refusing a second grab, and Grappler/Brawler stats and moves unchanged')
            boss_b2b = page.evaluate(BOSS_B2B)
            print('boss b2b', json.dumps({k: v for k, v in boss_b2b.items() if k not in ('pass', 'bcStay', 'bcGap', 'bcSide', 'bcLane', 'bcEdge')}))
            if not boss_b2b['pass']:
                print('boss b2b broadcast', json.dumps({k: boss_b2b.get(k) for k in ('bcStay', 'bcGap', 'bcSide', 'bcLane', 'bcEdge')}))
                failures.append('Boss B2 PR B failed: expected stage 9-10 profiles (shock baton 115 / twin blades 110 -> sledgehammer 150 -> gauntlets 90 by phase, x1.3 paced normals, hitbox at the weapon tip), Director hits stun 18 f, Live Broadcast 0.5 s glitch tell + 3 spots at player x/-150/+150 in the player lane + lightning 42 f later for 14 (40px / 14px windows), Chief phase-2 replay of 3 distinct stage 1-9 signatures then the Finale (each replay runs), Coliseum Finale 0.5 s tell 10/10/12/14/24 with knockdown on the last hit only, and a draw-only boss cue')
            pacing = page.evaluate(PACING)
            print('pacing pass', json.dumps({k: v for k, v in pacing.items() if k != 'pass'}))
            if not pacing['pass']:
                failures.append('Pacing pass failed: expected every class punch at 12/4/19 and the kick finisher at 19/7/31, identical 35/35/57 totals, blend floor .08 outside active frames with identical strike boxes/combat bones on every active frame vs the old .04 floor, accel 1000 / brake 1400 / turn 1700, generic special 14/10/18, staff special 16/31/10, and SLAM, enemy specials, boss signatures, ranged timings and stun unchanged')
            chain = page.evaluate(CHAIN)
            print('attack chain', json.dumps({k: v for k, v in chain.items() if k != 'pass'}))
            if not chain['pass']:
                failures.append('Attack chain failed: expected Blade, Karate and Staff to deal 5/7/9 base damage across two punches and the kick finisher, with hit 3 knocking the target down, Karate hits 1 and 2 on punch frames 0-5 with frame 3 only in the active window, and no combo texture drawn or loaded across the chain and special')
            if texture_problems:
                failures.append('Texture load failed: ' + ' | '.join(texture_problems[:12]))
            dodge = page.evaluate(DODGE)
            print('dodge', json.dumps(dodge))
            if not dodge['pass']:
                failures.append('Dodge failed: expected a second roll within 1.6s of the start to be ignored, a roll after 1.6s to start, a hit at 0.30s to whiff and a hit at 0.45s to land, supers included')
            pace = page.evaluate(PACECFG)
            print('pace block', json.dumps(pace))
            if not pace['pass']:
                failures.append('PACE block failed: expected punch 12/4/19, finisher 19/7/31, chainWindow 14, hitstop 4/8, PACE 0.55, roll 0.60, i-frames 0.36, cooldown 1.6, get-up 0.8, enemy x1.3 and projectile speed 250 from the single PACE block')
            ranged = page.evaluate(RANGED)
            print('ranged archetype', json.dumps({k: v for k, v in ranged.items() if k != 'pass'}))
            if not ranged['pass'] or '"thrower"' in stage_src:
                failures.append('Ranged archetype failed: expected THROWER fully renamed (0 authored ranged spawns after Stage 1), 65hp stage-scaled and unchanged projectile numbers, ROOKIE hurtbox, draw-only hooded profile with pouch, no head label, aim pose held, release pose on exactly the kunai spawn frame, kunai leaves the hand on release, same-lane hit once, lane change / sidestep avoid it, no homing')
            blade_super = page.evaluate(BLADE_SUPER)
            print('blade Super harness', json.dumps(blade_super))
            if not blade_super['pass']:
                failures.append('Blade Super harness failed: expected the 80-frame single-slash Crescent Storm (charge 16, draw 11, active 28-32 with the Wave launched on 28, hold 16, recovery 19, sheath 13; su/ac/re 16/32/32, speed 670), one 74-damage event per target shared by slash and Wave (either order), stun 210 held until a per-target knockdown at hit+210, Blade free at frame 80 and planted/face-locked, Wave piercing in lane only, and safe knockdown timers when Blade is hit, the target dies, the round clears or a new super starts')
            special_pace = page.evaluate(SPECIAL_PACE)
            print('special pace', json.dumps(special_pace))
            if not special_pace['pass']:
                failures.append('Special pace failed: expected player Karate 16/24/30 (total 70) scaled from 12/18/22 by PACE.special 1.35, Blade total 80 from that same scale (charge 16, strike 32, recovery 19, sheath 13, speed 670, stun 210), Staff base hitDelays 0/12/24 and durations 5/5/7 with the last hit inside ac and total length kept, hitstop 6 on each special hit and 10 on the last, every special sprite frame used, and the CPU Karate telegraph unchanged')
            stage1_bg = page.evaluate(STAGE1_BG)
            print('panorama backdrops', json.dumps({k: v for k, v in stage1_bg.items() if k != 'pass'}))
            if not stage1_bg['pass']:
                failures.append('Panorama backdrop failed: expected backgrounds[0] = stage-01-street-brawl.webp and backgrounds[1] = stage-02-dockyard.webp decoding at 3371x725 (stages 3-10 unchanged, no panorama config there), for both stages anchors W1=0 < W2 <= 723 < W3 (right edge at the 2170 join) < Boss (right end) in range for W=640/960/1169/1555 and equal to the pinned Stage 1 values, glide eased with the camera smoothstep/duration and monotonic with no frame jump above the eased step, unlocked follow moves both ways and is capped at the panorama, resets to the wave anchor, aspect-kept source window for stages 1-2 and the stretched draw for stage 3')
            stage_clear = page.evaluate(STAGE_CLEAR_DELAY)
            print('stage clear delay', json.dumps({k: v for k, v in stage_clear.items() if k != 'pass'}))
            if not stage_clear['pass']:
                failures.append('Stage clear delay failed: expected STAGE_TRANSITION_DELAY = 5s (300 fixed steps) between a boss clear and the next stage, STAGE 2 CLEAR / NEXT STAGE IN / 5 on screen, no timer drain, damage, or spawns during the wait, one-shot (repeat clear/next does not skip or restart), and the final stage plus game-over/retry unchanged')
            special_gain = page.evaluate(SPECIAL_GAIN)
            print('special gain', json.dumps({k: v for k, v in special_gain.items() if k != 'sequence'}))
            print('special gain sequence', json.dumps(special_gain.get('sequence')))
            if not special_gain['pass']:
                failures.append('Special gain failed: expected a fixed punch/punch/kick/taken-punch sequence to fill the meter at exactly half the pre-multiplier award (dmg*2.5 dealt, dmg*1.5 taken, flat 12 on a special or Blade Wave, class meter and archetype specialGain unchanged), cap 100, a full meter still spent on special, and practice left at the full rate')
            page.close()
            for (w, h) in [(667, 375), (844, 390)]:
                pg = browser.new_page(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, device_scale_factor=2)
                pg.goto(url, wait_until='load'); pg.wait_for_function("typeof Game !== 'undefined' && Game.canvas"); pg.wait_for_timeout(200)
                r = pg.evaluate(CLEARANCE)
                print(f'clearance {w}x{h}', json.dumps(r))
                if r['band']:
                    if r['band']['left'] < 0 or r['band']['right'] > w: failures.append(f'{w}x{h} beat em up band outside viewport: {r["band"]}')
                pg.close()
            browser.close()
    finally:
        srv.terminate()
    if failures:
        print('FAIL'); [print(' -', f) for f in failures]; sys.exit(1)
    print('PASS')

if __name__ == '__main__':
    main()
