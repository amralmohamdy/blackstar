// v6.439 — the Due Payment screen (and all money screens) read invoicePaid(), which used the
// cached `amountPaid` scalar. Multi-device merges desync that scalar from the immutable payments[]
// ledger: sometimes the ledger has an EXTRA distinct payment amountPaid missed (member owed less
// than shown), sometimes a DUPLICATE row (pid base `…#1`/`…#2`). invoicePaid now credits the HIGHER
// of amountPaid and the DEDUPLICATED ledger sum — correcting a stale amountPaid (due drops) while a
// merge-duplicate is counted once and a clobbered ledger can never INCREASE what a member owes.
const H = require('./qc-harness.js');
const R = H.reporter('INVOICE PAID · deduplicated ledger is the source of truth');
const run = (c, s) => H.vm.runInContext(s, c);
const ctx = H.makeCtx({ role: 'admin', today: '2026-08-02' });

const mk = (payments, amountPaid, total) => JSON.stringify({ id: 1, amount: total, amountPaid, lineItems: [{ sport: 'Swimming', price: total }], payments });

R.section('stale amountPaid — ledger has two DISTINCT payments the scalar missed');
{
  // 500 (Jun) + 500 (Jul), different pid bases → really paid 1000, but amountPaid stuck at 500.
  const inv = mk([{ amount: 500, date: '2026-06-14', method: 'cash', pid: 'c500|2026-06-14|cash#1' }, { amount: 500, date: '2026-07-13', method: 'cash', pid: 'a2026-07-13T00:00:00Z#1' }], 500, 2400);
  R.ok('invoicePaid credits the full 1000 (not the stale 500)', run(ctx, `invoicePaid(${inv})`) === 1000);
  R.ok('balance is 1400 (not 1900)', run(ctx, `invoiceBalance(${inv})`) === 1400);
}

R.section('merge DUPLICATE — two identical rows sharing a pid base count once');
{
  const inv = mk([{ amount: 634, date: '2026-06-22', method: 'card', pid: 'c634|2026-06-22|card#1' }, { amount: 634, date: '2026-06-22', method: 'card', pid: 'c634|2026-06-22|card#2' }], 634, 634);
  R.ok('the duplicate is collapsed → paid 634 (not 1268)', run(ctx, `invoicePaid(${inv})`) === 634);
  R.ok('balance is 0 (fully paid, no phantom over-count)', run(ctx, `invoiceBalance(${inv})`) === 0);
}

R.section('a clobbered ledger can never INCREASE what a member owes');
{
  // amountPaid says 760 but only one 380 row survived the merge — keep the higher (760), due stays 0.
  const inv = mk([{ amount: 380, date: '2026-06-25', method: 'cash', pid: 'c380|2026-06-25|cash#1' }], 760, 760);
  R.ok('invoicePaid keeps the higher amountPaid (760), not the lower ledger (380)', run(ctx, `invoicePaid(${inv})`) === 760);
  R.ok('balance stays 0 — the member is NOT wrongly billed 380', run(ctx, `invoiceBalance(${inv})`) === 0);
}

R.section('normal synced invoice + legacy invoice are unchanged');
{
  const synced = mk([{ amount: 500, date: '2026-07-01', method: 'cash', pid: 'c500|2026-07-01|cash#1' }], 500, 500);
  R.ok('a normally-synced invoice is unaffected (paid 500, balance 0)', run(ctx, `invoicePaid(${synced})`) === 500 && run(ctx, `invoiceBalance(${synced})`) === 0);
  R.ok('a legacy invoice with no ledger + no amountPaid is treated fully paid', run(ctx, `invoiceBalance({id:2, amount:300, lineItems:[{sport:'x',price:300}]})`) === 0);
  R.ok('pid-less ledger rows all count (no over-aggressive dedup)', run(ctx, `invoicePaid({id:3, amount:600, amountPaid:300, payments:[{amount:300,date:'2026-07-01',method:'cash'},{amount:300,date:'2026-07-05',method:'cash'}], lineItems:[{sport:'x',price:600}]})`) === 600);
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('invoicePaymentsSumDeduped helper exists', /function invoicePaymentsSumDeduped\(inv\)/.test(src));
  R.ok('invoicePaid takes the max of amountPaid and the deduped ledger', /Math\.max\(Number\(inv\.amountPaid\) \|\| 0, led\)/.test(src));
}

R.done();
