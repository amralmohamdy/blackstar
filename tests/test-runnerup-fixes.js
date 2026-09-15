// v6.572 — the 5 "runner-up" bugs from the 2026-09-15 hunt, fixed by criticality.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.572 · runner-up fixes');
const r2 = n => Math.round(n * 100) / 100;
const src = H.readSrc();
const seed = (ctx, s) => vm.runInContext('Object.assign(state, ' + JSON.stringify(s) + ');', ctx);
const q = (ctx, s) => vm.runInContext(s, ctx);

// ── #1 (report ≠ payroll) — source assertions: the payment-basis Revenue-Detail rebuild now applies the
//    same exclusion + commission-start-date filters computeMonthlyPay uses. (UI fn renders a modal.)
R.section('#1 — Revenue-Detail (payment basis) mirrors payroll filters');
R.ok('rebuild loop skips a member excluded from this coach\'s salary', /if \(typeof isExcludedFromCoachSalary === 'function' && isExcludedFromCoachSalary\(coachId, inv\.customerId\)\) continue;[^\n]*match computeMonthlyPay/.test(src));
R.ok('rebuild honours the commission start date on payments', /const _commStartP = \(state\.settings && state\.settings\.commissionStartDate\) \|\| '';/.test(src) && /if \(_commStartP && _pDate && String\(_pDate\)\.slice\(0, 10\) < _commStartP\) continue;/.test(src));

// ── #2 coachEarnings — String() coachId + deleted-member guard ─────────────────────────────────────────
R.section('#2 — coachEarnings: string coachId counts; deleted member ignored');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx, {
    settings: { commissionBasis: 'payment', commissionStartDate: '' },
    coaches: [{ id: 2, name: 'Zakaria', rate: 30, fixedSalary: 0 }],
    members: [{ id: 10, name: 'Live', deleted: false }, { id: 11, name: 'Gone', deleted: true }],
    invoices: [
      { id: 900, ref: 'A', customerId: 10, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 500, coachId: '2', lineItems: [{ sport: 'Swimming', coachId: '2', price: 500 }], payments: [{ amount: 500, month: '2026-09' }] },
      { id: 901, ref: 'B', customerId: 11, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 500, coachId: '2', lineItems: [{ sport: 'Swimming', coachId: '2', price: 500 }], payments: [{ amount: 500, month: '2026-09' }] },
    ],
  });
  const e = q(ctx, `coachEarnings(state.coaches[0], '2026-09')`);
  R.ok('string coachId "2" is credited (revenue 500, not 0)', e.revenue === 500, JSON.stringify(e));
  R.ok('the deleted member\'s invoice is NOT counted (1 student, not 2)', e.students === 1, 'students=' + e.students);
}

// ── #3 Member-Commission — cross-month Mixed splits by ATTENDED month (reconciles with Salaries) ───────
R.section('#3 — cross-month Mixed reconciles Member-Commission with Salaries');
{
  const ctx = H.makeCtx({ today: '2026-10-20', role: 'admin' });
  seed(ctx, {
    settings: { commissionBasis: 'attendance', commissionStartDate: '' },
    coaches: [{ id: 1, name: 'Aziz', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'M', status: 'Active', expiryDate: '2026-11-01', coachId: null, sport: 'Mixed',
      enrollments: [{ sport: 'Mixed', coachId: null, classes: 8, price: 800, start: '2026-09-01' }],
      subscriptions: [{ activity: 'Mixed', coachId: null, totalClasses: 8, start: '2026-09-01', end: '2026-10-31', status: 'active', attendedClasses: 0, amountPaid: 800, invoiceNumber: 'INVMX' }],
      mixedAttendance: { '2026-09': { '05': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '10': { coachId: 1, sport: 'Karate', mark: 'Y' } }, '2026-10': { '03': { coachId: 1, sport: 'Boxing', mark: 'Y' } } } }],
    invoices: [{ id: 900, ref: 'INVMX', customerId: 10, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 800, coachId: null, lineItems: [{ sport: 'Mixed', coachId: null, classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-09' }] }] });
  const sep = q(ctx, `computeMemberCommissions('2026-09').filter(r=>r.sport==='Mixed').reduce((s,r)=>s+r.commissionBase,0)`);
  const oct = q(ctx, `computeMemberCommissions('2026-10').filter(r=>r.sport==='Mixed').reduce((s,r)=>s+r.commissionBase,0)`);
  const salarySep = q(ctx, `computeAttendanceCommission(1,'2026-09').base`);
  const salaryOct = q(ctx, `computeAttendanceCommission(1,'2026-10').base`);
  R.ok('report Sep base (2 classes × 100 = 200) matches Salaries Sep', sep === 200 && salarySep === 200, 'report=' + sep + ' salary=' + salarySep);
  R.ok('report Oct base (1 class × 100 = 100) matches Salaries Oct', oct === 100 && salaryOct === 100, 'report=' + oct + ' salary=' + salaryOct);
  R.ok('a Mixed line billed in Sep still SHOWS in Oct (bill-month gate bypassed)', q(ctx, `computeMemberCommissions('2026-10').some(r=>r.sport==='Mixed')`) === true);
}

// ── #4 deleteSportFull on Mixed clears mixedAttendance (accurate count, no orphans) ────────────────────
R.section('#4 — clearing a Mixed sport removes its mixedAttendance');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx, { members: [{ id: 10, name: 'M', mixedAttendance: { '2026-09': { '05': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '10': { coachId: 2, sport: 'Swim', mark: 'Y' } } } }] });
  const removed = q(ctx, `_clearSportAttendanceWindow(state.members[0], 'Mixed', '2026-09-01', '2026-09-30')`);
  R.ok('reports the real removed count (2, not 0)', removed === 2, 'removed=' + removed);
  R.ok('mixedAttendance is emptied (no orphaned data)', q(ctx, `Object.keys(state.members[0].mixedAttendance||{}).length`) === 0);
}

// ── #5 Citadel — Football/Swimming done under a Mixed package feed the facility share ──────────────────
R.section('#5 — Citadel counts Football/Swimming attended under a Mixed package');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx, {
    settings: { sports: [{ name: 'Mixed', enabled: true }, { name: 'Swimming', enabled: true }, { name: 'Football', enabled: true }], citadelRate: 30 },
    coaches: [{ id: 1, name: 'A', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'M', coachId: null, sport: 'Mixed',
      enrollments: [{ sport: 'Mixed', coachId: null, classes: 8, price: 800, start: '2026-09-01' }],
      subscriptions: [{ activity: 'Mixed', coachId: null, totalClasses: 8, start: '2026-09-01', end: '2026-10-01', status: 'active', amountPaid: 800, invoiceNumber: 'INVMX' }],
      // 4 Swimming + 2 Football + 2 Boxing = 8; perClass 100 → swimming 400, football 200, boxing 0
      mixedAttendance: { '2026-09': { '02': { coachId: 1, sport: 'Swimming', mark: 'Y' }, '03': { coachId: 1, sport: 'Swimming', mark: 'Y' }, '04': { coachId: 1, sport: 'Swimming', mark: 'Y' }, '05': { coachId: 1, sport: 'Swimming', mark: 'Y' }, '06': { coachId: 1, sport: 'Football', mark: 'Y' }, '07': { coachId: 1, sport: 'Football', mark: 'Y' }, '08': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '09': { coachId: 1, sport: 'Boxing', mark: 'Y' } } } }],
    invoices: [{ id: 900, ref: 'INVMX', customerId: 10, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 800, coachId: null, lineItems: [{ sport: 'Mixed', coachId: null, classes: 8, price: 800 }] }],
  });
  const res = q(ctx, `citadelCompute(['2026-09'])`);
  R.ok('Swimming share = 4 classes × 100 = 400', r2(res.agg.swimming.membership) === 400, JSON.stringify(res.agg.swimming));
  R.ok('Football share = 2 classes × 100 = 200', r2(res.agg.football.membership) === 200, JSON.stringify(res.agg.football));
  R.ok('Boxing (no facility group) contributes nothing extra — grand = 600', r2(res.grand) === 600, 'grand=' + res.grand);
}

R.done();
