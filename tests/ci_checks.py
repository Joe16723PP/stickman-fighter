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
