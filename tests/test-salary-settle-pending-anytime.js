// v6.410 — "Settle pending in full" must be reachable even when the month is ALREADY PAID or the
// coach is OVER-ADVANCED (Aziz's case). Before, the settle option only appeared on the FIRST payment
// of an unpaid month, so an already-paid coach could never close their pending. _salSettlePending()
// pays the pending as cash and stamps the memberships so they never carry / true-up again.
const H = require('./qc-harness.js');
const R = H.reporter('SALARY · settle pending anytime (paid / over-advanced)');
const run = (c, s) => H.vm.runInContext(s, c);

// A member enrolled this month, 4 of 12 attended → attended base + a real pending remainder.
// Aziz is ALREADY marked paid for June (a settled record), like the screenshot.
function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.settings = state.settings || {}; state.settings.commissionBasis = 'attendance'; state.settings.auditEnabled = true;   /* v6.580: audit is opt-in — enable it to test the audit rows */
    state.coaches = [{ id:4, name:'Aziz', rate:60, active:'Y', commissionRate:60 }];
    state.members = [{ id:7001, name:'New Student', coachId:4, sport:'Kick Boxing',
      enrollments:[{ sport:'Kick Boxing', coachId:4, classes:12, price:900 }],
      subscriptions:[{ id:'sa', activity:'Kick Boxing', coachId:4, start:'2026-06-05', end:'2026-09-05', totalClasses:12, attendedClasses:4, status:'Active' }],
      dailyAttendance:{ '2026-06': { 'Kick Boxing': { '05':'Y','06':'Y','07':'Y','08':'Y' } } } }];
    state.invoices = [{ id:8888, ref:'INV-A', customerId:7001, date:'2026-06-05', month:'2026-06', sport:'Kick Boxing', amount:900, amountPaid:900, category:'Membership', coachId:4, lineItems:[{ sport:'Kick Boxing', coachId:4, classes:12, price:900 }] }];
    state.salaries = [{ id:100, coachId:4, kind:'paid', month:'2026-06', target:0, payments:[{ id:'x', amount:0, date:'2026-06-30', method:'cash' }] }];
    state.expenses = [];
    window.confirm = () => true;                                   // auto-accept the settle confirm
    window.confirmSaved = function(m,o){ if (o && o.onOk) { try { o.onOk(); } catch(_){} } return Promise.resolve({ok:true}); };
    window.render = function(){};                                  // the harness DOM can't do a full repaint
  `);
}

R.section('fixture: an already-PAID coach who still has pending');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const p = run(ctx, `computeMonthlyPay(4,'2026-06')`);
  R.ok('pending is real (8 classes × 75 × 60% = 360)', Math.round(p.commissionPending) === 360, p.commissionPending);
  // v6.560: a 0-value settlement on a coach who actually earned a net (180) now correctly reads as
  // NOT-fully-paid (he's owed his attended net), instead of the old zero-settlement "paid" quirk.
  // The settle-pending flow below is independent of this status and still works.
  R.ok('a paid record exists and the attended net is not fully paid', !!p.salaryRecord && p.paidStatus !== 'paid', p.paidStatus);
}

R.section('settling pays it as cash + closes it (no carry next month)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `window._salSettlePending(4, '2026-06')`);
  const after = run(ctx, `computeMonthlyPay(4,'2026-06')`);
  R.ok('this month pending drops to 0 (settled)', Math.round(after.commissionPending) === 0, after.commissionPending);
  R.ok('the pending was recorded as a cash payment (paidTotal += 360)', Math.round(after.paidTotal) === 360, after.paidTotal);
  R.ok('a Salary expense of 360 was booked (real cash out)', run(ctx, `state.expenses.some(e => e._salaryAutoExpense && Math.round(e.amount)===360)`) === true);
  R.ok('the membership is stamped commissionSettled = the settle month', run(ctx, `state.members[0].subscriptions[0].commissionSettled`) === '2026-06', run(ctx, `state.members[0].subscriptions[0].commissionSettled`));
  R.ok('NEXT month the coach earns 0 for those students (they keep training, no double-pay)', Math.round((run(ctx, `computeMonthlyPay(4,'2026-07').commissionBase`) || 0) * 100) / 100 === 0);
  R.ok('the settle is audited', run(ctx, `(state.auditLog||[]).some(a=>a.action==='salary.settlePending')`) === true);
}

R.section('UNDO settle — gives the pending back and re-opens the students');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `window._salSettlePending(4, '2026-06')`);
  const settledPending = run(ctx, `computeMonthlyPay(4,'2026-06').salaryRecord.settledPending`);
  R.ok('after settling, settledPending is recorded (360)', Math.round(settledPending) === 360, settledPending);
  const expensesAfterSettle = run(ctx, `state.expenses.length`);

  run(ctx, `window._salUndoSettlePending(4, '2026-06')`);
  R.ok('after undo, the pending is BACK (360)', Math.round(run(ctx, `computeMonthlyPay(4,'2026-06').commissionPending`)) === 360);
  R.ok('the membership is RE-OPENED (commissionSettled cleared)', run(ctx, `state.members[0].subscriptions[0].commissionSettled`) == null, run(ctx, `state.members[0].subscriptions[0].commissionSettled`));
  R.ok('the settle payment is removed (settledPending back to 0)', Math.round(run(ctx, `(computeMonthlyPay(4,'2026-06').salaryRecord||{}).settledPending || 0`)) === 0);
  R.ok('the settle Salary expense is removed', run(ctx, `state.expenses.filter(e=>e._salaryAutoExpense).length`) === (expensesAfterSettle - 1));
  R.ok('undo is audited', run(ctx, `(state.auditLog||[]).some(a=>a.action==='salary.undoSettlePending')`) === true);
}

R.section('nothing-to-settle is refused (no phantom payment)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `window._salSettlePending(4, '2026-06')`);   // first settle → pending now 0
  const expensesAfterFirst = run(ctx, `state.expenses.length`);
  run(ctx, `window._salSettlePending(4, '2026-06')`);   // second settle → nothing pending
  R.ok('a second settle records NO extra payment (pending already 0)', run(ctx, `state.expenses.length`) === expensesAfterFirst, run(ctx, `state.expenses.length`));
}

R.section('the row exposes Settle even when already PAID (source + render)');
{
  const src = H.readSrc();
  R.ok('_salSettlePending is defined', /window\._salSettlePending = function/.test(src));
  R.ok('the row shows Settle for a PAID row with unsettled pending', /p\.paidStatus === 'paid' \? settleBtn : ''/.test(src));
  R.ok('the Settle button calls _salSettlePending, not the (ineffective) pay modal', /_salSettlePending\(\$\{p\.coachId\}, '\$\{p\.month\}'\)/.test(src));
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx); run(ctx, `window._salMonth='2026-06';`);
  R.ok('Salaries renders', H.renderScreen(ctx, 'salaries').ok);
}

R.done();
