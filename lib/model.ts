// The token radar's model (radar-3): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other pre-token protocol the snapshot lets the radar rank: the early rows the radar exists to
// find. A protocol is pre-token when its record carries no token (no market cap, no CoinGecko id,
// no symbol); the snapshot's tokenised protocols are kept apart — the ones that record a market cap
// are the model's training set, never mixed into the ranked board.
//
// Implied value is a regression fit on the snapshot's own figures, and every term of it has to earn
// its place. The three candidate terms — the log-TVL slope, per-category offsets, the 7-day growth
// tilt — are each tested held-out two ways before they are kept: walk-forward (fit on the older
// listings, test on the newer ones, split by listed_at) and leave-one-out over the training set.
// A term stays only if removing it makes the leave-one-out error worse; the walk-forward number is
// printed alongside as a second opinion. On this snapshot the slope survives and the offsets and
// the growth tilt do not: both make the held-out error worse, so radar-3 is a slope-only model,
// ln V = a + b x ln(TVL). The walk-forward test does not beat a flat baseline at all (x0.90): the
// value multiple drifts with listing cohort — the newest listings trade richer than the old fit
// predicts — so the board says so instead of hiding it. The leave-one-out test beats flat x1.10.
//
// Launch odds are fitted, not set by rule: a logistic regression on all 758 protocols (tokenised
// 1/0 against ln TVL, age with no token in years, and the category's tokenised share) gives a
// tokenisation curve F(age); the 12-month launch odds for a row are the conditional hazard
// [F(age + 1y) - F(age)] / [1 - F(age)] at that row's size and category. It is a cross-sectional
// cohort curve — the snapshot carries no observed launch dates — and the board states that.
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
// capital is the larger of the gas floor and the break-even deposit.
//
// No protocol name is ever special-cased: the same fitted functions score every row, and every
// constant above is recomputed from the snapshot at run time except the stated structural ones
// (shrinkage 6 for the offsets test, growth weight 0.30 for the growth test, conformal level 0.80,
// the 10% pool and 5% farmed-TVL shares, the $25 FARM threshold).

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

/** One value term's held-out test: the error with the term against the error without it, twice. */
export interface ValueTermTest {
  term: string;
  kept: boolean;
  walk_forward_rmse_with: number;
  walk_forward_rmse_without: number;
  loo_rmse_with: number;
  loo_rmse_without: number;
}

/** The value model's held-out validation: walk-forward (older fit, newer test) and leave-one-out. */
export interface ValueValidation {
  walk_forward: {
    fit_size: number;
    test_size: number;
    split_listed_at: string;
    flat_rmse: number;
    model_rmse: number;
    multiple_vs_flat: number;
  } | null;
  leave_one_out: { flat_rmse: number; model_rmse: number; multiple_vs_flat: number };
  terms: ValueTermTest[];
  kept_terms: string[];
  dropped_terms: string[];
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
}

/** The fitted model's reportable statistics: the dashboard states them verbatim. */
export interface ModelFit {
  train_size: number;
  intercept: number;
  slope: number;
  category_offsets: Record<string, number>;
  conformal_level: number;
  conformal_half_width_log: number;
  interval_factor: number;
  empirical_coverage: number;
  tokenised_share: number;
  within_3x_training: number;
  within_3x_loo: number;
  validation: ValueValidation;
  clock: LaunchClock;
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
  farm_cost_usd: number;
  plan_capital_usd: number;
  breakeven_deposit_usd: number;
  min_viable_capital_usd: number;
  launch_odds_12m: number;
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
  airdrop_pool_share: 0.1,
  farmed_tvl_share: 0.05,
  farm_threshold_usd: 25,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

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
  farm_cost_usd: number;
  plan_capital_usd: number;
  breakeven_deposit_usd: number;
  min_viable_capital_usd: number;
  model: {
    category_offset: number;
    growth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures plus its farm plan. */
export interface RadarRow {
  rank: number;
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
  farm_cost_usd: number;
  plan_capital_usd: number;
  breakeven_deposit_usd: number;
  min_viable_capital_usd: number;
  category_offset: number;
  growth_multiplier: number;
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

/** Which value terms a fit uses. */
export interface ValueTerms {
  slope: boolean;
  offsets: boolean;
  growth: boolean;
}

/** A value fit: OLS in log space, with shrunk per-category offsets when the terms say so. */
export interface ValueFit {
  intercept: number;
  slope: number;
  offsets: Record<string, number>;
}

/** OLS of ln(market cap) on ln(TVL), with the terms switched on or off. */
export function fitValueRows(rows: SnapshotProtocol[], terms: ValueTerms): ValueFit {
  const xs = rows.map((p) => Math.log(p.tvl_usd));
  const ys = rows.map((p) => Math.log(p.mcap_usd!));
  const n = rows.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const slope = terms.slope && sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;

  // Per-category offsets from the global fit's residuals, shrunk toward zero by n / (n + shrinkage).
  const offsets: Record<string, number> = {};
  if (terms.offsets) {
    const residSum = new Map<string, number>();
    const residCount = new Map<string, number>();
    rows.forEach((p, i) => {
      const cat = p.category ?? 'Other';
      const r = ys[i]! - (intercept + slope * xs[i]!);
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
  return { intercept: round4(intercept), slope: round4(slope), offsets };
}

/** A fit's log-space prediction for one protocol. */
function predictValueLog(fit: ValueFit, p: SnapshotProtocol, terms: ValueTerms): number {
  let v = fit.intercept + fit.slope * Math.log(p.tvl_usd) + (fit.offsets[p.category ?? 'Other'] ?? 0);
  if (terms.growth) v += Math.log(growthMultiplier(p));
  return v;
}

/** A fit's log-space RMSE on a set of training rows. */
function rmseLog(rows: SnapshotProtocol[], fit: ValueFit, terms: ValueTerms): number {
  return Math.sqrt(
    rows.reduce((a, p) => a + (Math.log(p.mcap_usd!) - predictValueLog(fit, p, terms)) ** 2, 0) / rows.length,
  );
}

/** The flat baseline's log-space RMSE on a set of training rows: predict the set's own mean. */
function flatRmseLog(rows: SnapshotProtocol[]): number {
  const mean = rows.reduce((a, p) => a + Math.log(p.mcap_usd!), 0) / rows.length;
  return Math.sqrt(rows.reduce((a, p) => a + (Math.log(p.mcap_usd!) - mean) ** 2, 0) / rows.length);
}

/** The leave-one-out log-space RMSE of one term set over the training rows (one refit per row). */
function looRmse(train: SnapshotProtocol[], terms: ValueTerms): number {
  let se = 0;
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    const fit = fitValueRows(rest, terms);
    const e = Math.log(train[i]!.mcap_usd!) - predictValueLog(fit, train[i]!, terms);
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

const TERM_NAMES: { key: keyof ValueTerms; label: string }[] = [
  { key: 'slope', label: 'log-TVL slope' },
  { key: 'offsets', label: 'per-category offsets' },
  { key: 'growth', label: '7-day growth tilt' },
];

/**
 * The held-out test of every value term, twice. Walk-forward fits the older listings and tests the
 * newer ones (split by listed_at); leave-one-out refits without each training row in turn. A term
 * is kept only when removing it makes the leave-one-out error worse — the larger, more stable test
 * (one refit per training row). The walk-forward number is printed alongside as a second opinion:
 * on this snapshot it does not beat flat at all, because the value multiple drifts with listing
 * cohort, and the board says so instead of hiding it.
 */
export function validateValueTerms(snapshot: Snapshot, train: SnapshotProtocol[]): ValueValidation {
  const full: ValueTerms = { slope: true, offsets: true, growth: true };
  const dated = datedTrainRows(train);
  const cut = Math.floor(dated.length * MODEL.walk_forward_fit_share);
  const wfFitRows = dated.slice(0, cut);
  const wfTestRows = dated.slice(cut);
  let walkForward: ValueValidation['walk_forward'] = null;
  if (dated.length >= 20 && wfTestRows.length > 0) {
    const fit = fitValueRows(wfFitRows, full);
    const flat = flatRmseLog(wfTestRows);
    const model = rmseLog(wfTestRows, fit, full);
    walkForward = {
      fit_size: wfFitRows.length,
      test_size: wfTestRows.length,
      split_listed_at: wfTestRows[0]!.listed_at!,
      flat_rmse: round4(flat),
      model_rmse: round4(model),
      multiple_vs_flat: round3(flat / model),
    };
  }

  const looFull = looRmse(train, full);
  const terms: ValueTermTest[] = TERM_NAMES.map(({ key, label }) => {
    const without: ValueTerms = { ...full, [key]: false };
    const looWithout = looRmse(train, without);
    let wfWith = 0;
    let wfWithout = 0;
    if (walkForward !== null) {
      wfWith = rmseLog(wfTestRows, fitValueRows(wfFitRows, full), full);
      wfWithout = rmseLog(wfTestRows, fitValueRows(wfFitRows, without), without);
    }
    return {
      term: label,
      kept: looFull < looWithout,
      walk_forward_rmse_with: round4(wfWith),
      walk_forward_rmse_without: round4(wfWithout),
      loo_rmse_with: round4(looFull),
      loo_rmse_without: round4(looWithout),
    };
  });
  const keptTerms: string[] = [];
  const droppedTerms: string[] = [];
  for (const t of terms) (t.kept ? keptTerms : droppedTerms).push(t.term);
  const looFlat = flatRmseLog(train);
  return {
    walk_forward: walkForward,
    leave_one_out: {
      flat_rmse: round4(looFlat),
      model_rmse: round4(looFull),
      multiple_vs_flat: round3(looFlat / looFull),
    },
    terms,
    kept_terms: keptTerms,
    dropped_terms: droppedTerms,
  };
}

/** The fitted model: the validated value terms, the conformal interval, and the launch clock. */
export function fitModel(snapshot: Snapshot): ModelFit {
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  if (train.length < 10) throw new SnapshotError(`only ${train.length} protocols record both TVL and a market cap: too few to fit a model`);
  const validation = validateValueTerms(snapshot, train);
  const terms: ValueTerms = {
    slope: validation.terms[0]!.kept,
    offsets: validation.terms[1]!.kept,
    growth: validation.terms[2]!.kept,
  };
  const fit = fitValueRows(train, terms);

  // Split-conformal half-width from the final model's absolute log residuals on the training set.
  const absResid = train
    .map((p) => Math.abs(Math.log(p.mcap_usd!) - predictValueLog(fit, p, terms)))
    .sort((a, b) => a - b);
  const n = train.length;
  const rank = clamp(Math.ceil((n + 1) * MODEL.conformal_level) - 1, 0, n - 1);
  const halfWidth = absResid[rank]!;
  const covered = absResid.filter((r) => r <= halfWidth).length;

  // Within-3x: share of the training set whose implied value lands within 3x of the real market cap,
  // in-sample and leave-one-out.
  let within = 0;
  for (const p of train) {
    if (Math.abs(Math.log(p.mcap_usd!) - predictValueLog(fit, p, terms)) <= Math.log(3)) within += 1;
  }
  let withinLoo = 0;
  for (let i = 0; i < train.length; i++) {
    const rest = train.filter((_, j) => j !== i);
    const looFit = fitValueRows(rest, terms);
    if (Math.abs(Math.log(train[i]!.mcap_usd!) - predictValueLog(looFit, train[i]!, terms)) <= Math.log(3)) withinLoo += 1;
  }
  // The validation's leave-one-out and walk-forward multiples are for the full term set; recompute
  // them for the final (kept-terms) model so the numbers the board prints are the model the board uses.
  const looFinal = looRmse(train, terms);
  const looFlat = flatRmseLog(train);
  validation.leave_one_out = {
    flat_rmse: round4(looFlat),
    model_rmse: round4(looFinal),
    multiple_vs_flat: round3(looFlat / looFinal),
  };
  if (validation.walk_forward !== null) {
    const dated = datedTrainRows(train);
    const cut = Math.floor(dated.length * MODEL.walk_forward_fit_share);
    const fitRows = dated.slice(0, cut);
    const testRows = dated.slice(cut);
    const wfFit = fitValueRows(fitRows, terms);
    const flat = flatRmseLog(testRows);
    const model = rmseLog(testRows, wfFit, terms);
    validation.walk_forward = {
      fit_size: fitRows.length,
      test_size: testRows.length,
      split_listed_at: testRows[0]!.listed_at!,
      flat_rmse: round4(flat),
      model_rmse: round4(model),
      multiple_vs_flat: round3(flat / model),
    };
  }

  const tokenised = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const clock = fitLaunchClock(snapshot);
  return {
    train_size: n,
    intercept: fit.intercept,
    slope: fit.slope,
    category_offsets: fit.offsets,
    conformal_level: MODEL.conformal_level,
    conformal_half_width_log: round4(halfWidth),
    interval_factor: round4(Math.exp(halfWidth)),
    empirical_coverage: round3(covered / n),
    tokenised_share: round3(tokenised / snapshot.protocols.length),
    within_3x_training: round3(within / n),
    within_3x_loo: round3(withinLoo / n),
    validation,
    clock,
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
  return {
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
  };
}

/** A row's 12-month launch odds under the fitted clock: the conditional hazard over the next year. */
export function launchOdds12m(p: SnapshotProtocol, snapshot: Snapshot, clock: LaunchClock): number {
  const ageYears = (ageDays(snapshot.as_of, p.listed_at) ?? clock.median_age_days) / 365;
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

/** A protocol's implied value, honest interval, 12-month launch odds and farm verdict under the fitted model. */
export function scoreProtocol(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  fit: ModelFit,
): { implied: number; low: number; high: number; odds12m: number; offset: number; growthMult: number; age: number | null; verdict: FarmVerdict } {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const offset = fit.category_offsets[p.category ?? 'Other'] ?? 0;
  const growthMult = fit.validation.terms[2]!.kept ? growthMultiplier(p) : 1;
  const logPred = fit.intercept + fit.slope * Math.log(p.tvl_usd) + offset + Math.log(growthMult);
  const point = Math.exp(logPred);
  const implied = clamp(Math.max(1, Math.round(point)), 1, 1e14);
  const low = clamp(Math.max(1, Math.round(point / fit.interval_factor)), 1, 1e14);
  const high = clamp(Math.max(1, Math.round(point * fit.interval_factor)), 1, 1e14);
  const odds12m = launchOdds12m(p, snapshot, fit.clock);
  const verdict = farmVerdict(p, implied, odds12m, age);
  return { implied, low, high, odds12m, offset, growthMult, age, verdict };
}

/**
 * A row's farm verdict, netted to the dollar. The farmer's share of the token supply is a stated
 * model: the community pool is 10% of supply and farmers together hold 5% of TVL, so a deposit's
 * share is (deposit / 5% of TVL) x 10%. Expected value is implied value x 12-month launch odds x
 * that share, minus the plan's gas cost. FARM clears $25 of net expected value; THIN breaks even
 * but no more; SKIP loses money at the planned deposit. The break-even deposit is the deposit at
 * which the expected value is exactly zero — for a SKIP row it is the deposit the row would need,
 * not one worth making.
 */
export function farmVerdict(p: SnapshotProtocol, implied: number, odds12m: number, age: number | null): FarmVerdict {
  const econ = farmEconomics(p, age);
  const share = (econ.capital / (MODEL.farmed_tvl_share * p.tvl_usd)) * MODEL.airdrop_pool_share;
  const expected = implied * odds12m * share - econ.gasRoundTrip;
  const breakeven =
    implied > 0 && odds12m > 0
      ? (econ.gasRoundTrip * MODEL.farmed_tvl_share * p.tvl_usd) / (implied * odds12m * MODEL.airdrop_pool_share)
      : 1e9;
  const minViable = Math.max(econ.minCapital, Math.ceil(breakeven / 50) * 50);
  const verdict = expected >= MODEL.farm_threshold_usd ? 'FARM' : expected >= 0 ? 'THIN' : 'SKIP';
  return {
    verdict,
    expected_value_usd: Math.round(expected),
    farm_cost_usd: Math.round(econ.gasRoundTrip * 100) / 100,
    plan_capital_usd: econ.capital,
    breakeven_deposit_usd: Math.round(breakeven),
    min_viable_capital_usd: minViable,
    launch_odds_12m: odds12m,
  };
}

/** The farm's money facts: the planned deposit, the gas the whole plan burns, and the gas floor. */
export function farmEconomics(p: SnapshotProtocol, age: number | null): { capital: number; gasRoundTrip: number; minCapital: number } {
  const gas = gasPerAction(chainOf(p));
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.round(hold / 7));
  // Actions over the plan: fund (1) + core (1) + second (1) + weekly (weeks) + claim check (1) + exit (2).
  const gasRoundTrip = Math.round(gas * (6 + weeks) * 100) / 100;
  return {
    capital: Math.max(tierCapital(p), minViableCapital(gasRoundTrip)),
    gasRoundTrip,
    minCapital: minViableCapital(gasRoundTrip),
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
  return scored.map((entry, i) => ({
    rank: i + 1,
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
    farm_cost_usd: entry.s.verdict.farm_cost_usd,
    plan_capital_usd: entry.s.verdict.plan_capital_usd,
    breakeven_deposit_usd: entry.s.verdict.breakeven_deposit_usd,
    min_viable_capital_usd: entry.s.verdict.min_viable_capital_usd,
    model: {
      category_offset: round4(entry.s.offset),
      growth_multiplier: round4(entry.s.growthMult),
      age_days: entry.s.age,
    },
    farm_steps: farmSteps(entry.p, entry.s.age).map(stepText),
  }));
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
    farm_cost_usd: row.farm_cost_usd,
    plan_capital_usd: row.plan_capital_usd,
    breakeven_deposit_usd: row.breakeven_deposit_usd,
    min_viable_capital_usd: row.min_viable_capital_usd,
    category_offset: row.model.category_offset,
    growth_multiplier: row.model.growth_multiplier,
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
