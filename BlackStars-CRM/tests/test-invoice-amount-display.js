// v6.356 — the invoices list must not show a bare "0" for an invoice that appears under a month
// filter only because a PAYMENT landed that month while its revenue bills a different month.
// Replays the exact rowAmtOf / billedElsewhere logic using the REAL app.js functions on the real
// backup invoice INV639015 (bills 2026-06, paid 2026-07).
const vm = require('vm'), fs = require('fs'), path = require('path');
// FIXTURE GUARD: pinned to the 2026-07-06 backup's exact invoice shapes. If that file is not
// present, SKIP rather than crash or silently re-point at a different backup (whose data differs).
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, Object, Array, Set, Map, String, Number, Boolean, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-10';
ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }), body: {}, head: {} };
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
ctx.addEventListener = () => {}; ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n' };
vm.createContext(ctx);
try { vm.runInContext(appSrc, ctx); } catch (e) {}
function setInvoices(arr) { return vm.runInContext('state.invoices = ' + JSON.stringify(arr) + '; if(!state.members)state.members=[]; state.invoices', ctx); }

const _FIX = require('path').join(__dirname, 'blackstars-backup-2026-07-06.json');
if (!require('fs').existsSync(_FIX)) { console.log('SKIPPED — fixture blackstars-backup-2026-07-06.json not present'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

ok('helpers present', ['invoiceTotal', 'invoiceMonthShare', 'invoiceMonths', 'invoicePaidInMonth'].every(f => typeof ctx[f] === 'function'));

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'blackstars-backup-2026-07-06.json'), 'utf8'));
setInvoices(raw.invoices || []);

// the exact list computation
const rowAmt = (id, selMonths) => vm.runInContext(`(function(){const i=state.invoices.find(x=>x.ref==="${id}"); const sel=${JSON.stringify(selMonths)};
  const total = sel.length ? sel.reduce((s,m)=>s+invoiceTotal(i)*invoiceMonthShare(i,m),0) : invoiceTotal(i);
  return { rAmt: total, rFull: invoiceTotal(i), bills: invoiceMonths(i), paidJul: invoicePaidInMonth(i,"2026-07") };})()`, ctx);

// INV639015: bills 2026-06, amount 2250, paid in July
let r = rowAmt('INV639015', ['2026-07']);
console.log('  INV639015 under JULY filter →', JSON.stringify(r));
ok('under a JULY filter the month-SHARE is 0 (the old bug rendered a bare 0)', r && r.rAmt < 0.005, r && r.rAmt);
ok('...but the invoice REAL total is 2250 (what edit shows)', r && Math.abs(r.rFull - 2250) < 0.5, r && r.rFull);
ok('...it bills June, not July', r && r.bills.indexOf('2026-06') >= 0 && r.bills.indexOf('2026-07') < 0, r && r.bills);
const billedElsewhere = !!(r && ['2026-07'].length && r.rAmt < 0.005 && r.rFull > 0.005);
ok('billedElsewhere condition TRUE → show real total, not 0', billedElsewhere);

// under its OWN month (June) the share is the full amount → normal display
r = rowAmt('INV639015', ['2026-06']);
ok('under JUNE (its billing month) the share = full total (normal)', r && Math.abs(r.rAmt - 2250) < 0.5, r && r.rAmt);

// with NO month filter → full total (unchanged)
r = rowAmt('INV639015', []);
ok('with NO filter → full total (unchanged behaviour)', r && Math.abs(r.rAmt - 2250) < 0.5, r && r.rAmt);

// source assertion: the fix is present
ok('pages.js renders billedElsewhere real total instead of 0', /const billedElsewhere = selMonths\.length && rAmt < 0\.005 && rFull > 0\.005/.test(pagesSrc) && /billed', 'محتسبة/.test(pagesSrc));

// v6.362 — paid-this-month / total fraction for a cross-month payment.
// Synthetic: 2400 camp billed June (lineItem billMonth 2026-06), 1000 paid in July.
setInvoices([{ id: 900, ref: 'INV900', customerId: 1, category: 'Membership', amount: 2400, date: '2026-06-26', month: '2026-06',
  lineItems: [{ sport: 'Summer Camp', price: 2400, billMonth: '2026-06' }],
  amountPaid: 1000, payments: [{ amount: 1000, date: '2026-07-10', month: '2026-07', method: 'cash', at: '2026-07-10T09:00:00Z' }] }]);
// The cell computes "collected this month" from the PAYMENT DATE (not the accrual attribution).
const paidJul = vm.runInContext(`(function(){const i=state.invoices.find(x=>x.ref==="INV900"); return (i.payments||[]).filter(p=>String(p.month||p.date||"").slice(0,7)==="2026-07").reduce((s,p)=>s+(Number(p.amount)||0),0);})()`, ctx);
const shareJul = vm.runInContext(`(function(){const i=state.invoices.find(x=>x.ref==="INV900"); return invoiceTotal(i)*invoiceMonthShare(i,"2026-07");})()`, ctx);
const fullT = vm.runInContext(`invoiceTotal(state.invoices.find(i=>i.ref==="INV900"))`, ctx);
console.log('\n  cross-month payment (billed Jun, paid Jul):', JSON.stringify({ paidJul, shareJul, fullT }));
ok('July revenue-share is 0 (bills June) → billedElsewhere branch', shareJul < 0.005, shareJul);
ok('collected-in-July (by payment date) = 1000, total = 2400 (→ shows "1,000 / 2,400")', paidJul === 1000 && fullT === 2400, { paidJul, fullT });
ok('pages.js computes collected-this-month from payment dates', /const paidHere = \(Array\.isArray\(i\.payments\)[\s\S]{0,220}\.reduce\(\(s, p\) => s \+ \(Number\(p\.amount\) \|\| 0\), 0\)/.test(pagesSrc));
ok('pages.js shows the collected / total fraction', /\/ \$\{fmt\(rFull\)\}/.test(pagesSrc));
ok('...the paid amount is highlighted (green) with "paid this month"', /color:var\(--green\)">\$\{fmt\(paidHere\)\}/.test(pagesSrc) && /paid this month', 'دُفع هذا الشهر'/.test(pagesSrc));

console.log('\nINVOICE AMOUNT DISPLAY:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
