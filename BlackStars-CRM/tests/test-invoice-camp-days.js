// v6.454 — an invoice's printed Qty (camp "days" / sport "classes") must come from ITS OWN line,
// linked to ITS OWN subscription — not the member's most recent package. Reported: Hossam & Tamim
// Awadalla — every Summer Camp invoice printed "12 days" (the latest sub) instead of the invoice's
// real count (July=22, June=7). Root cause: the ad-hoc lookup fell back to subscriptions.slice(-1)
// when sub.invoiceNumber was out of sync with the invoice ref. Fixed with findSubForLine + li.classes.
const H = require('./qc-harness.js');
const R = H.reporter('INVOICE PDF · per-invoice camp days (no latest-sub bleed)');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.settings = state.settings || {};
    state.members = [{
      id: 1, name: 'Hossam Awadalla', sport: 'Summer Camp', status: 'Active',
      subscriptions: [
        { _sid:'j1', activity:'Summer Camp', totalClasses:7,  start:'2026-06-14', end:'2026-06-18', invoiceNumber:'INV638876', durationLabel:'1 week' },
        { _sid:'j2', activity:'Summer Camp', totalClasses:22, start:'2026-07-05', end:'2026-08-03', invoiceNumber:'INV639111', durationLabel:'1 month' },  // ref OUT OF SYNC (real inv is INV639107)
        { _sid:'a1', activity:'Summer Camp', totalClasses:12, start:'2026-08-05', end:'2026-09-03', invoiceNumber:'INV946368', durationLabel:'Custom' }     // ref OUT OF SYNC (real inv is INV946371)
      ]
    }];
    state.invoices = [
      { id:101, ref:'INV638876', customerId:1, category:'Membership', date:'2026-06-14', month:'2026-06', amount:400, lineItems:[{ sport:'Summer Camp', classes:7,  price:400, billMonth:'2026-06' }] },
      { id:102, ref:'INV639107', customerId:1, category:'Membership', date:'2026-07-05', month:'2026-07', amount:1400, lineItems:[{ sport:'Summer Camp', classes:22, price:1400, billMonth:'2026-07' }] },
      { id:103, ref:'INV946371', customerId:1, category:'Membership', date:'2026-08-05', month:'2026-08', amount:713, lineItems:[{ sport:'Summer Camp', classes:12, price:713, billMonth:'2026-08' }] }
    ];
    state.coaches = [];
  `);
}

// Replicate the FIXED invoice-line count/period derivation (findSubForLine + li.classes primary).
function derive(ctx, invId) {
  return run(ctx, `(function(){
    var inv = state.invoices.find(i=>i.id===${invId});
    var m = state.members[0];
    var li = inv.lineItems[0];
    var sub = findSubForLine(m, inv, li);
    var count = parseInt(li.classes) || (sub?parseInt(sub.totalClasses):0) || 1;
    return { count: count, start: sub&&sub.start, end: sub&&sub.end };
  })()`);
}

R.section('each invoice prints ITS OWN count — not the latest package (12)');
{
  const ctx = H.makeCtx({ role:'admin', today:'2026-08-05' }); seed(ctx);
  const june = derive(ctx, 101), july = derive(ctx, 102), aug = derive(ctx, 103);
  R.ok('June invoice → 7 days (not 12)', june.count === 7, JSON.stringify(june));
  R.ok('July invoice → 22 days (not 12)', july.count === 22, JSON.stringify(july));
  R.ok('Aug invoice → 12 days', aug.count === 12, JSON.stringify(aug));
  R.ok('July period is July’s window, not August’s', july.start === '2026-07-05' && july.end === '2026-08-03', JSON.stringify(july));
  R.ok('June period is June’s window', june.start === '2026-06-14', JSON.stringify(june));
}

R.section('source: the invoice PDF uses findSubForLine + prefers the line’s own classes');
{
  const src = H.readSrc();
  R.ok('printInvoicePDF links the line via findSubForLine', /findSubForLine\(matchedMember, inv, li\)/.test(src));
  R.ok('the count prefers li.classes over the sub total', /count = parseInt\(li\.classes\) \|\| \(subAny \? parseInt\(subAny\.totalClasses\) : 0\)/.test(src));
  R.ok('the old latest-sub fallback for the count is gone', !/count = parseInt\(subAny\.totalClasses\) \|\| parseInt\(li\.classes\)/.test(src));
}

R.section('COMBINED invoice ("Get Invoice (N sports)") — each line keeps its OWN period (v6.456)');
{
  // The combined generator must resolve each line against ITS SOURCE invoice and carry _period,
  // and the renderer must PREFER li._period (a combined invoice has one date for many same-sport
  // packages, so re-deriving would map every line to the latest). Reported: Hossam Awadalla — all
  // 4 Summer Camp lines printed "05 Aug → 03 Sept".
  const src = H.readSrc();
  R.ok('printMemberInvoicePDF resolves each source line via findSubForLine(m, iv, li)', /const _sub = findSubForLine\(m, iv, li\);/.test(src));
  R.ok('and carries the resolved period on the combined line (_period)', /lineItems\.push\(\{[\s\S]{0,200}_period \}\)/.test(src));
  R.ok('the renderer PREFERS the line’s own _period', /if \(li\._period && \(li\._period\.start \|\| li\._period\.end\)\) \{/.test(src));

  // Behavioural: 4 same-sport packages with MISMATCHED sub.invoiceNumber → 4 distinct periods.
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-05' });
  const run = (s) => H.vm.runInContext(s, ctx);
  run(`
    state.members = [{ id:264, name:'Hossam', sport:'Summer Camp', status:'Active', subscriptions:[
      {activity:'Summer Camp',totalClasses:7, start:'2026-06-14',end:'2026-06-18',invoiceNumber:'INV638876'},
      {activity:'Summer Camp',totalClasses:7, start:'2026-06-21',end:'2026-06-25',invoiceNumber:'INV638955'},
      {activity:'Summer Camp',totalClasses:22,start:'2026-07-05',end:'2026-08-03',invoiceNumber:'INV639111'},
      {activity:'Summer Camp',totalClasses:12,start:'2026-08-05',end:'2026-09-03',invoiceNumber:'INV946368'} ]}];
    state.invoices = [
      {id:1,ref:'INV638876',customerId:264,category:'Membership',date:'2026-06-14',month:'2026-06',amount:400,lineItems:[{sport:'Summer Camp',classes:7,price:400,billMonth:'2026-06'}]},
      {id:2,ref:'INV638955',customerId:264,category:'Membership',date:'2026-06-21',month:'2026-06',amount:400,lineItems:[{sport:'Summer Camp',classes:7,price:400,billMonth:'2026-06'}]},
      {id:3,ref:'INV639107',customerId:264,category:'Membership',date:'2026-07-05',month:'2026-07',amount:1400,lineItems:[{sport:'Summer Camp',classes:22,price:1400,billMonth:'2026-07'}]},
      {id:4,ref:'INV946371',customerId:264,category:'Membership',date:'2026-08-05',month:'2026-08',amount:713,lineItems:[{sport:'Summer Camp',classes:12,price:713,billMonth:'2026-08'}]} ];
    state.coaches = [];
  `);
  const periods = run(`(function(){
    var m = state.members[0];
    return state.invoices.map(function(iv){ var sub = findSubForLine(m, iv, iv.lineItems[0]); return sub ? (sub.start + '->' + subscriptionValidEnd(sub)) : 'none'; });
  })()`);
  const distinct = new Set(periods);
  R.ok('all 4 source lines resolve to DISTINCT periods (not all the latest)', distinct.size === 4, JSON.stringify(periods));
  R.ok('the July line resolves to July (05 Jul), not August', periods[2].indexOf('2026-07-05') === 0, periods[2]);
  R.ok('the two June packages disambiguate by exact date (14 Jun vs 21 Jun)', periods[0].indexOf('2026-06-14') === 0 && periods[1].indexOf('2026-06-21') === 0, JSON.stringify([periods[0], periods[1]]));
}

R.done();
