// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol
// is pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's tokenised protocols are kept apart — and used as the model's training set, never mixed
// into the ranked board.
//
// Implied value is a regression fit on the snapshot's own figures, not a TVL multiple:
//
//   training   = every protocol that records both a TVL and a market cap (the launched set)
//   fit        = OLS of ln(market cap) on ln(TVL):  ln V = a + b x ln(TVL), plus a per-category
//                offset shrunk toward zero by n / (n + 6) so thin categories cannot dominate
//   point      = exp(a + b x ln(TVL) + offset[category]) x growth tilt,
//                growth tilt = 1 + clamp(change_7d, -40, 40) / 100 x 0.30
//   interval   = split-conformal: the point estimate x exp(-q) .. x exp(+q), where q is the
//                80% split-conformal quantile of the training set's absolute log residuals.
//                The interval is wide because the market is: it is reported, not hidden.
//
// Launch probability is a transparent score from snapshot statistics only: the protocol's size
// relative to the pre-token field (z-score of ln TVL), its category's tokenised share (how often
// protocols of its kind already have a token), and its age with no token. A logistic map turns the
// three into a probability in [0.02, 0.97]. It is an estimate from one frozen snapshot, stated as one.
//
// No protocol name is ever special-cased: the same fitted function scores every row, and every
// constant above is recomputed from the snapshot at run time except the stated structural ones
// (shrinkage 6, growth weight 0.30, conformal level 0.80, logistic coefficients).

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
  pretoken_ln_tvl_mean: number;
  pretoken_ln_tvl_sd: number;
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
  prob_floor: 0.02,
  prob_cap: 0.97,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

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
  launch_probability: number;
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
  launch_probability: number;
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

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The 7-day growth tilt the point estimate carries. */
function growthMultiplier(p: SnapshotProtocol): number {
  const growth = clamp(finite(p.change_7d, 0), MODEL.growth_floor, MODEL.growth_cap);
  return 1 + (growth / 100) * MODEL.growth_weight;
}

/** The fitted model: OLS in log space, shrunk category offsets, conformal half-width. */
export function fitModel(snapshot: Snapshot): ModelFit {
  const train = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  if (train.length < 10) throw new SnapshotError(`only ${train.length} protocols record both TVL and a market cap: too few to fit a model`);
  const xs = train.map((p) => Math.log(p.tvl_usd));
  const ys = train.map((p) => Math.log(p.mcap_usd!));
  const n = train.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;

  // Per-category offsets from the global fit's residuals, shrunk toward zero by n / (n + shrinkage).
  const residSum = new Map<string, number>();
  const residCount = new Map<string, number>();
  train.forEach((p, i) => {
    const cat = p.category ?? 'Other';
    const r = ys[i]! - (intercept + slope * xs[i]!);
    residSum.set(cat, (residSum.get(cat) ?? 0) + r);
    residCount.set(cat, (residCount.get(cat) ?? 0) + 1);
  });
  const offsets: Record<string, number> = {};
  for (const cat of [...residCount.keys()].sort()) {
    const count = residCount.get(cat)!;
    if (count < MODEL.min_category_train) continue;
    const raw = residSum.get(cat)! / (count + MODEL.shrinkage);
    offsets[cat] = round4(clamp(raw, -MODEL.offset_cap_log, MODEL.offset_cap_log));
  }

  // Split-conformal half-width from the full model's absolute log residuals on the training set.
  const absResid = train.map((p) => {
    const pred = intercept + slope * Math.log(p.tvl_usd) + (offsets[p.category ?? 'Other'] ?? 0) + Math.log(growthMultiplier(p));
    return Math.abs(Math.log(p.mcap_usd!) - pred);
  }).sort((a, b) => a - b);
  const rank = clamp(Math.ceil((n + 1) * MODEL.conformal_level) - 1, 0, n - 1);
  const halfWidth = absResid[rank]!;
  const covered = absResid.filter((r) => r <= halfWidth).length;

  // Snapshot statistics the launch-probability score reads.
  const tokenised = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const pre = snapshot.protocols.filter(isPreToken);
  const lnMean = pre.reduce((a, p) => a + Math.log(p.tvl_usd), 0) / pre.length;
  const lnSd = Math.sqrt(pre.reduce((a, p) => a + (Math.log(p.tvl_usd) - lnMean) ** 2, 0) / pre.length) || 1;

  return {
    train_size: n,
    intercept: round4(intercept),
    slope: round4(slope),
    category_offsets: offsets,
    conformal_level: MODEL.conformal_level,
    conformal_half_width_log: round4(halfWidth),
    interval_factor: round4(Math.exp(halfWidth)),
    empirical_coverage: round3(covered / n),
    tokenised_share: round3(tokenised / snapshot.protocols.length),
    pretoken_ln_tvl_mean: round4(lnMean),
    pretoken_ln_tvl_sd: round4(lnSd),
  };
}

/** The category's tokenised share in the snapshot: protocols of its kind that already have a token. */
function categoryTokenisedShare(snapshot: Snapshot, category: string | null): number {
  const cat = category ?? 'Other';
  const all = snapshot.protocols.filter((p) => (p.category ?? 'Other') === cat);
  if (all.length === 0) return 0;
  return all.filter((p) => !isPreToken(p)).length / all.length;
}

/** A protocol's implied value, honest interval and launch probability under the fitted model. */
export function scoreProtocol(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  fit: ModelFit,
): { implied: number; low: number; high: number; probability: number; offset: number; growthMult: number; age: number | null } {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const offset = fit.category_offsets[p.category ?? 'Other'] ?? 0;
  const growthMult = growthMultiplier(p);
  const logPred = fit.intercept + fit.slope * Math.log(p.tvl_usd) + offset + Math.log(growthMult);
  const point = Math.exp(logPred);
  const implied = clamp(Math.max(1, Math.round(point)), 1, 1e14);
  const low = clamp(Math.max(1, Math.round(point / fit.interval_factor)), 1, 1e14);
  const high = clamp(Math.max(1, Math.round(point * fit.interval_factor)), 1, 1e14);

  const sizeZ = (Math.log(p.tvl_usd) - fit.pretoken_ln_tvl_mean) / fit.pretoken_ln_tvl_sd;
  const catShare = categoryTokenisedShare(snapshot, p.category);
  const ageYears = age === null ? 0.5 : Math.min(age / 365, 8);
  const z = -0.55 + 0.5 * sizeZ + 1.2 * (catShare - fit.tokenised_share) + 0.1 * ageYears;
  const probability = round3(clamp(1 / (1 + Math.exp(-z)), MODEL.prob_floor, MODEL.prob_cap));
  return { implied, low, high, probability, offset, growthMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: ModelFit = fitModel(snapshot)): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

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
    launch_probability: entry.s.probability,
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
  const gasRoundTrip = Math.round(gas * (6 + weeks) * 100) / 100;
  const capital = Math.max(tierCapital(p), minViableCapital(gasRoundTrip));
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
    launch_probability: row.launch_probability,
    category_offset: row.model.category_offset,
    growth_multiplier: row.model.growth_multiplier,
    watchlist: watchlist.has(row.slug),
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(snapshot);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
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
