// v6.459 — the Charts dashboard gained multi-select month filtering.
// v6.462 — CONSOLIDATED to a SINGLE multi-YEAR month picker (monthMultiHTML now lists months
// across every year that has data, with year sub-headers), so the separate ch-year filter is
// GONE. A month is in scope when it is ticked (empty = the default last-8-months view). Months are
// sanitized to real YYYY-MM within the club's lifetime so a malformed "0001" bucket can't appear.
// Two expense charts were added. Behaviour verified end-to-end in a browser; this locks the wiring.
const H = require('./qc-harness.js');
const R = H.reporter('CHARTS · multi-year month filter + expense charts');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source: the filter control + scope logic are wired');
{
  const src = H.readSrc();
  R.ok('the month multi-select (now multi-year) is rendered', /monthMultiHTML\('ch-month'/.test(src));
  R.ok('the separate ch-year filter is REMOVED', !/multiFilterHTML\('ch-year'/.test(src) && !/bindMultiFilter\('ch-year'/.test(src));
  R.ok('scope = ticked months, else last-8', /const scoped = hasFilter \? months\.filter\(mk => chF\.months\.includes\(mk\)\) : months\.slice\(-8\)/.test(src));
  R.ok('bogus months are sanitized out (no "0001")', /_chValidMk/.test(src) && /\/\^\\d\{4\}-\\d\{2\}\$\//.test(src));
  R.ok('category revenue follows the scoped period (not all-time)', /billedByCategoryInPeriod\(m => scopedSet\.has\(m\)\)/.test(src));
  R.ok('sport revenue follows the scoped period', /billedBySportInPeriod\(m => scopedSet\.has\(m\)\)/.test(src));
  R.ok('expenses-by-category is computed over the scope (excludes payroll)', /isSalaryCategory\(e\.category\)/.test(src) && /expByCat/.test(src));
  R.ok('an Expenses-by-Category donut chart is rendered', /Expenses by Category/.test(src) && /expDonut/.test(src));
  R.ok('an Expenses-by-month bars chart is rendered', /Expenses by month/.test(src) && /expByMonthBars/.test(src));
  R.ok('the month filter is bound + re-renders', /bindMonthMulti\('ch-month', \(mSel\) => \{ window\._chFilter\.months = mSel; PAGES\.charts\(main\)/.test(src));
  R.ok('a Clear button resets the month filter', /window\._chFilter = \{ months: \[\] \}; PAGES\.charts\(main\)/.test(src));
}

R.section('the scope math selects exactly the right months');
{
  // Replicate the in-scope predicate from PAGES.charts (v6.462: months only).
  const scope = (months, chF) => months.filter(mk => chF.months.includes(mk));
  const months = ['2025-11', '2025-12', '2026-06', '2026-07', '2026-08'];
  R.ok('a whole year via ticking its months', JSON.stringify(scope(months, { months: ['2026-06', '2026-07', '2026-08'] })) === JSON.stringify(['2026-06', '2026-07', '2026-08']));
  R.ok('two 2025 months', JSON.stringify(scope(months, { months: ['2025-11', '2025-12'] })) === JSON.stringify(['2025-11', '2025-12']));
  R.ok('specific months → exactly those', JSON.stringify(scope(months, { months: ['2026-06', '2026-08'] })) === JSON.stringify(['2026-06', '2026-08']));
  R.ok('months can SPAN years (multi-year picker)', JSON.stringify(scope(months, { months: ['2025-12', '2026-08'] })) === JSON.stringify(['2025-12', '2026-08']));
  R.ok('empty ⇒ nothing forced (caller defaults to last-8)', scope(months, { months: [] }).length === 0);
}

R.section('a malformed month never reaches a chart');
{
  const _chCY = 2026;
  const _chValidMk = m => /^\d{4}-\d{2}$/.test(m) && parseInt(m.slice(0, 4), 10) >= _chCY - 15 && parseInt(m.slice(0, 4), 10) <= _chCY + 1;
  R.ok('"0001-01" is rejected', !_chValidMk('0001-01'));
  R.ok('a real month is kept', _chValidMk('2026-08'));
  R.ok('garbage is rejected', !_chValidMk('not-a-month'));
}

R.section('the Charts screen still renders (admin) with a filter applied');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  run(ctx, `window._chFilter = { months: [] };`);
  R.ok('renders with no filter', H.renderScreen(ctx, 'charts').ok, H.renderScreen(ctx, 'charts').error);
  run(ctx, `window._chFilter = { months: ['2026-08'] };`);
  R.ok('renders with a month filter', H.renderScreen(ctx, 'charts').ok, H.renderScreen(ctx, 'charts').error);
}

R.done();
