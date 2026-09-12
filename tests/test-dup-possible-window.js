// v6.564 — the "possible" duplicate window was ≤ 7 days, which flagged legitimate WEEKLY renewals /
// purchases (a member who buys a class or renews every 7 days: Tammim's weekly Football 100, Tallal's
// weekly Kick Boxing 120) as "possible duplicates" even though the dates differ by a full cycle. An
// accidental double-entry happens the same day (→ exact) or the next day; anything a week apart is a
// real renewal. Fix: the "possible" window is now ≤ 2 days.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.564 · possible-duplicate window is ≤ 2 days (weekly renewals not flagged)');
const run = (c, s) => vm.runInContext(s, c);

R.section('source wiring');
R.ok('possible clustering uses a ≤ 2 day window', /if \(days <= 2\) cluster\.push\(sorted\[i\]\);/.test(H.readSrc()) && !/if \(days <= 7\) cluster\.push/.test(H.readSrc()));

R.section('runtime — 7-day weekly purchases are NOT flagged; a 1-day re-entry still is');
{
  const ctx = H.makeCtx({ today: '2026-09-12', role: 'admin' });
  const res = run(ctx, `(function(){
    state.settings = {}; state.coaches = [{ id: 1, name: 'Coach' }];
    state.members = [{ id: 1, name: 'Tammim', expiryDate: '2026-12-01' }, { id: 2, name: 'DoubleEntry', expiryDate: '2026-12-01' }];
    const line = () => [{ sport: 'Football', coachId: 1, price: 100 }];
    state.invoices = [
      // Tammim — three WEEKLY Football 100 purchases (7 days apart): legitimate renewals.
      { id: 1, ref: 'T1', customerId: 1, category: 'Membership', date: '2026-08-27', month: '2026-08', amount: 100, amountPaid: 100, lineItems: line() },
      { id: 2, ref: 'T2', customerId: 1, category: 'Membership', date: '2026-09-03', month: '2026-09', amount: 100, amountPaid: 100, lineItems: line() },
      { id: 3, ref: 'T3', customerId: 1, category: 'Membership', date: '2026-09-10', month: '2026-09', amount: 100, amountPaid: 100, lineItems: line() },
      // DoubleEntry — the SAME invoice re-entered the NEXT day (a genuine near-duplicate).
      { id: 4, ref: 'X1', customerId: 2, category: 'Membership', date: '2026-09-05', month: '2026-09', amount: 100, amountPaid: 100, lineItems: line() },
      { id: 5, ref: 'X2', customerId: 2, category: 'Membership', date: '2026-09-06', month: '2026-09', amount: 100, amountPaid: 100, lineItems: line() }
    ];
    const g = detectDuplicateInvoices();
    const names = t => g.filter(x=>x.tier===t).map(x=>x.rows[0].memName).sort();
    return { exact: names('exact'), possible: names('possible') };
  })()`);
  R.ok('Tammim\'s 7-day weekly renewals are NOT flagged', !res.possible.includes('Tammim') && !res.exact.includes('Tammim'), JSON.stringify(res));
  R.ok('a genuine next-day (1 day) re-entry IS still flagged possible', res.possible.includes('DoubleEntry'), JSON.stringify(res));
}

R.done();
