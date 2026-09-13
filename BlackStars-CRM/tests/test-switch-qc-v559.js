// v6.559 — fixes from the adversarial switch-code QC review:
//  F1 (High): the invoice to split was chosen by date (latest ≤ switch date) while the sub/attended
//     logic was chosen by the cycle COVERING the switch date; they diverged when the current cycle's
//     invoice was dated AFTER the switch (back-dated switch / later-dated renewal) → the OLD paid
//     invoice got split, Charged ≠ Paid. Fix: pick the invoice DATED WITHIN the current cycle's window.
//  F2/F3: the DISTRIBUTED (multi-target) branch never synced subscriptions and used strict === on
//     coachId. Fix: cap the source sub + create one switch-funded sub per target, and String()-compare.
//  F4: countAttendedUpTo floored at the raw sub.start, missing renewal-gap classes that
//     subAttendanceWindow (and the card) credit to the current cycle. Fix: floor at window.from.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.559 · switch QC fixes (F1 invoice cycle · F2/F3 distributed · F4 gap attended)');
const r2 = n => Math.round(n * 100) / 100;

function freshCtx(today) {
  const ctx = H.makeCtx({ today: today || '2026-09-06', role: 'admin' });
  ctx.__q = {};
  const mk = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelector: () => mk(), querySelectorAll: () => [],
    getAttribute: () => null, setAttribute() {}, focus() {}, get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = sel => (ctx.__q[sel] = ctx.__q[sel] || mk());
  ctx.document.querySelectorAll = () => [];
  ctx.__actions = null; ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; };
  ctx.closeModal = () => {}; ctx.render = () => {}; ctx.toast = () => {}; ctx.confirmSaved = () => {}; ctx.save = () => {};
  return ctx;
}
function setInputs(ctx, v) { for (const k in v) ctx.document.querySelector(k).value = String(v[k]); }
function doSwitch(ctx, { memberId, fromIdx = 0, toSport, toCoachId, date, price }) {
  vm.runInContext(`switchSport(${JSON.stringify(memberId)})`, ctx);
  const inp = { '#sw-from': fromIdx, '#sw-date': date, '#sw-reason': '', '#sw-sport-0': toSport, '#sw-coach-0': toCoachId };
  if (price != null) inp['#sw-price'] = price;
  setInputs(ctx, inp);
  ctx.__actions.find(a => /Confirm Switch/.test(a.label || '')).onclick();
}
const M = ctx => vm.runInContext('state.members[0]', ctx);
const inv = (ctx, ref) => vm.runInContext(`state.invoices.find(v=>v.ref===${JSON.stringify(ref)})`, ctx);

R.section('F1 — current cycle invoice dated AFTER the switch is the one split (not the old paid invoice)');
{
  const ctx = freshCtx('2026-09-06');
  vm.runInContext(`
    state.settings={commissionBasis:'attendance',commissionStartDate:'',refundFeePct:15};
    state.coaches=[{id:1,name:'Abdel',rate:30,role:'coach',active:true},{id:2,name:'Aziz',rate:30,role:'coach',active:true}];
    state.members=[{id:70,name:'Ren',sport:'Kick Boxing',coachId:1,expiryDate:'2026-09-30',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:550}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:1,totalClasses:12,start:'2026-07-08',end:'2026-08-07',status:'completed',amountPaid:550,_sid:'old'},
        {activity:'Kick Boxing',coachId:1,totalClasses:12,start:'2026-08-15',end:'2026-09-30',status:'active',amountPaid:550,_sid:'cur'}
      ],
      dailyAttendance:{'2026-08':{'Kick Boxing':{'20':'Y','25':'Y'}},'2026-09':{'Kick Boxing':{'01':'Y'}}}}];
    state.invoices=[
      {id:1,ref:'INV-OLD',customerId:70,customerName:'Ren',category:'Membership',date:'2026-07-08',month:'2026-07',amount:550,coachId:1,
       lineItems:[{sport:'Kick Boxing',coachId:1,coach:'Abdel',classes:12,price:550}],payments:[{amount:550,month:'2026-07'}]},
      {id:2,ref:'INV-CUR',customerId:70,customerName:'Ren',category:'Membership',date:'2026-09-08',month:'2026-09',amount:550,coachId:1,
       lineItems:[{sport:'Kick Boxing',coachId:1,coach:'Abdel',classes:12,price:550}],payments:[{amount:550,month:'2026-09'}]}
    ];
  `, ctx);
  doSwitch(ctx, { memberId: 70, fromIdx: 0, toSport: 'Kick Boxing', toCoachId: 2, date: '2026-09-06' });
  const cur = inv(ctx, 'INV-CUR'), old = inv(ctx, 'INV-OLD');
  R.ok('CURRENT invoice (dated 09-08, after the switch) got the Aziz line', (cur.lineItems || []).some(l => String(l.coachId) === '2'), JSON.stringify(cur.lineItems));
  R.ok('OLD paid invoice was NOT split (still 550/12 Abdel only)', !(old.lineItems || []).some(l => String(l.coachId) === '2') && old.lineItems[0].price === 550 && old.lineItems[0].classes === 12, JSON.stringify(old.lineItems));
  const charged = r2((cur.amount || 0) + (old.amount || 0));
  R.ok('money conserved: total charged still 1100', charged === 1100, 'charged=' + charged);
}

R.section('F4 — renewal-gap attendance is credited to the current cycle (attended floors at window.from)');
{
  const ctx = freshCtx('2026-09-06');
  vm.runInContext(`
    state.settings={commissionBasis:'attendance',commissionStartDate:'',refundFeePct:15};
    state.coaches=[{id:1,name:'Abdel',rate:30,role:'coach',active:true},{id:2,name:'Aziz',rate:30,role:'coach',active:true}];
    state.members=[{id:71,name:'Gap',sport:'Swimming',coachId:1,expiryDate:'2026-09-30',status:'Active',
      enrollments:[{sport:'Swimming',coachId:1,classes:12,price:600}],
      subscriptions:[
        {activity:'Swimming',coachId:1,totalClasses:12,start:'2026-07-10',end:'2026-08-09',status:'completed',amountPaid:600,_sid:'o'},
        {activity:'Swimming',coachId:1,totalClasses:12,start:'2026-08-20',end:'2026-09-30',status:'active',amountPaid:600,_sid:'c'}
      ],
      dailyAttendance:{'2026-08':{'Swimming':{'12':'Y','14':'Y','25':'Y'}}}}];
    state.invoices=[{id:3,ref:'INV-C',customerId:71,customerName:'Gap',category:'Membership',date:'2026-08-20',month:'2026-08',amount:600,coachId:1,
      lineItems:[{sport:'Swimming',coachId:1,coach:'Abdel',classes:12,price:600}],payments:[{amount:600,month:'2026-08'}]}];
  `, ctx);
  // Confirm the carry-back window first (window.from should be 2026-08-10, the day after the old end).
  const win = vm.runInContext(`subAttendanceWindow(state.members[0], state.members[0].subscriptions[1])`, ctx);
  R.ok('subAttendanceWindow carries the current cycle back to the gap (from = 2026-08-10)', win.from === '2026-08-10', JSON.stringify(win));
  doSwitch(ctx, { memberId: 71, fromIdx: 0, toSport: 'Boxing', toCoachId: 2, date: '2026-09-06' });
  const src = M(ctx).subscriptions.find(s => s._sid === 'c');
  R.ok('source sub capped to 3 attended (08-12,08-14,08-25) — gap classes counted, not just 1', src && src.totalClasses === 3, JSON.stringify(src));
}

R.section('F2/F3 — distributed branch syncs subscriptions + String()-compares coachId (source wiring)');
{
  const src = H.readSrc();
  R.ok('distributed enrollment lookup String()-compares coachId', /const srcIdx = m\.enrollments\.findIndex\(e => e\.sport === from\.sport && String\(e\.coachId\) === String\(from\.coachId\)\)/.test(src));
  R.ok('distributed primary-sport check String()-compares coachId', /if \(m\.sport === from\.sport && String\(m\.coachId\) === String\(from\.coachId\)\)/.test(src));
  R.ok('distributed branch caps the source SUBSCRIPTION + marks it switched-away', /_dSrc\.status = 'completed'; _dSrc\.switchedAwayTo = tgs\.map\(t => t\.sport\)\.join\(', '\)/.test(src));
  R.ok('distributed branch pushes one switch-funded sub per target', /resolved\.forEach\(\(tr, i\) => m\.subscriptions\.push\(\{ activity: tr\.sport, coachId: tr\.coachId, totalClasses: tr\.classes, start: switchDate, end: _dEnd \|\| null, status: 'active', switchFunded: true/.test(src));
}

R.done();
