// v6.550 — the Salaries table PAID badge now shows the ACTUAL AMOUNT PAID (p.paidTotal), not just
// the date. The pay target is frozen at pay time, so when more attendance is added AFTER a coach is
// paid, the row stays "Paid" against the old target while live net grows — which made it look like
// the full (larger) net had been paid. Now the badge reads "Paid <amount> · <date>" and, when the
// live net has risen past what was actually paid, a "▲ <delta> more owed since paid" note appears.
// Display-only: no pay math or data changed. (Owner request: "show in 'paid' label amount get paid,
// because sometime we added more attendance after coach get paid".)
const H = require('./qc-harness.js');
const R = H.reporter('SALARIES · paid badge shows amount actually paid');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  // The fully-paid badge now prints the actual paid amount, not only the date.
  R.ok('paid badge shows the actual amount paid (fmt(p.paidTotal))',
    /t\('Paid', 'مدفوع'\)\} \$\{fmt\(p\.paidTotal\)\}/.test(src));
  R.ok('paid badge still shows the pay date when present',
    /\$\{p\.paidDate \? ' · ' \+ fmtDate\(p\.paidDate\) : ''\}/.test(src));
  R.ok('a "more owed since paid" note appears when live net exceeds what was paid',
    /\(p\.net - p\.paidTotal\) > 0\.5/.test(src) && /more owed since paid/.test(src));
}

R.section('functional: paid 465, net later rose to 677 (attendance added after payment)');
{
  const ctx = H.makeCtx({ today: '2026-09-06', role: 'admin' });
  const res = run(ctx, `
    (function(){
      const coachId = 501;
      state.coaches = [{ id: coachId, name: 'Aziz', rate: 30 }];
      state.members = []; state.invoices = [];
      state.settings = state.settings || {}; state.settings.commissionBasis = 'attendance';
      const month = '2026-08';
      // Coach was PAID 465 (frozen target 465), but the live net is now 677 (more attendance added).
      state.salaries = [{ id: 'rec-a', coachId, month, kind: 'paid', target: 465,
        payments: [{ id: 'p1', amount: 465, method: 'cash', date: '2026-09-01' }],
        snapshotNet: 465 }];
      state.expenses = [{ id: 'e-a', _salaryAutoExpense: true, salaryId: 'rec-a', category: 'Salary', amount: 465, month }];
      // Stub the commission so live net = 30% × 2257 ≈ 677 without seeding a full member/invoice tree.
      window.computeAttendanceCommission = function(){ return { base: 2257, pendingBase: 0, lines: [], pendingLines: [] }; };
      const p = computeMonthlyPay(coachId, month);
      return { paidStatus: p.paidStatus, paidTotal: p.paidTotal, paidTarget: p.paidTarget,
               net: Math.round(p.net), delta: Math.round(p.net - p.paidTotal) };
    })()
  `);
  R.ok('row is marked PAID (target was frozen at pay time)', res.paidStatus === 'paid', JSON.stringify(res));
  R.ok('paidTotal reflects the ACTUAL amount paid (465)', Math.round(res.paidTotal) === 465, JSON.stringify(res));
  R.ok('the badge would show "Paid 465", not the larger live net', Math.round(res.paidTotal) !== res.net, JSON.stringify(res));
  R.ok('live net has risen past what was paid → "more owed" note triggers', res.delta > 0.5, JSON.stringify(res));
}

R.section('functional: paid in full, nothing added after → no "more owed" note');
{
  const ctx = H.makeCtx({ today: '2026-09-06', role: 'admin' });
  const res = run(ctx, `
    (function(){
      const coachId = 502;
      state.coaches = [{ id: coachId, name: 'Solo', rate: 30 }];
      state.members = []; state.invoices = [];
      state.settings = state.settings || {}; state.settings.commissionBasis = 'attendance';
      const month = '2026-08';
      state.salaries = [{ id: 'rec-b', coachId, month, kind: 'paid', target: 300,
        payments: [{ id: 'p1', amount: 300, method: 'cash', date: '2026-09-01' }], snapshotNet: 300 }];
      state.expenses = [];
      window.computeAttendanceCommission = function(){ return { base: 1000, pendingBase: 0, lines: [], pendingLines: [] }; };
      const p = computeMonthlyPay(coachId, month);
      return { paidStatus: p.paidStatus, delta: Math.round(p.net - p.paidTotal), paidTotal: p.paidTotal };
    })()
  `);
  R.ok('row is PAID', res.paidStatus === 'paid', JSON.stringify(res));
  R.ok('no extra owed → note does NOT trigger', !(res.delta > 0.5), JSON.stringify(res));
}

R.done();
