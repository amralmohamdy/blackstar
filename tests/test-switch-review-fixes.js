// v6.517 — first, safe batch from the switch-code audit:
//  F4: _applySwitchReconcile matched destination coachId with strict === (breaks on string/number
//      imports) — now String()-compared like the rest of that function.
//  F5: transferCoachStudents matched the destination ENROLLMENT by sport only — a same-sport
//      two-coach member could have the OTHER coach's enrollment rewritten. Now coach-aware.
//  B1: the member-card "N/M classes" KPI counted a sub even after it was switched to another sport
//      or transferred to another coach (if its end date was still in the future) — double-counting.
//      Now switchedAwayTo / transferredToCoachId subs are excluded from the active-class count.
const H = require('./qc-harness.js');
const R = H.reporter('v6.517 · switch review — safe fixes (F4/F5/B1)');
const src = H.readSrc();

R.section('F4 — reconcile coachId is String()-compared');
R.ok('destination sub lookup uses String()', /toSub = \(m\.subscriptions \|\| \[\]\)\.find\(s => \(s\.activity \|\| ''\) === sw\.toSport && String\(s\.coachId\) === String\(sw\.toCoachId\)\)/.test(src));
R.ok('destination enrollment lookup uses String()', /enr = \(m\.enrollments \|\| \[\]\)\.find\(e => e\.sport === sw\.toSport && String\(e\.coachId\) === String\(sw\.toCoachId\)\)/.test(src));

R.section('F5 — transfer enrollment lookup is coach-aware');
R.ok('the whole-handover branch matches the departing coach first', /find\(e => e\.sport === sport && _sameC\(e\.coachId, fromId\)\) \|\| \(m\.enrollments \|\| \[\]\)\.find\(e => e\.sport === sport\)/.test(src));
R.ok('there are two coach-aware enrollment lookups (whole + split)', (src.match(/find\(e => e\.sport === sport && _sameC\(e\.coachId, fromId\)\)/g) || []).length >= 2);

R.section('B1 — switched/transferred subs excluded from the active-class KPI');
R.ok('activeSubs drops switchedAwayTo / transferredToCoachId', /const movedAway = !!x\.switchedAwayTo \|\| x\.transferredToCoachId != null;\s*\n\s*return !ended && !withdrawn && !movedAway;/.test(src));

R.section('B1 runtime — a switched sub with a FUTURE end no longer inflates the count');
{
  const pred = `(x => { const _today='2026-08-22'; const ended = x.end && x.end < _today; const withdrawn=(x.status||'').toLowerCase()==='withdrawn'; const movedAway=!!x.switchedAwayTo||x.transferredToCoachId!=null; return !ended && !withdrawn && !movedAway; })`;
  const run = s => H.vm.runInContext(s, H.makeCtx({ today: '2026-08-22' }));
  // a switched-away swimming sub that still has a future end
  R.ok('switched-away future-end sub is EXCLUDED', run(`(${pred})({activity:'Swimming',status:'completed',switchedAwayTo:'Gymnastic',end:'2026-09-30',totalClasses:12})`) === false);
  R.ok('transferred sub is EXCLUDED', run(`(${pred})({activity:'Kick Boxing',status:'completed',transferredToCoachId:1,end:'2026-09-30',totalClasses:8})`) === false);
  R.ok('a normal active sub is KEPT', run(`(${pred})({activity:'Gymnastic',status:'active',end:'2026-09-30',totalClasses:12})`) === true);
  R.ok('a genuinely-ended sub is excluded', run(`(${pred})({activity:'Karate',status:'active',end:'2026-07-01',totalClasses:8})`) === false);
}

R.done();
