// v6.525 — the Salaries "By payment" basis now pays rate% of the amount ACTUALLY PAID that month
// (full rate, attendance ignored, no carry-forward), split across an invoice's coach lines by fee,
// counted in the month of the payment date. (Was rate% of the full charged fee in the billing month.)
// "By attendance" is unchanged.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.525 · payment basis = commission on amount paid that month');
const src = H.readSrc();

R.section('source');
R.ok('payment branch sums payments, not the full line fee', /commissionBase \+= pAmt \* shareRatio;/.test(src));
R.ok('it attributes a payment by the coach fee / total fee ratio', /const shareRatio = coachFee \/ totalFee;/.test(src));
R.ok('it counts payments in the payment month (not the billing month)', /else if \(monthKey && pKey !== monthKey\) continue;/.test(src));
R.ok('the old "full line fee in billing month" credit is gone', !/commissionBase \+= \(parseFloat\(li\.price\) \|\| 0\);/.test(src));

function ctxWith(basis, setup) {
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  vm.runInContext(`state.settings={commissionBasis:${JSON.stringify(basis)}};` + setup, ctx);
  return ctx;
}

R.section('runtime — full payment vs partial vs paid-in-a-different-month');
{
  const setup = `
    state.coaches=[{id:9,name:'Priv',rate:60,role:'coach',active:true}];
    state.members=[{id:1,name:'A',expiryDate:'2026-12-01',status:'Active',
      subscriptions:[{activity:'Kick-Boxing (Private)',coachId:9,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:900,invoiceNumber:'I1'}],
      dailyAttendance:{'2026-08':{'Kick-Boxing (Private)':{'2':'Y','5':'Y'}}}}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:900,coachId:9,
      lineItems:[{sport:'Kick-Boxing (Private)',coachId:9,classes:8,price:900}],payments:[]}];`;
  // (a) full 900 paid in Aug → 60% × 900 = 540
  let ctx = ctxWith('payment', setup + `state.invoices[0].payments=[{amount:900,date:'2026-08-10',month:'2026-08'}];`);
  R.ok('full 900 paid in Aug → 540', Math.round((vm.runInContext(`computeMonthlyPay(9,'2026-08')`, ctx).commissionAmount || 0) * 100) / 100 === 540);
  // (b) only 300 paid in Aug → 60% × 300 = 180
  ctx = ctxWith('payment', setup + `state.invoices[0].payments=[{amount:300,date:'2026-08-10',month:'2026-08'}];`);
  R.ok('partial 300 paid in Aug → 180', Math.round((vm.runInContext(`computeMonthlyPay(9,'2026-08')`, ctx).commissionAmount || 0) * 100) / 100 === 180);
  // (c) paid in SEPT → nothing in Aug (no carry, month-scoped by payment date)
  ctx = ctxWith('payment', setup + `state.invoices[0].payments=[{amount:900,date:'2026-09-03',month:'2026-09'}];`);
  R.ok('paid in Sept → 0 for Aug (counted in the payment month)', (vm.runInContext(`computeMonthlyPay(9,'2026-08')`, ctx).commissionAmount || 0) === 0);
  R.ok('paid in Sept → 540 for Sept', Math.round((vm.runInContext(`computeMonthlyPay(9,'2026-09')`, ctx).commissionAmount || 0) * 100) / 100 === 540);
  // (d) NO carry-forward: nothing pends
  ctx = ctxWith('payment', setup + `state.invoices[0].payments=[{amount:300,date:'2026-08-10',month:'2026-08'}];`);
  R.ok('payment basis never pends (no carry-forward)', (vm.runInContext(`computeMonthlyPay(9,'2026-08')`, ctx).commissionPending || 0) === 0);
}

R.section('runtime — a payment on a MULTI-coach invoice is split by fee share');
{
  const setup = `
    state.coaches=[{id:1,name:'A',rate:30,role:'coach',active:true},{id:2,name:'B',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'M',expiryDate:'2026-12-01',status:'Active',
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:0,invoiceNumber:'I1'},
                     {activity:'Swimming',coachId:2,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:0,invoiceNumber:'I1'}]}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:1000,
      lineItems:[{sport:'Karate',coachId:1,classes:8,price:400},{sport:'Swimming',coachId:2,classes:8,price:600}],
      payments:[{amount:500,date:'2026-08-10',month:'2026-08'}]}];`;
  const ctx = ctxWith('payment', setup);
  const a = Math.round((vm.runInContext(`computeMonthlyPay(1,'2026-08')`, ctx).commissionBase || 0) * 100) / 100;
  const b = Math.round((vm.runInContext(`computeMonthlyPay(2,'2026-08')`, ctx).commissionBase || 0) * 100) / 100;
  R.ok('coach A base = 500 × 400/1000 = 200', a === 200, 'a=' + a);
  R.ok('coach B base = 500 × 600/1000 = 300', b === 300, 'b=' + b);
}

R.section('runtime — attendance basis is UNCHANGED (still prorates + pends)');
{
  const setup = `
    state.coaches=[{id:9,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'A',expiryDate:'2026-12-01',status:'Active',
      subscriptions:[{activity:'Karate',coachId:9,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:800,invoiceNumber:'I1'}],
      dailyAttendance:{'2026-08':{'Karate':{'2':'Y','5':'Y','9':'Y','12':'Y'}}}}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:800,coachId:9,
      lineItems:[{sport:'Karate',coachId:9,classes:8,price:800}],payments:[{amount:800,date:'2026-08-01',month:'2026-08'}]}];`;
  const ctx = ctxWith('attendance', setup);
  const p = vm.runInContext(`computeMonthlyPay(9,'2026-08')`, ctx);
  R.ok('attendance: 4/8 attended → base 400 (prorated)', Math.round((p.commissionBase || 0) * 100) / 100 === 400, 'base=' + p.commissionBase);
  R.ok('attendance: the other 400 pends (carry-forward intact)', Math.round((p.commissionPendingBase || 0) * 100) / 100 === 400, 'pend=' + p.commissionPendingBase);
}

R.done();
