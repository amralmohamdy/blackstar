// v6.529 — (A) switch BUG 1: a member with TWO packages of the same sport under the same coach being
// switched now splits based on THIS package's own price (not the summed coachBaseForSport), caps the
// line closest to that package, and leaves the OTHER package intact. (B) Charts commission for a
// specific month comes from computeMonthlyPay so it matches the Salaries screen.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.529 · two-package switch + Charts match Salaries');
const src = H.readSrc();

R.section('source');
R.ok('switch counts same-sport+coach packages', /const _srcPkgCount = /.test(src));
R.ok('multiple packages → split on THIS package price', /const price = \(_srcPkgCount > 1\)/.test(src));
R.ok('the capped line is the one closest to this package price', /_cands\.slice\(\)\.sort\(\(a, b\) => Math\.abs/.test(src));
R.ok('Charts commission uses computeMonthlyPay for a specific month', /const _pay = \(_isMonth && typeof computeMonthlyPay === 'function'\) \? computeMonthlyPay\(c\.id, month\) : null;/.test(src));

R.section('runtime — two-package switch keeps the other package + conserves money');
{
  const ctx = H.makeCtx({ today: '2026-08-16', role: 'admin' });
  ctx.__q = {};
  const mk = () => ({ value: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, addEventListener() {}, querySelector: () => mk(), querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, focus() {}, get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = s => (ctx.__q[s] = ctx.__q[s] || mk());
  ctx.document.querySelectorAll = () => [];
  ctx.__actions = null; ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; };
  ctx.closeModal = () => {}; ctx.render = () => {}; ctx.toast = () => {}; ctx.save = () => {};
  ctx.confirmSaved = (m, o) => { if (o && typeof o.onOk === 'function') o.onOk(); };
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'attendance'};
    state.coaches=[{id:1,name:'Aziz',rate:30,role:'coach',active:true},{id:2,name:'New',rate:30,role:'coach',active:true}];
    state.members=[{id:9,name:'TwoPkg',sport:'Kick Boxing',coachId:1,expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:8,price:120,start:'2026-08-01'},{sport:'Kick Boxing',coachId:1,classes:8,price:120,start:'2026-08-01'}],
      subscriptions:[{activity:'Kick Boxing',coachId:1,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:120,invoiceNumber:'I1'},{activity:'Kick Boxing',coachId:1,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:120,invoiceNumber:'I1'}],
      dailyAttendance:{'2026-08':{'Kick Boxing':{'5':'Y','10':'Y','12':'Y','14':'Y'}}}}];
    state.invoices=[{id:1,ref:'I1',customerId:9,category:'Membership',date:'2026-08-01',month:'2026-08',amount:240,payments:[{amount:240,date:'2026-08-01',month:'2026-08'}],lineItems:[{sport:'Kick Boxing',coachId:1,classes:8,price:120},{sport:'Kick Boxing',coachId:1,classes:8,price:120}]}];
  `);
  run(`switchSport(9)`);
  for (const [k, v] of [['#sw-from', 0], ['#sw-date', '2026-08-16'], ['#sw-reason', ''], ['#sw-sport-0', 'Boxing'], ['#sw-coach-0', 2]]) ctx.document.querySelector(k).value = String(v);
  (ctx.__actions || []).find(a => /Confirm Switch/.test(a.label || '')).onclick();
  const inv = run(`state.invoices.filter(v=>!v.deleted)[0]`);
  const kb = inv.lineItems.filter(l => l.sport === 'Kick Boxing');
  R.ok('money conserved — invoice total stays 240 (NOT inflated)', Math.round(inv.amount) === 240, 'amt=' + inv.amount);
  R.ok('the OTHER Kick Boxing package is kept intact at 8cls/120', kb.some(l => l.classes === 8 && Math.round(l.price) === 120), JSON.stringify(kb));
  R.ok('the switched package is capped to 4 attended / 60', kb.some(l => l.classes === 4 && Math.round(l.price) === 60));
  R.ok('a Boxing line (4 moved / 60) was added', inv.lineItems.some(l => l.sport === 'Boxing' && l.classes === 4 && Math.round(l.price) === 60));
}

R.section('runtime — Charts commission == computeMonthlyPay for a month');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'payment'};
    state.coaches=[{id:1,name:'P',rate:60,role:'coach',active:true}];
    state.members=[{id:1,name:'A',expiryDate:'2026-12-01',status:'Active',subscriptions:[{activity:'KB',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I1'}]}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:900,coachId:1,lineItems:[{sport:'KB',coachId:1,classes:8,price:900}],payments:[{amount:300,date:'2026-08-05',month:'2026-08'}]}];
  `);
  // Charts commission for a coach = computeMonthlyPay(id, month).commissionAmount = 60% × 300 paid = 180
  const salaries = Math.round((run(`computeMonthlyPay(1,'2026-08')`).commissionAmount || 0) * 100) / 100;
  R.ok('Salaries commission = 60% × 300 paid = 180', salaries === 180);
  // (the Charts refresh() uses exactly this value; assert the source computes it the same way)
  R.ok('Charts would show the same 180 (routes through computeMonthlyPay)', /commission = _pay \? \(_pay\.commissionAmount \|\| 0\)/.test(src));
}

R.done();
