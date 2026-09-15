// A coach's month can be settled in several payments. The paid total must come from the payment
// rows, and a LEGACY record (paid before the rows model existed) must still read as paid rather
// than reverting to "owed" and being paid twice.
// (Recreated — the original was lost to a %TEMP% clean.)
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

function ctx() {
  const c = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp };
  c.window = c; c.globalThis = c;
  c.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  c.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  c.location = { hash: '' }; c.navigator = { userAgent: 'n' }; c.addEventListener = () => {};
  vm.createContext(c); try { vm.runInContext(appSrc, c); } catch (_) {}
  return c;
}
const C = ctx();
const rows = rec => vm.runInContext('salaryPayments', C)(rec);
const total = rec => vm.runInContext('salaryPaidTotal', C)(rec);

console.log('a month settled in two installments:');
{
  const rec = { id: 1, coachId: 3, month: '2026-06', payments: [
    { id: 'p1', amount: 1200, date: '2026-06-15', method: 'cash' },
    { id: 'p2', amount: 800, date: '2026-07-01', method: 'transfer' },
  ] };
  ok('both rows are returned', rows(rec).length === 2, rows(rec).length);
  ok('the paid total is the sum', total(rec) === 2000, total(rec));
}

console.log('\na single payment:');
{
  const rec = { id: 2, payments: [{ id: 'p1', amount: 1500, date: '2026-06-30', method: 'cash' }] };
  ok('total is that payment', total(rec) === 1500, total(rec));
}

console.log('\nnothing paid:');
{
  ok('an empty rows array totals 0', total({ id: 3, payments: [] }) === 0);
}

console.log('\nLEGACY record — paid before payment rows existed:');
{
  // Reading this as unpaid would put an already-settled month back into "owed" and risk paying
  // the coach a second time.
  const legacy = { id: 4, coachId: 3, month: '2026-04', paidDate: '2026-04-30', snapshotNet: 1800 };
  const t = total(legacy);
  ok('it does not read as 0 owed-again', t !== 0 || rows(legacy).length > 0, { total: t, rows: rows(legacy).length });
  ok('the legacy shape is recognised in code', /paidDate != null && Number\(rec\.snapshotNet\) > 0\.005/.test(pagesSrc));
}

console.log('\nzero-value settlement (v6.383) — a coach who earned nothing:');
{
  // A 0 payment must still settle the month, otherwise it stays perpetually "unpaid".
  ok('a 0 amount is accepted as a settlement', /if \(amount === 0 && Math\.abs\(_owed\) > 0\.5\)/.test(pagesSrc));
  ok('paidStatus turns paid when the target is met with rows present',
    /paidTarget <= 0\.005 && payments\.length > 0\) paidStatus = 'paid'/.test(appSrc));
}

console.log('\nthe salary payment is cloud-confirmed:');
{
  ok('_salAddPay confirms before reporting success', /_salAddPay[\s\S]{0,4000}?(withCloudConfirm|confirmSaved)\(/.test(pagesSrc));
}

console.log('\nSALARY INSTALLMENTS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
