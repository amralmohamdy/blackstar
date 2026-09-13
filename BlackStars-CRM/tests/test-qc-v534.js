// v6.534 — QC fixes: (1) merge-duplicate payment rows are collapsed when a payment editor opens, so the
// Paid total / amountPaid can't double; (2) same-sport two-coach commission reads each coach's own cell
// (covered by test-same-sport-two-coaches.js); (3) a 'Products' expense category exists.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.534 · payment dedup + two-coach reader + Products category');
const src = H.readSrc();

R.section('1 — payment de-duplication');
R.ok('dedupeInvoicePayments exists', /function dedupeInvoicePayments\(inv\)/.test(src));
R.ok('it collapses rows sharing a pid base', /const base = p && p\.pid \? String\(p\.pid\)\.replace\(\/#\\d\+\$\/, ''\) : null;/.test(src));
R.ok('both editors dedupe on open', /if \(typeof dedupeInvoicePayments === 'function'\) dedupeInvoicePayments\(inv\);/.test(src) && /memberInvs\.forEach\(dedupeInvoicePayments\)/.test(src));
{
  const ctx = H.makeCtx({ today: '2026-08-27', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // an invoice whose ledger has a merge-duplicate (pid c…#1 / c…#2), both 634 → raw sum 1268, true 634
  run(`state.invoices=[{id:1,ref:'X',customerId:9,category:'Membership',amount:634,amountPaid:1268,
    payments:[{amount:634,pid:'c634|2026-06-22|card#1'},{amount:634,pid:'c634|2026-06-22|card#2'}]}];`);
  R.ok('before: raw sum is the doubled 1268', run(`invoicePaymentsSum(state.invoices[0])`) === 1268);
  const removed = run(`dedupeInvoicePayments(state.invoices[0])`);
  R.ok('dedupe removes the duplicate row', removed === true && run(`state.invoices[0].payments.length`) === 1);
  R.ok('after: amountPaid corrected to 634 (no doubling)', run(`state.invoices[0].amountPaid`) === 634);
  R.ok('a clean ledger is untouched', run(`dedupeInvoicePayments({payments:[{amount:100},{amount:50}]})`) === false);
}

R.section('2 — two-coach attendance reader is coach-aware');
R.ok('attendanceKeyFor returns the coach-qualified cell for a non-primary coach', /return String\(coachId\) === coaches\[0\] \? sport : sport \+ ' ' \+ coachId;/.test(src));
R.ok('attendanceFor accepts + uses coachId', /function attendanceFor\(m, monthKey, sport, coachId\)/.test(src) && /mo\[attendanceKeyFor\(m, sport, coachId\)\]/.test(src));
R.ok('the sub-based reader passes the sub coach', /attendedYInMonth\(m, sub\.activity, monthKey, w\.from, w\.to, uptoDate, sub\.coachId\)/.test(src));
R.ok('the monthly commission count passes the sub coach', /attendedYInMonth\(mem, li\.sport, monthKey, _cw\.from, _cw\.to, undefined, sub\.coachId\)/.test(src));

R.section('3 — Products expense category');
R.ok('Products is in the default categories', /'Bank Commission','Equipment','Products'/.test(src));
R.ok('a migration inserts Products for existing installs', /String\(c\)\.toLowerCase\(\) === 'products'/.test(src));

R.done();
