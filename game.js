/* Difficulty tuning table — single source of truth */
const Diff = {
  // Retuned for Moves timing (punch su7/re11, kick su11) + layout lane; restore 10/90, 77/23, 96/4 @ seed 0xC0FFEE42
  easy:   { react: 0.42, block: 0.14, punish: 0.18, special: 0.07, mistake: 0.42, aggro: 0.26, cool: 1.10 },
  normal: { react: 0.23, block: 0.38, punish: 0.58, special: 0.44, mistake: 0.09, aggro: 0.80, cool: 0.48 },
  hard:   { react: 0.14, block: 0.58, punish: 1.00, special: 0.78, mistake: 0.02, aggro: 0.92, cool: 0.28 },
};

const ArcadeDiff = {
  easy:   { damage: .7, health: .8, extraEnemies: -1, details: 'DAMAGE 70% · ENEMY HP 80% · 4 PER WAVE' },
  normal: { damage: 1, health: 1, extraEnemies: 0, details: 'DAMAGE 100% · ENEMY HP 100% · 6 PER WAVE' },
  hard:   { damage: 1.4, health: 1.5, extraEnemies: 1, details: 'DAMAGE 140% · ENEMY HP 150% · 8 PER WAVE' },
};

const FighterClasses = {
  freehand: { name: 'KARATE', role: 'FAST · 1.75× METER', punchMove: 'KARATE PUNCH', kickMove: 'KARATE KICK', super: 'IRON FIST FLURRY', color: '#52B8FF', accent: '#FBBF24', style: 'ward', pitch: 1.08, speed: 1.08, attackSpeed: 1.28, punch: 1, kick: .95, superPower: 1, superHits: 5, criticalChance: .13, criticalDamage: 1.55, meter: 1.75, dash: .13 },
  staff: { name: 'STAFF', role: 'SLOW · HEAVY · LONGEST RANGE', punchMove: 'BO STAFF THRUST', kickMove: 'LOW SWEEP', super: 'DRAGON STAFF SPIN', color: '#3BD6B3', accent: '#FBBF24', style: 'quake', weapon: 'staff', pitch: .92, speed: .98, attackSpeed: .78, punch: 1.22, kick: 1.55, superPower: 1.3, superHits: 3, criticalChance: .09, criticalDamage: 1.8, meter: 1, dash: .12 },
  blade: { name: 'BLADE', role: 'BALANCED · 1.35× METER', punchMove: 'QUICK DRAW', kickMove: 'SCABBARD KICK', super: 'CRESCENT STORM', color: '#B8D7FF', accent: '#38BDF8', style: 'flash', weapon: 'blade', pitch: 1.2, speed: 1.13, attackSpeed: 1, punch: 1.08, kick: 1.08, superPower: 1.12, superHits: 2, criticalChance: .16, criticalDamage: 1.6, meter: 1.35, dash: .18 },
};
const PlayerCoolColor = '#52B8FF';
const CpuHotColors = {
  '1v1': '#FF4F5E',
  enemy: { regular: '#FF4F5E', runner: '#FFAA45', tough: '#F36B83', heavy: '#E94B3E', boss: '#F04458' },
  bosses: ['#FF4F5E','#FF8A4C','#F35B91','#FF663E','#D84A67','#F05668','#FFB347','#EA5968','#F0447A','#FF3B47'],
};

// Weapon loadouts trade attack speed for damage. Archetypes determine whether they carry one.
const EnemyWeaponProfiles = {
  freehand: { weapon: null, attackSpeed: 1, damage: .85 },
  stick: { weapon: 'stick', attackSpeed: .82, damage: 1.3 },
  knife: { weapon: 'knife', attackSpeed: 1.22, damage: 1 },
};
const EnemyArchetypes = {
  regular: { health: 100, weaponChance: 0, specialDamage: 0, specialGain: 0 },
  runner: { health: 75, weaponChance: .2, specialDamage: .25, specialGain: .25 },
  tough: { health: 125, weaponChance: .2, specialDamage: .25, specialGain: .25 },
  heavy: { health: 145, weaponChance: .5, specialDamage: .45, specialGain: .45 },
  boss: { health: 220, weaponChance: 1, specialDamage: 1, specialGain: 1 },
};

class Sfx {
  static ctx = null;
  static unlock() {
    const AudioContextType = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextType) return;
    try {
      if (!Sfx.ctx) Sfx.ctx = new AudioContextType();
      if (Sfx.ctx.state === 'suspended') Sfx.ctx.resume();
    } catch (e) { Sfx.ctx = null; }
  }
  static tone(startHz, endHz, duration, shape = 'triangle', volume = .08) {
    const ctx = Sfx.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = shape;
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, endHz), now + duration);
      env.gain.setValueAtTime(.001, now);
      env.gain.exponentialRampToValueAtTime(volume, now + .008);
      env.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(env); env.connect(ctx.destination);
      osc.start(now); osc.stop(now + duration + .015);
    } catch (e) {}
  }
  static play(name, profile = null) {
    const pitch = profile?.pitch || 1;
    if (name === 'punch') Sfx.tone(210 * pitch, 92 * pitch, .085, 'triangle', .055);
    else if (name === 'kick') Sfx.tone(145 * pitch, 52 * pitch, .13, 'sawtooth', .06);
    else if (name === 'jump') Sfx.tone(220 * pitch, 440 * pitch, .12, 'sine', .045);
    else if (name === 'hit') Sfx.tone(125 * pitch, 48 * pitch, .11, 'square', .05);
    else if (name === 'block') Sfx.tone(480 * pitch, 180 * pitch, .1, 'triangle', .045);
    else if (name === 'dodge') Sfx.tone(360 * pitch, 110 * pitch, .16, 'sine', .055);
    else if (name === 'super-charge') { Sfx.tone(95 * pitch, 260 * pitch, .2, 'sawtooth', .055); setTimeout(() => Sfx.tone(240 * pitch, 520 * pitch, .13, 'triangle', .045), 95); }
    else if (name === 'super-dash') Sfx.tone(620 * pitch, 130 * pitch, .16, 'sawtooth', .075);
    else if (name === 'super-hit') { Sfx.tone(105 * pitch, 32 * pitch, .26, 'sawtooth', .1); setTimeout(() => Sfx.tone(390 * pitch, 80 * pitch, .18, 'triangle', .06), 55); }
    else if (name === 'player-normal-hit') { Sfx.tone(185 * pitch, 72 * pitch, .095, 'triangle', .075); Sfx.tone(680 * pitch, 240 * pitch, .045, 'square', .025); }
    else if (name === 'player-heavy-hit') { Sfx.tone(105 * pitch, 38 * pitch, .19, 'sawtooth', .11); setTimeout(() => Sfx.tone(75 * pitch, 32 * pitch, .12, 'triangle', .065), 35); }
    else if (name === 'player-special-hit') { Sfx.tone(82 * pitch, 28 * pitch, .31, 'sawtooth', .13); setTimeout(() => Sfx.tone(520 * pitch, 150 * pitch, .2, 'square', .075), 45); setTimeout(() => Sfx.tone(260 * pitch, 90 * pitch, .18, 'triangle', .06), 115); }
    else if (name === 'player-die') { Sfx.tone(190 * pitch, 42 * pitch, .42, 'sawtooth', .12); setTimeout(() => Sfx.tone(92 * pitch, 30 * pitch, .34, 'triangle', .085), 115); }
    else if (name === 'critical') { Sfx.tone(520 * pitch, 170 * pitch, .15, 'square', .07); setTimeout(() => Sfx.tone(760 * pitch, 320 * pitch, .12, 'triangle', .055), 45); }
    else if (name === 'heal') { Sfx.tone(540 * pitch, 780 * pitch, .12, 'sine', .055); setTimeout(() => Sfx.tone(760 * pitch, 1040 * pitch, .14, 'sine', .045), 75); }
    else if (name === 'powerup') { Sfx.tone(300 * pitch, 680 * pitch, .16, 'square', .06); setTimeout(() => Sfx.tone(620 * pitch, 980 * pitch, .18, 'triangle', .05), 80); }
  }
}

class Input {
  static keys = new Set();
  static pad = [{}, {}];
  static was = [{}, {}];
  // acts list byte-identical to main (AC2). Depth keys read via depthHeld() in beat mode only.
  static acts = ['left','right','jump','punch','kick','block','roll','special'];
  static keyMap = [
    {left:['a','A','ArrowLeft'], right:['d','D','ArrowRight'], jump:['w','W','ArrowUp',' '], punch:['j','J'], kick:['k','K'], block:['l','L'], roll:['Shift'], special:['i','I']},
    {left:[], right:[], jump:[], punch:[], kick:[], block:[], roll:[], special:[]},
  ];
  static depthKeys = { up:['w','W','ArrowUp'], down:['s','S','ArrowDown'] };
  static bind() {
    Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    // Safari can still apply its double-tap and gesture zoom despite the viewport
    // settings. Keep zoom gestures from scaling the full-screen game surface.
    let lastTouchEnd = 0;
    document.addEventListener('touchend', e => {
      const now = performance.now();
      if (now - lastTouchEnd < 320 && e.cancelable) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
      document.addEventListener(type, e => e.preventDefault(), { passive: false });
    });
    const on = (e, down) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      if (down) Sfx.unlock();
      if (down && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')
        && (Game.paused || Game.canPause())) { e.preventDefault(); Game.togglePause(); return; }
      down ? Input.keys.add(e.key) : Input.keys.delete(e.key);
      if (down && Game.phase === 'title') { Game.tryTitleKey(e.key); return; }
      if (down && Game.mode === 'practice' && (e.key === 'r' || e.key === 'R')) { Game.resetPracticeDummy(); return; }
      if (Game.matchOver && down) {
        if (Game.mode === 'beatemup' && BeatEmUp.onMatchOverKey()) return;
        Game.goTitle();
      }
    };
    addEventListener('keydown', e => on(e, 1));
    addEventListener('keyup', e => on(e, 0));
    addEventListener('blur', () => { Input.keys.clear(); Input.pad.forEach(p => { Input.acts.forEach(a => p[a] = 0); p.depthUp = 0; p.depthDown = 0; }); });
    addEventListener('pointerdown', e => {
      Sfx.unlock();
      if (Game.phase === 'title') { Game.titlePointer(e); return; }
      if (Game.matchOver) {
        if (Game.mode === 'beatemup' && BeatEmUp.onMatchOverTap(e)) return;
        Game.goTitle();
      }
    });
    document.querySelectorAll('#controls button[data-k]').forEach(btn => {
      const set = v => {
        const k = btn.dataset.k;
        if (Input.acts.includes(k)) { Input.pad[+btn.dataset.p][k] = v; btn.classList.toggle('held', !!v); }
      };
      btn.addEventListener('pointerdown', e => { Sfx.unlock(); e.preventDefault(); e.stopPropagation(); set(1); });
      const end = e => { e.preventDefault(); set(0); };
      btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', e => { if (e.buttons) set(0); });
    });
    const menuBtn = document.getElementById('main-menu-button');
    if (menuBtn) {
      menuBtn.addEventListener('pointerdown', e => { e.stopPropagation(); Sfx.unlock(); });
      menuBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Game.toggleActionMenu(); });
    }
    const actionMenu = document.getElementById('game-action-menu');
    const pauseBtn = document.getElementById('pause-game-button');
    const fullscreenBtn = document.getElementById('fullscreen-button');
    const titleBtn = document.getElementById('return-main-menu-button');
    [actionMenu, pauseBtn, fullscreenBtn, titleBtn].filter(Boolean).forEach(el => {
      el.addEventListener('pointerdown', e => { e.stopPropagation(); Sfx.unlock(); });
    });
    if (pauseBtn) pauseBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); Game.togglePause();
    });
    if (titleBtn) titleBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); Game.goTitle();
    });
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation(); Game.toggleFullscreen();
    });
    document.addEventListener('fullscreenchange', () => Game.syncFullscreenButton());
    document.addEventListener('webkitfullscreenchange', () => Game.syncFullscreenButton());
    Game.syncFullscreenButton();
    if (actionMenu) actionMenu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#main-menu-button, #game-action-menu')) Game.closeActionMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && Game.actionMenuOpen && !Game.paused) Game.closeActionMenu();
    });
    const practiceReset = document.getElementById('practice-reset');
    if (practiceReset) {
      practiceReset.addEventListener('pointerdown', e => { e.stopPropagation(); Sfx.unlock(); });
      practiceReset.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); Game.resetPracticeDummy(); });
    }
    const stick = document.getElementById('move-stick');
    if (stick) {
      const knob = stick.querySelector('.stick-knob');
      let pointerId = null;
      const resetStick = () => {
        pointerId = null;
        Input.pad[0].left = 0; Input.pad[0].right = 0;
        Input.pad[0].depthUp = 0; Input.pad[0].depthDown = 0;
        knob.style.transform = 'translate(0,0)';
      };
      const moveStick = e => {
        if (e.pointerId !== pointerId) return;
        const rect = stick.getBoundingClientRect();
        const radius = Math.min(rect.width, rect.height) * .25;
        const dx = Math.max(-radius, Math.min(radius, e.clientX - (rect.left + rect.width / 2)));
        const dy = Math.max(-radius, Math.min(radius, e.clientY - (rect.top + rect.height / 2)));
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        const deadZone = radius * .22;
        Input.pad[0].left = dx < -deadZone ? 1 : 0;
        Input.pad[0].right = dx > deadZone ? 1 : 0;
        Input.pad[0].depthUp = dy < -deadZone ? 1 : 0;
        Input.pad[0].depthDown = dy > deadZone ? 1 : 0;
      };
      stick.addEventListener('pointerdown', e => {
        Sfx.unlock();
        e.preventDefault(); e.stopPropagation();
        pointerId = e.pointerId;
        stick.setPointerCapture(pointerId);
        moveStick(e);
      });
      stick.addEventListener('pointermove', moveStick);
      stick.addEventListener('pointerup', e => { if (e.pointerId === pointerId) resetStick(); });
      stick.addEventListener('pointercancel', resetStick);
      stick.addEventListener('lostpointercapture', resetStick);
    }
  }
  static syncMode() {
    // In beat mode, jump is Space + Jump button only; W/↑ move depth instead.
    if (Game.mode === 'beatemup') {
      Input.keyMap[0].jump = [' '];
    } else {
      Input.keyMap[0].jump = ['w','W','ArrowUp',' '];
    }
  }
  static held(p, a) { return Input.keyMap[p][a].some(k => Input.keys.has(k)) || !!Input.pad[p][a]; }
  static depthHeld(dir) {
    if (Game.mode !== 'beatemup') return false;
    const padKey = dir === 'up' ? 'depthUp' : 'depthDown';
    return (Input.depthKeys[dir] || []).some(k => Input.keys.has(k)) || !!Input.pad[0][padKey];
  }
  static edge(p, a) {
    const on = Input.held(p, a), e = on && !Input.was[p][a];
    Input.was[p][a] = on ? 1 : 0; return e;
  }
}

/* Move timing at 60fps (Game.STEP). Windup/hit/recovery + chain/cancel live here only. */
const Moves = {
  punch: {
    su: 7, ac: 3, re: 11,          // first hit lands ~117ms (~110ms); recovery ~183ms (~180ms)
    dmg: 5, kb: 160, stun: 10,
    chainMax: 3,
    chainDmg: [5, 7, 9],           // confirmed links reward the second and third hits
    chainKb: [160, 220, 380],
    chainStun: [10, 15, 24],
    chainSu: 3, chainAc: 3, chainRe: 8,
    chainWindow: 10,               // frames into recovery when a follow-up is allowed
    reach: 95,
  },
  kick: {
    su: 11, ac: 5, re: 18,         // windup ~183ms (~180ms); recovery ~300ms punish window
    dmg: 15, kb: 260, stun: 22,    // Heavy strike: high payoff, with a hit-confirm window for a follow-up string
    chainWindow: 18,
    reach: 175,
  },
  airPunch: { su: 2, ac: 3, re: 11, dmg: 6, kb: 180, stun: 11 },
  airKick:  { su: 3, ac: 4, re: 14, dmg: 8, kb: 250, stun: 14 },
  special: {
    su: 14, ac: 10, re: 18,
    dmg: 22, chip: 6, kb: 390, stun: 22,
  },
};

/** Resolved attack snapshot used by Fighter (reads Moves). */
class Atk {
  static of(kind, chain = 0) {
    const m = Moves[kind];
    if (!m) return null;
    if (kind === 'punch') {
      const n = Math.max(0, Math.min(chain, m.chainMax - 1));
      const follow = n > 0;
      return {
        su: follow ? m.chainSu : m.su,
        ac: follow ? m.chainAc : m.ac,
        re: follow ? m.chainRe : m.re,
        dmg: m.chainDmg[n],
        kb: m.chainKb[n], stun: m.chainStun[n],
        chain: n, kind: 'punch',
        chainMax: m.chainMax, chainWindow: m.chainWindow,
      };
    }
    if (kind === 'kick') {
      return {
        su: m.su, ac: m.ac, re: m.re,
        dmg: m.dmg, kb: m.kb, stun: m.stun,
        kind: 'kick', chainWindow: m.chainWindow,
      };
    }
    if (kind === 'airPunch' || kind === 'airKick') {
      return {su:m.su, ac:m.ac, re:m.re, dmg:m.dmg, kb:m.kb, stun:m.stun, kind};
    }
    return {
      su: m.su, ac: m.ac, re: m.re,
      dmg: m.dmg, chip: m.chip || 0, kb: m.kb, stun: m.stun,
      kind: 'special',
    };
  }
  // Back-compat mirrors for any Atk.punch.su style reads (Bot ranges still use literals via Moves)
  static get punch() { return Atk.of('punch', 0); }
  static get kick() { return Atk.of('kick'); }
  static get special() { return Atk.of('special'); }
}

class CombatPose {
  static idle() { return {torso:0,la:-.4,le:-.2,ra:.4,re:.2,ll:.15,lk:.1,rl:-.15,rk:-.1}; }
  static walk(t) {
    const s = Math.sin(t * 10) * .55, c = Math.cos(t * 10) * .35;
    return {torso:0,la:-.5+c*.2,le:-.3,ra:.5-c*.2,re:.3,ll:s,lk:Math.max(0,s)*.6,rl:-s,rk:Math.max(0,-s)*.6};
  }
  static jump() { return {torso:-.05,la:-2.6,le:-.5,ra:2.6,re:.5,ll:.9,lk:1.1,rl:-.9,rk:1.1}; }
  static punch() { return {torso:.15,la:-.5,le:-.2,ra:1.55,re:.2,ll:.2,lk:.1,rl:-.2,rk:.1}; }
  static kick() { return {torso:-.15,la:-.6,le:-.2,ra:.5,re:.2,ll:1.55,lk:.2,rl:-.25,rk:.2}; }
  static airPunch() { return {torso:-.42,la:-2.3,le:.25,ra:1.62,re:-.08,ll:-1.2,lk:.15,rl:-.85,rk:-.2}; }
  static airKick() { return {torso:.1,la:-.6,le:-.2,ra:.5,re:.2,ll:1.6,lk:-.3,rl:-.7,rk:.7}; }
  static special() { return {torso:-.25,la:-1.1,le:-.4,ra:.8,re:.3,ll:1.85,lk:.15,rl:-.5,rk:.4}; }
  static windup() { return {torso:.1,la:-.8,le:-.3,ra:.6,re:.2,ll:-.6,lk:.9,rl:.3,rk:.2}; }
  static block() { return {torso:-.05,la:.9,le:1.2,ra:.7,re:1.1,ll:.2,lk:.15,rl:-.2,rk:.15}; }
  static hit() { return {torso:-.2,la:-1.2,le:-.4,ra:-1,re:-.3,ll:.3,lk:.2,rl:-.4,rk:.3}; }
}

class Pose {
  static KEYS = ['chest','neck','head','la','le','ra','re','ll','lk','rl','rk','hipBob','shPull'];
  static ANGLE_KEYS = ['chest','neck','head','la','le','ra','re','ll','lk','rl','rk'];
  static deg(d) { return d * Math.PI / 180; }
  /** Shortest signed delta from a→b in radians, in (-π, π]. */
  static angleDelta(a, b) {
    let d = (b || 0) - (a || 0);
    while (d > Math.PI) d -= Math.PI * 2;
    while (d <= -Math.PI) d += Math.PI * 2;
    return d;
  }
  static base() {
    return {chest:0, neck:0, head:0, la:0, le:0, ra:0, re:0, ll:0, lk:0, rl:0, rk:0, hipBob:0, shPull:0};
  }
  static staffGrip(chest = -6, arms = [-110,-25,24,55], legs = [34,16,-24,18], hipBob = 0) {
    const d = Pose.deg;
    const [la,le,ra,re] = arms, [ll,lk,rl,rk] = legs;
    return {chest:d(chest),neck:d(2),head:d(1),la:d(la),le:d(le),ra:d(ra),re:d(re),
      ll:d(ll),lk:d(lk),rl:d(rl),rk:d(rk),hipBob,shPull:0};
  }
  static copy(p) {
    const o = {}; for (const k of Pose.KEYS) o[k] = p[k] || 0; return o;
  }
  static lerp(a, b, t) {
    const o = {};
    for (const k of Pose.KEYS) {
      if (Pose.ANGLE_KEYS.indexOf(k) >= 0)
        o[k] = (a[k] || 0) + Pose.angleDelta(a[k], b[k]) * t;
      else
        o[k] = (a[k] || 0) + ((b[k] || 0) - (a[k] || 0)) * t;
    }
    return o;
  }
  /** Step each angle toward target by at most maxStep radians (shortest path). */
  static stepAngles(from, to, maxStep) {
    const o = Pose.copy(to);
    for (const k of Pose.ANGLE_KEYS) {
      const d = Pose.angleDelta(from[k], to[k]);
      if (Math.abs(d) <= maxStep) o[k] = to[k];
      else o[k] = (from[k] || 0) + Math.sign(d) * maxStep;
    }
    return o;
  }
  static easeOut(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }
  /** Compact boxing guard, elbows tucked and fists high. */
  static idle(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip();
    if (profile?.weapon === 'blade') return {chest:d(-5),neck:d(2),head:d(1),la:d(-120),le:d(80),ra:d(-60),re:d(-80),shPull:0,ll:d(32),lk:d(22),rl:d(-36),rk:d(28),hipBob:0};
    const stances = {
      rush: {chest:d(-4),neck:d(2),head:d(2),la:d(-92),le:d(-82),ra:d(-68),re:d(-108),shPull:7,ll:d(18),lk:d(14),rl:d(-16),rk:d(18),hipBob:0},
      flame:{chest:d(-1),neck:d(1),head:d(1),la:d(-100),le:d(-104),ra:d(-62),re:d(-98),shPull:3,ll:d(24),lk:d(10),rl:d(-22),rk:d(24),hipBob:0},
      // Tae Kwon Do: upright guard, narrow stance, and a chambered lead leg.
      flash:{chest:d(-1),neck:d(1),head:d(1),la:d(-94),le:d(-72),ra:d(-72),re:d(-112),shPull:0,ll:d(28),lk:d(18),rl:d(-22),rk:d(22),hipBob:0},
      quake:{chest:d(7),neck:d(-2),head:d(4),la:d(-112),le:d(-56),ra:d(-56),re:d(-64),shPull:0,ll:d(24),lk:d(18),rl:d(-20),rk:d(24),hipBob:0},
      // Karate guard: angled torso, compact lead hand, rear fist tucked by the ribs.
      ward: {chest:d(-5),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-112),re:d(-72),shPull:0,ll:d(30),lk:d(24),rl:d(-28),rk:d(26),hipBob:0},
    };
    return stances[profile?.style] || stances.rush;
  }
  static roll(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(28,[-112,-28,26,54],[58,68,-58,68],0);
    return {chest:d(32),neck:d(-6),head:d(-8),la:d(-132),le:d(58),ra:d(-102),re:d(68),ll:d(62),lk:d(72),rl:d(-72),rk:d(72),hipBob:0,shPull:0};
  }
  /** Speed-scaled gait; hip dip follows the step phase. */
  static walk(t, speed = 1, profile = null) {
    const d = Pose.deg, phase = t * Math.PI * 2 / .45;
    const stride = Math.max(0, Math.min(1, speed));
    const leg = Math.sin(phase) * d(22 + 12 * stride), arm = Math.sin(phase) * d(14 + 10 * stride);
    const dip = (1 - Math.cos(phase * 2)) * (1 + 1.5 * stride);
    const id = Pose.idle(profile);
    if (profile?.weapon === 'staff') {
      const step = Math.sin(phase) * d(18 + 7 * stride);
      return {...id,la:id.la - arm * .08,le:id.le + d(2),ra:id.ra - arm * .06,re:id.re - d(2),
        ll:step + d(10),lk:Math.max(0,Math.sin(phase)) * d(18) + d(8),
        rl:-step - d(12),rk:Math.max(0,-Math.sin(phase)) * d(18) + d(8),hipBob:dip * .35};
    }
    if (profile?.weapon === 'blade') {
      const step = Math.sin(phase) * d(16 + 6 * stride);
      return {...id,la:id.la - arm * .18,le:id.le + d(3),ra:id.ra - arm * .12,re:id.re - d(3),
        ll:step + d(12),lk:Math.max(0,Math.sin(phase)) * d(22) + d(8),
        rl:-step - d(12),rk:Math.max(0,-Math.sin(phase)) * d(20) + d(8),hipBob:dip * .4};
    }
    if (profile?.style === 'ward') {
      // Keep the fists in guard while using short, grounded karate steps.
      const step = Math.sin(phase) * d(15 + 6 * stride);
      return {...id,la:id.la - arm * .12,le:id.le + d(2),ra:id.ra - arm * .1,re:id.re - d(2),
        ll:step + d(13),lk:Math.max(0,Math.sin(phase)) * d(20) + d(10),
        rl:-step - d(13),rk:Math.max(0,-Math.sin(phase)) * d(20) + d(10),hipBob:dip * .4};
    }
    if (profile?.style === 'flash') {
      // Quick, short steps keep the ninja planted instead of swinging limbs wide.
      const step = Math.sin(phase) * d(17 + 7 * stride);
      return {...id,
        la:id.la - arm * .35, le:id.le + d(5), ra:id.ra - arm * .35, re:id.re - d(5),
        ll:step, lk:Math.max(0, Math.sin(phase)) * d(24) + d(8),
        rl:-step, rk:Math.max(0, -Math.sin(phase)) * d(24) + d(8),
        hipBob:dip * .55};
    }
    return {...id,
      la:id.la - arm, le:id.le + d(10), ra:id.ra - arm, re:id.re - d(8),
      ll:leg, lk:Math.max(0, Math.sin(phase)) * d(40) + d(8),
      rl:-leg, rk:Math.max(0, -Math.sin(phase)) * d(40) + d(8),
      hipBob:dip};
  }
  static jumpPhase(vy) {
    if (vy < -420) return 'takeoff';
    if (Math.abs(vy) < 80) return 'apex';
    return vy < 0 ? 'rise' : 'fall';
  }
  static jump(phase, profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') {
      if (phase === 'takeoff') return Pose.staffGrip(-12,[-112,-28,20,52],[42,-30,-30,44],0);
      if (phase === 'rise') return Pose.staffGrip(-8,[-110,-26,22,52],[74,-44,-58,48],0);
      if (phase === 'apex') return Pose.staffGrip(-5,[-108,-24,24,54],[78,-54,-54,54],0);
      return Pose.staffGrip(2,[-112,-28,20,52],[24,0,-24,0],0);
    }
    if (profile?.style === 'ward') {
      const poses = {
        takeoff:{chest:-7,ll:48,lk:-38,rl:-32,rk:42},
        rise:{chest:-4,ll:76,lk:-50,rl:-62,rk:54},
        apex:{chest:-2,ll:82,lk:-58,rl:-56,rk:58},
        fall:{chest:3,ll:26,lk:0,rl:-26,rk:0}
      };
      const p = poses[phase] || poses.fall;
      return {chest:d(p.chest),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-112),re:d(-68),
        ll:d(p.ll),lk:d(p.lk),rl:d(p.rl),rk:d(p.rk),hipBob:0};
    }
    if (phase === 'takeoff') {
      return {chest:d(-6), neck:d(2), head:d(3),
        la:d(-98), le:d(-84), ra:d(-72), re:d(-108),
        ll:d(40), lk:d(-55), rl:d(-25), rk:d(55), hipBob:0};
    }
    if (phase === 'rise') {
      return {chest:d(-4), neck:d(2), head:d(2),
        la:d(-100), le:d(-84), ra:d(-72), re:d(-108),
        ll:d(95), lk:d(-55), rl:d(-70), rk:d(65), hipBob:0};
    }
    if (phase === 'apex') {
      return {chest:d(-2), neck:d(2), head:d(1),
        la:d(-102), le:d(-82), ra:d(-74), re:d(-108),
        ll:d(100), lk:d(-72), rl:d(-65), rk:d(68), hipBob:0};
    }
    // Bring the legs under the hips before impact and return the hands to guard.
    return {chest:d(3), neck:d(1), head:0,
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(25), lk:0, rl:d(-25), rk:0, hipBob:0};
  }
  static land(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(8,[-112,-28,22,52],[40,32,-36,24],4);
    return {chest:d(6), neck:d(-1), head:d(3),
      la:d(-90), le:d(-108), ra:d(-65), re:d(-120),
      ll:d(38), lk:d(-75), rl:d(-38), rk:d(75), hipBob:4};
  }
  static punchWind(profile = null, combo = 0) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (combo === 1) return Pose.staffGrip(17,[-146,-38,-94,-34],[48,30,-48,34],-3);
      if (combo === 2) return Pose.staffGrip(24,[-158,-24,-108,-42],[62,38,-60,42],-5);
      // Draw the rear hand back, keeping both hands spaced along the shaft.
      return Pose.staffGrip(8,[-130,20,-60,100],[30,22,-34,22],0);
    }
    if (profile?.weapon === 'blade') {
      if (combo === 1) return {chest:d(22),neck:d(-3),head:d(4),la:d(-118),le:d(-34),ra:d(-164),re:d(-48),ll:d(48),lk:d(28),rl:d(-56),rk:d(38),hipBob:-3,shPull:12};
      if (combo === 2) return {chest:d(28),neck:d(-5),head:d(5),la:d(-62),le:d(-72),ra:d(-148),re:d(-34),ll:d(60),lk:d(36),rl:d(-64),rk:d(44),hipBob:-5,shPull:14};
      return {chest:d(9),neck:d(2),head:d(1),la:d(-68),le:d(-38),ra:d(-142),re:d(-34),ll:d(30),lk:d(20),rl:d(-34),rk:d(26),hipBob:0,shPull:4};
    }
    if (style === 'ward' && combo === 1) return {chest:d(21),neck:d(-3),head:d(3),la:d(-134),le:d(-64),ra:d(70),re:d(132),ll:d(46),lk:d(26),rl:d(-52),rk:d(34),hipBob:-3,shPull:11};
    if (style === 'ward' && combo === 2) return {chest:d(27),neck:d(-5),head:d(5),la:d(-132),le:d(-62),ra:d(52),re:d(118),ll:d(58),lk:d(34),rl:d(-62),rk:d(42),hipBob:-5,shPull:13};
    if (combo === 1) return {chest:d(15),neck:d(-2),head:d(2),la:d(-112),le:d(-98),ra:d(52),re:d(118),ll:d(34),lk:d(25),rl:d(-38),rk:d(26),hipBob:0,shPull:7};
    if (combo === 2) return {chest:d(19),neck:d(-3),head:d(2),la:d(-126),le:d(-62),ra:d(26),re:d(28),ll:d(50),lk:d(34),rl:d(-46),rk:d(30),hipBob:-2,shPull:8};
    if (style === 'flame') return {chest:d(5),neck:d(-1),head:d(2),la:d(-104),le:d(-108),ra:d(12),re:d(142),ll:d(22),lk:d(12),rl:d(-18),rk:d(20),hipBob:0,shPull:5};
    if (style === 'flash') return {chest:d(3),neck:d(1),head:d(1),la:d(-84),le:d(-68),ra:d(48),re:d(128),ll:d(16),lk:d(14),rl:d(-18),rk:d(18),hipBob:0,shPull:4};
    if (style === 'quake') return {chest:d(19),neck:d(-5),head:d(7),la:d(-110),le:d(-58),ra:d(30),re:d(18),ll:d(27),lk:d(15),rl:d(-22),rk:d(28),hipBob:0,shPull:8};
    if (style === 'ward') return {chest:d(7),neck:d(1),head:d(2),la:d(-136),le:d(-66),ra:d(28),re:d(76),ll:d(28),lk:d(22),rl:d(-26),rk:d(24),hipBob:0,shPull:5};
    // Turn the shoulder back while keeping the lead hand high as a guard.
    return {chest:d(8), neck:d(-1), head:d(4),
      la:d(-92), le:d(-82), ra:d(75), re:d(140),
      ll:d(16), lk:d(20), rl:d(-20), rk:d(18), hipBob:0, shPull:6};
  }
  static punchStrike(over, profile = null, combo = 0) {
    const d = Pose.deg, o = over ? d(10) : 0;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (combo === 1) return Pose.staffGrip(-22,[-82,16,-28,-126],[48,24,-50,30],-3);
      if (combo === 2) return Pose.staffGrip(-31,[-68,20,-18,-136],[62,32,-64,38],-5);
      // Drive both hands forward together for a clear two-hand thrust.
      return Pose.staffGrip(-13,[-90,0,-30,-120],[34,18,-38,18],0);
    }
    if (profile?.weapon === 'blade') {
      if (combo === 1) return {chest:d(-28),neck:d(3),head:d(-2),la:d(-130),le:d(-60),ra:d(-84)-o,re:d(68),ll:d(54),lk:d(30),rl:d(-58),rk:d(38),hipBob:-4};
      if (combo === 2) return {chest:d(-34),neck:d(-4),head:d(4),la:d(-54),le:d(-46),ra:d(-128)-o,re:d(30),ll:d(68),lk:d(38),rl:d(-68),rk:d(44),hipBob:-6};
      return {chest:d(-18),neck:d(-1),head:0,la:d(-48),le:d(-28),ra:d(-78) - o,re:d(-18),ll:d(42),lk:d(24),rl:d(-42),rk:d(24),hipBob:0};
    }
    if (style === 'ward' && combo === 1) return {chest:d(-28),neck:d(3),head:d(-2),la:d(-132),le:d(-70),ra:d(-88)-o,re:d(74),ll:d(52),lk:d(28),rl:d(-58),rk:d(36),hipBob:-3,shPull:0};
    if (style === 'ward' && combo === 2) return {chest:d(-34),neck:d(4),head:d(4),la:d(-138),le:d(-68),ra:d(-100)-o,re:d(88),ll:d(64),lk:d(36),rl:d(-66),rk:d(42),hipBob:-6,shPull:0};
    if (combo === 1) return {chest:d(-16),neck:d(2),head:d(1),la:d(-118),le:d(-96),ra:d(-72),re:d(54),ll:d(42),lk:d(22),rl:d(-44),rk:d(22),hipBob:0};
    if (combo === 2) return {chest:d(-24),neck:d(-3),head:d(-2),la:d(-128),le:d(-60),ra:d(-94),re:d(64),ll:d(56),lk:d(28),rl:d(-52),rk:d(28),hipBob:-2};
    if (style === 'flame') return {chest:d(-3),neck:d(2),head:d(2),la:d(-102),le:d(-108),ra:d(-82),re:d(42),ll:d(20),lk:d(12),rl:d(-20),rk:d(20),hipBob:0};
    if (style === 'flash') return {chest:d(-10),neck:d(1),head:d(0),la:d(-82),le:d(-66),ra:d(-92),re:d(-22),ll:d(14),lk:d(12),rl:d(-16),rk:d(16),hipBob:0};
    if (style === 'quake') return {chest:d(-13),neck:d(3),head:d(6),la:d(-112),le:d(-58),ra:d(-105),re:d(58),ll:d(25),lk:d(14),rl:d(-24),rk:d(26),hipBob:0};
    if (style === 'ward') return {chest:d(-12),neck:d(2),head:d(1),la:d(-140),le:d(-68),ra:d(-90) - o,re:d(-2),ll:d(28),lk:d(22),rl:d(-30),rk:d(26),hipBob:0};
    return {chest:d(-8), neck:d(1), head:d(4),
      la:d(-92), le:d(-82), ra:d(-95) - o, re:d(10) + o * .3,
      ll:d(18), lk:d(16), rl:d(-22), rk:d(20), hipBob:0};
  }
  static punchRec(profile = null, combo = 0) {
    const d = Pose.deg;
    const idle = Pose.idle(profile);
    if (profile?.weapon === 'staff' && combo === 1) return Pose.staffGrip(12,[-124,-28,-76,-48],[40,26,-42,30],-2);
    if (profile?.weapon === 'staff' && combo === 2) return Pose.staffGrip(-8,[-108,-18,30,58],[50,30,-46,28],-3);
    if (profile?.weapon === 'blade' && combo === 1) return {chest:d(12),neck:d(2),head:d(2),la:d(-120),le:d(72),ra:d(-106),re:d(-66),ll:d(38),lk:d(26),rl:d(-38),rk:d(30),hipBob:-2};
    if (profile?.weapon === 'blade' && combo === 2) return {chest:d(-11),neck:d(2),head:d(1),la:d(-116),le:d(64),ra:d(-84),re:d(-50),ll:d(50),lk:d(32),rl:d(-46),rk:d(34),hipBob:-3};
    if (profile?.style === 'ward' && combo === 1) return {...idle,chest:idle.chest + Pose.deg(10),head:idle.head + Pose.deg(2),ra:Pose.deg(-122),re:Pose.deg(-62),ll:Pose.deg(38),rl:Pose.deg(-34),hipBob:-2};
    if (profile?.style === 'ward' && combo === 2) return {...idle,chest:idle.chest + Pose.deg(13),head:idle.head + Pose.deg(3),la:Pose.deg(-138),le:Pose.deg(-68),ra:Pose.deg(-102),re:Pose.deg(-38),ll:Pose.deg(50),lk:Pose.deg(32),rl:Pose.deg(-44),rk:Pose.deg(34),hipBob:-3};
    if (combo === 1) return {...idle, chest: idle.chest + Pose.deg(3), hipBob: -1};
    if (combo === 2) return {...idle, chest: idle.chest + Pose.deg(5), hipBob: -2};
    return idle;
  }
  /** Muay Thai knee chamber with both hands protecting the head. */
  static kickWind(profile = null, linked = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (linked) return Pose.staffGrip(19,[-148,-40,-82,-54],[58,34,-54,38],-4);
      return Pose.staffGrip(12,[-132,-46,-88,-44],[48,26,-42,30],-2);
    }
    if (profile?.weapon === 'blade') {
      if (linked) return {chest:d(18),neck:d(-4),head:d(4),la:d(-104),le:d(-132),ra:d(-152),re:d(-42),ll:d(50),lk:d(30),rl:d(-52),rk:d(38),hipBob:-4,shPull:10};
      return {chest:d(11),neck:d(-1),head:d(2),la:d(-110),le:d(-160),ra:d(-100),re:d(-150),ll:d(30),lk:d(22),rl:d(-34),rk:d(26),hipBob:-1};
    }
    if (style === 'rush') return {chest:d(5),neck:d(1),head:d(2),la:d(-92),le:d(-82),ra:d(-68),re:d(-108),ll:d(102),lk:d(-70),rl:d(-20),rk:d(20),hipBob:-1};
    if (style === 'flash') return {chest:d(5),neck:d(1),head:d(1),la:d(-82),le:d(-66),ra:d(-68),re:d(-102),ll:d(72),lk:d(-82),rl:d(-22),rk:d(20),hipBob:-1};
    if (style === 'quake') return {chest:d(14),neck:d(-3),head:d(5),la:d(-110),le:d(-56),ra:d(-56),re:d(-64),ll:d(128),lk:d(-112),rl:d(-20),rk:d(24),hipBob:-2};
    if (style === 'ward' && linked) return {chest:d(16),neck:d(-4),head:d(4),la:d(-140),le:d(-66),ra:d(-118),re:d(-62),ll:d(122),lk:d(-98),rl:d(-42),rk:d(34),hipBob:-5,shPull:9};
    if (style === 'ward') return {chest:d(-9),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-122),re:d(-58),ll:d(104),lk:d(-82),rl:d(-28),rk:d(26),hipBob:-2};
    return {chest:d(10), neck:d(-2), head:d(3),
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(115), lk:d(-105), rl:d(-16), rk:d(20), hipBob:-2};
  }
  static kickStrike(profile = null, linked = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      // Plant the feet and rotate through a two-hand staff sweep; the active
      // weapon segment is derived from these grip points in weaponGeometry().
      if (linked) return Pose.staffGrip(-25,[-84,18,-30,-130],[50,26,-54,34],-4);
      return Pose.staffGrip(-18,[-95,10,-35,-115],[36,22,-38,24],-2);
    }
    if (profile?.weapon === 'blade') {
      if (linked) return {chest:d(-27),neck:d(4),head:d(-2),la:d(-72),le:d(-108),ra:d(-116),re:d(-42),ll:d(50),lk:d(28),rl:d(-56),rk:d(40),hipBob:-5};
      return {chest:d(-16),neck:d(-2),head:d(1),la:d(-60),le:d(-120),ra:d(-90),re:d(-60),ll:d(34),lk:d(22),rl:d(-36),rk:d(28),hipBob:-2};
    }
    if (style === 'rush') return {chest:d(5),neck:d(-1),head:d(2),la:d(-92),le:d(-82),ra:d(-68),re:d(-108),ll:d(105),lk:d(-8),rl:d(-18),rk:d(20),hipBob:0};
    if (style === 'flash') return {chest:d(10),neck:d(-1),head:d(1),la:d(-86),le:d(-64),ra:d(-62),re:d(-98),ll:d(78),lk:d(-18),rl:d(-18),rk:d(16),hipBob:0};
    if (style === 'quake') return {chest:d(20),neck:d(-4),head:d(5),la:d(-112),le:d(-56),ra:d(-56),re:d(-64),ll:d(130),lk:d(-12),rl:d(-22),rk:d(24),hipBob:0};
    if (style === 'ward' && linked) return {chest:d(-16),neck:d(3),head:d(2),la:d(-130),le:d(-62),ra:d(-34),re:d(-24),ll:d(116),lk:d(-2),rl:d(-50),rk:d(42),hipBob:-4,shPull:0};
    if (style === 'ward') return {chest:d(2),neck:d(1),head:d(1),la:d(-136),le:d(-66),ra:d(-126),re:d(-48),ll:d(78),lk:d(-8),rl:d(-28),rk:d(26),hipBob:0};
    // Turn the hip through and extend the chambered shin across at waist height.
    return {chest:d(16), neck:d(-2), head:d(3),
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(110), lk:d(-20), rl:d(-18), rk:d(22), hipBob:0};
  }
  static kickRec(profile = null, linked = false) {
    const d = Pose.deg;
    const idle = Pose.idle(profile);
    if (profile?.weapon === 'staff' && linked) return Pose.staffGrip(-7,[-112,-26,18,50],[48,30,-46,30],-2);
    if (profile?.weapon === 'blade' && linked) return {chest:d(-8),neck:d(2),head:d(1),la:d(-120),le:d(74),ra:d(-94),re:d(-58),ll:d(42),lk:d(28),rl:d(-42),rk:d(32),hipBob:-2};
    if (profile?.style === 'ward' && linked) return {...idle,chest:idle.chest + Pose.deg(9),head:idle.head + Pose.deg(2),la:Pose.deg(-138),le:Pose.deg(-68),ra:Pose.deg(-112),re:Pose.deg(-54),ll:Pose.deg(56),lk:Pose.deg(34),rl:Pose.deg(-42),rk:Pose.deg(32),hipBob:-2};
    return idle;
  }
  static airPunchWind(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(-14,[-108,-28,18,50],[72,-48,-48,36],0);
    if (profile?.weapon === 'blade') return {chest:d(-12),neck:d(2),head:d(1),la:d(-62),le:d(-32),ra:d(-136),re:d(-30),ll:d(76),lk:d(-50),rl:d(-50),rk:d(38),hipBob:0};
    if (profile?.style === 'rush') return {chest:d(-7),neck:d(2),head:d(2),la:d(-92),le:d(-78),ra:d(46),re:d(118),ll:d(66),lk:d(-42),rl:d(-44),rk:d(34),hipBob:0};
    if (profile?.style === 'flame') return {chest:d(2),neck:d(1),head:d(2),la:d(-104),le:d(-98),ra:d(26),re:d(132),ll:d(78),lk:d(-62),rl:d(-38),rk:d(28),hipBob:0};
    if (profile?.style === 'flash') return {chest:d(-8),neck:d(2),head:d(1),la:d(-78),le:d(-64),ra:d(44),re:d(126),ll:d(72),lk:d(-48),rl:d(-48),rk:d(38),hipBob:0};
    if (profile?.style === 'quake') return {chest:d(12),neck:d(-3),head:d(4),la:d(-110),le:d(-56),ra:d(66),re:d(0),ll:d(100),lk:d(-58),rl:d(-70),rk:d(62),hipBob:0};
    if (profile?.style === 'ward') return {chest:d(-10),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(42),re:d(88),ll:d(78),lk:d(-46),rl:d(-58),rk:d(48),hipBob:0};
    return {chest:d(-5), neck:d(2), head:d(3),
      la:d(-98), le:d(-84), ra:d(70), re:d(125),
      ll:d(92), lk:d(-58), rl:d(-68), rk:d(62), hipBob:0};
  }
  static airPunchStrike(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(-22,[-118,-14,2,40],[-58,4,-40,-4],0);
    if (profile?.weapon === 'blade') return {chest:d(-20),neck:d(-3),head:d(-2),la:d(-42),le:d(-26),ra:d(-82),re:d(-16),ll:d(-66),lk:d(8),rl:d(-48),rk:d(-8),hipBob:0};
    if (profile?.style === 'rush') return {chest:d(-19),neck:d(-2),head:d(-2),la:d(-90),le:d(-76),ra:d(-88),re:d(-12),ll:d(-58),lk:d(6),rl:d(-42),rk:d(-8),hipBob:0};
    if (profile?.style === 'flame') return {chest:d(-12),neck:d(-2),head:d(-1),la:d(-104),le:d(-98),ra:d(-78),re:d(34),ll:d(-44),lk:d(-8),rl:d(-36),rk:d(-2),hipBob:0};
    if (profile?.style === 'flash') return {chest:d(-22),neck:d(-3),head:d(-3),la:d(62),le:d(28),ra:d(-86),re:d(-12),ll:d(-70),lk:d(8),rl:d(-48),rk:d(-8),hipBob:0};
    if (profile?.style === 'quake') return {chest:d(-18),neck:d(-4),head:d(-2),la:d(-105),le:d(60),ra:d(-100),re:d(54),ll:d(-92),lk:d(10),rl:d(-72),rk:d(-14),hipBob:0};
    if (profile?.style === 'ward') return {chest:d(-24),neck:d(-3),head:d(-2),la:d(58),le:d(28),ra:d(-94),re:d(-2),ll:d(-90),lk:d(10),rl:d(-64),rk:d(-12),hipBob:0};
    // Pitch the whole body into the target, drive the fist straight through,
    // and trail both legs behind to read as a committed aerial dive.
    return {chest:d(-28), neck:d(-4), head:d(-5),
      la:d(72), le:d(20), ra:d(-100), re:d(-4),
      ll:d(-105), lk:d(10), rl:d(-72), rk:d(-14), hipBob:0};
  }
  static airKickWind(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(-8,[-108,-30,18,50],[82,-82,-46,34],0);
    if (profile?.weapon === 'blade') return {chest:d(-3),neck:d(1),head:d(1),la:d(-58),le:d(-34),ra:d(-116),re:d(-24),ll:d(82),lk:d(-92),rl:d(-48),rk:d(38),hipBob:0};
    if (profile?.style === 'rush') return {chest:d(-1),neck:d(1),head:d(2),la:d(-92),le:d(-78),ra:d(-68),re:d(-104),ll:d(76),lk:d(-84),rl:d(-48),rk:d(38),hipBob:0};
    if (profile?.style === 'flame') return {chest:d(8),neck:d(-1),head:d(2),la:d(-104),le:d(-98),ra:d(-60),re:d(-96),ll:d(96),lk:d(-102),rl:d(-32),rk:d(24),hipBob:0};
    if (profile?.style === 'flash') return {chest:d(-4),neck:d(1),head:d(1),la:d(-78),le:d(-64),ra:d(-70),re:d(-100),ll:d(82),lk:d(-92),rl:d(-50),rk:d(40),hipBob:0};
    if (profile?.style === 'quake') return {chest:d(15),neck:d(-2),head:d(3),la:d(-108),le:d(-56),ra:d(-56),re:d(-64),ll:d(130),lk:d(-112),rl:d(-70),rk:d(60),hipBob:0};
    if (profile?.style === 'ward') return {chest:d(-2),neck:d(1),head:d(1),la:d(-136),le:d(-66),ra:d(-120),re:d(-54),ll:d(96),lk:d(-92),rl:d(-60),rk:d(52),hipBob:0};
    return {chest:d(8), neck:d(-1), head:d(3),
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(112), lk:d(-100), rl:d(-70), rk:d(62), hipBob:0};
  }
  static airKickStrike(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(5,[-106,-25,20,46],[108,-14,-42,30],0);
    if (profile?.weapon === 'blade') return {chest:d(9),neck:d(-1),head:d(1),la:d(-54),le:d(-30),ra:d(-104),re:d(-20),ll:d(88),lk:d(-16),rl:d(-46),rk:d(36),hipBob:0};
    if (profile?.style === 'rush') return {chest:d(6),neck:d(0),head:d(2),la:d(-92),le:d(-78),ra:d(-68),re:d(-104),ll:d(82),lk:d(-18),rl:d(-44),rk:d(34),hipBob:0};
    if (profile?.style === 'flame') return {chest:d(16),neck:d(-2),head:d(2),la:d(-104),le:d(-98),ra:d(-60),re:d(-96),ll:d(98),lk:d(-12),rl:d(-32),rk:d(24),hipBob:0};
    if (profile?.style === 'flash') return {chest:d(8),neck:d(-1),head:d(1),la:d(-82),le:d(-62),ra:d(-68),re:d(-98),ll:d(84),lk:d(-16),rl:d(-46),rk:d(38),hipBob:0};
    if (profile?.style === 'quake') return {chest:d(20),neck:d(-3),head:d(4),la:d(-108),le:d(-56),ra:d(-56),re:d(-64),ll:d(132),lk:d(-12),rl:d(-70),rk:d(58),hipBob:0};
    if (profile?.style === 'ward') return {chest:d(2),neck:d(-1),head:d(1),la:d(-136),le:d(-66),ra:d(-120),re:d(-54),ll:d(82),lk:d(-8),rl:d(-58),rk:d(50),hipBob:0};
    return {chest:d(12), neck:d(-1), head:d(3),
      la:d(-92), le:d(-82), ra:d(-68), re:d(-108),
      ll:d(108), lk:d(-18), rl:d(-65), rk:d(55), hipBob:0};
  }
  static specialWind(profile = null, comboFinisher = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (comboFinisher) return Pose.staffGrip(21,[-150,-34,-104,-42],[64,36,-62,40],-5);
      return Pose.staffGrip(-10,[-126,-26,18,48],[38,22,-40,22],0);
    }
    if (profile?.weapon === 'blade') {
      if (comboFinisher) return {chest:d(24),neck:d(-5),head:d(4),la:d(-118),le:d(-146),ra:d(-160),re:d(-42),ll:d(62),lk:d(38),rl:d(-64),rk:d(44),hipBob:-5,shPull:13};
      return {chest:d(-12),neck:d(2),head:d(1),la:d(-48),le:d(-30),ra:d(-150),re:d(-28),ll:d(34),lk:d(22),rl:d(-40),rk:d(28),hipBob:0};
    }
    if (style === 'flame') return {chest:d(17),neck:d(-3),head:d(3),la:d(-110),le:d(-100),ra:d(28),re:d(150),ll:d(115),lk:d(-104),rl:d(-24),rk:d(20),hipBob:-2};
    if (style === 'flash') return {chest:d(8),neck:d(1),head:d(1),la:d(-84),le:d(-72),ra:d(-36),re:d(112),ll:d(68),lk:d(-76),rl:d(-24),rk:d(20),hipBob:0};
    if (style === 'quake') return {chest:d(22),neck:d(-6),head:d(7),la:d(25),le:d(30),ra:d(-110),re:d(-65),ll:d(130),lk:d(-100),rl:d(-24),rk:d(24),hipBob:-3};
    if (style === 'ward' && comboFinisher) return {chest:d(23),neck:d(-5),head:d(5),la:d(-142),le:d(-76),ra:d(52),re:d(126),ll:d(52),lk:d(34),rl:d(-58),rk:d(40),hipBob:-5,shPull:12};
    if (style === 'ward') return {chest:d(-9),neck:d(2),head:d(1),la:d(-140),le:d(-68),ra:d(-112),re:d(-68),ll:d(30),lk:d(24),rl:d(-28),rk:d(26),hipBob:0};
    return {chest:d(10), neck:d(-4), head:d(-6),
      la:d(-90), le:d(-50), ra:d(30), re:d(-100),
      ll:d(-40), lk:d(95), rl:d(20), rk:d(25), hipBob:0};
  }
  static specialDash(profile = null, comboFinisher = false) {
    const d = Pose.deg;
    const style = profile?.style;
    if (profile?.weapon === 'staff') {
      if (comboFinisher) return Pose.staffGrip(-29,[-74,18,-20,-136],[74,-36,-62,40],-5);
      return Pose.staffGrip(-20,[-140,-18,-8,48],[76,-46,-48,34],0);
    }
    if (profile?.weapon === 'blade') {
      if (comboFinisher) return {chest:d(-34),neck:d(5),head:d(3),la:d(-86),le:d(-112),ra:d(-126),re:d(18),ll:d(74),lk:d(-36),rl:d(-66),rk:d(44),hipBob:-6};
      return {chest:d(-18),neck:d(2),head:0,la:d(-38),le:d(-22),ra:d(-86),re:d(-12),ll:d(78),lk:d(-44),rl:d(-48),rk:d(32),hipBob:0};
    }
    if (style === 'flame') return {chest:d(22),neck:d(-5),head:d(-3),la:d(80),le:d(32),ra:d(-90),re:d(60),ll:d(125),lk:d(-15),rl:d(-28),rk:d(36),hipBob:0};
    if (style === 'flash') return {chest:d(15),neck:d(1),head:d(0),la:d(68),le:d(24),ra:d(-38),re:d(102),ll:d(86),lk:d(-14),rl:d(-34),rk:d(28),hipBob:0};
    if (style === 'quake') return {chest:d(28),neck:d(-8),head:d(8),la:d(35),le:d(40),ra:d(-105),re:d(-62),ll:d(145),lk:d(-14),rl:d(-18),rk:d(25),hipBob:0};
    if (style === 'ward' && comboFinisher) return {chest:d(-32),neck:d(5),head:d(3),la:d(-138),le:d(-66),ra:d(-102),re:d(72),ll:d(54),lk:d(30),rl:d(-62),rk:d(42),hipBob:-5};
    if (style === 'ward') return {chest:d(-10),neck:d(1),head:d(1),la:d(-138),le:d(-64),ra:d(-92),re:d(-8),ll:d(30),lk:d(22),rl:d(-28),rk:d(26),hipBob:0};
    return {chest:d(18), neck:d(-6), head:d(-4),
      la:d(100), le:d(35), ra:d(-70), re:d(40),
      ll:d(110), lk:d(5), rl:d(-35), rk:d(40), hipBob:0};
  }
  static block(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(-10,[-132,-22,18,48],[38,20,-40,22],0);
    if (profile?.weapon === 'blade') return {chest:d(-8),neck:d(2),head:d(1),la:d(-120),le:d(80),ra:d(-60),re:d(-80),shPull:0,ll:d(34),lk:d(24),rl:d(-34),rk:d(26),hipBob:0};
    if (profile?.style === 'flame') return {chest:d(-1),neck:d(1),head:d(1),la:d(-100),le:d(-112),ra:d(-62),re:d(-104),shPull:3,ll:d(22),lk:d(12),rl:d(-20),rk:d(22),hipBob:0};
    if (profile?.style === 'flash') return {chest:d(-7),neck:d(2),head:d(1),la:d(-78),le:d(-62),ra:d(-66),re:d(-98),shPull:0,ll:d(16),lk:d(14),rl:d(-18),rk:d(18),hipBob:0};
    if (profile?.style === 'quake') return {chest:d(7),neck:d(-2),head:d(4),la:d(-108),le:d(-62),ra:d(-56),re:d(-68),shPull:0,ll:d(24),lk:d(18),rl:d(-20),rk:d(24),hipBob:0};
    if (profile?.style === 'ward') return {chest:d(-6),neck:d(2),head:d(1),la:d(-136),le:d(-66),ra:d(-112),re:d(-68),shPull:0,ll:d(28),lk:d(22),rl:d(-28),rk:d(26),hipBob:0};
    // Tight high guard under fv=-face, matching the boxing idle stance.
    return {chest:d(-2), neck:d(1), head:d(3),
      la:d(-88), le:d(-112), ra:d(-62), re:d(-120), shPull:5,
      ll:d(14), lk:d(22), rl:d(-16), rk:d(20), hipBob:0};
  }
  static hit(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(18,[-124,-18,12,56],[28,36,-34,40],0);
    // Chest/neck/head signs flipped for fv so torso recoils AWAY (~15°); arms stay toward foe
    return {chest:d(15), neck:d(8), head:d(15),
      la:d(-100), le:d(-40), ra:d(-90), re:d(-35),
      ll:d(22), lk:d(28), rl:d(-30), rk:d(35), hipBob:0};
  }
  static ragdoll(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(46,[-98,-40,30,74],[48,54,-56,62],0);
    return {chest:d(8),neck:d(4),head:d(8),la:d(-25),le:d(-82),ra:d(18),re:d(76),ll:d(26),lk:d(38),rl:d(-34),rk:d(48),hipBob:0};
  }
  static koSprawl(profile = null) {
    const d = Pose.deg;
    if (profile?.weapon === 'staff') return Pose.staffGrip(58,[-92,-20,24,38],[76,26,-82,38],8);
    // Fall away from attacker under fv; arms ~horizontal toward foe (compensate lean)
    return {chest:d(55), neck:d(20), head:d(25),
      la:d(-95), le:d(-20), ra:d(-95), re:d(-20),
      ll:d(70), lk:d(20), rl:d(-80), rk:d(30), hipBob:8};
  }
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
    const kickR = Moves.kick.reach, punchR = Moves.punch.reach;
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
    else Bot.mode = Math.random() < .4 ? 'poke' : 'pressure';
    Bot.modeT = .35 + Math.random() * .45;
  }
  static update(dt, me, foe) {
    const p = Input.pad[1];
    Input.acts.forEach(a => p[a] = 0);
    const cfg = Bot.cfg();
    Bot.wait -= dt; Bot.cool -= dt; Bot.react -= dt; Bot.blockT -= dt; Bot.modeT -= dt;
    if (Bot.pendingT > 0) Bot.pendingT -= dt;
    if (!Game.fighting || me.stun > 0) return;
    // While attacking: only chain punches or cancel kick windup into punch
    if (me.atk) {
      if (me.canChainPunch() && Bot.stringLeft > 0) {
        p.punch = 1; Bot.stringLeft = Math.max(0, Bot.stringLeft - 1); return;
      }
      return;
    }
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
      // Whiffed / recovering kick is a punch punish; otherwise poke
      const punchPunish = Bot.whiffedKick(foe, dist) || dist < Moves.punch.reach;
      Bot.queue(punchPunish ? 'punch' : 'kick', cfg.react * .7);
      if (punchPunish) Bot.stringLeft = Math.max(Bot.stringLeft, Moves.punch.chainMax - 1);
      Bot.mode = 'retreat'; Bot.modeT = .3; return;
    }

    if (Bot.mode === 'approach') {
      if (dir < 0) p.left = 1; else p.right = 1;
      if (dist < Moves.kick.reach && Bot.cool <= 0 && Math.random() < .4) Bot.queue('kick');
      return;
    }
    if (Bot.mode === 'poke') {
      if (dist > Moves.kick.reach + 5) { if (dir < 0) p.left = 1; else p.right = 1; }
      else if (dist < Moves.kick.reach - 25) { if (dir < 0) p.right = 1; else p.left = 1; }
      if (Bot.cool <= 0 && dist <= Moves.punch.reach && Math.random() < cfg.aggro * .85) {
        Bot.queue('punch'); Bot.stringLeft = Math.max(Bot.stringLeft, Moves.punch.chainMax - 1);
      } else if (Bot.cool <= 0 && dist < Moves.kick.reach + 10 && dist > Moves.punch.reach && Math.random() < cfg.aggro) {
        Bot.queue('kick'); Bot.stringLeft = 0;
      } else if (Bot.cool <= 0 && Math.random() < (1 - cfg.aggro) * .02) Bot.wait = .2 + Math.random() * .4;
      return;
    }
    if (Bot.mode === 'pressure') {
      if (dir < 0) p.left = 1; else p.right = 1;
      if (Bot.cool <= 0 && dist < Moves.punch.reach && Math.random() < cfg.aggro) {
        Bot.queue('punch');
        Bot.stringLeft = Math.max(Bot.stringLeft, Moves.punch.chainMax - 1);
      } else if (Bot.cool <= 0 && dist < Moves.kick.reach && dist > Moves.punch.reach - 10 && Math.random() < cfg.aggro * .5)
        Bot.queue('kick');
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
  static S = 1.2;
  static ARM = 18 * 1.2;
  static LEG = 20 * 1.2;
  static TORSO = 22 * 1.2;
  static NECK = 8 * 1.2;
  static RUN_SPEED = 220;
  static GROUND_ACCEL = 1300;
  static GROUND_BRAKE = 1800;
  static TURN_ACCEL = 1700;
  constructor(x, color, side, tag) {
    this.color = color; this.tag = tag; this.playerControlled = tag === 'YOU';
    this.weaponType = null; this.attackSpeed = 1; this.damageMultiplier = 1;
    this.specialDamageMultiplier = 1; this.meterGainMultiplier = 1;
    this.meter = 0; this.reset(x, side);
  }
  reset(x, side) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = side;
    this.grounded = true; this.state = 'idle'; this.walkT = 0; this.animT = 0;
    this.pose = Pose.idle(this.classProfile); this.poseFrom = Pose.copy(this.pose); this.poseTo = Pose.copy(this.pose);
    this.blendT = 1; this.blendDur = .08; this.poseKey = 'idle';
    this.hp = 100; this.chip = 100; this.stun = 0; this.flash = 0; this.blocking = 0;
    this.atk = null; this.atkT = 0; this.hitDone = 0; this.dashLeft = 0;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0; this.wardShieldT = 0;
    this.hitConfirmed = 0; this.comboHits = 0; this.comboTimer = 0; this.comboStunEffectT = 0;
    this.dodgeT = 0; this.dodgeCooldown = 0; this.rollVx = 0;
    this.chain = 0; this.chainArmed = 0;
    this.hitbox = {x:0,y:0,w:42,h:135}; this.blockFlash = 0;
    this.landSquash = 0; this.koT = 0; this.atkPhase = '';
    this.damageBurst = 0; this.damageBurstT = 0;
    this.invincibleT = 0;
    this.attackBoostT = 0;
    this.ragdollActive = false; this.ragdollKO = false; this.ragdollElapsed = 0;
    this.ragdollDirection = 0; this.ragdollAngle = 0; this.ragdollFrom = null;
    this.punchSoft = 0;
  }
  setClass(id) {
    this.classId = FighterClasses[id] ? id : null;
    this.classProfile = this.classId ? FighterClasses[this.classId] : null;
    if (this.classProfile) this.color = this.classProfile.color;
  }
  gainMeter(n) { this.meter = Math.min(100, this.meter + n * (this.classProfile?.meter || 1) * this.meterGainMultiplier); }
  static comboMessage(hit, state, comboHits) {
    if (hit.comboFinisher) return 'SUPER FINISHER +25%';
    if (hit.comboLink && state === 'kick') return 'HEAVY LINK +25%';
    if (hit.comboLink && state === 'punch') return hit.chain >= 2 ? 'RISING FINISHER +80%' : 'HOOK LINK +40%';
    return comboHits + ' HIT COMBO!';
  }
  confirmHit(kind, damage) {
    if ((kind !== 'hit' && kind !== 'armored') || damage <= 0) return false;
    this.hitConfirmed = 1;
    if (this.comboTimer <= 0) this.comboHits = 0;
    this.comboHits++;
    this.comboTimer = 1.35;
    return true;
  }
  aim(key, target, dur) {
    if (this.poseKey === key && this.blendT >= this.blendDur) {
      this.poseTo = target; return;
    }
    if (this.poseKey === key) { this.poseTo = target; return; }
    // R3-1: 15°/frame soft-step ONLY in punch recovery (+ trailing idle). Windup/strike snap freely.
    if (key === 'pr') this.punchSoft = 1;
    else if (/^(pw|pwd|ps|ps2)$/.test(key)) this.punchSoft = 0;
    this.poseFrom = Pose.copy(this.pose); this.poseTo = target;
    this.blendT = 0; this.blendDur = Math.max(.04, dur); this.poseKey = key;
  }
  tickPose(dt) {
    this.blendT = Math.min(this.blendDur, this.blendT + dt);
    const u = Pose.easeOut(this.blendDur <= 0 ? 1 : this.blendT / this.blendDur);
    const lerped = Pose.lerp(this.poseFrom, this.poseTo, u);
    let next = lerped;
    // R3-1/R2-2: shortest-path lerp; ≤15°/frame only while punchSoft (recovery + trailing idle)
    if (this.punchSoft) {
      next = Pose.stepAngles(this.pose, lerped, Pose.deg(15));
      next.hipBob = lerped.hipBob;
      next.shPull = lerped.shPull;
    }
    this.pose = next;
    if (this.punchSoft && this.blendT >= this.blendDur) {
      let settled = true;
      for (const k of Pose.ANGLE_KEYS) {
        if (Math.abs(Pose.angleDelta(this.pose[k], this.poseTo[k])) > Pose.deg(0.5)) { settled = false; break; }
      }
      if (settled && this.poseKey !== 'pr') this.punchSoft = 0;
    }
    if (this.landSquash > 0) {
      this.landSquash = Math.max(0, this.landSquash - dt);
      const k = this.landSquash / .08;
      this.pose.hipBob = (this.pose.hipBob || 0) + 4 * k;
    }
  }
  bones() {
    // Pose lead/guard sits on la; under +face that pointed away (back-to-back).
    // fv mirrors torso+arms toward the foe; legs keep +face for stance/kicks.
    const s = Fighter.S, g = Game.GROUND + this.y, f = this.face, fv = -this.face, p = this.pose;
    const hr = Game.hr, hw = Game.lw / 2;
    const arm = Fighter.ARM, leg = Fighter.LEG, torso = Fighter.TORSO, neckL = Fighter.NECK;
    const hip = {x: this.x, y: g - 40 * s + (p.hipBob || 0)};
    const chest = {
      x: hip.x + Math.sin(p.chest * fv) * torso,
      y: hip.y - Math.cos(p.chest) * torso
    };
    const neck = {
      x: chest.x + Math.sin((p.chest + p.neck) * fv) * neckL,
      y: chest.y - Math.cos(p.chest + p.neck) * neckL
    };
    const head = {
      x: neck.x + Math.sin((p.chest + p.neck + p.head) * fv) * (hr * .15),
      y: neck.y - hr * .85
    };
    const sh = chest;
    const pts = [hip, chest, neck, head];
    const seg = (o, len, a1, a2) => {
      const j = {x: o.x + Math.sin(a1) * len, y: o.y + Math.cos(a1) * len};
      const e = {x: j.x + Math.sin(a1 + a2) * len, y: j.y + Math.cos(a1 + a2) * len};
      pts.push(j, e); return {j, e};
    };
    // shPull: lead shoulder chambers back ~6px away from foe (visual only; combatBones untouched)
    const pull = p.shPull || 0;
    const shL = sh;
    const shR = pull ? { x: sh.x - pull * f, y: sh.y } : sh;
    const Larm = seg(shL, arm, p.la * fv, p.le * fv);
    const Rarm = seg(shR, arm, p.ra * fv, p.re * fv);
    const Lleg = seg(hip, leg, p.ll * f, p.lk * f);
    const Rleg = seg(hip, leg, p.rl * f, p.rk * f);
    // Head is a filled circle radius hr; limbs use stroke half-width hw
    let x0 = head.x - hr, x1 = head.x + hr, y0 = head.y - hr, y1 = head.y + hr;
    for (const q of pts) {
      if (q === head) continue;
      x0 = Math.min(x0, q.x - hw); x1 = Math.max(x1, q.x + hw);
      y0 = Math.min(y0, q.y - hw); y1 = Math.max(y1, q.y + hw);
    }
    return {
      hip, chest, neck, sh, shL, shR, head, hr,
      la: Larm.e, ra: Rarm.e, ll: Lleg.e, rl: Rleg.e,
      laJ: Larm.j, raJ: Rarm.j, llJ: Lleg.j, rlJ: Rleg.j,
      x0, x1, y0, y1,
      lens: {arm, leg, torso, neck: neckL}
    };
  }
  /** Main 87f3bab pose for the current combat state (no blend). */
  combatPose() {
    // Arcade class poses also drive their strike geometry, so a Muay Thai elbow,
    // ninja spin, heavy hammerfist, or open-palm thrust lines up with its drawing.
    if (this.classProfile && this.pose) {
      const p = this.pose;
      return {torso:p.chest,la:p.la,le:p.le,ra:p.ra,re:p.re,ll:p.ll,lk:p.lk,rl:p.rl,rk:p.rk};
    }
    if (this.hp <= 0 || this.state === 'ko' || this.state === 'hit' || this.stun > 0) return CombatPose.hit();
    if (this.atk) {
      if (this.state === 'special') return this.atkT <= this.atk.su ? CombatPose.windup() : CombatPose.special();
      if (this.state === 'airPunch') return CombatPose.airPunch();
      if (this.state === 'airKick') return CombatPose.airKick();
      return this.state === 'kick' ? CombatPose.kick() : CombatPose.punch();
    }
    if (this.blocking) return CombatPose.block();
    if (!this.grounded) return CombatPose.jump();
    if (this.state === 'walk') return CombatPose.walk(this.walkT);
    return CombatPose.idle();
  }
  /** Exact main limb tip geometry — strike + clamp only; draw uses bones(). */
  combatBones() {
    // Arcade class weapons must use the rendered hand/foot points. The legacy
    // reconstruction below places its shoulder above bones(), which is enough
    // to make a long staff sweep look connected while its collision line floats.
    if (this.classProfile) return this.bones();
    const s = Fighter.S, g = Game.GROUND + this.y, f = this.face, p = this.combatPose(), hr = Game.hr, hw = Game.lw / 2;
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
    let linked = false;
    if (kind === 'special') {
      if (this.meter < 100) return;
      this.meter = 0; this.dashLeft = Game.W * (this.classProfile?.dash || .14);
      this.chain = 0; this.chainArmed = 0;
    } else if (kind === 'punch') {
      const m = Moves.punch;
      let n = 0;
      const heavyLink = this.state === 'kick' && this.canChainPunch();
      const linking = (this.chainArmed > 0) || this.canChainPunch();
      linked = linking;
      if (heavyLink) n = 1;
      else if (linking) n = Math.min(this.chain + 1, m.chainMax - 1);
      this.chain = n;
      this.chainArmed = 0;
    } else {
      linked = kind === 'kick' && this.canChainHeavy();
      this.chain = 0; this.chainArmed = 0;
    }
    this.atk = Atk.of(kind, kind === 'punch' ? this.chain : 0);
    if (this.atk) {
      // Player specials release quickly; CPU specials telegraph longer to give players a dodge window.
      if (kind === 'special') this.atk.su = Math.round((this.playerControlled ? .5 : 1.25) / Game.STEP);
      const style = this.classProfile?.style;
      const timings = {
        rush: {punch:[6,3,10],kick:[9,4,15]}, flame:{punch:[8,3,13],kick:[11,5,18]},
        flash:{punch:[5,3,9],kick:[8,4,12]}, quake:{punch:[10,3,17],kick:[14,5,22]},
        ward:{punch:[4,3,9],kick:[9,4,15]},
      }[style];
      if (timings && (kind === 'punch' || kind === 'kick')) {
        const timing = timings[kind];
        if (kind !== 'punch' || !this.chain) [this.atk.su,this.atk.ac,this.atk.re] = timing;
      }
      const attackSpeed = this.attackSpeed * (this.classProfile?.attackSpeed || 1);
      if (kind !== 'special' && attackSpeed !== 1) {
        this.atk.su = Math.max(1, Math.round(this.atk.su / attackSpeed));
        this.atk.ac = Math.max(1, Math.round(this.atk.ac / attackSpeed));
        this.atk.re = Math.max(1, Math.round(this.atk.re / attackSpeed));
      }
      const multiplier = kind === 'special' ? (this.classProfile?.superPower || 1)
        : kind === 'kick' || kind === 'airKick' ? (this.classProfile?.kick || 1)
          : (this.classProfile?.punch || 1);
      this.atk.dmg *= multiplier * (kind === 'special' ? 3 : 1) * this.damageMultiplier;
      const attackBoost = this.playerControlled && this.attackBoostT > 0 ? BeatEmUp.energyDrinkDamageMultiplier : 1;
      this.atk.dmg *= attackBoost;
      if (this.atk.chip != null) this.atk.chip *= attackBoost;
      if (kind === 'special' && !this.playerControlled) this.atk.dmg *= this.specialDamageMultiplier;
      if (linked && kind === 'kick') this.atk.dmg *= 1.25;
      this.atk.linked = linked;
      if (kind === 'special' && this.comboHits >= 2 && this.comboTimer > 0) {
        this.atk.dmg *= 1.25;
        this.atk.chip *= 1.25;
        this.atk.comboFinisher = true;
      }
      if (kind === 'special') this.atk.kb *= multiplier;
      if (Math.random() < (this.classProfile?.criticalChance ?? .1)) {
        this.atk.critical = true;
        this.atk.dmg *= this.classProfile?.criticalDamage ?? 1.6;
        this.atk.kb *= 1.2;
      }
      if (kind === 'special' && this.classProfile) {
        const hitCount = this.classProfile?.superHits || (style === 'rush' ? 2 : style === 'flame' ? 4 : style === 'ward' ? 5 : 1);
        this.atk.hitCount = hitCount;
        this.atk.dmg /= hitCount;
        this.atk.chip /= hitCount;
      }
    }
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = kind; this.blocking = 0;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
    if (kind === 'special') {
      const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
      Fx.superCharge(this.x - cameraX, Game.GROUND + this.y - 44 * Fighter.S, this.classProfile);
      Sfx.play('super-charge', this.classProfile);
    } else if (kind === 'kick' || kind === 'airKick') Sfx.play('kick', this.classProfile);
    else Sfx.play('punch', this.classProfile);
  }
  canChainPunch() {
    if (!this.atk || !this.hitConfirmed) return false;
    const a = this.atk;
    if (this.state === 'kick') {
      const total = a.su + a.ac + a.re;
      const intoRecovery = this.atkT - (a.su + a.ac);
      return this.atkT > a.su + a.ac && this.atkT < total && intoRecovery <= (a.chainWindow || Moves.kick.chainWindow);
    }
    if (this.state !== 'punch' || this.chain + 1 >= Moves.punch.chainMax) return false;
    if (this.atkT <= a.su + a.ac) return false;
    const intoRe = this.atkT - (a.su + a.ac);
    return intoRe <= (a.chainWindow || Moves.punch.chainWindow);
  }
  canChainHeavy() {
    if (!this.atk || this.state !== 'punch' || !this.hitConfirmed) return false;
    const a = this.atk;
    const intoRecovery = this.atkT - (a.su + a.ac);
    return this.atkT > a.su + a.ac && this.atkT < a.su + a.ac + a.re && intoRecovery <= Moves.punch.chainWindow;
  }
  driveAtkPose(dt) {
    const a = this.atk, t = this.atkT;
    // Visual phases read su/ac/re from this.atk (Moves via Atk.of) — chain hits use chainSu/Ac/Re
    if (this.state === 'special') {
      if (t <= a.su) {
        if (this.atkPhase !== 'sw') { this.aim('sw', Pose.specialWind(this.classProfile, a.comboFinisher), a.su * Game.STEP); this.atkPhase = 'sw'; }
      } else if (t <= a.su + a.ac) {
        if (this.atkPhase !== 'ss') {
          this.aim('ss', Pose.specialDash(this.classProfile, a.comboFinisher), .05); this.atkPhase = 'ss';
          Sfx.play('super-dash', this.classProfile);
        }
      } else if (this.atkPhase !== 'sr') { this.aim('sr', Pose.idle(this.classProfile), a.re * Game.STEP); this.atkPhase = 'sr'; }
      return;
    }
    if (this.state === 'kick') {
      if (t <= a.su) {
        if (this.atkPhase !== 'kw') { this.aim('kw', Pose.kickWind(this.classProfile, a.linked), a.su * Game.STEP); this.atkPhase = 'kw'; }
      } else if (t <= a.su + a.ac) {
        if (this.atkPhase !== 'ks') {
          this.aim('ks', Pose.kickStrike(this.classProfile, a.linked), .04); this.atkPhase = 'ks';
        }
      } else if (this.atkPhase !== 'kr') { this.aim('kr', Pose.kickRec(this.classProfile, a.linked), a.re * Game.STEP); this.atkPhase = 'kr'; }
      return;
    }
    if (this.state === 'airPunch' || this.state === 'airKick') {
      const punch = this.state === 'airPunch';
      const wind = punch ? Pose.airPunchWind(this.classProfile) : Pose.airKickWind(this.classProfile);
      const strike = punch ? Pose.airPunchStrike(this.classProfile) : Pose.airKickStrike(this.classProfile);
      const prefix = punch ? 'ap' : 'ak';
      if (t <= a.su) {
        if (this.atkPhase !== prefix + 'w') { this.aim(prefix + 'w', wind, a.su * Game.STEP); this.atkPhase = prefix + 'w'; }
      } else if (t <= a.su + a.ac) {
        if (this.atkPhase !== prefix + 's') {
          this.aim(prefix + 's', strike, .035);
          this.pose = Pose.copy(strike); this.poseFrom = Pose.copy(strike); this.poseTo = Pose.copy(strike);
          this.blendT = this.blendDur; this.atkPhase = prefix + 's';
        }
      } else {
        const phase = Pose.jumpPhase(this.vy);
        const key = prefix + 'r-' + phase;
        if (this.atkPhase !== key) { this.aim(key, Pose.jump(phase, this.classProfile), .09); this.atkPhase = key; }
      }
      return;
    }
    // punch — visual pull-back on bones() only (AC6/AC7); combatBones/hit frames unchanged
    const pullFr = Math.max(1, Math.round(a.su * 0.4));
    if (t <= pullFr) {
      if (this.atkPhase !== 'pw') {
        this.aim('pw', Pose.punchWind(this.classProfile, a.chain || 0), pullFr * Game.STEP);
        this.atkPhase = 'pw';
      }
    } else if (t <= a.su) {
      // Rest of windup drives forward to land on the hit frame; 10° overshoot kept (punchStrike true)
      if (this.atkPhase !== 'pwd') {
        this.aim('pwd', Pose.punchStrike(true, this.classProfile, a.chain || 0), Math.max(Game.STEP, (a.su - pullFr) * Game.STEP));
        this.atkPhase = 'pwd';
      }
    } else if (t <= a.su + a.ac) {
      // R3-1: first active frame at full extension incl. 10° overshoot (1–2 frame snap is intended)
      if (this.atkPhase !== 'ps') {
        const strike = Pose.punchStrike(true, this.classProfile, a.chain || 0);
        this.aim('ps', strike, .03); this.atkPhase = 'ps';
        this.pose = Pose.copy(strike);
        this.poseFrom = Pose.copy(strike);
        this.poseTo = Pose.copy(strike);
        this.blendT = this.blendDur;
        this.punchSoft = 0;
      }
    } else if (this.atkPhase !== 'pr') {
      // AC7 / R2-2: ease back to idle over full recovery; ≤15°/frame soft-step
      this.aim('pr', Pose.punchRec(this.classProfile, a.chain || 0), a.re * Game.STEP); this.atkPhase = 'pr';
    }
  }
  landCheck(wasAir) {
    if (wasAir && this.y >= 0) {
      this.y = 0; this.vy = 0; this.grounded = true; Fx.land(this.x);
      this.landSquash = .08; this.aim('land', Pose.land(this.classProfile), .05);
      return true;
    }
    if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    return false;
  }
  startRoll(slot, other) {
    const axis = (Input.held(slot, 'right') ? 1 : 0) - (Input.held(slot, 'left') ? 1 : 0);
    const direction = axis || (other.x >= this.x ? -1 : 1);
    this.atk = null; this.atkT = 0; this.atkPhase = ''; this.dashLeft = 0;
    this.chain = 0; this.chainArmed = 0; this.blocking = 0;
    this.dodgeT = .48; this.dodgeCooldown = 1.05; this.rollVx = direction * 460;
    this.state = 'roll'; this.aim('roll', Pose.roll(this.classProfile), .045);
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    Fx.dodge(this.x - cameraX, Game.GROUND + this.y - 34 * Fighter.S, this.classProfile);
    Sfx.play('dodge', this.classProfile);
  }
  moveGround(dt, slot, speedScale = 1) {
    let ax = 0;
    if (Input.held(slot, 'left')) ax--;
    if (Input.held(slot, 'right')) ax++;
    const targetVx = ax * Fighter.RUN_SPEED * speedScale;
    const reversing = ax !== 0 && this.vx * ax < 0;
    const accel = ax === 0 ? Fighter.GROUND_BRAKE : reversing ? Fighter.TURN_ACCEL : Fighter.GROUND_ACCEL;
    const deltaV = targetVx - this.vx;
    this.vx += Math.sign(deltaV) * Math.min(Math.abs(deltaV), accel * dt);
    if (Math.abs(this.vx) < 4 && ax === 0) this.vx = 0;
    this.x += this.vx * dt;
    return { ax, speedRatio: Math.min(1, Math.abs(this.vx) / Fighter.RUN_SPEED) };
  }
  update(dt, other, slot) {
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.attackBoostT = Math.max(0, this.attackBoostT - dt);
    this.comboStunEffectT = Math.max(0, this.comboStunEffectT - dt);
    if (this.comboTimer <= 0) this.comboHits = 0;
    this.wardShieldT = Math.max(0, this.wardShieldT - dt);
    this.invincibleT = Math.max(0, this.invincibleT - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.damageBurstT = Math.max(0, this.damageBurstT - dt);
    if (this.damageBurstT <= 0) this.damageBurst = 0;
    if (this.flash > 0) this.flash -= dt;
    if (this.blockFlash > 0) this.blockFlash -= dt;
    if (this.chip > this.hp) this.chip = Math.max(this.hp, this.chip - (100 * dt / .3));
    this.animT += dt;
    if (this.hp <= 0 && !this.ragdollActive) this.startRagdoll(null, true);
    if (this.ragdollActive) {
      this.updateRagdoll(dt);
      this.clamp();
      return;
    }
    if (this.stun > 0) {
      const wasAir = this.y < 0 || !this.grounded;
      this.stun--; this.vx *= .92; this.x += this.vx * dt; this.vy += 1600 * dt; this.y += this.vy * dt;
      this.landCheck(wasAir);
      this.aim('hit', Pose.hit(this.classProfile), .05);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    const rollPressed = Input.edge(slot, 'roll');
    if (this.dodgeT > 0) {
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      this.x += this.rollVx * dt;
      this.vx = this.rollVx;
      this.aim('roll', Pose.roll(this.classProfile), .04); this.tickPose(dt);
      if (this.dodgeT <= 0) { this.vx = 0; this.state = 'idle'; this.aim('idle', Pose.idle(this.classProfile), .08); }
      this.clamp(other); return;
    }
    if (rollPressed && Game.fighting && this.grounded && this.dodgeCooldown <= 0 && this.state !== 'special') {
      this.startRoll(slot, other);
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      this.x += this.rollVx * dt; this.vx = this.rollVx;
      this.aim('roll', Pose.roll(this.classProfile), .04); this.tickPose(dt);
      this.clamp(other); return;
    }
    if (this.atk) {
      // Confirmed Normal links into Heavy; landed Heavy links into a fresh Normal string.
      if (this.grounded && Input.edge(slot, 'punch')) {
        if (this.canChainPunch()) {
          this.startAtk('punch');
          this.driveAtkPose(dt);
          this.tickPose(dt);
          this.clamp(other); return;
        }
      }
      if (this.grounded && Input.edge(slot, 'kick') && this.canChainHeavy()) {
        this.startAtk('kick');
        this.driveAtkPose(dt);
        this.tickPose(dt);
        this.clamp(other); return;
      }
      const airAttack = this.state === 'airPunch' || this.state === 'airKick';
      if (airAttack) { Input.edge(slot, 'punch'); Input.edge(slot, 'kick'); }
      this.atkT++;
      const a = this.atk, tot = a.su + a.ac + a.re;
      if (this.state === 'special' && this.atkT <= a.su) {
        this.specialChargeFxT -= dt;
        if (this.specialChargeFxT <= 0) {
          const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
          const progress = Math.min(1, this.atkT / a.su);
          Fx.chargePulse(this.x - cameraX, Game.GROUND + this.y - 44 * Fighter.S, this.classProfile, progress);
          this.specialChargeFxT = .14;
        }
      }
      this.driveAtkPose(dt);
      this.tickPose(dt);
      if (this.state === 'special' && this.atkT > a.su && this.atkT <= a.su + a.ac && this.dashLeft > 0) {
        const step = this.dashLeft / Math.max(1, a.su + a.ac - this.atkT + 1);
        const move = Math.min(step, this.dashLeft);
        this.x += this.face * move; this.dashLeft -= move; this.vx = 0;
        this.moveGround(dt, slot, .18);
        const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
        Fx.superTrail(this.x - cameraX, Game.GROUND + this.y - 58 * Fighter.S, this.face, this.classProfile);
      } else if (airAttack) {
        let ax = 0;
        if (Input.held(slot, 'left')) ax--;
        if (Input.held(slot, 'right')) ax++;
        const targetVx = ax * Fighter.RUN_SPEED;
        const reversing = ax !== 0 && this.vx * ax < 0;
        const accel = ax === 0 ? Fighter.GROUND_BRAKE : reversing ? Fighter.TURN_ACCEL : Fighter.GROUND_ACCEL;
        const deltaV = targetVx - this.vx;
        this.vx += Math.sign(deltaV) * Math.min(Math.abs(deltaV), accel * dt);
        if (Math.abs(this.vx) < 4 && ax === 0) this.vx = 0;
        this.x += this.vx * dt;
      } else this.moveGround(dt, slot, this.state === 'special' ? .25 : this.state === 'kick' ? .36 : .52);
      const wasAir = this.y < 0 || !this.grounded;
      this.vy += 1600 * dt; this.y += this.vy * dt;
      const landed = this.landCheck(wasAir);
      if (landed && airAttack) { this.atk = null; this.state = 'idle'; this.atkPhase = ''; }
      if (this.atkT >= tot) {
        // Chain only continues after a connected punch; whiff clears the string (AC2)
        if (this.state === 'punch' && this.hitDone && this.chain + 1 < Moves.punch.chainMax)
          this.chainArmed = Moves.punch.chainWindow;
        else { this.chain = 0; this.chainArmed = 0; }
        this.atk = null; this.state = 'idle'; this.dashLeft = 0; this.atkPhase = '';
      }
      if (this.atk && (this.state !== 'special' || this.atkT <= a.su)) this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    if (this.chainArmed > 0) { this.chainArmed--; if (this.chainArmed <= 0) this.chain = 0; }
    if (!Game.fighting) {
      this.vx = 0; this.state = 'idle';
      const bob = Pose.copy(Pose.idle(this.classProfile));
      bob.hipBob = Math.sin(this.animT * Math.PI * 2 / .9) * 2;
      this.aim('idle', bob, .12);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1; this.clamp(other); return;
    }
    this.blocking = Input.held(slot, 'block') && this.grounded ? 1 : 0;
    if (this.blocking) {
      this.moveGround(dt, slot, .38); this.state = 'block';
      this.aim('block', Pose.block(this.classProfile), .08);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1; this.clamp(other); return;
    }
    const { ax, speedRatio } = this.moveGround(dt, slot);
    if (this.grounded && (ax !== 0 || speedRatio > .04)) {
      this.walkT += dt * speedRatio;
      this.state = 'walk';
    } else if (this.grounded && this.state !== 'jump') {
      this.walkT = 0; this.state = 'idle';
    }
    const jumpPressed = Input.edge(slot, 'jump');
    const specialPressed = Input.edge(slot, 'special');
    const punchPressed = Input.edge(slot, 'punch');
    const kickPressed = Input.edge(slot, 'kick');
    if (jumpPressed && this.grounded) { this.vy = -520; this.grounded = false; this.state = 'jump'; Sfx.play('jump', this.classProfile); }
    if (this.grounded && specialPressed) this.startAtk('special');
    else if (this.grounded && punchPressed) this.startAtk('punch');
    else if (this.grounded && kickPressed) this.startAtk('kick');
    else if (!this.grounded && punchPressed) this.startAtk('airPunch');
    else if (!this.grounded && kickPressed) this.startAtk('airKick');
    if (this.atk) { this.driveAtkPose(dt); this.tickPose(dt); this.clamp(other); return; }
    const wasAir = this.y < 0 || !this.grounded;
    this.vy += 1600 * dt; this.y += this.vy * dt;
    if (this.landCheck(wasAir)) { if (this.state === 'jump') this.state = 'idle'; }
    else if (this.y < 0) this.state = 'jump';
    this.face = other.x >= this.x ? 1 : -1;
    if (this.state === 'jump') {
      const phase = Pose.jumpPhase(this.vy);
      this.aim('jump-' + phase, Pose.jump(phase, this.classProfile), phase === 'takeoff' ? .07 : .09);
    } else if (this.state === 'walk') {
      this.aim('walk', Pose.walk(this.walkT, speedRatio, this.classProfile), .12);
    } else if (this.landSquash <= 0) {
      const bob = Pose.copy(Pose.idle(this.classProfile));
      bob.hipBob = Math.sin(this.animT * Math.PI * 2 / .9) * 2;
      this.aim('idle', bob, .1);
    }
    this.tickPose(dt);
    this.clamp(other);
  }
  clamp() {
    // Mode movement bounds are applied here; Beat ’em up allows fighters beneath UI controls.
    this.x = Math.max(Game.minX, Math.min(Game.maxX, this.x));
    const arcadeSize = Game.mode === 'beatemup' ? BeatEmUp.baseS / 1.5 : 1;
    const hitW = 42 * arcadeSize, hitH = 135 * arcadeSize;
    this.hitbox.x = this.x - hitW / 2; this.hitbox.y = Game.GROUND + this.y - hitH; this.hitbox.w = hitW; this.hitbox.h = hitH;
  }
  strike() {
    if (!this.atk || (this.hitDone && this.state !== 'special')) return null;
    const a = this.atk;
    if (this.atkT <= a.su || this.atkT > a.su + a.ac) return null;
    const weapon = this.classProfile?.weapon || this.weaponType;
    const weaponAttack = weapon && (this.state === 'special' || this.state === 'punch' || this.state === 'airPunch' || (this.state === 'kick' && (weapon === 'staff' || weapon === 'blade' || weapon === 'stick' || weapon === 'knife')));
    if (weaponAttack) {
      const geometry = this.weaponGeometry(this.combatBones(), true);
      if (geometry) {
        const r = (weapon === 'staff' || weapon === 'stick' ? 8 : 7) * Fighter.S;
        const {start,end} = {start:geometry.start,end:geometry.tip};
        const segment = {x1:start.x,y1:start.y,x2:end.x,y2:end.y,r};
        const x = Math.min(start.x,end.x) - r, y = Math.min(start.y,end.y) - r;
        const w = Math.abs(end.x - start.x) + r * 2, h = Math.abs(end.y - start.y) + r * 2;
        const common = {x,y,w,h,segment,dmg:a.dmg,kb:a.kb,stun:a.stun,chip:a.chip || 0,special:this.state === 'special',critical:!!a.critical,comboFinisher:!!a.comboFinisher,comboLink:!!a.linked,chain:a.chain || 0};
        if (this.state === 'special') {
          const hitCount = a.hitCount || 1;
          common.pulse = Math.min(hitCount - 1, Math.floor((this.atkT - a.su - 1) / Math.max(1, a.ac / hitCount)));
        }
        return common;
      }
    }
    if (this.state === 'special') {
      const style = this.classProfile?.style || 'rush';
      const hitCount = a.hitCount || 1;
      const pulse = Math.min(hitCount - 1, Math.floor((this.atkT - a.su - 1) / Math.max(1, a.ac / hitCount)));
      const classShapes = {
        rush:{w:170 * Fighter.S,h:100 * Fighter.S,lead:16 * Fighter.S},
        flame:{w:190 * Fighter.S,h:122 * Fighter.S,lead:8 * Fighter.S},
        flash:{w:Game.W * .2,h:105 * Fighter.S,lead:10 * Fighter.S},
        quake:{w:Game.W * .22,h:62 * Fighter.S,lead:0},
        ward:{w:155 * Fighter.S,h:150 * Fighter.S,lead:10 * Fighter.S},
        staff:{w:245 * Fighter.S,h:118 * Fighter.S,lead:32 * Fighter.S},
        blade:{w:190 * Fighter.S,h:126 * Fighter.S,lead:20 * Fighter.S},
      }[this.classProfile?.weapon || style];
      const shapes = this.classProfile ? classShapes : {w:150 * Fighter.S,h:112 * Fighter.S,lead:18 * Fighter.S};
      const {w,h,lead} = shapes;
      return {
        x: this.face > 0 ? this.x + lead : this.x - w - lead,
        y: Game.GROUND + this.y - h,
        w, h, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:a.chip || 0, special:true, pulse, critical:!!a.critical, comboFinisher:!!a.comboFinisher, comboLink:!!a.linked, chain:a.chain || 0,
      };
    }
    const b = this.combatBones(), tip = (this.state === 'kick' || this.state === 'airKick' || this.state === 'special') ? b.ll : b.ra;
    const r = this.state === 'special' ? 22 : 18;
    const heavyLead = this.state === 'kick' ? 30 * Fighter.S : 0;
    const endX = tip.x + this.face * heavyLead;
    return {x:Math.min(tip.x, endX) - r, y:tip.y - r, w:Math.abs(endX - tip.x) + r * 2, h:r * 2, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:a.chip || 0, special:this.state === 'special', critical:!!a.critical, comboFinisher:!!a.comboFinisher, comboLink:!!a.linked, chain:a.chain || 0};
  }
  takeHit(atk, from) {
    if (this.playerControlled && this.invincibleT > 0) return 'invulnerable';
    if (atk.special && (!this.grounded || this.dodgeT > 0)) return 'evade';
    const chargingSpecial = this.state === 'special' && this.atk && this.atkT <= this.atk.su;
    const frontal = (from.x - this.x) * this.face > 0;
    const warded = this.wardShieldT > 0 && this.classProfile?.style === 'ward';
    if (this.blocking && frontal && !atk.special) {
      Sfx.play('block', this.classProfile);
      const dmg = (atk.special ? atk.chip : atk.dmg * .2) * (warded ? .55 : 1);
      const hpBefore = this.hp;
      this.hp = Math.max(0, this.hp - dmg); this.flash = .08; this.blockFlash = .12;
      this.vx = Math.sign(this.x - from.x) * atk.kb * .25;
      this.recordDamage(hpBefore - this.hp, from);
      return 'block';
    }
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - atk.dmg * (warded ? .55 : 1)); this.flash = .08;
    if (chargingSpecial) {
      this.damageBurst = 0; this.damageBurstT = 0;
      Sfx.play('hit', this.classProfile);
      if (this.hp <= 0) this.startRagdoll(from, true);
      return 'armored';
    }
    this.stun = atk.stun;
    if (warded) {
      const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
      Fx.wardGuard(this.x - cameraX, Game.GROUND + this.y - 54 * Fighter.S, this.classProfile);
      Sfx.play('block', this.classProfile);
    }
    Sfx.play('hit', this.classProfile);
    this.vx = Math.sign(this.x - from.x) * atk.kb; this.atk = null; this.blocking = 0; this.dashLeft = 0;
    this.atkPhase = '';
    this.state = 'hit';
    this.recordDamage(hpBefore - this.hp, from);
    return 'hit';
  }
  recordDamage(amount, from) {
    if (amount <= 0) return;
    if (this.damageBurstT <= 0) this.damageBurst = 0;
    this.damageBurst += amount;
    this.damageBurstT = 1.6;
    if (this.hp <= 0 && !(Game.mode === 'practice' && !this.playerControlled)) this.startRagdoll(from, true);
    else if (!this.ragdollActive && this.damageBurst >= 30 && !(Game.mode === 'practice' && !this.playerControlled)) {
      this.damageBurst = 0;
      this.startRagdoll(from, false);
    }
  }
  startRagdoll(from, lethal = false) {
    if (this.ragdollActive) {
      if (lethal && !this.ragdollKO) {
        this.ragdollKO = true;
        if (this.playerControlled) Sfx.play('player-die', this.classProfile);
      }
      return;
    }
    if (lethal && this.playerControlled) Sfx.play('player-die', this.classProfile);
    this.ragdollActive = true; this.ragdollKO = lethal; this.ragdollElapsed = 0; this.koT = 0;
    this.ragdollFrom = Pose.copy(this.pose);
    this.ragdollDirection = Math.sign(this.x - (from?.x ?? this.x + this.face)) || -this.face;
    this.ragdollAngle = 0;
    this.vx = this.ragdollDirection * Math.max(Math.abs(this.vx), lethal ? 190 : 145);
    this.vy = Math.min(this.vy, -150); this.grounded = false;
    this.atk = null; this.atkT = 0; this.stun = 0; this.blocking = 0; this.dashLeft = 0;
    this.state = lethal ? 'ko' : 'knockdown'; this.atkPhase = '';
    this.poseKey = 'ragdoll'; this.punchSoft = 0;
  }
  updateRagdoll(dt) {
    this.ragdollElapsed += dt;
    this.x += this.vx * dt; this.vx *= Math.exp(-4.2 * dt);
    if (!this.grounded || this.vy < 0) {
      this.vy += 1600 * dt; this.y += this.vy * dt;
      if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; Fx.land(this.x); }
    }
    const fall = Pose.easeOut(Math.min(1, this.ragdollElapsed / .28));
    const getUp = this.ragdollKO ? 0 : Pose.easeOut(Math.max(0, Math.min(1, (this.ragdollElapsed - .68) / .3)));
    this.ragdollAngle = this.ragdollDirection * Math.PI * .5 * fall * (1 - getUp);
    const flop = Math.exp(-this.ragdollElapsed * 1.7) * (1 - getUp);
    const prone = Pose.lerp(this.ragdollFrom || Pose.hit(this.classProfile), Pose.ragdoll(this.classProfile), fall);
    prone.la += Math.sin(this.ragdollElapsed * 19) * .3 * flop;
    prone.ra += Math.sin(this.ragdollElapsed * 16 + 1) * .34 * flop;
    prone.ll += Math.sin(this.ragdollElapsed * 14 + 2) * .2 * flop;
    prone.rl += Math.sin(this.ragdollElapsed * 17) * .2 * flop;
    this.pose = Pose.lerp(prone, Pose.idle(this.classProfile), getUp);
    this.poseFrom = Pose.copy(this.pose); this.poseTo = Pose.copy(this.pose); this.poseKey = 'ragdoll';
    if (this.ragdollKO) { this.state = 'ko'; return; }
    if (this.ragdollElapsed >= .98) {
      this.ragdollActive = false; this.ragdollAngle = 0; this.ragdollElapsed = 0;
      this.y = 0; this.vy = 0; this.grounded = true; this.state = 'idle';
      if (this.playerControlled) this.invincibleT = 1.5;
      this.damageBurst = 0; this.damageBurstT = 0;
      this.aim('idle', Pose.idle(this.classProfile), .16);
    }
  }
  /** Draw-only X nudge keeps visual bones clear of overlapping touch controls. */
  drawNudgeX() {
    if (Game.mode === 'beatemup') return 0;
    const b = this.bones();
    const sc = Game.scale, ox = Game.ox, oy = Game.oy, c = 4;
    const x0 = ox + b.x0 * sc;
    const x1 = ox + b.x1 * sc;
    let dx = 0;
    for (const btn of Game.btns) {
      const y0 = oy + b.y0 * sc, y1 = oy + b.y1 * sc;
      if (y0 >= btn.y + btn.h + c || y1 <= btn.y - c) continue;
      if (btn.x + btn.w / 2 < innerWidth / 2) {
        const gap = x0 - (btn.x + btn.w);
        if (gap < c) dx = Math.max(dx, (c - gap) / sc);
      } else {
        const gap = btn.x - x1;
        if (gap < c) dx = Math.min(dx, (gap - c) / sc);
      }
    }
    return dx;
  }
  weaponGeometry(b, active = !!(this.atk && this.atkT > this.atk.su &&
    (this.state === 'special' || this.state === 'punch' || this.state === 'airPunch' || this.state === 'kick'))) {
    const weapon = this.classProfile?.weapon || this.weaponType;
    if (!weapon) return null;
    const hand = b.ra, face = this.face;
    if (weapon === 'stick') {
      const start = {x:hand.x - face * 5,y:hand.y + 12};
      return {start,tip:active
        ? {x:hand.x + face * (this.state === 'kick' ? 94 : 106),y:hand.y - 22}
        : {x:hand.x + face * 18,y:hand.y - 66}};
    }
    if (weapon === 'knife') {
      const start = {x:hand.x + face * 4,y:hand.y + 2};
      return {start,tip:active
        ? {x:hand.x + face * (this.state === 'kick' ? 50 : 56),y:hand.y - 18}
        : {x:hand.x + face * 27,y:hand.y - 9}};
    }
    if (weapon === 'staff') {
      // Build the staff shaft through both hands, then extend it past each grip.
      // This keeps idle, thrust, and heavy sweep collision on the drawn weapon.
      const leadIsLeft = (b.la.x - b.ra.x) * face >= 0;
      const rear = leadIsLeft ? b.ra : b.la, lead = leadIsLeft ? b.la : b.ra;
      let dx = (lead.x - rear.x) * face, dy = lead.y - rear.y;
      let length = Math.hypot(dx,dy);
      if (length < 10) {
        dx = Math.cos(this.state === 'kick' ? .72 : 0);
        dy = Math.sin(this.state === 'kick' ? .72 : 0);
        length = 1;
      }
      const ux = face * dx / length, uy = dy / length;
      const arcadeSize = Game.mode === 'beatemup' ? .8 : 1;
      const back = 50 * arcadeSize, front = (this.state === 'kick' && active ? 138 : 98) * arcadeSize;
      return {start:{x:rear.x - ux * back,y:rear.y - uy * back},tip:{x:lead.x + ux * front,y:lead.y + uy * front}};
    }
    if (weapon === 'blade') {
      const grip = {x:(b.la.x + b.ra.x) / 2,y:(b.la.y + b.ra.y) / 2};
      if (this.state === 'kick' && this.atk) {
        const rest = {x:face * 22,y:-82}, slash = {x:face * (active ? 112 : 78),y:46};
        const t = this.atkT <= this.atk.su
          ? Pose.easeOut(this.atkT / Math.max(1,this.atk.su))
          : this.atkT <= this.atk.su + this.atk.ac ? 1
            : 1 - Pose.easeOut((this.atkT - this.atk.su - this.atk.ac) / Math.max(1,this.atk.re));
        return {start:grip,tip:{x:grip.x + rest.x + (slash.x - rest.x) * t,y:grip.y + rest.y + (slash.y - rest.y) * t}};
      }
      if (active) {
        const cuts = [{x:82,y:-18},{x:72,y:36},{x:66,y:-50}];
        const cut = cuts[Math.max(0, Math.min(2, this.atk?.chain || 0))];
        return {start:{x:hand.x - face * 10,y:hand.y + 8},tip:{x:hand.x + face * cut.x,y:hand.y + cut.y}};
      }
      return {start:grip,tip:{x:grip.x + face * 22,y:grip.y - 82}};
    }
    return active
      ? {start:{x:hand.x - face * 10,y:hand.y + 8},tip:{x:hand.x + face * 82,y:hand.y - 18}}
      : {start:{x:hand.x - face * 8,y:hand.y + 12},tip:{x:hand.x + face * 24,y:hand.y - 82}};
  }
  drawWeapon(ctx, b) {
    const weapon = this.classProfile?.weapon || this.weaponType;
    if (!weapon) return;
    const {start,tip} = this.weaponGeometry(b);
    ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'bevel';
    if (weapon === 'stick') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#211A16'; ctx.lineWidth = 10;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#A96D3F'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#D2A16E'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
    } else if (weapon === 'knife') {
      const dx = tip.x - start.x, dy = tip.y - start.y, len = Math.hypot(dx,dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const handleEnd = {x:start.x - this.face * 9,y:start.y + 2};
      const bladeBase = {x:start.x + this.face * 2,y:start.y - 1};
      ctx.strokeStyle = '#29232A'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(handleEnd.x,handleEnd.y); ctx.lineTo(start.x,start.y); ctx.stroke();
      ctx.fillStyle = '#B9C5D4'; ctx.strokeStyle = '#20232C'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bladeBase.x + nx * 4,bladeBase.y + ny * 4);
      ctx.lineTo(tip.x + nx * 2,tip.y + ny * 2);
      ctx.lineTo(tip.x + this.face * 4,tip.y);
      ctx.lineTo(tip.x - nx * 2,tip.y - ny * 2);
      ctx.lineTo(bladeBase.x - nx * 4,bladeBase.y - ny * 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (weapon === 'staff') {
      const arcadeSize = Game.mode === 'beatemup' ? .8 : 1;
      ctx.strokeStyle = '#171D27'; ctx.lineWidth = 11 * arcadeSize;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#8998AA'; ctx.lineWidth = 7 * arcadeSize;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#DCE6F2'; ctx.lineWidth = 1.5 * arcadeSize;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 2.5 * arcadeSize;
      for (const p of [start,tip]) { ctx.beginPath(); ctx.arc(p.x,p.y,4 * arcadeSize,0,Math.PI*2); ctx.stroke(); }
    } else {
      const grip = {x:start.x - this.face * 13,y:start.y + 3};
      const dx = tip.x - start.x, dy = tip.y - start.y, len = Math.hypot(dx,dy) || 1;
      ctx.strokeStyle = '#20232C'; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(grip.x,grip.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#D7E0EA'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x - this.face * 8,tip.y + 2); ctx.stroke();
      ctx.strokeStyle = this.classProfile?.accent || '#FBBF24'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(start.x - dy / len * 9,start.y + dx / len * 9); ctx.lineTo(start.x + dy / len * 9,start.y - dx / len * 9); ctx.stroke();
    }
    ctx.restore();
  }
  drawAttackBoostAura(ctx, b) {
    if (!this.playerControlled || this.attackBoostT <= 0 || this.hp <= 0 || this.ragdollActive) return;
    const weapon = this.classProfile?.weapon || this.weaponType;
    const pulse = .82 + .18 * Math.sin(this.animT * 9);
    ctx.save();
    ctx.globalAlpha = .2 * pulse;
    ctx.strokeStyle = '#FF354F';
    ctx.shadowColor = '#FF354F';
    ctx.shadowBlur = 12 / (Game.scale || 1);
    ctx.lineCap = 'round';
    if (weapon) {
      const {start,tip} = this.weaponGeometry(b);
      ctx.lineWidth = (weapon === 'knife' ? 13 : 17) * Fighter.S;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.globalAlpha = .42 * pulse;
      ctx.shadowBlur = 4 / (Game.scale || 1);
      ctx.lineWidth = 2.5 * Fighter.S;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
    } else {
      for (const hand of [b.la,b.ra]) {
        ctx.fillStyle = '#FF354F';
        ctx.beginPath(); ctx.arc(hand.x,hand.y,12 * Fighter.S,0,Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  drawReadyLightning(ctx, b) {
    if (this.meter < 100 || this.hp <= 0 || this.ragdollActive) return;
    if (!this.playerControlled) {
      const color = this.color || '#FF5264';
      const pulse = .16 + .1 * (Math.sin(this.animT * 5) + 1) / 2;
      const radius = Math.max(10 * Fighter.S, 10 / Game.scale);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = color; ctx.fillStyle = color;
      ctx.shadowColor = color; ctx.shadowBlur = 5 / Game.scale;
      ctx.lineWidth = 2 / Game.scale;
      ctx.beginPath(); ctx.arc(b.chest.x, b.chest.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = pulse * .28;
      ctx.beginPath(); ctx.arc(b.chest.x, b.chest.y, radius * .72, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    const color = this.playerControlled
      ? (this.classProfile?.accent || '#55D8FF')
      : (this.color || '#FF5264');
    const pulse = .72 + .28 * Math.sin(this.animT * 12);
    const unit = 1 / Game.scale;
    const pad = Math.max(5 * Fighter.S, 5 * unit);
    const top = b.y0 + 5 * unit, bottom = b.y1 - 3 * unit;
    const left = b.x0 - pad, right = b.x1 + pad;
    const mid = (top + bottom) / 2;
    const flicker = Math.sin(this.animT * 29) * 2.5 * unit;
    ctx.save();
    ctx.globalAlpha = .76 * pulse;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = 9 * unit;
    const bolt = (x, sign, phase) => {
      const shift = Math.sin(this.animT * 19 + phase) * 3.5 * unit;
      const points = [
        [x, top],
        [x + sign * (4 * unit + shift), top + (bottom - top) * .18],
        [x - sign * (3 * unit + flicker), top + (bottom - top) * .34],
        [x + sign * (5 * unit - shift), mid],
        [x - sign * (4 * unit + shift), top + (bottom - top) * .7],
        [x + sign * (3 * unit + flicker), top + (bottom - top) * .86],
        [x, bottom]
      ];
      ctx.lineWidth = 2.4 * unit;
      ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      ctx.stroke();
      // Short forks make the charge read as electricity without filling the body.
      for (const i of [2, 4]) {
        ctx.beginPath(); ctx.moveTo(points[i][0], points[i][1]);
        ctx.lineTo(points[i][0] + sign * 5 * unit, points[i][1] - 3 * unit);
        ctx.lineTo(points[i][0] + sign * 7 * unit, points[i][1] + 2 * unit);
        ctx.stroke();
      }
    };
    bolt(left, -1, 0); bolt(right, 1, 1.8);
    // Small crown arcs emphasize that the special is ready.
    ctx.globalAlpha = .55 * pulse;
    ctx.lineWidth = 1.8 * unit;
    for (let i = 0; i < 2; i++) {
      const x = b.head.x + (i ? 1 : -1) * (b.hr + 2 * unit);
      ctx.beginPath(); ctx.moveTo(x, b.head.y - b.hr * .8);
      ctx.lineTo(x + (i ? 3 : -3) * unit, b.head.y - b.hr - 5 * unit);
      ctx.lineTo(x + (i ? 6 : -6) * unit, b.head.y - b.hr * .9);
      ctx.stroke();
    }
    ctx.restore();
  }
  draw(ctx) {
    ctx.save();
    this.drawVector(ctx);
    ctx.restore();
  }
  drawVector(ctx) {
    const nudge = this.drawNudgeX();
    if (nudge) ctx.translate(nudge, 0);
    if (this.ragdollActive) {
      ctx.save();
      ctx.translate(this.x + nudge, Game.GROUND + this.y);
      ctx.rotate(this.ragdollAngle);
      ctx.translate(-this.x - nudge, -Game.GROUND - this.y);
    }
    const b = this.bones();
    const invulnTime = Math.max(this.invincibleT, this.dodgeT);
    const invulnBlink = this.playerControlled && invulnTime > 0 && Math.floor(invulnTime * 14) % 2 === 0;
    const col = this.flash > 0 || invulnBlink ? '#FFFFFF' : this.color;
    const spriteStroke = Math.max(Game.lw, 8 / Game.scale);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = spriteStroke;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const chain = (pts) => {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = spriteStroke + 5 / Game.scale; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = spriteStroke;
      ctx.shadowColor = col; ctx.shadowBlur = 5 / Game.scale; ctx.stroke(); ctx.restore();
      for (let i = 0; i < pts.length - 1; i++) {
        const joint = pts[i], jointRadius = spriteStroke * .72;
        ctx.fillStyle = 'rgba(3,8,18,.96)'; ctx.beginPath(); ctx.arc(joint.x, joint.y, jointRadius, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 5 / Game.scale;
        ctx.beginPath(); ctx.arc(joint.x, joint.y, jointRadius * .68, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    };
    chain([b.hip, b.chest, b.neck]);
    // Lead/rear shoulders: shR carries punch shPull (~6px back); shL stays on chest
    chain([b.shL || b.sh, b.laJ, b.la]);
    chain([b.shR || b.sh, b.raJ, b.ra]);
    chain([b.hip, b.llJ, b.ll]);
    chain([b.hip, b.rlJ, b.rl]);
    const headX = b.head.x, headY = b.head.y, headRadius = b.hr;
    ctx.fillStyle = 'rgba(3,8,18,.98)'; ctx.beginPath(); ctx.arc(headX, headY, headRadius + 3 / Game.scale, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 / Game.scale;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(headX, headY, headRadius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.ellipse(headX - headRadius * .3, headY - headRadius * .34, headRadius * .28, headRadius * .16, -.5, 0, Math.PI * 2); ctx.fill();
    this.drawWeapon(ctx,b);
    this.drawReadyLightning(ctx,b);
    this.drawAttackBoostAura(ctx,b);
    if (!this.playerControlled && this.comboStunEffectT > 0 && this.hp > 0 && !this.ragdollActive) {
      const centerY = b.head.y - b.hr - 8 / Game.scale;
      const pulse = .72 + .28 * Math.sin(this.animT * 17), colors = ['#FFE16B', '#7CEBFF', '#FF7AD9'];
      ctx.save(); ctx.globalAlpha = pulse;
      for (let i = 0; i < 3; i++) {
        const angle = this.animT * 9 + i * Math.PI * 2 / 3;
        const x = b.head.x + Math.cos(angle) * (b.hr + 9 / Game.scale);
        const y = centerY + Math.sin(angle) * (4 / Game.scale), size = 7 / Game.scale;
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle + this.animT * 2);
        ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .26, -size * .26);
        ctx.lineTo(size, 0); ctx.lineTo(size * .26, size * .26); ctx.lineTo(0, size);
        ctx.lineTo(-size * .26, size * .26); ctx.lineTo(-size, 0); ctx.lineTo(-size * .26, -size * .26); ctx.closePath();
        ctx.fillStyle = colors[i]; ctx.shadowColor = colors[i]; ctx.shadowBlur = 8 / Game.scale; ctx.fill();
        ctx.strokeStyle = '#111521'; ctx.lineWidth = 1.5 / Game.scale; ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
    if (this.blocking || this.blockFlash > 0) {
      const cx = this.x + nudge + this.face * 28, cy = b.sh.y + 10;
      const a0 = -1.2 + (this.face > 0 ? 0 : Math.PI), a1 = 1.2 + (this.face > 0 ? 0 : Math.PI);
      if (this.blocking) {
        ctx.strokeStyle = this.color; ctx.globalAlpha = .6; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 26, a0, a1); ctx.stroke();
      }
      if (this.blockFlash > 0) {
        ctx.strokeStyle = '#FFFFFF'; ctx.globalAlpha = Math.min(1, this.blockFlash / .12); ctx.lineWidth = 1 / Game.scale;
        ctx.beginPath(); ctx.arc(cx, cy, 26, a0, a1); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.lineWidth = spriteStroke;
    }
    if (!this.ragdollActive && !Game.banner && Game.phase !== 'title') {
      ctx.fillStyle = '#fff'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.tag, b.head.x, b.y0 - 12 / Game.scale);
    }
    if (this.playerControlled && !this.ragdollActive && Game.phase === 'fight' && this.comboHits > 0 && this.comboTimer > 0) {
      const sc = Game.scale, badgeY = b.y0 - 35 / sc;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.comboTimer * 2.5);
      ctx.fillStyle = this.classProfile?.accent || '#FBBF24';
      ctx.strokeStyle = '#11131A'; ctx.lineWidth = 2 / sc;
      ctx.beginPath(); ctx.ellipse(b.head.x, badgeY, 22 / sc, 12 / sc, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#11131A'; ctx.font = 'bold ' + 12 / sc + 'px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('×' + this.comboHits, b.head.x, badgeY + .5 / sc);
      ctx.restore();
    }
  
    if (this.ragdollActive) ctx.restore();
    if (nudge) ctx.translate(-nudge, 0);
  }
}


class Fx {
  static list = [];
  /** Cosmetic-only PRNG (mulberry32). Effects must never draw from Math.random,
   *  or the control layout (via Fx.allowed) would shift gameplay randomness. */
  static seed = 0x5EED1234;
  static random() {
    let t = (Fx.seed = (Fx.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  static clear() { Fx.list = []; }
  static hudBottom() {
    const sc = Game.scale;
    const safe = Game.safeTop;
    return (12 + safe) / sc + 12 / sc + 4 / sc + 5 / sc + 8 / sc;
  }
  static allowed(wx, wy) {
    const sc = Game.scale, sx = (Game.ox || 0) + wx * sc, sy = (Game.oy || 0) + wy * sc, pad = 8;
    if (wy < Fx.hudBottom()) return false;
    for (const btn of Game.btns) {
      if (sx >= btn.x - pad && sx <= btn.x + btn.w + pad && sy >= btn.y - pad && sy <= btn.y + btn.h + pad) return false;
    }
    return true;
  }
  static sparks(x, y, n, color, alpha, life) {
    if (!Fx.allowed(x, y)) return;
    const sc = Game.scale || 1, len = 10 / sc;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Fx.random() * .35;
      Fx.list.push({kind: 'spark', x, y, a, len, life, max: life, color, alpha: alpha == null ? 1 : alpha});
    }
  }
  static hit(x, y) { Fx.sparks(x, y, 6, '#FFFFFF', 1, .12); }
  static blocked(x, y) { Fx.sparks(x, y, 4, '#F5F5F5', .5, .12); }
  static superCharge(x, y, profile) {
    const color = profile?.color || '#FBBF24';
    if (Fx.allowed(x, y)) Fx.list.push({kind:'ring', x, y, r0:8 / Game.scale, r1:48 / Game.scale, life:.24, max:.24, color, width:4 / Game.scale});
    Fx.sparks(x, y, 8, color, .9, .2);
  }
  static chargePulse(x, y, profile, progress = 0) {
    const color = profile?.accent || profile?.color || '#FBBF24', sc = Game.scale || 1;
    if (!Fx.allowed(x, y)) return;
    const reach = 24 + progress * 24;
    Fx.list.push({kind:'ring', x, y, r0:reach / sc, r1:(reach + 34) / sc, life:.32, max:.32, color, width:(2 + progress * 2) / sc});
    Fx.sparks(x, y, 4 + Math.round(progress * 5), color, .7 + progress * .25, .22);
  }
  static dodge(x, y, profile) {
    const color = profile?.accent || '#7DD3FC', sc = Game.scale || 1;
    if (Fx.allowed(x, y)) Fx.list.push({kind:'ring', x, y, r0:12 / sc, r1:58 / sc, life:.24, max:.24, color, width:3 / sc});
    Fx.sparks(x, y, 9, color, .8, .2);
  }
  static superTrail(x, y, face, profile) {
    const color = profile?.color || '#FBBF24', sc = Game.scale || 1;
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'slash', x:x - face * 10 / sc, y:y - 14 / sc, x2:x - face * 42 / sc, y2:y + 14 / sc, life:.15, max:.15, color, width:8 / sc});
  }
  static special(x, y, profile) {
    const color = profile?.accent || '#FBBF24', style = profile?.style || 'rush', sc = Game.scale || 1;
    const rings = style === 'ward' ? 3 : style === 'rush' || style === 'flame' ? 2 : 1;
    for (let i = 0; i < rings; i++) {
      if (!Fx.allowed(x, y)) break;
      Fx.list.push({kind:'ring', x, y, r0:(8 + i * 10) / sc, r1:(78 + i * 24) / sc, life:.34 + i * .05, max:.34 + i * .05, color, width:(style === 'quake' ? 6 : 3) / sc});
    }
    const count = style === 'flash' ? 18 : style === 'flame' ? 16 : style === 'quake' ? 12 : 14;
    Fx.sparks(x, y, count, color, 1, style === 'ward' ? .34 : .24);
    if (style === 'quake') Fx.land(x);
  }
  static wardGuard(x, y, profile) {
    const sc = Game.scale || 1, color = profile?.accent || '#C4B5FD';
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'ring',x,y,r0:10 / sc,r1:30 / sc,life:.2,max:.2,color,width:3 / sc});
    Fx.sparks(x,y,5,color,.55,.12);
  }
  static damage(x, y, amount, blocked, critical = false) {
    if (amount <= 0 || !Fx.allowed(x, y)) return;
    const value = Math.round(amount * 10) / 10;
    Fx.list.push({kind:'damage', text:(critical ? 'CRITICAL!  ' : '') + '-' + value, x, y, life:critical ? .95 : .7, max:critical ? .95 : .7, color:critical ? '#FFE16B' : blocked ? '#FBBF24' : '#FFFFFF', critical});
  }
  static heal(x, y, amount) {
    if (Fx.allowed(x, y)) Fx.list.push({kind:'damage', text:'+' + amount + ' HP', x, y, life:.95, max:.95, color:'#76FFAE'});
    Fx.sparks(x, y, 8, '#76FFAE', .9, .24);
  }
  static powerup(x, y) {
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'combo', text:'ATTACK UP ×1.5', x, y, life:1.05, max:1.05, color:'#FF5264'});
    Fx.list.push({kind:'ring', x, y, r0:8, r1:34, life:.3, max:.3, color:'#FF5264', width:3});
    Fx.sparks(x, y, 10, '#FF5264', .9, .2);
  }
  static combo(x, y, text, profile) {
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'combo', text, x, y, life:.82, max:.82, color:profile?.accent || '#FBBF24'});
  }
  static stun(x, y, chance) {
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'stun', text:'STUN! ' + Math.round(chance * 100) + '%', x, y, life:.72, max:.72, color:'#FFE16B'});
    Fx.list.push({kind:'ring', x, y:y + 10, r0:6, r1:25, life:.24, max:.24, color:'#FFE16B', width:2});
  }
  static critical(x, y, profile) {
    const color = profile?.accent || '#FFE16B', sc = Game.scale || 1;
    if (Fx.allowed(x, y)) Fx.list.push({kind:'ring',x,y,r0:5 / sc,r1:34 / sc,life:.2,max:.2,color,width:3 / sc});
    Fx.sparks(x, y, 10, color, 1, .18);
  }
  static land(x) {
    const y = Game.GROUND, sc = Game.scale || 1;
    for (let i = 0; i < 3; i++) {
      const ox = x + (i - 1) * (6 / sc);
      if (!Fx.allowed(ox, y - 2 / sc)) continue;
      Fx.list.push({kind: 'dust', x: ox, y, life: .2, max: .2, r0: 4 / sc, r1: 10 / sc});
    }
  }
  static update(dt) {
    let write = 0;
    for (let i = 0; i < Fx.list.length; i++) {
      const e = Fx.list[i];
      e.life -= dt;
      if (e.kind === 'damage') e.y -= 30 * dt;
      if (e.kind === 'combo') e.y -= 42 * dt;
      if (e.kind === 'stun') e.y -= 24 * dt;
      if (e.kind === 'ring') e.radius = e.r0 + (e.r1 - e.r0) * (1 - e.life / e.max);
      if (e.life > 0) Fx.list[write++] = e;
    }
    Fx.list.length = write;
  }
  static draw(ctx) {
    const sc = Game.scale;
    for (const e of Fx.list) {
      const t = 1 - e.life / e.max;
      if (e.kind === 'spark') {
        const fade = e.life / e.max;
        const x2 = e.x + Math.cos(e.a) * e.len * (1 - t * .35);
        const y2 = e.y + Math.sin(e.a) * e.len * (1 - t * .35);
        if (!Fx.allowed(e.x, e.y) && !Fx.allowed(x2, y2)) continue;
        ctx.globalAlpha = e.alpha * fade;
        ctx.strokeStyle = e.color; ctx.lineWidth = 2 / sc; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (e.kind === 'slash') {
        if (!Fx.allowed(e.x, e.y) && !Fx.allowed(e.x2, e.y2)) continue;
        ctx.globalAlpha = e.life / e.max;
        ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
      } else if (e.kind === 'ring') {
        if (!Fx.allowed(e.x, e.y)) continue;
        ctx.globalAlpha = e.life / e.max;
        ctx.strokeStyle = e.color; ctx.lineWidth = e.width;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius || e.r0, 0, Math.PI * 2); ctx.stroke();
      } else if (e.kind === 'damage') {
        const fade = e.life / e.max;
        if (!Fx.allowed(e.x, e.y)) continue;
        ctx.globalAlpha = fade;
        ctx.font = 'bold ' + (e.critical ? 22 : 18) / sc + 'px ui-monospace,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = (e.critical ? 5 : 4) / sc; ctx.strokeStyle = '#11131A';
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y);
        ctx.textBaseline = 'alphabetic';
      } else if (e.kind === 'combo') {
        if (!Fx.allowed(e.x, e.y)) continue;
        ctx.globalAlpha = Math.min(1, e.life / .18);
        ctx.font = '900 ' + 18 / sc + 'px ui-monospace,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 4 / sc; ctx.strokeStyle = '#11131A';
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y);
        ctx.textBaseline = 'alphabetic';
      } else if (e.kind === 'stun') {
        if (!Fx.allowed(e.x, e.y)) continue;
        ctx.globalAlpha = Math.min(1, e.life / .14);
        ctx.font = '900 ' + 17 / sc + 'px ui-monospace,monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'bevel'; ctx.lineWidth = 4 / sc; ctx.strokeStyle = '#11131A';
        ctx.strokeText(e.text, e.x, e.y);
        ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y);
        ctx.textBaseline = 'alphabetic';
      } else if (e.kind === 'dust') {
        if (!Fx.allowed(e.x, e.y)) continue;
        const fade = e.life / e.max;
        const r = e.r0 + (e.r1 - e.r0) * t;
        ctx.globalAlpha = .6 * fade;
        ctx.fillStyle = '#3A3F52';
        ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}


/** Beat 'em up stage — depth band, waves, camera. 1v1 paths never call this. */
class BeatEmUp {
  static RUN_SECONDS = 210;
  static START_LIVES = 3;
  static BAND_TOP = 0.56;
  static BAND_BOT = 0.88;
  static DEPTH_HIT_PX = 14;
  static cameraX = 0;
  static skyOffset = 0;
  static cast = [];
  static items = [];
  static medkitDropChance = .25;
  static energyDrinkDropChance = .12;
  static energyDrinkDamageMultiplier = 1.5;
  static energyDrinkDuration = 20;
  static stage = 1;
  static stageTotal = 10;
  static stageSettings = window.ARCADE_STAGE_SETTINGS;
  static chapters = BeatEmUp.stageSettings.map((stage, index) => ({
    ...stage,
    intro: stage.storyIntro,
    clear: stage.boss.clear,
    sky: [
      ['#14151C','#1F2230','#262A38'], ['#0D1B24','#18313D','#23414D'],
      ['#241827','#39223D','#4A3150'], ['#241B17','#3B2A22','#4B382D'],
      ['#111925','#202B3A','#2D394A'], ['#101922','#1A2C3A','#294353'],
      ['#211D16','#3B3021','#51432D'], ['#111A2B','#1E2C48','#2E3E60'],
      ['#1E1422','#34203B','#4A2E52'], ['#201416','#3B2023','#582B2E'],
    ][index],
  }));
  static backgrounds = [
    'assets/backgrounds/stage-01-backstreet.webp',
    'assets/backgrounds/stage-02-docks.webp',
    'assets/backgrounds/stage-03-night-market.webp',
    'assets/backgrounds/stage-04-ironworks.webp',
    'assets/backgrounds/stage-05-undercity.webp',
    'assets/backgrounds/stage-06-rooftop.webp',
    'assets/backgrounds/stage-07-dojo.webp',
    'assets/backgrounds/stage-08-skybridge.webp',
    'assets/backgrounds/stage-09-broadcast-tower.webp',
    'assets/backgrounds/stage-10-coliseum.webp',
  ];
  static backgroundCache = new Map();
  /** Load a stage background on first use (index is 0-based). */
  static background(index) {
    const src = BeatEmUp.backgrounds[index];
    if (!src) return null;
    let image = BeatEmUp.backgroundCache.get(src);
    if (!image) { image = new Image(); image.decoding = 'async'; image.src = src; BeatEmUp.backgroundCache.set(src, image); }
    return image;
  }
  /** Current stage now, next stage in the background. */
  static loadStageBackgrounds(stage) {
    BeatEmUp.background(stage - 1);
    BeatEmUp.background(stage);
  }
  static wave = 0;
  static waveTotal = 3;
  static locked = 1;
  static showGo = 0;
  static goArmed = 0;
  static boss = null;
  static bossMaxHp = 220;
  static stageOver = 0; // 0 playing, 1 win, -1 lose
  static stageTransitionT = 0;
  static stageTransitionDuration = 1;
  static stageTransitionStage = 0;
  static stageTransitionSwitched = 0;
  static waveTravelT = 0;
  static waveTravelDuration = 0.72;
  static waveTravelStartCam = 0;
  static waveTravelTargetCam = 0;
  static waveTravelNext = 0;
  static downPending = 0;
  static downTimer = 0;
  static downX = 0;
  static downDepth = .55;
  static lives = BeatEmUp.START_LIVES;
  static score = 0;
  static combo = 0;
  static comboT = 0;
  static bestScore = 0;
  static waveEvent = '';
  static storyText = '';
  static storySubText = '';
  static eventT = 0;
  static stageIntroT = 0;
  static resultNextBtn = null;
  static visualCue = '';
  static visualCueT = 0;
  static get difficulty() { return ArcadeDiff[Game.arcadeLevel] || ArcadeDiff.normal; }
  static lockL = 0;
  static lockR = 0;
  static spawnX = 0;
  static worldMax = 3200;
  static baseS = 1.5;

  static depthToY(depth) {
    return Game.H * (BeatEmUp.BAND_TOP + (BeatEmUp.BAND_BOT - BeatEmUp.BAND_TOP) * depth);
  }
  static depthToScale(depth) {
    return 0.85 + 0.15 * Math.max(0, Math.min(1, depth));
  }
  static floorDepthPx(depth) {
    return BeatEmUp.depthToY(depth);
  }
  static depthClose(a, b) {
    return Math.abs(BeatEmUp.floorDepthPx(a) - BeatEmUp.floorDepthPx(b)) <= BeatEmUp.DEPTH_HIT_PX;
  }
  /** Beat ’em up fighters may pass beneath the overlaid touch controls. */
  static horizontalScreenBounds() {
    const ox = Game.ox || 0, width = Game.W * (Game.scale || 1);
    return { left: ox + width * .02, right: ox + width * .98 };
  }
  /** Pull fighter left so bones().x1 stays inside the active screen bound. */
  static clampFighterRight(entry) {
    const b = entry.f.bones();
    const screenX1 = Game.ox + (b.x1 - BeatEmUp.cameraX) * Game.scale;
    const limit = BeatEmUp.horizontalScreenBounds().right;
    if (screenX1 > limit) entry.f.x -= (screenX1 - limit) / Game.scale;
  }
  /** Pull fighter right so bones().x0 stays inside the active screen bound. */
  static clampFighterLeft(entry) {
    const b = entry.f.bones();
    const screenX0 = Game.ox + (b.x0 - BeatEmUp.cameraX) * Game.scale;
    const limit = BeatEmUp.horizontalScreenBounds().left;
    if (screenX0 < limit) entry.f.x += (limit - screenX0) / Game.scale;
  }
  /** Soft + hard limb clamps for current pose (left then right). */
  static clampFighterBones(entry) {
    BeatEmUp.clampFighterLeft(entry);
    BeatEmUp.clampFighterRight(entry);
  }
  /** Soft lane max for body centre, adjusted for the current pose's limb reach. */
  static softMaxX(entry) {
    const b = entry.f.bones(), bounds = BeatEmUp.horizontalScreenBounds();
    return BeatEmUp.cameraX + (bounds.right - Game.ox) / Game.scale - (b.x1 - entry.f.x);
  }
  /** Soft lane min for body centre (mirrors softMaxX). */
  static softMinX(entry) {
    const b = entry.f.bones(), bounds = BeatEmUp.horizontalScreenBounds();
    return BeatEmUp.cameraX + (bounds.left - Game.ox) / Game.scale + (entry.f.x - b.x0);
  }
  static withDepth(entry, fn) {
    const savedGround = Game.GROUND;
    const savedS = Fighter.S;
    const savedHr = Game.hr;
    const savedLw = Game.lw;
    const savedArm = Fighter.ARM;
    const savedLeg = Fighter.LEG;
    const savedTorso = Fighter.TORSO;
    const savedNeck = Fighter.NECK;
    const savedRunSpeed = Fighter.RUN_SPEED;
    const scDepth = BeatEmUp.depthToScale(entry.depth) * (entry.scaleMul || 1);
    const arcadeSize = BeatEmUp.baseS / savedS;
    const actorSize = arcadeSize * (entry.scaleMul || 1);
    Game.GROUND = BeatEmUp.depthToY(entry.depth);
    Fighter.S = BeatEmUp.baseS * scDepth;
    Fighter.ARM = savedArm * actorSize;
    Fighter.LEG = savedLeg * actorSize;
    Fighter.TORSO = savedTorso * actorSize;
    Fighter.NECK = savedNeck * actorSize;
    Game.hr = savedHr * scDepth * arcadeSize;
    Game.lw = Math.max(3.5, savedLw * scDepth * arcadeSize);
    if (entry.speedMul) Fighter.RUN_SPEED = 220 * entry.speedMul;
    try { return fn(); }
    finally {
      Game.GROUND = savedGround;
      Fighter.S = savedS;
      Fighter.ARM = savedArm;
      Fighter.LEG = savedLeg;
      Fighter.TORSO = savedTorso;
      Fighter.NECK = savedNeck;
      Game.hr = savedHr;
      Game.lw = savedLw;
      Fighter.RUN_SPEED = savedRunSpeed;
    }
  }

  static resetStage() {
    BeatEmUp.stageTransitionT = 0;
    BeatEmUp.stageTransitionStage = 0;
    BeatEmUp.stageTransitionSwitched = 0;
    BeatEmUp.waveTravelT = 0;
    BeatEmUp.waveTravelNext = 0;
    BeatEmUp.cameraX = 0;
    BeatEmUp.skyOffset = 0;
    BeatEmUp.stage = 1;
    BeatEmUp.wave = 0;
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.goArmed = 0;
    BeatEmUp.boss = null;
    BeatEmUp.bossMaxHp = 220;
    BeatEmUp.stageOver = 0;
    BeatEmUp.downPending = 0; BeatEmUp.downTimer = 0;
    BeatEmUp.lives = BeatEmUp.START_LIVES;
    BeatEmUp.score = 0;
    BeatEmUp.combo = 0;
    BeatEmUp.comboT = 0;
    BeatEmUp.waveEvent = '';
    BeatEmUp.storyText = '';
    BeatEmUp.storySubText = '';
    BeatEmUp.eventT = 0;
    try { BeatEmUp.bestScore = Number(localStorage.getItem('stickman-beatemup-best')) || 0; }
    catch (e) { BeatEmUp.bestScore = 0; }
    Game.timer = BeatEmUp.RUN_SECONDS;
    BeatEmUp.cast = [];
    BeatEmUp.items = [];
    BeatEmUp.baseS = Fighter.S * .8;
    BeatEmUp.lockL = 0;
    BeatEmUp.lockR = Game.W * 0.92;
    BeatEmUp.spawnX = Game.W * 0.7;
    BeatEmUp.worldMax = Game.W * 4.2;
    const p = fighters[0];
    p.reset(Game.W * 0.28, 1);
    p.setClass(Game.selectedClass);
    p.tag = 'YOU';
    p.meter = 0;
    BeatEmUp.cast.push({ f: p, depth: 0.55, role: 'player', kind: 'player', scaleMul: Game.selectedClass === 'staff' ? .8 : 1, speedMul: p.classProfile?.speed || 1, ai: null });
    // Hide unused 1v1 foe
    fighters[1].reset(-9999, -1);
    fighters[1].hp = 0;
    BeatEmUp.startWave(1, false, true);
  }

  static startCampaignStage(stage, retry = false) {
    BeatEmUp.stage = Math.max(1, Math.min(BeatEmUp.stageTotal, stage));
    BeatEmUp.loadStageBackgrounds(BeatEmUp.stage);
    BeatEmUp.cameraX = 0; BeatEmUp.skyOffset = 0;
    BeatEmUp.lockL = 0; BeatEmUp.lockR = Game.W * .95;
    BeatEmUp.spawnX = Game.W * .7; BeatEmUp.worldMax = Game.W * 4.2;
    BeatEmUp.locked = 1; BeatEmUp.showGo = 0; BeatEmUp.goArmed = 0;
    BeatEmUp.boss = null; BeatEmUp.stageOver = 0;
    BeatEmUp.items = [];
    BeatEmUp.downPending = 0; BeatEmUp.downTimer = 0;
    BeatEmUp.lives = BeatEmUp.START_LIVES;
    BeatEmUp.combo = 0; BeatEmUp.comboT = 0;
    BeatEmUp.waveEvent = ''; BeatEmUp.storyText = ''; BeatEmUp.storySubText = ''; BeatEmUp.eventT = 0;
    Game.timer = BeatEmUp.RUN_SECONDS; Game.matchOver = 0; Game.winner = ''; Game.stop = 0; Game.shake = 0;
    BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
    const player = BeatEmUp.playerEntry();
    if (player) {
      player.f.reset(Game.W * .28, 1);
      player.f.setClass(Game.selectedClass);
      player.f.color = FighterClasses[Game.selectedClass]?.color || PlayerCoolColor;
      player.f.tag = 'YOU'; player.f.meter = 0; player.depth = .55;
      player.scaleMul = Game.selectedClass === 'staff' ? .8 : 1;
    }
    BeatEmUp.startWave(1, false, true);
    Game.syncControls();
  }

  static makeEnemy(kind, x, depth) {
    const f = new Fighter(x, CpuHotColors.enemy[kind] || CpuHotColors.enemy.regular, -1, '');
    const archetype = EnemyArchetypes[kind] || EnemyArchetypes.regular;
    const armed = Math.random() < archetype.weaponChance;
    const weaponKey = armed ? (Math.random() < .5 ? 'stick' : 'knife') : 'freehand';
    const loadout = EnemyWeaponProfiles[weaponKey];
    f.weaponType = loadout.weapon;
    f.attackSpeed = loadout.attackSpeed;
    f.damageMultiplier = loadout.damage;
    f.specialDamageMultiplier = archetype.specialDamage;
    f.meterGainMultiplier = archetype.specialGain;
    f.tag = kind === 'regular' ? 'ROOKIE' : kind.toUpperCase();
    f.y = 0;
    f.hp = archetype.health; f.chip = archetype.health;
    const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
    f.hp = Math.round(f.hp * stageHealth); f.chip = f.hp;
    f.meter = 0;
    const scaleMul = kind === 'boss' ? 1.25 : kind === 'heavy' ? 1.12 : 1;
    const speedMul = kind === 'runner' || kind === 'tough' ? 1.32 : kind === 'heavy' ? .74 : kind === 'boss' ? .92 : 1;
    return {
      f, depth, role: 'enemy', kind, scaleMul, speedMul,
      ai: { mode: 'circle', atkSlot: 0, cool: kind === 'boss' ? .65 : .3 + Math.random() * .4, orbit: Math.random() * Math.PI * 2, preferDepth: depth, tellT: 0, tellMove: '', tellKind: '', phase: 1, phaseCallout: 0 },
    };
  }

  static waveDefs(n) {
    const wave = BeatEmUp.chapters[BeatEmUp.stage - 1]?.waves?.[n - 1];
    if (!wave) return [];
    // Use authored enemy compositions with staggered lanes and entry positions.
    const layouts = n === 2 ? [
      { ox: .16, depth: .18 }, { ox: .60, depth: .72 }, { ox: .72, depth: .40 },
      { ox: .28, depth: .54 }, { ox: .82, depth: .84 },
    ] : [
      { ox: .55, depth: .15 }, { ox: .62, depth: .55 }, { ox: .48, depth: .95 },
      { ox: .70, depth: .34 }, { ox: .40, depth: .76 },
    ];
    return wave.enemyFocus.map((kind, index) => ({ kind, ...layouts[index % layouts.length] }));
  }

  static startWave(n, retry = false, chapterIntro = false) {
    BeatEmUp.wave = n;
    BeatEmUp.stageIntroT = !retry && chapterIntro ? 5 : 0;
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1];
    const wave = chapter.waves[n - 1];
    BeatEmUp.waveEvent = chapterIntro
      ? 'STAGE ' + BeatEmUp.stage + ' / ' + BeatEmUp.stageTotal + ' · ' + chapter.title
      : wave.title;
    BeatEmUp.storyText = chapterIntro ? chapter.intro : wave.storyBeat;
    BeatEmUp.storySubText = chapterIntro ? wave.title + ' · ' + wave.storyBeat : '';
    BeatEmUp.visualCue = retry ? '' : wave.visualCue;
    BeatEmUp.visualCueT = retry ? 0 : 2.8;
    BeatEmUp.eventT = retry ? 0 : chapterIntro ? 5 : 3.4;
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.goArmed = 0;
    BeatEmUp.boss = null;
    // Lock window around current camera
    BeatEmUp.lockL = BeatEmUp.cameraX;
    BeatEmUp.lockR = BeatEmUp.cameraX + Game.W * 0.95;
    BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
    const defs = BeatEmUp.waveDefs(n);
    const enemyDelta = BeatEmUp.difficulty.extraEnemies;
    if (enemyDelta < 0 && defs.length > 1) defs.pop();
    if (enemyDelta > 0 && defs.length) {
      const source = defs[(BeatEmUp.stage + n) % defs.length];
      defs.push({ kind: source.kind, ox: .84, depth: n === 2 ? .48 : .35 });
    }
    // Double each difficulty's final authored lineup while preserving its
    // enemy mix. Put the second group across the lane to reduce spawn overlap.
    const reinforcements = defs.map((d, index) => ({
      kind: d.kind,
      ox: index % 2 ? .9 : .46,
      depth: Math.max(.12, Math.min(.9, 1 - d.depth)),
    }));
    defs.push(...reinforcements);
    for (const d of defs) {
      // Keep reinforcements in the newly revealed area instead of popping in behind the player.
      const x = BeatEmUp.lockL + Game.W * Math.max(n === 2 ? .12 : .42, d.ox);
      BeatEmUp.cast.push(BeatEmUp.makeEnemy(d.kind, x, d.depth));
    }
    Game.phase = 'intro';
    Game.banner = retry ? 'LIFE LOST' : 'WAVE ' + n;
    Game.bannerT = BeatEmUp.stageIntroT || 1.1;
    Game.fighting = 0;
  }

  static startBoss(retry = false) {
    BeatEmUp.stageIntroT = 0;
    BeatEmUp.wave = 4;
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.lockL = BeatEmUp.cameraX;
    BeatEmUp.lockR = BeatEmUp.cameraX + Game.W * 0.95;
    BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
    const boss = BeatEmUp.makeEnemy('boss', BeatEmUp.lockL + Game.W * 0.62, 0.55);
    BeatEmUp.bossMaxHp = boss.f.hp;
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1];
    boss.f.tag = chapter.boss.name;
    boss.f.color = CpuHotColors.bosses[BeatEmUp.stage - 1];
    boss.f.meter = 100;
    BeatEmUp.boss = boss;
    BeatEmUp.cast.push(boss);
    Game.phase = 'intro';
    Game.banner = retry ? 'LIFE LOST' : 'BOSS';
    BeatEmUp.waveEvent = 'BOSS · ' + chapter.boss.name;
    BeatEmUp.storyText = retry ? '' : chapter.boss.intro;
    BeatEmUp.storySubText = '';
    BeatEmUp.visualCue = '';
    BeatEmUp.visualCueT = 0;
    BeatEmUp.eventT = retry ? 0 : 3.4;
    Game.bannerT = 1.2;
    Game.fighting = 0;
  }

  static travelToWave(nextWave) {
    if (BeatEmUp.waveTravelT > 0) return;
    BeatEmUp.waveTravelT = BeatEmUp.waveTravelDuration;
    BeatEmUp.waveTravelStartCam = BeatEmUp.cameraX;
    BeatEmUp.waveTravelTargetCam = Math.min(BeatEmUp.worldMax - Game.W, BeatEmUp.cameraX + Game.W * .22);
    BeatEmUp.waveTravelNext = nextWave;
    BeatEmUp.showGo = 0;
    BeatEmUp.locked = 1;
    Game.fighting = 0;
    Game.phase = 'waveTransition';
    Game.banner = '';
  }

  static awardScore(points) {
    BeatEmUp.score += Math.max(0, Math.round(points));
    if (BeatEmUp.score > BeatEmUp.bestScore) {
      BeatEmUp.bestScore = BeatEmUp.score;
      try { localStorage.setItem('stickman-beatemup-best', String(BeatEmUp.bestScore)); } catch (e) {}
    }
  }

  static playerDown() {
    if (BeatEmUp.downPending) return;
    const player = BeatEmUp.playerEntry();
    if (player) {
      BeatEmUp.downX = player.f.x;
      BeatEmUp.downDepth = player.depth;
    }
    BeatEmUp.lives = Math.max(0, BeatEmUp.lives - 1);
    BeatEmUp.combo = 0;
    BeatEmUp.comboT = 0;
    if (BeatEmUp.lives <= 0) { BeatEmUp.loseStage(); return; }
    BeatEmUp.downPending = 1;
    BeatEmUp.downTimer = .78;
  }

  static respawnPlayer() {
    const p = BeatEmUp.playerEntry();
    if (p) {
      p.f.reset(BeatEmUp.downX, 1);
      p.f.color = p.f.classProfile?.color || PlayerCoolColor; p.f.tag = 'YOU'; p.f.meter = 0;
      p.f.invincibleT = 1.5;
      p.depth = BeatEmUp.downDepth;
    }
    // Keep the remaining wave (and a boss's current health) intact after spending a life.
    Game.phase = 'intro';
    Game.fighting = 0;
    Game.banner = 'LIFE LOST';
    Game.bannerT = .85;
    Game.syncControls();
  }

  static formatTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  static enemiesAlive() {
    return BeatEmUp.cast.filter(e => e.role === 'enemy' && e.f.hp > 0);
  }

  static playerEntry() {
    return BeatEmUp.cast.find(e => e.role === 'player');
  }

  static dropItem(enemy) {
    if (!enemy || enemy.kind === 'boss') return;
    const roll = Math.random();
    const kind = roll < BeatEmUp.medkitDropChance ? 'medkit'
      : roll < BeatEmUp.medkitDropChance + BeatEmUp.energyDrinkDropChance ? 'energyDrink' : null;
    if (!kind) return;
    BeatEmUp.items.push({
      kind, x: enemy.f.x, depth: enemy.depth,
      life: 18, bob: Math.random() * Math.PI * 2,
    });
  }

  static updateItems(dt, player) {
    for (let i = BeatEmUp.items.length - 1; i >= 0; i--) {
      const item = BeatEmUp.items[i];
      item.life -= dt;
      item.bob += dt * 4;
      if (item.life <= 0) { BeatEmUp.items.splice(i, 1); continue; }
      const laneGap = Math.abs(BeatEmUp.floorDepthPx(item.depth) - BeatEmUp.floorDepthPx(player.depth));
      if (Math.abs(item.x - player.f.x) > 42 || laneGap > 22) continue;
      if (item.kind === 'medkit') {
        const healed = Math.min(25, 100 - player.f.hp);
        if (healed <= 0) continue;
        player.f.hp += healed;
        player.f.chip = player.f.hp;
        Fx.heal(item.x - BeatEmUp.cameraX, BeatEmUp.floorDepthPx(item.depth) - 34, healed);
        Sfx.play('heal', player.f.classProfile);
      } else if (item.kind === 'energyDrink') {
        player.f.attackBoostT = BeatEmUp.energyDrinkDuration;
        Fx.powerup(item.x - BeatEmUp.cameraX, BeatEmUp.floorDepthPx(item.depth) - 38);
        Sfx.play('powerup', player.f.classProfile);
      }
      BeatEmUp.items.splice(i, 1);
    }
  }

  static onMatchOverKey() {
    // Retry on Enter/Space/j when lose/win in beatemup
    BeatEmUp.retryOrTitle(true);
    return true;
  }
  static onMatchOverTap(e) {
    if (BeatEmUp.stageOver === 1 && BeatEmUp.stage < BeatEmUp.stageTotal) {
      const btn = BeatEmUp.resultNextBtn;
      if (btn) {
        const x = (e.clientX - Game.ox) / Game.scale;
        const y = (e.clientY - Game.oy) / Game.scale;
        if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) BeatEmUp.goNextStage();
      }
      return true;
    }
    BeatEmUp.retryOrTitle(false);
    return true;
  }
  static goNextStage() {
    if (BeatEmUp.stageOver !== 1 || BeatEmUp.stage >= BeatEmUp.stageTotal || BeatEmUp.stageTransitionT > 0) return;
    BeatEmUp.stageTransitionT = BeatEmUp.stageTransitionDuration;
    BeatEmUp.stageTransitionStage = BeatEmUp.stage + 1;
    BeatEmUp.stageTransitionSwitched = 0;
  }
  static retryOrTitle(fromKey) {
    if (BeatEmUp.stageOver === -1) BeatEmUp.startCampaignStage(BeatEmUp.stage, true);
    else if (BeatEmUp.stageOver === 1 && BeatEmUp.stage < BeatEmUp.stageTotal) BeatEmUp.goNextStage();
    else if (BeatEmUp.stageOver === 1) BeatEmUp.begin();
  }

  static loseStage() {
    if (BeatEmUp.stageOver) return;
    BeatEmUp.stageOver = -1;
    Game.fighting = 0;
    Game.matchOver = 1;
    Game.phase = 'matchEnd';
    Game.winner = 'You lose';
    Game.banner = 'You lose';
    Game.bannerT = 99;
    Game.syncControls();
  }

  static begin() {
    Game.mode = 'beatemup';
    Input.syncMode();
    Game.matchOver = 0;
    Game.winner = '';
    Game.banner = '';
    Game.stop = 0;
    Game.shake = 0;
    Fx.clear();
    BeatEmUp.resetStage();
    Game.syncControls();
    Game.syncSpecialBtn();
    Game.btns = [...document.querySelectorAll('#controls button, #move-stick')].map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
  }

  static update(dt) {
    if (BeatEmUp.stageOver) return;
    const player = BeatEmUp.playerEntry();
    if (!player) return;
    if (BeatEmUp.downPending) {
      BeatEmUp.withDepth(player, () => { player.f.updateRagdoll(dt); BeatEmUp.clampFighterBones(player); });
      BeatEmUp.downTimer -= dt;
      if (BeatEmUp.downTimer <= 0) { BeatEmUp.downPending = 0; BeatEmUp.respawnPlayer(); }
      return;
    }
    BeatEmUp.updateItems(dt, player);
    BeatEmUp.comboT = Math.max(0, BeatEmUp.comboT - dt);
    if (BeatEmUp.comboT <= 0) BeatEmUp.combo = 0;
    BeatEmUp.eventT = Math.max(0, BeatEmUp.eventT - dt);
    BeatEmUp.visualCueT = Math.max(0, BeatEmUp.visualCueT - dt);

    // Camera follow player (only unlock scroll when GO)
    const targetCam = Math.max(0, Math.min(BeatEmUp.worldMax - Game.W, player.f.x - Game.W * 0.35));
    if (!BeatEmUp.locked) {
      const prev = BeatEmUp.cameraX;
      BeatEmUp.cameraX += (targetCam - BeatEmUp.cameraX) * Math.min(1, 6 * dt);
      if (BeatEmUp.cameraX < prev) BeatEmUp.cameraX = prev; // only right
      const dx = BeatEmUp.cameraX - prev;
      BeatEmUp.skyOffset += dx * 0.5;
    } else {
      // Soft clamp camera to lock window
      BeatEmUp.cameraX = Math.max(BeatEmUp.lockL, Math.min(BeatEmUp.lockR - Game.W * 0.85, Math.max(BeatEmUp.lockL, player.f.x - Game.W * 0.35)));
      BeatEmUp.cameraX = Math.max(BeatEmUp.lockL, Math.min(BeatEmUp.cameraX, BeatEmUp.lockL));
      // keep camera at lockL while locked
      BeatEmUp.cameraX = BeatEmUp.lockL;
    }

    // Depth movement for player
    let dy = 0;
    if (Input.depthHeld('up')) dy -= 1;
    if (Input.depthHeld('down')) dy += 1;
    if (dy) {
      player.depth = Math.max(0, Math.min(1, player.depth + dy * 0.9 * dt));
    }

    // Face nearest living enemy in x
    const foes = BeatEmUp.enemiesAlive();
    let nearest = null, best = 1e9;
    for (const e of foes) {
      const d = Math.abs(e.f.x - player.f.x);
      if (d < best) { best = d; nearest = e; }
    }
    const faceOther = nearest ? nearest.f : { x: player.f.x + 100 };

    // Update player with temporary ground + against dummy other for facing
    BeatEmUp.withDepth(player, () => {
      Game.minX = BeatEmUp.softMinX(player);
      Game.maxX = BeatEmUp.softMaxX(player);
      player.f.update(dt, faceOther, 0);
      BeatEmUp.clampFighterBones(player);
    });

    // AI plans pads, then each enemy updates with its own pad on slot 1
    BeatEmUp.updateGroupAI(dt, player);
    for (const e of BeatEmUp.cast) {
      if (e.role !== 'enemy') continue;
      if (e.f.hp <= 0) {
        if (e.f.ragdollActive && e.f.ragdollElapsed < 2) BeatEmUp.withDepth(e, () => e.f.updateRagdoll(dt));
        continue;
      }
      const pad = e._pad || {};
      Input.acts.forEach(a => { Input.pad[1][a] = pad[a] || 0; Input.was[1][a] = 0; });
      BeatEmUp.withDepth(e, () => {
        Game.minX = BeatEmUp.softMinX(e);
        Game.maxX = BeatEmUp.softMaxX(e);
        e.f.update(dt, player.f, 1);
        if (e.f.atk && e.f.atk !== e._tunedAtk) {
          e._tunedAtk = e.f.atk;
          if (e.kind === 'heavy') { e.f.atk.dmg *= 1.25; e.f.atk.stun += 2; }
          if (e.kind === 'runner' || e.kind === 'tough') { e.f.atk.dmg *= .8; }
          e.f.atk.dmg *= BeatEmUp.difficulty.damage;
        }
        BeatEmUp.clampFighterBones(e);
      });
      Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    }

    BeatEmUp.resolveHits();
    BeatEmUp.checkWaveState();

    if (!BeatEmUp.stageOver && Game.timer <= 0) BeatEmUp.loseStage();
    else if (!BeatEmUp.stageOver && player.f.hp <= 0) BeatEmUp.playerDown();
  }

  static updateGroupAI(dt, player) {
    const alive = BeatEmUp.enemiesAlive();
    // Pick attackers by distance in both axes; the boss gets the whole stage focus.
    const sorted = alive.slice().sort((a, b) => {
      const score = e => Math.abs(e.f.x - player.f.x) + Math.abs(e.depth - player.depth) * 180;
      return score(a) - score(b);
    });
    const boss = sorted.find(e => e.kind === 'boss');
    const attackers = boss ? new Set([boss]) : new Set(sorted.slice(0, 2));
    for (const e of alive) {
      const ai = e.ai;
      ai.cool = Math.max(0, ai.cool - dt);
      ai.phaseCallout = Math.max(0, ai.phaseCallout - dt);
      if (e.kind === 'boss') {
        const ratio = e.f.hp / (BeatEmUp.bossMaxHp || 220);
        const phase = ratio <= .33 ? 3 : ratio <= .66 ? 2 : 1;
        if (phase !== ai.phase) {
          ai.phase = phase;
          ai.phaseCallout = 1.1;
          e.scaleMul = phase === 3 ? 1.42 : phase === 2 ? 1.32 : 1.25;
        }
      }
      const dist = Math.abs(e.f.x - player.f.x);
      const depthGap = Math.abs(e.depth - player.depth);
      Input.pad[1].left = 0; Input.pad[1].right = 0;
      Input.pad[1].punch = 0; Input.pad[1].kick = 0;
      Input.pad[1].block = 0; Input.pad[1].jump = 0; Input.pad[1].special = 0;

      if (ai.tellT > 0) {
        ai.tellT = Math.max(0, ai.tellT - dt);
        if (ai.tellT <= 0) {
          Input.pad[1][ai.tellMove] = 1;
          ai.cool = e.kind === 'boss' ? Math.max(.42, .8 - ai.phase * .12) : e.kind === 'runner' || e.kind === 'tough' ? .52 : e.kind === 'heavy' ? .95 : .7;
          ai.tellMove = ''; ai.tellKind = '';
        }
        BeatEmUp._driveEnemyPad(e, player, dt);
        continue;
      }

      if (!attackers.has(e)) {
        // Circle: orbit around player at preferred depth
        ai.mode = 'circle';
        ai.orbit += dt * 1.2;
        const tx = player.f.x + Math.cos(ai.orbit) * 140;
        const td = Math.max(0, Math.min(1, player.depth + Math.sin(ai.orbit * 0.7) * 0.35));
        if (e.f.x < tx - 8) Input.pad[1].right = 1;
        else if (e.f.x > tx + 8) Input.pad[1].left = 1;
        if (e.depth < td - 0.04) e.depth = Math.min(1, e.depth + 0.7 * dt);
        else if (e.depth > td + 0.04) e.depth = Math.max(0, e.depth - 0.7 * dt);
        // Apply pad then clear for next enemy — must update this enemy with its pad
        BeatEmUp._driveEnemyPad(e, player, dt);
        continue;
      }

      ai.mode = 'attack';
      // Match depth then close in
      if (e.depth < player.depth - 0.05) e.depth = Math.min(1, e.depth + 0.85 * dt);
      else if (e.depth > player.depth + 0.05) e.depth = Math.max(0, e.depth - 0.85 * dt);
      const reach = Moves.punch.reach + 10;
      if (dist > reach) {
        if (e.f.x < player.f.x) Input.pad[1].right = 1;
        else Input.pad[1].left = 1;
      } else if (ai.cool <= 0 && depthGap < 0.2) {
        let move;
        const canSpecial = e.f.specialDamageMultiplier > 0 && e.f.meter >= 100
          && (e.kind !== 'boss' || ai.phase >= 2);
        const specialChance = e.kind === 'boss' ? .24 : .12;
        if (canSpecial && Math.random() < specialChance) move = 'special';
        else if (e.kind === 'heavy') move = Math.random() < .7 ? 'kick' : 'punch';
        else if (e.kind === 'runner' || e.kind === 'tough') move = Math.random() < .62 ? 'kick' : 'punch';
        else move = Math.random() < .72 ? 'punch' : 'kick';
        ai.tellMove = move;
        ai.tellKind = move === 'special' ? 'CHARGE' : move.toUpperCase();
        ai.tellT = e.kind === 'boss' ? .72 : e.kind === 'heavy' ? .48 : .34;
      }
      BeatEmUp._driveEnemyPad(e, player, dt);
    }
    // Clear bot pad
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  }

  static _driveEnemyPad(e, player, dt) {
    // Enemy updates happen in main loop; here we stash desired pad on entry
    e._pad = {
      left: Input.pad[1].left, right: Input.pad[1].right,
      punch: Input.pad[1].punch, kick: Input.pad[1].kick,
      block: Input.pad[1].block, jump: 0, special: Input.pad[1].special,
    };
    Input.acts.forEach(a => { Input.pad[1][a] = 0; });
  }

  static applyEnemyPads() {
    // Called per-enemy before update — set Input.pad[1] from stash
  }

  static resolveHits() {
    const living = BeatEmUp.cast.filter(e => e.f.hp > 0);
    for (const attacker of living) {
      for (const target of living) {
        if (attacker === target || target.f.hp <= 0) continue;
        if (attacker.role === 'enemy' && target.role === 'enemy') continue;
        const atk = attacker.f.atk;
        const pulse = atk ? Math.min((atk.hitCount || 1) - 1, Math.floor((attacker.f.atkT - atk.su - 1) / Math.max(1, atk.ac / (atk.hitCount || 1)))) : 0;
        if (attacker.f.state === 'special' && attacker.f.hitTargets.get(target) === pulse) continue;
        if (atk && attacker.f.state === 'special' && (!target.f.grounded || target.f.dodgeT > 0)) continue;
        if (!BeatEmUp.depthClose(attacker.depth, target.depth)) continue;
        let hit = null;
        BeatEmUp.withDepth(attacker, () => { hit = attacker.f.strike(); });
        if (!hit) continue;
        let th = null;
        BeatEmUp.withDepth(target, () => { th = { x: target.f.hitbox.x, y: target.f.hitbox.y, w: target.f.hitbox.w, h: target.f.hitbox.h }; });
        if (!th || !Game.hitTest(hit, th)) continue;
        if (target.f.playerControlled && target.f.invincibleT > 0) continue;
        attacker.f.hitDone = 1;
        if (hit.special) attacker.f.hitTargets.set(target, hit.pulse);
        const hpBefore = target.f.hp;
        let kind = 'hit';
        BeatEmUp.withDepth(target, () => { kind = target.f.takeHit(hit, attacker.f); });
        const damage = Math.round((hpBefore - target.f.hp) * 10) / 10;
        const confirmed = attacker.f.confirmHit(kind, damage);
        const specialFirst = hit.special && !attacker.f.specialEffectDone;
        attacker.f.gainMeter(hit.special ? 0 : hit.dmg * 2.5);
        if (!hit.special || !attacker.f.specialMeterTargets.has(target)) target.f.gainMeter(hit.special ? 12 : hit.dmg * 1.5);
        if (hit.special) attacker.f.specialMeterTargets.add(target);
        const cx = hit.x + hit.w / 2, cy = hit.y + hit.h / 2;
        if (attacker.role === 'player') Game.tryComboStun(
          attacker.f, target.f, hit, kind, confirmed, cx - BeatEmUp.cameraX, cy - 58
        );
        if (attacker.role === 'player') {
          if (hit.comboFinisher && specialFirst) Fx.combo(cx - BeatEmUp.cameraX, cy - 34, Fighter.comboMessage(hit, attacker.f.state, attacker.f.comboHits), attacker.f.classProfile);
          else if (confirmed && attacker.f.comboHits >= 2) Fx.combo(cx - BeatEmUp.cameraX, cy - 34, Fighter.comboMessage(hit, attacker.f.state, attacker.f.comboHits), attacker.f.classProfile);
        }
        const criticalHit = !!hit.critical && kind !== 'block';
        Fx.damage(cx - BeatEmUp.cameraX, cy - 12, damage, kind === 'block', criticalHit);
        if (criticalHit) { Fx.critical(cx - BeatEmUp.cameraX, cy, attacker.f.classProfile); Sfx.play('critical', attacker.f.classProfile); }
        if (hit.special && !attacker.f.specialEffectDone) {
          Fx.special(cx - BeatEmUp.cameraX, cy, attacker.f.classProfile);
          Sfx.play(attacker.role === 'player' ? 'player-special-hit' : 'super-hit', attacker.f.classProfile);
          attacker.f.specialEffectDone = 1;
        }
        else if (kind === 'block') Fx.blocked(cx, cy);
        else if (!criticalHit) Fx.hit(cx, cy);
        if (attacker.role === 'player' && !hit.special && kind === 'hit' && damage > 0)
          Sfx.play(attacker.f.state === 'kick' || attacker.f.state === 'airKick' ? 'player-heavy-hit' : 'player-normal-hit', attacker.f.classProfile);
        Game.stop = .05; Game.shake = .1; Game.shMag = 3;
        if (kind === 'hit') target.f.vy = -100;
        if (attacker.role === 'player') {
          BeatEmUp.combo = BeatEmUp.comboT > 0 ? BeatEmUp.combo + 1 : 1;
          BeatEmUp.comboT = 2.4;
          BeatEmUp.awardScore(damage * (kind === 'block' ? 35 : 100) + BeatEmUp.combo * 25 + (specialFirst ? 300 : 0));
          if (hpBefore > 0 && target.f.hp <= 0) {
            BeatEmUp.awardScore(target.kind === 'boss' ? 2500 : 300);
            BeatEmUp.dropItem(target);
          }
        }
      }
    }
  }

  static checkWaveState() {
    if (Game.phase !== 'fight') return;
    if (BeatEmUp.enemiesAlive().length > 0) return;
    if (BeatEmUp.wave >= 1 && BeatEmUp.wave <= 3) {
      if (!BeatEmUp.goArmed) {
        BeatEmUp.goArmed = 1;
        BeatEmUp.showGo = 1;
        BeatEmUp.locked = 0;
      }
      const p = BeatEmUp.playerEntry();
      // Advance when player walks far enough into the next zone
      if (p && p.f.x > BeatEmUp.lockL + Game.W * 0.78) {
        BeatEmUp.showGo = 0;
        BeatEmUp.travelToWave(BeatEmUp.wave < 3 ? BeatEmUp.wave + 1 : 4);
      }
    } else if (BeatEmUp.wave === 4) {
      // Boss dead
      BeatEmUp.stageOver = 1;
      Game.fighting = 0;
      Game.matchOver = 1;
      Game.phase = 'matchEnd';
      Game.winner = BeatEmUp.stage >= BeatEmUp.stageTotal ? 'Campaign complete' : 'Stage ' + BeatEmUp.stage + ' clear';
      Game.banner = Game.winner;
      Game.bannerT = 99;
      Game.syncControls();
      BeatEmUp.awardScore(Math.ceil(Game.timer) * 50 + BeatEmUp.lives * 500);
    }
  }

  static drawStageBackdrop(ctx) {
    const image = BeatEmUp.background(BeatEmUp.stage - 1);
    if (!image?.complete || !image.naturalWidth) return;
    ctx.save();
    ctx.drawImage(image, 0, 0, Game.W, Game.H);
    ctx.restore();
  }
  static drawStageVisualCue(ctx) {
    if (!BeatEmUp.visualCue || BeatEmUp.visualCueT <= 0) return;
    const cue = BeatEmUp.visualCue.toLowerCase();
    const time = performance.now() * .001;
    const fade = Math.min(1, BeatEmUp.visualCueT * 1.6);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Environmental light sweeps and flickers echo each authored wave cue.
    if (/dark|dim/.test(cue)) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = (.08 + .13 * (.5 + .5 * Math.sin(time * 5))) * fade;
      ctx.fillStyle = '#050711'; ctx.fillRect(0, 0, Game.W, Game.H * .78);
    } else if (/sweep|move|shift|pulse|blink|flash|focus|light|lantern|flicker|signal|monitor|broadcast|glow|vehicle/.test(cue)) {
      const sweepX = ((time * 190) % (Game.W + 300)) - 150;
      const width = cue.includes('sweep') || cue.includes('move') || cue.includes('shift') ? 170 : 110;
      const beam = ctx.createLinearGradient(sweepX - width, 0, sweepX + width, 0);
      beam.addColorStop(0, 'rgba(74,202,255,0)');
      beam.addColorStop(.5, `rgba(74,202,255,${.12 * fade})`);
      beam.addColorStop(1, 'rgba(74,202,255,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(0, 0, Game.W, Game.H * .72);
    }

    if (/spark|flare|furnace|machinery/.test(cue)) {
      ctx.fillStyle = `rgba(255,166,67,${.62 * fade})`;
      for (let i = 0; i < 7; i++) {
        const phase = time * (1.8 + i * .17) + i * 2.1;
        const x = ((i * 139 + time * 45) % Game.W);
        const y = Game.H * (.22 + .17 * Math.abs(Math.sin(phase)));
        ctx.fillRect(x, y, 2.5 / Game.scale, 2.5 / Game.scale);
      }
    }

    if (/silhouette/.test(cue)) {
      const x = Game.W - ((time * 150) % (Game.W + 150));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = .32 * fade;
      ctx.fillStyle = '#090C19';
      ctx.beginPath(); ctx.arc(x, Game.H * .39, 12 / Game.scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 5 / Game.scale, Game.H * .41, 10 / Game.scale, 34 / Game.scale);
    }

    if (/map board|control room|monitors|broadcast indicator|cargo area/.test(cue)) {
      const pulse = .35 + .25 * (1 + Math.sin(time * 5));
      ctx.globalAlpha = pulse * fade;
      ctx.fillStyle = '#54D8FF';
      ctx.shadowColor = '#54D8FF'; ctx.shadowBlur = 18 / Game.scale;
      ctx.fillRect(Game.W * .72, Game.H * .20, 5 / Game.scale, 30 / Game.scale);
      ctx.shadowBlur = 0;
    }
    if (/entrance|door|passage|gate|clears/.test(cue)) {
      const pulse = .28 + .22 * (1 + Math.sin(time * 4));
      const x = Game.W * .76, y = Game.H * .31, w = 42 / Game.scale, h = 92 / Game.scale;
      ctx.globalAlpha = pulse * fade;
      ctx.fillStyle = '#F6C453'; ctx.shadowColor = '#F6C453'; ctx.shadowBlur = 22 / Game.scale;
      ctx.fillRect(x - w / 2, y, w, h);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  static drawItems(ctx) {
    for (const item of BeatEmUp.items) {
      const floorY = BeatEmUp.floorDepthPx(item.depth);
      const blink = item.life < 3 && Math.floor(item.life * 8) % 2 === 0;
      ctx.save();
      ctx.translate(item.x - BeatEmUp.cameraX, floorY);
      ctx.globalAlpha = blink ? .52 : 1;
      ctx.fillStyle = 'rgba(0,0,0,.62)';
      ctx.beginPath(); ctx.ellipse(0, 1, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
      const bob = Math.sin(item.bob) * 2;
      ctx.translate(0, bob);
      if (item.kind === 'energyDrink') {
        const sc = Game.scale || 1;
        ctx.shadowColor = '#FF354F'; ctx.shadowBlur = 8 / sc;
        ctx.fillStyle = '#7D1726'; ctx.fillRect(-9, -27, 18, 23);
        ctx.fillStyle = '#ED344B'; ctx.fillRect(-8, -26, 16, 21);
        ctx.fillStyle = '#E6EDF7'; ctx.fillRect(-8, -22, 16, 6);
        ctx.fillStyle = '#A9B8CA'; ctx.fillRect(-5, -30, 10, 3);
        ctx.fillStyle = '#FFE06B';
        ctx.beginPath(); ctx.moveTo(1, -21); ctx.lineTo(-3, -15); ctx.lineTo(0, -15); ctx.lineTo(-2, -9); ctx.lineTo(4, -17); ctx.lineTo(1, -17); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#D89A35'; ctx.fillRect(-12, -27, 24, 21);
        ctx.fillStyle = '#F7F2D9'; ctx.fillRect(-10, -29, 20, 19);
        ctx.fillStyle = '#D8E7F2'; ctx.fillRect(-10, -29, 20, 3);
        ctx.fillStyle = '#E94452'; ctx.fillRect(-2, -25, 4, 12); ctx.fillRect(-6, -21, 12, 4);
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(-8, -25, 2, 5);
      }
      ctx.restore();
    }
  }
  static drawArena(ctx) {
    const sc = Game.scale;
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1] || BeatEmUp.chapters[0];
    const bandTopY = Game.H * BeatEmUp.BAND_TOP;
    const bandBotY = Game.H * BeatEmUp.BAND_BOT;
    const sky = ctx.createLinearGradient(0, 0, 0, Game.H);
    sky.addColorStop(0, chapter.sky[0]);
    sky.addColorStop(.62, chapter.sky[1]);
    sky.addColorStop(1, '#0C0D10');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, Game.W, Game.H);

    BeatEmUp.drawStageBackdrop(ctx);
    BeatEmUp.drawStageVisualCue(ctx);

    // Let the fighters share the scene's floor while shading the play space for contrast.
    const floorShade = ctx.createLinearGradient(0, Game.H * .42, 0, Game.H);
    floorShade.addColorStop(0, 'rgba(8,10,18,.04)');
    floorShade.addColorStop(.30, 'rgba(8,10,18,.20)');
    floorShade.addColorStop(.66, 'rgba(8,10,18,.48)');
    floorShade.addColorStop(1, 'rgba(5,6,10,.72)');
    ctx.fillStyle = floorShade;
    ctx.fillRect(0, Game.H * .42, Game.W, Game.H * .58);

    // Subtle world-anchored floor seams slide with the camera during wave travel.
    const floorTop = bandTopY + (bandBotY - bandTopY) * .08;
    const floorTile = 72 / sc;
    const floorScroll = ((BeatEmUp.cameraX % floorTile) + floorTile) % floorTile;
    ctx.save();
    ctx.globalAlpha = .105;
    ctx.strokeStyle = '#A9C6E8';
    ctx.lineWidth = 1 / sc;
    const horizonX = Game.W * .5 - (BeatEmUp.cameraX % (floorTile * 2)) * .12;
    for (let x = -floorTile - floorScroll; x <= Game.W + floorTile; x += floorTile) {
      const topX = horizonX + (x - Game.W * .5) * .16;
      ctx.beginPath(); ctx.moveTo(topX, floorTop); ctx.lineTo(x, Game.H); ctx.stroke();
    }
    for (let i = 1; i <= 5; i++) {
      const depth = i / 6;
      const y = floorTop + (Game.H - floorTop) * depth * depth;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Game.W, y); ctx.stroke();
    }
    ctx.restore();

    // Faint lane guides retain depth cues without boxing the movement area in.
    ctx.save();
    ctx.globalAlpha = .10;
    ctx.strokeStyle = '#9AA5C2';
    ctx.lineWidth = 1 / sc;
    for (let i = 1; i <= 3; i++) {
      const y = bandTopY + (bandBotY - bandTopY) * i / 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Game.W, y); ctx.stroke();
    }
    ctx.restore();
  }


  static drawFighter(ctx, entry) {
    BeatEmUp.withDepth(entry, () => {
      ctx.save();
      ctx.translate(-BeatEmUp.cameraX, 0);
      const bodyW = Math.max(36, 42 * Fighter.S);
      const rw = (bodyW * 0.8) / 2;
      const rh = Math.max(5, rw * 0.36);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#0E0F12';
      ctx.beginPath();
      ctx.ellipse(entry.f.x, Game.GROUND + 1, rw, rh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      const drawTag = entry.f.tag;
      const showAlert = entry.ai && (entry.ai.tellT > 0 || entry.ai.phaseCallout > 0);
      // Repeated rookie/regular labels stack into noise when a wave crowds
      // around the player. Keep identity labels for the player and boss only.
      if (showAlert || (entry.kind !== 'boss' && entry.role !== 'player')) entry.f.tag = '';
      entry.f.draw(ctx);
      entry.f.tag = drawTag;
      if (entry.ai && entry.ai.tellT > 0) {
        const head = entry.f.bones().head;
        const label = entry.ai.tellKind || 'ATTACK';
        const pulse = .78 + .22 * Math.sin(performance.now() * .018);
        const labelY = head.y - 24 / Game.scale;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = entry.kind === 'boss' ? '#FBBF24' : '#FF665F';
        ctx.beginPath(); ctx.arc(head.x, labelY, 11 / Game.scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#11131A'; ctx.font = 'bold ' + 12 / Game.scale + 'px system-ui,sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', head.x, labelY + 1 / Game.scale);
        ctx.globalAlpha = 1;
        ctx.font = 'bold ' + 10 / Game.scale + 'px system-ui,sans-serif';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3 / Game.scale; ctx.strokeStyle = '#11131A';
        ctx.strokeText(label, head.x, labelY - 15 / Game.scale);
        ctx.fillStyle = '#FFFFFF'; ctx.fillText(label, head.x, labelY - 15 / Game.scale);
        ctx.textBaseline = 'alphabetic';
      }
      if (entry.kind === 'boss' && entry.ai && entry.ai.phaseCallout > 0 && entry.ai.tellT <= 0) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + 14 / Game.scale + 'px system-ui,sans-serif';
        ctx.lineWidth = 4 / Game.scale; ctx.strokeStyle = '#11131A';
        ctx.strokeText('PHASE ' + entry.ai.phase, entry.f.x, entry.f.bones().head.y - 42 / Game.scale);
        ctx.fillStyle = '#FBBF24'; ctx.fillText('PHASE ' + entry.ai.phase, entry.f.x, entry.f.bones().head.y - 42 / Game.scale);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();
    });
  }

  static bars(ctx) {
    const sc = Game.scale, safe = Game.safeTop;
    const top = (12 + safe) / sc, h = 12 / sc, {w,gap,x0} = Game.hudBarLayout(70);
    const me = fighters[0], accent = me.hp <= 25 ? '#FF655F' : (me.classProfile?.accent || '#63D9FF');
    const panelH = 34 / sc, panelY = top - 2 / sc;
    Game.drawHudPanel(ctx, x0, panelY, w, panelH, accent);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace';
    const badgeX = x0 + 14 / sc, badgeY = top + 15 / sc;
    ctx.fillStyle = '#0B1422'; ctx.beginPath(); ctx.arc(badgeX, badgeY, 9 / sc, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5 / sc; ctx.stroke();
    ctx.fillStyle = me.color; ctx.beginPath(); ctx.arc(badgeX, badgeY - 2 / sc, 3 / sc, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(badgeX, badgeY + 6 / sc, 4.5 / sc, Math.PI, 0); ctx.fill();
    ctx.textAlign = 'center'; ctx.font = 'bold ' + 5 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFFFFF';
    ctx.fillText('1', badgeX + 6 / sc, badgeY - 6 / sc);
    ctx.textAlign = 'left'; ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = me.hp <= 25 ? '#FF655F' : '#DCE8F5';
    const infoX = x0 + 27 / sc;
    ctx.fillText('PLAYER 01 · HP ' + Math.ceil(me.hp) + '/100', infoX, top + 4 / sc);
    const barX = infoX, barY = top + 10 / sc, barW = w - 36 / sc, barH = 8 / sc;
    Game.drawHudProgress(ctx, barX, barY, barW, barH, Math.min(100, me.hp) / 100, me.color, me.chip / 100);
    const meterY = top + 22 / sc, meterX = infoX + 31 / sc, meterW = w - 67 / sc, meterH = 3 / sc;
    ctx.font = 'bold ' + 7 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#AEBBD0'; ctx.fillText('SP ' + Math.floor(me.meter) + '%', infoX, meterY + 1.5 / sc);
    Game.drawHudProgress(ctx, meterX, meterY, meterW, meterH, me.meter / 100, me.meter >= 100 ? accent : '#A78BFA');

    const timerW = 62 / sc, timerX = Game.W / 2 - timerW / 2;
    Game.drawHudPanel(ctx, timerX, panelY, timerW, panelH, Game.timer <= 30 ? '#FF655F' : '#F6C453');
    ctx.textAlign = 'center'; ctx.font = 'bold ' + 7 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#AEBBD0';
    ctx.fillText('TIME', Game.W / 2, top + 4 / sc);
    ctx.font = 'bold ' + 16 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = Game.timer <= 30 ? '#FF736D' : '#FFF0C2';
    ctx.fillText(BeatEmUp.formatTime(Game.timer), Game.W / 2, top + 19 / sc);

    const stageX = Game.W / 2 + 39 / sc, stageW = 136 / sc;
    Game.drawHudPanel(ctx, stageX, panelY, stageW, panelH, '#6ECFFF');
    ctx.textAlign = 'center'; ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#D8E6F6';
    ctx.fillText('STAGE ' + String(BeatEmUp.stage).padStart(2, '0'), stageX + stageW / 2, top + 8 / sc);
    ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#6ECFFF';
    const waveLabel = BeatEmUp.wave <= 3 ? 'WAVE ' + BeatEmUp.wave + '/' + BeatEmUp.waveTotal : 'BOSS ROUND';
    ctx.fillText(waveLabel, stageX + stageW / 2 - 11 / sc, top + 22 / sc);
    if (BeatEmUp.wave <= 3) {
      const dotGap = 7 / sc, dotR = 1.8 / sc, dotX = stageX + stageW - 16 / sc;
      for (let i = 1; i <= BeatEmUp.waveTotal; i++) {
        ctx.beginPath(); ctx.arc(dotX + (i - BeatEmUp.waveTotal) * dotGap, top + 22 / sc, dotR, 0, Math.PI * 2);
        ctx.fillStyle = i <= BeatEmUp.wave ? '#6ECFFF' : 'rgba(174,187,208,.45)'; ctx.fill();
      }
    }

    const infoY = top + 43 / sc;
    ctx.textBaseline = 'middle'; ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace';
    Game.drawHudPanel(ctx, x0, infoY - 7 / sc, 106 / sc, 16 / sc, '#F6C453');
    ctx.textAlign = 'left'; ctx.fillStyle = '#FFE6A7'; ctx.fillText('SCORE ' + String(BeatEmUp.score).padStart(6, '0'), x0 + 8 / sc, infoY + 1 / sc);
    const player = BeatEmUp.playerEntry()?.f;
    if (player?.attackBoostT > 0) {
      const boostY = infoY + 13 / sc;
      Game.drawHudPanel(ctx, x0, boostY - 7 / sc, 116 / sc, 16 / sc, '#FF5264');
      ctx.textAlign = 'left'; ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFD9DE';
      ctx.fillText('ATK ×1.5  ' + Math.ceil(player.attackBoostT) + 's', x0 + 8 / sc, boostY + 1 / sc);
    }
    const bestX = Game.W - 230 / sc;
    Game.drawHudPanel(ctx, bestX, infoY - 7 / sc, 112 / sc, 16 / sc, '#7285A4');
    ctx.fillStyle = '#C8D2E3'; ctx.fillText('BEST ' + String(BeatEmUp.bestScore).padStart(6, '0'), bestX + 8 / sc, infoY + 1 / sc);
    Game.drawHudPanel(ctx, Game.W - 91 / sc, panelY, 79 / sc, panelH, '#F6C453');
    ctx.textAlign = 'center'; ctx.fillStyle = '#FFE6A7'; ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace';
    ctx.fillText('LIVES ×' + BeatEmUp.lives, Game.W - 51.5 / sc, top + 17 / sc);
    if (BeatEmUp.combo > 1 && BeatEmUp.comboT > 0) {
      Game.drawHudPanel(ctx, Game.W / 2 - 56 / sc, infoY - 7 / sc, 112 / sc, 16 / sc, '#F6C453');
      ctx.textAlign = 'center'; ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFE06B';
      ctx.fillText(BeatEmUp.combo + ' HIT COMBO', Game.W / 2, infoY + 1 / sc);
    }
    if (BeatEmUp.boss && BeatEmUp.boss.f.hp > 0) {
      const bw = Math.min(Game.W * .36, 360 / sc), bh = 14 / sc, bx = (Game.W - bw) / 2, by = infoY + 10 / sc;
      Game.drawHudPanel(ctx, bx, by, bw, bh, '#FF5D67');
      ctx.textAlign = 'left'; ctx.font = 'bold ' + 7 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFD7DA';
      ctx.fillText('BOSS', bx + 7 / sc, by + bh / 2);
      const hpX = bx + 42 / sc, hpY = by + 4 / sc, hpW = bw - 50 / sc, hpH = 6 / sc;
      ctx.fillStyle = '#080C14'; ctx.fillRect(hpX, hpY, hpW, hpH);
      ctx.fillStyle = BeatEmUp.boss.f.color; ctx.fillRect(hpX, hpY, hpW * Math.max(0, BeatEmUp.boss.f.hp / BeatEmUp.bossMaxHp), hpH);
    }
    ctx.textBaseline = 'alphabetic';
  }
  static draw(ctx) {
    BeatEmUp.drawArena(ctx);
    if (BeatEmUp.stageOver) {
      const corpses = BeatEmUp.cast.filter(e => e.f.ragdollKO && e.f.ragdollElapsed < 2).slice().sort((a, b) => a.depth - b.depth);
      for (const e of corpses) BeatEmUp.drawFighter(ctx, e);
      Fx.draw(ctx);
      BeatEmUp.drawResults(ctx);
      return;
    }
    BeatEmUp.drawItems(ctx);
    const ordered = BeatEmUp.cast.filter(e => e.f.hp > 0 || e.role === 'player' || (e.f.ragdollKO && e.f.ragdollElapsed < 2)).slice()
      .sort((a, b) => a.depth - b.depth);
    for (const e of ordered) BeatEmUp.drawFighter(ctx, e);
    Fx.draw(ctx);
    BeatEmUp.bars(ctx);
    if (BeatEmUp.showGo) {
      const sc = Game.scale;
      const x = Game.W * 0.85;
      const y = Game.H * 0.30;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      Game.drawHudPanel(ctx, x - 62 / sc, y - 24 / sc, 124 / sc, 48 / sc, '#F6C453');
      ctx.font = 'bold ' + 27 / sc + 'px ui-monospace,monospace';
      ctx.fillStyle = '#FFE06B';
      ctx.fillText('GO →', x, y);
      ctx.textBaseline = 'alphabetic';
    }
    if (BeatEmUp.eventT > 0 && BeatEmUp.waveEvent) {
      const sc = Game.scale;
      ctx.globalAlpha = Math.min(1, BeatEmUp.eventT * 2);
      const hasStory = !!BeatEmUp.storyText;
      const hasSubStory = !!BeatEmUp.storySubText;
      const countdown = BeatEmUp.stageIntroT > 0;
      const boxW = Math.min(Game.W * .84, 520 / sc), boxH = (hasSubStory ? 72 : hasStory ? 50 : 30) / sc + (countdown ? 14 / sc : 0);
      const boxY = Game.H * .25 - boxH / 2;
      Game.drawHudPanel(ctx, (Game.W - boxW) / 2, boxY, boxW, boxH, '#F6C453');
      ctx.font = 'bold ' + 13 / sc + 'px ui-monospace,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FBBF24';
      ctx.fillText(BeatEmUp.waveEvent, Game.W / 2, Game.H * .25 - (hasStory ? (hasSubStory ? 22 : 9) / sc : 0), boxW - 16 / sc);
      if (hasStory) {
        ctx.font = (10 / sc) + 'px ui-monospace,monospace'; ctx.fillStyle = '#E7EAF2';
        ctx.fillText(BeatEmUp.storyText, Game.W / 2, Game.H * .25 + (hasSubStory ? -6 : 11) / sc, boxW - 16 / sc);
      }
      if (hasSubStory) {
        ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#8EDFFF';
        ctx.fillText(BeatEmUp.storySubText, Game.W / 2, Game.H * .25 + 13 / sc, boxW - 16 / sc);
      }
      if (countdown) {
        ctx.font = 'bold ' + 10 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFE06B';
        ctx.fillText('FIGHT BEGINS IN ' + Math.ceil(BeatEmUp.stageIntroT), Game.W / 2, Game.H * .25 + 30 / sc);
      }
      ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
    }
  }

  static drawResults(ctx) {
    const sc = Game.scale;
    const w = Math.min(Game.W * .82, 620 / sc);
    const cleared = BeatEmUp.stageOver === 1;
    const h = (cleared ? 178 : 130) / sc;
    const x = (Game.W - w) / 2, y = cleared ? Game.H * .38 : Game.H * .49;
    Game.drawHudPanel(ctx, x, y, w, h, cleared ? '#F6C453' : '#FF655F');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const finalClear = cleared && BeatEmUp.stage >= BeatEmUp.stageTotal;
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1] || BeatEmUp.chapters[0];
    const headline = cleared ? (finalClear ? 'CAMPAIGN COMPLETE' : 'STAGE ' + BeatEmUp.stage + ' CLEAR') : 'STAGE ' + BeatEmUp.stage + ' FAILED';
    ctx.font = 'bold ' + 16 / sc + 'px ui-monospace,monospace';
    ctx.fillStyle = cleared ? '#FBBF24' : '#F87171';
    ctx.fillText(headline, Game.W / 2, y + 20 / sc);
    if (cleared) {
      ctx.font = 'bold ' + 10 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#D7E1F0';
      ctx.fillText('DEFEATED: ' + chapter.boss.name, Game.W / 2, y + 43 / sc, w - 24 / sc);
      ctx.font = (9 / sc) + 'px ui-monospace,monospace'; ctx.fillStyle = '#E7EAF2';
      ctx.fillText(chapter.clear, Game.W / 2, y + 61 / sc, w - 28 / sc);
      if (!finalClear) {
        const next = BeatEmUp.chapters[BeatEmUp.stage];
        ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#8EDFFF';
        ctx.fillText('NEXT: ' + next.title + ' · ' + next.location, Game.W / 2, y + 82 / sc, w - 28 / sc);
      }
      ctx.font = 'bold ' + 12 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFFFFF';
      ctx.fillText('SCORE  ' + String(BeatEmUp.score).padStart(6, '0'), Game.W / 2, y + 105 / sc);
      ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FBBF24';
      ctx.fillText('BEST  ' + String(BeatEmUp.bestScore).padStart(6, '0') + '   TIME ' + BeatEmUp.formatTime(Game.timer) + '   LIVES ×' + BeatEmUp.lives, Game.W / 2, y + 127 / sc);
      BeatEmUp.resultNextBtn = null;
      if (!finalClear) {
        const btn = { x: Game.W / 2 - 100 / sc, y: y + 143 / sc, w: 200 / sc, h: 27 / sc };
        BeatEmUp.resultNextBtn = btn;
        ctx.shadowColor = '#F6C453'; ctx.shadowBlur = 7 / sc;
        Game.drawHudPanel(ctx, btn.x, btn.y, btn.w, btn.h, '#F6C453'); ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFE06B'; ctx.fillRect(btn.x + 6 / sc, btn.y + 5 / sc, btn.w - 12 / sc, 2 / sc);
        ctx.font = 'bold ' + 11 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFF0C2';
        ctx.fillText('NEXT STAGE  →', Game.W / 2, btn.y + btn.h / 2 + 1 / sc);
      }
    } else {
      ctx.font = 'bold ' + 10 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#D7E1F0';
      ctx.fillText('Regroup and fight through ' + chapter.title.toLowerCase() + ' again.', Game.W / 2, y + 43 / sc, w - 24 / sc);
      ctx.font = 'bold ' + 13 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFFFFF';
      ctx.fillText('SCORE  ' + String(BeatEmUp.score).padStart(6, '0'), Game.W / 2, y + 70 / sc);
      ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FBBF24';
      ctx.fillText('BEST  ' + String(BeatEmUp.bestScore).padStart(6, '0') + '   TIME ' + BeatEmUp.formatTime(Game.timer) + '   LIVES ×' + BeatEmUp.lives, Game.W / 2, y + 96 / sc);
      ctx.fillStyle = '#D7DCE9';
      const promptW = Math.min(w - 36 / sc, 520 / sc), promptY = y + h + 7 / sc;
      Game.drawHudPanel(ctx, Game.W / 2 - promptW / 2, promptY, promptW, 26 / sc, '#6ECFFF');
      ctx.fillText('TAP OR PRESS ENTER TO RETRY THIS STAGE', Game.W / 2, promptY + 13 / sc);
    }
    ctx.textBaseline = 'alphabetic';
  }
}


var fighters = [new Fighter(0, PlayerCoolColor, 1, 'YOU'), new Fighter(0, CpuHotColors['1v1'], -1, 'CPU')];

class Game {
  static W = 960; static H = 540; static GROUND = 390; static STEP = 1 / 60;
  static minX = 192; static maxX = 768; static scale = 1; static ox = 0; static oy = 0;
  static hr = 16.5; static lw = 6; static btns = [];
  static safeTop = 0; static safeL = 0; static safeR = 0; static menuRight = 0;
  static actionButtons = { special: null, roll: null };
  static stop = 0; static shake = 0; static shMag = 0;
  static canvas; static ctx; static acc = 0; static last = 0;
  static round = 1; static wins = [0, 0]; static timer = 60;
  static phase = 'title'; static banner = ''; static bannerT = 0;
  static fighting = 0; static matchOver = 0; static winner = '';
  static level = 'normal';
  static arcadeLevel = 'normal';
  static levels = ['easy', 'normal', 'hard'];
  static levelLabels = {easy:'Easy', normal:'Normal', hard:'Hard'};
  static titleBtns = [];
  static selectedClass = 'freehand';
  static paused = false;
  static actionMenuOpen = false;
  static titleBackground = (() => { const image = new Image(); image.src = 'assets/backgrounds/main-menu.webp'; return image; })();
  static practiceDummyX = 0;
  static practiceComboHits = 0;
  static practiceComboDamage = 0;
  static practiceComboT = 0;
  static practiceLastMove = '';
  static init() {
    Game.canvas = document.getElementById('game'); Game.ctx = Game.canvas.getContext('2d');
    try {
      const saved = localStorage.getItem('stickman-level');
      if (saved && Diff[saved]) Game.level = saved;
      const savedArcadeLevel = localStorage.getItem('stickman-beatemup-level');
      if (savedArcadeLevel && ArcadeDiff[savedArcadeLevel]) Game.arcadeLevel = savedArcadeLevel;
      const savedClass = localStorage.getItem('stickman-beatemup-class');
      const legacyClass = {boxer:'freehand', kickboxing:'freehand', ninja:'blade', taekwondo:'blade', brawler:'staff', guardian:'freehand', muaythai:'staff', sumo:'staff', wingchun:'freehand'}[savedClass];
      if (FighterClasses[savedClass]) Game.selectedClass = savedClass;
      else if (FighterClasses[legacyClass]) Game.selectedClass = legacyClass;
    } catch (e) {}
    Input.bind(); Game.mode = '1v1'; Input.syncMode(); Game.goTitle(); Game.fit(); addEventListener('resize', () => Game.fit());
    Game.last = performance.now(); requestAnimationFrame(Game.frame);
  }
  static mode = '1v1';
  static goTitle() {
    Game.closeActionMenu();
    Game.phase = 'title'; Game.fighting = 0; Game.matchOver = 0; Game.banner = '';
    Game.paused = false;
    Game.round = 1; Game.wins = [0, 0]; Game.winner = ''; Game.stop = 0; Game.shake = 0;
    fighters[0].meter = 0; fighters[1].meter = 0;
    fighters.forEach(f => { f.ragdollActive = false; f.ragdollKO = false; f.ragdollAngle = 0; f.ragdollElapsed = 0; f.damageBurst = 0; f.damageBurstT = 0; f.y = 0; f.vy = 0; f.state = 'idle'; });
    Input.keys.clear();
    Input.pad.forEach(p => { Input.acts.forEach(a => p[a] = 0); p.depthUp = 0; p.depthDown = 0; });
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    fighters[0].color = PlayerCoolColor; fighters[1].color = CpuHotColors['1v1'];
    fighters[0].setClass(Game.selectedClass);
    fighters[0].color = FighterClasses[Game.selectedClass].color;
    fighters[0].tag = 'YOU'; fighters[1].tag = 'CPU';
    fighters[0].hp = 100; fighters[1].hp = 100;
    BeatEmUp.stageOver = 0; BeatEmUp.showGo = 0; BeatEmUp.cast = []; BeatEmUp.boss = null;
    Input.syncMode();
    Game.placeTitleFighters();
    Fx.clear(); Bot.reset();
    Game.syncControls();
  }
  static selectClass(id) {
    if (!FighterClasses[id]) return;
    Game.selectedClass = id;
    fighters[0].setClass(id);
    document.documentElement.style.setProperty('--class-accent', FighterClasses[id].accent);
    try { localStorage.setItem('stickman-beatemup-class', id); } catch (e) {}
  }
  static selectArcadeLevel(id) {
    if (!ArcadeDiff[id]) return;
    Game.arcadeLevel = id;
    try { localStorage.setItem('stickman-beatemup-level', id); } catch (e) {}
  }
  static selectMode(mode) {
    Game.mode = mode; Input.syncMode();
    fighters[0].setClass(Game.selectedClass);
    fighters[0].color = FighterClasses[Game.selectedClass].color;
    fighters[1].color = CpuHotColors['1v1'];
  }
  static startPractice() {
    Game.paused = false; Game.actionMenuOpen = false;
    Game.mode = 'practice';
    Input.syncMode();
    Game.round = 1; Game.wins = [0, 0]; Game.matchOver = 0; Game.winner = '';
    const player = fighters[0], dummy = fighters[1];
    player.setClass(Game.selectedClass);
    player.color = FighterClasses[Game.selectedClass].color;
    player.tag = 'YOU'; player.meter = 0;
    dummy.setClass(null); dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    Game.placePracticeFighters(true);
    dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    Game.timer = Infinity; Game.practiceComboHits = 0; Game.practiceComboDamage = 0; Game.practiceComboT = 0; Game.practiceLastMove = '';
    Game.stop = 0; Game.shake = 0; Game.fighting = 0; Game.matchOver = 0;
    Input.pad[1] = {}; Input.was[1] = {};
    Fx.clear(); Bot.reset();
    Game.phase = 'intro'; Game.banner = 'PRACTICE'; Game.bannerT = .9;
    Game.syncSpecialBtn(); Game.syncControls();
  }
  static resetPracticeDummy(clearCombo = true) {
    if (Game.mode !== 'practice') return;
    const dummy = fighters[1];
    dummy.setClass(null); dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    dummy.reset(Game.practiceDummyX || Game.W * .64, -1);
    dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    if (clearCombo) {
      Game.practiceComboHits = 0; Game.practiceComboDamage = 0; Game.practiceComboT = 0; Game.practiceLastMove = '';
    }
  }
  /** Title-only: idle fighters at ~10% / 90% width, facing in. Match spawn unchanged. */
  static placeTitleFighters() {
    const sc = Game.scale || 1;
    const safeL = Game.safeL;
    const safeR = Game.safeR;
    const inset = (16 + Math.max(safeL, safeR)) / sc;
    // Approximate full limb reach from body center (idle pose + stroke)
    const reach = 48;
    let x0 = Game.W * .10, x1 = Game.W * .90;
    x0 = Math.max(inset + reach, Math.min(Game.W / 2 - 80, x0));
    x1 = Math.min(Game.W - inset - reach, Math.max(Game.W / 2 + 80, x1));
    fighters[0].reset(x0, 1); fighters[1].reset(x1, -1);
  }
  static startMatch() {
    Game.paused = false; Game.actionMenuOpen = false;
    if (Game.mode === 'beatemup') {
      BeatEmUp.begin();
      return;
    }
    if (Game.mode === 'practice') { Game.startPractice(); return; }
    try { localStorage.setItem('stickman-level', Game.level); } catch (e) {}
    Game.round = 1; Game.wins = [0, 0]; Game.matchOver = 0; Game.winner = '';
    fighters[0].meter = 0; fighters[1].meter = 0;
    Game.syncControls();
    Game.startRound();
  }
  static startRound() {
    Game.stop = 0; Game.shake = 0; Game.timer = 60; Game.fighting = 0; Game.matchOver = 0;
    fighters.forEach((f, i) => {
      f.setClass(i === 0 ? Game.selectedClass : null);
      f.color = i === 0 ? FighterClasses[Game.selectedClass].color : CpuHotColors['1v1'];
    });
    fighters[0].reset(Math.max(Game.minX, Math.min(Game.maxX, Game.W * .35)), 1);
    fighters[1].reset(Math.max(Game.minX, Math.min(Game.maxX, Game.W * .65)), -1);
    Fx.clear(); Bot.reset();
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Game.phase = 'intro'; Game.banner = 'Round ' + Game.round; Game.bannerT = 1.2;
    Game.syncSpecialBtn(); Game.syncControls();
  }
  static syncControls() {
    const el = document.getElementById('controls');
    if (el) el.classList.toggle('arcade-controls', Game.mode === 'beatemup');
    if (el) el.style.display = Game.paused || Game.phase === 'title' || (Game.mode === 'beatemup' && BeatEmUp.stageOver) ? 'none' : '';
    const menu = document.getElementById('main-menu-button');
    if (menu) menu.style.display = Game.phase === 'title' ? 'none' : 'block';
    Game.menuRight = menu && Game.phase !== 'title' ? menu.getBoundingClientRect().right : 0;
    const reset = document.getElementById('practice-reset');
    if (reset) reset.style.display = !Game.paused && Game.mode === 'practice' && Game.phase !== 'title' ? 'block' : 'none';
    Game.actionButtons.special = document.querySelector('#controls button.special');
    Game.actionButtons.roll = document.querySelector('#controls button.roll');
    Game.btns = [...document.querySelectorAll('#controls button, #move-stick')].map(el => {
      const r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height};
    }).filter(btn => btn.w > 0 && btn.h > 0);
  }
  static syncFullscreenButton() {
    const button = document.getElementById('fullscreen-button');
    if (!button) return;
    const supported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled
      || document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    const active = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const label = button.querySelector('span');
    button.disabled = !supported;
    button.setAttribute('aria-label', !supported ? 'Fullscreen is not supported in this browser'
      : active ? 'Exit fullscreen' : 'Enter fullscreen');
    if (label) label.textContent = !supported ? 'FULLSCREEN N/A' : active ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
  }
  static toggleFullscreen() {
    const doc = document;
    const root = doc.documentElement;
    const active = doc.fullscreenElement || doc.webkitFullscreenElement;
    const change = active ? (doc.exitFullscreen || doc.webkitExitFullscreen)
      : (root.requestFullscreen || root.webkitRequestFullscreen);
    if (!change) return;
    try {
      const result = active ? change.call(doc) : change.call(root);
      if (result && typeof result.catch === 'function') result.catch(() => Game.syncFullscreenButton());
    } catch (e) { Game.syncFullscreenButton(); }
  }
  static canPause() {
    return Game.phase !== 'title' && !Game.matchOver
      && !(Game.mode === 'beatemup' && BeatEmUp.stageOver);
  }
  static toggleActionMenu() {
    if (Game.phase === 'title') return;
    Game.actionMenuOpen = !Game.actionMenuOpen;
    const menu = document.getElementById('game-action-menu');
    const trigger = document.getElementById('main-menu-button');
    const pause = document.getElementById('pause-game-button');
    if (menu) menu.hidden = !Game.actionMenuOpen;
    if (trigger) trigger.setAttribute('aria-expanded', String(Game.actionMenuOpen));
    if (pause) {
      pause.disabled = !Game.paused && !Game.canPause();
      pause.innerHTML = (Game.paused ? '▶' : 'Ⅱ') + '<span>' + (Game.paused ? 'RESUME' : 'PAUSE') + '</span>';
    }
  }
  static closeActionMenu() {
    if (!Game.actionMenuOpen) return;
    Game.actionMenuOpen = false;
    const menu = document.getElementById('game-action-menu');
    const trigger = document.getElementById('main-menu-button');
    if (menu) menu.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }
  static togglePause() {
    if (!Game.paused && !Game.canPause()) return;
    Game.paused = !Game.paused;
    Game.closeActionMenu();
    Input.keys.clear();
    Input.pad.forEach(p => { Input.acts.forEach(a => p[a] = 0); p.depthUp = 0; p.depthDown = 0; });
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Game.acc = 0;
    Game.syncControls();
    const pause = document.getElementById('pause-game-button');
    if (pause) {
      pause.innerHTML = (Game.paused ? '▶' : 'Ⅱ') + '<span>' + (Game.paused ? 'RESUME' : 'PAUSE') + '</span>';
      pause.disabled = !Game.paused && !Game.canPause();
    }
  }
  static placePracticeFighters(reset = false) {
    const span = Math.max(0, Game.maxX - Game.minX);
    const playerX = Game.minX + span * .24;
    Game.practiceDummyX = Game.minX + span * .76;
    if (reset) {
      fighters[0].reset(playerX, 1);
      fighters[1].reset(Game.practiceDummyX, -1);
    } else {
      fighters[0].x = playerX; fighters[0].vx = 0; fighters[0].clamp();
      fighters[1].x = Game.practiceDummyX; fighters[1].vx = 0; fighters[1].clamp();
    }
  }
  static titleLayout() {
    const sc = Game.scale;
    const compact = sc < 1.5;
    const safeL = Game.safeL;
    const safeR = Game.safeR;
    const inset = 16 / sc + Math.max(safeL, safeR) / sc;
    const tabs = Game.modeTabs();
    if (Game.mode === 'beatemup') {
      const classCount = Object.keys(FighterClasses).length;
      const gap = (compact ? 8 : 14) / sc, cardW = Math.min(210 / sc, (Game.W - 32 / sc - gap * (classCount - 1)) / classCount);
      const cardH = (compact ? 96 : 166) / sc;
      const total = cardW * classCount + gap * (classCount - 1), x0 = (Game.W - total) / 2;
      const levelGap = 8 / sc, levelW = Math.min(140 / sc, (Game.W - 48 / sc - levelGap * 2) / 3), levelH = Game.difficultyButtonHeight(sc);
      const levelTotal = levelW * 3 + levelGap * 2, levelX = (Game.W - levelTotal) / 2;
      const modeBottom = Math.max(...tabs.map(tab => tab.y + tab.h));
      const levelY = compact ? modeBottom + 6 / sc : Game.H * .48 - levelH / 2;
      const levels = Game.levels.map((id, i) => ({id, x:levelX + i * (levelW + levelGap), y:levelY, w:levelW, h:levelH, label:Game.levelLabels[id]}));
      const y = compact ? levelY + levelH + 6 / sc : Game.H * .67 - cardH / 2;
      const classes = Object.entries(FighterClasses).map(([id, profile], i) => ({ id, profile, x: x0 + i * (cardW + gap), y, w: cardW, h: cardH, menuCompact: true }));
      const bw = (compact ? 190 : 174) / sc, bh = (compact ? 42 : 52) / sc;
      return { tabs, classes, levels, start: { id: 'start-run', x: (Game.W - bw) / 2, y: Game.H * (compact ? .88 : .88) - bh / 2, w: bw, h: bh, label: 'START RUN' } };
    }
    if (Game.mode === 'practice') {
      const classCount = Object.keys(FighterClasses).length;
      const gap = 14 / sc, cardW = Math.min(210 / sc, (Game.W - 32 / sc - gap * (classCount - 1)) / classCount);
      const cardH = (compact ? 118 : 150) / sc, total = cardW * classCount + gap * (classCount - 1);
      const classes = Object.entries(FighterClasses).map(([id, profile], i) => ({id, profile, menuCompact:true,
        x:(Game.W-total)/2 + i*(cardW+gap), y:Game.H*(compact ? .64 : .65)-cardH/2, w:cardW, h:cardH}));
      const bw = 200 / sc, bh = 52 / sc;
      return {tabs, classes, levels:[], start:{id:'start-practice',x:(Game.W-bw)/2,y:Game.H*(compact ? .87 : .87)-bh/2,w:bw,h:bh,label:'START PRACTICE'}};
    }
    const bw = 140 / sc, bh = Game.difficultyButtonHeight(sc), gap = 8 / sc;
    const total = 3 * bw + 2 * gap;
    let x0 = (Game.W - total) / 2;
    x0 = Math.max(inset, Math.min(Game.W - inset - total, x0));
    const modeBottom = Math.max(...tabs.map(tab => tab.y + tab.h));
    const y = compact ? modeBottom + 6 / sc : Game.H * .48 - bh / 2;
    const startW = (compact ? 190 : 174) / sc, startH = (compact ? 42 : 52) / sc;
    const classCount = Object.keys(FighterClasses).length;
    const classGap = (compact ? 8 : 14) / sc, cardW = Math.min(210 / sc, (Game.W - 32 / sc - classGap * (classCount - 1)) / classCount);
    const cardH = (compact ? 96 : 112) / sc, cardTotal = cardW * classCount + classGap * (classCount - 1);
    const classY = compact ? y + bh + 6 / sc : Game.H * .66 - cardH / 2;
    const classes = Object.entries(FighterClasses).map(([id,profile],i) => ({id,profile,menuCompact:true,
      x:(Game.W-cardTotal)/2 + i*(cardW+classGap),y:classY,w:cardW,h:cardH}));
    return {
      tabs,
      classes,
      levels: Game.levels.map((id, i) => ({id, x: x0 + i * (bw + gap), y, w: bw, h: bh, label: Game.levelLabels[id]})),
      start: {id:'start-match',x:(Game.W - startW) / 2,y:Game.H * (compact ? .88 : .87) - startH / 2,w:startW,h:startH,label:'START FIGHT'},
    };
  }
  static modeTabs() {
    const sc = Game.scale;
    const compact = sc < 1.5;
    const tw = 140 / sc, th = 44 / sc, tgap = 10 / sc;
    const tTotal = 3 * tw + 2 * tgap;
    const tx0 = (Game.W - tTotal) / 2;
    const ty = Game.H * (compact ? .25 : .38) - th / 2;
    return [
      { id: '1v1', label: '1v1', x: tx0, y: ty, w: tw, h: th },
      { id: 'practice', label: 'Practice', x: tx0 + tw + tgap, y: ty, w: tw, h: th },
      { id: 'beatemup', label: "Beat 'em up", x: tx0 + 2 * (tw + tgap), y: ty, w: tw, h: th },
    ];
  }
  static difficultyButtonHeight(sc = Game.scale) { return (sc < 1.5 ? 38 : 40) / sc; }
  static titlePointer(e) {
    const sc = Game.scale;
    const gx = e.clientX / sc, gy = e.clientY / sc;
    const layout = Game.titleLayout();
    const tab = layout.tabs.find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
    if (tab) { Game.selectMode(tab.id); return; }
    if (Game.mode === 'beatemup') {
      const level = (layout.levels || []).find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
      if (level) { Game.selectArcadeLevel(level.id); return; }
      const card = (layout.classes || []).find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
      if (card) { Game.selectClass(card.id); return; }
      const start = layout.start;
      if (start && gx >= start.x && gx <= start.x + start.w && gy >= start.y && gy <= start.y + start.h) Game.startMatch();
      return;
    }
    if (Game.mode === '1v1' || Game.mode === 'practice') {
      const card = (layout.classes || []).find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
      if (card) { Game.selectClass(card.id); return; }
      const hit = (layout.levels || []).find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
      if (hit) { Game.level = hit.id; return; }
      const start = layout.start;
      if (start && gx >= start.x && gx <= start.x + start.w && gy >= start.y && gy <= start.y + start.h) Game.startMatch();
    }
  }
  static tryTitleKey(key) {
    if (key === 'Tab') {
      const modes = ['1v1','practice','beatemup'];
      Game.selectMode(modes[(modes.indexOf(Game.mode) + 1) % modes.length]);
      return;
    }
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      if (Game.mode !== '1v1') { const ids = Object.keys(FighterClasses), i = ids.indexOf(Game.selectedClass); Game.selectClass(ids[(i + ids.length - 1) % ids.length]); return; }
      const i = Game.levels.indexOf(Game.level);
      Game.level = Game.levels[Math.max(0, i - 1)]; return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      if (Game.mode === '1v1' && Game.level === Game.levels[Game.levels.length - 1]) {
        Game.selectMode('beatemup'); return;
      }
      if (Game.mode !== '1v1') { const ids = Object.keys(FighterClasses), i = ids.indexOf(Game.selectedClass); Game.selectClass(ids[(i + 1) % ids.length]); return; }
      const i = Game.levels.indexOf(Game.level);
      Game.level = Game.levels[Math.min(Game.levels.length - 1, i + 1)]; return;
    }
    if (Game.mode === 'beatemup' && (key === 'ArrowUp' || key === 'ArrowDown')) {
      const i = Game.levels.indexOf(Game.arcadeLevel), step = key === 'ArrowUp' ? -1 : 1;
      Game.selectArcadeLevel(Game.levels[(i + step + Game.levels.length) % Game.levels.length]); return;
    }
    if ((Game.mode === '1v1' || Game.mode === 'practice') && (key === 'ArrowUp' || key === 'ArrowDown')) {
      const ids = Object.keys(FighterClasses), i = ids.indexOf(Game.selectedClass);
      const step = key === 'ArrowUp' ? -1 : 1;
      Game.selectClass(ids[(i + step + ids.length) % ids.length]); return;
    }
    if (key === 'Enter' || key === ' ' || key === 'j' || key === 'J') Game.startMatch();
  }
  static fit() {
    const dpr = Math.max(1, devicePixelRatio || 1);
    // Safe-area insets only change with layout, so read them here, not per frame.
    const rootStyle = getComputedStyle(document.documentElement);
    Game.safeTop = parseFloat(rootStyle.getPropertyValue('--sai-t')) || 0;
    Game.safeL = parseFloat(rootStyle.getPropertyValue('--sai-l')) || 0;
    Game.safeR = parseFloat(rootStyle.getPropertyValue('--sai-r')) || 0;
    Game.H = 540; Game.W = Math.max(640, Math.round(540 * innerWidth / innerHeight));
    Game.GROUND = Math.round(Game.H * .72);
    const scale = innerHeight / Game.H;
    Game.scale = scale; Game.ox = 0; Game.oy = 0;
    Game.hr = Math.max(13.2, 10.56 / scale); Game.lw = Math.max(4.8, 3.6 / scale);
    Game.canvas.style.width = innerWidth + 'px'; Game.canvas.style.height = innerHeight + 'px';
    Game.canvas.width = Math.round(innerWidth * dpr); Game.canvas.height = Math.round(innerHeight * dpr);
    Game.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    // Prefer middle 70% (15%–85%), but end the lane early enough that visual
    // bones() at the edges stay ≥4px from edge-pinned controls (drawNudgeX → 0).
    const EDGE = 16, CLEAR = 8;
    const MOVE_W = 132;
    const PAD_W = 200; // right-thumb action cluster width
    const REACH = 65; // max observed visual AABB past hip (worst pose)
    const safeL = Game.safeL;
    const safeR = Game.safeR;
    const loBtn = (EDGE + safeL + MOVE_W + CLEAR) / scale + REACH;
    const hiBtn = (innerWidth - EDGE - safeR - PAD_W - CLEAR) / scale - REACH;
    Game.minX = Math.max(Game.W * .15, loBtn);
    Game.maxX = Math.min(Game.W * .85, hiBtn);
    if (Game.minX > Game.maxX) { // ultra-narrow: keep a usable centre strip
      const mid = Game.W * .5, half = Math.max(40, (hiBtn - loBtn) * .5);
      Game.minX = mid - half; Game.maxX = mid + half;
    }
    if (Game.phase === 'title') {
      Game.placeTitleFighters();
    } else if (Game.mode === 'beatemup') {
      // BeatEmUp owns lane clamps; refresh btn rects only.
    } else if (Game.phase !== 'matchEnd') {
      fighters[0].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[0].x || Game.W * .35));
      if (Game.mode === 'practice') {
        Game.placePracticeFighters();
      } else fighters[1].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[1].x || Game.W * .65));
    }
    Game.btns = Game.phase === 'title' ? [] : [...document.querySelectorAll('#controls button, #move-stick')].map(el => {
      const r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height};
    });
    Game.titleBtns = Game.titleLayout().levels;
  }
  static hitTest(a, b) {
    if (!a.segment) return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    // Segment versus target AABB expanded by the weapon's visible half-width.
    // This avoids treating the empty corners around a diagonal blade/staff as hits.
    const {x1,y1,x2,y2,r} = a.segment;
    const left = b.x - r, right = b.x + b.w + r, top = b.y - r, bottom = b.y + b.h + r;
    const dx = x2 - x1, dy = y2 - y1;
    let enter = 0, leave = 1;
    for (const [p,q] of [[-dx,x1-left],[dx,right-x1],[-dy,y1-top],[dy,bottom-y1]]) {
      if (Math.abs(p) < 1e-8) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) enter = Math.max(enter,t);
      else leave = Math.min(leave,t);
      if (enter > leave) return false;
    }
    return true;
  }
  static resolve() {
    for (let i = 0; i < 2; i++) {
      const me = fighters[i], foe = fighters[i ^ 1], box = me.strike();
      if (!box || foe.hp <= 0) continue;
      if (box.special && me.hitTargets.get(foe) === box.pulse) continue;
      if (box.special && (!foe.grounded || foe.dodgeT > 0)) continue;
      if (!Game.hitTest(box, foe.hitbox)) continue;
      if (foe.playerControlled && foe.invincibleT > 0) continue;
      me.hitDone = 1;
      if (box.special) me.hitTargets.set(foe, box.pulse);
      const hpBefore = foe.hp;
      const kind = foe.takeHit(box, me);
      const damage = Math.round((hpBefore - foe.hp) * 10) / 10;
      const confirmed = me.confirmHit(kind, damage);
      if (Game.mode === 'practice' && i === 0 && confirmed) {
        if (Game.practiceComboT <= 0) { Game.practiceComboHits = 0; Game.practiceComboDamage = 0; }
        Game.practiceComboHits++;
        Game.practiceComboDamage += damage;
        Game.practiceComboT = 1.25;
        const chain = me.atk?.chain || 0;
        Game.practiceLastMove = box.comboFinisher ? 'COMBO SUPER FINISHER'
          : me.state === 'punch' ? ['STRAIGHT', 'HOOK', 'RISING FINISHER'][chain]
          : me.state === 'kick' ? 'HEAVY STRIKE' : me.state.toUpperCase();
      }
      me.gainMeter(box.special ? 0 : box.dmg * 2.5);
      if (!box.special || !me.specialMeterTargets.has(foe)) foe.gainMeter(box.special ? 12 : box.dmg * 1.5);
      if (box.special) me.specialMeterTargets.add(foe);
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const comboStunned = i === 0 && Game.tryComboStun(me, foe, box, kind, confirmed, cx, cy - 58);
      if (comboStunned && Game.mode === 'practice') Game.practiceLastMove += ' · STUN';
      if (i === 0) {
        if (box.comboFinisher && box.special && !me.specialEffectDone) Fx.combo(cx, cy - 34, Fighter.comboMessage(box, me.state, me.comboHits), me.classProfile);
        else if (confirmed && me.comboHits >= 2) Fx.combo(cx, cy - 34, Fighter.comboMessage(box, me.state, me.comboHits), me.classProfile);
      }
      const criticalHit = !!box.critical && kind !== 'block';
      Fx.damage(cx, cy - 12, damage, kind === 'block', criticalHit);
      if (criticalHit) { Fx.critical(cx, cy, me.classProfile); Sfx.play('critical', me.classProfile); }
      if (box.special && !me.specialEffectDone) {
        Fx.special(cx, cy, me.classProfile);
        Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile);
        me.specialEffectDone = 1;
      }
      else if (kind === 'block') Fx.blocked(cx, cy);
      else if (!criticalHit) Fx.hit(cx, cy);
      if (me.playerControlled && !box.special && kind === 'hit' && damage > 0)
        Sfx.play(me.state === 'kick' || me.state === 'airKick' ? 'player-heavy-hit' : 'player-normal-hit', me.classProfile);
      Game.stop = .06; Game.shake = .12; Game.shMag = 4;
      if (kind === 'hit') foe.vy = -120;
      if (kind === 'block' && box.special) Bot.lastBlockKind = 'special';
      if (foe.hp <= 0) {
        if (Game.mode === 'practice' && i === 0) Game.resetPracticeDummy(false);
        else Game.endRound(i);
      }
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
    const btn = Game.actionButtons.special || document.querySelector('#controls button.special');
    if (!btn) return;
    const meter = Math.max(0, Math.min(100, fighters[0].meter));
    const full = meter >= 100;
    const progress = `${Math.round(meter / 2) * 2}%`;
    if (btn.style.getPropertyValue('--action-progress') !== progress) btn.style.setProperty('--action-progress', progress);
    if (btn.disabled !== !full) btn.disabled = !full;
    if (btn.classList.contains('ready') !== full) btn.classList.toggle('ready', full);
    const label = full ? 'Special attack ready' : `Special attack; ${Math.floor(meter)} percent SP`;
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
  }
  static syncDodgeBtn() {
    const btn = Game.actionButtons.roll || document.querySelector('#controls button.roll');
    if (!btn) return;
    const cooldown = Math.max(0, Math.min(1.05, fighters[0].dodgeCooldown));
    const progress = Game.fighting ? `${Math.round((1 - cooldown / 1.05) * 50) * 2}%` : '0%';
    const ready = Game.fighting && cooldown <= 0;
    if (btn.style.getPropertyValue('--action-progress') !== progress) btn.style.setProperty('--action-progress', progress);
    if (btn.classList.contains('ready') !== ready) btn.classList.toggle('ready', ready);
    const label = ready ? 'Dodge roll ready' : Game.fighting
      ? `Dodge roll cooling down (${cooldown.toFixed(1)} seconds)` : 'Dodge roll available when fight starts';
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
  }
  static frame(now) {
    let dt = (now - Game.last) / 1000; Game.last = now; if (dt > .05) dt = .05;
    if (Game.paused) { Game.acc = 0; Game.draw(); requestAnimationFrame(Game.frame); return; }
    if (Game.shake > 0) Game.shake -= dt;
    Fx.update(dt);
    if (Game.stop > 0) { Game.stop -= dt; Game.draw(); requestAnimationFrame(Game.frame); return; }
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      const step = Game.STEP;
      if (BeatEmUp.stageTransitionT > 0) {
        BeatEmUp.stageTransitionT = Math.max(0, BeatEmUp.stageTransitionT - step);
        if (!BeatEmUp.stageTransitionSwitched && BeatEmUp.stageTransitionT <= BeatEmUp.stageTransitionDuration / 2) {
          BeatEmUp.stageTransitionSwitched = 1;
          BeatEmUp.startCampaignStage(BeatEmUp.stageTransitionStage);
        }
        if (BeatEmUp.stageTransitionT === 0) {
          BeatEmUp.stageTransitionStage = 0;
          BeatEmUp.stageTransitionSwitched = 0;
        }
      }
      if (Game.mode === 'beatemup' && BeatEmUp.stageIntroT > 0) {
        BeatEmUp.stageIntroT = Math.max(0, BeatEmUp.stageIntroT - step);
        BeatEmUp.eventT = Math.min(BeatEmUp.eventT, BeatEmUp.stageIntroT);
      }
      if (Game.mode === 'practice' && Game.practiceComboT > 0) {
        Game.practiceComboT = Math.max(0, Game.practiceComboT - step);
        if (Game.practiceComboT === 0) {
          Game.practiceComboHits = 0; Game.practiceComboDamage = 0; Game.practiceLastMove = '';
        }
      }
      if (Game.phase === 'title') {
        fighters[0].face = 1; fighters[1].face = -1;
        fighters[0].pose = Pose.idle(fighters[0].classProfile);
        fighters[1].pose = Pose.idle(fighters[1].classProfile);
        fighters[0].y = 0; fighters[1].y = 0;
      } else if (Game.phase === 'intro' || Game.phase === 'roundEnd') {
        Game.bannerT -= step;
        if (Game.bannerT <= 0) {
          if (Game.phase === 'intro') {
            if (Game.mode === 'beatemup') {
              if (Game.banner.startsWith('WAVE') || Game.banner === 'BOSS') { Game.banner = 'Fight!'; Game.bannerT = .7; }
              else { Game.phase = 'fight'; Game.fighting = 1; Game.banner = ''; }
            } else if (Game.banner.startsWith('Round')) { Game.banner = 'Fight!'; Game.bannerT = .7; }
            else { Game.phase = 'fight'; Game.fighting = 1; Game.banner = ''; }
          } else if (Game.phase === 'roundEnd') {
            Game.round++; Game.startRound();
          }
        }
        fighters.forEach(f => {
          if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * step / .3);
          if (Game.phase === 'roundEnd' && f.ragdollActive) f.updateRagdoll(step);
        });
        if (Game.mode === 'beatemup') {
          for (const e of BeatEmUp.cast) {
            if (e.f.chip > e.f.hp) e.f.chip = Math.max(e.f.hp, e.f.chip - 100 * step / .3);
          }
        }
      } else if (Game.phase === 'fight') {
        if (Game.mode === 'beatemup') {
          Game.timer -= step;
          if (Game.timer < 0) Game.timer = 0;
          BeatEmUp.update(step);
        } else {
          if (Game.mode !== 'practice') Game.timer -= step;
          if (Game.mode !== 'practice' && Game.timer <= 0) { Game.timer = 0; Game.checkTimeout(); }
          else {
            if (Game.mode !== 'practice') Bot.update(step, fighters[1], fighters[0]);
            if (Input.pad[1].punch) Input.was[1].punch = 0;
            if (Input.pad[1].kick) Input.was[1].kick = 0;
            if (Input.pad[1].special) Input.was[1].special = 0;
            if (Input.pad[1].jump) Input.was[1].jump = 0;
            fighters[0].update(step, fighters[1], 0);
            fighters[1].update(step, fighters[0], 1);
            if (Game.mode === 'practice') {
              fighters[1].x = Game.practiceDummyX;
              fighters[1].vx = 0;
              fighters[1].clamp();
            }
            Game.resolve();
          }
        }
      } else if (Game.phase === 'waveTransition') {
        const progress = 1 - BeatEmUp.waveTravelT / BeatEmUp.waveTravelDuration;
        const eased = progress * progress * (3 - 2 * progress);
        const prevCamera = BeatEmUp.cameraX;
        BeatEmUp.cameraX = BeatEmUp.waveTravelStartCam + (BeatEmUp.waveTravelTargetCam - BeatEmUp.waveTravelStartCam) * eased;
        BeatEmUp.skyOffset += (BeatEmUp.cameraX - prevCamera) * .5;
        BeatEmUp.waveTravelT = Math.max(0, BeatEmUp.waveTravelT - step);
        if (BeatEmUp.waveTravelT <= 0) {
          BeatEmUp.cameraX = BeatEmUp.waveTravelTargetCam;
          const next = BeatEmUp.waveTravelNext;
          BeatEmUp.waveTravelNext = 0;
          if (next === 4) BeatEmUp.startBoss();
          else BeatEmUp.startWave(next);
        }
      } else if (Game.phase === 'matchEnd') {
        if (Game.mode === 'beatemup') {
          for (const e of BeatEmUp.cast) {
            if (e.f.chip > e.f.hp) e.f.chip = Math.max(e.f.hp, e.f.chip - 100 * step / .3);
            if (e.f.ragdollActive) BeatEmUp.withDepth(e, () => e.f.updateRagdoll(step));
          }
        } else fighters.forEach(f => {
          if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * step / .3);
          if (f.ragdollActive) f.updateRagdoll(step);
        });
      }
      Game.acc -= step;
    }
    if (Game.phase !== 'title') { Game.syncSpecialBtn(); Game.syncDodgeBtn(); }
    Game.draw(); requestAnimationFrame(Game.frame);
  }
  static bars(ctx) {
    const sc = Game.scale, safe = Game.safeTop;
    const top = (12 + safe) / sc, h = 12 / sc, {w,gap,x0,x1} = Game.hudBarLayout();
    const panelH = 34 / sc, panelY = top - 2 / sc, hpY = top + 10 / sc, hpH = 8 / sc;
    const drawBar = (x, fighter, color, label, fromLeft) => {
      Game.drawHudPanel(ctx, x, panelY, w, panelH, color);
      ctx.textAlign = fromLeft ? 'left' : 'right'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#DCE8F5';
      ctx.fillText(label, fromLeft ? x + 8 / sc : x + w - 8 / sc, top + 4 / sc);
      const bx = x + 8 / sc, bw = w - 16 / sc;
      ctx.fillStyle = '#080C14'; ctx.fillRect(bx, hpY, bw, hpH);
      const chipW = bw * (fighter.chip / 100), hpW = bw * (Math.min(100, fighter.hp) / 100);
      ctx.fillStyle = 'rgba(230,238,250,.35)'; ctx.fillRect(fromLeft ? bx : bx + bw - chipW, hpY, chipW, hpH);
      ctx.fillStyle = color; ctx.fillRect(fromLeft ? bx : bx + bw - hpW, hpY, hpW, hpH);
      ctx.strokeStyle = 'rgba(190,210,235,.45)'; ctx.lineWidth = 1 / sc; ctx.strokeRect(bx, hpY, bw, hpH);
      const meterY = top + 22 / sc, meterH = 3 / sc, meterX = x + 33 / sc, meterW = w - 41 / sc;
      ctx.textAlign = fromLeft ? 'left' : 'right'; ctx.font = 'bold ' + 7 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#AEBBD0';
      ctx.fillText('SP', fromLeft ? x + 8 / sc : x + 25 / sc, meterY + 1.5 / sc);
      ctx.fillStyle = '#080C14'; ctx.fillRect(meterX, meterY, meterW, meterH);
      const meterFill = meterW * (fighter.meter / 100);
      ctx.fillStyle = fighter.meter >= 100 ? (fighter.classProfile?.accent || '#F6C453') : '#A78BFA';
      ctx.fillRect(fromLeft ? meterX : meterX + meterW - meterFill, meterY, meterFill, meterH);
    };
    drawBar(x0, fighters[0], '#54D6FF', 'PLAYER 01 · YOU', true);
    drawBar(x1, fighters[1], '#FF6969', Game.mode === 'practice' ? 'TRAINING DUMMY' : 'CPU FIGHTER', false);
    const timerW = 38 / sc;
    Game.drawHudPanel(ctx, Game.W / 2 - timerW / 2, panelY, timerW, panelH, '#F6C453');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 7 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#AEBBD0';
    ctx.fillText(Game.mode === 'practice' ? 'TRAIN' : 'RD ' + Game.round, Game.W / 2, top + 4 / sc);
    const timer = Game.mode === 'practice' ? '∞' : String(Math.ceil(Math.max(0, Game.timer))).padStart(2, '0');
    ctx.font = 'bold ' + 16 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFF0C2';
    ctx.fillText(timer, Game.W / 2, top + 20 / sc);
    ctx.textBaseline = 'alphabetic';
    const dy = top + h / 2, r = 4 / sc, gapD = 12 / sc;
    for (let i = 0; i < 2; i++) for (let d = 0; d < 2; d++) {
      const won = d < Game.wins[i];
      ctx.fillStyle = won ? (i === 0 ? '#54D6FF' : '#FF6969') : '#273247';
      ctx.fillRect(i === 0 ? x0 - gapD - d * (r * 2 + 3 / sc) - r : x1 + w + gapD + d * (r * 2 + 3 / sc) - r, dy - r, r * 2, r * 2);
      ctx.strokeStyle = '#72819A'; ctx.lineWidth = 1 / sc;
      ctx.strokeRect(i === 0 ? x0 - gapD - d * (r * 2 + 3 / sc) - r : x1 + w + gapD + d * (r * 2 + 3 / sc) - r, dy - r, r * 2, r * 2);
    }
  }
  static drawHudPanel(ctx, x, y, w, h, accent = '#63D9FF') {
    const sc = Game.scale || 1;
    const cut = Math.min(6 / sc, h * .28, w * .08);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    ctx.fillStyle = 'rgba(8,12,21,.92)'; ctx.fill();
    ctx.strokeStyle = 'rgba(116,137,170,.76)'; ctx.lineWidth = 1.5 / sc; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + cut + 2 / sc, y + 1.5 / sc);
    ctx.lineTo(x + Math.min(w * .24, 54 / sc), y + 1.5 / sc);
    ctx.strokeStyle = accent; ctx.lineWidth = 2 / sc; ctx.stroke();
    ctx.restore();
  }
  static drawHudProgress(ctx, x, y, w, h, value, color, chipValue = null) {
    const ratio = Math.max(0, Math.min(1, value));
    ctx.fillStyle = '#080C14'; ctx.fillRect(x, y, w, h);
    if (chipValue !== null) {
      ctx.fillStyle = 'rgba(230,238,250,.35)';
      ctx.fillRect(x, y, w * Math.max(ratio, Math.min(1, chipValue)), h);
    }
    ctx.fillStyle = color; ctx.fillRect(x, y, w * ratio, h);
    ctx.strokeStyle = 'rgba(190,210,235,.42)'; ctx.lineWidth = 1 / (Game.scale || 1);
    ctx.strokeRect(x, y, w, h);
  }
  static tryComboStun(attacker, target, hit, kind, confirmed, x, y) {
    if (!confirmed || kind !== 'hit' || !target || target.hp <= 0 || attacker.comboHits < 2) return false;
    const chance = hit.comboFinisher ? .40 : hit.comboLink ? .25 : 0;
    if (!chance || Math.random() >= chance) return false;
    target.stun = Math.min(72, Math.max(0, target.stun) + 18);
    target.comboStunEffectT = .45;
    target.flash = Math.max(target.flash, .16);
    Fx.stun(x, y, chance);
    return true;
  }
  static hudBarLayout(centerGapPx = 44) {
    const sc = Game.scale || 1, gap = centerGapPx / sc;
    const reservedLeft = Game.menuRight ? (Game.menuRight + 8) / sc : 0;
    const width = Math.min(Game.W * .4 - 14 / sc, Game.W / 2 - gap / 2 - reservedLeft);
    const x0 = (Game.W - 2 * width - gap) / 2;
    return {w:width,gap,x0,x1:x0 + width + gap};
  }
  static drawPracticeHud(ctx) {
    const sc = Game.scale, w = Math.min(410 / sc, Game.W * .82), h = 96 / sc, x = (Game.W - w) / 2, y = Game.H * .17;
    Game.drawHudPanel(ctx, x, y, w, h, '#F6C453');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#6ECFFF';
    ctx.fillText('COMBO TRAINING  //  ' + (Game.practiceComboHits ? 'LINK CONFIRMED' : 'LAND A HIT TO START'), Game.W / 2, y + 10 / sc);
    ctx.font = 'bold ' + 17 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFE06B';
    ctx.fillText(String(Game.practiceComboHits).padStart(2, '0') + ' HITS   ·   ' + Game.practiceComboDamage.toFixed(1) + ' DMG', Game.W / 2, y + 30 / sc);
    ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFFFFF';
    ctx.fillText(Game.practiceLastMove || 'LAST LINK: —', Game.W / 2, y + 47 / sc);
    ctx.font = 'bold ' + 7.5 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#B8C5D9';
    ctx.fillText('NORMAL ×3  ·  NORMAL → HEAVY  ·  HEAVY → NORMAL ×2', Game.W / 2, y + 63 / sc);
    ctx.fillText('JUMP → NORMAL / HEAVY  ·  2+ HITS → SUPER (+25%)', Game.W / 2, y + 75 / sc);
    ctx.fillStyle = '#FFE16B';
    ctx.fillText('LINK STUN 25%  ·  SUPER FINISHER STUN 40%', Game.W / 2, y + 87 / sc);
    ctx.textBaseline = 'alphabetic';
  }
  static drawArena(ctx) {
    const sc = Game.scale, gY = Game.GROUND;
    const sky = ctx.createLinearGradient(0, 0, 0, gY);
    sky.addColorStop(0, '#14151C'); sky.addColorStop(1, '#1F2230');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, Game.W, gY);
    const yTop = Game.H * .55;
    ctx.fillStyle = '#262A38';
    const blocks = [
      [0, 70, 55], [70, 50, 40], [120, 90, 70], [210, 40, 35], [250, 80, 60],
      [330, 55, 45], [385, 100, 75], [485, 45, 38], [530, 75, 58], [605, 60, 48],
      [665, 95, 72], [760, 50, 42], [810, 85, 65], [895, 55, 50]
    ];
    for (const [bx, bw, bh] of blocks) {
      const x = bx / 960 * Game.W, w = bw / 960 * Game.W, h = Math.min(bh, gY - yTop);
      ctx.fillRect(x, gY - h, w, h);
    }
    ctx.fillStyle = '#181A22'; ctx.fillRect(0, gY, Game.W, Game.H - gY);
    ctx.fillStyle = '#3A3F52'; ctx.fillRect(0, gY, Game.W, 2 / sc);
  }
  static drawTitle(ctx) {
    const sc = Game.scale;
    const compact = sc < 1.5;
    const layout = Game.titleLayout();
    Game.titleBtns = layout.levels;
    const bg = Game.titleBackground;
    if (bg.complete && bg.naturalWidth) {
      const cover = Math.max(Game.W / bg.naturalWidth, Game.H / bg.naturalHeight);
      const drawW = bg.naturalWidth * cover, drawH = bg.naturalHeight * cover;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, (Game.W - drawW) / 2, (Game.H - drawH) / 2, drawW, drawH);
      ctx.restore();
    } else {
      const fallback = ctx.createLinearGradient(0, 0, 0, Game.H);
      fallback.addColorStop(0, '#081528'); fallback.addColorStop(1, '#11101B');
      ctx.fillStyle = fallback; ctx.fillRect(0, 0, Game.W, Game.H);
    }
    const veil = ctx.createLinearGradient(0, 0, 0, Game.H);
    veil.addColorStop(0, 'rgba(3,7,16,.48)'); veil.addColorStop(.48, 'rgba(3,7,16,.58)');
    veil.addColorStop(1, 'rgba(3,7,16,.74)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, Game.W, Game.H);
    const centerShade = ctx.createRadialGradient(Game.W / 2, Game.H * .51, Game.W * .08, Game.W / 2, Game.H * .51, Game.W * .63);
    centerShade.addColorStop(0, 'rgba(5,10,23,.10)'); centerShade.addColorStop(1, 'rgba(2,5,12,.52)');
    ctx.fillStyle = centerShade; ctx.fillRect(0, 0, Game.W, Game.H);

    // Keep the selected fighters visible behind the menu cards, as in the arcade mockup.
    fighters.forEach(fighter => fighter.draw(ctx));

    // Fine scanlines and clipped corner marks make the image read like an arcade display.
    ctx.save(); ctx.globalAlpha = .022; ctx.fillStyle = '#A8DFFF';
    for (let y = 2 / sc; y < Game.H; y += 6 / sc) ctx.fillRect(0, y, Game.W, 1 / sc);
    ctx.restore();
    const edge = 10 / sc, corner = 24 / sc;
    ctx.strokeStyle = 'rgba(86,196,255,.72)'; ctx.lineWidth = 2 / sc;
    for (const side of [-1, 1]) {
      const x = side < 0 ? edge : Game.W - edge;
      const inward = side < 0 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(x, edge + corner); ctx.lineTo(x, edge); ctx.lineTo(x + inward * corner, edge); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, Game.H - edge - corner); ctx.lineTo(x, Game.H - edge); ctx.lineTo(x + inward * corner, Game.H - edge); ctx.stroke();
    }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const titleY = Game.H * (compact ? .08 : .22);
    ctx.font = '900 ' + (compact ? 27 : 42) / sc + 'px ui-monospace,monospace';
    ctx.lineJoin = 'miter'; ctx.lineWidth = 5 / sc; ctx.strokeStyle = '#07101F';
    ctx.strokeText('STICKMAN FIGHTER', Game.W / 2, titleY + 2 / sc);
    ctx.globalAlpha = .82; ctx.fillStyle = '#FF3CBA';
    ctx.fillText('STICKMAN FIGHTER', Game.W / 2 - 2 / sc, titleY - 1 / sc);
    ctx.globalAlpha = 1; ctx.fillStyle = '#F4FAFF';
    ctx.shadowColor = '#22D3EE'; ctx.shadowBlur = 6 / sc;
    ctx.fillText('STICKMAN FIGHTER', Game.W / 2, titleY);
    ctx.shadowBlur = 0;

    const drawSelectionArrow = (x, y, color) => {
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + 8 / sc, y + 5 / sc); ctx.lineTo(x, y + 10 / sc); ctx.closePath(); ctx.fill();
    };
    const drawClassPreview = (profile, x, y) => {
      const unit = 1 / sc, color = profile.color, weapon = profile.weapon;
      ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#07101A'; ctx.lineWidth = 6 * unit;
      const strokePath = (points) => {
        ctx.beginPath(); ctx.moveTo(points[0][0] * unit, points[0][1] * unit);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * unit, points[i][1] * unit);
        ctx.stroke();
        ctx.strokeStyle = color; ctx.lineWidth = 3.5 * unit;
        ctx.beginPath(); ctx.moveTo(points[0][0] * unit, points[0][1] * unit);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * unit, points[i][1] * unit);
        ctx.stroke(); ctx.strokeStyle = '#07101A'; ctx.lineWidth = 6 * unit;
      };
      ctx.fillStyle = '#07101A'; ctx.beginPath(); ctx.arc(0, -20 * unit, 6.5 * unit, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -20 * unit, 5 * unit, 0, Math.PI * 2); ctx.fill();
      strokePath([[0,-14],[0,4]]);
      if (weapon === 'staff') {
        strokePath([[0,-10],[-10,-4],[-12,3]]); strokePath([[0,-10],[10,-7],[13,-1]]);
        strokePath([[0,4],[-8,15],[-10,25]]); strokePath([[0,4],[8,14],[10,25]]);
        ctx.strokeStyle = '#E2B96F'; ctx.lineWidth = 3 * unit; ctx.beginPath(); ctx.moveTo(-20 * unit, 4 * unit); ctx.lineTo(22 * unit, -16 * unit); ctx.stroke();
        ctx.strokeStyle = '#F5D69B'; ctx.lineWidth = 1 * unit; ctx.beginPath(); ctx.moveTo(-20 * unit, 4 * unit); ctx.lineTo(22 * unit, -16 * unit); ctx.stroke();
      } else if (weapon === 'blade') {
        strokePath([[0,-10],[-10,-6],[-13,0]]); strokePath([[0,-10],[10,-5],[13,-1]]);
        strokePath([[0,4],[-8,15],[-10,25]]); strokePath([[0,4],[8,14],[10,25]]);
        ctx.strokeStyle = '#DCEBFA'; ctx.lineWidth = 3 * unit; ctx.beginPath(); ctx.moveTo(13 * unit, -1 * unit); ctx.lineTo(24 * unit, -25 * unit); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1 * unit; ctx.beginPath(); ctx.moveTo(13 * unit, -1 * unit); ctx.lineTo(24 * unit, -25 * unit); ctx.stroke();
      } else {
        strokePath([[0,-10],[-10,-5],[-14,-1]]); strokePath([[0,-10],[10,-8],[14,-4]]);
        strokePath([[0,4],[-8,14],[-11,24]]); strokePath([[0,4],[9,14],[13,24]]);
      }
      ctx.restore();
    };
    for (const t of layout.tabs) {
      const sel = t.id === Game.mode;
      const accent = sel ? '#FFD34D' : '#38BDF8';
      Game.drawHudPanel(ctx, t.x, t.y, t.w, t.h, accent); ctx.shadowBlur = 0;
      if (sel) { ctx.fillStyle = 'rgba(255,211,77,.10)'; ctx.fillRect(t.x + 2 / sc, t.y + 2 / sc, t.w - 4 / sc, t.h - 4 / sc); }
      ctx.fillStyle = sel ? '#FFE08A' : '#D4E6FA';
      ctx.font = 'bold ' + 14 / sc + 'px ui-monospace,monospace';
      ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2);
    }
    for (const b of layout.levels) {
      const sel = Game.mode === 'beatemup' ? b.id === Game.arcadeLevel : b.id === Game.level;
      const accent = sel ? '#FFC936' : '#3679AE';
      Game.drawHudPanel(ctx, b.x, b.y, b.w, b.h, accent); ctx.shadowBlur = 0;
      if (sel) { ctx.fillStyle = 'rgba(255,201,54,.10)'; ctx.fillRect(b.x + 2 / sc, b.y + 2 / sc, b.w - 4 / sc, b.h - 4 / sc); }
      ctx.fillStyle = sel ? '#FFE08A' : '#D4E6FA';
      ctx.font = 'bold ' + 14 / sc + 'px ui-monospace,monospace';
      ctx.fillText(b.label || Game.levelLabels[b.id] || b.id, b.x + b.w / 2, b.y + b.h / 2);
    }
    if (Game.mode === 'beatemup') {
      // At phone heights there is no clear row between difficulty and fighter
      // cards; omitting this secondary line keeps it from showing through cards.
      if (!compact) {
        const detailY = Game.H * .55, detailW = Math.min(Game.W - 32 / sc, 500 / sc);
        Game.drawHudPanel(ctx, Game.W / 2 - detailW / 2, detailY - 10 / sc, detailW, 20 / sc, '#38BDF8');
        ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#CDEBFF';
        ctx.fillText(ArcadeDiff[Game.arcadeLevel].details, Game.W / 2, detailY, detailW - 18 / sc);
      }
    } else if (Game.mode === 'practice') {
      const detailY = Game.H * (compact ? .43 : .45), detailW = Math.min(Game.W - 32 / sc, 440 / sc);
      Game.drawHudPanel(ctx, Game.W / 2 - detailW / 2, detailY - 10 / sc, detailW, 20 / sc, '#38BDF8');
      ctx.font = 'bold ' + 8 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#CDEBFF';
      ctx.fillText('STATIONARY DUMMY · NO TIMER · RESET WITH R OR BUTTON', Game.W / 2, detailY, detailW - 18 / sc);
    }
    const start = layout.start;
    if (start) {
      ctx.shadowColor = '#FFB91F'; ctx.shadowBlur = 4 / sc;
      Game.drawHudPanel(ctx, start.x, start.y, start.w, start.h, '#FFE06B'); ctx.shadowBlur = 0;
      ctx.fillStyle = '#FFE06B'; ctx.fillRect(start.x + 7 / sc, start.y + 7 / sc, start.w - 14 / sc, 2 / sc);
      ctx.fillStyle = '#FFF0B6'; ctx.font = '900 ' + 17 / sc + 'px ui-monospace,monospace';
      ctx.fillText(start.label, start.x + start.w / 2, start.y + start.h / 2);
      ctx.shadowBlur = 0;
    }
    for (const card of layout.classes || []) {
      const p = card.profile, selected = card.id === Game.selectedClass;
      const accent = selected ? p.accent : '#3D4B68';
      Game.drawHudPanel(ctx, card.x, card.y, card.w, card.h, accent); ctx.shadowBlur = 0;
      ctx.fillStyle = selected ? 'rgba(35,54,83,.68)' : 'rgba(5,10,20,.46)';
      ctx.fillRect(card.x + 2 / sc, card.y + 4 / sc, card.w - 4 / sc, card.h - 6 / sc);
      if (selected) drawSelectionArrow(card.x - 10 / sc, card.y + card.h * .5 - 5 / sc, p.accent);
      const previewX = card.x + 23 / sc, previewY = card.y + card.h * .64;
      drawClassPreview(p, previewX, previewY);
      const textX = card.x + Math.min(51 / sc, card.w * .29), textW = card.w - (textX - card.x) - 7 / sc;
      if (card.menuCompact) {
        const menuAt = (small,large) => card.y + (compact ? small : large) / sc;
        ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold ' + Math.min((compact ? 14 : 11) / sc, textW * .15) + 'px ui-monospace,monospace';
        ctx.fillText(p.name, textX + textW / 2, menuAt(22,31), textW);
        ctx.fillStyle = '#E7F1FF'; ctx.font = 'bold ' + Math.min((compact ? 11 : 8) / sc, textW * .12) + 'px ui-monospace,monospace';
        ctx.fillText('N · ' + p.punchMove, textX + textW / 2, menuAt(46,56), textW);
        ctx.fillText('H · ' + p.kickMove, textX + textW / 2, menuAt(66,76), textW);
        ctx.fillStyle = p.accent; ctx.font = 'bold ' + Math.min((compact ? 11 : 8) / sc, textW * .12) + 'px ui-monospace,monospace';
        ctx.fillText('S · ' + p.super, textX + textW / 2, menuAt(86,96), textW);
      } else {
        const nameY = card.y + (compact ? 25 : 34) / sc;
        ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold ' + Math.min((compact ? 11 : 14) / sc, textW * .11) + 'px ui-monospace,monospace';
        ctx.fillText(p.name, textX + textW / 2, nameY, textW);
        const rowGap = (compact ? 17 : 22) / sc, firstY = nameY + (compact ? 19 : 25) / sc;
        ctx.fillStyle = '#E7F1FF'; ctx.font = 'bold ' + Math.min((compact ? 8 : 9) / sc, textW * .075) + 'px ui-monospace,monospace';
        ctx.fillText('N · ' + p.punchMove, textX + textW / 2, firstY, textW);
        ctx.fillText('H · ' + p.kickMove, textX + textW / 2, firstY + rowGap, textW);
        ctx.fillStyle = p.accent; ctx.fillText('S · ' + p.super, textX + textW / 2, firstY + rowGap * 2, textW);
      }
    }
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }
  static draw() {
    const ctx = Game.ctx;
    ctx.setTransform(Math.max(1, devicePixelRatio || 1) * Game.scale, 0, 0, Math.max(1, devicePixelRatio || 1) * Game.scale, 0, 0);
    let sx = 0, sy = 0;
    if (Game.shake > 0) { const m = Game.shMag * (Game.shake / .12); sx = (Math.random() - .5) * 2 * m; sy = (Math.random() - .5) * 2 * m; }
    ctx.clearRect(-10, -10, Game.W + 20, Game.H + 20);
    ctx.save(); ctx.translate(sx, sy);
    if (Game.mode === 'beatemup' && Game.phase !== 'title') {
    BeatEmUp.draw(ctx);
    if (BeatEmUp.stageTransitionT > 0) {
      const progress = 1 - BeatEmUp.stageTransitionT / BeatEmUp.stageTransitionDuration;
      const alpha = progress < .5 ? progress * 2 : (1 - progress) * 2;
      ctx.fillStyle = 'rgba(5,6,10,' + alpha + ')';
      ctx.fillRect(0, 0, Game.W, Game.H);
      if (alpha > .72) {
        ctx.globalAlpha = Math.min(1, (alpha - .72) / .28);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const sc = Game.scale, panelW = 240 / sc, panelH = 62 / sc;
        Game.drawHudPanel(ctx, Game.W / 2 - panelW / 2, Game.H / 2 - panelH / 2, panelW, panelH, '#F6C453');
        ctx.font = 'bold ' + 10 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#AEBBD0';
        ctx.fillText('CAMPAIGN ROUTE', Game.W / 2, Game.H / 2 - 10 / sc);
        ctx.font = 'bold ' + 22 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFE06B';
        ctx.fillText('STAGE ' + String(BeatEmUp.stageTransitionStage).padStart(2, '0'), Game.W / 2, Game.H / 2 + 14 / sc);
        ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      }
    }
    } else if (Game.phase !== 'title') {
      Game.drawArena(ctx);
      fighters.forEach(f => f.draw(ctx));
      Fx.draw(ctx);
    }
    ctx.restore();
    if (Game.phase === 'title') { Game.drawTitle(ctx); return; }
    if (Game.mode !== 'beatemup') Game.bars(ctx);
    if (Game.mode === 'practice') Game.drawPracticeHud(ctx);
    const arcadeIntroPanelActive = Game.mode === 'beatemup' && Game.phase === 'intro' && BeatEmUp.eventT > 0;
    if (Game.banner && BeatEmUp.stageTransitionT <= 0 && !arcadeIntroPanelActive) {
      const sc = Game.scale, bannerY = Game.H * .42, bannerW = (Game.banner === 'Fight!' ? 210 : 260) / sc;
      const bannerH = Game.matchOver ? 74 / sc : 56 / sc;
      Game.drawHudPanel(ctx, Game.W / 2 - bannerW / 2, bannerY - bannerH / 2, bannerW, bannerH, Game.matchOver ? '#F6C453' : '#6ECFFF');
      ctx.fillStyle = '#FFF0C2'; ctx.textAlign = 'center';
      ctx.font = 'bold ' + (Game.banner === 'Fight!' ? 28 : 21) / sc + 'px ui-monospace,monospace';
      ctx.fillText(Game.banner, Game.W / 2, Game.H * .42);
      if (Game.matchOver && Game.mode !== 'beatemup') {
        const tip = Game.mode === 'beatemup' ? 'Tap to retry' : 'Tap for title';
        ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#6ECFFF';
        ctx.fillText(tip.toUpperCase(), Game.W / 2, Game.H * .42 + 22 / sc);
      }
    }
    if (Game.paused) {
      const sc = Game.scale || 1, w = Math.min(Game.W * .76, 300 / sc), h = 106 / sc;
      ctx.fillStyle = 'rgba(4,7,14,.62)'; ctx.fillRect(0, 0, Game.W, Game.H);
      Game.drawHudPanel(ctx, Game.W / 2 - w / 2, Game.H / 2 - h / 2, w, h, '#F6C453');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + 24 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFE06B';
      ctx.fillText('PAUSED', Game.W / 2, Game.H / 2 - 13 / sc);
      ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#C7D4E8';
      ctx.fillText('OPEN THE TOP-LEFT MENU TO RESUME', Game.W / 2, Game.H / 2 + 18 / sc);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

Game.init();
