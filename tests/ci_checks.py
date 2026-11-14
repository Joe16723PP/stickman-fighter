#!/usr/bin/env python3
"""CI checks for Stickman Fighter (run on every pull_request).

1. Seeded 1v1 parity: seed 0xC0FFEE42, 100 rounds per level (easy/normal/hard),
   a scripted random-input player vs the CPU Bot, simulated headlessly at a fixed
   1/60 step. The sha256 digest of every round result must equal
   tests/parity-baseline.json. If a PR changes 1v1 on purpose, update the baseline
   in the same PR and explain why in the PR body.
2. Edge clearance (1v1) at 667x375 and 844x390: fighters parked on the lane
   edges must not overlap any touch control that shares their vertical span.
   Beat 'em up: fighters must stay inside the 2%..98% screen band.

Usage: python3 tests/ci_checks.py [--update-baseline]
"""
import json, hashlib, subprocess, sys, time, socket
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / 'tests' / 'parity-baseline.json'
SEED = 0xC0FFEE42
ROUNDS = 100
LEVELS = ['easy', 'normal', 'hard']
CLEAR_PX = 4

INIT_SCRIPT = '''
window.__SEED = %d; 
(function(){
  const _raf = window.requestAnimationFrame.bind(window);
  let frozen = false;
  window.requestAnimationFrame = function(cb){
    if (frozen) return 0;
    return _raf(function(now){
      if (!frozen && window.Game && Game.frame) {
        frozen = true;
        Game.frame = function(){};
        window.requestAnimationFrame = function(){ return 0; };
      }
      // Do NOT run the boot frame — drop it so Bot never ticks before our seed.
    });
  };
})();
''' % SEED

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

SETUP = '''() => {
  Game.frame = function(){};
  window.requestAnimationFrame = function(){ return 0; };
  if ('mode' in Game) Game.mode = '1v1';
  if (typeof Input !== 'undefined' && Input.syncMode) Input.syncMode();
  Game.level='normal';
  Game.phase='fight'; Game.fighting=1; Game.banner=''; Game.matchOver=0;
  Bot.reset(); if (Fx.clear) Fx.clear(); Game.shake=0; Game.stop=0;
  fighters[0].reset(Game.W*.35,1); fighters[1].reset(Game.W*.65,-1);
  fighters[0].meter=0; fighters[1].meter=0;
  fighters[0].color='#3B82F6'; fighters[1].color='#EF4444';
  fighters[0].tag='YOU'; fighters[1].tag='CPU';
  Game.timer=45; Game.wins=[0,0];
  Game.syncControls(); Game.fit(); Game.syncSpecialBtn();
  const el=document.getElementById('controls'); if(el) el.style.display='';
  Game.btns=[...document.querySelectorAll('#controls button')].map(el=>{
    const r=el.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height};
  });
  Game.frame = function(){};
}'''

SIM = '''(level) => {
  if ('mode' in Game) Game.mode = '1v1';
  if (typeof Input !== 'undefined' && Input.syncMode) Input.syncMode();
  Game.level = level;
  fighters[0].meter=0; fighters[1].meter=0;
  fighters[0].reset(Game.W*.35,1); fighters[1].reset(Game.W*.65,-1);
  Bot.reset();
  Game.timer=45; Game.phase='fight'; Game.fighting=1; Game.banner='';
  Game.matchOver=0; Game.stop=0; Game.shake=0; Game.wins=[0,0];
  if (typeof Fx !== 'undefined' && Fx.clear) Fx.clear();
  let t=0, nextAct=0, cur='';
  const acts=['left','right','punch','kick','block','jump'];
  for (let i=0;i<60*50;i++){
    if (Game.phase!=='fight') break;
    const step=Game.STEP; t+=step;
    if (t>=nextAct){
      Input.acts.forEach(a=>{Input.pad[0][a]=0;Input.was[0][a]=0;});
      cur=acts[(Math.random()*acts.length)|0];
      nextAct=t+0.08+Math.random()*0.22+0.05+Math.random()*0.2;
    }
    if (t<nextAct-0.05) Input.pad[0][cur]=1; else Input.pad[0][cur]=0;
    if (Game.stop>0){Game.stop-=step;continue;}
    Game.timer-=step;
    if (Game.timer<=0){Game.timer=0;Game.checkTimeout();break;}
    Bot.update(step,fighters[1],fighters[0]);
    ['punch','kick','special','jump'].forEach(a=>{if(Input.pad[1][a])Input.was[1][a]=0;});
    fighters[0].update(step,fighters[1],0);
    fighters[1].update(step,fighters[0],1);
    Game.resolve();
    if (Game.phase!=='fight') break;
  }
  if (Game.phase==='fight') Game.checkTimeout();
  let winner = Game.wins[1]>Game.wins[0]?1:Game.wins[0]>Game.wins[1]?0:(fighters[0].hp>=fighters[1].hp?0:1);
  Input.acts.forEach(a=>{Input.pad[0][a]=0;Input.was[0][a]=0;});
  return {winner, hp:[fighters[0].hp,fighters[1].hp], rng: window.__rngS ? window.__rngS() : -1};
}'''

CLEARANCE = '''() => {
  const out = {};
  // 1v1: park fighters on the lane edges at rest.
  Game.mode = '1v1'; if (Input.syncMode) Input.syncMode();
  Game.startMatch(); Game.phase = 'fight'; Game.fit();
  fighters[0].reset(Game.minX, 1); fighters[1].reset(Game.maxX, -1);
  const sc = Game.scale, ox = Game.ox, oy = Game.oy;
  const worst = [];
  fighters.forEach((f, i) => {
    const b = f.bones(), n = f.drawNudgeX();
    const x0 = ox + b.x0 * sc + n, x1 = ox + b.x1 * sc + n, y0 = oy + b.y0 * sc, y1 = oy + b.y1 * sc;
    let gap = Infinity;
    for (const r of Game.btns) {
      if (y0 >= r.y + r.h || y1 <= r.y) continue;
      const leftSide = r.x + r.w / 2 < innerWidth / 2;
      if ((i === 0) !== leftSide) continue;
      gap = Math.min(gap, i === 0 ? x0 - (r.x + r.w) : r.x - x1);
    }
    worst.push(gap);
  });
  out.gap1v1 = worst;
  // Beat 'em up: band check.
  BeatEmUp.begin(); Game.phase = 'fight';
  const band = BeatEmUp.horizontalScreenBounds ? BeatEmUp.horizontalScreenBounds() : null;
  out.band = band; out.viewport = [innerWidth, innerHeight];
  return out;
}'''

BLADE_SUPER = '''() => {
  Game.mode = '1v1'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0;
  Game.minX = 0; Game.maxX = Game.W; Game.wins = [0,0];
  BladeSuper.clear(); if (Fx.clear) Fx.clear();
  if (Input.syncMode) Input.syncMode();
  const owner = fighters[0], target = fighters[1];
  owner.setClass('blade'); owner.reset(Game.W * .35, 1); owner.playerControlled = true;
  target.setClass(null); target.reset(Game.W * .7, -1); target.playerControlled = false;
  owner.depth = target.depth = 0; owner.meter = 100; owner.startAtk('special'); // back edge, so the far edge (72px) is beyond Blade's 54px Special coverage
  owner.face = 1; owner.pose = Pose.specialDash(owner.classProfile); owner.poseFrom = owner.poseTo = owner.pose;
  owner.blendT = owner.blendDur = 0;
  const overlap = box => {
    const seg=box.segment, x=(seg.x1+seg.x2)/2, y=(seg.y1+seg.y2)/2;
    target.hitbox={x:x-5,y:y-5,w:10,h:10};
  };
  owner.atkT = BladeSuper.activeStart(0);
  const quick = owner.strike();
  if (!quick) return {pass:false,debug:{state:owner.state,atkT:owner.atkT,atk:owner.atk,weapon:owner.classProfile?.weapon,meter:owner.meter,pulse:owner.superPulse()}};
  overlap(quick); Game.resolve(); const afterQuick = target.hp;
  Game.resolve(); const afterQuickDuplicate = target.hp;
  owner.atkT = BladeSuper.activeStart(0) + BladeSuper.STRIKES[0].active; // impact hold: no hitbox
  const pause = owner.strike();
  owner.atkT = BladeSuper.activeStart(1);
  const diagonal = owner.strike();
  overlap(diagonal); Game.resolve(); const afterDiagonal = target.hp;
  Game.resolve(); const afterDiagonalDuplicate = target.hp;
  owner.atkT = BladeSuper.activeStart(1) + BladeSuper.STRIKES[1].active;
  const gap = owner.strike();
  owner.atkT = BladeSuper.activeStart(2);
  owner.pose = Pose.bladeSuperVertical(owner.classProfile); owner.poseFrom = owner.poseTo = owner.pose;
  owner.blendT = owner.blendDur = 0;
  const vertical = owner.strike();
  overlap(vertical); Game.resolve(); const afterVertical = target.hp;
  Game.resolve(); const afterVerticalDuplicate = target.hp;
  const launchAt = owner.atkT;
  BladeSuper.launch(owner.bladeSuper);
  const locked = {face:owner.bladeSuper.face,depth:owner.bladeSuper.depth,x:owner.bladeSuper.originX};
  owner.face = -1; owner.depth = .9; owner.x += 50;
  BladeSuper.update(Game.STEP);
  const wave = BladeSuper.waves[0];
  const launched = wave && {face:wave.sequence.face,depth:wave.sequence.depth,startX:wave.startX,travel:Math.abs(wave.x-wave.startX)};
  const sequence = owner.bladeSuper;
  owner.face = locked.face; owner.depth = locked.depth; owner.x = locked.x;
  target.depth = locked.depth; target.ragdollActive = false; target.grounded = true; target.dodgeT = 0;
  const targetEntry = target;
  BladeSuper.hit(sequence,targetEntry,true); const afterWave = target.hp;
  BladeSuper.hit(sequence,targetEntry,true); const afterWaveDuplicate = target.hp;
  const pierceTarget = new Fighter(Game.W*.8,'#EF4444',-1,'PIERCE'); pierceTarget.reset(Game.W*.8,-1); pierceTarget.depth=locked.depth;
  const offLaneTarget = new Fighter(Game.W*.82,'#EF4444',-1,'OFF LANE'); offLaneTarget.reset(Game.W*.82,-1); offLaneTarget.depth=1;
  const offLaneHp=offLaneTarget.hp;
  const lateWaveTarget = new Fighter(Game.W*.85,'#EF4444',-1,'LATE WAVE'); lateWaveTarget.reset(Game.W*.85,-1); lateWaveTarget.depth=locked.depth;
  target.x = Game.W * .95; pierceTarget.x = wave.startX + 75; offLaneTarget.x = wave.startX + 125; lateWaveTarget.x = wave.startX + 350;
  fighters.push(pierceTarget,offLaneTarget,lateWaveTarget);
  for (let i=0;i<8;i++) BladeSuper.update(Game.STEP);
  const piercedDuringTravel = pierceTarget.hp===68 && offLaneTarget.hp===offLaneHp;
  BladeSuper.hit(sequence,pierceTarget,true); BladeSuper.hit(sequence,offLaneTarget,true);
  owner.atkT=owner.atk.su+owner.atk.ac+owner.atk.re;
  BladeSuper.noto(sequence);
  const notoKnockdown=sequence.notoDone && target.ragdollActive;
  for (let i=0;i<16;i++) BladeSuper.update(Game.STEP);
  const windows = []; let cur = null;
  for (let f=1; f<=owner.atk.su+owner.atk.ac+owner.atk.re; f++) {
    const p = BladeSuper.pulseForFrame(f);
    if (p >= 0 && (!cur || cur[0] !== p)) { cur = [p,f,f]; windows.push(cur); }
    else if (p >= 0) cur[2] = f; else cur = null;
  }
  const parts = BladeSuper.STRIKES.map((s,k) => [s.windup,s.active,s.hold,s.gap].join('/'));
  const phaseAt = [24,25,28,29,31,32,47,48,59,60,67,68,70,71,90,91,102,103,112,113,116,117,144,145,180]
    .map(f => { const p = BladeSuper.phaseAt(f); return p.part + (p.strike >= 0 ? p.strike : ''); }).join(',');
  const frameProbe = {
    charge:owner.atk.su, strikes:BladeSuper.STRIKES.map((_s,k)=>BladeSuper.strikeLength(k)), parts,
    recovery:owner.atk.re, noto:BladeSuper.NOTO_FRAME, launch:BladeSuper.LAUNCH_FRAME, faceLock:BladeSuper.FACE_LOCK_FRAME,
    total:owner.atk.su+owner.atk.ac+owner.atk.re, windows:windows.map(w=>w.join('-')).join(','), phaseAt,
    damages:BladeSuper.STRIKES.map(s=>s.damage), totalDamage:owner.atk.dmg, waveDamage:BladeSuper.WAVE_DAMAGE,
  };
  return {
    frameProbe, quick:quick&&{pulse:quick.pulse,damage:quick.dmg}, pause:pause===null, gap:gap===null,
    diagonal:diagonal&&{pulse:diagonal.pulse,damage:diagonal.dmg,seg:diagonal.segment},
    vertical:vertical&&{pulse:vertical.pulse,damage:vertical.dmg,vertical:vertical.segment.y2>vertical.segment.y1},
    launchAt, wave:launched, locked,
    hp:{afterQuick,afterQuickDuplicate,afterDiagonal,afterDiagonalDuplicate,afterVertical,afterVerticalDuplicate,afterWave,afterWaveDuplicate,
      pierce:pierceTarget.hp,lateWave:lateWaveTarget.hp,offLane:offLaneTarget.hp},
    piercing: piercedDuringTravel && pierceTarget.hp===68, offLane:offLaneTarget.hp===offLaneHp,
    notoKnockdown, lateWave:lateWaveTarget.hp===68,
    pass:frameProbe.charge===24 && frameProbe.strikes.join('/')==='35/43/42'
      && frameProbe.parts.join(' ')==='4/3/16/12 8/3/20/12 10/4/28/0'
      && frameProbe.recovery===36 && frameProbe.noto===180 && frameProbe.total===180
      && frameProbe.launch===113 && frameProbe.faceLock===29
      && frameProbe.windows==='0-29-31,1-68-70,2-113-116'
      && frameProbe.phaseAt==='charge,windup0,windup0,active0,active0,hold0,hold0,gap0,gap0,windup1,windup1,active1,active1,hold1,hold1,gap1,gap1,windup2,windup2,active2,active2,hold2,hold2,recovery,recovery'
      && frameProbe.damages.join('/')==='20/22/32' && Math.abs(frameProbe.totalDamage-74)<1e-9 && frameProbe.waveDamage===32
      && quick?.pulse===0 && quick?.dmg===20 && pause===null && gap===null
      && diagonal?.pulse===1 && diagonal?.dmg===22
      && diagonal.segment.y2>diagonal.segment.y1 && (diagonal.segment.x2-diagonal.segment.x1)*owner.face>40
      && vertical?.pulse===2 && vertical?.dmg===32 && vertical.segment.y2>vertical.segment.y1
      && launchAt===113 && locked.face===1 && locked.depth===0 && locked.x===Game.W*.35
      && launched?.face===locked.face && launched?.depth===locked.depth && launched.travel===15
      && afterQuick===80 && afterQuickDuplicate===80 && afterDiagonal===58 && afterDiagonalDuplicate===58
      && afterVertical===26 && afterVerticalDuplicate===26
      && afterWave===26 && afterWaveDuplicate===26 && pierceTarget.hp===68 && offLaneTarget.hp===offLaneHp
      && notoKnockdown && lateWaveTarget.hp===68 && BladeSuper.RANGE===420 && BladeSuper.SPEED===900,
  };
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
  Game.mode = '1v1';
  r.oneVOne = { lanePx: Depth.lanePx(), staff: Depth.specialLaneTolerance(staff), blade: Depth.specialLaneTolerance(blade), karate: Depth.specialLaneTolerance(karate) };
  Game.mode = prevMode;
  r.pass = Math.abs(r.lanePx - 43.2) < 1e-6 && r.staffFullReach === '0111110' && r.staffOutside === '0000000'
    && r.blade === '0011100' && r.karate === '0011100' && r.cpuStaff === '0001000' && r.cpuBlade === '0001000' && r.cpuTol === null
    && r.oneVOne.lanePx === 36 && r.oneVOne.staff === 90 && r.oneVOne.blade === 54 && r.oneVOne.karate === 54;
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
  for (let s = 1; s < 3; s++) for (let w = 0; w < 3; w++) {
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
    && r.jabCross.hits[0].frame === 10 && r.jabCross.hits[1].frame === 31
    && Math.abs(r.jabCross.total - r.rookiePunch.total) < 1e-6 && r.rookiePunch.total > 0
    && r.timeline.su === 9 && r.timeline.ac === 24 && r.timeline.re === 18 && r.timeline.total === 51
    && r.spawns.stage1.includes('brawler') && r.spawns.swapped === 2 && r.spawns.rookies === 5 && r.spawns.inPlace && !r.spawns.laterBrawlers;
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
    && r.runnerGone && r.runnerSpawns === 0 && r.rusherSpawns === 21
    && r.hurtboxSame && r.profileDrawn && r.gameplayBonesSame
    && tl.su === 27 && tl.ac === 7 && tl.re === 42 && tl.dashStart === 17 && tl.dashEnd === 34 && tl.total === 76
    // Whiff: full fixed dash + braking skid, live box only on the last 7 dash frames, full stumble recovery.
    && w.hits.length === 0 && Math.abs(w.travelled - (sp.distance + sp.brake)) < 1e-6 && w.frames === tl.total && w.live === '28-34'
    && !w.chain && w.faces.length === 1 && w.faces[0] === -1
    // Direction is locked at rush start even if the player jumps behind.
    && r.behind.hits.length === 0 && Math.abs(r.behind.travelled - (sp.distance + sp.brake)) < 1e-6 && r.behind.faces.length === 1
    // Approach never hits; every hit is one ROOKIE punch, stops the dash, and recovers in hitRecovery frames.
    && hitsAll.length >= 5 && r.sweep.every(o => o.n <= 1 && (o.n === 0 || (o.hit >= tl.su + 1 && o.hit <= tl.su + tl.ac)))
    && hitsAll.every(o => Math.abs(o.dmg - r.rookiePunch) < 1e-6 && o.travelled <= sp.distance + 1e-6 && o.frames === o.hit + sp.hitRecovery)
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
    && tl.su === 30 && tl.ac === 4 && tl.re === 48 && tl.total === 82
    // Whiff: full 82 frames, hitbox only on the 4 swing frames, planted, facing locked through the swing, cannot chain.
    && w.hits.length === 0 && w.frames === 82 && w.live === '31-34' && w.tipMatch && w.profileFree && !w.chain && !w.moved && w.faces.length === 1
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
  const aiTell = (prep) => { setup(x0 - 60); gp.ai.cool = 0; gp.ai.tellT = 0; gp.ai.tellKind = ''; prep(); BeatEmUp.updateGroupAI(Game.STEP, pEntry); return gp.ai.tellT > 0 ? gp.ai.tellKind : ''; };
  r.ai = { free: aiTell(() => {}), cooling: aiTell(() => { gp.f.grabCoolT = 1; }), noRegrab: aiTell(() => { player.noRegrabT = 1; }), behind: aiTell(() => { player.x = x0 + 60; }) };
  BeatEmUp.stage = prev.stage; BeatEmUp.cast = []; Game.mode = prev.mode;
  Input.acts.forEach(a => { Input.pad[0][a] = 0; Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  player.reset(200, 1);
  const s = r.stats, su = r.success, m = r.miss;
  r.pass = s.hp === s.expectHp && s.speedMul === .9 && s.scaleMul === 1 && s.weapon === null && r.armed === 0 && s.dmgMul === EnemyWeaponProfiles.freehand.damage
    && s.tag === 'GRAPPLER' && s.grab === 'clinch' && s.combo === null && s.rush === null && s.slam === null && s.guard === null && s.bash === null && s.profile
    && r.grapplerSpawns === 0 && r.hurtboxSame && r.gameplayBonesSame && r.profileDrawn && r.longArms && sp.label === 'GRAB'
    && r.rangeOk && r.laneOk && !r.invuln && !r.roll && !r.air && !r.stunned
    && r.interrupt.kind === 'hit' && !r.interrupt.caught && r.interrupt.held === 0
    // Catch on the first reach frame in range; hold exactly headbuttAt frames, headbutt = release, then hitRecovery.
    && su.caught === tl.su + 1 && su.held === sp.headbuttAt && su.pinned && su.release === 'headbutt' && su.releaseFrame === tl.su + 1 + sp.headbuttAt
    && Math.abs(su.hpLoss - su.expectDmg) < 1e-6 && su.noRegrab === sp.noRegrab && su.stun === sp.stun && su.vxAway && su.strikes === 0
    && su.frames === tl.su + 1 + sp.headbuttAt + sp.hitRecovery && su.phases === 'xw,xh,xb,xs,xg' && su.coolT > 0
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
  r.pass = s.hp === s.expectHp && s.speedMul === 1 && s.scaleMul === 1 && s.weapon === null && s.special === 0 && s.profile && s.proj === '315,560,0.5,0.9,2.5'
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
  // Pacing pass (2026-11-15, Lemar WP5 starting point). 1v1 fighters, 60 fps fixed step, no hits landed.
  const prev = { mode: Game.mode, floor: Fighter.BLEND_FLOOR, random: Math.random };
  Game.mode = '1v1'; Game.phase = 'fight'; Game.fighting = 1; Game.stop = 0; Game.shake = 0; Game.minX = 0; Game.maxX = Game.W * 4;
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
  const classes = { freehand: 4, blade: 3, staff: 2 }, r = { frames: {}, liveSame: true, liveDiff: [], liveFrames: 0 };
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
  // Untouched: supers, Heavy SLAM, enemy specials, boss signatures, stun.
  const sig = k => [Moves[k].su, Moves[k].ac, Moves[k].re].join('/');
  r.untouched = [sig('special'), sig('staffSpecial'), sig('bossBlockParty'), sig('bossDockHaulIn'), sig('bossMarketToss'), sig('bossForgeQuake'), sig('bossShieldCharge'),
    [EnemySlams.overhead.windup, EnemySlams.overhead.active, EnemySlams.overhead.recovery].join('/'),
    [EnemyRushes.shoulder.crouch, EnemyRushes.shoulder.dash, EnemyRushes.shoulder.active, EnemyRushes.shoulder.whiffRecovery].join('/'),
    [EnemyBashes.shield.windup, EnemyBashes.shield.active, EnemyBashes.shield.whiffRecovery].join('/'),
    [EnemyGrabs.clinch.windup, EnemyGrabs.clinch.active, EnemyGrabs.clinch.whiffRecovery].join('/'),
    [EnemyDeploys.shockZone.windup, EnemyDeploys.shockZone.active, EnemyDeploys.shockZone.recovery].join('/'),
    [EnemyProjectile.tell, EnemyProjectile.recovery, EnemyProjectile.cooldown].join('/'),
    [Moves.punch.chainStun.join(','), Moves.kick.stun, Moves.staffPunch.stun, Moves.staffKick.stun].join('/')].join(' ');
  r.expectUntouched = '14/10/18 16/19/22 10/9/16 14/24/16 12/60/18 16/18/20 18/20/18 30/4/48 16/18/7/' + EnemyRushes.shoulder.whiffRecovery
    + ' 14/5/48 27/6/48 24/1/30 0.5/0.9/2.5 10,15,24,24/22/10/22';
  Game.mode = prev.mode;
  const exp = {
    'freehand punch0': '4/2/9', 'freehand punch1': '5/2/8', 'freehand punch2': '5/2/8', 'freehand punch3': '5/3/16', 'freehand kick': '9/3/16',
    'blade punch0': '7/3/12', 'blade punch1': '5/3/10', 'blade punch2': '5/3/10', 'blade kick': '10/4/16',
    'staff punch0': '17/4/29', 'staff punch1': '14/4/26', 'staff kick': '23/6/36',
  };
  r.expectOk = Object.entries(exp).every(([k, v]) => fr[k] === v);
  const followSu = Object.keys(fr).filter(k => /punch[1-9]/.test(k)).every(k => su(k) >= 5);
  // Class order kept: Karate fastest, Blade middle, Staff slowest (first punch, full string and kick totals).
  const string = c => Object.keys(fr).filter(k => k.startsWith(c + ' punch')).reduce((n, k) => n + tot(k), 0) / Object.keys(fr).filter(k => k.startsWith(c + ' punch')).length;
  r.order = { punch0: [tot('freehand punch0'), tot('blade punch0'), tot('staff punch0')], avgString: [string('freehand'), string('blade'), string('staff')], kick: [tot('freehand kick'), tot('blade kick'), tot('staff kick')] };
  const ord = a => a[0] < a[1] && a[1] < a[2];
  r.pass = r.liveSame && r.liveFrames > 0 && r.expectOk && followSu && ord(r.order.punch0) && ord(r.order.avgString) && ord(r.order.kick)
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
  r.laserOk = lf.su === 36 && lf.ac === 1 && lf.fired.length === 1 && lf.fired[0].frame === 37 && lf.dmg === expBolt && lf.depths[0] === .5
    && r.laserLaneLock.dmg === 0 && r.laserLaneLock.fired[0].result === 'miss' && r.laserEdge.dmg === expBolt;
  // --- Laser Lock phase 3: lines 0/.5/1 together for 0.6 s, then random order 0.25 s (15 f) apart, each 14px
  const orders = new Set(); let p3ok = true;
  for (let k = 0; k < 8; k++) {
    const o = laser(600, 0, 3, .5);
    orders.add(o.fired.map(f => f.depth).join(','));
    const frames = o.fired.map(f => f.frame);
    p3ok = p3ok && o.su === 36 && o.ac === 31 && o.togetherAtSu && o.depths.slice().sort().join(',') === '0,0.5,1' && frames.join(',') === '37,52,67'
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
  r.shadowFaceRight = shadow(1); r.shadowFaceLeft = shadow(-1); r.shadowLane = shadow(1, 15);
  const sr = r.shadowFaceRight, sl = r.shadowFaceLeft, expCut = +(16 * BH * DIFF).toFixed(6);
  r.shadowOk = sr.su === 30 && sr.tele && sr.tele.x === 610 && sl.tele.x === 790 && sr.hits.length === 1 && sr.hits[0].dmg === expCut && sl.hits.length === 1
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
  r.counterOk = cu.counter && cu.stance === 48 && cu.end === 48 && cu.hits.length === 0
    && cp.parryFrame > 0 && cp.parryFrame <= 48 && cp.bossDmg === 0 && cp.hits.length === 1 && cp.hits[0].dmg === expRip && cp.hits[0].frame === cp.parryFrame + 7;
  // AI: only a boss with a counter rolls for it (Math.random pinned low so the roll passes).
  const aiPick = stage => {
    setup(stage, 900, 820); e.f.meter = 0; e.ai.cool = 0; e.ai.mode = 'attack'; Math.random = () => .1;
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
  r.roadOk = rh.su === 36 && rh.bar && rh.bar.x === 620 && rh.bar.side === 1 && rh.bar.created === 37 && rh.barFrames === 240
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
  r.pass = r.profiles.join(' ') === 'crossbow/100/100/1.25/0.92/bossLaserLock/ naginata/200/200/1.28/0.92/bossShadowStep/kage girder/210/210/1.4/0.7/bossRoadblock/'
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
  for (let s = 2; s <= 10; s++) {
    BeatEmUp.stage = s;
    if (ch[s - 1].spawnLayouts || ch[s - 1].waves.some(w => w.spawns)) fallbackOk = false;
    for (const n of [1, 2, 3]) {
      const L = n === 2 ? OLD2 : OLD, defs = BeatEmUp.waveDefs(n);
      if (defs.length !== ch[s - 1].waves[n - 1].enemyFocus.length) fallbackOk = false;
      defs.forEach((d, i) => { checked++; if (d.kind !== ch[s - 1].waves[n - 1].enemyFocus[i] || d.ox !== L[i % 5][0] || d.depth !== L[i % 5][1] || Object.keys(d).join() !== 'kind,ox,depth') fallbackOk = false; });
    }
  }
  r.fallbackChecked = checked; r.fallbackOk = fallbackOk && checked === 81;
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
  // --- Attacker cap: 4 Stage-1 wave-3 enemies around the player; at most MAX_ATTACKERS (2) ever tell/attack at once
  BeatEmUp.stage = 1; Game.phase = 'fight'; Game.fighting = 1; Math.random = () => .01;
  const p = fighters[0]; p.reset(600, 1); player.f = p; player.depth = .5; p.hp = 1e4;
  BeatEmUp.cast = [player, ...['brawler', 'rusher', 'brawler', 'rusher'].map((k, i) => { const e = BeatEmUp.makeEnemy(k, 600 + (i % 2 ? 1 : -1) * (50 + 10 * i), .5); e.ai.cool = 0; return e; })];
  let maxAct = 0, sawTwo = false;
  for (let i = 0; i < 300; i++) {
    BeatEmUp.updateGroupAI(Game.STEP, player);
    const act = BeatEmUp.cast.filter(e => e.role === 'enemy' && (e.ai.tellT > 0 || e.f.atk)).length;
    maxAct = Math.max(maxAct, act); if (act === 2) sawTwo = true;
    BeatEmUp.cast.forEach(e => { if (e.role === 'enemy' && e.ai.tellT <= 0) e.ai.cool = 0; });
  }
  Math.random = prev.random;
  r.attackers = { cap: BeatEmUp.MAX_ATTACKERS, maxAct, sawTwo };
  r.capOk = BeatEmUp.MAX_ATTACKERS === 2 && maxAct === 2 && sawTwo;
  Object.assign(BeatEmUp, { stage: prev.stage, cast: prev.cast, cameraX: prev.cameraX, lockL: prev.lockL, lockR: prev.lockR, wave: prev.wave, waveSpawnQueue: prev.queue, waveSpawnTimer: prev.timer });
  Object.assign(Game, { arcadeLevel: prev.level, mode: prev.mode, phase: prev.phase, banner: prev.banner, bannerT: prev.bannerT, fighting: prev.fighting });
  r.pass = r.stage1Ok && r.stage1DefsOk && r.stage1SpawnedOk && r.fallbackOk && r.chainOk && r.stats === '110/0.95/jabCross/80/1.35/shoulder' && r.moveHash === '29a4f6df' && r.capOk;
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
    setup(stage, 900, 600, 1, phase); start(kind); const o = { key: Object.keys(Moves).find(k => Moves[k].su === e.f.atk.su && Moves[k].re === e.f.atk.re && Moves[k].ac === e.f.atk.ac && k.startsWith(stage === 9 ? 'bossDirector' : 'bossChief')), weapon: e.f.weaponType };
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
  r.broadcastOk = bs.su === 30 && bs.key === 'bossLiveBroadcast' && bs.glitchDuringSu && !bs.glitchAfter && bs.markFrame === 31 && bs.spots.length === 3
    && bs.spots.map(s => s.x).join(',') === '700,550,850' && bs.spots.every(s => s.depth === .5 && s.fireAt - s.markedAt === 42)
    && bs.fired.length === 3 && bs.fired.every(f => f.frame === 73) && bs.fired.filter(f => f.result === 'hit').length === 1 && near(bs.dmg, expL) && bs.stunAfter === 18
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
    o.ok = o.key === key && o.su === (key === 'bossLaserLock' ? BossSignatures.bossLaserLock.lockFrames : Moves[key].su) && o.eff && o.done;
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
  r.finaleOk = fin.key === 'bossColiseumFinale' && fin.su === 30 && fin.ac === 35
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
  r.pass = r.profiles.join(' ') === 'shockBaton/115/115/1.3/0.92/bossLiveBroadcast/shockBaton twinBlades/110/110/1.35/0.92/bossColiseumFinale/twinBlades'
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
    && tl.su === 14 && tl.ac === 5 && tl.re === 48 && tl.total === 67
    && w.hits.length === 0 && w.frames === 67 && w.live === '15-19' && Math.abs(w.travelled - sp.step) < 1e-6 && w.faces.length === 1 && w.profileFree && !w.chain
    && r.bashFlip.hits.length === 0 && r.bashFlip.faces.length === 1 && r.bashProbe.windBlock === true && r.bashProbe.recBlock === false
    && hitsAll.length >= 3 && r.sweep.every(o => o.pf && o.n <= 1 && o.travelled <= sp.step + 1e-6)
    && hitsAll.every(o => o.frame >= tl.su + 1 && o.frame <= tl.su + tl.ac && Math.abs(o.dmg - rookiePunch) < 1e-6 && o.frames === o.frame + sp.hitRecovery);
  return r;
}
"""

def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p

def main():
    port = free_port()
    srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', str(ROOT)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.7)
    url = f'http://127.0.0.1:{port}/index.html'
    failures = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={'width': 844, 'height': 390})
            page.add_init_script(INIT_SCRIPT)
            page.goto(url, wait_until='load')
            page.wait_for_function("typeof Game !== 'undefined' && Game.canvas")
            page.wait_for_timeout(100)
            for fn in (FREEZE,):
                page.evaluate(fn)
            page.evaluate(SEED_RNG, SEED); page.evaluate(SETUP); page.evaluate(FREEZE)
            results = {}
            for lv in LEVELS:
                page.evaluate(SEED_RNG, SEED)
                results[lv] = [page.evaluate(SIM, lv) for _ in range(ROUNDS)]
            flat = [[lv, r['winner'], round(r['hp'][0], 6), round(r['hp'][1], 6), r['rng']] for lv in LEVELS for r in results[lv]]
            digest = hashlib.sha256(json.dumps(flat, separators=(',', ':')).encode()).hexdigest()
            wins = {lv: {'player': sum(r['winner'] == 0 for r in results[lv]), 'cpu': sum(r['winner'] == 1 for r in results[lv])} for lv in LEVELS}
            print('parity digest', digest); print('wins', json.dumps(wins))
            if '--update-baseline' in sys.argv:
                BASELINE.write_text(json.dumps({'seed': hex(SEED), 'rounds_per_level': ROUNDS, 'digest': digest, 'wins': wins}, indent=2) + '\n')
                print('baseline updated')
            else:
                base = json.loads(BASELINE.read_text())
                if base['digest'] != digest:
                    failures.append(f"parity digest {digest} != baseline {base['digest']} (baseline wins {base['wins']}, now {wins})")
            staff_aoe = page.evaluate(STAFF_AOE)
            print('staff AoE harness', json.dumps(staff_aoe))
            if not staff_aoe['pass']:
                failures.append('Staff AoE harness failed: expected all in-radius positions to take 24 per spin, per-pulse dedupe, off-lane/outside misses, symmetric facing, and Slam-only knockdown')
            lane_cov = page.evaluate(LANE_COVERAGE)
            print('special lane coverage', json.dumps(lane_cov))
            if not lane_cov['pass']:
                failures.append('Special lane coverage failed: expected player Staff 5 lanes at full X reach, Blade/Karate 3 lanes, CPU unchanged, 1v1 lane 36px')
            brawler = page.evaluate(BRAWLER)
            print('brawler archetype', json.dumps({k: v for k, v in brawler.items() if k != 'pass'}))
            if not brawler['pass']:
                failures.append('Brawler archetype failed: expected 110hp stage/difficulty-scaled, 0.95 speed, fists only, ROOKIE hurtbox, no profile on existing archetypes (draw unchanged), jab-cross = 2 hits totalling one ROOKIE punch, Stage 1 brawlers and the Stage 2-3 ROOKIE->brawler swaps (2 of 5) in place')
            rusher = page.evaluate(RUSHER)
            print('rusher archetype', json.dumps({k: v for k, v in rusher.items() if k not in ('pass', 'sweep')}))
            if not rusher['pass']:
                print('rusher sweep', json.dumps(rusher['sweep']))
                failures.append('Rusher archetype failed: expected 80hp stage-scaled, 1.35 speed, no weapon, RUNNER fully replaced (21 rusher spawns after Stage 1), ROOKIE hurtbox, draw-only profile, 16f crouch + 18f/156px dash with hitbox only on the last 7 dash frames, 18px brake + 42f whiff recovery, locked direction, one-ROOKIE-punch hit that stops the dash')
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
            if not grappler['pass'] or 'grappler' in stage_src:
                print('grappler sweep', json.dumps(grappler['sweep']))
                failures.append('Grappler archetype failed: expected 115hp stage-scaled, 0.9 speed, no weapon, no stage spawns, ROOKIE hurtbox, draw-only long-arm open-hand profile, grab only within reach and the same-lane tolerance, no grab on invulnerable/rolling/airborne/stunned players, wind-up hit cancels it, 27f wind-up -> 30f hold -> headbutt release -> 24f recovery, release on Grappler hit/death, held player immune to others, 1.5 s no-regrab, 0.8 s miss recovery, AI GRAB tell gated by cooldown')
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
                failures.append('Stage 1 failed: expected waves brawler,brawler / brawler,rusher,brawler / brawler,rusher,brawler,rusher with no kunai/bruiser text and the Block Captain unchanged, Stage 1 spawns read from its wave "spawns" (and actually spawned there), stages 2-10 reproducing the old built-in layouts for all 81 slots, wave -> stage[n] -> stage default -> built-in per-field fallback with 0-1 clamping, Brawler/Rusher stats and moves unchanged, and at most 2 simultaneous attackers')
            boss_b2b = page.evaluate(BOSS_B2B)
            print('boss b2b', json.dumps({k: v for k, v in boss_b2b.items() if k not in ('pass', 'bcStay', 'bcGap', 'bcSide', 'bcLane', 'bcEdge')}))
            if not boss_b2b['pass']:
                print('boss b2b broadcast', json.dumps({k: boss_b2b.get(k) for k in ('bcStay', 'bcGap', 'bcSide', 'bcLane', 'bcEdge')}))
                failures.append('Boss B2 PR B failed: expected stage 9-10 profiles (shock baton 115 / twin blades 110 -> sledgehammer 150 -> gauntlets 90 by phase, x1.3 paced normals, hitbox at the weapon tip), Director hits stun 18 f, Live Broadcast 0.5 s glitch tell + 3 spots at player x/-150/+150 in the player lane + lightning 42 f later for 14 (40px / 14px windows), Chief phase-2 replay of 3 distinct stage 1-9 signatures then the Finale (each replay runs), Coliseum Finale 0.5 s tell 10/10/12/14/24 with knockdown on the last hit only, and a draw-only boss cue')
            pacing = page.evaluate(PACING)
            print('pacing pass', json.dumps({k: v for k, v in pacing.items() if k != 'pass'}))
            if not pacing['pass']:
                failures.append('Pacing pass failed: expected class normals at the x1.3 startup/recovery tables (active unchanged, follow-ups >= 5f after attackSpeed), Karate < Blade < Staff, blend floor .08 outside active frames with identical strike boxes/combat bones on every active frame vs the old .04 floor, accel 1000 / brake 1400 / turn 1700, and supers, SLAM, enemy specials, boss signatures, ranged timings and stun unchanged')
            ranged = page.evaluate(RANGED)
            print('ranged archetype', json.dumps({k: v for k, v in ranged.items() if k != 'pass'}))
            if not ranged['pass'] or '"thrower"' in stage_src:
                failures.append('Ranged archetype failed: expected THROWER fully renamed (0 authored ranged spawns after Stage 1), 65hp stage-scaled and unchanged projectile numbers, ROOKIE hurtbox, draw-only hooded profile with pouch, no head label, aim pose held, release pose on exactly the kunai spawn frame, kunai leaves the hand on release, same-lane hit once, lane change / sidestep avoid it, no homing')
            blade_super = page.evaluate(BLADE_SUPER)
            print('blade Super harness', json.dumps(blade_super))
            if not blade_super['pass']:
                failures.append('Blade Super harness failed: expected 24/3/3/3/24-frame sequence, 20/24/30 independent damage, piercing, lane lock, and Noto timing')
            page.close()
            for (w, h) in [(667, 375), (844, 390)]:
                pg = browser.new_page(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, device_scale_factor=2)
                pg.goto(url, wait_until='load'); pg.wait_for_function("typeof Game !== 'undefined' && Game.canvas"); pg.wait_for_timeout(200)
                r = pg.evaluate(CLEARANCE)
                print(f'clearance {w}x{h}', json.dumps(r))
                for i, g in enumerate(r['gap1v1']):
                    if g < CLEAR_PX: failures.append(f'{w}x{h} 1v1 fighter {i} is {g:.2f}px from a control (min {CLEAR_PX})')
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
