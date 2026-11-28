import { Sfx } from './audio.js';
import { BeatEmUp } from './beatemup.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Game, fighters } from './game.js';
import { Moves } from './moves.js';
import { Pose } from './pose.js';

/** LF2 pacing. Every approved timing reads this block so it can be tuned in one place. */
export const PACE = {
  enemy: 1.3,
  /** Player specials scale by this (Karate su/ac/re, Blade beats). Staff hit spacing is authored beside it. */
  special: 1.35,
  hitstop: { chain: 4, finisher: 8, special: 6, specialLast: 10 },
  dodgeDuration: 0.60,
  dodgeIFrames: 0.36,
  dodgeCooldown: 1.6,
  move: 0.55,
  getUp: 0.8,
  spriteFps: 10,
  punch: { su: 12, ac: 4, re: 19, chainWindow: 14, dmg: [5, 7, 9], kb: [160, 220, 380], stun: [10, 15, 24] },
  finisher: { su: 19, ac: 7, re: 31 },
  projectileSpeed: 250,
};

/**
 * Player-received hits. One place for the art director to retune crowd fairness.
 * Enemies keep enemyBurstKO / enemyBurstWindow (the old shared 30 / 1.6s, refreshed every hit).
 * Boss move numbers are not scaled: a bossProfile attacker still deals its authored kb and stun.
 * Knockdown is damage in the burst window (LF2 fall), not a hit count. The window starts on the
 * first hit of a run and does not restart when another hit lands.
 */
export const PLAYER_DEFENSE = {
  burstKO: 55,
  burstWindow: 1.2,
  chainKnockdown: false,
  kbTaken: 0.6,
  stunTaken: 0.8,
  wakeInvuln: 1.5,
  wakeBlink: 0.25,
  wakeNoAttack: 0.8,
  attackGap: 0.6,
  enemyBurstKO: 30,
  enemyBurstWindow: 1.6,
};

/** Extra ×PACE.enemy on enemy and boss startup, active, and recovery frames. Distances stay put. */
export function paceEnemy(n) {
  return Math.max(1, Math.round(n * PACE.enemy));
}
/** Seconds of hit-stop for one special contact. The last pulse of the move holds longer. */
export function specialHitStop(pulse, hitCount) {
  const last = Math.max(0, (hitCount || 1) - 1);
  return (pulse >= last ? PACE.hitstop.specialLast : PACE.hitstop.special) / 60;
}

export const ArcadeDiff = {
  easy:   { damage: .7, health: .8, extraEnemies: -1, attackers: 2, details: 'DAMAGE 70% · ENEMY HP 80% · 4 PER WAVE' },
  normal: { damage: 1, health: 1, extraEnemies: 0, attackers: 2, details: 'DAMAGE 100% · ENEMY HP 100% · 6 PER WAVE' },
  hard:   { damage: 1.4, health: 1.5, extraEnemies: 1, attackers: 3, details: 'DAMAGE 140% · ENEMY HP 150% · 8 PER WAVE' },
};

/** Seconds after a non-final stage clear before the next stage begins. */
export const STAGE_TRANSITION_DELAY = 5;

/* Beat 'em up boss hardness: boss threat (HP x damage per second) multiplier.
   Splits into HP x2.5, damage x1.4, attack rate x1.43 at BOSS_HARDNESS = 5 (2.5 x 1.4 x 1.43 = 5). */
export const BOSS_HARDNESS = 5;
export const BossHardness = (() => {
  const share = f => BOSS_HARDNESS ** (Math.log(f) / Math.log(5));
  // Tell never drops below .50s so every boss attack stays readable and blockable.
  return { health: share(2.5), damage: share(1.4), rate: share(1.43), tellMin: .5 };
})();

/* Shared depth lane math. Beat 'em up calls these with its own band constants. */
export const Depth = {
  // lerp keeps BeatEmUp's original float order (a + span * t) so its output stays bit-identical.
  lerp(t, a, span) { return a + span * t; },
  clamp01(d) { return Math.max(0, Math.min(1, d)); },
  toY(d, top, bot) { return Depth.lerp(Depth.clamp01(d), top, bot - top); },
  toScale(d, min, max) { return Depth.lerp(Depth.clamp01(d), min, max - min); },
  // Shared floor for practice and beat 'em up. Depth 0 is the back edge, depth 1 is the front.
  areaTop() { return Game.H * BeatEmUp.BAND_TOP; },
  areaBot() { return Game.H * BeatEmUp.BAND_BOT; },
  step(depth, dy, dt) {
    const band = Math.max(1, Depth.areaBot() - Depth.areaTop());
    return Math.max(0, Math.min(1, depth + dy * (156 / band) * dt));
  },
  // Practice band: near lane (depth 1) is exactly Game.GROUND; back lane is 72px higher.
  BAND_1V1_PX: 72,
  get BAND_1V1_TOP() { return Game.GROUND - Depth.BAND_1V1_PX; },
  get BAND_1V1_BOT() { return Game.GROUND; },
  SCALE_1V1_MIN: 0.88,
  SCALE_1V1_MAX: 1.0,
  HIT_PX: 14,
  // Shared lane hit window (px of floor depth) for every mode. Non-player attackers keep HIT_PX.
  // Player attacks get PLAYER_HIT_PX x average body size, floored at HIT_PX and capped at HIT_MAX_PX.
  PLAYER_HIT_PX: 22,
  HIT_MAX_PX: 36,
  // Player Special Moves: total lanes covered, centred on the player's lane (Staff 5, Blade 3, Karate 3).
  // One lane = the drawn guide spacing (beat 'em up: band / 4 = 43.2px; practice: band / 2 = 36px).
  SPECIAL_LANES: { staff: 5, blade: 3, freehand: 3 },
  lanePx() {
    return Game.mode === 'beatemup' ? Game.H * (BeatEmUp.BAND_BOT - BeatEmUp.BAND_TOP) / 4 : Depth.BAND_1V1_PX / 2;
  },
  /** Lane half-width for a player's Special Move, or null (not a player / no class rule): N lanes -> +/-(N/2) lanes. */
  specialLaneTolerance(fighter) {
    if (!fighter?.playerControlled) return null;
    const lanes = Depth.SPECIAL_LANES[fighter.classId];
    return lanes ? lanes / 2 * Depth.lanePx() : null;
  },
  hitTolerance(isPlayer, sizeA = 1, sizeB = 1) {
    if (!isPlayer) return Depth.HIT_PX;
    return Math.min(Depth.HIT_MAX_PX, Math.max(Depth.HIT_PX, Depth.PLAYER_HIT_PX * ((sizeA || 1) + (sizeB || 1)) / 2));
  },
  // Training Reset depth: front lane (scale 1.00).
  START: 1,
  // Effects may not draw within this many CSS px below the HUD/health-bar panels (practice only).
  HUD_CLEAR_PX: 8,
};

/* Beat 'em up special-meter gain. Fighter.gainMeter multiplies every award by this
   (dealing a hit, taking a hit, taking a special, Blade Wave). Special cost, the 100
   cap, and special effects stay as they are. Meter is a float: the product is stored
   as-is and then capped. There is no rounding. */
export const SPECIAL_GAIN_MULT = 0.5;

export const FighterClasses = {
  freehand: { name: 'KARATE', role: 'FAST · 1.75× METER', punchMove: 'KARATE PUNCH', kickMove: 'KARATE KICK', super: 'IRON FIST STRING', color: '#52B8FF', accent: '#FBBF24', style: 'ward', pitch: 1.08, speed: 1.08, attackSpeed: 1.28, punch: 1, kick: .95, superPower: 1, superHits: 4, superVisualDuration: 2.5, criticalChance: .13, criticalDamage: 1.55, meter: 1.75, dash: .13 },
  staff: { name: 'STAFF', role: 'SLOW · HEAVY · LONGEST RANGE', punchMove: 'BO STAFF THRUST', kickMove: 'LOW SWEEP', super: 'DRAGON STAFF SPIN', color: '#3BD6B3', accent: '#FBBF24', style: 'quake', weapon: 'staff', pitch: .92, speed: .98, attackSpeed: .78, punch: 1.22, kick: 1.55, superPower: 1.3, superHits: 3, superVisualDuration: 3.5, criticalChance: .09, criticalDamage: 1.8, meter: 1, dash: .12 },
  blade: { name: 'BLADE', role: 'BALANCED · 1.35× METER', punchMove: 'QUICK DRAW', kickMove: 'CRESCENT CLEAVE', super: 'CRESCENT STORM', color: '#B8D7FF', accent: '#38BDF8', style: 'flash', weapon: 'blade', pitch: 1.2, speed: 1.13, attackSpeed: 1, punch: 1.20, kick: 1.08, superPower: 1.12, superHits: 1, superVisualDuration: 1.0, criticalChance: .16, criticalDamage: 1.6, meter: 1.35, dash: .18 },
};
export const PlayerCoolColor = '#52B8FF';
export const CpuHotColors = {
  '1v1': '#FF4F5E',
  enemy: { regular: '#FF4F5E', rusher: '#FFAA45', guard: '#F36B83', heavy: '#E94B3E', ranged: '#A78BFA', boss: '#F04458', brawler: '#FF8C5A', grappler: '#D9733B', disruptor: '#3FB8C9' },
  bosses: ['#FF4F5E','#FF8A4C','#F35B91','#FF663E','#D84A67','#F05668','#FFB347','#EA5968','#F0447A','#FF3B47'],
};

/* Boss loadouts — stage-settings.js profiles point to these weapons. */
export const BossWeapons = {
  knuckles:    { damageMultiplier: 1, reach: 95,  color: '#FBBF24' },
  anchorChain: { damageMultiplier: 1, reach: 230, color: '#8EDFFF' },
  cleavers:    { damageMultiplier: 1, reach: 100, color: '#FF7A7A' },
  sledgehammer:{ damageMultiplier: 1, reach: 150, color: '#FF9F43' },
  shieldBaton: { damageMultiplier: 1, reach: 110, color: '#7CEBFF' },
  // Boss B2 (PR A). crossbow: melee stock strike reach; its kick is a real foot kick (kick: 'foot').
  crossbow:    { damageMultiplier: 1, reach: 100, color: '#FF3B47', kick: 'foot' },
  naginata:    { damageMultiplier: 1, reach: 200, color: '#E5E7EB' },
  girder:      { damageMultiplier: 1, reach: 210, color: '#F59E0B', shoveMul: .6 }, // shove pushes the girder end out 60% of the swing reach
  // Boss B2 (PR B). The Director's shock baton; the Syndicate Chief swaps twin blades -> sledgehammer -> gauntlets by phase.
  shockBaton:  { damageMultiplier: 1, reach: 115, color: '#38BDF8' },
  twinBlades:  { damageMultiplier: 1, reach: 110, color: '#E2E8F0' },
  gauntlets:   { damageMultiplier: 1, reach: 90,  color: '#FACC15' },
};

/* Boss signature move tuning. Base values are before BossHardness / difficulty multipliers. */
export const BossSignatures = {
  bossBlockParty:  { label: 'BLOCK PARTY',  color: '#FBBF24', fractions: [6/24, 6/24, 12/24], guardBreak: [false, false, true], advance: 140, hitCount: 3 },
  bossDockHaulIn:  { label: 'HAUL IN',      color: '#8EDFFF', reach: 230, hookFrames: 8, pullFrames: 10, pull: 150, smashDmg: 14, guardBreak: true, hitCount: 1 },
  bossMarketToss:  { label: "BUTCHER'S TOSS", color: '#FF7A7A', projectileSpeed: 700, projectileRange: 500, projectileDmg: 12, flurryDmg: 4, flurryHits: 4, reach: 100, hitCount: 4 },
  bossForgeQuake:  { label: 'FORGE QUAKE',  color: '#FF9F43', projectileSpeed: 600, projectileRange: 420, depthGap: 30, dmg: 16, hitCount: 0 },
  bossShieldCharge:{ label: 'SHIELD WALL',  color: '#7CEBFF', charge: 300, dmg: 14, guardBreak: true, hitCount: 1 },
  // Boss B2 (PR A). Frames at 60 fps; damage is base (x BossHardness.damage x difficulty).
  // Laser Lock: laser on the player's lane for lockFrames (= su, 0.6 s), then a full-screen bolt in that lane.
  // Phase 3: lines at depth 0/.5/1 shown together for lockFrames, then fired in random order gapFrames (0.25 s) apart.
  bossLaserLock:   { label: 'LASER LOCK',   color: '#FF2D3D', lockFrames: 36, gapFrames: 15, phase3Depths: [0, .5, 1], dmg: 18, laneTol: 14, kb: 160, stun: 12, hitCount: 0 },
  // Shadow Step: lane locked at the start (the player's lane); on active frame 1 Kage teleports `behind` px behind
  // the player (opposite the way the player faces) in that lane, leaving an afterimage; naginata cut live from cutStart.
  bossShadowStep:  { label: 'SHADOW STEP',  color: '#A78BFA', behind: 90, cutStart: 2, dmg: 16, afterimageFrames: 18, hitCount: 1 },
  // Roadblock: barricade thrown on active frame 1 into the player's lane just behind the player (blocks that lane
  // for barricadeFrames = 4 s), then after chargeDelay a chargeDist px charge over chargeFrames; girder-tip hitbox only while charging.
  bossRoadblock:   { label: 'ROADBLOCK',    color: '#F59E0B', barricadeFrames: 240, barricadeOffset: 80, barricadeHalfW: 16, bodyHalf: 22,
                     chargeDelay: 18, chargeFrames: 20, chargeDist: 400, dmg: 20, guardBreak: true, hitCount: 1 },
  // Boss B2 (PR B). Live Broadcast: glitch tell for su (0.5 s); on active frame 1 three spots are marked at the player's
  // x + spotOffsets in the player's lane; markDelay (0.7 s) later lightning strikes every spot at once (each spot hits
  // a player within spotHalfW px and laneTol px of floor depth, once). Unblockable, like Laser Lock.
  bossLiveBroadcast:{ label: 'LIVE BROADCAST', color: '#38BDF8', markDelay: 42, spotOffsets: [0, -150, 150], spotHalfW: 40, laneTol: 14,
                     dmg: 14, kb: 200, stun: 18, flashFrames: 12, hitCount: 0 },
  // Coliseum Finale: 5 hits, one per `slot` frames (live for live[i] frames at the start of each slot), damage hits[i];
  // the last hit breaks guard and knocks down. Advances like Block Party so the string stays connected.
  bossColiseumFinale:{ label: 'COLISEUM FINALE', color: '#F43F5E', hits: [10, 10, 12, 14, 24], slot: 7, live: [3, 3, 3, 3, 4], advance: 160, hitCount: 5 },
};
/* Syndicate Chief phase 2 replay: `picks` distinct signatures drawn from the stage 1..`from` boss profiles. */
export const BossReplay = {
  pool(from) {
    const keys = [];
    for (const c of BeatEmUp.chapters.slice(0, from)) { const k = c?.boss?.profile?.signature?.key; if (k && BossSignatures[k] && Moves[k] && !keys.includes(k)) keys.push(k); }
    return keys;
  },
  /** Special key for this use: phase 2 = picks[0..n-1] one at a time, then the Finale, then a new cycle; phase 3 = the Finale. */
  next(f) {
    const spec = f.bossProfile?.replay, own = f.bossProfile?.signature?.key;
    if (!spec) return own;
    if ((f.bossPhase || 1) !== 2) return own;
    if (!f.replayCycle || f.replayCycle.idx > spec.picks) {
      const pool = this.pool(spec.from);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      f.replayCycle = { picks: pool.slice(0, spec.picks), idx: 0, n: (f.replayCycle?.n || 0) + 1 };
    }
    const c = f.replayCycle, key = c.idx < c.picks.length ? c.picks[c.idx] : own;
    c.idx++;
    return key;
  },
};
/* Per-phase loadouts (Syndicate Chief): weapon + normals swap when the boss is not mid-attack. */
export const BossPhases = {
  spec(f) { const ph = f.bossProfile?.phases; return ph ? ph[f.bossPhase || 1] || ph[1] : null; },
  apply(f, phase) {
    if (!f.bossProfile?.phases) return;
    f.bossPhase = phase;
    const s = this.spec(f);
    f.weaponType = s.weapon;
    f.damageMultiplier = BossWeapons[s.weapon]?.damageMultiplier || 1;
  },
};

/* Boss counter stances (Boss B2). Kage: the stance holds `stance` frames (0.8 s); the first player hit landing in it is
   parried (no damage to Kage) and he ripostes with a naginata cut after riposteWind frames. Unused, it ends at 0.8 s.
   Riposte damage 12 = his Wheel cut (proposal; base, x BossHardness.damage x difficulty like every boss normal). */
export const BossCounters = {
  kage: { label: 'COUNTER', stance: 48, riposteWind: 6, riposteActive: 5, recovery: 24, dmg: 12, kb: 220, stun: 14, chance: .22 },
};
export class BossCounter {
  static start(f, spec) {
    f.atk = { su: paceEnemy(spec.stance), ac: paceEnemy(spec.riposteActive), re: paceEnemy(spec.recovery), dmg: spec.dmg * f.damageMultiplier, kb: spec.kb, stun: spec.stun, chip: 0,
      kind: 'punch', reach: f.bossProfile.reach, armored: false, hitCount: 1, counter: true, parried: false, stanceEnd: paceEnemy(spec.stance), parryFrame: 0 };
  }
  /** Called after atkT++: an unused stance ends exactly at stanceEnd (no riposte). */
  static tick(f) {
    const a = f.atk;
    if (!a.parried && f.atkT >= a.stanceEnd) { a.su = f.atkT; a.ac = 0; a.re = 0; }
  }
  static parries(f, from) {
    const a = f.atk;
    return !!(a?.counter && !a.parried && f.atkT <= a.stanceEnd && from?.playerControlled);
  }
  static parry(f, atk, from) {
    const a = f.atk, spec = BossCounters[f.bossProfile.counter];
    a.parried = true; a.parryFrame = f.atkT; a.su = f.atkT + spec.riposteWind;
    f.face = from.x >= f.x ? 1 : -1; f.atkPhase = '';
    f.blockFlash = .12; f.weaponFlashT = .2; f.weaponFlashColor = '#E5E7EB';
    Sfx.play('block', f.bossProfile);
    return 'parry';
  }
}

/* Boss signature controller. Projectiles live on BeatEmUp.bossProjectiles. */
export class BossSignature {
  static entryFor(f) { return BeatEmUp.cast.find(e => e.f === f); }
  /** Key of the signature being performed (Syndicate Chief replays other bosses' signatures). */
  static keyOf(f) { return f.sigKey || f.bossProfile.signature.key; }
  static start(f, key = f.bossProfile.signature.key) {
    const sig = BossSignatures[key];
    f.sigKey = key;
    f.sigProjectileSpawned = false;
    f.sigHooked = false;
    f.sigTarget = null;
    f.sigFlurryRemaining = sig.flurryHits || 0;
    f.sigPullFrames = 0;
    f.dashLeft = sig.advance || sig.charge || 0;
    f.blocking = 0;
    BossSignature.startB2(f, key, sig);
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    Fx.superCharge(f.x - cameraX, f.groundY() + f.y - 44 * f.drawS(), f.bossProfile);
  }
  /** Boss B2 (PR A) signature setup; runs after the atk snapshot is built. */
  static startB2(f, key, sig) {
    const a = f.atk, player = BeatEmUp.playerEntry(), entry = this.entryFor(f);
    if (key === 'bossLaserLock') {
      const phase3 = entry?.ai?.phase === 3;
      const depths = phase3 ? sig.phase3Depths.slice() : [player ? player.depth : (entry?.depth ?? f.depth)];
      if (phase3) for (let i = depths.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [depths[i], depths[j]] = [depths[j], depths[i]]; }
      a.su = paceEnemy(sig.lockFrames); a.ac = paceEnemy(1 + (depths.length - 1) * sig.gapFrames);
      depths.forEach((d, i) => BossFields.add({ kind: 'laser', owner: f, atk: a, depth: d, fireAt: a.su + 1 + i * sig.gapFrames, order: i, fired: false, flash: 0 }));
    }
    if (key === 'bossShadowStep') f.sigLaneDepth = player ? player.depth : (entry?.depth ?? f.depth);
    if (key === 'bossRoadblock') { f.dashLeft = 0; f.sigFace = f.face; f.sigLaneDepth = player ? player.depth : (entry?.depth ?? f.depth); }
    if (key === 'bossLiveBroadcast') BossFields.add({ kind: 'glitch', owner: f, atk: a });
  }
  static update(f, dt) {
    if (!f.atk || f.state !== 'special' || !f.bossProfile) return;
    const key = this.keyOf(f);
    const sig = BossSignatures[key];
    const a = f.atk;
    const t = f.atkT;
    if (key === 'bossShieldCharge' && t <= a.su) f.blocking = 1;
    if (t > a.su && t <= a.su + a.ac) {
      const activeFrame = t - a.su;
      if (key === 'bossMarketToss' && !f.sigProjectileSpawned) {
        f.sigProjectileSpawned = true;
        const entry = this.entryFor(f);
        const damage = sig.projectileDmg * BossHardness.damage * BeatEmUp.difficulty.damage;
        this.spawnProjectile({
          kind: 'cleaver', x: f.x, y: f.groundY() + f.y - 58 * f.drawS(),
          depth: entry ? entry.depth : f.depth, face: f.face, speed: sig.projectileSpeed, range: sig.projectileRange,
          damage, width: 18, height: 22, owner: f,
        });
      }
      if (key === 'bossForgeQuake' && activeFrame === 8 && !f.sigProjectileSpawned) {
        f.sigProjectileSpawned = true;
        const entry = this.entryFor(f);
        const damage = sig.dmg * BossHardness.damage * BeatEmUp.difficulty.damage;
        this.spawnProjectile({
          kind: 'shockwave', x: f.x, y: f.groundY() + f.y,
          depth: entry ? entry.depth : f.depth, face: f.face, speed: sig.projectileSpeed, range: sig.projectileRange,
          damage, width: 44, height: 10, owner: f,
        });
      }
      if (key === 'bossShadowStep' && activeFrame === 1) {
        const player = BeatEmUp.playerEntry(), entry = this.entryFor(f);
        if (player) {
          BossFields.add({ kind: 'afterimage', owner: f, x: f.x, depth: entry ? entry.depth : f.depth, face: f.face, life: sig.afterimageFrames, max: sig.afterimageFrames });
          const lo = BeatEmUp.lockL + 40, hi = BeatEmUp.lockR - 40;
          f.x = Math.max(lo, Math.min(hi, player.f.x - player.f.face * sig.behind));
          if (entry) entry.depth = f.sigLaneDepth;
          f.face = player.f.x >= f.x ? 1 : -1; f.vx = 0;
          f.sigTeleported = { x: f.x, depth: f.sigLaneDepth, playerX: player.f.x };
        }
      }
      if (key === 'bossRoadblock') {
        f.face = f.sigFace;
        if (activeFrame === 1) {
          const player = BeatEmUp.playerEntry();
          const px = player ? player.f.x : f.x + f.face * 200, dir = px >= f.x ? 1 : -1;
          const x = Math.max(BeatEmUp.lockL + 30, Math.min(BeatEmUp.lockR - 30, px + dir * sig.barricadeOffset));
          BossFields.add({ kind: 'barricade', owner: f, x, depth: f.sigLaneDepth, halfW: sig.barricadeHalfW, life: sig.barricadeFrames, max: sig.barricadeFrames, side: -dir });
        }
        if (activeFrame === sig.chargeDelay + 2) { f.dashLeft = sig.chargeDist; f.sigChargeX = f.x; } // throw f1, pause chargeDelay, charge the last chargeFrames
      }
      if (key === 'bossLiveBroadcast' && activeFrame === 1) {
        const player = BeatEmUp.playerEntry(), entry = this.entryFor(f);
        const px = player ? player.f.x : f.x + f.face * 120, depth = player ? player.depth : (entry?.depth ?? f.depth);
        sig.spotOffsets.forEach((off, i) => BossFields.add({ kind: 'spot', owner: f, atk: a, x: Math.max(BeatEmUp.lockL + 20, Math.min(BeatEmUp.lockR - 20, px + off)),
          depth, markedAt: t, fireAt: t + sig.markDelay, order: i, fired: false, flash: 0 }));
      }
        if (key === 'bossDockHaulIn') {
        const player = BeatEmUp.playerEntry();
        // I-frames turn the hook into a dodgeable grab. A grab already on the player lets go.
        if (player && player.f.inDodgeIFrames()) { f.sigHooked = false; f.sigTarget = null; }
        else if (player && !f.sigHooked && activeFrame <= sig.hookFrames) {
          const dx = Math.abs(f.x - player.f.x);
          if (dx <= sig.reach && BeatEmUp.depthClose(this.entryFor(f)?.depth ?? f.depth, player.depth)) {
            f.sigHooked = true;
            f.sigTarget = player.f;
          }
        }
        if (f.sigHooked && f.sigTarget && activeFrame > sig.hookFrames && activeFrame <= sig.hookFrames + sig.pullFrames) {
          const target = f.sigTarget;
          const dx = f.x - target.x;
          const dist = Math.abs(dx);
          if (dist > 8) target.x += Math.sign(dx) * Math.min(dist - 8, sig.pull / sig.pullFrames);
        }
      }
    }
  }
  static drivePose(f, dt) {
    const a = f.atk, t = f.atkT;
    const key = this.keyOf(f);
    if (t <= a.su) {
      if (f.atkPhase !== 'sw') {
        const pose = key === 'bossShieldCharge' ? Pose.block(null) : Pose.specialWind(null);
        f.aim('sw', pose, a.su * Game.STEP);
        f.atkPhase = 'sw';
      }
    } else if (t <= a.su + a.ac) {
      if (f.atkPhase !== 'ss') {
        f.aim('ss', Pose.specialDash(null), .05);
        f.atkPhase = 'ss';
      }
    } else if (f.atkPhase !== 'sr') {
      f.aim('sr', Pose.idle(null), a.re * Game.STEP);
      f.atkPhase = 'sr';
    }
  }
  static weaponHitbox(f, opts) {
    const geo = f.weaponGeometry(f.combatBones(), true);
    if (!geo) return null;
    const { start, tip } = geo;
    const r = 10 * f.drawS();
    const x = Math.min(start.x, tip.x) - r, y = Math.min(start.y, tip.y) - r;
    const w = Math.abs(tip.x - start.x) + r * 2, h = Math.abs(tip.y - start.y) + r * 2;
    return {
      x, y, w, h, segment: { x1: start.x, y1: start.y, x2: tip.x, y2: tip.y, r },
      chip: 0, special: true, critical: false, comboFinisher: false, comboLink: false, chain: 0,
      ...opts,
    };
  }
  static strike(f, pulse) {
    const key = this.keyOf(f);
    const sig = BossSignatures[key];
    const a = f.atk;
    const t = f.atkT - a.su;
    if (t <= 0 || t > a.ac) return null;
    if (key === 'bossBlockParty') {
      const slot = Math.min(sig.hitCount - 1, Math.floor((t - 1) / Math.max(1, a.ac / sig.hitCount)));
      if (slot !== pulse) return null;
      return this.weaponHitbox(f, {
        dmg: a.dmg * sig.fractions[slot],
        kb: a.kb * (slot === sig.hitCount - 1 ? 1.2 : .8),
        stun: a.stun,
        guardBreak: sig.guardBreak[slot],
        blockable: !sig.guardBreak[slot],
        pulse: slot,
      });
    }
    if (key === 'bossShieldCharge') {
      return this.weaponHitbox(f, { dmg: a.dmg, kb: a.kb, stun: a.stun, guardBreak: sig.guardBreak, pulse: 0 });
    }
    if (key === 'bossLaserLock' || key === 'bossLiveBroadcast') return null; // bolts / lightning resolve in BossFields (lane only)
    if (key === 'bossColiseumFinale') {
      const slot = Math.floor((t - 1) / sig.slot), last = slot === sig.hits.length - 1;
      if (slot !== pulse || slot >= sig.hits.length || (t - 1) - slot * sig.slot >= sig.live[slot]) return null;
      const total = sig.hits.reduce((x, y) => x + y, 0);
      return this.weaponHitbox(f, { dmg: a.dmg * sig.hits[slot] / total, kb: last ? a.kb : a.kb * .3, stun: a.stun,
        guardBreak: last, blockable: !last, knockdown: last, deferKnockdown: !last, pulse: slot }); // hits 1-4 never burst-knock down
    }
    if (key === 'bossShadowStep') {
      if (t < sig.cutStart || f.hitDone) return null;
      return this.weaponHitbox(f, { dmg: a.dmg, kb: a.kb, stun: a.stun, pulse: 0 });
    }
    if (key === 'bossRoadblock') {
      if (t < sig.chargeDelay + 2 || f.hitDone) return null;
      return this.weaponHitbox(f, { dmg: a.dmg, kb: a.kb, stun: a.stun, guardBreak: sig.guardBreak, pulse: 0 });
    }
    if (key === 'bossDockHaulIn') {
      const smashStart = a.ac - 6;
      if (t < smashStart) return null;
      return this.weaponHitbox(f, { dmg: a.dmg, kb: a.kb, stun: a.stun, guardBreak: sig.guardBreak, pulse: 0 });
    }
    if (key === 'bossMarketToss') {
      if (!f.sigProjectileSpawned || BeatEmUp.bossProjectiles.some(p => p.kind === 'cleaver' && p.owner === f)) return null;
      if (f.sigFlurryRemaining <= 0) return null;
      const player = BeatEmUp.playerEntry();
      if (!player) return null;
      const dx = Math.abs(f.x - player.f.x);
      if (dx > sig.reach || !BeatEmUp.depthClose(this.entryFor(f)?.depth ?? f.depth, player.depth)) return null;
      f.sigFlurryRemaining--;
      const flurryDmg = sig.flurryDmg * BossHardness.damage * BeatEmUp.difficulty.damage;
      return this.weaponHitbox(f, { dmg: flurryDmg, kb: a.kb * .5, stun: Math.max(6, a.stun * .5), pulse: f.sigFlurryRemaining });
    }
    return null;
  }
  static spawnProjectile(p) { BeatEmUp.bossProjectiles.push(p); }
  static updateProjectiles(dt, player) {
    if (!player) return;
    for (let i = BeatEmUp.bossProjectiles.length - 1; i >= 0; i--) {
      const p = BeatEmUp.bossProjectiles[i];
      p.x += p.face * p.speed * dt;
      if (p.startX == null) p.startX = p.x - p.face * p.speed * dt;
      if (Math.abs(p.x - p.startX) >= p.range) { BeatEmUp.bossProjectiles.splice(i, 1); continue; }
      if (p.hit) continue;
      const laneGap = Math.abs(BeatEmUp.floorDepthPx(p.depth) - BeatEmUp.floorDepthPx(player.depth));
      const maxGap = p.kind === 'shockwave' ? BossSignatures.bossForgeQuake.depthGap : BeatEmUp.DEPTH_HIT_PX;
      if (laneGap > maxGap) continue;
      const hitW = p.width * (p.kind === 'shockwave' ? 1 : .8);
      const px = p.x - hitW / 2, py = p.kind === 'shockwave' ? p.y - p.height : p.y - p.height / 2;
      const box = { x: px, y: py, w: hitW, h: p.height };
      if (!Game.hitTest(box, player.f.hitbox)) continue;
      p.hit = true;
      const hit = {
        x: box.x, y: box.y, w: box.w, h: box.h,
        dmg: p.damage, kb: p.kind === 'shockwave' ? 260 : 160, stun: p.kind === 'shockwave' ? 16 : 8,
        chip: 0, special: p.kind === 'shockwave', blockable: p.kind === 'shockwave',
        critical: false, comboFinisher: false, comboLink: false, chain: 0,
      };
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const kind = player.f.takeHit(hit, p.owner);
      if (kind === 'block') { Fx.blocked(cx, cy); }
      else if (kind === 'armored') { Fx.hit(cx, cy); }
      else { Fx.hit(cx, cy); Sfx.play(p.kind === 'shockwave' ? 'super-hit' : 'player-heavy-hit', player.f.classProfile); }
      Game.stop = .05; Game.shake = .08; Game.shMag = 3;
      BeatEmUp.bossProjectiles.splice(i, 1);
    }
  }
  static drawProjectiles(ctx) {
    const camX = BeatEmUp.cameraX;
    for (const p of BeatEmUp.bossProjectiles) {
      ctx.save();
      ctx.translate(p.x - camX, p.y);
      if (p.face < 0) ctx.scale(-1, 1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (p.kind === 'cleaver') {
        ctx.strokeStyle = '#E8ECF2'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(10, -4); ctx.lineTo(10, 8); ctx.lineTo(-6, 4); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = '#B9C5D4'; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(10, -4); ctx.lineTo(10, 8); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#20232C'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-2, 2); ctx.stroke();
      } else if (p.kind === 'shockwave') {
        ctx.strokeStyle = '#FF9F43'; ctx.lineWidth = 4;
        ctx.shadowColor = '#FF9F43'; ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(-p.width / 2, 0);
        ctx.lineTo(p.width / 2, -6);
        ctx.lineTo(p.width / 2, 4);
        ctx.lineTo(-p.width / 2, 10);
        ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,159,67,.25)'; ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
  }
}

/* Boss B2 floor/screen fields: Laser Lock lines, Roadblock barricades, Shadow Step afterimages (BeatEmUp.bossFields). */
export class BossFields {
  static add(f) { BeatEmUp.bossFields.push(f); return f; }
  static clear() { BeatEmUp.bossFields = []; }
  static update(player) {
    const list = BeatEmUp.bossFields;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      if (z.owner && z.owner.hp <= 0 && z.kind !== 'afterimage') { list.splice(i, 1); continue; }
      if (z.kind === 'afterimage') { if (--z.life <= 0) list.splice(i, 1); continue; }
      if (z.kind === 'laser') {
        if (!z.fired) {
          if (z.owner.atk !== z.atk || z.owner.state !== 'special') { list.splice(i, 1); continue; } // interrupted: never fires
          if (z.owner.atkT >= z.fireAt) BossFields.fire(z, player);
        } else if (--z.flash <= 0) list.splice(i, 1);
        continue;
      }
      if (z.kind === 'glitch') { if (z.owner.atk !== z.atk || z.owner.state !== 'special' || z.owner.atkT > z.atk.su) list.splice(i, 1); continue; }
      if (z.kind === 'spot') {
        if (!z.fired) {
          if (z.owner.atk !== z.atk || z.owner.state !== 'special') { list.splice(i, 1); continue; } // interrupted: no lightning
          if (z.owner.atkT >= z.fireAt) BossFields.lightning(z, player);
        } else if (--z.flash <= 0) list.splice(i, 1);
        continue;
      }
      if (z.kind === 'barricade') {
        if (z.life-- <= 0) { list.splice(i, 1); continue; } // present for exactly `max` frames
        const sig = BossSignatures.bossRoadblock, half = z.halfW + sig.bodyHalf;
        if (player && player.f.hp > 0 && BeatEmUp.depthClose(z.depth, player.depth)) {
          if ((player.f.x - z.x) * z.side < half) { player.f.x = z.x + z.side * half; if (player.f.vx * z.side < 0) player.f.vx = 0; z.blockedPlayer = (z.blockedPlayer || 0) + 1; }
        }
        const oe = BeatEmUp.entryFor(z.owner);
        if (oe && BeatEmUp.depthClose(z.depth, oe.depth) && (z.owner.x - z.x) * z.side < half && Math.abs(z.owner.x - z.x) < half + 40) {
          z.owner.x = z.x + z.side * half; z.owner.dashLeft = 0; z.stoppedOwner = true; // the charge stops at its own barricade
        }
      }
    }
  }
  static lightning(z, player) {
    const sig = BossSignatures.bossLiveBroadcast;
    z.fired = true; z.flash = sig.flashFrames; z.firedFrame = z.owner.atkT;
    if (!player || player.f.hp <= 0) return;
    if (Math.abs(player.f.x - z.x) > sig.spotHalfW || !BeatEmUp.depthClose(z.depth, player.depth, sig.laneTol)) { z.result = 'miss'; return; }
    const hb = player.f.hitbox, dmg = sig.dmg * BossHardness.damage * BeatEmUp.difficulty.damage;
    const hit = { x: hb.x, y: hb.y, w: hb.w, h: hb.h, dmg, kb: sig.kb, stun: sig.stun, chip: 0, special: true, blockable: false,
      critical: false, comboFinisher: false, comboLink: false, chain: 0 };
    const kind = player.f.takeHit(hit, z.owner);
    z.result = kind;
    if (kind === 'hit') { Fx.hit(z.x - BeatEmUp.cameraX, hb.y + hb.h / 2); Sfx.play('player-heavy-hit', player.f.classProfile); Game.stop = .05; Game.shake = .08; Game.shMag = 3; }
  }
  static fire(z, player) {
    const sig = BossSignatures.bossLaserLock;
    z.fired = true; z.flash = 10; z.firedFrame = z.owner.atkT;
    if (!player || player.f.hp <= 0) return;
    if (!BeatEmUp.depthClose(z.depth, player.depth, sig.laneTol)) { z.result = 'miss'; return; }
    const hb = player.f.hitbox, dmg = sig.dmg * BossHardness.damage * BeatEmUp.difficulty.damage;
    const hit = { x: hb.x, y: hb.y, w: hb.w, h: hb.h, dmg, kb: sig.kb, stun: sig.stun, chip: 0, special: true, blockable: false,
      critical: false, comboFinisher: false, comboLink: false, chain: 0 };
    const kind = player.f.takeHit(hit, z.owner);
    z.result = kind;
    const cx = hb.x + hb.w / 2, cy = hb.y + hb.h / 2;
    if (kind === 'hit') { Fx.hit(cx - BeatEmUp.cameraX, cy); Sfx.play('player-heavy-hit', player.f.classProfile); Game.stop = .05; Game.shake = .08; Game.shMag = 3; }
  }
  static draw(ctx) {
    const camX = BeatEmUp.cameraX;
    for (const z of BeatEmUp.bossFields) {
      const y = BeatEmUp.floorDepthPx(z.depth);
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (z.kind === 'laser') {
        const chest = y - 58 * BeatEmUp.depthToScale(z.depth) * 1.2;
        if (!z.fired) {
          ctx.globalAlpha = .55 + .35 * Math.sin((z.owner.atkT || 0) * .6);
          ctx.strokeStyle = '#FF2D3D'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(0, chest); ctx.lineTo(Game.W, chest); ctx.stroke();
          ctx.globalAlpha = .35; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Game.W, y); ctx.stroke();
        } else {
          ctx.globalAlpha = Math.max(0, z.flash / 10);
          ctx.strokeStyle = '#FFE4E6'; ctx.shadowColor = '#FF2D3D'; ctx.shadowBlur = 12; ctx.lineWidth = 7;
          ctx.beginPath(); ctx.moveTo(0, chest); ctx.lineTo(Game.W, chest); ctx.stroke();
        }
      } else if (z.kind === 'barricade') {
        const x = z.x - camX, h = 44, w = z.halfW * 2;
        ctx.globalAlpha = z.life < 30 ? z.life / 30 : 1;
        ctx.fillStyle = '#F59E0B'; ctx.strokeStyle = '#1F2937'; ctx.lineWidth = 3;
        ctx.fillRect(x - w / 2, y - h, w, h); ctx.strokeRect(x - w / 2, y - h, w, h);
        ctx.strokeStyle = '#F8FAFC'; ctx.lineWidth = 4;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - w / 2, y - h + 8 + k * 13); ctx.lineTo(x + w / 2, y - h + 16 + k * 13); ctx.stroke(); }
      } else if (z.kind === 'glitch') {
        const t = z.owner.atkT || 0;
        ctx.globalAlpha = .18; ctx.fillStyle = '#38BDF8';
        for (let k = 0; k < 6; k++) { const gy = (k * 61 + t * 23) % Game.H; ctx.fillRect(((k * 37 + t * 11) % 40) - 20, gy, Game.W + 40, 3 + (k % 3) * 2); }
        ctx.globalAlpha = .12; ctx.fillStyle = '#F43F5E'; ctx.fillRect(0, (t * 47) % Game.H, Game.W, 2);
      } else if (z.kind === 'spot') {
        const x = z.x - camX, sig = BossSignatures.bossLiveBroadcast, sc = BeatEmUp.depthToScale(z.depth);
        if (!z.fired) {
          const k = Math.min(1, ((z.owner.atkT || 0) - z.markedAt) / sig.markDelay);
          ctx.globalAlpha = .45 + .4 * k; ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(x, y, sig.spotHalfW, sig.spotHalfW * .3, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = .25 + .3 * k; ctx.fillStyle = '#38BDF8';
          ctx.beginPath(); ctx.ellipse(x, y, sig.spotHalfW * k, sig.spotHalfW * .3 * k, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.globalAlpha = Math.max(0, z.flash / sig.flashFrames);
          ctx.strokeStyle = '#E0F2FE'; ctx.shadowColor = '#38BDF8'; ctx.shadowBlur = 14; ctx.lineWidth = 6 * sc;
          ctx.beginPath(); ctx.moveTo(x - 6, 0); ctx.lineTo(x + 10, y * .35); ctx.lineTo(x - 8, y * .65); ctx.lineTo(x, y); ctx.stroke();
        }
      } else if (z.kind === 'afterimage') {
        const x = z.x - camX, a = z.life / z.max;
        ctx.globalAlpha = .45 * a; ctx.strokeStyle = '#A78BFA'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 110); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y - 124, 13, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export class EnemyProjectile {
  static get speed() { return PACE.projectileSpeed; }
  static range = 560;
  static tell = .5;
  static recovery = .9;
  static cooldown = 2.5;
  static get damage() { return Moves.punch.dmg * EnemyWeaponProfiles.freehand.damage * .65; }

  static launch(owner, player) {
    const face = player.f.x >= owner.f.x ? 1 : -1;
    owner.f.face = face;
    const depth = player.depth;
    const originY = BeatEmUp.floorDepthPx(depth) - 48 * BeatEmUp.depthToScale(depth);
    BeatEmUp.enemyProjectiles.push({
      x: owner.f.x + face * 24 * owner.f.drawS(), y: originY,
      depth, face, speed: EnemyProjectile.speed, range: EnemyProjectile.range,
      distance: 0, life: EnemyProjectile.range / EnemyProjectile.speed,
      damage: EnemyProjectile.damage * BeatEmUp.difficulty.damage,
      width: 20, height: 10, owner: owner.f,
    });
  }

  static update(dt, player) {
    if (!player) return;
    for (let i = BeatEmUp.enemyProjectiles.length - 1; i >= 0; i--) {
      const p = BeatEmUp.enemyProjectiles[i];
      p.distance += p.speed * dt;
      p.life -= dt;
      p.x += p.face * p.speed * dt;
      if (p.life <= 0 || p.distance >= p.range || p.x < 0 || p.x > BeatEmUp.worldMax || p.owner.hp <= 0) {
        BeatEmUp.enemyProjectiles.splice(i, 1); continue;
      }
      if (!BeatEmUp.depthClose(p.depth, player.depth)) continue;
      const box = { x: p.x - p.width / 2, y: p.y - p.height / 2, w: p.width, h: p.height };
      if (!Game.hitTest(box, player.f.hitbox)) continue;
      const hit = {
        ...box, dmg: p.damage, kb: 110, stun: 6, chip: 0,
        special: false, blockable: true, critical: false,
        comboFinisher: false, comboLink: false, chain: 0,
      };
      const hpBefore = player.f.hp;
      const kind = BeatEmUp.withDepth(player, () => player.f.takeHit(hit, p.owner));
      const damage = Math.round((hpBefore - player.f.hp) * 10) / 10;
      Fx.damage(box.x + box.w / 2 - BeatEmUp.cameraX, box.y, damage, kind === 'block', false, player.f);
      if (kind === 'block') Fx.blocked(box.x + box.w / 2 - BeatEmUp.cameraX, box.y);
      else {
        Fx.hit(box.x + box.w / 2 - BeatEmUp.cameraX, box.y);
        Sfx.play('player-heavy-hit', player.f.classProfile);
      }
      BeatEmUp.enemyProjectiles.splice(i, 1);
    }
  }

  /** Kunai (drawing only; collision stays the width x height box in update). Blade forward, wrapped grip, ring pommel. */
  static draw(ctx) {
    const camX = BeatEmUp.cameraX;
    for (const p of BeatEmUp.enemyProjectiles) {
      ctx.save();
      ctx.translate(p.x - camX, p.y);
      if (p.face < 0) ctx.scale(-1, 1);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(196,181,253,.5)'; ctx.lineWidth = 2.5;           // motion streak
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-14, 0); ctx.stroke();
      ctx.strokeStyle = '#20232C'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-12, 0, 2.6, 0, Math.PI * 2); ctx.stroke();    // ring pommel
      ctx.strokeStyle = '#20232C'; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(-9.5, 0); ctx.lineTo(-1, 0); ctx.stroke();  // grip outline
      ctx.strokeStyle = '#7C3AED'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-9.5, 0); ctx.lineTo(-1, 0); ctx.stroke();  // wrapped grip
      ctx.fillStyle = '#DCE6F5'; ctx.strokeStyle = '#20232C'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(3, -3.4); ctx.lineTo(12, 0); ctx.lineTo(3, 3.4); ctx.closePath(); ctx.fill(); ctx.stroke(); // leaf blade
      ctx.strokeStyle = 'rgba(32,35,44,.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, 0); ctx.stroke();   // blade ridge
      ctx.restore();
    }
  }
}

// Weapon loadouts trade attack speed for damage. Archetypes determine whether they carry one.
export const EnemyWeaponProfiles = {
  freehand: { weapon: null, attackSpeed: 1, damage: .85 },
  stick: { weapon: 'stick', attackSpeed: .82, damage: 1.3 },
  knife: { weapon: 'knife', attackSpeed: 1.22, damage: 1 },
  // Heavy's fixed loadout: the boss sledgehammer's numbers (damage x1, reach 150), never rolled.
  sledgehammer: { weapon: 'sledgehammer', attackSpeed: 1, damage: BossWeapons.sledgehammer.damageMultiplier },
};
export const EnemyArchetypes = {
  regular: { health: 100, weaponChance: 0, specialDamage: 0, specialGain: 0 },
  // Rusher replaced the old RUNNER everywhere it spawned: lean, fast, one committed shoulder rush.
  rusher: { health: 80, weaponChance: 0, specialDamage: .25, specialGain: .25, speed: 1.35, bodyProfile: 'rusher', rush: 'shoulder' },
  // Guard rebuilt the old TOUGH everywhere it spawned: riot shield, frontal block, shield bash.
  guard: { health: 125, weaponChance: 0, specialDamage: .25, specialGain: .25, speed: .85, bodyProfile: 'guard', guard: 'riotShield', bash: 'shield' },
  // Heavy (rebuilt in place, same spawns): mass/weight body, always a sledgehammer, one overhead slam.
  heavy: { health: 145, weaponChance: 0, loadout: 'sledgehammer', specialDamage: .45, specialGain: .45, speed: .74, scale: 1.12, bodyProfile: 'heavy', slam: 'overhead' },
  // Ranged rebuilt the old THROWER everywhere it spawned: hooded kunai thrower, same stats and the one shared projectile AI
  // (BeatEmUp.updateThrowerAI + EnemyProjectile). Profile is draw-only.
  ranged: { health: 65, weaponChance: 0, specialDamage: 0, specialGain: 0, bodyProfile: 'ranged' },
  boss: { health: 220, weaponChance: 1, specialDamage: 1, specialGain: 1 },
  brawler: { health: 110, weaponChance: 0, specialDamage: .25, specialGain: .25, speed: .95, bodyProfile: 'brawler', combo: 'jabCross' },
  // Grappler: archetype only (no stage spawns yet). Long arms, open hands, one committed grab -> hold, headbutt, release.
  grappler: { health: 115, weaponChance: 0, specialDamage: 0, specialGain: 0, speed: .9, bodyProfile: 'grappler', grab: 'clinch' },
  // Disruptor: archetype only (no stage spawns yet). Slim gadget user; deploys one telegraphed shock zone at a time.
  disruptor: { health: 85, weaponChance: 0, specialDamage: 0, specialGain: 0, speed: .9, bodyProfile: 'disruptor', deploy: 'shockZone' },
};

/* Enemy multi-hit normals. Frames are at 60 fps. Each hit runs wind-up -> active -> recovery,
 * and the hits play back to back inside ONE shared 'punch' attack state (same state machine,
 * hurtbox, lane check and hit resolution as every other enemy punch). `fraction` splits the
 * archetype's single unchained punch damage, so the whole string deals exactly one regular
 * punch. Each hit can land once per target (hitDone re-arms only when the next hit starts).
 * Poses are draw-side and in degrees; gameplay geometry stays on combatBones(). */
export const EnemyCombos = {
  jabCross: {
    label: 'JAB-CROSS',
    hits: [
      // Jab: lead hand, light push so the cross can still connect.
      { name: 'jab',   windup: 9, active: 3, recovery: 8,  fraction: .4, kb: 60,  stun: 10,
        windPose:   {chest:2,neck:-2,head:4,la:-40,le:-112,ra:-35,re:-120,ll:26,lk:18,rl:-26,rk:22,hipBob:-2,shPull:0},
        strikePose: {chest:-6,neck:0,head:4,la:-96,le:6,ra:-35,re:-120,ll:30,lk:16,rl:-28,rk:22,hipBob:-2,shPull:0} },
      // Cross: rear shoulder winds back, then drives through with the rear fist.
      { name: 'cross', windup: 10, active: 3, recovery: 18, fraction: .6, kb: 160, stun: 10,
        windPose:   {chest:14,neck:-3,head:4,la:-55,le:-100,ra:-18,re:-132,ll:26,lk:18,rl:-28,rk:22,hipBob:-2,shPull:8},
        strikePose: {chest:-14,neck:1,head:3,la:-50,le:-105,ra:-98,re:8,ll:34,lk:16,rl:-34,rk:24,hipBob:-3,shPull:0} },
    ],
  },
};
export const EnemyCombo = {
  pose(deg) { const o = {}; for (const k in deg) o[k] = k === 'hipBob' || k === 'shPull' ? deg[k] : deg[k] * Math.PI / 180; return o; },
  /** Absolute atkT windows: hit i is active for activeStart..activeEnd (inclusive). */
  timeline(spec) {
    let t = 0;
    const hits = spec.hits.map(h => {
      const windup = paceEnemy(h.windup), active = paceEnemy(h.active), recovery = paceEnemy(h.recovery);
      const w = { windStart: t, activeStart: t + windup + 1, activeEnd: t + windup + active };
      t += windup + active + recovery;
      return w;
    });
    const last = spec.hits[spec.hits.length - 1];
    const su = paceEnemy(spec.hits[0].windup);
    return { hits, su, ac: hits[hits.length - 1].activeEnd - su, re: paceEnemy(last.recovery), total: t };
  },
  pulseAt(atk, t) {
    const w = atk?.comboWindows;
    if (!w) return -1;
    for (let i = 0; i < w.length; i++) if (t >= w[i].activeStart && t <= w[i].activeEnd) return i;
    return -1;
  },
};

/* Enemy committed rushes. Frames are at 60 fps (one sim step = Game.STEP, the fixed-step
 * delta-time loop every attack uses). Timeline on ONE shared 'punch' attack state:
 *   crouch (wind-up tell, no movement) -> dash (fixed distance, spread evenly over `dash` frames)
 *   -> recovery. The hitbox is live only on the LAST `active` dash frames, so the approach part
 *   of the dash never hits. A miss ends in a braking stumble (`brake` px skid, then the rest of
 *   `whiffRecovery`) the player can punish; a hit stops the dash and recovers in `hitRecovery`.
 * Direction is locked when the rush starts (no tracking, no input reading). Damage is the same
 * single unchained punch every enemy throws (one ROOKIE punch before difficulty). */
export const EnemyRushes = {
  shoulder: {
    label: 'RUSH',
    crouch: 16, dash: 18, active: 7, distance: 156, brake: 18, brakeFrames: 6,
    whiffRecovery: 42, hitRecovery: 20, kb: 200, stun: 14,
    triggerRange: 170, minRange: 90, spacing: 135, backoffMax: 1.2, // AI spacing (px / s); live window reaches gaps ~90-220 px
    crouchPose:  {chest:-24,neck:10,head:8,la:-30,le:-60,ra:40,re:-50,ll:34,lk:34,rl:-40,rk:46,hipBob:9,shPull:6},
    dashPose:    {chest:-32,neck:14,head:8,la:-70,le:-100,ra:50,re:-30,ll:40,lk:20,rl:-50,rk:40,hipBob:4,shPull:0},
    strikePose:  {chest:-40,neck:16,head:10,la:-40,le:-120,ra:60,re:-20,ll:44,lk:18,rl:-56,rk:30,hipBob:4,shPull:0},
    stumblePose: {chest:-46,neck:20,head:12,la:-120,le:20,ra:-80,re:30,ll:54,lk:40,rl:-40,rk:60,hipBob:12,shPull:0},
  },
};
export const EnemyRush = {
  /** Shared-attack timing: su = crouch + approach part of the dash, ac = live dash frames. */
  timeline(spec) {
    const crouch = paceEnemy(spec.crouch), dash = paceEnemy(spec.dash), active = paceEnemy(spec.active), whiff = paceEnemy(spec.whiffRecovery);
    return { su: crouch + dash - active, ac: active, re: whiff,
      dashStart: crouch + 1, dashEnd: crouch + dash, total: crouch + dash + whiff };
  },
  /** One sim step of rush movement (call after atkT++). Returns px moved along rushDir. */
  tick(f) {
    const a = f.atk, sp = a.rush, t = f.atkT, tl = EnemyRush.timeline(sp);
    if (f.hitDone && !a.rushHit) {
      // Connected: stop the dash at once and recover in hitRecovery frames from the hit.
      a.rushHit = true; a.rushLeft = 0; a.brakeLeft = 0;
      a.re = Math.max(0, (t - 1) + paceEnemy(sp.hitRecovery) - (a.su + a.ac)); // the hit resolved after the previous step
    }
    let move = 0;
    if (t >= tl.dashStart && t <= tl.dashEnd && a.rushLeft > 0) {
      if (t === tl.dashStart) Sfx.play('dodge', null);
      move = t === tl.dashEnd ? a.rushLeft : Math.min(a.rushLeft, sp.distance / paceEnemy(sp.dash));
      a.rushLeft -= move;
    } else if (t > tl.dashEnd && !a.rushHit && a.brakeLeft > 0) {
      // Braking skid after a miss: linearly decaying steps that sum to exactly `brake` px.
      const n = paceEnemy(sp.brakeFrames), i = t - tl.dashEnd; // 1..n
      move = i >= n ? a.brakeLeft : Math.min(a.brakeLeft, sp.brake * 2 * (n - i + 1) / (n * (n + 1)));
      a.brakeLeft -= move;
    }
    f.x += a.rushDir * move; f.vx = 0;
    return move;
  },
};

/* Enemy overhead slams. Frames are at 60 fps (fixed Game.STEP loop), on ONE shared 'punch' attack
 * state: wind-up (hammer lifts forward and up over the head) -> active (hammer sweeps over the top
 * down into one zone in front) -> recovery (head held down in a follow-through, then back to stance).
 * Collision is a segment from the hands to the hammer TIP (radius r), built only from the shared rig
 * constants (x, ground, Fighter.S/ARM/TORSO, face, atkT); body profiles and hammer art never touch it.
 * Facing tracks the foe during the wind-up and locks from the first active frame. No shockwave,
 * no projectile, no screen shake: the cue is the raised hammer, the 'SLAM' tell and the impact pose. */
export const EnemySlams = {
  overhead: {
    label: 'SLAM',
    windup: 30, active: 4, recovery: 48, followHold: 30,   // 0.5 s raise, 4 f swing, 0.8 s recovery
    dmg: 12, kb: 260, stun: 22,                            // before weapon/difficulty multipliers
    handle: 44, r: 9,                                      // hammer past the hands / collision radius (x Fighter.S)
    triggerRange: 85,                                      // AI tell inside measured slam contact (back lane hits through 100px)
    rest: -40, raised: -200, impact: -55,                  // hammer angle (deg, la/ra convention: -90 = forward, -180 = up)
    windPose:   {chest:12,neck:-4,head:-2,ll:30,lk:16,rl:-30,rk:22,hipBob:2,shPull:0},
    impactPose: {chest:-22,neck:6,head:6,ll:36,lk:20,rl:-34,rk:30,hipBob:10,shPull:0},
    followPose: {chest:-28,neck:8,head:8,ll:36,lk:22,rl:-34,rk:32,hipBob:12,shPull:0},
  },
};
export const EnemySlam = {
  timeline(spec) { const su = paceEnemy(spec.windup), ac = paceEnemy(spec.active), re = paceEnemy(spec.recovery); return { su, ac, re, total: su + ac + re }; },
  /** Hammer angle in degrees at attack frame t. */
  angle(spec, t) {
    const su = spec.windup, ac = spec.active;
    if (t <= su) return spec.rest + (spec.raised - spec.rest) * Pose.easeOut(t / su);
    if (t <= su + ac) return spec.raised + (spec.impact - spec.raised) * (t - su) / ac;
    const r = t - su - ac;
    if (r <= spec.followHold) return spec.impact;
    return spec.impact + (spec.rest - spec.impact) * Pose.easeOut((r - spec.followHold) / Math.max(1, spec.recovery - spec.followHold));
  },
  /** Gameplay hammer: hands -> tip. Shared rig only (never the body profile). */
  geometry(f) {
    const spec = f.atk.slam, s = f.drawS(), face = f.face, phi = EnemySlam.angle(spec, f.atkT) * Math.PI / 180;
    const pivot = { x: f.x, y: f.groundY() + f.y - 40 * s - Fighter.TORSO };
    const dir = { x: -face * Math.sin(phi), y: Math.cos(phi) };
    const hand = 2 * Fighter.ARM, len = hand + spec.handle * s;
    return { start: { x: pivot.x + dir.x * hand, y: pivot.y + dir.y * hand }, tip: { x: pivot.x + dir.x * len, y: pivot.y + dir.y * len }, r: spec.r * s };
  },
};

/* Enemy frontal guard. Pure gameplay logic in the shared combat coordinates; the drawn shield is
 * decoration only (never a hitbox, never read here).
 * A normal hit is BLOCKED (0 damage) when ALL hold: the shield is up (see shieldUp), the attacker is
 * in front of the guard's facing ((from.x - x) * face > 0, the same frontal test takeHit uses for
 * player blocks) and in the same lane (floor-depth gap within the attacker's normal Depth.hitTolerance).
 * Specials / supers / the Blade wave are unblockable everywhere in the game, so they always land here too.
 * A block pushes the guard back a few px and plays a recoil pose. `breakAfter` consecutive blocks
 * (each within `chainWindow` s of the last) break the guard: the shield opens for `openTime` s and
 * every hit lands. Facing turns toward the foe only after `turnDelay` s, which is the flanking window.
 * Times are seconds of sim time (fixed Game.STEP steps). */
export const EnemyGuards = {
  riotShield: { breakAfter: 3, chainWindow: 1.2, openTime: 1.0, turnDelay: .45, recoilTime: .22, pushBase: 6, pushKb: .04, pushMax: 24 },
};
export const EnemyGuard = {
  spec(f) { return f.enemyGuard ? EnemyGuards[f.enemyGuard] : null; },
  /** Shield raised: not stunned/hit/airborne/dead, not guard-broken, not in another attack, not in bash recovery. */
  shieldUp(f) {
    if (!f.enemyGuard || f.hp <= 0 || f.ragdollActive || f.stun > 0 || f.state === 'hit' || !f.grounded) return false;
    if (f.guardOpenT > 0 || f.enemyThrowPose) return false;
    if (f.atk) return !!f.atk.bash && f.atkT <= f.atk.su + f.atk.ac; // shield leads the bash; drops in its recovery
    return true;
  },
  sameLane(f, from) {
    if (Game.mode !== 'beatemup') return true;
    const me = BeatEmUp.entryFor(f), them = BeatEmUp.entryFor(from);
    if (!me || !them) return true;
    return BeatEmUp.depthClose(them.depth, me.depth, BeatEmUp.depthHitTolerance(them, me) + 1e-9);
  },
  blocks(f, atk, from) {
    if (!EnemyGuard.shieldUp(f) || !from || atk.special) return false;
    return (from.x - f.x) * f.face > 0 && EnemyGuard.sameLane(f, from);
  },
  /** Apply a frontal block: 0 damage, small push-back, recoil, guard-break counter. */
  block(f, atk, from) {
    const g = EnemyGuard.spec(f);
    Sfx.play('block', null);
    f.blockFlash = .12;
    f.x += Math.sign(f.x - from.x || -f.face) * Math.min(g.pushMax, g.pushBase + (atk.kb || 0) * g.pushKb);
    f.guardRecoilT = g.recoilTime;
    f.guardBlocks = f.guardChainT > 0 ? f.guardBlocks + 1 : 1;
    f.guardChainT = g.chainWindow;
    if (f.guardBlocks >= g.breakAfter) { f.guardBlocks = 0; f.guardChainT = 0; f.guardOpenT = g.openTime; Sfx.play('critical', null); }
    return 'block';
  },
  tick(f, dt) {
    const dec = v => (v - dt > 1e-9 ? v - dt : 0); // snap float dust so 1.0 s is exactly 60 steps
    f.guardOpenT = dec(f.guardOpenT); f.guardRecoilT = dec(f.guardRecoilT); f.guardChainT = dec(f.guardChainT);
    if (f.guardChainT <= 0) f.guardBlocks = 0;
  },
  /** Delayed turn: the generic update faces the foe every frame; a guard only follows after turnDelay. */
  afterUpdate(f, dt) {
    const g = EnemyGuard.spec(f);
    if (f.atk?.bash) { f.guardFace = f.face; f.guardTurnT = 0; return; } // bash locks its own direction
    if (f.guardFace == null || f.hp <= 0 || f.ragdollActive) { f.guardFace = f.face; f.guardTurnT = 0; return; }
    if (f.face === f.guardFace) { f.guardTurnT = 0; return; }
    f.guardTurnT += dt;
    if (f.guardTurnT >= g.turnDelay - 1e-9) { f.guardFace = f.face; f.guardTurnT = 0; }
    else f.face = f.guardFace;
  },
};
/* Enemy shield bash on the shared 'punch' state: wind-up (shield pulled in) -> active (short fixed
 * shove forward, box in front of the body from rig constants only) -> recovery (shield lowered; on a
 * miss this is the long punish window and the guard is open). Direction locked at start.
 * Damage = the single unchained punch every enemy throws (one ROOKIE punch before difficulty). */
export const EnemyBashes = {
  shield: {
    label: 'BASH',
    windup: 14, active: 5, step: 28, whiffRecovery: 48, hitRecovery: 22, kb: 300, stun: 16,
    box: { front: 34, halfW: 16, y: 70, halfH: 34 },   // x Fighter.S: centre front*S ahead, y*S above ground
    triggerRange: 81,                                      // inside back-lane bash contact (hits through 82px; mid 85, front 89)
    windPose:   {chest:12,neck:-3,head:3,la:-50,le:-100,ra:-40,re:-110,ll:26,lk:18,rl:-30,rk:24,hipBob:3,shPull:4},
    strikePose: {chest:-18,neck:4,head:4,la:-100,le:-20,ra:-30,re:-110,ll:38,lk:16,rl:-36,rk:26,hipBob:1,shPull:0},
    lowPose:    {chest:8,neck:2,head:4,la:-15,le:-20,ra:-10,re:-30,ll:24,lk:16,rl:-24,rk:20,hipBob:2,shPull:0},
  },
};
export const EnemyBash = {
  timeline(spec) { const su = paceEnemy(spec.windup), ac = paceEnemy(spec.active), re = paceEnemy(spec.whiffRecovery); return { su, ac, re, total: su + ac + re }; },
  tick(f) {
    const a = f.atk, sp = a.bash, t = f.atkT;
    if (f.hitDone && !a.bashHit) { a.bashHit = true; a.stepLeft = 0; a.re = Math.max(0, (t - 1) + paceEnemy(sp.hitRecovery) - (a.su + a.ac)); }
    let move = 0;
    if (t > a.su && t <= a.su + a.ac && a.stepLeft > 0) { move = t === a.su + a.ac ? a.stepLeft : Math.min(a.stepLeft, sp.step / paceEnemy(sp.active)); a.stepLeft -= move; }
    f.x += a.bashDir * move; f.vx = 0;
  },
  box(f) {
    const b = f.atk.bash.box, s = f.drawS(), cx = f.x + f.atk.bashDir * b.front * s, cy = f.groundY() + f.y - b.y * s;
    return { x: cx - b.halfW * s, y: cy - b.halfH * s, w: b.halfW * 2 * s, h: b.halfH * 2 * s };
  },
};

/* Enemy grab (Grappler) on the shared 'punch' attack state. Frames are 60 fps sim steps (Game.STEP).
 *   wind-up (arms spread, `windup` f) -> reach (`active` f, short fixed step forward) ->
 *     caught: hold the player, headbutt on hold frame `headbuttAt`, release at the headbutt, recover `hitRecovery`
 *     missed: arms overreach past the target + overcommit step, `whiffRecovery` f punish window.
 * Eligibility is pure gameplay logic in shared combat coordinates (canCatch): centre-to-centre forward gap
 * within `reach` x drawS (plus a small overlap allowance), same lane under the shared Depth.hitTolerance rule
 * (BeatEmUp.depthHitTolerance), target grounded, alive, not invulnerable/rolling, not in hitstun, not in a
 * special, not already held and outside its no-regrab window. Drawn hands are never read.
 * strike() returns no hitbox for a grab; the only damage is the headbutt, applied through takeHit.
 * Escapes: hit the Grappler during the tell/wind-up (takeHit cancels the attack), change lane, leave range, roll.
 * Hold safety: the victim releases itself the moment the holder is hit, dies, ragdolls or leaves its grab,
 * or after `maxHold` frames; other attackers cannot hit a held player. After any release the player has
 * `noRegrab` s of grab immunity and the Grappler `cooldown` s before it may grab again (no chain grabs). */
export const EnemyGrabs = {
  clinch: {
    label: 'GRAB',
    windup: 27, active: 6, reachStep: 20,                   // 0.45 s arms spread, 6 f reach with a 20 px step
    reach: 46, overlap: 6,                                  // forward centre gap <= reach x drawS (px allowance behind the chest)
    whiffRecovery: 48, overStep: 14, overFrames: 8,         // 0.8 s miss recovery, 14 px overcommit stumble
    headbuttAt: 30, headbuttWind: 10, hitRecovery: 24,      // hold 0.5 s, head pulls back 10 f, headbutt + release on frame 30
    holdGap: 34, maxHold: 40,                               // held player pinned holdGap x drawS ahead; hard cap in frames
    dmg: 9, kb: 300, stun: 22,                              // headbutt, before weapon (.85 freehand) and difficulty multipliers
    noRegrab: 1.5, cooldown: 2.5,                           // s: player grab immunity after release / Grappler grab cooldown from the catch
    triggerRange: 57,                                       // inside back-lane catch (reach x drawS + step = 57.5px; mid 60, front 64)
    guardPose:   {chest:-6,neck:2,head:2,la:-62,le:-28,ra:-48,re:-38},
    windPose:    {chest:10,neck:-4,head:2,la:-150,le:-10,ra:50,re:-20,ll:28,lk:20,rl:-30,rk:26,hipBob:4,shPull:6},
    reachPose:   {chest:-24,neck:8,head:6,la:-92,le:-4,ra:-86,re:-8,ll:38,lk:16,rl:-40,rk:28,hipBob:3,shPull:0},
    holdPose:    {chest:-8,neck:2,head:4,la:-70,le:-60,ra:-66,re:-64,ll:30,lk:18,rl:-32,rk:24,hipBob:4,shPull:0},
    buttWindPose:{chest:16,neck:-10,head:-14,la:-72,le:-64,ra:-68,re:-66,ll:28,lk:18,rl:-30,rk:24,hipBob:3,shPull:0},
    buttPose:    {chest:-26,neck:16,head:20,la:-74,le:-52,ra:-70,re:-56,ll:36,lk:18,rl:-36,rk:26,hipBob:5,shPull:0},
    missPose:    {chest:-42,neck:16,head:10,la:-104,le:2,ra:-98,re:0,ll:46,lk:22,rl:-52,rk:38,hipBob:10,shPull:0},
  },
};
export const EnemyGrab = {
  spec(f) { return f.enemyGrab ? EnemyGrabs[f.enemyGrab] : null; },
  timeline(spec) { const su = paceEnemy(spec.windup), ac = paceEnemy(spec.active), re = paceEnemy(spec.whiffRecovery); return { su, ac, re, total: su + ac + re }; },
  /** '' when the grappler can catch `target` this frame, else the reason it cannot. Gameplay state only. */
  canCatch(g, target) {
    const a = g.atk, sp = a?.grab;
    if (!sp) return 'no-grab';
    if (Game.mode !== 'beatemup') return 'mode';
    if (!target || !target.playerControlled) return 'target';
    if (target.hp <= 0 || target.ragdollActive) return 'dead';
    if (target.heldBy) return 'held';
    if (target.noRegrabT > 0) return 'no-regrab';
    if (target.invincibleT > 0 || target.inDodgeIFrames()) return 'invulnerable';
    if (!target.grounded || target.y < 0) return 'airborne';
    if (target.stun > 0) return 'stunned';
    if (target.state === 'special' || target.bladeSuper || target.specialVisual) return 'special';
    const ge = BeatEmUp.entryFor(g), te = BeatEmUp.entryFor(target);
    if (!ge || !te) return 'target';
    if (!BeatEmUp.depthClose(ge.depth, te.depth, BeatEmUp.depthHitTolerance(ge, te) + 1e-9)) return 'lane';
    const fwd = (target.x - g.x) * a.grabDir;
    if (fwd < -sp.overlap) return 'behind';
    if (fwd > sp.reach * g.drawS()) return 'range';
    return '';
  },
  /** One sim step of the grabbing Grappler (call after atkT++). */
  tick(f, other) {
    const a = f.atk, sp = a.grab, t = f.atkT;
    let move = 0;
    if (t > a.su && t <= a.su + a.ac && !a.grabHit) {
      if (a.stepLeft > 0) { move = t === a.su + a.ac ? a.stepLeft : Math.min(a.stepLeft, sp.reachStep / paceEnemy(sp.active)); a.stepLeft -= move; }
      f.x += a.grabDir * move;
      a.lastCheck = EnemyGrab.canCatch(f, other);
      if (!a.lastCheck) EnemyGrab.catch(f, other, t);
    } else if (!a.grabHit && t > a.su + a.ac && a.overLeft > 0) {
      move = Math.min(a.overLeft, sp.overStep / sp.overFrames); a.overLeft -= move; f.x += a.grabDir * move; // overcommit past the target
    }
    if (a.grabHit && a.grabVictim) {
      const victim = a.grabVictim;
      if (victim.heldBy !== f) a.grabVictim = null; // victim already freed (reset / safety release)
      else if (t - a.holdStart >= sp.headbuttAt) EnemyGrab.headbutt(f, victim);
      else EnemyGrab.pin(f, victim);
    }
    f.vx = 0;
  },
  catch(g, target, t) {
    const a = g.atk, sp = a.grab;
    a.grabHit = true; a.grabVictim = target; a.holdStart = t; a.stepLeft = 0; a.overLeft = 0; a.holdOffset = sp.holdGap * g.drawS();
    a.re = Math.max(0, t + sp.headbuttAt + paceEnemy(sp.hitRecovery) - (a.su + a.ac));
    g.grabVictim = target; g.grabCoolT = sp.cooldown; g.hitDone = 1;
    target.heldBy = g; target.heldT = 0; target.grabRelease = '';
    target.atk = null; target.atkT = 0; target.atkPhase = ''; target.chain = 0; target.chainArmed = 0; target.blocking = 0;
    target.dashLeft = 0; target.vx = 0; target.vy = 0; target.y = 0; target.state = 'hit';
    EnemyGrab.pin(g, target);
    Sfx.play('block', null);
  },
  /** Held player sits holdGap ahead of the grappler, facing it. */
  pin(g, victim) {
    victim.x = g.x + g.atk.grabDir * g.atk.holdOffset; // offset fixed at the catch (grappler's lane scale)
    victim.face = -g.atk.grabDir; victim.vx = 0; victim.vy = 0; victim.y = 0;
  },
  headbutt(g, victim) {
    const a = g.atk;
    EnemyGrab.release(victim, 'headbutt');
    const hit = { dmg: a.dmg, kb: a.kb, stun: a.stun, chip: 0, special: false, critical: false, comboFinisher: false, comboLink: false, chain: 0, grab: true };
    const te = BeatEmUp.entryFor(victim), hpBefore = victim.hp;
    const kind = te ? BeatEmUp.withDepth(te, () => victim.takeHit(hit, g)) : victim.takeHit(hit, g);
    a.headbuttKind = kind; a.headbuttDmg = hpBefore - victim.hp;
    if (te) {
      const hb = BeatEmUp.withDepth(te, () => { victim.clamp(); return { ...victim.hitbox }; });
      const cx = hb.x + hb.w / 2 - BeatEmUp.cameraX, cy = hb.y + hb.h * .2;
      Fx.hit(cx, cy); Fx.damage(cx, cy - 12, Math.round(a.headbuttDmg * 10) / 10, kind === 'block', false, victim);
    }
    Sfx.play('player-heavy-hit', victim.classProfile);
  },
  /** Release a held player cleanly (idempotent). reason: headbutt | holder-hit | holder-down | dropped | victim-down | timeout. */
  release(victim, reason) {
    const g = victim.heldBy;
    if (!g) return;
    victim.heldBy = null; victim.heldT = 0; victim.grabRelease = reason;
    victim.noRegrabT = (EnemyGrab.spec(g) || EnemyGrabs.clinch).noRegrab;
    if (victim.state === 'hit' && victim.stun <= 0 && victim.hp > 0) { victim.state = 'idle'; victim.atkPhase = ''; }
    if (g.grabVictim === victim) g.grabVictim = null;
    if (g.atk?.grab && g.atk.grabVictim === victim) g.atk.grabVictim = null;
  },
  /** Victim side of the hold, run instead of its normal update. Returns false once released. */
  holdVictim(f, dt, other) {
    const g = f.heldBy, sp = EnemyGrab.spec(g) || EnemyGrabs.clinch;
    const reason = f.hp <= 0 || f.ragdollActive ? 'victim-down'
      : g.hp <= 0 || g.ragdollActive ? 'holder-down'
        : !g.atk?.grab || g.atk.grabVictim !== f ? 'dropped'
          : f.heldT >= sp.maxHold ? 'timeout' : '';
    if (reason) { EnemyGrab.release(f, reason); return false; }
    f.heldT++;
    f.invincibleT = Math.max(0, f.invincibleT - dt); f.dodgeCooldown = Math.max(0, f.dodgeCooldown - dt);
    if (f.flash > 0) f.flash -= dt;
    f.animT += dt;
    f.state = 'hit'; f.atk = null; f.blocking = 0;
    EnemyGrab.pin(g, f);
    f.aim('held', Pose.hit(f.classProfile), .06);
    f.tickPose(dt);
    f.clamp(other);
    return true;
  },
  tickTimers(f, dt) {
    f.noRegrabT = f.noRegrabT - dt > 1e-9 ? f.noRegrabT - dt : 0;
    f.grabCoolT = f.grabCoolT - dt > 1e-9 ? f.grabCoolT - dt : 0;
  },
};

/* Enemy hazard deploy (Disruptor) on the shared 'punch' attack state. Frames are 60 fps sim steps (Game.STEP).
 *   wind-up (rear hand reaches back to the pack, `windup` f) -> activation (one frame: baton thrust, the zone is
 *   created on exactly this frame at the player's x and lane) -> recovery (`recovery` f, steps back `backStep` px).
 * The attack itself never has a hitbox (strike() returns null) and a hit during the wind-up cancels it (no zone).
 * The zone (ShockZones) is pure gameplay state, fixed once placed (never homing), with deterministic frame timing:
 *   frames 1..warn = pulsing warning (harmless), warn+1..warn+live = live, then it is removed.
 * While live, a grounded player whose centre is within halfW px of the zone x AND whose floor lane is within the
 * shared enemy lane tolerance (BeatEmUp.depthHitTolerance, the same rule enemy hits use) takes ONE small zap
 * (dmg x difficulty, short stun) per zone; stepping out or changing lane always avoids it. Invulnerable / rolling /
 * airborne players are not zapped (the zone stays armed until it expires). One zone per Disruptor at a time and
 * a `cooldown` s gap between deploys (from the activation frame). If the Disruptor dies the zone finishes its
 * current cycle, then expires; a dead Disruptor never deploys again. Zones are cleared on stage reset, wave/boss
 * start, player down and game start. Equipment art is decoration only. */
export const EnemyDeploys = {
  shockZone: {
    label: 'ZAP',
    windup: 24, active: 1, recovery: 30, backStep: 16, backFrames: 12, // 0.4 s reach, activation frame, 0.5 s step-back reset
    warn: 48, live: 90,                                                // 0.8 s warning, 1.5 s live
    halfW: 46,                                                         // px either side of the zone centre (92 px wide)
    dmg: 6, kb: 40, stun: 14,                                          // one small zap (x difficulty), short stun
    cooldown: 4,                                                       // s between deploys
    triggerRange: 240, minRange: 110,                                  // AI deploys inside this gap; backs off when closer than minRange
    guardPose:    {chest:2,neck:0,head:2,la:-55,le:-45,ra:25,re:-70},  // baton forward-low, rear hand by the hip pack
    windPose:     {chest:10,neck:-2,head:2,la:-35,le:-40,ra:55,re:-45,ll:26,lk:18,rl:-28,rk:22,hipBob:3,shPull:4},
    activatePose: {chest:-14,neck:4,head:4,la:-80,le:-4,ra:15,re:-60,ll:34,lk:16,rl:-34,rk:26,hipBob:2,shPull:0},
    recoverPose:  {chest:8,neck:-2,head:2,la:-45,le:-50,ra:25,re:-70,ll:18,lk:14,rl:-32,rk:24,hipBob:3,shPull:0},
  },
};
export const EnemyDeploy = {
  timeline(spec) { const su = paceEnemy(spec.windup), ac = paceEnemy(spec.active), re = paceEnemy(spec.recovery); return { su, ac, re, total: su + ac + re }; },
  /** One sim step of the deploying Disruptor (call after atkT++). */
  tick(f, other) {
    const a = f.atk, sp = a.deploy, t = f.atkT;
    if (t === a.su + 1 && !a.deployed) { a.deployed = true; a.zone = ShockZones.place(f, other, sp); }
    else if (t > a.su + a.ac && a.backLeft > 0) { const move = Math.min(a.backLeft, sp.backStep / sp.backFrames); a.backLeft -= move; f.x -= a.deployDir * move; }
    f.vx = 0;
  },
};
export const ShockZones = {
  list() { return BeatEmUp.hazards; },
  activeFor(owner) { return BeatEmUp.hazards.find(z => z.owner === owner) || null; },
  /** Create the zone at the target's current x and lane. Returns null when not allowed (dead owner, one-zone limit, no target). */
  place(owner, target, spec) {
    if (Game.mode !== 'beatemup' || !owner || owner.hp <= 0 || owner.ragdollActive) return null;
    if (ShockZones.activeFor(owner)) return null; // one active zone per Disruptor
    const te = target ? BeatEmUp.entryFor(target) : null;
    if (!te) return null;
    const zone = { owner, spec, x: target.x, depth: te.depth, t: 0, warn: spec.warn, live: spec.live, halfW: spec.halfW,
      dmg: spec.dmg * BeatEmUp.difficulty.damage, kb: spec.kb, stun: spec.stun, hit: false, hitFrame: 0 };
    BeatEmUp.hazards.push(zone);
    owner.deployCoolT = spec.cooldown;
    Sfx.play('block', null);
    return zone;
  },
  phase(z) { return z.t <= z.warn ? 'warn' : z.t <= z.warn + z.live ? 'live' : 'done'; },
  /** Gameplay containment: centre x inside the zone and floor lane within the shared enemy lane tolerance. */
  inside(z, entry) {
    if (!entry) return false;
    if (Math.abs(entry.f.x - z.x) > z.halfW) return false;
    const tol = BeatEmUp.depthHitTolerance({ role: 'enemy', scaleMul: 1 }, entry);
    return BeatEmUp.depthClose(z.depth, entry.depth, tol + 1e-9);
  },
  /** One sim step for every zone (fixed-step loop): advance, zap at most once while live, drop expired zones. */
  update(player) {
    const list = BeatEmUp.hazards;
    for (let i = list.length - 1; i >= 0; i--) {
      const z = list[i];
      z.t++;
      if (z.t > z.warn + z.live) { list.splice(i, 1); continue; }
      if (z.t <= z.warn || z.hit || !player) continue;
      const pf = player.f;
      if (pf.hp <= 0 || pf.ragdollActive || !pf.grounded || pf.y < 0 || pf.inDodgeIFrames() || !ShockZones.inside(z, player)) continue;
      const hit = { dmg: z.dmg, kb: z.kb, stun: z.stun, chip: 0, special: false, critical: false, comboFinisher: false, comboLink: false, chain: 0, zone: true };
      const wasBlocking = pf.blocking; pf.blocking = 0; // a floor hazard is not blockable
      const hpBefore = pf.hp;
      const kind = BeatEmUp.withDepth(player, () => pf.takeHit(hit, z.owner));
      if (pf.hp > 0 && kind !== 'hit') pf.blocking = wasBlocking;
      if (kind !== 'hit' && kind !== 'armored') continue; // invulnerable / held: stays armed
      z.hit = true; z.hitFrame = z.t;
      const cx = pf.x - BeatEmUp.cameraX, cy = BeatEmUp.floorDepthPx(player.depth) - 30;
      Fx.hit(cx, cy); Fx.damage(cx, cy - 20, Math.round((hpBefore - pf.hp) * 10) / 10, false, false, pf);
      Sfx.play('player-heavy-hit', pf.classProfile);
    }
  },
  clear() { BeatEmUp.hazards = []; },
  /** Floor marker under the fighters: amber dashed pulse + filling core while warning, bright electric fill while live. */
  draw(ctx) {
    for (const z of BeatEmUp.hazards) {
      const ph = ShockZones.phase(z), y = BeatEmUp.floorDepthPx(z.depth), x = z.x - BeatEmUp.cameraX;
      const ry = 10 * BeatEmUp.depthToScale(z.depth), rx = z.halfW, sc = Game.scale || 1;
      ctx.save();
      if (ph === 'warn') {
        const k = z.t / z.warn, pulse = .5 + .5 * Math.sin(z.t * (.25 + k * .5));
        ctx.fillStyle = 'rgba(255,194,61,' + (.1 + .18 * pulse).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,194,61,.35)';
        ctx.beginPath(); ctx.ellipse(x, y, rx * k, ry * k, 0, 0, Math.PI * 2); ctx.fill();
        ctx.setLineDash([6 / sc, 4 / sc]); ctx.lineWidth = 2.2 / sc; ctx.strokeStyle = '#FFC23D';
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (ph === 'live') {
        const flick = .75 + .25 * Math.sin(z.t * 1.7);
        ctx.globalAlpha = z.hit ? .35 : 1;
        ctx.fillStyle = 'rgba(94,230,255,' + (.28 * flick).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2.4 / sc; ctx.strokeStyle = '#E8FBFF';
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        // Short crackles hugging the floor ellipse (deterministic from the zone clock).
        ctx.strokeStyle = '#7FF0FF'; ctx.lineWidth = 1.6 / sc; ctx.lineJoin = 'round';
        for (let i = 0; i < 4; i++) {
          const a0 = (i / 4) * Math.PI * 2 + z.t * .09;
          ctx.beginPath();
          for (let j = 0; j <= 4; j++) {
            const a = a0 + j * .22, r = j % 2 ? .62 : .82;
            const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
            if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  },
};

/* Shared archetype skeleton. Every enemy archetype is drawn from the same Fighter rig:
 * one joint set from Fighter.bones() and one pose/animation pipeline (aim/tickPose).
 * An archetype may add a BODY PROFILE, which only reshapes how that rig is drawn:
 * torso/shoulder width, limb and forearm thickness, hand size, stance width, neck length,
 * an optional draw-side guard pose, and equipment pinned to named joints.
 * Profiles are draw-only: hurtboxes (42x135 x scale), combatBones(), strike geometry and
 * screen clamps never read them. No profile => the original draw path, untouched.
 * Future archetypes (rusher, heavy, grappler, guard, ranged, disruptor) are new entries here.
 * Widths/offsets are multipliers of the shared stroke or px at scale 1. */
export const ArchetypeBodyProfiles = {
  brawler: {
    torsoWidth: 1.6,       // hip-chest-neck stroke
    shoulderWidth: 7,      // shoulder yoke half-width; arms hang from the yoke ends
    limbWidth: 1.2,        // upper arms
    forearmWidth: 1.55,    // oversized forearms
    legWidth: 1.3,         // sturdy legs
    handRadius: 1.9,       // fists vs the shared joint radius
    neckScale: .55,        // shorter neck
    stanceWidth: 5,        // extra foot spread each side (knees take half)
    guardPose: {chest:6,neck:-4,head:4,la:-55,le:-100,ra:-35,re:-120}, // fists up while idle/walking
    equipment: [{ kind: 'handWraps', joints: ['la', 'ra'] }],
  },
  rusher: {
    torsoWidth: .95,       // lean torso (narrower than Brawler's 1.6)
    shoulderWidth: 1.5,    // narrow yoke
    limbWidth: .8,         // slim upper arms
    forearmWidth: .8,      // slim forearms; no oversized fists (handRadius unset)
    legWidth: .95,
    legLength: 1.12,       // longer legs; hip and upper body lift so the lowest foot stays planted
    stanceWidth: 2,
    frontWeight: 3,        // idle/walk: hips and torso shift over the lead foot (feet stay put)
    guardPose: {chest:-14,neck:8,head:4,la:-40,le:-70,ra:20,re:-60}, // forward lean, arms low and ready
    equipment: [{ kind: 'scarf', joints: ['neck'], layer: 'back' }],
  },
  heavy: {
    torsoWidth: 2.1,       // broad, thick trunk (Brawler 1.6)
    shoulderWidth: 9,      // wide yoke
    limbWidth: 1.55,       // big upper arms
    forearmWidth: 1.5,
    legWidth: 1.55,        // thick legs...
    legLength: .86,        // ...that read short: upper body sinks, lowest foot stays planted (low centre of gravity)
    handRadius: 1.6, handStyle: 'mitt', // oversized plain hands (no Brawler glove ring)
    neckScale: .4,         // head sits down between the shoulders
    stanceWidth: 8,        // wide planted stance
    guardPose: {chest:6,neck:-3,head:3,la:-38,le:-42,ra:-14,re:-48}, // hammer hand low at the side
    breathe: { amp: 1.6, rate: 2.4 }, // idle: slow weight shift side to side + breathing rise, feet planted
    stepDip: 2.4,          // walk: extra hip drop on each footfall (weighty steps)
    hitPose: {chest:26,neck:12,head:22,la:-120,le:-30,ra:-100,re:-25}, // bigger recoil on the shared hit reaction
  },
  guard: {
    torsoWidth: 1.35,      // moderately broad upper body
    shoulderWidth: 4,
    limbWidth: 1.15,
    forearmWidth: 1.25,
    legWidth: 1.15,
    neckScale: .8,
    stanceWidth: 5,        // side-on, braced
    guardPose:  {chest:4,neck:-2,head:2,la:-70,le:-60,ra:-40,re:-110}, // shield arm forward, rear hand tucked
    recoilPose: {chest:14,neck:-4,head:6,la:-58,le:-82,ra:-36,re:-112}, // block impact: shield driven back
    openPose:   {chest:8,neck:2,head:4,la:-15,le:-20,ra:-10,re:-30},    // guard broken: shield arm dropped
    equipment: [{ kind: 'riotShield', joints: ['la'] }],
  },
  grappler: {
    torsoWidth: 1.55,      // thick upper torso
    shoulderWidth: 8,      // broad shoulders / back (Brawler 7, Heavy 9)
    limbWidth: 1.3,
    forearmWidth: 1.2,
    legWidth: 1.2,
    armLength: 1.2,        // longer arms: both arm segments scaled from the shoulder (draw only)
    openHands: true,       // open grabbing hands (fingers spread), never fists
    neckScale: .6,
    stanceWidth: 6,
    guardPose: EnemyGrabs.clinch.guardPose, // idle/walk: arms slightly forward, hands ready
    equipment: [{ kind: 'wrestlingBelt', joints: ['hip'] }, { kind: 'wristWraps', joints: ['la', 'ra'] }],
  },
  disruptor: {
    torsoWidth: 1.05,      // medium/slim build
    shoulderWidth: 3,
    limbWidth: .95,
    forearmWidth: .95,
    legWidth: 1,
    neckScale: .9,
    stanceWidth: 3,
    guardPose: EnemyDeploys.shockZone.guardPose, // idle/walk: baton low in front, rear hand on the hip pack
    equipment: [{ kind: 'utilityPack', joints: ['chest'], layer: 'back' }, { kind: 'harness', joints: ['chest'] }, { kind: 'shockBaton', joints: ['la'] }],
  },
  ranged: {
    torsoWidth: .9,        // slim torso
    shoulderWidth: 1,      // narrow shoulders
    limbWidth: .8,
    forearmWidth: .8,
    legWidth: .9,
    neckScale: .85,
    stanceWidth: 2,
    guardPose: {chest:6,neck:-2,head:2,la:-60,le:-70,ra:40,re:-80}, // withdrawn: lead arm guarding, throwing hand back by the pouch
    // Throw poses (deg) for the shared thrower AI phases; release is snapped on the projectile spawn frame.
    throwPoses: {
      windup:   {chest:-8,neck:3,head:2,la:-92,le:-8,ra:150,re:100,ll:28,lk:18,rl:-26,rk:22,hipBob:1,shPull:7},  // aim: lead hand points, kunai raised behind the head
      release:  {chest:-18,neck:2,head:1,la:-58,le:-42,ra:-88,re:-6,ll:36,lk:20,rl:-32,rk:24,hipBob:-1,shPull:0}, // throwing arm fully extended
      recovery: {chest:6,neck:-1,head:2,la:-52,le:-62,ra:30,re:-50,ll:20,lk:14,rl:-20,rk:18,hipBob:0,shPull:0},   // arm returns, resets to the pouch
    },
    throwBlend: { windup: .1, recovery: .3 },
    headGear: 'hood',
    equipment: [{ kind: 'kunaiPouch', joints: ['hip'] }, { kind: 'heldKunai', joints: ['ra'] }],
  },
};
export const ArchetypeEquipment = {
  /** Riot shield on the lead hand, its long axis across the forearm line (arm forward = shield upright,
   * arm dropped = shield lowered). Decoration only: no hitbox, no block logic reads it. */
  riotShield(ctx, f, b, joint, ctxInfo) {
    const hand = b[joint], sh = joint === 'la' ? b.shL : b.shR;
    if (!hand || !sh) return;
    const { unit } = ctxInfo;
    let ax = hand.x - sh.x, ay = hand.y - sh.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const px = -ay, py = ax;                 // shield long axis (perpendicular to the arm)
    const c = { x: hand.x + ax * 4 * unit, y: hand.y + ay * 4 * unit };
    const half = 27 * unit, thick = 5 * unit;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: c.x + px * half * u + ax * thick * v, y: c.y + py * half * u + ay * thick * v }));
    ctx.save(); ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y); for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y); ctx.closePath(); };
    path(); ctx.fillStyle = 'rgba(3,8,18,.96)'; ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = 3 / Game.scale + 4 * unit; ctx.stroke();
    path(); ctx.fillStyle = f.blockFlash > 0 ? '#FFFFFF' : '#9FB4C8'; ctx.fill();
    ctx.strokeStyle = '#E6EEF5'; ctx.lineWidth = 1.6 * unit; ctx.stroke();
    // Viewport slit near the top edge.
    ctx.strokeStyle = '#2B3A4C'; ctx.lineWidth = 2 * unit;
    ctx.beginPath(); ctx.moveTo(c.x - px * half * .7, c.y - py * half * .7); ctx.lineTo(c.x - px * half * .35, c.y - py * half * .35); ctx.stroke();
    ctx.restore();
  },
  /** Trailing scarf tied at the neck. Pure decoration: drawn from draw bones, read by nothing else. */
  scarf(ctx, f, b, joint, ctxInfo) {
    const neck = b[joint], chest = b.chest;
    if (!neck || !chest) return;
    const { stroke, unit } = ctxInfo;
    const knot = { x: neck.x + (chest.x - neck.x) * .3, y: neck.y + (chest.y - neck.y) * .3 };
    const dashing = !!f.atk?.rush && f.atkT >= f.atk.rush.crouch;
    const moving = dashing || f.state === 'walk' || Math.abs(f.vx || 0) > 1;
    const back = -f.face, seg = 9 * unit, droop = (dashing ? .6 : moving ? 3 : 6.5) * unit;
    const flow = (dashing ? .95 : moving ? .75 : .35), phase = (f.walkT || 0) * 14 + (f.atkT || 0) * .45;
    const pts = [knot];
    for (let i = 1; i <= 4; i++) {
      const wave = Math.sin(phase + i * 1.1) * (moving ? 2.2 : .8) * unit * i * .5;
      pts.push({ x: knot.x + back * seg * flow * i, y: knot.y + droop * i + wave });
    }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const draw = (style, w) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke(); };
    draw('rgba(3,8,18,.96)', stroke * .62 + 3 / Game.scale);
    draw('#F2E8D2', stroke * .62);
    // Knot wrap around the neck.
    ctx.fillStyle = '#F2E8D2'; ctx.beginPath(); ctx.arc(knot.x, knot.y, stroke * .5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /** Hood + mask over the head (drawn after the head). Decoration only. */
  hood(ctx, f, b, joint, ctxInfo) {
    const h = b[joint], r = b.hr;
    if (!h || !r) return;
    const face = f.face, P = (deg, k) => ({ x: h.x + face * Math.cos(deg * Math.PI / 180) * r * k, y: h.y - Math.sin(deg * Math.PI / 180) * r * k });
    ctx.save(); ctx.lineJoin = 'round';
    // Cowl: outer arc front-top -> over the top -> back, a drape point behind the neck, inner arc back to the front.
    ctx.beginPath();
    for (let a = 55; a <= 235; a += 15) { const q = P(a, 1.32); if (a === 55) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
    ctx.lineTo(h.x - face * r * 1.25, h.y + r * 1.55);
    for (let a = 220; a >= 60; a -= 20) { const q = P(a, 1.0); ctx.lineTo(q.x, q.y); }
    ctx.closePath();
    ctx.fillStyle = '#3B3550'; ctx.fill();
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = 2.5 / Game.scale; ctx.stroke();
    // Mask over the lower face, leaving an eye slit.
    ctx.beginPath(); ctx.moveTo(h.x, h.y);
    for (let a = -80; a <= 18; a += 14) { const q = P(a, 1.02); ctx.lineTo(q.x, q.y); }
    ctx.closePath(); ctx.fillStyle = '#22202E'; ctx.fill();
    ctx.restore();
  },
  /** Kunai pouch on the lead hip with three ring handles sticking up, plus its thigh strap. Decoration only. */
  kunaiPouch(ctx, f, b, joint, ctxInfo) {
    const hip = b[joint];
    if (!hip) return;
    const { unit } = ctxInfo, face = f.face;
    const c = { x: hip.x + face * 5 * unit, y: hip.y + 5 * unit }, w = 5 * unit, hgt = 7 * unit;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = 1.8 * unit;
    for (const dx of [-2.5, 0, 2.5]) { // handles + rings
      const x = c.x + dx * unit;
      ctx.beginPath(); ctx.moveTo(x, c.y - hgt * .5); ctx.lineTo(x, c.y - hgt * .5 - 5 * unit); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, c.y - hgt * .5 - 6.3 * unit, 1.3 * unit, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.rect(c.x - w, c.y - hgt * .5, w * 2, hgt);
    ctx.fillStyle = '#4A3B2A'; ctx.fill(); ctx.lineWidth = 2 / Game.scale + .8 * unit; ctx.stroke();
    ctx.strokeStyle = '#8C7A5B'; ctx.lineWidth = 1 * unit;
    ctx.beginPath(); ctx.moveTo(c.x - w, c.y - hgt * .1); ctx.lineTo(c.x + w, c.y - hgt * .1); ctx.stroke(); // flap seam
    ctx.restore();
  },
  /** Kunai held in the throwing hand only while aiming (it leaves the hand on the release frame). Decoration only. */
  heldKunai(ctx, f, b, joint, ctxInfo) {
    if (f.enemyThrowPose !== 'windup' || f.hp <= 0 || f.ragdollActive) return;
    const hand = b[joint], el = b[joint + 'J'];
    if (!hand || !el) return;
    const { unit } = ctxInfo;
    let dx = hand.x - el.x, dy = hand.y - el.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const tip = { x: hand.x + dx * 12 * unit, y: hand.y + dy * 12 * unit }, ring = { x: hand.x - dx * 5 * unit, y: hand.y - dy * 5 * unit };
    const nx = -dy, ny = dx;
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(hand.x + dx * 4 * unit + nx * 2.4 * unit, hand.y + dy * 4 * unit + ny * 2.4 * unit);
    ctx.lineTo(tip.x, tip.y); ctx.lineTo(hand.x + dx * 4 * unit - nx * 2.4 * unit, hand.y + dy * 4 * unit - ny * 2.4 * unit); ctx.closePath();
    ctx.fillStyle = '#DCE6F5'; ctx.fill(); ctx.strokeStyle = '#20232C'; ctx.lineWidth = 1.2 * unit; ctx.stroke();
    ctx.beginPath(); ctx.arc(ring.x, ring.y, 1.6 * unit, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  },
  /** Asymmetric utility pack: a box on the back plus a pouch on the rear hip (the back side reads bulkier). Decoration only. */
  utilityPack(ctx, f, b, joint, ctxInfo) {
    const chest = b[joint], hip = b.hip;
    if (!chest || !hip) return;
    const { unit } = ctxInfo, back = -f.face;
    let ax = chest.x - hip.x, ay = chest.y - hip.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al; // up the spine
    const px = -ay * back, py = ax * back; // away from the spine, toward the back
    const quad = (c, hw, hh) => { ctx.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], i) => { const qx = c.x + px * hw * u + ax * hh * v, qy = c.y + py * hw * u + ay * hh * v; if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy); });
      ctx.closePath(); };
    const mid = { x: hip.x + (chest.x - hip.x) * .62 + px * 7 * unit, y: hip.y + (chest.y - hip.y) * .62 + py * 7 * unit };
    const pouch = { x: hip.x + px * 6 * unit - ax * 1 * unit, y: hip.y + py * 6 * unit - ay * 1 * unit };
    ctx.save(); ctx.lineJoin = 'round';
    for (const [c, hw, hh] of [[mid, 6 * unit, 10 * unit], [pouch, 4 * unit, 4 * unit]]) {
      quad(c, hw, hh); ctx.fillStyle = '#2A3442'; ctx.fill();
      ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = 2.5 / Game.scale + 1.2 * unit; ctx.stroke();
    }
    ctx.fillStyle = '#5EE6FF'; ctx.beginPath(); ctx.arc(mid.x + ax * 5 * unit, mid.y + ay * 5 * unit, 1.6 * unit, 0, Math.PI * 2); ctx.fill(); // status light
    ctx.restore();
  },
  /** Harness strap from the lead shoulder to the rear hip. Decoration only. */
  harness(ctx, f, b, joint, ctxInfo) {
    const sh = b.shFront || b.shL, hip = b.hip;
    if (!sh || !hip) return;
    const { stroke, unit } = ctxInfo, end = { x: hip.x - f.face * 4 * unit, y: hip.y };
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = stroke * .5 + 2 / Game.scale;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.strokeStyle = '#8A93A3'; ctx.lineWidth = stroke * .5;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    ctx.restore();
  },
  /** Short electric baton in the lead hand, along the forearm; the tip glows on the activation frames. Decoration only. */
  shockBaton(ctx, f, b, joint, ctxInfo) {
    const hand = b[joint], el = b[joint + 'J'];
    if (!hand || !el) return;
    const { stroke, unit } = ctxInfo;
    let dx = hand.x - el.x, dy = hand.y - el.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const back = { x: hand.x - dx * 4 * unit, y: hand.y - dy * 4 * unit }, tip = { x: hand.x + dx * 16 * unit, y: hand.y + dy * 16 * unit };
    const a = f.atk, hot = !!a?.deploy && f.atkT > a.su && f.atkT <= a.su + a.ac + 10;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = stroke * .7 + 3 / Game.scale;
    ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = '#3A4556'; ctx.lineWidth = stroke * .7;
    ctx.beginPath(); ctx.moveTo(back.x, back.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = hot ? '#FFFFFF' : '#5EE6FF'; ctx.shadowColor = '#5EE6FF'; ctx.shadowBlur = (hot ? 10 : 4) / Game.scale;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, stroke * (hot ? .7 : .45), 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },
  /** Wrestling belt across the hips with a front buckle. Decoration only. */
  wrestlingBelt(ctx, f, b, joint, ctxInfo) {
    const hip = b[joint], chest = b.chest;
    if (!hip || !chest) return;
    const { stroke, unit } = ctxInfo;
    let ax = chest.x - hip.x, ay = chest.y - hip.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const c = { x: hip.x + ax * 3 * unit, y: hip.y + ay * 3 * unit }, px = -ay, py = ax, half = 10 * unit;
    const p0 = { x: c.x - px * half, y: c.y - py * half }, p1 = { x: c.x + px * half, y: c.y + py * half };
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = stroke * 1.25 + 3 / Game.scale;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.strokeStyle = '#B3262E'; ctx.lineWidth = stroke * 1.25;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    const bk = { x: c.x + f.face * 3 * unit, y: c.y };
    ctx.fillStyle = '#F2C94C'; ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = 1.4 * unit;
    ctx.beginPath(); ctx.arc(bk.x, bk.y, stroke * .7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  },
  /** Short tape wraps at the wrists (Brawler's handWraps cover half the forearm). Decoration only. */
  wristWraps(ctx, f, b, joint, ctxInfo) {
    const hand = b[joint], elbow = b[joint + 'J'];
    if (!hand || !elbow) return;
    const { stroke, unit } = ctxInfo;
    const from = { x: elbow.x + (hand.x - elbow.x) * .72, y: elbow.y + (hand.y - elbow.y) * .72 };
    const to = { x: elbow.x + (hand.x - elbow.x) * .92, y: elbow.y + (hand.y - elbow.y) * .92 };
    ctx.save(); ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = stroke * 1.05 + 3 / Game.scale;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.strokeStyle = '#F2E8D2'; ctx.lineWidth = stroke * 1.05;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.restore();
  },

  handWraps(ctx, f, b, joint, ctxInfo) {
    const hand = b[joint], elbow = b[joint + 'J'];
    if (!hand || !elbow) return;
    const { stroke, unit } = ctxInfo;
    const from = { x: elbow.x + (hand.x - elbow.x) * .5, y: elbow.y + (hand.y - elbow.y) * .5 };
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(3,8,18,.96)'; ctx.lineWidth = stroke * 1.1 + 3 / Game.scale;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    ctx.strokeStyle = '#F2E8D2'; ctx.lineWidth = stroke * 1.1;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    // Two wrap seams across the forearm.
    const dx = hand.x - from.x, dy = hand.y - from.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    ctx.strokeStyle = '#8A7F6A'; ctx.lineWidth = 1.2 * unit;
    for (const u of [.35, .7]) {
      const cx = from.x + dx * u, cy = from.y + dy * u, h = stroke * .55;
      ctx.beginPath(); ctx.moveTo(cx - nx * h, cy - ny * h); ctx.lineTo(cx + nx * h, cy + ny * h); ctx.stroke();
    }
    ctx.restore();
  },
};
export const ArchetypeSkeleton = {
  profileFor(kind) {
    const key = EnemyArchetypes[kind]?.bodyProfile;
    return key ? ArchetypeBodyProfiles[key] || null : null;
  },
  /** Draw-only guard override: arms (and torso lean) only, while idle or walking. */
  guardActive(f) {
    return !!f.bodyProfile?.guardPose && !f.atk && !f.ragdollActive && f.hp > 0 && f.stun <= 0
      && f.grounded && !f.blocking && !f.enemyThrowPose && (f.state === 'idle' || f.state === 'walk');
  },
  /** Shared bones, reshaped by the fighter's body profile. Never used for gameplay. */
  drawBones(f) {
    const prof = f.bodyProfile;
    if (!prof) return f.bones();
    let raw, over = null;
    const noAtk = !f.atk && !f.ragdollActive && f.hp > 0 && f.stun <= 0;
    if (prof.openPose && noAtk && f.guardOpenT > 0) over = EnemyCombo.pose(prof.openPose);
    else if (prof.recoilPose && noAtk && f.guardRecoilT > 0) over = EnemyCombo.pose(prof.recoilPose);
    else if (ArchetypeSkeleton.guardActive(f)) over = EnemyCombo.pose(prof.guardPose);
    else if (prof.hitPose && !f.atk && !f.ragdollActive && f.hp > 0 && (f.state === 'hit' || f.stun > 0)) over = EnemyCombo.pose(prof.hitPose);
    if (f.atk?.slam && f.hp > 0 && !f.ragdollActive) {
      // Both hands on the hammer handle: arms point along the gameplay hammer angle.
      const phi = EnemySlam.angle(f.atk.slam, f.atkT) * Math.PI / 180;
      over = { ...(over || {}), la: phi + .18, le: -.3, ra: phi, re: 0 };
    }
    if (over) {
      const saved = f.pose;
      f.pose = { ...saved, ...over };
      try { raw = f.bones(); } finally { f.pose = saved; }
    } else raw = f.bones();
    const b = { ...raw }, face = f.face, unit = raw.lens.arm / 18;
    const add = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
    // Shorter neck: pull neck and head down toward the chest.
    const ns = prof.neckScale ?? 1;
    const ndx = (raw.neck.x - raw.chest.x) * (ns - 1), ndy = (raw.neck.y - raw.chest.y) * (ns - 1);
    b.neck = add(raw.neck, ndx, ndy); b.head = add(raw.head, ndx, ndy);
    // Shoulder yoke: lead arm (la, toward the foe) hangs from the front end, rear arm from the back end.
    const sw = (prof.shoulderWidth || 0) * unit, drop = sw * .25;
    b.shFront = add(raw.shL || raw.sh, face * sw, drop); b.shRear = add(raw.shR || raw.sh, -face * sw, drop);
    const fdx = b.shFront.x - (raw.shL || raw.sh).x, fdy = b.shFront.y - (raw.shL || raw.sh).y;
    const rdx = b.shRear.x - (raw.shR || raw.sh).x, rdy = b.shRear.y - (raw.shR || raw.sh).y;
    b.shL = b.shFront; b.laJ = add(raw.laJ, fdx, fdy); b.la = add(raw.la, fdx, fdy);
    b.shR = b.shRear; b.raJ = add(raw.raJ, rdx, rdy); b.ra = add(raw.ra, rdx, rdy);
    // Longer arms: scale upper arm and forearm from the shoulder (draw only; combatBones untouched).
    const ak = prof.armLength || 1;
    if (ak !== 1) for (const sd of ['l', 'r']) {
      const sh = b['sh' + sd.toUpperCase()], j = b[sd + 'aJ'], h = b[sd + 'a'];
      const nj = { x: sh.x + (j.x - sh.x) * ak, y: sh.y + (j.y - sh.y) * ak };
      b[sd + 'aJ'] = nj; b[sd + 'a'] = { x: nj.x + (h.x - j.x) * ak, y: nj.y + (h.y - j.y) * ak };
    }
    // Planted stance: lead foot (ll) forward, rear foot back; knees follow by half.
    const st = (prof.stanceWidth || 0) * unit;
    b.llJ = add(raw.llJ, face * st * .5, 0); b.ll = add(raw.ll, face * st, 0);
    b.rlJ = add(raw.rlJ, -face * st * .5, 0); b.rl = add(raw.rl, -face * st, 0);
    const upper = ['hip', 'chest', 'neck', 'head', 'shL', 'shR', 'shFront', 'shRear', 'laJ', 'la', 'raJ', 'ra'];
    // Weight over the lead foot (idle/walk only): hips and torso shift forward, knees by half, feet stay planted.
    const fw = ArchetypeSkeleton.guardActive(f) ? (prof.frontWeight || 0) * unit * face : 0;
    if (fw) { for (const k of upper) b[k] = add(b[k], fw, 0); b.llJ = add(b.llJ, fw * .5, 0); b.rlJ = add(b.rlJ, fw * .5, 0); }
    // Longer legs: scale both legs from the hip and lift everything above it so the lowest foot keeps its spot.
    // Idle weight shift / breathing and weighty walk steps: upper body moves, knees by half, feet planted.
    if ((prof.breathe || prof.stepDip) && ArchetypeSkeleton.guardActive(f)) {
      let dx = 0, dy = 0;
      if (prof.breathe && f.state === 'idle') { const ph = (f.animT || 0) * prof.breathe.rate; dx = Math.sin(ph) * prof.breathe.amp * unit * face; dy = -Math.max(0, Math.sin(ph * 2)) * prof.breathe.amp * .6 * unit; }
      if (prof.stepDip && f.state === 'walk') dy = Math.abs(Math.sin((f.walkT || 0) * Math.PI * 2 / .45)) * prof.stepDip * unit;
      if (dx || dy) { for (const k of upper) b[k] = add(b[k], dx, dy); b.llJ = add(b.llJ, dx * .5, dy * .5); b.rlJ = add(b.rlJ, dx * .5, dy * .5); }
    }
    const lk = prof.legLength || 1;
    if (lk !== 1) {
      const hip0 = b.hip, lift = Math.max(b.ll.y - hip0.y, b.rl.y - hip0.y, 0) * (lk - 1);
      for (const k of upper) b[k] = add(b[k], 0, -lift);
      for (const k of ['llJ', 'll', 'rlJ', 'rl']) b[k] = { x: b.hip.x + (b[k].x - hip0.x) * lk, y: b.hip.y + (b[k].y - hip0.y) * lk };
    }
    b.profile = prof; b.unit = unit;
    return b;
  },
  /** Open hands (Grappler): a palm plus three spread fingers and a thumb along the forearm line. Draw only. */
  drawOpenHands(ctx, b, stroke, col) {
    const u = b.unit, len = 7 * u, w = stroke * .38;
    for (const sd of ['r', 'l']) {
      const hand = b[sd + 'a'], el = b[sd + 'aJ'];
      let dx = hand.x - el.x, dy = hand.y - el.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const rays = [-.45, 0, .45, 1.25].map((ang, i) => {
        const c = Math.cos(ang), s = Math.sin(ang), L = i === 3 ? len * .7 : len;
        return { x: hand.x + (dx * c - dy * s) * L, y: hand.y + (dx * s + dy * c) * L };
      });
      ctx.save(); ctx.lineCap = 'round';
      for (const [style, extra] of [['rgba(3,8,18,.96)', 3 / Game.scale], [col, 0]]) {
        ctx.strokeStyle = style; ctx.lineWidth = w + extra;
        for (const r of rays) { ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(r.x, r.y); ctx.stroke(); }
        ctx.fillStyle = style; ctx.beginPath(); ctx.arc(hand.x, hand.y, stroke * .55 + extra / 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },
  /** Profile body pass; replaces the five default limb chains for profiled archetypes only. */
  drawBody(ctx, f, b, chain, stroke, col) {
    const p = b.profile;
    const info = { stroke: stroke * (p.forearmWidth || 1), unit: b.unit };
    for (const eq of p.equipment || []) if (eq.layer === 'back') for (const joint of eq.joints) ArchetypeEquipment[eq.kind]?.(ctx, f, b, joint, info);
    chain([b.hip, b.rlJ, b.rl], p.legWidth);
    chain([b.hip, b.llJ, b.ll], p.legWidth);
    chain([b.hip, b.chest, b.neck], p.torsoWidth);
    chain([b.shRear, b.chest, b.shFront], p.torsoWidth * .85);
    for (const side of ['r', 'l']) { // rear arm first so the lead arm overlaps it
      const sh = side === 'l' ? b.shL : b.shR, j = b[side + 'aJ'], hand = b[side + 'a'];
      chain([sh, j], p.limbWidth);
      chain([j, hand], p.forearmWidth);
    }
    for (const eq of p.equipment || []) if (eq.layer !== 'back') for (const joint of eq.joints) ArchetypeEquipment[eq.kind]?.(ctx, f, b, joint, info);
    if (p.openHands) ArchetypeSkeleton.drawOpenHands(ctx, b, stroke, col);
    if (!p.handRadius) return; // only profiles with a hand size get the oversized fists
    // Oversized fists on the shared hand joints.
    const r = stroke * .72 * p.handRadius;
    for (const hand of [b.ra, b.la]) {
      ctx.fillStyle = 'rgba(3,8,18,.96)'; ctx.beginPath(); ctx.arc(hand.x, hand.y, r + 2.5 / Game.scale, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 5 / Game.scale;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (p.handStyle === 'mitt') continue; // plain big hands; the glove ring stays Brawler's
      ctx.strokeStyle = '#F2E8D2'; ctx.lineWidth = 1.6 * b.unit;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, r * .62, 0, Math.PI * 2); ctx.stroke();
    }
  },
};

