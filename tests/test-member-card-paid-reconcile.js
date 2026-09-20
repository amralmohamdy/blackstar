// v6.585 — the member-card "Paid" column is sourced from the INVOICE LINES (source of truth), assigned
// one line per subscription, so a switch that left sub.amountPaid stale can't make the rows disagree
// with the invoice-based header. Real case: Ezz El-Din — header (invoice) 1,837.5 but the rows summed to
// 1,725 because the MMA→Riahi sub still stored 150 while its invoice line was 262.5.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.585 · member-card Paid reconciles with invoices');
const src = H.readSrc('app.js');

R.section('source');
R.ok('memberSubPaidMap is defined + reads invoice lines', /function memberSubPaidMap\(m, allSubs\)/.test(src) && /category \|\| 'Membership'\) === 'Membership' && !i\.switchCredit/.test(src));
R.ok('each line is consumed once (used flag)', /const take = pred => \{ const e = pool\.find\(p => !p\.used/.test(src));

R.section('runtime — Ezz El-Din reproduction');
{
  const ctx = H.makeCtx({ today: '2026-09-20' });
  const run = s => vm.runInContext(s, ctx);
  const AZIZ = 1786021158730811, ABDEL = 1, RIAHI = 1788353044643809;
  run(`
    state.members = [{ id: 100, name: 'Ezz El-Din', subscriptions: [
      { activity:'Kick Boxing', coach:'Aziz', coachId:${AZIZ}, start:'2026-09-15', end:'2026-10-15', status:'active', totalClasses:8, amountPaid:375, invoiceNumber:'INV986726' },
      { activity:'MMA', coach:'Riahi', coachId:${RIAHI}, start:'2026-09-15', end:'2026-10-15', status:'active', totalClasses:8, amountPaid:400, invoiceNumber:'INV986726' },
      { activity:'MMA', coach:'Riahi', coachId:${RIAHI}, start:'2026-09-06', end:'2026-09-15', status:'active', totalClasses:3, amountPaid:150 },
      { activity:'Kick Boxing', coach:'Aziz', coachId:${AZIZ}, start:'2026-08-16', end:'2026-09-15', status:'active', totalClasses:8, amountPaid:350, invoiceNumber:'INV986646' },
      { activity:'MMA', coach:'Abdel Salam', coachId:${ABDEL}, start:'2026-08-16', end:'2026-09-15', status:'completed', totalClasses:5, amountPaid:250, invoiceNumber:'INV986647', switchedAwayTo:'MMA' },
      { activity:'Kick Boxing', coach:'Abdel Salam', coachId:${ABDEL}, start:'2026-08-16', end:'2026-08-30', status:'active', totalClasses:4, amountPaid:200, invoiceNumber:'INV986648' }
    ]}];
    state.invoices = [
      { id:986646, ref:'INV986646', customerId:100, category:'Membership', amount:350, lineItems:[{sport:'Kick Boxing',coach:'Aziz',coachId:${AZIZ},price:350}], payments:[{amount:350}] },
      { id:986647, ref:'INV986647', customerId:100, category:'Membership', amount:512.5, lineItems:[{sport:'MMA',coach:'Abdel Salam',coachId:${ABDEL},price:250},{sport:'MMA',coach:'Riahi',coachId:${RIAHI},price:262.5}], payments:[{amount:350},{amount:88},{amount:262},{amount:138},{amount:-325.5}] },
      { id:986648, ref:'INV986648', customerId:100, category:'Membership', amount:200, lineItems:[{sport:'Kick Boxing',coach:'Abdel Salam',coachId:${ABDEL},price:200}], payments:[{amount:200}] },
      { id:986726, ref:'INV986726', customerId:100, category:'Membership', amount:775, lineItems:[{sport:'Kick Boxing',coach:'Aziz',coachId:${AZIZ},price:375},{sport:'MMA',coach:'Riahi',coachId:${RIAHI},price:400}], payments:[{amount:637.5},{amount:137.5}] }
    ];
  `);
  // Header (invoice-based) — what the card's PAID tile / memberMembershipPaid shows.
  const header = run(`memberMembershipPaid(100)`);
  R.ok('invoice-based header = 1837.5', Math.round(header * 100) / 100 === 1837.5, header);

  // Rows via the new map (mirrors viewMember: allSubs sorted by start desc).
  const rowSum = run(`(() => {
    const m = state.members[0];
    const allSubs = (m.subscriptions||[]).slice().sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    const map = memberSubPaidMap(m, allSubs);
    return allSubs.reduce((t,s)=> t + (map.has(s) ? map.get(s) : (Number(s.amountPaid)||0)), 0);
  })()`);
  R.ok('row Paid now sums to 1837.5 (was 1725) → reconciles with header', Math.round(rowSum * 100) / 100 === 1837.5, rowSum);

  const riahiEarly = run(`(() => {
    const m = state.members[0];
    const allSubs = (m.subscriptions||[]).slice().sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    const map = memberSubPaidMap(m, allSubs);
    const sub = allSubs.find(s=>s.activity==='MMA'&&s.coach==='Riahi'&&s.start==='2026-09-06');
    return map.get(sub);
  })()`);
  R.ok('the stale MMA→Riahi row now shows its invoice line 262.5 (not 150)', riahiEarly === 262.5, riahiEarly);
}

R.section('runtime — a CLEAN member is unchanged (no invoices → falls back to amountPaid)');
{
  const ctx = H.makeCtx({ today: '2026-09-20' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.members = [{ id: 5, name: 'Simple', subscriptions:[{ activity:'Boxing', coach:'X', coachId:9, start:'2026-09-01', end:'2026-10-01', status:'active', totalClasses:8, amountPaid:500 }] }];
    state.invoices = [];
  `);
  const v = run(`(() => {
    const m = state.members[0];
    const map = memberSubPaidMap(m, m.subscriptions);
    return map.has(m.subscriptions[0]) ? map.get(m.subscriptions[0]) : (Number(m.subscriptions[0].amountPaid)||0);
  })()`);
  R.ok('no invoice → falls back to stored amountPaid (500)', v === 500, v);
}

R.done();
