// v6.364 — a coach with a "Joined the club" date is hidden from payroll for months BEFORE they
// joined (Ibrahim joined July → not in June, present in July). Coaches with no joined date show
// in every month (unchanged). Renders the REAL PAGES.salaries and inspects the payroll tbody.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const cap = {};  // captured innerHTML by CSS selector
const el = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, append() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el('x'); }, querySelector: () => el('x'), querySelectorAll: () => [], focus() {}, remove() {} });
const mk = el;
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-16';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => el('#' + id), querySelector: (sel) => el(sel), querySelectorAll: () => [], createElement: () => mk('x'), createElementNS: () => mk('x'), createDocumentFragment: () => mk('x'), body: mk('body'), head: mk('head'), documentElement: mk('html') };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Ibrahim joined July; Mostafa has no joined date (always shown). Both fixed-salary so a row always renders.
vm.runInContext(`state.coaches = [
  { id: 1, name: 'Ibrahim', role: 'coach', rate: 50, fixedSalary: 500, active: 'Y', joinedDate: '2026-07-01' },
  { id: 2, name: 'Mostafa', role: 'coach', rate: 30, fixedSalary: 500, active: 'Y' } ];
  state.salaries = []; if (!state.settings) state.settings = {};`, ctx);
ctx.currentRole = () => 'admin';

function renderFor(month) {
  cap['#sal-tbody'] = undefined; // reset
  vm.runInContext(`window._salMonth = '${month}'; window._salSettleDate = undefined;`, ctx);
  const r = vm.runInContext("(function(){ try { PAGES.salaries(document.getElementById('main')); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()", ctx);
  return r === 'ok' ? (cap['#sal-tbody'] ? cap['#sal-tbody']._h : '') : r;
}

console.log('June (Ibrahim joined July → must be ABSENT):');
let june = renderFor('2026-06');
ok('render ok', typeof june === 'string' && !june.startsWith('THREW'), String(june).slice(0, 80));
ok('Ibrahim is NOT in June payroll', june.indexOf('Ibrahim') < 0, june.indexOf('Ibrahim'));
ok('Mostafa (no joined date) IS in June payroll', june.indexOf('Mostafa') >= 0);

console.log('\nJuly (Ibrahim joined July → must be PRESENT):');
let july = renderFor('2026-07');
ok('Ibrahim IS in July payroll', july.indexOf('Ibrahim') >= 0);
ok('Mostafa is in July too', july.indexOf('Mostafa') >= 0);

console.log('\nsource wiring:');
ok('Edit Coach has a Joined date input', /id="c-joined" type="date" value="\$\{c\.joinedDate/.test(pagesSrc));
ok('save persists joinedDate', /const joinedDate = \$\('#c-joined'\)\.value \|\| null;/.test(pagesSrc) && /gender, joinedDate,/.test(pagesSrc));
ok('payroll filters by joinedBy', /isCoachActive\(c\) && joinedBy\(c\)/.test(pagesSrc));
ok('joinedBy hides months before the join month', /String\(jd\)\.slice\(0, 7\) <= filter\.month/.test(pagesSrc));

console.log('\nCOACH JOINED:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
