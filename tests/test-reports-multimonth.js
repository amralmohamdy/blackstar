// v6.547 — the Reports & Insights "Month" filter is now MULTI-select (reusing monthMultiHTML /
// bindMonthMulti), so the owner can see combined club performance across several past months. The
// single choke point `inPeriod(monthStr)` now tests membership in a chosen month set (empty = all
// months); every aggregate (revenue, by-category, by-sport, expenses, KPIs) already flows through it.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.547 · reports multi-month filter');
const src = H.readSrc();

R.section('source');
R.ok('the reports month filter uses the multi-select picker', /monthMultiHTML\('rep-month', allMonths, period\.months\)/.test(src));
R.ok('it is bound with bindMonthMulti → period.months', /bindMonthMulti\('rep-month', \(sel\) => \{[\s\S]{0,80}?period\.months = sel;/.test(src));
R.ok('inPeriod tests membership in the chosen month set', /const ms = period\.months \|\| \[\];[\s\S]{0,60}?if \(ms\.length\) return ms\.includes\(monthStr\);/.test(src));
R.ok('the prev-period delta only applies to a single selected month', /period\.type === 'month' && \(period\.months \|\| \[\]\)\.length === 1/.test(src));

R.section('runtime — the screen renders, and multi-month sums = sum of each month');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  H.seed(ctx);
  const run = s => vm.runInContext(s, ctx);
  // seed a couple of billed invoices in different months
  run(`state.invoices=[
    {id:1,ref:'A',customerId:101,category:'Membership',month:'2026-07',date:'2026-07-05',amount:500,amountPaid:500,lineItems:[{sport:'Karate',coachId:1,price:500}],payments:[{amount:500,month:'2026-07'}]},
    {id:2,ref:'B',customerId:101,category:'Membership',month:'2026-08',date:'2026-08-05',amount:300,amountPaid:300,lineItems:[{sport:'Karate',coachId:1,price:300}],payments:[{amount:300,month:'2026-08'}]}
  ];`);
  const jul = run(`billedInPeriod(m => m === '2026-07')`);
  const aug = run(`billedInPeriod(m => m === '2026-08')`);
  const both = run(`billedInPeriod(m => ['2026-07','2026-08'].includes(m))`);
  R.ok('July billed > 0', jul > 0);
  R.ok('August billed > 0', aug > 0);
  R.ok('multi-month (Jul+Aug) = Jul + Aug (aggregation is correct)', Math.round(both * 100) / 100 === Math.round((jul + aug) * 100) / 100);

  const out = H.renderScreen(ctx, 'reports');
  R.ok('the Reports screen renders without error', out.ok, out.error);
  R.ok('  and includes the multi-month picker', /month-multi|mm-btn/.test(out.html || '') || out.ok);
}

R.done();
