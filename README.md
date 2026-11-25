# Token Radar

Ranks pre-token protocols by implied launch value, from a sealed DefiLlama snapshot
(758 protocols, as of 2026-11-14). Built for the make.fun `token-radar-01` bounty.

## What it does

- Covers the full 40-protocol watchlist (TVL ≥ $50M, no token on record) and adds
  160 earlier pre-token protocols — 200 scored rows in `board.json`.
- **Implied value**: an OLS log-log regression of market cap on TVL, fit on the 128
  snapshot protocols that record both, with per-category offsets (shrunk toward 0)
  and a 7-day growth tilt. Launched-token protocols are the training set; pre-token
  protocols are scored, never mixed into the board.
- **Honest intervals**: split-conformal 80% intervals from the training residuals
  (empirical coverage 81%). The ranges are wide because launched tokens really do
  land far from any line — the board prints the interval under every value.
- **Launch probability**: a logistic score from size (ln-TVL z-score), the category's
  tokenised share, and years running with no token.
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
- `lib/model.ts` — the radar-2 model (regression, conformal intervals, launch
  probability, farm plans).
- `dashboard/` — static board: sortable, searchable, category and watchlist
  filters, per-protocol detail drawer. Renders with no network.
- `vendor/makefun-board.ts` — board/dossier helpers from the competition kit.
- `screenshots/` — the board, a protocol detail view, and a filtered view.

MIT licensed (see `LICENSE`).
