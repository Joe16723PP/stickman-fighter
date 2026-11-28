import { Game, fighters } from './game.js';
import { BeatEmUp } from './beatemup.js';
import { BladeSuper } from './blade.js';
import { BossSignatures, PACE } from './config.js';

// Karate has no combo sheet. Both Attack punches play `punch` (one jab).
const CLIPS = { idle: 6, walk: 8, punch: 6, kick: 12, fall: 8, roll: 8, special: 24 };
const FRAME_W = 174;
const FRAME_H = 222;
const BASELINE = 206;
const WALK_BOX = { w: 168, h: 222, baseline: 206 };
const WALK_ANCHOR = 85;
const IDLE_BOX = { w: 154, h: 220, baseline: 204 };
const IDLE_ANCHOR = 77;
const PUNCH_BOX = { w: 194, h: 220, baseline: 204 };
const PUNCH_ANCHOR = 82;
const KICK_BOX = { w: 206, h: 224, baseline: 208 };
const KICK_ANCHOR = 79;
const SPECIAL_BOX = { w: 212, h: 232, baseline: 216 };
const SPECIAL_ANCHOR = 97;
const ROLL_BOX = { w: 172, h: 220, baseline: 204 };
const ROLL_ANCHOR = 85;
const FALL_BOX = { w: 226, h: 220, baseline: 204 };
const FALL_ANCHOR = 111;
const BODY = 188;
const STAFF_IDLE_COUNT = 6;
const STAFF_IDLE_BOX = { w: 170, h: 228, baseline: 212 };
const STAFF_IDLE_ANCHOR = 82;
const STAFF_WALK_COUNT = 8;
const STAFF_WALK_BOX = { w: 184, h: 222, baseline: 206 };
const STAFF_WALK_ANCHOR = 89;
const STAFF_ROLL_COUNT = 8;
const STAFF_ROLL_BOX = { w: 184, h: 220, baseline: 204 };
const STAFF_ROLL_ANCHOR = 90;
const STAFF_FALL_COUNT = 8;
const STAFF_FALL_BOX = { w: 218, h: 220, baseline: 204 };
const STAFF_FALL_ANCHOR = 105;
const STAFF_PUNCH_COUNT = 6;
const STAFF_PUNCH_BOX = { w: 258, h: 220, baseline: 204 };
const STAFF_PUNCH_ANCHOR = 106;
const STAFF_KICK_COUNT = 8;
const STAFF_KICK_BOX = { w: 236, h: 220, baseline: 204 };
const STAFF_KICK_ANCHOR = 95;
const STAFF_SPECIAL_COUNT = 12;
const STAFF_SPECIAL_BOX = { w: 244, h: 234, baseline: 218 };
const STAFF_SPECIAL_ANCHOR = 99;
// Per-clip boxes from assets/characters/blade/frames/clips.json. Body height matches Staff (188).
const BLADE = {
  idle: { count: 6, box: { w: 156, h: 224, baseline: 208 }, anchor: 76 },
  walk: { count: 8, box: { w: 158, h: 224, baseline: 208 }, anchor: 76 },
  roll: { count: 8, box: { w: 222, h: 220, baseline: 204 }, anchor: 102 },
  fall: { count: 8, box: { w: 236, h: 220, baseline: 204 }, anchor: 125 },
  punch: { count: 6, box: { w: 274, h: 224, baseline: 208 }, anchor: 90 },
  kick: { count: 6, box: { w: 316, h: 266, baseline: 250 }, anchor: 115 },
  special: { count: 12, box: { w: 258, h: 250, baseline: 234 }, anchor: 88 },
};
// Per-clip boxes from assets/characters/brawler/frames/clips.json and rusher/frames/clips.json.
// Body height matches Staff and Blade (188).
const BRAWLER = {
  idle: { count: 6, box: { w: 152, h: 224, baseline: 208 }, anchor: 84 },
  walk: { count: 8, box: { w: 156, h: 222, baseline: 206 }, anchor: 83 },
  'jab-cross': { count: 8, box: { w: 270, h: 222, baseline: 206 }, anchor: 107 },
  fall: { count: 8, box: { w: 258, h: 220, baseline: 204 }, anchor: 143 },
};
const RUSHER = {
  idle: { count: 6, box: { w: 152, h: 222, baseline: 206 }, anchor: 80 },
  walk: { count: 8, box: { w: 198, h: 222, baseline: 206 }, anchor: 89 },
  rush: { count: 8, box: { w: 326, h: 248, baseline: 232 }, anchor: 150 },
  fall: { count: 8, box: { w: 308, h: 220, baseline: 204 }, anchor: 159 },
};
// Per-clip boxes from assets/characters/grappler/frames/clips.json. Body height stays 188.
const GRAPPLER = {
  idle: { count: 6, box: { w: 182, h: 222, baseline: 206 }, anchor: 86 },
  walk: { count: 6, box: { w: 180, h: 218, baseline: 202 }, anchor: 84 },
  grab: { count: 6, box: { w: 216, h: 234, baseline: 218 }, anchor: 106 },
  fall: { count: 6, box: { w: 212, h: 198, baseline: 182 }, anchor: 104 },
};
// Per-clip boxes from assets/characters/block-captain/frames/clips.json.
// Body height stays 188, same as the other posed casts. His larger size is the existing
// boss scaleMul (1.25, and the phase sizes the vector body already uses), not a taller clip.
const BLOCK_CAPTAIN = {
  idle: { count: 6, box: { w: 138, h: 220, baseline: 204 }, anchor: 79 },
  walk: { count: 8, box: { w: 150, h: 222, baseline: 206 }, anchor: 76 },
  'jab-hook': { count: 8, box: { w: 244, h: 222, baseline: 206 }, anchor: 94 },
  special: { count: 12, box: { w: 294, h: 266, baseline: 250 }, anchor: 138 },
  fall: { count: 8, box: { w: 260, h: 224, baseline: 208 }, anchor: 127 },
};
// Per-clip boxes from assets/characters/dockmaster/frames/clips.json.
// Body height stays 188, same as the other posed casts. His larger size is the existing
// boss scaleMul (1.28, and the phase sizes the vector body already uses), not a taller clip.
const DOCKMASTER = {
  idle: { count: 6, box: { w: 164, h: 222, baseline: 206 }, anchor: 84 },
  walk: { count: 6, box: { w: 160, h: 222, baseline: 206 }, anchor: 80 },
  'chain-lash': { count: 6, box: { w: 238, h: 220, baseline: 204 }, anchor: 103 },
  'low-swing': { count: 6, box: { w: 216, h: 202, baseline: 186 }, anchor: 102 },
  special: { count: 6, box: { w: 254, h: 212, baseline: 196 }, anchor: 106 },
  fall: { count: 6, box: { w: 208, h: 200, baseline: 184 }, anchor: 98 },
};
const ENEMY_CLIPS = { brawler: BRAWLER, rusher: RUSHER, grappler: GRAPPLER, 'block-captain': BLOCK_CAPTAIN, dockmaster: DOCKMASTER };
const STICK_W = 300;
const STICK_H = 340;
const STICK_FOOT = 310;
const views = new Map();
let seq = 0;
let worldCanvas = null;
let hudCanvas = null;
let worldImage = null;
let hudImage = null;

function key(name, index) {
  return 'karate-' + name + '-' + index;
}

function clipOf(fighter) {
  if (fighter.ragdollActive || fighter.state === 'ko' || fighter.hp <= 0 || fighter.state === 'hit') return 'fall';
  if (fighter.state === 'roll') return 'roll';
  if (fighter.state === 'special' && fighter.classId === 'freehand') return 'special';
  if (fighter.state === 'kick') return 'kick';
  if (fighter.state === 'punch') return 'punch';
  if (fighter.state === 'walk') return 'walk';
  return 'idle';
}

function frameOf(fighter, name) {
  const count = CLIPS[name];
  if (name === 'walk' || name === 'idle') return Math.floor((fighter.animT || 0) * PACE.spriteFps) % count;
  if (name === 'roll') {
    const duration = PACE.dodgeDuration;
    const elapsed = Math.max(0, duration - (fighter.dodgeT || 0));
    return Math.max(0, Math.min(count - 1, Math.floor(elapsed / duration * count)));
  }
  if (name === 'special') {
    const attack = fighter.atk;
    const su = attack ? attack.su : 16;
    const ac = attack ? attack.ac : 24;
    const re = attack ? attack.re : 30;
    const t = fighter.atkT || 0;
    const wind = 4;
    const strike = 15;
    const recover = count - wind - strike;
    let index;
    if (t <= su) index = Math.min(wind - 1, Math.floor((su ? t / su : 1) * wind));
    else if (t <= su + ac) index = wind + Math.min(strike - 1, Math.floor((ac ? (t - su) / ac : 1) * strike));
    else index = wind + strike + Math.min(recover - 1, Math.floor((re ? Math.min(1, (t - su - ac) / re) : 1) * recover));
    return Math.max(0, Math.min(count - 1, index));
  }
  if (name === 'kick') {
    const attack = fighter.atk;
    const su = attack ? attack.su : 9;
    const ac = attack ? attack.ac : 3;
    const re = attack ? attack.re : 16;
    const t = fighter.atkT || 0;
    const wind = 6;
    const strike = 2;
    const recover = Math.max(1, count - wind - strike);
    let index;
    if (t <= su) index = Math.min(wind - 1, Math.floor((su ? t / su : 1) * wind));
    else if (t <= su + ac) index = wind + Math.min(strike - 1, Math.floor((ac ? (t - su) / ac : 1) * strike));
    else index = wind + strike + Math.min(recover - 1, Math.floor((re ? Math.min(1, (t - su - ac) / re) : 1) * recover));
    return Math.max(0, Math.min(count - 1, index));
  }
  // One jab for Attack hits 1 and 2: frames 0–2 wind up, frame 3 (arm extended)
  // holds through the active window, frames 4–5 recover. Not sliced like Blade.
  if (name === 'punch') {
    const attack = fighter.atk;
    const su = attack ? attack.su : 4;
    const ac = attack ? attack.ac : 2;
    const re = attack ? attack.re : 9;
    const t = fighter.atkT || 0;
    const wind = 3;
    const strike = 1;
    const recover = Math.max(1, count - wind - strike);
    let index;
    if (t <= su) index = Math.min(wind - 1, Math.floor((su ? t / su : 1) * wind));
    else if (t <= su + ac) index = wind;
    else index = wind + strike + Math.min(recover - 1, Math.floor((re ? Math.min(1, (t - su - ac) / re) : 1) * recover));
    return Math.max(0, Math.min(count - 1, index));
  }
  if (name === 'fall') {
    const now = fighter.animT || 0;
    if (fighter._clipName !== name) {
      fighter._clipName = name;
      fighter._clipStart = now;
    }
    return Math.max(0, Math.min(count - 1, Math.floor((now - fighter._clipStart) * 12)));
  }
  const now = fighter.animT || 0;
  if (fighter._clipName !== name) {
    fighter._clipName = name;
    fighter._clipStart = now;
  }
  return Math.max(0, Math.min(count - 1, Math.floor((now - fighter._clipStart) * 12)));
}

function staffClip(fighter) {
  if (fighter.classId !== 'staff') return null;
  if (fighter.ragdollActive || fighter.hp <= 0 || fighter.state === 'ko' || fighter.state === 'hit') return 'fall';
  if (fighter.state === 'special') return 'special';
  if (fighter.state === 'kick') return 'kick';
  if (fighter.state === 'punch') return 'punch';
  if (fighter.atk) return null;
  if (fighter.state === 'roll') return 'roll';
  if (fighter.state === 'walk') return 'walk';
  return 'idle';
}

function staffSpecialFrame(fighter) {
  const su = fighter.atk ? fighter.atk.su : 32;
  const delays = fighter.atk?.hitDelays || [0, 24, 48];
  const durations = fighter.atk?.hitDurations || [10, 10, 14];
  const t = fighter.atkT || 0;
  if (t <= su) return t <= su * 0.55 ? 0 : 1;
  const off = t - su - 1;
  const hit1End = delays[0] + durations[0] - 1;
  const gapEnd = delays[1] - 1;
  const hit2End = delays[1] + durations[1] - 1;
  const prepEnd = delays[2] - 1;
  const slamEnd = delays[2] + durations[2] - 1;
  if (off <= hit1End) return off < delays[0] + durations[0] / 2 ? 2 : 3;
  if (off <= gapEnd) {
    const span = Math.max(1, gapEnd - hit1End);
    return 4 + Math.min(2, Math.floor((off - hit1End - 1) * 3 / span));
  }
  if (off <= hit2End) return 7;
  if (off <= prepEnd) return (off - hit2End) * 2 <= Math.max(1, prepEnd - hit2End) ? 8 : 9;
  if (off <= slamEnd) return 10;
  return 11;
}

function staffFrame(fighter, name) {
  if (fighter._staffClip !== name) {
    fighter._staffClip = name;
    fighter._staffClipStart = fighter.animT || 0;
  }
  if (name === 'fall') {
    return Math.max(0, Math.min(STAFF_FALL_COUNT - 1, Math.floor(((fighter.animT || 0) - fighter._staffClipStart) * 12)));
  }
  if (name === 'punch') return chainSlice(fighter, (fighter.atk?.chain || 0) <= 0 ? 0 : 3, 3);
  if (name === 'kick') {
    const attack = fighter.atk;
    const su = attack ? attack.su : 23;
    const ac = attack ? attack.ac : 6;
    const re = attack ? attack.re : 36;
    const t = fighter.atkT || 0;
    const wind = 4;
    const strike = 2;
    const recover = STAFF_KICK_COUNT - wind - strike;
    let index;
    if (t <= su) index = Math.min(wind - 1, Math.floor((su ? t / su : 1) * wind));
    else if (t <= su + ac) index = wind + Math.min(strike - 1, Math.floor((ac ? (t - su) / ac : 1) * strike));
    else index = wind + strike + Math.min(recover - 1, Math.floor((re ? Math.min(1, (t - su - ac) / re) : 1) * recover));
    return Math.max(0, Math.min(STAFF_KICK_COUNT - 1, index));
  }
  if (name === 'special') return staffSpecialFrame(fighter);
  if (name === 'walk') return Math.floor((fighter.animT || 0) * PACE.spriteFps) % STAFF_WALK_COUNT;
  if (name === 'roll') {
    const duration = PACE.dodgeDuration;
    const elapsed = Math.max(0, duration - (fighter.dodgeT || 0));
    return Math.max(0, Math.min(STAFF_ROLL_COUNT - 1, Math.floor(elapsed / duration * STAFF_ROLL_COUNT)));
  }
  return Math.floor((fighter.animT || 0) * PACE.spriteFps) % STAFF_IDLE_COUNT;
}

function bladeClip(fighter) {
  if (fighter.classId !== 'blade') return null;
  if (fighter.ragdollActive || fighter.hp <= 0 || fighter.state === 'ko' || fighter.state === 'hit') return 'fall';
  if (fighter.state === 'special') return 'special';
  if (fighter.state === 'kick') return 'kick';
  if (fighter.state === 'punch') return 'punch';
  if (fighter.atk) return null;
  if (fighter.state === 'roll') return 'roll';
  if (fighter.state === 'walk') return 'walk';
  return 'idle';
}

// 12 special frames across the 80-frame Crescent Storm. The travelling Blade Wave and
// slash/noto FX stay on the existing Fx / BladeSuper draw path, beside this clip.
//   0-1 charge (1-16) · 2 wind-up (17-27) · 3 active slash (28-32, wave leaves on 28)
//   4-6 hold (33-48) · 7 chiburi (49-67) · 8-11 sheath (68-80)
function bladeSpecialFrame(fighter) {
  const t = fighter.atkT || 0;
  const phase = BladeSuper.phaseAt(t).part;
  if (phase === 'charge') return t <= BladeSuper.CHARGE_FRAMES * 0.5 ? 0 : 1;
  if (phase === 'windup') return 2;
  if (phase === 'active') return 3;
  if (phase === 'hold' || phase === 'gap') {
    const strike = BladeSuper.STRIKES[0];
    const start = BladeSuper.strikeStart(0) + strike.windup + strike.active;
    const off = Math.max(0, t - start);
    return 4 + Math.min(2, Math.floor(off * 3 / Math.max(1, strike.hold)));
  }
  if (phase === 'recovery') return 7;
  const off = Math.max(0, t - BladeSuper.SHEATH_START);
  return 8 + Math.min(3, Math.floor(off * 4 / Math.max(1, BladeSuper.SHEATH_FRAMES)));
}

function bladeAttackFrame(fighter, name, wind, strike) {
  const count = BLADE[name].count;
  const attack = fighter.atk;
  const su = attack ? attack.su : (name === 'kick' ? 10 : 7);
  const ac = attack ? attack.ac : (name === 'kick' ? 4 : 3);
  const re = attack ? attack.re : (name === 'kick' ? 16 : 12);
  const t = fighter.atkT || 0;
  const recover = count - wind - strike;
  let index;
  if (t <= su) index = Math.min(wind - 1, Math.floor((su ? t / su : 1) * wind));
  else if (t <= su + ac) index = wind + Math.min(strike - 1, Math.floor((ac ? (t - su) / ac : 1) * strike));
  else index = wind + strike + Math.min(recover - 1, Math.floor((re ? Math.min(1, (t - su - ac) / re) : 1) * recover));
  return Math.max(0, Math.min(count - 1, index));
}

function bladeFrame(fighter, name) {
  if (fighter._bladeClip !== name) {
    fighter._bladeClip = name;
    fighter._bladeClipStart = fighter.animT || 0;
  }
  const count = BLADE[name].count;
  if (name === 'fall') {
    return Math.max(0, Math.min(count - 1, Math.floor(((fighter.animT || 0) - fighter._bladeClipStart) * 12)));
  }
  // Quick Draw is frames 0–2; the second Attack press uses frames 3–5 of the same clip.
  if (name === 'punch') return chainSlice(fighter, (fighter.atk?.chain || 0) <= 0 ? 0 : 3, 3);
  // Crescent Cleave (6): overhead wind-up in startup, crescent slash across the active window, then recovery.
  //   0-1 raise to overhead · 2-4 slash arc · 5 return
  if (name === 'kick') return bladeAttackFrame(fighter, name, 2, 3);
  if (name === 'special') return bladeSpecialFrame(fighter);
  if (name === 'walk') return Math.floor((fighter.animT || 0) * PACE.spriteFps) % count;
  if (name === 'roll') {
    const duration = PACE.dodgeDuration;
    const elapsed = Math.max(0, duration - (fighter.dodgeT || 0));
    return Math.max(0, Math.min(count - 1, Math.floor(elapsed / duration * count)));
  }
  return Math.floor((fighter.animT || 0) * PACE.spriteFps) % count;
}

/** Three-frame slice of a six-frame punch clip. base 0 is hit 1, base 3 is hit 2. */
function chainSlice(fighter, base, count) {
  const attack = fighter.atk;
  const su = attack ? attack.su : 12;
  const ac = attack ? attack.ac : 4;
  const t = fighter.atkT || 0;
  const wind = Math.max(1, count - 1);
  const local = t <= su ? Math.min(wind - 1, Math.floor((su ? t / su : 1) * wind)) : Math.min(count - 1, wind);
  return base + local;
}

/** Clip and frame the posed sprite is showing. Tests read this for the 3-hit chain. */
export function attackClip(fighter) {
  if (fighter.classId === 'blade') {
    const clip = bladeClip(fighter) || 'idle';
    return { clip, frame: bladeFrame(fighter, clip) };
  }
  if (fighter.classId === 'staff') {
    const clip = staffClip(fighter) || 'idle';
    return { clip, frame: staffFrame(fighter, clip) };
  }
  const clip = clipOf(fighter);
  return { clip, frame: frameOf(fighter, clip) };
}

// Posed-sprite id for a cast entry. Brawler, Rusher, and Grappler use their archetype kind.
// Block Captain and Dockmaster are kind 'boss' (every stage boss is); the signature key picks them out.
// Other bosses stay on the vector plate.
function posedKind(entry) {
  if (!entry || entry.role !== 'enemy') return null;
  if (ENEMY_CLIPS[entry.kind]) return entry.kind;
  if (entry.kind === 'boss' && entry.f?.bossProfile?.signature?.key === 'bossBlockParty') return 'block-captain';
  if (entry.kind === 'boss' && entry.f?.bossProfile?.signature?.key === 'bossDockHaulIn') return 'dockmaster';
  return null;
}

// Brawler, Rusher, Grappler, Block Captain, and Dockmaster. Kind lives on the beat 'em up entry, not classId.
function stageEnemy(fighter) {
  if (Game.mode !== 'beatemup' || Game.phase === 'title' || !BeatEmUp.cast?.length) return null;
  const entry = BeatEmUp.entryFor(fighter);
  if (!posedKind(entry)) return null;
  return entry;
}

// The title draws the selected fighter on the canvas. No rival stands on the menu.
function titleBrawlerEntry() {
  return null;
}

// Same corpse window BeatEmUp.draw uses: a KO stays up for 2s, then leaves with its shadow.
function enemyOnStage(entry) {
  if (entry.f.hp > 0) return true;
  return !!(entry.f.ragdollKO && entry.f.ragdollElapsed < 2);
}

// withDepth's Fighter.S: baseS * lane scale * archetype scale. That is the size the vector body
// and the ground shadow already use. Paint runs outside withDepth, so drawS() alone would not.
function enemyBodyScale(entry) {
  const s = (BeatEmUp.baseS || 1) * BeatEmUp.depthToScale(entry.depth) * (entry.scaleMul || 1);
  return (96 * s) / BODY;
}

// Same body scale as a scaleMul-1 enemy in this fighter's lane. Beat 'em up paint is outside
// withDepth, so drawS() is full Fighter.S at depth scale 1 and reads about 35% large.
// Practice keeps drawS(), which already includes the 1v1 depth scale. No per-class factor.
function playerBodyScale(fighter) {
  if (Game.mode === 'beatemup' && Game.phase !== 'title') {
    const entry = BeatEmUp.entryFor(fighter);
    const depth = entry ? entry.depth : fighter.depth;
    const s = (BeatEmUp.baseS || 1) * BeatEmUp.depthToScale(depth);
    return (96 * s) / BODY;
  }
  return (96 * fighter.drawS()) / BODY;
}

// Tallest idle crop on the title (Staff's staff). Both fighters share one scale so a
// class swap cannot poke a weapon through the cards, and neither uses in-game scale.
function titleTallestBaseline() {
  return Math.max(IDLE_BOX.baseline, STAFF_IDLE_BOX.baseline, BLADE.idle.box.baseline, BRAWLER.idle.box.baseline);
}

export function titleIdleSpec(id) {
  if (id === 'staff') return { box: STAFF_IDLE_BOX, anchor: STAFF_IDLE_ANCHOR };
  if (id === 'blade') return { box: BLADE.idle.box, anchor: BLADE.idle.anchor };
  if (id === 'brawler') return { box: BRAWLER.idle.box, anchor: BRAWLER.idle.anchor };
  if (id === 'freehand') return { box: IDLE_BOX, anchor: IDLE_ANCHOR };
  return null;
}

// Largest canvas scale that keeps every title idle crop (head and weapon) 8 CSS px
// under the class cards. Feet stay on the current ground line.
export function titleMenuCanvasScale() {
  if (Game.phase !== 'title' || !Game.titleLayout) return 0;
  const layout = Game.titleLayout();
  const cards = layout && layout.classes;
  if (!cards || !cards.length || !fighters[0]) return 0;
  let cardBottom = cards[0].y + cards[0].h;
  for (let i = 1; i < cards.length; i++) cardBottom = Math.max(cardBottom, cards[i].y + cards[i].h);
  const ground = fighters[0].groundY() + (fighters[0].y || 0);
  const sc = Game.scale || 1;
  const dpr = Game.fitDpr || 1;
  const tallest = titleTallestBaseline();
  const headroom = (ground - cardBottom) * sc - 8;
  if (!(headroom > 0) || !(tallest > 0)) return 0;
  return headroom / tallest * dpr;
}

function titleBodyScale(entry, fighter, screen) {
  if (Game.phase === 'title') {
    const menu = titleMenuCanvasScale();
    if (menu > 0) return menu;
  }
  if (entry) return enemyBodyScale(entry) * screen;
  return playerBodyScale(fighter) * screen;
}

// KO corpses dissolve over the last 0.6s of the 2s window instead of popping off.
function deathAlpha(fighter) {
  if (!fighter.ragdollKO) return 1;
  const start = 1.4;
  const t = fighter.ragdollElapsed || 0;
  if (t <= start) return 1;
  return Math.max(0, (2 - t) / (2 - start));
}

function phaseIndex(t, start, end, count) {
  const span = Math.max(1, end - start);
  const u = Math.max(0, Math.min(0.999, (t - start) / span));
  return Math.min(count - 1, Math.floor(u * count));
}

// 8 jab-cross frames, four per hit: wind, wind, strike on the active window, recovery.
function brawlerAttackFrame(fighter) {
  const count = BRAWLER['jab-cross'].count;
  const attack = fighter.atk;
  const t = fighter.atkT || 0;
  const windows = attack?.comboWindows;
  if (!windows || !windows.length) {
    const total = Math.max(1, attack ? attack.su + attack.ac + attack.re : count);
    return Math.max(0, Math.min(count - 1, Math.floor(t / total * count)));
  }
  const per = Math.floor(count / windows.length);
  const wind = Math.max(1, per - 2);
  const strike = 1;
  const recover = Math.max(1, per - wind - strike);
  const endAll = attack.su + attack.ac + attack.re;
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    const next = i + 1 < windows.length ? windows[i + 1].windStart : endAll;
    if (t < next || i === windows.length - 1) {
      const base = i * per;
      let index;
      if (t < w.activeStart) index = base + phaseIndex(t, w.windStart, w.activeStart, wind);
      else if (t <= w.activeEnd) index = base + wind + phaseIndex(t, w.activeStart, w.activeEnd + 1, strike);
      else index = base + wind + strike + phaseIndex(t, w.activeEnd + 1, Math.max(w.activeEnd + 2, next), recover);
      return Math.max(0, Math.min(count - 1, index));
    }
  }
  return count - 1;
}

// 8 rush frames: crouch, approach, the live shoulder, then the whiff stumble / hit recovery.
function rusherAttackFrame(fighter) {
  const count = RUSHER.rush.count;
  const attack = fighter.atk;
  const spec = attack?.rush;
  const t = fighter.atkT || 0;
  if (!spec) {
    const total = Math.max(1, attack ? attack.su + attack.ac + attack.re : count);
    return Math.max(0, Math.min(count - 1, Math.floor(t / total * count)));
  }
  const dashStart = spec.crouch + 1;
  const su = spec.crouch + spec.dash - spec.active;
  const strikeEnd = su + spec.active;
  const total = Math.max(strikeEnd + 1, attack.su + attack.ac + attack.re);
  let index;
  if (t < dashStart) index = phaseIndex(t, 0, dashStart, 2);
  else if (t <= su) index = 2 + phaseIndex(t, dashStart, su + 1, 2);
  else if (t <= strikeEnd) index = 4 + phaseIndex(t, su + 1, strikeEnd + 1, 2);
  else index = 6 + phaseIndex(t, strikeEnd + 1, total, 2);
  return Math.max(0, Math.min(count - 1, index));
}

// 6 grab frames for EnemyGrab clinch.
//   0 open hands through windup and the active reach
//   1 clenched hold while grabVictim is held, before headbuttWind
//   2 head tilted back through headbuttWind, until headbuttAt
//   3 headbutt at headbuttAt and the short follow (driveGrabPose holds buttPose for 8 frames)
//   4 shove / whiff overcommit: first half of whiffRecovery, or of hitRecovery after the impact
//   5 return to stance: second half of that recovery
// A plain attack with no grab scrubs the clip across startup, active, and recovery.
function grapplerAttackFrame(fighter) {
  const count = GRAPPLER.grab.count;
  const attack = fighter.atk;
  const spec = attack?.grab;
  const t = fighter.atkT || 0;
  if (!spec) {
    const total = Math.max(1, attack ? attack.su + attack.ac + attack.re : count);
    return Math.max(0, Math.min(count - 1, Math.floor(t / total * count)));
  }
  const reachEnd = attack.su + attack.ac;
  const total = Math.max(reachEnd + 1, attack.su + attack.ac + attack.re);
  // `start` is the last frame of the previous phase. (start, end] splits in half: shove, then stance.
  const recover = (now, start, end) => {
    const span = Math.max(1, end - start);
    return now <= start + Math.floor(span / 2) ? 4 : 5;
  };
  if (!attack.grabHit) {
    if (t <= reachEnd) return 0;
    return recover(t, reachEnd, total);
  }
  const age = t - (attack.holdStart || 0);
  const at = spec.headbuttAt;
  const wind = spec.headbuttWind || 0;
  const held = !!(attack.grabVictim || fighter.grabVictim);
  // headbutt() sets this as it releases the victim, so a landed butt still reads after grabVictim is cleared.
  const butted = attack.headbuttKind != null;
  if (held && age < at - wind) return 1;
  if (held && age < at) return 2;
  if (!held && !butted) return recover(age, 0, Math.max(1, total - (attack.holdStart || 0)));
  const impactEnd = at + 8;
  if (age < impactEnd) return 3;
  const recoveryEnd = at + (spec.hitRecovery || 0);
  return recover(age, impactEnd - 1, Math.max(impactEnd, recoveryEnd));
}

// 8 jab-hook frames, four per normal. Jab is 0-3, hook is 4-7.
// Each quartet is wind, wind, strike held on the active window, recovery.
function blockCaptainNormalFrame(fighter) {
  const count = BLOCK_CAPTAIN['jab-hook'].count;
  const attack = fighter.atk;
  const hook = attack?.kind === 'kick';
  const base = hook ? 4 : 0;
  const su = attack ? attack.su : (hook ? 12 : 8);
  const ac = attack ? attack.ac : (hook ? 4 : 3);
  const re = attack ? attack.re : (hook ? 17 : 13);
  const t = fighter.atkT || 0;
  const wind = 2;
  const strike = 1;
  const recover = 1;
  let index;
  if (t <= su) index = phaseIndex(t, 0, su + 1, wind);
  else if (t <= su + ac) index = wind + phaseIndex(t, su + 1, su + ac + 1, strike);
  else index = wind + strike + phaseIndex(t, su + ac + 1, su + ac + re + 1, recover);
  return Math.max(0, Math.min(count - 1, base + index));
}

// 12 Block Party frames across the signature's startup, 3 live slots, and recovery.
//   0-2 charge (startup)
//   hit 1: 3 reach, 4 impact · hit 2: 5 reach, 6 impact · hit 3: 7-8 overhead, 9 guard-break
//   10-11 recover, holding the guard. Hit timing stays on BossSignature.
function blockCaptainSpecialFrame(fighter) {
  const count = BLOCK_CAPTAIN.special.count;
  const attack = fighter.atk;
  const su = attack ? attack.su : 10;
  const ac = attack ? attack.ac : 9;
  const re = attack ? attack.re : 16;
  const hits = Math.max(1, attack?.hitCount || 3);
  const t = fighter.atkT || 0;
  if (!attack) return Math.max(0, Math.min(count - 1, Math.floor(t / Math.max(1, su + ac + re) * count)));
  if (t <= su) return phaseIndex(t, 0, su + 1, 3);
  if (t > su + ac) return 10 + phaseIndex(t, su + ac + 1, su + ac + re + 1, 2);
  const slotLen = Math.max(1, ac / hits);
  const slot = Math.min(2, Math.floor((t - su - 1) / slotLen));
  const slotStart = su + 1 + slot * slotLen;
  const runs = [{ base: 3, n: 2 }, { base: 5, n: 2 }, { base: 7, n: 3 }];
  const run = runs[slot] || runs[0];
  return Math.max(0, Math.min(count - 1, run.base + phaseIndex(t, slotStart, slotStart + slotLen, run.n)));
}

// 6 chain-lash / low-swing frames: startup 0-1, the strike on the active window 2-3, recovery 4-5.
// Chain Lash is the punch. Low Swing is the kick. Timing stays on fighter.atk.
function dockmasterNormalFrame(fighter, name) {
  const count = DOCKMASTER[name].count;
  const attack = fighter.atk;
  const swing = name === 'low-swing';
  const su = attack ? attack.su : (swing ? 14 : 10);
  const ac = attack ? attack.ac : (swing ? 5 : 4);
  const re = attack ? attack.re : (swing ? 21 : 18);
  const t = fighter.atkT || 0;
  const wind = 2;
  const strike = 2;
  const recover = count - wind - strike;
  let index;
  if (t <= su) index = phaseIndex(t, 0, su + 1, wind);
  else if (t <= su + ac) index = wind + phaseIndex(t, su + 1, su + ac + 1, strike);
  else index = wind + strike + phaseIndex(t, su + ac + 1, su + ac + re + 1, recover);
  return Math.max(0, Math.min(count - 1, index));
}

// 6 Haul In frames. Hit timing stays on BossSignature; this only picks a pose.
//   0 amber charge tell     startup (t < su)
//   1 horizontal chain cast start of active
//   2 anchor flying out     the hookFrames window after that cast
//   3 two-hand yank         pullFrames, the middle of active
//   4 chain smash           activeFrame >= ac - 6, the same smash window as BossSignature.strike
//   5 follow-through        recovery (t >= su + ac)
function dockmasterSpecialFrame(fighter) {
  const count = DOCKMASTER.special.count;
  const attack = fighter.atk;
  const su = attack ? attack.su : 14;
  const ac = attack ? attack.ac : 24;
  const re = attack ? attack.re : 16;
  const t = fighter.atkT || 0;
  if (!attack) return Math.max(0, Math.min(count - 1, Math.floor(t / Math.max(1, su + ac + re) * count)));
  if (t >= su + ac) return Math.min(count - 1, 5);
  if (t < su) return 0;
  const { hookFrames, pullFrames } = BossSignatures.bossDockHaulIn;
  const active = t - su;
  if (active >= ac - 6) return 4;
  if (active > hookFrames && active <= hookFrames + pullFrames) return 3;
  if (active > hookFrames) return 3; // yank holds through any gap before the smash
  if (active > 1) return 2;
  return 1;
}

// Standing hitstun uses the fall clip's on-feet recoil (flinch). A missing texture falls back to the vector plate.
// Dockmaster has no separate flinch: a hit plays the fall clip, same as a KO.
function enemyClip(entry, fighter) {
  const down = fighter.ragdollActive || fighter.hp <= 0 || fighter.state === 'ko' || fighter.state === 'knockdown';
  if (down) return 'fall';
  const kind = posedKind(entry);
  if (kind === 'dockmaster') {
    if (fighter.state === 'hit') return 'fall';
    if (fighter.state === 'special') return 'special';
    if (fighter.state === 'kick') return 'low-swing';
    if (fighter.state === 'punch') return 'chain-lash';
    if (fighter.state === 'walk') return 'walk';
    return 'idle';
  }
  // Standing hitstun has no hurt clip. The first two fall frames are still on their feet;
  // the white hit flash is applied on top, matching the vector flash.
  if (fighter.state === 'hit') return 'flinch';
  if (kind === 'block-captain') {
    if (fighter.state === 'special') return 'special';
    if (fighter.state === 'punch' || fighter.state === 'kick' || fighter.atk) return 'jab-hook';
    if (fighter.state === 'walk') return 'walk';
    return 'idle';
  }
  // startEnemyGrab keeps state 'punch' and atk.grab set until the clinch ends, so wind-up, reach,
  // hold, headbutt, whiff recovery, and hit recovery all play grab.
  if (kind === 'grappler') {
    if (fighter.state === 'punch' || fighter.state === 'kick' || fighter.state === 'special' || fighter.atk) return 'grab';
    if (fighter.state === 'walk') return 'walk';
    return 'idle';
  }
  const attack = kind === 'brawler' ? 'jab-cross' : 'rush';
  if (fighter.state === 'punch' || fighter.state === 'kick' || fighter.state === 'special' || fighter.atk) return attack;
  if (fighter.state === 'walk') return 'walk';
  return 'idle';
}

function enemyFrame(fighter, name, count, kind) {
  if (fighter._posedClip !== name) {
    fighter._posedClip = name;
    fighter._posedClipStart = fighter.animT || 0;
  }
  if (name === 'flinch') return Math.floor((fighter.animT || 0) * 12) % 2;
  if (name === 'fall') {
    return Math.max(0, Math.min(count - 1, Math.floor(((fighter.animT || 0) - fighter._posedClipStart) * 12)));
  }
  if (name === 'jab-cross') return brawlerAttackFrame(fighter);
  if (name === 'rush') return rusherAttackFrame(fighter);
  if (name === 'grab') return grapplerAttackFrame(fighter);
  if (name === 'jab-hook') return blockCaptainNormalFrame(fighter);
  if (name === 'chain-lash' || name === 'low-swing') return dockmasterNormalFrame(fighter, name);
  if (name === 'special') return kind === 'dockmaster' ? dockmasterSpecialFrame(fighter) : blockCaptainSpecialFrame(fighter);
  if (name === 'walk') {
    return Math.floor((fighter.walkPx || 0) / (148 / count)) % count;
  }
  return Math.floor((fighter.animT || 0) * 12) % count;
}

function paintEnemy(scene, view, fighter, entry, screen, camera, name) {
  const kind = posedKind(entry);
  const table = ENEMY_CLIPS[kind];
  const clip = name === 'flinch' ? 'fall' : name;
  const meta = table?.[clip];
  if (!meta) return false;
  const index = enemyFrame(fighter, name, meta.count, kind);
  const texture = kind + '-' + clip + '-' + index;
  if (!scene.textures.exists(texture)) return false;
  if (!view.body) view.body = scene.add.image(0, 0, texture);
  if (view.body.texture.key !== texture) view.body.setTexture(texture);
  const box = meta.box;
  const foot = meta.anchor - box.w / 2;
  view.body.setFlipX(fighter.face < 0);
  view.body.setRotation(0);
  view.body.setScale(titleBodyScale(entry, fighter, screen));
  if (fighter.flash > 0) view.body.setTintFill(0xffffff);
  else view.body.clearTint();
  view.body.setAlpha(deathAlpha(fighter));
  place(view.body, fighter, screen, camera, (box.w / 2 + foot) / box.w, true, box);
  if (view.plate) view.plate.setVisible(false);
  return true;
}

export function loadKarate(scene) {
  for (let i = 0; i < STAFF_IDLE_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-idle-' + i, 'assets/characters/staff/frames/clips/idle/' + file + '.png?v=1');
  }
  for (let i = 0; i < STAFF_WALK_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-walk-' + i, 'assets/characters/staff/frames/clips/walk/' + file + '.png?v=1');
  }
  for (let i = 0; i < STAFF_ROLL_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-roll-' + i, 'assets/characters/staff/frames/clips/roll/' + file + '.png?v=1');
  }
  for (let i = 0; i < STAFF_SPECIAL_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-special-' + i, 'assets/characters/staff/frames/clips/special/' + file + '.png?v=1');
  }
  for (let i = 0; i < STAFF_KICK_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-kick-' + i, 'assets/characters/staff/frames/clips/kick/' + file + '.png?v=1');
  }
  for (let i = 0; i < STAFF_PUNCH_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-punch-' + i, 'assets/characters/staff/frames/clips/punch/' + file + '.png?v=1');
  }
  for (let i = 0; i < STAFF_FALL_COUNT; i++) {
    const file = String(i).padStart(2, '0');
    scene.load.image('staff-fall-' + i, 'assets/characters/staff/frames/clips/fall/' + file + '.png?v=1');
  }
  for (const [name, meta] of Object.entries(BLADE)) {
    for (let i = 0; i < meta.count; i++) {
      const file = String(i).padStart(2, '0');
      // Kick frames changed from the 8-frame scabbard kick to the 6-frame Crescent Cleave.
      const stamp = name === 'kick' ? '2' : '1';
      scene.load.image('blade-' + name + '-' + i, 'assets/characters/blade/frames/clips/' + name + '/' + file + '.png?v=' + stamp);
    }
  }
  for (const [kind, table] of Object.entries(ENEMY_CLIPS)) {
    for (const [name, meta] of Object.entries(table)) {
      for (let i = 0; i < meta.count; i++) {
        const file = String(i).padStart(2, '0');
        scene.load.image(kind + '-' + name + '-' + i, 'assets/characters/' + kind + '/frames/clips/' + name + '/' + file + '.png?v=1');
      }
    }
  }
  for (const [name, count] of Object.entries(CLIPS)) {
    for (let i = 0; i < count; i++) {
      const file = String(i).padStart(2, '0');
      const stamp = name === 'idle' ? '14' : name === 'walk' ? '17' : name === 'punch' ? '15' : name === 'kick' ? '16' : name === 'roll' ? '18' : name === 'special' ? '13' : name === 'fall' ? '19' : '9';
      scene.load.image(key(name, i), 'assets/characters/karate/frames/clips/' + name + '/' + file + '.png?v=' + stamp);
    }
  }
}

export function prepareKarate(scene) {
  Game.spriteBodies = true;
  Game.paintPhaser = () => paint(scene);
}

function roster() {
  if (Game.mode === 'beatemup' && Game.phase !== 'title' && BeatEmUp.cast?.length) return BeatEmUp.cast.map((entry) => entry.f);
  return fighters;
}

function lowResBeat() {
  return Game.mode === 'beatemup' && Game.phase !== 'title';
}

function layerPixels() {
  if (lowResBeat()) return { width: Game.W || 960, height: Game.H || 540 };
  return { width: Game.canvas.width || 960, height: Game.canvas.height || 540 };
}

function ensureLayer(scene, which) {
  const size = layerPixels();
  const width = size.width;
  const height = size.height;
  const isWorld = which === 'world';
  let canvas = isWorld ? worldCanvas : hudCanvas;
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    const name = which + '-layer';
    if (scene.textures.exists(name)) scene.textures.remove(name);
    canvas = scene.textures.createCanvas(name, width, height).getSourceImage();
    const current = isWorld ? worldImage : hudImage;
    if (current) current.setTexture(name);
    else if (isWorld) worldImage = scene.add.image(0, 0, name).setOrigin(0, 0).setDepth(0);
    else hudImage = scene.add.image(0, 0, name).setOrigin(0, 0).setDepth(100000);
    if (isWorld) worldCanvas = canvas;
    else hudCanvas = canvas;
  }
  return canvas;
}

function paintPlate(scene, view, fighter, karate) {
  if (!view.canvas) {
    view.canvas = document.createElement('canvas');
    view.canvas.width = STICK_W;
    view.canvas.height = STICK_H;
    view.plateKey = 'body-' + (++seq);
    scene.textures.addCanvas(view.plateKey, view.canvas);
    view.plate = scene.add.image(0, 0, view.plateKey).setOrigin(STICK_W / 2 / STICK_W, STICK_FOOT / STICK_H);
  }
  const ctx = view.canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, STICK_W, STICK_H);
  ctx.setTransform(1, 0, 0, 1, STICK_W / 2, STICK_FOOT);
  ctx.translate(-fighter.x, -(fighter.groundY() + fighter.y));
  fighter._phaserBody = karate;
  fighter.drawVector(ctx);
  fighter._phaserBody = false;
  scene.textures.get(view.plateKey).refresh();
  return view.plate;
}

function clipBox(name) {
  if (name === 'walk') return WALK_BOX;
  if (name === 'idle') return IDLE_BOX;
  if (name === 'punch') return PUNCH_BOX;
  if (name === 'kick') return KICK_BOX;
  if (name === 'special') return SPECIAL_BOX;
  if (name === 'roll') return ROLL_BOX;
  if (name === 'fall') return FALL_BOX;
  return { w: FRAME_W, h: FRAME_H, baseline: BASELINE };
}

function place(image, fighter, screen, camera, originX, nudge, box) {
  const shift = nudge ? fighter.drawNudgeX() : 0;
  image.setPosition((fighter.x + shift - camera + (Game.drawShakeX || 0)) * screen, (fighter.groundY() + fighter.y + (Game.drawShakeY || 0)) * screen);
  image.setDepth(100 + fighter.depth);
  image.setVisible(true);
  const frame = box || { w: FRAME_W, h: FRAME_H, baseline: BASELINE };
  if (originX != null) image.setOrigin(originX, frame.baseline / frame.h);
}

function paint(scene) {
  if (!Game.ctx || !Game.canvas.width) return;
  const game = Game.phaser;
  if (game && (game.scale.width !== Game.canvas.width || game.scale.height !== Game.canvas.height)) {
    game.scale.resize(Game.canvas.width, Game.canvas.height);
  }
  const screen = (Game.scale || 1) * (Game.fitDpr || 1);
  const camera = Game.mode === 'beatemup' && Game.phase !== 'title' ? BeatEmUp.cameraX : 0;
  const main = Game.ctx;
  Game.paintScale = lowResBeat() ? 1 : 0;
  const world = ensureLayer(scene, 'world');
  Game.ctx = world.getContext('2d');
  Game.draw('world');
  scene.textures.get('world-layer').refresh();
  if (worldImage) worldImage.setDisplaySize(Game.canvas.width, Game.canvas.height);

  const live = new Set();
  for (const fighter of roster()) {
    if (!fighter) continue;
    live.add(fighter);
    let view = views.get(fighter);
    if (!view) { view = {}; views.set(fighter, view); }
    if (Game.phase === 'title') {
      if (view.body) view.body.setVisible(false);
      if (view.plate) view.plate.setVisible(false);
      continue;
    }
    const rival = titleBrawlerEntry(fighter);
    const entry = rival || stageEnemy(fighter);
    if (entry && !enemyOnStage(entry)) {
      if (view.body) view.body.setVisible(false);
      if (view.plate) view.plate.setVisible(false);
      continue;
    }
    const karate = !rival && fighter.classId === 'freehand';
    const staffName = rival ? null : staffClip(fighter);
    const bladeName = rival ? null : bladeClip(fighter);
    const enemyName = entry ? enemyClip(entry, fighter) : null;
    let enemyPosed = false;
    if (karate) {
      const name = clipOf(fighter);
      const texture = key(name, frameOf(fighter, name));
      if (!view.body) view.body = scene.add.image(0, 0, texture);
      if (view.body.texture.key !== texture) view.body.setTexture(texture);
      const box = clipBox(name);
      const foot = name === 'idle' ? IDLE_ANCHOR - box.w / 2 : name === 'walk' ? WALK_ANCHOR - box.w / 2 : name === 'punch' ? PUNCH_ANCHOR - box.w / 2 : name === 'kick' ? KICK_ANCHOR - box.w / 2 : name === 'roll' ? ROLL_ANCHOR - box.w / 2 : name === 'fall' ? FALL_ANCHOR - box.w / 2 : name === 'special' ? SPECIAL_ANCHOR - box.w / 2 : 0;
      view.body.setFlipX(fighter.face < 0);
      view.body.setRotation(fighter.ragdollActive && name !== 'fall' ? fighter.ragdollAngle : 0);
      view.body.setScale(titleBodyScale(null, fighter, screen));
      if (fighter.flash > 0) view.body.setTintFill(0xffffff);
      else view.body.clearTint();
      const blink = fighter.playerControlled && fighter.dodgeT > 0 && Math.floor(fighter.dodgeT * 14) % 2 === 0;
      view.body.setAlpha(blink ? 0.35 : 1);
      place(view.body, fighter, screen, camera, (box.w / 2 + foot) / box.w, true, box);
      if (view.plate) view.plate.setVisible(false);
    } else if (staffName) {
      const index = staffFrame(fighter, staffName);
      const texture = 'staff-' + staffName + '-' + index;
      if (!view.body) view.body = scene.add.image(0, 0, texture);
      if (view.body.texture.key !== texture) view.body.setTexture(texture);
      const box = staffName === 'walk' ? STAFF_WALK_BOX : staffName === 'roll' ? STAFF_ROLL_BOX : staffName === 'fall' ? STAFF_FALL_BOX : staffName === 'punch' ? STAFF_PUNCH_BOX : staffName === 'kick' ? STAFF_KICK_BOX : staffName === 'special' ? STAFF_SPECIAL_BOX : STAFF_IDLE_BOX;
      const anchor = staffName === 'walk' ? STAFF_WALK_ANCHOR : staffName === 'roll' ? STAFF_ROLL_ANCHOR : staffName === 'fall' ? STAFF_FALL_ANCHOR : staffName === 'punch' ? STAFF_PUNCH_ANCHOR : staffName === 'kick' ? STAFF_KICK_ANCHOR : staffName === 'special' ? STAFF_SPECIAL_ANCHOR : STAFF_IDLE_ANCHOR;
      const foot = anchor - box.w / 2;
      view.body.setFlipX(fighter.face < 0);
      view.body.setRotation(0);
      view.body.setScale(titleBodyScale(null, fighter, screen));
      if (fighter.flash > 0) view.body.setTintFill(0xffffff);
      else view.body.clearTint();
      const blink = staffName === 'roll' && fighter.playerControlled && fighter.dodgeT > 0 && Math.floor(fighter.dodgeT * 14) % 2 === 0;
      view.body.setAlpha(blink ? 0.35 : 1);
      place(view.body, fighter, screen, camera, (box.w / 2 + foot) / box.w, true, box);
      if (view.plate) view.plate.setVisible(false);
    } else if (bladeName) {
      const index = bladeFrame(fighter, bladeName);
      const texture = 'blade-' + bladeName + '-' + index;
      if (!view.body) view.body = scene.add.image(0, 0, texture);
      if (view.body.texture.key !== texture) view.body.setTexture(texture);
      const meta = BLADE[bladeName];
      const box = meta.box;
      const foot = meta.anchor - box.w / 2;
      view.body.setFlipX(fighter.face < 0);
      view.body.setRotation(0);
      view.body.setScale(titleBodyScale(null, fighter, screen));
      if (fighter.flash > 0) view.body.setTintFill(0xffffff);
      else view.body.clearTint();
      const blink = bladeName === 'roll' && fighter.playerControlled && fighter.dodgeT > 0 && Math.floor(fighter.dodgeT * 14) % 2 === 0;
      view.body.setAlpha(blink ? 0.35 : 1);
      place(view.body, fighter, screen, camera, (box.w / 2 + foot) / box.w, true, box);
      if (view.plate) view.plate.setVisible(false);
    } else if (enemyName) {
      enemyPosed = paintEnemy(scene, view, fighter, entry, screen, camera, enemyName);
      if (!enemyPosed && view.body) view.body.setVisible(false);
    } else if (view.body) view.body.setVisible(false);
    if (!karate && !staffName && !bladeName && !enemyPosed) {
      const plate = paintPlate(scene, view, fighter, false);
      plate.setScale(screen);
      plate.setRotation(0);
      place(plate, fighter, screen, camera, null, false);
      plate.setOrigin(0.5, STICK_FOOT / STICK_H);
    }
  }
  for (const [fighter, view] of views) {
    if (live.has(fighter)) continue;
    if (view.body) view.body.setVisible(false);
    if (view.plate) view.plate.setVisible(false);
  }

  const hud = ensureLayer(scene, 'hud');
  const hudCtx = hud.getContext('2d');
  hudCtx.setTransform(1, 0, 0, 1, 0, 0);
  hudCtx.clearRect(0, 0, hud.width, hud.height);
  Game.ctx = hudCtx;
  Game.draw('overlay');
  scene.textures.get('hud-layer').refresh();
  if (hudImage) hudImage.setDisplaySize(Game.canvas.width, Game.canvas.height);
  Game.paintScale = 0;
  Game.ctx = main;
}

/** Idle frame for a class card. Box, anchor, and body height are the gameplay clip values. */
export function classIdleSource(classId, index) {
  const spec = classId === 'staff' ? { folder: 'staff', count: STAFF_IDLE_COUNT, box: STAFF_IDLE_BOX, anchor: STAFF_IDLE_ANCHOR }
    : classId === 'blade' ? { folder: 'blade', count: BLADE.idle.count, box: BLADE.idle.box, anchor: BLADE.idle.anchor }
    : classId === 'freehand' ? { folder: 'karate', count: CLIPS.idle, box: IDLE_BOX, anchor: IDLE_ANCHOR }
    : null;
  if (!spec) return null;
  const count = spec.count;
  const frame = ((Math.floor(index) % count) + count) % count;
  const key = spec.folder + '-idle-' + frame;
  const scene = Game.phaserScene;
  let image = null;
  if (scene && scene.textures.exists(key)) {
    const source = scene.textures.get(key).getSourceImage();
    if (source && source.width > 0) image = source;
  }
  return { folder: spec.folder, count, box: spec.box, anchor: spec.anchor, frame, key, image, body: BODY };
}
