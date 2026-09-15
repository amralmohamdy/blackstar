// v6.537 — in the detailed price/payments editor (editMemberPricing), when the recorded payment rows
// NET TO ZERO (a payment that was later fully reversed, e.g. +588 +137 −725), nothing was actually
// collected. The raw +/− rows must fold behind a "Show reversed history" toggle and be replaced with a
// plain "Nothing collected yet — use Collect" line, so an unpaid member shows just price + Collect.
// The rows must stay in the DOM (still editable) — this is display-only, no data change.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.537 · unpaid = fold reversed rows');
const src = H.readSrc();

R.section('source');
R.ok('net-zero history is detected (rows exist but paid ≈ 0)', /_netZeroHistory = pays\.length > 0 && Math\.abs\(paid\) < 0\.01;/.test(src));
R.ok('a fully-reversed ledger folds into a "Show reversed history" details', /Show reversed history[\s\S]{0,120}?existHeader\}\$\{existRowsHtml\}/.test(src));
R.ok('the rows are still rendered inside the fold (kept editable, no data change)', /Show reversed history[\s\S]{0,240}?\$\{existRowsHtml\}[\s\S]{0,30}?<\/details>/.test(src));
R.ok('a real (non-zero) ledger still shows rows normally', /: `\$\{existHeader\}\$\{existRowsHtml\}`\)/.test(src));

R.section('runtime — render the editor and inspect the modal body');
{
  const ctx = H.makeCtx({ today: '2026-08-28', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // capture whatever showModal is handed, without touching the real DOM
  run(`window.showModal = function(o){ globalThis.__body = (o && o.body) || ''; }; window.closeModal=function(){};`);

  // (A) fully-reversed member — +200 then −200 correction → net 0
  run(`
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:501,name:'Reversed',expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:200}],subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:200,invoiceNumber:'INVZ'}]}];
    state.invoices=[{id:9001,ref:'INVZ',customerId:501,category:'Membership',date:'2026-08-01',month:'2026-08',amount:200,coachId:1,amountPaid:0,
      lineItems:[{sport:'Karate',coachId:1,classes:8,price:200}],
      payments:[{amount:200,date:'2026-08-01',month:'2026-08',method:'cash'},{amount:-200,date:'2026-08-01',month:'2026-08',method:'cash',_correction:true,note:'Correction via Edit invoice'}]}];
  `);
  run(`editMemberPricing(501)`);
  const bodyA = run(`String(globalThis.__body||'')`);
  R.ok('the editor opened (body captured)', bodyA.length > 100);
  R.ok('it says nothing was collected', /Nothing collected yet/.test(bodyA));
  R.ok('the reversed rows are folded behind a history toggle', /Show reversed history/.test(bodyA) && /<details/.test(bodyA));
  R.ok('the raw rows still exist in the DOM (editable, not deleted)', (bodyA.match(/pri-exist-amt/g) || []).length === 2);
  R.ok('the Collect box is present', /Collect a new payment/.test(bodyA));

  // (B) a genuine partial payment (100 of 200) must NOT fold — the real installment stays visible
  run(`globalThis.__body='';
    state.members=[{id:502,name:'Partial',expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:200}],subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:200,invoiceNumber:'INVP'}]}];
    state.invoices=[{id:9002,ref:'INVP',customerId:502,category:'Membership',date:'2026-08-01',month:'2026-08',amount:200,coachId:1,amountPaid:100,
      lineItems:[{sport:'Karate',coachId:1,classes:8,price:200}],
      payments:[{amount:100,date:'2026-08-01',month:'2026-08',method:'cash'}]}];
  `);
  run(`editMemberPricing(502)`);
  const bodyB = run(`String(globalThis.__body||'')`);
  R.ok('a real partial payment does NOT get the "nothing collected" message', !/Nothing collected yet/.test(bodyB));
  R.ok('the real installment row is shown directly (not folded)', /pri-exist-amt/.test(bodyB) && !/Show reversed history/.test(bodyB));
}

R.done();
