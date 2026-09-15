// v6.372 — DUPLICATE-COLLAPSE: a duplicate invoice (or repeated line item) for the SAME member must
// NOT pay the coach twice. computeAttendanceCommission now collapses exact repeats (member id + sport
// + kind + period + amount) to a single PAID line: the repeat stays visible but flagged _dupIgnored
// with amountBase 0, and `base` drops by the duplicated amount. Critically, it keys on member ID, so
// two DIFFERENT people who share a name are never merged, and different sports are never merged.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

// Pin the clock to 2026-07-18 (matching TODAY below). This test builds its own sandbox and
// used the REAL Date, so its fixture window (subs ending 2026-07-28) silently broke once the
// real system date rolled past it. A frozen Date keeps the scenario deterministic year-round.
const _FIXED = new Date('2026-07-18T12:00:00Z').getTime();
class FrozenDate extends Date { constructor(...a) { if (!a.length) super(_FIXED); else super(...a); } static now() { return _FIXED; } }
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date: FrozenDate, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder,
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

// ── Scenario: coach #1 teaches Karate. Fares (member 100) has a DUPLICATE invoice for the same
// 12-class Karate package, same window, same fee. Two OTHER members share the name "Fares Hamdan"
// but are DIFFERENT people (ids 200, 201) — those must both count. Member 300 has Karate + Swimming
// (different sports, same person) — both must count.
const COACH = 1, MONTH = '2026-07';
function setup() {
  const enr = (sport) => ({ sport, coachId: COACH, classes: 12 });
  const sub = (sport) => ({ activity: sport, coachId: COACH, start: '2026-06-28', end: '2026-07-28', totalClasses: 12, status: 'active' });
  // attendance lives INSIDE the member: dailyAttendance[month][sport][day] = 'Y'. 2 Karate classes each.
  const att = (sports) => { const o = { '2026-07': {} }; for (const s of sports) o['2026-07'][s] = { '01': 'Y', '02': 'Y' }; return o; };
  const members = [
    { id: 100, name: 'Fares Hamdan', enrollments: [enr('Karate')], subscriptions: [sub('Karate')], dailyAttendance: att(['Karate']) },
    { id: 200, name: 'Fares Hamdan', enrollments: [enr('Karate')], subscriptions: [sub('Karate')], dailyAttendance: att(['Karate']) },   // SAME NAME, different person
    { id: 201, name: 'Fares Hamdan', enrollments: [enr('Karate')], subscriptions: [sub('Karate')], dailyAttendance: att(['Karate']) },   // SAME NAME, different person
    { id: 300, name: 'Meshlesh Mohammed', enrollments: [enr('Karate'), enr('Swimming')],
      subscriptions: [sub('Karate'), { activity: 'Swimming', coachId: COACH, start: '2026-06-28', end: '2026-07-28', totalClasses: 12, status: 'active' }],
      dailyAttendance: att(['Karate', 'Swimming']) },
  ];
  // invoices: one Karate membership invoice per member — but member 100 has it TWICE (the duplicate).
  const inv = (id, name, sport, invId) => ({ id: invId, customerId: id, customerName: name, category: 'Membership', date: '2026-06-28', month: '2026-06',
    lineItems: [{ sport, price: 600, coachId: COACH }], items: [{ sport, price: 600, coachId: COACH }] });
  const invoices = [
    inv(100, 'Fares Hamdan', 'Karate', 9001),
    inv(100, 'Fares Hamdan', 'Karate', 9002),   // ← DUPLICATE invoice, same member 100
    inv(200, 'Fares Hamdan', 'Karate', 9003),
    inv(201, 'Fares Hamdan', 'Karate', 9004),
    inv(300, 'Meshlesh Mohammed', 'Karate', 9005),
    inv(300, 'Meshlesh Mohammed', 'Swimming', 9006),
  ];
  vm.runInContext(`state.members=${JSON.stringify(members)}; state.invoices=${JSON.stringify(invoices)}; state.coaches=[{id:${COACH},name:'Coach One',sports:['Karate','Swimming']}]; if(!state.settings) state.settings={};`, ctx);
}
setup();

const r = vm.runInContext(`computeAttendanceCommission(${COACH}, '${MONTH}')`, ctx);
const lines = r.lines || [];
const perClass = 600 / 12;                        // 50 QAR/class
const attendedAmt = perClass * 2;                 // 100 QAR per member for 2 attended classes

// how many earned Karate 'attended' lines mention each member id
const attendedLines = lines.filter(l => l.kind === 'attended');
const paidLines = attendedLines.filter(l => !l._dupIgnored);
const dropped = attendedLines.filter(l => l._dupIgnored);

console.log('duplicate collapse (same member):');
// member 100 appears twice in the invoices → 2 lines, ONE paid + ONE dropped
const m100 = attendedLines.filter(l => l.mid === 'm100');
ok('member 100 produced 2 attended lines (the duplicate invoice)', m100.length === 2, m100.length);
ok('exactly ONE of member 100’s lines is paid', m100.filter(l => !l._dupIgnored).length === 1, m100.filter(l => !l._dupIgnored).length);
ok('the dropped line is flagged _dupIgnored with amountBase 0', m100.some(l => l._dupIgnored && l.amountBase === 0));
ok('the dropped line keeps its _origAmount for the report', m100.some(l => l._dupIgnored && Math.abs(l._origAmount - attendedAmt) < 0.01), m100.map(l => l._origAmount));

console.log('\nsame NAME but different PEOPLE are NOT merged:');
// members 100 (one paid), 200, 201 all named "Fares Hamdan" — should yield 3 PAID Karate lines total
const faresPaid = paidLines.filter(l => l.memberName === 'Fares Hamdan');
ok('3 distinct Fares (100,200,201) each keep a paid line', faresPaid.length === 3, faresPaid.map(l => l.mid));
ok('...their ids are all different', new Set(faresPaid.map(l => l.mid)).size === 3, faresPaid.map(l => l.mid));

console.log('\ndifferent SPORTS for the same person are NOT merged:');
const m300 = paidLines.filter(l => l.mid === 'm300');
ok('member 300 keeps BOTH Karate and Swimming paid lines', new Set(m300.map(l => l.sport)).size === 2, m300.map(l => l.sport));

console.log('\nthe MONEY (base / pay):');
// paid attended lines: 100, 200, 201 Karate + 300 Karate + 300 Swimming = 5 lines × 100 = 500
const expectBase = attendedAmt * 5;
ok('base counts 5 real memberships, not 6 (duplicate excluded)', Math.abs(r.base - expectBase) < 0.01, { got: r.base, expect: expectBase });
ok('base did NOT double-count member 100', Math.abs(r.base - (expectBase + attendedAmt)) > 0.01, r.base);
// subtotal the report would show = sum of amountBase (dups are 0)
const subtotal = lines.reduce((s, l) => s + (Number(l.amountBase) || 0), 0);
ok('report subtotal (sum of line amounts) equals base', Math.abs(subtotal - r.base) < 0.01, { subtotal, base: r.base });

console.log('\nexcludedDuplicateLines() helper (drives the report banner):');
const ex = vm.runInContext('excludedDuplicateLines', ctx)(lines);
ok('reports exactly 1 excluded duplicate', ex.length === 1, ex.length);
ok('...with the excluded extra ≈ one membership’s pay', ex.length === 1 && Math.abs(ex[0].extra - attendedAmt) < 0.01, ex.map(e => e.extra));

// ── CONTROL: with the collapse reverted (no _dupIgnored), member 100 would be paid twice.
console.log('\ncontrol — the bug WOULD manifest without the fix:');
const rawM100 = attendedLines.filter(l => l.mid === 'm100');
const wouldBeDoubled = rawM100.reduce((s, l) => s + (l._dupIgnored ? l._origAmount : l.amountBase), 0);
ok('member 100’s two raw lines summed = double pay (proves the duplicate was real)', Math.abs(wouldBeDoubled - attendedAmt * 2) < 0.01, wouldBeDoubled);

console.log('\nCOMMISSION DEDUP:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
