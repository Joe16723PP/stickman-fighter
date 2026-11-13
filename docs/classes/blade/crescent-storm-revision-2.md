# Crescent Storm Revision 2

This note records the two-stage Iaido implementation. The original Blade class revision, Parry, and Counter Draw remain unchanged.

## Sequence and frame allocation

At 60 fps, the Super now uses this sequence:

| Frames | Phase | Active behavior |
|---:|---|---|
| 1–24 | Charge | Existing charge and stationary hold |
| 25–27 | Quick Draw | Horizontal sword-aligned melee, 20 damage |
| 28–30 | Pause | Three readable frames with no active hitbox |
| 31–33 | Vertical Crescent Slash | Top-to-bottom melee, 24 damage; launches the Wave on frame 31 |
| 34–57 | Noto recovery | Existing 24-frame recovery interval; Noto finishes on frame 57 |

The previous sequence was 24 charge + 2 active frames + 24 recovery = 50 frames. Three active frames for each distinct strike and a three-frame pause require a 7-frame extension. Noto therefore shifts from frame 50 to frame 57 (about 117 ms); the charge and recovery lengths are unchanged. The Beat 'em up visual hold remains 3 seconds.

The Wave is launched from the vertical strike's beat in the locked facing direction and lane. It travels at 900 px/s for up to 420 px or the stage edge, pierces multiple valid targets, and deals 30 damage once per target. Quick Draw, Vertical Slash, and Wave each have separate hit registration, allowing up to 74 damage to one enemy. A Wave may still hit if either melee strike misses.

## Knockdown and compatibility

All three components defer burst knockdown. Noto triggers the finisher at frame 57 for targets hit by a melee component; a Wave that connects after Noto finishes its target on impact. Parry and Counter Draw remain independent, and meter cost/gain is unchanged.

## Implementation boundaries

- `Fighter` owns the charge, stationary pose sequence, pulse-specific melee hitboxes, and facing/depth lock.
- `BladeSuper` owns Wave travel, lane checks, independent per-target Wave registration, and Noto finish timing.
- The existing 420px travel bound and 900px/s speed are retained.
- The CI harness checks frame boundaries, hitbox damage, deduplication, 74 combined damage, Wave piercing and lane lock, late Wave hits, and Noto timing.
- No manual viewport/device gameplay test was performed; Jirot will review the move on device before merge.
