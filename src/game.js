import { Sfx } from './audio.js';
import { BeatEmUp } from './beatemup.js';
import { BladeSuper } from './blade.js';
import { ArcadeDiff, CpuHotColors, Depth, FighterClasses, PlayerCoolColor } from './config.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Input } from './input.js';
import { Pose } from './pose.js';
import { startPhaser } from './phaser-host.js';

export let fighters = [new Fighter(0, PlayerCoolColor, 1, 'YOU'), new Fighter(0, CpuHotColors['1v1'], -1, 'CPU')];

export class Game {
  static W = 960; static H = 540; static GROUND = 390; static STEP = 1 / 60;
  static minX = 192; static maxX = 768; static scale = 1; static ox = 0; static oy = 0;
  static hr = 16.5; static lw = 6; static btns = [];
  static safeTop = 0; static safeL = 0; static safeR = 0; static menuRight = 0; static drawShakeY = 0;
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
  static titleBackground = (() => { const image = new Image(); image.src = 'assets/backgrounds/main-menu.webp'; return image; })();
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
  static titleLayout() {
    const sc = Game.scale;
    const compact = sc < 1.5;
    const tabs = Game.modeTabs();
    if (Game.mode !== 'practice') {
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
  }
  static modeTabs() {
    const sc = Game.scale;
    const compact = sc < 1.5;
    const tw = 140 / sc, th = 44 / sc, tgap = 10 / sc;
    const tTotal = 2 * tw + tgap;
    const tx0 = (Game.W - tTotal) / 2;
    const ty = Game.H * (compact ? .25 : .38) - th / 2;
    return [
      { id: 'practice', label: 'Practice', x: tx0, y: ty, w: tw, h: th },
      { id: 'beatemup', label: "Beat 'em up", x: tx0 + tw + tgap, y: ty, w: tw, h: th },
    ];
  }
  static difficultyButtonHeight(sc = Game.scale) { return (sc < 1.5 ? 38 : 40) / sc; }
  static titlePointer(e) {
    if (Game.mode !== 'practice' && Game.mode !== 'beatemup') Game.selectMode('beatemup');
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
    if (Game.mode === 'practice') {
      const card = (layout.classes || []).find(b => gx >= b.x && gx <= b.x + b.w && gy >= b.y && gy <= b.y + b.h);
      if (card) { Game.selectClass(card.id); return; }
      const start = layout.start;
      if (start && gx >= start.x && gx <= start.x + start.w && gy >= start.y && gy <= start.y + start.h) Game.startMatch();
    }
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
      if (box.special && (!foe.grounded || foe.dodgeT > 0)) continue;
      const specialLane = box.special ? Depth.specialLaneTolerance(me) : null;
      const laneShift = me.groundY() - foe.groundY();
      if (!box.radial && Math.abs(laneShift) > (specialLane ?? Depth.hitTolerance(me.playerControlled)) + 1e-9) continue; // depth miss = normal whiff (epsilon absorbs float error at exactly 14px)
      // Player Special lanes are checked above; compare the hurtbox in the attacker's lane so off-lane targets get the same reach.
      const foeBox = specialLane != null ? { x:foe.hitbox.x, y:foe.hitbox.y + laneShift, w:foe.hitbox.w, h:foe.hitbox.h } : foe.hitbox;
      if (box.radial ? !Fighter.staffRadialHits(box, me, foe) : !Game.hitTest(box, foeBox)) continue;
      if (foe.dodgeT > 0) continue;
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
        Game.practiceLastMove = me.state === 'kick' ? 'HEAVY STRIKE' : me.state === 'punch' ? 'PUNCH' : me.state.toUpperCase();
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
        if (box.pulse <= 1) { Fx.karateSuperPunch(cx, cy, me.face, k); Game.stop = 1 / 60; Game.shake = 0; }
        else if (box.pulse === 2) { Fx.karateSuperKickMid(cx, cy, me.face, k); Game.stop = 1 / 60; Game.shake = 0; }
        else { Fx.karateSuperKickHigh(cx, cy, me.face, k, foe.groundY()); Game.stop = 2 / 60; Game.shake = 8 / 60; Game.shMag = 4; }
        if (!me.specialEffectDone) { Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile); me.specialEffectDone = 1; }
      } else if (box.special && me.classProfile?.weapon === 'staff') {
        if (!me.specialEffectDone) { Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile); me.specialEffectDone = 1; }
      } else if (box.special && me.bladeSuper) {
        BladeSuper.contactFx(box.pulse, cx, cy, me.drawS() / 1.2, kind);
        if (kind === 'block') Fx.blocked(cx, cy);
        if (!me.specialEffectDone) { Sfx.play(me.playerControlled ? 'player-special-hit' : 'super-hit', me.classProfile); me.specialEffectDone = 1; }
        Game.stop = .06; Game.shake = .12; Game.shMag = 4; // unchanged contact hit-stop; impact holds add none
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
      if (me.playerControlled && !box.special && kind === 'hit' && damage > 0)
        Sfx.play(me.state === 'kick' ? 'player-heavy-hit' : 'player-normal-hit', me.classProfile);
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
    const cooldown = Math.max(0, Math.min(1.05, fighters[0].dodgeCooldown));
    const progress = Game.fighting ? `${Math.round((1 - cooldown / 1.05) * 50) * 2}%` : '0%';
    const ready = Game.fighting && cooldown <= 0;
    if (btn.style.getPropertyValue('--action-progress') !== progress) btn.style.setProperty('--action-progress', progress);
    if (btn.classList.contains('ready') !== ready) btn.classList.toggle('ready', ready);
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
    let dt = (now - Game.last) / 1000; Game.last = now; if (dt > .05) dt = .05;
    if (Game.paused) { Game.acc = 0; Game.present(); return; }
    if (Game.shake > 0) Game.shake -= dt;
    Fx.update(dt);
    if (Game.stop > 0) { Game.stop -= dt; Game.present(); return; }
    Game.acc += dt;
    while (Game.acc >= Game.STEP) {
      const step = Game.STEP;
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
  static drawStageClearOverlay(ctx) {
    const sc = Game.scale || 1;
    const n = BeatEmUp.clearCountdownSeconds();
    ctx.fillStyle = 'rgba(4,7,14,.62)';
    ctx.fillRect(0, 0, Game.W, Game.H);
    const w = Math.min(Game.W * .7, 300 / sc), h = 78 / sc;
    const x = (Game.W - w) / 2, y = Game.H * .4 - h / 2;
    Game.drawHudPanel(ctx, x, y, w, h, '#F6C453');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + 18 / sc + 'px ui-monospace,monospace';
    ctx.fillStyle = '#FFE06B';
    ctx.fillText('STAGE CLEAR', Game.W / 2, y + 26 / sc);
    ctx.font = 'bold ' + 13 / sc + 'px ui-monospace,monospace';
    ctx.fillStyle = '#E7EAF2';
    ctx.fillText('Next stage in ' + n, Game.W / 2, y + 52 / sc);
    ctx.textBaseline = 'alphabetic';
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
    const sc = Game.scale;
    const compact = sc < 1.5;
    const layout = Game.titleLayout();
    Game.titleBtns = layout.levels;
    if (part !== 'chrome') {
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
    }
    if (part === 'backdrop') return;
    // Keep the selected fighters visible behind the menu cards, as in the arcade mockup.
    if (!Game.spriteBodies) fighters.forEach(fighter => fighter.draw(ctx));

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
      const sel = b.id === Game.arcadeLevel;
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
    if (BeatEmUp.stageTransitionLeft > 0) Game.drawStageClearOverlay(ctx);
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
    if (Game.phase === 'title') { Game.drawTitle(ctx, 'chrome'); ctx.restore(); return; }
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
    if (Game.banner && !(BeatEmUp.stageTransitionLeft > 0) && !arcadeIntroPanelActive) {
      const sc = Game.scale, bannerY = Game.H * .42, bannerW = (Game.banner === 'Fight!' ? 210 : 260) / sc;
      const bannerH = Game.matchOver ? 74 / sc : 56 / sc;
      Game.drawHudPanel(ctx, Game.W / 2 - bannerW / 2, bannerY - bannerH / 2, bannerW, bannerH, Game.matchOver ? '#F6C453' : '#6ECFFF');
      ctx.fillStyle = '#FFF0C2'; ctx.textAlign = 'center';
      ctx.font = 'bold ' + (Game.banner === 'Fight!' ? 28 : 21) / sc + 'px ui-monospace,monospace';
      ctx.fillText(Game.banner, Game.W / 2, Game.H * .42);
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
    ctx.restore();
  }
}
