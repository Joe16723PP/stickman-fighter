import { Sfx } from './audio.js';
import { BeatEmUp } from './beatemup.js';
import { Depth } from './config.js';
import { Game } from './game.js';

export class Input {
  static keys = new Set();
  static pad = [{}, {}];
  static was = [{}, {}];
  /** Touch presses seen since the last sim step, so a tap shorter than one frame still fires. */
  static tapped = [{}, {}];
  // acts list byte-identical to main (AC2). Depth keys read via depthHeld() in beat/1v1/practice.
  static acts = ['left','right','jump','punch','kick','block','roll','special'];
  static keyMap = [
    {left:['a','A','ArrowLeft'], right:['d','D','ArrowRight'], jump:[], punch:['j','J'], kick:['k','K'], block:['l','L'], roll:['Shift'], special:['i','I']},
    {left:[], right:[], jump:[], punch:[], kick:[], block:[], roll:[], special:[]},
  ];
  static depthKeys = { up:['w','W','ArrowUp'], down:['s','S','ArrowDown'] };
  // Local 2P depth keys (not wired to any current mode; kept for future split-screen): T = back, G = near.
  static p2DepthKeys = { up:['t','T'], down:['g','G'] };
  static bind() {
    Input.pad.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.was.forEach(p => Input.acts.forEach(a => p[a] = 0));
    Input.tapped = [{}, {}];
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
      btn.addEventListener('pointerdown', e => { Sfx.unlock(); e.preventDefault(); e.stopPropagation(); set(1); Input.tapped[+btn.dataset.p][btn.dataset.k] = 1; });
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
    // Jump is removed; W/↑ in beat 'em up still changes lanes via depth keys.
    Input.keyMap[0].jump = [];
  }
  static held(p, a) { return Input.keyMap[p][a].some(k => Input.keys.has(k)) || !!Input.pad[p][a]; }
  static depthHeld(dir, slot = 0) {
    if (Game.mode !== 'beatemup' && Game.mode !== '1v1' && Game.mode !== 'practice') return false;
    const padKey = dir === 'up' ? 'depthUp' : 'depthDown';
    const keys = slot === 0 ? Input.depthKeys[dir] : Input.p2DepthKeys[dir];
    return (keys || []).some(k => Input.keys.has(k)) || !!(slot === 0 && Input.pad[0][padKey]);
  }
  static edge(p, a) {
    const tap = Input.tapped[p][a]; Input.tapped[p][a] = 0;
    const on = Input.held(p, a), e = (on || !!tap) && !Input.was[p][a];
    Input.was[p][a] = on || e ? 1 : 0; return e;
  }
}

/* Move timing at 60fps (Game.STEP). Windup/hit/recovery + chain/cancel live here only.
 * Pacing pass (2026-11-15): normals' startup (su/chainSu) and recovery (re/chainRe) are x1.3 of the old
 * values (rounded), active frames unchanged. Supers (special/staffSpecial) unchanged. */
