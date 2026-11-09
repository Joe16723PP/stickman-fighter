# Blade class: implementation plan (approved by Jirot, 2026-11-10)

Role: parry-counter. Blade is balanced and fast, and it wins by reading and punishing.
Sheets: `blade-moveset.png` (moves, reach, frame data) and `blade-super-fx.png` (super effects).
Build order: after Staff. Frames are at 60fps, with attackSpeed 1.0.

## 1. Normal chain (punch button), 3 hits max
| Hit | Move | su/ac/re | Dmg | Reach |
|---|---|---|---|---|
| 1 | Quick Draw | 5/3/9 | 5.4 | 110 |
| 2 | Rising Cut (NEW, link) | 6/3/10 | 7 | 110 |
| 3 | Crescent Cleave (NEW, ender) | 8/4/14 | 10 | 120 |
- Crescent Cleave has KB 380 and does NOT knock down.
- Scabbard Kick (the kick button) is unchanged: 8/4/12, 16.2 damage, reach 160.
- The hit boxes must end at the drawn blade tip. Measure this first.

## 2. Parry (NEW)
- Press Block no more than 6f before an opposing hit lands to parry it.
- A parry does 0 damage, freezes the attacker for 14f and gives Blade +10% meter.
- There's a 20f lockout after any Block press, so the parry can't be mashed. Holding Block still blocks normally.
- The parry works against all normal attacks and super hits, including the Iai blade wave.
- Effects: a steel flash at the blade and a short white spark.

## 3. Counter Draw (NEW, automatic after a parry)
4/3/12 for 5.4 damage. It always crits (x1.6), so it does 8.6. It shows a "COUNTER!" label.

## 4. Super: IAI · CRESCENT STORM (iaijutsu), 2 hits, superHits stays 2
| Phase | Frames | Effect |
|---|---|---|
| Charge (tame) | 24f windup | Crouched and sheathed, right hand on the hilt |
| Nukitsuke draw slash | active 2f | 28 damage, reach 110 |
| Blade wave | launches at f26 | 46 damage plus knockdown. Travels 420px at 900px/s (about 28f), is about 90px tall, hits once at most, and still hits if the draw slash whiffs |
| Chiburi + noto | 24f recovery (10f flick + 14f sheathe) | The opponent stays frozen in hitstun after the wave hit. The knockdown triggers on the noto click at f50 |
- Total damage is 28 + 46 = 74, the same as today. Total length is 24 + 2 + 24 = 50f.
- The wave is a real projectile: it's stopped at the stage edge and mirrors with facing. With lanes in every mode, it travels on the lane Blade was in when it launched and hits only if depthClose (14px floor gap) holds at contact.

## 5. Super effects (draw-only)
- Charge: an aura pulses at the sheath (#38BDF8), with speed lines converging inward and a shrinking ground ring. An eye glint (#FFFFFF) shows in the last 4f, and the background dims to 60% for 1f before the draw.
- Draw slash: a razor-thin horizontal flash line (core #F0F9FF, glow #38BDF8) with a white edge flash and a 3f hit-stop.
- Blade wave: a crescent (core #F0F9FF, 4px glow #38BDF8) with 4 trail copies at alpha .4/.25/.15/.08 and a faint ground scar. On hit there's an X burst, a 2f hit-stop and a 4px shake.
- Noto: a spark and ring at the saya mouth (#FFFFFF), then a delayed slash burst on the frozen opponent, who then falls.
- Effects mirror when facing left, scale with the fighter and never touch hit boxes. Colours: body #B8D7FF, accent #38BDF8.

## 6. Out of scope
- No changes to speed (1.13), meter (1.35), dash (.18), crit (.16, x1.6) or difficulty, and nothing in Karate or Staff changes.
- No CPU parry behaviour in this PR. That's Jirot's call later. Rerun win rates against the baseline from just before this PR, with no retune.

## Acceptance (Lemar's review)
1. Hit-box overlay shots show every Blade hit box ending at the drawn tip (110/120/160), on both facing sides.
2. Frame-stepped proof from a frozen state, with frame counts logged against the tables.
3. Parry test with a logged input-to-hit gap: 6f parries and 7f blocks normally. The 20f lockout holds, and the counter crit lands every time. Test both sides and both edges.
4. Super: the wave travels 420px and stops at the stage edge, it hits after a whiffed draw slash, and the knockdown fires exactly at the noto frame (f50). The super can be parried.
5. Effects mirror and don't clip the HUD at 667×375 and 844×390, at DPR 2 and 3. The wave is 90px tall at fighter scale 1.
6. Training shows the Blade combo line (Quick Draw > Rising Cut > Crescent Cleave) and a parry prompt.
7. Win rates reported, with no retune.
