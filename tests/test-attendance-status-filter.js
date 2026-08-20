// v6.508 — Attendance screen gains a MEMBER-STATUS filter (Active / Frozen / Expired / Completed /
// Withdrawn). It combines with every other filter (coach, sport, attendance, day) as an AND. The
// filter state is filter.statuses, matched against memberStatus(m) in getRows.
const H = require('./qc-harness.js');
const R = H.reporter('v6.508 · attendance member-status filter');
const src = H.readSrc();

R.section('the status filter is wired into the Attendance screen (source)');
R.ok('filter state carries statuses[]', /let filter = \{ month: _defaultMonth,[^;]*atts: \[\], statuses: \[\] \}/.test(src));
R.ok('a member-status multi-filter is rendered', /multiFilterHTML\('att-mstatus',/.test(src));
R.ok('it offers Active / Frozen / Expired / Completed / Withdrawn', /'att-mstatus', \[\['Active'[\s\S]{0,220}'Withdrawn'/.test(src));
R.ok('it is bound to filter.statuses', /bindMultiFilter\('att-mstatus', v => \{ filter\.statuses = v; refresh\(\); \}/.test(src));
R.ok('getRows filters by memberStatus, combining with all other filters', /if \(filter\.statuses\.length && !filter\.statuses\.includes\(memberStatus\(m\)\)\) continue;/.test(src));

R.section('memberStatus returns the values the filter offers');
{
  const ctx = H.makeCtx({ today: '2026-08-20' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.coaches=[{id:1,name:'C',active:'Y'}];`);
  // active member (future expiry) vs expired member (past expiry)
  run(`state.members=[
    {id:1,name:'ActiveGuy',sport:'Karate',coachId:1,expiryDate:'2026-12-01',
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,status:'active',start:'2026-08-01',end:'2026-12-01'}]},
    {id:2,name:'ExpiredGuy',sport:'Karate',coachId:1,expiryDate:'2026-06-01',
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,status:'active',start:'2026-05-01',end:'2026-06-01'}]}
  ];`);
  const a = run(`memberStatus(state.members[0])`);
  const e = run(`memberStatus(state.members[1])`);
  R.ok('an active member reads "Active"', a === 'Active', a);
  R.ok('a past-expiry member reads "Expired"', e === 'Expired', e);
  // simulate the filter predicate
  const passActive = run(`['Active'].includes(memberStatus(state.members[0]))`);
  const blockExpired = run(`['Active'].includes(memberStatus(state.members[1]))`);
  R.ok('filtering by Active keeps the active member', passActive === true);
  R.ok('filtering by Active drops the expired member', blockExpired === false);
}

R.done();
