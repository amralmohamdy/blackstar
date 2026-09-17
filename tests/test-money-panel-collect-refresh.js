// v6.579 — two Due-screen / Money-panel bugs:
//  (1) payment-method chips didn't switch — _moneyMethod only flipped aria-pressed, but the highlight
//      was an inline style set once at render time and no CSS keyed off aria-pressed. Now the highlight
//      moves to the clicked chip.
//  (2) after Collect, a now-settled member stayed on the Due list — _moneyCollect reopened the panel but
//      never re-rendered the page behind it. It now calls render() before reopening.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.579 · money-panel method switch + collect refresh');
const src = H.readSrc();

R.section('bug 1 — payment method chip highlight follows the click');
R.ok('_moneyMethod sets aria-pressed per chip', /_moneyMethod = function[\s\S]{0,700}setAttribute\('aria-pressed', String\(on\)\)/.test(src));
R.ok('_moneyMethod moves the border highlight to the selected chip', /x\.style\.borderColor = on \? 'var\(--blue\)' : ''/.test(src));
R.ok('_moneyMethod moves the background highlight to the selected chip', /x\.style\.background = on \? 'rgba\(91,141,239,\.1\)' : ''/.test(src));
R.ok('_moneyMethod still updates the hidden mp-method value', /_moneyMethod = function[\s\S]{0,800}getElementById\('mp-method'\); if \(h\) h\.value = v;/.test(src));

R.section('bug 2 — Collect refreshes the list behind the panel');
R.ok('_moneyCollect re-renders the page before reopening the panel', /if \(typeof render === 'function'\) render\(\);\s*window\.moneyPanel\(memberId\);/.test(src));

R.section('functional — a fully-collected member nets to zero due (would drop off the list)');
{
  const ctx = H.makeCtx({ today: '2026-09-17', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings = state.settings || {};
    state.members = [{ id: 1, name: 'Ghita Bakrim', status: 'Active', expiryDate: '2026-10-16',
      subscriptions: [{ activity: 'Kick Boxing', coachId: 1, totalClasses: 8, start: '2026-09-01', status: 'active', invoiceNumber: 'INV986733' }] }];
    state.coaches = [{ id: 1, name: 'Aziz', rate: 30, role: 'coach', active: true }];
    state.invoices = [{ id: 986733, ref: 'INV986733', customerId: 1, category: 'Membership', sport: 'Kick Boxing',
      date: '2026-09-01', month: '2026-09', amount: 400, amountPaid: 0, coachId: 1,
      lineItems: [{ sport: 'Kick Boxing', coachId: 1, price: 400 }], payments: [] }];
  `);
  const before = run(`Math.round(memberOutstanding(1) * 100) / 100`);
  R.ok('before paying: member owes 400', before === 400, before);
  // Collect the full amount through the SAME append-only primitive the panel uses.
  run(`recordPayment(state.invoices[0], { amount: 400, method: 'cash', date: '2026-09-17', sport: 'Kick Boxing' });`);
  const after = run(`Math.round(memberOutstanding(1) * 100) / 100`);
  R.ok('after paying 400: member owes 0 (drops off Due list after render)', after === 0, after);
  const bal = run(`Math.round(invoiceBalance(state.invoices[0]) * 100) / 100`);
  R.ok('invoice balance is 0 (fully paid, append-only)', bal === 0, bal);
}

R.done();
