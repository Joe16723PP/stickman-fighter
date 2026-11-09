# Bosses: unique per stage, plus ×5 difficulty (pre-approved by Jirot, 2026-11-10)

Today every stage boss is the same `boss` archetype: HP 220 (plus 5.5% per stage, times the difficulty multiplier), a random stick or knife, a 0.72s tell, cooldown max(.42, .8 − phase·.12), and a 24% special chance from phase 2. Only the name and colour differ.

## Part A: ×5 harder (small PR, build first)
"×5 harder" means the boss's threat, measured as HP × damage per second, is 5× today's.
| Lever | Today | New | Factor |
|---|---|---|---|
| HP | 220 base | 550 base | ×2.5 |
| Damage | weapon dmg mult | ×1.4 on all boss hits | ×1.4 |
| Attack rate | cool .80/.68/.56 by phase, tell .72s | cool .56/.48/.40, tell .50s | ×1.43 |
DPS is ×1.4 × 1.43 = ×2.0, and with HP ×2.5 that gives ×5.0. The rest of the boss stays as it is:
- Stage scaling, the difficulty multipliers (Easy, Normal and Hard keep their relative gaps), the phases at 66% and 33%, and boss HP carrying across lives.
- The tell stays at 0.50s or more, so every boss attack remains readable and blockable. Do not go lower.
- Regular enemies, waves, player classes and 1v1 CPU are unchanged.
- One constant `BOSS_HARDNESS = 5` splits into these three factors (√ shares as above), so Jirot can dial it later.
Report for Easy, Normal and Hard: the bot's boss clear rate per stage, average boss fight time, and damage taken, before and after. Time-to-kill should be about ×2.5 and damage taken about ×5. No other retune.

## Part B: unique boss per stage (framework PR + 2 content PRs)
A `BossProfiles[stage]` table replaces the random weapon. Each entry has a weapon, a silhouette accessory, a colour (use the existing `bosses[]` palette), a normal pair, and one signature move. The signature unlocks in phase 2, and in phase 3 its tell drops by 20% (but never below 0.40s). All numbers below are base values before the Part A multipliers.

| # | Boss | Weapon (reach) | Look | Normals | Signature |
|---|---|---|---|---|---|
| 1 | BLOCK CAPTAIN | Brass knuckles (95) | Flat cap, vest | Jab 5, Hook 9 | **Block Party**: 3-punch rush 6/6/12, the last hit is a guard-break, +140px advance |
| 2 | DOCKMASTER | Anchor chain (230) | Peacoat, beanie | Chain lash 10, Low swing 12 | **Haul In**: the chain hooks you and pulls you 150px into a 14 dmg anchor smash |
| 3 | MARKET KING | Twin cleavers (100) | Apron, crown of lanterns | Chop 6, Cross-chop 8 | **Butcher's Toss**: a thrown cleaver projectile, 500px at 700px/s, 12 dmg, then a 4-hit flurry ×4 |
| 4 | IRON JACK | Sledgehammer (150) | Welder mask, glowing apron | Overhead 16 (armored windup), Sweep 12 | **Forge Quake**: a slam that sends a shockwave along the floor, 420px, hitting depth gaps up to 30px. Block it or change lane by more than 30px |
| 5 | TUNNEL WARDEN | Riot shield + baton (110) | Helmet, hi-vis | Baton 8, Shield bash 10 | **Shield Wall**: blocks all frontal hits in phase 1 except a back hit or a whiffed bash. Shield Charge 300px, 14 dmg |
| 6 | SKYLINE SNIPER | Crossbow (ranged) + kick | Hood, red visor | Stock strike 8, Kick 10 | **Laser Lock**: a red laser line on your lane for 0.6s, then a bolt across the whole screen, 18 dmg. Phase 3 fires 3 shots on 3 lanes |
| 7 | MASTER KAGE | Naginata (200) | White gi, black hakama, long hair | Thrust 10, Wheel cut 12 | **Shadow Step**: teleports behind you, leaving an afterimage, then cuts for 16. Also a counter stance that parries your next hit, 0.8s |
| 8 | BRIDGE BREAKER | Steel girder (210, slow) | Hard hat, huge frame (scale 1.4) | Girder swing 18, Shove 10 | **Roadblock**: throws a barricade that blocks one lane for 4s, then charges 400px for 20 dmg |
| 9 | THE DIRECTOR | Shock baton (120) | Suit, headset, mic | Shock jab 8 (+0.3s stun), Cane sweep 10 | **Live Broadcast**: screen glitch, then 3 lightning strikes on marked spots after a 0.7s tell, 14 dmg each |
| 10 | SYNDICATE CHIEF | Changes by phase: twin blades, then hammer, then gauntlets | Long coat, gold chain, cape in phase 3 | The weapon's normals per phase | **Coliseum Finale**: a 5-hit super (10/10/12/14/24 + KD). It uses the boss-1 to boss-9 signatures one at a time in phase 2 |

Rules for every boss:
- Every new hit box ends at the drawn weapon tip, and projectiles and shockwaves respect lanes (depthClose, 14px; the Forge Quake allowance is 30px).
- Signature tells are both visible (a coloured flash on the weapon plus the CHARGE label) and audible.
- Effects are draw-only, mirror with facing, and don't clip the HUD at 667×375 or 844×390.
- Silhouettes must stay readable at game size: weapon and accessory shapes are drawn with a 3px+ stroke.

Suggested PRs: A (×5) → B1 (BossProfiles framework + bosses 1–5) → B2 (bosses 6–10). Lingxi picks the slot. The class order Jirot set (lanes → Karate → Staff → Blade) stands unless he says otherwise. A is small and can go right after lanes.

## Acceptance (Lemar's review)
1. A: the logged multipliers equal 2.5 / 1.4 / 1.43, the tell is ≥0.50s, and the before/after tables are reported for all difficulties.
2. B: frozen-state proof shots of each boss (idle, normal, signature tell, signature hit) on both sides, plus hit-box overlays at the weapon tip.
3. Each signature: a frame-stepped proof, the counterplay works (block, lane change, back hit as specced), and the lane rules are logged.
4. No HUD clipping at 667×375 and 844×390, DPR 2 and 3; boss scale 1.25–1.42 (girder 1.4–1.6) included.
5. Regular enemies, 1v1 and Training unchanged. Win rates and clear rates reported.
