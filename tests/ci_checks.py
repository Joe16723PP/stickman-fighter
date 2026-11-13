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
  owner.depth = target.depth = .5; owner.meter = 100; owner.startAtk('special');
  owner.face = 1; owner.pose = Pose.specialDash(owner.classProfile); owner.poseFrom = owner.poseTo = owner.pose;
  owner.blendT = owner.blendDur = 0;
  const overlap = box => {
    const seg=box.segment, x=(seg.x1+seg.x2)/2, y=(seg.y1+seg.y2)/2;
    target.hitbox={x:x-5,y:y-5,w:10,h:10};
  };
  owner.atkT = owner.atk.su + 1;
  const quick = owner.strike();
  if (!quick) return {pass:false,debug:{state:owner.state,atkT:owner.atkT,atk:owner.atk,weapon:owner.classProfile?.weapon,meter:owner.meter,pulse:owner.superPulse()}};
  overlap(quick); Game.resolve(); const afterQuick = target.hp;
  Game.resolve(); const afterQuickDuplicate = target.hp;
  owner.atkT = owner.atk.su + BladeSuper.QUICK_DRAW_FRAMES + 1;
  const pause = owner.strike();
  owner.atkT = owner.atk.su + BladeSuper.QUICK_DRAW_FRAMES + BladeSuper.PAUSE_FRAMES + 1;
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
  const offLaneTarget = new Fighter(Game.W*.82,'#EF4444',-1,'OFF LANE'); offLaneTarget.reset(Game.W*.82,-1); offLaneTarget.depth=Math.min(1,locked.depth+.5);
  const offLaneHp=offLaneTarget.hp;
  const lateWaveTarget = new Fighter(Game.W*.85,'#EF4444',-1,'LATE WAVE'); lateWaveTarget.reset(Game.W*.85,-1); lateWaveTarget.depth=locked.depth;
  target.x = Game.W * .95; pierceTarget.x = wave.startX + 75; offLaneTarget.x = wave.startX + 125; lateWaveTarget.x = wave.startX + 350;
  fighters.push(pierceTarget,offLaneTarget,lateWaveTarget);
  for (let i=0;i<8;i++) BladeSuper.update(Game.STEP);
  const piercedDuringTravel = pierceTarget.hp===70 && offLaneTarget.hp===offLaneHp;
  BladeSuper.hit(sequence,pierceTarget,true); BladeSuper.hit(sequence,offLaneTarget,true);
  owner.atkT=owner.atk.su+owner.atk.ac+owner.atk.re;
  BladeSuper.noto(sequence);
  const notoKnockdown=sequence.notoDone && target.ragdollActive;
  for (let i=0;i<16;i++) BladeSuper.update(Game.STEP);
  const frameProbe = {
    charge:owner.atk.su, quickDraw:BladeSuper.QUICK_DRAW_FRAMES, pause:BladeSuper.PAUSE_FRAMES,
    vertical:BladeSuper.VERTICAL_SLASH_FRAMES, recovery:owner.atk.re, noto:BladeSuper.NOTO_FRAME,
    total:owner.atk.su+owner.atk.ac+owner.atk.re,
    pulseAt:[24,25,27,28,30,31,33,34].map(f=>BladeSuper.pulseForFrame(f)),
  };
  return {
    frameProbe, quick:quick&&{pulse:quick.pulse,damage:quick.dmg}, pause:pause===null,
    vertical:vertical&&{pulse:vertical.pulse,damage:vertical.dmg,vertical:vertical.segment.y2>vertical.segment.y1},
    launchAt, wave:launched, locked, hp:{afterQuick,afterQuickDuplicate,afterVertical,afterVerticalDuplicate,afterWave,afterWaveDuplicate},
    piercing: piercedDuringTravel && pierceTarget.hp===70, offLane:offLaneTarget.hp===offLaneHp,
    notoKnockdown, lateWave:lateWaveTarget.hp===70,
    pass:frameProbe.charge===24 && frameProbe.quickDraw===3 && frameProbe.pause===3 && frameProbe.vertical===3
      && frameProbe.recovery===24 && frameProbe.noto===57 && frameProbe.total===57
      && frameProbe.pulseAt.join(',')==='-1,0,0,-1,-1,1,1,-1'
      && quick?.pulse===0 && quick?.dmg===20 && pause===null
      && vertical?.pulse===1 && vertical?.dmg===24 && vertical.segment.y2>vertical.segment.y1
      && launchAt===31 && locked.face===1 && locked.depth===.5 && locked.x===Game.W*.35
      && launched?.face===locked.face && launched?.depth===locked.depth && launched.travel===15
      && afterQuick===80 && afterQuickDuplicate===80 && afterVertical===56 && afterVerticalDuplicate===56
      && afterWave===26 && afterWaveDuplicate===26 && pierceTarget.hp===70 && offLaneTarget.hp===offLaneHp
      && notoKnockdown && lateWaveTarget.hp===70 && BladeSuper.RANGE===420,
  };
}'''

STAFF_AOE = '''() => {
  const out = {orientations:[]};
  Game.mode = 'beatemup'; Game.phase = 'fight'; Game.fighting = 1;
  BeatEmUp.baseS = 1.5; BeatEmUp.worldMax = Game.W * 4.2; BeatEmUp.cameraX = 0;
  BeatEmUp.stageOver = 0; BeatEmUp.cast = []; BeatEmUp.score = 0; BeatEmUp.combo = 0; BeatEmUp.comboT = 0;
  Game.minX = 0; Game.maxX = BeatEmUp.worldMax; Game.stop = 0; Game.shake = 0;
  Game.GROUND = Game.H * .72;
  const laneStep = BeatEmUp.DEPTH_HIT_PX / (Game.H * (BeatEmUp.BAND_BOT - BeatEmUp.BAND_TOP));
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
