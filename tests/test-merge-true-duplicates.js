// v6.613 — the Consolidate/Merge tool must flag ONLY true duplicates (same date + amount + sport(s)).
// Two membership invoices on DIFFERENT dates are legitimate separate/renewal invoices — never flagged.
// Merge is scoped to the duplicate group, so a legit renewal is never folded in.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.613 · merge true duplicates only');

function setup(extra) {
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  vm.runInContext(`
    state.invoices = [];
    state.members = state.members.filter(m => m.id === 101);
    ${extra}
  `, ctx);
  return ctx;
}

R.section('different-date invoices (a renewal) are NOT flagged');
{
  const ctx = setup(`
    state.invoices.push({ id:1, ref:'INV639039', customerId:101, category:'Membership', sport:'Swimming', date:'2026-06-27', month:'2026-06', amount:430, amountPaid:430, lineItems:[{sport:'Swimming',price:430}], payments:[{date:'2026-06-27',amount:430,method:'cash'}] });
    state.invoices.push({ id:2, ref:'INV986654', customerId:101, category:'Membership', sport:'Swimming', date:'2026-09-03', month:'2026-09', amount:430, amountPaid:430, lineItems:[{sport:'Swimming',price:430}], payments:[{date:'2026-09-03',amount:430,method:'cash'}] });
  `);
  const flagged = vm.runInContext(`findMembersWithMergeableInvoices().length`, ctx);
  R.ok('a same-amount, DIFFERENT-date renewal is NOT flagged', flagged === 0, 'flagged=' + flagged);
}

R.section('same date + amount + sport IS flagged as a duplicate');
{
  const ctx = setup(`
    state.invoices.push({ id:1, ref:'INV1', customerId:101, category:'Membership', sport:'Swimming', date:'2026-06-27', month:'2026-06', amount:430, amountPaid:430, lineItems:[{sport:'Swimming',price:430}], payments:[{date:'2026-06-27',amount:430,method:'cash'}] });
    state.invoices.push({ id:2, ref:'INV2', customerId:101, category:'Membership', sport:'Swimming', date:'2026-06-27', month:'2026-06', amount:430, amountPaid:0, lineItems:[{sport:'Swimming',price:430}], payments:[] });
  `);
  const res = vm.runInContext(`(function(){ const g = findMembersWithMergeableInvoices(); return { n:g.length, ids: g[0] && g[0].ids }; })()`, ctx);
  R.ok('a same-date/amount/sport pair IS flagged', res.n === 1 && res.ids && res.ids.length === 2, JSON.stringify(res));
}

R.section('merge is scoped to the duplicate group (renewal left intact)');
{
  // member has a duplicate pair (id 1 & 2, same day) PLUS a legit later renewal (id 3, different day).
  const ctx = setup(`
    state.invoices.push({ id:1, ref:'INV1', customerId:101, category:'Membership', sport:'Swimming', date:'2026-06-27', month:'2026-06', amount:430, amountPaid:430, lineItems:[{sport:'Swimming',price:430}], payments:[{date:'2026-06-27',amount:430,method:'cash'}] });
    state.invoices.push({ id:2, ref:'INV2', customerId:101, category:'Membership', sport:'Swimming', date:'2026-06-27', month:'2026-06', amount:430, amountPaid:0, lineItems:[{sport:'Swimming',price:430}], payments:[] });
    state.invoices.push({ id:3, ref:'INV3', customerId:101, category:'Membership', sport:'Swimming', date:'2026-09-03', month:'2026-09', amount:430, amountPaid:430, lineItems:[{sport:'Swimming',price:430}], payments:[{date:'2026-09-03',amount:430,method:'cash'}] });
  `);
  const res = vm.runInContext(`
    (function(){
      const g = findMembersWithMergeableInvoices();
      const kept = mergeMemberInvoices(101, g[0].ids);   // merge only the flagged duplicate group
      const live = state.invoices.filter(i => !i.deleted).map(i => i.id).sort();
      const renewal = state.invoices.find(i => i.id === 3);
      return { flaggedGroups: g.length, keptId: kept && kept.id, live, renewalIntact: !renewal.deleted };
    })()
  `, ctx);
  R.ok('only ONE duplicate group flagged (the renewal is not)', res.flaggedGroups === 1, JSON.stringify(res));
  R.ok('merge kept the oldest duplicate (id 1) + archived id 2', res.keptId === 1 && !res.live.includes(2), JSON.stringify(res));
  R.ok('the different-date renewal (id 3) is LEFT INTACT', res.renewalIntact === true && res.live.includes(3), JSON.stringify(res));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('detector groups by date+amount+sport dup-key', /function _invDupKey\(inv\)/.test(src) && /if \(g\.length < 2\) continue;/.test(src));
  R.ok('merge accepts a restrict-ids set', /function mergeMemberInvoices\(memberId, restrictIds\)/.test(src));
  R.ok('button passes the duplicate ids', /mergeMemberInvoicesUI\(\$\{d\.member\.id\}, \[\$\{\(d\.ids/.test(src));
}

R.done();
