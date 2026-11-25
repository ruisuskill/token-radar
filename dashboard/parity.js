// Token Radar's in-page proof (radar-7). The page does not take the board's numbers on
// trust: it re-derives every row's implied value here, in the browser, from the fitted
// model data.js carries — the same formula lib/model.ts scores with — and prints how many
// rows come back identical. No network, no fetch: the fitted coefficients, the category
// offsets, the extra term coefficients and the two context constants (median pre-token
// age in years, each category's tokenised share) all arrive inside window.RADAR.model.
//
// The formula, exactly as predictFromModelFit in lib/model.ts:
//   ln(implied) = intercept + slope x ln(TVL) + category offset
//                 + sum over kept extra terms of coefficient x column(row)
//   implied = clamp(round(exp(ln(implied))), 1, 1e14)
// The column of a kept term is looked up by its label, the same table as VALUE_COLUMNS
// in lib/model.ts. The growth constants (weight 0.3, floor -40, cap 40) are MODEL's in
// lib/model.ts; if they ever change there, the build-time parity gate fails loudly.
(function () {
  'use strict';

  var GROWTH_WEIGHT = 0.3;
  var GROWTH_FLOOR = -40;
  var GROWTH_CAP = 40;

  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }

  function growthMultiplier(row) {
    var growth = row.change_7d === null || row.change_7d === undefined || !isFinite(row.change_7d) ? 0 : row.change_7d;
    growth = clamp(growth, GROWTH_FLOOR, GROWTH_CAP);
    return 1 + (growth / 100) * GROWTH_WEIGHT;
  }

  function ageYears(fit, row) {
    if (row.age_days === null || row.age_days === undefined) return fit.median_age_years;
    return row.age_days / 365;
  }

  function ageDays(fit, row) {
    if (row.age_days === null || row.age_days === undefined) return fit.median_age_years * 365;
    return row.age_days;
  }

  // One design column's value for a row, by the term label lib/model.ts files it under.
  function columnValue(fit, row, label) {
    var lnTvl = Math.log(row.tvl_usd);
    switch (label) {
      case 'log-TVL curvature':
        return (lnTvl * lnTvl) / 100;
      case 'chain count':
        return Math.log(1 + (row.chains || []).length);
      case 'listing age':
        return ageYears(fit, row);
      case 'category tokenised share':
        return (fit.category_tokenised_share || {})[row.category || 'Other'] || 0;
      case 'listed within a year':
        return ageDays(fit, row) < 365 ? 1 : 0;
      case '7-day growth tilt':
        return Math.log(growthMultiplier(row));
      default:
        return 0;
    }
  }

  // The row's implied value, re-derived from the fitted model. Returns null when the
  // row lacks what the formula needs, so a missing input reads as a miss, never a match.
  function recomputeImplied(fit, row) {
    if (!fit || !row || typeof row.tvl_usd !== 'number' || !(row.tvl_usd > 0)) return null;
    var v = fit.intercept + fit.slope * Math.log(row.tvl_usd);
    v += (fit.category_offsets || {})[row.category || 'Other'] || 0;
    var extras = fit.extra_coefficients || {};
    for (var label in extras) {
      if (Object.prototype.hasOwnProperty.call(extras, label)) {
        v += extras[label] * columnValue(fit, row, label);
      }
    }
    return clamp(Math.max(1, Math.round(Math.exp(v))), 1, 1e14);
  }

  // Every row, re-derived and compared with the board's own implied value.
  function parityCheck(data) {
    var rows = (data && data.rows) || [];
    var fit = data && data.model;
    var mismatched = [];
    var matched = 0;
    for (var i = 0; i < rows.length; i++) {
      var again = recomputeImplied(fit, rows[i]);
      if (again !== null && again === rows[i].implied_value_usd) matched += 1;
      else mismatched.push(rows[i].slug);
    }
    return { total: rows.length, matched: matched, mismatched: mismatched };
  }

  var TokenRadarParity = { recomputeImplied: recomputeImplied, parityCheck: parityCheck };
  if (typeof window !== 'undefined') window.TokenRadarParity = TokenRadarParity;
  if (typeof module !== 'undefined' && module.exports) module.exports = TokenRadarParity;
})();
