// v6.568 — FULL SWITCH MATRIX SIMULATION. Drives the REAL "🔄 Confirm Switch" handler (pages.js) for
// every switch sport/coach case the club hits, then asserts the complete invariant set on the resulting
// data: safety net (no backwards / zero-day window; not rolled back), source capped + completed +
// switchedAwayTo, destination active + switch-funded + a VALID window, money conserved (invoice = aShare +
// bPrice; no phantom credit), commission split (old coach = attended share), renewal cycle-selection
// (the covering / latest cycle is switched, the old one untouched), the v6.568 attendance display shape
// (old coach = history, new coach = the one live row), distributed one→many, and the guard that ROLLS
// BACK a structurally broken switch. This is the "simulate all cases properly" report.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.568 · SWITCH MATRIX — all sport/coach cases (drives the real handler)');
const r2 = n => Math.round(n * 100) / 100;

// ── sandbox with input plumbing + captured modal + recorded event handlers ──
function freshCtx(today) {
  const ctx = H.makeCtx({ today: today || '2026-09-13', role: 'admin' });
  ctx.__q = {};
  const mkNode = () => ({ value: '', _h: '', style: {}, dataset: {}, _handlers: {},
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener(ev, fn) { (this._handlers[ev] = this._handlers[ev] || []).push(fn); },
    removeEventListener() {}, querySelector: () => mkNode(), querySelectorAll: () => [],
    getAttribute: () => null, setAttribute() {}, focus() {},
    get innerHTML() { return this._h || ''; }, set innerHTML(v) { this._h = String(v); } });
  ctx.document.querySelector = sel => (ctx.__q[sel] = ctx.__q[sel] || mkNode());
  ctx.document.querySelectorAll = () => [];
  ctx.__actions = null;
  ctx.showModal = ({ actions } = {}) => { ctx.__actions = actions || []; };
  ctx.closeModal = () => {};
  ctx.render = () => {};
  ctx.toast = (msg, kind) => { ctx.__lastToast = { msg, kind }; };
  ctx.confirmSaved = (m, o) => { if (o && typeof o.onOk === 'function') o.onOk(); };
  ctx.save = () => {};
  return ctx;
}
const setInputs = (ctx, vals) => { for (const k in vals) ctx.document.querySelector(k).value = String(vals[k]); };
const fire = (ctx, sel, ev) => { const n = ctx.__q[sel]; if (n && n._handlers[ev]) n._handlers[ev].forEach(fn => fn()); };

// Run switchSport, fill inputs, click Confirm. For distributed, pass targets:[{sport,coachId,classes},...] (>=2).
function doSwitch(ctx, { memberId, fromIdx = 0, toSport, toCoachId, date, price, reason, targets }) {
  vm.runInContext(`switchSport(${JSON.stringify(memberId)})`, ctx);
  ctx.document.querySelector('#sw-from').value = String(fromIdx);
  ctx.document.querySelector('#sw-date').value = date || ctx.TODAY;
  ctx.document.querySelector('#sw-reason').value = reason || '';
  if (targets && targets.length > 1) {
    for (let k = 1; k < targets.length; k++) fire(ctx, '#sw-add-target', 'click');  // real add-row path
    targets.forEach((t, i) => {
      ctx.document.querySelector('#sw-sport-' + i).value = t.sport;
      ctx.document.querySelector('#sw-coach-' + i).value = t.coachId == null ? '' : t.coachId;
      ctx.document.querySelector('#sw-classes-' + i).value = String(t.classes);
    });
  } else {
    ctx.document.querySelector('#sw-sport-0').value = toSport;
    ctx.document.querySelector('#sw-coach-0').value = toCoachId == null ? '' : toCoachId;
    if (price != null) ctx.document.querySelector('#sw-price').value = String(price);
  }
  const confirm = (ctx.__actions || []).find(a => /Confirm Switch/.test(a.label || ''));
  if (!confirm) throw new Error('no Confirm Switch action captured');
  confirm.onclick();
}

const member = (ctx, id) => vm.runInContext(`state.members.find(m=>m.id===${JSON.stringify(id)})`, ctx);
const invsFor = (ctx, id) => vm.runInContext(`(state.invoices||[]).filter(v=>!v.deleted&&v.customerId===${JSON.stringify(id)})`, ctx);
const comm = (ctx, coachId, month) => r2(vm.runInContext(`(computeAttendanceCommission(${JSON.stringify(coachId)},${JSON.stringify(month)}).base||0)`, ctx));
const problem = (ctx, id) => vm.runInContext(`(typeof switchResultProblem==='function')?switchResultProblem(state.members.find(m=>m.id===${JSON.stringify(id)})):null`, ctx);

function seedMember(ctx, o) {
  const attMonth = o.attMonth || '2026-09';
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'', refundFeePct:15 };
    state.coaches = ${JSON.stringify(o.coaches)};
    state.members = [{ id:${o.id}, name:${JSON.stringify(o.name || 'M' + o.id)}, sport:${JSON.stringify(o.sport)}, coachId:${o.coachId},
      expiryDate:'2026-12-01', status:'Active',
      enrollments:${JSON.stringify(o.enrollments || [{ sport: o.sport, coachId: o.coachId, classes: o.classes, price: o.price }])},
      subscriptions:${JSON.stringify(o.subs || [{ activity: o.sport, coachId: o.coachId, totalClasses: o.classes, start: o.subStart || '2026-09-01', end: '2026-12-01', status: 'active', amountPaid: o.paid == null ? o.price : o.paid }])},
      dailyAttendance:${JSON.stringify({ [attMonth]: o.attDays || {} })} }];
    state.invoices = ${JSON.stringify(o.invoices || [{ id: 900 + o.id, ref: 'INV' + o.id, customerId: o.id, customerName: o.name || ('M' + o.id), category: 'Membership', date: o.subStart || '2026-09-01', month: attMonth, amount: o.price, coachId: o.coachId, lineItems: [{ sport: o.sport, coachId: o.coachId, coach: '', classes: o.classes, price: o.price }], payments: [{ amount: o.paid == null ? o.price : o.paid, month: attMonth }] }])};
  `, ctx);
}

const COACHES = [
  { id: 1, name: 'Mostafa', rate: 30, role: 'coach', active: true },
  { id: 2, name: 'Zakaria', rate: 30, role: 'coach', active: true },
  { id: 3, name: 'Aziz', rate: 30, role: 'coach', active: true },
];

// ── invariant helpers (read the RESULTING member) ──
const isFinished = s => (s.status || '').toLowerCase() === 'completed' || (s.status || '').toLowerCase() === 'withdrawn' || !!s.switchedAwayTo;
const liveSubs = (m, sport, cid) => (m.subscriptions || []).filter(s => (s.activity || '') === sport && !isFinished(s) && (cid == null || String(s.coachId) === String(cid)));

// Mirror the v6.568 attendance-grid history predicate: which coaches for a sport render as LIVE rows
// (not greyed as history). History = no live sub, OR window ended and a later live coach superseded it.
function gridLiveCoaches(m, sport, today) {
  const spSubs = (m.subscriptions || []).filter(s => (s.activity || '') === sport && s.coachId != null);
  const coachIds = [...new Set(spSubs.map(s => String(s.coachId)))];
  const isLive = s => (s.status || '').toLowerCase() !== 'completed' && (s.status || '').toLowerCase() !== 'withdrawn' && !s.switchedAwayTo;
  const liveCid = c => spSubs.some(s => String(s.coachId) === c && isLive(s));
  const liveEnd = c => { const ls = spSubs.filter(s => String(s.coachId) === c && isLive(s)); if (!ls.length) return null; if (ls.some(s => !s.end)) return '9999-99-99'; return ls.reduce((mx, s) => (s.end > mx ? s.end : mx), ''); };
  const liveStart = c => { const ls = spSubs.filter(s => String(s.coachId) === c && isLive(s)); if (!ls.length) return null; if (ls.some(s => !s.start)) return ''; return ls.reduce((mn, s) => (mn === null || s.start < mn ? s.start : mn), null); };
  return coachIds.filter(cid => {
    const noLive = !liveCid(cid);
    const myEnd = noLive ? null : liveEnd(cid);
    const superseded = !noLive && myEnd && myEnd !== '9999-99-99' && myEnd < today && coachIds.some(o => o !== cid && liveCid(o) && (liveStart(o) || '') >= myEnd);
    return !(noLive || superseded); });
}

// Run the standard single-target invariant battery. `exp` carries expected numbers.
function checkSingle(tag, ctx, id, from, to, switchDate, exp) {
  const m = member(ctx, id);
  const sw = (m.sportSwitches || []).slice(-1)[0] || {};
  const snap = sw.snapshot || {};
  const src = (m.subscriptions || []).find(s => (s.activity || '') === from.sport && String(s.coachId) === String(from.coachId) && s.switchedAwayTo === to.sport);
  const dst = (m.subscriptions || []).find(s => (s.activity || '') === to.sport && String(s.coachId) === String(to.coachId) && s.switchFunded && !isFinished(s));
  const inv = invsFor(ctx, id).filter(v => !v.switchCredit).sort((a, b) => (b.lineItems || []).length - (a.lineItems || []).length)[0];

  R.ok(`[${tag}] safety net passed — no broken window (switchResultProblem null)`, problem(ctx, id) === null, JSON.stringify(problem(ctx, id)));
  R.ok(`[${tag}] switch APPLIED (recorded a sportSwitch to ${to.sport})`, sw.toSport === to.sport || (sw.targets && sw.targets.length), JSON.stringify(sw.toSport));
  R.ok(`[${tag}] source sub completed + switchedAwayTo=${to.sport}`, !!src && (src.status || '').toLowerCase() === 'completed' && src.switchedAwayTo === to.sport, JSON.stringify(src));
  R.ok(`[${tag}] source sub CAPPED to attended (${exp.attended})`, !!src && src.totalClasses === exp.attended, 'got ' + (src && src.totalClasses));
  R.ok(`[${tag}] destination sub active + switch-funded`, !!dst && (dst.status || '').toLowerCase() === 'active' && dst.switchFunded === true, JSON.stringify(dst));
  R.ok(`[${tag}] destination window VALID — start=${switchDate}, end=source end, start<=end`,
    !!dst && dst.start === switchDate && dst.end === (src ? src.end : null) && (!dst.end || String(dst.start) <= String(dst.end)), JSON.stringify(dst && { start: dst.start, end: dst.end }));
  R.ok(`[${tag}] moved classes = remaining+carry (${exp.moved})`, !!dst && dst.totalClasses === exp.moved, 'got ' + (dst && dst.totalClasses));
  R.ok(`[${tag}] NO active backwards/zero-day sub anywhere`, !(m.subscriptions || []).some(s => !isFinished(s) && s.start && s.end && String(s.start) > String(s.end)));
  R.ok(`[${tag}] NO phantom net-zero switch-credit invoice`, !invsFor(ctx, id).some(v => v.switchCredit));
  R.ok(`[${tag}] invoice re-totalled = aShare(${exp.aShare}) + bPrice(${exp.bPrice}) = ${r2(exp.aShare + exp.bPrice)}`, !!inv && r2(inv.amount) === r2(exp.aShare + exp.bPrice), 'amount=' + (inv && inv.amount));
  R.ok(`[${tag}] old coach commission = attended share (${exp.oldComm})`, comm(ctx, from.coachId, exp.month) === exp.oldComm, 'got ' + comm(ctx, from.coachId, exp.month));
  // v6.568 display shape
  if (from.sport === to.sport) {
    R.ok(`[${tag}] v6.568 display: OLD coach has NO live sub (grid = history)`, !liveSubs(m, from.sport, from.coachId).length);
    R.ok(`[${tag}] v6.568 display: NEW coach has exactly ONE live sub (the current row)`, liveSubs(m, to.sport, to.coachId).length === 1);
  } else {
    R.ok(`[${tag}] v6.568 display: source sport has NO live sub (member left it)`, !liveSubs(m, from.sport, null).length);
    R.ok(`[${tag}] v6.568 display: destination sport has ONE live sub`, liveSubs(m, to.sport, to.coachId).length === 1);
  }
  return { m, src, dst, inv, snap };
}

// ═══════════════════════════════ SINGLE-TARGET MATRIX ═══════════════════════════════
R.section('S1 — cross-sport · partial attended · default price · single cycle · fully paid');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 1, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '09': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 1, toSport: 'Karate', toCoachId: 2, date: '2026-09-10' });
  checkSingle('S1', ctx, 1, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-10',
    { attended: 3, moved: 5, aShare: 300, bPrice: 500, oldComm: 300, month: '2026-09' });
}

R.section('S2 — cross-sport · RE-PRICE dearer → top-up due');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 2, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '09': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 2, toSport: 'Karate', toCoachId: 2, date: '2026-09-10', price: 700 });
  checkSingle('S2', ctx, 2, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-10',
    { attended: 3, moved: 5, aShare: 300, bPrice: 700, oldComm: 300, month: '2026-09' });
}

R.section('S3 — cross-sport · RE-PRICE cheaper → over-payment credit');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 3, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '09': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 3, toSport: 'Karate', toCoachId: 2, date: '2026-09-10', price: 300 });
  checkSingle('S3', ctx, 3, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-10',
    { attended: 3, moved: 5, aShare: 300, bPrice: 300, oldComm: 300, month: '2026-09' });
}

R.section('S4 — cross-sport · ZERO attended → whole package moves');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 4, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: {} }, subStart: '2026-09-01' });
  checkSingle('S4', ctx, 4, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-10',
    { attended: 0, moved: 8, aShare: 0, bPrice: 800, oldComm: 0, month: '2026-09' },
    doSwitch(ctx, { memberId: 4, toSport: 'Karate', toCoachId: 2, date: '2026-09-10' }));
}

R.section('S5 — cross-sport · ALL attended → nothing moves (source stays full)');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 5, sport: 'Swimming', coachId: 1, classes: 4, price: 400, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '08': 'Y', '10': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 5, toSport: 'Karate', toCoachId: 2, date: '2026-09-12' });
  checkSingle('S5', ctx, 5, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-12',
    { attended: 4, moved: 0, aShare: 400, bPrice: 0, oldComm: 400, month: '2026-09' });
}

R.section('S6 — SAME sport · COACH change · partial (v6.568 history/live display)');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 6, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 6, toSport: 'Swimming', toCoachId: 2, date: '2026-09-10' });
  checkSingle('S6', ctx, 6, { sport: 'Swimming', coachId: 1 }, { sport: 'Swimming', coachId: 2 }, '2026-09-10',
    { attended: 2, moved: 6, aShare: 200, bPrice: 600, oldComm: 200, month: '2026-09' });
}

R.section('S7 — SAME sport · COACH change · ZERO attended');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 7, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: {} }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 7, toSport: 'Swimming', toCoachId: 2, date: '2026-09-10' });
  checkSingle('S7', ctx, 7, { sport: 'Swimming', coachId: 1 }, { sport: 'Swimming', coachId: 2 }, '2026-09-10',
    { attended: 0, moved: 8, aShare: 0, bPrice: 800, oldComm: 0, month: '2026-09' });
}

R.section('S8 — SAME sport · COACH change · ALL attended');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 8, sport: 'Swimming', coachId: 1, classes: 4, price: 400, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '08': 'Y', '10': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 8, toSport: 'Swimming', toCoachId: 2, date: '2026-09-12' });
  checkSingle('S8', ctx, 8, { sport: 'Swimming', coachId: 1 }, { sport: 'Swimming', coachId: 2 }, '2026-09-12',
    { attended: 4, moved: 0, aShare: 400, bPrice: 0, oldComm: 400, month: '2026-09' });
}

R.section('S9 — cross-sport · SAME coach (rare but legal)');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 9, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '09': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 9, toSport: 'Karate', toCoachId: 1, date: '2026-09-10' });
  checkSingle('S9', ctx, 9, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 1 }, '2026-09-10',
    { attended: 3, moved: 5, aShare: 300, bPrice: 500, oldComm: 300, month: '2026-09' });
}

R.section('S10 — RENEWED sport (old completed cycle + current active) → switch the CURRENT');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 10, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-09', attDays: { Swimming: { '02': 'Y', '05': 'Y' } },
    subs: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-07-01', end: '2026-08-01', status: 'completed', amountPaid: 800, attendedClasses: 8 },
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-09-01', end: '2026-10-01', status: 'active', amountPaid: 800 },
    ],
    invoices: [{ id: 910, ref: 'INV10', customerId: 10, customerName: 'M10', category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 800, coachId: 1, lineItems: [{ sport: 'Swimming', coachId: 1, coach: '', classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-09' }] }] });
  doSwitch(ctx, { memberId: 10, toSport: 'Swimming', toCoachId: 2, date: '2026-09-10' });
  const { m } = checkSingle('S10', ctx, 10, { sport: 'Swimming', coachId: 1 }, { sport: 'Swimming', coachId: 2 }, '2026-09-10',
    { attended: 2, moved: 6, aShare: 200, bPrice: 600, oldComm: 200, month: '2026-09' });
  const oldCycle = m.subscriptions.find(s => s.start === '2026-07-01');
  R.ok('[S10] the OLD completed cycle is left untouched (still 8, completed)', oldCycle && oldCycle.totalClasses === 8 && (oldCycle.status || '').toLowerCase() === 'completed' && !oldCycle.switchedAwayTo, JSON.stringify(oldCycle));
  const dst = m.subscriptions.find(s => s.switchFunded);
  R.ok('[S10] destination end = the CURRENT cycle end (2026-10-01), not the old one', dst && dst.end === '2026-10-01', JSON.stringify(dst && dst.end));
}

R.section('S11 — TWO cycles BOTH cover the switch date (Basil case) → renewal switched, no zero-day');
{
  const ctx = freshCtx('2026-09-13');
  // old cycle ends 09-12; renewal started 09-08 → both cover 09-12. Switch on 09-12.
  seedMember(ctx, { id: 11, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-09', attDays: { Swimming: { '02': 'Y', '10': 'Y' } },
    subs: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-08-13', end: '2026-09-12', status: 'active', amountPaid: 800 },
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-09-08', end: '2026-10-08', status: 'active', amountPaid: 800 },
    ],
    invoices: [
      { id: 911, ref: 'INV11a', customerId: 11, customerName: 'M11', category: 'Membership', date: '2026-08-13', month: '2026-08', amount: 800, coachId: 1, lineItems: [{ sport: 'Swimming', coachId: 1, classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-08' }] },
      { id: 912, ref: 'INV11b', customerId: 11, customerName: 'M11', category: 'Membership', date: '2026-09-08', month: '2026-09', amount: 800, coachId: 1, lineItems: [{ sport: 'Swimming', coachId: 1, classes: 8, price: 800 }], payments: [{ amount: 800, month: '2026-09' }] },
    ] });
  doSwitch(ctx, { memberId: 11, toSport: 'Swimming', toCoachId: 2, date: '2026-09-12' });
  const m = member(ctx, 11);
  R.ok('[S11] safety net passed (no zero-day / backwards)', problem(ctx, 11) === null, JSON.stringify(problem(ctx, 11)));
  const dst = m.subscriptions.find(s => s.switchFunded && !isFinished(s));
  R.ok('[S11] destination took the RENEWAL end (2026-10-08), NOT the old cycle end (09-12)', dst && dst.end === '2026-10-08', JSON.stringify(dst && { start: dst.start, end: dst.end }));
  R.ok('[S11] destination window is not zero-day (start 09-12 < end 10-08)', dst && String(dst.start) < String(dst.end));
  const renewalSwitched = m.subscriptions.find(s => s.start === '2026-09-08' && s.switchedAwayTo === 'Swimming');
  R.ok('[S11] the RENEWAL cycle (start 09-08) is the one marked switched-away', !!renewalSwitched, JSON.stringify(m.subscriptions.map(s => ({ start: s.start, end: s.end, st: s.status, sw: s.switchedAwayTo }))));
  // The old cycle is left 'active' (early-renewal shape) but ENDED 09-12; v6.568 supersession greys it.
  R.ok('[S11] grid renders exactly ONE live Swimming coach (Zakaria) — old ended cycle = history', JSON.stringify(gridLiveCoaches(m, 'Swimming', '2026-09-13')) === JSON.stringify(['2']), JSON.stringify(gridLiveCoaches(m, 'Swimming', '2026-09-13')));
  R.ok('[S11] Mostafa has no CURRENT (non-ended) live cycle after the switch', !liveSubs(m, 'Swimming', 1).some(s => !s.end || s.end >= '2026-09-13'));
}

R.section('S12 — BACK-DATED switch (date before today, inside the cycle)');
{
  const ctx = freshCtx('2026-09-30');
  seedMember(ctx, { id: 12, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-09', attDays: { Swimming: { '02': 'Y', '05': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 12, toSport: 'Karate', toCoachId: 2, date: '2026-09-08' });   // back-dated
  checkSingle('S12', ctx, 12, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-08',
    { attended: 2, moved: 6, aShare: 200, bPrice: 600, oldComm: 200, month: '2026-09' });
}

R.section('S13 — PARTIALLY paid → switch applies, due reflects new total');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 13, sport: 'Swimming', coachId: 1, classes: 8, price: 800, paid: 400, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y', '09': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 13, toSport: 'Karate', toCoachId: 2, date: '2026-09-10', price: 700 });
  checkSingle('S13', ctx, 13, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-10',
    { attended: 3, moved: 5, aShare: 300, bPrice: 700, oldComm: 300, month: '2026-09' });
  const due = r2(vm.runInContext(`memberOutstanding(13)`, ctx));
  R.ok('[S13] due = new total 1000 − paid 400 = 600', due === 600, 'due=' + due);
}

R.section('S14 — UNPAID → switch still applies cleanly');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 14, sport: 'Swimming', coachId: 1, classes: 8, price: 800, paid: 0, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y' } }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 14, toSport: 'Karate', toCoachId: 2, date: '2026-09-10' });
  checkSingle('S14', ctx, 14, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-10',
    { attended: 2, moved: 6, aShare: 200, bPrice: 600, oldComm: 200, month: '2026-09' });
  const due = r2(vm.runInContext(`memberOutstanding(14)`, ctx));
  R.ok('[S14] due = full new total 800 (nothing paid)', due === 800, 'due=' + due);
}

R.section('S15 — MULTI-COACH sport (two coaches already) → switch ONE, other package untouched');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 15, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-09', attDays: { Swimming: { '02': 'Y', '05': 'Y' }, 'Swimming 3': { '03': 'Y' } },
    subs: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-09-01', end: '2026-10-01', status: 'active', amountPaid: 800 },
      { activity: 'Swimming', coachId: 3, totalClasses: 6, start: '2026-09-01', end: '2026-10-01', status: 'active', amountPaid: 600, _sid: 'other' },
    ],
    invoices: [{ id: 915, ref: 'INV15', customerId: 15, customerName: 'M15', category: 'Membership', date: '2026-09-01', month: '2026-09', amount: 1400, coachId: null,
      lineItems: [{ sport: 'Swimming', coachId: 1, classes: 8, price: 800 }, { sport: 'Swimming', coachId: 3, classes: 6, price: 600 }], payments: [{ amount: 1400, month: '2026-09' }] }] });
  doSwitch(ctx, { memberId: 15, toSport: 'Karate', toCoachId: 2, date: '2026-09-10' });
  const m = member(ctx, 15);
  R.ok('[S15] safety net passed', problem(ctx, 15) === null);
  const other = m.subscriptions.find(s => s._sid === 'other');
  R.ok('[S15] the OTHER coach\'s Swimming package (Aziz, 6/600) is untouched', other && other.totalClasses === 6 && other.amountPaid === 600 && !isFinished(other), JSON.stringify(other));
  R.ok('[S15] Aziz still has a live Swimming sub; Mostafa\'s is switched away', liveSubs(m, 'Swimming', 3).length === 1 && !liveSubs(m, 'Swimming', 1).length);
  R.ok('[S15] a live Karate sub under Zakaria now exists', liveSubs(m, 'Karate', 2).length === 1);
}

R.section('S16 — CARRY-FORWARD classes present → moved = remaining + carried');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 16, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-09', attDays: { Swimming: { '02': 'Y', '05': 'Y' } },
    subs: [
      { activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-09-01', end: '2026-12-01', status: 'active', amountPaid: 800 },
      { activity: 'Swimming', coachId: 1, totalClasses: 6, start: '2026-06-01', end: '2026-07-15', status: 'completed', attendedClasses: 4 },
    ] });
  const carried = vm.runInContext(`(typeof carryForwardCredit==='function')?Math.max(0,Math.round(carryForwardCredit(state.members.find(m=>m.id===16),'Swimming')||0)):0`, ctx);
  doSwitch(ctx, { memberId: 16, toSport: 'Karate', toCoachId: 2, date: '2026-09-10' });
  const m = member(ctx, 16);
  const dst = m.subscriptions.find(s => s.activity === 'Karate' && s.switchFunded);
  R.ok('[S16] safety net passed', problem(ctx, 16) === null);
  R.ok('[S16] moved = remaining(6) + carried(' + carried + ')', dst && dst.totalClasses === 6 + carried, 'moved=' + (dst && dst.totalClasses));
}

R.section('S17 — switch TO Summer Camp (skipReconciliation, no commission split)');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 17, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y' } }, subStart: '2026-09-01' });
  const before = invsFor(ctx, 17).length;
  doSwitch(ctx, { memberId: 17, toSport: 'Summer Camp', toCoachId: null, date: '2026-09-10' });
  const m = member(ctx, 17);
  R.ok('[S17] safety net passed', problem(ctx, 17) === null);
  R.ok('[S17] a sportSwitch was recorded', (m.sportSwitches || []).length === 1);
  R.ok('[S17] no invoice-count explosion (stable)', invsFor(ctx, 17).length === before, 'before=' + before + ' after=' + invsFor(ctx, 17).length);
}

R.section('S18 — switch on the MEMBERSHIP START DAY (0 attended, whole package moves)');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 18, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: {} }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 18, toSport: 'Karate', toCoachId: 2, date: '2026-09-01' });
  checkSingle('S18', ctx, 18, { sport: 'Swimming', coachId: 1 }, { sport: 'Karate', coachId: 2 }, '2026-09-01',
    { attended: 0, moved: 8, aShare: 0, bPrice: 800, oldComm: 0, month: '2026-09' });
}

// ═══════════════════════════════ GUARD (safety net must ROLL BACK) ═══════════════════════════════
R.section('S19 — GUARD: switch DATE AFTER the cycle ended → would be backwards → ROLLED BACK, saves nothing');
{
  const ctx = freshCtx('2026-11-01');
  seedMember(ctx, { id: 19, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attMonth: '2026-09', attDays: { Swimming: { '02': 'Y' } },
    subs: [{ activity: 'Swimming', coachId: 1, totalClasses: 8, start: '2026-09-01', end: '2026-09-30', status: 'active', amountPaid: 800 }] });
  const before = JSON.stringify(member(ctx, 19));
  doSwitch(ctx, { memberId: 19, toSport: 'Karate', toCoachId: 2, date: '2026-10-15' });   // after end → dest start>end
  const after = member(ctx, 19);
  R.ok('[S19] member is UNCHANGED (rolled back — no switch persisted)', JSON.stringify(after) === before, 'sportSwitches=' + (after.sportSwitches || []).length);
  R.ok('[S19] no dangling active backwards window remains', !(after.subscriptions || []).some(s => !isFinished(s) && s.start && s.end && String(s.start) > String(s.end)));
  R.ok('[S19] the user was warned the switch was NOT saved', /NOT saved/i.test((ctx.__lastToast || {}).msg || ''), (ctx.__lastToast || {}).msg);
}

// ═══════════════════════════════ DISTRIBUTED (one → many) ═══════════════════════════════
R.section('S20 — DISTRIBUTED: one sport → TWO sports · partial attended');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 20, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: { '02': 'Y', '05': 'Y' } }, subStart: '2026-09-01' });   // attended 2 → 6 remain
  doSwitch(ctx, { memberId: 20, date: '2026-09-10', targets: [
    { sport: 'Karate', coachId: 2, classes: 4 },
    { sport: 'Boxing', coachId: 3, classes: 2 },
  ] });
  const m = member(ctx, 20);
  R.ok('[S20] safety net passed', problem(ctx, 20) === null, JSON.stringify(problem(ctx, 20)));
  const src = m.subscriptions.find(s => s.activity === 'Swimming' && s.switchedAwayTo);
  R.ok('[S20] source Swimming completed + switchedAwayTo, capped to attended (2)', src && (src.status || '').toLowerCase() === 'completed' && src.totalClasses === 2, JSON.stringify(src));
  const kar = m.subscriptions.find(s => s.activity === 'Karate' && s.switchFunded);
  const box = m.subscriptions.find(s => s.activity === 'Boxing' && s.switchFunded);
  R.ok('[S20] Karate switch-funded sub = 4 classes, active, valid window', kar && kar.totalClasses === 4 && (kar.status || '').toLowerCase() === 'active' && kar.start === '2026-09-10' && (!kar.end || kar.start <= kar.end), JSON.stringify(kar));
  R.ok('[S20] Boxing switch-funded sub = 2 classes, active, valid window', box && box.totalClasses === 2 && (box.status || '').toLowerCase() === 'active', JSON.stringify(box));
  R.ok('[S20] moved classes sum (4+2) = remaining (6)', (kar.totalClasses + box.totalClasses) === 6);
  R.ok('[S20] a net-zero switch-credit invoice was recorded (distributed uses credit model)', invsFor(ctx, 20).some(v => v.switchCredit && r2(v.amount) === 0));
  R.ok('[S20] no active backwards window', !(m.subscriptions || []).some(s => !isFinished(s) && s.start && s.end && String(s.start) > String(s.end)));
}

R.section('S21 — DISTRIBUTED: ZERO attended → all classes distributed');
{
  const ctx = freshCtx('2026-09-13');
  seedMember(ctx, { id: 21, sport: 'Swimming', coachId: 1, classes: 8, price: 800, coaches: COACHES,
    attDays: { Swimming: {} }, subStart: '2026-09-01' });
  doSwitch(ctx, { memberId: 21, date: '2026-09-10', targets: [
    { sport: 'Karate', coachId: 2, classes: 5 },
    { sport: 'Boxing', coachId: 3, classes: 3 },
  ] });
  const m = member(ctx, 21);
  R.ok('[S21] safety net passed', problem(ctx, 21) === null);
  const kar = m.subscriptions.find(s => s.activity === 'Karate' && s.switchFunded);
  const box = m.subscriptions.find(s => s.activity === 'Boxing' && s.switchFunded);
  R.ok('[S21] all 8 classes distributed (5 + 3)', kar && box && (kar.totalClasses + box.totalClasses) === 8);
  R.ok('[S21] source completed at 0 attended', m.subscriptions.find(s => s.activity === 'Swimming' && s.switchedAwayTo).totalClasses === 0);
  R.ok('[S21] no active backwards window', !(m.subscriptions || []).some(s => !isFinished(s) && s.start && s.end && String(s.start) > String(s.end)));
}

R.done();
