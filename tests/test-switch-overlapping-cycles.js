// v6.566 — when TWO cycles of the same sport+coach both COVER the switch date (an old cycle ending that
// day AND a renewal that already started), the switch picked the FIRST covering sub (the old cycle), so
// the destination inherited the old cycle's end date — a ZERO-day/backwards window — and the RENEWAL
// stayed active under the old coach → two rows + "expired" on marking. Real case: Basil, Swimming
// Mostafa→Zakaria on 12 Sep; Zakaria got 12 Sep→12 Sep and the Sep 08→Oct 08 renewal stayed on Mostafa.
// Fix: among cycles covering the switch date, pick the LATEST-STARTING (the renewal).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.566 · switch picks the renewal when two cycles cover the switch date');

function freshCtx(today) {
  const ctx = H.makeCtx({ today, role: 'admin' });
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
function doSwitch(ctx, { memberId, fromIdx = 0, toSport, toCoachId, date, price }) {
  vm.runInContext(`switchSport(${JSON.stringify(memberId)})`, ctx);
  const inp = { '#sw-from': fromIdx, '#sw-date': date, '#sw-reason': '', '#sw-sport-0': toSport, '#sw-coach-0': toCoachId };
  if (price != null) inp['#sw-price'] = price;
  for (const k in inp) ctx.document.querySelector(k).value = String(inp[k]);
  ctx.__actions.find(a => /Confirm Switch/.test(a.label || '')).onclick();
}

R.section('source wiring');
R.ok('source cycle = latest-starting among those covering the switch date', /const _covering = _srcCycleCands\.filter\(s => \(s\.start \|\| ''\) <= switchDate/.test(H.readSrc()) && /\(_covering\.length \? _covering : _srcCycleCands\)\s*\.slice\(\)\.sort\(\(a, b\) => \(a\.start \|\| ''\)\.localeCompare\(b\.start \|\| ''\)\)\.slice\(-1\)\[0\]/.test(H.readSrc()));

R.section('runtime — old cycle ending 12 Sep + renewal Sep08→Oct08, switch on 12 Sep');
{
  const ctx = freshCtx('2026-09-12');
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'', refundFeePct:15 };
    state.coaches = [{id:1,name:'Mostafa',rate:30,role:'coach',active:true},{id:2,name:'Zakaria',rate:30,role:'coach',active:true}];
    state.members = [{ id:700, name:'Basil', sport:'Swimming', coachId:1, expiryDate:'2026-10-08', status:'Active',
      enrollments:[{sport:'Swimming',coachId:1,classes:12,price:400}],
      subscriptions:[
        {activity:'Swimming',coachId:1,totalClasses:4,start:'2026-08-13',end:'2026-09-12',status:'active',amountPaid:200,_sid:'old'},
        {activity:'Swimming',coachId:1,totalClasses:12,start:'2026-09-08',end:'2026-10-08',status:'active',amountPaid:400,_sid:'renew'}
      ],
      dailyAttendance:{'2026-09':{'Swimming':{'09':'Y','10':'Y'}}} }];
    state.invoices = [
      {id:1,ref:'INV-OLD',customerId:700,customerName:'Basil',category:'Membership',date:'2026-08-13',month:'2026-08',amount:200,coachId:1,
       lineItems:[{sport:'Swimming',coachId:1,classes:4,price:200}],payments:[{amount:200,month:'2026-08'}]},
      {id:2,ref:'INV-REN',customerId:700,customerName:'Basil',category:'Membership',date:'2026-09-08',month:'2026-09',amount:400,coachId:1,
       lineItems:[{sport:'Swimming',coachId:1,classes:12,price:400}],payments:[{amount:400,month:'2026-09'}]}
    ];
  `, ctx);
  doSwitch(ctx, { memberId: 700, fromIdx: 0, toSport: 'Swimming', toCoachId: 2, date: '2026-09-12' });
  const m = vm.runInContext('state.members[0]', ctx);
  const zak = m.subscriptions.find(s => String(s.coachId) === '2');
  const oldSub = m.subscriptions.find(s => s._sid === 'old');
  const renew = m.subscriptions.find(s => s._sid === 'renew');
  R.ok('Zakaria sub created with a VALID window (start <= end, not zero-day)', !!zak && String(zak.start) < String(zak.end), JSON.stringify(zak));
  R.ok('Zakaria sub END = the RENEWAL end (2026-10-08), not the old cycle end', !!zak && zak.end === '2026-10-08', 'end=' + (zak && zak.end));
  R.ok('the RENEWAL (Sep08→Oct08) is the one switched away', !!renew && (renew.status === 'completed' || renew.switchedAwayTo === 'Swimming'), JSON.stringify(renew));
  R.ok('the OLD cycle (Aug13→Sep12) is NOT switched away', !!oldSub && !oldSub.switchedAwayTo, JSON.stringify(oldSub));
  // Going FORWARD (after the switch date) the only Swimming coach is Zakaria; the old cycle ended 12 Sep
  // and doesn't cover later dates, so no lingering Mostafa row after the switch.
  const forward = m.subscriptions.filter(s => s.activity === 'Swimming' && s.status !== 'completed' && !s.switchedAwayTo && (!s.end || s.end > '2026-09-12')).map(s => String(s.coachId));
  R.ok('the coach going forward (after 12 Sep) is Zakaria only', forward.length > 0 && forward.every(c => c === '2'), JSON.stringify(forward));
}

R.done();
