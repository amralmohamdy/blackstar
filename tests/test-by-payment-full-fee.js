// v6.525 — "By payment" pays the coach rate% of the amount ACTUALLY PAID that month (full rate,
// attendance irrelevant), split across the invoice's coach lines by fee, and NEVER counts a DELETED
// invoice. Reproduces the Aziz / Kayid case: a 960 membership paid in full in Aug, 1/8 attended, plus
// a deleted duplicate 960 invoice. Correct pay = 60% × 960 paid = 576 (once), attendance ignored.
const H = require('./qc-harness.js');
const R = H.reporter('BY-PAYMENT · paid-amount + deleted-invoice skip');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.settings = state.settings || {};
    state.settings.commissionBasis = 'payment';
    state.settings.commissionStartDate = '';
    state.coaches = [{ id: 11, name: 'Aziz', rate: 60, role: 'coach', active: true }];
    state.members = [{
      id: 256, name: 'Kayid Alshammari', sport: 'Kick Boxing', coachId: 11,
      joinDate: '2026-08-02', expiryDate: '2026-09-01', status: 'Active',
      enrollments: [{ sport: 'Kick Boxing', coachId: 11, classes: 8, price: 960 }],
      subscriptions: [{ _sid: 's256', activity: 'Kick Boxing', coachId: 11, totalClasses: 8,
                        start: '2026-08-02', end: '2026-09-01', status: 'active' }],
      // only 1 of 8 attended → attendance is IRRELEVANT on the payment basis.
      dailyAttendance: { '2026-08': { 'Kick Boxing': { '03': 'Y' } } }
    }];
    state.invoices = [
      // the LIVE invoice — PAID in full in Aug.
      { id: 861804851, ref: 'INV946350', customerId: 256, category: 'Membership', sport: 'Kick Boxing',
        date: '2026-08-02', month: '2026-08', amount: 960, coachId: 11,
        lineItems: [{ sport: 'Kick Boxing', coachId: 11, coach: 'Aziz', classes: 8, price: 960, billMonth: '2026-08' }],
        payments: [{ amount: 960, date: '2026-08-03', month: '2026-08' }] },
      // the DELETED duplicate — must NOT be paid, even though it too carries a payment.
      { id: 692043396, ref: 'INV946349', customerId: 256, category: 'Membership', sport: 'Kick Boxing',
        date: '2026-08-02', month: '2026-08', amount: 960, deleted: true,
        lineItems: [{ sport: 'Kick Boxing', coachId: 11, coach: 'Aziz', classes: 10, price: 960, billMonth: '2026-08' }],
        payments: [{ amount: 960, date: '2026-08-03', month: '2026-08' }] }
    ];
    state.expenses = []; state.salaries = [];
  `);
}

R.section('computeMonthlyPay pays rate% of the amount PAID, once, attendance ignored');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-31' }); seed(ctx);
  const base = run(ctx, `computeMonthlyPay(11, '2026-08').commissionBase`);
  const gross = run(ctx, `computeMonthlyPay(11, '2026-08').gross`);
  R.ok('commission base is the 960 PAID (not 120 attendance-prorated, not 1920 doubled)', base === 960, 'base=' + base);
  R.ok('gross = 60% × 960 = 576 (not 144, not 1152)', Math.abs(gross - 576) < 0.005, 'gross=' + gross);
  R.ok('no carry-forward — nothing pends', (run(ctx, `computeMonthlyPay(11, '2026-08').commissionPending`) || 0) === 0);
}

R.section('a DELETED invoice earns nothing (no phantom duplicate)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-31' }); seed(ctx);
  run(ctx, `state.invoices = state.invoices.filter(i => i.id !== 861804851);`);   // leave only the deleted one
  const gross = run(ctx, `computeMonthlyPay(11, '2026-08').gross`);
  R.ok('deleted-only → gross 0 (deleted invoice not counted even with a payment)', gross === 0, 'gross=' + gross);
}

R.section('a payment made in a LATER month is NOT counted in August (no carry, month-scoped by pay date)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-31' }); seed(ctx);
  run(ctx, `state.invoices.find(i=>i.id===861804851).payments=[{amount:960,date:'2026-09-04',month:'2026-09'}];`);
  R.ok('paid in Sept → Aug gross 0', run(ctx, `computeMonthlyPay(11, '2026-08').gross`) === 0);
  R.ok('paid in Sept → Sept gross 576', Math.abs(run(ctx, `computeMonthlyPay(11, '2026-09').gross`) - 576) < 0.005);
}

R.section('Summer Camp still earns nothing under by-payment');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-31' }); seed(ctx);
  run(ctx, `state.invoices.push({ id: 700, ref:'INV700', customerId:256, category:'Membership',
    date:'2026-08-02', month:'2026-08', amount:1500,
    lineItems:[{ sport: SUMMER_CAMP, coachId: 11, price: 1500, billMonth:'2026-08' }],
    payments:[{ amount:1500, date:'2026-08-05', month:'2026-08' }] });`);
  const gross = run(ctx, `computeMonthlyPay(11, '2026-08').gross`);
  R.ok('camp payment adds nothing → still 576', Math.abs(gross - 576) < 0.005, 'gross=' + gross);
}

R.section('source: payment basis skips deleted invoices + credits the amount PAID');
{
  const src = H.readSrc();
  R.ok('computeMonthlyPay payment loop skips deleted invoices', /for \(const inv of state\.invoices\) \{[\s\S]{0,300}if \(inv\.deleted\) continue;/.test(src));
  R.ok('it credits the coach share of each PAYMENT (not the full line fee)', /commissionBase \+= pAmt \* shareRatio;/.test(src));
  R.ok('Revenue-Detail builders skip deleted invoices', (src.match(/if \(inv\.deleted\) continue;\s*\/\/ v6\.449/g) || []).length >= 2);
}

R.done();
