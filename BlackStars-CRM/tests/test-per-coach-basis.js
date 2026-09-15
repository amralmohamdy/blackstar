// v6.526 — each coach can be pinned to their OWN commission basis (Team/Coaches edit form). A coach's
// commissionBasis ('attendance' | 'payment') overrides the club-wide Salaries toggle for them only;
// blank falls back to the club setting. So a private coach = "By payment" while others = "By attendance".
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.526 · per-coach commission basis');
const src = H.readSrc();

R.section('source — form field + save + resolution');
R.ok('the coach form has a Commission basis selector', /<select id="c-basis">/.test(src));
R.ok('it offers Use-club-default / attendance / payment', /Use club default/.test(src) && /value="attendance"/.test(src) && /value="payment"/.test(src));
R.ok('the value is read on save', /const commissionBasis = \(\(\$\('#c-basis'\) \|\| \{\}\)\.value\) \|\| '';/.test(src));
R.ok('commissionBasis is persisted on add + edit', (src.match(/name, rate, fixedSalary, commissionBasis, payAttendedOnly, role: roleVal/g) || []).length >= 2);
R.ok('computeMonthlyPay resolves the coach basis first, else club setting', /const basis = coachBasis \|\| \(state\.settings && state\.settings\.commissionBasis\) \|\| 'payment';/.test(src));
R.ok('only valid coach values are honoured', /c\.commissionBasis === 'attendance' \|\| c\.commissionBasis === 'payment'/.test(src));

R.section('runtime — override wins over the club toggle');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'attendance'};   // club default = attendance
    state.coaches=[
      {id:1,name:'Private',rate:60,role:'coach',active:true,commissionBasis:'payment'},
      {id:2,name:'Regular',rate:30,role:'coach',active:true},
      {id:3,name:'PinnedAtt',rate:30,role:'coach',active:true,commissionBasis:'attendance'}
    ];
    state.members=[
      {id:1,name:'A',expiryDate:'2026-12-01',status:'Active',
        subscriptions:[{activity:'KB',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:900,invoiceNumber:'I1'}],
        dailyAttendance:{'2026-08':{KB:{'2':'Y','5':'Y'}}}},
      {id:2,name:'B',expiryDate:'2026-12-01',status:'Active',
        subscriptions:[{activity:'Karate',coachId:2,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:800,invoiceNumber:'I2'}],
        dailyAttendance:{'2026-08':{Karate:{'2':'Y','5':'Y','9':'Y','12':'Y'}}}}
    ];
    state.invoices=[
      {id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:900,coachId:1,lineItems:[{sport:'KB',coachId:1,classes:8,price:900}],payments:[{amount:900,date:'2026-08-05',month:'2026-08'}]},
      {id:2,ref:'I2',customerId:2,category:'Membership',date:'2026-08-01',month:'2026-08',amount:800,coachId:2,lineItems:[{sport:'Karate',coachId:2,classes:8,price:800}],payments:[{amount:800,date:'2026-08-01',month:'2026-08'}]}
    ];
  `);
  const p1 = run(`computeMonthlyPay(1,'2026-08')`);
  const p2 = run(`computeMonthlyPay(2,'2026-08')`);
  const p3 = run(`computeMonthlyPay(3,'2026-08')`);
  R.ok('pinned-payment coach uses payment basis', p1.basis === 'payment');
  R.ok('  → 60% × 900 paid = 540, no pending', Math.round(p1.commissionAmount * 100) / 100 === 540 && (p1.commissionPending || 0) === 0);
  R.ok('unpinned coach follows the club default (attendance)', p2.basis === 'attendance');
  R.ok('  → 30% × (4/8×800=400) = 120 earned, 400 base pends', Math.round(p2.commissionAmount * 100) / 100 === 120 && Math.round(p2.commissionPendingBase * 100) / 100 === 400);
  R.ok('a coach pinned to attendance stays attendance even if club flips to payment', (() => { run(`state.settings.commissionBasis='payment';`); return run(`computeMonthlyPay(3,'2026-08')`).basis === 'attendance'; })());
  // and the pinned-payment coach is unaffected by the club flip
  R.ok('pinned-payment coach unchanged when club=payment too', run(`computeMonthlyPay(1,'2026-08')`).basis === 'payment');
}

R.done();
