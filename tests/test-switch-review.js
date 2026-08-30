// v6.541 — Switched-member review + paid-but-uninvoiced repair. A coach leaving the club (Iyad→Abdel
// Salam done MANUALLY, Mostafa→Zakaria done via the Switch tool) left students the switch tools couldn't
// surface, and one member paid for a sport (MMA 500) whose money landed on ANOTHER invoice as an
// overpayment, with no invoice/sub for that sport. This adds: a read-only coach-change review (tagged +
// manual) and a money-conserving, append-only repair that creates the missing invoice + subscription and
// RELOCATES the misplaced payment (−correction on the source, +payment on the new invoice).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.541 · switched-member review + uninvoiced repair');
const src = H.readSrc();

R.section('source');
R.ok('detectors exist', /function _coachChangeReview\(\)/.test(src) && /function _paidUninvoicedSports\(\)/.test(src) && /function _repairPaidUninvoiced\(memberId, sport\)/.test(src));
R.ok('the repair relocates money append-only (−correction on source)', /amount: -price,[\s\S]{0,160}?_correction: true/.test(src) && /src\.payments = src\.payments \|\| \[\]\)\.push/.test(src));
R.ok('the review modal + repair action exist', /window\.reviewSwitchedMembers = function/.test(src) && /window\._repairUninvoicedUI = function/.test(src));
R.ok('a backup is downloaded before the repair', /_repairUninvoicedUI[\s\S]{0,400}?downloadBackup\(\)/.test(src));
R.ok('the Invoice Integrity page has a Switch-review button', /id="ic-switchreview"/.test(src) && /reviewSwitchedMembers\(\)/.test(src));

R.section('runtime');
{
  const ctx = H.makeCtx({ today: '2026-08-30', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.coaches=[{id:1,name:'Abdel Salam',rate:30},{id:14,name:'Iyad',rate:30},{id:3,name:'Mostafa',rate:30},{id:9,name:'Zakaria',rate:30}];
    state.members=[
      // Ali-like: MMA enrolled + paid, but the 500 sits on the KB invoice; also a MANUAL Iyad→Abdel KB change
      {id:1,name:'Ali',expiryDate:'2026-09-11',status:'Active',
        enrollments:[{sport:'Kick Boxing',coachId:1,classes:4,price:166.67,start:'2026-08-01',validity:6},{sport:'MMA',coachId:1,classes:12,price:500,start:'2026-08-31',validity:30}],
        subscriptions:[
          {activity:'Kick Boxing',coachId:14,start:'2026-07-08',end:'2026-08-07',totalClasses:7,amountPaid:291.67,status:'completed',invoiceNumber:'K1'},
          {activity:'Kick Boxing',coachId:1,start:'2026-08-12',end:'2026-09-11',totalClasses:12,amountPaid:500,status:'active',invoiceNumber:'K2'}
        ]},
      // TAGGED switch (Mostafa→Zakaria Karate)
      {id:2,name:'Saad',expiryDate:'2026-10-01',status:'Active',
        enrollments:[{sport:'Karate',coachId:9,classes:12,price:300,start:'2026-08-12',validity:30}],
        subscriptions:[
          {activity:'Karate',coachId:3,start:'2026-07-01',end:'2026-08-01',totalClasses:8,amountPaid:200,status:'completed',switchedAwayTo:'Karate',invoiceNumber:'S1'},
          {activity:'Karate',coachId:9,start:'2026-08-12',end:'2026-09-11',totalClasses:12,amountPaid:300,status:'active',switchedFrom:'Karate',invoiceNumber:'S2'}
        ]}
    ];
    state.invoices=[
      {id:101,ref:'K1',customerId:1,category:'Membership',date:'2026-07-08',month:'2026-07',amount:458.34,amountPaid:958.34,
        lineItems:[{sport:'Kick Boxing',coachId:14,price:291.67},{sport:'Kick Boxing',coachId:1,price:166.67}],
        payments:[{amount:458.34,date:'2026-07-08',method:'cash'},{amount:500,date:'2026-08-29',method:'cash'}]},
      {id:102,ref:'K2',customerId:1,category:'Membership',date:'2026-08-12',month:'2026-08',amount:500,amountPaid:500,lineItems:[{sport:'Kick Boxing',coachId:1,price:500}],payments:[{amount:500,date:'2026-08-12',method:'cash'}]},
      {id:201,ref:'S1',customerId:2,category:'Membership',date:'2026-07-01',month:'2026-07',amount:200,amountPaid:200,lineItems:[{sport:'Karate',coachId:3,price:200}],payments:[{amount:200,date:'2026-07-01',method:'cash'}]},
      {id:202,ref:'S2',customerId:2,category:'Membership',date:'2026-08-12',month:'2026-08',amount:300,amountPaid:300,lineItems:[{sport:'Karate',coachId:9,price:300}],payments:[{amount:300,date:'2026-08-12',method:'cash'}]}
    ];
  `);

  R.ok('paid-but-uninvoiced finds ONLY the MMA case', run(`_paidUninvoicedSports().length`) === 1 && run(`_paidUninvoicedSports()[0].sport`) === 'MMA');
  R.ok('  sourced from the overpaid KB invoice (500 on K1)', run(`_paidUninvoicedSports()[0].srcRef`) === 'K1' && run(`_paidUninvoicedSports()[0].excess`) === 500);
  const cc = run(`_coachChangeReview().map(c=>c.sport+':'+(c.tagged?'tagged':'manual'))`);
  R.ok('coach-change review classifies manual (Ali KB) + tagged (Saad Karate)', cc.includes('Kick Boxing:manual') && cc.includes('Karate:tagged'));

  R.section('runtime — the repair is money-conserving & append-only');
  const beforeOut = run(`memberOutstanding(1)`);
  const beforeRows = run(`state.invoices.find(i=>i.ref==='K1').payments.length`);
  const beforeInvN = run(`state.invoices.length`);
  const res = run(`_repairPaidUninvoiced(1,'MMA')`);
  R.ok('it created a new invoice + moved 500', res && res.moved === 500 && res.from === 'K1');
  R.ok('a new invoice was ADDED', run(`state.invoices.length`) === beforeInvN + 1);
  R.ok('source K1 overpayment removed via appended −correction (rows +1, none deleted)', run(`state.invoices.find(i=>i.ref==='K1').payments.length`) === beforeRows + 1 && Math.round(run(`invoicePaid(state.invoices.find(i=>i.ref==='K1'))`) * 100) / 100 === 458.34);
  R.ok('new MMA invoice is 500/500', Math.round(run(`(function(){var i=state.invoices.find(x=>x.ref==='${res.ref}');return invoiceTotal(i);})()`)) === 500 && Math.round(run(`invoicePaid(state.invoices.find(x=>x.ref==='${res.ref}'))`)) === 500);
  R.ok('an MMA subscription now exists', run(`state.members.find(m=>m.id===1).subscriptions.filter(s=>s.activity==='MMA').length`) === 1);
  R.ok('member outstanding UNCHANGED (no money created or lost)', run(`memberOutstanding(1)`) === beforeOut);
  R.ok('the case no longer flags (repair is idempotent)', run(`_paidUninvoicedSports().filter(x=>x.memberId===1).length`) === 0);
}

R.done();
