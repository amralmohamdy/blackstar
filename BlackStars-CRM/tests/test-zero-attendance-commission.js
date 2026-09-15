// v6.445 — ZERO-ATTENDANCE rule. A member who attended NONE of their classes and then EXPIRED earns
// the coach NOTHING: no attended line and no expiry true-up — so they do not appear in the salary
// report at all. (Reported: Ali Salem Al-Afeefah — 0/12 swimming, expired, was paying the coach the
// full 550 as a "12 paid classes not attended" true-up.) A member with ≥1 attended still trues up the
// remaining classes as before; an ACTIVE member with 0 attendance still PENDS (they may yet attend).
const H = require('./qc-harness.js');
const R = H.reporter('COMMISSION · zero-attendance earns the coach nothing');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx, marks, end) {
  run(ctx, `
    state.members=[{id:900,name:'M',sport:'Swimming',coachId:8,startDate:'2026-06-11',expiryDate:'${end}',status:'Active',
      enrollments:[{sport:'Swimming',coachId:8,classes:12,price:550}],
      subscriptions:[{activity:'Swimming',coachId:8,totalClasses:12,start:'2026-06-11',end:'${end}',status:'active'}],
      dailyAttendance:${JSON.stringify(marks)}}];
    state.coaches=[{id:8,name:'Leina',rate:30}];
    state.invoices=[{id:1,ref:'INV1',customerId:900,customerName:'M',category:'Membership',sport:'Swimming',coachId:8,month:'2026-06',date:'2026-06-11',amount:550,lineItems:[{sport:'Swimming',coachId:8,classes:12,price:550}],payments:[{amount:550}]}];
  `);
}
const lines = (ctx, mk) => JSON.parse(run(ctx, `JSON.stringify((computeAttendanceCommission(8,'${mk}').lines||[]).filter(l=>l.mid==='m900').map(l=>({kind:l.kind,cls:l.classes})))`));
const pend = (ctx, mk) => JSON.parse(run(ctx, `JSON.stringify((computeAttendanceCommission(8,'${mk}').pendingLines||[]).filter(l=>l.mid==='m900').map(l=>l.classes))`));

R.section('EXPIRED + 0 attended → nothing paid, nothing on the report');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-02' });
  seed(ctx, {}, '2026-07-11');   // expired
  R.ok('July: no lines at all', lines(ctx, '2026-07').length === 0, lines(ctx, '2026-07'));
  R.ok('August: no lines at all', lines(ctx, '2026-08').length === 0);
  R.ok('no pending either (they forfeited)', pend(ctx, '2026-07').length === 0);
}

R.section('EXPIRED + 1 attended → still attended + true-up for the rest (unchanged)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-02' });
  seed(ctx, { '2026-06': { Swimming: { '12': 'Y' } } }, '2026-07-11');
  const L = lines(ctx, '2026-07');
  R.ok('has a true-up line for the 11 unattended-but-paid classes', L.some(l => l.kind === 'trueup' && l.cls === 11), L);
}

R.section('ACTIVE + 0 attended → still PENDS (may yet attend), no paid line');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-02' });
  seed(ctx, {}, '2026-09-30');   // still active
  R.ok('no paid line', lines(ctx, '2026-08').length === 0, lines(ctx, '2026-08'));
  R.ok('the 12 classes still pend', pend(ctx, '2026-08').includes(12), pend(ctx, '2026-08'));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('settlement true-up requires attended > 0', /ended && remaining > 0 && attended > 0 && !settledMonth/.test(src));
  R.ok('monthly true-up requires attendedAll > 0', /endMonth === monthKey && ended && remaining > 0 && attendedAll > 0 && !settledMonth/.test(src));
}

R.done();
