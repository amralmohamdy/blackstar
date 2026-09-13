// v6.355 — payment-ledger phantom detection + safe fix. Uses the REAL _paymentLedgerIssues /
// _paymentPhantomRows / _fixPaymentPhantoms lifted from app.js, run against the real backup and
// against the safe/unsafe scenarios. The fix must remove a phantom seed that an exact real row
// covers, and must NEVER remove genuine prior money (a reconstruction with no real twin).
const vm = require('vm'), fs = require('fs'), path = require('path');
// FIXTURE GUARD: pinned to the 2026-07-06 backup's exact invoice shapes. If that file is not
// present, SKIP rather than crash or silently re-point at a different backup (whose data differs).
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

// sandbox just enough to eval app.js and grab the window._payment* helpers
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, Object, Array, Set, Map, String, Number, Boolean, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.TODAY = '2026-07-10';
ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: {}, head: {} };
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.location = { href: '', hash: '' };
ctx.navigator = { userAgent: 'n' };
vm.createContext(ctx);
try { vm.runInContext(appSrc, ctx); } catch (e) { /* partial eval is fine; we only need the payment helpers */ }
// app.js has its OWN internal `state` binding that the helpers close over; set THAT (not ctx.state),
// and return the internal invoices array so mutations by the fix are visible.
function setInvoices(arr) { return vm.runInContext('state.invoices = ' + JSON.stringify(arr) + '; if(!state.members) state.members=[]; state.invoices', ctx); }

const _FIX = require('path').join(__dirname, 'blackstars-backup-2026-07-06.json');
if (!require('fs').existsSync(_FIX)) { console.log('SKIPPED — fixture blackstars-backup-2026-07-06.json not present'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
ok('helpers exported', typeof ctx._paymentLedgerIssues === 'function' && typeof ctx._fixPaymentPhantoms === 'function');

// ── REAL backup ──
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'blackstars-backup-2026-07-06.json'), 'utf8'));
const invoices = raw.invoices || (raw.data && raw.data.invoices) || [];
setInvoices(JSON.parse(JSON.stringify(invoices)));

console.log('\nREAL backup (' + invoices.length + ' invoices):');
const issues = ctx._paymentLedgerIssues();
console.log('  flagged invoices:', issues.map(x => (x.inv.ref || ('#' + x.inv.id)) + (x.phantomIdx.length ? ' [phantom]' : '') + (x.drift ? ' [drift]' : '')).join(', ') || '(none)');
// INV639091 (Raed) IS the real phantom shape (seed 325 + real 325) but it is soft-DELETED, so
// the live scan must SKIP it (a deleted invoice isn't a live money issue).
const raw639091 = invoices.find(i => i.ref === 'INV639091');
ok('INV639091 is soft-deleted in the backup', raw639091 && raw639091.deleted === true);
ok('the live scan SKIPS deleted invoices (no false alarm)', !issues.find(x => x.inv.ref === 'INV639091'));
// …but the fix logic, applied directly to that real-data row shape, removes the phantom correctly.
const raedClone = JSON.parse(JSON.stringify(raw639091));
const removed = ctx._fixPaymentPhantoms(raedClone);
ok('fix on the real INV639091 shape removes exactly 1 phantom', removed === 1 && raedClone.payments.length === 1, { removed, now: raedClone.payments.length });
ok('after fix: ONE 325 row, amountPaid=325, the REAL (at+by) row kept', raedClone.amountPaid === 325 && raedClone.payments[0].at != null && raedClone.payments[0].by === 'blackstarsportsmail@gmail.com', { ap: raedClone.amountPaid, row: raedClone.payments[0] });
// INV639035 is a LIVE drift-only invoice (amountPaid 760 vs one 380 row) — no phantom → auto-fix must do NOTHING
const other = issues.find(x => x.inv.ref === 'INV639035');
ok('INV639035 flagged as drift but NO phantom (needs manual review)', !!other && other.phantomIdx.length === 0 && other.drift === true, other && { p: other.phantomIdx, d: other.drift });
if (other) ok('...auto-fix leaves the single real row ALONE (never invents money)', ctx._fixPaymentPhantoms(other.inv) === 0 && other.inv.payments.length === 1);

// ── SAFE scenario: genuine prior money reconstructed + two later real payments (must NOT be fixed) ──
console.log('\nSafe scenarios:');
let sInvs = setInvoices([
  { id: 1, ref: 'A', amount: 1000, amountPaid: 1000, payments: [
    { amount: 500, date: '2026-07-01', method: 'cash', _recon: true, pid: 'recon:1' },   // genuine prior, reconstructed
    { amount: 300, date: '2026-07-05', method: 'cash', at: '2026-07-05T10:00:00Z', by: 'u1' },
    { amount: 200, date: '2026-07-08', method: 'cash', at: '2026-07-08T10:00:00Z', by: 'u1' },
  ] },
]);
let iss = ctx._paymentLedgerIssues();
ok('a reconstruction with NO matching real row is NOT a phantom (money kept)', iss.length === 0 || (iss[0] && iss[0].phantomIdx.length === 0), iss.map(x => x.phantomIdx));
ok('...auto-fix removes nothing there', ctx._fixPaymentPhantoms(sInvs[0]) === 0 && sInvs[0].payments.length === 3);

// ── TAGGED recon that a real row DOES cover (the multi-device dup) → phantom ──
sInvs = setInvoices([
  { id: 2, ref: 'B', amount: 700, amountPaid: 500, payments: [
    { amount: 500, date: '2026-07-04', method: 'card', _recon: true, pid: 'recon:2' },       // reconstruction
    { amount: 500, date: '2026-07-04', method: 'card', at: '2026-07-04T12:00:00Z', by: 'Admin' }, // the SAME money, real
  ] },
]);
iss = ctx._paymentLedgerIssues();
ok('tagged recon duplicating a real row → flagged phantom', iss.length === 1 && iss[0].phantomIdx.length === 1, iss[0] && iss[0].phantomIdx);
ctx._fixPaymentPhantoms(sInvs[0]);
ok('...fixed to ONE 500 real row, amountPaid=500', sInvs[0].payments.length === 1 && sInvs[0].amountPaid === 500 && sInvs[0].payments[0].at != null);

// ── two DISTINCT installments (no dup) → nothing flagged ──
setInvoices([
  { id: 3, ref: 'C', amount: 800, amountPaid: 800, payments: [
    { amount: 500, date: '2026-07-01', method: 'cash', at: '2026-07-01T09:00:00Z', by: 'u1' },
    { amount: 300, date: '2026-07-05', method: 'cash', at: '2026-07-05T09:00:00Z', by: 'u1' },
  ] },
]);
ok('two distinct real installments → nothing flagged', ctx._paymentLedgerIssues().length === 0);

console.log('\nPAYMENT PHANTOM:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
