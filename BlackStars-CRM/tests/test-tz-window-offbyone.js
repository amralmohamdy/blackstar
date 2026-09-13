// v6.373 — attendance-window boundary math must NOT shift a day in a UTC-ahead zone (Qatar UTC+3).
// The old code did `new Date(start+'T00:00:00')` (LOCAL midnight) then `.toISOString().slice(0,10)`
// (UTC) — which reads local midnight back as the PREVIOUS calendar day in UTC+3, shrinking the
// attendance window by a day. Attendance feeds commission, so this was a real pay bug for the owner.
// This test only bites when run in a UTC-ahead TZ; the sandbox is Asia/Baghdad (UTC+3), so it does.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder,
  setTimeout: f => (typeof f === 'function' ? f() : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-18';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: {}, head: {}, documentElement: {} };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {} }), app: () => ({}) };
vm.createContext(ctx);
try { vm.runInContext(appSrc, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 120)); }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

console.log('TZ:', Intl.DateTimeFormat().resolvedOptions().timeZone, '(offset', -new Date().getTimezoneOffset() / 60, 'h)');

// 1) addDays sanity — the canonical helper is TZ-safe both directions.
const addDays = vm.runInContext('addDays', ctx);
ok('addDays(2026-07-01, -1) = 2026-06-30 (day before, no TZ shift)', addDays('2026-07-01', -1) === '2026-06-30', addDays('2026-07-01', -1));
ok('addDays(2026-06-28, 75) = 2026-09-11 (freeze +75, no shift)', addDays('2026-06-28', 75) === '2026-09-11', addDays('2026-06-28', 75));
ok('addDays(2026-01-01, -1) = 2025-12-31 (year boundary)', addDays('2026-01-01', -1) === '2025-12-31', addDays('2026-01-01', -1));

// 2) subAttendanceWindow: a member with a Karate package renewed on 2026-07-01 — the FIRST period's
// window must END on 2026-06-30 (the day BEFORE the next start), not 2026-06-29.
console.log('\nsubAttendanceWindow boundary (the real bug site, line ~126):');
const member = {
  id: 1, name: 'TZ Test',
  subscriptions: [
    { activity: 'Karate', start: '2026-06-01', end: '2026-07-05', totalClasses: 8 },   // 1st period (end overlaps into renewal)
    { activity: 'Karate', start: '2026-07-01', end: '2026-08-01', totalClasses: 8 },   // renewal starts 07-01
  ],
};
const win = vm.runInContext('subAttendanceWindow', ctx)(member, member.subscriptions[0]);
ok('1st period window ENDS 2026-06-30 (day before the 07-01 renewal), not 06-29', win.to === '2026-06-30', win);

// 3) The Summer Camp period-window (line ~4974) uses the same day-before boundary. Assert addDays is
// wired there (source check) so the camp window can't drift a day in UTC+3 either.
console.log('\ncamp period window wiring (line ~4974):');
ok('camp winEnd uses addDays(nextStart, -1), not new Date+toISOString', /if \(nextStart\) winEnd = addDays\(nextStart, -1\);/.test(appSrc));
ok('no remaining `new Date(...T00:00:00)` + toISOString day-before in the window code', !/new Date\([^)]*\+ 'T00:00:00'\); d\.setDate\(d\.getDate\(\) - 1\); [a-zA-Z]+ = d\.toISOString/.test(appSrc));

console.log('\nTZ WINDOW OFF-BY-ONE:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
