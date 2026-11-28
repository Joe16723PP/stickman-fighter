import { Depth } from './config.js';
import { Game } from './game.js';
import { Moves } from './moves.js';

export class Fx {
  static list = [];
  /** Seconds since the last Fx.clear. Damage popups use it to stack per target. */
  static damageClock = 0;
  static damageStacks = new WeakMap();
  /** Cosmetic-only PRNG (mulberry32). Effects must never draw from Math.random,
   *  or the control layout (via Fx.allowed) would shift gameplay randomness. */
  static seed = 0x5EED1234;
  static random() {
    let t = (Fx.seed = (Fx.seed + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  static clear() {
    Fx.list = [];
    Fx.damageClock = 0;
    Fx.damageStacks = new WeakMap();
  }
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
  static tagStaffSuper(owner, fromIndex) {
    for (let i = fromIndex; i < Fx.list.length; i++) Fx.list[i].staffSuperOwner = owner;
  }
  static clearStaffSuper(owner) {
    if (Fx.list.some(effect => effect.staffSuperOwner === owner))
      Fx.list = Fx.list.filter(effect => effect.staffSuperOwner !== owner);
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
  /** Half-ellipse sword arc on the facing side (Blade Super swings). delay = afterimage lag in seconds. */
  static bladeArc(x, y, rx, ry, rot, dir, color, width, life, alpha = 1, delay = 0) {
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'bladeArc', x, y, rx, ry, rot, dir, color, width, life:life + delay, max:life + delay, delay, alpha});
  }
  /** Short filled impact flash. */
  static flash(x, y, r, color, life, alpha = 1) {
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'flash', x, y, r, color, life, max:life, alpha});
  }
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
  static karateSuperPunch(x, y, face, s) {
    const sc = Game.scale || 1, wind = '#BFE9FF';
    const streaks = Fx.random() < .5 ? 4 : 5;
    for (let i = 0; i < streaks; i++) {
      const off = (i - (streaks - 1) / 2) * 6 * s;
      const back = (16 + Fx.random() * 24) * s;
      const life = .133 + Fx.random() * .067;
      if (!Fx.allowed(x, y)) continue;
      Fx.list.push({kind:'windLine', x:x - face * 4 * s, y:y + off, x2:x - face * (4 * s + back), y2:y + off + (Fx.random() - .5) * 10 * s, life, max:life, color:wind, alpha:.55 + Fx.random() * .25, width:(2.4 + Fx.random() * 1.2) / sc, streak:true, front:true});
    }
    for (let i = 0; i < 2; i++) {
      const life = .14 + Fx.random() * .06;
      if (!Fx.allowed(x, y)) break;
      Fx.list.push({kind:'windRing', x, y, r0:(4 + i * 7) / sc, r1:(26 + i * 16) / sc, life, max:life, color:wind, alpha:.55 + Fx.random() * .2, width:2 / sc, streak:true, front:true});
    }
  }
  static karateSuperKickMid(x, y, face, s) {
    const sc = Game.scale || 1, wind = '#BFE9FF';
    const life = .15 + Fx.random() * .05;
    if (Fx.allowed(x, y)) {
      Fx.list.push({kind:'windArc', x, y, r0:8 / sc, r1:(30 * s) / sc, a0:-Math.PI * .5 * face, a1:Math.PI * .5 * face, life, max:life, color:wind, alpha:.6 + Fx.random() * .2, width:3 / sc, streak:true, front:true});
    }
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * 8 * s;
      const len = (26 + Fx.random() * 20) * s;
      const glife = .133 + Fx.random() * .067;
      if (!Fx.allowed(x + face * (6 * s + len), y + off)) continue;
      Fx.list.push({kind:'windLine', x:x + face * 6 * s, y:y + off, x2:x + face * (6 * s + len), y2:y + off + (Fx.random() - .5) * 6 * s, life:glife, max:glife, color:wind, alpha:.55 + Fx.random() * .25, width:(2.4 + Fx.random() * 1.2) / sc, streak:true, front:true});
    }
  }
  static karateSuperKickHigh(x, y, face, s, groundY = null) {
    const sc = Game.scale || 1, wind = '#BFE9FF', crack = '#FFF3C4', starC = '#FBBF24';
    const life = .16 + Fx.random() * .04;
    if (Fx.allowed(x, y)) {
      Fx.list.push({kind:'windRing', x, y, r0:6 / sc, r1:(34 * s) / sc, life, max:life, color:wind, alpha:.65 + Fx.random() * .15, width:2.5 / sc, streak:true, front:true});
      const r = (11 * s) / sc, rot = Fx.random() * Math.PI;
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const ang = rot + i * Math.PI / 4;
        const rr = i % 2 === 0 ? r : r * .42;
        pts.push([x + Math.cos(ang) * rr, y + Math.sin(ang) * rr]);
      }
      Fx.list.push({kind:'star', x, y, pts, life:.16 + Fx.random() * .04, max:.2, color:starC, alpha:1, width:1.5 / sc});
    }
    const gy = groundY != null ? groundY - 2 * s : y + 14 * s;
    for (let i = 0; i < 3; i++) {
      const bx = x - face * 26 * s + i * face * 26 * s;
      if (!Fx.allowed(bx, gy)) continue;
      const len = (20 + Fx.random() * 16) * s;
      const seg = 2 + Math.floor(Fx.random() * 3);
      const pts = [[bx, gy]];
      for (let j = 1; j <= seg; j++) {
        pts.push([bx + face * len * (j / seg), gy + (Fx.random() - .5) * 6 * s]);
      }
      Fx.list.push({kind:'crack', x:bx, y:gy, pts, life:.15 + Fx.random() * .05, max:.2, color:crack, alpha:.5 + Fx.random() * .3, width:1.5 / sc});
    }
    for (let i = 0; i < 5; i++) {
      const ox = x - face * 18 * s + i * face * 9 * s;
      if (!Fx.allowed(ox, gy)) continue;
      Fx.list.push({kind:'dust', x:ox, y:gy, life:.16 + Fx.random() * .04, max:.2, r0:3 / sc, r1:(9 * s) / sc});
    }
  }
  static staffSuperSpin(x, y, face, s, radius = 46 * s, owner = null, staffAngle = 0) {
    const sc = Game.scale || 1;
    const wind = '#BFE9FF', teal = '#2DD4BF';
    const life = .133 + Fx.random() * .067;
    const alpha = .4 + Fx.random() * .3;
    const fxStart = Fx.list.length;
    if (Fx.allowed(x, y)) {
      Fx.list.push({kind:'windRing', x, y, r0:radius * .72, r1:radius, life, max:life, color:wind, alpha, width:(2.5 + Fx.random() * 1.5) / sc});
      Fx.list.push({kind:'windRing', x, y, r0:radius * .28, r1:radius * .66, life, max:life, color:teal, alpha:alpha * .65, width:(1.2 + Fx.random()) / sc});
    }
    // Lightning crackles along the staff and jumps around the ring.
    Fx.staffLightning(x, y, face, s, 3 + Math.floor(Fx.random() * 3), radius, staffAngle);
    if (owner) Fx.tagStaffSuper(owner, fxStart);
  }
  static staffLightning(x, y, face, s, count, radius = 46 * s, staffAngle = 0) {
    const sc = Game.scale || 1;
    const core = '#E0F7FF', glow = '#7DD3FC';
    for (let i = 0; i < count; i++) {
      const onStaff = i === 0;
      const ang = onStaff ? staffAngle : Fx.random() * Math.PI * 2;
      const len = onStaff ? (18 + Fx.random() * 24) * s : (14 + Fx.random() * 22) * s;
      const sx = onStaff
        ? x + Math.cos(ang) * (Fx.random() - .5) * radius * .72
        : x + Math.cos(ang) * radius * (.72 + Fx.random() * .16);
      const sy = onStaff
        ? y + Math.sin(ang) * (Fx.random() - .5) * radius * .72
        : y + Math.sin(ang) * radius * (.72 + Fx.random() * .16);
      const seg = 2 + Math.floor(Fx.random() * 2);
      const pts = [[sx, sy]];
      for (let j = 1; j <= seg; j++) {
        pts.push([sx + Math.cos(ang + (Fx.random() - .5) * .9) * len * (j / seg) * face,
                  sy + Math.sin(ang + (Fx.random() - .5) * .9) * len * (j / seg)]);
      }
      if (!Fx.allowed(sx, sy) && !Fx.allowed(pts[pts.length - 1][0], pts[pts.length - 1][1])) continue;
      Fx.list.push({kind:'crack', x:sx, y:sy, pts, life:.12 + Fx.random() * .06, max:.18, color:glow, alpha:.6 + Fx.random() * .25, width:(1.2 + Fx.random() * .8) / sc});
      Fx.list.push({kind:'crack', x:sx, y:sy, pts, life:.12 + Fx.random() * .06, max:.18, color:core, alpha:.8 + Fx.random() * .2, width:.6 / sc});
    }
  }
  static staffSuperSlam(x, y, face, s, groundY = null, owner = null) {
    const sc = Game.scale || 1;
    const crackC = '#FFF3C4', core = '#E0F7FF', glow = '#7DD3FC';
    const gy = groundY != null ? groundY : y;
    const fxStart = Fx.list.length;
    // Sky bolt striking the impact point.
    const boltLife = .133 + Fx.random() * .067;
    const topY = gy - (90 + Fx.random() * 40) * s;
    const seg = 4 + Math.floor(Fx.random() * 3);
    const pts = [[x, gy]];
    for (let j = 1; j < seg; j++) {
      pts.push([x + face * (Fx.random() - .5) * 30 * s * (1 - j / seg),
                gy - (gy - topY) * (j / seg) + (Fx.random() - .5) * 20 * s]);
    }
    pts.push([x + face * (Fx.random() - .5) * 10 * s, topY]);
    if (Fx.allowed(x, gy) || Fx.allowed(pts[pts.length - 1][0], pts[pts.length - 1][1])) {
      Fx.list.push({kind:'crack', x, y:gy, pts, life:boltLife, max:boltLife, color:glow, alpha:.65 + Fx.random() * .2, width:(2 + Fx.random()) / sc});
      Fx.list.push({kind:'crack', x, y:gy, pts, life:boltLife, max:boltLife, color:core, alpha:.85 + Fx.random() * .15, width:.8 / sc});
    }
    // Branches crawling along the ground.
    for (let i = 0; i < 4; i++) {
      const bx = x + face * (Fx.random() * 18 - 6) * s;
      if (!Fx.allowed(bx, gy)) continue;
      const minReach = Moves.staffSpecial.slamGroundCrackReach * .42;
      const len = (minReach + Fx.random() * (Moves.staffSpecial.slamGroundCrackReach - minReach)) * s;
      const branchSeg = 2 + Math.floor(Fx.random() * 3);
      const bpts = [[bx, gy]];
      for (let j = 1; j <= branchSeg; j++) {
        bpts.push([bx + face * len * (j / branchSeg), gy + (Fx.random() - .5) * 8 * s]);
      }
      Fx.list.push({kind:'crack', x:bx, y:gy, pts:bpts, life:.12 + Fx.random() * .06, max:.18, color:crackC, alpha:.5 + Fx.random() * .3, width:(1.2 + Fx.random() * .8) / sc});
    }
    // Dust puffs around the impact.
    for (let i = 0; i < 6; i++) {
      const ox = x + face * (Fx.random() * 50 - 15) * s;
      if (!Fx.allowed(ox, gy)) continue;
      Fx.list.push({kind:'dust', x:ox, y:gy, life:.14 + Fx.random() * .06, max:.2, r0:(3 * s) / sc, r1:(11 * s) / sc});
    }
    if (owner) Fx.tagStaffSuper(owner, fxStart);
  }
  static wardGuard(x, y, profile) {
    const sc = Game.scale || 1, color = profile?.accent || '#C4B5FD';
    if (!Fx.allowed(x, y)) return;
    Fx.list.push({kind:'ring',x,y,r0:10 / sc,r1:30 / sc,life:.2,max:.2,color,width:3 / sc});
    Fx.sparks(x,y,5,color,.55,.12);
  }
  /**
   * Floating "-N" for one hit. N is a whole number, at least 1.
   * A repeat on the same target within 0.25s of that target's previous popup
   * steps -14px in y per popup in the chain and alternates x by +8 / -8.
   * A later popup starts at x, y again. target is the fighter that was hit.
   */
  static damage(x, y, amount, blocked, critical = false, target = null) {
    if (amount <= 0 || !Fx.allowed(x, y)) return;
    const value = Math.max(1, Math.round(amount));
    let ox = 0, oy = 0;
    if (target) {
      const now = Fx.damageClock;
      const prev = Fx.damageStacks.get(target);
      if (!prev || now - prev.t > 0.25) Fx.damageStacks.set(target, { t: now, n: 0 });
      else {
        const n = prev.n + 1;
        prev.n = n;
        prev.t = now;
        ox = n % 2 ? 8 : -8;
        oy = -14 * n;
      }
    }
    Fx.list.push({kind:'damage', text:(critical ? 'CRITICAL!  ' : '') + '-' + value, x: x + ox, y: y + oy, life:critical ? .95 : .7, max:critical ? .95 : .7, color:critical ? '#FFE16B' : blocked ? '#FBBF24' : '#FFFFFF', critical});
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
  /**
   * Running damage total + one combo label for a Karate super string.
   * Reuses the existing 'damage' and 'combo' draw branches; these entries do not drift.
   */
  /** Fixed slot for the Karate super's running total: centred between the two heads, above both name tags and the ×N badge. */
  static karateSuperSlot(ba, bb) {
    const sc = Game.scale || 1;
    return { x: (ba.head.x + bb.head.x) / 2, y: Math.min(ba.y0, bb.y0) - 63 / sc };
  }
  static karateSuperText(owner, atkRef, x, y, damage, critical, comboText, profile) {
    if (damage <= 0) return; // same rule as Fx.damage: no text for a hit that took no HP
    let damageEntry = null;
    for (const e of Fx.list) {
      if (e.kind === 'damage' && e.karateSuper && e.owner === owner && e.atkRef === atkRef) { damageEntry = e; break; }
    }
    if (damageEntry) {
      damageEntry.total += damage;
      damageEntry.text = (critical ? 'CRITICAL!  ' : '') + '-' + (Math.round(damageEntry.total * 10) / 10);
      damageEntry.life = damageEntry.max;
    } else {
      if (!Fx.allowed(x, y)) return;
      Fx.list = Fx.list.filter(e => !(e.karateSuper && (e.kind === 'damage' || e.kind === 'combo') && e.owner === owner));
      const total = damage;
      Fx.list.push({
        kind:'damage', karateSuper:true, owner, atkRef, total,
        x, y, text:(critical ? 'CRITICAL!  ' : '') + '-' + (Math.round(total * 10) / 10),
        life:.95, max:.95,
        color:critical ? '#FFE16B' : '#FFFFFF', critical
      });
      damageEntry = Fx.list[Fx.list.length - 1];
    }
    if (comboText) {
      let comboEntry = null;
      for (const e of Fx.list) {
        if (e.kind === 'combo' && e.karateSuper && e.owner === owner && e.atkRef === atkRef) { comboEntry = e; break; }
      }
      if (comboEntry) {
        comboEntry.text = comboText;
        comboEntry.life = comboEntry.max;
      } else {
        const cy = y - 26 / (Game.scale || 1);
        if (!Fx.allowed(x, cy)) return;
        Fx.list.push({
          kind:'combo', karateSuper:true, owner, atkRef,
          x, y:cy, text:comboText,
          life:.95, max:.95,
          color:profile?.accent || '#FBBF24'
        });
        comboEntry = Fx.list[Fx.list.length - 1];
      }
      comboEntry.x = damageEntry.x;
      comboEntry.y = damageEntry.y - 26 / (Game.scale || 1);
    }
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
  static land(x, y = Game.GROUND) {
    const sc = Game.scale || 1;
    for (let i = 0; i < 3; i++) {
      const ox = x + (i - 1) * (6 / sc);
      if (!Fx.allowed(ox, y - 2 / sc)) continue;
      Fx.list.push({kind: 'dust', x: ox, y, life: .2, max: .2, r0: 4 / sc, r1: 10 / sc});
    }
  }
  static update(dt) {
    Fx.damageClock += dt;
    let write = 0;
    for (let i = 0; i < Fx.list.length; i++) {
      const e = Fx.list[i];
      e.life -= dt;
      if (e.kind === 'damage' && !e.karateSuper) e.y -= 30 * dt;
      if (e.kind === 'combo' && !e.karateSuper) e.y -= 42 * dt;
      if (e.kind === 'stun') e.y -= 24 * dt;
      if (e.kind === 'ring') e.radius = e.r0 + (e.r1 - e.r0) * (1 - e.life / e.max);
      if (e.life > 0) Fx.list[write++] = e;
    }
    Fx.list.length = write;
  }
  /** Practice: game-space y (in the shaken draw space) above which effects are clipped; null elsewhere. */
  static hudClipY() {
    if (Game.mode !== 'practice') return null;
    const sc = Game.scale || 1;
    // Game.bars panel bottom = (12 + safeTop - 2 + 34) CSS px; +1 for its stroke, then the clearance.
    return (12 + Game.safeTop - 2 + 34 + 1 + Depth.HUD_CLEAR_PX) / sc - (Game.drawShakeY || 0);
  }
  static tapered(ctx, x, y, x2, y2, width, color, alpha) {
    const dx = x2 - x, dy = y2 - y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len * width / 2, ny = dx / len * width / 2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + nx, y + ny);
    ctx.lineTo(x - nx, y - ny);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fill();
  }
  /** Soft gold chest glow used while a Karate super is winding up. */
  static chargeAura(ctx, x, y, radius) {
    if (!Fx.allowed(x, y) || radius <= 0) return;
    const glow = ctx.createRadialGradient(x, y, radius * .08, x, y, radius);
    glow.addColorStop(0, '#FFFFFF');
    glow.addColorStop(.32, '#FBBF24');
    glow.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.save();
    ctx.globalAlpha = .78;
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .95;
    ctx.strokeStyle = '#FFF6D0';
    ctx.lineWidth = Math.max(1.25, radius * .07);
    ctx.beginPath(); ctx.arc(x, y, radius * .9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  static draw(ctx, pass = 'all') {
    const sc = Game.scale;
    for (const e of Fx.list) {
      if (pass === 'back' && e.front) continue;
      if (pass === 'front' && !e.front) continue;
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
        const ringR = e.radius || e.r0, hudLimit = Fx.hudClipY();
        const clipRing = hudLimit !== null && e.y - ringR - e.width / 2 < hudLimit;
        // Lanes: a back-lane hit ring keeps its size and centre but is clipped below the HUD clearance line.
        if (clipRing) { ctx.save(); ctx.beginPath(); ctx.rect(-Game.W, hudLimit, Game.W * 3, Game.H * 2); ctx.clip(); }
        ctx.beginPath(); ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2); ctx.stroke();
        if (clipRing) ctx.restore();
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
      } else if (e.kind === 'windLine') {
        const grow = e.streak ? .28 + .72 * t : 1;
        const x2 = e.x + (e.x2 - e.x) * grow, y2 = e.y + (e.y2 - e.y) * grow;
        if (!Fx.allowed(e.x, e.y) && !Fx.allowed(x2, y2)) continue;
        const fade = e.alpha * (e.life / e.max);
        const hudLine = Fx.hudClipY(), clipLine = hudLine !== null && Math.min(e.y, y2) - e.width < hudLine;
        if (clipLine) { ctx.save(); ctx.beginPath(); ctx.rect(-Game.W, hudLine, Game.W * 3, Game.H * 2); ctx.clip(); }
        if (e.streak) {
          Fx.tapered(ctx, e.x, e.y, x2, y2, e.width * 2.6, e.color, fade);
          Fx.tapered(ctx, e.x, e.y, x2, y2, e.width * .85, '#F7FBFF', fade);
        } else {
          ctx.globalAlpha = fade;
          ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(x2, y2); ctx.stroke();
        }
        if (clipLine) ctx.restore();
      } else if (e.kind === 'windArc' || e.kind === 'windRing') {
        if (!Fx.allowed(e.x, e.y)) continue;
        const fade = e.alpha * (e.life / e.max);
        ctx.lineCap = 'round';
        const ringR = e.r0 + (e.r1 - e.r0) * t, hudLimit = Fx.hudClipY();
        const clipRing = hudLimit !== null && e.y - ringR - e.width / 2 < hudLimit;
        if (clipRing) { ctx.save(); ctx.beginPath(); ctx.rect(-Game.W, hudLimit, Game.W * 3, Game.H * 2); ctx.clip(); }
        if (e.streak && e.kind === 'windRing') {
          const glow = ctx.createRadialGradient(e.x, e.y, ringR * .12, e.x, e.y, ringR);
          glow.addColorStop(0, '#FFFFFF');
          glow.addColorStop(.4, e.color);
          glow.addColorStop(1, 'rgba(191,233,255,0)');
          ctx.globalAlpha = fade * .8;
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = fade;
          ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = Math.max(1, e.width * .7);
          ctx.beginPath(); ctx.arc(e.x, e.y, ringR * .92, 0, Math.PI * 2); ctx.stroke();
        } else if (e.streak) {
          const sweep = e.a0 + (e.a1 - e.a0) * (.2 + .8 * t);
          ctx.globalAlpha = fade;
          ctx.strokeStyle = e.color; ctx.lineWidth = e.width * 1.8;
          ctx.beginPath(); ctx.arc(e.x, e.y, ringR, e.a0, sweep); ctx.stroke();
          ctx.strokeStyle = '#F7FBFF'; ctx.lineWidth = Math.max(1, e.width * .65);
          ctx.beginPath(); ctx.arc(e.x, e.y, ringR, e.a0, sweep); ctx.stroke();
        } else {
          ctx.globalAlpha = fade;
          ctx.strokeStyle = e.color; ctx.lineWidth = e.width;
          ctx.beginPath();
          if (e.kind === 'windArc') ctx.arc(e.x, e.y, ringR, e.a0, e.a1);
          else ctx.arc(e.x, e.y, ringR, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (clipRing) ctx.restore();
      } else if (e.kind === 'star') {
        if (!Fx.allowed(e.x, e.y)) continue;
        ctx.globalAlpha = e.alpha * (e.life / e.max);
        ctx.fillStyle = e.color; ctx.strokeStyle = '#11131A'; ctx.lineWidth = e.width; ctx.lineJoin = 'miter';
        const hudStar = Fx.hudClipY(), clipStar = hudStar !== null && Math.min(...e.pts.map(p => p[1])) - e.width < hudStar;
        if (clipStar) { ctx.save(); ctx.beginPath(); ctx.rect(-Game.W, hudStar, Game.W * 3, Game.H * 2); ctx.clip(); }
        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i++) { const p = e.pts[i]; if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        if (clipStar) ctx.restore();
      } else if (e.kind === 'bladeArc') {
        const age = e.max - e.life;
        if (age < e.delay || !Fx.allowed(e.x, e.y)) continue;
        const fade = e.life / (e.max - e.delay);
        ctx.globalAlpha = e.alpha * fade;
        ctx.strokeStyle = e.color; ctx.lineWidth = e.width * (0.6 + 0.4 * fade); ctx.lineCap = 'round';
        const a0 = e.dir > 0 ? -Math.PI / 2 : Math.PI / 2, a1 = e.dir > 0 ? Math.PI / 2 : Math.PI * 1.5;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.rx, e.ry, e.rot, a0, a1); ctx.stroke();
      } else if (e.kind === 'flash') {
        if (!Fx.allowed(e.x, e.y)) continue;
        const fade = e.life / e.max;
        ctx.globalAlpha = e.alpha * fade; ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.7 + 0.5 * (1 - fade)), 0, Math.PI * 2); ctx.fill();
      } else if (e.kind === 'crack') {
        if (!Fx.allowed(e.x, e.y)) continue;
        ctx.globalAlpha = e.alpha * (e.life / e.max);
        ctx.strokeStyle = e.color; ctx.lineWidth = e.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i++) { const p = e.pts[i]; if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}


/** Blade-only Crescent Storm wave and its independent hit / Noto tracking. */
