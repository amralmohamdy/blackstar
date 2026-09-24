// v6.605 — Reports screen trimmed per owner: removed the standalone "Expenses by Category" bar card
// and, from Visual insights, Revenue vs Cost, Net Profit trend, Expenses by month, the Expenses-by-
// Category donut, and New Members. Kept: Revenue by Category, Revenue by Sport, Top Expenses,
// Coach Performance. (Assert on the SCREEN's _chartsHTML block, not the separate print-summary path.)
const H = require('./qc-harness.js');
const R = H.reporter('v6.605 · reports screen trim');

const src = H.readSrc();
// Extract the on-screen charts block: const _chartsHTML = ` ... `;
const m = src.match(/const _chartsHTML = `([\s\S]*?)`;/);
const charts = m ? m[1] : '';

R.section('Visual insights trimmed to Revenue-by-Category + Coach Performance');
{
  R.ok('the _chartsHTML block was found', !!charts);
  R.ok('Revenue vs Cost chart removed', !/Revenue vs Cost/.test(charts));
  R.ok('Net Profit trend chart removed', !/Net Profit trend/.test(charts));
  R.ok('Expenses by month chart removed', !/Expenses by month/.test(charts));
  R.ok('Expenses by Category donut removed', !/Expenses by Category/.test(charts));
  R.ok('New Members chart removed', !/New Members/.test(charts));
  R.ok('Revenue by Category kept', /Revenue by Category/.test(charts));
  R.ok('Coach Performance kept', /Coach Performance/.test(charts));
}

R.section('standalone Expenses-by-Category bar card removed from the screen body');
{
  // that card was the ONLY place using fmt(d.expensesTotal) in the reports body.
  R.ok('the Expenses-by-Category bar card is gone', !/fmt\(d\.expensesTotal\)/.test(src));
  R.ok('Revenue by Sport is now a full-width card', /<div class="card mb-3">\s*<div class="card-header"><div><div class="card-title">Revenue by Sport/.test(src));
}

R.section('reports screen still renders');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin', today: '2026-07-24' }));
  const r = H.renderScreen(ctx, 'reports');
  R.ok('PAGES.reports renders without error', r.ok, r.error);
}

R.section('v6.615 — report sections are collapsible');
{
  R.ok('rep-body render wires _wireCardCollapse', /_wireCardCollapse\(\$\('#rep-body'\)\)/.test(src));
}

R.section('v6.610 — Renewals shown beside New Members in the same KPI box');
{
  R.ok('report computes renewals in the period', /const _repRenewals = \(state\.members \|\| \[\]\)\.reduce\([\s\S]{0,140}inPeriodDate\(r\.start \|\| r\.createdAt/.test(src));
  R.ok('the New Members box shows both 🆕 new + 🔄 renewals', /New Members[\s\S]{0,220}🆕 \$\{d\.newMembers\}[\s\S]{0,80}🔄 <span[\s\S]{0,40}\$\{_repRenewals\}/.test(src));
}

R.done();
