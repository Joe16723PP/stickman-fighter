# Karate class: implementation plan (approved by Jirot, 2026-11-10)

Role: close-range rusher. Karate wins up close and keeps pressure on with fast links and roll-cancels.
Sheets: `karate-moveset.png` (moves and frame data), `karate-super-fx.png` (super effects).
Baseline: main 8cb8f2a, with jump removal landing first. All frames are at 60fps, after Karate's attackSpeed (1.28).

## 1. Normal chain (punch button)
| Hit | Move | su/ac/re | Dmg | Notes |
|---|---|---|---|---|
| 1 | Jab | 3/2/7 | 5 | as today |
| 2 | Cross | 2/2/6 | 7 | link |
| 3 | Hook | 2/2/6 | 9 | link |
| 4 | Rising Palm (NEW) | 4/3/12 | 11 | link; knockdown; extends Karate's chain from 3 to 4 |
Only Karate gets the 4th hit. Staff and Blade keep their current chain length until their own passes.

## 2. Roll-cancel
On hit only, Jab, Cross, Hook and Roundhouse can cancel into roll during the first 6 frames of recovery. There is no cancel on whiff, and none on Rising Palm.

## 3. Roundhouse (kick button)
7/3/12 for 14.3 damage, unchanged, plus a 40px forward step during windup. The step is clamped to the 15–85% arena bounds and must never cross the opponent.

## 4. Super: Punch > Quick Kick > Heavy Kick (replaces Iron Fist Flurry's 5 hits)
- Timeline: windup 10, then P hit 3, gap 2, QK hit 3, gap 3, HK hit 4, then recovery 18. That's 43f in total (was 58f).
- Damage: 18 + 18 + 30 = 66, the same total as today. The HK hit knocks down. Set superHits to 3, and the super name becomes "IRON FIST STRING".
- Each hit uses its own hit box drawn from the limb that strikes: the fist for P, a mid-height foot for QK, and a high foot for HK.
- The +25% link bonus after 2+ hits still applies, exactly as today.

## 5. Super effects (draw-only, never touch hit boxes)
- P: 4–5 wind streaks behind the arm and two air-burst rings at the fist, with 1f hit-stop.
- QK: a crescent wind arc following the foot and 3 gust lines past the target.
- HK: a spin wind ring, a star crack at impact, a ground crack under the fighters, dust puffs, 2f hit-stop and a 4px screen shake lasting 8f.
- Colours: wind #BFE9FF at 40–70% alpha, cracks #FFF3C4, and the hit star in the Karate accent #FBBF24. Effects last 8–12 frames, mirror correctly when facing left, and scale with the fighter.

## 6. Out of scope
- No changes to speed, meter (1.75), dash, crit or difficulty. Rerun win rates and report them, with no retune unless Jirot OKs it.
- No changes to Staff or Blade.

## Acceptance (Lemar's review)
1. Frame-stepped proof shots on both facing sides for every move above, from a frozen game state, with frame counts logged against the table.
2. Every hit box matches the drawn limb on every super hit. Overlay shots are required.
3. The 4-hit chain and the roll-cancel work at both edges of the arena and at both beat 'em up depths.
4. Effects mirror and don't clip the HUD at 667×375 and 844×390, at DPR 2 and 3.
5. The Training panel shows the Karate combo line: Jab > Cross > Hook > Rising Palm, then roll-cancel.
6. The 1v1 win-rate table is reported against the post-jump-removal baseline.
