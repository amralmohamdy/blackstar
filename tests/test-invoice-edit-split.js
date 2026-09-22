// v6.601 — the Edit Invoice dialog can now split the paid amount across methods (part cash + part
// card). The per-method boxes REPLACE this invoice's paid breakdown (dated the invoice date), so an
// admin can fix "how it was paid". Guard: an invoice with installments across several months is NOT
// flattened (that would move revenue between months) — it's sent to the 💳 Payments editor instead.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.601 · edit-invoice split payment');

// Drive editInvoiceQuick's Save action with a stubbed DOM (fields read via $ = querySelector).
function editSplit(invId, boxes, opts) {
  opts = opts || {};
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  return vm.runInContext(`
    (function(){
      window.toast = (m) => { window.__toast = String(m); }; window.__toast='';
      window.render = () => {}; window.save = () => { window.__saved = true; };
      window._invoicesRefresh = null; window.closeModal = () => {};
      window.currentUserId = () => 'u1'; window.currentUserName = () => 'QC';
      window.bindMemberPicker = () => {};
      const inv = state.invoices.find(i => i.id === ${invId});
      const boxes = ${JSON.stringify(boxes)};
      const els = {
        'ef-desc': { value: inv.description || '' },
        'ef-category': { value: inv.category || 'Membership' },
        'ef-sport': { value: inv.sport || '' },
        'ef-coach': { value: inv.coach || '' },
        'ef-cust': { value: String(inv.customerId || '') },
        'ef-method': { value: inv.method || 'cash' },
        'ef-amt': { value: String(inv.amount) },
        'ef-paid': { value: String(inv.amountPaid != null ? inv.amountPaid : inv.amount) },
        'ef-date': { value: inv.date },
        'ef-split': { checked: true },
        'ef-balance': { textContent: '' },
        'ef-split-sum': { textContent: '' },
      };
      let modal = null;
      window.showModal = (o) => { modal = o; };
      document.getElementById = (id) => (id in els) ? els[id] : null;
      document.querySelector = (sel) => (typeof sel==='string' && sel[0]==='#') ? ((sel.slice(1) in els) ? els[sel.slice(1)] : null) : { value:'', style:{}, addEventListener(){}, querySelectorAll:()=>[] };
      document.querySelectorAll = (sel) => sel === '.ef-sp' ? Object.keys(boxes).map(mk => ({ value: String(boxes[mk]), dataset:{ method: mk } })) : [];
      try { window.editInvoiceQuick(${invId}); } catch(e) { window.__err = String(e); }
      const save = (modal.actions||[]).find(a => a.label === 'Save');
      if (!save) return { err: 'no Save action', modalErr: window.__err };
      save.onclick();
      const inv2 = state.invoices.find(i => i.id === ${invId});
      return {
        payments: (inv2.payments||[]).map(p => ({ method:p.method, amount:p.amount, date:p.date, month:p.month })),
        amountPaid: inv2.amountPaid, method: inv2.method, toast: window.__toast,
      };
    })()
  `, ctx);
}

R.section('split replaces the paid breakdown (single-month invoice)');
{
  // Invoice 900 (Ali): amount 650, one cash payment 650 in 2026-07.
  const r = editSplit(900, { cash: 400, card: 250 });
  R.ok('two payment rows now (cash + card)', r.payments.length === 2, JSON.stringify(r.payments));
  const c = r.payments.find(p => p.method === 'cash'), cd = r.payments.find(p => p.method === 'card');
  R.ok('cash 400 + card 250', c && c.amount === 400 && cd && cd.amount === 250, JSON.stringify(r.payments));
  R.ok('amountPaid = 650 (sum)', Math.abs(r.amountPaid - 650) < 0.01, r.amountPaid);
  R.ok('both rows dated the invoice date/month (2026-07)', r.payments.every(p => p.month === '2026-07'), JSON.stringify(r.payments));
  R.ok('headline method set to the first split method (cash)', r.method === 'cash', r.method);
}

R.section('guard: over-total split is rejected');
{
  const r = editSplit(900, { cash: 500, card: 400 });   // 900 > 650 total
  R.ok('rejected with a "more than the invoice total" toast', /more than the invoice total|أكبر من إجمالي/.test(r.toast), r.toast);
  R.ok('the ledger was NOT changed (still the original single 650)', r.payments.length === 1 && r.payments[0].amount === 650, JSON.stringify(r.payments));
}

R.section('guard: multi-month installments are NOT flattened');
{
  // Give invoice 901 two payments in different months (it already has 2 in 2026-07; add one in 2026-08).
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const r = vm.runInContext(`
    (function(){
      window.toast = (m)=>{window.__toast=String(m);}; window.__toast='';
      window.render=()=>{}; window.save=()=>{}; window.closeModal=()=>{}; window.bindMemberPicker=()=>{};
      window.currentUserId=()=>'u1'; window.currentUserName=()=>'QC'; window._invoicesRefresh=null;
      const inv = state.invoices.find(i=>i.id===901);
      inv.payments.push({ date:'2026-08-03', month:'2026-08', amount:150, method:'cash' });
      const els = { 'ef-desc':{value:''},'ef-category':{value:inv.category},'ef-sport':{value:inv.sport||''},'ef-coach':{value:''},'ef-cust':{value:String(inv.customerId||'')},'ef-method':{value:'cash'},'ef-amt':{value:String(inv.amount)},'ef-paid':{value:'1150'},'ef-date':{value:inv.date},'ef-split':{checked:true},'ef-balance':{textContent:''},'ef-split-sum':{textContent:''} };
      let modal=null; window.showModal=(o)=>{modal=o;};
      document.getElementById=(id)=>(id in els)?els[id]:null;
      document.querySelector=(sel)=>(typeof sel==='string'&&sel[0]==='#')?((sel.slice(1) in els)?els[sel.slice(1)]:null):{value:'',style:{},addEventListener(){},querySelectorAll:()=>[]};
      document.querySelectorAll=(sel)=>sel==='.ef-sp'?[{value:'600',dataset:{method:'cash'}},{value:'550',dataset:{method:'card'}}]:[];
      try{ window.editInvoiceQuick(901);}catch(e){window.__err=String(e);}
      (modal.actions||[]).find(a=>a.label==='Save').onclick();
      const inv2=state.invoices.find(i=>i.id===901);
      return { toast:window.__toast, rows: inv2.payments.length, months:[...new Set(inv2.payments.map(p=>p.month))] };
    })()
  `, ctx);
  R.ok('blocked with a "several months / use Payments screen" toast', /several months|أقساط عبر عدة أشهر|Payments/.test(r.toast), r.toast);
  R.ok('the multi-month ledger was left intact (not flattened)', r.rows === 3 && r.months.length === 2, JSON.stringify(r));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('edit-invoice has a Split toggle + per-method inputs', /id="ef-split"[\s\S]{0,120}_efSplitToggle/.test(src) && /class="ef-sp" data-method=/.test(src));
  R.ok('split/sum helpers exist', /window\._efSplitToggle = function/.test(src) && /window\._efSplitSum = function/.test(src));
  R.ok('save replaces payments with per-method rows when split is on', /if \(_efSplit\)[\s\S]{0,1600}inv\.payments = parts\.map/.test(src));
}

R.done();
