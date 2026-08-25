// v6.521 — per-sport / per-period invoice export. Each Subscription-History row has a 📄 button
// (printMemberSubInvoicePDF) that prints an invoice for JUST that sport/period, so a member with
// several sports — or the same sport renewed several times — can get a receipt for exactly one
// package (vs "Get Invoice" which merges the whole membership). The synthetic invoice is never
// persisted.
const H = require('./qc-harness.js');
const R = H.reporter('v6.521 · per-sport (single-period) invoice export');
const src = H.readSrc();

R.section('source — function + button');
R.ok('printMemberSubInvoicePDF exists', /window\.printMemberSubInvoicePDF = function\(memberId, sid\)/.test(src));
R.ok('the Subscription-History row has a 📄 export button wired to it', /printMemberSubInvoicePDF\(\$\{m\.id\}, '\$\{sid\}'\)/.test(src));
R.ok('it prefers the period\'s own linked invoice (sub.invoiceNumber)', /sub\.invoiceNumber\s*\?\s*\(state\.invoices \|\| \[\]\)\.filter/.test(src));
R.ok('it keeps ONLY this sport\'s line(s)', /items\.filter\(li => \(li\.sport \|\| ''\) === sport && sameCoach\(li\.coachId\)\)/.test(src));
R.ok('the synthetic invoice is removed, never persisted', /finally \{ const i = state\.invoices\.findIndex\(x => x\.id === tempId\); if \(i >= 0\) state\.invoices\.splice\(i, 1\); \}/.test(src));

R.section('runtime — a member with two same-sport packages gets each isolated');
{
  const ctx = H.makeCtx({ today: '2026-08-24', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`
    state.coaches = [{id:11,name:'AbdelSalam',rate:30,role:'coach',active:true}];
    state.members = [{ id:5, name:'Sattam', sport:'Kick Boxing', coachId:11, expiryDate:'2026-12-01', status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:11,classes:12,price:1440}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:11,totalClasses:1,start:'2026-08-11',end:'2026-09-10',status:'active',amountPaid:120,invoiceNumber:'A120',_sid:'sub120'},
        {activity:'Kick Boxing',coachId:11,totalClasses:12,start:'2026-08-16',end:'2026-09-15',status:'active',amountPaid:1440,invoiceNumber:'B1440',_sid:'sub1440'}
      ] }];
    state.invoices = [
      {id:1,ref:'A120',customerId:5,category:'Membership',date:'2026-08-11',month:'2026-08',amount:120,coachId:11,lineItems:[{sport:'Kick Boxing',coachId:11,classes:1,price:120}],payments:[{amount:120}]},
      {id:2,ref:'B1440',customerId:5,category:'Membership',date:'2026-08-16',month:'2026-08',amount:1440,coachId:11,lineItems:[{sport:'Kick Boxing',coachId:11,classes:12,price:1440}],payments:[{amount:1440}]}
    ];
    window.__cap = null;
    window.printInvoicePDF = function(id){ window.__cap = state.invoices.find(x=>x.id===id); };
  `);

  run(`printMemberSubInvoicePDF(5,'sub120')`);
  const a = run(`window.__cap`);
  R.ok('period 1 → an invoice for 120 only', a && a.amount === 120 && a.amountPaid === 120, JSON.stringify(a && { amt: a.amount, paid: a.amountPaid }));
  R.ok('period 1 → a single Kick Boxing line', a && a.lineItems.length === 1 && a.lineItems[0].sport === 'Kick Boxing');
  R.ok('period 1 → temp invoice not persisted', run(`state.invoices.some(x=>x.id<0)`) === false);

  run(`printMemberSubInvoicePDF(5,'sub1440')`);
  const b = run(`window.__cap`);
  R.ok('period 2 → an invoice for 1440 only (not merged with the 120)', b && b.amount === 1440 && b.amountPaid === 1440, JSON.stringify(b && { amt: b.amount, paid: b.amountPaid }));
  R.ok('period 2 → 12-class line carried through', b && b.lineItems[0].classes === 12, JSON.stringify(b && b.lineItems[0]));
  R.ok('the two exports differ (period-specific, not the whole membership)', a.amount !== b.amount);
}

R.section('runtime — proportional paid attribution on a part-paid combined invoice');
{
  const ctx = H.makeCtx({ today: '2026-08-24', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  // One invoice, two sports (Karate 400 + Swimming 600 = 1000), only 500 paid. The Karate sub links
  // to it; its share of the 500 paid = 500 × 400/1000 = 200.
  run(`
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:6,name:'Multi',expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:400},{sport:'Swimming',coachId:1,classes:8,price:600}],
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:200,invoiceNumber:'M1',_sid:'k'},
                     {activity:'Swimming',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:300,invoiceNumber:'M1',_sid:'s'}]}];
    state.invoices=[{id:1,ref:'M1',customerId:6,category:'Membership',date:'2026-08-01',month:'2026-08',amount:1000,coachId:1,
      lineItems:[{sport:'Karate',coachId:1,classes:8,price:400},{sport:'Swimming',coachId:1,classes:8,price:600}],payments:[{amount:500}]}];
    window.__cap=null; window.printInvoicePDF=function(id){ window.__cap=state.invoices.find(x=>x.id===id); };
  `);
  run(`printMemberSubInvoicePDF(6,'k')`);
  const k = run(`window.__cap`);
  R.ok('Karate-only invoice amount = 400 (Swimming excluded)', k && k.amount === 400, 'amt=' + (k && k.amount));
  R.ok('paid attributed proportionally = 200 (500 × 400/1000)', k && k.amountPaid === 200, 'paid=' + (k && k.amountPaid));
  R.ok('only the Karate line is present', k && k.lineItems.length === 1 && k.lineItems[0].sport === 'Karate');
}

R.section('v6.523 — a package whose linked invoice was VOIDED exports from the sub, not other packages');
{
  const ctx = H.makeCtx({ today: '2026-08-25', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  // Three 120 Kick Boxing sessions; the 3rd invoice (INV3) is deleted but its sub is still active+paid.
  run(`
    state.coaches=[{id:11,name:'Aziz',rate:30,role:'coach',active:true}];
    state.members=[{id:7,name:'Kayed',sport:'Kick Boxing',coachId:11,expiryDate:'2026-09-21',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:11,classes:1,price:120}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:11,totalClasses:1,start:'2026-08-04',end:'2026-09-03',status:'active',amountPaid:120,invoiceNumber:'INV1',_sid:'a'},
        {activity:'Kick Boxing',coachId:11,totalClasses:1,start:'2026-08-11',end:'2026-09-10',status:'active',amountPaid:120,invoiceNumber:'INV2',_sid:'b'},
        {activity:'Kick Boxing',coachId:11,totalClasses:1,start:'2026-08-22',end:'2026-09-21',status:'active',amountPaid:120,invoiceNumber:'INV3',_sid:'c'}
      ]}];
    state.invoices=[
      {id:1,ref:'INV1',customerId:7,category:'Membership',date:'2026-08-04',month:'2026-08',amount:120,coachId:11,lineItems:[{sport:'Kick Boxing',coachId:11,classes:1,price:120}],payments:[{amount:120}]},
      {id:2,ref:'INV2',customerId:7,category:'Membership',date:'2026-08-11',month:'2026-08',amount:120,coachId:11,lineItems:[{sport:'Kick Boxing',coachId:11,classes:1,price:120}],payments:[{amount:120}]},
      {id:3,ref:'INV3',customerId:7,deleted:true,category:'Membership',date:'2026-08-22',month:'2026-08',amount:120,coachId:11,lineItems:[{sport:'Kick Boxing',coachId:11,classes:1,price:120}],payments:[{amount:120}]}
    ];
    window.__cap=null; window.printInvoicePDF=function(id){ window.__cap=state.invoices.find(x=>x.id===id); };
  `);
  run(`printMemberSubInvoicePDF(7,'c')`);
  const c = run(`window.__cap`);
  R.ok('the voided-invoice package exports 120 (its own), NOT 240 (the two live ones)', c && c.amount === 120, 'amt=' + (c && c.amount));
  R.ok('it is a single 1-class line', c && c.lineItems.length === 1 && c.lineItems[0].classes === 1);
  run(`printMemberSubInvoicePDF(7,'a')`);
  R.ok('a package with a LIVE invoice still exports its own 120', run(`window.__cap`).amount === 120);
}

R.section('v6.523 — Get Invoice label counts packages, not "sports"');
R.ok('the multi label says "packages" (not "sports")', /Get Invoice \(\$\{memberInvs\.length\} packages\)/.test(src) && !/Get Invoice \(\$\{memberInvs\.length\} sports\)/.test(src));

R.done();
