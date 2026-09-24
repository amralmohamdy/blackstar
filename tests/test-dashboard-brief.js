// v6.605 — Dashboard trimmed to a brief summary: added a Renewals KPI (count of memberships renewed
// in the period) and removed Revenue vs Expenses, Members by Sport, Top Coaches, Recent Invoices and
// the Monthly Summary table (those live on Reports). Kept: Needs-attention, KPIs, strip, revenue cards,
// renewal-potential, Data & Cloud Sync.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.605 · brief dashboard + renewals KPI');

R.section('renewals-per-period count + KPI');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin', today: '2026-07-24' }));
  vm.runInContext(`
    window._dashPeriod = { type: 'all' };   // count every renewal whose start month is a data month
    const a = state.members.find(x => x.id === 101);
    a.renewals = [{ activity:'Swimming', start:'2026-07-05' }, { activity:'Swimming', start:'2026-07-20' }];
    const b = state.members.find(x => x.id === 102);
    b.renewals = [{ activity:'Kick Boxing', start:'2026-07-10' }];
  `, ctx);
  const r = H.renderScreen(ctx, 'dashboard');
  R.ok('dashboard renders without error', r.ok, r.error);
  R.ok('a Renewals KPI is shown', /Renewals/.test(r.html) && /🔄/.test(r.html), (r.html||'').slice(0,60));
  R.ok('the count = 3 renewals across the period', /class="kpi-value num">3</.test(r.html) || /">3<\/div>/.test(r.html), 'expected 3');
}

R.section('removed sections are gone; kept sections remain');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin', today: '2026-07-24' }));
  const r = H.renderScreen(ctx, 'dashboard');
  R.ok('Revenue vs Expenses chart removed', !/Revenue vs Expenses/.test(r.html));
  R.ok('Members by Sport chart removed', !/Members by Sport/.test(r.html));
  R.ok('Top Coaches by Students removed', !/Top Coaches by Students/.test(r.html));
  R.ok('Recent Invoices removed', !/Recent Invoices/.test(r.html));
  R.ok('Monthly Summary table removed', !/Monthly Summary/.test(r.html));
  // kept
  R.ok('KPIs kept (Total Revenue, Net Profit)', /Total Revenue/.test(r.html) && /Net Profit/.test(r.html));
  R.ok('Needs-attention kept', /Needs attention today/.test(r.html));
  R.ok('revenue detail cards kept (Coaching Revenue)', /Coaching Revenue/.test(r.html));
  R.ok('Data & Cloud Sync kept', /Data & Cloud Sync/.test(r.html));
}

R.section('source: draw fns are guarded (no null-deref after removal)');
{
  const src = H.readSrc();
  R.ok('drawRevenueChart guards a missing container', /function drawRevenueChart\(\)\s*\{\s*const container = \$\('#rev-chart'\); if \(!container\) return;/.test(src));
  R.ok('drawRecentInvoices guards a missing container', /const container = \$\('#recent-invoices'\); if \(!container\) return;/.test(src));
  R.ok('renewals counted from m.renewals in the dash period', /for \(const _r of \(_m\.renewals \|\| \[\]\)\)[\s\S]{0,160}renewalsThisPeriod\+\+/.test(src));
}

R.done();
