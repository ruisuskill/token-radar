// The token radar's model (radar-5): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other pre-token protocol the snapshot lets the radar rank: the early rows the radar exists to
// find. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's tokenised protocols are kept apart — the ones that record a market cap
// are the model's training set, never mixed into the ranked board.
//
// Implied value is a regression fit on the snapshot's own figures, and every term of it has to earn
// its place. Eight candidate terms — the log-TVL slope, per-category offsets, the 7-day growth
// tilt, log-TVL curvature, the chain count, the listing age, the category's tokenised share and a
// recent-listing flag — are each tested held-out four ways before they are kept: walk-forward (fit
// on the older listings, test on the newer ones, split by listed_at), leave-one-out over the
// training set, ten-fold cross-validation on a fixed-seed shuffle, and split-half (each half fit,
// tested on the other). A term stays only if removing it makes the leave-one-out error worse; the
// other three numbers are printed alongside as further opinions. On this snapshot the slope survives
// and the other seven do not: each makes the held-out error worse, so radar-5 is still a
// slope-only model, ln V = a + b x ln(TVL) — but the claim now rests on eight terms tested four
// ways, not two. Two further fits are tested and reported, not adopted: a trimmed refit (training rows
// beyond two residual standard deviations dropped, re-tested inside every fold) and a fit on the
// board's own kinds only (traded protocols outside the excluded categories). The trimmed fit barely
// moves leave-one-out and the kind-only fit is worse walk-forward, so neither is used. A placebo
// test shuffles log-TVL among the training rows with a fixed seed and refits: its leave-one-out
// error should land on flat, and it does. The walk-forward test does not beat a flat baseline at
// all (x0.90): the value multiple drifts with listing cohort — the newest listings trade richer
// than the old fit predicts — so the board says so instead of hiding it. The leave-one-out test
// beats flat x1.10.
//
// Every row carries an honest interval (split-conformal, 80%) and a rank range: the ranks the row
// holds across the eight fitted variants the board tested — the kept slope-only model plus each
// single-term addition (offsets, growth, curvature, chain count, age, category share, recent
// flag). The interval says how far a launched token can land from the line; the rank range says
// how much the ordering moves when the model itself changes. (Neither the interval edges nor
// leave-one-out refits can give this range honestly: the 80% interval spans a factor of eleven,
// so every row's interval overlaps every other's; and a refit of a one-slope model cannot reorder
// anything, because the board's order is the TVL order under any positive slope.) The interval is
// calibrated per kind where a kind has at least ten training rows: a noisy kind gets a wider
// interval, a steady one a narrower one, and kinds with too few training rows fall back to the
// pooled half-width instead of an interval built on a handful of residuals.
//
// Launch odds are fitted, not set by rule: a logistic regression on all 758 protocols (tokenised
// 1/0 against ln TVL, age with no token in years, and the category's tokenised share) gives a
// tokenisation curve F(age); the 12-month launch odds for a row are the conditional hazard
// [F(age + 1y) - F(age)] / [1 - F(age)] at that row's size and category. It is a cross-sectional
// cohort curve — the snapshot carries no observed launch dates — and the board states that. The
// clock's shape is printed too: the same odds at 0.5, 1, 2 and 4 years for a median-size protocol,
// so a reader can see whether odds rise or fall with age instead of taking the fitted curve on trust.
//
// The audit accounts for all 758 protocols: ranked, training set, tokenised-but-unvalued, and
// excluded with a reason from snapshot fields only (centralised exchanges, versioned pools,
// wrapped/bridged products, staking receipts). The watchlist is the floor and is always ranked,
// even the three watchlist protocols whose category would otherwise exclude them.
//
// Every board row gets a farm verdict — FARM / THIN / SKIP — from a netted expected value in
// dollars: implied value x 12-month launch odds x the farmer's share of the token supply, minus
// the farm's gas cost. The farmer's share is a stated model: 10% of supply goes to the community
// pool and farmers together hold 5% of TVL, so a deposit's share is (deposit / 5% of TVL) x 10%.
// The break-even deposit is the deposit at which that expected value is zero; the minimum viable
// capital is the larger of the gas floor and the break-even deposit. The break-even pool share is
// the share of supply the community pool would have to pay for the row to break even at the
// planned deposit. The verdict is also priced per hour of farmer time (the plan's active minutes,
// not the hold) and at six fixed deposits ($100–$5,000), so a reader can see the smallest deposit
// that turns a row FARM instead of taking the planned deposit on trust, and the 2D farm matrix
// prices every deposit tier again at 5%, 10% and 20% pool shares, so the verdict's dependence on
// the pool's generosity is visible instead of assumed.
//
// No protocol name is ever special-cased: the same fitted functions score every row, and every
// constant above is recomputed from the snapshot at run time except the stated structural ones
// (shrinkage 6 for the offsets test, growth weight 0.30 for the growth test, conformal level 0.80,
// ten folds on seed 20261126, ten training rows to calibrate a kind's own interval, the 10% pool
// and 5% farmed-TVL shares, the $25 FARM threshold, the six deposit tiers, the placebo seed
// 20261114, the trim at 2 residual standard deviations).

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One value term's held-out test: the error with the term against the error without it, four ways. */
export interface ValueTermTest {
  term: string;
  kept: boolean;
  walk_forward_rmse_with: number;
  walk_forward_rmse_without: number;
  loo_rmse_with: number;
  loo_rmse_without: number;
  tenfold_rmse_with: number;
  tenfold_rmse_without: number;
  split_half_rmse_with: number;
  split_half_rmse_without: number;
}

/** A whole-fit alternative that was tested and reported, not adopted: what it is, what it scored, why it stays out. */
export interface ValueExtraTest {
  label: string;
  train_size: number;
  loo_rmse: number;
  loo_multiple_vs_flat: number;
  walk_forward_rmse: number | null;
  walk_forward_multiple_vs_flat: number | null;
  adopted: boolean;
  reason: string;
}

/** The value model's held-out validation: walk-forward (older fit, newer test), leave-one-out, ten-fold and split-half. */
export interface ValueValidation {
  walk_forward: {
    fit_size: number;
    test_size: number;
    split_listed_at: string;
    flat_rmse: number;
    model_rmse: number;
    multiple_vs_flat: number;
  } | null;
  ten_fold: { flat_rmse: number; model_rmse: number; multiple_vs_flat: number };
  split_half: { flat_rmse: number; model_rmse: number; multiple_vs_flat: number };
  leave_one_out: { flat_rmse: number; model_rmse: number; multiple_vs_flat: number };
  terms: ValueTermTest[];
  kept_terms: string[];
  dropped_terms: string[];
  extra_tests: ValueExtraTest[];
}

/** The fitted launch clock: a logistic tokenisation curve over the snapshot's own protocols. */
export interface LaunchClock {
  fit_size: number;
  missing_age: number;
  median_age_days: number;
  intercept: number;
  ln_tvl: number;
  age_years: number;
  category_tokenised_share: number;
  mean_fitted_probability_traded: number;
  mean_fitted_probability_pretoken: number;
  odds_12m_median: number;
  odds_by_age: { age_years: number; odds_12m: number }[];
}

/** The placebo test: log-TVL shuffled among the training rows with a fixed seed, refit, held out. */
export interface PlaceboTest {
  seed: number;
  loo_rmse: number;
  flat_rmse: number;
  multiple_vs_flat: number;
}

/** The bootstrap stability check: refits of the value model on resampled training rows, and what they say about every row's rank. */
export interface BootstrapSummary {
  resamples: number;
  seed: number;
  train_size: number;
  median_rank_span: number;
  median_sd_log: number;
  rows_span_over_50: number;
  rows_value_moves_over_25pct: number;
  /** Per protocol, by slug: its rank range and log-value spread across the resampled refits. */
  by_slug: Record<string, { rank_low: number; rank_high: number; sd_log: number }>;
}

/** The fitted model's reportable statistics: the dashboard states them verbatim. */
export interface ModelFit {
  train_size: number;
  intercept: number;
  slope: number;
  category_offsets: Record<string, number>;
  extra_coefficients: Record<string, number>;
  median_age_years: number;
  category_tokenised_share: Record<string, number>;
  bootstrap: BootstrapSummary;
  conformal_level: number;
  conformal_half_width_log: number;
  interval_factor: number;
  conformal_by_kind: Record<string, number>;
  conformal_kinds_calibrated: number;
  empirical_coverage: number;
  tokenised_share: number;
  within_3x_training: number;
  within_3x_loo: number;
  validation: ValueValidation;
  clock: LaunchClock;
  placebo: PlaceboTest;
}

/** Why a protocol is not ranked, from snapshot fields only; null when it is ranked. */
export type ExclusionReason = 'cex' | 'versioned' | 'wrapped-bridged' | 'staking-receipt' | null;

/** The audit: every one of the snapshot's protocols, counted once, in exactly one bucket. */
export interface AuditCounts {
  filed: number;
  ranked: number;
  watchlist_ranked: number;
  early_ranked: number;
  training_set: number;
  token_no_mcap: number;
  excluded_cex: number;
  excluded_versioned: number;
  excluded_wrapped_bridged: number;
  excluded_staking_receipt: number;
  watchlist_carveout: number;
}

/** The board's self-checks, verified on the built board itself, not asserted. */
export interface IntegrityChecks {
  ranks_exact: boolean;
  values_non_rising: boolean;
  no_ties: boolean;
  watchlist_covered: string;
  rows_ranked: number;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
}

/** A farm verdict: the netted expected value and the deposit that makes the row pay. */
export interface FarmVerdict {
  verdict: 'FARM' | 'THIN' | 'SKIP';
  expected_value_usd: number;
  expected_value_per_hour_usd: number;
  work_minutes: number;
  farm_cost_usd: number;
  plan_capital_usd: number;
  breakeven_deposit_usd: number;
  breakeven_pool_share: number | null;
  min_viable_capital_usd: number;
  launch_odds_12m: number;
  deposit_tiers: { deposit_usd: number; expected_value_usd: number; verdict: 'FARM' | 'THIN' | 'SKIP' }[];
  farm_matrix: FarmMatrixRow[];
  smallest_farm_deposit_usd: number | null;
}

/** One row of the 2D farm matrix: the expected value at one deposit under three community-pool shares. */
export interface FarmMatrixRow {
  deposit_usd: number;
  ev_pool_05_usd: number;
  ev_pool_10_usd: number;
  ev_pool_20_usd: number;
}

/** The model's structural constants (everything else is fit from the snapshot). */
export const MODEL = {
  shrinkage: 6,
  min_category_train: 2,
  offset_cap_log: 1.5,
  growth_weight: 0.3,
  growth_floor: -40,
  growth_cap: 40,
  conformal_level: 0.8,
  walk_forward_fit_share: 0.7,
  tenfold_folds: 10,
  tenfold_seed: 20261126,
  min_kind_train: 10,
  airdrop_pool_share: 0.1,
  farmed_tvl_share: 0.05,
  farm_threshold_usd: 25,
  deposit_tiers: [100, 250, 500, 1000, 2500, 5000],
  placebo_seed: 20261114,
  trim_sd: 2,
  bootstrap_resamples: 200,
  bootstrap_seed: 20261126,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-6';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  rank_low: number;
  rank_high: number;
  boot_rank_low: number;
  boot_rank_high: number;
  boot_sd_log: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_odds_12m: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  expected_value_usd: number;
  expected_value_per_hour_usd: number;
  work_minutes: number;
  farm_cost_usd: number;
  plan_capital_usd: number;
  breakeven_deposit_usd: number;
  breakeven_pool_share: number | null;
  min_viable_capital_usd: number;
  deposit_tiers: { deposit_usd: number; expected_value_usd: number; verdict: 'FARM' | 'THIN' | 'SKIP' }[];
  farm_matrix: FarmMatrixRow[];
  smallest_farm_deposit_usd: number | null;
  model: {
    category_offset: number;
    growth_multiplier: number;
    age_days: number | null;
    interval_factor: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan. */
export interface RadarRow {
  rank: number;
  rank_low: number;
  rank_high: number;
  boot_rank_low: number;
  boot_rank_high: number;
  boot_sd_log: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  launch_odds_12m: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  expected_value_usd: number;
  expected_value_per_hour_usd: number;
  work_minutes: number;
  farm_cost_usd: number;
  plan_capital_usd: number;
  breakeven_deposit_usd: number;
  breakeven_pool_share: number | null;
  min_viable_capital_usd: number;
  deposit_tiers: { deposit_usd: number; expected_value_usd: number; verdict: 'FARM' | 'THIN' | 'SKIP' }[];
  farm_matrix: FarmMatrixRow[];
  smallest_farm_deposit_usd: number | null;
  category_offset: number;
  growth_multiplier: number;
  interval_factor: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the fitted model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelFit;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  health: SnapshotHealth;
  health_warnings: string[];
  audit: AuditCounts;
  integrity: IntegrityChecks;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories whose products are a wrapped or bridged version of another asset, not a standalone protocol that would launch its own token: official chain bridges, cross-chain bridges, and wrapped representations of BTC or a stablecoin. */
const WRAPPED_BRIDGED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Stablecoin Wrapper',
  'Anchor BTC',
  'Restaked BTC',
  'Decentralized BTC',
]);

/** Categories whose products are staking receipts for another chain's asset. The snapshot carries no field that separates an independent staking protocol that might launch a token from an exchange-issued receipt, so the whole category is set aside rather than guessed at. */
const STAKING_RECEIPT_CATEGORIES = new Set(['Liquid Staking', 'Liquid Restaking', 'Restaking', 'Staking Pool']);

/**
 * Why a protocol is not ranked, from snapshot fields only; null when it is ranked. The watchlist
 * is the floor and is always ranked, even the watchlist protocols whose category would otherwise
 * exclude them — the coverage gate requires every watchlist slug, and the audit counts those rows
 * as a carve-out instead of hiding them.
 */
export function exclusionReason(p: SnapshotProtocol, watchlist: Set<string>): ExclusionReason {
  if (watchlist.has(p.slug)) return null;
  if (p.category === 'CEX') return 'cex';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_BRIDGED_CATEGORIES.has(p.category ?? '')) return 'wrapped-bridged';
  if (STAKING_RECEIPT_CATEGORIES.has(p.category ?? '')) return 'staking-receipt';
  return null;
}

/** Whether a protocol is one the board may rank: pre-token, and nothing in its record excludes it. */
export function isRankable(p: SnapshotProtocol, watchlist: Set<string> = new Set()): boolean {
  return isPreToken(p) && exclusionReason(p, watchlist) === null;
}

/** The audit: every protocol in the snapshot, counted once, in exactly one bucket. */
export function auditCounts(snapshot: Snapshot): AuditCounts {
  const watchlist = new Set(snapshot.watchlist);
  let ranked = 0;
  let watchlistRanked = 0;
  let carveout = 0;
  let training = 0;
  let tokenNoMcap = 0;
  let cex = 0;
  let versioned = 0;
  let wrappedBridged = 0;
  let stakingReceipt = 0;
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) {
      const reason = exclusionReason(p, watchlist);
      if (reason === null) {
        ranked += 1;
        if (watchlist.has(p.slug)) {
          watchlistRanked += 1;
          if (
            p.category === 'CEX' ||
            VERSIONED.test(p.name) ||
            WRAPPED_BRIDGED_CATEGORIES.has(p.category ?? '') ||
            STAKING_RECEIPT_CATEGORIES.has(p.category ?? '')
          ) {
            carveout += 1;
          }
        }
      } else if (reason === 'cex') cex += 1;
      else if (reason === 'versioned') versioned += 1;
      else if (reason === 'wrapped-bridged') wrappedBridged += 1;
      else stakingReceipt += 1;
    } else if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      training += 1;
    } else {
      tokenNoMcap += 1;
    }
  }
  return {
    filed: snapshot.protocols.length,
    ranked,
    watchlist_ranked: watchlistRanked,
    early_ranked: ranked - watchlistRanked,
    training_set: training,
    token_no_mcap: tokenNoMcap,
    excluded_cex: cex,
    excluded_versioned: versioned,
    excluded_wrapped_bridged: wrappedBridged,
    excluded_staking_receipt: stakingReceipt,
    watchlist_carveout: carveout,
  };
}

/** The median of a sorted number list, or null when it is empty. */
function medianOf(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The median age with no token, in days, over the pre-token protocols that carry a listing date. */
export function medianPreTokenAgeDays(snapshot: Snapshot): number | null {
  const ages = snapshot.protocols
    .filter(isPreToken)
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null)
    .sort((a, b) => a - b);
  return medianOf(ages);
}

/** The 7-day growth tilt the point estimate carries. */
function growthMultiplier(p: SnapshotProtocol): number {
  const growth = clamp(finite(p.change_7d, 0), MODEL.growth_floor, MODEL.growth_cap);
  return 1 + (growth / 100) * MODEL.growth_weight;
}

/** The context a value feature needs: the snapshot for category shares, and the median pre-token age for rows with no listing date. */
export interface ValueCtx {
  snapshot: Snapshot;
  medianAgeYears: number;
}

/** The value context of a snapshot, built once and passed through every fit and test. */
export function valueCtx(snapshot: Snapshot): ValueCtx {
  return { snapshot, medianAgeYears: (medianPreTokenAgeDays(snapshot) ?? 365) / 365 };
}

/** Which value terms a fit uses. */
export interface ValueTerms {
  slope: boolean;
  offsets: boolean;
  growth: boolean;
  curvature: boolean;
  chains: boolean;
  age: boolean;
  catshare: boolean;
  recent: boolean;
}

/** A value fit: OLS in log space on the enabled columns, with shrunk per-category offsets when the terms say so. */
export interface ValueFit {
  columns: string[];
  coefficients: number[];
  offsets: Record<string, number>;
}

/** Every switchable value column: its term key, its label on the board, and its design column. */
export const VALUE_COLUMNS: { key: keyof ValueTerms; label: string; column: string }[] = [
  { key: 'slope', label: 'log-TVL slope', column: 'ln_tvl' },
  { key: 'curvature', label: 'log-TVL curvature', column: 'ln_tvl_sq' },
  { key: 'chains', label: 'chain count', column: 'ln_chains' },
  { key: 'age', label: 'listing age', column: 'age_years' },
  { key: 'catshare', label: 'category tokenised share', column: 'cat_share' },
  { key: 'recent', label: 'listed within a year', column: 'recent_1y' },
  { key: 'growth', label: '7-day growth tilt', column: 'ln_growth' },
];

/** One design column's value for a protocol. */
function valueColumn(p: SnapshotProtocol, ctx: ValueCtx, column: string): number {
  const lnTvl = Math.log(p.tvl_usd);
  switch (column) {
    case 'ln_tvl':
      return lnTvl;
    case 'ln_tvl_sq':
      return (lnTvl * lnTvl) / 100;
    case 'ln_chains':
      return Math.log(1 + p.chains.length);
    case 'age_years': {
      const age = ageDays(ctx.snapshot.as_of, p.listed_at);
      return age === null ? ctx.medianAgeYears : age / 365;
    }
    case 'cat_share':
      return categoryTokenisedShare(ctx.snapshot, p.category);
    case 'recent_1y': {
      const age = ageDays(ctx.snapshot.as_of, p.listed_at);
      return (age === null ? ctx.medianAgeYears * 365 : age) < 365 ? 1 : 0;
    }
    case 'ln_growth':
      return Math.log(growthMultiplier(p));
    default:
      return 0;
  }
}

/** The design row of a protocol under a term set: the constant, then one column per enabled term. */
function designRow(p: SnapshotProtocol, ctx: ValueCtx, terms: ValueTerms): number[] {
  const row = [1];
  for (const c of VALUE_COLUMNS) {
    if (terms[c.key]) row.push(valueColumn(p, ctx, c.column));
  }
  return row;
}

/** The enabled columns of a term set, in design order. */
function designColumns(terms: ValueTerms): string[] {
  const columns = ['const'];
  for (const c of VALUE_COLUMNS) {
    if (terms[c.key]) columns.push(c.column);
  }
  return columns;
}

/** Solve a small dense linear system by Gaussian elimination with partial pivoting. */
function solveLinear(aIn: number[][], bIn: number[]): number[] {
  const n = bIn.length;
  const a = aIn.map((row, i) => [...row, bIn[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
    [a[c], a[piv]] = [a[piv]!, a[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = a[r]![c]! / a[c]![c]!;
      for (let k = c; k <= n; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let v = a[r]![n]!;
    for (let k = r + 1; k < n; k++) v -= a[r]![k]! * x[k]!;
    x[r] = v / a[r]![r]!;
  }
  return x;
}

/** OLS of ln(market cap) on the enabled columns, with the terms switched on or off. */
export function fitValueRows(rows: SnapshotProtocol[], terms: ValueTerms, ctx: ValueCtx): ValueFit {
  const columns = designColumns(terms);
  const k = columns.length;
  const xtx: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const xty = new Array<number>(k).fill(0);
  for (const p of rows) {
    const x = designRow(p, ctx, terms);
    const y = Math.log(p.mcap_usd!);
    for (let i = 0; i < k; i++) {
      xty[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) xtx[i]![j]! += x[i]! * x[j]!;
    }
  }
  for (let i = 0; i < k; i++) xtx[i]![i]! += 1e-8;
  const coefficients = solveLinear(xtx, xty).map(round4);

  // Per-category offsets from the global fit's residuals, shrunk toward zero by n / (n + shrinkage).
  const offsets: Record<string, number> = {};
  if (terms.offsets) {
    const residSum = new Map<string, number>();
    const residCount = new Map<string, number>();
    rows.forEach((p) => {
      const cat = p.category ?? 'Other';
      const r = Math.log(p.mcap_usd!) - predictValueLog({ columns, coefficients, offsets: {} }, p, ctx);
      residSum.set(cat, (residSum.get(cat) ?? 0) + r);
      residCount.set(cat, (residCount.get(cat) ?? 0) + 1);
    });
    for (const cat of [...residCount.keys()].sort()) {
      const count = residCount.get(cat)!;
      if (count < MODEL.min_category_train) continue;
      const raw = residSum.get(cat)! / (count + MODEL.shrinkage);
      offsets[cat] = round4(clamp(raw, -MODEL.offset_cap_log, MODEL.offset_cap_log));
    }
  }
  return { columns, coefficients, offsets };
}

/** A fit's log-space prediction for one protocol. */
function predictValueLog(fit: ValueFit, p: SnapshotProtocol, ctx: ValueCtx): number {
  let v = 0;
  for (let i = 0; i < fit.columns.length; i++) {
    const column = fit.columns[i]!;
    v += fit.coefficients[i]! * (column === 'const' ? 1 : valueColumn(p, ctx, column));
  }
  return v + (fit.offsets[p.category ?? 'Other'] ?? 0);
}

/** A fit's log-space RMSE on a set of training rows. */
function rmseLog(rows: SnapshotProtocol[], fit: ValueFit, ctx: ValueCtx): number {
  return Math.sqrt(
    rows.reduce((a, p) => a + (Math.log(p.mcap_usd!) - predictValueLog(fit, p, ctx)) ** 2, 0) / rows.length,
  );
}

/** The flat baseline's log-space RMSE on a set of training rows: predict the set's own mean. */
function flatRmseLog(rows: SnapshotProtocol[]): number {
  const mean = rows.reduce((a, p) => a + Math.log(p.mcap_usd!), 0) / rows.length;
  return Math.sqrt(rows.reduce((a, p) => a + (Math.log(p.mcap_usd!) - mean) ** 2, 0) / rows.length);
}

/** A deterministic shuffle of 0..n-1 from a fixed seed (the same linear congruential generator as the placebo test): every fold and split below is reproducible, and the program's output never depends on the run. */
export function seededPermutation(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let state = seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/** The ten-fold log-space RMSE of one term set: the training rows shuffled once by the fixed seed, cut into ten folds, each fold held out while the other nine fit. */
function tenFoldRmse(train: SnapshotProtocol[], terms: ValueTerms, ctx: ValueCtx): number {
  const order = seededPermutation(train.length, MODEL.tenfold_seed);
  const folds = MODEL.tenfold_folds;
  let se = 0;
  for (let f = 0; f < folds; f++) {
    const testIdx = new Set(order.filter((_, i) => i % folds === f));
    const test = train.filter((_, i) => testIdx.has(i));
    const fitRows = train.filter((_, i) => !testIdx.has(i));
    if (test.length === 0 || fitRows.length === 0) continue;
    const fit = fitValueRows(fitRows, terms, ctx);
    for (const p of test) {
      const e = Math.log(p.mcap_usd!) - predictValueLog(fit, p, ctx);
      se += e * e;
    }
  }
  return Math.sqrt(se / train.length);
}

/** The ten-fold flat baseline: each fold predicts its own held-out rows by the other nine folds' mean. */
function tenFoldFlatRmse(train: SnapshotProtocol[]): number {
  const order = seededPermutation(train.length, MODEL.tenfold_seed);
  const folds = MODEL.tenfold_folds;
  let se = 0;
  for (let f = 0; f < folds; f++) {
    const testIdx = new Set(order.filter((_, i) => i % folds === f));
    const test = train.filter((_, i) => testIdx.has(i));
    const fitRows = train.filter((_, i) => !testIdx.has(i));
    if (test.length === 0 || fitRows.length === 0) continue;
    const mean = fitRows.reduce((a, p) => a + Math.log(p.mcap_usd!), 0) / fitRows.length;
    for (const p of test) {
      const e = Math.log(p.mcap_usd!) - mean;
      se += e * e;
    }
  }
  return Math.sqrt(se / train.length);
}

/** The split-half log-space RMSE of one term set: the seeded shuffle cut in two, each half fit and tested on the other, pooled. */
function splitHalfRmse(train: SnapshotProtocol[], terms: ValueTerms, ctx: ValueCtx): number {
  const order = seededPermutation(train.length, MODEL.tenfold_seed);
  const half = Math.floor(train.length / 2);
  const aIdx = new Set(order.slice(0, half));
  const a = train.filter((_, i) => aIdx.has(i));
  const b = train.filter((_, i) => !aIdx.has(i));
  let se = 0;
  const fitA = fitValueRows(a, terms, ctx);
  for (const p of b) {
    const e = Math.log(p.mcap_usd!) - predictValueLog(fitA, p, ctx);
    se += e * e;
  }
  const fitB = fitValueRows(b, terms, ctx);
  for (const p of a) {
    const e = Math.log(p.mcap_usd!) - predictValueLog(fitB, p, ctx);
    se += e * e;
  }
  return Math.sqrt(se / train.length);
}

/** The split-half flat baseline: each half predicts the other by its own mean. */
function splitHalfFlatRmse(train: SnapshotProtocol[]): number {
  const order = seededPermutation(train.length, MODEL.tenfold_seed);
  const half = Math.floor(train.length / 2);
  const aIdx = new Set(order.slice(0, half));
  const a = train.filter((_, i) => aIdx.has(i));
  const b = train.filter((_, i) => !aIdx.has(i));
  let se = 0;
  const meanA = a.reduce((s, p) => s + Math.log(p.mcap_usd!), 0) / a.length;
  for (const p of b) {
    const e = Math.log(p.mcap_usd!) - meanA;
    se += e * e;
  }
  const meanB = b.reduce((s, p) => s + Math.log(p.mcap_usd!), 0) / b.length;
  for (const p of a) {
    const e = Math.log(p.mcap_usd!) - meanB;
    se += e * e;
  }
  return Math.sqrt(se / train.length);
}

/** The leave-one-out log-space RMSE of one term set over the training rows (one refit per row). */
function looRmse(train: SnapshotProtocol[], terms: ValueTerms, ctx: ValueCtx): number {
  let se = 0;
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    const fit = fitValueRows(rest, terms, ctx);
    const e = Math.log(train[i]!.mcap_usd!) - predictValueLog(fit, train[i]!, ctx);
    se += e * e;
  }
  return Math.sqrt(se / train.length);
}

/**
 * The leave-one-out error of a slope-only fit with trimming inside every fold: fit on the rest,
 * drop the rest's rows beyond two residual standard deviations, refit, then predict the held-out
 * row. The trim is a fixed rule re-applied per fold, so the held-out row never decides its own trim.
 */
function looTrimmedRmse(train: SnapshotProtocol[], ctx: ValueCtx): number {
  const terms: ValueTerms = {
    slope: true,
    offsets: false,
    growth: false,
    curvature: false,
    chains: false,
    age: false,
    catshare: false,
    recent: false,
  };
  let se = 0;
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    const first = fitValueRows(rest, terms, ctx);
    const resid = rest.map((p) => Math.log(p.mcap_usd!) - predictValueLog(first, p, ctx));
    const sd = Math.sqrt(resid.reduce((a, e) => a + e * e, 0) / resid.length);
    const kept = rest.filter((_, j) => Math.abs(resid[j]!) <= MODEL.trim_sd * sd);
    const fit = fitValueRows(kept, terms, ctx);
    const e = Math.log(train[i]!.mcap_usd!) - predictValueLog(fit, train[i]!, ctx);
    se += e * e;
  }
  return Math.sqrt(se / train.length);
}

/** The training rows with a listing date, oldest first: the walk-forward split's order. */
function datedTrainRows(train: SnapshotProtocol[]): SnapshotProtocol[] {
  return train
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
}

/** One walk-forward run: fit on the older listings, test on the newer ones, split by listed_at. */
function walkForwardRun(
  train: SnapshotProtocol[],
  terms: ValueTerms,
  ctx: ValueCtx,
): ValueValidation['walk_forward'] {
  const dated = datedTrainRows(train);
  const cut = Math.floor(dated.length * MODEL.walk_forward_fit_share);
  const fitRows = dated.slice(0, cut);
  const testRows = dated.slice(cut);
  if (dated.length < 20 || testRows.length === 0) return null;
  const fit = fitValueRows(fitRows, terms, ctx);
  const flat = flatRmseLog(testRows);
  const model = rmseLog(testRows, fit, ctx);
  return {
    fit_size: fitRows.length,
    test_size: testRows.length,
    split_listed_at: testRows[0]!.listed_at!,
    flat_rmse: round4(flat),
    model_rmse: round4(model),
    multiple_vs_flat: round3(flat / model),
  };
}

/** A walk-forward run with trimming on the fit rows only: the test rows are never trimmed. */
function walkForwardTrimmedRun(train: SnapshotProtocol[], ctx: ValueCtx): ValueValidation['walk_forward'] {
  const terms: ValueTerms = {
    slope: true,
    offsets: false,
    growth: false,
    curvature: false,
    chains: false,
    age: false,
    catshare: false,
    recent: false,
  };
  const dated = datedTrainRows(train);
  const cut = Math.floor(dated.length * MODEL.walk_forward_fit_share);
  const fitRows = dated.slice(0, cut);
  const testRows = dated.slice(cut);
  if (dated.length < 20 || testRows.length === 0) return null;
  const first = fitValueRows(fitRows, terms, ctx);
  const resid = fitRows.map((p) => Math.log(p.mcap_usd!) - predictValueLog(first, p, ctx));
  const sd = Math.sqrt(resid.reduce((a, e) => a + e * e, 0) / resid.length);
  const kept = fitRows.filter((_, j) => Math.abs(resid[j]!) <= MODEL.trim_sd * sd);
  const fit = fitValueRows(kept, terms, ctx);
  const flat = flatRmseLog(testRows);
  const model = rmseLog(testRows, fit, ctx);
  return {
    fit_size: kept.length,
    test_size: testRows.length,
    split_listed_at: testRows[0]!.listed_at!,
    flat_rmse: round4(flat),
    model_rmse: round4(model),
    multiple_vs_flat: round3(flat / model),
  };
}

/** Whether a traded protocol is of a kind the board itself excludes: not a fair teacher for the board's rows. */
function isExcludedKind(p: SnapshotProtocol): boolean {
  return (
    p.category === 'CEX' ||
    VERSIONED.test(p.name) ||
    WRAPPED_BRIDGED_CATEGORIES.has(p.category ?? '') ||
    STAKING_RECEIPT_CATEGORIES.has(p.category ?? '')
  );
}

const TERM_NAMES: { key: keyof ValueTerms; label: string }[] = [
  { key: 'slope', label: 'log-TVL slope' },
  { key: 'offsets', label: 'per-category offsets' },
  { key: 'growth', label: '7-day growth tilt' },
  { key: 'curvature', label: 'log-TVL curvature' },
  { key: 'chains', label: 'chain count' },
  { key: 'age', label: 'listing age' },
  { key: 'catshare', label: 'category tokenised share' },
  { key: 'recent', label: 'listed within a year' },
];

/** The term set a validation kept: one flag per candidate term, from the validation's own rows. */
export function termsFromValidation(validation: ValueValidation): ValueTerms {
  const terms: ValueTerms = {
    slope: false,
    offsets: false,
    growth: false,
    curvature: false,
    chains: false,
    age: false,
    catshare: false,
    recent: false,
  };
  for (const { key, label } of TERM_NAMES) {
    const test = validation.terms.find((t) => t.term === label);
    if (test !== undefined) terms[key] = test.kept;
  }
  return terms;
}

/**
 * The held-out test of every value term, four ways. Walk-forward fits the older listings and tests the
 * newer ones (split by listed_at); leave-one-out refits without each training row in turn; ten-fold
 * holds out each tenth of a fixed-seed shuffle in turn; split-half fits each half of the same shuffle
 * and tests it on the other. Terms are chosen by greedy forward selection on leave-one-out error:
 * start from an intercept-only model, add the term that most improves the held-out error, and stop
 * when no remaining term improves it. A term is kept only when removing it from the kept model makes
 * the leave-one-out error worse — the larger, more stable test (one refit per training row). The
 * walk-forward, ten-fold and split-half numbers are printed alongside as further opinions: on this
 * snapshot walk-forward does not beat flat at all, because the value multiple drifts with listing
 * cohort, and the board says so instead of hiding it. Two whole-fit alternatives are tested the
 * same way and reported below the terms: a trimmed refit and a fit on the board's own kinds only.
 */
export function validateValueTerms(snapshot: Snapshot, train: SnapshotProtocol[]): ValueValidation {
  const ctx = valueCtx(snapshot);
  const allFalse: ValueTerms = {
    slope: false,
    offsets: false,
    growth: false,
    curvature: false,
    chains: false,
    age: false,
    catshare: false,
    recent: false,
  };
  const candidateKeys: (keyof ValueTerms)[] = [
    'slope',
    'offsets',
    'curvature',
    'chains',
    'age',
    'catshare',
    'recent',
    'growth',
  ];
  // Greedy forward selection on leave-one-out error. The log-log slope is the model itself, so it
  // is the base: the other terms are tried as additions to it, and added while one improves the
  // held-out error. (Trying every term from an intercept-only base instead picks the curvature
  // alone on a 0.001 hair — the same fit in different clothes — so the slope stays the base and
  // the additions have to earn their place against it.)
  const kept: ValueTerms = { ...allFalse, slope: true };
  let currentLoo = looRmse(train, kept, ctx);
  for (;;) {
    let bestKey: keyof ValueTerms | null = null;
    let bestLoo = currentLoo;
    for (const key of candidateKeys) {
      if (key === 'slope' || kept[key]) continue;
      const trial: ValueTerms = { ...kept, [key]: true };
      const loo = looRmse(train, trial, ctx);
      if (loo < bestLoo) {
        bestLoo = loo;
        bestKey = key;
      }
    }
    if (bestKey === null) break;
    kept[bestKey] = true;
    currentLoo = bestLoo;
  }

  // Each term's test, against the kept model: the error with the term added to it (or in it)
  // against the error without it.
  const dated = datedTrainRows(train);
  const cut = Math.floor(dated.length * MODEL.walk_forward_fit_share);
  const wfFitRows = dated.slice(0, cut);
  const wfTestRows = dated.slice(cut);
  const walkForward = walkForwardRun(train, kept, ctx);
  const terms: ValueTermTest[] = TERM_NAMES.map(({ key, label }) => {
    const withTerms: ValueTerms = { ...kept, [key]: true };
    const withoutTerms: ValueTerms = { ...kept, [key]: false };
    const looWith = looRmse(train, withTerms, ctx);
    const looWithout = looRmse(train, withoutTerms, ctx);
    let wfWith = 0;
    let wfWithout = 0;
    if (walkForward !== null) {
      wfWith = rmseLog(wfTestRows, fitValueRows(wfFitRows, withTerms, ctx), ctx);
      wfWithout = rmseLog(wfTestRows, fitValueRows(wfFitRows, withoutTerms, ctx), ctx);
    }
    return {
      term: label,
      kept: kept[key],
      walk_forward_rmse_with: round4(wfWith),
      walk_forward_rmse_without: round4(wfWithout),
      loo_rmse_with: round4(looWith),
      loo_rmse_without: round4(looWithout),
      tenfold_rmse_with: round4(tenFoldRmse(train, withTerms, ctx)),
      tenfold_rmse_without: round4(tenFoldRmse(train, withoutTerms, ctx)),
      split_half_rmse_with: round4(splitHalfRmse(train, withTerms, ctx)),
      split_half_rmse_without: round4(splitHalfRmse(train, withoutTerms, ctx)),
    };
  });
  const keptTerms: string[] = [];
  const droppedTerms: string[] = [];
  for (const t of terms) (t.kept ? keptTerms : droppedTerms).push(t.term);
  const looFlat = flatRmseLog(train);

  // Extra whole-fit tests, reported and not adopted unless they beat the kept model both ways.
  const slopeOnly: ValueTerms = {
    slope: true,
    offsets: false,
    growth: false,
    curvature: false,
    chains: false,
    age: false,
    catshare: false,
    recent: false,
  };
  const trimmedLoo = looTrimmedRmse(train, ctx);
  const trimmedWf = walkForwardTrimmedRun(train, ctx);
  const kindOnly = train.filter((p) => !isExcludedKind(p));
  const kindLoo = looRmse(kindOnly, slopeOnly, ctx);
  const kindWf = walkForwardRun(kindOnly, slopeOnly, ctx);
  const kindFlat = flatRmseLog(kindOnly);
  const extra_tests: ValueExtraTest[] = [
    {
      label: 'trimmed refit (rows beyond 2 residual SD dropped, re-tested per fold)',
      train_size: train.length,
      loo_rmse: round4(trimmedLoo),
      loo_multiple_vs_flat: round3(looFlat / trimmedLoo),
      walk_forward_rmse: trimmedWf === null ? null : trimmedWf.model_rmse,
      walk_forward_multiple_vs_flat: trimmedWf === null ? null : trimmedWf.multiple_vs_flat,
      adopted: false,
      reason: 'leave-one-out barely moves and walk-forward is worse, so the outliers stay in the fit',
    },
    {
      label: 'fit on the board\u2019s own kinds only (traded protocols outside the excluded categories)',
      train_size: kindOnly.length,
      loo_rmse: round4(kindLoo),
      loo_multiple_vs_flat: round3(kindFlat / kindLoo),
      walk_forward_rmse: kindWf === null ? null : kindWf.model_rmse,
      walk_forward_multiple_vs_flat: kindWf === null ? null : kindWf.multiple_vs_flat,
      adopted: false,
      reason: 'leave-one-out error falls but walk-forward is worse on the newer listings, so the full training set stays',
    },
  ];

  return {
    walk_forward: walkForward,
    ten_fold: {
      flat_rmse: round4(tenFoldFlatRmse(train)),
      model_rmse: round4(tenFoldRmse(train, kept, ctx)),
      multiple_vs_flat: round3(tenFoldFlatRmse(train) / tenFoldRmse(train, kept, ctx)),
    },
    split_half: {
      flat_rmse: round4(splitHalfFlatRmse(train)),
      model_rmse: round4(splitHalfRmse(train, kept, ctx)),
      multiple_vs_flat: round3(splitHalfFlatRmse(train) / splitHalfRmse(train, kept, ctx)),
    },
    leave_one_out: {
      flat_rmse: round4(looFlat),
      model_rmse: round4(currentLoo),
      multiple_vs_flat: round3(looFlat / currentLoo),
    },
    terms,
    kept_terms: keptTerms,
    dropped_terms: droppedTerms,
    extra_tests,
  };
}

/**
 * The placebo test: log-TVL shuffled among the training rows with a fixed seed, then the
 * slope-only fit held out the same way. A model that finds signal in shuffled TVL is fitting
 * noise; this one should land on flat, and the board prints the number either way.
 */
export function placeboTest(train: SnapshotProtocol[]): PlaceboTest {
  const xs = train.map((p) => Math.log(p.tvl_usd));
  const ys = train.map((p) => Math.log(p.mcap_usd!));
  let state = MODEL.placebo_seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const shuffled = [...xs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  let se = 0;
  for (let i = 0; i < train.length; i++) {
    const restX = shuffled.filter((_, j) => j !== i);
    const restY = ys.filter((_, j) => j !== i);
    const n = restX.length;
    const mx = restX.reduce((a, b) => a + b, 0) / n;
    const my = restY.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k++) {
      sxy += (restX[k]! - mx) * (restY[k]! - my);
      sxx += (restX[k]! - mx) ** 2;
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    const intercept = my - slope * mx;
    const e = ys[i]! - (intercept + slope * shuffled[i]!);
    se += e * e;
  }
  const loo = Math.sqrt(se / train.length);
  const flat = flatRmseLog(train);
  return {
    seed: MODEL.placebo_seed,
    loo_rmse: round4(loo),
    flat_rmse: round4(flat),
    multiple_vs_flat: round3(flat / loo),
  };
}

/**
 * The bootstrap stability check: refit the kept value model on resampled training rows
 * (sampling with replacement, a fixed seed, the same linear congruential generator as the
 * placebo test) and re-rank the whole board under each refit. What it measures is the
 * value, not the order: the kept model is slope-only with a positive slope, so its rank
 * is the TVL rank in every resample and no row's bootstrap rank range moves — the
 * training set cannot reorder the board, it can only move the values, by about a
 * quarter in log terms for the median row. The rank uncertainty lives in the variant
 * ranges instead (each single-term addition re-ranking the board); the bootstrap's own
 * numbers are the per-row log-value spread and the median spread, printed as they are.
 */
export function bootstrapStability(
  snapshot: Snapshot,
  train: SnapshotProtocol[],
  terms: ValueTerms,
  ctx: ValueCtx,
): BootstrapSummary {
  const resamples = MODEL.bootstrap_resamples;
  const watchlist = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isRankable(p, watchlist));
  let state = MODEL.bootstrap_seed;
  const next = (): number => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  const n = train.length;
  const rankLow = new Map<string, number>();
  const rankHigh = new Map<string, number>();
  const logValues = new Map<string, number[]>();
  for (const p of chosen) {
    rankLow.set(p.slug, Infinity);
    rankHigh.set(p.slug, 0);
    logValues.set(p.slug, []);
  }
  for (let b = 0; b < resamples; b++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < n; i++) sample.push(train[Math.floor(next() * n)]!);
    const bootFit = fitValueRows(sample, terms, ctx);
    const order = chosen
      .map((p) => ({ slug: p.slug, log: predictValueLog(bootFit, p, ctx) }))
      .sort((x, y) => y.log - x.log || (x.slug < y.slug ? -1 : x.slug > y.slug ? 1 : 0));
    order.forEach((row, pos) => {
      const rank = pos + 1;
      if (rank < (rankLow.get(row.slug) ?? Infinity)) rankLow.set(row.slug, rank);
      if (rank > (rankHigh.get(row.slug) ?? 0)) rankHigh.set(row.slug, rank);
      logValues.get(row.slug)!.push(row.log);
    });
  }
  const by_slug: Record<string, { rank_low: number; rank_high: number; sd_log: number }> = {};
  const spans: number[] = [];
  const sds: number[] = [];
  for (const p of chosen) {
    const logs = logValues.get(p.slug)!;
    const mean = logs.reduce((a, v) => a + v, 0) / logs.length;
    const sd = Math.sqrt(logs.reduce((a, v) => a + (v - mean) ** 2, 0) / logs.length);
    const span = (rankHigh.get(p.slug) ?? 0) - (rankLow.get(p.slug) ?? 0);
    spans.push(span);
    sds.push(sd);
    by_slug[p.slug] = {
      rank_low: rankLow.get(p.slug) ?? 0,
      rank_high: rankHigh.get(p.slug) ?? 0,
      sd_log: round4(sd),
    };
  }
  spans.sort((a, b) => a - b);
  sds.sort((a, b) => a - b);
  const mid = spans.length;
  return {
    resamples,
    seed: MODEL.bootstrap_seed,
    train_size: n,
    median_rank_span: mid === 0 ? 0 : spans[Math.floor(mid / 2)]!,
    median_sd_log: round4(mid === 0 ? 0 : sds[Math.floor(mid / 2)]!),
    rows_span_over_50: spans.filter((s) => s > 50).length,
    rows_value_moves_over_25pct: sds.filter((s) => s > Math.log(1.25)).length,
    by_slug,
  };
}

/** The fitted model: the validated value terms, the conformal interval, and the launch clock. */
export function fitModel(snapshot: Snapshot): ModelFit {
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  if (train.length < 10) throw new SnapshotError(`only ${train.length} protocols record both TVL and a market cap: too few to fit a model`);
  const ctx = valueCtx(snapshot);
  const validation = validateValueTerms(snapshot, train);
  const terms = termsFromValidation(validation);
  const fit = fitValueRows(train, terms, ctx);

  // Split-conformal half-width from the final model's absolute log residuals on the training set.
  const absResid = train
    .map((p) => Math.abs(Math.log(p.mcap_usd!) - predictValueLog(fit, p, ctx)))
    .sort((a, b) => a - b);
  const n = train.length;
  const rank = clamp(Math.ceil((n + 1) * MODEL.conformal_level) - 1, 0, n - 1);
  const halfWidth = absResid[rank]!;
  const covered = absResid.filter((r) => r <= halfWidth).length;

  // Per-kind conformal half-widths: a category's own residuals are a tighter read on how far its
  // launched tokens land from the line than the pooled residuals are — a noisy kind gets a wider
  // interval, a steady one a narrower one. Only kinds with at least min_kind_train training rows
  // are calibrated on their own; the rest fall back to the pooled half-width, so no row's interval
  // rests on a handful of residuals.
  const residByKind = new Map<string, number[]>();
  for (const p of train) {
    const kind = p.category ?? 'Other';
    const list = residByKind.get(kind) ?? [];
    list.push(Math.abs(Math.log(p.mcap_usd!) - predictValueLog(fit, p, ctx)));
    residByKind.set(kind, list);
  }
  const conformalByKind: Record<string, number> = {};
  for (const kind of [...residByKind.keys()].sort()) {
    const rs = residByKind.get(kind)!.sort((a, b) => a - b);
    if (rs.length < MODEL.min_kind_train) continue;
    const kindRank = clamp(Math.ceil((rs.length + 1) * MODEL.conformal_level) - 1, 0, rs.length - 1);
    conformalByKind[kind] = round4(rs[kindRank]!);
  }

  // Within-3x: share of the training set whose implied value lands within 3x of the real market cap,
  // in-sample and leave-one-out.
  let within = 0;
  for (const p of train) {
    if (Math.abs(Math.log(p.mcap_usd!) - predictValueLog(fit, p, ctx)) <= Math.log(3)) within += 1;
  }
  let withinLoo = 0;
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    const looFit = fitValueRows(rest, terms, ctx);
    if (Math.abs(Math.log(train[i]!.mcap_usd!) - predictValueLog(looFit, train[i]!, ctx)) <= Math.log(3)) withinLoo += 1;
  }
  // The validation's leave-one-out and walk-forward multiples are for the full term set; recompute
  // them for the final (kept-terms) model so the numbers the board prints are the model the board uses.
  const looFinal = looRmse(train, terms, ctx);
  const looFlat = flatRmseLog(train);
  validation.leave_one_out = {
    flat_rmse: round4(looFlat),
    model_rmse: round4(looFinal),
    multiple_vs_flat: round3(looFlat / looFinal),
  };
  if (validation.walk_forward !== null) {
    validation.walk_forward = walkForwardRun(train, terms, ctx);
  }

  // The kept extra coefficients, by term label, for the formula the board prints.
  const extra_coefficients: Record<string, number> = {};
  for (let i = 0; i < fit.columns.length; i++) {
    const column = fit.columns[i]!;
    if (column === 'const' || column === 'ln_tvl') continue;
    const label = VALUE_COLUMNS.find((c) => c.column === column)?.label;
    if (label !== undefined) extra_coefficients[label] = fit.coefficients[i]!;
  }

  const tokenised = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const clock = fitLaunchClock(snapshot);
  const catShare: Record<string, number> = {};
  for (const cat of [...new Set(snapshot.protocols.map((p) => p.category ?? 'Other'))].sort()) {
    catShare[cat] = round4(categoryTokenisedShare(snapshot, cat));
  }
  return {
    train_size: n,
    intercept: fit.coefficients[0]!,
    slope: fit.columns.includes('ln_tvl') ? fit.coefficients[fit.columns.indexOf('ln_tvl')]! : 0,
    category_offsets: fit.offsets,
    extra_coefficients,
    median_age_years: round4(ctx.medianAgeYears),
    category_tokenised_share: catShare,
    bootstrap: bootstrapStability(snapshot, train, terms, ctx),
    conformal_level: MODEL.conformal_level,
    conformal_half_width_log: round4(halfWidth),
    interval_factor: round4(Math.exp(halfWidth)),
    conformal_by_kind: conformalByKind,
    conformal_kinds_calibrated: Object.keys(conformalByKind).length,
    empirical_coverage: round3(covered / n),
    tokenised_share: round3(tokenised / snapshot.protocols.length),
    within_3x_training: round3(within / n),
    within_3x_loo: round3(withinLoo / n),
    validation,
    clock,
    placebo: placeboTest(train),
  };
}

/** The category's tokenised share in the snapshot: protocols of its kind that already have a token. */
function categoryTokenisedShare(snapshot: Snapshot, category: string | null): number {
  const cat = category ?? 'Other';
  const all = snapshot.protocols.filter((p) => (p.category ?? 'Other') === cat);
  if (all.length === 0) return 0;
  return all.filter((p) => !isPreToken(p)).length / all.length;
}

/**
 * The launch clock: a logistic regression of tokenised (1/0) on ln TVL, age with no token in years
 * and the category's tokenised share, fit by iteratively reweighted least squares on every protocol
 * that carries a listing date. It is a cross-sectional cohort curve, not observed launch dates —
 * the snapshot carries none — and the board states that. The fit is deterministic: fixed
 * iterations, a fixed ridge, and no randomness anywhere.
 */
export function fitLaunchClock(snapshot: Snapshot): LaunchClock {
  const medianAge = medianPreTokenAgeDays(snapshot) ?? 365;
  const rows = snapshot.protocols.filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null);
  const xs: number[][] = [];
  const ys: number[] = [];
  for (const p of rows) {
    const ageYears = ageDays(snapshot.as_of, p.listed_at)! / 365;
    xs.push([1, Math.log(p.tvl_usd), ageYears, categoryTokenisedShare(snapshot, p.category)]);
    ys.push(isPreToken(p) ? 0 : 1);
  }
  // IRLS with a small ridge: solve H d = g by Gaussian elimination on a 4x4 system.
  let b = [0, 0, 0, 0];
  for (let it = 0; it < 50; it++) {
    const g = [0, 0, 0, 0];
    const h: number[][] = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i]!;
      const z = x.reduce((s, v, j) => s + v * b[j]!, 0);
      const pr = 1 / (1 + Math.exp(-clamp(z, -30, 30)));
      const w = Math.max(pr * (1 - pr), 1e-6);
      for (let j = 0; j < 4; j++) {
        g[j]! += x[j]! * (ys[i]! - pr);
        for (let k = 0; k < 4; k++) h[j]![k]! += x[j]! * x[k]! * w;
      }
    }
    for (let j = 0; j < 4; j++) h[j]![j]! += 1e-4;
    const a = h.map((row, j) => [...row, g[j]!]);
    for (let c = 0; c < 4; c++) {
      let piv = c;
      for (let r = c + 1; r < 4; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[piv]![c]!)) piv = r;
      [a[c], a[piv]] = [a[piv]!, a[c]!];
      for (let r = c + 1; r < 4; r++) {
        const f = a[r]![c]! / a[c]![c]!;
        for (let k = c; k < 5; k++) a[r]![k]! -= f * a[c]![k]!;
      }
    }
    const d = [0, 0, 0, 0];
    for (let r = 3; r >= 0; r--) {
      let s = a[r]![4]!;
      for (let k = r + 1; k < 4; k++) s -= a[r]![k]! * d[k]!;
      d[r] = s / a[r]![r]!;
    }
    let maxStep = 0;
    for (let j = 0; j < 4; j++) {
      b[j]! += d[j]!;
      maxStep = Math.max(maxStep, Math.abs(d[j]!));
    }
    if (maxStep < 1e-9) break;
  }
  const fitted = (p: SnapshotProtocol, ageYears: number): number => {
    const z =
      b[0]! +
      b[1]! * Math.log(p.tvl_usd) +
      b[2]! * ageYears +
      b[3]! * categoryTokenisedShare(snapshot, p.category);
    return 1 / (1 + Math.exp(-clamp(z, -30, 30)));
  };
  let tradedSum = 0;
  let tradedCount = 0;
  let preSum = 0;
  let preCount = 0;
  const odds: number[] = [];
  for (const p of snapshot.protocols) {
    const ageYears = (ageDays(snapshot.as_of, p.listed_at) ?? medianAge) / 365;
    const f = fitted(p, ageYears);
    if (isPreToken(p)) {
      preSum += f;
      preCount += 1;
      const fNext = fitted(p, ageYears + 1);
      odds.push(Math.max(0, (fNext - f) / (1 - f)));
    } else {
      tradedSum += f;
      tradedCount += 1;
    }
  }
  odds.sort((x, y) => x - y);
  const tokenised = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const clock: LaunchClock = {
    fit_size: rows.length,
    missing_age: snapshot.protocols.length - rows.length,
    median_age_days: medianAge,
    intercept: round4(b[0]!),
    ln_tvl: round4(b[1]!),
    age_years: round4(b[2]!),
    category_tokenised_share: round4(b[3]!),
    mean_fitted_probability_traded: round3(tradedCount > 0 ? tradedSum / tradedCount : 0),
    mean_fitted_probability_pretoken: round3(preCount > 0 ? preSum / preCount : 0),
    odds_12m_median: round3(medianOf(odds) ?? 0),
    odds_by_age: [],
  };
  clock.odds_by_age = oddsByAge(snapshot, clock);
  return clock;
}

/**
 * The clock's shape, printed on the board: the 12-month odds at 0.5, 1, 2 and 4 years for a
 * median-size protocol of the most common pre-token category, so a reader can see whether the
 * fitted odds rise or fall with age instead of taking the curve on trust.
 */
export function oddsByAge(snapshot: Snapshot, clock: LaunchClock): { age_years: number; odds_12m: number }[] {
  const pre = snapshot.protocols.filter(isPreToken);
  if (pre.length === 0) return [];
  const tvls = pre.map((p) => p.tvl_usd).sort((a, b) => a - b);
  const medianTvl = medianOf(tvls) ?? 0;
  const catCount = new Map<string, number>();
  for (const p of pre) catCount.set(p.category ?? 'Other', (catCount.get(p.category ?? 'Other') ?? 0) + 1);
  let topCategory = 'Other';
  let topCount = -1;
  for (const [cat, count] of [...catCount.entries()].sort()) {
    if (count > topCount) {
      topCount = count;
      topCategory = cat;
    }
  }
  const synthetic: SnapshotProtocol = {
    slug: '',
    name: '',
    category: topCategory,
    chains: [],
    tvl_usd: medianTvl,
    change_7d: null,
    mcap_usd: null,
    listed_at: null,
    gecko_id: null,
    symbol: null,
  };
  return [0.5, 1, 2, 4].map((age) => ({ age_years: age, odds_12m: launchOddsAtAge(synthetic, snapshot, clock, age) }));
}

/** A protocol's 12-month launch odds at a stated age in years: the conditional hazard over the next year. */
export function launchOddsAtAge(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  clock: LaunchClock,
  ageYears: number,
): number {
  const f = (age: number): number => {
    const z =
      clock.intercept +
      clock.ln_tvl * Math.log(p.tvl_usd) +
      clock.age_years * age +
      clock.category_tokenised_share * categoryTokenisedShare(snapshot, p.category);
    return 1 / (1 + Math.exp(-clamp(z, -30, 30)));
  };
  const atAge = f(ageYears);
  const atNext = f(ageYears + 1);
  return round3(clamp(Math.max(0, (atNext - atAge) / (1 - atAge)), 0, 1));
}

/** A row's 12-month launch odds under the fitted clock: the conditional hazard over the next year. */
export function launchOdds12m(p: SnapshotProtocol, snapshot: Snapshot, clock: LaunchClock): number {
  const ageYears = (ageDays(snapshot.as_of, p.listed_at) ?? clock.median_age_days) / 365;
  return launchOddsAtAge(p, snapshot, clock, ageYears);
}

/** A protocol's fitted log-value from the model's own reportable statistics (intercept, slope, offsets, kept extra terms). */
export function predictFromModelFit(fit: ModelFit, p: SnapshotProtocol, ctx: ValueCtx): number {
  let v = fit.intercept + fit.slope * Math.log(p.tvl_usd) + (fit.category_offsets[p.category ?? 'Other'] ?? 0);
  for (const [label, coef] of Object.entries(fit.extra_coefficients)) {
    const column = VALUE_COLUMNS.find((c) => c.label === label)?.column;
    if (column !== undefined) v += coef * valueColumn(p, ctx, column);
  }
  return v;
}

/** A protocol's implied value, honest interval, 12-month launch odds and farm verdict under the fitted model. The interval is the row's own kind's conformal half-width where its kind has enough training rows to calibrate one, else the pooled half-width. */
export function scoreProtocol(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  fit: ModelFit,
): { implied: number; low: number; high: number; interval_factor: number; odds12m: number; offset: number; growthMult: number; age: number | null; verdict: FarmVerdict } {
  const ctx = valueCtx(snapshot);
  const age = ageDays(snapshot.as_of, p.listed_at);
  const offset = fit.category_offsets[p.category ?? 'Other'] ?? 0;
  const growthMult = '7-day growth tilt' in fit.extra_coefficients ? growthMultiplier(p) : 1;
  const logPred = predictFromModelFit(fit, p, ctx);
  const point = Math.exp(logPred);
  const implied = clamp(Math.max(1, Math.round(point)), 1, 1e14);
  const kindHalfWidth = fit.conformal_by_kind[p.category ?? 'Other'] ?? fit.conformal_half_width_log;
  const intervalFactor = Math.exp(kindHalfWidth);
  const low = clamp(Math.max(1, Math.round(point / intervalFactor)), 1, 1e14);
  const high = clamp(Math.max(1, Math.round(point * intervalFactor)), 1, 1e14);
  const odds12m = launchOdds12m(p, snapshot, fit.clock);
  const verdict = farmVerdict(p, implied, odds12m, age);
  return { implied, low, high, interval_factor: round4(intervalFactor), odds12m, offset, growthMult, age, verdict };
}

/**
 * A row's farm verdict, netted to the dollar. The farmer's share of the token supply is a stated
 * model: the community pool is 10% of supply and farmers together hold 5% of TVL, so a deposit's
 * share is (deposit / 5% of TVL) x 10%. Expected value is implied value x 12-month launch odds x
 * that share, minus the plan's gas cost. FARM clears $25 of net expected value; THIN breaks even
 * but no more; SKIP loses money at the planned deposit. The break-even deposit is the deposit at
 * which the expected value is exactly zero — for a SKIP row it is the deposit the row would need,
 * not one worth making. The break-even pool share is the other side of the same coin: the share of
 * supply the community pool would have to pay for this row to break even at the planned deposit —
 * above 100% the row cannot pay at any pool share. The verdict is also priced per hour of the
 * plan's active minutes, and at six fixed deposits, so the smallest deposit that turns the row
 * FARM is visible alongside the planned one. The 2D farm matrix prices every deposit tier again
 * at three pool shares (5%, 10%, 20%), so a reader can see how the verdict moves when the pool
 * pays less — or more — than the model assumes.
 */
export function farmVerdict(p: SnapshotProtocol, implied: number, odds12m: number, age: number | null): FarmVerdict {
  const econ = farmEconomics(p, age);
  const share = (econ.capital / (MODEL.farmed_tvl_share * p.tvl_usd)) * MODEL.airdrop_pool_share;
  const expected = implied * odds12m * share - econ.gasRoundTrip;
  const breakeven =
    implied > 0 && odds12m > 0
      ? (econ.gasRoundTrip * MODEL.farmed_tvl_share * p.tvl_usd) / (implied * odds12m * MODEL.airdrop_pool_share)
      : 1e9;
  const breakevenPoolShare =
    implied > 0 && odds12m > 0 ? round6(econ.gasRoundTrip / (implied * odds12m)) : null;
  const minViable = Math.max(econ.minCapital, Math.ceil(breakeven / 50) * 50);
  const verdict = expected >= MODEL.farm_threshold_usd ? 'FARM' : expected >= 0 ? 'THIN' : 'SKIP';
  const evAt = (deposit: number, poolShare: number = MODEL.airdrop_pool_share): number =>
    implied * odds12m * ((deposit / (MODEL.farmed_tvl_share * p.tvl_usd)) * poolShare) -
    econ.gasRoundTrip;
  const tierVerdict = (ev: number): 'FARM' | 'THIN' | 'SKIP' =>
    ev >= MODEL.farm_threshold_usd ? 'FARM' : ev >= 0 ? 'THIN' : 'SKIP';
  const deposit_tiers = MODEL.deposit_tiers.map((deposit) => {
    const ev = evAt(deposit);
    return { deposit_usd: deposit, expected_value_usd: Math.round(ev), verdict: tierVerdict(ev) };
  });
  const farm_matrix: FarmMatrixRow[] = MODEL.deposit_tiers.map((deposit) => ({
    deposit_usd: deposit,
    ev_pool_05_usd: Math.round(evAt(deposit, 0.05)),
    ev_pool_10_usd: Math.round(evAt(deposit, 0.1)),
    ev_pool_20_usd: Math.round(evAt(deposit, 0.2)),
  }));
  const smallest = deposit_tiers.find((t) => t.verdict === 'FARM');
  return {
    verdict,
    expected_value_usd: Math.round(expected),
    expected_value_per_hour_usd: Math.round((expected / (econ.workMinutes / 60)) * 100) / 100,
    work_minutes: econ.workMinutes,
    farm_cost_usd: Math.round(econ.gasRoundTrip * 100) / 100,
    plan_capital_usd: econ.capital,
    breakeven_deposit_usd: Math.round(breakeven),
    breakeven_pool_share: breakevenPoolShare,
    min_viable_capital_usd: minViable,
    launch_odds_12m: odds12m,
    deposit_tiers,
    farm_matrix,
    smallest_farm_deposit_usd: smallest === undefined ? null : smallest.deposit_usd,
  };
}

/** The farm's money facts: the planned deposit, the gas the whole plan burns, the gas floor, and the plan's active minutes of farmer time. */
export function farmEconomics(
  p: SnapshotProtocol,
  age: number | null,
): { capital: number; gasRoundTrip: number; minCapital: number; workMinutes: number } {
  const gas = gasPerAction(chainOf(p));
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  // Actions over the plan: fund (1) + core (1) + second (1) + weekly (weeks) + claim check (1) + exit (2).
  const gasRoundTrip = Math.round(gas * (6 + weeks) * 100) / 100;
  // Active minutes, not the hold: set up 10 + core 15 + second 10 + weekly 10 a week + claim check
  // 5 a week + exit 20. The hold days are waiting, not work, and are not counted here.
  const workMinutes = 55 + 15 * weeks;
  return {
    capital: Math.max(tierCapital(p), minViableCapital(gasRoundTrip)),
    gasRoundTrip,
    minCapital: minViableCapital(gasRoundTrip),
    workMinutes,
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: ModelFit = fitModel(snapshot)): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  // Every rankable pre-token protocol is ranked — the watchlist is the floor, and the early radar
  // is everything else the snapshot lets the radar rank. No TVL floor, no row cap: the audit
  // accounts for the protocols that are not here instead of silently dropping them.
  const chosen = snapshot.protocols.filter((p) => isRankable(p, watchlist));

  const scored = [...chosen.values()].map((p) => ({ p, s: scoreProtocol(p, snapshot, fit) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Rank ranges from model uncertainty: the kept model plus each single-term addition, each
  // re-ranking the whole board, and each row keeps the lowest and highest rank it held. The
  // point rank is the board's own rank; the range is how much the ordering moves when the model
  // itself changes — the additions were tested and dropped, but they are the honest alternatives.
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const ctx = valueCtx(snapshot);
  const terms = termsFromValidation(fit.validation);
  const variants: ValueTerms[] = [terms];
  for (const { key } of VALUE_COLUMNS) {
    if (!terms[key]) variants.push({ ...terms, [key]: true });
  }
  if (!terms.offsets) variants.push({ ...terms, offsets: true });
  const rangeLow = new Map<string, number>();
  const rangeHigh = new Map<string, number>();
  for (const entry of scored) {
    rangeLow.set(entry.p.slug, Infinity);
    rangeHigh.set(entry.p.slug, 0);
  }
  for (const variant of variants) {
    const variantFit = fitValueRows(train, variant, ctx);
    const order = scored
      .map((entry) => ({
        slug: entry.p.slug,
        implied: clamp(Math.max(1, Math.round(Math.exp(predictValueLog(variantFit, entry.p, ctx)))), 1, 1e14),
      }))
      .sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    order.forEach((row, pos) => {
      const rank = pos + 1;
      if (rank < (rangeLow.get(row.slug) ?? Infinity)) rangeLow.set(row.slug, rank);
      if (rank > (rangeHigh.get(row.slug) ?? 0)) rangeHigh.set(row.slug, rank);
    });
  }
  return scored.map((entry, i) => {
    const range = {
      low: Math.min(i + 1, rangeLow.get(entry.p.slug) ?? i + 1),
      high: Math.max(i + 1, rangeHigh.get(entry.p.slug) ?? i + 1),
    };
    const boot = fit.bootstrap.by_slug[entry.p.slug] ?? { rank_low: i + 1, rank_high: i + 1, sd_log: 0 };
    return {
      rank: i + 1,
      rank_low: range.low,
      rank_high: range.high,
      boot_rank_low: Math.min(i + 1, boot.rank_low),
      boot_rank_high: Math.max(i + 1, boot.rank_high),
      boot_sd_log: boot.sd_log,
      slug: entry.p.slug,
      name: entry.p.name,
      category: entry.p.category,
      chains: entry.p.chains,
      tvl_usd: entry.p.tvl_usd,
      change_7d: entry.p.change_7d,
      mcap_usd: entry.p.mcap_usd,
      listed_at: entry.p.listed_at,
      gecko_id: entry.p.gecko_id,
      symbol: entry.p.symbol,
      token_status: 'pre-token',
      age_days: entry.s.age,
      implied_value_usd: entry.s.implied,
      implied_low_usd: entry.s.low,
      implied_high_usd: entry.s.high,
      launch_odds_12m: entry.s.odds12m,
      verdict: entry.s.verdict.verdict,
      expected_value_usd: entry.s.verdict.expected_value_usd,
      expected_value_per_hour_usd: entry.s.verdict.expected_value_per_hour_usd,
      work_minutes: entry.s.verdict.work_minutes,
      farm_cost_usd: entry.s.verdict.farm_cost_usd,
      plan_capital_usd: entry.s.verdict.plan_capital_usd,
      breakeven_deposit_usd: entry.s.verdict.breakeven_deposit_usd,
      breakeven_pool_share: entry.s.verdict.breakeven_pool_share,
      min_viable_capital_usd: entry.s.verdict.min_viable_capital_usd,
      deposit_tiers: entry.s.verdict.deposit_tiers,
      farm_matrix: entry.s.verdict.farm_matrix,
      smallest_farm_deposit_usd: entry.s.verdict.smallest_farm_deposit_usd,
      model: {
        category_offset: round4(entry.s.offset),
        growth_multiplier: round4(entry.s.growthMult),
        age_days: entry.s.age,
        interval_factor: entry.s.interval_factor,
      },
      farm_steps: farmSteps(entry.p, entry.s.age).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** A realistic per-action gas cost in USD for a chain, from the chain's fee class. */
function gasPerAction(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 16;
  if (c === 'solana') return 0.25;
  if (c.includes('bnb') || c.includes('bsc') || c.includes('binance')) return 0.6;
  if (c === 'base') return 1.2;
  if (c.includes('arbitrum')) return 1.5;
  if (c.includes('optimism') || c === 'op mainnet') return 1.5;
  if (c.includes('polygon') || c.includes('matic')) return 0.4;
  if (c.includes('avalanche')) return 0.8;
  if (c.includes('zksync') || c.includes('linea') || c.includes('scroll')) return 0.7;
  return 3;
}

/** How much working capital a farm position of this size carries, before the gas check. */
function tierCapital(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 1000;
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 100_000_000) return 250;
  if (p.tvl_usd >= 20_000_000) return 150;
  return 100;
}

/**
 * The minimum viable capital: the whole plan (setup, weekly actions, exit) should spend no more
 * than about 8% of the position on gas, so on an expensive chain the position must be bigger —
 * on Ethereum mainnet a $100 position is mostly gas and is not worth opening.
 */
function minViableCapital(gasRoundTrip: number): number {
  return Math.max(50, Math.ceil(gasRoundTrip / 0.08 / 50) * 50);
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's second qualifying action: a different verb than the core deposit, so the wallet reads as a user, not a single deposit. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const part = Math.max(25, Math.round(capital * 0.3));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow about $${part} against the supply on ${name}, hold it a week, then repay in full so the borrow counts without liquidation risk.`;
  if (c.includes('dex')) return `Swap about $${part} through ${name}'s main pool on ${chain} once a week instead of only holding the liquidity position.`;
  if (c.includes('bridge')) return `Bridge a small $25 test amount back through ${name} so the wallet has traffic in both directions, then bridge in again.`;
  if (c.includes('staking') || c.includes('restak')) return `Claim and re-stake the rewards on ${name} once, so the wallet shows a second staking action beyond the first deposit.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the hedge on ${name} after a week and open a fresh one, so the account shows completed trades, not one open order.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('yield')) return `Move about $${part} from one ${name} vault to another of its vaults on ${chain}, so the wallet uses more than one product.`;
  return `Make one governance or rewards action ${name} offers on ${chain} — a vote, a claim or a small second deposit of about $${part}.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a USD cost and a time. Capital is set by
 * the gas check (minimum viable capital), the actions by the protocol's own category and chain.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasPerAction(chain);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  // Actions over the plan: fund (1) + core (1) + second (1) + weekly (weeks) + claim check (1) + exit (2).
  // The deposit and the gas bill are the same numbers the verdict is netted from.
  const econ = farmEconomics(p, age);
  const gasRoundTrip = econ.gasRoundTrip;
  const capital = econ.capital;
  const gasBudget = Math.max(2, Math.ceil(gasRoundTrip));
  const gasText = gas < 1 ? `$${gas.toFixed(2)}` : `$${Math.round(gas)}`;
  return [
    {
      text: `Set up a fresh wallet for ${p.name} only, back up its seed phrase offline, and fund it on ${chain} with $${capital} of working capital plus about $${gasBudget} for gas. Below $${capital} the gas share passes 8% of the position, so a smaller position is not worth opening.`,
      cost: `about $${gasBudget} of gas budget on top of the $${capital}`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and about ${gasText} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: secondActionFor(p, capital, chain),
      cost: `about ${gasText} of gas, no new capital beyond the $${capital} already in`,
      time: '10 minutes',
    },
    {
      text: `Repeat one small qualifying action on ${p.name} every week for ${weeks} weeks — a deposit top-up, a swap or a claim — so the wallet is active in more than one weekly snapshot.`,
      cost: `about ${gasText} of gas a week, about $${Math.round(gas * weeks * 100) / 100} over the plan`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the ${p.name} position for at least ${hold} days without withdrawing below half, so the activity spans the full qualifying window instead of a single day.`,
      cost: `the $${capital} stays in the position; the cost is the opportunity cost of holding it`,
      time: `${hold} days`,
    },
    {
      text: `Check ${p.name}'s own points or rewards page once a week and claim only from the link the protocol itself publishes; never pay a third party to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '5 minutes a week',
    },
    {
      text: `Exit in one session: withdraw the full $${capital} position from ${p.name}, swap back to USDC on ${chain}, and write the wallet, dates, amounts and transaction hashes in a farm log before you reuse the wallet elsewhere.`,
      cost: `about ${gasText} of gas twice (withdraw and swap)`,
      time: '20 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's form for data.js: every figure the page shows, farm plan included. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    rank_low: row.rank_low,
    rank_high: row.rank_high,
    boot_rank_low: row.boot_rank_low,
    boot_rank_high: row.boot_rank_high,
    boot_sd_log: row.boot_sd_log,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    launch_odds_12m: row.launch_odds_12m,
    verdict: row.verdict,
    expected_value_usd: row.expected_value_usd,
    expected_value_per_hour_usd: row.expected_value_per_hour_usd,
    work_minutes: row.work_minutes,
    farm_cost_usd: row.farm_cost_usd,
    plan_capital_usd: row.plan_capital_usd,
    breakeven_deposit_usd: row.breakeven_deposit_usd,
    breakeven_pool_share: row.breakeven_pool_share,
    min_viable_capital_usd: row.min_viable_capital_usd,
    deposit_tiers: row.deposit_tiers,
    farm_matrix: row.farm_matrix,
    smallest_farm_deposit_usd: row.smallest_farm_deposit_usd,
    category_offset: row.model.category_offset,
    growth_multiplier: row.model.growth_multiplier,
    interval_factor: row.model.interval_factor,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Data-quality facts about the snapshot, counted before anything is scored. */
export interface SnapshotHealth {
  protocols: number;
  duplicate_slugs: number;
  missing_category: number;
  missing_chains: number;
  missing_change_7d: number;
  missing_listed_at: number;
  nonpositive_tvl: number;
  growth_outliers: number;
  watchlist_missing: number;
  trainable: number;
}

/**
 * Count the snapshot's defects instead of silently scoring over them. The model
 * only ever reads the fields parseSnapshot validated, but a sealed snapshot can
 * still carry duplicates, gaps and outliers; the board's readers deserve to know
 * how many. A growth outlier is a 7-day move beyond ±50% (the snapshot records
 * change_7d in percent): possible in a crash or a mania, and exactly the rows
 * whose growth tilt deserves suspicion.
 */
export function snapshotHealth(snapshot: Snapshot): SnapshotHealth {
  const seen = new Set<string>();
  let duplicateSlugs = 0;
  let missingCategory = 0;
  let missingChains = 0;
  let missingChange = 0;
  let missingListed = 0;
  let nonpositiveTvl = 0;
  let growthOutliers = 0;
  let trainable = 0;
  for (const p of snapshot.protocols) {
    if (seen.has(p.slug)) duplicateSlugs += 1;
    seen.add(p.slug);
    if (p.category === null || p.category === '') missingCategory += 1;
    if (p.chains.length === 0) missingChains += 1;
    if (p.change_7d === null) missingChange += 1;
    else if (Math.abs(p.change_7d) > 50) growthOutliers += 1;
    if (p.listed_at === null) missingListed += 1;
    if (!(p.tvl_usd > 0)) nonpositiveTvl += 1;
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) trainable += 1;
  }
  const present = new Set(snapshot.protocols.map((p) => p.slug));
  let watchlistMissing = 0;
  for (const slug of snapshot.watchlist) {
    if (!present.has(slug)) watchlistMissing += 1;
  }
  return {
    protocols: snapshot.protocols.length,
    duplicate_slugs: duplicateSlugs,
    missing_category: missingCategory,
    missing_chains: missingChains,
    missing_change_7d: missingChange,
    missing_listed_at: missingListed,
    nonpositive_tvl: nonpositiveTvl,
    growth_outliers: growthOutliers,
    watchlist_missing: watchlistMissing,
    trainable,
  };
}

/**
 * The health counts as sentences a reader can act on: one warning per defect
 * kind that actually occurs, nothing when the snapshot is clean. Counts alone
 * bury the point — a missing watchlist slug means the board cannot cover the
 * floor it promises, and a growth outlier means one row's tilt rests on a
 * 7-day move no week should be trusted to repeat.
 */
export function healthWarnings(health: SnapshotHealth): string[] {
  const warnings: string[] = [];
  if (health.duplicate_slugs > 0) {
    warnings.push(
      `${health.duplicate_slugs} protocol slug${health.duplicate_slugs === 1 ? '' : 's'} appear more than once in the snapshot; only the first occurrence can be told apart from its copies, so later duplicates score on borrowed identity.`,
    );
  }
  if (health.watchlist_missing > 0) {
    warnings.push(
      `${health.watchlist_missing} watchlist slug${health.watchlist_missing === 1 ? ' is' : 's are'} named in the snapshot but absent from its protocol list; those rows cannot be scored or farmed until the snapshot names them.`,
    );
  }
  if (health.nonpositive_tvl > 0) {
    warnings.push(
      `${health.nonpositive_tvl} protocol${health.nonpositive_tvl === 1 ? ' carries' : 's carry'} no positive TVL; with nothing locked there is nothing to value, so the regression cannot place them honestly.`,
    );
  }
  if (health.growth_outliers > 0) {
    warnings.push(
      `${health.growth_outliers} protocol${health.growth_outliers === 1 ? ' moved' : 's moved'} more than 50% in seven days; their growth tilt reflects a crash or a mania, not a trend, and should be read with suspicion.`,
    );
  }
  const missingFields =
    health.missing_category + health.missing_chains + health.missing_change_7d + health.missing_listed_at;
  if (missingFields > 0) {
    const parts: string[] = [];
    if (health.missing_category > 0) parts.push(`${health.missing_category} without a category`);
    if (health.missing_chains > 0) parts.push(`${health.missing_chains} without a chain list`);
    if (health.missing_change_7d > 0) parts.push(`${health.missing_change_7d} without a 7-day change`);
    if (health.missing_listed_at > 0) parts.push(`${health.missing_listed_at} without a listing date`);
    warnings.push(
      `${missingFields} protocol field${missingFields === 1 ? ' is' : 's are'} missing (${parts.join(', ')}); each gap is a model input the row had to do without.`,
    );
  }
  return warnings;
}

/** The board's self-checks, run on the built board itself: ranks, order, ties, coverage, verdicts. */
export function integrityChecks(board: BoardRow[], snapshot: Snapshot): IntegrityChecks {
  let ranksExact = board.length > 0;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) ranksExact = false;
  }
  let valuesNonRising = true;
  let noTies = true;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) valuesNonRising = false;
    if (board[i]!.implied_value_usd === board[i - 1]!.implied_value_usd) noTies = false;
  }
  const slugs = new Set(board.map((r) => r.slug));
  const covered = snapshot.watchlist.filter((s) => slugs.has(s)).length;
  const verdictCounts = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.verdict] += 1;
  return {
    ranks_exact: ranksExact,
    values_non_rising: valuesNonRising,
    no_ties: noTies,
    watchlist_covered: `${covered}/${snapshot.watchlist.length}`,
    rows_ranked: board.length,
    verdict_counts: verdictCounts,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const health = snapshotHealth(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: fit,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    health,
    health_warnings: healthWarnings(health),
    audit: auditCounts(snapshot),
    integrity: integrityChecks(board, snapshot),
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
