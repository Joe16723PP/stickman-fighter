class Input {
  static keys = new Set();
  static touch = [{left:0,right:0,jump:0},{left:0,right:0,jump:0}];
  static bind() {
    const on = (e, down) => {
      const k = e.key;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(k)) e.preventDefault();
      down ? Input.keys.add(k) : Input.keys.delete(k);
    };
    addEventListener('keydown', e => on(e,1));
    addEventListener('keyup', e => on(e,0));
    addEventListener('blur', () => { Input.keys.clear(); Input.touch.forEach(t => { t.left=t.right=t.jump=0; }); });
    document.querySelectorAll('#controls button[data-k]').forEach(btn => {
      const set = v => { Input.touch[+btn.dataset.p][btn.dataset.k] = v; btn.classList.toggle('held', !!v); };
      const start = e => { e.preventDefault(); set(1); };
      const end = e => { e.preventDefault(); set(0); };
      btn.addEventListener('pointerdown', start);
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', e => { if (e.buttons) set(0); });
    });
  }
  static held(p, action) {
    const map = [
      {left:['a','A'], right:['d','D'], jump:['w','W']},
      {left:['ArrowLeft'], right:['ArrowRight'], jump:['ArrowUp']},
    ][p];
    return map[action].some(k => Input.keys.has(k)) || !!Input.touch[p][action];
  }
}

class Pose {
  static idle() { return {torso:0, head:0, la:-.4, le:-.2, ra:.4, re:.2, ll:.15, lk:.1, rl:-.15, rk:-.1}; }
  static walk(t, face) {
    const s = Math.sin(t * 10) * .55, c = Math.cos(t * 10) * .35;
    return {torso:0, head:0, la:-.5+c*.2, le:-.3, ra:.5-c*.2, re:.3, ll:s, lk:Math.max(0,s)*.6, rl:-s, rk:Math.max(0,-s)*.6};
  }
  static jump() { return {torso:-.05, head:0, la:-2.6, le:-.5, ra:2.6, re:.5, ll:.9, lk:1.1, rl:-.9, rk:1.1}; }
}

class Fighter {
  constructor(x, color, side) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.color = color; this.face = side; this.grounded = true;
    this.state = 'idle'; this.hitbox = {x:0,y:0,w:28,h:90};
    this.pose = Pose.idle(); this.walkT = 0;
  }
  update(dt, other) {
    const p = this === fighters[0] ? 0 : 1;
    let ax = 0;
    if (Input.held(p, 'left')) ax -= 1;
    if (Input.held(p, 'right')) ax += 1;
    this.vx = ax * 220;
    if (ax && this.grounded) { this.walkT += dt; this.state = 'walk'; }
    else if (this.grounded) { this.walkT = 0; this.state = 'idle'; }
    if (Input.held(p, 'jump') && this.grounded) { this.vy = -420; this.grounded = false; this.state = 'jump'; }
    this.vy += 1400 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; if (this.state === 'jump') this.state = 'idle'; }
    else this.state = 'jump';
    const minX = Game.W * .15, maxX = Game.W * .85;
    this.x = Math.max(minX, Math.min(maxX, this.x));
    this.face = other.x >= this.x ? 1 : -1;
    this.pose = this.state === 'jump' ? Pose.jump() : this.state === 'walk' ? Pose.walk(this.walkT, this.face) : Pose.idle();
    this.hitbox.x = this.x - 14; this.hitbox.y = Game.GROUND + this.y - 90; this.hitbox.w = 28; this.hitbox.h = 90;
  }
  draw(ctx) {
    const g = Game.GROUND + this.y, f = this.face, p = this.pose;
    const hip = {x:this.x, y:g - 40}, sh = {x:this.x + p.torso * 6 * f, y:hip.y - 36};
    const head = {x:sh.x + p.head * 4 * f, y:sh.y - 22};
    ctx.strokeStyle = this.color; ctx.fillStyle = this.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
    Fighter.limb(ctx, sh, 18, p.la * f, p.le * f);
    Fighter.limb(ctx, sh, 18, p.ra * f, p.re * f);
    Fighter.limb(ctx, hip, 20, p.ll * f, p.lk * f);
    Fighter.limb(ctx, hip, 20, p.rl * f, p.rk * f);
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(head.x, head.y, 10, 0, Math.PI * 2); ctx.fill();
  }
  static limb(ctx, origin, len, a1, a2) {
    const j = {x:origin.x + Math.sin(a1) * len, y:origin.y + Math.cos(a1) * len};
    const e = {x:j.x + Math.sin(a1 + a2) * len, y:j.y + Math.cos(a1 + a2) * len};
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(j.x, j.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  }
}

const fighters = [
  new Fighter(960 * .35, '#4af', 1),
  new Fighter(960 * .65, '#f45', -1),
];

class Game {
  static W = 960; static H = 540; static GROUND = 460; static STEP = 1 / 60;
  static canvas; static ctx; static acc = 0; static last = 0;
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
    const vw = innerWidth, vh = innerHeight;
    const scale = Math.min(vw / Game.W, vh / Game.H);
    const cssW = Game.W * scale, cssH = Game.H * scale;
    Game.canvas.style.width = cssW + 'px';
    Game.canvas.style.height = cssH + 'px';
    Game.canvas.width = Math.round(Game.W * dpr);
    Game.canvas.height = Math.round(Game.H * dpr);
    Game.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  static frame(now) {
    let dt = (now - Game.last) / 1000; Game.last = now;
    if (dt > .05) dt = .05;
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      fighters[0].update(Game.STEP, fighters[1]);
      fighters[1].update(Game.STEP, fighters[0]);
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
    ctx.strokeStyle = '#444'; ctx.beginPath(); ctx.moveTo(0, Game.GROUND); ctx.lineTo(Game.W, Game.GROUND); ctx.stroke();
    fighters.forEach(f => f.draw(ctx));
  }
}

Game.init();
