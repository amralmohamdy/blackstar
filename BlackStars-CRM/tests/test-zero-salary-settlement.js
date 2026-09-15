// v6.383 — a coach who earned NOTHING this month (no fixed salary, no commission → net 0) must be
// settleable at 0 QAR, so the month reads "paid" instead of hanging on "Not paid yet". Rules:
//   • 0 is accepted when nothing is owed; 0 against a REAL balance is still rejected (mis-entry).
//   • a 0 settlement writes NO Salary expense (a zero money-out row would pollute the ledger).
//   • paidStatus becomes 'paid' for a 0-target month once a payment row exists.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

// DOM stub whose inputs we can drive (#sp-add-amt etc.)
const fields = {};
const el = (id) => (fields[id] = fields[id] || { value: '', checked: false, style: {}, addEventListener() {}, setAttribute() {}, classList: { add() {}, remove() {} } });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => (typeof f === 'function' ? f() : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n' }; ctx.addEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => (fields[id] ? fields[id] : null), querySelector: (s) => (s && s[0] === '#' ? (fields[s.slice(1)] || null) : null), querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, classList: { add() {} } }), body: {}, head: {}, documentElement: { setAttribute() {}, classList: { add() {} } } };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {} }), app: () => ({}) };
vm.createContext(ctx);
try { vm.runInContext(appSrc + '\n' + pagesSrc, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 100)); }
// stub the app-level side effects
ctx.$ = (s) => (s && s[0] === '#' ? (fields[s.slice(1)] || null) : null);
ctx.toast = (m, kind) => { ctx.__lastToast = { m, kind }; };
ctx.render = () => {}; ctx.save = () => {}; ctx.audit = () => {}; ctx.markPaid = () => {}; ctx.showModal = () => {};
ctx.withCloudConfirm = (o) => { ctx.__lastVerify = o && o.verify; };
ctx.currentRole = () => 'admin';

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

const setup = (rate, fixedSalary) => vm.runInContext(`
  state.coaches = [{id:9, name:'Ibrahim', rate:${rate}, fixedSalary:${fixedSalary}, role:'coach'}];
  state.members = []; state.invoices = []; state.expenses = []; state.salaries = [];
  if(!state.settings) state.settings = {}; state.settings.commissionBasis = 'attendance';
`, ctx);
const drive = (amt) => { el('sp-add-amt').value = String(amt); el('sp-add-date').value = '2026-07-20'; el('sp-add-method').value = 'cash'; if (fields['sp-target']) fields['sp-target'].value = ''; };
const expenses = () => vm.runInContext('(state.expenses||[]).length', ctx);
const paymentsOf = () => vm.runInContext('JSON.parse(JSON.stringify((state.salaries||[]).flatMap(s=>s.payments||[])))', ctx);

// ── 1) Coach with NOTHING due → 0 QAR is accepted and settles the month. ──
console.log('coach with nothing due (net 0):');
setup(50, 0);
ok('computed net is 0', Math.abs(vm.runInContext('computeMonthlyPay(9,"2026-06").net', ctx)) < 0.005, vm.runInContext('computeMonthlyPay(9,"2026-06").net', ctx));
drive(0); ctx.__lastToast = null;
vm.runInContext('_salAddPay(9,"2026-06")', ctx);
ok('0 QAR accepted (no error toast)', !(ctx.__lastToast && ctx.__lastToast.kind === 'error'), ctx.__lastToast);
ok('a payment row was recorded', paymentsOf().length === 1 && paymentsOf()[0].amount === 0, paymentsOf());
ok('NO 0-QAR salary expense was created (ledger stays clean)', expenses() === 0, expenses());
ok('the month now reads PAID (not stuck on "Not paid yet")', vm.runInContext('computeMonthlyPay(9,"2026-06").paidStatus', ctx) === 'paid', vm.runInContext('computeMonthlyPay(9,"2026-06").paidStatus', ctx));
ok('cloud verify skips the non-existent expense (salaries only)', Array.isArray(ctx.__lastVerify) && ctx.__lastVerify.length === 1 && ctx.__lastVerify[0].collection === 'salaries', ctx.__lastVerify);

// ── 2) Coach who IS owed money → 0 is still rejected (a mis-entry, not a settlement). ──
console.log('\ncoach who IS owed money:');
setup(0, 1000);   // fixed salary 1000 → net 1000
ok('computed net is 1000', Math.abs(vm.runInContext('computeMonthlyPay(9,"2026-06").net', ctx) - 1000) < 0.5, vm.runInContext('computeMonthlyPay(9,"2026-06").net', ctx));
drive(0); ctx.__lastToast = null;
const before = paymentsOf().length;
vm.runInContext('_salAddPay(9,"2026-06")', ctx);
ok('0 QAR REJECTED when a real balance is owed', !!(ctx.__lastToast && ctx.__lastToast.kind === 'error'), ctx.__lastToast);
ok('...and no payment row was created', paymentsOf().length === before, paymentsOf().length);

// ── 3) A normal positive payment still works + still writes its expense. ──
console.log('\nnormal payment unaffected:');
drive(1000); ctx.__lastToast = null;
vm.runInContext('_salAddPay(9,"2026-06")', ctx);
ok('1000 QAR accepted', !(ctx.__lastToast && ctx.__lastToast.kind === 'error'), ctx.__lastToast);
ok('its Salary expense WAS created', expenses() === 1, expenses());
ok('month reads PAID', vm.runInContext('computeMonthlyPay(9,"2026-06").paidStatus', ctx) === 'paid');
ok('cloud verify includes salary + expense', Array.isArray(ctx.__lastVerify) && ctx.__lastVerify.length === 2, ctx.__lastVerify);

// ── 4) A negative amount is always rejected. ──
console.log('\nnegative amount:');
drive(-50); ctx.__lastToast = null;
const b4 = paymentsOf().length;
vm.runInContext('_salAddPay(9,"2026-06")', ctx);
ok('negative rejected', !!(ctx.__lastToast && ctx.__lastToast.kind === 'error') && paymentsOf().length === b4);

console.log('\nZERO SALARY SETTLEMENT:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
