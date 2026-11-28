import { Sfx } from './audio.js';
import { BladeSuper } from './blade.js';
import { ArcadeDiff, ArchetypeSkeleton, BossCounters, BossFields, BossHardness, BossPhases, BossSignature, BossSignatures, BossWeapons, CpuHotColors, Depth, EnemyArchetypes, EnemyBash, EnemyBashes, EnemyCombos, EnemyDeploy, EnemyDeploys, EnemyGrab, EnemyGrabs, EnemyProjectile, EnemyRush, EnemyRushes, EnemySlam, EnemySlams, EnemyWeaponProfiles, FighterClasses, PACE, PlayerCoolColor, STAGE_TRANSITION_DELAY, ShockZones, specialHitStop } from './config.js';
import { Fighter } from './fighter.js';
import { Fx } from './fx.js';
import { Game, fighters } from './game.js';
import { Input } from './input.js';

export class BeatEmUp {
  static RUN_SECONDS = 210;
  static START_LIVES = 3;
  static BAND_TOP = 0.56;
  static BAND_BOT = 0.88;
  static DEPTH_HIT_PX = Depth.HIT_PX;
  /** Beat 'em up enemy lane window. Wider than Depth.HIT_PX (14) and still under the player's 22–36. */
  static ENEMY_DEPTH_HIT_PX = 19;
  /** Regular / Brawler punch tell. Inside measured fist contact (61px back lane … 66px front) at runtime scale. */
  static PUNCH_TRIGGER_PX = 60;
  static cameraX = 0;
  static skyOffset = 0;
  static cast = [];
  static items = [];
  static bossProjectiles = [];
  static bossFields = []; // Boss B2: laser lines, barricades, afterimages
  static enemyProjectiles = [];
  static hazards = []; // Disruptor shock zones (ShockZones)
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
    'assets/backgrounds/stage-01-street-brawl.webp',
    'assets/backgrounds/stage-02-dockyard.webp',
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
  /** Per-stage panoramas (Wave 1-3 + Boss extension, source px; seam = panorama/Boss join). A stage listed here is drawn
      at full screen height with the aspect kept; bgX is the left edge of the visible source window, anchored per wave/boss
      and eased with the wave-travel glide. Other stages keep the stretched draw. */
  static PANOS = {
    1: { w: 3371, h: 725, seam: 2170, wave2: 723 }, // Street Brawl
    2: { w: 3371, h: 725, seam: 2170, wave2: 723 }, // Dockyard
  };
  static PANO = BeatEmUp.PANOS[1];
  static pano(stage = BeatEmUp.stage) { return BeatEmUp.PANOS[stage] || null; }
  /** Seamless street tiles. Waves 1–3 scroll 1:1 with cameraX. Wave 4 crossfades to a standalone boss plate.
      A later stage opts in by adding one entry; Stage 2's panorama and Stages 3–10's stretched plates stay put. */
  static TILED_STAGES = {
    1: {
      tile: 'assets/backgrounds/stage-01-street-tile.webp',
      boss: 'assets/backgrounds/stage-01-boss-arena.webp',
      w: 1280,
      h: 720,
    },
  };
  /** Boss plate fade, seconds. Finishes during the wave-3 → wave-4 glide (1.05s) and also covers a direct boss entry. */
  static BOSS_FADE = 0.7;
  static bossAlpha = 0;
  static bossFadeStart = 0;
  static tiled(stage = BeatEmUp.stage) { return BeatEmUp.TILED_STAGES[stage] || null; }
  /** True once the street tile has decoded. Until then the panorama (or stretched plate) stays in charge. */
  static tiledReady(stage = BeatEmUp.stage) {
    const spec = BeatEmUp.tiled(stage);
    if (!spec) return false;
    const image = BeatEmUp.backgroundCache.get(spec.tile);
    return !!(image && image.complete && image.naturalWidth);
  }
  static bgX = 0;
  static bgTravelFrom = 0;
  static bgTravelTo = 0;
  static bgViewW(W = Game.W, H = Game.H, stage = BeatEmUp.stage) { return W * (BeatEmUp.pano(stage) || BeatEmUp.PANO).h / H; }
  /** Left edge of the view for wave n (1-3) or the boss (4), clamped to the panorama. Wave 3 ends at the panorama/Boss
      join, the boss shows the right end; Wave 2 is ~723 but never past 3/4 of the way to Wave 3, so every glide moves right. */
  static bgAnchor(n, W = Game.W, H = Game.H, stage = BeatEmUp.stage) {
    const P = BeatEmUp.pano(stage);
    if (!P) return 0;
    const viewW = BeatEmUp.bgViewW(W, H, stage), max = Math.max(0, P.w - viewW);
    const clamp = v => Math.max(0, Math.min(max, v));
    const w3 = clamp(P.seam - viewW);
    if (n <= 1) return 0;
    if (n === 2) return Math.min(clamp(P.wave2), w3 * .75);
    if (n === 3) return w3;
    // Boss stays on the segment right of the join. A wide screen cannot also show the street side.
    return Math.max(P.seam, max);
  }
  static bgSet(n) { BeatEmUp.bgX = BeatEmUp.bgTravelFrom = BeatEmUp.bgTravelTo = BeatEmUp.bgAnchor(n); }
  /** Share of the screen kept clear on each side. Inside the middle, the camera stays put. */
  static CAMERA_MARGIN = 0.18;
  /** Player walk and lane change. Reads the shared PACE block. */
  static get PACE() { return PACE.move; }
  /** How far the picture may scroll on this wave. Street waves stop on the next plate; the boss stays past the join. */
  static bgScrollRange() {
    const P = BeatEmUp.pano();
    if (!P) return { left: 0, right: 0 };
    const viewW = BeatEmUp.bgViewW();
    const imageMax = Math.max(0, P.w - viewW);
    const wave = BeatEmUp.wave || 1;
    if (wave >= 4) {
      const right = Math.max(P.seam, imageMax);
      return { left: Math.min(P.seam, right), right };
    }
    const streetEnd = Math.max(0, Math.min(imageMax, P.seam - viewW));
    const right = wave >= 3 ? streetEnd : Math.min(streetEnd, BeatEmUp.bgAnchor(wave + 1));
    return { left: 0, right };
  }
  /** Panorama tracks the camera in both directions and stays inside this wave's picture.
      0.6 of the draw scale: the street moves with the walk, about 40% slower than the fighter. */
  static bgFollow(dx) {
    if (!dx || !BeatEmUp.pano()) return;
    const P = BeatEmUp.pano();
    const range = BeatEmUp.bgScrollRange();
    const follow = P.h / Game.H * 0.6;
    BeatEmUp.bgX = Math.max(range.left, Math.min(range.right, BeatEmUp.bgX + dx * follow));
  }
  /** Right edge of the camera. Picture waves stop when the plate runs out; other stages stop at the stage end.
      The wave walk eases the picture itself, so it may carry the camera on to the next plate. */
  static cameraMax(limitToPicture = true) {
    const minCam = Math.max(0, BeatEmUp.lockL);
    const stageMax = Math.max(minCam, BeatEmUp.worldMax - BeatEmUp.viewWidth());
    // A looping street has no plate wall. Stopping at the panorama length would freeze the walk.
    if (BeatEmUp.tiledReady()) return stageMax;
    if (!limitToPicture || !BeatEmUp.pano()) return stageMax;
    const range = BeatEmUp.bgScrollRange();
    const follow = BeatEmUp.pano().h / Game.H * 0.6;
    const room = range.right - BeatEmUp.bgX;
    if (!(room > 0) || !(follow > 0)) return Math.min(stageMax, BeatEmUp.cameraX);
    return Math.min(stageMax, BeatEmUp.cameraX + room / follow);
  }
  /** Hold the camera while the player is in the middle. Shift it only when they enter an edge band,
      and only enough to set them back on the inner edge of that band. */
  static followPlayer(player = BeatEmUp.playerEntry(), trackBackground = true) {
    if (!player) return;
    const minCam = Math.max(0, BeatEmUp.lockL);
    const travelToBoss = Game.phase === 'waveTransition' && BeatEmUp.waveTravelNext === 4;
    const maxCam = Math.max(minCam, BeatEmUp.cameraMax(Game.phase !== 'waveTransition' || travelToBoss));
    const view = BeatEmUp.viewWidth();
    const margin = view * BeatEmUp.CAMERA_MARGIN;
    const prev = BeatEmUp.cameraX;
    let cam = prev;
    if (player.f.x < cam + margin) cam = player.f.x - margin;
    else if (player.f.x > cam + view - margin) cam = player.f.x - (view - margin);
    cam = Math.max(minCam, Math.min(maxCam, cam));
    BeatEmUp.cameraX = cam;
    const dx = cam - prev;
    if (!dx) return;
    BeatEmUp.skyOffset += dx * 0.5;
    // Tiled streets sample cameraX directly. The panorama's slower bgFollow would lurch against that 1:1 scroll.
    if (trackBackground && !BeatEmUp.tiledReady()) BeatEmUp.bgFollow(dx);
  }
  /** Wave travel: same smoothstep progress as the camera glide. */
  static bgGlide(eased) { BeatEmUp.bgX = BeatEmUp.bgTravelFrom + (BeatEmUp.bgTravelTo - BeatEmUp.bgTravelFrom) * eased; }
  /** Ease the view during a wave walk so the player finishes on the left of the new plate. */
  static easeTravelCamera(eased) {
    const cam = BeatEmUp.waveTravelStartCam + (BeatEmUp.waveTravelTargetCam - BeatEmUp.waveTravelStartCam) * eased;
    const dx = cam - BeatEmUp.cameraX;
    BeatEmUp.cameraX = cam;
    if (dx) BeatEmUp.skyOffset += dx * 0.5;
  }
  static loadImage(src) {
    if (!src) return null;
    let image = BeatEmUp.backgroundCache.get(src);
    if (!image) { image = new Image(); image.decoding = 'async'; image.src = src; BeatEmUp.backgroundCache.set(src, image); }
    return image;
  }
  /** Decoded image, or null while the request is still in flight (callers fall back). */
  static readyImage(src) {
    const image = BeatEmUp.loadImage(src);
    return image?.complete && image.naturalWidth ? image : null;
  }
  /** Load a stage background on first use (index is 0-based). */
  static background(index) {
    return BeatEmUp.loadImage(BeatEmUp.backgrounds[index]);
  }
  /** Current stage now, next stage in the background. Tiled stages also preload their street tile and boss plate. */
  static loadStageBackgrounds(stage) {
    BeatEmUp.background(stage - 1);
    BeatEmUp.background(stage);
    for (const n of [stage, stage + 1]) {
      const spec = BeatEmUp.tiled(n);
      if (!spec) continue;
      BeatEmUp.loadImage(spec.tile);
      BeatEmUp.loadImage(spec.boss);
    }
  }
  static resetBossFade() {
    BeatEmUp.bossAlpha = 0;
    BeatEmUp.bossFadeStart = 0;
  }
  static bossFadeCurve(u) {
    const t = Math.max(0, Math.min(1, u || 0));
    return t * t * (3 - 2 * t);
  }
  /** Latch the plate fade when the boss fight starts. The glide path has already run most of it. */
  static armBossFade(keepBackdrop) {
    if (!BeatEmUp.tiled()) return;
    if (keepBackdrop) {
      const elapsed = Math.max(0, BeatEmUp.waveTravelDuration - (BeatEmUp.waveTravelT || 0));
      BeatEmUp.bossAlpha = BeatEmUp.bossFadeCurve(elapsed / BeatEmUp.BOSS_FADE);
      BeatEmUp.bossFadeStart = BeatEmUp.bossAlpha >= 1 ? 0 : performance.now() - elapsed * 1000;
    } else {
      BeatEmUp.bossAlpha = 0;
      BeatEmUp.bossFadeStart = performance.now();
    }
  }
  /** 0 on the street, rising to 1 across the wave-3 → boss glide (or over BOSS_FADE if the glide was skipped). */
  static presentedBossAlpha() {
    if (!BeatEmUp.tiled()) return 0;
    if (Game.phase === 'waveTransition' && BeatEmUp.waveTravelNext === 4) {
      const elapsed = Math.max(0, BeatEmUp.waveTravelDuration - (BeatEmUp.waveTravelT || 0));
      BeatEmUp.bossAlpha = BeatEmUp.bossFadeCurve(elapsed / BeatEmUp.BOSS_FADE);
      return BeatEmUp.bossAlpha;
    }
    if (BeatEmUp.wave >= 4 && BeatEmUp.bossFadeStart) {
      const elapsed = (performance.now() - BeatEmUp.bossFadeStart) / 1000;
      BeatEmUp.bossAlpha = BeatEmUp.bossFadeCurve(elapsed / BeatEmUp.BOSS_FADE);
      if (BeatEmUp.bossAlpha >= 1) BeatEmUp.bossFadeStart = 0;
      return BeatEmUp.bossAlpha;
    }
    if (BeatEmUp.wave >= 4) return BeatEmUp.bossAlpha;
    return 0;
  }
  static wave = 0;
  static waveTotal = 3;
  static waveSpawnQueue = [];
  static waveSpawnTimer = 0;
  static get MAX_ATTACKERS() { return BeatEmUp.difficulty.attackers || 2; } // Easy 2, Normal 3, Hard 4 walk in. A ranged attacker takes one slot.
  /** Grappler is an active attacker: holding a victim, mid-grab, or telling its GRAB. */
  static grapplerActive(e) { return !!(e.f.enemyGrab && (e.f.grabVictim || e.f.atk?.grab || (e.ai?.tellT > 0 && e.ai.tellMove === 'punch'))); }
  /** Nearest-first melee attackers with at most one Grappler (Stage 2). An active Grappler (holding, mid-grab or telling)
      keeps its attacker slot; any other Grappler is skipped while one is picked, and its slot goes to the next enemy.
      With no active Grappler and at most one Grappler this is exactly sorted.slice(0, n). */
  static pickMelee(sorted, n) {
    const active = sorted.find(e => BeatEmUp.grapplerActive(e));
    const out = active && n > 0 ? [active] : [];
    for (const e of sorted) {
      if (out.length >= n) break;
      if (e === active || (e.f.enemyGrab && out.some(o => o.f.enemyGrab))) continue;
      out.push(e);
    }
    return out;
  }
  static BOSS_CUE = true; // boss silhouette cue (draw-only)
  static pacing = {
    spawnInterval: 0.35,
    attackTell: { regular: 0.42, heavy: 0.55 },
    attackRecovery: { regular: 0.82, agile: 0.62, heavy: 1.05 },
  };
  static locked = 1;
  static showGo = 0;
  static goArmed = 0;
  static boss = null;
  static bossMaxHp = 220;
  static stageOver = 0; // 0 playing, 1 win, -1 lose
  static stageTransitionT = 0;
  static stageTransitionDuration = STAGE_TRANSITION_DELAY;
  static stageTransitionLeft = 0; // fixed steps still to wait before the next stage
  static stageTransitionStage = 0;
  static stageTransitionSwitched = 0;
  static waveTravelT = 0;
  static waveTravelDuration = 1.05;
  static waveTravelStartX = 0;
  static waveTravelTargetX = 0;
  static waveTravelStartCam = 0;
  static waveTravelTargetCam = 0;
  static waveTravelEase = 0;
  static waveTravelNext = 0;
  /** Where the player stands on screen when a new wave opens, measured from the left. */
  static WAVE_ARRIVE = 0.30;
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
    return Game.H * Depth.lerp(depth, BeatEmUp.BAND_TOP, BeatEmUp.BAND_BOT - BeatEmUp.BAND_TOP);
  }
  static depthToScale(depth) {
    return Depth.lerp(Depth.clamp01(depth), 0.85, 0.15);
  }
  static floorDepthPx(depth) {
    return BeatEmUp.depthToY(depth);
  }
  /** Depth (lane) closeness on the floor. tolPx defaults to the 14px base window. */
  static depthClose(a, b, tolPx = BeatEmUp.DEPTH_HIT_PX) {
    return Math.abs(BeatEmUp.floorDepthPx(a) - BeatEmUp.floorDepthPx(b)) <= tolPx;
  }
  /** Lane window for attacker -> target. Players keep Depth.hitTolerance (22–36px).
   *  Beat 'em up enemies use ENEMY_DEPTH_HIT_PX. Practice keeps Depth.HIT_PX at 14. */
  static depthHitTolerance(attacker, target) {
    if (attacker?.role !== 'player') return BeatEmUp.ENEMY_DEPTH_HIT_PX;
    return Depth.hitTolerance(true, attacker?.scaleMul, target?.scaleMul);
  }
  static entryFor(fighter) {
    return BeatEmUp.cast.find(e => e.f === fighter) || null;
  }
  /** Beat ’em up fighters may pass beneath the overlaid touch controls. */
  /** Logical width actually on the canvas. Game.W can be wider than the picture. */
  static viewWidth() {
    const scale = Game.scale || 1;
    const dpr = Game.fitDpr || 1;
    const canvasW = Game.canvas?.width || 0;
    const visible = canvasW > 0 ? canvasW / (dpr * scale) : Game.W;
    return Math.max(1, Math.min(Game.W || visible, visible));
  }
  static horizontalScreenBounds() {
    const ox = Game.ox || 0, width = BeatEmUp.viewWidth() * (Game.scale || 1);
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
    entry.f.depth = entry.depth;
    Game.GROUND = entry.f.groundY();
    Fighter.S = BeatEmUp.baseS * scDepth;
    Fighter.ARM = savedArm * actorSize;
    Fighter.LEG = savedLeg * actorSize;
    Fighter.TORSO = savedTorso * actorSize;
    Fighter.NECK = savedNeck * actorSize;
    Game.hr = savedHr * scDepth * arcadeSize;
    Game.lw = Math.max(3.5, savedLw * scDepth * arcadeSize);
    if (entry.speedMul) Fighter.RUN_SPEED = 220 * entry.speedMul * (entry.role === 'player' ? BeatEmUp.PACE : 1);
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
    BeatEmUp.stageTransitionLeft = 0;
    BeatEmUp.stageTransitionStage = 0;
    BeatEmUp.stageTransitionSwitched = 0;
    BeatEmUp.waveTravelT = 0;
    BeatEmUp.waveTravelNext = 0;
    BeatEmUp.cameraX = 0;
    BeatEmUp.skyOffset = 0;
    BeatEmUp.bgX = BeatEmUp.bgTravelFrom = BeatEmUp.bgTravelTo = 0;
    BeatEmUp.resetBossFade();
    BeatEmUp.stage = 1;
    BeatEmUp.loadStageBackgrounds(1);
    BeatEmUp.wave = 0;
    BeatEmUp.waveSpawnQueue = [];
    BeatEmUp.waveSpawnTimer = 0;
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
    BladeSuper.clear();
    BeatEmUp.bossProjectiles = [];
    BossFields.clear();
    BeatEmUp.enemyProjectiles = [];
    ShockZones.clear();
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
    BeatEmUp.cast.push({ f: p, depth: 0.55, role: 'player', kind: 'player', scaleMul: 1, speedMul: p.classProfile?.speed || 1, ai: null });
    // Park the training dummy offscreen; the arcade cast is the opponent.
    fighters[1].reset(-9999, -1);
    fighters[1].hp = 0;
    BeatEmUp.startWave(1, false, true);
  }

  static startCampaignStage(stage, retry = false) {
    BeatEmUp.stageTransitionT = 0;
    BeatEmUp.stageTransitionLeft = 0;
    BeatEmUp.stageTransitionStage = 0;
    BeatEmUp.stageTransitionSwitched = 0;
    BeatEmUp.stage = Math.max(1, Math.min(BeatEmUp.stageTotal, stage));
    BeatEmUp.loadStageBackgrounds(BeatEmUp.stage);
    BeatEmUp.cameraX = 0; BeatEmUp.skyOffset = 0; BeatEmUp.bgSet(1);
    BeatEmUp.resetBossFade();
    BeatEmUp.lockL = 0; BeatEmUp.lockR = Game.W * .95;
    BeatEmUp.spawnX = Game.W * .7; BeatEmUp.worldMax = Game.W * 4.2;
    BeatEmUp.locked = 1; BeatEmUp.showGo = 0; BeatEmUp.goArmed = 0;
    BeatEmUp.waveSpawnQueue = [];
    BeatEmUp.waveSpawnTimer = 0;
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
      player.scaleMul = 1;
    }
    BeatEmUp.startWave(1, false, true);
    Game.syncControls();
  }

  static makeEnemy(kind, x, depth) {
    const f = new Fighter(x, CpuHotColors.enemy[kind] || CpuHotColors.enemy.regular, -1, '');
    const archetype = EnemyArchetypes[kind] || EnemyArchetypes.regular;
    let scaleMul = kind === 'boss' ? 1.25 : archetype.scale || 1;
    if (kind === 'boss') {
      const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1];
      const profile = chapter?.boss?.profile;
      if (profile) {
        f.bossProfile = profile;
        f.weaponType = profile.weapon;
        f.damageMultiplier = (BossWeapons[profile.weapon]?.damageMultiplier) || 1;
        f.attackSpeed = 1;
        scaleMul = profile.scale;
        BossPhases.apply(f, 1);
      } else {
        const armed = Math.random() < archetype.weaponChance;
        const weaponKey = armed ? (Math.random() < .5 ? 'stick' : 'knife') : 'freehand';
        const loadout = EnemyWeaponProfiles[weaponKey];
        f.weaponType = loadout.weapon;
        f.attackSpeed = loadout.attackSpeed;
        f.damageMultiplier = loadout.damage;
      }
    } else {
      // Fixed loadouts (Heavy's sledgehammer) skip the weapon roll entirely.
      const armed = !archetype.loadout && Math.random() < archetype.weaponChance;
      const weaponKey = archetype.loadout || (armed ? (Math.random() < .5 ? 'stick' : 'knife') : 'freehand');
      const loadout = EnemyWeaponProfiles[weaponKey];
      f.weaponType = loadout.weapon;
      f.attackSpeed = loadout.attackSpeed;
      f.damageMultiplier = loadout.damage;
    }
    f.specialDamageMultiplier = archetype.specialDamage;
    f.meterGainMultiplier = archetype.specialGain;
    f.tag = kind === 'regular' ? 'ROOKIE' : kind.toUpperCase();
    f.bodyProfile = ArchetypeSkeleton.profileFor(kind); // draw-only; null for archetypes without a profile
    f.enemyCombo = archetype.combo || null;
    f.enemyRush = archetype.rush || null;
    f.enemySlam = archetype.slam || null;
    f.enemyGuard = archetype.guard || null;
    f.enemyBash = archetype.bash || null;
    f.enemyGrab = archetype.grab || null;
    f.enemyDeploy = archetype.deploy || null;
    f.y = 0;
    f.hp = archetype.health * (kind === 'boss' ? BossHardness.health : 1); f.chip = f.hp;
    const stageHealth = (1 + (BeatEmUp.stage - 1) * .055) * BeatEmUp.difficulty.health;
    f.hp = Math.round(f.hp * stageHealth); f.chip = f.hp;
    f.meter = 0;
    const speedMul = archetype.speed ?? (kind === 'boss' ? (f.bossProfile?.speedMul ?? .92) : 1);
    return {
      f, depth, role: 'enemy', kind, scaleMul, speedMul,
      ai: { mode: 'circle', atkSlot: 0, cool: kind === 'boss' ? .65 : .3 + Math.random() * .4, orbit: Math.random() * Math.PI * 2, preferDepth: depth, tellT: 0, tellMove: '', tellKind: '', phase: 1, phaseCallout: 0 },
    };
  }

  // Built-in spawn layouts (used when stage-settings.js sets none): one for every Wave 2, one for all other waves.
  static SPAWN_LAYOUTS = {
    wave2: [
      { ox: .16, depth: .18 }, { ox: .60, depth: .72 }, { ox: .72, depth: .40 },
      { ox: .28, depth: .54 }, { ox: .82, depth: .84 },
    ],
    other: [
      { ox: .55, depth: .15 }, { ox: .62, depth: .55 }, { ox: .48, depth: .95 },
      { ox: .70, depth: .34 }, { ox: .40, depth: .76 },
    ],
  };
  /** Spawn {ox, depth} for enemy `index` of wave `n`. Per field, first finite value wins:
      wave.spawns[index] -> chapter.spawnLayouts[n][index] -> chapter.spawnLayouts.default[index] -> built-in layout.
      Settings values are clamped to 0..1. */
  static spawnFor(chapter, wave, n, index) {
    const builtIn = (n === 2 ? BeatEmUp.SPAWN_LAYOUTS.wave2 : BeatEmUp.SPAWN_LAYOUTS.other);
    const base = builtIn[index % builtIn.length];
    const sources = [wave?.spawns?.[index], chapter?.spawnLayouts?.[n]?.[index], chapter?.spawnLayouts?.default?.[index]];
    const pick = field => {
      for (const src of sources) { const v = src?.[field]; if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(1, v)); }
      return base[field];
    };
    return { ox: pick('ox'), depth: pick('depth') };
  }
  static waveDefs(n) {
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1];
    const wave = chapter?.waves?.[n - 1];
    if (!wave) return [];
    // Authored enemy compositions; spawn spots from stage settings, else the built-in staggered layouts.
    return wave.enemyFocus.map((kind, index) => ({ kind, ...BeatEmUp.spawnFor(chapter, wave, n, index) }));
  }

  static startWave(n, retry = false, chapterIntro = false, keepBackdrop = false) {
    BeatEmUp.wave = n;
    if (!keepBackdrop) BeatEmUp.bgSet(n);
    if (n < 4) BeatEmUp.resetBossFade();
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
    BeatEmUp.enemyProjectiles = [];
    ShockZones.clear();
    BeatEmUp.waveSpawnQueue = [];
    BeatEmUp.waveSpawnTimer = 0;
    const defs = BeatEmUp.waveDefs(n);
    const enemyDelta = BeatEmUp.difficulty.extraEnemies;
    if (enemyDelta < 0 && defs.length > 1) defs.pop();
    if (enemyDelta > 0 && defs.length) {
      const candidate = defs[(BeatEmUp.stage + n) % defs.length];
      const source = candidate.kind === 'ranged' ? defs.find(d => d.kind !== 'ranged') || candidate : candidate;
      defs.push({ kind: source.kind, ox: .84, depth: n === 2 ? .48 : .35 });
    }
    // Double each difficulty's final authored lineup while preserving its
    // enemy mix. Put the second group across the lane to reduce spawn overlap.
    const reinforcements = defs.filter(d => d.kind !== 'ranged').map((d, index) => ({
      kind: d.kind,
      ox: index % 2 ? .9 : .46,
      depth: Math.max(.12, Math.min(.9, 1 - d.depth)),
    }));
    defs.push(...reinforcements);
    BeatEmUp.waveSpawnQueue = defs;
    Game.phase = 'intro';
    Game.banner = retry ? 'LIFE LOST' : 'WAVE ' + n;
    Game.bannerT = BeatEmUp.stageIntroT || 1.1;
    Game.fighting = 0;
  }

  static updateWaveSpawns(dt) {
    if (BeatEmUp.stageTransitionLeft > 0) return;
    if (!BeatEmUp.waveSpawnQueue.length) {
      BeatEmUp.waveSpawnTimer = 0;
      return;
    }
    BeatEmUp.waveSpawnTimer -= dt;
    while (BeatEmUp.waveSpawnQueue.length && BeatEmUp.waveSpawnTimer <= 0) {
      const d = BeatEmUp.waveSpawnQueue.shift();
      // Keep reinforcements in the newly revealed area instead of popping in behind the player.
      const x = BeatEmUp.lockL + Game.W * Math.max(BeatEmUp.wave === 2 ? .12 : .42, d.ox);
      BeatEmUp.cast.push(BeatEmUp.makeEnemy(d.kind, x, d.depth));
      BeatEmUp.waveSpawnTimer += BeatEmUp.pacing.spawnInterval;
    }
    if (!BeatEmUp.waveSpawnQueue.length) BeatEmUp.waveSpawnTimer = 0;
  }

  static startBoss(retry = false, keepBackdrop = false) {
    BeatEmUp.stageIntroT = 0;
    BeatEmUp.wave = 4;
    if (!keepBackdrop) BeatEmUp.bgSet(4);
    BeatEmUp.armBossFade(keepBackdrop);
    BeatEmUp.locked = 1;
    BeatEmUp.showGo = 0;
    BeatEmUp.lockL = BeatEmUp.cameraX;
    BeatEmUp.lockR = BeatEmUp.cameraX + Game.W * 0.95;
    BeatEmUp.cast = BeatEmUp.cast.filter(e => e.role === 'player');
    BeatEmUp.enemyProjectiles = [];
    ShockZones.clear();
    BeatEmUp.waveSpawnQueue = [];
    BeatEmUp.waveSpawnTimer = 0;
    BeatEmUp.bossProjectiles = [];
    BossFields.clear();
    const boss = BeatEmUp.makeEnemy('boss', BeatEmUp.lockL + Game.W * 0.62, 0.55);
    BeatEmUp.bossMaxHp = boss.f.hp;
    const chapter = BeatEmUp.chapters[BeatEmUp.stage - 1];
    boss.f.tag = chapter.boss.name;
    boss.f.color = chapter.boss.profile?.color || CpuHotColors.bosses[BeatEmUp.stage - 1];
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
    const player = BeatEmUp.playerEntry();
    const startX = player ? player.f.x : BeatEmUp.cameraX + Game.W * 0.35;
    BeatEmUp.waveTravelT = BeatEmUp.waveTravelDuration;
    BeatEmUp.waveTravelStartX = startX;
    BeatEmUp.waveTravelTargetX = Math.min(BeatEmUp.worldMax - Game.W * 0.35, startX + Game.W * 0.62);
    BeatEmUp.waveTravelStartCam = BeatEmUp.cameraX;
    BeatEmUp.waveTravelTargetCam = Math.max(0, Math.min(
      Math.max(0, BeatEmUp.worldMax - Game.W),
      BeatEmUp.waveTravelTargetX - Game.W * BeatEmUp.WAVE_ARRIVE
    ));
    BeatEmUp.waveTravelEase = 0;
    BeatEmUp.waveTravelNext = nextWave;
    BeatEmUp.bgTravelFrom = BeatEmUp.bgX;
    BeatEmUp.bgTravelTo = Math.max(BeatEmUp.bgX, BeatEmUp.bgAnchor(nextWave));
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
    BeatEmUp.enemyProjectiles = [];
    ShockZones.clear();
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
    const layout = Game.resultsLayout();
    if (!layout) return true;
    const sc = Game.scale || 1;
    const x = (e.clientX - Game.ox) / sc;
    const y = (e.clientY - Game.oy) / sc;
    const hit = (b) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    if (hit(layout.home)) { Game.goTitle(); return true; }
    if (hit(layout.primary)) {
      if (BeatEmUp.stageOver < 0) BeatEmUp.startCampaignStage(BeatEmUp.stage, true);
      else if (BeatEmUp.stage < BeatEmUp.stageTotal) BeatEmUp.goNextStage();
      else BeatEmUp.begin();
    }
    return true;
  }
  /** Whole seconds still shown on the stage-clear countdown (at least 1 while the delay is running). */
  static clearCountdownSeconds() {
    const fps = Math.round(1 / Game.STEP);
    return Math.max(1, Math.ceil(BeatEmUp.stageTransitionLeft / fps));
  }
  /** Arm the post-clear wait. One shot: a second call while it is running does not restart or skip it. Final stage does not arm. */
  static beginStageClearDelay() {
    if (BeatEmUp.stageOver !== 1 || BeatEmUp.stage >= BeatEmUp.stageTotal) return;
    if (BeatEmUp.stageTransitionLeft > 0) return;
    const frames = Math.round(STAGE_TRANSITION_DELAY / Game.STEP);
    BeatEmUp.stageTransitionDuration = STAGE_TRANSITION_DELAY;
    BeatEmUp.stageTransitionLeft = frames;
    BeatEmUp.stageTransitionT = frames * Game.STEP;
    BeatEmUp.stageTransitionStage = BeatEmUp.stage + 1;
    BeatEmUp.stageTransitionSwitched = 0;
    Game.stop = 0;
  }
  /** One fixed step of the clear delay. The next stage starts on the step the wait hits zero. */
  static tickStageTransition() {
    if (!(BeatEmUp.stageTransitionLeft > 0)) return;
    BeatEmUp.stageTransitionLeft -= 1;
    if (BeatEmUp.stageTransitionLeft > 0) {
      BeatEmUp.stageTransitionT = BeatEmUp.stageTransitionLeft * Game.STEP;
      return;
    }
    BeatEmUp.stageTransitionT = 0;
    BeatEmUp.stageTransitionSwitched = 1;
    const next = BeatEmUp.stageTransitionStage;
    BeatEmUp.stageTransitionStage = 0;
    if (next) BeatEmUp.startCampaignStage(next);
  }
  static goNextStage() {
    BeatEmUp.beginStageClearDelay();
  }
  static retryOrTitle(fromKey) {
    if (BeatEmUp.stageOver === -1) BeatEmUp.startCampaignStage(BeatEmUp.stage, true);
    else if (BeatEmUp.stageOver === 1 && BeatEmUp.stage < BeatEmUp.stageTotal) BeatEmUp.goNextStage();
    else if (BeatEmUp.stageOver === 1) BeatEmUp.begin();
  }

  static loseStage() {
    if (BeatEmUp.stageOver) return;
    BeatEmUp.stageOver = -1;
    ShockZones.clear();
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
    ShockZones.clear();
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
    if (BeatEmUp.stageOver || BeatEmUp.stageTransitionLeft > 0) return;
    const player = BeatEmUp.playerEntry();
    if (!player) return;
    if (BeatEmUp.downPending) {
      BeatEmUp.withDepth(player, () => { player.f.updateRagdoll(dt); BeatEmUp.followPlayer(player); BeatEmUp.clampFighterBones(player); });
      BeatEmUp.downTimer -= dt;
      if (BeatEmUp.downTimer <= 0) { BeatEmUp.downPending = 0; BeatEmUp.respawnPlayer(); }
      return;
    }
    BeatEmUp.updateItems(dt, player);
    BeatEmUp.updateWaveSpawns(dt);
    BeatEmUp.comboT = Math.max(0, BeatEmUp.comboT - dt);
    if (BeatEmUp.comboT <= 0) BeatEmUp.combo = 0;
    BeatEmUp.eventT = Math.max(0, BeatEmUp.eventT - dt);
    BeatEmUp.visualCueT = Math.max(0, BeatEmUp.visualCueT - dt);

    // Depth movement for player
    let dy = 0;
    if (Input.depthHeld('up')) dy -= 1;
    if (Input.depthHeld('down')) dy += 1;
    if (dy && !player.f.heldBy) player.depth = Depth.step(player.depth, dy, dt * BeatEmUp.PACE);

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
      BeatEmUp.followPlayer(player);
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
          // Heavy's slam carries its own damage/stun; the old x1.25 / +2 stun trim only applies to its other moves (special).
          if (e.kind === 'heavy' && !e.f.atk.slam) { e.f.atk.dmg *= 1.25; e.f.atk.stun += 2; }
          // Old TOUGH x0.8 trim: kept for Guard's special only; the bash is exactly one ROOKIE punch.
          if (e.kind === 'guard' && !e.f.atk.bash) { e.f.atk.dmg *= .8; }
          e.f.atk.dmg *= BeatEmUp.difficulty.damage;
          if (e.kind === 'boss') {
            e.f.atk.dmg *= BossHardness.damage;
            if (e.f.atk.chip) e.f.atk.chip *= BossHardness.damage; // kept in step with dmg; supers are unblockable today, so takeHit never applies chip
          }
        }
        BeatEmUp.clampFighterBones(e);
      });
      Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
    }

    BeatEmUp.resolveHits();
    BladeSuper.update(dt);
    BossSignature.updateProjectiles(dt, player);
    BossFields.update(player);
    EnemyProjectile.update(dt, player);
    ShockZones.update(player);
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
    const ranged = sorted.find(e => e.kind === 'ranged');
    const attackers = boss ? new Set([boss]) : new Set([
      ...(ranged ? [ranged] : []),
      ...BeatEmUp.pickMelee(sorted.filter(e => e !== ranged), BeatEmUp.MAX_ATTACKERS - (ranged ? 1 : 0)),
    ]);
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
        // Boss B2: per-phase loadout (Syndicate Chief) swaps once the current attack ends.
        if (e.f.bossProfile?.phases && !e.f.atk && e.f.bossPhase !== ai.phase) BossPhases.apply(e.f, ai.phase);
      }
      const dist = Math.abs(e.f.x - player.f.x);
      Input.pad[1].left = 0; Input.pad[1].right = 0;
      Input.pad[1].punch = 0; Input.pad[1].kick = 0;
      Input.pad[1].block = 0; Input.pad[1].special = 0;

      if (e.kind === 'ranged') {
        BeatEmUp.updateThrowerAI(e, player, dt, attackers.has(e));
        BeatEmUp._driveEnemyPad(e, player, dt);
        continue;
      }

      if (ai.tellT > 0) {
        ai.tellT = Math.max(0, ai.tellT - dt);
        if (ai.tellT <= 0) {
          Input.pad[1][ai.tellMove] = 1;
          if (ai.counterQueued) { e.f.bossCounterQueued = true; ai.counterQueued = false; }
          ai.cool = e.kind === 'boss'
            ? Math.max(.42, .8 - ai.phase * .12) / BossHardness.rate
            : e.f.enemyBash && ai.tellMove === 'punch' ? .5 + EnemyBash.timeline(EnemyBashes[e.f.enemyBash]).total * Game.STEP
            : e.f.enemyGrab && ai.tellMove === 'punch' ? .5 + EnemyGrab.timeline(EnemyGrabs[e.f.enemyGrab]).total * Game.STEP
            : e.f.enemyDeploy && ai.tellMove === 'punch' ? .5 + EnemyDeploy.timeline(EnemyDeploys[e.f.enemyDeploy]).total * Game.STEP
            : e.f.enemySlam && ai.tellMove === 'punch' ? .4 + EnemySlam.timeline(EnemySlams[e.f.enemySlam]).total * Game.STEP
            : e.f.enemyRush && ai.tellMove === 'punch' ? BeatEmUp.pacing.attackRecovery.agile + EnemyRush.timeline(EnemyRushes[e.f.enemyRush]).total * Game.STEP
            : e.kind === 'rusher' || e.kind === 'guard' ? BeatEmUp.pacing.attackRecovery.agile
              : e.kind === 'heavy' ? BeatEmUp.pacing.attackRecovery.heavy
                : BeatEmUp.pacing.attackRecovery.regular;
          ai.tellMove = ''; ai.tellKind = '';
        }
        BeatEmUp._driveEnemyPad(e, player, dt);
        continue;
      }

      // Rusher spacing budget refills whenever it is out of the attack slot or already at rush range.
      if (e.f.enemyRush && (!attackers.has(e) || dist >= EnemyRushes[e.f.enemyRush].minRange)) ai.backoffT = 0;
      if (!attackers.has(e)) {
        // Hold outside special range. Only the attacker slots walk in, so a corner special cannot catch the wave.
        ai.mode = 'hold';
        const waiters = alive.filter(o => !attackers.has(o) && o.kind !== 'ranged');
        const slot = Math.max(0, waiters.indexOf(e));
        const hold = 280 + (slot % 3) * 74;
        const room = side => {
          const edge = side > 0 ? BeatEmUp.softMaxX(e) : BeatEmUp.softMinX(e);
          return (edge - player.f.x) * side;
        };
        let side = e.f.x >= player.f.x ? 1 : -1;
        if (room(side) < hold * 0.75 && room(-side) > room(side)) side = -side;
        const tx = player.f.x + side * hold;
        const td = slot % 2 ? 0.14 : 0.86;
        const crossed = (e.f.x - player.f.x) * side < 0;
        if (crossed && Math.abs(e.depth - player.depth) < 0.3) {
          if (e.depth < td) e.depth = Math.min(1, e.depth + 0.9 * dt);
          else e.depth = Math.max(0, e.depth - 0.9 * dt);
        } else {
          if (e.f.x < tx - 10) Input.pad[1].right = 1;
          else if (e.f.x > tx + 10) Input.pad[1].left = 1;
          if (e.depth < td - 0.04) e.depth = Math.min(1, e.depth + 0.55 * dt);
          else if (e.depth > td + 0.04) e.depth = Math.max(0, e.depth - 0.55 * dt);
        }
        BeatEmUp._driveEnemyPad(e, player, dt);
        continue;
      }

      ai.mode = 'attack';
      // Match depth then close in
      if (e.depth < player.depth - 0.05) e.depth = Math.min(1, e.depth + 0.85 * dt);
      else if (e.depth > player.depth + 0.05) e.depth = Math.max(0, e.depth - 0.85 * dt);
      const rush = !e.bossProfile && e.f.enemyRush ? EnemyRushes[e.f.enemyRush] : null;
      const slam = !e.bossProfile && e.f.enemySlam ? EnemySlams[e.f.enemySlam] : null;
      const bash = !e.bossProfile && e.f.enemyBash ? EnemyBashes[e.f.enemyBash] : null;
      const grab = !e.bossProfile && e.f.enemyGrab ? EnemyGrabs[e.f.enemyGrab] : null;
      // Grappler holds off (no tell) while its cooldown runs or the player is held / inside the no-regrab window.
      const grabBlocked = grab && (e.f.grabCoolT > 0 || player.f.heldBy || player.f.noRegrabT > 0 || (player.f.x - e.f.x) * e.f.face <= 0);
      const deploy = !e.bossProfile && e.f.enemyDeploy ? EnemyDeploys[e.f.enemyDeploy] : null;
      // Disruptor holds off (no tell) during its cooldown or while its zone is still out.
      const deployBlocked = deploy && (e.f.deployCoolT > 0 || !!ShockZones.activeFor(e.f));
      // The loadout lives on the fighter. Phase tables (Syndicate Chief) carry their own reach.
      const bossLoad = e.f.bossProfile ? (BossPhases.spec(e.f) || e.f.bossProfile) : null;
      const reach = bossLoad ? bossLoad.reach : rush ? rush.triggerRange : slam ? slam.triggerRange : bash ? bash.triggerRange : grab ? grab.triggerRange : deploy ? deploy.triggerRange : BeatEmUp.PUNCH_TRIGGER_PX;
      if (deploy && !e.f.atk && dist < deploy.minRange) {
        // Too close: keep gadget spacing (side with room), never walks into melee.
        let side = e.f.x >= player.f.x ? 1 : -1;
        const lo = BeatEmUp.softMinX(e) + 30, hi = BeatEmUp.softMaxX(e) - 30, sp = deploy.minRange * 1.3, out = x => x < lo || x > hi;
        if (out(player.f.x + side * sp) && !out(player.f.x - side * sp)) side = -side;
        const tx = player.f.x + side * sp;
        if (e.f.x < tx - 8) Input.pad[1].right = 1; else if (e.f.x > tx + 8) Input.pad[1].left = 1;
      } else if (rush && !e.f.atk && dist < rush.minRange && (ai.backoffT || 0) < rush.backoffMax) {
        // Too close for the rush: walk out to spacing on the side with room (through the player if
        // pinned at a bound); gives up after backoffMax and rushes anyway.
        ai.backoffT = (ai.backoffT || 0) + dt;
        let side = e.f.x >= player.f.x ? 1 : -1;
        const lo = BeatEmUp.softMinX(e) + 30, hi = BeatEmUp.softMaxX(e) - 30, out = x => x < lo || x > hi;
        if (out(player.f.x + side * rush.spacing) && !out(player.f.x - side * rush.spacing)) side = -side;
        const tx = player.f.x + side * rush.spacing;
        if (e.f.x < tx - 8) Input.pad[1].right = 1; else if (e.f.x > tx + 8) Input.pad[1].left = 1;
      } else if (dist > reach) {
        if (e.f.x < player.f.x) Input.pad[1].right = 1;
        else Input.pad[1].left = 1;
      } else if (ai.cool <= 0 && BeatEmUp.depthClose(e.depth, player.depth, BeatEmUp.depthHitTolerance(e, player) * 0.9) && !grabBlocked && !deployBlocked && !(bash && (player.f.x - e.f.x) * e.f.face <= 0)) { // Guard only bashes what its shield faces
        let move, label, tell;
        if (e.bossProfile) {
          const profile = e.bossProfile;
          const canSpecial = ai.phase >= 2 && e.f.meter >= 100;
          const specialChance = .24;
          if (canSpecial && Math.random() < specialChance) {
            move = 'special';
            label = profile.signature.label;
            tell = Math.max(profile.signature.tellMin, profile.signature.tellBase * (ai.phase === 3 ? profile.signature.phase3TellMul : 1) / BossHardness.rate);
            const sigMove = BossSignatures[profile.signature.key];
            const breaksGuard = sigMove && (sigMove.guardBreak === true || (Array.isArray(sigMove.guardBreak) && sigMove.guardBreak.some(Boolean)));
            if (breaksGuard) tell = Math.max(0.5, tell);
          } else {
            const useN1 = Math.random() < .55;
            move = useN1 ? profile.normal1.state : profile.normal2.state;
            label = useN1 ? profile.normal1.label : profile.normal2.label;
            tell = Math.max(BossHardness.tellMin, .72 / BossHardness.rate);
          }
        } else {
          const canSpecial = e.f.specialDamageMultiplier > 0 && e.f.meter >= 100
            && (e.kind !== 'boss' || ai.phase >= 2);
          const specialChance = e.kind === 'boss' ? .24 : .12;
          if (canSpecial && Math.random() < specialChance) move = 'special';
          else if (e.f.enemyCombo) move = 'punch'; // archetype string (Brawler jab-cross) rides the punch input
          else if (e.f.enemySlam) move = 'punch'; // Heavy overhead slam rides the punch input
          else if (e.f.enemyRush) move = 'punch'; // Rusher shoulder rush rides the punch input
          else if (e.f.enemyBash) move = 'punch'; // Guard shield bash rides the punch input
          else if (e.f.enemyGrab) move = 'punch'; // Grappler grab rides the punch input
          else if (e.f.enemyDeploy) move = 'punch'; // Disruptor deploy rides the punch input
          else move = Math.random() < .72 ? 'punch' : 'kick';
          label = move === 'special' ? 'CHARGE' : move === 'punch' && e.f.enemyCombo ? EnemyCombos[e.f.enemyCombo]?.label || 'PUNCH'
            : move === 'punch' && e.f.enemyRush ? EnemyRushes[e.f.enemyRush]?.label || 'PUNCH'
            : move === 'punch' && e.f.enemySlam ? EnemySlams[e.f.enemySlam]?.label || 'PUNCH'
            : move === 'punch' && e.f.enemyBash ? EnemyBashes[e.f.enemyBash]?.label || 'PUNCH'
            : move === 'punch' && e.f.enemyGrab ? EnemyGrabs[e.f.enemyGrab]?.label || 'PUNCH'
            : move === 'punch' && e.f.enemyDeploy ? EnemyDeploys[e.f.enemyDeploy]?.label || 'PUNCH' : move.toUpperCase();
          tell = e.kind === 'boss' ? Math.max(BossHardness.tellMin, .72 / BossHardness.rate)
            : e.kind === 'heavy' ? BeatEmUp.pacing.attackTell.heavy : BeatEmUp.pacing.attackTell.regular;
          // Boss B2: Kage sometimes takes his counter stance instead of a normal (only bosses with a counter roll for it).
          const counter = e.kind === 'boss' && move !== 'special' ? BossCounters[e.f.bossProfile?.counter] : null;
          ai.counterQueued = !!(counter && Math.random() < counter.chance);
          if (ai.counterQueued) { move = 'punch'; label = counter.label; }
        }
        ai.tellMove = move; ai.tellKind = label; ai.tellT = tell;
      }
      BeatEmUp._driveEnemyPad(e, player, dt);
    }
    // Clear bot pad
    Input.acts.forEach(a => { Input.pad[1][a] = 0; Input.was[1][a] = 0; });
  }

  static updateThrowerAI(e, player, dt, canAttack) {
    const ai = e.ai;
    if (ai.throwPhase === 'windup') {
      if (!Game.fighting || Game.phase !== 'fight') {
        ai.throwPhase = ''; ai.tellT = 0; ai.tellKind = ''; e.f.enemyThrowPose = null;
        return;
      }
      ai.tellT = Math.max(0, ai.tellT - dt);
      if (ai.tellT <= 0) {
        EnemyProjectile.launch(e, player);
        ai.throwPhase = 'release'; ai.throwReleaseT = .14;
        ai.recoveryT = EnemyProjectile.recovery;
        ai.cool = EnemyProjectile.cooldown;
        ai.tellKind = '';
      }
      e.f.enemyThrowPose = ai.throwPhase;
      return;
    }
    if (ai.throwPhase === 'release') {
      ai.throwReleaseT = Math.max(0, ai.throwReleaseT - dt);
      if (ai.throwReleaseT <= 0) ai.throwPhase = 'recovery';
      e.f.enemyThrowPose = ai.throwPhase;
      return;
    }
    if (ai.throwPhase === 'recovery') {
      ai.recoveryT = Math.max(0, ai.recoveryT - dt);
      if (ai.recoveryT <= 0) ai.throwPhase = '';
      e.f.enemyThrowPose = ai.throwPhase || null;
      if (ai.throwPhase) return;
    } else {
      e.f.enemyThrowPose = null;
    }

    const side = e.f.x >= player.f.x ? 1 : -1;
    const desiredX = Math.max(BeatEmUp.lockL + 90, Math.min(BeatEmUp.lockR - 70, player.f.x + side * 260));
    if (e.f.x < desiredX - 12) Input.pad[1].right = 1;
    else if (e.f.x > desiredX + 12) Input.pad[1].left = 1;
    if (e.depth < player.depth - .035) e.depth = Math.min(player.depth, e.depth + .72 * dt);
    else if (e.depth > player.depth + .035) e.depth = Math.max(player.depth, e.depth - .72 * dt);

    const dist = Math.abs(e.f.x - player.f.x);
    if (canAttack && Game.fighting && Game.phase === 'fight' && ai.cool <= 0
      && dist >= 175 && dist <= 420 && BeatEmUp.depthClose(e.depth, player.depth)) {
      ai.throwPhase = 'windup'; ai.tellT = EnemyProjectile.tell; ai.tellKind = 'THROW';
      e.f.enemyThrowPose = 'windup';
    }
  }

  static _driveEnemyPad(e, player, dt) {
    // Enemy updates happen in main loop; here we stash desired pad on entry
    e._pad = {
      left: Input.pad[1].left, right: Input.pad[1].right,
      punch: Input.pad[1].punch, kick: Input.pad[1].kick,
      block: Input.pad[1].block, special: Input.pad[1].special,
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
        const pulse = atk ? attacker.f.superPulse() : 0;
        if (attacker.f.state === 'special' && attacker.f.hitTargets.get(target) === pulse) continue;
        if (attacker.f.state === 'special' && attacker.f.bladeSuper?.hits.has(target)) continue; // Wave already hit it
        if (atk && attacker.f.state === 'special' && (!target.f.grounded || target.f.inDodgeIFrames())) continue;
        const staffRadialAttack = attacker.f.state === 'special' && attacker.f.classProfile?.weapon === 'staff';
        const specialLane = attacker.f.state === 'special' && attacker.role === 'player' ? Depth.specialLaneTolerance(attacker.f) : null;
        if (!staffRadialAttack && !BeatEmUp.depthClose(attacker.depth, target.depth, (specialLane ?? BeatEmUp.depthHitTolerance(attacker, target)) + 1e-9)) continue;
        let hit = null;
        BeatEmUp.withDepth(attacker, () => { hit = attacker.f.strike(); });
        if (!hit) continue;
        let th = null;
        BeatEmUp.withDepth(target, () => { th = { x: target.f.hitbox.x, y: target.f.hitbox.y, w: target.f.hitbox.w, h: target.f.hitbox.h }; });
        // Player Special lanes are checked above; compare the hurtbox in the attacker's lane so off-lane targets get the same reach.
        if (th && specialLane != null) th.y += BeatEmUp.floorDepthPx(attacker.depth) - BeatEmUp.floorDepthPx(target.depth);
        if (!th || (hit.radial
          ? !Fighter.staffRadialHits(hit, attacker.f, target)
          : !Game.hitTest(hit, th))) continue;
        if (target.f.inDodgeIFrames()) continue;
        if (target.f.playerControlled && target.f.invincibleT > 0) continue;
        attacker.f.hitDone = 1;
        if (hit.special) attacker.f.hitTargets.set(target, hit.pulse);
        const hpBefore = target.f.hp;
        let kind = 'hit';
        BeatEmUp.withDepth(target, () => { kind = target.f.takeHit(hit, attacker.f); });
        if (hit.special && attacker.f.bladeSuper) BladeSuper.landed(attacker.f.bladeSuper, target, kind);
        if (target.kind === 'ranged' && (kind === 'hit' || kind === 'armored')) {
          target.ai.throwPhase = ''; target.ai.tellT = 0; target.ai.tellKind = '';
          target.ai.cool = Math.max(target.ai.cool, .8); target.f.enemyThrowPose = null;
        }
        const damage = Math.round((hpBefore - target.f.hp) * 10) / 10;
        const confirmed = attacker.f.confirmHit(kind, damage);
        const specialFirst = hit.special && !attacker.f.specialEffectDone;
        attacker.f.gainMeter(hit.special ? 0 : hit.dmg * 2.5);
        if (!hit.special || !attacker.f.specialMeterTargets.has(target)) target.f.gainMeter(hit.special ? 12 : hit.dmg * 1.5);
        if (hit.special) attacker.f.specialMeterTargets.add(target);
        const cx = hit.radial ? th.x + th.w / 2 : hit.x + hit.w / 2;
        const cy = hit.radial ? th.y + th.h / 2 : hit.y + hit.h / 2;
        const criticalHit = !!hit.critical && kind !== 'block';
        const isKarateSuper = hit.special && attacker.f.classProfile?.style === 'ward';
        if (isKarateSuper) {
          const ba = BeatEmUp.withDepth(attacker, () => attacker.f.bones()), bt = BeatEmUp.withDepth(target, () => target.f.bones());
          const slot = Fx.karateSuperSlot(ba, bt);
          Fx.karateSuperText(attacker.f, attacker.f.atk, slot.x - BeatEmUp.cameraX, slot.y, damage, criticalHit, '', attacker.f.classProfile);
        } else {
          Fx.damage(cx - BeatEmUp.cameraX, cy - 12, damage, kind === 'block' || kind === 'parry', criticalHit);
        }
        if (criticalHit) { Fx.critical(cx - BeatEmUp.cameraX, cy, attacker.f.classProfile); Sfx.play('critical', attacker.f.classProfile); }
        if (hit.special && attacker.f.classProfile?.style === 'ward') {
          const camX = cx - BeatEmUp.cameraX, k = BeatEmUp.withDepth(attacker, () => attacker.f.drawS() / 1.2);
          const specialStop = specialHitStop(hit.pulse, attacker.f.atk.hitCount);
          if (hit.pulse <= 1) { Fx.karateSuperPunch(camX, cy, attacker.f.face, k); Game.stop = specialStop; Game.shake = 0; }
          else if (hit.pulse === 2) { Fx.karateSuperKickMid(camX, cy, attacker.f.face, k); Game.stop = specialStop; Game.shake = 0; }
          else { Fx.karateSuperKickHigh(camX, cy, attacker.f.face, k, BeatEmUp.withDepth(target, () => target.f.groundY())); Game.stop = specialStop; Game.shake = 8 / 60; Game.shMag = 4; }
          if (!attacker.f.specialEffectDone) { Sfx.play(attacker.role === 'player' ? 'player-special-hit' : 'super-hit', attacker.f.classProfile); attacker.f.specialEffectDone = 1; }
        } else if (hit.special && attacker.f.classProfile?.weapon === 'staff') {
          if (!attacker.f.specialEffectDone) { Sfx.play(attacker.role === 'player' ? 'player-special-hit' : 'super-hit', attacker.f.classProfile); attacker.f.specialEffectDone = 1; }
          Game.stop = specialHitStop(hit.pulse, attacker.f.atk.hitCount);
        } else if (hit.special && attacker.f.bladeSuper) {
          BladeSuper.contactFx(hit.pulse, cx - BeatEmUp.cameraX, cy, BeatEmUp.withDepth(attacker, () => attacker.f.drawS() / 1.2), kind);
          if (kind === 'block') Fx.blocked(cx - BeatEmUp.cameraX, cy);
          if (!attacker.f.specialEffectDone) { Sfx.play(attacker.role === 'player' ? 'player-special-hit' : 'super-hit', attacker.f.classProfile); attacker.f.specialEffectDone = 1; }
          Game.stop = specialHitStop(hit.pulse, attacker.f.atk.hitCount); Game.shake = .1; Game.shMag = 3;
        } else {
          if (hit.special && !attacker.f.specialEffectDone) {
            Fx.special(cx - BeatEmUp.cameraX, cy, attacker.f.classProfile);
            Sfx.play(attacker.role === 'player' ? 'player-special-hit' : 'super-hit', attacker.f.classProfile);
            attacker.f.specialEffectDone = 1;
          }
          else if (kind === 'block' || kind === 'parry') Fx.blocked(cx, cy);
          else if (!criticalHit) Fx.hit(cx, cy);
          Game.stop = .05; Game.shake = .1; Game.shMag = 3;
        }
        if (attacker.role === 'player' && !hit.special && kind === 'hit' && damage > 0) {
          const frames = hit.knockdown || attacker.f.state === 'kick' ? PACE.hitstop.finisher : PACE.hitstop.chain;
          Game.stop = frames / 60;
          Sfx.play(attacker.f.state === 'kick' ? 'player-heavy-hit' : 'player-normal-hit', attacker.f.classProfile);
        }
        if (kind === 'hit') target.f.vy = -100;
        if (attacker.role === 'player') {
          BeatEmUp.awardScore(damage * (kind === 'block' ? 35 : 100) + (specialFirst ? 300 : 0));
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
    if (BeatEmUp.waveSpawnQueue.length) return;
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
      BeatEmUp.beginStageClearDelay();
    }
  }

  /** Width of one street tile scaled to the full screen height, aspect kept. */
  static tileDrawW(spec, H = Game.H) {
    return spec.w * (H / spec.h);
  }
  /** Horizontally wrapped street, then the boss plate on top. False while the tile is still decoding. */
  static drawTiledBackdrop(ctx) {
    const spec = BeatEmUp.tiled();
    if (!spec) return false;
    const tile = BeatEmUp.readyImage(spec.tile);
    if (!tile) return false;
    const H = Game.H, W = Game.W;
    const drawW = BeatEmUp.tileDrawW(spec, H);
    if (!(drawW > 0) || !Number.isFinite(drawW)) return false;
    const offset = -(((BeatEmUp.cameraX % drawW) + drawW) % drawW);
    ctx.save();
    const iw = tile.naturalWidth, ih = tile.naturalHeight;
    // One extra pixel of width so neighbouring copies overlap instead of leaving a seam.
    for (let x = offset; x < W; x += drawW) ctx.drawImage(tile, 0, 0, iw, ih, x, 0, drawW + 1, H);
    const alpha = BeatEmUp.presentedBossAlpha();
    const boss = alpha > 0 ? BeatEmUp.readyImage(spec.boss) : null;
    if (boss) {
      const bw = boss.naturalWidth, bh = boss.naturalHeight;
      // Same height-fit as the street when the screen is 16:9 or narrower (destY = 0, curb stays put).
      // A wider screen covers by scaling up and shifting around the shared 56.7% curb so the join doesn't jump.
      const scale = Math.max(W / bw, H / bh);
      const destW = bw * scale, destH = bh * scale;
      const curb = 0.567;
      ctx.globalAlpha = alpha;
      ctx.drawImage(boss, 0, 0, bw, bh, (W - destW) / 2, curb * (H - destH), destW, destH);
    }
    ctx.restore();
    return true;
  }
  static drawStageBackdrop(ctx) {
    if (BeatEmUp.drawTiledBackdrop(ctx)) return;
    const image = BeatEmUp.background(BeatEmUp.stage - 1);
    if (!image?.complete || !image.naturalWidth) return;
    ctx.save();
    if (BeatEmUp.pano()) {
      // Panorama keeps its real aspect. The walk into the boss fades from the last street
      // frame into the boss plate. A wide boss plate is cropped evenly instead of stretched.
      const P = BeatEmUp.pano();
      const iw = image.naturalWidth, ih = image.naturalHeight;
      const viewW = Math.min(iw, Game.W * ih / Game.H);
      const seam = P.seam || 0;
      const travelToBoss = Game.phase === 'waveTransition' && BeatEmUp.waveTravelNext === 4;
      if (travelToBoss && seam) {
        const fade = Math.max(0, Math.min(1, BeatEmUp.waveTravelEase || 0));
        const streetW = Math.min(viewW, seam);
        const street = { sx: Math.max(0, seam - streetW), sy: 0, srcW: streetW, sh: ih, destX: 0, destW: Game.W };
        if (street.srcW + 0.5 < viewW) {
          street.destW = street.srcW * Game.H / ih;
          street.destX = (Game.W - street.destW) / 2;
        }
        const segW = Math.max(1, iw - seam);
        let boss;
        if (viewW <= segW) {
          const srcW = Math.min(viewW, segW);
          boss = { sx: Math.max(seam, Math.min(iw - srcW, BeatEmUp.bgAnchor(4))), sy: 0, srcW, sh: ih, destX: 0, destW: Game.W };
        } else {
          const sh = segW * Game.H / Game.W;
          boss = { sx: seam, sy: (ih - sh) / 2, srcW: segW, sh, destX: 0, destW: Game.W };
        }
        const blit = (rect, alpha) => {
          if (alpha <= 0) return;
          ctx.globalAlpha = alpha;
          ctx.drawImage(image, rect.sx, rect.sy, rect.srcW, rect.sh, rect.destX, 0, rect.destW, Game.H);
        };
        blit(street, 1 - fade);
        blit(boss, fade);
        ctx.restore();
        return;
      }
      let sx = Math.max(0, BeatEmUp.bgX);
      let sy = 0, srcW = viewW, sh = ih;
      let destX = 0, destW = Game.W;
      if (BeatEmUp.wave >= 4 && seam) {
        const segW = Math.max(1, iw - seam);
        if (viewW <= segW) {
          srcW = Math.min(viewW, segW);
          sx = Math.max(seam, Math.min(sx, iw - srcW));
        } else {
          srcW = segW;
          sh = segW * Game.H / Game.W;
          sy = (ih - sh) / 2;
          sx = seam;
        }
      } else if (seam) {
        sx = Math.max(0, Math.min(Math.max(0, seam - srcW), sx));
      } else {
        sx = Math.max(0, Math.min(Math.max(0, iw - srcW), sx));
      }
      srcW = Math.max(1, Math.min(srcW, iw - sx));
      sh = Math.max(1, Math.min(sh, ih - sy));
      if (seam && BeatEmUp.wave < 4 && sx + srcW > seam + 0.5) {
        srcW = Math.max(1, seam - sx);
        destW = srcW * Game.H / ih;
        destX = (Game.W - destW) / 2;
      }
      ctx.drawImage(image, sx, sy, srcW, sh, destX, 0, destW, Game.H);
    } else ctx.drawImage(image, 0, 0, Game.W, Game.H);
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


  /** Boss-only silhouette cue (draw-only): a pulsing two-tone floor ring + glow under the boss, so it never reads as a
      regular enemy at 667x375. Reads nothing that gameplay writes back; hurtboxes/hitboxes never see it. */
  static drawBossCue(ctx, entry, rw, rh) {
    const f = entry.f, x = f.x, y = Game.GROUND + 1, pulse = .75 + .25 * Math.sin((f.animT || 0) * 5);
    ctx.save();
    ctx.globalAlpha = .22 * pulse; ctx.fillStyle = f.color || '#F04458';
    ctx.beginPath(); ctx.ellipse(x, y, rw * 1.7, rh * 1.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .9; ctx.strokeStyle = '#0B0B0F'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(x, y, rw * 1.55, rh * 1.55, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = pulse; ctx.strokeStyle = f.color || '#F04458'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y, rw * 1.55, rh * 1.55, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  /** Keyboard and gamepad: a small clockwise arc under the shadow while Dodge recharges. Phones use the button. */
  static drawDodgeArc(ctx, fighter, x, y, rw) {
    if (!fighter?.playerControlled || !(fighter.dodgeCooldown > 0)) return;
    if (typeof matchMedia === 'function' && matchMedia('(max-height: 420px)').matches) return;
    const p = 1 - fighter.dodgeCooldown / PACE.dodgeCooldown;
    ctx.save();
    ctx.strokeStyle = '#45dceb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 6, Math.max(8, rw * 0.9), -Math.PI / 2, -Math.PI / 2 + Math.max(0.08, p) * Math.PI * 2);
    ctx.stroke();
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
      BeatEmUp.drawDodgeArc(ctx, entry.f, entry.f.x, Game.GROUND + 1, rw);
      if (entry.kind === 'boss' && entry.f.bossProfile && BeatEmUp.BOSS_CUE) BeatEmUp.drawBossCue(ctx, entry, rw, rh);
      const drawTag = entry.f.tag;
      const showAlert = entry.ai && (entry.ai.tellT > 0 || entry.ai.phaseCallout > 0);
      // Repeated rookie/regular labels stack into noise when a wave crowds
      // around the player. Keep identity labels for the player and boss only (Ranged: no head label).
      if (showAlert || (entry.kind !== 'boss' && entry.role !== 'player')) entry.f.tag = '';
      if (entry.bossProfile && entry.ai && entry.ai.tellMove === 'special' && entry.ai.tellT > 0) {
        entry.f.weaponFlashT = entry.ai.tellT;
        entry.f.weaponFlashColor = BossSignatures[entry.bossProfile.signature.key]?.color || '#FBBF24';
      } else {
        entry.f.weaponFlashT = 0;
      }
      if (!Game.spriteBodies) entry.f.draw(ctx);
      entry.f.tag = drawTag;
      if (entry.ai && entry.ai.tellT > 0) {
        const head = entry.f.bones().head;
        const label = entry.ai.tellKind || 'ATTACK';
        const pulse = .78 + .22 * Math.sin(performance.now() * .018);
        const labelY = head.y - 24 / Game.scale;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = entry.kind === 'boss' ? '#FBBF24' : entry.kind === 'ranged' ? '#C4B5FD' : '#FF665F';
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
      Fx.draw(ctx, 'back');
      return;
    }
    BeatEmUp.drawItems(ctx);
    ShockZones.draw(ctx); // floor markers under every fighter
    const ordered = BeatEmUp.cast.filter(e => e.f.hp > 0 || e.role === 'player' || (e.f.ragdollKO && e.f.ragdollElapsed < 2)).slice()
      .sort((a, b) => a.depth - b.depth);
    for (const e of ordered) BeatEmUp.drawFighter(ctx, e);
    BossSignature.drawProjectiles(ctx);
    BossFields.draw(ctx);
    EnemyProjectile.draw(ctx);
    BladeSuper.draw(ctx, BeatEmUp.cameraX);
    Fx.draw(ctx, 'back');
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
    Game.drawResultsSheet(ctx);
  }
}

