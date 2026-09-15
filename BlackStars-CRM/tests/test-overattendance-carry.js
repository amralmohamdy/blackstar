// v6.452 — when a member attends MORE classes than their package paid for and then RENEWS,
// the extra class(es) must roll into the NEW package, not inflate the old one.
// Reported: Layan Chortan — Gymnastic Jul 9/8 then Aug renewal 0/8; should be Jul 8/8, Aug 1/8.
const H = require('./qc-harness.js');
const R = H.reporter('ATTENDANCE · over-attendance carries into the renewal');
const run = (c, s) => H.vm.runInContext(s, c);

// Jul package (02 Jul→01 Aug, 8 classes) with 9 attended marks, Aug renewal (03 Aug→02 Sep, 8).
function seed(ctx) {
  run(ctx, `
    state.members = [{
      id: 1, name: 'Layan', sport: 'Gymnastic', coachId: 1, status: 'Active',
      joinDate: '2026-07-02', expiryDate: '2026-09-02',
      subscriptions: [
        { _sid:'jul', activity:'Gymnastic', coachId:1, totalClasses:8, start:'2026-07-02', end:'2026-08-01', status:'active' },
        { _sid:'aug', activity:'Gymnastic', coachId:1, totalClasses:8, start:'2026-08-03', end:'2026-09-02', status:'active' }
      ],
      dailyAttendance: { '2026-07': { 'Gymnastic': {
        '4':'Y','7':'Y','12':'Y','14':'Y','19':'Y','21':'Y','23':'Y','25':'Y','27':'Y'   // 9 marks
      } } }
    }];
    state.coaches = [{ id:1, name:'Jennifer', rate:35, active:true }];
    state.invoices = [];
  `);
}

R.section('the 9th July class rolls into the August renewal');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-15' }); seed(ctx);
  const jul = run(ctx, `(function(){var m=state.members[0],s=m.subscriptions[0];return {w:subAttendanceWindow(m,s),att:attendedYForSub(m,s,null)};})()`);
  const aug = run(ctx, `(function(){var m=state.members[0],s=m.subscriptions[1];return {w:subAttendanceWindow(m,s),att:attendedYForSub(m,s,null)};})()`);
  R.ok('July caps at 8/8 (window ends on the 8th class, 25 Jul)', jul.att === 8 && jul.w.to === '2026-07-25', JSON.stringify(jul));
  R.ok('August shows 1/8 (absorbs the 9th class, 27 Jul)', aug.att === 1, JSON.stringify(aug));
  R.ok('total attended across both packages = 9 (nothing lost or double-counted)', jul.att + aug.att === 9);
}

R.section('a NON-over-attended renewal is unchanged (8 in July, 0 so far in Aug)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-15' }); seed(ctx);
  run(ctx, `delete state.members[0].dailyAttendance['2026-07']['Gymnastic']['27'];`);   // now 8 marks
  const jul = run(ctx, `attendedYForSub(state.members[0], state.members[0].subscriptions[0], null)`);
  const aug = run(ctx, `attendedYForSub(state.members[0], state.members[0].subscriptions[1], null)`);
  R.ok('July = 8/8, August = 0/8 (no phantom carry when nothing overflowed)', jul === 8 && aug === 0, 'jul=' + jul + ' aug=' + aug);
}

R.section('a single package (no renewal) still caps at paid (v6.433 preserved)');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-15' }); seed(ctx);
  run(ctx, `state.members[0].subscriptions = [state.members[0].subscriptions[0]];`);   // drop the Aug renewal
  const jul = run(ctx, `attendedYForSub(state.members[0], state.members[0].subscriptions[0], null)`);
  R.ok('lone over-attended package still caps at 8 (never 9)', jul === 8, 'jul=' + jul);
}

R.done();
