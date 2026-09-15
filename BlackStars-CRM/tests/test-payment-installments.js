// Invoice paid in INSTALLMENTS: the paid total and the balance must come from the payment rows,
// and legacy invoices that predate the rows model must still read as fully paid rather than
// suddenly showing money owed. (Recreated — the original was lost to a %TEMP% clean.)
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

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
const paid = inv => vm.runInContext('invoicePaid', C)(inv);
const bal = inv => vm.runInContext('invoiceBalance', C)(inv);
const sum = inv => vm.runInContext('invoicePaymentsSum', C)(inv);

console.log('an invoice paid in three installments:');
{
  const inv = { id: 1, amount: 900, amountPaid: 900, payments: [
    { amount: 300, date: '2026-05-01', method: 'cash' },
    { amount: 300, date: '2026-06-01', method: 'card' },
    { amount: 300, date: '2026-07-01', method: 'cash' },
  ] };
  ok('the rows sum to the full amount', sum(inv) === 900, sum(inv));
  ok('it reads as fully paid', paid(inv) === 900, paid(inv));
  ok('nothing is outstanding', bal(inv) === 0, bal(inv));
}

console.log('\npart-paid — the balance is what is really owed:');
{
  const inv = { id: 2, amount: 900, amountPaid: 500, payments: [
    { amount: 300, date: '2026-05-01', method: 'cash' },
    { amount: 200, date: '2026-06-01', method: 'cash' },
  ] };
  ok('the rows sum to 500', sum(inv) === 500, sum(inv));
  ok('paid reads 500', paid(inv) === 500, paid(inv));
  ok('400 is still owed', Math.round(bal(inv)) === 400, bal(inv));
}

console.log('\nnothing paid yet:');
{
  const inv = { id: 3, amount: 500, amountPaid: 0, payments: [] };
  ok('paid is 0', paid(inv) === 0, paid(inv));
  ok('the whole amount is owed', Math.round(bal(inv)) === 500, bal(inv));
}

console.log('\nLEGACY invoices (written before payment rows existed) must not turn into debt:');
{
  // No amountPaid and no rows at all = an old fully-paid invoice. Treating it as unpaid would
  // invent a balance for hundreds of historical members.
  const legacy = { id: 4, amount: 650 };
  ok('it reads as fully paid', paid(legacy) === 650, paid(legacy));
  ok('it shows no balance', bal(legacy) === 0, bal(legacy));
}

console.log('\na refund row (negative amount) reduces the paid total:');
{
  const inv = { id: 5, amount: 900, amountPaid: 600, payments: [
    { amount: 900, date: '2026-05-01', method: 'cash' },
    { amount: -300, date: '2026-06-01', method: 'cash' },
  ] };
  ok('the rows net to 600', sum(inv) === 600, sum(inv));
  ok('300 is owed again after the refund', Math.round(bal(inv)) === 300, bal(inv));
}

console.log('\nPAYMENT INSTALLMENTS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
