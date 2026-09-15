// v6.435 — findSubForLine renewal disambiguation. When a member has TWO packages for the SAME
// sport+coach (a renewal), a line with no invoice-ref link used to match the FIRST (oldest) sub —
// so the renewal invoice attached to the OLD window and the coach was PAID TWICE over the old
// window's attendance while the renewal window earned nothing. The reported case: Adham Ragab,
// Kick Boxing, two 12-class packages (20 Jun→20 Jul, 20 Jul→19 Aug), 17 classes attended, was
// paid for 24. The fix picks the sub whose START matches the invoice date — so each package is
// counted once, over its own window.
const H = require('./qc-harness.js');
const R = H.reporter('COMMISSION · renewal sub attribution (no double-count)');
const run = (c, s) => H.vm.runInContext(s, c);

const ctx = H.makeCtx({ role: 'admin', today: '2026-08-01' });
run(ctx, `
  state.members = [{ id:305, name:'Adham', sport:'Kick Boxing', coachId:14, startDate:'2026-06-20', expiryDate:'2026-08-19', status:'Active',
    enrollments:[{sport:'Kick Boxing',coachId:14,classes:12,price:500,start:'2026-07-20'}],
    subscriptions:[
      {activity:'Kick Boxing',coachId:14,totalClasses:12,start:'2026-06-20',end:'2026-07-20',status:'active'},
      {activity:'Kick Boxing',coachId:14,totalClasses:12,start:'2026-07-20',end:'2026-08-19',status:'active'}],
    dailyAttendance:{
      '2026-06':{'Kick Boxing':{'22':'Y','24':'Y','27':'Y','29':'Y'}},
      '2026-07':{'Kick Boxing':{'01':'Y','04':'Y','06':'Y','08':'Y','11':'Y','13':'Y','15':'Y','18':'Y','20':'Y','22':'Y','25':'Y','27':'Y','29':'Y'}} } }];
  state.coaches = [{ id:14, name:'Iyad', sports:['Kick Boxing'], rate:30 }];
  state.invoices = [
    { id:638941, ref:'INV638941', customerId:305, customerName:'Adham', category:'Membership', sport:'Kick Boxing', coachId:14, month:'2026-06', date:'2026-06-20', amount:475,
      lineItems:[{sport:'Kick Boxing',coachId:14,classes:12,price:475}], payments:[{amount:475}] },
    { id:946297, ref:'INV946297', customerId:305, customerName:'Adham', category:'Membership', sport:'Kick Boxing', coachId:14, month:'2026-07', date:'2026-07-20', amount:500,
      lineItems:[{sport:'Kick Boxing',coachId:14,classes:12,price:500}], payments:[{amount:500}] }];
`);

R.section('each invoice links to its OWN package (by start date), not the first one');
{
  const s1 = run(ctx, `(function(){const m=state.members[0];const s=findSubForLine(m,state.invoices[0],state.invoices[0].lineItems[0]);return s&&s.start;})()`);
  const s2 = run(ctx, `(function(){const m=state.members[0];const s=findSubForLine(m,state.invoices[1],state.invoices[1].lineItems[0]);return s&&s.start;})()`);
  R.ok('the June invoice (dated 20 Jun) → the 20 Jun package', s1 === '2026-06-20', s1);
  R.ok('the renewal invoice (dated 20 Jul) → the 20 Jul package (NOT the old one)', s2 === '2026-07-20', s2);
}

R.section('the coach is paid for what was attended per package — never twice');
{
  const cls = {};
  for (const mk of ['2026-06', '2026-07', '2026-08']) {
    const lines = JSON.parse(run(ctx, `JSON.stringify((computeAttendanceCommission(14,'${mk}').lines||[]).map(l=>({kind:l.kind,cls:l.classes,st:l.start,en:l.end})))`));
    for (const l of lines) { if (l.kind === 'attended' || l.kind === 'trueup') { const k = l.st + '|' + l.en; cls[k] = (cls[k] || 0) + (l.cls || 0); } }
  }
  const pkg1 = cls['2026-06-20|2026-07-20'] || 0;
  const pkg2 = cls['2026-07-20|2026-08-19'] || 0;
  R.ok('package 1 (20 Jun→20 Jul) paid its capped 12 classes', pkg1 === 12, pkg1);
  R.ok('package 2 (renewal) paid its 5 attended classes', pkg2 === 5, pkg2);
  R.ok('total paid classes = 17 (his actual attendance), not 24', pkg1 + pkg2 === 17, { pkg1, pkg2 });
  R.ok('no package is paid beyond its 12-class limit', pkg1 <= 12 && pkg2 <= 12, { pkg1, pkg2 });
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('findSubForLine disambiguates renewals by invoice date', /RENEWAL DISAMBIGUATION/.test(src) && /cands\.find\(s => String\(s\.start \|\| ''\)\.slice\(0, 10\) === invDate\)/.test(src));
}

R.done();
