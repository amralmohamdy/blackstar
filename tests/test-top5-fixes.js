// v6.571 — the "top 5" regression bug fixes found in the 2026-09-15 hunt. Each is driven against the
// REAL engine/handler and asserts the corrected behaviour, plus a no-impact check on the normal path.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.571 · top-5 bug fixes');
const r2 = n => Math.round(n * 100) / 100;
const src = H.readSrc();

function ctxWith(state, today) {
  const ctx = H.makeCtx({ today: today || '2026-09-20', role: 'admin' });
  vm.runInContext('Object.assign(state, ' + JSON.stringify(state) + ');', ctx);
  return ctx;
}
const commBase = (ctx, coachId, month) => r2(vm.runInContext(`(computeAttendanceCommission(${JSON.stringify(coachId)},${JSON.stringify(month)}).base||0)`, ctx));

// ───────────────────────── FIX #1 — double-pay across overlapping history+live same-sport subs ────────
R.section('#1 — one physical class is never paid to two coaches');
{
  const inv = (id, ref, cid) => ({ id, ref, customerId: 10, category: 'Membership', date: '2026-07-01', month: '2026-07', amount: 800, coachId: cid, lineItems: [{ sport: 'Swimming', coachId: cid, classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-07' }] });
  const ctx = ctxWith({
    settings: { commissionBasis: 'attendance', commissionStartDate: '' },
    coaches: [{ id: 1, name: 'Mostafa', rate: 30, role: 'coach', active: true }, { id: 2, name: 'Zakaria', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'Basil', status: 'Active', expiryDate: '2026-12-01', subscriptions: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-07-01', end: null, status: 'completed', amountPaid: 800, invoiceNumber: 'INV1' },
      { activity: 'Swimming', coachId: 2, totalClasses: 8, start: '2026-07-01', end: null, status: 'active', amountPaid: 800, invoiceNumber: 'INV2' }],
      dailyAttendance: { '2026-07': { Swimming: { '24': 'Y' } } } }],
    invoices: [inv(900, 'INV1', 1), inv(901, 'INV2', 2)],
  }, '2026-07-31');
  R.ok('history coach earns 0, live coach earns the 1 class (total 100, was 200)', commBase(ctx, 1, '2026-07') + commBase(ctx, 2, '2026-07') === 100, 'M=' + commBase(ctx, 1, '2026-07') + ' Z=' + commBase(ctx, 2, '2026-07'));
}
R.section('#1 — no impact: single coach and two ACTIVE coaches unchanged');
{
  const inv = (id, ref, cid) => ({ id, ref, customerId: 10, category: 'Membership', date: '2026-07-01', month: '2026-07', amount: 800, coachId: cid, lineItems: [{ sport: 'Swimming', coachId: cid, classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-07' }] });
  const ctxS = ctxWith({ settings: { commissionBasis: 'attendance', commissionStartDate: '' }, coaches: [{ id: 1, name: 'A', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'M', status: 'Active', expiryDate: '2026-12-01', subscriptions: [{ activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-07-01', end: '2026-12-01', status: 'active', amountPaid: 800, invoiceNumber: 'INV1' }], dailyAttendance: { '2026-07': { Swimming: { '05': 'Y', '10': 'Y', '15': 'Y' } } } }],
    invoices: [inv(900, 'INV1', 1)] }, '2026-07-31');
  R.ok('single coach: 3 attended → 300', commBase(ctxS, 1, '2026-07') === 300);
  const ctxT = ctxWith({ settings: { commissionBasis: 'attendance', commissionStartDate: '' }, coaches: [{ id: 1, name: 'A', rate: 30, role: 'coach', active: true }, { id: 2, name: 'B', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'M', status: 'Active', expiryDate: '2026-12-01', subscriptions: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-07-01', end: '2026-12-01', status: 'active', amountPaid: 800, invoiceNumber: 'INV1' },
      { activity: 'Swimming', coachId: 2, totalClasses: 8, start: '2026-07-01', end: '2026-12-01', status: 'active', amountPaid: 800, invoiceNumber: 'INV2' }],
      dailyAttendance: { '2026-07': { Swimming: { '05': 'Y', '10': 'Y' }, 'Swimming 2': { '06': 'Y', '11': 'Y', '16': 'Y' } } } }],
    invoices: [inv(900, 'INV1', 1), inv(901, 'INV2', 2)] }, '2026-07-31');
  R.ok('two ACTIVE coaches: each paid their own cell (200 / 300)', commBase(ctxT, 1, '2026-07') === 200 && commBase(ctxT, 2, '2026-07') === 300);
}

// ───────────────────────── FIX #2 — Mixed split capped at paid classes ────────────────────────────────
R.section('#2 — Mixed over-attendance never exceeds the package fee');
{
  const mk = (atts) => ctxWith({ settings: { commissionBasis: 'attendance', commissionStartDate: '' },
    coaches: [{ id: 1, name: 'A', rate: 30, role: 'coach', active: true }, { id: 2, name: 'B', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'M', status: 'Active', expiryDate: '2026-10-01', coachId: null, sport: 'Mixed', enrollments: [{ sport: 'Mixed', coachId: null, classes: 8, price: 800, start: '2026-09-01' }],
      subscriptions: [{ activity: 'Mixed', coachId: null, totalClasses: 8, start: '2026-09-01', end: '2026-10-01', status: 'active', attendedClasses: 0, amountPaid: 800, invoiceNumber: 'INVMX' }], mixedAttendance: { '2026-09': atts } }],
    invoices: [{ id: 900, ref: 'INVMX', customerId: 10, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 800, coachId: null, lineItems: [{ sport: 'Mixed', coachId: null, classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-09' }] }] }, '2026-09-30');
  const over = mk({ '01': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '02': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '03': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '04': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '05': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '06': { coachId: 2, sport: 'Swim', mark: 'Y' }, '07': { coachId: 2, sport: 'Swim', mark: 'Y' }, '08': { coachId: 2, sport: 'Swim', mark: 'Y' }, '09': { coachId: 2, sport: 'Swim', mark: 'Y' } });
  R.ok('9 attended on an 8-class package → total capped at 800 (was 900)', commBase(over, 1, '2026-09') + commBase(over, 2, '2026-09') === 800, 'A=' + commBase(over, 1, '2026-09') + ' B=' + commBase(over, 2, '2026-09'));
  const norm = mk({ '02': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '05': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '09': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '12': { coachId: 2, sport: 'Swim', mark: 'Y' }, '16': { coachId: 2, sport: 'Swim', mark: 'Y' } });
  R.ok('no impact: 5 attended → 300 / 200', commBase(norm, 1, '2026-09') === 300 && commBase(norm, 2, '2026-09') === 200);
}

// ───────────────────────── FIX #3 — coaches see/mark Mixed; admin coach-filter matches ────────────────
R.section('#3 — source wiring: Mixed attributed to the coach who taught it + live-Mixed visible to a coach');
R.ok('coachSportsFor attributes Mixed to a coach who taught a Mixed class', /if \(rec && rec\.mark !== 'N' && String\(rec\.coachId\) === String\(cid\)\) \{ set\.add\(MIXED\)/.test(src));
R.ok('memberHasLiveMixed helper exists', /function memberHasLiveMixed\(m\)/.test(src));
R.ok('a coach also sees a LIVE Mixed row they have not taught yet', /wanted = wanted\.filter\(s => mine\.has\(s\) \|\| \(s === MIXED && _liveMix\)\);/.test(src));

// ───────────────────────── FIX #4 — Mixed visible to status / renewal / exports ───────────────────────
R.section('#4 — a finished Mixed member reads Completed + Ready-to-Renew; exports include Mixed');
{
  const ctx = ctxWith({ settings: { commissionBasis: 'attendance', commissionStartDate: '' }, coaches: [{ id: 1, name: 'A', rate: 30, role: 'coach', active: true }],
    members: [{ id: 10, name: 'Trial', status: 'Active', startDate: '2026-09-01', expiryDate: '2026-10-01', coachId: null, sport: 'Mixed', enrollments: [{ sport: 'Mixed', coachId: null, classes: 4, price: 400, start: '2026-09-01' }],
      subscriptions: [{ activity: 'Mixed', coachId: null, totalClasses: 4, start: '2026-09-01', end: '2026-10-01', status: 'active', attendedClasses: 0, amountPaid: 400, invoiceNumber: 'INVMX' }],
      mixedAttendance: { '2026-09': { '02': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '05': { coachId: 1, sport: 'Karate', mark: 'Y' }, '08': { coachId: 1, sport: 'Boxing', mark: 'Y' }, '10': { coachId: 1, sport: 'Swim', mark: 'Y' } } } }],
    invoices: [{ id: 900, ref: 'INVMX', customerId: 10, category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 400, coachId: null, lineItems: [{ sport: 'Mixed', coachId: null, classes: 4, price: 400 }], payments: [{ amount: 400, month: '2026-09' }] }] }, '2026-09-20');
  const q = s => vm.runInContext(s, ctx);
  R.ok('liveAttendanceCount sees Mixed attendance (4)', q(`liveAttendanceCount(state.members[0],'Mixed').y`) === 4);
  R.ok('isCompleted → true for a fully-attended Mixed package', q(`isCompleted(state.members[0])`) === true);
  R.ok('completedSubsForRenewal lists the Mixed sport', JSON.stringify(q(`completedSubsForRenewal(state.members[0]).map(r=>r.sport)`)) === JSON.stringify(['Mixed']));
  R.ok('attendedClassesFor(all) sees Mixed (4)', q(`attendedClassesFor(state.members[0])`) === 4);
}
R.ok('#4 — _attPdf builds Mixed day marks from mixedAttendance', /const dd = sp === MIXED \? _mixDD\(\)/.test(src));
R.ok('#4 — _attPdfSubscription builds Mixed day marks from mixedAttendance', /const dd = sp === MIXED \? \(function\(\)\{ const o = \{\};/.test(src));

// ───────────────────────── FIX #5 — switching an EXPIRED source persists (no silent rollback) ─────────
R.section('#5 — a switch on an expired/last-day source is saved (dest end not backwards)');
R.ok('single-target dest end drops a stale (≤ switchDate) source end', /const _destEnd = \(srcSub\.end && String\(srcSub\.end\) > String\(switchDate\)\) \? srcSub\.end : null;/.test(src));
R.ok('distributed dest end drops a stale source end', /const _dEndSafe = \(_dEnd && String\(_dEnd\) > String\(switchDate\)\) \? _dEnd : null;/.test(src));
{
  // Drive the REAL Confirm-Switch handler on an EXPIRED source and assert it persisted.
  const ctx = H.makeCtx({ today: '2026-11-01', role: 'admin' });
  ctx.__q = {}; const mkNode = () => ({ value: '', _h: '', style: {}, dataset: {}, _handlers: {}, classList: { add() {}, remove() {}, contains: () => false }, addEventListener(e, f) { (this._handlers[e] = this._handlers[e] || []).push(f); }, removeEventListener() {}, querySelector: () => mkNode(), querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, focus() {}, get innerHTML() { return this._h; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = sel => (ctx.__q[sel] = ctx.__q[sel] || mkNode());
  ctx.document.querySelectorAll = () => [];
  ctx.__actions = null; ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; }; ctx.closeModal = () => {}; ctx.render = () => {}; ctx.toast = (m2, k) => { ctx.__toast = { m: m2, k }; }; ctx.confirmSaved = () => {}; ctx.save = () => {};
  vm.runInContext(`
    state.settings={commissionBasis:'attendance',commissionStartDate:'',refundFeePct:15};
    state.coaches=[{id:1,name:'A',rate:30,role:'coach',active:true},{id:2,name:'B',rate:30,role:'coach',active:true}];
    state.members=[{id:20,name:'Exp',status:'Active',expiryDate:'2026-12-01',coachId:1,sport:'Boxing',
      enrollments:[{sport:'Boxing',coachId:1,classes:8,price:800,start:'2026-09-01',validity:30}],
      subscriptions:[{activity:'Boxing',coachId:1,totalClasses:8,start:'2026-09-01',end:'2026-09-30',status:'active',amountPaid:800,invoiceNumber:'INVB'}],
      dailyAttendance:{'2026-09':{Boxing:{'05':'Y','10':'Y'}}}}];
    state.invoices=[{id:901,ref:'INVB',customerId:20,category:'Membership',date:'2026-09-01',month:'2026-09',amount:800,coachId:1,lineItems:[{sport:'Boxing',coachId:1,classes:8,price:800}],payments:[{amount:800,month:'2026-09'}]}];
  `, ctx);
  vm.runInContext(`switchSport(20)`, ctx);
  ctx.document.querySelector('#sw-from').value = '0';
  ctx.document.querySelector('#sw-date').value = '2026-10-15';   // AFTER the source ended 09-30
  ctx.document.querySelector('#sw-reason').value = '';
  ctx.document.querySelector('#sw-sport-0').value = 'Karate';
  ctx.document.querySelector('#sw-coach-0').value = '2';
  const confirm = (ctx.__actions || []).find(a => /Confirm Switch/.test(a.label || ''));
  confirm.onclick();
  const m = vm.runInContext(`state.members.find(x=>x.id===20)`, ctx);
  const dst = (m.subscriptions || []).find(s => s.activity === 'Karate' && s.switchFunded);
  R.ok('the switch PERSISTED (a sportSwitch was recorded)', (m.sportSwitches || []).length === 1, 'switches=' + (m.sportSwitches || []).length);
  R.ok('destination Karate sub created, active, with an OPEN end (not backwards)', !!dst && (dst.status || '').toLowerCase() === 'active' && (dst.end == null), JSON.stringify(dst && { start: dst.start, end: dst.end }));
  R.ok('no active backwards/zero-day window (safety net passed, not rolled back)', vm.runInContext(`switchResultProblem(state.members.find(x=>x.id===20))`, ctx) === null);
}

R.done();
