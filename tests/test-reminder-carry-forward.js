// v6.584 — an EXPIRED / EXPIRING member who did NOT finish their classes should be told, in the
// renewal reminder, that the unattended classes CARRY OVER on renewal (capped at CARRY_FORWARD_MAX
// per sport). The "completed" congratulation (a finisher) must NOT carry that line.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.584 · reminder carry-forward note');
const src = H.readSrc('app.js');

R.section('source wiring');
R.ok('carry is summed from carryForwardCredit over renewal sports', /_carry = memberRenewalSports\(m\)\.reduce\(\(s, sp\) => s \+ \(typeof carryForwardCredit === 'function' \? \(carryForwardCredit\(m, sp\) \|\| 0\) : 0\), 0\)/.test(src));
R.ok('carry is skipped for the completed congratulation', /if \(kind !== 'completed'\) \{[\s\S]{0,160}_carry = memberRenewalSports/.test(src));
R.ok('the carry line is inserted before the ⭐ signature', /lastIndexOf\('⭐'\)/.test(src));

R.section('runtime — expired member with 2 classes left');
{
  const ctx = H.makeCtx({ today: '2026-09-20' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings = state.settings || {};
    state.members = [{
      id: 1, name: 'Walid Hassanen', nameArabic: 'وليد',
      sport: 'Boxing', coachId: 1, expiryDate: '2026-09-10', status: 'Expired',
      enrollments: [{ sport: 'Boxing', coachId: 1 }],
      subscriptions: [{ activity: 'Boxing', coachId: 1, start: '2026-08-01', end: '2026-09-10', status: 'expired', totalClasses: 8, attendedClasses: 6 }]
    }];
    state.coaches = [{ id: 1, name: 'Aziz', role: 'coach', active: true }];
  `);
  const carry = run(`carryForwardCredit(state.members[0], 'Boxing')`);
  R.ok('carryForwardCredit(Boxing) = 2 (8 total − 6 attended, capped at 2)', carry === 2, carry);

  const msg = run(`buildReminderMessage(state.members[0], 'expired', -10)`);
  R.ok('English carry line names the 2 classes carried over', /you still have 2 classes left — renew and we'll carry them over/.test(msg), msg.slice(0, 40));
  R.ok('Arabic carry line uses the dual form (حصتان متبقيتان)', /حصتان متبقيتان/.test(msg));
  R.ok('the reminder does NOT wrongly congratulate completion', !/completed all your/i.test(msg) && !/أكملت جميع/.test(msg));
  R.ok('the carry line sits before the signature (⭐ appears after 🎁)', msg.indexOf('🎁') < msg.lastIndexOf('⭐'));
}

R.section('runtime — a FINISHER (8/8) gets the completed message, NO carry line');
{
  const ctx = H.makeCtx({ today: '2026-09-20' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings = state.settings || {};
    state.members = [{
      id: 2, name: 'Basil', nameArabic: 'باسل', sport: 'Boxing', coachId: 1,
      expiryDate: '2026-09-10', status: 'Expired',
      enrollments: [{ sport: 'Boxing', coachId: 1 }],
      subscriptions: [{ activity: 'Boxing', coachId: 1, start: '2026-08-01', end: '2026-09-10', status: 'expired', totalClasses: 8, attendedClasses: 8 }]
    }];
    state.coaches = [{ id: 1, name: 'Aziz', role: 'coach', active: true }];
  `);
  const msg = run(`buildReminderMessage(state.members[0], 'completed', 0)`);
  R.ok('completed message has NO carry-forward line', !/carry them over|حصتان متبقيتان|حصص متبقية|حصة واحدة متبقية/.test(msg));
  R.ok('completed message still congratulates', /completed all your/i.test(msg) || /أكملت جميع/.test(msg));
}

R.section('runtime — singular (1 class left) wording');
{
  const ctx = H.makeCtx({ today: '2026-09-20' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings = state.settings || {};
    state.members = [{ id: 3, name: 'Sam', sport: 'Boxing', coachId: 1, expiryDate: '2026-09-10', status: 'Expired',
      enrollments: [{ sport: 'Boxing', coachId: 1 }],
      subscriptions: [{ activity: 'Boxing', coachId: 1, start: '2026-08-01', end: '2026-09-10', status: 'expired', totalClasses: 8, attendedClasses: 7 }] }];
    state.coaches = [{ id: 1, name: 'Aziz', role: 'coach', active: true }];
  `);
  const msg = run(`buildReminderMessage(state.members[0], 'expired', -10)`);
  R.ok('English uses singular "1 class ... carry it over"', /you still have 1 class left — renew and we'll carry it over/.test(msg));
  R.ok('Arabic uses "حصة واحدة متبقية"', /حصة واحدة متبقية/.test(msg));
}

R.done();
