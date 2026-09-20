// v6.589 — the Due Payment "owes for" chip summed each invoice's floored balance, so an overpayment on
// one invoice couldn't offset a due on another and the chip disagreed with the member-netted DUE column.
// Real case: Ohood — both payments (250+250=500) landed on the JULY Kick Boxing invoice (overpaid 175),
// August (325) unpaid; DUE nets to 150 but the chip showed 325. The chip now nets membership sports the
// same way, so it reads 150 and matches DUE.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.589 · due chip nets to match the DUE column');
const src = H.readSrc();

R.section('source');
R.ok('no-filter view nets membership sports (charged − paid) for the chip', /const chg = \{\}, pd = \{\};[\s\S]{0,900}chg\[sp\] = \(chg\[sp\] \|\| 0\) \+ price;[\s\S]{0,160}pd\[sp\] = \(pd\[sp\] \|\| 0\) \+ \(gross > 0 \? paid \* \(price \/ gross\) : 0\)/.test(src));
R.ok('a month-filtered view stays per-invoice', /if \(f\.months\.length\) \{[\s\S]{0,400}bySport\[sp\] = \(bySport\[sp\] \|\| 0\) \+ bal;/.test(src));

R.section('runtime — Ohood (July overpaid, August unpaid) nets to 150');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.members = [{ id: 70, name: 'Ohood', subscriptions: [
      { activity:'Kick Boxing', coach:'Aya', coachId:5, start:'2026-07-15', end:'2026-08-14', status:'active', totalClasses:6, amountPaid:325, invoiceNumber:'INV946307' },
      { activity:'Kick Boxing', coach:'Aya', coachId:5, start:'2026-08-16', end:'2026-09-15', status:'completed', totalClasses:6, amountPaid:325, invoiceNumber:'INV986588' }
    ]}];
    state.invoices = [
      { id:946307, ref:'INV946307', customerId:70, category:'Membership', month:'2026-07', amount:325, lineItems:[{sport:'Kick Boxing',price:325,classes:6,coach:'Aya'}], payments:[{amount:250,method:'fawran',date:'2026-07-18'},{amount:250,method:'fawran',date:'2026-08-11'}] },
      { id:986588, ref:'INV986588', customerId:70, category:'Membership', month:'2026-08', amount:325, amountPaid:0, lineItems:[{sport:'Kick Boxing',price:325,classes:12,coach:'Aya'}], payments:[] }
    ];
  `);
  R.ok('member-netted DUE (memberOutstanding) = 150', Math.round(run(`memberOutstanding(70)`)) === 150, run(`memberOutstanding(70)`));
  // Replicate the v6.589 no-filter per-sport net the chip uses.
  const kbNet = run(`(() => {
    const invs = state.invoices.filter(i => !i.deleted && i.customerId === 70 && !i.switchCredit);
    const chg = {}, pd = {};
    for (const inv of invs) {
      if (inv.amountPaid == null && !(Array.isArray(inv.payments) && inv.payments.length)) continue;
      const lines = (inv.lineItems&&inv.lineItems.length)?inv.lineItems:[{sport:inv.sport,price:inv.amount||0}];
      const gross = lines.reduce((a,l)=>a+Math.max(0,Number(l.price)||0),0)||(Number(inv.amount)||0);
      const paid = invoicePaid(inv);
      for (const l of lines) { const sp=l.sport||'Other'; const price=Math.max(0,Number(l.price)||0); chg[sp]=(chg[sp]||0)+price; pd[sp]=(pd[sp]||0)+(gross>0?paid*(price/gross):0); }
    }
    return Math.round((chg['Kick Boxing']-(pd['Kick Boxing']||0))*100)/100;
  })()`);
  R.ok('per-sport chip for Kick Boxing nets to 150 (was 325)', kbNet === 150, kbNet);
}

R.done();
