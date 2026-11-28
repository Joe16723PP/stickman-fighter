# Character design lock: Heavy (Stage 1 street-crew enemy) — Stickman Fighter
Written 2026-11-29 for the Heavy sprite ticket (https://app.notion.com/p/426dc1768586819088ead37f5ee5ebe4).
Format follows the Brawler/Rusher locks in /workspace/stickman/prompt-examples/stage1-locks and the Staff template.

## Lock summary (for humans)
- A big, slow street bruiser carrying a sledgehammer. Same crew as the Brawler (Stage 1, Backstreet Awakening) and the same low-res pixel-inspired cel style.
- Reads heavier than the Brawler by SHAPE, not height: roughly 1.5x the Brawler's shoulder width and 1.6x his torso mass, tiny head sunk between the shoulders, short thick legs, huge mitt hands. Standing body is drawn about 400 px tall like every cast member; at game scale 1.12 he is simply bigger and broader.
- Colour identity: brick-red work vest (enemy colour #E94B3E family) over bare, thick, dark-tan arms; slate work pants; tan work boots. Brawler is orange + black, Rusher amber + charcoal, so Heavy is the only red/slate figure on the street.
- Weapon: sledgehammer, dark wood handle with red grip tape and a grey steel head. In idle/walk it is carried low at his side, head down, so the standing silhouette (head to boots) sets the normalised 188 px body height, like the other casts. Only the slam clip lifts the hammer above his head.
- Avoids near-white and near-black-on-white fringes: nothing in the palette is lighter than #D9D0BC, so a flat white background can be keyed out cleanly (the same route the Brawler/Rusher/Grappler sheets used).

## Game numbers this must match
- config.js: `heavy: { health 145, loadout 'sledgehammer', speed .74, scale 1.12, bodyProfile 'heavy', slam 'overhead' }`, enemy colour #E94B3E.
- Body profile: torsoWidth 2.1 (Brawler 1.6), limbWidth 1.55, legLength .86, handRadius 1.6 plain mitt hands, neckScale .4, wide planted stance, slow weight-shift breathing, heavy footfall dip.
- Timings (60 fps game frames): wind-up 30f, swing 4f, recovery 48f. Clips are authored at 12 fps; the slam clip carries per-frame hold values in `clips.json` -> `timing`.

## Asset layout to match (Brawler format)
```
assets/characters/heavy/frames/clips.json
assets/characters/heavy/frames/clips/<clip>/00.png, 01.png, ...
```
- clips.json keys: frameW, frameH, baseline, body (188), fps (12), clips {name: count}, and per clip {frameW, frameH, baseline, anchor}. `anchor` = x of the planted foot centre inside the frame, `baseline` = y of the soles.
- Per-clip boxes are tight (not 320x560): the 320x560 cell is the AI generation cell, and sheets are scaled so the idle median height = body 188, then cropped to the largest pose in each clip with a 16 px margin. Same as brawler/rusher/grappler (see slice_stage2.py).
- Clips: idle 6, walk 8, slam 9 (overhead; 5 from the slam sheet + 4 from a separate recovery sheet), hit 4, fall 6. (Brawler has idle/walk/attack/fall; `hit` is new at Lingxi's request.)

## Lock prompt (paste first, then the clip prompt)
```
CHARACTER DESIGN LOCK — STICKMAN FIGHTER — STAGE 1 ENEMY: HEAVY

REFERENCE:
Design a street-crew enemy for Stage 1, Backstreet Awakening, an abandoned arcade district.
This is the crew's heavy hitter, a different person from the orange-hoodie Brawler boxer and the amber-jacket Rusher.
Establish one full-body reference pose that later sprites must copy exactly.
Preserve this character's identity, costume, body proportions, color palette, and visual style across every later frame.

CHARACTER:
Street enforcer, about 36. Enormous, thick, slow. Barrel chest, very wide yoke of a shoulder line, huge upper arms and forearms, big plain mitt-like fists.
Bald head, thick dark stubble beard, heavy brow, small head sunk low between the shoulders on a very short neck.
Short thick legs with a low centre of gravity, wide planted stance, belly pushing against the belt.
Tired, heavy-lidded, dangerous expression. Moves like he never needs to hurry.
Natural human anatomy, exaggerated fighting-game proportions: shoulders about 1.5 times as wide as a normal fighter, head no larger than a normal fighter's head.
Side view, facing right (the game flips him to face the player). Not a teenager.

OUTFIT:
- Sleeveless brick-red quilted work vest, open at the front, frayed armholes, dark seams.
- Bare arms. Dirty cream hand tape wrapped around both fists and wrists.
- Slate-blue work pants, loose and heavy, with grey knee patches.
- Wide black leather belt with a dull steel buckle.
- Tan steel-toe work boots with dark soles.
- A sledgehammer: long dark wood handle, red grip tape on the lower third, big grey steel head with a worn flat face.
- Idle and walk: he carries the hammer low in his right hand at his side, head down near the ground behind his lead leg, handle angled, so the hammer does not rise above his head.

STRICT COLOR PALETTE:
Vest base: #C8402F
Vest shadow: #8F2A21
Vest deep shadow: #571813
Vest highlights: #E94B3E
Pants base: #3B4660
Pants shadow: #262E42
Pants highlights: #5A6783
Knee patches: #6B7280
Boots: #7A5A3A
Boot shadow: #4F3A25
Boot soles: #2A2420
Belt: #1C1A1A
Belt buckle: #9AA3AF
Hand tape: #D9D0BC
Tape shadow: #A89F8A
Skin base: #B07850
Skin shadow: #7D4E32
Skin highlights: #D49E78
Beard stubble: #3A2E28
Hammer handle: #7A4E2B
Hammer grip tape: #E94B3E
Hammer head: #8E98A6
Hammer head shadow: #5A6270
Hammer head highlight: #C9D1DC
Outline: #14110F

ART DIRECTION:
2D arcade fighting game character.
Low-resolution, pixel-inspired raster illustration.
Stylized anime/comic proportions.
Bold dark outlines.
Hand-painted cel shading.
Strong readable silhouettes.
Detailed clothing folds and muscle definition.
Controlled highlights and shadows.
Slightly exaggerated fighting-game anatomy.
The oversized shoulders, arms, fists and the sledgehammer are part of his silhouette and must stay fully inside the frame.

PROPORTION LOCK:
Maintain identical head size, shoulder width,
torso width and length, arm length, leg length, foot size, and hammer size.
Use consistent anatomy across all frames.
No stretched limbs, no tiny hands, no tall legs, no change of body bulk between frames.
Keep the same costume details, belt, tape, and character scale.

SPRITE REQUIREMENTS:
- Individual frame: 320 x 560 pixels.
- Full-body character and the full hammer.
- Bottom-center alignment. Both boots on the shared ground line near the bottom of the cell.
- Plain flat pure white #FFFFFF background (it is keyed out to transparent PNG at import). No ground shadow, no floor, no gradient.
- No cropping of head, fists, boots, or either end of the hammer.
- Consistent camera and viewing angle.
- Consistent character scale.
- No unnecessary perspective changes.
- Draw the standing body about 400 pixels tall (head to boots, hammer carried low).

SPRITE SHEET:
Frames are read left to right, then top to bottom. At most 6 cells per row.
6 frames = 3 x 2 grid. 8 frames = 4 x 2 grid. 4 frames = 2 x 2 grid.
Equal cells. No gaps, borders, labels, numbers, or shadows between cells. Every cell shares the same ground line and the same character scale.

OUTPUT:
One sprite sheet for the chosen clip, sized by the grid rule above.
Create a clean png, production-oriented 2D game sprite.
This image is the character lock for every later Heavy sprite.
Do not redesign, reinterpret, or change the outfit, the hammer, or the colors.
```

## Clip prompts (the ANIMATION block, appended after the lock)
Reference step: "Reference pose: ONE single full-body standing pose, side view facing right, carrying the sledgehammer low at his side, heavy planted stance, on a pure white background, 320 x 560 proportions."

1. **idle, 6 frames (3x2).** "Heavy idle: slow weight shift side to side and a deep slow breath. Hammer hangs low at his side, head down. Fists loose. Feet stay planted on the ground line; only chest and shoulders rise and fall. Small, slow changes between frames."
2. **walk, 8 frames (4x2).** "Heavy walk: slow, weighty stalking steps, hammer dragging low beside the lead leg. Each footfall drops the hips and shoulders slightly. 1 contact, 2 down, 3 passing, 4 up, 5 contact other foot, 6 down, 7 passing, 8 up. Short stride, wide stance."
3. **slam (overhead), 8 frames (4x2).** "Heavy overhead hammer slam. 1 stands and grips the hammer with both hands, 2 hoists the hammer up behind the shoulder, knees bending, 3 hammer fully overhead and slightly behind the head, body leaning back, 4 (the swing, 4 game frames) hammer driven down hard in front, body thrown forward, 5 impact: hammer head on the ground in front of his lead foot, deep forward lean, 6 holds the hammer on the ground, breathing hard, 7 starts to heave the hammer up, 8 returns to a low-hammer standing stance. The hammer stays fully inside the frame in every cell."
4. **hit, 4 frames (2x2).** "Heavy hit reaction: 1 head and chest jerk back, 2 maximum recoil, shoulders pulled back, one hand loosens on the hammer, 3 rocks forward again, 4 settles back toward his stance. He is heavy, so the recoil is short."
5. **fall (down), 6 frames (3x2).** "Heavy knockdown: 1 staggers back, 2 knees buckle and the hammer slips from his hand, 3 topples backward, 4 hits the ground hard, 5 lies flat on his back, 6 stays down, still. The hammer lands on the ground next to him, fully inside the frame."

## Slam timing (game frames @60 fps, from Lingxi) — as shipped (9 frames)
| clip frame | pose | hold (game f) | phase |
|---|---|---|---|
| 0 | grip | 10 | wind-up (30f total) |
| 1 | hoist | 10 | wind-up |
| 2 | overhead | 10 | wind-up |
| 3 | swing down | 4 | swing (4f) |
| 4 | impact, hammer on ground | 14 | recovery (48f total) |
| 5 | hunched, hammer resting | 12 | recovery |
| 6 | hauling hammer up | 10 | recovery |
| 7 | straightening, hammer lifted | 8 | recovery |
| 8 | upright, hammer low (= idle stance) | 4 | recovery |
Total = 82f (30 + 4 + 48). Stored as `timing` (+ `phases`) under `slam` in clips.json.

## QA checklist
- Palette drift: dominant colours in each frame within a small distance of the lock palette (vest red, slate pants, tan boots).
- Same body height across clips (idle median -> 188 px), same shoulder width.
- Baseline/anchor consistent inside each clip, boots on the baseline.
- Transparent background, no white fringe.
- Visibly broader and heavier than the Brawler at the same body height.
