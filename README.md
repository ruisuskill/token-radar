# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ruisuskill/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ruisuskill/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ranks pre-token protocols by implied launch value, from a sealed DefiLlama snapshot
(758 protocols, as of 2026-11-14). Built for the make.fun `token-radar-01` bounty:
[Build the best token launch radar](https://make.fun/bounty/token-radar-01).

## What it does

- Covers the full 40-protocol watchlist (TVL ≥ $50M, no token on record) and every
  other pre-token protocol the snapshot lets the radar rank — 191 scored rows in `board.json`.
  The audit accounts for all 758 filed protocols: 191 ranked, 128 in the training set,
  288 tokenised but without a market cap in the snapshot, and 154 excluded with a stated
  reason (exchanges, versioned pools, wrapped/bridged products, staking receipts).
- **Implied value**: an OLS log-log regression of market cap on TVL, fit on the 128
  snapshot protocols that record both. Eight candidate terms were tested held-out
  four ways — walk-forward (older listings fit, newer ones tested), leave-one-out,
  ten-fold cross-validation on a fixed-seed shuffle, and split-half — and chosen by
  greedy forward selection on the leave-one-out error, starting from
  the slope. The slope survives (leave-one-out x1.10 vs flat); the other seven —
  per-category offsets, 7-day growth tilt, curvature, chain count, listing age,
  category tokenised share, recent-listing flag — do not, so radar-5 is a slope-only
  model. A placebo test (log-TVL shuffled with a fixed seed) lands on flat (x0.99),
  and two whole-fit alternatives (a trimmed refit, a fit on the board's own kinds
  only) were tested and not adopted, with the reasons printed on the board. The
  walk-forward test does not beat flat (x0.90) and the board says so: the value
  multiple drifts with listing cohort.
- **Honest intervals and rank ranges**: split-conformal 80% intervals from the
  training residuals, calibrated per kind where a kind has at least ten training
  rows (empirical coverage 81%, pooled interval factor x11.1). The ranges are
  wide because launched tokens really do land far from any line — the board prints
  the interval under every value. Within 3x of the real market cap: 44% of the
  training set (42% leave-one-out). Every row also carries a rank range: its lowest
  and highest rank across the eight fitted variants the board tested (the kept model
  plus each single-term addition). The top rows barely move; the middle of the board
  does.
- **Launch odds**: a logistic tokenisation curve fitted on the snapshot's own 758
  protocols (ln TVL, age with no token, category tokenised share); each row reports
  its 12-month conditional launch odds (median 23%). The clock's shape is printed
  too: for a median-size protocol the odds rise with age (6% at 6 months, 8% at 1
  year, 13% at 2 years, 26% at 4 years).
- **Farm verdicts**: every row gets FARM / THIN / SKIP from a netted expected value in
  dollars — implied value x 12-month odds x the farmer's share of supply (10% community
  pool, farmers together hold 5% of TVL), minus the plan's gas cost — plus the break-even
  deposit, the break-even community-pool share, and minimum viable capital. 75 FARM, 47 THIN, 69 SKIP. Each verdict is also
  priced per hour of active plan time, and at six fixed deposits ($100–$5,000), so the
  smallest deposit that turns a row FARM is visible, and a 2D farm matrix prices every
  deposit tier again at 5%, 10% and 20% pool shares.
- **Farm plans**: 7 concrete steps per row with USD costs and times, and a
  gas-aware minimum viable capital (gas kept to roughly ≤8% of the position).

## Run

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

Node 22+, standard library only. The run is deterministic: two runs on the same
snapshot produce byte-identical output. It writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` to the output directory.

## Layout

- `main.ts` — entry point; reads the snapshot, writes the outputs.
- `lib/model.ts` — the radar-5 model (validated regression, per-kind conformal intervals, rank
  ranges, fitted launch clock, farm verdicts with $/hour, deposit tiers, break-even pool share and a 2D farm matrix, audit).
- `dashboard/` — static board: sortable, searchable, category and watchlist
  filters, per-protocol detail drawer. Renders with no network.
- `vendor/makefun-board.ts` — board/dossier helpers from the competition kit.
- `screenshots/` — the board, a protocol detail view, and a filtered view.

MIT licensed (see `LICENSE`).
