// v6.433 — "fill up to paid classes". For a member's LAST package (no later same-sport sub),
// subAttendanceWindow extends the window's END to the date they reached their paid class count —
// so a class attended shortly AFTER expiry fills the last paid slot (Aseel: 12th class on 23 Jul,
// 2 days after a 21 Jul expiry → 12/12), and never beyond it (a member who kept attending extra
// classes stays capped at their paid count). Card + coach commission both follow the window.
const H = require('./qc-harness.js');
const R = H.reporter('ATTENDANCE · fill up to paid classes');
const run = (c, s) => H.vm.runInContext(s, c);
const win = (c) => run(c, `(function(){const m=state.members[0],s=m.subscriptions[0];const w=subAttendanceWindow(m,s);return {to:w.to, y:liveAttendanceCount(m,s.activity,w.from,w.to).y};})()`);

R.section('the reported case — Aseel Chakori (12th class 2 days after expiry)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  run(ctx, `state.members=[{ id:311, name:'Aseel', sport:'Gymnastic', coachId:2, startDate:'2026-06-21', expiryDate:'2026-07-21',
    subscriptions:[{activity:'Gymnastic',coachId:2,start:'2026-06-21',end:'2026-07-21',totalClasses:12,status:'active'}],
    dailyAttendance:{ '2026-06':{Gymnastic:{'21':'Y','23':'Y','28':'Y','30':'Y'}}, '2026-07':{Gymnastic:{'2':'Y','7':'Y','9':'Y','12':'Y','14':'Y','16':'Y','21':'Y','23':'Y'}} } }];`);
  const w = win(ctx);
  R.ok('the window end extends to the 12th class (23 Jul)', w.to === '2026-07-23', w);
  R.ok('attended now reads 12/12 (was 11/12)', w.y === 12, w);
}

R.section('a member who kept attending after their package is used up stays capped at paid');
{
  const ctx = H.makeCtx({ role: 'admin' });
  // 12-class package, 20 present marks (8 after expiry) → capped at 12.
  const marks = {}; for (let d = 1; d <= 20; d++) marks[String(d)] = 'Y';
  run(ctx, `state.members=[{ id:1, name:'Over', sport:'Boxing', coachId:1, startDate:'2026-06-01', expiryDate:'2026-06-15',
    subscriptions:[{activity:'Boxing',coachId:1,start:'2026-06-01',end:'2026-06-15',totalClasses:12,status:'active'}],
    dailyAttendance:{ '2026-06':{Boxing:${JSON.stringify(marks)}} } }];`);
  R.ok('attended is capped at the paid 12 (never over-pays the coach)', win(ctx).y === 12, win(ctx));
}

R.section('a member still using their package is unchanged (open window, no over-count)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const marks = {}; for (let d = 1; d <= 8; d++) marks[String(d)] = 'Y';
  run(ctx, `state.members=[{ id:1, name:'Under', sport:'Boxing', coachId:1, startDate:'2026-06-01', expiryDate:'2026-06-30',
    subscriptions:[{activity:'Boxing',coachId:1,start:'2026-06-01',end:'2026-06-30',totalClasses:12,status:'active'}],
    dailyAttendance:{ '2026-06':{Boxing:${JSON.stringify(marks)}} } }];`);
  R.ok('attended = 8 (fewer than the paid 12, window left open)', win(ctx).y === 8, win(ctx));
}

R.section('the fill only affects the LAST package — an earlier renewed package still caps at its end');
{
  const ctx = H.makeCtx({ role: 'admin' });
  run(ctx, `state.members=[{ id:1, name:'Renewed', sport:'Karate', coachId:1, startDate:'2026-06-01', expiryDate:'2026-08-01',
    subscriptions:[
      {activity:'Karate',coachId:1,start:'2026-06-01',end:'2026-07-01',totalClasses:8,status:'expired'},
      {activity:'Karate',coachId:1,start:'2026-07-02',end:'2026-08-01',totalClasses:8,status:'active'}],
    dailyAttendance:{ '2026-07':{Karate:{'05':'Y'}} } }];`);
  const w0 = run(ctx, `(function(){const m=state.members[0];const w=subAttendanceWindow(m,m.subscriptions[0]);return w.to;})()`);
  R.ok('the EARLIER package caps at the day before the renewal (not open)', w0 === '2026-07-01', w0);
}

R.section('source');
{
  const src = H.readSrc();
  R.ok('subAttendanceWindow fills up to the paid class count (caps on the limit-th class; last package left open when under)', /FILL UP TO PAID CLASSES/.test(src) && /if \(marks\.length >= limit\) to = marks\[limit - 1\];/.test(src) && /else if \(!sameAct\.length\) to = null;/.test(src));
}

R.done();
