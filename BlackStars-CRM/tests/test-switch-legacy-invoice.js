// v6.528 (switch BUG 2) — switching a member whose membership is a LEGACY invoice (top-level
// sport/coach/amount, NO lineItems) must SPLIT that invoice in place, not create a second invoice
// while the paid original still stands (which double-charged the member). Drives the real handler.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.528 · switch splits a legacy (no-lineItems) invoice, no double charge');
const src = H.readSrc();

R.section('source');
R.ok('the finder also matches a legacy top-level invoice', /const _isLegacy = v =>/.test(src) && /v\.sport === from\.sport/.test(src));
R.ok('a legacy invoice is converted to lineItems before splitting', /_inv\.lineItems = \[\{ sport: from\.sport, coach: coachName\(from\.coachId\), coachId: from\.coachId, classes: totalClasses/.test(src));

R.section('runtime — drive the real Confirm Switch on a legacy invoice');
{
  const ctx = H.makeCtx({ today: '2026-08-16', role: 'admin' });
  ctx.__q = {};
  const mk = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, addEventListener() {}, querySelector: () => mk(), querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, focus() {}, get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = s => (ctx.__q[s] = ctx.__q[s] || mk());
  ctx.document.querySelectorAll = () => [];
  ctx.__actions = null;
  ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; };
  ctx.closeModal = () => {}; ctx.render = () => {}; ctx.toast = () => {}; ctx.save = () => {};
  ctx.confirmSaved = (m, o) => { if (o && typeof o.onOk === 'function') o.onOk(); };
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'attendance'};
    state.coaches=[{id:1,name:'Old',rate:30,role:'coach',active:true},{id:2,name:'New',rate:30,role:'coach',active:true}];
    state.members=[{id:9,name:'Legacy',sport:'Karate',coachId:1,expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:800,start:'2026-08-01'}],
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:800,invoiceNumber:'LEG1'}],
      dailyAttendance:{'2026-08':{Karate:{'5':'Y','10':'Y','12':'Y'}}}}];
    state.invoices=[{id:1,ref:'LEG1',customerId:9,category:'Membership',date:'2026-08-01',month:'2026-08',sport:'Karate',coachId:1,amount:800,payments:[{amount:800,date:'2026-08-01',month:'2026-08'}]}];
  `);
  run(`switchSport(9)`);
  for (const [k, v] of [['#sw-from', 0], ['#sw-date', '2026-08-16'], ['#sw-reason', ''], ['#sw-sport-0', 'Boxing'], ['#sw-coach-0', 2]]) ctx.document.querySelector(k).value = String(v);
  (ctx.__actions || []).find(a => /Confirm Switch/.test(a.label || '')).onclick();
  const live = run(`state.invoices.filter(v=>!v.deleted)`);
  R.ok('NO duplicate invoice created (still exactly 1 live invoice)', live.length === 1, 'count=' + live.length);
  const inv = live[0];
  R.ok('the legacy invoice was split in place', (inv.lineItems || []).length === 2);
  R.ok('source Karate line capped to 3 attended / 300', inv.lineItems.some(l => l.sport === 'Karate' && l.classes === 3 && Math.round(l.price) === 300));
  R.ok('destination Boxing line 5 classes / 500 added', inv.lineItems.some(l => l.sport === 'Boxing' && l.classes === 5 && Math.round(l.price) === 500));
  R.ok('money conserved — invoice total stays 800', Math.round(inv.amount) === 800, 'amt=' + inv.amount);
}

R.done();
