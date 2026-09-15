// v6.397 — payment + invoice module review.
//
// An invoice states its value TWICE: the stored `inv.amount`, and the sum of its sport line
// items. invoiceTotal() is the canonical value (line-sum when lines exist, else amount) and the
// balance, status and per-month figures all derive from it. But several screens printed the RAW
// inv.amount, so on any invoice where the two had drifted — a condition the Invoice Checker
// already detects and reports — the figures on screen contradicted each other:
//   • the Pay panel showed Total − Paid ≠ Balance across its own three cards
//   • the member card showed "paid + due" not adding up to the stated total
//   • the invoice tables showed a Total that disagreed with the row's own balance
//   • the WhatsApp receipt listed items summing to X and then printed "Total: Y"
//   • worst: Edit invoice CLAMPED the collected figure to inv.amount, so when the line-sum was
//     higher the admin literally could not record the full payment and the invoice kept a
//     permanent phantom balance.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

function makeCtx() {
  const c = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp };
  c.window = c; c.globalThis = c;
  c.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  c.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  c.location = { hash: '' }; c.navigator = { userAgent: 'n' }; c.addEventListener = () => {};
  vm.createContext(c); try { vm.runInContext(appSrc, c); } catch (_) {}
  return c;
}
const C = makeCtx();
const total = inv => vm.runInContext('invoiceTotal', C)(inv);
const paid = inv => vm.runInContext('invoicePaid', C)(inv);
const bal = inv => vm.runInContext('invoiceBalance', C)(inv);

// A DRIFTED invoice: the stored amount says 600, its sport lines say 900. The Invoice Checker
// reports this shape, so it genuinely occurs in the data.
const drifted = () => ({
  id: 900, ref: 'INV900', amount: 600, date: '2026-05-01', month: '2026-05',
  lineItems: [{ sport: 'Kick Boxing', price: 650 }, { sport: 'Swimming', price: 250 }],
  amountPaid: 300, payments: [{ date: '2026-05-01', month: '2026-05', amount: 300, method: 'cash' }],
});

console.log('the canonical total is the line-sum:');
{
  const inv = drifted();
  ok('invoiceTotal reads the lines, not the stored amount', total(inv) === 900, total(inv));
  ok('the stored amount is genuinely different (a real drift)', inv.amount === 600);
  ok('the balance is computed from the canonical total', Math.round(bal(inv)) === 600, bal(inv));
}

console.log('\nthe three figures must agree — Total − Paid = Balance:');
{
  const inv = drifted();
  ok('using invoiceTotal they reconcile', Math.round(total(inv) - paid(inv)) === Math.round(bal(inv)),
    { total: total(inv), paid: paid(inv), bal: bal(inv) });
  // control: what the screens used to print
  ok('control: using the RAW amount they did NOT reconcile', Math.round(inv.amount - paid(inv)) !== Math.round(bal(inv)),
    { shown: inv.amount, paid: paid(inv), bal: bal(inv) });
}

console.log('\nthe collected figure is no longer clamped below what is owed:');
{
  const inv = drifted();
  const clampNew = (v) => Math.max(0, Math.min(v, total(inv)));   // shipped
  const clampOld = (v) => Math.max(0, Math.min(v, inv.amount));   // previous
  ok('the admin CAN now record the full 900', clampNew(900) === 900, clampNew(900));
  ok('control: it used to be capped at 600', clampOld(900) === 600, clampOld(900));
  ok('...which left a phantom balance that could never be cleared', Math.round(total(inv) - clampOld(900)) === 300);
  ok('over-collection is still refused', clampNew(5000) === 900, clampNew(5000));
  ok('negatives are still refused', clampNew(-50) === 0);
}

console.log('\na consistent invoice is completely unaffected:');
{
  const clean = { id: 1, amount: 900, lineItems: [{ sport: 'A', price: 600 }, { sport: 'B', price: 300 }], amountPaid: 300, payments: [{ amount: 300 }] };
  ok('invoiceTotal equals the stored amount', total(clean) === clean.amount, total(clean));
  ok('the balance is unchanged', Math.round(bal(clean)) === 600, bal(clean));
}

console.log('\nan invoice with NO line items still uses its stored amount:');
{
  const noLines = { id: 2, amount: 500, amountPaid: 200, payments: [{ amount: 200 }] };
  ok('invoiceTotal falls back to inv.amount', total(noLines) === 500, total(noLines));
  ok('so nothing changes for rentals / products / legacy rows', Math.round(bal(noLines)) === 300, bal(noLines));
}

console.log('\nsource wiring — every money-facing screen now uses the canonical total:');
{
  ok('the Pay panel Total card', /pay-tcard"><div class="l">\$\{t\('Total', 'الإجمالي'\)\}<\/div><div class="v">\$\{fmt\(invoiceTotal\(inv\)\)\}/.test(pagesSrc));
  ok('the Edit-invoice clamp', /Math\.min\(newPaid, invoiceTotal\(inv\)\)/.test(pagesSrc));
  ok('the member card paid/due line', /\(total \$\{fmt\(invoiceTotal\(inv\)\)\}\)/.test(pagesSrc));
  ok('the member card paid-in-full line', /\$\{fmt\(invoiceTotal\(inv\)\)\} QAR<\/b> paid in full/.test(pagesSrc));
  ok('both invoice-table Total columns', (pagesSrc.match(/text-right num font-bold">\$\{fmt\(invoiceTotal\(i\)\)\}/g) || []).length === 2);
  ok('the WhatsApp receipt total', /\*Total: \$\{fmt\(invoiceTotal\(inv\)\)\} QAR\*/.test(pagesSrc));
  ok('the payment-ledger review header', /\$\{t\('Total', 'الإجمالي'\)\} \$\{fmt\(invoiceTotal\(inv\)\)\}/.test(pagesSrc));
  ok('no raw fmt(i.amount) Total column remains', !/text-right num font-bold">\$\{fmt\(i\.amount\)\}/.test(pagesSrc));
}

console.log('\nthe drift DETECTOR still compares the raw values (it must):');
{
  // _icAmountIssue exists precisely to spot amount ≠ line-sum, so it has to read both directly.
  ok('_icAmountIssue still compares lineSum against inv.amount',
    /const lineSum = inv\.lineItems\.reduce[\s\S]{0,200}?Math\.abs\(lineSum - amount\) > 0\.5/.test(pagesSrc));
  ok('...and the member-health check likewise', /Math\.abs\(lineSum - \(Number\(iv\.amount\) \|\| 0\)\) > 0\.5/.test(pagesSrc));
}

console.log('\nINVOICE TOTAL CONSISTENCY:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
