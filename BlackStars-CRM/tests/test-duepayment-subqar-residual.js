// v6.563 — the Due Payment list dropped rows only when the balance was <= 0.001, so a sub-QAR rounding
// residual (a prorated/switch-split invoice like 325.01 paid 325 → 0.01 outstanding) listed the member
// with a "0 QAR due" — including a WITHDRAWN member (Hossam). Payments are whole QAR, so anything under
// 0.5 is rounding noise. Fix: the row threshold is now < 0.5. A genuine >= 0.5 balance still shows.
const H = require('./qc-harness.js');
const R = H.reporter('v6.563 · Due Payment ignores sub-QAR residuals');
const src = H.readSrc();

R.section('source wiring');
R.ok('the due-row threshold is 0.5 QAR (not 0.001)', /if \(total < 0\.5\) continue;/.test(src) && !/if \(total <= 0\.001\) continue;/.test(src));

R.section('runtime — 0.01 residual is dropped; a real 0.5+ due (even withdrawn) stays');
{
  // Replicate the exact row-inclusion the page uses (memberOutstanding + non-membership balances, < 0.5 skip).
  const ctx = H.makeCtx({ today: '2026-09-12', role: 'admin' });
  const res = H.vm.runInContext(`(function(){
    state.settings = {}; state.coaches = [{id:1,name:'C'}];
    state.members = [
      { id: 188, name: 'Hossam', status: 'Withdrawn', expiryDate: '2026-09-03' },
      { id: 200, name: 'RealDebt', status: 'Withdrawn', expiryDate: '2026-09-03' },
      { id: 201, name: 'ActiveOwes', status: 'Active', expiryDate: '2026-12-01' }
    ];
    state.invoices = [
      // Hossam: 325.01 charged, 325 paid → 0.01 residual (rounding noise).
      { id: 1, ref: 'H1', customerId: 188, category: 'Membership', date: '2026-09-03', month: '2026-09', amount: 325.01, amountPaid: 325, lineItems: [{ sport: 'Football', price: 325.01 }] },
      // RealDebt: withdrawn but genuinely owes 200.
      { id: 2, ref: 'R1', customerId: 200, category: 'Membership', date: '2026-09-03', month: '2026-09', amount: 500, amountPaid: 300, lineItems: [{ sport: 'Karate', price: 500 }] },
      // ActiveOwes: owes 400.
      { id: 3, ref: 'A1', customerId: 201, category: 'Membership', date: '2026-09-03', month: '2026-09', amount: 400, amountPaid: 0, lineItems: [{ sport: 'Kick Boxing', price: 400 }] }
    ];
    function rowIncluded(m){
      var invs = state.invoices.filter(i=>!i.deleted && i.customerId===m.id && !i.switchCredit);
      if(!invs.length) return null;
      var total = Math.round((memberOutstanding(m.id) + invs.filter(i=>(i.category||'Membership')!=='Membership').reduce((s,i)=>s+invoiceBalance(i),0))*100)/100;
      return total < 0.5 ? null : total;
    }
    return { hossam: rowIncluded(state.members[0]), realDebt: rowIncluded(state.members[1]), active: rowIncluded(state.members[2]) };
  })()`, ctx);
  R.ok('Hossam (0.01 residual) is EXCLUDED', res.hossam === null, JSON.stringify(res));
  R.ok('a withdrawn member who genuinely owes 200 still SHOWS (money not hidden)', res.realDebt === 200, JSON.stringify(res));
  R.ok('an active member who owes 400 still shows', res.active === 400, JSON.stringify(res));
}

R.done();
