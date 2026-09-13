// v6.528 — the paid-amount (v6.525) + per-coach-basis (v6.526) commission logic must be reflected on
// EVERY screen, not just the Salaries table. Coach Performance, the coach card's Pay KPIs, and the
// Revenue-Detail breakdown (modal + PDF) now route through / mirror computeMonthlyPay so they equal the
// Salaries gross and honor the per-coach basis.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.528 · commission consistency across screens');
const src = H.readSrc();

R.section('source — screens route through computeMonthlyPay');
R.ok('Coach Performance commission uses computeMonthlyPay', /const mayComm = \(typeof computeMonthlyPay === 'function'\) \? \(\(computeMonthlyPay\(c\.id, currentM\)/.test(src));
R.ok('coach card Pay KPIs use computeMonthlyPay (current + prev month)', /const mayComm = \(typeof computeMonthlyPay === 'function'\) \? \(\(computeMonthlyPay\(id, _payCur\)/.test(src));
R.ok('Revenue-Detail modal has a payment-basis rebuild from paid amounts', (src.match(/pay\.basis === 'payment'\) \{/g) || []).length >= 2);
R.ok('the rebuild attributes the coach share of payments this month', (src.match(/const share = Math\.round\(paidThisMonth \* ratio \* 100\) \/ 100;/g) || []).length >= 2);
R.ok('the old "full li.price is the base" comment path is no longer the only source', /each line is the coach's share of the amount\s*\n?\s*\/\/ actually PAID this month/.test(src) || /coach's share of the amount actually PAID this month/.test(src));

R.section('runtime — Revenue-Detail payment rebuild total == Salaries gross (partly-paid coach)');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // Payment-basis coach; two members, one FULLY paid (900), one PARTLY paid (300 of 800). Also a
  // multi-coach invoice to exercise the proportional split.
  run(`
    state.settings={commissionBasis:'payment'};
    state.coaches=[{id:1,name:'P',rate:60,role:'coach',active:true},{id:2,name:'Q',rate:30,role:'coach',active:true}];
    state.members=[
      {id:1,name:'Full',expiryDate:'2026-12-01',status:'Active',subscriptions:[{activity:'KB',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I1'}]},
      {id:2,name:'Partial',expiryDate:'2026-12-01',status:'Active',subscriptions:[{activity:'KB',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I2'}]},
      {id:3,name:'Multi',expiryDate:'2026-12-01',status:'Active',subscriptions:[{activity:'KB',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I3'},{activity:'Sw',coachId:2,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I3'}]}
    ];
    state.invoices=[
      {id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:900,coachId:1,lineItems:[{sport:'KB',coachId:1,classes:8,price:900}],payments:[{amount:900,date:'2026-08-05',month:'2026-08'}]},
      {id:2,ref:'I2',customerId:2,category:'Membership',date:'2026-08-01',month:'2026-08',amount:800,coachId:1,lineItems:[{sport:'KB',coachId:1,classes:8,price:800}],payments:[{amount:300,date:'2026-08-06',month:'2026-08'}]},
      {id:3,ref:'I3',customerId:3,category:'Membership',date:'2026-08-01',month:'2026-08',amount:1000,lineItems:[{sport:'KB',coachId:1,classes:8,price:400},{sport:'Sw',coachId:2,classes:8,price:600}],payments:[{amount:500,date:'2026-08-10',month:'2026-08'}]}
    ];
  `);
  // computeMonthlyPay is the source of truth.
  const gross1 = Math.round((run(`computeMonthlyPay(1,'2026-08')`).commissionBase || 0) * 100) / 100;
  // Replicate the Revenue-Detail rebuild EXACTLY and confirm it equals that base.
  const rebuildTotal = run(`(function(coachId, monthKey){
    let tot=0;
    for (const inv of state.invoices) {
      if (inv.deleted) continue; if ((inv.category||'Membership')!=='Membership') continue;
      const mem = inv.customerId ? state.members.find(x=>x.id===inv.customerId) : null; if (mem&&mem.deleted) continue;
      const lis = (Array.isArray(inv.lineItems)&&inv.lineItems.length)?inv.lineItems:[{sport:inv.sport,coachId:inv.coachId,price:inv.amount||0}];
      let coachFee=0,totalFee=0;
      for (const li of lis){ const pr=parseFloat(li.price)||0; totalFee+=pr; if(li.sport==='Summer Camp')continue; if(String(li.coachId)!==String(coachId))continue; const e=lineCommissionEligibility(mem,inv,li,null); if(!e.excluded)coachFee+=pr; }
      if(coachFee<=0||totalFee<=0)continue; const ratio=coachFee/totalFee;
      let paid=0; for(const p of (inv.payments||[])){ const a=Number(p.amount)||0; if(a<=0)continue; const pk=p.month||String(p.date||'').slice(0,7); if(pk===monthKey)paid+=a; }
      tot += Math.round(paid*ratio*100)/100;
    }
    return Math.round(tot*100)/100;
  })(1,'2026-08')`);
  R.ok('coach 1 paid-base = 900 + 300 + (500×400/1000=200) = 1400', gross1 === 1400, 'gross=' + gross1);
  R.ok('Revenue-Detail rebuild total EQUALS the Salaries commission base', rebuildTotal === gross1, `detail=${rebuildTotal} salaries=${gross1}`);
  // Coach Performance number = computeMonthlyPay commissionAmount
  const perf = Math.round((run(`computeMonthlyPay(1,'2026-08')`).commissionAmount || 0) * 100) / 100;
  R.ok('Coach Performance commission (60% × 1400) = 840', perf === 840, 'perf=' + perf);
}

R.section('runtime — per-coach basis is honored on the detail rebuild');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // Club default = attendance, but coach pinned to payment → detail must use payment.
  run(`
    state.settings={commissionBasis:'attendance'};
    state.coaches=[{id:1,name:'P',rate:60,role:'coach',active:true,commissionBasis:'payment'}];
    state.members=[{id:1,name:'A',expiryDate:'2026-12-01',status:'Active',subscriptions:[{activity:'KB',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'I1'}],dailyAttendance:{'2026-08':{KB:{'2':'Y'}}}}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:900,coachId:1,lineItems:[{sport:'KB',coachId:1,classes:8,price:900}],payments:[{amount:900,date:'2026-08-05',month:'2026-08'}]}];
  `);
  R.ok('pinned-payment coach resolves to payment basis', run(`computeMonthlyPay(1,'2026-08').basis`) === 'payment');
  R.ok('  → base 900 (paid), not 112.5 (1/8 attendance-prorated)', Math.round(run(`computeMonthlyPay(1,'2026-08').commissionBase`) * 100) / 100 === 900);
}

R.done();
