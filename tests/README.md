# CI checks

`tests/ci_checks.py` runs on every pull request (`.github/workflows/ci-checks.yml`).

## 1. Seeded 1v1 parity
- Seed `0xC0FFEE42` (LCG replacing `Math.random`), 100 rounds per level (easy, normal, hard), reseeded per level.
- Player 0 is a scripted random-input player; player 1 is the CPU `Bot`. Fixed 1/60 s step, 844x390 viewport.
- The sha256 of every round's `[level, winner, hp0, hp1, rngState]` must equal `parity-baseline.json`.

### Baseline
`parity-baseline.json` was recorded on branch `fix/fx-rng` (main `ab55bd1` + the cosmetic-PRNG change for effects).
Digest `243efa78…` — CPU won / player won: Easy 31/69, Normal 98/2, Hard 99/1.
Since `fix/fx-rng`, hit sparks use `Fx.random()` instead of `Math.random()`, so the digest no longer depends on where the touch controls are laid out.

### Baseline history
- `243efa78…` — `fix/fx-rng` (ab55bd1 + cosmetic Fx PRNG). Easy 31/69, Normal 98/2, Hard 99/1 (CPU/player).
- `4f58010d…` — `fix/perf-cleanup`: the 1v1 lane is now computed from the measured control rects (pads sit 40px from the edge since ab55bd1, not the old hardcoded 16px), so the lane is narrower and edge clearance grows from ~22px to ~43px. Easy 31/69, Normal 95/5, Hard 98/2.
- `e1f4e789…` — measured-control lane change on Karate baseline `48fe85b0…`. Player wins: Easy 92%, Normal 18%, Hard 9%. This intentionally changes 1v1 spacing and its parity baseline.

If a PR changes 1v1 behaviour on purpose, run `python3 tests/ci_checks.py --update-baseline`, commit the new baseline in the same PR, and explain the change in the PR body.

## 2. Edge clearance
At 667x375 and 844x390 (DPR 2, touch): 1v1 fighters parked at the lane edges must be at least 4 px from any control that shares their vertical span.
Beat 'em up intentionally lets fighters walk under the controls (since `ab55bd1`); the check only asserts its 2%–98% screen band stays inside the viewport.

## Running locally
```
pip install playwright==1.64.1 && python -m playwright install chromium
python3 tests/ci_checks.py
```
