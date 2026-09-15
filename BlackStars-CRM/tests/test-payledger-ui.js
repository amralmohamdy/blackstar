// v6.355 — smoke-test the Payment-ledger review UI end to end in a headless harness: it must
// render the modal for a phantom invoice, and _payLedgerFix must remove the phantom + correct
// amountPaid without throwing. Evals app.js + storage.js + pages.js together (like test-boot).
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

let pass = 0, fail = 0, lastModal = null;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' || k === 'dataset' || k === 'classList') ? mk() : (k === 'value' ? '' : mk()), apply: () => mk(), set: () => true });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, Object, Array, Set, Map, String, Number, Boolean, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: (f) => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-10';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '', reload() {} }; ctx.navigator = { userAgent: 'n', onLine: true };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' });
ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => mk(), querySelectorAll: () => [mk()], createElement: () => mk(), createElementNS: () => mk(), createDocumentFragment: () => mk(), body: mk(), head: mk(), documentElement: mk() };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({ __delete: true }) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, useEmulator() {}, onAuthStateChanged() {} }), app: () => ({}) };
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { console.log('EVAL THREW (partial ok):', String(e).slice(0, 100)); }

// stubs so the UI functions can run headlessly
ctx.currentRole = () => 'admin';
ctx.showModal = (o) => { lastModal = o; };
ctx.closeModal = () => {};
ctx.render = () => {};
ctx.toast = () => {};
ctx.audit = () => {};
ctx.assertCloudWritable = () => true;
ctx.withCloudConfirm = () => Promise.resolve(true);   // don't reopen recursively
ctx.editInvoicePayments = () => {};

// seed internal state with ONE phantom invoice + one clean invoice
vm.runInContext(`state.invoices = [
  { id: 900, ref: 'INV900', customerName: 'Test Payer', amount: 700, amountPaid: 500, payments: [
    { amount: 500, date: '2026-07-04', method: 'card', _recon: true, pid: 'recon:900' },
    { amount: 500, date: '2026-07-04', method: 'card', at: '2026-07-04T12:00:00Z', by: 'u1', byName: 'Admin' }
  ] },
  { id: 901, ref: 'INV901', customerName: 'Clean', amount: 300, amountPaid: 300, payments: [
    { amount: 300, date: '2026-07-01', method: 'cash', at: '2026-07-01T09:00:00Z', by: 'u1', byName: 'Admin' }
  ] }
]; if(!state.members) state.members = [];`, ctx);

// 1) the review modal renders and lists the phantom invoice
lastModal = null;
let r = vm.runInContext('(function(){ try { window.reviewPaymentLedger(); return "ok"; } catch(e){ return "THREW: "+(e&&e.message||e); } })()', ctx);
ok('reviewPaymentLedger() runs without throwing', r === 'ok', r);
ok('...it opened a modal', !!lastModal && /Payment ledger/i.test(lastModal.title || ''), lastModal && lastModal.title);
ok('...the phantom invoice + fix button are in the body', !!lastModal && /INV900/.test(lastModal.body) && /_payLedgerFix\(900\)/.test(lastModal.body), lastModal && /INV900/.test(lastModal.body));
ok('...the clean invoice is NOT listed', !!lastModal && !/INV901/.test(lastModal.body));

// 2) applying the fix removes the phantom + corrects amountPaid, no throw
r = vm.runInContext('(function(){ try { window._payLedgerFix(900); return "ok"; } catch(e){ return "THREW: "+(e&&e.message||e); } })()', ctx);
ok('_payLedgerFix(900) runs without throwing', r === 'ok', r);
const after = vm.runInContext('(function(){ const i=state.invoices.find(x=>x.id===900); return { n:i.payments.length, ap:i.amountPaid, keptAt:i.payments[0]&&i.payments[0].at!=null }; })()', ctx);
ok('phantom removed → ONE real row, amountPaid corrected to 500', after && after.n === 1 && after.ap === 500 && after.keptAt === true, after);

// 3) after the fix, the ledger is clean (no more issues for 900)
const remaining = vm.runInContext('_paymentLedgerIssues().map(x=>x.inv.id)', ctx);
ok('900 no longer flagged after fix', Array.isArray(remaining) && remaining.indexOf(900) < 0, remaining);

console.log('\nPAYLEDGER UI:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
