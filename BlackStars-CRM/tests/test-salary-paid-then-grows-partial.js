// v6.560 — when a coach is already PAID for a month and MORE commission is booked to that month
// afterwards (a new customer/payment), the month must AUTO-INCREASE and flip to PARTIALLY PAID with
// the new remaining — not stay "Paid". Fix: paidTarget = max(agreed target, live net); status/remaining
// then track the grown net, and the Pay dialog offers the new remaining. Real case: Aziz (Private),
// by payment — paid 792 for one customer, then two more customers booked to the month → owes the rest.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.560 · paid coach + new revenue → partially paid (remaining shown)');
const run = (c, s) => vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('paidTarget tracks the live net (max of agreed target and net)', /const paidTarget = paidRecord \? Math\.max\(salaryTarget\(paidRecord, net\), net\) : net;/.test(src));
  R.ok('Pay dialog uses computeMonthlyPay target/remaining', /const target = pay\.paidTarget;/.test(src) && /const remaining = pay\.paidRemaining;/.test(src));
}

R.section('runtime — by-payment coach paid 792, then more revenue booked → partial + remaining');
{
  const ctx = H.makeCtx({ today: '2026-09-15', role: 'admin' });
  const res = run(ctx, `(function(){
    const cid = 11;
    state.coaches = [{ id: cid, name: 'Aziz (Private)', rate: 60, role: 'coach', active: true, commissionBasis: 'payment' }];
    state.members = [{ id: 1, name: 'A', expiryDate: '2026-12-01', status: 'Active' }];
    state.settings = { commissionBasis: 'payment' };
    state.expenses = [];
    // Start: ONE September membership, 1,320 paid → 60% = 792.
    state.invoices = [{ id: 1, ref: 'I1', customerId: 1, category: 'Membership', date: '2026-09-02', month: '2026-09', amount: 1320, coachId: cid,
      lineItems: [{ sport: 'Kick Boxing', coachId: cid, price: 1320 }], payments: [{ amount: 1320, date: '2026-09-02', month: '2026-09' }] }];
    // Coach was PAID 792 for September.
    state.salaries = [{ id: 's1', coachId: cid, month: '2026-09', kind: 'paid', target: 792,
      payments: [{ id: 'p1', amount: 792, date: '2026-09-07', method: 'cash' }], snapshotNet: 792 }];
    const before = computeMonthlyPay(cid, '2026-09');
    // NOW two more September customers are booked (960 + 480 = 1,440 more paid → +864 commission).
    state.invoices.push({ id: 2, ref: 'I2', customerId: 1, category: 'Membership', date: '2026-09-09', month: '2026-09', amount: 960, coachId: cid,
      lineItems: [{ sport: 'Kick Boxing', coachId: cid, price: 960 }], payments: [{ amount: 960, date: '2026-09-09', month: '2026-09' }] });
    state.invoices.push({ id: 3, ref: 'I3', customerId: 1, category: 'Membership', date: '2026-09-09', month: '2026-09', amount: 480, coachId: cid,
      lineItems: [{ sport: 'Kick Boxing', coachId: cid, price: 480 }], payments: [{ amount: 480, date: '2026-09-09', month: '2026-09' }] });
    const after = computeMonthlyPay(cid, '2026-09');
    return {
      beforeNet: Math.round(before.net), beforeStatus: before.paidStatus, beforeRem: Math.round(before.paidRemaining),
      afterNet: Math.round(after.net), afterStatus: after.paidStatus, afterPaid: Math.round(after.paidTotal),
      afterTarget: Math.round(after.paidTarget), afterRem: Math.round(after.paidRemaining)
    };
  })()`);
  R.ok('before the new customers: fully PAID (792 of 792)', res.beforeStatus === 'paid' && res.beforeNet === 792 && res.beforeRem === 0, JSON.stringify(res));
  R.ok('salary auto-increased to 1,656 (792 + 864)', res.afterNet === 1656, JSON.stringify(res));
  R.ok('status flipped to PARTIAL', res.afterStatus === 'partial', JSON.stringify(res));
  R.ok('still shows 792 already paid', res.afterPaid === 792, JSON.stringify(res));
  R.ok('remaining = 864 (1,656 − 792)', res.afterRem === 864, JSON.stringify(res));
}

R.section('runtime — a DROP in net does NOT claw back a settled month');
{
  const ctx = H.makeCtx({ today: '2026-09-15', role: 'admin' });
  const res = run(ctx, `(function(){
    const cid = 12;
    state.coaches = [{ id: cid, name: 'C', rate: 60, role: 'coach', active: true, commissionBasis: 'payment' }];
    state.members = [{ id: 1, name: 'A', expiryDate: '2026-12-01', status: 'Active' }];
    state.settings = { commissionBasis: 'payment' }; state.expenses = [];
    // Agreed/paid 792, but current live net is only 500 (e.g. an invoice was later voided).
    state.invoices = [{ id: 1, ref: 'I1', customerId: 1, category: 'Membership', date: '2026-09-02', month: '2026-09', amount: 833.34, coachId: cid,
      lineItems: [{ sport: 'Kick Boxing', coachId: cid, price: 833.34 }], payments: [{ amount: 833.34, date: '2026-09-02', month: '2026-09' }] }];
    state.salaries = [{ id: 's1', coachId: cid, month: '2026-09', kind: 'paid', target: 792,
      payments: [{ id: 'p1', amount: 792, date: '2026-09-07' }], snapshotNet: 792 }];
    const p = computeMonthlyPay(cid, '2026-09'); // net ≈ 500, agreed 792
    return { net: Math.round(p.net), status: p.paidStatus, rem: Math.round(p.paidRemaining) };
  })()`);
  R.ok('net dropped below agreed → stays PAID (no clawback), remaining 0', res.status === 'paid' && res.rem === 0, JSON.stringify(res));
}

R.done();
