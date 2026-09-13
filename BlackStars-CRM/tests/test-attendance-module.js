// v6.427 — the Attendance grid + Attendance Report screens moved into their own "Attendance"
// sidebar module (out of Activities / Insights).
const H = require('./qc-harness.js');
const R = H.reporter('SIDEBAR · Attendance module');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('the attendance routes are in the Attendance section');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('attendance → Attendance', run(ctx, `ROUTES.attendance.section`) === 'Attendance');
  R.ok('attreport (Attendance Report) → Attendance', run(ctx, `ROUTES.attreport.section`) === 'Attendance');
  R.ok('coachattendance (coach report) → Attendance', run(ctx, `ROUTES.coachattendance.section`) === 'Attendance');
}

R.section('the new section is registered in order + Arabic');
{
  const src = H.readSrc();
  R.ok('sections array places Attendance right after Membership', /'Membership','Attendance','Activities'/.test(src));
  R.ok('Attendance has an Arabic label', /Attendance: 'الحضور'/.test(src));
}

R.section('the admin nav groups both attendance screens under Attendance');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const grp = run(ctx, `(function(){
    const out = {};
    for (const [key, route] of Object.entries(ROUTES)) {
      if (route.hidden || !roleCanAccess('admin', key)) continue;
      if (route.coachOnly && 'admin' !== 'coach') continue;
      (out[route.section] = out[route.section] || []).push(key);
    }
    return out.Attendance || [];
  })()`);
  R.ok('admin Attendance module holds attendance + attreport', grp.includes('attendance') && grp.includes('attreport'), grp);
  R.ok('coachattendance (coachOnly) is NOT in the admin group', !grp.includes('coachattendance'), grp);
}

R.done();
