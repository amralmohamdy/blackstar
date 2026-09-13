// v6.395 — "for any customer paid using installments, the invoices become not accurate and
// I can't handle installments easily."
//
// Review found three distinct problems:
//   1. Edit invoice REPLACED the whole installment ledger with ONE row dated the invoice date.
//      History, who-took-it stamps and per-sport tags were destroyed, and because the collected
//      per-month figure is summed from each row's OWN month, money jumped between months and
//      two months of revenue reported wrong. Merely LOWERING the total triggered it (via the
//      clamp) without the admin ever touching the paid field.
//   2. The paid figure lives twice — the scalar `amountPaid` and the `payments[]` rows. Older
//      paths set the scalar alone, and nothing detected the disagreement, so one screen could
//      say 900 paid while another said 600.
//   3. The Pay panel showed no history, so staff took installment #3 unable to see #1 and #2.
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
const paidOf = inv => vm.runInContext('invoicePaid', C)(inv);
// CASH COLLECTED in a calendar month = the sum of the rows that carry that month. This is the
// basis used by the cash/collected figures (app.js `_pMonth` sums). It is deliberately NOT
// invoicePaidInMonth(), which spreads payments by SPORT START MONTH for accrual revenue — a
// different question. What this release changed is whether each row keeps its own month at all.
const collectedIn = (inv, m) =>
  (inv.payments || []).reduce((s, p) => s + ((p.month || (p.date || '').slice(0, 7)) === m ? (Number(p.amount) || 0) : 0), 0);

// A real installment customer: 900 over three months.
const mkInv = () => ({
  id: 900, ref: 'INV900', amount: 900, date: '2026-05-01', month: '2026-05', method: 'cash',
  amountPaid: 900,
  payments: [
    { date: '2026-05-01', month: '2026-05', amount: 300, method: 'cash', byName: 'Reception' },
    { date: '2026-06-01', month: '2026-06', amount: 300, method: 'card', byName: 'Reception' },
    { date: '2026-07-01', month: '2026-07', amount: 300, method: 'cash', byName: 'Owner' },
  ],
});

// The shipped correction logic, lifted from the Edit-invoice handler.
function applyEdit(inv, newPaidRaw, newAmount) {
  if (newAmount != null) inv.amount = newAmount;
  let newPaid = newPaidRaw == null ? paidOf(inv) : newPaidRaw;
  newPaid = Math.max(0, Math.min(newPaid, inv.amount));
  const cur = paidOf(inv);
  if (Math.abs(newPaid - cur) > 0.001) {
    const rows = Array.isArray(inv.payments) ? inv.payments : [];
    if (rows.length) {
      const delta = Math.round((newPaid - cur) * 100) / 100;
      const last = rows[rows.length - 1] || {};
      const cd = last.date || inv.date;
      inv.payments.push({ date: cd, month: String(cd).slice(0, 7), amount: delta, method: last.method || 'cash', note: 'Correction via Edit invoice', _correction: true });
      inv.amountPaid = inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    } else {
      inv.amountPaid = newPaid;
      inv.payments = newPaid > 0 ? [{ date: inv.date, month: inv.month, amount: newPaid, method: inv.method || 'cash' }] : [];
    }
  }
  return inv;
}

console.log('1. editing an invoice must NOT destroy the installments:');
{
  const inv = applyEdit(mkInv(), 800);        // admin corrects the collected figure
  ok('all three installments survive', inv.payments.filter(p => !p._correction).length === 3, inv.payments.length);
  ok('a correction row is added instead of a rewrite', inv.payments.some(p => p._correction), inv.payments);
  ok('the new paid total is right', Math.round(paidOf(inv)) === 800, paidOf(inv));
  ok('who took each payment is preserved', inv.payments.filter(p => p.byName).length === 3, inv.payments.map(p => p.byName));
  ok('the original methods are preserved', inv.payments.filter(p => p.method === 'card').length >= 1, inv.payments.map(p => p.method));
}

console.log('\n2. monthly revenue must not move when a total is lowered:');
{
  // This is the case that needed no admin input at all — the clamp did it.
  const inv = applyEdit(mkInv(), null, 600);
  const may = collectedIn(inv, '2026-05'), jun = collectedIn(inv, '2026-06'), jul = collectedIn(inv, '2026-07');
  ok('May keeps its own installment', Math.round(may) === 300, may);
  ok('June keeps its own installment', Math.round(jun) === 300, jun);
  ok('the correction lands in the month of the money it corrects, not today', Math.round(jul) === 0, jul);
  ok('total paid now matches the reduced invoice', Math.round(paidOf(inv)) === 600, paidOf(inv));
}

console.log('\n   control — the OLD behaviour wiped them:');
{
  const inv = mkInv();
  // what the code used to do
  inv.amountPaid = 800;
  inv.payments = [{ date: inv.date, month: inv.month, amount: 800, method: 'cash' }];
  ok('OLD: only one row is left (history destroyed)', inv.payments.length === 1, inv.payments.length);
  ok('OLD: June collected wrongly becomes 0', collectedIn(inv, '2026-06') === 0);
  ok('OLD: May wrongly swells to the whole amount', collectedIn(inv, '2026-05') === 800);
  ok('the shipped code no longer contains that rewrite',
    !/inv\.amountPaid = newPaid;\s*\n\s*inv\.payments = newPaid > 0 \? \[\{ date: inv\.date, month: inv\.month, amount: newPaid[\s\S]{0,80}?\n\s*\}/.test(
      pagesSrc.slice(pagesSrc.indexOf('let newPaid = parseFloat'), pagesSrc.indexOf('let newPaid = parseFloat') + 400)));
}

console.log('\n3. a legacy invoice with no ledger still gets one seeded:');
{
  const legacy = { id: 5, amount: 500, date: '2026-04-01', month: '2026-04', method: 'cash', amountPaid: 0, payments: [] };
  applyEdit(legacy, 500);
  ok('a row is created', legacy.payments.length === 1, legacy.payments);
  ok('paid reads correctly', Math.round(paidOf(legacy)) === 500, paidOf(legacy));
}

console.log('\n4. paid-vs-ledger drift is detected — by the EXISTING detector:');
{
  // v6.395 briefly added a second detector for this. It duplicated _paymentLedgerIssues() (which
  // already reports `drift` and is wired to the "💳 Payment ledger" review screen) and was never
  // attached to any screen, so it was removed. These assertions pin the real one.
  const probe = (invoices) => vm.runInContext(`(function(){ state.invoices = ${JSON.stringify(invoices)}; return _paymentLedgerIssues(); })()`, C);

  const drifted = probe([{ id: 1, amountPaid: 900, payments: [{ amount: 300 }, { amount: 300 }] }]);
  ok('an invoice whose paid field exceeds its rows is flagged', drifted.length === 1 && drifted[0].drift === true, drifted);
  ok('...reporting both numbers so the admin can judge', drifted[0].amountPaid === 900 && drifted[0].sum === 600, drifted[0]);

  ok('a consistent invoice is NOT flagged',
    probe([{ id: 2, amountPaid: 600, payments: [{ amount: 300 }, { amount: 300 }] }]).length === 0);
  ok('a legacy invoice with no rows is left alone',
    probe([{ id: 3, amountPaid: 650, payments: [] }]).length === 0);
  ok('sub-riyal rounding noise is tolerated',
    probe([{ id: 4, amountPaid: 600.2, payments: [{ amount: 600 }] }]).length === 0);
  ok('a deleted invoice is ignored',
    probe([{ id: 5, deleted: true, amountPaid: 900, payments: [{ amount: 1 }] }]).length === 0);
}

console.log('\n5. the drift detector reports only — it never silently "fixes" money:');
{
  const seg = appSrc.slice(appSrc.indexOf('function _paymentLedgerIssues'), appSrc.indexOf('function _fixPaymentPhantoms'));
  // (`=[^=]` so a comparison like `inv.amountPaid == null` is not mistaken for an assignment)
  ok('it does not assign amountPaid', !/amountPaid\s*=[^=]/.test(seg));
  ok('...and it does not rewrite payments', !/\.payments\s*=[^=]/.test(seg));
  ok('there is exactly ONE drift detector (no duplicate reintroduced)',
    !/function _icPaidLedgerIssue/.test(pagesSrc) && !/function findPaidLedgerDrift/.test(pagesSrc));
  ok('and a note records why a second one must not come back', /do not reintroduce a parallel one/.test(pagesSrc));
  ok('the review screen shows Paid-field vs Rows-sum', /Paid field', 'حقل المدفوع'[\s\S]{0,200}?Rows sum/.test(pagesSrc));
}

console.log('\n6. the Pay panel now shows what was already collected:');
{
  ok('the history block is rendered in the panel', /\$\{invoiceInstallmentHistoryHtml\(inv\)\}/.test(pagesSrc));
  ok('it lists date, method and amount per installment', /Already collected/.test(pagesSrc));
  ok('a correction row is labelled, not shown as a customer payment', /p\._correction \|\| amt < 0/.test(pagesSrc));
  ok('nothing is rendered when there are no payments yet', /if \(!rows\.length\) return '';/.test(pagesSrc));
}

console.log('\nINSTALLMENTS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
