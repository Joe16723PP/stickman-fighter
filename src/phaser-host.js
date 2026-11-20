import { Game } from './game.js';
import { loadKarate, prepareKarate } from './phaser-actors.js';

/** Phaser owns the canvas, the loop, and the pictures. */
export function startPhaser(canvas) {
  if (typeof Phaser === 'undefined') return false;
  Game.usingPhaser = true;
  Game.ctx = canvas.getContext('2d');
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    canvas,
    width: canvas.width || 960,
    height: canvas.height || 540,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.NONE },
    scene: {
      key: 'fight',
      preload() { loadKarate(this); },
      create() {
        Game.phaserScene = this;
        prepareKarate(this);
      },
      update(time) { if (Game.ready) Game.frame(time); },
    },
  });
  Game.phaser = game;
  return true;
}
