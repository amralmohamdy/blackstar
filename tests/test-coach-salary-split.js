// v6.601 — a coach payout can be split across methods (part cash + part transfer). Each non-zero
// method becomes its OWN salary payment row AND its own Salary expense (same date + salary month), so
// the expenses ledger + method reports stay exact. Single-method payout is unchanged.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.601 · coach salary split payout');

function pay(split /* {cash,transfer,...} */, singleAmt, singleMethod) {
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  return vm.runInContext(`
    (function(){
      window.withCloudConfirm = () => {}; window.markPaid = () => {}; window.render = () => {};
      window.toast = (m) => { window.__toast = String(m); }; window.__toast='';
      const split = ${split ? 'true' : 'false'};
      const spVals = ${JSON.stringify(split || {})};
      const els = {
        'sp-split-cb': { checked: split },
        'sp-target': { value: '' },
        'sp-add-date': { value: '2026-07-05' },
        'sp-settle': null,
        'sp-add-amt': { value: String(${JSON.stringify(singleAmt || 0)}) },
        'sp-add-method': { value: ${JSON.stringify(singleMethod || 'cash')} },
      };
      document.getElementById = (id) => (id in els) ? els[id] : null;
      document.querySelector = (sel) => (typeof sel==='string' && sel[0]==='#') ? ((sel.slice(1) in els) ? els[sel.slice(1)] : null) : null;
      document.querySelectorAll = (sel) => sel === '.sp-sp' ? Object.keys(spVals).map(mk => ({ value: String(spVals[mk]), dataset:{ method: mk } })) : [];
      window._salAddPay(1, '2026-07');
      const rec = (state.salaries||[]).find(s => s.coachId===1 && s.month==='2026-07' && s.kind==='paid');
      const exps = (state.expenses||[]).filter(e => e._salaryAutoExpense && e.salaryId === (rec&&rec.id) && e.month==='2026-07');
      return {
        payments: rec ? rec.payments.map(p => ({ method:p.method, amount:p.amount })) : [],
        expenses: exps.map(e => ({ method:e.method, amount:e.amount, cat:e.category })),
        toast: window.__toast,
      };
    })()
  `, ctx);
}

R.section('split payout = one payment row + one Salary expense per method');
{
  const r = pay({ cash: 300, transfer: 200 });
  R.ok('two payment rows recorded', r.payments.length === 2, JSON.stringify(r.payments));
  const c = r.payments.find(p => p.method === 'cash'), tr = r.payments.find(p => p.method === 'transfer');
  R.ok('cash 300 + transfer 200', c && c.amount === 300 && tr && tr.amount === 200, JSON.stringify(r.payments));
  R.ok('two Salary expenses (money out), one per method', r.expenses.length === 2 && r.expenses.every(e => e.cat === 'Salary'), JSON.stringify(r.expenses));
  R.ok('expense methods match the split', !!r.expenses.find(e => e.method === 'cash' && e.amount === 300) && !!r.expenses.find(e => e.method === 'transfer' && e.amount === 200), JSON.stringify(r.expenses));
}

R.section('a zero method is skipped');
{
  const r = pay({ cash: 500, transfer: 0, card: 0 });
  R.ok('only the non-zero method becomes a payment + expense', r.payments.length === 1 && r.payments[0].method === 'cash' && r.expenses.length === 1, JSON.stringify(r));
}

R.section('single-method payout unchanged (no split)');
{
  const r = pay(null, 250, 'transfer');
  R.ok('one payment row on the chosen method', r.payments.length === 1 && r.payments[0].method === 'transfer' && r.payments[0].amount === 250, JSON.stringify(r.payments));
  R.ok('one matching Salary expense', r.expenses.length === 1 && r.expenses[0].method === 'transfer' && r.expenses[0].amount === 250, JSON.stringify(r.expenses));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('salary dialog has a Split toggle + per-method inputs', /id="sp-split-cb"[\s\S]{0,120}_salSplitToggle/.test(src) && /class="sp-sp" data-method=/.test(src));
  R.ok('_salAddPay loops parts → payment + expense each', /for \(const part of parts\)[\s\S]{0,400}rec\.payments\.push\(\{ id: payId, amount: part\.amount/.test(src));
  R.ok('split/sum helpers exist', /window\._salSplitToggle = function/.test(src) && /window\._salSplitSum = function/.test(src));
}

R.done();
