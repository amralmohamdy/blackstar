// v6.556 — SWITCH on a RENEWED sport must act on the CURRENT cycle, not an older one. A member who
// renewed Kick Boxing had TWO same-sport+coach subs (an old Jul–Aug cycle + the current Aug–Sep cycle).
// The switch used .find() (FIRST active sub/invoice) → it grabbed the OLD cycle: the new coach's sub
// inherited the old cycle's END date (2026-08-07) while starting on the switch date (2026-09-06) — a
// BACKWARDS window (start > end) that reads "outside period" with 0 attendance, and the current cycle
// stayed under the OLD coach. Real case: Ali Mohamed Ghulam Ali Al Zarie, Abdel Salam → Aziz on 06 Sep.
// Fix: source sub, source invoice, and attended-count all pick the cycle COVERING the switch date.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.556 · switch acts on the CURRENT cycle of a renewed sport');

function freshCtx(today) {
  const ctx = H.makeCtx({ today, role: 'admin' });
  ctx.__q = {};
  const mkNode = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelector: () => mkNode(), querySelectorAll: () => [],
    getAttribute: () => null, setAttribute() {}, focus() {}, get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = sel => (ctx.__q[sel] = ctx.__q[sel] || mkNode());
  ctx.document.querySelectorAll = () => [];
  ctx.__actions = null;
  ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; };
  ctx.closeModal = () => {}; ctx.render = () => {}; ctx.toast = () => {};
  ctx.confirmSaved = () => {}; ctx.save = () => {};
  return ctx;
}
function setInputs(ctx, vals) { for (const k in vals) ctx.document.querySelector(k).value = String(vals[k]); }
function doSwitch(ctx, { memberId, fromIdx = 0, toSport, toCoachId, date, price }) {
  vm.runInContext(`switchSport(${JSON.stringify(memberId)})`, ctx);
  const inputs = { '#sw-from': fromIdx, '#sw-date': date || ctx.TODAY, '#sw-reason': '',
    '#sw-sport-0': toSport, '#sw-coach-0': toCoachId == null ? '' : toCoachId };
  if (price != null) inputs['#sw-price'] = price;
  setInputs(ctx, inputs);
  const confirm = (ctx.__actions || []).find(a => /Confirm Switch/.test(a.label || ''));
  if (!confirm) throw new Error('no Confirm Switch action captured');
  confirm.onclick();
}
const M = (ctx) => vm.runInContext(`state.members[0]`, ctx);

R.section('renewed Kick Boxing (old Jul-Aug + current Aug-Sep) → switch to Aziz on 06 Sep');
{
  const ctx = freshCtx('2026-09-06');
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'', refundFeePct:15 };
    state.coaches = [{id:1,name:'Abdel Salam',rate:30,role:'coach',active:true},{id:2,name:'Aziz',rate:30,role:'coach',active:true}];
    state.members = [{ id:700, name:'Ali', sport:'Kick Boxing', coachId:1, expiryDate:'2026-09-14', status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:550}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:1,totalClasses:15,start:'2026-07-08',end:'2026-08-07',status:'active',amountPaid:550,_sid:'old'},
        {activity:'Kick Boxing',coachId:1,totalClasses:12,start:'2026-08-15',end:'2026-09-14',status:'active',amountPaid:550,_sid:'cur'}
      ],
      dailyAttendance:{
        '2026-07':{'Kick Boxing':{'8':'Y','11':'Y','13':'Y','15':'Y','18':'Y'}},
        '2026-08':{'Kick Boxing':{'15':'Y','22':'Y','26':'Y'}}
      } }];
    state.invoices = [
      {id:1,ref:'INV-OLD',customerId:700,customerName:'Ali',category:'Membership',date:'2026-07-08',month:'2026-07',amount:550,coachId:1,
       lineItems:[{sport:'Kick Boxing',coachId:1,coach:'Abdel Salam',classes:15,price:550}],payments:[{amount:550,month:'2026-07'}]},
      {id:2,ref:'INV-CUR',customerId:700,customerName:'Ali',category:'Membership',date:'2026-08-15',month:'2026-08',amount:550,coachId:1,
       lineItems:[{sport:'Kick Boxing',coachId:1,coach:'Abdel Salam',classes:12,price:550}],payments:[{amount:550,month:'2026-08'}]}
    ];
  `, ctx);

  doSwitch(ctx, { memberId: 700, fromIdx: 0, toSport: 'Kick Boxing', toCoachId: 2, date: '2026-09-06' });

  const m = M(ctx);
  const subs = m.subscriptions;
  const azizSub = subs.find(s => String(s.coachId) === '2');
  const oldSub = subs.find(s => s._sid === 'old');
  const curSub = subs.find(s => s._sid === 'cur');

  R.ok('a destination (Aziz) sub was created', !!azizSub, JSON.stringify(subs.map(s => ({c: s.coachId, st: s.start, en: s.end}))));
  R.ok('Aziz sub window is VALID (start <= end), not backwards', !!azizSub && String(azizSub.start) <= String(azizSub.end), JSON.stringify(azizSub));
  R.ok('Aziz sub END = the CURRENT cycle end (2026-09-14), not the old cycle end (2026-08-07)', !!azizSub && azizSub.end === '2026-09-14', 'end=' + (azizSub && azizSub.end));
  R.ok('Aziz sub START = the switch date (2026-09-06)', !!azizSub && azizSub.start === '2026-09-06', 'start=' + (azizSub && azizSub.start));

  R.ok('the CURRENT cycle sub is switched away (marked completed/switchedAwayTo)', !!curSub && (curSub.status === 'completed' || curSub.switchedAwayTo === 'Kick Boxing'), JSON.stringify(curSub));
  R.ok('the OLD cycle sub is UNTOUCHED (not switched away)', !!oldSub && !oldSub.switchedAwayTo && oldSub.end === '2026-08-07', JSON.stringify(oldSub));

  const invCur = vm.runInContext(`state.invoices.find(v=>v.ref==='INV-CUR')`, ctx);
  const invOld = vm.runInContext(`state.invoices.find(v=>v.ref==='INV-OLD')`, ctx);
  R.ok('the CURRENT invoice got the Aziz line (it was the one split)', (invCur.lineItems || []).some(l => String(l.coachId) === '2'), JSON.stringify(invCur.lineItems));
  R.ok('the OLD invoice was NOT touched (no Aziz line, still 550/15)', !(invOld.lineItems || []).some(l => String(l.coachId) === '2') && invOld.lineItems[0].price === 550 && invOld.lineItems[0].classes === 15, JSON.stringify(invOld.lineItems));
}

R.section('single-cycle switch still works (no regression)');
{
  const ctx = freshCtx('2026-08-20');
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'', refundFeePct:15 };
    state.coaches = [{id:1,name:'A',rate:30,role:'coach',active:true},{id:2,name:'B',rate:30,role:'coach',active:true}];
    state.members = [{ id:701, name:'Solo', sport:'Karate', coachId:1, expiryDate:'2026-12-01', status:'Active',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:800}],
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:800,_sid:'k'}],
      dailyAttendance:{'2026-08':{'Karate':{'05':'Y','10':'Y','15':'Y'}}} }];
    state.invoices = [{id:9,ref:'INV9',customerId:701,customerName:'Solo',category:'Membership',date:'2026-08-01',month:'2026-08',amount:800,coachId:1,
      lineItems:[{sport:'Karate',coachId:1,coach:'A',classes:8,price:800}],payments:[{amount:800,month:'2026-08'}]}];
  `, ctx);
  doSwitch(ctx, { memberId: 701, fromIdx: 0, toSport: 'Boxing', toCoachId: 2, date: '2026-08-20', price: 500 });
  const m = M(ctx);
  const dest = m.subscriptions.find(s => (s.activity || '') === 'Boxing');
  R.ok('destination Boxing sub created with a valid window', !!dest && String(dest.start) <= String(dest.end || '9999'), JSON.stringify(dest));
  R.ok('source Karate sub switched away', m.subscriptions.some(s => s.activity === 'Karate' && (s.switchedAwayTo || s.status === 'completed')));
}

R.done();
