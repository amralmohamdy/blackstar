// v6.586 — the Member Money Panel ignored NON-MEMBERSHIP invoices (Product / Court Rental / Boxing
// Room). A member who owed on a product had no row to collect against, so "Collect" misrouted the money
// onto a membership invoice (overpaying it) while the product stayed due. Real case: Ahmad Elhassanein —
// MMA membership 150/150 (paid) + Product 245/225 (20 due). The panel now lists the product and routes
// the collect to it.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.586 · money panel collects non-membership dues');
const src = H.readSrc();

R.section('source');
R.ok('_memberMoneyRows gathers non-membership invoices', /const otherInvs = \(state\.invoices \|\| \[\]\)\.filter\(i => !i\.deleted && i\.customerId === memberId\s*\n?\s*&& \(i\.category \|\| 'Membership'\) !== 'Membership'/.test(src));
R.ok('non-membership balances fold into Charged/Paid/Due', /charged: Math\.round\(\(charged \+ otherCharged\)/.test(src) && /due: Math\.round\(\(due \+ otherDue\)/.test(src));

R.section('runtime — Ahmad Elhassanein (MMA paid + Product 20 due)');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings = state.settings || {};
    state.members = [{ id: 50, name: 'Ahmad Elhassanein', subscriptions: [
      { activity:'MMA', coach:'Abdel Salam', coachId:1, start:'2026-08-16', end:'2026-09-15', status:'active', totalClasses:8, amountPaid:150, invoiceNumber:'INV986611' }
    ]}];
    state.invoices = [
      { id:986611, ref:'INV986611', customerId:50, category:'Membership', amount:150, lineItems:[{sport:'MMA',coach:'Abdel Salam',coachId:1,price:150}], payments:[{amount:150,method:'fawran',date:'2026-08-20'}] },
      { id:986613, ref:'INV986613', customerId:50, category:'Product', amount:245, payments:[{amount:225,method:'card',date:'2026-08-22'}] }
    ];
  `);
  const md = run(`_memberMoneyRows(state.members[0])`);
  R.ok('panel Charged = 395 (150 + 245)', Math.round(md.charged) === 395, md.charged);
  R.ok('panel Paid = 375 (150 + 225)', Math.round(md.paid ?? md.paidTotal) === 375, md.paidTotal);
  R.ok('panel Due = 20 (the product balance)', Math.round(md.due) === 20, md.due);
  R.ok('Charged = Paid + Due (reconciles)', Math.abs(md.charged - (md.paidTotal + md.due)) < 0.02);
  const prodRow = md.rows.find(r => r.nonMembership);
  R.ok('a Product row is present with remaining 20', !!prodRow && Math.round(prodRow.remaining) === 20, prodRow && prodRow.remaining);
  R.ok('the collect target is the PRODUCT invoice (not the paid MMA)', (() => {
    const target = md.rows.find(g => g.remaining > 0.001) || md.rows[0];
    return target && target.invId === 986613;
  })());

  // Simulate the collect: 20 onto the target (product) invoice via the SAME append-only primitive.
  run(`(() => {
    const m = state.members[0];
    const { rows } = _memberMoneyRows(m);
    const target = rows.find(g => g.remaining > 0.001) || rows[0];
    const inv = state.invoices.find(i => i.id === target.invId);
    recordPayment(inv, { amount: 20, method: 'card', date: '2026-09-20', sport: target.sport });
  })()`);
  const after = run(`_memberMoneyRows(state.members[0])`);
  R.ok('after collecting 20: Due = 0', Math.round(after.due) === 0, after.due);
  R.ok('the MMA membership invoice was NOT overpaid (still 150 paid)', run(`invoicePaid(state.invoices.find(i=>i.id===986611))`) === 150);
  R.ok('the product invoice is now fully paid (245)', run(`invoicePaid(state.invoices.find(i=>i.id===986613))`) === 245);
  R.ok('the member drops off the Due list (memberOutstanding membership=0 AND no product balance)', (() => {
    const memb = run(`memberOutstanding(50)`);
    const prodBal = run(`invoiceBalance(state.invoices.find(i=>i.id===986613))`);
    return Math.round(memb) === 0 && Math.round(prodBal) === 0;
  })());
}

R.done();
