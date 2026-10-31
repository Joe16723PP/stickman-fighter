class Input {
  static keys = new Set();
  static pad = [{left:0,right:0,jump:0},{left:0,right:0,jump:0}];
  static jumpWas = [0, 0];
  static keyMap = [
    {left:['a','A','ArrowLeft'], right:['d','D','ArrowRight'], jump:['w','W','ArrowUp',' ']},
    {left:[], right:[], jump:[]},
  ];
  static bind() {
    const on = (e, down) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      down ? Input.keys.add(e.key) : Input.keys.delete(e.key);
    };
    addEventListener('keydown', e => on(e, 1));
    addEventListener('keyup', e => on(e, 0));
    addEventListener('blur', () => { Input.keys.clear(); Input.pad.forEach(p => { p.left = p.right = p.jump = 0; }); Input.jumpWas = [0, 0]; });
    document.querySelectorAll('#controls button[data-k]').forEach(btn => {
      const set = v => {
        const k = btn.dataset.k;
        if (k in Input.pad[0]) { Input.pad[+btn.dataset.p][k] = v; btn.classList.toggle('held', !!v); }
      };
      btn.addEventListener('pointerdown', e => { e.preventDefault(); set(1); });
      const end = e => { e.preventDefault(); set(0); };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', e => { if (e.buttons) set(0); });
    });
  }
  static held(p, a) { return Input.keyMap[p][a].some(k => Input.keys.has(k)) || !!Input.pad[p][a]; }
  static jumpEdge(p) {
    const on = Input.held(p, 'jump');
    const edge = on && !Input.jumpWas[p];
    Input.jumpWas[p] = on ? 1 : 0;
    return edge;
  }
}

class Bot {
  static wait = 0; static mode = 'in'; static cool = 0;
  static update(dt, me, foe) {
    const p = Input.pad[1];
    p.left = p.right = p.jump = 0;
    Bot.wait -= dt; Bot.cool -= dt;
    if (Bot.wait > 0) return;
    const dx = foe.x - me.x, dist = Math.abs(dx), dir = Math.sign(dx) || 1;
    const near = 150, far = 210;
    if (Bot.mode === 'in' && dist <= near) { Bot.mode = 'out'; Bot.wait = .15 + Math.random() * .2; return; }
    if (Bot.mode === 'out' && dist >= far) { Bot.mode = 'in'; Bot.wait = .12 + Math.random() * .2; return; }
    if (Bot.mode === 'in') { if (dir < 0) p.left = 1; else p.right = 1; }
    else { if (dir < 0) p.right = 1; else p.left = 1; }
    if (Bot.cool <= 0 && Math.random() < .012) { p.jump = 1; Bot.cool = .9 + Math.random() * .8; Bot.wait = .08; }
  }
}

class Pose {
  static idle() { return {torso:0,head:0,la:-.4,le:-.2,ra:.4,re:.2,ll:.15,lk:.1,rl:-.15,rk:-.1}; }
  static walk(t) {
    const s = Math.sin(t * 10) * .55, c = Math.cos(t * 10) * .35;
    return {torso:0,head:0,la:-.5+c*.2,le:-.3,ra:.5-c*.2,re:.3,ll:s,lk:Math.max(0,s)*.6,rl:-s,rk:Math.max(0,-s)*.6};
  }
  static jump() { return {torso:-.05,head:0,la:-2.6,le:-.5,ra:2.6,re:.5,ll:.9,lk:1.1,rl:-.9,rk:1.1}; }
}

class Fighter {
  static S = 1.5;
  constructor(x, color, side, tag) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.color = color; this.face = side; this.tag = tag;
    this.grounded = true; this.state = 'idle'; this.hitbox = {x:0,y:0,w:42,h:135}; this.pose = Pose.idle(); this.walkT = 0;
  }
  update(dt, other, slot) {
    let ax = 0;
    if (Input.held(slot, 'left')) ax -= 1;
    if (Input.held(slot, 'right')) ax += 1;
    this.vx = ax * 220;
    if (ax && this.grounded) { this.walkT += dt; this.state = 'walk'; }
    else if (this.grounded) { this.walkT = 0; this.state = 'idle'; }
    if (Input.jumpEdge(slot) && this.grounded) { this.vy = -520; this.grounded = false; this.state = 'jump'; }
    this.vy += 1600 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; if (this.state === 'jump') this.state = 'idle'; }
    else this.state = 'jump';
    const m = Game.margin;
    this.x = Math.max(Game.W * m, Math.min(Game.W * (1 - m), this.x));
    this.face = other.x >= this.x ? 1 : -1;
    this.pose = this.state === 'jump' ? Pose.jump() : this.state === 'walk' ? Pose.walk(this.walkT) : Pose.idle();
    this.hitbox.x = this.x - 21; this.hitbox.y = Game.GROUND + this.y - 135; this.hitbox.w = 42; this.hitbox.h = 135;
  }
  draw(ctx) {
    const s = Fighter.S, g = Game.GROUND + this.y, f = this.face, p = this.pose;
    const hip = {x:this.x, y:g - 40 * s}, sh = {x:this.x + p.torso * 6 * s * f, y:hip.y - 36 * s};
    const head = {x:sh.x, y:sh.y - 24 * s}, hr = 16.5;
    ctx.strokeStyle = this.color; ctx.fillStyle = this.color; ctx.lineWidth = 6; ctx.lineCap = 'round';
    Fighter.limb(ctx, sh, 18 * s, p.la * f, p.le * f);
    Fighter.limb(ctx, sh, 18 * s, p.ra * f, p.re * f);
    Fighter.limb(ctx, hip, 20 * s, p.ll * f, p.lk * f);
    Fighter.limb(ctx, hip, 20 * s, p.rl * f, p.rk * f);
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(head.x, head.y, hr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.tag, head.x, head.y - hr - 6);
  }
  static limb(ctx, o, len, a1, a2) {
    const j = {x:o.x + Math.sin(a1) * len, y:o.y + Math.cos(a1) * len};
    const e = {x:j.x + Math.sin(a1 + a2) * len, y:j.y + Math.cos(a1 + a2) * len};
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(j.x, j.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  }
}

var fighters = [
  new Fighter(960 * .35, '#3B82F6', 1, 'YOU'),
  new Fighter(960 * .65, '#EF4444', -1, 'CPU'),
];

class Game {
  static W = 960; static H = 540; static GROUND = 390; static STEP = 1 / 60; static margin = .15;
  static canvas; static ctx; static acc = 0; static last = 0; static scale = 1;
  static init() {
    Game.canvas = document.getElementById('game');
    Game.ctx = Game.canvas.getContext('2d');
    Input.bind();
    Game.fit();
    addEventListener('resize', () => Game.fit());
    Game.last = performance.now();
    requestAnimationFrame(Game.frame);
  }
  static fit() {
    const dpr = Math.max(1, devicePixelRatio || 1);
    const scale = Math.min(innerWidth / Game.W, innerHeight / Game.H);
    const cssW = Game.W * scale, cssH = Game.H * scale;
    Game.scale = scale;
    Game.margin = innerWidth < 740 ? .2 : .15;
    Game.canvas.style.width = cssW + 'px';
    Game.canvas.style.height = cssH + 'px';
    Game.canvas.width = Math.round(cssW * dpr);
    Game.canvas.height = Math.round(cssH * dpr);
    Game.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    const floor = cssH * (1 - Game.GROUND / Game.H);
    document.documentElement.style.setProperty('--pad-scale', String(Math.min(1, Math.max(.2, (floor - 18) / (4 * 64 + 3 * 10)))));
  }
  static frame(now) {
    let dt = (now - Game.last) / 1000; Game.last = now;
    if (dt > .05) dt = .05;
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      Bot.update(Game.STEP, fighters[1], fighters[0]);
      fighters[0].update(Game.STEP, fighters[1], 0);
      fighters[1].update(Game.STEP, fighters[0], 1);
      Game.acc -= Game.STEP;
    }
    Game.draw();
    requestAnimationFrame(Game.frame);
  }
  static draw() {
    const ctx = Game.ctx;
    ctx.clearRect(0, 0, Game.W, Game.H);
    ctx.fillStyle = '#1a1a22'; ctx.fillRect(0, 0, Game.W, Game.H);
    ctx.fillStyle = '#2a2a35'; ctx.fillRect(0, Game.GROUND, Game.W, Game.H - Game.GROUND);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, Game.GROUND); ctx.lineTo(Game.W, Game.GROUND); ctx.stroke();
    fighters.forEach(f => f.draw(ctx));
  }
}

Game.init();
