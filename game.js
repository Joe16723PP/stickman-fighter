/* Difficulty tuning table — single source of truth */
const Diff = {
  // Retuned for Moves timing (punch su7/re11, kick su11) + layout lane; restore 10/90, 77/23, 96/4 @ seed 0xC0FFEE42
  easy:   { react: 0.42, block: 0.14, punish: 0.18, special: 0.07, mistake: 0.42, aggro: 0.26, cool: 1.10 },
  normal: { react: 0.23, block: 0.38, punish: 0.58, special: 0.44, mistake: 0.09, aggro: 0.80, cool: 0.48 },
  hard:   { react: 0.14, block: 0.58, punish: 1.00, special: 0.78, mistake: 0.02, aggro: 0.92, cool: 0.28 },
};

class Input {
  static keys = new Set();
  static pad = [{}, {}];
  static was = [{}, {}];
  // acts list byte-identical to main (AC2). Depth keys read via depthHeld() in beat mode only.
  static acts = ['left','right','jump','punch','kick','block','special'];
  static keyMap = [
    {left:['a','A','ArrowLeft'], right:['d','D','ArrowRight'], jump:['w','W','ArrowUp',' '], punch:['j','J'], kick:['k','K'], block:['l','L'], special:['i','I']},
    {left:[], right:[], jump:[], punch:[], kick:[], block:[], special:[]},
  ];
  static depthKeys = { up:['w','W','ArrowUp'], down:['s','S','ArrowDown'] };
  static bind() {
    Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    const on = (e, down) => {
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
      down ? Input.keys.add(e.key) : Input.keys.delete(e.key);
      if (down && Game.phase === 'title') { Game.tryTitleKey(e.key); return; }
      if (Game.matchOver && down) {
        if (Game.mode === 'beatemup' && BeatEmUp.onMatchOverKey()) return;
        Game.goTitle();
      }
    };
    addEventListener('keydown', e => on(e, 1));
    addEventListener('keyup', e => on(e, 0));
    addEventListener('blur', () => { Input.keys.clear(); Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0)); });
    addEventListener('pointerdown', e => {
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
      btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); set(1); });
      const end = e => { e.preventDefault(); set(0); };
      btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end);
      btn.addEventListener('pointerleave', e => { if (e.buttons) set(0); });
    });
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
    return (Input.depthKeys[dir] || []).some(k => Input.keys.has(k));
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
    chainDmg: [5, 5, 7],           // hit 1..3
    chainSu: 3, chainAc: 3, chainRe: 8,
    chainWindow: 10,               // frames into recovery when a follow-up is allowed
    reach: 95,
  },
  kick: {
    su: 11, ac: 5, re: 18,         // windup ~183ms (~180ms); recovery ~300ms punish window
    dmg: 10, kb: 300, stun: 16,
    cancelInto: ['punch'],         // punch may cancel kick during windup only
    reach: 155,
  },
  special: {
    su: 8, ac: 12, re: 14,
    dmg: 20, chip: 5, kb: 340, stun: 20,
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
        kb: m.kb, stun: m.stun,
        chain: n, kind: 'punch',
        chainMax: m.chainMax, chainWindow: m.chainWindow,
      };
    }
    if (kind === 'kick') {
      return {
        su: m.su, ac: m.ac, re: m.re,
        dmg: m.dmg, kb: m.kb, stun: m.stun,
        kind: 'kick', cancelInto: m.cancelInto.slice(),
      };
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
  /** Fight stance, hands near face. */
  static idle() {
    const d = Pose.deg;
    return {chest:d(4), neck:d(-2), head:0,
      la:d(-70), le:d(-95), ra:d(55), re:d(-100),
      ll:d(12), lk:d(18), rl:d(-14), rk:d(16), hipBob:0};
  }
  /** Legs ±28°, opposite arms ±18°, hip dip applied by caller via step phase. */
  static walk(t) {
    const d = Pose.deg, phase = t * Math.PI * 2 / .45;
    const leg = Math.sin(phase) * d(28), arm = Math.sin(phase) * d(18);
    const dip = (1 - Math.cos(phase * 2)) * 1; // 0..2px hip dip per step
    const id = Pose.idle();
    return {chest:id.chest, neck:id.neck, head:0,
      la:id.la - arm, le:id.le + d(10), ra:id.ra - arm, re:id.re - d(8),
      ll:leg, lk:Math.max(0, Math.sin(phase)) * d(40) + d(8),
      rl:-leg, rk:Math.max(0, -Math.sin(phase)) * d(40) + d(8),
      hipBob:dip};
  }
  static jump(apex) {
    const d = Pose.deg, tuck = apex ? 1 : .55;
    // Both arms forward under fv=-face (was ±110 spread → rear hand ~47px away)
    return {chest:d(-6), neck:d(4), head:d(-4),
      la:d(-110), le:d(-40), ra:d(-110), re:d(-40),
      ll:d(25)*tuck, lk:d(110)*tuck, rl:d(-25)*tuck, rk:d(110)*tuck, hipBob:0};
  }
  static land() {
    const d = Pose.deg;
    return {chest:d(8), neck:d(-4), head:0,
      la:d(-50), le:d(-80), ra:d(45), re:d(-85),
      ll:d(20), lk:d(55), rl:d(-18), rk:d(50), hipBob:4};
  }
  static punchWind() {
    const d = Pose.deg, id = Pose.idle();
    // Cocked fist (R2-1): chest +8° away, shPull 6px; re≈140° bend ⇒ ~40° inside elbow;
    // ra≈75° places wrist 6–14px behind shoulder, near chin height (bones only)
    return {chest:d(8), neck:d(-2), head:d(-2),
      la:id.la, le:id.le, ra:d(75), re:d(140),
      ll:d(16), lk:d(20), rl:d(-20), rk:d(18), hipBob:0, shPull:6};
  }
  static punchStrike(over) {
    const d = Pose.deg, o = over ? d(10) : 0;
    return {chest:d(-12), neck:d(-2), head:d(-4),
      la:d(60), le:d(90), ra:d(-95) - o, re:d(10) + o * .3,
      ll:d(18), lk:d(16), rl:d(-22), rk:d(20), hipBob:0};
  }
  static punchRec() { return Pose.idle(); }
  /** Cocked, leaning-back windup — distinct from kickStrike. */
  static kickWind() {
    const d = Pose.deg;
    // lean back, chamber kick knee high, arms counterbalance; not the extended strike
    return {chest:d(14), neck:d(-6), head:d(-8),
      la:d(-95), le:d(-55), ra:d(55), re:d(-110),
      ll:d(-55), lk:d(125), rl:d(8), rk:d(18), hipBob:-2};
  }
  static kickStrike(over) {
    const d = Pose.deg, o = over ? d(10) : 0;
    return {chest:d(12), neck:d(-4), head:d(-2),
      la:d(70), le:d(60), ra:d(-50), re:d(80),
      ll:d(95) + o, lk:d(8), rl:d(-20), rk:d(25), hipBob:0};
  }
  static kickRec() { return Pose.idle(); }
  static specialWind() {
    const d = Pose.deg;
    return {chest:d(10), neck:d(-4), head:d(-6),
      la:d(-90), le:d(-50), ra:d(30), re:d(-100),
      ll:d(-40), lk:d(95), rl:d(20), rk:d(25), hipBob:0};
  }
  static specialDash() {
    const d = Pose.deg;
    return {chest:d(18), neck:d(-6), head:d(-4),
      la:d(100), le:d(35), ra:d(-70), re:d(40),
      ll:d(110), lk:d(5), rl:d(-35), rk:d(40), hipBob:0};
  }
  static block() {
    const d = Pose.deg;
    // Guard toward foe under fv=-face (elbows stay folded, not flipped)
    return {chest:d(4), neck:0, head:d(2),
      la:d(-55), le:d(-120), ra:d(-45), re:d(-115),
      ll:d(14), lk:d(22), rl:d(-16), rk:d(20), hipBob:0};
  }
  static hit() {
    const d = Pose.deg;
    // Chest/neck/head signs flipped for fv so torso recoils AWAY (~15°); arms stay toward foe
    return {chest:d(15), neck:d(8), head:d(15),
      la:d(-100), le:d(-40), ra:d(-90), re:d(-35),
      ll:d(22), lk:d(28), rl:d(-30), rk:d(35), hipBob:0};
  }
  static koSprawl() {
    const d = Pose.deg;
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
      if (me.canCancelKickToPunch() && Math.random() < 0.35) { p.punch = 1; return; }
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
  static S = 1.5;
  static ARM = 18 * 1.5;
  static LEG = 20 * 1.5;
  static TORSO = 22 * 1.5;
  static NECK = 8 * 1.5;
  constructor(x, color, side, tag) {
    this.color = color; this.tag = tag; this.meter = 0; this.reset(x, side);
  }
  reset(x, side) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = side;
    this.grounded = true; this.state = 'idle'; this.walkT = 0; this.animT = 0;
    this.pose = Pose.idle(); this.poseFrom = Pose.copy(this.pose); this.poseTo = Pose.copy(this.pose);
    this.blendT = 1; this.blendDur = .08; this.poseKey = 'idle';
    this.hp = 100; this.chip = 100; this.stun = 0; this.flash = 0; this.blocking = 0;
    this.atk = null; this.atkT = 0; this.hitDone = 0; this.dashLeft = 0;
    this.chain = 0; this.chainArmed = 0;
    this.hitbox = {x:0,y:0,w:42,h:135}; this.blockFlash = 0;
    this.landSquash = 0; this.koT = 0; this.atkPhase = '';
    this.punchSoft = 0;
  }
  gainMeter(n) { this.meter = Math.min(100, this.meter + n); }
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
    if (this.hp <= 0 || this.state === 'ko' || this.state === 'hit' || this.stun > 0) return CombatPose.hit();
    if (this.atk) {
      if (this.state === 'special') return this.atkT <= this.atk.su ? CombatPose.windup() : CombatPose.special();
      return this.state === 'kick' ? CombatPose.kick() : CombatPose.punch();
    }
    if (this.blocking) return CombatPose.block();
    if (!this.grounded) return CombatPose.jump();
    if (this.state === 'walk') return CombatPose.walk(this.walkT);
    return CombatPose.idle();
  }
  /** Exact main limb tip geometry — strike + clamp only; draw uses bones(). */
  combatBones() {
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
    if (kind === 'special') {
      if (this.meter < 100) return;
      this.meter = 0; this.dashLeft = Game.W * .4;
      this.chain = 0; this.chainArmed = 0;
    } else if (kind === 'punch') {
      const m = Moves.punch;
      let n = 0;
      const linking = (this.chainArmed > 0) || this.canChainPunch();
      if (linking) n = Math.min(this.chain + 1, m.chainMax - 1);
      this.chain = n;
      this.chainArmed = 0;
    } else {
      this.chain = 0; this.chainArmed = 0;
    }
    this.atk = Atk.of(kind, kind === 'punch' ? this.chain : 0);
    this.atkT = 0; this.hitDone = 0; this.state = kind; this.blocking = 0;
    this.atkPhase = '';
  }
  canChainPunch() {
    const m = Moves.punch;
    if (!this.atk || this.state !== 'punch') return false;
    if (this.chain + 1 >= m.chainMax) return false;
    const a = this.atk;
    if (!this.hitDone) return false;
    if (this.atkT <= a.su + a.ac) return false;
    const intoRe = this.atkT - (a.su + a.ac);
    return intoRe <= (a.chainWindow || Moves.punch.chainWindow);
  }
  canCancelKickToPunch() {
    const m = Moves.kick;
    if (!this.atk || this.state !== 'kick') return false;
    if (!m.cancelInto || m.cancelInto.indexOf('punch') < 0) return false;
    return this.atkT > 0 && this.atkT <= this.atk.su;
  }
  driveAtkPose(dt) {
    const a = this.atk, t = this.atkT;
    // Visual phases read su/ac/re from this.atk (Moves via Atk.of) — chain hits use chainSu/Ac/Re
    if (this.state === 'special') {
      if (t <= a.su) {
        if (this.atkPhase !== 'sw') { this.aim('sw', Pose.specialWind(), a.su * Game.STEP); this.atkPhase = 'sw'; }
      } else if (t <= a.su + a.ac) {
        if (this.atkPhase !== 'ss') { this.aim('ss', Pose.specialDash(), .05); this.atkPhase = 'ss'; }
      } else if (this.atkPhase !== 'sr') { this.aim('sr', Pose.idle(), a.re * Game.STEP); this.atkPhase = 'sr'; }
      return;
    }
    if (this.state === 'kick') {
      if (t <= a.su) {
        if (this.atkPhase !== 'kw') { this.aim('kw', Pose.kickWind(), a.su * Game.STEP); this.atkPhase = 'kw'; }
      } else if (t <= a.su + a.ac) {
        if (this.atkPhase !== 'ks') {
          this.aim('ks', Pose.kickStrike(true), .03); this.atkPhase = 'ks';
        } else if (this.blendT >= this.blendDur * .55 && this.poseKey === 'ks') {
          this.aim('ks2', Pose.kickStrike(false), .04); this.atkPhase = 'ks2';
        }
      } else if (this.atkPhase !== 'kr') { this.aim('kr', Pose.kickRec(), a.re * Game.STEP); this.atkPhase = 'kr'; }
      return;
    }
    // punch — visual pull-back on bones() only (AC6/AC7); combatBones/hit frames unchanged
    const pullFr = Math.max(1, Math.round(a.su * 0.4));
    if (t <= pullFr) {
      if (this.atkPhase !== 'pw') {
        this.aim('pw', Pose.punchWind(), pullFr * Game.STEP);
        this.atkPhase = 'pw';
      }
    } else if (t <= a.su) {
      // Rest of windup drives forward to land on the hit frame; 10° overshoot kept (punchStrike true)
      if (this.atkPhase !== 'pwd') {
        this.aim('pwd', Pose.punchStrike(true), Math.max(Game.STEP, (a.su - pullFr) * Game.STEP));
        this.atkPhase = 'pwd';
      }
    } else if (t <= a.su + a.ac) {
      // R3-1: first active frame at full extension incl. 10° overshoot (1–2 frame snap is intended)
      if (this.atkPhase !== 'ps') {
        const strike = Pose.punchStrike(true);
        this.aim('ps', strike, .03); this.atkPhase = 'ps';
        this.pose = Pose.copy(strike);
        this.poseFrom = Pose.copy(strike);
        this.poseTo = Pose.copy(strike);
        this.blendT = this.blendDur;
        this.punchSoft = 0;
      }
    } else if (this.atkPhase !== 'pr') {
      // AC7 / R2-2: ease back to idle over full recovery; ≤15°/frame soft-step
      this.aim('pr', Pose.punchRec(), a.re * Game.STEP); this.atkPhase = 'pr';
    }
  }
  landCheck(wasAir) {
    if (wasAir && this.y >= 0) {
      this.y = 0; this.vy = 0; this.grounded = true; Fx.land(this.x);
      this.landSquash = .08; this.aim('land', Pose.land(), .05);
      return true;
    }
    if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    return false;
  }
  update(dt, other, slot) {
    if (this.flash > 0) this.flash -= dt;
    if (this.blockFlash > 0) this.blockFlash -= dt;
    if (this.chip > this.hp) this.chip = Math.max(this.hp, this.chip - (100 * dt / .3));
    this.animT += dt;
    if (this.hp <= 0) {
      this.state = 'ko'; this.vx *= .9; this.x += this.vx * dt;
      this.koT += dt;
      const u = Pose.easeOut(Math.min(1, this.koT / .4));
      this.pose = Pose.lerp(Pose.hit(), Pose.koSprawl(), u);
      this.poseKey = 'ko'; return;
    }
    if (this.stun > 0) {
      const wasAir = this.y < 0 || !this.grounded;
      this.stun--; this.vx *= .92; this.x += this.vx * dt; this.vy += 1600 * dt; this.y += this.vy * dt;
      this.landCheck(wasAir);
      this.aim('hit', Pose.hit(), .05);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    if (this.atk) {
      // Punch cancel of kick windup, or punch chain during recovery
      if (this.grounded && Input.edge(slot, 'punch')) {
        if (this.canCancelKickToPunch() || this.canChainPunch()) {
          this.startAtk('punch');
          this.driveAtkPose(dt);
          this.tickPose(dt);
          this.clamp(other); return;
        }
      }
      this.atkT++;
      const a = this.atk, tot = a.su + a.ac + a.re;
      this.driveAtkPose(dt);
      this.tickPose(dt);
      if (this.state === 'special' && this.atkT > a.su && this.atkT <= a.su + a.ac && this.dashLeft > 0) {
        const step = (Game.W * .4) / a.ac;
        const move = Math.min(step, this.dashLeft);
        this.x += this.face * move; this.dashLeft -= move; this.vx = 0;
      } else this.vx = 0;
      const wasAir = this.y < 0 || !this.grounded;
      this.vy += 1600 * dt; this.y += this.vy * dt;
      this.landCheck(wasAir);
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
      const bob = Pose.copy(Pose.idle());
      bob.hipBob = Math.sin(this.animT * Math.PI * 2 / .9) * 2;
      this.aim('idle', bob, .12);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1; this.clamp(other); return;
    }
    this.blocking = Input.held(slot, 'block') && this.grounded ? 1 : 0;
    if (this.blocking) {
      this.vx = 0; this.state = 'block';
      this.aim('block', Pose.block(), .08);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1; this.clamp(other); return;
    }
    let ax = 0;
    if (Input.held(slot, 'left')) ax -= 1;
    if (Input.held(slot, 'right')) ax += 1;
    this.vx = ax * 220;
    if (ax && this.grounded) { this.walkT += dt; this.state = 'walk'; }
    else if (this.grounded && this.state !== 'jump') { this.walkT = 0; this.state = 'idle'; }
    if (Input.edge(slot, 'jump') && this.grounded) { this.vy = -520; this.grounded = false; this.state = 'jump'; }
    if (this.grounded && Input.edge(slot, 'special')) this.startAtk('special');
    else if (this.grounded && Input.edge(slot, 'punch')) this.startAtk('punch');
    else if (this.grounded && Input.edge(slot, 'kick')) this.startAtk('kick');
    if (this.atk) { this.driveAtkPose(dt); this.tickPose(dt); this.clamp(other); return; }
    const wasAir = this.y < 0 || !this.grounded;
    this.vy += 1600 * dt; this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.landCheck(wasAir)) { if (this.state === 'jump') this.state = 'idle'; }
    else if (this.y < 0) this.state = 'jump';
    this.face = other.x >= this.x ? 1 : -1;
    if (this.state === 'jump') {
      const apex = Math.abs(this.vy) < 80;
      this.aim('jump', Pose.jump(apex), .1);
    } else if (this.state === 'walk') {
      this.poseKey = 'walk';
      this.poseFrom = Pose.walk(this.walkT);
      this.poseTo = this.poseFrom;
      this.blendT = this.blendDur;
      this.pose = Pose.copy(this.poseFrom);
    } else if (this.landSquash <= 0) {
      const bob = Pose.copy(Pose.idle());
      bob.hipBob = Math.sin(this.animT * Math.PI * 2 / .9) * 2;
      this.aim('idle', bob, .1);
    }
    this.tickPose(dt);
    this.clamp(other);
  }
  clamp() {
    // Lane only — button clearance is guaranteed by ending the lane early enough
    // that drawNudgeX stays 0 for every visual pose (controls stay screen-edge pinned).
    this.x = Math.max(Game.minX, Math.min(Game.maxX, this.x));
    this.hitbox.x = this.x - 21; this.hitbox.y = Game.GROUND + this.y - 135; this.hitbox.w = 42; this.hitbox.h = 135;
  }
  strike() {
    if (!this.atk || this.hitDone) return null;
    const a = this.atk;
    if (this.atkT <= a.su || this.atkT > a.su + a.ac) return null;
    const b = this.combatBones(), tip = (this.state === 'kick' || this.state === 'special') ? b.ll : b.ra;
    const r = this.state === 'special' ? 22 : 18;
    return {x:tip.x - r, y:tip.y - r, w:r * 2, h:r * 2, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:a.chip || 0, special:this.state === 'special'};
  }
  takeHit(atk, from) {
    const frontal = (from.x - this.x) * this.face > 0;
    if (this.blocking && frontal) {
      const dmg = atk.special ? atk.chip : atk.dmg * .2;
      this.hp = Math.max(0, this.hp - dmg); this.flash = .08; this.blockFlash = .12;
      this.vx = Math.sign(this.x - from.x) * atk.kb * .25; return 'block';
    }
    this.hp = Math.max(0, this.hp - atk.dmg); this.stun = atk.stun; this.flash = .08;
    this.vx = Math.sign(this.x - from.x) * atk.kb; this.atk = null; this.blocking = 0; this.dashLeft = 0;
    this.atkPhase = '';
    this.state = 'hit'; return 'hit';
  }
  /** Draw-only X nudge so visual bones() stay ≥8px from buttons. Does not move this.x / combat. */
  drawNudgeX() {
    const b = this.bones();
    const sc = Game.scale, ox = Game.ox, oy = Game.oy, c = 8;
    let dx = 0;
    for (const btn of Game.btns) {
      const y0 = oy + b.y0 * sc, y1 = oy + b.y1 * sc;
      if (y0 >= btn.y + btn.h + c || y1 <= btn.y - c) continue;
      if (btn.x + btn.w / 2 < innerWidth / 2) {
        const gap = (ox + b.x0 * sc) - (btn.x + btn.w);
        if (gap < c) dx = Math.max(dx, (c - gap) / sc);
      } else {
        const gap = btn.x - (ox + b.x1 * sc);
        if (gap < c) dx = Math.min(dx, (gap - c) / sc);
      }
    }
    return dx;
  }
  draw(ctx) {
    const nudge = this.drawNudgeX();
    if (nudge) ctx.translate(nudge, 0);
    const b = this.bones();
    const col = this.flash > 0 ? '#FFFFFF' : this.color;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Game.lw;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const chain = (pts) => {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      for (let i = 0; i < pts.length - 1; i++) {
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, Game.lw * .35, 0, Math.PI * 2); ctx.fill();
      }
    };
    chain([b.hip, b.chest, b.neck]);
    // Lead/rear shoulders: shR carries punch shPull (~6px back); shL stays on chest
    chain([b.shL || b.sh, b.laJ, b.la]);
    chain([b.shR || b.sh, b.raJ, b.ra]);
    chain([b.hip, b.llJ, b.ll]);
    chain([b.hip, b.rlJ, b.rl]);
    ctx.beginPath(); ctx.arc(b.head.x, b.head.y, b.hr, 0, Math.PI * 2); ctx.fill();
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
      ctx.globalAlpha = 1; ctx.lineWidth = Game.lw;
    }
    if (!Game.banner && Game.phase !== 'title') {
      ctx.fillStyle = '#fff'; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(this.tag, b.head.x, b.y0 - 12 / Game.scale);
    }
  
    if (nudge) ctx.translate(-nudge, 0);
  }
}


class Fx {
  static list = [];
  static clear() { Fx.list = []; }
  static hudBottom() {
    const sc = Game.scale;
    const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-t')) || 0;
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
      const a = (Math.PI * 2 * i) / n + Math.random() * .35;
      Fx.list.push({kind: 'spark', x, y, a, len, life, max: life, color, alpha: alpha == null ? 1 : alpha});
    }
  }
  static hit(x, y) { Fx.sparks(x, y, 6, '#FFFFFF', 1, .12); }
  static blocked(x, y) { Fx.sparks(x, y, 4, '#F5F5F5', .5, .12); }
  static special(x, y) { Fx.sparks(x, y, 10, '#FBBF24', 1, .12); }
  static land(x) {
    const y = Game.GROUND, sc = Game.scale || 1;
    for (let i = 0; i < 3; i++) {
      const ox = x + (i - 1) * (6 / sc);
      if (!Fx.allowed(ox, y - 2 / sc)) continue;
      Fx.list.push({kind: 'dust', x: ox, y, life: .2, max: .2, r0: 4 / sc, r1: 10 / sc});
    }
  }
  static update(dt) {
    for (const e of Fx.list) e.life -= dt;
    Fx.list = Fx.list.filter(e => e.life > 0);
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
  static BAND_TOP = 0.62;
  static BAND_BOT = 0.80;
  static DEPTH_HIT_PX = 14;
  static cameraX = 0;
  static skyOffset = 0;
  static cast = [];
  static wave = 0;
  static waveTotal = 3;
  static locked = 1;
  static showGo = 0;
  static goArmed = 0;
  static boss = null;
  static stageOver = 0; // 0 playing, 1 win, -1 lose
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
  static clusterLeftCss() {
    const el = document.querySelector('#controls .cluster');
    if (el) return el.getBoundingClientRect().left;
    return innerWidth - 16 - (64 + 10 + 64);
  }
  /** Hard right limit for drawn bones in CSS px: 8px left of the P/K/B/S cluster (682 @ 844). */
  static bonesRightLimitCss() {
    return BeatEmUp.clusterLeftCss() - 8;
  }
  /** Pull fighter left so bones().x1 (current drawn pose, incl. kick/punch) stays ≤ cluster−8. */
  static clampFighterRight(entry) {
    BeatEmUp.withDepth(entry, () => {
      const b = entry.f.bones();
      const screenX1 = (b.x1 - BeatEmUp.cameraX) * Game.scale;
      const limit = BeatEmUp.bonesRightLimitCss();
      if (screenX1 > limit) entry.f.x -= (screenX1 - limit) / Game.scale;
    });
  }
  /** Soft lane max for body centre (same formula locked or free; cameraX differs). Hard limb rule is clampFighterRight. */
  static softMaxX() {
    return BeatEmUp.cameraX + BeatEmUp.bonesRightLimitCss() / Game.scale;
  }
  static withDepth(entry, fn) {
    const savedGround = Game.GROUND;
    const savedS = Fighter.S;
    const savedHr = Game.hr;
    const savedLw = Game.lw;
    const scDepth = BeatEmUp.depthToScale(entry.depth) * (entry.scaleMul || 1);
    Game.GROUND = BeatEmUp.depthToY(entry.depth);
    Fighter.S = BeatEmUp.baseS * scDepth;
    Game.hr = savedHr * scDepth;
    Game.lw = Math.max(3.5, savedLw * scDepth);
    try { return fn(); }
    finally {
      Game.GROUND = savedGround;
      Fighter.S = savedS;
      Game.hr = savedHr;
      Game.lw = savedLw;
    }
  }

  static resetStage() {
    BeatEmUp.cameraX = 0;
    BeatEmUp.skyOffset = 0;
    BeatEmUp.wave = 0;
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.goArmed = 0;
    BeatEmUp.boss = null;
    BeatEmUp.stageOver = 0;
    BeatEmUp.cast = [];
    BeatEmUp.baseS = Fighter.S;
    BeatEmUp.lockL = 0;
    BeatEmUp.lockR = Game.W * 0.92;
    BeatEmUp.spawnX = Game.W * 0.7;
    BeatEmUp.worldMax = Game.W * 4.2;
    const p = fighters[0];
    p.reset(Game.W * 0.28, 1);
    p.color = '#3B82F6';
    p.tag = 'YOU';
    p.meter = 0;
    BeatEmUp.cast.push({ f: p, depth: 0.55, role: 'player', kind: 'player', scaleMul: 1, ai: null });
    // Hide unused 1v1 foe
    fighters[1].reset(-9999, -1);
    fighters[1].hp = 0;
    BeatEmUp.startWave(1);
  }

  static makeEnemy(kind, x, depth) {
    const colors = { regular: '#EF4444', tough: '#F97316', boss: '#EF4444' };
    const f = new Fighter(x, colors[kind] || '#EF4444', -1, '');
    f.y = 0;
    if (kind === 'tough') { f.hp = 130; f.chip = 130; }
    else if (kind === 'boss') { f.hp = 220; f.chip = 220; }
    else { f.hp = 100; f.chip = 100; }
    f.meter = 0;
    const scaleMul = kind === 'boss' ? 1.25 : 1;
    return {
      f, depth, role: 'enemy', kind, scaleMul,
      ai: { mode: 'circle', atkSlot: 0, cool: 0.3 + Math.random() * 0.4, orbit: Math.random() * Math.PI * 2, preferDepth: depth },
    };
  }

  static waveDefs(n) {
    // relative spawn layouts (world x offsets from lockL + W*0.55)
    if (n === 1) return [
      { kind: 'regular', ox: 0.55, depth: 0.15 },
      { kind: 'regular', ox: 0.62, depth: 0.55 },
      { kind: 'regular', ox: 0.48, depth: 0.95 },
    ];
    if (n === 2) return [
      { kind: 'regular', ox: 0.52, depth: 0.2 },
      { kind: 'tough', ox: 0.60, depth: 0.7 },
      { kind: 'regular', ox: 0.70, depth: 0.4 },
    ];
    if (n === 3) return [
      { kind: 'tough', ox: 0.50, depth: 0.25 },
      { kind: 'tough', ox: 0.58, depth: 0.85 },
      { kind: 'regular', ox: 0.68, depth: 0.5 },
      { kind: 'regular', ox: 0.72, depth: 0.1 },
    ];
    return [];
  }

  static startWave(n) {
    BeatEmUp.wave = n;
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.goArmed = 0;
    BeatEmUp.boss = null;
    // Lock window around current camera
    BeatEmUp.lockL = BeatEmUp.cameraX;
    BeatEmUp.lockR = BeatEmUp.cameraX + Game.W * 0.95;
    BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
    const defs = BeatEmUp.waveDefs(n);
    for (const d of defs) {
      const x = BeatEmUp.lockL + Game.W * d.ox;
      BeatEmUp.cast.push(BeatEmUp.makeEnemy(d.kind, x, d.depth));
    }
    Game.phase = 'intro';
    Game.banner = 'WAVE ' + n;
    Game.bannerT = 1.1;
    Game.fighting = 0;
    Game.timer = 99;
  }

  static startBoss() {
    BeatEmUp.wave = 4;
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.lockL = BeatEmUp.cameraX;
    BeatEmUp.lockR = BeatEmUp.cameraX + Game.W * 0.95;
    BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
    const boss = BeatEmUp.makeEnemy('boss', BeatEmUp.lockL + Game.W * 0.62, 0.55);
    BeatEmUp.boss = boss;
    BeatEmUp.cast.push(boss);
    Game.phase = 'intro';
    Game.banner = 'BOSS';
    Game.bannerT = 1.2;
    Game.fighting = 0;
    Game.timer = 99;
  }

  static enemiesAlive() {
    return BeatEmUp.cast.filter(e => e.role === 'enemy' && e.f.hp > 0);
  }

  static playerEntry() {
    return BeatEmUp.cast.find(e => e.role === 'player');
  }

  static onMatchOverKey() {
    // Retry on Enter/Space/j when lose/win in beatemup
    BeatEmUp.retryOrTitle(true);
    return true;
  }
  static onMatchOverTap(e) {
    BeatEmUp.retryOrTitle(false);
    return true;
  }
  static retryOrTitle(fromKey) {
    if (BeatEmUp.stageOver === -1 || BeatEmUp.stageOver === 1) {
      // Retry stage
      BeatEmUp.begin();
    }
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
    Game.btns = [...document.querySelectorAll('#controls button')].map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
  }

  static update(dt) {
    if (BeatEmUp.stageOver) return;
    const player = BeatEmUp.playerEntry();
    if (!player) return;

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
      Game.minX = BeatEmUp.locked ? BeatEmUp.lockL + 40 : BeatEmUp.cameraX + 40;
      Game.maxX = BeatEmUp.softMaxX();
      player.f.update(dt, faceOther, 0);
      BeatEmUp.clampFighterRight(player);
    });

    // AI plans pads, then each enemy updates with its own pad on slot 1
    BeatEmUp.updateGroupAI(dt, player);
    for (const e of BeatEmUp.cast) {
      if (e.role !== 'enemy' || e.f.hp <= 0) continue;
      const pad = e._pad || {};
      Input.acts.forEach(a => { Input.pad[1][a] = pad[a] || 0; Input.was[1][a] = 0; });
      BeatEmUp.withDepth(e, () => {
        Game.minX = BeatEmUp.lockL + 20;
        Game.maxX = BeatEmUp.softMaxX();
        e.f.update(dt, player.f, 1);
        BeatEmUp.clampFighterRight(e);
      });
      Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    }

    BeatEmUp.resolveHits();
    BeatEmUp.checkWaveState();

    if (player.f.hp <= 0) {
      BeatEmUp.stageOver = -1;
      Game.fighting = 0;
      Game.matchOver = 1;
      Game.phase = 'matchEnd';
      Game.winner = 'You lose';
      Game.banner = 'You lose';
      Game.bannerT = 99;
    }
  }

  static updateGroupAI(dt, player) {
    const alive = BeatEmUp.enemiesAlive();
    // Assign at most 2 attackers
    const sorted = alive.slice().sort((a, b) => Math.abs(a.f.x - player.f.x) - Math.abs(b.f.x - player.f.x));
    const attackers = new Set(sorted.slice(0, 2));
    for (const e of alive) {
      const ai = e.ai;
      ai.cool = Math.max(0, ai.cool - dt);
      const dist = Math.abs(e.f.x - player.f.x);
      const depthGap = Math.abs(e.depth - player.depth);
      Input.pad[1].left = 0; Input.pad[1].right = 0;
      Input.pad[1].punch = 0; Input.pad[1].kick = 0;
      Input.pad[1].block = 0; Input.pad[1].jump = 0; Input.pad[1].special = 0;

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
        const r = Math.random();
        if (r < 0.55) Input.pad[1].punch = 1;
        else if (r < 0.85) Input.pad[1].kick = 1;
        else Input.pad[1].block = 1;
        ai.cool = 0.45 + Math.random() * 0.5;
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
      block: Input.pad[1].block, jump: 0, special: 0,
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
        if (attacker === target) continue;
        if (attacker.role === 'enemy' && target.role === 'enemy') continue;
        if (!BeatEmUp.depthClose(attacker.depth, target.depth)) continue;
        let hit = null;
        BeatEmUp.withDepth(attacker, () => { hit = attacker.f.strike(); });
        if (!hit) continue;
        let th = null;
        BeatEmUp.withDepth(target, () => { th = { x: target.f.hitbox.x, y: target.f.hitbox.y, w: target.f.hitbox.w, h: target.f.hitbox.h }; });
        if (!th || !Game.hitTest(hit, th)) continue;
        attacker.f.hitDone = 1;
        let kind = 'hit';
        BeatEmUp.withDepth(target, () => { kind = target.f.takeHit(hit, attacker.f); });
        attacker.f.gainMeter(hit.special ? 0 : hit.dmg * 2.5);
        target.f.gainMeter(hit.special ? 12 : hit.dmg * 1.5);
        const cx = hit.x + hit.w / 2, cy = hit.y + hit.h / 2;
        if (hit.special) Fx.special(cx, cy);
        else if (kind === 'block') Fx.blocked(cx, cy);
        else Fx.hit(cx, cy);
        Game.stop = .05; Game.shake = .1; Game.shMag = 3;
        if (kind === 'hit') target.f.vy = -100;
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
        if (BeatEmUp.wave < 3) BeatEmUp.startWave(BeatEmUp.wave + 1);
        else BeatEmUp.startBoss();
      }
    } else if (BeatEmUp.wave === 4) {
      // Boss dead
      BeatEmUp.stageOver = 1;
      Game.fighting = 0;
      Game.matchOver = 1;
      Game.phase = 'matchEnd';
      Game.winner = 'Stage clear';
      Game.banner = 'Stage clear';
      Game.bannerT = 99;
    }
  }

  static drawArena(ctx) {
    const sc = Game.scale;
    const bandTopY = Game.H * BeatEmUp.BAND_TOP;
    const bandBotY = Game.H * BeatEmUp.BAND_BOT;
    const sky = ctx.createLinearGradient(0, 0, 0, bandTopY);
    sky.addColorStop(0, '#14151C');
    sky.addColorStop(1, '#1F2230');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, Game.W, bandTopY);

    const yTop = Game.H * .55;
    ctx.fillStyle = '#262A38';
    const blocks = [
      [0, 70, 55], [70, 50, 40], [120, 90, 70], [210, 40, 35], [250, 80, 60],
      [330, 55, 45], [385, 100, 75], [485, 45, 38], [530, 75, 58], [605, 60, 48],
      [665, 95, 72], [760, 50, 42], [810, 85, 65], [895, 55, 50]
    ];
    const ox = BeatEmUp.skyOffset % Game.W;
    const drawBlocks = (shift) => {
      for (const [bx, bw, bh] of blocks) {
        const x = (bx / 960 * Game.W) - ox + shift;
        const w = bw / 960 * Game.W;
        const h = Math.min(bh, bandTopY - yTop);
        if (x + w < 0 || x > Game.W) continue;
        ctx.fillRect(x, bandTopY - h, w, h);
      }
    };
    drawBlocks(0);
    drawBlocks(Game.W);

    ctx.fillStyle = '#0C0D10';
    ctx.fillRect(0, bandBotY, Game.W, Game.H - bandBotY);
    ctx.fillStyle = '#181A22';
    ctx.fillRect(0, bandTopY, Game.W, bandBotY - bandTopY);
    ctx.fillStyle = '#3A3F52';
    ctx.fillRect(0, bandBotY, Game.W, 2 / sc);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, bandTopY, Game.W, 1.5 / sc);
    ctx.globalAlpha = 1;
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
      entry.f.draw(ctx);
      ctx.restore();
    });
  }

  static bars(ctx) {
    const sc = Game.scale;
    const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-t')) || 0;
    const top = (12 + safe) / sc, h = 12 / sc, gap = 44 / sc;
    const w = Game.W * .4 - 14 / sc, mh = 5 / sc, mGap = 4 / sc;
    const x0 = (Game.W - 2 * w - gap) / 2;
    const me = fighters[0];
    ctx.fillStyle = '#2A2D35';
    ctx.strokeStyle = '#0E0F12';
    ctx.lineWidth = 2 / sc;
    ctx.fillRect(x0, top, w, h);
    ctx.strokeRect(x0, top, w, h);
    ctx.fillStyle = 'rgba(245,245,245,.6)';
    ctx.fillRect(x0, top, w * (me.chip / 100), h);
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(x0, top, w * (Math.min(100, me.hp) / 100), h);
    ctx.font = 'bold ' + 12 / sc + 'px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 / sc;
    ctx.strokeStyle = '#0E0F12';
    ctx.strokeText('YOU', x0 + 6 / sc, top + h / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('YOU', x0 + 6 / sc, top + h / 2);
    const my = top + h + mGap;
    ctx.fillStyle = '#2A2D35';
    ctx.strokeStyle = '#0E0F12';
    ctx.lineWidth = 2 / sc;
    ctx.fillRect(x0, my, w, mh);
    ctx.strokeRect(x0, my, w, mh);
    ctx.fillStyle = me.meter >= 100 ? '#FBBF24' : '#A78BFA';
    ctx.fillRect(x0, my, w * (me.meter / 100), mh);

    const tStr = String(Math.ceil(Math.max(0, Game.timer))).padStart(2, '0');
    ctx.font = 'bold ' + 22 / sc + 'px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4 / sc;
    ctx.strokeStyle = '#0E0F12';
    ctx.strokeText(tStr, Game.W / 2, top + h / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(tStr, Game.W / 2, top + h / 2);

    // Wave / boss label
    ctx.font = 'bold ' + 13 / sc + 'px system-ui,sans-serif';
    ctx.lineWidth = 3 / sc;
    const waveX = Game.W / 2 + 78 / sc;
    const label = BeatEmUp.wave <= 3 ? ('WAVE ' + BeatEmUp.wave + '/' + BeatEmUp.waveTotal) : 'BOSS';
    ctx.strokeText(label, waveX, top + h / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, waveX, top + h / 2);

    // Boss HP under timer (label stays on the timer row above — not over the bar)
    if (BeatEmUp.boss && BeatEmUp.boss.f.hp > 0) {
      const bw = Game.W * 0.36, bh = 8 / sc;
      const bx = (Game.W - bw) / 2, by = top + h + 14 / sc;
      ctx.fillStyle = '#2A2D35';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#0E0F12';
      ctx.lineWidth = 2 / sc;
      ctx.strokeRect(bx, by, bw, bh);
      const pct = BeatEmUp.boss.f.hp / 220;
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(bx, by, bw * pct, bh);
    }
    ctx.textBaseline = 'alphabetic';
  }

  static draw(ctx) {
    BeatEmUp.drawArena(ctx);
    const ordered = BeatEmUp.cast.filter(e => e.f.hp > 0 || e.role === 'player').slice()
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
      ctx.font = 'bold ' + 36 / sc + 'px system-ui,sans-serif';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5 / sc;
      ctx.strokeStyle = '#0E0F12';
      ctx.strokeText('GO →', x, y);
      ctx.fillStyle = '#FBBF24';
      ctx.fillText('GO →', x, y);
      ctx.textBaseline = 'alphabetic';
    }
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
    Input.bind(); Game.mode = '1v1'; Input.syncMode(); Game.goTitle(); Game.fit(); addEventListener('resize', () => Game.fit());
    Game.last = performance.now(); requestAnimationFrame(Game.frame);
  }
  static mode = '1v1';
  static goTitle() {
    Game.phase = 'title'; Game.fighting = 0; Game.matchOver = 0; Game.banner = '';
    Game.round = 1; Game.wins = [0, 0]; Game.winner = ''; Game.stop = 0; Game.shake = 0;
    fighters[0].meter = 0; fighters[1].meter = 0;
    fighters[0].color = '#3B82F6'; fighters[1].color = '#EF4444';
    fighters[0].tag = 'YOU'; fighters[1].tag = 'CPU';
    fighters[0].hp = 100; fighters[1].hp = 100;
    BeatEmUp.stageOver = 0; BeatEmUp.showGo = 0; BeatEmUp.cast = []; BeatEmUp.boss = null;
    Input.syncMode();
    Game.placeTitleFighters();
    Fx.clear(); Bot.reset();
    Game.syncControls();
  }
  /** Title-only: idle fighters at ~15% / 85% width, facing in. Match spawn unchanged. */
  static placeTitleFighters() {
    const sc = Game.scale || 1;
    const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-l')) || 0;
    const safeR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-r')) || 0;
    const inset = (16 + Math.max(safeL, safeR)) / sc;
    // Approximate full limb reach from body center (idle pose + stroke)
    const reach = 48;
    let x0 = Game.W * .15, x1 = Game.W * .85;
    x0 = Math.max(inset + reach, Math.min(Game.W / 2 - 80, x0));
    x1 = Math.min(Game.W - inset - reach, Math.max(Game.W / 2 + 80, x1));
    fighters[0].reset(x0, 1); fighters[1].reset(x1, -1);
  }
  static startMatch() {
    if (Game.mode === 'beatemup') {
      BeatEmUp.begin();
      return;
    }
    try { localStorage.setItem('stickman-level', Game.level); } catch (e) {}
    Game.round = 1; Game.wins = [0, 0]; Game.matchOver = 0; Game.winner = '';
    fighters[0].meter = 0; fighters[1].meter = 0;
    Game.syncControls();
    Game.startRound();
  }
  static startRound() {
    Game.stop = 0; Game.shake = 0; Game.timer = 60; Game.fighting = 0; Game.matchOver = 0;
    fighters[0].reset(Math.max(Game.minX, Math.min(Game.maxX, Game.W * .35)), 1);
    fighters[1].reset(Math.max(Game.minX, Math.min(Game.maxX, Game.W * .65)), -1);
    Fx.clear(); Bot.reset();
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
    const tabs = Game.modeTabs();
    if (Game.mode === 'beatemup') {
      const bw = 120 / sc, bh = 56 / sc;
      const x = (Game.W - bw) / 2;
      const y = Game.H * .55 - bh / 2;
      return { tabs, levels: [{ id: 'stage1', x, y, w: bw, h: bh, label: 'Stage 1' }] };
    }
    const bw = 120 / sc, bh = 57 / sc, gap = 12 / sc;
    const total = 3 * bw + 2 * gap;
    let x0 = (Game.W - total) / 2;
    x0 = Math.max(inset, Math.min(Game.W - inset - total, x0));
    const y = Game.H * .55 - bh / 2;
    return {
      tabs,
      levels: Game.levels.map((id, i) => ({id, x: x0 + i * (bw + gap), y, w: bw, h: bh, label: Game.levelLabels[id]})),
    };
  }
  static modeTabs() {
    const sc = Game.scale;
    const tw = 140 / sc, th = 44 / sc, tgap = 10 / sc;
    const tTotal = 2 * tw + tgap;
    const tx0 = (Game.W - tTotal) / 2;
    const ty = Game.H * .38 - th / 2;
    return [
      { id: '1v1', label: '1v1', x: tx0, y: ty, w: tw, h: th },
      { id: 'beatemup', label: "Beat 'em up", x: tx0 + tw + tgap, y: ty, w: tw, h: th },
    ];
  }
  static titlePointer(e) {
    const sc = Game.scale;
    const gx = e.clientX / sc, gy = e.clientY / sc;
    const layout = Game.titleLayout();
    const tab = layout.tabs.find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
    if (tab) { Game.mode = tab.id; Input.syncMode(); return; }
    if (Game.mode === '1v1') {
      const hit = layout.levels.find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
      if (hit) { Game.level = hit.id; return; }
    }
    Game.startMatch();
  }
  static tryTitleKey(key) {
    if (key === 'Tab') {
      Game.mode = Game.mode === '1v1' ? 'beatemup' : '1v1';
      Input.syncMode();
      return;
    }
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      if (Game.mode === 'beatemup') { Game.mode = '1v1'; Input.syncMode(); return; }
      const i = Game.levels.indexOf(Game.level);
      Game.level = Game.levels[Math.max(0, i - 1)]; return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      if (Game.mode === '1v1' && Game.level === Game.levels[Game.levels.length - 1]) {
        Game.mode = 'beatemup'; Input.syncMode(); return;
      }
      if (Game.mode === 'beatemup') return;
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
    Game.hr = Math.max(16.5, 13.2 / scale); Game.lw = Math.max(6, 4.5 / scale);
    Game.canvas.style.width = innerWidth + 'px'; Game.canvas.style.height = innerHeight + 'px';
    Game.canvas.width = Math.round(innerWidth * dpr); Game.canvas.height = Math.round(innerHeight * dpr);
    Game.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    // Prefer middle 70% (15%–85%), but end the lane early enough that visual
    // bones() at the edges stay ≥8px from edge-pinned controls (drawNudgeX → 0).
    const EDGE = 16;
    const BTN = 64, GAP = 10, CLEAR = 8;
    const PAD_W = BTN * 2 + GAP; // move row / 2×2 cluster width
    const REACH = 65; // max observed visual AABB past hip (worst pose)
    const safeL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-l')) || 0;
    const safeR = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sai-r')) || 0;
    const loBtn = (EDGE + safeL + PAD_W + CLEAR) / scale + REACH;
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
      fighters[1].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[1].x || Game.W * .65));
    }
    Game.btns = Game.phase === 'title' ? [] : [...document.querySelectorAll('#controls button')].map(el => {
      const r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height};
    });
    Game.titleBtns = Game.titleLayout().levels;
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
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      if (box.special) Fx.special(cx, cy);
      else if (kind === 'block') Fx.blocked(cx, cy);
      else Fx.hit(cx, cy);
      Game.stop = .06; Game.shake = .12; Game.shMag = 4;
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
    Fx.update(dt);
    if (Game.stop > 0) { Game.stop -= dt; Game.draw(); requestAnimationFrame(Game.frame); return; }
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      const step = Game.STEP;
      if (Game.phase === 'title') {
        fighters[0].face = 1; fighters[1].face = -1;
        fighters[0].pose = Pose.idle(); fighters[1].pose = Pose.idle();
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
        fighters.forEach(f => { if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * step / .3); });
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
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 40 / sc + 'px system-ui,sans-serif';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3 / sc; ctx.strokeStyle = '#0E0F12';
    ctx.strokeText('STICKMAN FIGHTER', Game.W / 2, Game.H * .22);
    ctx.fillStyle = '#FFFFFF'; ctx.fillText('STICKMAN FIGHTER', Game.W / 2, Game.H * .22);

    const layout = Game.titleLayout();
    Game.titleBtns = layout.levels;
    ctx.font = 'bold ' + 16 / sc + 'px system-ui,sans-serif';
    for (const t of layout.tabs) {
      const sel = t.id === Game.mode;
      if (sel) {
        ctx.fillStyle = '#3B82F6';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.strokeStyle = '#0E0F12'; ctx.lineWidth = 2 / sc; ctx.strokeRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = '#FFFFFF';
      } else {
        ctx.fillStyle = 'rgba(42,45,53,0.55)';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.strokeStyle = '#3A3F52'; ctx.lineWidth = 2 / sc; ctx.strokeRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillText(t.label, t.x + t.w / 2, t.y + t.h / 2);
    }

    ctx.font = 'bold ' + 18 / sc + 'px system-ui,sans-serif';
    for (const b of layout.levels) {
      const sel = Game.mode === '1v1' && b.id === Game.level;
      ctx.fillStyle = sel ? '#FBBF24' : '#2A2D35';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (sel) {
        ctx.strokeStyle = '#0E0F12'; ctx.lineWidth = 2 / sc; ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#0E0F12';
      } else {
        ctx.strokeStyle = 'rgba(245,245,245,.4)'; ctx.lineWidth = 2 / sc; ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = '#FFFFFF';
      }
      ctx.fillText(b.label || Game.levelLabels[b.id] || b.id, b.x + b.w / 2, b.y + b.h / 2);
    }
    ctx.globalAlpha = .8; ctx.fillStyle = '#FFFFFF';
    ctx.font = 16 / sc + 'px system-ui,sans-serif';
    ctx.fillText('Tap to fight', Game.W / 2, Game.H * .82);
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
    } else {
      Game.drawArena(ctx);
      fighters.forEach(f => f.draw(ctx));
      Fx.draw(ctx);
    }
    ctx.restore();
    if (Game.phase === 'title') { Game.drawTitle(ctx); return; }
    if (Game.mode !== 'beatemup') Game.bars(ctx);
    if (Game.banner) {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = 'bold ' + (Game.banner === 'Fight!' ? 56 : 42) / Game.scale + 'px system-ui,sans-serif';
      ctx.lineJoin = 'round'; ctx.lineWidth = 5 / Game.scale; ctx.strokeStyle = '#0E0F12';
      ctx.strokeText(Game.banner, Game.W / 2, Game.H * .42);
      ctx.fillText(Game.banner, Game.W / 2, Game.H * .42);
      if (Game.matchOver) {
        const tip = Game.mode === 'beatemup' ? 'Tap to retry' : 'Tap for title';
        ctx.font = 16 / Game.scale + 'px system-ui,sans-serif';
        ctx.lineWidth = 3 / Game.scale;
        ctx.strokeText(tip, Game.W / 2, Game.H * .42 + 40 / Game.scale);
        ctx.fillText(tip, Game.W / 2, Game.H * .42 + 40 / Game.scale);
      }
    }
  }
}

Game.init();
