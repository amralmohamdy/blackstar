// v6.458 — a CUSTOM Summer Camp package expires on the Nth camp-day (its typed day count, Sun–Thu),
// NOT the "1 month" default it was inheriting. Reported: Hossam Awadalla — a 12-day custom pass from
// Wed 5 Aug showed expiry 3 Sept (the 22nd camp-day) instead of Thu 20 Aug (the 12th). Presets are
// unchanged (they keep their editable calendar validity).
const H = require('./qc-harness.js');
const R = H.reporter('CUSTOM CAMP EXPIRY · Nth camp-day, not the preset default');
const run = (c, s) => H.vm.runInContext(s, c);
const ctx = H.makeCtx({ role: 'admin', today: '2026-08-05' });

R.section('rowEndDate — the shared helper');
{
  R.ok('CUSTOM camp 12 days from 5 Aug → 20 Aug (12th camp-day)',
    run(ctx, `rowEndDate(SUMMER_CAMP, '2026-08-05', 30, 12, 'Custom', true)`) === '2026-08-20');
  R.ok('PRESET 1-month (validity 30) → 3 Sept (UNCHANGED — editable validity preserved)',
    run(ctx, `rowEndDate(SUMMER_CAMP, '2026-08-05', 30, 22, '1 month', false)`) === '2026-09-03');
  R.ok('CUSTOM 7 days from 5 Aug → 13 Aug (7th camp-day)',
    run(ctx, `rowEndDate(SUMMER_CAMP, '2026-08-05', 30, 7, 'Custom', true)`) === '2026-08-13');
  R.ok('non-camp uses plain calendar validity (+30 → 4 Sept)',
    run(ctx, `rowEndDate('Boxing', '2026-08-05', 30, 8, null, false)`) === '2026-09-04');
  R.ok('custom with no class count falls back to the preset window (no crash)',
    !!run(ctx, `rowEndDate(SUMMER_CAMP, '2026-08-05', 30, 0, 'Custom', true)`));
}

R.section('subscriptionValidEnd derives a Custom camp correctly when no end is stored');
{
  R.ok('NEW custom camp (no stored end) → 20 Aug',
    run(ctx, `subscriptionValidEnd({ activity: SUMMER_CAMP, start: '2026-08-05', totalClasses: 12, durationLabel: 'Custom' })`) === '2026-08-20');
  R.ok('a STORED end still wins (admin override respected)',
    run(ctx, `subscriptionValidEnd({ activity: SUMMER_CAMP, start: '2026-08-05', end: '2026-09-03', totalClasses: 12, durationLabel: 'Custom' })`) === '2026-09-03');
}

R.section('deriveMemberDates / enrolment sync store the Custom camp end correctly');
{
  const exp = run(ctx, `deriveMemberDates([{ sport: SUMMER_CAMP, start: '2026-08-05', validity: 30, classes: 12, durationLabel: 'Custom' }], null).expiryDate`);
  R.ok('member expiry from a 12-day custom camp = 20 Aug', exp === '2026-08-20', exp);
}

R.section('the "Fix camp dates" tool corrects an already-wrong stored record');
{
  run(ctx, `state.members = [{ id:1, name:'Hossam', subscriptions:[
    { activity: SUMMER_CAMP, start:'2026-08-05', end:'2026-09-03', totalClasses:12, durationLabel:'Custom' } ]}];`);
  const fix = run(ctx, `_campValidityFixes().map(f => f.oldEnd + '->' + f.newEnd)[0]`);
  R.ok('flags Hossam 2026-09-03 → 2026-08-20', fix === '2026-09-03->2026-08-20', fix);
}

R.section('source: the key camp-end sites route through rowEndDate / the class-day count');
{
  const src = H.readSrc();
  R.ok('rowEndDate helper exists', /function rowEndDate\(sport, start, validity, classCount, durationLabel, isCustomFlag\)/.test(src));
  R.ok('rowEndDate uses campEndDateFromClasses for a Custom camp', /if \(custom\) \{[\s\S]{0,160}campEndDateFromClasses\(start, cc\)/.test(src));
  R.ok('the enrolment→sub sync uses rowEndDate', /sub\.end = rowEndDate\(e\.sport, eStart, eValidity/.test(src));
  R.ok('deriveMemberDates uses rowEndDate', /return rowEndDate\(e\.sport, st, v, e\.classes/.test(src));
  R.ok('subscriptionValidEnd handles a Custom camp before the preset path', /if \(sub\.durationLabel === 'Custom'\) \{[\s\S]{0,160}campEndDateFromClasses\(sub\.start, cc\)/.test(src));
}

R.done();
