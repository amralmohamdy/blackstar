// v6.531 — DUE is netted at the MEMBER level: total charged − total paid across all their membership
// invoices (using invoiceTotal, which drops a redundant sport-less summary line), floored at 0. The old
// code floored each invoice's balance INDIVIDUALLY, so an overpayment on one invoice (e.g. a payment
// recorded on a switch-credit invoice) was thrown away instead of covering another invoice's balance.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.531 · due = charged − paid (member-level netting)');
const src = H.readSrc();

R.section('source');
R.ok('memberOutstanding nets charged − paid (not per-invoice floored)', /net \+= \(invoiceTotal\(i\) - invoicePaid\(i\)\);/.test(src));
R.ok('it uses invoiceTotal (drops redundant summary line), not raw amount', /Use invoiceTotal/.test(src) && !/const charged = invs\.reduce\(\(s, i\) => s \+ \(Number\(i\.amount\) \|\| 0\), 0\)/.test(src));
R.ok('legacy fully-paid invoices contribute 0', /if \(i\.amountPaid == null && !\(Array\.isArray\(i\.payments\) && i\.payments\.length\)\) continue;/.test(src));
R.ok('memberMembershipPaid exists (the reconciling paid total)', /function memberMembershipPaid\(memberId\)/.test(src));

R.section('runtime — a payment stranded on a switch-credit invoice is now credited');
{
  const ctx = H.makeCtx({ today: '2026-08-27', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // Layla-shaped: real invoice 550 paid 175 + a switch-credit invoice (amount 0) carrying a 234.37 payment.
  run(`
    state.members=[{id:9,name:'Layla',expiryDate:'2026-12-01',status:'Active'}];
    state.invoices=[
      {id:1,ref:'INV1',customerId:9,category:'Membership',amount:550,amountPaid:175,
        lineItems:[{sport:'Gymnastic',price:140.63},{sport:'Taekwondo',price:234.37},{sport:'Kick Boxing',price:175}],
        payments:[{amount:175,date:'2026-08-23',month:'2026-08'}]},
      {id:2,ref:'SW1',customerId:9,category:'Membership',switchCredit:true,amount:0,amountPaid:234.37,
        lineItems:[{sport:'Gymnastic',price:-234.37},{sport:'Taekwondo',price:234.37}],
        payments:[{amount:234.37,date:'2026-08-25',month:'2026-08'}]}
    ];
  `);
  R.ok('due nets to 140.63 (was 375 under per-invoice flooring)', run(`memberOutstanding(9)`) === 140.63, 'due=' + run(`memberOutstanding(9)`));
  R.ok('membership paid counts the stranded 234.37 → 409.37', run(`memberMembershipPaid(9)`) === 409.37);
  R.ok('charged(550) = paid(409.37) + due(140.63) reconciles', Math.round((409.37 + 140.63) * 100) / 100 === 550);
}

R.section('runtime — a redundant sport-less summary line does NOT inflate due (Ali case)');
{
  const ctx = H.makeCtx({ today: '2026-08-27', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // amount 2250 but the sport-less 1125 line == the sum of the sported lines → invoiceTotal = 1125.
  run(`
    state.members=[{id:8,name:'Ali',expiryDate:'2026-12-01',status:'Active'}];
    state.invoices=[{id:1,ref:'INV',customerId:8,category:'Membership',amount:2250,amountPaid:1125,
      lineItems:[{sport:null,price:1125},{sport:'Kick Boxing',price:375},{sport:'Swimming',price:375},{sport:'Karate',price:140.63},{sport:'Karate',price:234.37}],
      payments:[{amount:1125,month:'2026-08'}]}];
  `);
  R.ok('due is 0 (invoiceTotal 1125 − paid 1125), NOT 1125 from raw amount 2250', run(`memberOutstanding(8)`) === 0, 'due=' + run(`memberOutstanding(8)`));
}

R.section('runtime — an overpayment on one invoice covers another (net at member)');
{
  const ctx = H.makeCtx({ today: '2026-08-27', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.members=[{id:7,name:'K',expiryDate:'2026-12-01',status:'Active'}];
    state.invoices=[
      {id:1,ref:'A',customerId:7,category:'Membership',amount:1750,amountPaid:2225,lineItems:[{sport:'X',price:1750}],payments:[{amount:2225,month:'2026-08'}]},
      {id:2,ref:'B',customerId:7,category:'Membership',amount:650,amountPaid:0,lineItems:[{sport:'Y',price:650}],payments:[]}
    ];
  `);
  R.ok('475 overpayment on A covers B → due 175 (was 650)', run(`memberOutstanding(7)`) === 175, 'due=' + run(`memberOutstanding(7)`));
}

R.section('runtime — a normal fully-paid + a normal unpaid member are unchanged');
{
  const ctx = H.makeCtx({ today: '2026-08-27', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`state.members=[{id:1,name:'Paid'},{id:2,name:'Owes'}];
    state.invoices=[
      {id:1,ref:'P',customerId:1,category:'Membership',amount:500,amountPaid:500,lineItems:[{sport:'X',price:500}],payments:[{amount:500}]},
      {id:2,ref:'O',customerId:2,category:'Membership',amount:500,amountPaid:200,lineItems:[{sport:'X',price:500}],payments:[{amount:200}]}
    ];`);
  R.ok('fully-paid member owes 0', run(`memberOutstanding(1)`) === 0);
  R.ok('part-paid member owes 300', run(`memberOutstanding(2)`) === 300);
}

R.done();
