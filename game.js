/* Difficulty tuning table — single source of truth */
const Diff = {
  easy:   { react: 0.40, block: 0.15, punish: 0.20, special: 0.08, mistake: 0.38, aggro: 0.28, cool: 1.05 },
  normal: { react: 0.25, block: 0.35, punish: 0.50, special: 0.40, mistake: 0.12, aggro: 0.62, cool: 0.55 },
  hard:   { react: 0.15, block: 0.55, punish: 1.00, special: 0.75, mistake: 0.03, aggro: 0.92, cool: 0.32 },
};

class Input {
  static keys = new Set();
  static pad = [{}, {}];
  static was = [{}, {}];
  static acts = ['left','right','jump','punch','kick','block','special'];
  static keyMap = [
    {left:['a','A','ArrowLeft'], right:['d','D','ArrowRight'], jump:['w','W','ArrowUp',' '], punch:['j','J'], kick:['k','K'], block:['l','L'], special:['i','I']},
    {left:[], right:[], jump:[], punch:[], kick:[], block:[], special:[]},
  ];
  static bind() {
    Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    const on = (e, down) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      down ? Input.keys.add(e.key) : Input.keys.delete(e.key);
      if (down && Game.phase === 'title') { Game.tryTitleKey(e.key); return; }
      if (Game.matchOver && down) Game.goTitle();
    };
    addEventListener('keydown', e => on(e, 1));
    addEventListener('keyup', e => on(e, 0));
    addEventListener('blur', () => { Input.keys.clear(); Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0)); });
    addEventListener('pointerdown', e => {
      if (Game.phase === 'title') { Game.titlePointer(e); return; }
      if (Game.matchOver) Game.goTitle();
    });
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
  static special = {su:8, ac:12, re:14, dmg:20, chip:5, kb:340, stun:20};
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
  static special() { return {torso:-.25,la:-1.1,le:-.4,ra:.8,re:.3,ll:1.85,lk:.15,rl:-.5,rk:.4}; }
  static windup() { return {torso:.1,la:-.8,le:-.3,ra:.6,re:.2,ll:-.6,lk:.9,rl:.3,rk:.2}; }
  static block() { return {torso:-.05,la:.9,le:1.2,ra:.7,re:1.1,ll:.2,lk:.15,rl:-.2,rk:.15}; }
  static hit() { return {torso:-.2,la:-1.2,le:-.4,ra:-1,re:-.3,ll:.3,lk:.2,rl:-.4,rk:.3}; }
}

class Bot {
  /* Modes: approach | poke | pressure | retreat | punish */
  static mode = 'approach';
  static wait = 0; static cool = 0; static react = 0; static plan = ''; static blockT = 0;
  static stringLeft = 0; static modeT = 0;
  static seenAtk = 0; static atkStreak = 0; static lastFoeAtk = '';
  static spamMove = ''; static spamCount = 0; static foeStill = 0;
  static lastFoeX = 0; static pending = null; static pendingT = 0;
  static lastBlockKind = '';
  static cfg() { return Diff[Game.level] || Diff.normal; }
  static reset() {
    Bot.mode = 'approach'; Bot.wait = 0; Bot.cool = .4; Bot.react = 0; Bot.plan = '';
    Bot.blockT = 0; Bot.stringLeft = 0; Bot.modeT = 0;
    Bot.seenAtk = 0; Bot.atkStreak = 0; Bot.lastFoeAtk = '';
    Bot.spamMove = ''; Bot.spamCount = 0; Bot.foeStill = 0;
    Bot.lastFoeX = 0; Bot.pending = null; Bot.pendingT = 0; Bot.lastBlockKind = '';
  }
  static queue(act, delay) {
    const cfg = Bot.cfg();
    Bot.pending = act;
    Bot.pendingT = (delay == null ? cfg.react : delay) * (0.85 + Math.random() * .3);
  }
  static inStartup(foe) {
    return !!(foe.atk && foe.atkT > 0 && foe.atkT <= foe.atk.su);
  }
  static inRecovery(foe) {
    if (!foe.atk) return false;
    const a = foe.atk;
    return foe.atkT > a.su + a.ac;
  }
  static whiffedKick(foe, dist) {
    return foe.state === 'kick' && foe.atk && Bot.inRecovery(foe) && dist > 100;
  }
  static observe(dt, me, foe) {
    const dist = Math.abs(foe.x - me.x);
    const moved = Math.abs(foe.x - Bot.lastFoeX) > 1;
    Bot.lastFoeX = foe.x;
    if (moved || foe.atk) Bot.foeStill = 0; else Bot.foeStill += dt;
    if (foe.atk && !Bot.seenAtk) {
      Bot.seenAtk = 1;
      const kind = foe.state;
      if (kind === Bot.lastFoeAtk) Bot.atkStreak++; else Bot.atkStreak = 1;
      Bot.lastFoeAtk = kind;
      if (kind === Bot.spamMove) Bot.spamCount++;
      else { Bot.spamMove = kind; Bot.spamCount = 1; }
    }
    if (!foe.atk) Bot.seenAtk = 0;
    return dist;
  }
  static pickMode(dist, me, foe) {
    const cfg = Bot.cfg();
    const kickR = 150, punchR = 90;
    if (Bot.whiffedKick(foe, dist) || (Bot.lastBlockKind === 'special' && Bot.inRecovery(foe))) {
      if (Math.random() < cfg.punish) { Bot.mode = 'punish'; Bot.modeT = .6; return; }
    }
    if (Bot.inRecovery(foe) && dist < kickR && Math.random() < cfg.punish) {
      Bot.mode = 'punish'; Bot.modeT = .5; return;
    }
    if (Bot.foeStill > 1.4 && Bot.spamCount >= 3 && dist < 180) {
      Bot.mode = 'punish'; Bot.modeT = .5; Bot.plan = 'jump'; return;
    }
    if (Bot.modeT > 0) return;
    if (dist > kickR + 30) Bot.mode = 'approach';
    else if (dist > punchR + 10) Bot.mode = 'poke';
    else if (Bot.stringLeft > 0) Bot.mode = 'pressure';
    else if (dist < punchR - 15) Bot.mode = 'retreat';
    else Bot.mode = Math.random() < .55 ? 'poke' : 'pressure';
    Bot.modeT = .35 + Math.random() * .45;
  }
  static update(dt, me, foe) {
    const p = Input.pad[1];
    Input.acts.forEach(a => p[a] = 0);
    const cfg = Bot.cfg();
    Bot.wait -= dt; Bot.cool -= dt; Bot.react -= dt; Bot.blockT -= dt; Bot.modeT -= dt;
    if (Bot.pendingT > 0) Bot.pendingT -= dt;
    if (!Game.fighting || me.stun > 0 || me.atk) return;
    const dist = Bot.observe(dt, me, foe);
    const dx = foe.x - me.x, dir = Math.sign(dx) || 1;

    if (Bot.blockT > 0) { p.block = 1; return; }

    // Deliberate mistake: freeze briefly
    if (Math.random() < cfg.mistake * dt * 0.35) { Bot.wait = .12 + Math.random() * .2; }

    // Reaction queue flush
    if (Bot.pending && Bot.pendingT <= 0) {
      const act = Bot.pending; Bot.pending = null;
      if (act === 'block') { Bot.blockT = .3 + Math.random() * .35; p.block = 1; return; }
      if (act !== 'block' && act !== 'jump' && Math.random() > cfg.aggro) {
        Bot.cool = cfg.cool * (.5 + Math.random() * .5); return;
      }
      p[act] = 1; Bot.cool = cfg.cool * (.7 + Math.random() * .8);
      if (act === 'punch' || act === 'kick') Bot.stringLeft = Math.max(0, Bot.stringLeft - 1);
      if (act === 'punch' || act === 'kick') { Bot.mode = 'retreat'; Bot.modeT = .25 + Math.random() * .2; }
      return;
    }
    if (Bot.react > 0 || Bot.pending) return;
    if (Bot.plan === 'block') { Bot.blockT = .3 + Math.random() * .35; Bot.plan = ''; return; }
    if (Bot.plan) { p[Bot.plan] = 1; Bot.plan = ''; Bot.cool = cfg.cool * (.7 + Math.random() * .8); return; }
    if (Bot.wait > 0) return;

    // Visible-state block read (startup only), boosted after 2-in-a-row
    if (Bot.inStartup(foe) && dist < 150) {
      let chance = cfg.block;
      if (Bot.atkStreak >= 2) chance = Math.min(1, chance + .25);
      if (foe.state === 'special') chance = Math.min(1, chance + .15);
      if (Math.random() < chance) {
        Bot.queue('block');
        if (foe.state === 'special') Bot.lastBlockKind = 'special';
        else Bot.lastBlockKind = foe.state;
        return;
      }
    }

    // Special: meter full AND (in range OR foe in recovery)
    if (me.meter >= 100 && Bot.cool <= 0) {
      const inRange = dist < Game.W * .4;
      const can = (inRange || Bot.inRecovery(foe)) && Math.random() < cfg.special;
      if (can) { Bot.queue('special', cfg.react * .8); return; }
    }

    Bot.pickMode(dist, me, foe);

    // Habit breaker jump
    if (Bot.foeStill > 1.4 && Bot.spamCount >= 3 && dist < 170 && Bot.cool <= 0) {
      Bot.queue('jump', cfg.react); Bot.spamCount = 0; return;
    }

    if (Bot.mode === 'punish' && Bot.cool <= 0) {
      Bot.queue(dist < 100 ? 'punch' : 'kick', cfg.react * .7);
      Bot.mode = 'retreat'; Bot.modeT = .3; return;
    }

    if (Bot.mode === 'approach') {
      if (dir < 0) p.left = 1; else p.right = 1;
      if (dist < 155 && Bot.cool <= 0 && Math.random() < .4) Bot.queue('kick');
      return;
    }
    if (Bot.mode === 'poke') {
      if (dist > 160) { if (dir < 0) p.left = 1; else p.right = 1; }
      else if (dist < 130) { if (dir < 0) p.right = 1; else p.left = 1; }
      if (Bot.cool <= 0 && dist < 165 && dist > 100 && Math.random() < cfg.aggro) {
        Bot.queue('kick'); Bot.stringLeft = 1 + (Math.random() < .4 ? 1 : 0);
      } else if (Bot.cool <= 0 && Math.random() < (1 - cfg.aggro) * .02) Bot.wait = .2 + Math.random() * .4;
      return;
    }
    if (Bot.mode === 'pressure') {
      if (dir < 0) p.left = 1; else p.right = 1;
      if (Bot.cool <= 0 && dist < 100 && Math.random() < cfg.aggro) {
        Bot.queue('punch'); Bot.stringLeft = Math.max(Bot.stringLeft, 1);
      } else if (Bot.cool <= 0 && dist < 150 && Math.random() < cfg.aggro) Bot.queue('kick');
      return;
    }
    if (Bot.mode === 'retreat') {
      if (dir < 0) p.right = 1; else p.left = 1;
      if (dist > 150) { Bot.mode = 'poke'; Bot.modeT = .4; }
      return;
    }
  }
}

class Fighter {
  static S = 1.5;
  constructor(x, color, side, tag) {
    this.color = color; this.tag = tag; this.meter = 0; this.reset(x, side);
  }
  reset(x, side) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = side;
    this.grounded = true; this.state = 'idle'; this.pose = Pose.idle(); this.walkT = 0;
    this.hp = 100; this.chip = 100; this.stun = 0; this.flash = 0; this.blocking = 0;
    this.atk = null; this.atkT = 0; this.hitDone = 0; this.dashLeft = 0;
    this.hitbox = {x:0,y:0,w:42,h:135};
  }
  gainMeter(n) { this.meter = Math.min(100, this.meter + n); }
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
    if (kind === 'special') {
      if (this.meter < 100) return;
      this.meter = 0; this.dashLeft = Game.W * .4;
    }
    this.atk = Atk[kind]; this.atkT = 0; this.hitDone = 0; this.state = kind; this.blocking = 0;
  }
  atkPose() {
    if (this.state === 'special') return this.atkT <= this.atk.su ? Pose.windup() : Pose.special();
    return this.state === 'kick' ? Pose.kick() : Pose.punch();
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
      this.pose = this.atkPose();
      if (this.state === 'special' && this.atkT > a.su && this.atkT <= a.su + a.ac && this.dashLeft > 0) {
        const step = (Game.W * .4) / a.ac;
        const move = Math.min(step, this.dashLeft);
        this.x += this.face * move; this.dashLeft -= move; this.vx = 0;
      } else this.vx = 0;
      this.vy += 1600 * dt; this.y += this.vy * dt;
      if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
      if (this.atkT >= tot) { this.atk = null; this.state = 'idle'; this.dashLeft = 0; }
      if (this.state !== 'special' || this.atkT <= a.su) this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    if (!Game.fighting) {
      this.vx = 0; this.pose = Pose.idle(); this.state = 'idle';
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
    if (this.grounded && Input.edge(slot, 'special')) this.startAtk('special');
    else if (this.grounded && Input.edge(slot, 'punch')) this.startAtk('punch');
    else if (this.grounded && Input.edge(slot, 'kick')) this.startAtk('kick');
    if (this.atk) { this.pose = this.atkPose(); this.clamp(other); return; }
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
    const b = this.bones(), tip = (this.state === 'kick' || this.state === 'special') ? b.ll : b.ra;
    const r = this.state === 'special' ? 22 : 18;
    return {x:tip.x - r, y:tip.y - r, w:r * 2, h:r * 2, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:a.chip || 0, special:this.state === 'special'};
  }
  takeHit(atk, from) {
    const frontal = (from.x - this.x) * this.face > 0;
    if (this.blocking && frontal) {
      const dmg = atk.special ? atk.chip : atk.dmg * .2;
      this.hp = Math.max(0, this.hp - dmg); this.flash = .08;
      this.vx = Math.sign(this.x - from.x) * atk.kb * .25; return 'block';
    }
    this.hp = Math.max(0, this.hp - atk.dmg); this.stun = atk.stun; this.flash = .08;
    this.vx = Math.sign(this.x - from.x) * atk.kb; this.atk = null; this.blocking = 0; this.dashLeft = 0;
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
    if (!Game.banner && Game.phase !== 'title') {
      ctx.fillStyle = '#fff'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.tag, b.head.x, b.y0 - 12 / Game.scale);
    }
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
  static hr = 16.5; static lw = 6; static btns = [];
  static stop = 0; static shake = 0; static shMag = 0;
  static canvas; static ctx; static acc = 0; static last = 0;
  static round = 1; static wins = [0, 0]; static timer = 60;
  static phase = 'title'; static banner = ''; static bannerT = 0;
  static fighting = 0; static matchOver = 0; static winner = '';
  static level = 'normal';
  static levels = ['easy', 'normal', 'hard'];
  static levelLabels = {easy:'Easy', normal:'Normal', hard:'Hard'};
  static titleBtns = [];
  static init() {
    Game.canvas = document.getElementById('game'); Game.ctx = Game.canvas.getContext('2d');
    try {
      const saved = localStorage.getItem('stickman-level');
      if (saved && Diff[saved]) Game.level = saved;
    } catch (e) {}
    Input.bind(); Game.goTitle(); Game.fit(); addEventListener('resize', () => Game.fit());
    Game.last = performance.now(); requestAnimationFrame(Game.frame);
  }
  static goTitle() {
    Game.phase = 'title'; Game.fighting = 0; Game.matchOver = 0; Game.banner = '';
    Game.round = 1; Game.wins = [0, 0]; Game.winner = ''; Game.stop = 0; Game.shake = 0;
    fighters[0].meter = 0; fighters[1].meter = 0;
    fighters[0].reset(Game.W * .35, 1); fighters[1].reset(Game.W * .65, -1);
    Bot.reset();
    Game.syncControls();
  }
  static startMatch() {
    try { localStorage.setItem('stickman-level', Game.level); } catch (e) {}
    Game.round = 1; Game.wins = [0, 0]; Game.matchOver = 0; Game.winner = '';
    fighters[0].meter = 0; fighters[1].meter = 0;
    Game.syncControls();
    Game.startRound();
  }
  static startRound() {
    Game.stop = 0; Game.shake = 0; Game.timer = 60; Game.fighting = 0; Game.matchOver = 0;
    fighters[0].reset(Game.W * .35, 1); fighters[1].reset(Game.W * .65, -1);
    Bot.reset();
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Game.phase = 'intro'; Game.banner = 'Round ' + Game.round; Game.bannerT = 1.2;
    Game.syncSpecialBtn(); Game.syncControls();
  }
  static syncControls() {
    const el = document.getElementById('controls');
    if (el) el.style.display = Game.phase === 'title' ? 'none' : '';
  }
  static titleLayout() {
    const sc = Game.scale;
    const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-l')) || 0;
    const safeR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-r')) || 0;
    const inset = 16 / sc + Math.max(safeL, safeR) / sc;
    const bw = 120 / sc, bh = 57 / sc, gap = 12 / sc;
    const total = 3 * bw + 2 * gap;
    let x0 = (Game.W - total) / 2;
    x0 = Math.max(inset, Math.min(Game.W - inset - total, x0));
    const y = Game.H * .55 - bh / 2;
    return Game.levels.map((id, i) => ({id, x: x0 + i * (bw + gap), y, w: bw, h: bh}));
  }
  static titlePointer(e) {
    const sc = Game.scale;
    const gx = e.clientX / sc, gy = e.clientY / sc;
    const hit = Game.titleLayout().find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
    if (hit) { Game.level = hit.id; return; }
    Game.startMatch();
  }
  static tryTitleKey(key) {
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      const i = Game.levels.indexOf(Game.level);
      Game.level = Game.levels[Math.max(0, i - 1)]; return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      const i = Game.levels.indexOf(Game.level);
      Game.level = Game.levels[Math.min(Game.levels.length - 1, i + 1)]; return;
    }
    if (key === 'Enter' || key === ' ' || key === 'j' || key === 'J') Game.startMatch();
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
    if (Game.phase !== 'matchEnd') {
      fighters[0].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[0].x || Game.W * .35));
      fighters[1].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[1].x || Game.W * .65));
    }
    Game.btns = Game.phase === 'title' ? [] : [...document.querySelectorAll('#controls button')].map(el => {
      const r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height};
    });
    Game.titleBtns = Game.titleLayout();
  }
  static hitTest(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  static resolve() {
    for (let i = 0; i < 2; i++) {
      const me = fighters[i], foe = fighters[i ^ 1], box = me.strike();
      if (!box || foe.hp <= 0) continue;
      if (!Game.hitTest(box, foe.hitbox)) continue;
      me.hitDone = 1;
      const kind = foe.takeHit(box, me);
      me.gainMeter(box.special ? 0 : box.dmg * 2.5);
      foe.gainMeter(box.special ? 12 : box.dmg * 1.5);
      Game.stop = .06; Game.shake = .12; Game.shMag = box.special ? 7 : 4;
      if (kind === 'hit') foe.vy = -120;
      if (kind === 'block' && box.special) Bot.lastBlockKind = 'special';
      if (foe.hp <= 0) Game.endRound(i);
    }
  }
  static endRound(winnerIdx) {
    if (Game.phase !== 'fight') return;
    Game.fighting = 0; Game.phase = 'roundEnd';
    Game.wins[winnerIdx]++;
    if (Game.wins[winnerIdx] >= 2) {
      Game.matchOver = 1; Game.phase = 'matchEnd';
      Game.winner = winnerIdx === 0 ? 'You win' : 'CPU wins';
      Game.banner = Game.winner; Game.bannerT = 99;
    } else {
      Game.banner = winnerIdx === 0 ? 'You win round' : 'CPU wins round';
      Game.bannerT = 1.6;
    }
  }
  static checkTimeout() {
    if (fighters[0].hp === fighters[1].hp) {
      if (fighters[0].meter !== fighters[1].meter) Game.endRound(fighters[0].meter > fighters[1].meter ? 0 : 1);
      else Game.endRound(0);
    } else Game.endRound(fighters[0].hp > fighters[1].hp ? 0 : 1);
  }
  static syncSpecialBtn() {
    const btn = document.querySelector('#controls button.special');
    if (!btn) return;
    const full = fighters[0].meter >= 100;
    btn.disabled = !full;
    btn.classList.toggle('ready', full);
  }
  static frame(now) {
    let dt = (now - Game.last) / 1000; Game.last = now; if (dt > .05) dt = .05;
    if (Game.shake > 0) Game.shake -= dt;
    if (Game.stop > 0) { Game.stop -= dt; Game.draw(); requestAnimationFrame(Game.frame); return; }
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      const step = Game.STEP;
      if (Game.phase === 'title') {
        fighters[0].face = 1; fighters[1].face = -1;
        fighters[0].pose = Pose.idle(); fighters[1].pose = Pose.idle();
      } else if (Game.phase === 'intro' || Game.phase === 'roundEnd') {
        Game.bannerT -= step;
        if (Game.bannerT <= 0) {
          if (Game.phase === 'intro') {
            if (Game.banner.startsWith('Round')) { Game.banner = 'Fight!'; Game.bannerT = .7; }
            else { Game.phase = 'fight'; Game.fighting = 1; Game.banner = ''; }
          } else if (Game.phase === 'roundEnd') {
            Game.round++; Game.startRound();
          }
        }
        fighters.forEach(f => { if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * step / .3); });
      } else if (Game.phase === 'fight') {
        Game.timer -= step;
        if (Game.timer <= 0) { Game.timer = 0; Game.checkTimeout(); }
        else {
          Bot.update(step, fighters[1], fighters[0]);
          if (Input.pad[1].punch) Input.was[1].punch = 0;
          if (Input.pad[1].kick) Input.was[1].kick = 0;
          if (Input.pad[1].special) Input.was[1].special = 0;
          if (Input.pad[1].jump) Input.was[1].jump = 0;
          fighters[0].update(step, fighters[1], 0);
          fighters[1].update(step, fighters[0], 1);
          Game.resolve();
        }
      } else if (Game.phase === 'matchEnd') {
        fighters.forEach(f => { if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * step / .3); });
      }
      Game.acc -= step;
    }
    if (Game.phase !== 'title') Game.syncSpecialBtn();
    Game.draw(); requestAnimationFrame(Game.frame);
  }
  static bars(ctx) {
    const sc = Game.scale, safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-t'))||0,
      top = (12 + safe) / sc, h = 12 / sc, gap = 44 / sc, w = Game.W * .4 - 14 / sc, mh = 5 / sc, mGap = 4 / sc;
    const x0 = (Game.W - 2 * w - gap) / 2, x1 = x0 + w + gap;
    const drawBar = (x, fill, chip, fromLeft, label, meter) => {
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
      const my = top + h + mGap;
      ctx.fillStyle = '#2A2D35'; ctx.strokeStyle = '#0E0F12'; ctx.lineWidth = 2 / sc;
      ctx.fillRect(x, my, w, mh); ctx.strokeRect(x, my, w, mh);
      const mw = w * (meter / 100);
      ctx.fillStyle = meter >= 100 ? '#FBBF24' : '#A78BFA';
      if (fromLeft) ctx.fillRect(x, my, mw, mh); else ctx.fillRect(x + w - mw, my, mw, mh);
    };
    drawBar(x0, fighters[0].hp, fighters[0].chip, 1, 'YOU', fighters[0].meter);
    drawBar(x1, fighters[1].hp, fighters[1].chip, 0, 'CPU', fighters[1].meter);
    const dy = top + h / 2, r = 4 / sc, gapD = 12 / sc;
    for (let i = 0; i < 2; i++) {
      const won = Game.wins[i];
      for (let d = 0; d < 2; d++) {
        const filled = d < won;
        ctx.beginPath();
        if (i === 0) ctx.arc(x0 - gapD - d * (r * 2 + 6 / sc), dy, r, 0, Math.PI * 2);
        else ctx.arc(x1 + w + gapD + d * (r * 2 + 6 / sc), dy, r, 0, Math.PI * 2);
        ctx.fillStyle = filled ? (i === 0 ? '#3B82F6' : '#EF4444') : '#2A2D35';
        ctx.fill(); ctx.strokeStyle = '#0E0F12'; ctx.lineWidth = 2 / sc; ctx.stroke();
      }
    }
    const tStr = String(Math.ceil(Math.max(0, Game.timer))).padStart(2, '0');
    ctx.font = 'bold ' + 22 / sc + 'px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 4 / sc; ctx.strokeStyle = '#0E0F12';
    ctx.strokeText(tStr, Game.W / 2, top + h / 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText(tStr, Game.W / 2, top + h / 2);
    ctx.textBaseline = 'alphabetic';
  }
  static drawTitle(ctx) {
    const sc = Game.scale;
    // Title
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 40 / sc + 'px system-ui,sans-serif';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 / sc; ctx.strokeStyle = '#0E0F12';
    ctx.strokeText('STICKMAN FIGHTER', Game.W / 2, Game.H * .22);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText('STICKMAN FIGHTER', Game.W / 2, Game.H * .22);
    // Level buttons
    const btns = Game.titleLayout();
    Game.titleBtns = btns;
    ctx.font = 'bold ' + 18 / sc + 'px system-ui,sans-serif';
    for (const b of btns) {
      const sel = b.id === Game.level;
      ctx.fillStyle = sel ? '#FBBF24' : '#2A2D35';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (sel) {
        ctx.strokeStyle = '#0E0F12'; ctx.lineWidth = 2 / sc; ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#0E0F12';
      } else {
        ctx.strokeStyle = 'rgba(245,245,245,.4)'; ctx.lineWidth = 2 / sc; ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillText(Game.levelLabels[b.id], b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.globalAlpha = .8; ctx.fillStyle = '#FFFFFF';
    ctx.font = 16 / sc + 'px system-ui,sans-serif';
    ctx.fillText('Tap to fight', Game.W / 2, Game.H * .78);
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
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
    if (Game.phase === 'title') { Game.drawTitle(ctx); return; }
    Game.bars(ctx);
    if (Game.banner) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold ' + (Game.banner === 'Fight!' ? 56 : 42) / Game.scale + 'px system-ui,sans-serif';
      ctx.lineJoin = 'round'; ctx.lineWidth = 5 / Game.scale; ctx.strokeStyle = '#0E0F12';
      ctx.strokeText(Game.banner, Game.W / 2, Game.H * .42);
      ctx.fillText(Game.banner, Game.W / 2, Game.H * .42);
      if (Game.matchOver) {
        ctx.font = 16 / Game.scale + 'px system-ui,sans-serif';
        ctx.lineWidth = 3 / Game.scale;
        ctx.strokeText('Tap for title', Game.W / 2, Game.H * .42 + 40 / Game.scale);
        ctx.fillText('Tap for title', Game.W / 2, Game.H * .42 + 40 / Game.scale);
      }
    }
  }
}

Game.init();
