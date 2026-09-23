// v6.602 — the 💵 Pay (Record payment) dialog now splits across ALL FOUR methods (cash / card /
// fawran / transfer), not just cash+card. Each non-zero method = its own payment row via
// recordInvoicePayment; over-balance is trimmed from the last method(s) down.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.602 · Record-payment 4-method split');

function pay(boxes /* {cash,card,fawran,transfer} */) {
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  return vm.runInContext(`
    (function(){
      window.toast=(m)=>{window.__toast=String(m);}; window.__toast='';
      window.render=()=>{}; window.save=()=>{}; window.closeModal=()=>{};
      window.confirm=()=>true; window.withCloudConfirm=()=>{};
      window.assertCloudWritable=()=>true;
      const inv = state.invoices.find(i=>i.id===901);   // amount 2150, paid 1000 → balance 1150
      const boxes = ${JSON.stringify(boxes)};
      const _noop = { addEventListener(){}, style:{}, value:'', textContent:'' };
      const mk = (o) => Object.assign({ addEventListener(){}, style:{} }, o);
      const els = { 'pay-date':mk({value:'2026-07-20'}), 'pay-split':mk({checked:true}), 'pay-amt':mk({value:'0'}), 'pay-method':mk({value:'cash'}), 'pay-single':mk({}), 'pay-method-field':mk({}), 'pay-split-rows':mk({}), 'pay-split-sum':mk({}), 'pay-split-rem':mk({}), 'pay-split-rem-card':mk({}) };
      let modal=null; window.showModal=(o)=>{modal=o;};
      document.getElementById=(id)=>(id in els)?els[id]:null;
      document.querySelector=(sel)=>(typeof sel==='string'&&sel[0]==='#')?((sel.slice(1) in els)?els[sel.slice(1)]:_noop):_noop;
      document.querySelectorAll=(sel)=> sel==='.pay-sp' ? Object.keys(boxes).map(m=>mk({value:String(boxes[m]),dataset:{method:m}})) : [];
      window.recordPaymentUI(901);
      const rec=(modal.actions||[]).find(a=>/Record payment/.test(a.label));
      rec.onclick();
      const inv2=state.invoices.find(i=>i.id===901);
      const added=(inv2.payments||[]).filter(p=>p.date==='2026-07-20');
      return { added: added.map(p=>({method:p.method,amount:p.amount})), toast: window.__toast };
    })()
  `, ctx);
}

R.section('three-way split cash + card + fawran');
{
  const r = pay({ cash: 100, card: 150, fawran: 50 });
  R.ok('three payment rows, one per method', r.added.length === 3, JSON.stringify(r.added));
  R.ok('fawran is now supported (50)', !!r.added.find(p => p.method === 'fawran' && p.amount === 50), JSON.stringify(r.added));
  R.ok('cash 100 + card 150 too', !!r.added.find(p => p.method === 'cash' && p.amount === 100) && !!r.added.find(p => p.method === 'card' && p.amount === 150), JSON.stringify(r.added));
}

R.section('transfer works and over-balance is trimmed from the last method');
{
  // balance 1150; enter 1000 transfer + 300 cash = 1300 → trim 150 off the LAST entered (cash → 150).
  const r = pay({ transfer: 1000, cash: 300 });
  const tr = r.added.find(p => p.method === 'transfer'), c = r.added.find(p => p.method === 'cash');
  R.ok('transfer kept in full (1000)', tr && tr.amount === 1000, JSON.stringify(r.added));
  R.ok('cash trimmed to fit the 1150 balance (300 → 150)', c && c.amount === 150, JSON.stringify(r.added));
  R.ok('total recorded = balance (1150)', Math.abs(r.added.reduce((s,p)=>s+p.amount,0) - 1150) < 0.01, JSON.stringify(r.added));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('4 method boxes (.pay-sp) with fawran + transfer', /class="pay-sp" data-method=/.test(src) && /\['fawran', '📲'[\s\S]{0,40}'transfer'/.test(src.replace(/\n/g,'')) || /'fawran'[\s\S]{0,60}'transfer'/.test(src));
  R.ok('save loops .pay-sp parts → recordInvoicePayment per method', /const parts = \[\];\s*\$\$\('\.pay-sp'\)\.forEach/.test(src) && /for \(const p of parts\) \{ if \(p\.amount > 0\.005\) recordInvoicePayment\(inv, p\.amount, \{ date, method: p\.method \}\)/.test(src));
  R.ok('recompute sums all .pay-sp', /function recomputeSplit\(\)[\s\S]{0,120}\$\$\('\.pay-sp'\)\.forEach/.test(src));
}

R.done();
