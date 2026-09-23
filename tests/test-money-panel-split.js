// v6.600 — the money-panel "Collect" popup can now split one collection across methods (part cash +
// part card + …). Each non-zero method becomes its OWN payment row (same date + sport), so the method
// breakdown stays exact. Single-method Collect is unchanged. Locks the split record path + the wiring.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.600 · money-panel split payment');

function collect(splitValues /* {cash,card,...} or null for single */, singleAmt) {
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  return vm.runInContext(`
    (function(){
      window.toast = () => {}; window.render = () => {}; window.moneyPanel = () => {};
      window.saveConfirmed = () => Promise.resolve({ ok:true });
      const split = ${splitValues ? 'true' : 'false'};
      const spVals = ${JSON.stringify(splitValues || {})};
      const singleAmt = ${JSON.stringify(singleAmt || 0)};
      // Stub the DOM the collector reads.
      const els = {
        'mp-date': { value: '2026-07-20' },
        'mp-split': { checked: split },
        'mp-amt': { value: String(singleAmt) },
        'mp-method': { value: 'card' },
      };
      document.getElementById = (id) => els[id] || null;
      document.querySelectorAll = (sel) => {
        if (sel === '.mp-sp') return Object.keys(spVals).map(mk => ({ value: String(spVals[mk]), dataset: { method: mk } }));
        return [];
      };
      // Member 102 (Sara) has invoice 901: amount 2150, paid 1000 → balance 1150.
      window._moneyCollect(102);
      const inv = state.invoices.find(i => i.id === 901);
      const newRows = (inv.payments || []).filter(p => p.date === '2026-07-20');
      return { newRows: newRows.map(p => ({ method: p.method, amount: p.amount })), amountPaid: inv.amountPaid };
    })()
  `, ctx);
}

R.section('split records ONE row per method');
{
  const r = collect({ cash: 300, card: 200 });
  R.ok('two new payment rows were added', r.newRows.length === 2, JSON.stringify(r.newRows));
  const cash = r.newRows.find(x => x.method === 'cash'), card = r.newRows.find(x => x.method === 'card');
  R.ok('cash row = 300', cash && cash.amount === 300, JSON.stringify(cash));
  R.ok('card row = 200', card && card.amount === 200, JSON.stringify(card));
  R.ok('invoice paid advanced by the full split (1000 + 500 = 1500)', Math.abs(r.amountPaid - 1500) < 0.01, r.amountPaid);
}

R.section('a zero method is skipped');
{
  const r = collect({ cash: 250, card: 0, fawran: 0 });
  R.ok('only the non-zero method is recorded', r.newRows.length === 1 && r.newRows[0].method === 'cash' && r.newRows[0].amount === 250, JSON.stringify(r.newRows));
}

R.section('three-way split (cash + card + fawran)');
{
  const r = collect({ cash: 100, card: 150, fawran: 50 });
  R.ok('three rows, correct methods + total', r.newRows.length === 3 && Math.abs(r.amountPaid - (1000 + 300)) < 0.01, JSON.stringify(r));
}

R.section('single-method Collect still works (no split)');
{
  const r = collect(null, 400);
  R.ok('one row on the single method (card), amount 400', r.newRows.length === 1 && r.newRows[0].method === 'card' && r.newRows[0].amount === 400, JSON.stringify(r.newRows));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('money panel has a Split toggle + per-method inputs', /id="mp-split"[\s\S]{0,120}_moneySplitToggle/.test(src) && /class="mp-sp" data-method=/.test(src));
  R.ok('toggle + live-sum helpers exist', /window\._moneySplitToggle = function/.test(src) && /window\._moneySplitSum = function/.test(src));
  R.ok('_moneyCollect records one payment per split part', /for \(const p of parts\)[\s\S]{0,200}recordPayment\(inv, \{ amount: p\.amount, method: p\.method/.test(src));
  R.ok('invoice Record-payment dialog has its (now 4-method) split', /id="pay-split"/.test(src) && /class="pay-sp" data-method=/.test(src) && /\$\('#pay-split'\)\?\.addEventListener/.test(src));
}

R.done();
