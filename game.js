class Input {
  static keys = new Set();
  static pad = [{}, {}];
  static was = [{}, {}];
  static acts = ['left','right','jump','punch','kick','block'];
  static keyMap = [
    {left:['a','A','ArrowLeft'], right:['d','D','ArrowRight'], jump:['w','W','ArrowUp',' '], punch:['j','J'], kick:['k','K'], block:['l','L']},
    {left:[], right:[], jump:[], punch:[], kick:[], block:[]},
  ];
  static bind() {
    Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    const on = (e, down) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      down ? Input.keys.add(e.key) : Input.keys.delete(e.key);
      if (Game.over && down) Game.restart();
    };
    addEventListener('keydown', e => on(e, 1));
    addEventListener('keyup', e => on(e, 0));
    addEventListener('blur', () => { Input.keys.clear(); Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0)); });
    addEventListener('pointerdown', () => { if (Game.over) Game.restart(); });
    document.querySelectorAll('#controls button[data-k]').forEach(btn => {
      const set = v => {
        const k = btn.dataset.k;
        if (Input.acts.includes(k)) { Input.pad[+btn.dataset.p][k] = v; btn.classList.toggle('held', !!v); }
      };
      btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); set(1); });
      const end = e => { e.preventDefault(); set(0); };
      btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', e => { if (e.buttons) set(0); });
    });
  }
  static held(p, a) { return Input.keyMap[p][a].some(k => Input.keys.has(k)) || !!Input.pad[p][a]; }
  static edge(p, a) {
    const on = Input.held(p, a), e = on && !Input.was[p][a];
    Input.was[p][a] = on ? 1 : 0; return e;
  }
}

class Atk {
  static punch = {su:4, ac:4, re:10, dmg:5, kb:180, stun:10};
  static kick = {su:7, ac:5, re:16, dmg:9, kb:260, stun:14};
}

class Pose {
  static idle() { return {torso:0,la:-.4,le:-.2,ra:.4,re:.2,ll:.15,lk:.1,rl:-.15,rk:-.1}; }
  static walk(t) {
    const s = Math.sin(t * 10) * .55, c = Math.cos(t * 10) * .35;
    return {torso:0,la:-.5+c*.2,le:-.3,ra:.5-c*.2,re:.3,ll:s,lk:Math.max(0,s)*.6,rl:-s,rk:Math.max(0,-s)*.6};
  }
  static jump() { return {torso:-.05,la:-2.6,le:-.5,ra:2.6,re:.5,ll:.9,lk:1.1,rl:-.9,rk:1.1}; }
  static punch() { return {torso:.15,la:-.5,le:-.2,ra:1.55,re:.2,ll:.2,lk:.1,rl:-.2,rk:.1}; }
  static kick() { return {torso:-.15,la:-.6,le:-.2,ra:.5,re:.2,ll:1.55,lk:.2,rl:-.25,rk:.2}; }
  static block() { return {torso:-.05,la:.9,le:1.2,ra:.7,re:1.1,ll:.2,lk:.15,rl:-.2,rk:.15}; }
  static hit() { return {torso:-.2,la:-1.2,le:-.4,ra:-1,re:-.3,ll:.3,lk:.2,rl:-.4,rk:.3}; }
}

class Bot {
  static wait = 0; static mode = 'in'; static cool = 0; static react = 0; static plan = ''; static blockT = 0;
  static update(dt, me, foe) {
    const p = Input.pad[1];
    Input.acts.forEach(a => p[a] = 0);
    Bot.wait -= dt; Bot.cool -= dt; Bot.react -= dt; Bot.blockT -= dt;
    if (Game.over || me.stun > 0 || me.atk) return;
    if (Bot.blockT > 0) { p.block = 1; return; }
    if (Bot.react > 0) return;
    if (Bot.plan === 'block') { Bot.blockT = .35 + Math.random() * .35; Bot.plan = ''; return; }
    if (Bot.plan) { p[Bot.plan] = 1; Bot.plan = ''; Bot.cool = .4 + Math.random() * .8; return; }
    if (Bot.wait > 0) return;
    const dx = foe.x - me.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
    if (foe.atk && dist < 130 && Math.random() < .5) { Bot.plan = 'block'; Bot.react = .1 + Math.random() * .2; return; }
    if (Bot.cool <= 0 && dist < 95) { Bot.plan = 'punch'; Bot.react = .15 + Math.random() * .25; return; }
    if (Bot.cool <= 0 && dist < 160) { Bot.plan = 'kick'; Bot.react = .18 + Math.random() * .28; return; }
    if (Bot.mode === 'in' && dist <= 150) { Bot.mode = 'out'; Bot.wait = .15 + Math.random() * .2; return; }
    if (Bot.mode === 'out' && dist >= 210) { Bot.mode = 'in'; Bot.wait = .12 + Math.random() * .2; return; }
    if (Bot.mode === 'in') { if (dir < 0) p.left = 1; else p.right = 1; }
    else { if (dir < 0) p.right = 1; else p.left = 1; }
    if (Bot.cool <= 0 && Math.random() < .01) { p.jump = 1; Bot.cool = .9 + Math.random() * .8; }
  }
}

class Fighter {
  static S = 1.5;
  constructor(x, color, side, tag) {
    this.color = color; this.tag = tag; this.reset(x, side);
  }
  reset(x, side) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = side;
    this.grounded = true; this.state = 'idle'; this.pose = Pose.idle(); this.walkT = 0;
    this.hp = 100; this.chip = 100; this.stun = 0; this.flash = 0; this.blocking = 0;
    this.atk = null; this.atkT = 0; this.hitDone = 0;
    this.hitbox = {x:0,y:0,w:42,h:135};
  }
  bones() {
    const s = Fighter.S, g = Game.GROUND + this.y, f = this.face, p = this.pose, hr = Game.hr, hw = Game.lw / 2;
    const hip = {x:this.x, y:g - 40 * s}, sh = {x:this.x + p.torso * 6 * s * f, y:hip.y - 36 * s};
    const head = {x:sh.x, y:sh.y - hr}, pts = [hip, sh, head];
    const end = (o, len, a1, a2) => {
      const j = {x:o.x + Math.sin(a1) * len, y:o.y + Math.cos(a1) * len};
      const e = {x:j.x + Math.sin(a1 + a2) * len, y:j.y + Math.cos(a1 + a2) * len};
      pts.push(j, e); return e;
    };
    const la = end(sh, 18 * s, p.la * f, p.le * f), ra = end(sh, 18 * s, p.ra * f, p.re * f);
    const ll = end(hip, 20 * s, p.ll * f, p.lk * f), rl = end(hip, 20 * s, p.rl * f, p.rk * f);
    let x0 = Infinity, x1 = -Infinity, y0 = head.y - hr, y1 = -Infinity;
    for (const q of pts) { x0 = Math.min(x0, q.x - hw); x1 = Math.max(x1, q.x + hw); y0 = Math.min(y0, q.y - hw); y1 = Math.max(y1, q.y + hw); }
    return {hip, sh, head, hr, la, ra, ll, rl, x0, x1, y0, y1};
  }
  startAtk(kind) {
    this.atk = Atk[kind]; this.atkT = 0; this.hitDone = 0; this.state = kind; this.blocking = 0;
  }
  update(dt, other, slot) {
    if (this.flash > 0) this.flash -= dt;
    if (this.chip > this.hp) this.chip = Math.max(this.hp, this.chip - (100 * dt / .3));
    if (this.hp <= 0) { this.state = 'ko'; this.pose = Pose.hit(); this.vx *= .9; this.x += this.vx * dt; return; }
    if (this.stun > 0) {
      this.stun--; this.vx *= .92; this.x += this.vx * dt; this.vy += 1600 * dt; this.y += this.vy * dt;
      if (this.y >= 0) { this.y = 0; this.vy = 0; }
      this.pose = Pose.hit(); this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    if (this.atk) {
      this.atkT++;
      const a = this.atk, tot = a.su + a.ac + a.re;
      this.pose = this.state === 'kick' ? Pose.kick() : Pose.punch();
      this.vx = 0; this.vy += 1600 * dt; this.y += this.vy * dt;
      if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
      if (this.atkT >= tot) { this.atk = null; this.state = 'idle'; }
      this.face = other.x >= this.x ? 1 : -1; this.clamp(other); return;
    }
    this.blocking = Input.held(slot, 'block') && this.grounded ? 1 : 0;
    if (this.blocking) {
      this.vx = 0; this.pose = Pose.block(); this.state = 'block';
      this.face = other.x >= this.x ? 1 : -1; this.clamp(other); return;
    }
    let ax = 0;
    if (Input.held(slot, 'left')) ax -= 1;
    if (Input.held(slot, 'right')) ax += 1;
    this.vx = ax * 220;
    if (ax && this.grounded) { this.walkT += dt; this.state = 'walk'; }
    else if (this.grounded) { this.walkT = 0; this.state = 'idle'; }
    if (Input.edge(slot, 'jump') && this.grounded) { this.vy = -520; this.grounded = false; this.state = 'jump'; }
    if (this.grounded && Input.edge(slot, 'punch')) this.startAtk('punch');
    else if (this.grounded && Input.edge(slot, 'kick')) this.startAtk('kick');
    if (this.atk) { this.pose = this.state === 'kick' ? Pose.kick() : Pose.punch(); this.clamp(other); return; }
    this.vy += 1600 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; if (this.state === 'jump') this.state = 'idle'; }
    else this.state = 'jump';
    this.face = other.x >= this.x ? 1 : -1;
    this.pose = this.state === 'jump' ? Pose.jump() : this.state === 'walk' ? Pose.walk(this.walkT) : Pose.idle();
    this.clamp(other);
  }
  clamp() {
    this.x = Math.max(Game.minX, Math.min(Game.maxX, this.x));
    const b = this.bones(), relL = this.x - b.x0, relR = b.x1 - this.x, sc = Game.scale, ox = Game.ox, c = 8;
    let lo = Game.minX, hi = Game.maxX;
    for (const btn of Game.btns) {
      if (Game.oy + b.y0 * sc >= btn.y + btn.h + c || Game.oy + b.y1 * sc <= btn.y - c) continue;
      if (btn.x + btn.w / 2 < innerWidth / 2) lo = Math.max(lo, (btn.x + btn.w + c - ox) / sc + relL);
      else hi = Math.min(hi, (btn.x - c - ox) / sc - relR);
    }
    if (lo <= hi) this.x = Math.max(lo, Math.min(hi, this.x));
    this.hitbox.x = this.x - 21; this.hitbox.y = Game.GROUND + this.y - 135; this.hitbox.w = 42; this.hitbox.h = 135;
  }
  strike() {
    if (!this.atk || this.hitDone) return null;
    const a = this.atk;
    if (this.atkT <= a.su || this.atkT > a.su + a.ac) return null;
    const b = this.bones(), tip = this.state === 'kick' ? b.ll : b.ra;
    return {x:tip.x - 18, y:tip.y - 18, w:36, h:36, dmg:a.dmg, kb:a.kb, stun:a.stun};
  }
  takeHit(atk, from) {
    const frontal = (from.x - this.x) * this.face > 0;
    if (this.blocking && frontal) {
      this.hp = Math.max(0, this.hp - atk.dmg * .2); this.flash = .08;
      this.vx = Math.sign(this.x - from.x) * atk.kb * .25; return 'block';
    }
    this.hp = Math.max(0, this.hp - atk.dmg); this.stun = atk.stun; this.flash = .08;
    this.vx = Math.sign(this.x - from.x) * atk.kb; this.atk = null; this.blocking = 0;
    this.state = 'hit'; return 'hit';
  }
  draw(ctx) {
    const b = this.bones(), p = this.pose, s = Fighter.S;
    const col = this.flash > 0 ? '#FFFFFF' : this.color;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Game.lw; ctx.lineCap = 'round';
    const f = this.face;
    Fighter.limb(ctx, b.sh, 18 * s, p.la * f, p.le * f); Fighter.limb(ctx, b.sh, 18 * s, p.ra * f, p.re * f);
    Fighter.limb(ctx, b.hip, 20 * s, p.ll * f, p.lk * f); Fighter.limb(ctx, b.hip, 20 * s, p.rl * f, p.rk * f);
    ctx.beginPath(); ctx.moveTo(b.hip.x, b.hip.y); ctx.lineTo(b.sh.x, b.sh.y); ctx.lineTo(b.head.x, b.head.y + b.hr); ctx.stroke();
    ctx.beginPath(); ctx.arc(b.head.x, b.head.y, b.hr, 0, Math.PI * 2); ctx.fill();
    if (this.blocking) {
      ctx.strokeStyle = this.color; ctx.globalAlpha = .6; ctx.lineWidth = 2;
      const cx = this.x + this.face * 28, cy = b.sh.y + 10;
      ctx.beginPath(); ctx.arc(cx, cy, 26, -1.2 + (this.face > 0 ? 0 : Math.PI), 1.2 + (this.face > 0 ? 0 : Math.PI)); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = Game.lw;
    }
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.tag, b.head.x, b.y0 - 12 / Game.scale);
  }
  static limb(ctx, o, len, a1, a2) {
    const j = {x:o.x + Math.sin(a1) * len, y:o.y + Math.cos(a1) * len};
    const e = {x:j.x + Math.sin(a1 + a2) * len, y:j.y + Math.cos(a1 + a2) * len};
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(j.x, j.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  }
}

var fighters = [new Fighter(0, '#3B82F6', 1, 'YOU'), new Fighter(0, '#EF4444', -1, 'CPU')];

class Game {
  static W = 960; static H = 540; static GROUND = 390; static STEP = 1 / 60;
  static minX = 192; static maxX = 768; static scale = 1; static ox = 0; static oy = 0;
  static hr = 16.5; static lw = 6; static btns = []; static over = 0;
  static stop = 0; static shake = 0; static shMag = 0;
  static canvas; static ctx; static acc = 0; static last = 0;
  static init() {
    Game.canvas = document.getElementById('game'); Game.ctx = Game.canvas.getContext('2d');
    Input.bind(); Game.restart(); Game.fit(); addEventListener('resize', () => Game.fit());
    Game.last = performance.now(); requestAnimationFrame(Game.frame);
  }
  static restart() {
    Game.over = 0; Game.stop = 0; Game.shake = 0;
    fighters[0].reset(Game.W * .35, 1); fighters[1].reset(Game.W * .65, -1);
    Bot.wait = 0; Bot.mode = 'in'; Bot.cool = .5; Bot.react = 0; Bot.plan = ''; Bot.blockT = 0;
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
  }
  static fit() {
    const dpr = Math.max(1, devicePixelRatio || 1);
    Game.H = 540; Game.W = Math.max(640, Math.round(540 * innerWidth / innerHeight));
    Game.GROUND = Math.round(Game.H * .72);
    const scale = innerHeight / Game.H;
    Game.scale = scale; Game.ox = 0; Game.oy = 0;
    Game.hr = Math.max(16.5, 13.2 / scale); Game.lw = Math.max(6, 4.1 / scale);
    Game.canvas.style.width = innerWidth + 'px'; Game.canvas.style.height = innerHeight + 'px';
    Game.canvas.width = Math.round(innerWidth * dpr); Game.canvas.height = Math.round(innerHeight * dpr);
    Game.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const lane = innerWidth < 740 ? .2 : .15;
    Game.minX = Game.W * lane; Game.maxX = Game.W * (1 - lane);
    if (!Game.over) { fighters[0].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[0].x || Game.W * .35));
      fighters[1].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[1].x || Game.W * .65)); }
    Game.btns = [...document.querySelectorAll('#controls button')].map(el => {
      const r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height};
    });
  }
  static hitTest(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  static resolve() {
    for (let i = 0; i < 2; i++) {
      const me = fighters[i], foe = fighters[i ^ 1], box = me.strike();
      if (!box || foe.hp <= 0) continue;
      if (!Game.hitTest(box, foe.hitbox)) continue;
      me.hitDone = 1;
      const kind = foe.takeHit(box, me);
      Game.stop = .06; Game.shake = .12; Game.shMag = 4;
      if (foe.hp <= 0) Game.over = 1;
      if (kind === 'hit') foe.vy = -120;
    }
  }
  static frame(now) {
    let dt = (now - Game.last) / 1000; Game.last = now; if (dt > .05) dt = .05;
    if (Game.shake > 0) Game.shake -= dt;
    if (Game.stop > 0) { Game.stop -= dt; Game.draw(); requestAnimationFrame(Game.frame); return; }
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      if (!Game.over) {
        Bot.update(Game.STEP, fighters[1], fighters[0]);
        // edge-sample bot punch/kick once per step
        if (Input.pad[1].punch) { Input.was[1].punch = 0; }
        if (Input.pad[1].kick) { Input.was[1].kick = 0; }
        fighters[0].update(Game.STEP, fighters[1], 0);
        fighters[1].update(Game.STEP, fighters[0], 1);
        Game.resolve();
      } else {
        fighters.forEach(f => { if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * Game.STEP / .3); });
      }
      Game.acc -= Game.STEP;
    }
    Game.draw(); requestAnimationFrame(Game.frame);
  }
  static bars(ctx) {
    const sc = Game.scale, safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-t'))||0,
      top = (12 + safe) / sc, h = 12 / sc, gap = 16 / sc, w = Game.W * .4;
    const x0 = (Game.W - 2 * w - gap) / 2, x1 = x0 + w + gap;
    const drawBar = (x, fill, chip, fromLeft, label) => {
      ctx.fillStyle = '#2A2D35'; ctx.strokeStyle = '#0E0F12'; ctx.lineWidth = 2 / sc;
      ctx.fillRect(x, top, w, h); ctx.strokeRect(x, top, w, h);
      const cw = w * (chip / 100), fw = w * (fill / 100);
      ctx.fillStyle = 'rgba(245,245,245,.6)';
      if (fromLeft) ctx.fillRect(x, top, cw, h); else ctx.fillRect(x + w - cw, top, cw, h);
      ctx.fillStyle = fromLeft ? '#3B82F6' : '#EF4444';
      if (fromLeft) ctx.fillRect(x, top, fw, h); else ctx.fillRect(x + w - fw, top, fw, h);
      ctx.font = 'bold ' + 12 / sc + 'px system-ui,sans-serif';
      ctx.textAlign = fromLeft ? 'left' : 'right'; ctx.textBaseline = 'middle';
      const lx = fromLeft ? x + 6 / sc : x + w - 6 / sc, ly = top + h / 2;
      ctx.lineJoin = 'round'; ctx.lineWidth = 3 / sc; ctx.strokeStyle = '#0E0F12';
      ctx.strokeText(label, lx, ly); ctx.fillStyle = '#FFFFFF'; ctx.fillText(label, lx, ly);
      ctx.textBaseline = 'alphabetic';
    };
    drawBar(x0, fighters[0].hp, fighters[0].chip, 1, 'YOU');
    drawBar(x1, fighters[1].hp, fighters[1].chip, 0, 'CPU');
  }
  static draw() {
    const ctx = Game.ctx;
    ctx.setTransform(Math.max(1, devicePixelRatio || 1) * Game.scale, 0, 0, Math.max(1, devicePixelRatio || 1) * Game.scale, 0, 0);
    let sx = 0, sy = 0;
    if (Game.shake > 0) { const m = Game.shMag * (Game.shake / .12); sx = (Math.random() - .5) * 2 * m; sy = (Math.random() - .5) * 2 * m; }
    ctx.clearRect(-10, -10, Game.W + 20, Game.H + 20);
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(0, 0, Game.W, Game.H);
    ctx.fillStyle = '#2a2a35'; ctx.fillRect(0, Game.GROUND, Game.W, Game.H - Game.GROUND);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, Game.GROUND); ctx.lineTo(Game.W, Game.GROUND); ctx.stroke();
    fighters.forEach(f => f.draw(ctx));
    ctx.restore();
    Game.bars(ctx);
    if (Game.over) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold 48px system-ui,sans-serif'; ctx.fillText('KO', Game.W / 2, Game.H * .42);
      ctx.font = '16px system-ui,sans-serif'; ctx.fillText('Tap to restart', Game.W / 2, Game.H * .42 + 36);
    }
  }
}

Game.init();
