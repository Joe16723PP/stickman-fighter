# Beat ’em Up UI Revamp Checklist

## 1. Design and specification
- [ ] Finalize HUD layout and information flow.
- [x] Define UI components and responsibilities in `UI-STYLE-GUIDE.md`.
- [x] Establish safe areas and supported resolutions/aspect ratios (existing viewport-fit and safe-area insets retained).
- [x] Use the supplied “Beat ’em Up UI Revamp Plan” image as the target mockup reference.
- [x] Update the UI style guide.
- [x] Record the layout, component responsibilities, and current design tokens in `UI-STYLE-GUIDE.md` (pending visual approval).

## 2. UI foundation
- [x] Define reusable HUD panel and progress bar helpers; existing DOM action buttons are shared components. Text labels and HUD container remain code-level drawing responsibilities.
- [x] Define initial shared colors, typography, spacing, and control sizing tokens in `style.css` (visual tuning pending).
- [x] Implement responsive scaling and safe-area handling (existing canvas scaling and touch-control insets retained).
- [ ] Verify shared components render consistently across game modes.

## 3. HUD: player and game status
- [ ] Add player level (no progression/level field exists in the current game model).
- [x] Add player avatar cue and player number marker to the HUD (visual review pending).
- [x] Show HP and SP bars with numeric values.
- [x] Add a prominent centered timer.
- [x] Show stage and current wave with progress dots.
- [x] Show current score and best score with secondary emphasis.
- [x] Show remaining lives.
- [ ] Keep the top bar to one organized row where the viewport allows (needs viewport review).

## 4. Movement and action controls
- [x] Implement the virtual joystick and dead zone (existing joystick uses 22% of travel radius).
- [x] Group punch/heavy on the lower row and stagger defense/dodge/special above (layout implemented; visual spacing review pending; jump remains separate above cluster).
- [x] Use consistent button sizing and spacing rules (Beat ’em up button sizes were normalized; visual spacing review pending).
- [x] Provide pressed, availability, and cooldown feedback (`.held`, `.ready`, disabled states, and progress rings).
- [x] Keep controls in the bottom-right region and movement in bottom-left (layout code places the pads accordingly; visual review pending).
- [x] Respect safe areas and touch boundaries in layout code (visual hit-area verification pending).
- [x] Let fighters move beneath both touch-control clusters; disable draw-time control avoidance in Beat ’em up and retain only canvas-edge clamps.
- [x] Confirm on device that fighters visibly pass beneath both controller clusters (user reported test passed).

## 5. Gameplay integration and polish
- [x] Connect HP, SP, score, timer, stage, wave, and lives to gameplay state (existing HUD reads live BeatEmUp/Fighter state).
- [x] Add clear damage, skill, HP-change, and cooldown feedback.
  - [x] Player HP panel switches to a danger accent at 25 HP or below.
  - [x] Routine enemy name tags are hidden in combat to prevent crowding; boss tags and attack alerts remain.
  - [x] Dodge cooldown and special meter progress display as button rings; damage, healing, dodge, and special effects already use gameplay FX.
  - [ ] Review damage/skill effects and per-action cooldown feedback visually.
- [x] Sound feedback exists for combat actions; haptics remain optional and unimplemented.
- [x] Reduce avoidable gameplay allocations: effect entries now compact in place, and action-button DOM references are cached.
- [ ] Profile rendering and maintain the 60 FPS target on supported devices.

## 6. QA and release
- [ ] Check visual and interaction consistency across supported devices.
- [x] Verify layout at the supplied 800 × 360 landscape viewport (user-provided tested screenshot); other safe areas and 16:9/19:9 variants remain open.
- [ ] Test performance and memory use during gameplay.
- [ ] Playtest readability and control usability.
- [ ] Fix UI defects and complete polish.
- [ ] Prepare QA report and release candidate.
- [ ] Release and monitor post-release analytics.

## Acceptance criteria
- [ ] HUD is clean, consistent, and easy to scan at a glance.
- [ ] Key information remains visible and readable during combat.
- [ ] Controls are reachable, provide feedback, and do not obstruct gameplay.
- [ ] No unintended overlap at supported viewports.
- [ ] Layout respects safe areas and adapts to supported screen sizes.
- [ ] UI causes no significant frame drops and meets the 60 FPS target.
- [ ] At least 80% of playtesters report improved usability.
