// v6.386 — attendance recorded BEFORE a subscription's start date was ORPHANED. Jaber's Kick
// Boxing package is dated 19 Jul but he trained on 15 & 18 Jul: the attendance GRID showed 2
// attended, while the member card showed "Kick Boxing 0/12 · 0%" and the card's totals read 2/24
// instead of 4/24. subAttendanceWindow lower-bounded the window at sub.start, and the carry-back
// only applied when an EARLIER same-sport package existed — for the FIRST package of a sport
// nothing could claim those marks. Now the first package of a sport has no lower bound.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

function makeCtx(src) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => (typeof f === 'function' ? f() : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n' }; ctx.addEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, classList: { add() {} } }), body: {}, head: {}, documentElement: { setAttribute() {}, classList: { add() {} } } };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a' }, onAuthStateChanged() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) {}
  return ctx;
}

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Jaber's exact shape: Summer Camp 29 Jun→28 Jul (marks 14,16) + Kick Boxing 19 Jul→18 Aug
// (marks 15,18 — BEFORE the 19 Jul start).
const JABER = `
  state.members = [{
    id: 1, name: 'Jaber Rashid J M Al-Mayet', sport: 'Summer Camp', coachId: null,
    enrollments: [{sport:'Summer Camp',coachId:null,classes:12},{sport:'Kick Boxing',coachId:1,classes:12}],
    subscriptions: [
      {activity:'Summer Camp', coachId:null, totalClasses:12, start:'2026-06-29', end:'2026-07-28', status:'active'},
      {activity:'Kick Boxing', coachId:1,   totalClasses:12, start:'2026-07-19', end:'2026-08-18', status:'active'}
    ],
    dailyAttendance: { '2026-07': { 'Summer Camp': {'14':'Y','16':'Y'}, 'Kick Boxing': {'15':'Y','18':'Y'} } }
  }];
  state.coaches=[{id:1,name:'Abdel Salam'}]; state.invoices=[]; if(!state.settings) state.settings={};
`;
const countFor = (ctx, activity) => vm.runInContext(`(function(){
  const m = state.members[0];
  const sub = m.subscriptions.find(s => s.activity === ${JSON.stringify(activity)});
  const w = subAttendanceWindow(m, sub);
  const lw = liveAttendanceCount(m, sub.activity, w.from, w.to);
  return { from: w.from, to: w.to, y: lw.y };
})()`, ctx);

console.log('the reported bug — Kick Boxing marked before its start date:');
{
  const ctx = makeCtx(appSrc); vm.runInContext(JABER, ctx);
  const kb = countFor(ctx, 'Kick Boxing');
  const sc = countFor(ctx, 'Summer Camp');
  ok('Kick Boxing now counts BOTH pre-start classes (2, was 0)', kb.y === 2, kb);
  // v6.402: the lower bound is no longer dropped ENTIRELY. It reaches back a WEEK before the
  // start — far enough for "trained before the paperwork" (this case is 4 days), but not far
  // enough for months of older history to spend a new package's credit, which is what made an
  // 8-class package read "2 of 8 left" on day one.
  ok('...its window reaches back a week before the start (not unbounded)', kb.from === '2026-07-12', kb);
  ok('...which still covers the 15 + 18 Jul classes this test exists for', kb.from <= '2026-07-15', kb);
  ok('Summer Camp still counts its own 2', sc.y === 2, sc);
  ok('card total is now 4 (2 + 2), not 2', kb.y + sc.y === 4, { kb: kb.y, sc: sc.y });
}

console.log('\ncontrol — without any reach-back the classes are orphaned:');
{
  // Remove the reach-back entirely (window starts exactly at sub.start) → the pre-start classes
  // are lost again, which is the card bug this behaviour exists to prevent.
  const broken = appSrc.replace(
    /const graceFrom = addDays\(sub\.start, -FIRST_PACKAGE_GRACE_DAYS\);\s*\n\s*from = graceFrom \|\| sub\.start;/,
    'from = sub.start;');
  ok('control patch applied', broken !== appSrc);
  const ctx = makeCtx(broken); vm.runInContext(JABER, ctx);
  const kb = countFor(ctx, 'Kick Boxing');
  ok('WITHOUT the reach-back: Kick Boxing shows 0 — reproduces the card bug', kb.y === 0, kb);
}

console.log('\nthe reach-back is BOUNDED — old history cannot spend a new package:');
{
  // The v6.402 report: months-old marks counted against a package that had only just started.
  const ctx = makeCtx(appSrc);
  vm.runInContext(`
    state.members = [{ id: 9, name: 'Old Trainer', sport: 'MMA', coachId: 1,
      enrollments: [{ sport: 'MMA', coachId: 1, classes: 8 }],
      subscriptions: [{ activity: 'MMA', coachId: 1, totalClasses: 8, start: '2026-07-08', end: '2026-08-07', status: 'active' }],
      dailyAttendance: { '2026-06': { 'MMA': { '10': 'Y', '20': 'Y' } }, '2026-07': { 'MMA': { '01': 'Y', '06': 'Y', '08': 'Y', '09': 'Y' } } } }];
    state.coaches = [{ id: 1, name: 'Coach' }]; state.invoices = []; if (!state.settings) state.settings = {};
  `, ctx);
  const r = countFor(ctx, 'MMA');
  ok('only this package’s 4 classes count — not June’s 2', r.y === 4, r);
  ok('...so the window starts a week before, not at the beginning of time', r.from === '2026-07-01', r);
}

console.log('\na renewal must NOT steal the previous package’s attendance:');
{
  const ctx = makeCtx(appSrc);
  // Two Kick Boxing periods: A (Jul 06→Jul 20) and B (Jul 25→Aug 25), marks in both + in the gap.
  vm.runInContext(`
    state.members = [{ id: 2, name: 'Renewer', sport: 'Kick Boxing', coachId: 1,
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:8}],
      subscriptions: [
        {activity:'Kick Boxing',coachId:1,totalClasses:8,start:'2026-07-06',end:'2026-07-20',status:'expired'},
        {activity:'Kick Boxing',coachId:1,totalClasses:8,start:'2026-07-25',end:'2026-08-25',status:'active'}
      ],
      dailyAttendance: { '2026-07': { 'Kick Boxing': {'10':'Y','18':'Y','22':'Y','28':'Y'} } } }];
    state.coaches=[{id:1,name:'Abdel Salam'}]; state.invoices=[]; if(!state.settings) state.settings={};
  `, ctx);
  const win = (i) => vm.runInContext(`(function(){
    const m = state.members[0]; const sub = m.subscriptions[${i}];
    const w = subAttendanceWindow(m, sub);
    return { from: w.from, to: w.to, y: liveAttendanceCount(m, sub.activity, w.from, w.to).y };
  })()`, ctx);
  const A = win(0), B = win(1);
  // Per the v6.307 carry rule: a class attended in the GAP between packages counts toward the NEW
  // package, so A keeps its own end (Jul 20) and B reaches back to Jul 21 to absorb the gap day 22.
  ok('period A keeps its own end (never extends past it)', A.to === '2026-07-20', A);
  ok('period A counts only its own classes (10, 18) → 2', A.y === 2, A);
  ok('period B does NOT swallow A’s classes — starts the day after A ended', B.from === '2026-07-21', B);
  ok('period B carries the GAP class (22) plus its own (28) → 2', B.y === 2, B);
  ok('every mark counted exactly once (2 + 2 = 4 marks, none lost/doubled)', A.y + B.y === 4, { A: A.y, B: B.y });
}

console.log('\nhistorical members are untouched (forward-only guard):');
{
  const ctx = makeCtx(appSrc);
  vm.runInContext(`
    state.members = [{ id: 3, name: 'Old', sport: 'Boxing', coachId: 1,
      enrollments:[{sport:'Boxing',coachId:1,classes:8}],
      subscriptions: [{activity:'Boxing',coachId:1,totalClasses:8,start:'2026-05-10',end:'2026-06-10',status:'expired'}],
      dailyAttendance: { '2026-05': { 'Boxing': {'01':'Y'} }, '2026-05x': {} } }];
    state.coaches=[{id:1,name:'Abdel Salam'}]; state.invoices=[]; if(!state.settings) state.settings={};
  `, ctx);
  const r = vm.runInContext(`(function(){ const m=state.members[0]; const w=subAttendanceWindow(m,m.subscriptions[0]); return w; })()`, ctx);
  ok('a pre-2026-07-06 package keeps its start bound (no retroactive change)', r.from === '2026-05-10', r);
}

console.log('\nPRE-SUB ATTENDANCE:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
