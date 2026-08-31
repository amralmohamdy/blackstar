// v6.543 — invoicePaid ignored a REVERSAL when a stale amountPaid was higher. It returned
// max(amountPaid, dedupedLedger); a fully-reversed payment (+588 +137 −725, net 0) with a
// device-left amountPaid=725 read as PAID → the member showed no UNPAID badge though they owe the full
// amount (Abdulrahman Ali A Alshahrani, while his identical brother Abdulwahab — amountPaid 0 — showed
// UNPAID). Fix: when the ledger carries a deliberate correction (_correction row or a negative amount),
// it is authoritative → use the ledger sum, not max(). Otherwise keep the max() guard (protects a
// merge-clobbered ledger from wrongly INCREASING the balance).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.543 · invoicePaid respects corrections');
const src = H.readSrc();

R.section('source');
R.ok('a correction/negative row makes the ledger authoritative', /_hasCorrection \? led : Math\.max\(Number\(inv\.amountPaid\) \|\| 0, led\)/.test(src));
R.ok('correction detected via _correction OR negative amount', /p\._correction === true \|\| \(Number\(p\.amount\) \|\| 0\) < 0/.test(src));

R.section('runtime');
{
  const ctx = H.makeCtx({ today: '2026-08-30', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);

  // A) stale amountPaid=725 + a −725 correction (net 0) → must read as UNPAID
  run(`state.invoices=[{id:1,ref:'X',customerId:1,category:'Membership',amount:725,amountPaid:725,
    lineItems:[{sport:'KB',price:725}],
    payments:[{amount:588,date:'2026-08-27'},{amount:137,date:'2026-08-27'},{amount:-725,date:'2026-08-27',_correction:true}]}];
    state.members=[{id:1,name:'A',expiryDate:'2026-10-01',status:'Active',subscriptions:[{activity:'KB',coachId:1,invoiceNumber:'X'}]}];`);
  R.ok('reversed payment → invoicePaid 0 (not the stale 725)', run(`invoicePaid(state.invoices[0])`) === 0);
  R.ok('  → memberOutstanding 725 (UNPAID badge shows)', run(`memberOutstanding(1)`) === 725 && run(`memberOutstanding(1)>0.5`) === true);

  // B) a negative REFUND row (no _correction flag) is also honoured
  run(`state.invoices=[{id:2,ref:'Y',customerId:2,category:'Membership',amount:500,amountPaid:500,
    lineItems:[{sport:'KB',price:500}],payments:[{amount:500,date:'2026-08-01'},{amount:-200,date:'2026-08-10'}]}];
    state.members=[{id:2,name:'B',expiryDate:'2026-10-01',status:'Active',subscriptions:[{activity:'KB',coachId:2,invoiceNumber:'Y'}]}];`);
  R.ok('refund −200 honoured: invoicePaid 300 (500 − 200), not max(500,300)', run(`invoicePaid(state.invoices[0])`) === 300);
  R.ok('  → member owes 200', run(`memberOutstanding(2)`) === 200);

  // C) NO correction: the max() guard is preserved (a merge-clobbered ledger cannot increase debt)
  run(`state.invoices=[{id:3,ref:'Z',customerId:3,category:'Membership',amount:600,amountPaid:600,
    lineItems:[{sport:'KB',price:600}],payments:[{amount:600,date:'2026-08-01'}]}];
    state.members=[{id:3,name:'C',expiryDate:'2026-10-01',status:'Active',subscriptions:[{activity:'KB',coachId:3,invoiceNumber:'Z'}]}];`);
  R.ok('no correction: fully-paid stays paid (invoicePaid 600)', run(`invoicePaid(state.invoices[0])`) === 600 && run(`memberOutstanding(3)`) === 0);
  // a clobbered ledger (rows lost → sum too low) with no negatives must NOT increase the balance
  run(`state.invoices[0].payments=[{amount:100,date:'2026-08-01'}];`);   // ledger clobbered to 100, amountPaid still 600
  R.ok('clobbered ledger (no negatives) keeps amountPaid (max guard): 600, not 100', run(`invoicePaid(state.invoices[0])`) === 600);
}

R.done();
