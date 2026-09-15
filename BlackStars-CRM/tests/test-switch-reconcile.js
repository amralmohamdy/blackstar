// v6.440 — reconcile a pre-v6.436 sport SWITCH that left the source sport ACTIVE and the payment
// un-split. Older switches flipped the enrollment but kept the SOURCE subscription active at its full
// class count and never split the invoice, so the member looked like two full-price sports and the
// source coach carried a PHANTOM PENDING for classes that had actually moved to the new sport. The
// reconcile (using the locked switch snapshot) completes the source at what was attended, resizes the
// destination to the remaining classes, splits the invoice line prices, and voids the switch credit.
// Reported case: Alreem Addulla — switched Gymnastic→Swimming (2 attended of 12, 500 package).
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH reconcile — complete source, split payment, kill phantom pending');
const run = (c, s) => H.vm.runInContext(s, c);

const ctx = H.makeCtx({ role: 'admin', today: '2026-08-02' });
run(ctx, `window.downloadBackup=function(){}; window.currentUserName=function(){return 'test';};`);
run(ctx, `
  state.members = [{ id:701, name:'Alreem', sport:'Swimming', coachId:8, startDate:'2026-07-08', expiryDate:'2026-08-14', status:'Active',
    enrollments:[{sport:'Taekwondo',coachId:16,classes:12,price:500},{sport:'Swimming',coachId:8,classes:12,price:500}],
    subscriptions:[
      {activity:'Taekwondo',coachId:16,totalClasses:12,status:'active',amountPaid:500,invoiceNumber:'INV1',start:'2026-07-08',end:'2026-08-07'},
      {activity:'Gymnastic',coachId:2,totalClasses:12,status:'active',amountPaid:500,invoiceNumber:'INV1',start:'2026-07-08',end:'2026-08-14'},
      {activity:'Swimming',coachId:8,totalClasses:12,status:'active',amountPaid:500,invoiceNumber:'INV1',start:'2026-07-08',end:'2026-08-07'}],
    dailyAttendance:{ '2026-07':{Gymnastic:{'10':'Y','12':'Y'}, Swimming:{'20':'Y'}} },
    freezes:[{start:'2026-07-27',end:'2026-08-03'}],
    sportSwitches:[{ fromSport:'Gymnastic', fromCoachId:2, toSport:'Swimming', toCoachId:8, date:'2026-07-23',
      snapshot:{ attendedByOld:2, totalClasses:12, originalPrice:500, aShare:83.33, bShare:416.67, switchMonth:'2026-07' } }] }];
  state.coaches = [{id:2,name:'Jennifer',rate:35},{id:8,name:'Leina',rate:30},{id:16,name:'Karma',rate:30}];
  state.invoices = [
    { id:1, ref:'INV1', customerId:701, customerName:'Alreem', category:'Membership', coachId:16, month:'2026-07', date:'2026-07-08', amount:1500, amountPaid:1500,
      lineItems:[{sport:'Taekwondo',coachId:16,price:500},{sport:'Gymnastic',coachId:2,price:500},{sport:'Swimming',coachId:8,price:500}],
      payments:[{amount:1000,date:'2026-07-08',method:'card',pid:'c1000|2026-07-08|card#1'},{amount:500,date:'2026-08-01',method:'cash',pid:'a2026-08-01#1'}] },
    { id:2, ref:'SW-1', customerId:701, category:'Membership', activityType:'switch-credit', switchCredit:true, amount:0, month:'2026-07', date:'2026-07-23',
      lineItems:[{sport:'Gymnastic',coachId:2,price:-416.67},{sport:'Swimming',coachId:8,price:416.67}] }];
`);

R.section('the reconcile detector finds the unreconciled switch, then clears it');
R.ok('one unreconciled switch before', run(ctx, `_switchedUnreconciled().length`) === 1);
R.ok('applying reconciles it', run(ctx, `_applySwitchReconcile(701)`) === 1);
R.ok('none unreconciled after', run(ctx, `_switchedUnreconciled().length`) === 0);

R.section('bug #1 — the source sport is COMPLETED at what was attended');
{
  const g = JSON.parse(run(ctx, `JSON.stringify(state.members[0].subscriptions.find(s=>s.activity==='Gymnastic'))`));
  R.ok('Gymnastic status = completed', g.status === 'completed', g.status);
  R.ok('Gymnastic totalClasses = 2 (attended)', g.totalClasses === 2, g.totalClasses);
  R.ok('Gymnastic marked switchedAwayTo Swimming', g.switchedAwayTo === 'Swimming');
}

R.section('bug #2 — the one 500 is SPLIT (Gym 83.33 + Swim 416.67), switch credit voided');
{
  const inv = JSON.parse(run(ctx, `JSON.stringify((function(){const v=state.invoices.find(x=>x.ref==='INV1');return {amount:v.amount,g:(v.lineItems.find(l=>l.sport==='Gymnastic')||{}).price,s:(v.lineItems.find(l=>l.sport==='Swimming')||{}).price};})())`));
  R.ok('Gymnastic line = 83.33', inv.g === 83.33, inv.g);
  R.ok('Swimming line = 416.67', inv.s === 416.67, inv.s);
  R.ok('invoice total = 1000 (Taekwondo 500 + 83.33 + 416.67)', inv.amount === 1000, inv.amount);
  R.ok('the switch-credit invoice is voided', run(ctx, `(state.invoices.find(x=>x.ref==='SW-1')||{}).deleted`) === true);
  const sw = JSON.parse(run(ctx, `JSON.stringify(state.members[0].subscriptions.find(s=>s.activity==='Swimming'))`));
  R.ok('Swimming resized to 10 classes, switchFunded', sw.totalClasses === 10 && sw.switchFunded === true, sw);
}

R.section('bug #3 — the source coach (Jennifer) has ONLY attended classes, NO pending');
{
  for (const mk of ['2026-07', '2026-08']) {
    const r = JSON.parse(run(ctx, `JSON.stringify((function(){const x=computeAttendanceCommission(2,'${mk}');return {paid:(x.lines||[]).filter(l=>/Alreem/.test(l.memberName)).map(l=>l.kind),pend:(x.pendingLines||[]).filter(l=>/Alreem/.test(l.memberName)).length};})())`));
    R.ok(`Jennifer ${mk}: no pending for Alreem`, r.pend === 0, r);
    R.ok(`Jennifer ${mk}: no switch line for Alreem`, !r.paid.includes('switch'), r.paid);
  }
  const jul = JSON.parse(run(ctx, `JSON.stringify((computeAttendanceCommission(2,'2026-07').lines||[]).filter(l=>/Alreem/.test(l.memberName)).map(l=>({kind:l.kind,cls:l.classes})))`));
  R.ok('Jennifer July: exactly the 2 attended Gymnastic classes', jul.length === 1 && jul[0].kind === 'attended' && jul[0].cls === 2, jul);
}

R.done();
