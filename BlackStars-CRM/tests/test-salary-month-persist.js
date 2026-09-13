// v6.363 — paying a salary triggers a global render() that re-runs PAGES.salaries; the selected
// month must PERSIST (via window._salMonth) instead of snapping back to the latest/current month.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' || k === 'dataset' || k === 'classList') ? mk() : (k === 'value' ? '' : (k === 'textContent' || k === 'innerHTML' ? '' : mk())), set: () => true, apply: () => mk() });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-16';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: () => mk(), querySelector: () => mk(), querySelectorAll: () => [], createElement: () => mk(), createElementNS: () => mk(), createDocumentFragment: () => mk(), body: mk(), head: mk(), documentElement: mk() };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// two fixed-salary staff so months exist and computeMonthlyPay returns rows
vm.runInContext(`state.coaches = [
  { id: 1, name: 'A', role: 'staff', fixedSalary: 1000, active: 'Y' },
  { id: 2, name: 'B', role: 'staff', fixedSalary: 2000, active: 'Y' } ];
  state.salaries = [{ id: 1, coachId: 1, month: '2026-06', kind: 'paid', payments: [] }];
  if (!state.settings) state.settings = {};`, ctx);
ctx.currentRole = () => 'admin';

// capture what PAGES.salaries writes to main.innerHTML (the skeleton holds the #sal-month <select>)
function renderSalaries() {
  let html = '';
  ctx.__main = { get innerHTML() { return html; }, set innerHTML(v) { html = v; }, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] };
  const r = vm.runInContext("(function(){ try { PAGES.salaries(__main); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()", ctx);
  return r === 'ok' ? html : r;
}
const selectedMonth = html => {
  const sel = /<select id="sal-month"[\s\S]*?<\/select>/.exec(html || '');
  if (!sel) return null;
  const m = /<option value="([^"]+)" selected>/.exec(sel[0]);
  return m ? m[1] : null;
};

// 1) no persisted month → defaults to latest/current
vm.runInContext('window._salMonth = undefined; window._salSettleDate = undefined;', ctx);
let html = renderSalaries();
ok('renders without throwing (default month)', typeof html === 'string' && html.indexOf('sal-month') >= 0, String(html).slice(0, 80));
const def = selectedMonth(html);
ok('default selected month is present', !!def, def);

// 2) a persisted month (as if the user picked Jun 26, then paid → render re-ran) is HONORED
vm.runInContext(`window._salMonth = '2026-06';`, ctx);
html = renderSalaries();
ok('persisted window._salMonth = 2026-06 is the selected option after re-render', selectedMonth(html) === '2026-06', selectedMonth(html));

// 3) it survives repeated re-renders (each pay triggers one)
html = renderSalaries();
ok('...still 2026-06 on a 2nd re-render (no snap-back)', selectedMonth(html) === '2026-06', selectedMonth(html));

// source wiring
console.log('\n source wiring:');
ok('filter initializes month from window._salMonth', /let filter = \{ month: window\._salMonth \|\| latestDataMonth\(\)/.test(pagesSrc));
ok('month dropdown change persists window._salMonth', /filter\.month = e\.target\.value; window\._salMonth = filter\.month;/.test(pagesSrc));
ok('settle-date change persists window._salSettleDate', /window\._salSettleDate = filter\.settleDate;/.test(pagesSrc));

console.log('\nSALARY MONTH PERSIST:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
