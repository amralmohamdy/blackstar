// v6.490 — Editing a Summer Camp's class count must actually change its class-day LIMIT.
// subClassLimit derives a camp's limit from its duration LABEL ("1 week"→5) and IGNORES
// totalClasses, so the ✎ Edit (which only wrote totalClasses) had NO effect on a preset camp:
// Hossam's 7-working-day camp (5→13 Aug, 415 QAR) was stored as "1 week" (=5), so it read 5/5
// "completed" instead of 5/7 "active". The fix marks the camp CUSTOM when the edited count no
// longer matches the label, so subClassLimit honours the edited count.
const H = require('./qc-harness.js');
const R = H.reporter('CAMP · edit class count takes effect (Custom)');
const ok = (n, c) => R.ok(n, c);

// ---- runtime: subClassLimit behaviour ----
const ctx = H.makeCtx({ today: '2026-08-12' });
ok('app + pages loaded clean', !ctx.__loadError);
const SCL = ctx.subClassLimit;
ok('subClassLimit exists', typeof SCL === 'function');

// The TRAP the bug rode on: a preset label overrides totalClasses.
ok('preset "1 week" camp limit is 5 even with totalClasses=7 (label wins)',
   SCL({ activity: 'Summer Camp', durationLabel: '1 week', totalClasses: 7 }) === 5);
// After the fix marks it Custom, the edited count is honoured.
ok('Custom camp limit follows totalClasses (7)',
   SCL({ activity: 'Summer Camp', durationLabel: 'Custom', totalClasses: 7 }) === 7);
ok('Custom camp with 7 classes → 5 attended is NOT completed (5 < 7)',
   5 < SCL({ activity: 'Summer Camp', durationLabel: 'Custom', totalClasses: 7 }));

// ---- reproduce the exact save decision from editSubscription ----
function markCustomIfOffLabel(sub, cls) {
  if ((sub.activity || '') === 'Summer Camp') {
    const labelClasses = (sub.durationLabel && sub.durationLabel !== 'Custom')
      ? ctx.campClassCount(ctx.campDaysForLabel(sub.durationLabel)) : null;
    if (labelClasses == null || labelClasses !== cls) sub.durationLabel = 'Custom';
  }
  sub.totalClasses = cls;
  return sub;
}
const hossam = markCustomIfOffLabel({ activity: 'Summer Camp', durationLabel: '1 week', totalClasses: 5 }, 7);
ok('editing 5→7 on a "1 week" camp flips it to Custom', hossam.durationLabel === 'Custom');
ok('after the edit the limit is 7 → 5/7 stays active', SCL(hossam) === 7);
// A no-op edit that still matches the label keeps the preset (no needless Custom churn).
const keep = markCustomIfOffLabel({ activity: 'Summer Camp', durationLabel: '1 week', totalClasses: 5 }, 5);
ok('editing a "1 week" camp back to its own 5 classes keeps the preset label', keep.durationLabel === '1 week');

// ---- source: the handler wires this in ----
const src = H.readSrc();
ok('editSubscription marks a camp Custom when off-label', /if \(labelClasses == null \|\| labelClasses !== cls\) sub\.durationLabel = 'Custom';/.test(src));
ok('the guard is scoped to Summer Camp', /if \(\(sub\.activity \|\| ''\) === SUMMER_CAMP\) \{[\s\S]{0,400}sub\.durationLabel = 'Custom';/.test(src));
ok('enrollment durationLabel is kept in sync', /enr\.durationLabel = 'Custom';/.test(src));

R.done();
