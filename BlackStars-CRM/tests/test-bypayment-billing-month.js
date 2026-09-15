// v6.555 — OWNER RULE for the "by payment / full amount" basis: a coach earns their % of the amount
// PAID, credited in the invoice's BILLING (enrolment) month — NOT split by the month each payment
// landed in. Real case: Aziz (Private), Tallal's 1,440 Kick-Boxing membership BILLED 29 Aug, paid
// 120 on 29 Aug + 1,320 on 1 Sep. Old behaviour split the commission (72 Aug + 792 Sep); the owner
// wants the whole 864 in Aug (billing month), nothing carried to Sep. Unpaid amounts still earn 0.
const H = require('./qc-harness.js');
const R = H.reporter('v6.555 · by-payment credits the BILLING month (no cross-month split)');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx, payments) {
  run(ctx, `
    state.settings = { commissionBasis: 'payment', commissionStartDate: '' };
    state.coaches = [{ id: 11, name: 'Aziz (Private)', rate: 60, role: 'coach', active: true }];
    state.members = [{ id: 700, name: 'Tallal', expiryDate: '2026-12-01', status: 'Active',
      subscriptions: [{ activity: 'Kick Boxing', coachId: 11, totalClasses: 12, start: '2026-08-29', status: 'active' }] }];
    state.invoices = [{ id: 986638, ref: 'INV986638', customerId: 700, category: 'Membership',
      date: '2026-08-29', month: '2026-08', amount: 1440, coachId: 11,
      lineItems: [{ sport: 'Kick Boxing', coachId: 11, classes: 12, price: 1440, billMonth: '2026-08' }],
      payments: ${payments} }];
    state.expenses = []; state.salaries = [];
  `);
}
const comm = (ctx, mo) => Math.round((run(ctx, `computeMonthlyPay(11, '${mo}').commissionAmount`) || 0) * 100) / 100;

R.section('split payment across Aug + Sep → all in the billing month (Aug)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-09-07' });
  seed(ctx, `[{amount:120,date:'2026-08-29',month:'2026-08'},{amount:1320,date:'2026-09-01',month:'2026-09'}]`);
  R.ok('Aug = 60% × 1,440 = 864 (whole membership in the billing month)', comm(ctx, '2026-08') === 864, 'aug=' + comm(ctx, '2026-08'));
  R.ok('Sep = 0 (the 1 Sep payment does NOT split into Sep)', comm(ctx, '2026-09') === 0, 'sep=' + comm(ctx, '2026-09'));
}

R.section('partial payment still earns only on what was PAID (no over-pay)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-09-07' });
  seed(ctx, `[{amount:120,date:'2026-08-29',month:'2026-08'}]`);   // only 120 of 1,440 paid so far
  R.ok('Aug = 60% × 120 = 72 (only the paid part)', comm(ctx, '2026-08') === 72, 'aug=' + comm(ctx, '2026-08'));
  R.ok('Sep = 0', comm(ctx, '2026-09') === 0);
}

R.section('a payment dated in a PRIOR month than billing still lands in the billing month');
{
  // Edge: invoice billed Sep, a payment mis-dated in Aug → credited in Sep (billing month), not Aug.
  const ctx = H.makeCtx({ role: 'admin', today: '2026-09-07' });
  run(ctx, `
    state.settings = { commissionBasis: 'payment', commissionStartDate: '' };
    state.coaches = [{ id: 11, name: 'Aziz (Private)', rate: 60, role: 'coach', active: true }];
    state.members = [{ id: 701, name: 'X', expiryDate: '2026-12-01', status: 'Active',
      subscriptions: [{ activity: 'Kick Boxing', coachId: 11, totalClasses: 8, start: '2026-09-01', status: 'active' }] }];
    state.invoices = [{ id: 5, ref: 'I5', customerId: 701, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 500, coachId: 11,
      lineItems: [{ sport: 'Kick Boxing', coachId: 11, classes: 8, price: 500, billMonth: '2026-09' }],
      payments: [{ amount: 500, date: '2026-08-30', month: '2026-08' }] }];
    state.expenses = []; state.salaries = [];
  `);
  R.ok('Sep (billing month) = 300', comm(ctx, '2026-09') === 300, 'sep=' + comm(ctx, '2026-09'));
  R.ok('Aug = 0 (payment date ignored for the month bucket)', comm(ctx, '2026-08') === 0, 'aug=' + comm(ctx, '2026-08'));
}

R.done();
