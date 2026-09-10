// v6.561 — the Duplicate-Invoices "exact" (auto-removable) tier keyed MEMBERSHIPS/products by calendar
// MONTH, so a member who joined early in a month and RENEWED at month-end (e.g. 01 Aug + 31 Aug, 30
// days apart, same items/amount) was flagged as an EXACT duplicate — and "Remove all exact duplicates"
// would DELETE the renewal (real revenue loss). Fix: an "exact" duplicate must be the SAME DATE (a
// genuine double-entry) for every category, matching how rentals/camp already work. Renewals weeks
// apart are not flagged; near-but-not-same-day repeats surface only as "possible" (manual review).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.561 · monthly renewal in the same month is NOT an exact duplicate');
const run = (c, s) => vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('exact-tier period keys on the DATE, not the month', /const period = inv\.date \|\| inv\.month \|\| '';/.test(src));
  R.ok('the old month-based membership key is gone', !/const period = isRepeatable\(inv\) \? \(inv\.date \|\| ''\) : \(inv\.month/.test(src));
}

R.section('runtime — renewal 30 days later (same month) is NOT exact');
{
  const ctx = H.makeCtx({ today: '2026-09-10', role: 'admin' });
  const res = run(ctx, `(function(){
    state.coaches = [{ id: 1, name: 'Aya' }, { id: 2, name: 'Jennifer' }];
    state.members = [{ id: 100, name: 'Alliyah', expiryDate: '2026-10-01' }];
    state.settings = {};
    const line = () => [{ sport: 'Kick Boxing', coachId: 1, price: 380 }, { sport: 'Gymnastic', coachId: 2, price: 380 }];
    state.invoices = [
      { id: 1, ref: 'INV-A', customerId: 100, category: 'Membership', date: '2026-08-01', month: '2026-08', amount: 760, amountPaid: 760, lineItems: line() },
      { id: 2, ref: 'INV-B', customerId: 100, category: 'Membership', date: '2026-08-31', month: '2026-08', amount: 760, amountPaid: 760, lineItems: line() }
    ];
    const g = detectDuplicateInvoices();
    return { exact: g.filter(x=>x.tier==='exact').length, possible: g.filter(x=>x.tier==='possible').length };
  })()`);
  R.ok('the 01-Aug + 31-Aug renewal is NOT flagged exact', res.exact === 0, JSON.stringify(res));
  R.ok('and 30 days apart is beyond the 7-day possible window too → not flagged at all', res.possible === 0, JSON.stringify(res));
}

R.section('runtime — a genuine SAME-DAY double-entry IS still exact');
{
  const ctx = H.makeCtx({ today: '2026-09-10', role: 'admin' });
  const res = run(ctx, `(function(){
    state.coaches = [{ id: 1, name: 'Aya' }];
    state.members = [{ id: 101, name: 'Dup', expiryDate: '2026-10-01' }];
    state.settings = {};
    state.invoices = [
      { id: 1, ref: 'D1', customerId: 101, category: 'Membership', date: '2026-08-01', month: '2026-08', amount: 380, amountPaid: 380, lineItems: [{ sport: 'Kick Boxing', coachId: 1, price: 380 }] },
      { id: 2, ref: 'D2', customerId: 101, category: 'Membership', date: '2026-08-01', month: '2026-08', amount: 380, amountPaid: 380, lineItems: [{ sport: 'Kick Boxing', coachId: 1, price: 380 }] }
    ];
    const g = detectDuplicateInvoices();
    const ex = g.filter(x=>x.tier==='exact');
    return { exact: ex.length, refs: ex.length ? ex[0].rows.map(r=>r.inv.ref).sort() : [] };
  })()`);
  R.ok('same-day identical membership IS an exact duplicate', res.exact === 1, JSON.stringify(res));
  R.ok('both copies are in the group', JSON.stringify(res.refs) === JSON.stringify(['D1','D2']), JSON.stringify(res));
}

R.done();
