# Staff class: implementation plan (approved by Jirot, 2026-11-10)

Role: long-range zoner. Staff wins at mid-to-long range and loses up close.
Sheets: `staff-moveset.png` (moves, reach, frame data) and `staff-super-fx.png` (super effects).
Build order: after Karate. Frames are at 60fps, after Staff's attackSpeed (.78).

## 1. Reach (the key change)
Staff gets its own reach of 130px on punch and 210px on kick (shared reach today is 95/175).
The hit box must run to the drawn staff tip on every Staff move. That isn't verified today, so measure it first.

## 2. Normal chain (punch button), 2 hits max
| Hit | Move | su/ac/re | Dmg | Reach |
|---|---|---|---|---|
| 1 | Thrust | 13/4/22 | 6 | 130 |
| 2 | Overhead (NEW, link) | 11/4/20 | 8 | 120 |
There's no roll-cancel on any Staff move.

## 3. Low Sweep (kick button)
18/6/28 for 23 damage, with a reach of 210. It now knocks down. On a whiff, the full 28f recovery stays punishable.

## 4. Super: Dragon Staff Spin, 3 frames (Spin > Spin > Dragon Slam)
- Timeline: windup 16, then S1 hit 4, gap 3, S2 hit 4, gap 3, Slam hit 5, then recovery 22. That's 57f in total.
- Damage: 24 + 24 + 38 = 86, the same total as today. The Slam knocks down. superHits stays at 3.
- The spin hit boxes follow the staff sweep around the body. The Slam hits at the staff tip on the ground.
- The +25% link bonus still applies, exactly as today.

## 5. Super effects (draw-only)
- Spins: a wind ring (#BFE9FF at 40–70% alpha) with a teal inner trail. Lightning crackles along the staff and jumps around the ring.
- Slam: a sky bolt lands on the impact point and branches along the ground. There's an earth crack (#FFF3C4), dust puffs, 2f hit-stop, and a 4px shake for 8f.
- Lightning has a #E0F7FF core and a #7DD3FC glow, and the bolt shapes are re-randomised each time.
- Effects last 8–12f, mirror when facing left, scale with the fighter, and never touch hit boxes.

## 6. Out of scope
- No changes to speed, meter, crit, dash or difficulty, and nothing in Karate or Blade changes.
- Rerun win rates against the baseline from just before this PR. No retuning without Jirot's OK.

## Acceptance (Lemar's review)
1. Hit-box overlay shots show every Staff hit box ending at the drawn tip (130 and 210), on both facing sides.
2. Frame-stepped proof from a frozen state, with frame counts logged against the table.
3. A range test: at 100–210px Staff outranges Karate, and at under 90px Karate's Jab beats Thrust's startup.
4. Effects mirror and don't clip the HUD at 667×375 and 844×390, at DPR 2 and 3.
5. Training shows the Staff combo line: Thrust > Overhead, plus Low Sweep at range.
6. Win rates reported, with no retune.
