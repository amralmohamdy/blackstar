// v6.544 — two switch hardening fixes:
//  (1) the SINGLE-target switch (the common case) used a bare save() — a money-critical op that could
//      persist LOCAL-ONLY on a flaky/multi-device connection and then diverge on the next sync. Now it
//      uses confirmSaved() (save + cloud-confirm), matching the multi-target path and every other money op.
//  (2) countAttendedUpTo (which sizes the old-vs-new coach split) read only the plain `sport` attendance
//      key. A member who ALREADY held two coaches on the sport stores the extra coach's marks under
//      `sport <coachId>`, so the attended count (and thus the money split) was skewed. It now reads the
//      per-coach cell via attendanceKeyFor — identical for the single-coach case.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.544 · switch hardening');
const src = H.readSrc();

R.section('source — fix 1: single switch confirms the cloud write');
R.ok('the single-target switch no longer uses a bare save()', !/\n        save\(\);\n        closeModal\(\);\n        render\(\);\n        let msg;/.test(src));
R.ok('it now confirms the cloud write (confirmSaved)', /confirmSaved\(msg\);\n      \}\},/.test(src));

R.section('source — fix 2: attended count is per-coach');
R.ok('countAttendedUpTo takes a coachId', /function countAttendedUpTo\(sport, untilDateStr, coachId\)/.test(src));
R.ok('it reads the per-coach cell via attendanceKeyFor', /const key = \(coachId != null && typeof attendanceKeyFor === 'function'\) \? attendanceKeyFor\(m, sport, coachId\) : sport;/.test(src) && /mo\[key\]/.test(src));
R.ok('the source-sub floor is also coach-scoped', /\(coachId == null \|\| String\(s\.coachId\) === String\(coachId\)\)/.test(src));
R.ok('every caller passes the source coach', !/countAttendedUpTo\(from\.sport, switchDate\)(?!,)/.test(src));

R.section('runtime — attendanceKeyFor keeps the common case identical');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`state.members=[
    {id:1,subscriptions:[{activity:'Karate',coachId:3,status:'active'}]},
    {id:2,subscriptions:[{activity:'Karate',coachId:3,status:'active'},{activity:'Karate',coachId:9,status:'active'}]}
  ];`);
  R.ok('single active coach → plain sport key (unchanged behaviour)', run(`attendanceKeyFor(state.members[0],'Karate',3)`) === 'Karate');
  R.ok('two coaches → first keeps plain key', run(`attendanceKeyFor(state.members[1],'Karate',3)`) === 'Karate');
  R.ok('two coaches → the extra coach gets its own cell', run(`attendanceKeyFor(state.members[1],'Karate',9)`) === 'Karate 9');

  R.section('runtime — the money split still conserves exactly');
  R.ok('computeSwitchSplit(425,4,8) → 212.5 + 212.5 = 425', (() => { const s = run(`computeSwitchSplit(425,4,8)`); return s.aShare === 212.5 && s.bShare === 212.5 && Math.round((s.aShare + s.bShare) * 100) / 100 === 425; })());
  R.ok('attended = 0 → old coach keeps nothing, all transfers', (() => { const s = run(`computeSwitchSplit(300,0,8)`); return s.aShare === 0 && s.bShare === 300; })());
  R.ok('attended >= total → old coach capped at the full price (no over-claw)', (() => { const s = run(`computeSwitchSplit(300,10,8)`); return s.aShare === 300 && s.bShare === 0; })());
}

R.done();
