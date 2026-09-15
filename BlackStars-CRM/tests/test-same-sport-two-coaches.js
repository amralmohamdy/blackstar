// v6.504 — a member may enrol in the SAME sport under TWO different coaches (two independent
// subscriptions, two invoice lines, each coach earns their own commission). Guards:
//   • duplicateEnrollmentSport blocks only a TRUE duplicate (same sport AND same coach).
//   • syncSubToEnrollment is coach-aware (editing one coach's line never touches the other's).
//   • the edit reconcile uses row identity (change-coach updates the sub; +Add sport of an
//     existing sport becomes its own sub) — asserted at source.
//   • commission attributes each same-sport line to its own coach, money conserved.
const H = require('./qc-harness.js');
const R = H.reporter('v6.504 · same sport, two coaches');
const run = (c, s) => H.vm.runInContext(s, c);
const src = H.readSrc();

R.section('duplicateEnrollmentSport — coach-aware');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  const dup = (arr) => run(ctx, `duplicateEnrollmentSport(${JSON.stringify(arr)})`);
  R.ok('same sport, DIFFERENT coach → allowed (null)', dup([{ sport: 'Karate', coachId: 3 }, { sport: 'Karate', coachId: 7 }]) === null);
  R.ok('same sport, SAME coach → blocked', dup([{ sport: 'Karate', coachId: 3 }, { sport: 'Karate', coachId: 3 }]) === 'Karate');
  R.ok('different sports → allowed', dup([{ sport: 'Karate', coachId: 3 }, { sport: 'Football', coachId: 3 }]) === null);
  R.ok('two Summer Camps (no coach) still blocked', dup([{ sport: 'Summer Camp', coachId: null }, { sport: 'Summer Camp', coachId: null }]) === 'Summer Camp');
}

R.section('syncSubToEnrollment — only THIS coach\'s line changes');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  run(ctx, `
    state.coaches = [{id:3,name:'Mostafa',rate:30},{id:7,name:'Zakaria',rate:30}];
    state.invoices = [{ id:1, ref:'INV1', customerId:50, category:'Membership', activityType:'subscription',
      amount:350, amountPaid:350, payments:[{amount:350,method:'cash'}],
      lineItems:[ {sport:'Karate',coachId:3,coach:'Mostafa',price:200,classes:4},
                  {sport:'Karate',coachId:7,coach:'Zakaria',price:150,classes:3} ] }];
    state.members = [{ id:50, name:'Kid', subscriptions:[
      {activity:'Karate',coachId:3,coach:'Mostafa',totalClasses:4,amountPaid:200,invoiceNumber:'INV1',status:'active'},
      {activity:'Karate',coachId:7,coach:'Zakaria',totalClasses:3,amountPaid:150,invoiceNumber:'INV1',status:'active'} ]}];
  `);
  // edit Mostafa's Karate: price 200 -> 240, classes 4 -> 5
  run(ctx, `syncSubToEnrollment(state.members[0].subscriptions[0], {sport:'Karate',coachId:3,price:240,classes:5}, state.members[0], state.invoices)`);
  const mostafaLine = run(ctx, `JSON.stringify(state.invoices[0].lineItems.find(l=>String(l.coachId)==="3"))`);
  const zakariaLine = run(ctx, `JSON.stringify(state.invoices[0].lineItems.find(l=>String(l.coachId)==="7"))`);
  const mL = JSON.parse(mostafaLine), zL = JSON.parse(zakariaLine);
  R.ok('Mostafa line updated to 240 / 5cls', mL.price === 240 && mL.classes === 5, mostafaLine);
  R.ok('Zakaria line UNTOUCHED (150 / 3cls)', zL.price === 150 && zL.classes === 3, zakariaLine);
}

R.section('syncSubToEnrollment — changing ONE row\'s coach moves only its line');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  run(ctx, `
    state.coaches = [{id:3,name:'Mostafa',rate:30},{id:7,name:'Zakaria',rate:30},{id:9,name:'Ahmed',rate:30}];
    state.invoices = [{ id:1, ref:'INV1', customerId:50, category:'Membership',
      amount:350, lineItems:[ {sport:'Karate',coachId:3,price:200,classes:4},
                              {sport:'Karate',coachId:7,price:150,classes:3} ] }];
    state.members = [{ id:50, name:'Kid', subscriptions:[
      {activity:'Karate',coachId:3,totalClasses:4,amountPaid:200,invoiceNumber:'INV1',status:'active'},
      {activity:'Karate',coachId:7,totalClasses:3,amountPaid:150,invoiceNumber:'INV1',status:'active'} ]}];
  `);
  run(ctx, `syncSubToEnrollment(state.members[0].subscriptions[0], {sport:'Karate',coachId:9,price:200,classes:4}, state.members[0], state.invoices)`);
  const coaches = run(ctx, `JSON.stringify(state.invoices[0].lineItems.map(l=>l.coachId).sort())`);
  R.ok('Mostafa(3) line moved to Ahmed(9); Zakaria(7) intact', coaches === JSON.stringify([7, 9]), coaches);
  R.ok('the sub itself moved to Ahmed(9)', run(ctx, `String(state.members[0].subscriptions[0].coachId)`) === '9');
}

R.section('commission — each same-sport coach earns only their own line');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  run(ctx, `
    state.settings = { commissionBasis:'attendance' };
    state.coaches = [{id:3,name:'Mostafa',rate:30,active:'Y'},{id:7,name:'Zakaria',rate:30,active:'Y'}];
    state.invoices = [{ id:1, ref:'INV1', customerId:50, date:'2026-08-01', month:'2026-08', category:'Membership',
      activityType:'subscription', amount:350,
      lineItems:[ {sport:'Karate',coachId:3,coach:'Mostafa',price:200,classes:4},
                  {sport:'Karate',coachId:7,coach:'Zakaria',price:150,classes:3} ] }];
    state.members = [{ id:50, name:'Kid', startDate:'2026-08-01',
      subscriptions:[
        {activity:'Karate',coachId:3,coach:'Mostafa',totalClasses:4,attendedClasses:4,amountPaid:200,invoiceNumber:'INV1',status:'active',start:'2026-08-01',end:'2026-09-01'},
        {activity:'Karate',coachId:7,coach:'Zakaria',totalClasses:3,attendedClasses:3,amountPaid:150,invoiceNumber:'INV1',status:'active',start:'2026-08-01',end:'2026-09-01'} ],
      // v6.534: the second coach's marks live under the coach-qualified cell (Karate 7); the first
      // (Mostafa) keeps the plain key. Each coach is now paid for the cell HIS row wrote. (Dates kept
      // inside each sub's attendance window.)
      dailyAttendance:{ '2026-08': { 'Karate': {'01':'Y','02':'Y','03':'Y','04':'Y'}, 'Karate 7': {'01':'Y','02':'Y','03':'Y'} } } }];
  `);
  const mos = run(ctx, `(function(){var p=computeAttendanceCommission(3,"2026-08");return {base:p.base,lines:(p.lines||[]).map(l=>l.sport+':'+l.amountBase)};})()`);
  const zak = run(ctx, `(function(){var p=computeAttendanceCommission(7,"2026-08");return {base:p.base,lines:(p.lines||[]).map(l=>l.sport+':'+l.amountBase)};})()`);
  // Each coach earns for his OWN cell only: Mostafa 4×50=200, Zakaria 3×50=150 — no double-count.
  R.ok('Mostafa earns from his Karate cell only (base = 200)', Math.round(mos.base * 100) / 100 === 200, JSON.stringify(mos));
  R.ok('Zakaria earns from HIS Karate cell only (base = 150, not the plain cell)', Math.round(zak.base * 100) / 100 === 150, JSON.stringify(zak));
  R.ok('no negative / cross lines', !JSON.stringify(mos).includes('-') && !JSON.stringify(zak).includes('-'));
}

R.section('edit reconcile uses row identity (source)');
R.ok('duplicate guard is coach-aware', /const key = e\.sport \+ '\|' \+ \(e\.coachId == null \? 'nocoach' : e\.coachId\)/.test(src));
R.ok('rows carry their original coach', /originalCoachId: e\.coachId/.test(src) && /originalCoachId: s\.coachId/.test(src));
R.ok('existing row matches sub by sport + original coach', /s\.activity === e\.sport && _sameCoach\(s\.coachId, e\._originalCoachId\)/.test(src));
R.ok('new row only folds into an unfinished same sport+coach sub', /s\.activity === e\.sport && _sameCoach\(s\.coachId, e\.coachId\) && !_finished\(s\)/.test(src));
R.ok('syncSubToEnrollment line-match is coach-aware', /li\.sport === e\.sport && \(li\.coachId == null \|\| _sc\(li\.coachId, oldCoach\)\)/.test(src));

R.done();
