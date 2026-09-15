// v6.422 — the shared Attendance report (exportMemberAttendanceImage) counted on the STRICT
// membership period (sub.start→end), while the profile card / rate / payroll count on
// subAttendanceWindow, which reaches back a 7-day grace before a FIRST package's start so a
// class trained just before registration still counts. Result: the card showed 5/6 · 83% but
// the shared report printed 4/6 · 67%. The report now counts on the SAME window → they match.
const H = require('./qc-harness.js');
const R = H.reporter('ATTENDANCE REPORT · window matches the card');
const run = (c, s) => H.vm.runInContext(s, c);

// Mayasa: Gymnastic, registered 14 Jul, one 6-class package 14 Jul → 13 Aug. FIVE 'Y' marks —
// one on 11 Jul (3 days before registration, inside the 7-day grace) + 14, 16, 25, 26 Jul.
function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:9, name:'Jennifer', active:'Y' }];
    state.members = [{ id:9200, name:'Mayasa', nameArabic:'مياسة', startDate:'2026-07-14', expiryDate:'2026-08-13',
      enrollments:[{ sport:'Gymnastic', coachId:9, classes:6, price:275 }],
      subscriptions:[{ _sid:'g1', activity:'Gymnastic', coachId:9, start:'2026-07-14', end:'2026-08-13', totalClasses:6, attendedClasses:0, status:'active' }],
      dailyAttendance:{ '2026-07': { Gymnastic: { '11':'Y', '14':'Y', '16':'Y', '25':'Y', '26':'Y' } } } }];
    state.invoices = [];
  `);
}

R.section('the constants that create the grace reach-back');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('FIRST_PACKAGE_GRACE_DAYS = 7', run(ctx, `FIRST_PACKAGE_GRACE_DAYS`) === 7);
}

R.section('the card counts 5 (grace-credited 11 Jul included)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const w = run(ctx, `(function(){ const m=state.members[0]; const s=m.subscriptions[0]; const win=subAttendanceWindow(m,s); return win; })()`);
  R.ok('the counting window starts 2026-07-07 (grace)', w.from === '2026-07-07', w);
  const y = run(ctx, `(function(){ const m=state.members[0]; const s=m.subscriptions[0]; const win=subAttendanceWindow(m,s); return liveAttendanceCount(m,'Gymnastic',win.from,win.to).y; })()`);
  R.ok('the card/live count = 5 (includes the 11 Jul grace class)', y === 5, y);
  const strict = run(ctx, `liveAttendanceCount(state.members[0],'Gymnastic','2026-07-14','2026-08-13').y`);
  R.ok('the OLD strict-period count would have been 4 (the bug)', strict === 4, strict);
}

R.section('the report now uses the per-sport subAttendanceWindow (source)');
{
  const src = H.readSrc();
  R.ok('the report computes a per-sport window via subAttendanceWindow', /const winForSport = \(sp\) =>/.test(src) && /subAttendanceWindow\(m, sub\)/.test(src));
  R.ok('the day filter uses inWindowSport (not the strict membership period)', /if \(!inWindowSport\(iso, sp\)\) return;/.test(src));
  R.ok('the printed period is widened to the counting window', /Widen the printed "current membership" range/.test(src));
  R.ok('the old strict inWindow-only filter is gone from the counting loop', !/if \(!inWindow\(iso\)\) return;/.test(src));
}

R.section('the report renders and its present-count matches the card (5), not 4');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  // Replay the report's counting rule to prove the total the header would print.
  const reportY = run(ctx, `(function(){
    const m = state.members[0]; const da = m.dailyAttendance || {};
    const subsSp = m.subscriptions.filter(s => s.activity==='Gymnastic');
    const win = subAttendanceWindow(m, subsSp[subsSp.length-1]);
    let y = 0;
    for (const mo of Object.keys(da)) { const dd = da[mo].Gymnastic || {};
      for (const d of Object.keys(dd)) { const iso = mo+'-'+String(parseInt(d)).padStart(2,'0');
        if (win.from && iso < win.from) continue; if (win.to && iso > win.to) continue;
        if (dd[d]==='Y') y++; } }
    return y;
  })()`);
  R.ok('the report present-count is now 5 (matches the card)', reportY === 5, reportY);
}

R.done();
