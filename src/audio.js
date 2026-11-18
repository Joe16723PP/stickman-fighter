export class Sfx {
  static ctx = null;
  static unlock() {
    const AudioContextType = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextType) return;
    try {
      if (!Sfx.ctx) Sfx.ctx = new AudioContextType();
      if (Sfx.ctx.state === 'suspended') Sfx.ctx.resume();
    } catch (e) { Sfx.ctx = null; }
  }
  static tone(startHz, endHz, duration, shape = 'triangle', volume = .08) {
    const ctx = Sfx.ctx;
    if (!ctx || ctx.state !== 'running') return;
    try {
      const osc = ctx.createOscillator(), env = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = shape;
      osc.frequency.setValueAtTime(startHz, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, endHz), now + duration);
      env.gain.setValueAtTime(.001, now);
      env.gain.exponentialRampToValueAtTime(volume, now + .008);
      env.gain.exponentialRampToValueAtTime(.001, now + duration);
      osc.connect(env); env.connect(ctx.destination);
      osc.start(now); osc.stop(now + duration + .015);
    } catch (e) {}
  }
  static play(name, profile = null) {
    const pitch = profile?.pitch || 1;
    if (name === 'punch') Sfx.tone(210 * pitch, 92 * pitch, .085, 'triangle', .055);
    else if (name === 'kick') Sfx.tone(145 * pitch, 52 * pitch, .13, 'sawtooth', .06);
    else if (name === 'hit') Sfx.tone(125 * pitch, 48 * pitch, .11, 'square', .05);
    else if (name === 'block') Sfx.tone(480 * pitch, 180 * pitch, .1, 'triangle', .045);
    else if (name === 'dodge') Sfx.tone(360 * pitch, 110 * pitch, .16, 'sine', .055);
    else if (name === 'super-charge') { Sfx.tone(95 * pitch, 260 * pitch, .2, 'sawtooth', .055); setTimeout(() => Sfx.tone(240 * pitch, 520 * pitch, .13, 'triangle', .045), 95); }
    else if (name === 'super-dash') Sfx.tone(620 * pitch, 130 * pitch, .16, 'sawtooth', .075);
    else if (name === 'super-hit') { Sfx.tone(105 * pitch, 32 * pitch, .26, 'sawtooth', .1); setTimeout(() => Sfx.tone(390 * pitch, 80 * pitch, .18, 'triangle', .06), 55); }
    else if (name === 'player-normal-hit') { Sfx.tone(185 * pitch, 72 * pitch, .095, 'triangle', .075); Sfx.tone(680 * pitch, 240 * pitch, .045, 'square', .025); }
    else if (name === 'player-heavy-hit') { Sfx.tone(105 * pitch, 38 * pitch, .19, 'sawtooth', .11); setTimeout(() => Sfx.tone(75 * pitch, 32 * pitch, .12, 'triangle', .065), 35); }
    else if (name === 'player-special-hit') { Sfx.tone(82 * pitch, 28 * pitch, .31, 'sawtooth', .13); setTimeout(() => Sfx.tone(520 * pitch, 150 * pitch, .2, 'square', .075), 45); setTimeout(() => Sfx.tone(260 * pitch, 90 * pitch, .18, 'triangle', .06), 115); }
    else if (name === 'player-die') { Sfx.tone(190 * pitch, 42 * pitch, .42, 'sawtooth', .12); setTimeout(() => Sfx.tone(92 * pitch, 30 * pitch, .34, 'triangle', .085), 115); }
    else if (name === 'critical') { Sfx.tone(520 * pitch, 170 * pitch, .15, 'square', .07); setTimeout(() => Sfx.tone(760 * pitch, 320 * pitch, .12, 'triangle', .055), 45); }
    else if (name === 'heal') { Sfx.tone(540 * pitch, 780 * pitch, .12, 'sine', .055); setTimeout(() => Sfx.tone(760 * pitch, 1040 * pitch, .14, 'sine', .045), 75); }
    else if (name === 'powerup') { Sfx.tone(300 * pitch, 680 * pitch, .16, 'square', .06); setTimeout(() => Sfx.tone(620 * pitch, 980 * pitch, .18, 'triangle', .05), 80); }
  }
}

