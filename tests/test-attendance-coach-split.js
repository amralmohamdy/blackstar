// v6.505 — Attendance screen splits a switched student into ONE row PER coach, each scoped to
// that coach's date window, so classes credit the right coach (never all under both). Uses the
// SAME subAttendanceWindow boundaries as salary, so the attendance view and the pay agree.
const H = require('./qc-harness.js');
const R = H.reporter('v6.505 · attendance coach-window split');
const run = (c, s) => H.vm.runInContext(s, c);
const src = H.readSrc();

R.section('the window split partitions attendance (Kordi: Iyad 2 + Abdel 5 = 7)');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  run(ctx, `
    state.coaches = [{id:14,name:'Iyad',active:'N'},{id:1,name:'Abdel Salam',active:'Y'}];
    state.members = [{ id:99, name:'Kordi', startDate:'2026-07-29',
      subscriptions:[
        {activity:'Kick Boxing',coachId:14,coach:'Iyad',totalClasses:2,status:'completed',start:'2026-07-29',end:'2026-08-28'},
        {activity:'Kick Boxing',coachId:1,coach:'Abdel Salam',totalClasses:10,status:'active',start:'2026-08-02',end:'2026-08-28',switchFunded:true} ],
      dailyAttendance:{ '2026-07': { 'Kick Boxing': {'29':'Y'} },
                        '2026-08': { 'Kick Boxing': {'1':'Y','3':'Y','8':'Y','10':'Y','12':'Y','15':'Y'} } } }];
  `);
  const res = run(ctx, `(function(){
    var m = state.members[0];
    function win(coachId){
      var sub = m.subscriptions.find(s=>String(s.coachId)===String(coachId));
      var w = subAttendanceWindow(m, sub);
      return { from:w.from, to:w.to, y: (liveAttendanceCount(m,'Kick Boxing',w.from,w.to).y||0) };
    }
    return { iyad: win(14), abdel: win(1), total: (liveAttendanceCount(m,'Kick Boxing',null,'2026-08-16').y||0) };
  })()`);
  R.ok('Iyad window credits 2 classes', res.iyad.y === 2, JSON.stringify(res.iyad));
  R.ok('Abdel Salam window credits 5 classes', res.abdel.y === 5, JSON.stringify(res.abdel));
  R.ok('the two windows sum to the true total (7) — no double-count, no gap', res.iyad.y + res.abdel.y === res.total && res.total === 7, JSON.stringify(res));
  R.ok('the windows do not overlap (Iyad.to < Abdel.from)', res.iyad.to < res.abdel.from, `${res.iyad.to} < ${res.abdel.from}`);
}

R.section('source — the Attendance grid is coach-window aware');
R.ok('getRows emits one row PER coach when a sport had >1 coach', /const coachIds = \[\.\.\.new Set\(spSubs\.map\(s => String\(s\.coachId\)\)\)\];/.test(src) && /if \(sp !== SUMMER_CAMP && coachIds\.length > 1\)/.test(src));
R.ok('each split row carries a coach window from subAttendanceWindow', /rows\.push\(\{ m, sport: sp, coachId: parseInt\(cid\), window: \{ from, to \}, attKey: attKeyForSport\(m, sp, cid\) \}\)/.test(src));
R.ok('a single-coach sport still emits one whole row (window null)', /rows\.push\(\{ m, sport: sp, coachId: rowCoachId, window: null, attKey: sp \}\)/.test(src));
R.ok('inWin helper gates a day by the coach window', /function inWin\(win, mo, dayKey\)/.test(src));
R.ok('club total is windowed (no double-count across split rows)', /if \(!inWin\(window, mk, k\)\) continue;/.test(src));
R.ok('all-months summary count is windowed', /if \(dd\[k\] === 'Y' && inWin\(window, mo, k\)\) y\+\+;/.test(src));
R.ok('single-month grid count is windowed', /if \(!inWin\(window, gMonth, d\)\) return;/.test(src));
R.ok('out-of-window cells are muted + non-clickable', /outside \$\{escapeHtml\(coachName\(coachId\)\)\}'s period/.test(src));
R.ok('a coach login sees only their own window row', /if \(myCoachId != null && String\(myCoachId\) !== cid\) continue;/.test(src));

R.done();
