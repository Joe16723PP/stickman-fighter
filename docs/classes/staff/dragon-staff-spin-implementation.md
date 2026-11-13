# Dragon Staff Spin implementation notes

## Preserved sequence

Dragon Staff Spin keeps its existing 57-frame combat timeline at 60 fps:

| Phase | Frames | Hit | Damage |
|---|---:|---|---:|
| Wind-up | 16 | — | — |
| Spin 1 | 4 | First radial pulse | 24 |
| Gap | 3 | — | — |
| Spin 2 | 4 | Second radial pulse | 24 |
| Gap | 3 | — | — |
| Dragon Slam | 5 | Ground impact | 38 |
| Recovery | 22 | — | — |

The Beat 'em up player keeps the existing 3.5-second total visual duration. The remaining time after the combat sequence holds the Dragon's Breath pose without damage. Meter cost, per-pulse hit deduplication, and knockdown only on Slam remain unchanged.

## Collision bounds

- Spin 1 and Spin 2 use one circular world-space hit region centered on the fighter, matching the rendered ring origin. The radius is the largest of the configured `spinFront` reach, the rendered staff-tip radius from the fighter center, and the ordinary Staff thrust collider reach plus one collider radius. This guarantees the super radius exceeds the current normal thrust while covering the visible weapon sweep; in Beat 'em up the configured reach starts at 104 units (`130 × .8`), before any larger measured bound. 1v1 and Training use the per-fighter depth scale for the configured and rendered bounds, plus the actual thrust collider measurement. Every grounded target within the circle and the existing projected lane tolerance can be hit, regardless of facing.
- Slam is centered on the lower endpoint of the rendered staff in the Slam pose. Its radius is capped by the remaining portion of the existing 180-unit `slamFront` reach after accounting for the impact point's horizontal offset. It also cannot exceed the 52-unit maximum earth-crack branch length, scaled with the fighter. This uses the visible ground effect for the area size and keeps the outer edge within the current Slam reach.
- Collision measures horizontal world distance and projected lane/depth distance. It does not use a decorative canvas circle. The depth tolerance remains the existing 14 projected units in Beat 'em up (`BeatEmUp.DEPTH_HIT_PX`) and 1v1/Training (`Depth.HIT_PX`).
- Each active pulse registers at most one hit per target. A target may take the two spin pulses and Slam separately. Only Slam sets knockdown.

## Visual and state handling

- The two hands are solved around the rigid staff axis for the sweep poses. Spin 1 makes one full turn; Spin 2 makes one and a half turns for a distinct faster escalation. The fighter's horizontal and lane positions are pinned during the 57-frame sequence.
- Spin and Slam effects are emitted once per phase from the attacker, including on a whiff. Charge, sweep, and impact effects are tagged to the move and removed when it is interrupted or ends; hit registration stops with the attack state.
- Staff weapon geometry prerequisite verified in main at merged commit `46c93ca` (`fix: keep staff render geometry rigid`).

## Verification status

The CI harness exercises the production Beat 'em up resolver for both facings, lateral and lane-axis targets inside the radius, outside-radius and off-lane exclusions, one hit per pulse, both spin pulses, and the existing Slam-only knockdown. No actual UI or viewport playtest was run; Jirot will perform the gameplay pass.
