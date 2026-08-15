// v6.500 — Salaries: pick a month AND an optional "up to day" (scoped to that month) → each coach's pay
// is calculated from the 1st of the month up to and including that day. The month dropdown stays ENABLED
// and in sync (was disabled when a settle date was set). Engine: computeMonthlyPay(id, null, uptoDate).
const H = require('./qc-harness.js');
const R = H.reporter('SALARIES · month + up-to-day filter');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('the UI: month stays enabled, day picker scoped to the month');
ok('the "up to day" date input exists', /id="sal-date"/.test(src));
ok('the day picker is scoped to the selected month (min/max)', /min="\$\{filter\.month\}-01" max="\$\{_salMonthEnd\(filter\.month\)\}"/.test(src));
ok('the month dropdown is NOT disabled when a settle date is set', !/id="sal-month" class="btn ghost" \$\{filter\.settleDate \? 'disabled/.test(src));
ok('picking a day syncs the month dropdown (no longer disables it)', /const mo = filter\.settleDate\.slice\(0, 7\); filter\.month = mo/.test(src));
ok('changing the month re-scopes / clears an out-of-range day', /if \(filter\.settleDate && \(filter\.settleDate < dEl\.min \|\| filter\.settleDate > dEl\.max\)\)/.test(src));
ok('a settle date computes pay via the uptoDate path', /upto \? computeMonthlyPay\(c\.id, null, upto\) : computeMonthlyPay\(c\.id, filter\.month\)/.test(src));

R.section('runtime: from the 1st of the month up to the chosen day');
const ctx = H.makeCtx({ today: '2026-07-31' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[{id:1,name:'C',rate:100,role:'coach',active:'Y'}]; state.settings={commissionBasis:'payment'};");
run("state.members=[{id:9,name:'M',subscriptions:[]}];");
run(`state.invoices=[
  {id:1,customerId:9,date:'2026-07-05',month:'2026-07',category:'Membership',activityType:'subscription',coachId:1,amount:400,payments:[{amount:400,date:'2026-07-05'}],lineItems:[{sport:'Boxing',coachId:1,classes:8,price:400}]},
  {id:2,customerId:9,date:'2026-07-25',month:'2026-07',category:'Membership',activityType:'subscription',coachId:1,amount:300,payments:[{amount:300,date:'2026-07-25'}],lineItems:[{sport:'Karate',coachId:1,classes:6,price:300}]}];`);
ok('whole July = 700', run("(computeMonthlyPay(1,'2026-07')||{}).gross") === 700);
ok('up to July 15 = 400 (excludes the 25 Jul invoice)', run("(computeMonthlyPay(1,null,'2026-07-15')||{}).gross") === 400);
ok('up to July 25 = 700', run("(computeMonthlyPay(1,null,'2026-07-25')||{}).gross") === 700);

R.done();
