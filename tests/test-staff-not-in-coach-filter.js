// v6.507 — staff (role:'staff', e.g. Ester) get a fixed salary but do NOT coach, so they must NOT
// appear in the member-facing COACH filters (Members / Attendance / Schedule). They MUST still
// appear on Salaries (they're paid). isCoachRole()/teachingCoaches() draw that line.
const H = require('./qc-harness.js');
const R = H.reporter('v6.507 · staff excluded from coach filters');
const run = (c, s) => H.vm.runInContext(s, c);
const src = H.readSrc();

R.section('isCoachRole / teachingCoaches');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  run(ctx, `state.coaches = [
    { id:1, name:'Abdel Salam', role:'coach', active:'Y' },
    { id:2, name:'Ester', role:'staff', active:'Y', fixedSalary:1800 },
    { id:3, name:'Legacy', active:'Y' } ,          // no role → defaults to coach
    { id:4, name:'OldStaff', role:'staff', active:'N' } ];`);
  R.ok('a coach is a coaching role', run(ctx, `isCoachRole(state.coaches[0])`) === true);
  R.ok('staff (Ester) is NOT a coaching role', run(ctx, `isCoachRole(state.coaches[1])`) === false);
  R.ok('a role-less legacy record defaults to coach', run(ctx, `isCoachRole(state.coaches[2])`) === true);
  const teach = run(ctx, `teachingCoaches().map(c=>c.name).join(',')`);
  R.ok('teachingCoaches excludes ALL staff', teach === 'Abdel Salam,Legacy', teach);
  R.ok('but staff are still in state.coaches for Salaries', run(ctx, `state.coaches.some(c=>c.name==='Ester')`) === true);
}

R.section('the member-facing coach FILTERS use isCoachRole (source)');
R.ok('Members filter excludes staff', /const _teach = state\.coaches\.filter\(isCoachRole\);[\s\S]{0,120}filter-coach-cb|filter-coach-cb[\s\S]{0,400}isCoachRole/.test(src) || /const _teach = state\.coaches\.filter\(isCoachRole\);\s*\/\/ v6\.507: exclude staff \(Ester/.test(src));
R.ok('Schedule filter excludes staff', /sch-coach-cb[\s\S]{0,400}isCoachRole|const _teach = state\.coaches\.filter\(isCoachRole\);\s*\/\/ v6\.507: exclude staff\s*\n\s*const active/.test(src));
R.ok('Attendance filter excludes staff', /multiFilterHTML\('att-coach', state\.coaches\.filter\(isCoachRole\)\.map/.test(src));

R.section('Salaries still INCLUDES staff (must NOT use isCoachRole)');
R.ok('the Salaries/report coach list is not coach-role-filtered', /const coachesInData = state\.coaches\.filter\(c => isCoachActive\(c\)\);/.test(src));

R.done();
