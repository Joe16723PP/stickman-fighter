# CI checks

`tests/ci_checks.py` runs on every pull request (`.github/workflows/ci-checks.yml`).

## Beat 'em up and Practice harnesses
Scripted checks cover class moves, enemy archetypes, bosses, stage lineups, special-move lanes, and the Blade super. Practice keeps the non-arcade lane (36px) used by specials. There is no 1v1 parity digest.

## Edge clearance
At 667x375 and 844x390 (DPR 2, touch): Beat 'em up fighters must stay inside the 2%–98% screen band. Beat 'em up intentionally lets fighters walk under the controls (since `ab55bd1`).

## Running locally
```
pip install playwright==1.64.1 && python -m playwright install chromium
python3 tests/ci_checks.py
```
