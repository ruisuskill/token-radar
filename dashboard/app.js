// Token Radar's dashboard (radar-3). It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table and a per-protocol detail drawer carrying the
// fitted model's own figures: implied value, its conformal interval, the fitted 12-month launch
// odds and the protocol's farm verdict and plan. No network: every byte it shows is in data.js,
// and the page recomputes nothing — the numbers it prints are the numbers board.json carries.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlistOnly: false };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtProb(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return Math.round(n * 100) + '%';
  }
  function fmtEv(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+$' : '-$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'prob') { av = a.launch_odds_12m; bv = b.launch_odds_12m; }
      else if (key === 'ev') { av = a.expected_value_usd; bv = b.expected_value_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var m = DATA.model;
    var a = DATA.audit;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The board ranks all ' + DATA.board_size + ' pre-token protocols the snapshot lets the radar rank — the watchlist plus ' + DATA.early_size + ' more — and accounts for the other ' + (a.filed - a.ranked) + ' of the ' + a.filed + ' filed protocols below. Implied value comes from a regression fit on the ' + m.train_size + ' protocols in this snapshot that already trade, with an honest interval around every row and a rank range across the fitted variants: the range is wide because launched tokens land far from any line. Launch odds are fitted from the peers\u2019 own record, and every row carries a farm verdict netted to the dollar and priced per hour, with the smallest deposit that turns it FARM. A model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.integrity.watchlist_covered })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Filed protocols accounted for' }), el('b', { text: a.ranked + a.training_set + a.token_no_mcap + a.excluded_cex + a.excluded_versioned + a.excluded_wrapped_bridged + a.excluded_staking_receipt + ' / ' + a.filed })),
        el('div', { class: 'fact' }, el('span', { text: 'Farm verdicts' }), el('b', { text: DATA.integrity.verdict_counts.FARM + ' farm · ' + DATA.integrity.verdict_counts.THIN + ' thin · ' + DATA.integrity.verdict_counts.SKIP + ' skip' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function chip(label, ok) {
    return el('span', { class: 'chip ' + (ok ? 'pass' : 'fail'), text: (ok ? '✓ ' : '✗ ') + label });
  }

  function integrityStrip() {
    var m = DATA.model;
    var v = m.validation;
    var wf = v.walk_forward ? 'walk-forward x' + v.walk_forward.multiple_vs_flat.toFixed(2) + ' vs flat' : 'walk-forward n/a';
    return el('section', { class: 'strip', 'aria-label': 'Cover self-checks' },
      el('h2', { text: 'Cover checks — run on this board, not asserted' }),
      el('div', { class: 'chips' },
        chip('ranks exactly 1..' + DATA.board_size, DATA.integrity.ranks_exact),
        chip('implied value never rises with rank', DATA.integrity.values_non_rising),
        chip('no tied values', DATA.integrity.no_ties),
        chip('watchlist ' + DATA.integrity.watchlist_covered, DATA.integrity.watchlist_covered === DATA.watchlist_size + '/' + DATA.watchlist_size),
        chip('interval coverage ' + Math.round(m.empirical_coverage * 100) + '% (80% target)', Math.abs(m.empirical_coverage - 0.8) <= 0.1),
        chip(wf, v.walk_forward ? v.walk_forward.multiple_vs_flat >= 1 : false),
        chip('leave-one-out x' + v.leave_one_out.multiple_vs_flat.toFixed(2) + ' vs flat', v.leave_one_out.multiple_vs_flat >= 1),
        chip('placebo x' + m.placebo.multiple_vs_flat.toFixed(2) + ' vs flat (shuffled TVL)', Math.abs(m.placebo.multiple_vs_flat - 1) <= 0.15),
        chip('rank range on every row', DATA.rows.every(function (r) { return r.rank_low <= r.rank && r.rank <= r.rank_high; }))
      ),
      el('p', { class: 'sub', text: 'The walk-forward check fails on purpose and stays printed: the value multiple drifts with listing cohort, so a model fit on older listings does not beat a flat multiple on the newest ones. The leave-one-out check on all ' + m.train_size + ' training rows does. Both numbers are the model the board uses.' })
    );
  }

  function kpiStrip() {
    var m = DATA.model;
    var v = m.validation;
    var c = m.clock;
    var farmRows = DATA.rows.filter(function (r) { return r.verdict === 'FARM'; });
    var bestPerHour = farmRows.length ? Math.max.apply(null, farmRows.map(function (r) { return r.expected_value_per_hour_usd; })) : 0;
    return el('section', { class: 'strip kpi', 'aria-label': 'Key numbers' },
      el('h2', { text: 'Key numbers' }),
      el('div', { class: 'kpis' },
        el('div', { class: 'kpi' }, el('span', { text: 'Within 3x of the real market cap (training)' }), el('b', { text: Math.round(m.within_3x_training * 100) + '%' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Within 3x, leave-one-out' }), el('b', { text: Math.round(m.within_3x_loo * 100) + '%' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Conformal 80% interval factor' }), el('b', { text: 'x' + m.interval_factor.toFixed(2) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Walk-forward vs flat' }), el('b', { text: v.walk_forward ? 'x' + v.walk_forward.multiple_vs_flat.toFixed(2) : 'n/a' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Leave-one-out vs flat' }), el('b', { text: 'x' + v.leave_one_out.multiple_vs_flat.toFixed(2) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Median 12-month launch odds' }), el('b', { text: Math.round(c.odds_12m_median * 100) + '%' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Best farm $/hour (FARM rows)' }), el('b', { text: fmtEv(bestPerHour) + '/hr' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Terms tested, held-out twice' }), el('b', { text: String(v.terms.length) })),
        el('div', { class: 'kpi' }, el('span', { text: 'Terms kept' }), el('b', { text: v.kept_terms.join(', ') || 'none' })),
        el('div', { class: 'kpi' }, el('span', { text: 'Terms dropped by the held-out tests' }), el('b', { text: v.dropped_terms.length + ' of ' + v.terms.length + ' tested' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var watch = el('input', { type: 'checkbox', id: 'watchlist', 'aria-label': 'Watchlist only' });
    if (state.watchlistOnly) watch.setAttribute('checked', 'checked');
    watch.addEventListener('change', function () { state.watchlistOnly = watch.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field check' }, el('label', { for: 'watchlist', text: 'Watchlist only' }), watch),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' · watchlist' : ' · early') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtProb(r.launch_odds_12m) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / (max || 1)) * 100)) + '%' })),
          el('div', { class: 'name' },
            el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
            el('span', { class: 'sub', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) })
          )
        )),
        el('td', null, el('div', { class: 'name' },
          el('span', { class: 'verdict v-' + r.verdict.toLowerCase(), text: r.verdict }),
          el('span', { class: 'sub', text: 'EV ' + fmtEv(r.expected_value_usd) + ' · ' + fmtEv(r.expected_value_per_hour_usd) + '/hr · break-even ' + fmtUsd(r.breakeven_deposit_usd) })
        ))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. The range under each value is its 80% conformal interval; the verdict is the row\u2019s netted farm value at its planned deposit, priced per hour. Select a row for its rank range, model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('prob', '12m odds'),
            sortHeader('implied', 'Implied value'),
            sortHeader('ev', 'Farm verdict')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the training set the regression is fit on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var v = m.validation;
    var c = m.clock;
    var termLines = v.terms.map(function (t) {
      return t.term + ': ' + (t.kept ? 'kept' : 'dropped') +
        ' — walk-forward RMSE ' + t.walk_forward_rmse_with.toFixed(2) + ' with vs ' + t.walk_forward_rmse_without.toFixed(2) + ' without; leave-one-out ' + t.loo_rmse_with.toFixed(2) + ' vs ' + t.loo_rmse_without.toFixed(2);
    }).join('\n');
    var wf = v.walk_forward;
    var extraFormula = Object.keys(m.extra_coefficients).map(function (label) {
      return ' + ' + m.extra_coefficients[label].toFixed(2) + ' x ' + label;
    }).join('');
    var extraLines = v.extra_tests.map(function (e) {
      return e.label + ': leave-one-out ' + e.loo_rmse.toFixed(2) + ' (x' + e.loo_multiple_vs_flat.toFixed(2) + ' vs flat), walk-forward ' + (e.walk_forward_rmse === null ? 'n/a' : e.walk_forward_rmse.toFixed(2) + ' (x' + e.walk_forward_multiple_vs_flat.toFixed(2) + ' vs flat)') + ' — not adopted: ' + e.reason + '.';
    }).join('\n');
    var ageShape = c.odds_by_age.map(function (o) { return o.age_years + 'y ' + Math.round(o.odds_12m * 100) + '%'; }).join(', ');
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'A regression fit on this snapshot itself, not a rule of thumb. The training set is every protocol that records both TVL and a market cap (' + m.train_size + ' protocols); pre-token protocols are never in it, and tokenised ones are never on the board.' }),
      el('div', { class: 'formula' },
        'ln(implied value) = ' + m.intercept.toFixed(2) + ' + ' + m.slope.toFixed(2) + ' x ln(TVL)' + extraFormula
      ),
      el('p', { class: 'sub', text: 'Every term of that formula had to earn its place, tested held-out twice. Terms were chosen by greedy forward selection on leave-one-out error, starting from the log-TVL slope: a term joins only if it improves the held-out error. Kept: ' + (v.kept_terms.join(', ') || 'none') + '. Dropped: ' + (v.dropped_terms.join(', ') || 'none') + ' — each made the held-out error worse, so it is out of the model, not hidden in it.' }),
      el('div', { class: 'formula' }, termLines),
      el('p', { class: 'sub', text: 'Two whole-fit alternatives were tested the same way and not adopted:' }),
      el('div', { class: 'formula' }, extraLines),
      el('p', { class: 'sub', text: 'Placebo: log-TVL shuffled among the ' + m.train_size + ' training rows (seed ' + m.placebo.seed + ') and refit — leave-one-out x' + m.placebo.multiple_vs_flat.toFixed(2) + ' vs flat. Shuffled size carries no signal, so a model that found one there would be fitting noise.' }),
      el('p', { class: 'sub', text: 'Held-out multiples against a flat baseline (predict the mean): walk-forward x' + (wf ? wf.multiple_vs_flat.toFixed(2) : 'n/a') + ' on the ' + (wf ? wf.test_size : 0) + ' newest listings (fit on the ' + (wf ? wf.fit_size : 0) + ' older ones, split at ' + (wf ? wf.split_listed_at : 'n/a') + '), leave-one-out x' + v.leave_one_out.multiple_vs_flat.toFixed(2) + ' on all ' + m.train_size + ' training rows. The walk-forward test does not beat flat: the value multiple drifts with listing cohort, and newer listings trade richer than the old fit predicts.' }),
      el('p', { class: 'sub', text: 'Interval: split-conformal on the training residuals. Each row shows point / ' + m.interval_factor.toFixed(1) + ' to point x ' + m.interval_factor.toFixed(1) + ' — an 80% interval that covered ' + Math.round(m.empirical_coverage * 100) + '% of the training set and put ' + Math.round(m.within_3x_training * 100) + '% of it within 3x of the real market cap (' + Math.round(m.within_3x_loo * 100) + '% leave-one-out). It is wide on purpose: most launched tokens land far from the line, and a narrow interval would be a lie.' }),
      el('p', { class: 'sub', text: 'Launch odds: a logistic tokenisation curve fitted on ' + c.fit_size + ' protocols (tokenised 1/0 on ln TVL, age with no token, and the category\u2019s tokenised share): intercept ' + c.intercept.toFixed(2) + ', ln TVL ' + c.ln_tvl.toFixed(2) + ', age ' + c.age_years.toFixed(2) + ' per year, category share ' + c.category_tokenised_share.toFixed(2) + '. The 12-month odds for a row are the conditional hazard over the next year at that row\u2019s size, age and category (median ' + Math.round(c.odds_12m_median * 100) + '%). It is a cross-sectional cohort curve — the snapshot carries no observed launch dates — and unknown age counts as the pre-token median, ' + c.median_age_days + ' days. The clock\u2019s shape, for a median-size protocol: ' + ageShape + ' — the odds rise with age, they do not fall.' }),
      el('p', { class: 'sub', text: 'Farm verdict: expected value = implied value x 12-month odds x the farmer\u2019s share of supply, minus the plan\u2019s gas cost. The share is a stated model: 10% of supply goes to the community pool and farmers together hold 5% of TVL, so a deposit\u2019s share is (deposit / 5% of TVL) x 10%. FARM clears $25 net; THIN breaks even; SKIP loses money at the planned deposit. The biggest implied values are usually SKIP: their TVL is so large that one farmer\u2019s share of the pool is tiny, and the break-even deposit runs into the thousands. Every row also shows its expected value per hour of active plan time and its verdict at six fixed deposits ($100–$5,000), so the smallest deposit that turns it FARM is visible. No protocol name is special-cased anywhere in the model.' })
    );
  }

  function auditPanel() {
    var a = DATA.audit;
    function row(label, n, note) {
      return el('div', { class: 'equation' },
        el('div', null, el('span', { text: label }), el('b', { class: 'num', text: String(n) })),
        note ? el('div', null, el('span', { class: 'sub', text: note })) : null
      );
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'All ' + a.filed + ' protocols, accounted for' }),
      el('p', { class: 'sub', text: 'Nothing in the snapshot is silently missing. Each protocol sits in exactly one bucket.' }),
      row('Ranked on the board', a.ranked, a.watchlist_ranked + ' watchlist + ' + a.early_ranked + ' early rows'),
      row('Training set — already trade, market cap recorded', a.training_set, 'the regression is fit on these, never ranked'),
      row('Token recorded, no market cap in the snapshot', a.token_no_mcap, 'cannot be valued and cannot be farmed for a launch that already happened'),
      row('Excluded — centralised exchanges', a.excluded_cex, null),
      row('Excluded — versioned pools (a release of another protocol)', a.excluded_versioned, null),
      row('Excluded — wrapped / bridged products', a.excluded_wrapped_bridged, 'official bridges and wrapped representations of another asset'),
      row('Excluded — staking receipts', a.excluded_staking_receipt, 'receipts for another chain\u2019s staked asset'),
      a.watchlist_carveout > 0 ? el('p', { class: 'sub', text: 'Carve-out: ' + a.watchlist_carveout + ' watchlist protocol' + (a.watchlist_carveout === 1 ? '' : 's') + ' fall in an excluded category but are still ranked — the watchlist is the floor, and coverage of all ' + DATA.watchlist_size + ' is the gate.' }) : null
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Category offset (log)' }), el('b', { class: 'num', text: String(row.category_offset) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: '12-month launch odds' }), el('b', { class: 'num', text: fmtProb(row.launch_odds_12m) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: '80% interval' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'Rank range across the fitted variants' }), el('b', { class: 'num', text: row.rank_low + '–' + row.rank_high }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the fitted regression in the panel below the board scores this row from its TVL alone — the other seven candidate terms did not survive the held-out tests, so they are out of the model. The interval is the conformal range from the training residuals. The rank range is the row\u2019s lowest and highest rank across the eight fitted variants the board tested (the kept model plus each single-term addition): the top rows barely move, the middle of the board does. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm verdict: ' + row.verdict }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Expected value at the planned deposit' }), el('b', { class: 'num', text: fmtEv(row.expected_value_usd) })),
        el('div', null, el('span', { text: 'Expected value per hour of farmer time' }), el('b', { class: 'num', text: fmtEv(row.expected_value_per_hour_usd) + '/hr' })),
        el('div', null, el('span', { text: 'Active minutes in the plan (the hold is waiting, not work)' }), el('b', { class: 'num', text: String(row.work_minutes) + ' min' })),
        el('div', null, el('span', { text: 'Planned deposit' }), el('b', { class: 'num', text: fmtUsd(row.plan_capital_usd) })),
        el('div', null, el('span', { text: 'Farm cost (gas, whole plan)' }), el('b', { class: 'num', text: fmtUsd(row.farm_cost_usd) })),
        el('div', null, el('span', { text: 'Break-even deposit' }), el('b', { class: 'num', text: fmtUsd(row.breakeven_deposit_usd) })),
        el('div', null, el('span', { text: 'Smallest deposit that turns this row FARM' }), el('b', { class: 'num', text: row.smallest_farm_deposit_usd === null ? 'none up to $5,000' : fmtUsd(row.smallest_farm_deposit_usd) })),
        el('div', null, el('span', { text: 'Minimum viable capital' }), el('b', { class: 'num', text: fmtUsd(row.min_viable_capital_usd) }))
      ),
      el('p', { class: 'sub', text: 'Expected value = implied value x 12-month odds x the farmer\u2019s share of supply (10% community pool, farmers together hold 5% of TVL), minus gas. FARM clears $25 net; THIN breaks even; SKIP loses money at the planned deposit. The break-even deposit is what this row would need — for a SKIP row, that is the reason to skip it. Per hour divides the expected value by the plan\u2019s active minutes, so a row that pays little for a lot of clicking reads as what it is.' }),
      el('table', { class: 'tiers' },
        el('caption', { class: 'sub', text: 'The same verdict at six fixed deposits — the plan is priced at the planned deposit above, but the row\u2019s economics change with size.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Deposit' }),
          el('th', { scope: 'col', text: 'Expected value' }),
          el('th', { scope: 'col', text: 'Verdict' })
        )),
        el('tbody', null, row.deposit_tiers.map(function (t) {
          return el('tr', null,
            el('td', { class: 'num', text: fmtUsd(t.deposit_usd) }),
            el('td', { class: 'num', text: fmtEv(t.expected_value_usd) }),
            el('td', null, el('span', { class: 'verdict v-' + t.verdict.toLowerCase(), text: t.verdict }))
          );
        }))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(integrityStrip());
    shell.appendChild(kpiStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(auditPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
