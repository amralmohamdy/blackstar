// v6.438 — a FROZEN member's switch credit must NOT be cashed out while frozen. Before, the frozen
// deferral explicitly excluded switch credits (`frozen && !isSwitch`), so a frozen member's switch
// paid the coach in full immediately (the Alreem case: frozen, yet Leina was paid 125 on a 417
// switch). Now a frozen member's switch credit PENDS until they return, exactly like their other
// classes — the coach is paid only for classes actually attended while frozen.
const H = require('./qc-harness.js');
const R = H.reporter('COMMISSION · frozen member switch credit pends (not paid)');
const run = (c, s) => H.vm.runInContext(s, c);

const ctx = H.makeCtx({ role: 'admin', today: '2026-08-01' });
run(ctx, `
  state.members = [{ id:701, name:'Frozen Switcher', sport:'Swimming', coachId:8, startDate:'2026-07-08', expiryDate:'2026-08-07', status:'Active',
    enrollments:[{sport:'Swimming',coachId:8,classes:12,price:500}],
    subscriptions:[{activity:'Swimming',coachId:8,totalClasses:12,start:'2026-07-08',end:'2026-08-07',status:'active'}],
    dailyAttendance:{ '2026-07':{Swimming:{'10':'Y'}} },
    freezes:[{ start:'2026-07-27', end:'2026-08-03', previousExpiry:'2026-08-07', days:7, id:'fr1' }] }];
  state.coaches = [{ id:8, name:'Leina', sports:['Swimming'], rate:30 }, { id:2, name:'Jennifer', sports:['Gymnastic'], rate:35 }];
  state.invoices = [
    { id:900, ref:'INV900', customerId:701, customerName:'Frozen Switcher', category:'Membership', sport:'Swimming', coachId:8, month:'2026-07', date:'2026-07-08', amount:500,
      lineItems:[{sport:'Swimming',coachId:8,classes:12,price:500}], payments:[{amount:500}] },
    { id:901, ref:'SW-901', customerId:701, customerName:'Frozen Switcher', category:'Membership', activityType:'switch-credit', switchCredit:true, amount:0, month:'2026-07', date:'2026-07-23',
      lineItems:[{sport:'Gymnastic',coachId:2,classes:-10,price:-416.67},{sport:'Swimming',coachId:8,classes:10,price:416.67}] }];
`);

R.section('the member is frozen on 2026-08-01');
R.ok('isMemberFrozenAt is true', run(ctx, `isMemberFrozenAt(state.members[0],'2026-08-01')`) === true);

R.section('Leina (destination) — paid only the attended class, switch credit PENDS');
{
  const r = JSON.parse(run(ctx, `JSON.stringify((function(){const x=computeAttendanceCommission(8,'2026-07');
    return { paid:(x.lines||[]).map(l=>({kind:l.kind,amt:Math.round(l.amountBase)})),
             pend:(x.pendingLines||[]).map(l=>({amt:Math.round(l.amountBase),note:l.note})) };})())`));
  const paidSwitch = r.paid.find(l => l.kind === 'switch');
  const pendSwitch = r.pend.find(l => /switch credit pending/.test(l.note || ''));
  R.ok('no PAID switch line while frozen', !paidSwitch, r.paid);
  R.ok('the switch credit (≈417) is PENDING with the frozen note', !!pendSwitch && pendSwitch.amt === 417, r.pend);
  R.ok('only the attended class is paid (≈42)', r.paid.some(l => l.kind === 'attended' && l.amt === 42), r.paid);
}

R.section('Jennifer (source) — v6.483 profit-split: the negative clawback is SKIPPED, she is NOT deducted');
{
  // Before v6.483 the source coach's -(price-aShare) clawback was applied (or deferred while frozen),
  // leaving her NEGATIVE for a member she taught 0 of (the "why did my coach get deducted on a switch"
  // bug). Now the negative switch line is skipped entirely — the source coach earns only her ATTENDED
  // classes from the original invoice; the transferred value pays the DESTINATION coach.
  const paid = JSON.parse(run(ctx, `JSON.stringify((computeAttendanceCommission(2,'2026-07').lines||[]).map(l=>Math.round(l.amountBase)))`));
  const pend = JSON.parse(run(ctx, `JSON.stringify((computeAttendanceCommission(2,'2026-07').pendingLines||[]).map(l=>Math.round(l.amountBase)))`));
  R.ok('the -417 source clawback is NOT applied anywhere (skipped, not deferred)', !paid.includes(-417) && !pend.includes(-417), { paid, pend });
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('the frozen deferral no longer excludes switch credits', !/if \(frozen && !isSwitch\)/.test(src) && /frozen — switch credit pending until return/.test(src));
}

R.done();
