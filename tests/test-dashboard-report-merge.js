// v6.574 — merge Dashboard + Reports + Charts into Dashboard (summary, month/year/all filter) + Report
// (details incl. charts). This suite verifies the FINANCIAL CORRECTNESS: every Dashboard/Report figure
// derives from ONE canonical source (financeAgg → billed/collected/due/salaries), the 3 divergences are
// reconciled (expense month resolver, coach commission via computeMonthlyPay, revenue-by-sport basis),
// and the period model (month/year/all) sums correctly.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.574 · Dashboard/Report merge — stats correctness');
const r2 = n => Math.round(n * 100) / 100;
const src = H.readSrc();

function seed(ctx) {
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'' };
    state.coaches = [{ id:1, name:'A', rate:30, role:'coach', active:true, fixedSalary:400 }];
    state.members = [{ id:10, name:'M', status:'Active', firstRegistration:'2026-09-03', expiryDate:'2026-12-01',
      subscriptions:[{ activity:'Swimming', coachId:1, totalClasses:8, start:'2026-09-01', end:'2026-12-01', status:'active', amountPaid:600 }] }];
    state.sales = [];
    state.invoices = [
      { id:900, ref:'S9', customerId:10, category:'Membership', date:'2026-09-01', month:'2026-09', amount:1000, coachId:1,
        lineItems:[{ sport:'Swimming', coachId:1, classes:8, price:1000 }], payments:[{ amount:600, month:'2026-09' }] },
      { id:901, ref:'S8', customerId:10, category:'Membership', date:'2026-08-01', month:'2026-08', amount:500, coachId:1,
        lineItems:[{ sport:'Boxing', coachId:1, classes:5, price:500 }], payments:[{ amount:500, month:'2026-08' }] }
    ];
    state.expenses = [
      { id:1, category:'Rent', amount:200, month:'2026-09', date:'2026-09-02' },
      { id:2, category:'Maintenance', amount:100, date:'2026-09-15' },   // NO month → must resolve via date
      { id:3, category:'Salary', amount:300, month:'2026-09', date:'2026-09-20' },   // settlement → excluded from P&L
      { id:4, category:'Rent', amount:999, month:'2026-09', deleted:true }            // deleted → excluded
    ];
  `, ctx);
}
const q = (ctx, s) => vm.runInContext(s, ctx);

R.section('expenseMonth — one resolver (date-only expense is no longer invisible)');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  R.ok('date-only expense resolves to its date month', q(ctx, `expenseMonth({date:'2026-09-15'})`) === '2026-09');
  R.ok('explicit month wins over date', q(ctx, `expenseMonth({month:'2026-08',date:'2026-09-15'})`) === '2026-08');
}

R.section('Dashboard month scope — figures equal the canonical helpers');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' }); seed(ctx);
  const s = q(ctx, `computeStats({type:'month',value:'2026-09'})`);
  R.ok('Revenue = billedInMonth(2026-09)', r2(s.currRevenue) === r2(q(ctx, `billedInMonth('2026-09')`)) && r2(s.currRevenue) === 1000);
  R.ok('Expenses = Rent 200 + date-only Maintenance 100 = 300 (Salary + deleted excluded)', r2(s.currExpenses) === 300, 'got ' + s.currExpenses);
  R.ok('Salaries = salariesEarnedInMonth(2026-09)', r2(s.currSalaries) === r2(q(ctx, `salariesEarnedInMonth('2026-09')`)));
  R.ok('Collected = collectedInMonth(2026-09) = 600', r2(s.currCollected) === r2(q(ctx, `collectedInMonth('2026-09')`)) && r2(s.currCollected) === 600);
  R.ok('Due = dueInMonth(2026-09) = 400', r2(s.currDue) === r2(q(ctx, `dueInMonth('2026-09')`)) && r2(s.currDue) === 400);
  R.ok('Net = revenue − expenses − salaries', r2(s.currProfit) === r2(s.currRevenue - s.currExpenses - s.currSalaries));
  R.ok('Billed = Collected + Due (identity holds)', r2(s.currCollected + s.currDue) === r2(s.currRevenue));
}

R.section('Dashboard YEAR + ALL-TIME scope sum the months correctly');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' }); seed(ctx);
  const y = q(ctx, `computeStats({type:'year',value:'2026'})`);
  R.ok('Year revenue = Sep 1000 + Aug 500 = 1500', r2(y.currRevenue) === 1500, 'got ' + y.currRevenue);
  R.ok('Year expenses = 300 (Sep only; Aug had none)', r2(y.currExpenses) === 300);
  const a = q(ctx, `computeStats({type:'all'})`);
  R.ok('All-time revenue = 1500', r2(a.currRevenue) === 1500);
  R.ok('All-time has no previous period (prevRevenue 0)', r2(a.prevRevenue) === 0);
}

R.section('Revenue-by-Sport now ties out to headline Revenue (basis aligned)');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' }); seed(ctx);
  const bySportTotal = q(ctx, `(function(){ const o=billedBySportInPeriod(m=>m&&m.slice(0,4)==='2026'); return Object.values(o).reduce((s,v)=>s+v,0); })()`);
  const headline = q(ctx, `billedInPeriod(m=>m&&m.slice(0,4)==='2026')`);
  R.ok('Σ revenue-by-sport === billedInPeriod for the year', r2(bySportTotal) === r2(headline) && r2(headline) === 1500, 'bySport=' + bySportTotal + ' headline=' + headline);
}

R.section('source — reconciliations + merge wiring');
R.ok('financeAgg is the single money aggregate', /function financeAgg\(months\)/.test(src));
R.ok('Report expenses use the unified expenseMonth + deleted guard', /const exps = state\.expenses\.filter\(e => !e\.deleted && inPeriod\(expenseMonth\(e\)\)\);/.test(src));
R.ok('Report coach commission uses computeMonthlyPay (not line×rate)', /const comm = _scopedMonths\.reduce\(\(s, mk\) => s \+ \(\(typeof computeMonthlyPay === 'function'\) \? \(computeMonthlyPay\(c\.id, mk\)\.commissionAmount/.test(src));
R.ok('Report folds in the Charts visuals (Visual insights)', /Visual insights/.test(src) && /const _chartsHTML =/.test(src));
R.ok('Dashboard filter is month/year/all (period selector)', /id="dash-period"/.test(src) && /window\._dashPeriod = v === 'all'/.test(src));
R.ok('Charts is hidden from the Main menu', /charts:\s*\{ label: 'Charts',[^\n]*hidden: true/.test(src));

R.done();
