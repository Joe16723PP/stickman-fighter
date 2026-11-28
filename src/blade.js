import { Sfx } from './audio.js';
import { BeatEmUp } from './beatemup.js';
import { Depth } from './config.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Game, fighters } from './game.js';

export class BladeSuper {
  static sequences = [];
  static waves = [];
  // "IAI Crescent Storm" (single slash + travelling Blade Wave): 60 frames (1.0 s) at 60 fps.
  //   charge 12 (1-12) · draw wind-up 8 (13-20) · active slash 4 (21-24, the Wave leaves on 21) · follow-through hold 12 (25-36)
  //   · recovery 14 (37-50) · sheath finish 10 (51-60). atk.su = charge, atk.ac = wind-up + active + hold, atk.re = recovery + sheath.
  // One damage event per target: the slash and the Wave share one hit set, 74 damage. Each hit target stays stunned
  // STUN_FRAMES and is knocked down when that stun ends (per target), long after Blade is free (frame 61).
  static CHARGE_FRAMES = 12;
  static STRIKES = [
    {name:'iaiDraw', windup:8, active:4, hold:12, gap:0, damage:74},
  ];
  static RECOVERY_FRAMES = 14;
  static SHEATH_FRAMES = 10;
  static STUN_FRAMES = 210; // per target, from its hit; the knockdown fires when it ends
  static strikeLength(k) { const s = this.STRIKES[k]; return s.windup + s.active + s.hold + s.gap; }
  /** First atkT frame (1-based) of strike k's window. */
  static strikeStart(k) { let f = this.CHARGE_FRAMES + 1; for (let i = 0; i < k; i++) f += this.strikeLength(i); return f; }
  static activeStart(k) { return this.strikeStart(k) + this.STRIKES[k].windup; }
  static STRIKE_FRAMES = this.STRIKES.reduce((sum, _s, k) => sum + this.strikeLength(k), 0);
  static END_FRAMES = this.RECOVERY_FRAMES + this.SHEATH_FRAMES; // atk.re
  static NOTO_FRAME = this.CHARGE_FRAMES + this.STRIKE_FRAMES + this.END_FRAMES; // sheath click = last action frame (60)
  static SHEATH_START = this.NOTO_FRAME - this.SHEATH_FRAMES + 1;
  static FACE_LOCK_FRAME = this.activeStart(0);
  static LAUNCH_FRAME = this.activeStart(0); // the Blade Wave leaves on the slash's first active frame
  static TOTAL_DAMAGE = this.STRIKES.reduce((sum, s) => sum + s.damage, 0);
  static WAVE_DAMAGE = this.TOTAL_DAMAGE; // the Wave is the slash's extended hit shape: same single hit
  static RANGE = 420;
  static SPEED = 900;
  static frameNo = 0; // BladeSuper.update steps (knockdown clock)
  static inUpdate = false;
  static pulseForFrame(frame) {
    for (let k = 0; k < this.STRIKES.length; k++) {
      const start = this.activeStart(k);
      if (frame >= start && frame < start + this.STRIKES[k].active) return k;
    }
    return -1;
  }
  /** {part:'charge'|'windup'|'active'|'hold'|'gap'|'recovery'|'sheath', strike:k|-1} for an atkT frame. */
  static phaseAt(frame) {
    if (frame <= this.CHARGE_FRAMES) return {part:'charge', strike:-1};
    for (let k = 0; k < this.STRIKES.length; k++) {
      const s = this.STRIKES[k], off = frame - this.strikeStart(k);
      if (off < 0 || off >= this.strikeLength(k)) continue;
      const part = off < s.windup ? 'windup' : off < s.windup + s.active ? 'active' : off < s.windup + s.active + s.hold ? 'hold' : 'gap';
      return {part, strike:k};
    }
    return {part:frame >= this.SHEATH_START ? 'sheath' : 'recovery', strike:-1};
  }
  static begin(owner) {
    const hits = new Set();
    const sequence = {
      owner, originX:owner.x, depth:owner.depth, face:owner.face,
      age:0, launched:false, notoDone:false, swingFxDone:[false],
      hits, strikeHits:[hits], waveHits:hits, // slash and Wave: one shared per-target hit set
      targetsHit:new Set(), knockdowns:new Map(), // target -> BladeSuper.frameNo stamp of its hit
    };
    BladeSuper.sequences.push(sequence);
    return sequence;
  }
  /** A slash or Wave contact on target: consumes its single hit; a clean hit starts its 210-frame stun -> knockdown timer. */
  static landed(sequence, target, kind) {
    if (!sequence) return;
    sequence.hits.add(target);
    const fighter = BladeSuper.fighter(target);
    if (kind === 'hit' && fighter.hp > 0) {
      sequence.targetsHit.add(target);
      // Hits during resolve belong to the step whose update has not run yet.
      sequence.knockdowns.set(target, BladeSuper.frameNo + (BladeSuper.inUpdate ? 0 : 1));
    }
  }
  static launch(sequence) {
    if (!sequence || sequence.launched) return;
    sequence.launched = true;
    sequence.face = sequence.owner.face;
    sequence.depth = sequence.owner.depth;
    sequence.groundY = sequence.owner.groundY() + sequence.owner.y;
    sequence.scale = sequence.owner.drawS();
    const minX = Game.mode === 'beatemup' ? 0 : Game.minX;
    const maxX = Game.mode === 'beatemup' ? BeatEmUp.worldMax : Game.maxX;
    const edge = sequence.face > 0 ? maxX : minX;
    const startX = Math.max(minX, Math.min(maxX, sequence.originX + sequence.face * 34 * sequence.scale));
    BladeSuper.waves.push({sequence, x:startX, previousX:startX, startX, edge, active:true});
    Sfx.play('super-dash', sequence.owner.classProfile);
  }
  /** Per-frame cue from Fighter.update: swing VFX at each strike's first active frame (shows on whiff too). */
  static frame(sequence, frame) {
    if (!sequence) return;
    const k = BladeSuper.pulseForFrame(frame);
    if (k < 0 || sequence.swingFxDone[k] || frame !== BladeSuper.activeStart(k)) return;
    sequence.swingFxDone[k] = true;
    const owner = sequence.owner, s = owner.drawS(), dir = owner.face;
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    const x = owner.x - cameraX, g = owner.groundY() + owner.y;
    // Single iai draw: one wide horizontal crescent at chest height with a glow and a 2-frame afterimage.
    Fx.bladeArc(x + dir * 30 * s, g - 70 * s, 80 * s, 22 * s, 0, dir, '#F0F9FF', 5 * s, .2, 1);
    Fx.bladeArc(x + dir * 26 * s, g - 70 * s, 80 * s, 22 * s, 0, dir, '#38BDF8', 9 * s, .2, .35);
    Fx.bladeArc(x + dir * 22 * s, g - 68 * s, 80 * s, 22 * s, 0, dir, '#38BDF8', 4 * s, .2, .45, 2 / 60);
  }
  /** Contact-only VFX for the single slash / Wave hit. */
  static contactFx(_k, x, y, scale = 1, kind = 'hit') {
    if (kind !== 'hit') return;
    Fx.flash(x, y, 30 * scale, '#FFFFFF', .16, 1);
    if (Fx.allowed(x, y)) Fx.list.push({kind:'ring',x,y,r0:6 * scale,r1:44 * scale,life:.2,max:.2,color:'#38BDF8',width:4 * scale});
    Fx.sparks(x, y, 14, '#F0F9FF', 1, .2);
  }
  static targets(sequence) {
    if (Game.mode === 'beatemup') {
      return BeatEmUp.cast.filter(entry => (sequence.owner.playerControlled ? entry.role === 'enemy' : entry.role === 'player') && entry.f.hp > 0);
    }
    return fighters.filter(target => target !== sequence.owner && target.hp > 0);
  }
  static fighter(target) { return target.f || target; }
  static laneMatches(sequence, target) {
    const specialTolerance = Depth.specialLaneTolerance(sequence.owner);
    if (Game.mode === 'beatemup') return BeatEmUp.depthClose(sequence.depth, target.depth, (specialTolerance ?? BeatEmUp.depthHitTolerance(BeatEmUp.entryFor(sequence.owner), target)) + 1e-9);
    const fighter = BladeSuper.fighter(target);
    const laneY = depth => Depth.toY(depth, Depth.BAND_1V1_TOP, Depth.BAND_1V1_BOT);
    return Math.abs(laneY(sequence.depth) - laneY(fighter.depth)) <= (specialTolerance ?? Depth.hitTolerance(sequence.owner.playerControlled)) + 1e-9;
  }
  static hit(sequence, target, wave) {
    const owner = sequence.owner, fighter = BladeSuper.fighter(target);
    if (fighter.hp <= 0 || (fighter.playerControlled && fighter.invincibleT > 0)
      || !fighter.grounded || fighter.inDodgeIFrames() || !BladeSuper.laneMatches(sequence, target)) return;
    const pulse = 0;
    // Slash and Wave share one hit per target (a blocked slash also consumes it).
    if (sequence.hits.has(target) || (owner.bladeSuper === sequence && owner.hitTargets?.get(target) === pulse)) return;
    sequence.hits.add(target);
    if (owner.hitTargets && owner.state === 'special' && owner.bladeSuper === sequence) owner.hitTargets.set(target, pulse);
    const attack = {
      dmg:wave ? this.WAVE_DAMAGE : this.STRIKES[pulse].damage,
      kb:wave ? 390 : 180, stun:owner.atk?.stun || this.STUN_FRAMES, chip:0,
      special:true, pulse, critical:!!owner.atk?.critical,
      comboFinisher:!!owner.atk?.comboFinisher, knockdown:false,
      deferKnockdown:true,
    };
    const hpBefore = fighter.hp;
    const kind = Game.mode === 'beatemup' ? BeatEmUp.withDepth(target, () => fighter.takeHit(attack, owner)) : fighter.takeHit(attack, owner);
    BladeSuper.landed(sequence, target, kind);
    const damage = Math.round((hpBefore - fighter.hp) * 10) / 10;
    owner.confirmHit(kind, damage);
    if (!owner.specialMeterTargets.has(target)) fighter.gainMeter(12);
    owner.specialMeterTargets.add(target);
    if (wave && kind === 'hit') fighter.vx = 0;
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    const groundY = Game.mode === 'beatemup' ? BeatEmUp.floorDepthPx(target.depth) : fighter.groundY();
    const x = fighter.x - cameraX, y = groundY + fighter.y - 62 * fighter.drawS();
    Fx.damage(x, y, damage, kind === 'block', attack.critical && kind !== 'block');
    if (wave && kind === 'hit') {
      BladeSuper.contactFx(0, x, y, fighter.drawS() / 1.2, kind);
      Game.stop = 2 / 60; Game.shake = 4 / 60; Game.shMag = 4;
    } else if (!wave && kind === 'hit') {
      Game.stop = 3 / 60; Game.shake = 3 / 60; Game.shMag = 2;
    }
    if (kind === 'block') Fx.blocked(x, y);
    if (!owner.specialEffectDone) {
      Sfx.play(owner.playerControlled ? 'player-special-hit' : 'super-hit', owner.classProfile);
      owner.specialEffectDone = 1;
    }
    if (Game.mode === 'beatemup' && target.kind && fighter.hp <= 0) BeatEmUp.dropItem(target);
    if (Game.mode === 'beatemup' && owner.playerControlled) {
      BeatEmUp.combo = BeatEmUp.comboT > 0 ? BeatEmUp.combo + 1 : 1;
      BeatEmUp.comboT = 2.4;
      BeatEmUp.awardScore(damage * (kind === 'block' ? 35 : 100) + BeatEmUp.combo * 25);
      if (hpBefore > 0 && fighter.hp <= 0) BeatEmUp.awardScore(target.kind === 'boss' ? 2500 : 300);
    }
    if (Game.mode === 'practice' && owner === fighters[0] && fighter.hp <= 0) Game.resetPracticeDummy(false);
  }
  /** Knockdown at the end of a target's 210-frame stun. Skipped if it is dead, already ragdolled, or gone from the stage. */
  static finishTarget(sequence, target) {
    const fighter = BladeSuper.fighter(target);
    if (!fighter || fighter.hp <= 0 || fighter.ragdollActive) return false;
    if (Game.mode === 'beatemup' ? !BeatEmUp.cast.includes(target) : !fighters.includes(fighter)) return false;
    const cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    const groundY = Game.mode === 'beatemup' ? BeatEmUp.floorDepthPx(target.depth) : fighter.groundY();
    const x = fighter.x - cameraX, y = groundY + fighter.y - 48 * fighter.drawS();
    BladeSuper.fxSlash(x - sequence.face * 42, y + 20, x + sequence.face * 42, y - 20, '#F0F9FF', 5);
    fighter.stun = 0;
    if (!(Game.mode === 'practice' && !fighter.playerControlled)) fighter.startRagdoll(sequence.owner, false);
    return true;
  }
  static noto(sequence) {
    if (!sequence || sequence.notoDone) return;
    sequence.notoDone = true;
    const owner = sequence.owner, cameraX = Game.mode === 'beatemup' ? BeatEmUp.cameraX : 0;
    const x = owner.x - sequence.face * 20 - cameraX;
    const y = owner.groundY() + owner.y - 52 * owner.drawS();
    Fx.sparks(x, y, 8, '#FFFFFF', 1, .2);
    Fx.list.push({kind:'ring',x,y,r0:3,r1:22,life:.22,max:.22,color:'#FFFFFF',width:2}); // sheath click (cosmetic; knockdowns are per-target timers)
  }
  static update(dt) {
    BladeSuper.frameNo++;
    BladeSuper.inUpdate = true;
    for (const sequence of BladeSuper.sequences) {
      sequence.age += dt / Game.STEP;
      // Interrupted action: no sheath click, the sequence just stops counting as in-action.
      if (!sequence.notoDone && sequence.age >= this.NOTO_FRAME) sequence.notoDone = true;
      for (const [target, stamp] of sequence.knockdowns) {
        if (BladeSuper.frameNo - stamp < BladeSuper.STUN_FRAMES) continue;
        sequence.knockdowns.delete(target);
        BladeSuper.finishTarget(sequence, target);
      }
    }
    for (const wave of BladeSuper.waves) {
      if (!wave.active) continue;
      const sequence = wave.sequence, step = BladeSuper.SPEED * dt * sequence.face;
      wave.previousX = wave.x;
      const rangeLeft = BladeSuper.RANGE - Math.abs(wave.x - wave.startX);
      const edgeLeft = Math.abs(wave.edge - wave.x);
      const move = Math.min(Math.abs(step), rangeLeft, edgeLeft);
      wave.x += sequence.face * move;
      for (const target of BladeSuper.targets(sequence)) {
        const fighter = BladeSuper.fighter(target);
        const radius = Math.max(20, fighter.hitbox.w * .5 + 18);
        const min = Math.min(wave.previousX, wave.x) - radius;
        const max = Math.max(wave.previousX, wave.x) + radius;
        if (fighter.x >= min && fighter.x <= max) BladeSuper.hit(sequence, target, true);
      }
      if (Math.abs(wave.x - wave.startX) >= BladeSuper.RANGE || wave.x === wave.edge) wave.active = false;
    }
    BladeSuper.waves = BladeSuper.waves.filter(wave => wave.active);
    // Sequences outlive the 60-frame action while any target's knockdown is pending or its Wave still travels.
    BladeSuper.sequences = BladeSuper.sequences.filter(sequence => !sequence.notoDone || sequence.knockdowns.size > 0
      || BladeSuper.waves.some(wave => wave.sequence === sequence));
    BladeSuper.inUpdate = false;
  }
  static draw(ctx, cameraX = 0) {
    for (const wave of BladeSuper.waves) {
      const sequence = wave.sequence, owner = sequence.owner;
      const x = wave.x - cameraX, y = sequence.groundY - 52 * sequence.scale;
      const scale = sequence.scale, dir = sequence.face;
      ctx.save();
      ctx.globalAlpha = .22; ctx.fillStyle = '#38BDF8';
      ctx.fillRect(Math.min(wave.previousX, wave.x) - cameraX, y + 50 * scale, Math.abs(wave.x - wave.previousX), 2 * scale);
      for (const [offset, alpha] of [[-18,.55],[-32,.35],[-46,.2],[-60,.1]]) {
        ctx.globalAlpha = alpha; ctx.strokeStyle = '#38BDF8'; ctx.lineWidth = 5 * scale; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.ellipse(x + dir * offset * scale, y, 18 * scale, 42 * scale, dir * .28, -1.18, 1.18); ctx.stroke();
      }
      ctx.globalAlpha = .35; ctx.strokeStyle = '#7DD3FC'; ctx.lineWidth = 9 * scale; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(x, y, 18 * scale, 42 * scale, dir * .28, -1.18, 1.18); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3.5 * scale; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.ellipse(x, y, 18 * scale, 42 * scale, dir * .28, -1.18, 1.18); ctx.stroke();
      ctx.restore();
    }
  }
  static fxSlash(x, y, x2, y2, color, width) {
    if (!Fx.allowed(x, y) && !Fx.allowed(x2, y2)) return;
    Fx.list.push({kind:'slash',x,y,x2,y2,color,width,life:.18,max:.18});
  }
  static clear() { BladeSuper.sequences = []; BladeSuper.waves = []; BladeSuper.inUpdate = false; }
}
