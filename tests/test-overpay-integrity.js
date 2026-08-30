// v6.538 — GENERAL money-integrity fix so profile/invoices/salaries stay correct:
//  (1) _memberMoneyRows.charged = the member's NET charge via invoiceTotal over ALL membership invoices
//      (drops redundant summary lines, same legacy-skip as memberOutstanding) — so Charged/Paid/Due are
//      over one set and reconcile, and a redundant "(none)" summary line no longer inflates Charged.
//  (2) A member-level OVERPAYMENT detector (_memberOverpayExcess / _paymentOverpayIssues) that flags only
//      members whose NET Paid exceeds NET Charged — an overpayment on one invoice that merely covers another
//      is NOT falsely flagged — plus an APPEND-ONLY correction (_correctInvoiceOverpay) that lands a negative
//      row on the most-overpaid invoice. Nothing is ever deleted; reversible; audit-logged; owner-reviewed.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.538 · overpayment integrity (member-netted, append-only)');
const src = H.readSrc();

R.section('source');
R.ok('member-level overpayment measure exists', /function _memberOverpayExcess\(memberId\)/.test(src));
R.ok('it nets like memberOutstanding (invoiceTotal − invoicePaid, legacy-skip)', /net \+= \(invoiceTotal\(i\) - invoicePaid\(i\)\);/.test(src));
R.ok('the detector is per-member (one entry per customer)', /_paymentOverpayIssues[\s\S]{0,400}?seen\.has\(mid\)/.test(src));
R.ok('the correction is append-only (pushes a negative _correction row, no delete)', /_correctInvoiceOverpay[\s\S]{0,600}?payments\.push\(\{[\s\S]{0,200}?_correction: true/.test(src));
R.ok('_memberMoneyRows.charged uses invoiceTotal over all membership invoices', /Charged = the member's NET charge across ALL membership invoices/.test(src));
R.ok('the Payment-ledger tool surfaces overpayments', /_paymentOverpayIssues\(\)/.test(src) && /_payOverpayFix/.test(src));

R.section('runtime — a redundant summary line no longer inflates Charged');
{
  const ctx = H.makeCtx({ today: '2026-08-28', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'Summary',expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:8,price:375},{sport:'Swimming',coachId:1,classes:8,price:375},{sport:'Karate',coachId:1,classes:8,price:375}],
      subscriptions:[{activity:'Kick Boxing',coachId:1,amountPaid:375,invoiceNumber:'I1'}]}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-06-17',month:'2026-06',amount:1125,coachId:1,amountPaid:1125,
      lineItems:[{sport:null,price:1125},{sport:'Kick Boxing',coachId:1,price:375},{sport:'Swimming',coachId:1,price:375},{sport:'Karate',coachId:1,price:375}],
      payments:[{amount:1125,date:'2026-06-17',month:'2026-06',method:'card'}]}];
  `);
  const md = run(`_memberMoneyRows(state.members[0])`);
  R.ok('Charged = 1125 (summary line dropped, not 2250)', Math.round(md.charged * 100) / 100 === 1125);
  R.ok('reconciles: Charged = Paid + Due', Math.abs(md.charged - (md.paidTotal + md.due)) < 0.02);
  R.ok('this member is NOT flagged as overpaid', run(`_memberOverpayExcess(1)`) <= 0.5);
}

R.section('runtime — offsetting invoices are NOT falsely flagged; a real overpayment IS');
{
  const ctx = H.makeCtx({ today: '2026-08-28', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[
      {id:10,name:'Balanced',expiryDate:'2026-12-01',status:'Active',enrollments:[{sport:'KB',coachId:1,classes:8,price:600}],subscriptions:[{activity:'KB',coachId:1,amountPaid:600,invoiceNumber:'B1'}]},
      {id:11,name:'RealOver',expiryDate:'2026-12-01',status:'Active',enrollments:[{sport:'KB',coachId:1,classes:8,price:400}],subscriptions:[{activity:'KB',coachId:1,amountPaid:400,invoiceNumber:'O1'}]}
    ];
    state.invoices=[
      // member 10: one invoice OVER by 600, another UNDER by 600 — nets to zero, must NOT be flagged
      {id:100,ref:'B1',customerId:10,category:'Membership',date:'2026-07-01',month:'2026-07',amount:600,coachId:1,amountPaid:1200,lineItems:[{sport:'KB',coachId:1,price:600}],payments:[{amount:1200,date:'2026-07-01',month:'2026-07',method:'cash'}]},
      {id:101,ref:'B2',customerId:10,category:'Membership',date:'2026-08-01',month:'2026-08',amount:600,coachId:1,amountPaid:0,lineItems:[{sport:'Swim',coachId:1,price:600}],payments:[]},
      // member 11: genuine double-pay — charge 400, paid 700
      {id:110,ref:'O1',customerId:11,category:'Membership',date:'2026-07-27',month:'2026-07',amount:400,coachId:1,amountPaid:700,lineItems:[{sport:'KB',coachId:1,price:400}],payments:[{amount:400,date:'2026-07-27',month:'2026-07',method:'cash'},{amount:300,date:'2026-08-09',month:'2026-08',method:'cash'}]}
    ];
  `);
  R.ok('the balanced (over+under) member is NOT flagged', run(`_memberOverpayExcess(10)`) <= 0.5);
  R.ok('the genuinely overpaid member IS flagged (excess 300)', Math.round(run(`_memberOverpayExcess(11)`) * 100) / 100 === 300);
  const issues = run(`_paymentOverpayIssues().map(x=>({mid:x.memberId,excess:x.excess,ref:x.inv.ref}))`);
  R.ok('the detector returns exactly the one overpaid member', issues.length === 1 && issues[0].mid === 11);
  R.ok('  targeting the over-paid invoice O1', issues[0].ref === 'O1');

  R.section('runtime — the correction is append-only and reconciles');
  const before = run(`state.invoices.find(i=>i.id===110).payments.length`);
  const corrected = run(`_correctInvoiceOverpay(state.invoices.find(i=>i.id===110))`);
  const after = run(`state.invoices.find(i=>i.id===110).payments.length`);
  R.ok('it corrected 300', Math.round(corrected * 100) / 100 === 300);
  R.ok('a row was APPENDED, none removed', after === before + 1);
  R.ok('the appended row is a negative _correction', run(`(function(){var p=state.invoices.find(i=>i.id===110).payments.slice(-1)[0];return p.amount===-300 && p._correction===true;})()`));
  R.ok('the original two payments survive (no data loss)', run(`state.invoices.find(i=>i.id===110).payments.filter(p=>p.amount===400||p.amount===300).length`) === 2);
  R.ok('member now reconciles (excess 0)', run(`_memberOverpayExcess(11)`) <= 0.5);
  R.ok('the balanced member is still untouched', run(`state.invoices.find(i=>i.id===100).payments.length`) === 1);
}

R.done();
