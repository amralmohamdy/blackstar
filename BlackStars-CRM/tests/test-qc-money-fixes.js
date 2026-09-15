// v6.532 — two confirmed money bugs from the QC audit:
//  (A) payment-basis commission earned 0 on invoices that store amountPaid with NO payments[] ledger.
//  (B) family sibling-split left a phantom due: it set inv.amount to the share but not the line prices,
//      and invoiceTotal sums lineItems (ignoring inv.amount), so each sibling showed fullPrice − share.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.532 · QC money fixes (payment-basis amountPaid + family split)');
const src = H.readSrc();

R.section('A — payment basis credits amountPaid when there is no payments[] ledger');
R.ok('computeMonthlyPay synthesises a payment from amountPaid', /if \(!_pays\.length && \(Number\(inv\.amountPaid\) \|\| 0\) > 0\)/.test(src));
R.ok('both Revenue-Detail rebuilds do the same', (src.match(/if \(!_rp\.length && \(Number\(inv\.amountPaid\) \|\| 0\) > 0\)/g) || []).length >= 2);
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'payment'};
    state.coaches=[{id:11,name:'Aziz',rate:60,role:'coach',active:true}];
    state.members=[{id:1,name:'M',expiryDate:'2026-12-01',status:'Active',subscriptions:[{activity:'KB',coachId:11,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I1'}]}];
    // fully paid via amountPaid, NO payments[] array
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-05',month:'2026-08',amount:960,amountPaid:960,coachId:11,lineItems:[{sport:'KB',coachId:11,classes:8,price:960}]}];
  `);
  R.ok('payment-basis coach earns 60% × 960 = 576 (was 0)', Math.round((run(`computeMonthlyPay(11,'2026-08')`).commissionAmount || 0) * 100) / 100 === 576);
}

R.section('B — family sibling split leaves NO phantom due');
R.ok('splitSiblingPayment rescales the invoice line prices to the share', /Rescale the line prices/.test(src));
{
  const ctx = H.makeCtx({ today: '2026-08-27', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // existing-invoice branch: each kid already has a full-price membership invoice.
  run(`
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.families=[{id:9,name:'Fam',familyTotal:650}];
    state.members=[{id:1,name:'A',familyId:9,expiryDate:'2026-12-01',status:'Active'},{id:2,name:'B',familyId:9,expiryDate:'2026-12-01',status:'Active'}];
    state.invoices=[
      {id:1,ref:'A',customerId:1,category:'Membership',amount:650,amountPaid:650,lineItems:[{sport:'Karate',coachId:1,price:650}],payments:[{amount:650}]},
      {id:2,ref:'B',customerId:2,category:'Membership',amount:650,amountPaid:650,lineItems:[{sport:'Karate',coachId:1,price:650}],payments:[{amount:650}]}
    ];
    splitSiblingPayment(state.members, 650);
  `);
  R.ok('KidA due = 0 after split (was 325 phantom)', run(`memberOutstanding(1)`) === 0, 'due=' + run(`memberOutstanding(1)`));
  R.ok('KidB due = 0 after split', run(`memberOutstanding(2)`) === 0);
  R.ok('KidA invoiceTotal == share 325 (line price rescaled)', run(`invoiceTotal(state.invoices[0])`) === 325 && run(`state.invoices[0].lineItems[0].price`) === 325);

  // new-invoice branch: a sibling with enrollments but no invoice yet.
  run(`
    state.members=[{id:3,name:'C1',familyId:9,expiryDate:'2026-12-01',status:'Active',enrollments:[{sport:'Karate',coachId:1,price:600,classes:8}]},{id:4,name:'C2',familyId:9,expiryDate:'2026-12-01',status:'Active',enrollments:[{sport:'Karate',coachId:1,price:600,classes:8}]}];
    state.invoices=[];
    splitSiblingPayment(state.members, 600);
  `);
  R.ok('new-branch sibling due = 0 (line prices scaled to 300 share)', run(`memberOutstanding(3)`) === 0, 'due=' + run(`memberOutstanding(3)`));
  R.ok('new-branch invoiceTotal == 300', run(`invoiceTotal(state.invoices.find(v=>v.customerId===3))`) === 300);
}

R.done();
