// v6.562 — a commission line for coach B must NEVER be credited via coach A's subscription. A stray/
// phantom line for the NEW coach left on the OLD coach's original invoice (a leftover from an old
// switch that split the wrong invoice) shares that invoice's ref. findSubForLine's coach-BLIND ref
// fallback then linked the new coach's line to the OLD coach's sub, so the new coach was credited for
// the old coach's attended classes — a PAST (pre-switch) month's commission moved to the new coach and
// a closed month's total changed. Real case: Kenan/Rashed, Abdel Salam → Aziz; Aziz got their AUGUST
// classes (taught by Abdel Salam). Fix: the coach-blind ref fallback applies ONLY to coach-less lines.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.562 · a coach line is never credited via another coach’s subscription');
const run = (c, s) => vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('coach-blind ref fallback is gated to coach-less lines', /\|\| \(li\.coachId == null \? subs\.find\(s => s\.invoiceNumber === inv\.ref && s\.activity === li\.sport\) : null\);/.test(src));
}

R.section('runtime — Abdel Salam → Aziz: Aziz must NOT get the pre-switch August classes');
{
  const ctx = H.makeCtx({ today: '2026-09-15', role: 'admin' });
  const res = run(ctx, `(function(){
    state.settings = { commissionBasis: 'attendance', commissionStartDate: '' };
    const ABDEL = 1, AZIZ = 1786021158730811;
    state.coaches = [{ id: ABDEL, name: 'Abdel Salam', rate: 30, role: 'coach', active: true },
                     { id: AZIZ, name: 'Aziz', rate: 30, role: 'coach', active: true }];
    state.members = [{ id: 500, name: 'Kenan', sport: 'Kick Boxing', coachId: AZIZ, expiryDate: '2026-11-04', status: 'Active',
      enrollments: [{ sport: 'Kick Boxing', coachId: AZIZ, classes: 12, price: 500, switchedInto: true }],
      subscriptions: [
        { activity: 'Kick Boxing', coachId: ABDEL, start: '2026-07-18', end: '2026-09-01', totalClasses: 13, status: 'completed', switchedAwayTo: 'Kick Boxing', switchedAt: '2026-09-05', invoiceNumber: 'INV-JUL' },
        { activity: 'Kick Boxing', coachId: AZIZ, start: '2026-09-05', end: '2026-11-04', totalClasses: 12, status: 'active', switchFunded: true, invoiceNumber: 'INV-SEP' }
      ],
      // 9 August classes (taught by Abdel Salam) + 2 September (taught by Aziz), all under the plain key.
      dailyAttendance: { '2026-08': { 'Kick Boxing': { '01':'Y','03':'Y','08':'Y','10':'Y','15':'Y','22':'Y','24':'Y','29':'Y','31':'Y' } },
                          '2026-09': { 'Kick Boxing': { '05':'Y','07':'Y' } } } }];
    state.invoices = [
      // Abdel Salam's ORIGINAL July invoice — plus a PHANTOM Aziz line (left by the old buggy switch).
      { id: 1, ref: 'INV-JUL', customerId: 500, category: 'Membership', date: '2026-07-18', month: '2026-07', amount: 1000, amountPaid: 1000,
        lineItems: [{ sport: 'Kick Boxing', coachId: ABDEL, price: 500, classes: 13 }, { sport: 'Kick Boxing', coachId: AZIZ, price: 500, classes: 0 }] },
      // Aziz's REAL September membership.
      { id: 2, ref: 'INV-SEP', customerId: 500, category: 'Membership', date: '2026-09-05', month: '2026-09', amount: 500, amountPaid: 500,
        lineItems: [{ sport: 'Kick Boxing', coachId: AZIZ, price: 500, classes: 12 }] }
    ];
    const azAug = computeMonthlyPay(AZIZ, '2026-08');
    const abAug = computeMonthlyPay(ABDEL, '2026-08');
    return { azAugBase: Math.round(azAug.commissionBase), abAugBase: Math.round(abAug.commissionBase) };
  })()`);
  R.ok('Aziz earns 0 for AUGUST (he did not teach the pre-switch classes)', res.azAugBase === 0, JSON.stringify(res));
  R.ok('Abdel Salam is credited for the August classes he taught (>0)', res.abAugBase > 0, JSON.stringify(res));
}

R.done();
