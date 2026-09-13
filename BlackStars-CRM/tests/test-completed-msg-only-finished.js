// v6.552 — the "completed / ready to renew" WhatsApp congratulation filled {sport} with EVERY
// enrolled sport (memberRenewalSports), so a member who finished ONE sport was congratulated for
// all of them (real case: Basil finished Kick Boxing 8/8 but the message said "completed all your
// Swimming, Kick Boxing & Football sessions" — Swimming was 4/8, Football 5/8). Fix: for the
// 'completed' kind, {sport} now names only the sports actually FINISHED (completedSubsForRenewal).
// Expired/expiring reminders still list every renewal sport.
const H = require('./qc-harness.js');
const R = H.reporter('MESSAGES · completed congrats names only finished sports');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok("'completed' kind derives {sport} from completedSubsForRenewal",
    /kind === 'completed' && typeof completedSubsForRenewal === 'function'/.test(src)
    && /completedSubsForRenewal\(m\)\.map\(d => d\.sport\)/.test(src));
  R.ok('other kinds still use memberRenewalSports', /_sports = memberRenewalSports\(m\);/.test(src));
}

R.section('functional: 3 sports, only Kick Boxing finished');
{
  const ctx = H.makeCtx({ today: '2026-09-07', role: 'admin' });
  // No roll-call grid → liveAttendanceCount total=0 → completedSubsForRenewal falls back to
  // stored attendedClasses, which we set: Kick Boxing 8/8 (done), Swimming 4/8, Football 5/8.
  const res = run(ctx, `
    (function(){
      state.coaches = [{id:1,name:'Aziz'},{id:2,name:'Mostafa'},{id:3,name:'Ibrahim'}];
      const m = { id: 900, name: 'Basil', nameArabic: 'باسل', phone: '50000000',
        startDate: '2026-08-13', expiryDate: '2026-09-12',
        enrollments: [
          {sport:'Swimming',coachId:2,price:350},
          {sport:'Kick Boxing',coachId:1,price:350},
          {sport:'Football',coachId:3,price:350}
        ],
        subscriptions: [
          {activity:'Swimming',coachId:2,start:'2026-08-13',end:'2026-09-12',totalClasses:8,attendedClasses:4,status:'active'},
          {activity:'Kick Boxing',coachId:1,start:'2026-08-13',end:'2026-09-12',totalClasses:8,attendedClasses:8,status:'active'},
          {activity:'Football',coachId:3,start:'2026-08-13',end:'2026-09-12',totalClasses:8,attendedClasses:5,status:'active'}
        ]};
      state.members = [m];
      const done = completedSubsForRenewal(m).map(d => d.sport);
      const completedMsg = buildReminderMessage(m, 'completed', -0);
      const expiringMsg  = buildReminderMessage(m, 'expiring', 5);
      return { done, completedMsg, expiringMsg };
    })()
  `);
  R.ok('completedSubsForRenewal returns ONLY Kick Boxing', JSON.stringify(res.done) === JSON.stringify(['Kick Boxing']), JSON.stringify(res.done));
  R.ok('completed message names Kick Boxing', /Kick Boxing/.test(res.completedMsg));
  R.ok('completed message does NOT claim Swimming', !/Swimming/.test(res.completedMsg), res.completedMsg);
  R.ok('completed message does NOT claim Football', !/Football/.test(res.completedMsg), res.completedMsg);
  // expiring reminder is about the whole membership → still lists every sport
  R.ok('expiring reminder still lists all three sports',
    /Swimming/.test(res.expiringMsg) && /Kick Boxing/.test(res.expiringMsg) && /Football/.test(res.expiringMsg),
    res.expiringMsg);
}

R.section('functional: two sports finished → both named');
{
  const ctx = H.makeCtx({ today: '2026-09-07', role: 'admin' });
  const res = run(ctx, `
    (function(){
      state.coaches = [{id:1,name:'Aziz'},{id:2,name:'Mostafa'}];
      const m = { id: 901, name: 'Sara', phone: '50000001',
        startDate:'2026-08-13', expiryDate:'2026-09-12',
        enrollments:[{sport:'Swimming',coachId:2},{sport:'Kick Boxing',coachId:1}],
        subscriptions:[
          {activity:'Swimming',coachId:2,start:'2026-08-13',end:'2026-09-12',totalClasses:8,attendedClasses:8,status:'active'},
          {activity:'Kick Boxing',coachId:1,start:'2026-08-13',end:'2026-09-12',totalClasses:8,attendedClasses:8,status:'active'}
        ]};
      state.members=[m];
      return { done: completedSubsForRenewal(m).map(d=>d.sport).sort(), msg: buildReminderMessage(m,'completed',0) };
    })()
  `);
  R.ok('both finished sports detected', JSON.stringify(res.done) === JSON.stringify(['Kick Boxing','Swimming']), JSON.stringify(res.done));
  R.ok('message names both', /Swimming/.test(res.msg) && /Kick Boxing/.test(res.msg));
}

R.done();
