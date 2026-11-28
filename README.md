# Stickman Fighter

A stick-figure beat 'em up built with vanilla JavaScript (no build step). Play at https://joe16723pp.github.io/stickman-fighter/

The title menu uses a dedicated retro city backdrop, and the 10-stage arcade campaign uses stage-specific background artwork in `assets/backgrounds/`.
Campaign story beats, wave enemy rosters, and visual cues are authored in `stage-settings.js`.

## Controls

Movement is left, right, and lane up/down. There is no jump.

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | A/D or Left/Right | Left stick or d-pad left/right | Move stick |
| Lane | W/S or Up/Down | Left stick or d-pad up/down | Move stick |
| Attack | J | Face button South (A / Cross) | Attack |
| Dodge | Shift | Face button East (B / Circle) | Dodge |
| Special | I | Face button West (X / Square) | Special |

Attack chains three hits (5/7/9 before the class multiplier). The third hit is the finisher and knocks down. Dodge is a roll: 0.60s long, invulnerable for the first 0.36s, then on a 1.6s cooldown measured from the start of the roll. There is no Kick button and no Block button. Enemy and boss AI still use their own strikes, including blocks.

Practice uses the same three actions. Pacing numbers live in the `PACE` block in `src/config.js`.
