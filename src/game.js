import { Sfx } from './audio.js';
import { BeatEmUp } from './beatemup.js';
import { BladeSuper } from './blade.js';
import { ArcadeDiff, CpuHotColors, Depth, FighterClasses, PACE, PlayerCoolColor, specialHitStop } from './config.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Input } from './input.js';
import { Pose } from './pose.js';
import { startPhaser } from './phaser-host.js';
import { classIdleSource, holdForAssets, startBackgroundLoads, titleIdleSpec } from './phaser-actors.js';

export let fighters = [new Fighter(0, PlayerCoolColor, 1, 'YOU'), new Fighter(0, CpuHotColors['1v1'], -1, 'CPU')];

export class Game {
  static W = 960; static H = 540; static GROUND = 390; static STEP = 1 / 60;
  static minX = 192; static maxX = 768; static scale = 1; static ox = 0; static oy = 0;
  static hr = 16.5; static lw = 6; static btns = [];
  static safeTop = 0; static safeL = 0; static safeR = 0; static safeB = 0; static menuRight = 0; static drawShakeY = 0;
  static actionButtons = { special: null, roll: null };
  static stop = 0; static shake = 0; static shMag = 0;
  static canvas; static ctx; static acc = 0; static last = 0;
  static timer = 60;
  static phase = 'title'; static banner = ''; static bannerT = 0;
  static fighting = 0; static matchOver = 0; static winner = '';
  static arcadeLevel = 'normal';
  static levels = ['easy', 'normal', 'hard'];
  static levelLabels = {easy:'Easy', normal:'Normal', hard:'Hard'};
  static titleBtns = [];
  static selectedClass = 'freehand';
  static paused = false;
  static actionMenuOpen = false;
  static titleBackgroundImage() {
    const scene = Game.phaserScene;
    if (!scene || !scene.textures.exists('menu-bg')) return null;
    const image = scene.textures.get('menu-bg').getSourceImage();
    if (image && image.width > 0) return image;
    return null;
  }
  static practiceDummyX = 0;
  static practiceComboHits = 0;
  static practiceComboDamage = 0;
  static practiceComboT = 0;
  static practiceLastMove = '';
  static ready = false;
  static usingPhaser = false;
  static spriteBodies = false;
  static paintPhaser = null;
  static drawShakeX = 0;
  static drawShakeY = 0;
  static init() {
    Game.canvas = document.getElementById('game');
    if (!startPhaser(Game.canvas)) Game.ctx = Game.canvas.getContext('2d');
    try {
      const savedArcadeLevel = localStorage.getItem('stickman-beatemup-level');
      if (savedArcadeLevel && ArcadeDiff[savedArcadeLevel]) Game.arcadeLevel = savedArcadeLevel;
      const savedClass = localStorage.getItem('stickman-beatemup-class');
      const legacyClass = {boxer:'freehand', kickboxing:'freehand', ninja:'blade', taekwondo:'blade', brawler:'staff', guardian:'freehand', muaythai:'staff', sumo:'staff', wingchun:'freehand'}[savedClass];
      if (FighterClasses[savedClass]) Game.selectedClass = savedClass;
      else if (FighterClasses[legacyClass]) Game.selectedClass = legacyClass;
    } catch (e) {}
    Input.bind(); Game.mode = Game.bootMode(); Input.syncMode(); Game.goTitle(); Game.fit(); addEventListener('resize', () => Game.fit());
    Game.last = performance.now();
    Game.ready = true;
    if (!Game.usingPhaser) requestAnimationFrame(Game.frame);
  }
  static mode = 'beatemup';
  /** Practice stays selectable. A saved or linked 1v1 choice opens Beat 'em up. */
  static bootMode() {
    const pick = (value) => {
      if (value === '1v1') return 'beatemup';
      if (value === 'practice' || value === 'beatemup') return value;
      return null;
    };
    try {
      const params = new URLSearchParams(location.search);
      for (const key of ['mode', 'game']) {
        const chosen = pick(params.get(key));
        if (chosen) return chosen;
      }
      for (const key of ['stickman-mode', 'stickman-game-mode']) {
        const chosen = pick(localStorage.getItem(key));
        if (chosen) return chosen;
      }
    } catch (e) {}
    return 'beatemup';
  }
  static goTitle() {
    Game.closeActionMenu();
    Game.phase = 'title'; Game.fighting = 0; Game.matchOver = 0; Game.banner = '';
    Game.paused = false;
    Game.winner = ''; Game.stop = 0; Game.shake = 0;
    fighters[0].meter = 0; fighters[1].meter = 0;
    fighters.forEach(f => { f.ragdollActive = false; f.ragdollKO = false; f.ragdollAngle = 0; f.ragdollElapsed = 0; f.damageBurst = 0; f.damageBurstT = 0; f.y = 0; f.vy = 0; f.state = 'idle'; });
    Input.keys.clear();
    Input.pad.forEach(p => { Input.acts.forEach(a => p[a] = 0); p.depthUp = 0; p.depthDown = 0; });
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.tapped = [{}, {}];
    fighters[0].color = PlayerCoolColor; fighters[1].color = CpuHotColors['1v1'];
    fighters[0].setClass(Game.selectedClass);
    fighters[0].color = FighterClasses[Game.selectedClass].color;
    fighters[0].tag = 'YOU'; fighters[1].tag = 'CPU';
    fighters[0].hp = 100; fighters[1].hp = 100;
    BeatEmUp.stageOver = 0; BeatEmUp.showGo = 0; BeatEmUp.cast = []; BeatEmUp.boss = null;
    Input.syncMode();
    Game.placeTitleFighters();
    Fx.clear();
    Game.syncControls();
  }
  static selectClass(id) {
    if (!FighterClasses[id]) return;
    Game.selectedClass = id;
    fighters[0].setClass(id);
    document.documentElement.style.setProperty('--class-accent', FighterClasses[id].accent);
    try { localStorage.setItem('stickman-beatemup-class', id); } catch (e) {}
    if (Game.phase === 'title') Game.syncTitleFighters();
  }
  static selectArcadeLevel(id) {
    if (!ArcadeDiff[id]) return;
    Game.arcadeLevel = id;
    try { localStorage.setItem('stickman-beatemup-level', id); } catch (e) {}
  }
  static selectMode(mode) {
    if (mode !== 'practice' && mode !== 'beatemup') mode = 'beatemup';
    Game.mode = mode; Input.syncMode();
    fighters[0].setClass(Game.selectedClass);
    fighters[0].color = FighterClasses[Game.selectedClass].color;
    fighters[1].color = CpuHotColors['1v1'];
  }
  static startPractice() {
    Game.paused = false; Game.actionMenuOpen = false;
    Game.mode = 'practice';
    Input.syncMode();
    Game.phase = 'intro'; Game.banner = 'PRACTICE'; Game.bannerT = .9;
    Game.syncControls();
    Game.fit();
    Game.matchOver = 0; Game.winner = '';
    const player = fighters[0], dummy = fighters[1];
    player.setClass(Game.selectedClass);
    player.color = FighterClasses[Game.selectedClass].color;
    player.tag = 'YOU'; player.meter = 0;
    dummy.setClass(null); dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    Game.placePracticeFighters(true);
    dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    player.depth = Depth.START; dummy.depth = Depth.START;
    Game.timer = Infinity; Game.practiceComboHits = 0; Game.practiceComboDamage = 0; Game.practiceComboT = 0; Game.practiceLastMove = '';
    Game.stop = 0; Game.shake = 0; Game.fighting = 0; Game.matchOver = 0;
    Input.pad[1] = {}; Input.was[1] = {};
    Fx.clear();
    Game.syncSpecialBtn(); Game.syncControls();
  }
  static resetPracticeDummy(clearCombo = true) {
    if (Game.mode !== 'practice') return;
    const dummy = fighters[1];
    dummy.setClass(null); dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    dummy.reset(Game.practiceDummyX || Game.W * .64, -1);
    dummy.color = '#AEB5C8'; dummy.tag = 'DUMMY';
    dummy.depth = Depth.START; fighters[0].depth = Depth.START;
    if (clearCombo) {
      Game.practiceComboHits = 0; Game.practiceComboDamage = 0; Game.practiceComboT = 0; Game.practiceLastMove = '';
    }
  }
  /** Title-only: the selected fighter stands in the left hero. Match spawn unchanged. */
  static placeTitleFighters() {
    const placed = Game.titleFighterPositions();
    fighters[0].reset(placed[0], 1); fighters[1].reset(placed[1], -1);
  }
  /** Keep title x in sync after a class change without resetting the idle loop. */
  static syncTitleFighters() {
    const placed = Game.titleFighterPositions();
    fighters[0].face = 1; fighters[1].face = -1;
    fighters[0].x = placed[0]; fighters[1].x = placed[1];
  }
  // Feet of the large hero. The rival is parked off the menu; the title no longer draws one.
  static titleFighterPositions() {
    const layout = Game.titleLayout();
    const foot = layout && layout.heroFoot;
    return [foot ? foot.x : Game.W * .22, -4000];
  }
  static startMatch() {
    Game.paused = false; Game.actionMenuOpen = false;
    if (Game.mode === 'practice') { Game.startPractice(); return; }
    Game.mode = 'beatemup';
    Input.syncMode();
    BeatEmUp.begin();
  }
  static syncControls() {
    const el = document.getElementById('controls');
    if (el) el.classList.toggle('arcade-controls', Game.mode === 'beatemup' || Game.mode === 'practice');
    if (el) el.style.display = Game.paused || Game.phase === 'title' || (Game.mode === 'beatemup' && BeatEmUp.stageOver) ? 'none' : '';
    const menu = document.getElementById('main-menu-button');
    const hideMenu = Game.phase === 'title' || Game.overlayOpen();
    if (menu) {
      menu.style.display = hideMenu ? 'none' : 'block';
      menu.style.pointerEvents = hideMenu ? 'none' : '';
      if (hideMenu) menu.setAttribute('aria-hidden', 'true');
      else menu.removeAttribute('aria-hidden');
    }
    if (hideMenu && Game.actionMenuOpen) Game.closeActionMenu();
    Game.menuRight = !hideMenu && menu ? menu.getBoundingClientRect().right : 0;
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
  static overlayOpen() {
    return !!(Game.paused || (Game.mode === 'beatemup' && (BeatEmUp.stageOver || BeatEmUp.stageTransitionLeft > 0)));
  }
  static titleCase(text) {
    return String(text || '').toLowerCase().split(/\s+/).filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  // One line. A long stage name that does not fit the sheet falls back to the short line.
  static failFlavor(chapterTitle) {
    const preferred = 'Regroup and retry ' + Game.titleCase(chapterTitle) + '.';
    const small = innerWidth < 700;
    const padX = small ? 16 : 20;
    const safeL = Game.safeL || 0, safeR = Game.safeR || 0;
    let sheetW = Math.min(420, innerWidth * 0.62);
    sheetW = Math.min(sheetW, Math.max(180, innerWidth - safeL - safeR - 8));
    const innerW = sheetW - padX * 2;
    if (Game.cssTextWidth(preferred, 12, '400', 0.04) <= innerW + 0.5) return preferred;
    return 'Regroup and try again.';
  }
  static toggleActionMenu() {
    if (Game.phase === 'title' || Game.overlayOpen()) return;
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
    Input.tapped = [{}, {}];
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
      // Re-fit (resize, phone toolbar show/hide, rotation, DPR change): keep the
      // player where they are inside the new lane; only re-anchor the dummy.
      fighters[0].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[0].x)); fighters[0].clamp();
      fighters[1].x = Game.practiceDummyX; fighters[1].vx = 0; fighters[1].clamp();
    }
  }
  static px(css) { return css / (Game.scale || 1); }
  static cssTextWidth(text, cssPx, weight, letterEm) {
    const ctx = Game.ctx;
    const fallback = String(text || '').length * cssPx * 0.62;
    if (!ctx || !ctx.getTransform) return fallback;
    const prev = ctx.getTransform();
    const font = ctx.font;
    const spacing = ctx.letterSpacing;
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = weight + ' ' + cssPx + 'px ui-monospace,monospace';
      if ('letterSpacing' in ctx) ctx.letterSpacing = (letterEm || 0) + 'em';
      return ctx.measureText(String(text)).width || fallback;
    } finally {
      if ('letterSpacing' in ctx) ctx.letterSpacing = spacing || '0px';
      ctx.font = font;
      ctx.setTransform(prev);
    }
  }
  static wrapCss(text, cssPx, weight, letterEm, maxW) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (line && Game.cssTextWidth(next, cssPx, weight, letterEm) > maxW) { lines.push(line); line = word; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  static fillRound(ctx, x, y, w, h, radCss, fill, strokeCss, strokeColor) {
    const r = Math.max(0, Math.min(Game.px(radCss), Math.abs(w) / 2, Math.abs(h) / 2));
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (strokeCss) { ctx.strokeStyle = strokeColor; ctx.lineWidth = Game.px(strokeCss); ctx.stroke(); }
  }
  static textAt(ctx, text, x, y, cssPx, weight, color, letterEm, align, baseline) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = weight + ' ' + Game.px(cssPx) + 'px ui-monospace,monospace';
    ctx.letterSpacing = (letterEm || 0) + 'em';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = baseline || 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  // CSS-pixel menu rects, stored in game units. .sm (width < 700) uses the smaller sizes.
  static titleLayout() {
    const sc = Game.scale || 1;
    const small = innerWidth < 700;
    const safeT = Game.safeTop || 0, safeB = Game.safeB || 0, safeL = Game.safeL || 0, safeR = Game.safeR || 0;
    const padT = Math.max(12, safeT), padB = Math.max(14, safeB);
    const padL = Math.max(28, safeL), padR = Math.max(28, safeR);
    const wrapX = padL, wrapY = padT;
    const wrapW = Math.max(160, innerWidth - padL - padR);
    const wrapH = Math.max(120, innerHeight - padT - padB);
    const heroW = wrapW * 0.42;
    const heroX = wrapX;
    const panelX = wrapX + heroW;
    const panelW = wrapW - heroW;
    const gap = small ? 10 : 12;
    const labelH = 12;
    const aboveDifficulty = 12;
    const belowDifficulty = 6;
    const cardH = small ? 60 : 74;
    const cardGap = 8;
    const segH = 52;
    const rowH = small ? 54 : 60;
    const padIn = 10;
    const contentX = panelX + padIn;
    const contentW = Math.max(80, panelW - padIn);
    const stackH = labelH + gap + cardH + aboveDifficulty + labelH + belowDifficulty + segH + gap + rowH;
    let stackY = wrapY + Math.max(0, (wrapH - stackH) / 2);
    const gearS = 44;
    const gear = { x: innerWidth - Math.max(22, safeR) - gearS, y: Math.max(12, safeT), w: gearS, h: gearS };
    if (contentX + contentW > gear.x && stackY < gear.y + gear.h + 8) stackY = gear.y + gear.h + 8;
    const maxStack = wrapY + wrapH - stackH;
    if (stackY > maxStack) stackY = Math.max(wrapY, maxStack);

    const logoSize = small ? 19 : 22;
    const logoText = 'STICKMAN FIGHTER';
    const logo = { x: heroX, y: wrapY, w: Math.min(heroW, Game.cssTextWidth(logoText, logoSize, '900', 0) + 2), h: logoSize + 4, text: logoText };

    const picked = FighterClasses[Game.selectedClass] || FighterClasses.freehand;
    const specialText = 'SPECIAL · ' + (picked.super || '');
    const specialH = 18;
    const special = { x: heroX, y: wrapY + wrapH - specialH, w: heroW, h: specialH, text: specialText };
    const spec = titleIdleSpec(Game.selectedClass) || titleIdleSpec('freehand');
    let spriteH = innerHeight * 0.72;
    const footY = special.y - 6;
    let spriteTop = footY - spriteH;
    const minTop = logo.y + logo.h + 8;
    if (spriteTop < minTop) { spriteTop = minTop; spriteH = Math.max(48, footY - spriteTop); }
    let scaleCss = spec && spec.box.h ? spriteH / spec.box.h : 1;
    if (spec && spec.box.w * scaleCss > heroW - 8) scaleCss = (heroW - 8) / spec.box.w;
    const usedW = spec ? spec.box.w * scaleCss : spriteH * 0.7;
    const usedH = spec ? spec.box.h * scaleCss : spriteH;
    const cropX = heroX + Math.max(0, (heroW - usedW) / 2);
    const cropY = footY - (spec ? spec.box.baseline * scaleCss : usedH);
    const hero = { x: cropX, y: cropY, w: usedW, h: usedH };
    const heroFoot = { x: cropX + (spec ? spec.anchor * scaleCss : usedW * 0.5), y: footY };

    const ids = Object.keys(FighterClasses);
    const cardsW = (contentW - cardGap * (ids.length - 1)) / ids.length;
    const cardsY = stackY + labelH + gap;
    const zoneH = cardH * 0.6;
    const classes = ids.map((id, i) => {
      const cardX = contentX + i * (cardsW + cardGap);
      const spec = titleIdleSpec(id) || titleIdleSpec('freehand');
      const maxW = Math.max(8, cardsW - 8);
      const maxH = Math.max(8, zoneH - 2);
      let scaleCss = spec.box.h ? maxH / spec.box.h : 1;
      if (spec.box.w * scaleCss > maxW) scaleCss = maxW / spec.box.w;
      const drawW = spec.box.w * scaleCss;
      const drawH = spec.box.h * scaleCss;
      const imgLeft = cardX + cardsW / 2 - spec.anchor * scaleCss;
      const imgTop = cardsY + zoneH - drawH;
      const clip = { x: cardX + 2, y: cardsY + 2, w: Math.max(4, cardsW - 4), h: Math.max(4, zoneH - 2) };
      const left = Math.max(clip.x, imgLeft);
      const top = Math.max(clip.y, imgTop);
      const sprite = {
        x: left, y: top,
        w: Math.max(0, Math.min(imgLeft + drawW, clip.x + clip.w) - left),
        h: Math.max(0, Math.min(imgTop + drawH, clip.y + clip.h) - top),
      };
      const nameBox = { x: cardX, y: cardsY + zoneH + 4, w: cardsW, h: 12 };
      return { id, profile: FighterClasses[id], x: cardX, y: cardsY, w: cardsW, h: cardH, sprite, nameBox };
    });
    const diffY = cardsY + cardH + aboveDifficulty;
    const segY = diffY + labelH + belowDifficulty;
    const seg = { x: contentX, y: segY, w: contentW, h: segH };
    const segPad = 4;
    const itemW = (contentW - segPad * 2) / Game.levels.length;
    const levels = Game.levels.map((id, i) => ({
      id, label: Game.levelLabels[id],
      x: contentX + segPad + i * itemW, y: segY, w: itemW, h: segH,
    }));
    const rowY = segY + segH + gap;
    let practiceW = 110;
    if (practiceW + 10 + 80 > contentW) practiceW = Math.max(72, Math.round(contentW * 0.34));
    const practice = { id: 'practice', x: contentX, y: rowY, w: practiceW, h: rowH, label: 'Practice' };
    const start = {
      id: 'start-run', x: contentX + practiceW + 10, y: rowY,
      w: Math.max(80, contentW - practiceW - 10), h: rowH, label: 'START ▶', shadow: 4,
    };
    const g = (r) => {
      const o = { x: r.x / sc, y: r.y / sc, w: r.w / sc, h: r.h / sc };
      if (r.id) o.id = r.id;
      if (r.label) o.label = r.label;
      if (r.text) o.text = r.text;
      if (r.profile) o.profile = r.profile;
      if (r.shadow) o.shadow = r.shadow / sc;
      if (r.sprite) o.sprite = { x: r.sprite.x / sc, y: r.sprite.y / sc, w: r.sprite.w / sc, h: r.sprite.h / sc };
      if (r.nameBox) o.nameBox = { x: r.nameBox.x / sc, y: r.nameBox.y / sc, w: r.nameBox.w / sc, h: r.nameBox.h / sc };
      return o;
    };
    return {
      small, logo: g(logo), hero: g(hero),
      heroFoot: { x: heroFoot.x / sc, y: heroFoot.y / sc },
      special: g(special), classes: classes.map(g), levels: levels.map(g),
      segment: g(seg), practice: g(practice), start: g(start), gear: g(gear),
      labels: {
        fighter: g({ x: contentX, y: stackY, w: contentW, h: labelH, text: 'FIGHTER' }),
        difficulty: g({ x: contentX, y: diffY, w: contentW, h: labelH, text: 'DIFFICULTY' }),
      },
    };
  }
  static titlePointer(e) {
    const sc = Game.scale || 1;
    const x = e.clientX / sc, y = e.clientY / sc;
    const layout = Game.titleLayout();
    const hit = (b) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (hit(layout.gear)) { Game.toggleFullscreen(); return; }
    const card = (layout.classes || []).find(hit);
    if (card) { Game.selectClass(card.id); return; }
    const level = (layout.levels || []).find(hit);
    if (level) { Game.selectArcadeLevel(level.id); return; }
    if (hit(layout.practice)) { Game.startPractice(); return; }
    if (hit(layout.start)) { Game.selectMode('beatemup'); Game.startMatch(); }
  }
  static pausePointer(e) {
    const sc = Game.scale || 1;
    const x = e.clientX / sc, y = e.clientY / sc;
    const layout = Game.pauseLayout();
    const hit = (b) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (!layout) return;
    if (hit(layout.resume)) { Game.togglePause(); return; }
    if (hit(layout.fullscreen)) { Game.toggleFullscreen(); return; }
    if (hit(layout.menu)) Game.goTitle();
  }
  static tryTitleKey(key) {
    if (Game.mode !== 'practice' && Game.mode !== 'beatemup') Game.selectMode('beatemup');
    if (key === 'Tab') {
      const modes = ['practice','beatemup'];
      Game.selectMode(modes[(modes.indexOf(Game.mode) + 1) % modes.length]);
      return;
    }
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
      if (Game.mode === 'beatemup') {
        const i = Game.levels.indexOf(Game.arcadeLevel);
        Game.selectArcadeLevel(Game.levels[Math.max(0, i - 1)]);
        return;
      }
      const ids = Object.keys(FighterClasses), i = ids.indexOf(Game.selectedClass);
      Game.selectClass(ids[(i + ids.length - 1) % ids.length]);
      return;
    }
    if (key === 'ArrowRight' || key === 'd' || key === 'D') {
      if (Game.mode === 'beatemup') {
        const i = Game.levels.indexOf(Game.arcadeLevel);
        Game.selectArcadeLevel(Game.levels[Math.min(Game.levels.length - 1, i + 1)]);
        return;
      }
      const ids = Object.keys(FighterClasses), i = ids.indexOf(Game.selectedClass);
      Game.selectClass(ids[(i + 1) % ids.length]);
      return;
    }
    if (Game.mode === 'beatemup' && (key === 'ArrowUp' || key === 'ArrowDown')) {
      const i = Game.levels.indexOf(Game.arcadeLevel), step = key === 'ArrowUp' ? -1 : 1;
      Game.selectArcadeLevel(Game.levels[(i + step + Game.levels.length) % Game.levels.length]); return;
    }
    if (Game.mode === 'practice' && (key === 'ArrowUp' || key === 'ArrowDown')) {
      const ids = Object.keys(FighterClasses), i = ids.indexOf(Game.selectedClass);
      const step = key === 'ArrowUp' ? -1 : 1;
      Game.selectClass(ids[(i + step + ids.length) % ids.length]); return;
    }
    if (key === 'Enter' || key === ' ' || key === 'j' || key === 'J') Game.startMatch();
  }
  static fit() {
    const dpr = Math.max(1, devicePixelRatio || 1);
    // Remember what the backing store was sized for, so draw() can detect a
    // devicePixelRatio change that arrives without a resize event (Chrome
    // responsive emulation, moving a window between displays, browser zoom).
    Game.fitDpr = dpr; Game.fitW = innerWidth; Game.fitH = innerHeight;
    // Safe-area insets only change with layout, so read them here, not per frame.
    const rootStyle = getComputedStyle(document.documentElement);
    Game.safeTop = parseFloat(rootStyle.getPropertyValue('--sai-t')) || 0;
    Game.safeL = parseFloat(rootStyle.getPropertyValue('--sai-l')) || 0;
    Game.safeR = parseFloat(rootStyle.getPropertyValue('--sai-r')) || 0;
    Game.safeB = parseFloat(rootStyle.getPropertyValue('--sai-b')) || 0;
    Game.H = 540; Game.W = Math.max(640, Math.round(540 * innerWidth / innerHeight));
    Game.GROUND = Math.round(Game.H * .72);
    const scale = innerHeight / Game.H;
    Game.scale = scale; Game.ox = 0; Game.oy = 0;
    Game.hr = Math.max(13.2, 10.56 / scale); Game.lw = Math.max(4.8, 3.6 / scale);
    Game.canvas.style.width = innerWidth + 'px'; Game.canvas.style.height = innerHeight + 'px';
    Game.canvas.width = Math.round(innerWidth * dpr); Game.canvas.height = Math.round(innerHeight * dpr);
    Game.ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    // Prefer middle 70% (15%–85%), but end the lane early enough that visual
    // bones() at the edges stay clear of the practice touch controls (drawNudgeX → 0).
    // Control rects are measured from the DOM, so CSS changes to the pads can't
    // silently desync the lane.
    const CLEAR = 8;
    const REACH = 65; // max observed visual AABB past hip (worst pose)
    const pads = Game.measure1v1Pads();
    const loBtn = (pads.leftEdge + CLEAR) / scale + REACH;
    const hiBtn = (pads.rightEdge - CLEAR) / scale - REACH;
    Game.minX = Math.max(Game.W * .15, loBtn);
    Game.maxX = Math.min(Game.W * .85, hiBtn);
    if (Game.minX > Game.maxX) { // ultra-narrow: keep a usable centre strip
      const mid = Game.W * .5, half = Math.max(40, (hiBtn - loBtn) * .5);
      Game.minX = mid - half; Game.maxX = mid + half;
    }
    if (Game.mode === 'practice') {
      // Game.W has a 640-unit minimum, so in portrait the logical arena can be
      // wider than the canvas actually shows. Keep Training spawns in the
      // visible canvas width, even when the ordinary control-safe lane misses it.
      const visibleRight = Math.min(Game.W, Game.canvas.width / (dpr * scale));
      const visibleMin = Math.max(0, Game.minX);
      const visibleMax = Math.min(visibleRight, Game.maxX);
      if (visibleMin <= visibleMax) {
        Game.minX = visibleMin; Game.maxX = visibleMax;
      } else {
        const inset = Math.min(REACH, visibleRight / 2);
        Game.minX = inset; Game.maxX = visibleRight - inset;
      }
    }
    if (Game.phase === 'title') {
      Game.placeTitleFighters();
    } else if (Game.mode === 'beatemup') {
      // BeatEmUp owns lane clamps; refresh btn rects only.
    } else if (Game.mode === 'practice' && Game.phase !== 'matchEnd') {
      fighters[0].x = Math.max(Game.minX, Math.min(Game.maxX, fighters[0].x || Game.W * .35));
      Game.placePracticeFighters();
    }
    Game.btns = Game.phase === 'title' ? [] : [...document.querySelectorAll('#controls button, #move-stick')].map(el => {
      const r = el.getBoundingClientRect(); return {x:r.left, y:r.top, w:r.width, h:r.height};
    });
    Game.titleBtns = Game.titleLayout().levels;
  }
  /** Inner edges (CSS px) of the left and right control pads. Practice uses these for its lane. */
  static measure1v1Pads() {
    const el = document.getElementById('controls');
    const fallback = { leftEdge: 16 + Game.safeL + 132, rightEdge: innerWidth - 16 - Game.safeR - 200 };
    if (!el) return fallback;
    const prev = { display: el.style.display, visibility: el.style.visibility };
    el.style.visibility = 'hidden'; el.style.display = '';
    let leftEdge = 0, rightEdge = innerWidth;
    for (const node of el.querySelectorAll('#move-stick, .pad.left button')) {
      const r = node.getBoundingClientRect(); if (r.width > 0) leftEdge = Math.max(leftEdge, r.right);
    }
    for (const node of el.querySelectorAll('.pad.right button')) {
      const r = node.getBoundingClientRect(); if (r.width > 0) rightEdge = Math.min(rightEdge, r.left);
    }
    el.style.display = prev.display; el.style.visibility = prev.visibility;
    return leftEdge > 0 && rightEdge < innerWidth ? { leftEdge, rightEdge } : fallback;
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
      if (box.special && me.bladeSuper?.hits.has(foe)) continue; // Wave already hit it
      if (box.special && (!foe.grounded || foe.inDodgeIFrames())) continue;
      const specialLane = box.special ? Depth.specialLaneTolerance(me) : null;
      const laneShift = me.groundY() - foe.groundY();
      if (!box.radial && Math.abs(laneShift) > (specialLane ?? Depth.hitTolerance(me.playerControlled)) + 1e-9) continue; // depth miss = normal whiff (epsilon absorbs float error at exactly 14px)
      // Player Special lanes are checked above; compare the hurtbox in the attacker's lane so off-lane targets get the same reach.
      const foeBox = specialLane != null ? { x:foe.hitbox.x, y:foe.hitbox.y + laneShift, w:foe.hitbox.w, h:foe.hitbox.h } : foe.hitbox;
      if (box.radial ? !Fighter.staffRadialHits(box, me, foe) : !Game.hitTest(box, foeBox)) continue;
      if (foe.inDodgeIFrames()) continue;
      if (foe.playerControlled && foe.invincibleT > 0) continue;
      me.hitDone = 1;
      if (box.special) me.hitTargets.set(foe, box.pulse);
      const hpBefore = foe.hp;
      const kind = foe.takeHit(box, me);
      if (box.special && me.bladeSuper) BladeSuper.landed(me.bladeSuper, foe, kind);
      const damage = Math.round((hpBefore - foe.hp) * 10) / 10;
      const confirmed = me.confirmHit(kind, damage);
      if (Game.mode === 'practice' && i === 0 && confirmed) {
        if (Game.practiceComboT <= 0) { Game.practiceComboHits = 0; Game.practiceComboDamage = 0; }
        Game.practiceComboHits++;
        Game.practiceComboDamage += damage;
        Game.practiceComboT = 1.25;
        Game.practiceLastMove = me.state === 'kick' ? (me.classProfile?.kickMove || 'FINISHER') : me.state === 'punch' ? (me.classProfile?.punchMove || 'ATTACK') : me.state.toUpperCase();
      }
      me.gainMeter(box.special ? 0 : box.dmg * 2.5);
      if (!box.special || !me.specialMeterTargets.has(foe)) foe.gainMeter(box.special ? 12 : box.dmg * 1.5);
      if (box.special) me.specialMeterTargets.add(foe);
      const cx = box.radial ? foe.hitbox.x + foe.hitbox.w / 2 : box.x + box.w / 2;
      const cy = box.radial ? foe.hitbox.y + foe.hitbox.h / 2 : box.y + box.h / 2;
      const criticalHit = !!box.critical && kind !== 'block';
      const isKarateSuper = box.special && me.classProfile?.style === 'ward';
      if (isKarateSuper) {
        const slot = Fx.karateSuperSlot(me.bones(), foe.bones());
        Fx.karateSuperText(me, me.atk, slot.x, slot.y, damage, criticalHit, '', me.classProfile);
      } else {
        Fx.damage(cx, cy - 12, damage, kind === 'block', criticalHit);
      }
      if (criticalHit) { Fx.critical(cx, cy, me.classProfile); Sfx.play('critical', me.classProfile); }
      if (box.special && me.classProfile?.style === 'ward') {
        const k = me.drawS() / 1.2;
        const specialStop = specialHitStop(box.pulse, me.atk.hitCount);
        if (box.pulse <= 1) { Fx.karateSuperPunch(cx, cy, me.face, k); Game.stop = specialStop; Game.shake = 0; }
        else if (box.pulse === 2) { Fx.karateSuperKickMid(cx, cy, me.face, k); Game.stop = specialStop; Game.shake = 0; }
        else { Fx.karateSuperKickHigh(cx, cy, me.face, k, foe.groundY()); Game.stop = specialStop; Game.shake = 8 / 60; Game.shMag = 4; }
        if (!me.specialEffectDone) { Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile); me.specialEffectDone = 1; }
      } else if (box.special && me.classProfile?.weapon === 'staff') {
        if (!me.specialEffectDone) { Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile); me.specialEffectDone = 1; }
        Game.stop = specialHitStop(box.pulse, me.atk.hitCount);
      } else if (box.special && me.bladeSuper) {
        BladeSuper.contactFx(box.pulse, cx, cy, me.drawS() / 1.2, kind);
        if (kind === 'block') Fx.blocked(cx, cy);
        if (!me.specialEffectDone) { Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile); me.specialEffectDone = 1; }
        Game.stop = specialHitStop(box.pulse, me.atk.hitCount); Game.shake = .12; Game.shMag = 4;
      } else {
        if (box.special && !me.specialEffectDone) {
          Fx.special(cx, cy, me.classProfile);
          Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile);
          me.specialEffectDone = 1;
        }
        else if (kind === 'block') Fx.blocked(cx, cy);
        else if (!criticalHit) Fx.hit(cx, cy);
        Game.stop = .06; Game.shake = .12; Game.shMag = 4;
      }
      if (me.playerControlled && !box.special && kind === 'hit' && damage > 0) {
        const frames = box.knockdown || me.state === 'kick' ? PACE.hitstop.finisher : PACE.hitstop.chain;
        Game.stop = frames / 60;
        Sfx.play(me.state === 'kick' ? 'player-heavy-hit' : 'player-normal-hit', me.classProfile);
      }
      if (kind === 'hit') foe.vy = -120;
      if (foe.hp <= 0 && Game.mode === 'practice' && i === 0) Game.resetPracticeDummy(false);
    }
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
    const total = PACE.dodgeCooldown;
    const cooldown = Math.max(0, Math.min(total, fighters[0].dodgeCooldown));
    const progress = Game.fighting ? `${Math.round((1 - cooldown / total) * 50) * 2}%` : '0%';
    const ready = Game.fighting && cooldown <= 0;
    if (btn.style.getPropertyValue('--action-progress') !== progress) btn.style.setProperty('--action-progress', progress);
    if (btn.classList.contains('ready') !== ready) btn.classList.toggle('ready', ready);
    btn.classList.toggle('flash', fighters[0].dodgeReadyFlash > 0);
    const label = ready ? 'Dodge roll ready' : Game.fighting
      ? `Dodge roll cooling down (${cooldown.toFixed(1)} seconds)` : 'Dodge roll available when fight starts';
    if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
  }
  static present() {
    if (Game.usingPhaser) {
      if (Game.spriteBodies && Game.paintPhaser) Game.paintPhaser();
      else Game.draw();
      return;
    }
    Game.draw();
    requestAnimationFrame(Game.frame);
  }
  static frame(now) {
    if (!Game.ready) return;
    // Stage entry (and practice, if the hero's frames are still arriving) waits
    // here. The sim does not step, so a wave cannot start on missing textures.
    if (holdForAssets()) { Game.last = now; Game.acc = 0; Game.present(); return; }
    let dt = (now - Game.last) / 1000; Game.last = now; if (dt > .05) dt = .05;
    if (Game.paused) { Game.acc = 0; Game.present(); return; }
    if (Game.shake > 0) Game.shake -= dt;
    Fx.update(dt);
    if (Game.stop > 0) { Game.stop -= dt; Game.present(); return; }
    Game.acc += dt;
      while (Game.acc >= Game.STEP) {
      const step = Game.STEP;
      if (Input.pollGamepad) Input.pollGamepad();
      if (BeatEmUp.stageTransitionLeft > 0) {
        BeatEmUp.tickStageTransition();
        Game.acc -= step;
        continue;
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
        Game.syncTitleFighters();
        fighters[0].state = 'idle'; fighters[1].state = 'idle';
        fighters[0].atk = null; fighters[1].atk = null;
        fighters[0].animT += step; fighters[1].animT += step;
        fighters[0].pose = Pose.idle(fighters[0].classProfile);
        fighters[1].pose = Pose.idle(fighters[1].classProfile);
        fighters[0].y = 0; fighters[1].y = 0;
      } else if (Game.phase === 'intro') {
        Game.bannerT -= step;
        if (Game.bannerT <= 0) {
          if (Game.mode === 'beatemup') {
            if (Game.banner.startsWith('WAVE') || Game.banner === 'BOSS') { Game.banner = 'Fight!'; Game.bannerT = .7; }
            else { Game.phase = 'fight'; Game.fighting = 1; Game.banner = ''; }
          } else { Game.phase = 'fight'; Game.fighting = 1; Game.banner = ''; }
        }
        fighters.forEach(f => {
          if (f.chip > f.hp) f.chip = Math.max(f.hp, f.chip - 100 * step / .3);
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
        } else if (Game.mode === 'practice') {
          if (Input.pad[1].punch) Input.was[1].punch = 0;
          if (Input.pad[1].kick) Input.was[1].kick = 0;
          if (Input.pad[1].special) Input.was[1].special = 0;
          fighters[0].update(step, fighters[1], 0);
          fighters[1].update(step, fighters[0], 1);
          fighters[1].x = Game.practiceDummyX;
          fighters[1].vx = 0;
          fighters[1].clamp();
          Game.resolve();
          BladeSuper.update(step);
        }
      } else if (Game.phase === 'waveTransition') {
        const player = BeatEmUp.playerEntry();
        const progress = 1 - BeatEmUp.waveTravelT / BeatEmUp.waveTravelDuration;
        const eased = progress * progress * (3 - 2 * progress);
        BeatEmUp.waveTravelEase = eased;
        if (player) {
          const nextX = BeatEmUp.waveTravelStartX + (BeatEmUp.waveTravelTargetX - BeatEmUp.waveTravelStartX) * eased;
          player.f.walkPx = (player.f.walkPx || 0) + Math.abs(nextX - player.f.x);
          player.f.x = nextX;
          player.f.y = 0; player.f.vx = 0; player.f.vy = 0; player.f.grounded = true;
          player.f.face = 1; player.f.state = 'walk';
          player.f.walkT += step;
          player.f.pose = Pose.walk(player.f.walkT, 1, player.f.classProfile);
        }
        BeatEmUp.easeTravelCamera(eased);
        if (player) BeatEmUp.clampFighterBones(player);
        if (BeatEmUp.pano() && !BeatEmUp.tiledReady()) BeatEmUp.bgGlide(eased);
        BeatEmUp.waveTravelT = Math.max(0, BeatEmUp.waveTravelT - step);
        if (BeatEmUp.waveTravelT <= 0) {
          if (player) {
            player.f.x = BeatEmUp.waveTravelTargetX;
            player.f.state = 'idle';
            player.f.vx = 0;
            player.f.pose = Pose.idle(player.f.classProfile);
          }
          BeatEmUp.waveTravelEase = 1;
          BeatEmUp.easeTravelCamera(1);
          if (player) BeatEmUp.clampFighterBones(player);
          if (BeatEmUp.pano() && !BeatEmUp.tiledReady()) BeatEmUp.bgGlide(1);
          const next = BeatEmUp.waveTravelNext;
          BeatEmUp.waveTravelNext = 0;
          if (next === 4) BeatEmUp.startBoss(false, true);
          else BeatEmUp.startWave(next, false, false, true);
        }
      } else if (Game.phase === 'matchEnd' && Game.mode === 'beatemup') {
        for (const e of BeatEmUp.cast) {
          if (e.f.chip > e.f.hp) e.f.chip = Math.max(e.f.hp, e.f.chip - 100 * step / .3);
          if (e.f.ragdollActive) BeatEmUp.withDepth(e, () => e.f.updateRagdoll(step));
        }
      }
      Game.acc -= step;
    }
    if (Game.phase !== 'title') { Game.syncSpecialBtn(); Game.syncDodgeBtn(); }
    Game.present();
  }
  // Warm sheet shared by pause, the clear countdown, and the stage results.
  // TIME on the stats row is the remaining stage timer (Game.timer). The run does not store elapsed time.
  static sheetLayout(opts) {
    const sc = Game.scale || 1;
    const small = innerWidth < 700;
    const padX = small ? 16 : 20;
    const padY = small ? 12 : 18;
    const gap = small ? 8 : 10;
    const h1Size = small ? 20 : 24;
    const priH = small ? 50 : 56;
    const secH = small ? 48 : 52;
    const safeL = Game.safeL || 0, safeR = Game.safeR || 0, safeT = Game.safeTop || 0, safeB = Game.safeB || 0;
    let sheetW = opts.countdown ? Math.min(300, innerWidth * 0.46) : Math.min(420, innerWidth * 0.62);
    sheetW = Math.min(sheetW, Math.max(180, innerWidth - safeL - safeR - 8));
    const innerW = sheetW - padX * 2;
    const h1H = h1Size + 6;
    const subLine = 16;
    const blocks = [{ kind: 'title', h: h1H, text: opts.title, color: opts.titleColor, size: h1Size }];
    if (opts.sub1) {
      const lines = Game.wrapCss(opts.sub1, 12, '400', 0.04, innerW);
      blocks.push({ kind: 'sub', h: lines.length * subLine, text: opts.sub1, lines, size: 12 });
    }
    if (opts.countdown) blocks.push({ kind: 'number', h: 72, text: String(opts.number), size: 64 });
    if (opts.stats) blocks.push({ kind: 'stats', h: 44 });
    if (opts.sub2) {
      const lines = Game.wrapCss(opts.sub2, 12, '400', 0.04, innerW);
      blocks.push({ kind: 'sub2', h: lines.length * subLine, text: opts.sub2, lines, size: 12 });
    }
    if (opts.buttons === 'pause') {
      blocks.push({ kind: 'resume', h: priH });
      blocks.push({ kind: 'pauseRow', h: secH });
    } else if (opts.primary) blocks.push({ kind: 'actionRow', h: priH });
    let contentH = 0;
    blocks.forEach((b, i) => { contentH += b.h; if (i) contentH += gap; });
    const sheetH = padY * 2 + contentH;
    let sheetX = (innerWidth - sheetW) / 2;
    if (sheetX < safeL) sheetX = safeL;
    let sheetY = (innerHeight - sheetH) / 2;
    if (sheetY < safeT) sheetY = safeT;
    if (sheetY + sheetH > innerHeight - safeB) sheetY = Math.max(safeT, innerHeight - safeB - sheetH);
    const g = (x, y, w, h, extra) => Object.assign({ x: x / sc, y: y / sc, w: w / sc, h: h / sc }, extra || {});
    const out = { sheet: g(sheetX, sheetY, sheetW, sheetH), title: null, sub: null, sub2: null, number: null, stats: [], resume: null, fullscreen: null, menu: null, home: null, primary: null };
    let y = sheetY + padY;
    const x0 = sheetX + padX;
    blocks.forEach((b, i) => {
      if (i) y += gap;
      if (b.kind === 'title') out.title = g(x0, y, innerW, b.h, { text: b.text, color: b.color, size: b.size });
      else if (b.kind === 'sub') out.sub = g(x0, y, innerW, b.h, { text: b.text, lines: b.lines, size: b.size });
      else if (b.kind === 'number') out.number = g(x0, y, innerW, b.h, { text: b.text, size: 64 });
      else if (b.kind === 'stats') {
        const tileGap = 6;
        const tileW = (innerW - tileGap * 3) / 4;
        const labels = ['SCORE', 'BEST', 'TIME', 'LIVES'];
        const values = [String(BeatEmUp.score), String(BeatEmUp.bestScore), BeatEmUp.formatTime(Game.timer), String(BeatEmUp.lives)];
        out.stats = labels.map((label, n) => g(x0 + n * (tileW + tileGap), y, tileW, b.h, { label, value: values[n] }));
      } else if (b.kind === 'sub2') out.sub2 = g(x0, y, innerW, b.h, { text: b.text, lines: b.lines, size: b.size });
      else if (b.kind === 'resume') out.resume = g(x0, y, innerW, b.h, { text: '▶ RESUME' });
      else if (b.kind === 'pauseRow') {
        const rowGap = small ? 8 : 10;
        const bw = (innerW - rowGap) / 2;
        out.fullscreen = g(x0, y, bw, b.h, { text: '⛶ FULLSCREEN' });
        out.menu = g(x0 + bw + rowGap, y, bw, b.h, { text: '⌂ MAIN MENU' });
      } else if (b.kind === 'actionRow') {
        const rowGap = small ? 8 : 10;
        const homeW = (innerW - rowGap) / 3;
        out.home = g(x0, y + (priH - secH), homeW, secH, { text: '⌂ MENU' });
        out.primary = g(x0 + homeW + rowGap, y, innerW - rowGap - homeW, priH, { text: opts.primary, shadow: Game.px(4) });
      }
      y += b.h;
    });
    return out;
  }
  static pauseLayout() {
    const sub = Game.mode === 'practice' ? 'PRACTICE' : 'STAGE ' + BeatEmUp.stage + ' · WAVE ' + BeatEmUp.wave;
    return Game.sheetLayout({ title: 'PAUSED', titleColor: '#FFE0A0', sub1: sub, buttons: 'pause' });
  }
  static countdownLayout() {
    return Game.sheetLayout({
      countdown: true,
      title: 'STAGE ' + BeatEmUp.stage + ' CLEAR',
      titleColor: '#FFE0A0',
      sub1: 'NEXT STAGE IN',
      number: BeatEmUp.clearCountdownSeconds(),
    });
  }
  static resultsLayout() {
    if (!BeatEmUp.stageOver || BeatEmUp.stageTransitionLeft > 0) return null;
    const cleared = BeatEmUp.stageOver === 1;
    const finalClear = cleared && BeatEmUp.stage >= BeatEmUp.stageTotal;
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1] || BeatEmUp.chapters[0];
    const boss = chapter.boss && chapter.boss.name;
    const next = BeatEmUp.chapters[BeatEmUp.stage];
    return Game.sheetLayout({
      title: cleared ? (finalClear ? 'CAMPAIGN COMPLETE' : 'STAGE ' + BeatEmUp.stage + ' CLEAR') : 'STAGE ' + BeatEmUp.stage + ' FAILED',
      titleColor: cleared ? '#FFE0A0' : '#F2826A',
      sub1: cleared ? 'DEFEATED · ' + (boss || '') : Game.failFlavor(chapter.title),
      sub2: cleared && !finalClear && next ? 'NEXT · ' + next.title : '',
      stats: true,
      primary: !cleared ? '↻ RETRY STAGE' : finalClear ? 'PLAY AGAIN ▶' : 'NEXT STAGE ▶',
    });
  }
  static dimScreen(ctx) {
    const sc = Game.scale || 1;
    ctx.fillStyle = 'rgba(26,18,16,.72)';
    ctx.fillRect(-8, -8, innerWidth / sc + 16, innerHeight / sc + 16);
  }
  static drawSubLines(ctx, block) {
    if (!block) return;
    const lines = block.lines || [block.text];
    const lineH = block.h / lines.length;
    lines.forEach((line, i) => {
      Game.textAt(ctx, line, block.x + block.w / 2, block.y + lineH * (i + 0.5), block.size || 12, '400', '#E9CFB0', 0.04);
    });
  }
  static drawPriButton(ctx, b, cssPx, weight, letterEm) {
    if (!b) return;
    const sh = b.shadow || Game.px(4);
    Game.fillRound(ctx, b.x, b.y + sh, b.w, b.h, 14, '#8A4A1E');
    const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    grad.addColorStop(0, '#FFC768');
    grad.addColorStop(1, '#E8902F');
    Game.fillRound(ctx, b.x, b.y, b.w, b.h, 14, grad);
    Game.textAt(ctx, b.text || b.label, b.x + b.w / 2, b.y + b.h / 2, cssPx, weight, '#2A1810', letterEm);
  }
  static drawSecButton(ctx, b) {
    if (!b) return;
    Game.fillRound(ctx, b.x, b.y, b.w, b.h, 14, null, 2, '#74431F');
    Game.textAt(ctx, b.text, b.x + b.w / 2, b.y + b.h / 2, 17, 'bold', '#E9CFB0', 0.08);
  }
  static drawWarmSheet(ctx, layout) {
    Game.dimScreen(ctx);
    const s = layout.sheet;
    Game.fillRound(ctx, s.x, s.y, s.w, s.h, 18, 'rgba(42,26,18,.96)', 2, '#5A3A26');
    if (layout.title) Game.textAt(ctx, layout.title.text, layout.title.x + layout.title.w / 2, layout.title.y + layout.title.h / 2, layout.title.size, 'bold', layout.title.color, 0.08);
    Game.drawSubLines(ctx, layout.sub);
    if (layout.number) Game.textAt(ctx, layout.number.text, layout.number.x + layout.number.w / 2, layout.number.y + layout.number.h / 2, 64, '900', '#FFE0A0', 0);
    for (const tile of layout.stats || []) {
      Game.fillRound(ctx, tile.x, tile.y, tile.w, tile.h, 10, 'rgba(26,18,16,.6)');
      Game.textAt(ctx, tile.label, tile.x + tile.w / 2, tile.y + Game.px(13), 9, 'bold', '#B86E32', 0.16);
      Game.textAt(ctx, tile.value, tile.x + tile.w / 2, tile.y + Game.px(30), 15, 'bold', '#FFE0A0', 0);
    }
    Game.drawSubLines(ctx, layout.sub2);
    if (layout.resume) Game.drawPriButton(ctx, layout.resume, 17, 'bold', 0.08);
    Game.drawSecButton(ctx, layout.fullscreen);
    Game.drawSecButton(ctx, layout.menu);
    Game.drawSecButton(ctx, layout.home);
    if (layout.primary) Game.drawPriButton(ctx, layout.primary, 17, 'bold', 0.08);
  }
  static drawStageClearOverlay(ctx) {
    Game.drawWarmSheet(ctx, Game.countdownLayout());
  }
  static drawPauseOverlay(ctx) {
    Game.drawWarmSheet(ctx, Game.pauseLayout());
  }
  static drawResultsSheet(ctx) {
    const layout = Game.resultsLayout();
    if (!layout) return;
    Game.drawWarmSheet(ctx, layout);
    BeatEmUp.resultNextBtn = layout.primary;
    BeatEmUp.resultHomeBtn = layout.home;
  }
  static bars(ctx) {
    const sc = Game.scale, safe = Game.safeTop;
    const top = (12 + safe) / sc, {w,x0,x1} = Game.hudBarLayout();
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
    drawBar(x1, fighters[1], '#FF6969', 'TRAINING DUMMY', false);
    const timerW = 38 / sc;
    Game.drawHudPanel(ctx, Game.W / 2 - timerW / 2, panelY, timerW, panelH, '#F6C453');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 7 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#AEBBD0';
    ctx.fillText('TRAIN', Game.W / 2, top + 4 / sc);
    ctx.font = 'bold ' + 16 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFF0C2';
    ctx.fillText('∞', Game.W / 2, top + 20 / sc);
    ctx.textBaseline = 'alphabetic';
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
  static hudBarLayout(centerGapPx = 44) {
    const sc = Game.scale || 1, gap = centerGapPx / sc;
    const reservedLeft = Game.menuRight ? (Game.menuRight + 8) / sc : 0;
    const width = Math.min(Game.W * .4 - 14 / sc, Game.W / 2 - gap / 2 - reservedLeft);
    const x0 = (Game.W - 2 * width - gap) / 2;
    return {w:width,gap,x0,x1:x0 + width + gap};
  }
  static drawPracticeHud(ctx) {
    const sc = Game.scale, w = Math.min(320 / sc, Game.W * .7), h = 52 / sc, x = (Game.W - w) / 2, y = Game.H * .17;
    Game.drawHudPanel(ctx, x, y, w, h, '#F6C453');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 9 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#6ECFFF';
    ctx.fillText('PRACTICE  //  PUNCH, KICK, AND SPECIAL ARE SINGLE MOVES', Game.W / 2, y + 16 / sc);
    ctx.font = 'bold ' + 14 / sc + 'px ui-monospace,monospace'; ctx.fillStyle = '#FFE06B';
    ctx.fillText(String(Game.practiceComboHits).padStart(2, '0') + ' HITS   ·   ' + Game.practiceComboDamage.toFixed(1) + ' DMG', Game.W / 2, y + 34 / sc);
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
    const back = Depth.areaTop(), front = Depth.areaBot();
    ctx.fillStyle = '#181A22'; ctx.fillRect(0, back, Game.W, Game.H - back);
    ctx.fillStyle = '#3A3F52'; ctx.fillRect(0, back, Game.W, 2 / sc);
    ctx.save();
    ctx.globalAlpha = .10;
    ctx.strokeStyle = '#9AA5C2';
    ctx.lineWidth = 1 / sc;
    for (const y of [back, (back + front) / 2, front]) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Game.W, y); ctx.stroke();
    }
    ctx.restore();
  }
  static drawTitle(ctx, part = 'all') {
    const layout = Game.titleLayout();
    Game.titleBtns = layout.levels;
    if (part !== 'chrome') {
    const bg = Game.titleBackgroundImage();
    if (bg && bg.width) {
      const srcW = bg.naturalWidth || bg.width, srcH = bg.naturalHeight || bg.height;
      const cover = Math.max(Game.W / srcW, Game.H / srcH);
      const drawW = srcW * cover, drawH = srcH * cover;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bg, (Game.W - drawW) / 2, (Game.H - drawH) / 2, drawW, drawH);
      ctx.restore();
    } else {
      const fallback = ctx.createLinearGradient(0, 0, 0, Game.H);
      fallback.addColorStop(0, '#081528'); fallback.addColorStop(1, '#11101B');
      ctx.fillStyle = fallback; ctx.fillRect(0, 0, Game.W, Game.H);
    }
    const veil = ctx.createLinearGradient(0, 0, Game.W, 0);
    veil.addColorStop(0, 'rgba(26,18,16,.25)');
    veil.addColorStop(.42, 'rgba(26,18,16,.55)');
    veil.addColorStop(1, 'rgba(26,18,16,.88)');
    ctx.fillStyle = veil; ctx.fillRect(0, 0, Game.W, Game.H);
    }
    if (part === 'backdrop') return;

    const logo = layout.logo;
    const special = layout.special;
    Game.textAt(ctx, logo.text, logo.x + Game.px(2), logo.y + logo.h / 2 + Game.px(2), layout.small ? 19 : 22, '900', '#3A2418', 0, 'left');
    Game.textAt(ctx, logo.text, logo.x, logo.y + logo.h / 2, layout.small ? 19 : 22, '900', '#FFE0A0', 0, 'left');

    const heroArt = classIdleSource(Game.selectedClass, (fighters[0].animT || 0) * PACE.spriteFps);
    if (heroArt && heroArt.image) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Game.W, special.y);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Game.px(6);
      ctx.drawImage(heroArt.image, layout.hero.x, layout.hero.y, layout.hero.w, layout.hero.h);
      ctx.restore();
    }
    Game.textAt(ctx, special.text, special.x, special.y + special.h / 2, 13, 'bold', '#E8A552', 0.08, 'left');

    const drawCardSprite = (card) => {
      const selected = card.id === Game.selectedClass;
      const art = classIdleSource(card.id, selected ? (fighters[0].animT || 0) * PACE.spriteFps : 0);
      if (!art || !art.image) return;
      const zoneH = card.h * 0.6;
      const maxW = Math.max(Game.px(8), card.w - Game.px(8));
      const maxH = Math.max(Game.px(8), zoneH - Game.px(2));
      let scale = maxH / art.box.h;
      if (art.box.w * scale > maxW) scale = maxW / art.box.w;
      const drawW = art.box.w * scale;
      const drawH = art.box.h * scale;
      const imgLeft = card.x + card.w / 2 - art.anchor * scale;
      const imgTop = card.y + zoneH - drawH;
      ctx.save();
      ctx.beginPath();
      ctx.rect(card.x + Game.px(2), card.y + Game.px(2), card.w - Game.px(4), Math.max(Game.px(4), zoneH - Game.px(2)));
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(art.image, imgLeft, imgTop, drawW, drawH);
      ctx.restore();
    };
    ctx.globalAlpha = 1;
    for (const label of [layout.labels.fighter, layout.labels.difficulty]) {
      Game.textAt(ctx, label.text, label.x, label.y + label.h / 2, 12, '700', '#E8A552', 0.18, 'left');
    }
    for (const card of layout.classes) {
      const selected = card.id === Game.selectedClass;
      if (selected) Game.fillRound(ctx, card.x - Game.px(2), card.y - Game.px(2), card.w + Game.px(4), card.h + Game.px(4), 14, 'rgba(232,165,82,.25)');
      Game.fillRound(ctx, card.x, card.y, card.w, card.h, 12, selected ? 'rgba(116,67,31,.85)' : 'rgba(58,36,24,.78)', 2, selected ? '#E8A552' : '#5A3A26');
      drawCardSprite(card);
      const name = card.nameBox;
      Game.textAt(ctx, card.profile.name, name.x + name.w / 2, name.y + name.h / 2, 12, '700', '#FFE0A0', 0);
    }
    const seg = layout.segment;
    Game.fillRound(ctx, seg.x, seg.y, seg.w, seg.h, 12, 'rgba(58,36,24,.78)');
    for (const b of layout.levels) {
      const sel = b.id === Game.arcadeLevel;
      if (sel) Game.fillRound(ctx, b.x, seg.y + Game.px(4), b.w, seg.h - Game.px(8), 8, '#E8A552');
      Game.textAt(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2, 15, sel ? 'bold' : '400', sel ? '#2A1810' : '#E9CFB0', 0);
    }
    const practice = layout.practice;
    Game.fillRound(ctx, practice.x, practice.y, practice.w, practice.h, 14, null, 2, Game.mode === 'practice' ? '#E8A552' : '#74431F');
    Game.textAt(ctx, 'Practice', practice.x + practice.w / 2, practice.y + practice.h / 2, 14, 'bold', '#E9CFB0', 0);
    Game.drawPriButton(ctx, layout.start, 22, '900', 0.1);
    const gear = layout.gear;
    Game.fillRound(ctx, gear.x, gear.y, gear.w, gear.h, 12, 'rgba(58,36,24,.7)');
    Game.textAt(ctx, '⛶', gear.x + gear.w / 2, gear.y + gear.h / 2, 22, 'bold', '#E9CFB0', 0);
    ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
  }
  static drawKarateCharge(ctx) {
    const camera = Game.mode === 'beatemup' && Game.phase !== 'title' ? BeatEmUp.cameraX : 0;
    const list = Game.mode === 'beatemup' && Game.phase !== 'title' && BeatEmUp.cast?.length
      ? BeatEmUp.cast.map((entry) => entry.f)
      : fighters;
    for (const fighter of list) {
      if (!fighter || fighter.classId !== 'freehand' || fighter.classProfile?.style !== 'ward' || fighter.classProfile?.weapon) continue;
      if (fighter.state !== 'special' || !fighter.atk || fighter.hp <= 0 || fighter.atkT > fighter.atk.su) continue;
      const progress = Math.min(1, fighter.atkT / Math.max(1, fighter.atk.su));
      const breathe = .84 + .16 * Math.sin((fighter.animT || 0) * 16);
      const scale = fighter.drawS() / 1.2;
      const radius = (20 + progress * 18) * breathe * scale;
      Fx.chargeAura(ctx, fighter.x - camera, fighter.groundY() + fighter.y - 62 * fighter.drawS(), radius);
    }
  }
  static drawSpriteFx(ctx) {
    const list = Game.mode === 'beatemup' && Game.phase !== 'title' && BeatEmUp.cast?.length
      ? BeatEmUp.cast.map((entry) => entry.f)
      : fighters;
    for (const fighter of list) {
      if (!fighter || fighter.classId !== 'freehand') continue;
      fighter._phaserBody = true;
      fighter.draw(ctx);
      fighter._phaserBody = false;
    }
  }
  static draw(layer = 'all') {
    const ctx = Game.ctx;
    if (!ctx) return;
    const overlay = layer === 'overlay';
    if (!overlay && (Math.max(1, devicePixelRatio || 1) !== Game.fitDpr || innerWidth !== Game.fitW || innerHeight !== Game.fitH)) Game.fit();
    if (!overlay) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    const pixel = Game.paintScale > 0 ? Game.paintScale : Game.fitDpr * Game.scale;
    ctx.setTransform(pixel, 0, 0, pixel, 0, 0);
    let sx = Game.drawShakeX || 0, sy = Game.drawShakeY || 0;
    if (!overlay) {
      sx = 0; sy = 0;
      if (Game.shake > 0) { const m = Game.shMag * (Game.shake / .12); sx = (Math.random() - .5) * 2 * m; sy = (Math.random() - .5) * 2 * m; }
      Game.drawShakeX = sx; Game.drawShakeY = sy;
    }
    Game.drawShakeY = sy;
    ctx.save(); ctx.translate(sx, sy);
    if (!overlay) {
    if (Game.phase === 'title') Game.drawTitle(ctx, 'backdrop');
    else if (Game.mode === 'beatemup') {
    BeatEmUp.draw(ctx);
    } else if (Game.phase !== 'title') {
      Game.drawArena(ctx);
      // Contact shadows (drawn before fighters, back to front).
      for (const f of fighters) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(f.x, f.groundY() + 1, 23 * f.depthScale(), 4 * f.depthScale(), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        BeatEmUp.drawDodgeArc(ctx, f, f.x, f.groundY() + 1, 23 * f.depthScale());
        ctx.restore();
      }
      for (const f of fighters.slice().sort((a, b) => a.depth - b.depth)) {
        if (!Game.spriteBodies) f.draw(ctx);
      }
      if (!Game.spriteBodies) {
        BladeSuper.draw(ctx);
        Fx.draw(ctx);
      }
    }
    }
    if (layer === 'world') {
      if (Game.spriteBodies) Game.drawSpriteFx(ctx);
      ctx.restore();
      return;
    }
    if (Game.phase === 'title') {
      Game.drawTitle(ctx, 'chrome');
      ctx.restore();
      const scene = Game.phaserScene;
      const menuIdle = scene && scene.textures.exists('menu-idle') ? scene.textures.get('menu-idle') : null;
      const idle = (name) => !!(menuIdle && menuIdle.has(name));
      if (!window.__menuShown && Game.spriteBodies && scene
        && scene.textures.exists('menu-bg') && idle('karate-idle-0')
        && idle('staff-idle-0') && idle('blade-idle-0')) {
        window.__menuShown = true;
        window.__menuShownAt = performance.now();
        // Full hero atlases start only after this timestamp, so they are not part of boot.
        startBackgroundLoads(scene);
      }
      return;
    }
    if (Game.spriteBodies && Game.phase !== 'title') Game.drawKarateCharge(ctx);
    if (Game.spriteBodies && Game.mode !== 'beatemup') {
      BladeSuper.draw(ctx);
      Fx.draw(ctx);
    } else if (Game.spriteBodies && Game.mode === 'beatemup') {
      Fx.draw(ctx, 'front');
    }
    if (Game.mode === 'practice') Game.bars(ctx);
    if (Game.mode === 'practice') Game.drawPracticeHud(ctx);
    const arcadeIntroPanelActive = Game.mode === 'beatemup' && Game.phase === 'intro' && BeatEmUp.eventT > 0;
    const sheetUp = Game.paused || (Game.mode === 'beatemup' && (BeatEmUp.stageTransitionLeft > 0 || BeatEmUp.stageOver));
    if (Game.banner && !sheetUp && !arcadeIntroPanelActive) {
      const sc = Game.scale, bannerY = Game.H * .42, bannerW = (Game.banner === 'Fight!' ? 210 : 260) / sc;
      const bannerH = Game.matchOver ? 74 / sc : 56 / sc;
      Game.drawHudPanel(ctx, Game.W / 2 - bannerW / 2, bannerY - bannerH / 2, bannerW, bannerH, Game.matchOver ? '#F6C453' : '#6ECFFF');
      ctx.fillStyle = '#FFF0C2'; ctx.textAlign = 'center';
      ctx.font = 'bold ' + (Game.banner === 'Fight!' ? 28 : 21) / sc + 'px ui-monospace,monospace';
      ctx.fillText(Game.banner, Game.W / 2, Game.H * .42);
    }
    if (layer !== 'world') Game.syncControls();
    if (Game.paused) Game.drawPauseOverlay(ctx);
    else if (Game.mode === 'beatemup' && BeatEmUp.stageTransitionLeft > 0) Game.drawStageClearOverlay(ctx);
    else if (Game.mode === 'beatemup' && BeatEmUp.stageOver) Game.drawResultsSheet(ctx);
    ctx.restore();
  }
}
