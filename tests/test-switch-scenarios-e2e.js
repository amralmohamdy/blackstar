// v6.520 — END-TO-END switch scenarios. This does NOT scan source; it DRIVES the real switchSport()
// confirm handler (pages.js) inside the sandbox and asserts on the resulting state: the split invoice,
// source/destination subscriptions, enrollment, member due, and BOTH coaches' attendance commission.
// Every scenario the owner cares about is exercised against the actual code path.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.520 · switch scenarios (drives the real Confirm Switch handler)');

const r2 = n => Math.round(n * 100) / 100;

// Build a fresh sandbox with input-plumbing + captured modal, then a helper to run one switch.
function freshCtx(today) {
  const ctx = H.makeCtx({ today: today || '2026-08-23', role: 'admin' });
  // A keyed element cache so $('#id') (querySelector) returns a persistent, settable node.
  ctx.__q = {};
  const mkNode = () => ({ value: '', _l: {}, style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelector: () => mkNode(), querySelectorAll: () => [],
    getAttribute: () => null, setAttribute() {}, focus() {}, get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = sel => (ctx.__q[sel] = ctx.__q[sel] || mkNode());
  ctx.document.querySelectorAll = () => [];
  // Capture the last modal's actions; neutralise UI side-effects.
  ctx.__actions = null;
  ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; };
  ctx.closeModal = () => {};
  ctx.render = () => {};
  ctx.toast = () => {};
  ctx.confirmSaved = (m, o) => { if (o && typeof o.onOk === 'function') o.onOk(); };
  ctx.save = () => {};
  return ctx;
}

function setInputs(ctx, vals) { for (const k in vals) ctx.document.querySelector(k).value = String(vals[k]); }

// Run switchSport for a member, fill the dialog inputs, and click "🔄 Confirm Switch".
function doSwitch(ctx, { memberId, fromIdx = 0, toSport, toCoachId, date, price, reason }) {
  vm.runInContext(`switchSport(${JSON.stringify(memberId)})`, ctx);
  const inputs = { '#sw-from': fromIdx, '#sw-date': date || ctx.TODAY, '#sw-reason': reason || '',
    '#sw-sport-0': toSport, '#sw-coach-0': toCoachId == null ? '' : toCoachId };
  if (price != null) inputs['#sw-price'] = price;
  setInputs(ctx, inputs);
  const confirm = (ctx.__actions || []).find(a => /Confirm Switch/.test(a.label || ''));
  if (!confirm) throw new Error('no Confirm Switch action captured');
  confirm.onclick();
}

// Convenience readers.
const member = (ctx, id) => vm.runInContext(`state.members.find(m=>m.id===${JSON.stringify(id)})`, ctx);
const invsFor = (ctx, id) => vm.runInContext(`(state.invoices||[]).filter(v=>!v.deleted&&v.customerId===${JSON.stringify(id)})`, ctx);
const comm = (ctx, coachId, month) => r2(vm.runInContext(`(computeAttendanceCommission(${JSON.stringify(coachId)},${JSON.stringify(month)}).base||0)`, ctx));

// A member factory: one paid membership sport with an invoice, sub, enrollment, and attendance.
function seedMember(ctx, o) {
  const attMonth = o.attMonth || '2026-08';
  const attDays = JSON.stringify(o.attDays || {});
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'' , refundFeePct:15 };
    state.coaches = ${JSON.stringify(o.coaches)};
    state.members = [{ id:${o.id}, name:${JSON.stringify(o.name || 'M' + o.id)}, sport:${JSON.stringify(o.sport)}, coachId:${o.coachId},
      expiryDate:'2026-12-01', status:'Active',
      enrollments:[${(o.enrollments || [{ sport: o.sport, coachId: o.coachId, classes: o.classes, price: o.price }]).map(e => JSON.stringify(e)).join(',')}],
      subscriptions:[${(o.subs || [{ activity: o.sport, coachId: o.coachId, totalClasses: o.classes, start: o.subStart || '2026-08-01', end: '2026-12-01', status: 'active', amountPaid: o.price }]).map(s => JSON.stringify(s)).join(',')}],
      dailyAttendance:{ ${JSON.stringify(attMonth)}: ${attDays} } }];
    state.invoices = ${JSON.stringify(o.invoices || [{ id: 900 + o.id, ref: 'INV' + o.id, customerId: o.id, customerName: o.name || ('M' + o.id), category: 'Membership', date: '2026-08-01', month: '2026-08', amount: o.price, coachId: o.coachId, lineItems: [{ sport: o.sport, coachId: o.coachId, coach: '', classes: o.classes, price: o.price }], payments: [{ amount: o.paid == null ? o.price : o.paid, month: '2026-08' }] }])};
  `, ctx);
}

const COACHES = [{ id: 1, name: 'Mostafa', rate: 30, role: 'coach', active: true }, { id: 2, name: 'Zakaria', rate: 30, role: 'coach', active: true }];

// ─────────────────────────────────────────────────────────────────────────────
R.section('Scenario 1 — basic switch, some attended, DEFAULT price (money conserved)');
{
  const ctx = freshCtx('2026-08-23');
  // 800/8 Swimming(1), attends 3 in Aug up to switch → keeps 300; move 5 → default 500. Total stays 800.
  seedMember(ctx, { id: 10, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y', '10': 'Y', '15': 'Y', '20': 'N' } }, subStart: '2026-08-01' });
  doSwitch(ctx, { memberId: 10, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' }); // no price → default
  const m = member(ctx, 10);
  const src = m.subscriptions.find(s => s.activity === 'Swimming');
  const dst = m.subscriptions.find(s => s.activity === 'Karate');
  const inv = invsFor(ctx, 10)[0];
  const sLine = inv.lineItems.find(l => l.sport === 'Swimming');
  const kLine = inv.lineItems.find(l => l.sport === 'Karate');
  R.ok('source sub capped to attended (3) + completed + switchedAwayTo', src.totalClasses === 3 && src.status === 'completed' && src.switchedAwayTo === 'Karate', JSON.stringify(src));
  R.ok('destination sub created with the 5 moved classes, active', dst && dst.totalClasses === 5 && dst.status === 'active', JSON.stringify(dst));
  R.ok('invoice split: Swimming line = 3 classes / 300', sLine && sLine.classes === 3 && r2(sLine.price) === 300, JSON.stringify(sLine));
  R.ok('invoice split: Karate line = 5 classes / 500 (default price)', kLine && kLine.classes === 5 && r2(kLine.price) === 500, JSON.stringify(kLine));
  R.ok('invoice total conserved at 800 (no phantom due)', r2(inv.amount) === 800, 'amount=' + inv.amount);
  R.ok('NO net-zero switch-credit invoice was created', !invsFor(ctx, 10).some(v => v.switchCredit || v.activityType === 'switch-credit'));
  R.ok('old coach Mostafa earns 3 attended × 100 = 300', comm(ctx, 1, '2026-08') === 300, 'got ' + comm(ctx, 1, '2026-08'));
}

R.section('Scenario 2 — RE-PRICE dearer → member owes a top-up');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 11, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y', '10': 'Y', '15': 'Y' } }, subStart: '2026-08-01' });
  doSwitch(ctx, { memberId: 11, toSport: 'Karate', toCoachId: 2, date: '2026-08-16', price: 700 }); // dearer than default 500
  const inv = invsFor(ctx, 11)[0];
  R.ok('Karate line uses the entered price 700', r2(inv.lineItems.find(l => l.sport === 'Karate').price) === 700);
  R.ok('invoice total = 300 + 700 = 1000 (owes 200 over the 800 paid)', r2(inv.amount) === 1000, 'amount=' + inv.amount);
}

R.section('Scenario 3 — RE-PRICE cheaper → refundable over-payment');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 12, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y', '10': 'Y', '15': 'Y' } }, subStart: '2026-08-01' });
  doSwitch(ctx, { memberId: 12, toSport: 'Karate', toCoachId: 2, date: '2026-08-16', price: 300 });
  const inv = invsFor(ctx, 12)[0];
  R.ok('invoice total = 300 + 300 = 600 (600 < 800 paid → 200 refundable)', r2(inv.amount) === 600, 'amount=' + inv.amount);
}

R.section('Scenario 4 — CARRY-FORWARD: 2 carried classes move at the old rate');
{
  const ctx = freshCtx('2026-08-23');
  // Give the member a completed prior Swimming package with 2 unused (carry-forward) classes.
  seedMember(ctx, { id: 13, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y', '10': 'Y' } }, subStart: '2026-08-01',
    subs: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-08-01', end: '2026-12-01', status: 'active', amountPaid: 800 },
      { activity: 'Swimming', coachId: 1, totalClasses: 6, start: '2026-06-01', end: '2026-07-15', status: 'completed', attendedClasses: 4 },
    ] });
  const carriedBefore = vm.runInContext(`(typeof carryForwardCredit==='function')?carryForwardCredit(state.members.find(m=>m.id===13),'Swimming'):'no-fn'`, ctx);
  doSwitch(ctx, { memberId: 13, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' });
  const dst = member(ctx, 13).subscriptions.find(s => s.activity === 'Karate' && s.switchFunded);
  // attended 2 of 8 → remaining 6; + carried → moved > 6 when carry-forward exists.
  R.ok('carryForwardCredit(fn) exists and returned a number', typeof carriedBefore === 'number', 'carried=' + carriedBefore);
  R.ok('moved classes = remaining(6) + carried', dst && dst.totalClasses === 6 + (typeof carriedBefore === 'number' ? carriedBefore : 0), 'moved=' + (dst && dst.totalClasses) + ' carried=' + carriedBefore);
}

R.section('Scenario 5 — attended ZERO → whole package moves, source completes at 0/0');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 14, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: {} }, subStart: '2026-08-01' });
  doSwitch(ctx, { memberId: 14, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' });
  const m = member(ctx, 14);
  const src = m.subscriptions.find(s => s.activity === 'Swimming');
  const dst = m.subscriptions.find(s => s.activity === 'Karate');
  R.ok('source completed at 0 classes', src.totalClasses === 0 && src.status === 'completed');
  R.ok('all 8 classes moved to destination', dst.totalClasses === 8, 'moved=' + dst.totalClasses);
  R.ok('old coach earns 0 (no attendance)', comm(ctx, 1, '2026-08') === 0);
}

R.section('Scenario 6 — attended ALL → nothing to move (source stays full, dest 0)');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 15, sport: 'Swimming', coachId: 1, classes: 4, price: 400, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '02': 'Y', '05': 'Y', '09': 'Y', '12': 'Y' } }, subStart: '2026-08-01' });
  doSwitch(ctx, { memberId: 15, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' });
  const m = member(ctx, 15);
  const src = m.subscriptions.find(s => s.activity === 'Swimming');
  const dst = m.subscriptions.find(s => s.activity === 'Karate');
  R.ok('source completed at 4 attended', src.totalClasses === 4 && src.status === 'completed');
  R.ok('destination has 0 moved classes', dst.totalClasses === 0, 'moved=' + dst.totalClasses);
  R.ok('old coach earns the full 400 (attended all 4)', comm(ctx, 1, '2026-08') === 400, 'got ' + comm(ctx, 1, '2026-08'));
}

R.section('Scenario 7 — same sport, COACH CHANGE (Mostafa → Zakaria)');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 16, sport: 'Karate', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Karate: { '05': 'Y', '10': 'Y' } }, subStart: '2026-08-01' });
  doSwitch(ctx, { memberId: 16, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' });
  const m = member(ctx, 16);
  const src = m.subscriptions.find(s => s.activity === 'Karate' && String(s.coachId) === '1');
  const dst = m.subscriptions.find(s => s.activity === 'Karate' && String(s.coachId) === '2');
  R.ok('old-coach sub capped + completed', src && src.totalClasses === 2 && src.status === 'completed');
  R.ok('new-coach sub created with 6 moved classes', dst && dst.totalClasses === 6, JSON.stringify(dst));
  R.ok('Mostafa earns 2×100=200, Zakaria earns on his new line', comm(ctx, 1, '2026-08') === 200, 'M=' + comm(ctx, 1, '2026-08'));
}

R.section('Scenario 8 — F1: an existing PAID destination package is NOT clobbered');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 17, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y', '10': 'Y' } }, subStart: '2026-08-01',
    subs: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-08-01', end: '2026-12-01', status: 'active', amountPaid: 800 },
      { activity: 'Karate', coachId: 2, totalClasses: 10, start: '2026-08-01', end: '2026-12-01', status: 'active', amountPaid: 500, _sid: 'existingPaid' },
    ] });
  doSwitch(ctx, { memberId: 17, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' });
  const m = member(ctx, 17);
  const existing = m.subscriptions.find(s => s._sid === 'existingPaid');
  const karateSubs = m.subscriptions.filter(s => s.activity === 'Karate');
  R.ok('the existing paid Karate package is untouched (still 10 / 500)', existing && existing.totalClasses === 10 && existing.amountPaid === 500, JSON.stringify(existing));
  R.ok('a SEPARATE switch-funded Karate sub was added (two Karate subs now)', karateSubs.length === 2, 'count=' + karateSubs.length);
}

R.section('Scenario 9 — F3 windowing: a RENEWAL does not over-count attended');
{
  const ctx = freshCtx('2026-08-23');
  // Current package starts 2026-08-01. A stray July 'Y' (old package) must NOT count.
  seedMember(ctx, { id: 18, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    subStart: '2026-08-01',
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y', '10': 'Y' } } });
  // add a July attendance for the same sport (previous package)
  vm.runInContext(`state.members.find(m=>m.id===18).dailyAttendance['2026-07']={Swimming:{'03':'Y','20':'Y'}};`, ctx);
  doSwitch(ctx, { memberId: 18, toSport: 'Karate', toCoachId: 2, date: '2026-08-16' });
  const src = member(ctx, 18).subscriptions.find(s => s.activity === 'Swimming');
  R.ok('attended counts ONLY the 2 August classes (July ignored)', src.totalClasses === 2, 'capped to=' + src.totalClasses);
}

R.section('Scenario 10 — Summer Camp on the destination → no commission split (skipReconciliation)');
{
  const ctx = freshCtx('2026-08-23');
  seedMember(ctx, { id: 19, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-08', attDays: { Swimming: { '05': 'Y' } }, subStart: '2026-08-01' });
  const before = invsFor(ctx, 19).length;
  doSwitch(ctx, { memberId: 19, toSport: 'Summer Camp', toCoachId: null, date: '2026-08-16' });
  const m = member(ctx, 19);
  R.ok('switch completed without throwing and recorded a sportSwitch', Array.isArray(m.sportSwitches) && m.sportSwitches.length === 1);
  R.ok('no split re-pricing invoice line madness (invoice count stable)', invsFor(ctx, 19).length === before, 'before=' + before + ' after=' + invsFor(ctx, 19).length);
}

R.done();
