# Stickman Fighter UI Style Guide

## Gameplay layout

- **Top:** player status (HP/SP), timer, stage/wave, score/best, and lives.
- **Center:** keep the fight readable; avoid persistent panels over fighters.
- **Bottom-left:** movement joystick, respecting the device safe area.
- **Bottom-right:** grouped combat actions with consistent spacing.
- **Navigation:** pause/menu control stays in the upper-left safe area.

## Component responsibilities

- **HUD panel:** shared framed surface for status and secondary information; rendered by `Game.drawHudPanel`.
- **Progress bar:** visualizes HP/SP while numeric values remain readable; rendered by `Game.bars`.
- **Status labels:** concise monospace labels for player, timer, stage, score, and lives.
- **Action button:** touch target for one combat action; SVG icon communicates action, `.held` communicates press, `.ready` communicates availability, and a radial ring communicates dodge cooldown or special meter progress.
- **Virtual joystick:** movement and lane depth, with a 22% radius dead zone in `Input.bind`.
- **Menu control:** opens pause, fullscreen, and return-to-menu actions.

## Tokens

Defined in `style.css` at `:root`:

- Panel: `--ui-panel`
- Border: `--ui-line`
- Main and muted text: `--ui-text`, `--ui-muted`
- Accent and warm highlight: `--ui-accent`, `--ui-warm`
- Base spacing: `--ui-space`
- Control sizing and separation: `--ui-control-size`, `--ui-control-gap`

Use the existing canvas palette for canvas-rendered HUD elements and these CSS tokens for DOM controls. Keep selected, pressed, ready, cooldown, and disabled states visually distinct. Retain the pixel-art city backdrop and current game identity.

## Responsive and touch rules

- Canvas uses the viewport aspect ratio and scales from a 540-unit logical height.
- Respect `safe-area-inset-*` for touch controls and menu placement.
- Keep movement left and actions right in landscape play.
- Fighters may move beneath both control clusters; controls are visual/input overlays and do not act as gameplay barriers.
- Keep touch targets separated; do not let decorative scaling reduce the actual hit region without checking it.
- Supported target ratios include 16:9 and 19:9; visual verification is tracked in `UI-REVAMP-CHECKLIST.md`.
