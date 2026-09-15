// v6.413 — CAMP VALIDITY REPAIR. A Summer Camp pass lasts its class-days counted Sun–Thu (camp
// closed Fri/Sat): 1 month = 22 class-days, ending on the 22nd. Records stored the wrong end via
// plain calendar days (5 Jul → 4 Aug instead of the correct 3 Aug). The Fix-camp-dates tool
// recomputes each camp end = campEndDateFromClasses(start, class-days) and corrects the mismatches,
// keeping the member's expiry in sync. Non-camp sports and already-correct records are untouched.
const H = require('./qc-harness.js');
const R = H.reporter('CAMP VALIDITY REPAIR');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.members = [
      { id:1, name:'Rashed', sport:'Summer Camp', expiryDate:'2026-08-04',
        subscriptions:[{ id:'s1', activity:'Summer Camp', durationLabel:'1 month', start:'2026-07-05', end:'2026-08-04', totalClasses:22, attendedClasses:15, status:'active' }] },
      { id:2, name:'Correct Kid', sport:'Summer Camp',
        subscriptions:[{ id:'s2', activity:'Summer Camp', durationLabel:'1 week', start:'2026-06-21', end: campEndDateFromClasses('2026-06-21', 5), totalClasses:5, attendedClasses:5, status:'completed' }] },
      { id:3, name:'Swimmer',
        subscriptions:[{ id:'s3', activity:'Swimming', start:'2026-07-05', end:'2026-08-04', totalClasses:8, status:'active' }] },
    ];
  `);
}

R.section('the rule: a month camp = 22 class-days ending on the 22nd (Sun–Thu)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('campClassCount(30) = 22 class-days', run(ctx, `campClassCount(30)`) === 22);
  R.ok('5 Jul (Sun) + 1-month camp ends 3 Aug (Mon), NOT 4 Aug', run(ctx, `campEndDate('2026-07-05', 30)`) === '2026-08-03', run(ctx, `campEndDate('2026-07-05', 30)`));
  R.ok('plain +30 calendar days gives the WRONG 4 Aug', run(ctx, `addDays('2026-07-05', 30)`) === '2026-08-04');
}

R.section('the audit finds only the wrong camp records');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const fixes = run(ctx, `_campValidityFixes().map(f => ({ name:f.name, old:f.oldEnd, neu:f.newEnd }))`);
  R.ok('exactly ONE fix (Rashed 4 Aug → 3 Aug)', fixes.length === 1 && fixes[0].name === 'Rashed', fixes);
  R.ok('the correction is 2026-08-04 → 2026-08-03', fixes[0].old === '2026-08-04' && fixes[0].neu === '2026-08-03', fixes[0]);
  R.ok('the already-correct 1-week camp is NOT flagged', !fixes.some(f => f.name === 'Correct Kid'));
  R.ok('the non-camp (Swimming) sub is NOT flagged', !fixes.some(f => f.name === 'Swimmer'));
}

R.section('applying the fix corrects the end AND the member expiry, and is idempotent');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  // Mirror the tool's apply loop.
  run(ctx, `(function(){ for (const f of _campValidityFixes()) { const prev=f.sub.end; f.sub.end=f.newEnd; if (f.member.expiryDate===prev) f.member.expiryDate=f.newEnd; } })()`);
  R.ok('the camp sub end is now 3 Aug', run(ctx, `state.members[0].subscriptions[0].end`) === '2026-08-03');
  R.ok('the member expiry is kept in sync (also 3 Aug)', run(ctx, `state.members[0].expiryDate`) === '2026-08-03');
  R.ok('the Swimming end is untouched (still 4 Aug)', run(ctx, `state.members[2].subscriptions[0].end`) === '2026-08-04');
  R.ok('re-running finds NOTHING to fix (idempotent)', run(ctx, `_campValidityFixes().length`) === 0);
}

R.section('a member whose expiry came from ELSEWHERE is not disturbed');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `state.members[0].expiryDate = '2026-12-31';`);   // expiry from another sport, not the camp
  run(ctx, `(function(){ for (const f of _campValidityFixes()) { const prev=f.sub.end; f.sub.end=f.newEnd; if (f.member.expiryDate===prev) f.member.expiryDate=f.newEnd; } })()`);
  R.ok('the camp sub still gets corrected', run(ctx, `state.members[0].subscriptions[0].end`) === '2026-08-03');
  R.ok('but the unrelated expiry is left alone', run(ctx, `state.members[0].expiryDate`) === '2026-12-31');
}

R.section('the tool is admin-only + wired to a Camp Members button');
{
  const src = H.readSrc();
  R.ok('fixCampValidity is admin-gated', /window\.fixCampValidity = function[\s\S]{0,120}currentRole\(\) !== 'admin'/.test(src));
  R.ok('it downloads a backup before applying', /Backup & fix all[\s\S]{0,400}downloadBackup\(\)/.test(src));
  R.ok('each fix is audited', /audit\('camp\.fixValidity'/.test(src));
  R.ok('a "Fix camp dates" button is on the Camp Members page (admin only)', /id="campmem-fixvalidity"/.test(src) && /currentRole\(\) === 'admin' \? `<button[^`]*campmem-fixvalidity/.test(src));
  const out = H.renderScreen(H.seed(H.makeCtx({ role: 'admin' })), 'campmembers');
  R.ok('Camp Members renders', out.ok, out.error);
}

R.done();
