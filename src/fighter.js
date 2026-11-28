import { Sfx } from './audio.js';
import { BeatEmUp } from './beatemup.js';
import { BladeSuper } from './blade.js';
import { ArchetypeEquipment, ArchetypeSkeleton, BossCounter, BossCounters, BossPhases, BossReplay, BossSignature, BossWeapons, Depth, EnemyBash, EnemyBashes, EnemyCombo, EnemyCombos, EnemyDeploy, EnemyDeploys, EnemyGrab, EnemyGrabs, EnemyGuard, EnemyProjectile, EnemyRush, EnemyRushes, EnemySlam, EnemySlams, FighterClasses } from './config.js';
import { Fx } from './fx.js';
import { Game, fighters } from './game.js';
import { Input } from './input.js';
import { Atk, Moves } from './moves.js';
import { CombatPose, Pose } from './pose.js';

export class Fighter {
  static S = 1.2;
  static STAFF_WEAPON_LENGTH = 205;
  static ARM = 18 * 1.2;
  static LEG = 20 * 1.2;
  static TORSO = 22 * 1.2;
  static NECK = 8 * 1.2;
  static RUN_SPEED = 220;
  static GROUND_ACCEL = 1000;   // pacing pass (was 1300): 0 -> top speed ~0.22 s
  static GROUND_BRAKE = 1400;   // pacing pass (was 1800): stop ~0.16 s
  static TURN_ACCEL = 1700;
  static FOLLOWUP_MIN_SU = 5;   // pacing pass: min combo follow-up startup (frames) after attackSpeed
  static BLEND_FLOOR = .08;     // pacing pass (was .04): pose blends last >= ~5 frames so poses read
  static LIVE_BLEND_FLOOR = .04; // inside an attack's active frames: old floor, so hit geometry never moves
  constructor(x, color, side, tag) {
    this.color = color; this.tag = tag; this.playerControlled = tag === 'YOU';
    this.weaponType = null; this.attackSpeed = 1; this.damageMultiplier = 1;
    this.specialDamageMultiplier = 1; this.meterGainMultiplier = 1;
    this.bossProfile = null;
    this.bodyProfile = null; this.enemyCombo = null; this.enemyRush = null; this.enemySlam = null; this.enemyGuard = null; this.enemyBash = null; this.enemyGrab = null; this.enemyDeploy = null; this.deployCoolT = 0;
    this.heldBy = null; this.grabVictim = null; this.heldT = 0; this.noRegrabT = 0; this.grabCoolT = 0; this.grabRelease = ''; // Grappler grab state
    this.guardOpenT = 0; this.guardRecoilT = 0; this.guardChainT = 0; this.guardBlocks = 0; this.guardFace = null; this.guardTurnT = 0; // archetype draw profile + multi-hit normal / committed rush (enemies only)
    this.meter = 0; this.reset(x, side);
  }
  reset(x, side) {
    if (this.heldBy) EnemyGrab.release(this, 'reset');
    if (this.grabVictim) EnemyGrab.release(this.grabVictim, 'reset');
    this.noRegrabT = 0; this.grabCoolT = 0; this.deployCoolT = 0;
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0; this.face = side; this.depth = Depth.START;
    this.grounded = true; this.state = 'idle'; this.walkT = 0; this.walkPx = 0; this.animT = 0;
    this.pose = Pose.idle(this.classProfile); this.poseFrom = Pose.copy(this.pose); this.poseTo = Pose.copy(this.pose);
    this.blendT = 1; this.blendDur = .08; this.poseKey = 'idle';
    this.hp = 100; this.chip = 100; this.stun = 0; this.flash = 0; this.blocking = 0;
    this.atk = null; this.atkT = 0; this.hitDone = 0; this.dashLeft = 0; this.specialVisual = null; this.enemyThrowPose = null;
    this.specialOriginX = null; this.specialOriginDepth = null; this.specialFxPulse = -1;
    this.bladeSuper = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0; this.wardShieldT = 0;
    this.hitConfirmed = 0;
    this.dodgeT = 0; this.dodgeCooldown = 0; this.rollVx = 0;
    this.chain = 0; this.chainArmed = 0;
    this.heavyFollow = 0; this.heavyQueued = false;
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
  /* Practice and beat 'em up stand on the same floor. Depth 0 is the back edge, depth 1 is the front. */
  groundY() { return Depth.toY(this.depth, Depth.areaTop(), Depth.areaBot()); }
  depthScale() { return Game.mode === 'practice' ? Depth.toScale(this.depth, Depth.SCALE_1V1_MIN, Depth.SCALE_1V1_MAX) : 1; }
  drawS() { return Fighter.S * this.depthScale(); }
  gainMeter(n) { this.meter = Math.min(100, this.meter + n * (this.classProfile?.meter || 1) * this.meterGainMultiplier); }
  confirmHit(kind, damage) {
    if ((kind !== 'hit' && kind !== 'armored') || damage <= 0) return false;
    this.hitConfirmed = 1;
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
    // Visual-only floor: strike/active-frame blends keep the old .04 floor (player hit geometry reads bones()).
    const live = this.atk && this.atkT > this.atk.su && this.atkT <= this.atk.su + this.atk.ac;
    this.blendT = 0; this.blendDur = Math.max(live ? Fighter.LIVE_BLEND_FLOOR : Fighter.BLEND_FLOOR, dur); this.poseKey = key;
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
    const s = this.drawS(), g = this.groundY() + this.y, f = this.face, fv = -this.face, p = this.pose;
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
    const s = this.drawS(), g = this.groundY() + this.y, f = this.face, p = this.combatPose(), hr = Game.hr, hw = Game.lw / 2;
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
    if (kind !== 'special') this.specialVisual = null;
    if (this.bossProfile) {
      const profile = this.bossProfile;
      const counterQueued = this.bossCounterQueued; this.bossCounterQueued = false;
      if (kind === 'punch' && counterQueued && BossCounters[profile.counter]) {
        BossCounter.start(this, BossCounters[profile.counter]);
        this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
        this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.hitTargets = new Map(); this.atkPhase = '';
        return;
      }
      let key, state;
      const load = BossPhases.spec(this) || profile; // Syndicate Chief: normals follow the phase weapon
      if (kind === 'punch') { key = load.normal1.key; state = load.normal1.state; }
      else if (kind === 'kick') { key = load.normal2.key; state = load.normal2.state; }
      else if (kind === 'special') { key = BossReplay.next(this); state = 'special'; }
      else return;
      const m = Moves[key];
      if (!m) return;
      this.atk = {
        su: m.su, ac: m.ac, re: m.re,
        dmg: m.dmg, kb: m.kb, stun: m.stun, chip: m.chip || 0,
        kind, reach: m.reach, armored: !!m.armored, hitCount: m.hitCount == null ? 1 : m.hitCount,
      };
      this.atk.dmg *= this.damageMultiplier;
      this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = state; this.blocking = 0;
      this.chain = 0; this.chainArmed = 0; this.dashLeft = 0;
      this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
      this.atkPhase = '';
      if (kind === 'special') {
        BossSignature.start(this, key);
        Sfx.play('super-charge', this.bossProfile);
      } else {
        Sfx.play(state === 'kick' ? 'kick' : 'punch', this.bossProfile);
      }
      return;
    }
    if (kind === 'punch' && this.enemyCombo && EnemyCombos[this.enemyCombo]) { this.startEnemyCombo(EnemyCombos[this.enemyCombo]); return; }
    if (kind === 'punch' && this.enemyRush && EnemyRushes[this.enemyRush]) { this.startEnemyRush(EnemyRushes[this.enemyRush]); return; }
    if (kind === 'punch' && this.enemySlam && EnemySlams[this.enemySlam]) { this.startEnemySlam(EnemySlams[this.enemySlam]); return; }
    if (kind === 'punch' && this.enemyBash && EnemyBashes[this.enemyBash]) { this.startEnemyBash(EnemyBashes[this.enemyBash]); return; }
    if (kind === 'punch' && this.enemyGrab && EnemyGrabs[this.enemyGrab]) { this.startEnemyGrab(EnemyGrabs[this.enemyGrab]); return; }
    if (kind === 'punch' && this.enemyDeploy && EnemyDeploys[this.enemyDeploy]) { this.startEnemyDeploy(EnemyDeploys[this.enemyDeploy]); return; }
    let linked = false;
    if (kind === 'special') {
      if (this.meter < 100) return;
      this.meter = 0;
      const staffSuper = this.classProfile?.weapon === 'staff';
      const bladeSuper = this.classProfile?.weapon === 'blade';
      this.dashLeft = staffSuper || bladeSuper ? 0 : Game.W * (this.classProfile?.dash || .14);
      this.specialOriginX = staffSuper || bladeSuper ? this.x : null;
      this.specialOriginDepth = staffSuper || bladeSuper ? this.depth : null;
      this.bladeSuper = bladeSuper ? BladeSuper.begin(this) : null;
      this.specialFxPulse = -1;
      this.chain = 0; this.chainArmed = 0;
    } else if (kind === 'punch') {
      this.chain = 0;
      this.chainArmed = 0;
    } else {
      linked = false;
      this.chain = 0; this.chainArmed = 0;
    }
    this.atk = Atk.of(kind, kind === 'punch' ? this.chain : 0, kind === 'punch' ? this.punchChainMax() : null, this.classProfile);
    if (this.atk) {
      // Player specials release quickly; CPU specials telegraph longer to give players a dodge window.
      if (kind === 'special') {
        if (this.classProfile?.weapon === 'blade') {
          this.atk.su = BladeSuper.CHARGE_FRAMES;  // 12: charge (1-12)
          this.atk.ac = BladeSuper.STRIKE_FRAMES;  // 24: draw wind-up + active slash + follow-through hold (13-36)
          this.atk.re = BladeSuper.END_FRAMES;     // 24: recovery + sheath finish (37-60)
        } else if (this.classProfile?.style === 'ward') {
          const karateSu = this.playerControlled ? 10 : Math.round(1.25 / Game.STEP);
          this.atk.su = Math.round(karateSu * 1.2);
          this.atk.ac = Math.round(15 * 1.2);
          this.atk.re = Math.round(18 * 1.2);
        } else if (this.classProfile?.weapon !== 'staff') {
          this.atk.su = Math.round((this.playerControlled ? .5 : 1.25) / Game.STEP);
        }
      }
      const style = this.classProfile?.style;
      const timings = {
        // Pacing pass (2026-11-15): startup/recovery x1.3, active unchanged.
        rush: {punch:[8,3,13],kick:[12,4,20]}, flame:{punch:[10,3,17],kick:[14,5,23]},
        flash:{punch:[7,3,12],kick:[10,4,16]}, quake:{punch:[13,3,22],kick:[18,5,29]},
        ward:{punch:[5,3,12],kick:[12,4,20]},
      }[style];
      if (timings && (kind === 'punch' || kind === 'kick') && this.classProfile?.weapon !== 'staff') {
        const timing = timings[kind];
        if (kind !== 'punch' || !this.chain) [this.atk.su,this.atk.ac,this.atk.re] = timing;
      }
      const attackSpeed = this.attackSpeed * (this.classProfile?.attackSpeed || 1);
      if (kind !== 'special' && attackSpeed !== 1 && this.classProfile?.weapon !== 'staff') {
        this.atk.su = Math.max(1, Math.round(this.atk.su / attackSpeed));
        this.atk.ac = Math.max(1, Math.round(this.atk.ac / attackSpeed));
        this.atk.re = Math.max(1, Math.round(this.atk.re / attackSpeed));
      }
      // Pacing pass: every class combo follow-up keeps at least a 5 f startup after attackSpeed scaling.
      if (kind === 'punch' && this.chain > 0 && this.classProfile) this.atk.su = Math.max(Fighter.FOLLOWUP_MIN_SU, this.atk.su);
      const multiplier = kind === 'special' ? (this.classProfile?.superPower || 1)
        : kind === 'kick' ? (this.classProfile?.kick || 1)
          : (this.classProfile?.punch || 1);
      this.atk.dmg *= multiplier * (kind === 'special' ? 3 : 1) * this.damageMultiplier;
      const attackBoost = this.playerControlled && this.attackBoostT > 0 ? BeatEmUp.energyDrinkDamageMultiplier : 1;
      this.atk.dmg *= attackBoost;
      if (this.atk.chip != null) this.atk.chip *= attackBoost;
      if (kind === 'special' && !this.playerControlled) this.atk.dmg *= this.specialDamageMultiplier;
      if (linked && kind === 'kick') this.atk.dmg *= 1.25;
      this.atk.linked = linked;
      if (kind === 'special') this.atk.kb *= multiplier;
      if (Math.random() < (this.classProfile?.criticalChance ?? .1)) {
        this.atk.critical = true;
        this.atk.dmg *= this.classProfile?.criticalDamage ?? 1.6;
        this.atk.kb *= 1.2;
      }
      if (kind === 'special' && this.classProfile) {
        const hitCount = this.classProfile?.superHits || (style === 'rush' ? 2 : style === 'flame' ? 4 : style === 'ward' ? 5 : 1);
        this.atk.hitCount = hitCount;
        if (this.classProfile?.style === 'ward') {
          this.atk.superFractions = [12 / 66, 12 / 66, 18 / 66, 24 / 66];
        } else if (this.classProfile?.weapon === 'staff') {
          const m = Moves.staffSpecial;
          const stretch = 2;
          this.atk.su *= stretch;
          this.atk.ac *= stretch;
          this.atk.re *= stretch;
          this.atk.hitCount = m.hitCount;
          this.atk.hitDurations = m.hitDurations.map((n) => n * stretch);
          this.atk.hitDelays = m.hitDelays.map((n) => n * stretch);
          const total = m.hitDamages.reduce((a, b) => a + b, 0);
          this.atk.dmg = total;
          this.atk.superFractions = m.hitDamages.map(d => d / total);
        } else {
          this.atk.dmg /= hitCount;
          this.atk.chip /= hitCount;
        }
        if (this.classProfile?.weapon === 'blade') {
          this.atk.hitCount = 1;
          this.atk.dmg = BladeSuper.TOTAL_DAMAGE;
          this.atk.chip = 0;
          this.atk.superFractions = BladeSuper.STRIKES.map(strike => strike.damage / this.atk.dmg);
          this.atk.stun = BladeSuper.STUN_FRAMES;
        }
      }
    }
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = kind; this.blocking = 0;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
    if (kind === 'special') {
      const visualDuration = Game.mode === 'beatemup' && this.playerControlled
        ? this.classProfile?.superVisualDuration : 0;
      this.specialVisual = visualDuration ? {
        elapsed: 0,
        duration: visualDuration,
        finishPose: Pose.specialFinish(this.classProfile, !!this.atk?.comboFinisher, this.face),
      } : null;
      const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
      const fxStart = Fx.list.length;
      if (!(this.classProfile?.style === 'ward' && !this.classProfile?.weapon)) {
        Fx.superCharge(this.x - cameraX, this.groundY() + this.y - 44 * this.drawS(), this.classProfile);
      }
      if (this.classProfile?.weapon === 'staff') Fx.tagStaffSuper(this, fxStart);
      Sfx.play('super-charge', this.classProfile);
    } else if (kind === 'kick') Sfx.play('kick', this.classProfile);
    else Sfx.play('punch', this.classProfile);
  }
  /** Archetype multi-hit punch (e.g. Brawler jab-cross) on the shared 'punch' state. */
  startEnemyCombo(spec) {
    const ref = Atk.of('punch', 0, null, null); // the same unchained punch every enemy throws
    const w = EnemyCombo.timeline(spec);
    this.atk = {
      su: w.su, ac: w.ac, re: w.re,
      dmg: ref.dmg * this.damageMultiplier, kb: spec.hits[0].kb, stun: spec.hits[0].stun, chip: 0,
      chain: 0, kind: 'punch', reach: ref.reach, linked: false,
      combo: spec, comboWindows: w.hits, comboPulse: -1,
    };
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
    this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.specialVisual = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
    Sfx.play('punch', null);
  }
  /** Archetype committed rush (e.g. Rusher shoulder rush) on the shared 'punch' state. */
  startEnemyRush(spec) {
    const ref = Atk.of('punch', 0, null, null); // the same unchained punch every enemy throws
    const tl = EnemyRush.timeline(spec);
    this.atk = {
      su: tl.su, ac: tl.ac, re: tl.re,
      dmg: ref.dmg * this.damageMultiplier, kb: spec.kb, stun: spec.stun, chip: 0,
      chain: 0, kind: 'punch', reach: ref.reach, linked: false,
      rush: spec, rushDir: this.face, rushLeft: spec.distance, brakeLeft: spec.brake, rushHit: false,
    };
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
    this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.specialVisual = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
  }
  /** Archetype overhead slam (e.g. Heavy sledgehammer) on the shared 'punch' state. */
  startEnemySlam(spec) {
    const tl = EnemySlam.timeline(spec);
    this.atk = {
      su: tl.su, ac: tl.ac, re: tl.re,
      dmg: spec.dmg * this.damageMultiplier, kb: spec.kb, stun: spec.stun, chip: 0,
      chain: 0, kind: 'punch', reach: BossWeapons.sledgehammer.reach, linked: false, slam: spec,
    };
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
    this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.specialVisual = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
  }
  /** Archetype shield bash (Guard) on the shared 'punch' state. */
  startEnemyBash(spec) {
    const ref = Atk.of('punch', 0, null, null); // the same unchained punch every enemy throws
    const tl = EnemyBash.timeline(spec);
    this.atk = {
      su: tl.su, ac: tl.ac, re: tl.re,
      dmg: ref.dmg * this.damageMultiplier, kb: spec.kb, stun: spec.stun, chip: 0,
      chain: 0, kind: 'punch', reach: ref.reach, linked: false,
      bash: spec, bashDir: this.face, stepLeft: spec.step, bashHit: false,
    };
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
    this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.specialVisual = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
  }
  /** Archetype grab (Grappler) on the shared 'punch' state. dmg/kb/stun are the headbutt's. */
  startEnemyGrab(spec) {
    const tl = EnemyGrab.timeline(spec);
    this.atk = {
      su: tl.su, ac: tl.ac, re: tl.re,
      dmg: spec.dmg * this.damageMultiplier, kb: spec.kb, stun: spec.stun, chip: 0,
      chain: 0, kind: 'punch', reach: 0, linked: false,
      grab: spec, grabDir: this.face, stepLeft: spec.reachStep, overLeft: spec.overStep, grabHit: false, grabVictim: null, holdStart: 0, lastCheck: '',
    };
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
    this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.specialVisual = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
  }
  /** Archetype hazard deploy (Disruptor) on the shared 'punch' state. No hitbox; the zone does the damage. */
  startEnemyDeploy(spec) {
    const tl = EnemyDeploy.timeline(spec);
    this.atk = {
      su: tl.su, ac: tl.ac, re: tl.re, dmg: 0, kb: 0, stun: 0, chip: 0,
      chain: 0, kind: 'punch', reach: 0, linked: false,
      deploy: spec, deployDir: this.face, deployed: false, zone: null, backLeft: spec.backStep,
    };
    this.atkT = 0; this.hitDone = 0; this.hitConfirmed = 0; this.state = 'punch'; this.blocking = 0;
    this.chain = 0; this.chainArmed = 0; this.dashLeft = 0; this.specialVisual = null;
    this.hitTargets = new Map(); this.specialMeterTargets = new Set(); this.specialEffectDone = 0; this.specialChargeFxT = 0;
    this.atkPhase = '';
  }
  driveDeployPose(a, t) {
    const sp = a.deploy, end = a.su + a.ac + a.re;
    let key, pose, dur;
    if (t <= a.su) { key = 'dw'; pose = sp.windPose; dur = a.su; }                 // reach back for the device
    else if (t <= a.su + a.ac + 6) { key = 'da'; pose = sp.activatePose; dur = 2; } // activation: starts on the zone frame
    else if (t <= end - 10) { key = 'dr'; pose = sp.recoverPose; dur = 8; }         // step back
    else { key = 'dg'; pose = null; dur = Math.max(1, end - t); }
    if (this.atkPhase === key) return;
    const base = Pose.idle(null), guard = this.bodyProfile?.guardPose ? EnemyCombo.pose(this.bodyProfile.guardPose) : {};
    this.aim(key, pose ? { ...base, ...EnemyCombo.pose(pose) } : { ...base, ...guard }, dur * Game.STEP); this.atkPhase = key;
  }
  driveGrabPose(a, t) {
    const sp = a.grab, end = a.su + a.ac + a.re;
    let key, pose, dur;
    if (t <= a.su) { key = 'xw'; pose = sp.windPose; dur = a.su; }                                   // arms spread (tell)
    else if (!a.grabHit && t <= a.su + a.ac) { key = 'xr'; pose = sp.reachPose; dur = 3; }           // forward reach
    else if (a.grabHit && t - a.holdStart < sp.headbuttAt - sp.headbuttWind) { key = 'xh'; pose = sp.holdPose; dur = 5; }
    else if (a.grabHit && t - a.holdStart < sp.headbuttAt) { key = 'xb'; pose = sp.buttWindPose; dur = sp.headbuttWind; }
    else if (a.grabHit && t - a.holdStart < sp.headbuttAt + 8) { key = 'xs'; pose = sp.buttPose; dur = 2; }
    else if (!a.grabHit && t <= end - 14) { key = 'xm'; pose = sp.missPose; dur = 6; }               // overreach / overcommit
    else { key = 'xg'; pose = null; dur = Math.max(1, end - t); }
    if (this.atkPhase === key) return;
    const base = Pose.idle(null), guard = this.bodyProfile?.guardPose ? EnemyCombo.pose(this.bodyProfile.guardPose) : {};
    this.aim(key, pose ? { ...base, ...EnemyCombo.pose(pose) } : { ...base, ...guard }, dur * Game.STEP); this.atkPhase = key;
  }
  driveBashPose(a, t) {
    const sp = a.bash;
    let key, pose, dur;
    if (t <= a.su) { key = 'gw'; pose = sp.windPose; dur = a.su; }
    else if (t <= a.su + a.ac) { key = 'gs'; pose = sp.strikePose; dur = 2; }
    else if (!a.bashHit && t <= a.su + a.ac + a.re - 12) { key = 'gl'; pose = sp.lowPose; dur = 6; } // missed: shield dropped, open
    else { key = 'gr'; pose = null; dur = Math.max(1, a.su + a.ac + a.re - t); }               // back up to the shield-forward stance
    if (this.atkPhase === key) return;
    const base = Pose.idle(null), guard = this.bodyProfile?.guardPose ? EnemyCombo.pose(this.bodyProfile.guardPose) : {};
    this.aim(key, pose ? { ...base, ...EnemyCombo.pose(pose) } : { ...base, ...guard }, dur * Game.STEP); this.atkPhase = key;
    if (key === 'gs') Sfx.play('kick', null);
  }
  driveSlamPose(a, t) {
    const sp = a.slam;
    let key, pose, dur;
    if (t <= a.su) { key = 'hw'; pose = sp.windPose; dur = a.su; }
    else if (t <= a.su + a.ac) { key = 'hs'; pose = sp.impactPose; dur = 2; }
    else if (t <= a.su + a.ac + sp.followHold) { key = 'hf'; pose = sp.followPose; dur = 6; }
    else { key = 'hr'; pose = null; dur = Math.max(1, a.su + a.ac + a.re - t); }
    if (this.atkPhase === key) return;
    const base = Pose.idle(null), guard = this.bodyProfile?.guardPose ? EnemyCombo.pose(this.bodyProfile.guardPose) : {};
    this.aim(key, pose ? { ...base, ...EnemyCombo.pose(pose) } : { ...base, ...guard }, dur * Game.STEP); this.atkPhase = key;
    if (key === 'hs') Sfx.play('kick', null);
  }
  driveRushPose(a, t) {
    const sp = a.rush, tl = EnemyRush.timeline(sp);
    let key, pose, dur;
    if (t < tl.dashStart) { key = 'rc'; pose = sp.crouchPose; dur = sp.crouch; }
    else if (t <= a.su) { key = 'rd'; pose = sp.dashPose; dur = 3; }
    else if (t <= a.su + a.ac) { key = 'rs'; pose = sp.strikePose; dur = 2; }
    else if (!a.rushHit && t <= tl.dashEnd + 12) { key = 'rb'; pose = sp.stumblePose; dur = 6; }
    else { key = 'rr'; pose = null; dur = Math.max(1, a.su + a.ac + a.re - t); }
    if (this.atkPhase === key) return;
    const to = pose ? EnemyCombo.pose(pose)
      : this.bodyProfile?.guardPose ? { ...Pose.idle(null), ...EnemyCombo.pose(this.bodyProfile.guardPose) } : Pose.idle(null);
    this.aim(key, to, dur * Game.STEP); this.atkPhase = key;
  }
  driveComboPose(a, t) {
    const w = a.comboWindows, hits = a.combo.hits;
    for (let i = 0; i < w.length; i++) {
      const last = i === w.length - 1;
      if (t < w[i].activeStart) {
        const key = 'cw' + i;
        if (this.atkPhase !== key) { this.aim(key, EnemyCombo.pose(hits[i].windPose), Math.max(1, w[i].activeStart - 1 - t) * Game.STEP); this.atkPhase = key; }
        return;
      }
      if (t <= w[i].activeEnd) {
        const key = 'cs' + i;
        if (this.atkPhase !== key) {
          const strike = EnemyCombo.pose(hits[i].strikePose);
          this.aim(key, strike, .03); this.atkPhase = key;
          this.pose = Pose.copy(strike); this.poseFrom = Pose.copy(strike); this.poseTo = Pose.copy(strike); this.blendT = this.blendDur;
        }
        return;
      }
      if (last || t < w[i + 1].windStart) {
        const key = 'cr' + i;
        if (this.atkPhase !== key) {
          const guard = this.bodyProfile?.guardPose ? { ...Pose.idle(null), ...EnemyCombo.pose(this.bodyProfile.guardPose) } : Pose.idle(null);
          const to = last ? guard : EnemyCombo.pose(hits[i + 1].windPose);
          this.aim(key, to, hits[i].recovery * Game.STEP); this.atkPhase = key;
        }
        return;
      }
    }
  }
  canChainPunch() {
    if (!this.atk || !this.hitConfirmed || this.atk.rush || this.atk.slam || this.atk.bash || this.atk.grab || this.atk.deploy) return false;
    const a = this.atk;
    if (this.state === 'kick') {
      const total = a.su + a.ac + a.re;
      const intoRecovery = this.atkT - (a.su + a.ac);
      return this.atkT > a.su + a.ac && this.atkT < total && intoRecovery <= (a.chainWindow || Moves.kick.chainWindow);
    }
    if (this.state !== 'punch' || this.chain + 1 >= this.punchChainMax()) return false;
    if (this.atkT <= a.su + a.ac) return false;
    const intoRe = this.atkT - (a.su + a.ac);
    return intoRe <= (a.chainWindow || Moves.punch.chainWindow);
  }
  canChainHeavy() {
    if (!this.atk || this.state !== 'punch' || !this.hitConfirmed || this.atk.rush || this.atk.slam || this.atk.bash || this.atk.grab || this.atk.deploy) return false;
    const a = this.atk;
    const intoRecovery = this.atkT - (a.su + a.ac);
    return this.atkT > a.su + a.ac && this.atkT < a.su + a.ac + a.re && intoRecovery <= Moves.punch.chainWindow;
  }
  /** Staff low sweep can be pressed again for one follow-up. A press before recovery is kept until the first hit finishes. */
  staffHeavyFollowReady() {
    if (this.classProfile?.weapon !== 'staff' || this.state !== 'kick' || !this.atk || this.heavyFollow >= 1) return false;
    const a = this.atk;
    return this.atkT > a.su + a.ac && this.atkT < a.su + a.ac + a.re;
  }
  /** Karate extends the punch chain to 4 hits; Staff caps at 2; every other class keeps Moves.punch.chainMax (3). */
  punchChainMax() {
    if (this.classProfile?.weapon === 'staff') return Moves.staffPunch.chainMax;
    return this.classProfile?.style === 'ward' ? 4 : Moves.punch.chainMax;
  }
  /** Karate Roundhouse: 40px forward step spread over the windup, clamped and never crossing the foe. */
  roundhouseStep(other) {
    if (this.classProfile?.style !== 'ward' || this.state !== 'kick' || !this.atk) return 0;
    const a = this.atk;
    if (this.atkT <= 0 || this.atkT > a.su) return 0;
    const k = this.drawS() / 1.2;
    const perFrame = 40 * k / Math.max(1, a.su);
    let nx = this.x + this.face * perFrame;
    nx = Math.max(Game.minX, Math.min(Game.maxX, nx));
    if ((other.x - nx) * this.face < 42 * k) return 0;
    return nx - this.x;
  }
  /** Special pulse index for the current frame, or -1 in windup/recovery/gaps. */
  superPulse() {
    const a = this.atk;
    if (!a || this.state !== 'special') return -1;
    if (this.classProfile?.weapon === 'blade') return BladeSuper.pulseForFrame(this.atkT);
    if (this.classProfile?.style === 'ward') {
      const off = this.atkT - a.su;
      if (off === 1) return 0;
      if (off === 5) return 1;
      if (off === 11) return 2;
      if (off >= 17 && off <= 18) return 3;
      return -1;
    }
    if (this.classProfile?.weapon === 'staff' && a.hitDelays) {
      const off = this.atkT - a.su - 1;
      for (let i = 0; i < a.hitDelays.length; i++) {
        if (off >= a.hitDelays[i] && off < a.hitDelays[i] + a.hitDurations[i]) return i;
      }
      return -1;
    }
    const hitCount = a.hitCount || 1;
    return Math.min(hitCount - 1, Math.floor((this.atkT - a.su - 1) / Math.max(1, a.ac / hitCount)));
  }
  staffWeaponScale() { return Game.mode === 'beatemup' ? .8 : this.depthScale(); }
  staffDepthCoordinate(fighter = this) {
    return Game.mode === 'beatemup' ? BeatEmUp.floorDepthPx(fighter.depth) : fighter.groundY();
  }
  staffNormalAttackReach() {
    const previousPose = this.pose;
    let geometry;
    try {
      this.pose = Pose.punchStrike(true, this.classProfile, 0);
      geometry = this.weaponGeometry(this.combatBones(), true, Moves.staffPunch.front);
    } finally {
      this.pose = previousPose;
    }
    const forward = Math.max((geometry.start.x - this.x) * this.face, (geometry.tip.x - this.x) * this.face);
    return Math.max(0, forward) + 8 * this.drawS();
  }
  staffSpinRadius() {
    const b = this.combatBones();
    const gripCenterX = (b.la.x + b.ra.x) / 2;
    const visibleTipRadius = Math.abs(gripCenterX - this.x) + Fighter.STAFF_WEAPON_LENGTH * .5 * this.staffWeaponScale();
    const normalReach = this.staffNormalAttackReach();
    // Reserve one normal weapon-collider radius beyond its measured reach so
    // the circular super is unambiguously wider than the ordinary thrust.
    const normalReachMargin = 8 * this.drawS();
    return Math.max(Moves.staffSpecial.spinFront * this.staffWeaponScale(), visibleTipRadius, normalReach + normalReachMargin);
  }
  staffSlamPoint() {
    const geo = this.visualWeaponGeometry(this.combatBones());
    return geo.start.y >= geo.tip.y ? geo.start : geo.tip;
  }
  staffSpecialHitbox(pulse) {
    const depthY = this.staffDepthCoordinate();
    let centerX = this.x, radius = this.staffSpinRadius();
    if (pulse === 2) {
      const point = this.staffSlamPoint();
      centerX = point.x;
      const reach = Moves.staffSpecial.slamFront * this.staffWeaponScale();
      const effectReach = Moves.staffSpecial.slamGroundCrackReach * (this.drawS() / Fighter.S);
      radius = Math.max(0, Math.min(effectReach, reach - Math.abs(centerX - this.x)));
    }
    const fraction = this.atk.superFractions ? this.atk.superFractions[pulse] : 1;
    return {
      x:centerX, y:depthY, w:0, h:0, radial:true,
      centerX, centerDepthY:depthY, radius,
      depthTolerance:Game.mode === 'beatemup' ? BeatEmUp.DEPTH_HIT_PX : Depth.HIT_PX,
      dmg:this.atk.dmg * fraction, kb:pulse === 2 ? this.atk.kb : 0, stun:this.atk.stun, chip:this.atk.chip || 0,
      special:true, pulse, critical:!!this.atk.critical, comboFinisher:!!this.atk.comboFinisher,
      comboLink:!!this.atk.linked, chain:this.atk.chain || 0, knockdown:pulse === 2,
    };
  }
  static staffRadialHits(hit, attacker, target) {
    const targetFighter = target.f || target;
    const targetDepthY = Game.mode === 'beatemup' ? BeatEmUp.floorDepthPx(target.depth) : targetFighter.groundY();
    const laneGap = targetDepthY - hit.centerDepthY;
    const specialTolerance = Depth.specialLaneTolerance(attacker);
    const tolerance = specialTolerance ?? (Game.mode === 'beatemup'
      ? BeatEmUp.depthHitTolerance(BeatEmUp.entryFor(attacker), target.f ? target : BeatEmUp.entryFor(targetFighter))
      : Depth.hitTolerance(attacker.playerControlled));
    if (Math.abs(laneGap) > tolerance + 1e-9) return false;
    const dx = targetFighter.x - hit.centerX;
    // Player Staff Special: lanes are checked separately, so every covered lane gets full X reach.
    if (specialTolerance != null) return Math.abs(dx) <= hit.radius;
    return dx * dx + laneGap * laneGap <= hit.radius * hit.radius;
  }
  playStaffSuperPulseFx() {
    const pulse = this.superPulse();
    if (pulse < 0) { this.specialFxPulse = -1; return; }
    if (this.specialFxPulse === pulse) return;
    this.specialFxPulse = pulse;
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    const k = this.drawS() / Fighter.S;
    if (pulse < 2) {
      const b = this.combatBones();
      const centerX = this.x;
      const centerY = (b.la.y + b.ra.y) / 2;
      const geo = this.visualWeaponGeometry(b);
      const staffAngle = Math.atan2(geo.tip.y - geo.start.y, geo.tip.x - geo.start.x);
      Fx.staffSuperSpin(centerX - cameraX, centerY, this.face, k, this.staffSpinRadius(), this, staffAngle);
    } else {
      const point = this.staffSlamPoint();
      const groundY = this.groundY() + this.y;
      Fx.staffSuperSlam(point.x - cameraX, groundY, this.face, k, groundY, this);
      Game.stop = 2 / 60; Game.shake = 8 / 60; Game.shMag = 4;
    }
  }
  driveAtkPose(dt) {
    const a = this.atk, t = this.atkT;
    // Visual phases read su/ac/re from this.atk (Moves via Atk.of) — chain hits use chainSu/Ac/Re
    if (this.state === 'special') {
      if (this.bossProfile) { BossSignature.drivePose(this, dt); return; }
      if (this.classProfile?.style === 'ward') {
        if (t <= a.su) {
          if (this.atkPhase !== 'sw') { this.aim('sw', Pose.specialWind(this.classProfile, a.comboFinisher), a.su * Game.STEP); this.atkPhase = 'sw'; }
        } else if (t <= a.su + 6) {
          if (this.atkPhase !== 'kp') {
            this.aim('kp', Pose.karateSuperPunch(this.classProfile), .03); this.atkPhase = 'kp';
            Sfx.play('super-dash', this.classProfile);
          }
        } else if (t <= a.su + 13) {
          if (this.atkPhase !== 'kq') { this.aim('kq', Pose.karateSuperKickMid(this.classProfile), .05); this.atkPhase = 'kq'; }
        } else if (t <= a.su + 18) {
          if (this.atkPhase !== 'kh') { this.aim('kh', Pose.karateSuperKickHigh(this.classProfile), .05); this.atkPhase = 'kh'; }
        } else if (this.atkPhase !== 'kr') { this.aim('kr', this.specialVisual?.finishPose || Pose.idle(this.classProfile), a.re * Game.STEP); this.atkPhase = 'kr'; }
        return;
      }
      if (this.classProfile?.weapon === 'staff') {
        const staffDelays = a.hitDelays || [0, 14, 28];
        const staffDurs = a.hitDurations || [8, 8, 10];
        const staffOff = t - a.su - 1;
        const staffHit1 = staffDelays[0] + staffDurs[0] - 1;
        const staffGap = staffDelays[1] - 1;
        const staffHit2 = staffDelays[1] + staffDurs[1] - 1;
        const staffPrep = staffDelays[2] - 1;
        const staffSlam = staffDelays[2] + staffDurs[2] - 1;
        if (t <= a.su) {
          if (this.atkPhase !== 'ssw') { this.aim('ssw', Pose.staffSuperWind(this.classProfile), a.su * Game.STEP); this.atkPhase = 'ssw'; }
        } else if ((staffOff >= staffDelays[0] && staffOff <= staffHit1) || (staffOff >= staffDelays[1] && staffOff <= staffHit2)) {
          const secondSweep = staffOff >= staffDelays[1];
          const phaseStart = a.su + 1 + (secondSweep ? staffDelays[1] : staffDelays[0]);
          const frame = t - phaseStart;
          const duration = secondSweep ? staffDurs[1] : staffDurs[0];
          const progress = Math.min(1, (frame + 1) / duration);
          const turns = secondSweep ? 1.5 : 1;
          const key = `${secondSweep ? 'ss2' : 'ss1'}-${frame}`;
          if (!this.atkPhase.startsWith(secondSweep ? 'ss2-' : 'ss1-')) Sfx.play('super-dash', this.classProfile);
          this.aim(key, Pose.staffSuperSpin(this.classProfile, Math.PI * 2 * turns * progress, this.face, secondSweep), Game.STEP);
          this.atkPhase = key;
        } else if (staffOff <= staffGap) {
          if (this.atkPhase !== 'ssgap') { this.aim('ssgap', Pose.staffSuperWind(this.classProfile), Math.max(1, staffGap - staffHit1) * Game.STEP); this.atkPhase = 'ssgap'; }
        } else if (staffOff <= staffPrep) {
          if (this.atkPhase !== 'ssl-prep') {
            this.aim('ssl-prep', Pose.staffSuperSlam(this.classProfile, this.face), Math.max(1, staffPrep - staffHit2) * Game.STEP);
            this.atkPhase = 'ssl-prep'; Sfx.play('super-dash', this.classProfile);
          }
        } else if (staffOff <= staffSlam) {
          if (this.atkPhase !== 'ssl') { this.aim('ssl', Pose.staffSuperSlam(this.classProfile, this.face), .05); this.atkPhase = 'ssl'; }
        } else if (this.atkPhase !== 'sr') { this.aim('sr', this.specialVisual?.finishPose || Pose.idle(this.classProfile), a.re * Game.STEP); this.atkPhase = 'sr'; }
        return;
      }
      if (this.classProfile?.weapon === 'blade') {
        if (t <= a.su) {
          if (this.atkPhase !== 'blade-tame') { this.aim('blade-tame', Pose.specialWind(this.classProfile), a.su * Game.STEP); this.atkPhase = 'blade-tame'; }
        } else if (t <= a.su + a.ac) {
          // Single iai draw: the wind-up eases into the ready pose, the cut pose is reached on the active frames and
          // then held through the follow-through (local pose hold).
          const {part} = BladeSuper.phaseAt(t), s = BladeSuper.STRIKES[0], p = this.classProfile;
          const plan = part === 'windup' ? ['blade-draw-ready', Pose.specialWind(p), s.windup] : ['blade-draw', Pose.specialDash(p), s.active];
          if (this.atkPhase !== plan[0]) { this.aim(plan[0], plan[1], plan[2] * Game.STEP); this.atkPhase = plan[0]; }
        } else if (t < BladeSuper.SHEATH_START) {
          if (this.atkPhase !== 'blade-chiburi') { this.aim('blade-chiburi', Pose.specialWind(this.classProfile), 10 * Game.STEP); this.atkPhase = 'blade-chiburi'; }
        } else if (this.atkPhase !== 'blade-noto') { this.aim('blade-noto', Pose.idle(this.classProfile), BladeSuper.SHEATH_FRAMES * Game.STEP); this.atkPhase = 'blade-noto'; }
        return;
      }
      if (t <= a.su) {
        if (this.atkPhase !== 'sw') { this.aim('sw', Pose.specialWind(this.classProfile, a.comboFinisher), a.su * Game.STEP); this.atkPhase = 'sw'; }
      } else if (t <= a.su + a.ac) {
        if (this.atkPhase !== 'ss') {
          this.aim('ss', Pose.specialDash(this.classProfile, a.comboFinisher), .05); this.atkPhase = 'ss';
          Sfx.play('super-dash', this.classProfile);
        }
      } else if (this.atkPhase !== 'sr') { this.aim('sr', this.specialVisual?.finishPose || Pose.idle(this.classProfile), a.re * Game.STEP); this.atkPhase = 'sr'; }
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
    if (a.combo) { this.driveComboPose(a, t); return; }
    if (a.rush) { this.driveRushPose(a, t); return; }
    if (a.slam) { this.driveSlamPose(a, t); return; }
    if (a.bash) { this.driveBashPose(a, t); return; }
    if (a.grab) { this.driveGrabPose(a, t); return; }
    if (a.deploy) { this.driveDeployPose(a, t); return; }
    if (a.counter && !a.parried) { if (this.atkPhase !== 'kc') { this.aim('kc', Pose.block(null), .08); this.atkPhase = 'kc'; } return; }
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
      this.y = 0; this.vy = 0; this.grounded = true; Fx.land(this.x, this.groundY());
      this.landSquash = .08; this.aim('land', Pose.land(this.classProfile), .05);
      return true;
    }
    if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; }
    return false;
  }
  startRoll(slot, other) {
    const axis = (Input.held(slot, 'right') ? 1 : 0) - (Input.held(slot, 'left') ? 1 : 0);
    const direction = axis || (other.x >= this.x ? -1 : 1);
    this.specialVisual = null;
    Fx.clearStaffSuper(this);
    this.atk = null; this.atkT = 0; this.atkPhase = ''; this.dashLeft = 0;
    this.chain = 0; this.chainArmed = 0; this.blocking = 0;
    this.heavyFollow = 0; this.heavyQueued = false;
    this.dodgeT = .48; this.dodgeCooldown = 1.05; this.rollVx = direction * 460;
    this.state = 'roll'; this.aim('roll', Pose.roll(this.classProfile), .045);
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    Fx.dodge(this.x - cameraX, this.groundY() + this.y - 34 * this.drawS(), this.classProfile);
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
    if (this.noRegrabT > 0 || this.grabCoolT > 0) EnemyGrab.tickTimers(this, dt);
    if (this.deployCoolT > 0) this.deployCoolT = this.deployCoolT - dt > 1e-9 ? this.deployCoolT - dt : 0;
    if (this.heldBy && EnemyGrab.holdVictim(this, dt, other)) return; // held: pinned, no input, until released
    if (this.enemyGuard) EnemyGuard.tick(this, dt);
    this.updateCore(dt, other, slot);
    if (this.enemyGuard) EnemyGuard.afterUpdate(this, dt);
  }
  updateCore(dt, other, slot) {
    this.attackBoostT = Math.max(0, this.attackBoostT - dt);
    this.wardShieldT = Math.max(0, this.wardShieldT - dt);
    this.invincibleT = Math.max(0, this.invincibleT - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.damageBurstT = Math.max(0, this.damageBurstT - dt);
    if (this.damageBurstT <= 0) this.damageBurst = 0;
    if (this.flash > 0) this.flash -= dt;
    if (this.blockFlash > 0) this.blockFlash -= dt;
    if (this.chip > this.hp) this.chip = Math.max(this.hp, this.chip - (100 * dt / .3));
    this.animT += dt;
    if (this.specialVisual) this.specialVisual.elapsed += dt;
    const staffSuperActive = this.state === 'special' && this.classProfile?.weapon === 'staff' && !!this.atk;
    // Lane change input for practice (P1 only; the dummy stays put).
    if ((staffSuperActive || (this.state === 'special' && this.classProfile?.weapon === 'blade')) && this.specialOriginDepth != null) this.depth = this.specialOriginDepth;
    else if (Game.fighting && this.playerControlled && !this.ragdollActive && Game.mode === 'practice') {
      let dy = 0;
      if (Input.depthHeld('up', slot)) dy -= 1;
      if (Input.depthHeld('down', slot)) dy += 1;
      if (dy) {
        this.depth = Depth.step(this.depth, dy, dt);
      }
    }
    if (this.hp <= 0 && !this.ragdollActive) this.startRagdoll(null, true);
    if (this.ragdollActive) {
      this.updateRagdoll(dt);
      this.clamp();
      return;
    }
    if (this.stun > 0) {
      const wasAir = this.y < 0 || !this.grounded;
      const holder = this.superPinFrom;
      const pinned = this.superPinGap != null && holder?.state === 'special' && holder.classProfile?.style === 'ward' && !holder.classProfile?.weapon;
      this.stun--;
      if (pinned) { this.vx = 0; this.x = holder.x + this.superPinGap; }
      else { this.superPinGap = null; this.superPinFrom = null; this.vx *= .92; this.x += this.vx * dt; }
      this.vy += 1600 * dt; this.y += this.vy * dt;
      this.landCheck(wasAir);
      this.aim('hit', Pose.hit(this.classProfile), .05);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    const rollPressed = Input.edge(slot, 'roll');
    if (this.dodgeT > 0) {
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      this.invincibleT = Math.max(this.invincibleT, this.dodgeT);
      this.x += this.rollVx * dt;
      this.vx = this.rollVx;
      this.aim('roll', Pose.roll(this.classProfile), .04); this.tickPose(dt);
      if (this.dodgeT <= 0) { this.vx = 0; this.state = 'idle'; this.aim('idle', Pose.idle(this.classProfile), .08); }
      this.clamp(other); return;
    }
    if (rollPressed && Game.fighting && this.grounded && this.dodgeCooldown <= 0 && this.state !== 'special' && !(this.classProfile?.weapon === 'staff' && this.atk)) {
      this.startRoll(slot, other);
      this.dodgeT = Math.max(0, this.dodgeT - dt);
      this.invincibleT = Math.max(this.invincibleT, this.dodgeT);
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
      if (this.grounded && Input.edge(slot, 'kick')) {
        if (this.canChainHeavy()) {
          this.heavyFollow = 0; this.heavyQueued = false;
          this.startAtk('kick');
          this.driveAtkPose(dt);
          this.tickPose(dt);
          this.clamp(other); return;
        }
        if (this.classProfile?.weapon === 'staff' && this.state === 'kick' && this.heavyFollow < 1) this.heavyQueued = true;
      }
      if (this.heavyQueued && this.staffHeavyFollowReady()) {
        this.heavyQueued = false; this.heavyFollow = 1;
        this.startAtk('kick');
        this.driveAtkPose(dt);
        this.tickPose(dt);
        this.clamp(other); return;
      }
      this.atkT++;
      if (this.atk.bash) EnemyBash.tick(this); // fixed short shove; may shorten re on a hit
      if (this.atk.grab) EnemyGrab.tick(this, other); // reach / catch / hold / headbutt; may extend re on a catch
      if (this.atk.deploy) EnemyDeploy.tick(this, other); // zone created on the activation frame; step-back recovery
      if (this.atk.counter) BossCounter.tick(this); // unused counter stance ends at 0.8 s
      if (this.atk.rush) EnemyRush.tick(this); // fixed-distance dash / braking skid; may shorten re on a hit
      const a = this.atk, tot = a.su + a.ac + a.re;
      if (a.combo) {
        // Each hit of an enemy string may land once: re-arm when the next hit's active window opens.
        const pulse = EnemyCombo.pulseAt(a, this.atkT);
        if (pulse >= 0 && pulse !== a.comboPulse) { this.hitDone = 0; a.comboPulse = pulse; }
      }
      if (this.bladeSuper) {
        this.x = this.bladeSuper.originX; this.depth = this.bladeSuper.depth; this.vx = 0;
        BladeSuper.frame(this.bladeSuper, this.atkT);
        if (this.atkT === BladeSuper.LAUNCH_FRAME) BladeSuper.launch(this.bladeSuper);
        if (this.atkT === a.su + a.ac + a.re) BladeSuper.noto(this.bladeSuper);
      }
      if (this.state === 'special' && this.atkT <= a.su && !(this.classProfile?.style === 'ward' && !this.classProfile?.weapon)) {
        this.specialChargeFxT -= dt;
        if (this.specialChargeFxT <= 0) {
          const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
          const progress = Math.min(1, this.atkT / a.su);
          const fxStart = Fx.list.length;
          Fx.chargePulse(this.x - cameraX, this.groundY() + this.y - 44 * this.drawS(), this.classProfile, progress);
          if (this.classProfile?.weapon === 'staff') Fx.tagStaffSuper(this, fxStart);
          this.specialChargeFxT = .14;
        }
      }
      this.driveAtkPose(dt);
      this.tickPose(dt);
      if (this.bossProfile && this.state === 'special') BossSignature.update(this, dt);
      this.x += this.roundhouseStep(other);
      if (this.state === 'special' && this.classProfile?.weapon === 'staff') {
        if (this.specialOriginX != null) this.x = this.specialOriginX;
        this.vx = 0;
        this.playStaffSuperPulseFx();
      } else if (this.state === 'special' && this.classProfile?.weapon === 'blade') {
        this.x = this.bladeSuper?.originX ?? this.x; this.vx = 0;
      } else if (this.state === 'special' && this.atkT > a.su && this.atkT <= a.su + a.ac && this.dashLeft > 0) {
        const step = this.dashLeft / Math.max(1, a.su + a.ac - this.atkT + 1);
        const move = Math.min(step, this.dashLeft);
        this.x += this.face * move; this.dashLeft -= move; this.vx = 0;
        this.moveGround(dt, slot, .18);
        const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
        Fx.superTrail(this.x - cameraX, this.groundY() + this.y - 58 * this.drawS(), this.face, this.classProfile);
      } else if (a.rush) this.vx = 0; // rush travel comes only from EnemyRush.tick (bounded); no steering
      else if (a.slam) this.vx = 0; // planted for the whole slam
      else if (a.bash) this.vx = 0; // bash travel only from EnemyBash.tick (bounded)
      else if (a.grab) this.vx = 0; // grab travel only from EnemyGrab.tick (bounded)
      else if (a.deploy) this.vx = 0; // step-back only from EnemyDeploy.tick (bounded)
      else this.moveGround(dt, slot, this.state === 'special' ? .25 : this.state === 'kick' ? .36 : .52);
      const wasAir = this.y < 0 || !this.grounded;
      this.vy += 1600 * dt; this.y += this.vy * dt;
      this.landCheck(wasAir);
      if (this.atkT >= tot) {
        // Chain only continues after a connected punch; whiff clears the string (AC2)
        if (this.state === 'punch' && this.hitDone && !a.combo && this.chain + 1 < this.punchChainMax())
          this.chainArmed = Moves.punch.chainWindow;
        else { this.chain = 0; this.chainArmed = 0; }
        if (this.classProfile?.weapon === 'staff' && this.state === 'special') Fx.clearStaffSuper(this);
        this.heavyFollow = 0; this.heavyQueued = false;
        this.atk = null; this.state = 'idle'; this.dashLeft = 0; this.atkPhase = '';
        if (this.classProfile?.weapon === 'blade') this.bladeSuper = null;
        this.specialOriginX = null; this.specialOriginDepth = null; this.specialFxPulse = -1;
      }
      // Blade tracks the foe through the charge and the draw wind-up, then locks facing for the slash and the Wave.
      if (this.bladeSuper && this.atkT < BladeSuper.FACE_LOCK_FRAME) this.bladeSuper.face = this.face = other.x >= this.x ? 1 : -1;
      else if (this.atk && this.state === 'special' && this.classProfile?.weapon === 'blade') this.face = this.bladeSuper?.face ?? this.face;
      else if (this.atk && a.bash) this.face = a.bashDir; // locked at bash start
      else if (this.atk && a.grab) this.face = a.grabDir; // committed: locked at grab start
      else if (this.atk && a.deploy) this.face = a.deployDir; // locked at deploy start
      else if (this.atk && a.rush) this.face = a.rushDir; // committed: direction locked at rush start
      else if (this.atk && a.slam) { if (this.atkT <= a.su) this.face = other.x >= this.x ? 1 : -1; } // track in wind-up, lock from the swing
      else if (this.atk && (this.state !== 'special' || this.atkT <= a.su)) this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    if (this.enemyThrowPose) {
      const tp = this.bodyProfile?.throwPoses, key = 'enemy-throw-' + this.enemyThrowPose;
      const pose = tp ? { ...Pose.idle(null), ...EnemyCombo.pose(tp[this.enemyThrowPose]) }
        : this.enemyThrowPose === 'windup' ? Pose.throwWindup()
          : this.enemyThrowPose === 'release' ? Pose.throwRelease() : Pose.throwRecovery();
      this.vx = 0; this.state = 'idle';
      if (tp && this.enemyThrowPose === 'release' && this.poseKey !== key) {
        // Release is snapped on the exact frame EnemyProjectile.launch spawns the kunai (same AI tick, before this update).
        this.aim(key, pose, .04); this.pose = Pose.copy(pose); this.poseFrom = Pose.copy(pose); this.poseTo = Pose.copy(pose); this.blendT = this.blendDur; this.punchSoft = 0;
      } else this.aim(key, pose, tp ? (this.bodyProfile.throwBlend?.[this.enemyThrowPose] ?? .1) : .1);
      this.tickPose(dt);
      this.face = other.x >= this.x ? 1 : -1;
      this.clamp(other); return;
    }
    if (this.specialVisual) {
      const edgePending = action => (Input.held(slot, action) || !!Input.tapped[slot][action]) && !Input.was[slot][action];
      const cancelFinish = Input.held(slot, 'left') || Input.held(slot, 'right')
        || Input.depthHeld('up', slot) || Input.depthHeld('down', slot)
        || edgePending('punch') || edgePending('kick') || edgePending('special');
      if (cancelFinish) { this.specialVisual = null; Fx.clearStaffSuper(this); }
      else {
        const remaining = this.specialVisual.duration - this.specialVisual.elapsed;
        this.state = 'idle'; this.vx = 0;
        if (remaining <= 0.12) {
          this.specialVisual = null;
          Fx.clearStaffSuper(this);
          this.aim('idle', Pose.idle(this.classProfile), Math.max(Game.STEP, remaining));
        } else {
          this.aim('special-finish', this.specialVisual.finishPose, Math.min(.12, remaining));
        }
        this.tickPose(dt);
        this.clamp(other); return;
      }
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
    const { ax, speedRatio } = this.moveGround(dt, slot);
    if (this.grounded && (ax !== 0 || speedRatio > .04)) {
      this.walkT += dt * speedRatio;
      this.walkPx = (this.walkPx || 0) + Math.abs(this.vx) * dt;
      this.state = 'walk';
    } else if (this.grounded) {
      this.walkT = 0; this.walkPx = 0; this.state = 'idle';
    }
    const specialPressed = Input.edge(slot, 'special');
    const punchPressed = Input.edge(slot, 'punch');
    const kickPressed = Input.edge(slot, 'kick');
    if (this.grounded && specialPressed) this.startAtk('special');
    else if (this.grounded && punchPressed) this.startAtk('punch');
    else if (this.grounded && kickPressed) { this.heavyFollow = 0; this.heavyQueued = false; this.startAtk('kick'); }
    if (this.atk) { this.driveAtkPose(dt); this.tickPose(dt); this.clamp(other); return; }
    const wasAir = this.y < 0 || !this.grounded;
    this.vy += 1600 * dt; this.y += this.vy * dt;
    this.landCheck(wasAir);
    this.face = other.x >= this.x ? 1 : -1;
    if (this.state === 'walk') {
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
    const sizeMul = Game.mode === 'beatemup' ? BeatEmUp.baseS / 1.5 : this.depthScale();
    const hitW = 42 * sizeMul, hitH = 135 * sizeMul;
    this.hitbox.x = this.x - hitW / 2; this.hitbox.y = this.groundY() + this.y - hitH; this.hitbox.w = hitW; this.hitbox.h = hitH;
  }
  strike() {
    if (!this.atk || (this.hitDone && this.state !== 'special')) return null;
    const a = this.atk;
    if (a.deploy) return null; // deploys never produce a hitbox; the shock zone resolves its own zap
    if (a.grab) return null; // grabs never produce a hitbox; catch + headbutt are resolved in EnemyGrab
    if (this.atkT <= a.su || this.atkT > a.su + a.ac) return null;
    if (this.bossProfile && this.state === 'special') return BossSignature.strike(this, this.superPulse());
    if (a.bash && this.state === 'punch') {
      const bx = EnemyBash.box(this); // rig-constant box in front; the drawn shield is never a hitbox
      return {...bx, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:0, special:false, critical:false, comboFinisher:false, comboLink:false, chain:0, bash:true};
    }
    if (a.slam && this.state === 'punch') {
      // Hands -> hammer tip only; the segment ends at the tip (plus the head radius), nothing beyond.
      const g = EnemySlam.geometry(this), start = g.start, end = g.tip, r = g.r;
      return {x:Math.min(start.x,end.x)-r, y:Math.min(start.y,end.y)-r, w:Math.abs(end.x-start.x)+r*2, h:Math.abs(end.y-start.y)+r*2,
        segment:{x1:start.x,y1:start.y,x2:end.x,y2:end.y,r}, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:0, special:false, critical:false,
        comboFinisher:false, comboLink:false, chain:0, slam:true};
    }
    if (a.rush && this.state === 'punch') {
      // Shoulder box ahead of the chest; only reachable on the live (last) dash frames, gated above.
      const b = this.combatBones(), s = this.drawS(), r = 20 * this.depthScale();
      const cx = b.sh.x + a.rushDir * 18 * s, cy = b.sh.y + 8 * s;
      return {x:cx - r, y:cy - r, w:r * 2, h:r * 2, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:0, special:false, critical:false, comboFinisher:false, comboLink:false, chain:0, rush:true};
    }
    if (a.combo && this.state === 'punch') {
      const pulse = EnemyCombo.pulseAt(a, this.atkT);
      if (pulse < 0) return null;
      const h = a.combo.hits[pulse], b = this.combatBones(), tip = b.ra, r = 18 * this.depthScale();
      return {x:tip.x - r, y:tip.y - r, w:r * 2, h:r * 2, dmg:a.dmg * h.fraction, kb:h.kb, stun:h.stun, chip:0, special:false, critical:false, comboFinisher:false, comboLink:false, chain:0, comboPulse:pulse};
    }
    if (this.state === 'special' && this.classProfile?.weapon === 'blade') {
      const pulse = this.superPulse();
      if (pulse < 0) return null;
      const geometry = this.weaponGeometry(this.combatBones(), true); // the drawn blade on the iai cut
      if (!geometry) return null;
      const r = 10 * this.drawS(), start = geometry.start, end = geometry.tip;
      return {
        x:Math.min(start.x,end.x)-r, y:Math.min(start.y,end.y)-r,
        w:Math.abs(end.x-start.x)+r*2, h:Math.abs(end.y-start.y)+r*2,
        segment:{x1:start.x,y1:start.y,x2:end.x,y2:end.y,r}, dmg:BladeSuper.STRIKES[pulse].damage, kb:a.kb,
        stun:a.stun, chip:0, special:true, pulse, critical:!!a.critical,
        comboFinisher:!!a.comboFinisher, comboLink:!!a.linked, chain:0, deferKnockdown:true,
      };
    }
    if (this.state === 'special' && this.classProfile?.weapon === 'staff') {
      const pulse = this.superPulse();
      return pulse < 0 ? null : this.staffSpecialHitbox(pulse);
    }
    const weapon = this.classProfile?.weapon || this.weaponType;
    const weaponAttack = weapon && (this.state === 'special' || this.state === 'punch' || (this.state === 'kick' && (weapon === 'staff' || weapon === 'blade' || weapon === 'stick' || weapon === 'knife' || (BossWeapons[weapon] && BossWeapons[weapon].kick !== 'foot'))));
    if (weaponAttack) {
      const geometry = this.weaponGeometry(this.combatBones(), true);
      if (geometry) {
        const r = (weapon === 'staff' || weapon === 'stick' ? 8 : 7) * this.drawS();
        const {start,end} = {start:geometry.start,end:geometry.tip};
        const segment = {x1:start.x,y1:start.y,x2:end.x,y2:end.y,r};
        const x = Math.min(start.x,end.x) - r, y = Math.min(start.y,end.y) - r;
        const w = Math.abs(end.x - start.x) + r * 2, h = Math.abs(end.y - start.y) + r * 2;
        const common = {x,y,w,h,segment,dmg:a.dmg,kb:a.kb,stun:a.stun,chip:a.chip || 0,special:this.state === 'special',critical:!!a.critical,comboFinisher:!!a.comboFinisher,comboLink:!!a.linked,chain:a.chain || 0,knockdown:!!a.knockdown};
        if (this.state === 'special') {
          common.pulse = this.superPulse();
          if (weapon === 'staff' && a.superFractions) {
            // Gap frames between staff pulses have no pulse index; without this guard the
            // collider stays live with `a.dmg * undefined` = NaN and poisons the foe's HP.
            if (common.pulse < 0) return null;
            common.dmg = a.dmg * a.superFractions[common.pulse];
            common.knockdown = common.pulse === 2;
          }
        }
        return common;
      }
    }
    if (this.state === 'special') {
      const pulse = this.superPulse();
      if (this.classProfile?.style === 'ward') {
        if (pulse < 0) return null;
        const b = this.combatBones();
        const r = 18 * this.depthScale();
        const kick = pulse >= 2;
        const tip = kick ? b.ll : b.ra;
        const lead = kick ? 34 * this.drawS() : 0;
        const cx = tip.x + this.face * lead;
        const last = (a.superFractions ? a.superFractions.length : 4) - 1;
        return {
          x: cx - r, y: tip.y - r, w: r * 2, h: r * 2,
          dmg: a.dmg * (a.superFractions ? a.superFractions[pulse] : 1), kb: pulse < last ? 0 : a.kb, stun: a.stun, chip: a.chip || 0,
          special: true, pulse, critical: !!a.critical, comboFinisher: !!a.comboFinisher, comboLink: !!a.linked, chain: a.chain || 0,
          knockdown: pulse === last,
        };
      }
      const style = this.classProfile?.style || 'rush';
      const ds = this.drawS();
      const classShapes = {
        rush:{w:170 * ds,h:100 * ds,lead:16 * ds},
        flame:{w:190 * ds,h:122 * ds,lead:8 * ds},
        flash:{w:Game.W * .2,h:105 * ds,lead:10 * ds},
        quake:{w:Game.W * .22,h:62 * ds,lead:0},
        ward:{w:155 * ds,h:150 * ds,lead:10 * ds},
        staff:{w:245 * ds,h:118 * ds,lead:32 * ds},
        blade:{w:190 * ds,h:126 * ds,lead:20 * ds},
      }[this.classProfile?.weapon || style];
      const shapes = this.classProfile ? classShapes : {w:150 * ds,h:112 * ds,lead:18 * ds};
      const {w,h,lead} = shapes;
      return {
        x: this.face > 0 ? this.x + lead : this.x - w - lead,
        y: this.groundY() + this.y - h,
        w, h, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:a.chip || 0, special:true, pulse, critical:!!a.critical, comboFinisher:!!a.comboFinisher, comboLink:!!a.linked, chain:a.chain || 0,
      };
    }
    const b = this.combatBones(), tip = (this.state === 'kick' || this.state === 'special') ? b.ll : b.ra;
    const r = (this.state === 'special' ? 22 : 18) * this.depthScale();
    const heavyLead = this.state === 'kick' ? 30 * this.drawS() : 0;
    const endX = tip.x + this.face * heavyLead;
    return {x:Math.min(tip.x, endX) - r, y:tip.y - r, w:Math.abs(endX - tip.x) + r * 2, h:r * 2, dmg:a.dmg, kb:a.kb, stun:a.stun, chip:a.chip || 0, special:this.state === 'special', critical:!!a.critical, comboFinisher:!!a.comboFinisher, comboLink:!!a.linked, chain:a.chain || 0};
  }
  takeHit(atk, from) {
    if (this.heldBy && from !== this.heldBy) return 'held'; // only the holder's headbutt reaches a held player
    if (this.dodgeT > 0) return 'evade';
    if (this.playerControlled && this.invincibleT > 0) return 'invulnerable';
    if (BossCounter.parries(this, from)) return BossCounter.parry(this, atk, from); // Kage counter stance: no damage, riposte
    if (atk.special && !this.grounded) return 'evade';
    if (this.enemyGuard && EnemyGuard.blocks(this, atk, from)) return EnemyGuard.block(this, atk, from); // frontal same-lane normal: 0 damage
    if (this.enemyGuard) { this.guardBlocks = 0; this.guardChainT = 0; }
    const chargingSpecial = this.state === 'special' && this.atk && this.atkT <= this.atk.su;
    const frontal = (from.x - this.x) * this.face > 0;
    const warded = this.wardShieldT > 0 && this.classProfile?.style === 'ward';
    if (this.atk?.armored && this.atkT <= this.atk.su) {
      const hpBefore = this.hp;
      this.hp = Math.max(0, this.hp - atk.dmg * .5 * (warded ? .55 : 1));
      this.flash = .08;
      Sfx.play('hit', this.classProfile);
      this.recordDamage(hpBefore - this.hp, from, !!atk.deferKnockdown);
      return 'armored';
    }
    if (!this.playerControlled && this.blocking && frontal && (!atk.special || atk.blockable) && !(atk.guardBreak && frontal)) {
      Sfx.play('block', this.classProfile);
      const dmg = (atk.special ? atk.chip : atk.dmg * .2) * (warded ? .55 : 1);
      const hpBefore = this.hp;
      this.hp = Math.max(0, this.hp - dmg); this.flash = .08; this.blockFlash = .12;
      this.vx = Math.sign(this.x - from.x) * atk.kb * .25;
      this.recordDamage(hpBefore - this.hp, from, !!atk.deferKnockdown);
      return 'block';
    }
    if (this.grabVictim) EnemyGrab.release(this.grabVictim, 'holder-hit'); // a landed hit on a Grappler frees its victim
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - atk.dmg * (warded ? .55 : 1)); this.flash = .08;
    if (chargingSpecial) {
      this.damageBurst = 0; this.damageBurstT = 0;
      Sfx.play('hit', this.classProfile);
      if (this.hp <= 0) this.startRagdoll(from, true);
      return 'armored';
    }
    this.stun = atk.stun;
    if (this.classProfile?.weapon === 'staff' && this.state === 'special') {
      Fx.clearStaffSuper(this);
      this.specialOriginX = null; this.specialOriginDepth = null; this.specialFxPulse = -1;
    }
    this.specialVisual = null;
    if (warded) {
      const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
      Fx.wardGuard(this.x - cameraX, this.groundY() + this.y - 54 * this.drawS(), this.classProfile);
      Sfx.play('block', this.classProfile);
    }
    Sfx.play('hit', this.classProfile);
    const push = Math.sign(this.x - from.x) || (from?.face || 1);
    const karateHold = atk.special && from?.classProfile?.style === 'ward' && !from.classProfile?.weapon && !atk.knockdown;
    if (karateHold) { this.vx = 0; if (this.superPinGap == null) this.superPinGap = this.x - from.x; this.superPinFrom = from; }
    else { this.superPinGap = null; this.superPinFrom = null; this.vx = push * atk.kb; }
    if (this.state === 'special' && this.classProfile?.weapon === 'blade') this.bladeSuper = null;
    this.atk = null; this.blocking = 0; this.dashLeft = 0;
    this.heavyFollow = 0; this.heavyQueued = false;
    this.atkPhase = '';
    this.state = 'hit';
    this.recordDamage(hpBefore - this.hp, from, !!atk.deferKnockdown);
    const knockdown = atk.knockdown || (!atk.special && atk.chain === 3);
    if (knockdown && !(Game.mode === 'practice' && !this.playerControlled)) this.startRagdoll(from, false);
    return 'hit';
  }
  recordDamage(amount, from, deferKnockdown = false) {
    if (amount <= 0) return;
    if (this.damageBurstT <= 0) this.damageBurst = 0;
    this.damageBurst += amount;
    this.damageBurstT = 1.6;
    if (this.hp <= 0 && !(Game.mode === 'practice' && !this.playerControlled)) this.startRagdoll(from, true);
    // Karate super: P and QK must not trigger the burst knockdown, so the HK (which knocks down itself) can land.
    // Staff super: same rule for both spins, so only the Dragon Slam knocks down.
    else if (!deferKnockdown && !this.ragdollActive && this.damageBurst >= 30 && !(Game.mode === 'practice' && !this.playerControlled)
      && !(from?.state === 'special' && (from.classProfile?.style === 'ward' || from.classProfile?.weapon === 'staff')
        && from.superPulse() >= 0 && from.superPulse() < (from.atk?.superFractions?.length || 3) - 1)) {
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
    Fx.clearStaffSuper(this);
    this.specialOriginX = null; this.specialOriginDepth = null; this.specialFxPulse = -1;
    this.specialVisual = null;
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
      if (this.y >= 0) { this.y = 0; this.vy = 0; this.grounded = true; Fx.land(this.x, this.groundY()); }
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
    (this.state === 'special' || this.state === 'punch' || this.state === 'kick')), staffFrontOverride = null) {
    const weapon = this.classProfile?.weapon || this.weaponType;
    if (!weapon) return null;
    if (this.atk?.slam && this.state === 'punch') { const g = EnemySlam.geometry(this); return { start: g.start, tip: g.tip }; }
    const hand = b.ra, face = this.face;
    const reachMul = Game.mode === 'beatemup' ? 1 : this.depthScale();
    if (weapon === 'stick') {
      const start = {x:hand.x - face * 5 * reachMul,y:hand.y + 12 * reachMul};
      return {start,tip:active
        ? {x:hand.x + face * (this.state === 'kick' ? 94 : 106) * reachMul,y:hand.y - 22 * reachMul}
        : {x:hand.x + face * 18 * reachMul,y:hand.y - 66 * reachMul}};
    }
    if (weapon === 'knife') {
      const start = {x:hand.x + face * 4 * reachMul,y:hand.y + 2 * reachMul};
      return {start,tip:active
        ? {x:hand.x + face * (this.state === 'kick' ? 50 : 56) * reachMul,y:hand.y - 18 * reachMul}
        : {x:hand.x + face * 27 * reachMul,y:hand.y - 9 * reachMul}};
    }
    if (weapon === 'staff') {
      // Build the staff shaft through both hands, then extend it past each grip.
      // This keeps idle, thrust, heavy sweep, and super spin/slam collision on the drawn weapon.
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
      const arcadeSize = Game.mode === 'beatemup' ? .8 : 1 * reachMul;
      const back = 50 * arcadeSize;
      let front;
      if (active && this.state === 'special') {
        const pulse = this.superPulse();
        front = (pulse === 2 ? Moves.staffSpecial.slamFront : Moves.staffSpecial.spinFront) * arcadeSize;
      } else if (active && this.state === 'kick') {
        front = Moves.staffKick.front * arcadeSize;
      } else {
        front = Moves.staffPunch.front * arcadeSize;
      }
      if (staffFrontOverride != null) front = staffFrontOverride * arcadeSize;
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
        return {start:{x:hand.x - face * 10 * reachMul,y:hand.y + 8 * reachMul},tip:{x:hand.x + face * cut.x * reachMul,y:hand.y + cut.y * reachMul}};
      }
      return {start:grip,tip:{x:grip.x + face * 22 * reachMul,y:grip.y - 82}};
    }
    const bossWeapon = BossWeapons[weapon];
    if (bossWeapon) {
      const reach = bossWeapon.reach * reachMul;
      const start = { x: hand.x - face * 4 * reachMul, y: hand.y + 6 * reachMul };
      if (weapon === 'anchorChain') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 12 * reachMul }
          : { x: hand.x + face * 38 * reachMul, y: hand.y - 44 * reachMul } };
      }
      if (weapon === 'cleavers') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 16 * reachMul }
          : { x: hand.x + face * 22 * reachMul, y: hand.y - 70 * reachMul } };
      }
      if (weapon === 'sledgehammer') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 22 * reachMul }
          : { x: hand.x + face * 18 * reachMul, y: hand.y - 82 * reachMul } };
      }
      if (weapon === 'shieldBaton') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 10 * reachMul }
          : { x: hand.x + face * 20 * reachMul, y: hand.y - 66 * reachMul } };
      }
      if (weapon === 'crossbow') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 6 * reachMul }
          : { x: hand.x + face * 40 * reachMul, y: hand.y - 8 * reachMul } };
      }
      if (weapon === 'naginata') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 14 * reachMul }
          : { x: hand.x + face * 26 * reachMul, y: hand.y - 96 * reachMul } };
      }
      if (weapon === 'girder') {
        const r = this.state === 'kick' ? reach * bossWeapon.shoveMul : reach;
        return { start, tip: active
          ? { x: hand.x + face * r, y: hand.y - 18 * reachMul }
          : { x: hand.x + face * 30 * reachMul, y: hand.y - 90 * reachMul } };
      }
      if (weapon === 'shockBaton') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 8 * reachMul }
          : { x: hand.x + face * 16 * reachMul, y: hand.y - 64 * reachMul } };
      }
      if (weapon === 'twinBlades') {
        return { start, tip: active
          ? { x: hand.x + face * reach, y: hand.y - 14 * reachMul }
          : { x: hand.x + face * 24 * reachMul, y: hand.y - 68 * reachMul } };
      }
      // knuckles, gauntlets and fallback boss weapons
      return { start, tip: active
        ? { x: hand.x + face * reach, y: hand.y - 10 * reachMul }
        : { x: hand.x + face * 18 * reachMul, y: hand.y - 62 * reachMul } };
    }
    return active
      ? {start:{x:hand.x - face * 10 * reachMul,y:hand.y + 8 * reachMul},tip:{x:hand.x + face * 82 * reachMul,y:hand.y - 18 * reachMul}}
      : {start:{x:hand.x - face * 8 * reachMul,y:hand.y + 12 * reachMul},tip:{x:hand.x + face * 24 * reachMul,y:hand.y - 82 * reachMul}};
  }
  visualWeaponGeometry(b) {
    const weapon = this.classProfile?.weapon || this.weaponType;
    if (weapon !== 'staff') return this.weaponGeometry(b);

    // Hit geometry varies with move reach. Keep the rendered staff rigid by
    // deriving its angle from the two grips, then drawing a fixed-length shaft
    // around their midpoint; combat continues to use weaponGeometry().
    const leftGrip = b.la, rightGrip = b.ra;
    let dx = leftGrip.x - rightGrip.x, dy = leftGrip.y - rightGrip.y;
    let gripSpan = Math.hypot(dx, dy);
    if (gripSpan < 10) {
      dx = Math.cos(this.state === 'kick' ? .72 : 0);
      dy = Math.sin(this.state === 'kick' ? .72 : 0);
      gripSpan = 1;
    }
    const ux = dx / gripSpan, uy = dy / gripSpan;
    const center = {x:(leftGrip.x + rightGrip.x) / 2, y:(leftGrip.y + rightGrip.y) / 2};
    const scale = Game.mode === 'beatemup' ? .8 : this.depthScale();
    const halfLength = Fighter.STAFF_WEAPON_LENGTH * .5 * scale;
    return {
      start: {x:center.x - ux * halfLength, y:center.y - uy * halfLength},
      tip: {x:center.x + ux * halfLength, y:center.y + uy * halfLength},
    };
  }
  drawWeapon(ctx, b) {
    const weapon = this.classProfile?.weapon || this.weaponType;
    if (!weapon) return;
    const {start,tip} = this.visualWeaponGeometry(b);
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
      const arcadeSize = (Game.mode === 'beatemup' ? .8 : 1) * (Game.mode === 'beatemup' ? 1 : this.depthScale());
      ctx.strokeStyle = '#171D27'; ctx.lineWidth = 11 * arcadeSize;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#8998AA'; ctx.lineWidth = 7 * arcadeSize;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#DCE6F2'; ctx.lineWidth = 1.5 * arcadeSize;
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.strokeStyle = '#CBD5E1'; ctx.lineWidth = 2.5 * arcadeSize;
      for (const p of [start,tip]) { ctx.beginPath(); ctx.arc(p.x,p.y,4 * arcadeSize,0,Math.PI*2); ctx.stroke(); }
    } else if (BossWeapons[weapon]) {
      // Slam: the drawn handle starts in the drawn hand; the head sits on the gameplay tip.
      this.drawBossWeapon(ctx, b, weapon, this.atk?.slam && this.state === 'punch' ? b.ra : start, tip);
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
    if (this.weaponFlashT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.weaponFlashT / .15);
      ctx.strokeStyle = this.weaponFlashColor || '#FFFFFF';
      ctx.lineWidth = 6 * this.drawS();
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  drawBossWeapon(ctx, b, weapon, start, tip) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (weapon === 'knuckles') {
      const hand = b.ra, f = this.face, s = this.drawS();
      ctx.fillStyle = '#C9A227'; ctx.strokeStyle = '#3D3118'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 8 * s;
        ctx.beginPath(); ctx.arc(hand.x + f * ox, hand.y - 2 * s, 5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    } else if (weapon === 'anchorChain') {
      ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(start.x, start.y);
      if (this.sigHooked && this.sigTarget) {
        const tb = this.sigTarget.bones ? this.sigTarget.bones() : null;
        if (tb) ctx.lineTo(tb.chest.x, tb.chest.y);
        else ctx.lineTo(tip.x, tip.y);
      } else ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = '#4B5563'; ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 10 * this.drawS(), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (weapon === 'cleavers') {
      const f = this.face, s = this.drawS();
      ctx.fillStyle = '#D1D5DB'; ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i += 2) {
        ctx.save();
        ctx.translate(tip.x, tip.y);
        ctx.rotate(i * .35);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(f * 22 * s, -4 * s); ctx.lineTo(f * 18 * s, 14 * s); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    } else if (weapon === 'sledgehammer') {
      const f = this.face, s = this.drawS();
      ctx.strokeStyle = '#4B3621'; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.fillStyle = '#9CA3AF'; ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 3;
      const hw = 18 * s, hh = 12 * s;
      ctx.fillRect(tip.x - hw / 2, tip.y - hh, hw, hh * 2); ctx.strokeRect(tip.x - hw / 2, tip.y - hh, hw, hh * 2);
    } else if (weapon === 'shieldBaton') {
      const f = this.face, s = this.drawS();
      const sh = b.la;
      ctx.fillStyle = '#1F2937'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sh.x - f * 4 * s, sh.y + 6 * s, 16 * s, 24 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.moveTo(sh.x - f * 4 * s, sh.y - 14 * s); ctx.lineTo(sh.x - f * 4 * s, sh.y + 26 * s); ctx.stroke();
      ctx.strokeStyle = '#E5E7EB'; ctx.lineWidth = 5 * s;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    } else if (weapon === 'crossbow') {
      const s = this.drawS(), dx = tip.x - start.x, dy = tip.y - start.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      ctx.strokeStyle = '#2B2F3A'; ctx.lineWidth = 6 * s;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      const bx = tip.x - dx / len * 10 * s, by = tip.y - dy / len * 10 * s, bw = 20 * s;
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(bx + nx * bw, by + ny * bw); ctx.quadraticCurveTo(tip.x, tip.y, bx - nx * bw, by - ny * bw); ctx.stroke();
      ctx.strokeStyle = '#FF3B47'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx + nx * bw, by + ny * bw); ctx.lineTo(bx - dx / len * 14 * s, by - dy / len * 14 * s); ctx.lineTo(bx - nx * bw, by - ny * bw); ctx.stroke();
    } else if (weapon === 'naginata') {
      const s = this.drawS(), dx = tip.x - start.x, dy = tip.y - start.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const bladeLen = Math.min(34 * s, len * .3), base = { x: tip.x - ux * bladeLen, y: tip.y - uy * bladeLen };
      ctx.strokeStyle = '#3B2A1E'; ctx.lineWidth = 5 * s;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(base.x, base.y); ctx.stroke();
      ctx.fillStyle = '#E5E7EB'; ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(base.x - uy * 5 * s, base.y + ux * 5 * s);
      ctx.quadraticCurveTo(base.x + ux * bladeLen * .6 - uy * 9 * s, base.y + uy * bladeLen * .6 + ux * 9 * s, tip.x, tip.y);
      ctx.lineTo(base.x + uy * 4 * s, base.y - ux * 4 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#B91C1C'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(base.x - uy * 7 * s, base.y + ux * 7 * s); ctx.lineTo(base.x + uy * 7 * s, base.y - ux * 7 * s); ctx.stroke();
    } else if (weapon === 'shockBaton') {
      const s = this.drawS();
      ctx.strokeStyle = '#111827'; ctx.lineWidth = 7 * s;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 3 * s;
      const mx = start.x + (tip.x - start.x) * .7, my = start.y + (tip.y - start.y) * .7;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.fillStyle = '#E0F2FE'; ctx.beginPath(); ctx.arc(tip.x, tip.y, 4 * s, 0, Math.PI * 2); ctx.fill();
    } else if (weapon === 'twinBlades') {
      const s = this.drawS(), dx = tip.x - start.x, dy = tip.y - start.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      for (const o of [0, 9 * s]) {
        ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 6 * s;
        ctx.beginPath(); ctx.moveTo(start.x + nx * o, start.y + ny * o); ctx.lineTo(tip.x + nx * o * .4, tip.y + ny * o * .4); ctx.stroke();
        ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.moveTo(start.x + nx * o + dx * .2, start.y + ny * o + dy * .2); ctx.lineTo(tip.x + nx * o * .4, tip.y + ny * o * .4); ctx.stroke();
      }
    } else if (weapon === 'gauntlets') {
      const s = this.drawS();
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#3F2E07'; ctx.lineWidth = 3;
      for (const h of [b.la, b.ra]) { ctx.beginPath(); ctx.roundRect(h.x - 8 * s, h.y - 8 * s, 16 * s, 16 * s, 4 * s); ctx.fill(); ctx.stroke(); }
    } else if (weapon === 'girder') {
      const s = this.drawS(), dx = tip.x - start.x, dy = tip.y - start.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len * 9 * s, ny = dx / len * 9 * s;
      ctx.fillStyle = '#B45309'; ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(start.x + nx, start.y + ny); ctx.lineTo(tip.x + nx, tip.y + ny); ctx.lineTo(tip.x - nx, tip.y - ny); ctx.lineTo(start.x - nx, start.y - ny); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#78350F'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      for (let k = 1; k < 4; k++) { const q = { x: start.x + dx * k / 4, y: start.y + dy * k / 4 }; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5 * s, 0, Math.PI * 2); ctx.stroke(); }
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
      const {start,tip} = this.visualWeaponGeometry(b);
      ctx.lineWidth = (weapon === 'knife' ? 13 : 17) * this.drawS();
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
      ctx.globalAlpha = .42 * pulse;
      ctx.shadowBlur = 4 / (Game.scale || 1);
      ctx.lineWidth = 2.5 * this.drawS();
      ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
    } else {
      for (const hand of [b.la,b.ra]) {
        ctx.fillStyle = '#FF354F';
        ctx.beginPath(); ctx.arc(hand.x,hand.y,12 * this.drawS(),0,Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }
  drawReadyLightning(ctx, b) {
    if (this.meter < 100 || this.hp <= 0 || this.ragdollActive) return;
    if (!this.playerControlled) {
      const color = this.color || '#FF5264';
      const pulse = .16 + .1 * (Math.sin(this.animT * 5) + 1) / 2;
      const radius = Math.max(10 * this.drawS(), 10 / Game.scale);
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
    const pad = Math.max(5 * this.drawS(), 5 * unit);
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
  drawAccessory(ctx, b) {
    if (!this.bossProfile || !this.bossProfile.accessory) return;
    const acc = this.bossProfile.accessory;
    const s = this.drawS(), f = this.face;
    const headX = b.head.x, headY = b.head.y, hr = b.hr;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (acc.includes('flatCap')) {
      ctx.fillStyle = '#2A2520'; ctx.strokeStyle = '#11131A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(headX, headY - hr * .2, hr * 1.2, hr * .55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(headX + f * hr * .5, headY - hr * .1, hr * .6, hr * .25, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (acc.includes('beanie')) {
      ctx.fillStyle = '#3D3A42'; ctx.strokeStyle = '#11131A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(headX, headY - hr * .2, hr * 1.05, hr * .55, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (acc.includes('helmet')) {
      ctx.fillStyle = '#2F3A4A'; ctx.strokeStyle = '#11131A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(headX, headY - hr * .1, hr * 1.15, Math.PI, 0); ctx.fill(); ctx.stroke();
    }
    if (acc.includes('welderMask')) {
      ctx.fillStyle = '#1A1D23'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.rect(headX - hr * .9, headY - hr * .3, hr * 1.8, hr * 1.1); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#FBBF24'; ctx.globalAlpha = .6;
      ctx.fillRect(headX - hr * .6, headY, hr * 1.2, hr * .35);
      ctx.globalAlpha = 1;
    }
    if (acc.includes('vest') || acc.includes('peacoat') || acc.includes('apron') || acc.includes('glowingApron') || acc.includes('hiVis')) {
      const chest = b.chest, w = 26 * s, h = 34 * s;
      ctx.fillStyle = acc.includes('glowingApron') ? '#F97316' : acc.includes('hiVis') ? '#FDE047' : acc.includes('peacoat') ? '#2D3748' : acc.includes('apron') ? '#78350F' : '#5C4A3A';
      ctx.strokeStyle = '#11131A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(chest.x - w / 2, chest.y - h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      if (acc.includes('hiVis')) {
        ctx.strokeStyle = '#F97316'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(chest.x - w / 2 + 4, chest.y); ctx.lineTo(chest.x + w / 2 - 4, chest.y); ctx.stroke();
      }
      if (acc.includes('glowingApron')) {
        ctx.globalAlpha = .4;
        ctx.fillStyle = '#FDBA74'; ctx.beginPath(); ctx.ellipse(chest.x, chest.y + 10 * s, 10 * s, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (acc.includes('longHair')) {
      ctx.strokeStyle = '#0B0B0F'; ctx.lineWidth = 4;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(headX - f * hr * .4, headY - hr * .6 + k * 4); ctx.quadraticCurveTo(headX - f * hr * 1.6, headY + hr * .6, headX - f * hr * 1.3, headY + hr * 2 + k * 5); ctx.stroke(); }
    }
    if (acc.includes('hood')) {
      ctx.fillStyle = '#1E2230'; ctx.strokeStyle = '#0B0D14'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(headX - f * hr * .1, headY, hr * 1.25, Math.PI * .9, Math.PI * 2.1); ctx.lineTo(headX - f * hr * 1.1, headY + hr * 1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (acc.includes('redVisor')) {
      ctx.fillStyle = '#FF2D3D'; ctx.strokeStyle = '#3F0A10'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(headX - hr * .2 + (f > 0 ? 0 : -hr * .9), headY - hr * .25, hr * 1.1, hr * .4, 3); ctx.fill(); ctx.stroke();
    }
    if (acc.includes('hardHat')) {
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = '#11131A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(headX, headY - hr * .2, hr * 1.1, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(headX - hr * 1.5, headY - hr * .2); ctx.lineTo(headX + hr * 1.5, headY - hr * .2); ctx.stroke();
    }
    if (acc.includes('gi')) {
      const chest = b.chest, w = 26 * s, h = 34 * s;
      ctx.fillStyle = '#F3F4F6'; ctx.strokeStyle = '#11131A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(chest.x - w / 2, chest.y - h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(chest.x - w / 2 + 3, chest.y - h / 2 + 2); ctx.lineTo(chest.x + f * 4, chest.y + 4); ctx.lineTo(chest.x + w / 2 - 3, chest.y - h / 2 + 2); ctx.stroke();
    }
    if (acc.includes('hakama')) {
      const hip = b.hip, w = 30 * s, h = 30 * s;
      ctx.fillStyle = '#111318'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(hip.x - w * .35, hip.y - 4 * s); ctx.lineTo(hip.x + w * .35, hip.y - 4 * s); ctx.lineTo(hip.x + w * .55, hip.y + h); ctx.lineTo(hip.x - w * .55, hip.y + h); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (acc.includes('suit')) {
      const chest = b.chest, w = 28 * s, h = 36 * s;
      ctx.fillStyle = '#111827'; ctx.strokeStyle = '#000000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(chest.x - w / 2, chest.y - h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#B91C1C'; ctx.beginPath(); ctx.moveTo(chest.x - 3 * s, chest.y - h / 2 + 2); ctx.lineTo(chest.x + 3 * s, chest.y - h / 2 + 2); ctx.lineTo(chest.x, chest.y + 6 * s); ctx.closePath(); ctx.fill();
    }
    if (acc.includes('headset')) {
      ctx.strokeStyle = '#0F172A'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(headX, headY, hr * 1.05, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = '#38BDF8'; ctx.beginPath(); ctx.moveTo(headX + f * hr * .9, headY); ctx.lineTo(headX + f * hr * 1.2, headY + hr * .7); ctx.stroke();
    }
    if (acc.includes('goldCrown')) {
      ctx.fillStyle = '#FBBF24'; ctx.strokeStyle = '#3F2E07'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(headX - hr, headY - hr * .8); ctx.lineTo(headX - hr, headY - hr * 1.7); ctx.lineTo(headX - hr * .5, headY - hr * 1.2);
      ctx.lineTo(headX, headY - hr * 1.9); ctx.lineTo(headX + hr * .5, headY - hr * 1.2); ctx.lineTo(headX + hr, headY - hr * 1.7); ctx.lineTo(headX + hr, headY - hr * .8); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    if (acc.includes('lanternCrown')) {
      ctx.strokeStyle = '#FBBF24'; ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        const lx = headX + i * 16 * s;
        ctx.beginPath(); ctx.moveTo(lx, headY - hr - 4); ctx.lineTo(lx, headY - hr - 18); ctx.stroke();
        ctx.fillStyle = i === 0 ? '#FEF08A' : '#FBBF24';
        ctx.beginPath(); ctx.arc(lx, headY - hr - 22, 5 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
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
    if (this.ragdollActive && !this._phaserBody) {
      ctx.save();
      ctx.translate(this.x + nudge, this.groundY() + this.y);
      ctx.rotate(this.ragdollAngle);
      ctx.translate(-this.x - nudge, -this.groundY() - this.y);
    }
    // Archetype body profiles reshape the shared rig for drawing only; no profile => bones() as before.
    const b = this.bodyProfile ? ArchetypeSkeleton.drawBones(this) : this.bones();
    const invulnTime = Math.max(this.invincibleT, this.dodgeT);
    const invulnBlink = this.playerControlled && invulnTime > 0 && Math.floor(invulnTime * 14) % 2 === 0;
    const col = this.flash > 0 || invulnBlink ? '#FFFFFF' : this.color;
    const spriteStroke = Math.max(Game.lw, 8 / Game.scale);
    if (!this._phaserBody) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = spriteStroke;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const chain = (pts, width = 1) => {
      const stroke = width === 1 ? spriteStroke : spriteStroke * width;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = stroke + 5 / Game.scale; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = stroke;
      ctx.shadowColor = col; ctx.shadowBlur = 5 / Game.scale; ctx.stroke(); ctx.restore();
      for (let i = 0; i < pts.length - 1; i++) {
        const joint = pts[i], jointRadius = stroke * .72;
        ctx.fillStyle = 'rgba(3,8,18,.96)'; ctx.beginPath(); ctx.arc(joint.x, joint.y, jointRadius, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 5 / Game.scale;
        ctx.beginPath(); ctx.arc(joint.x, joint.y, jointRadius * .68, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    };
    if (b.profile) ArchetypeSkeleton.drawBody(ctx, this, b, chain, spriteStroke, col);
    else {
      chain([b.hip, b.chest, b.neck]);
      // Lead/rear shoulders: shR carries punch shPull (~6px back); shL stays on chest
      chain([b.shL || b.sh, b.laJ, b.la]);
      chain([b.shR || b.sh, b.raJ, b.ra]);
      chain([b.hip, b.llJ, b.ll]);
      chain([b.hip, b.rlJ, b.rl]);
    }
    const headX = b.head.x, headY = b.head.y, headRadius = b.hr;
    ctx.fillStyle = 'rgba(3,8,18,.98)'; ctx.beginPath(); ctx.arc(headX, headY, headRadius + 3 / Game.scale, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 10 / Game.scale;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(headX, headY, headRadius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.32)';
    ctx.beginPath(); ctx.ellipse(headX - headRadius * .3, headY - headRadius * .34, headRadius * .28, headRadius * .16, -.5, 0, Math.PI * 2); ctx.fill();
    if (b.profile?.headGear) ArchetypeEquipment[b.profile.headGear]?.(ctx, this, b, 'head', { stroke: spriteStroke, unit: b.unit }); // draw-only (e.g. Ranged hood)
    }
    this.drawAccessory(ctx,b);
    this.drawWeapon(ctx,b);
    this.drawReadyLightning(ctx,b);
    this.drawAttackBoostAura(ctx,b);
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
    if (this.ragdollActive && !this._phaserBody) ctx.restore();
    if (nudge) ctx.translate(-nudge, 0);
  }
}


