// v6.518 — switch-audit batch 2:
//  (A) computeAttendanceCommission matched a line's coachId with strict !==, so a coach whose id
//      arrives as a different type (e.g. Zakaria's 16-digit id passed as a string) silently earned 0.
//      Now String()-compared.
//  (B) rebuildInvoicesFromSubs rebuilds ONLY from subscriptions, so a PAID sport that lives on an
//      invoice but has no matching subscription would be DELETED (Bakhit's Zakaria Karate). Now the
//      rebuild is BLOCKED with a warning when that would drop a paid sport.
const H = require('./qc-harness.js');
const R = H.reporter('v6.518 · switch review batch 2 (String coachId + rebuild guard)');
const src = H.readSrc();

R.section('A — commission coachId is String()-compared');
R.ok('the line-coachId match uses String() both sides', /if \(String\(li\.coachId\) !== String\(coachId\)\) continue;/.test(src));
R.ok('the old strict !== is gone', !/if \(li\.coachId !== coachId\) continue;/.test(src));

R.section('A runtime — a 16-digit coachId passed as a STRING still credits the coach');
{
  const ctx = H.makeCtx({ today: '2026-08-23', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.settings={commissionBasis:'attendance',commissionStartDate:''};`);
  run(`state.coaches=[{id:1786467253863679,name:'Zakaria',active:'Y',role:'coach'}];`);
  run(`state.members=[{id:9,name:'M',sport:'Karate',coachId:1786467253863679,expiryDate:'2026-12-01',
    subscriptions:[{activity:'Karate',coachId:1786467253863679,totalClasses:5,status:'active',start:'2026-08-01',end:'2026-12-01',amountPaid:270.83}],
    dailyAttendance:{'2026-08':{'Karate':{'18':'Y','20':'Y'}}}}];`);
  run(`state.invoices=[{id:1,ref:'A',customerId:9,date:'2026-08-01',month:'2026-08',category:'Membership',activityType:'subscription',coachId:1786467253863679,amount:270.83,payments:[{amount:270.83}],lineItems:[{sport:'Karate',coachId:1786467253863679,classes:5,price:270.83}]}];`);
  // pass the coachId as a STRING (the failure mode)
  const asString = run(`Math.round((computeAttendanceCommission('1786467253863679','2026-08').base||0)*100)/100`);
  const asNumber = run(`Math.round((computeAttendanceCommission(1786467253863679,'2026-08').base||0)*100)/100`);
  R.ok('string coachId now earns > 0 (was 0 before the fix)', asString > 0, 'got ' + asString);
  R.ok('string and number coachId give the SAME result', asString === asNumber, `str ${asString} vs num ${asNumber}`);
}

R.section('B — rebuild guard (source)');
R.ok('rebuild detects a paid invoice sport with no matching subscription', /a PAID sport that lives\s*\n?\s*\/\/ on an invoice but has NO matching subscription/.test(src) || /paid sport that lives on an invoice but has NO matching subscription/i.test(src));
R.ok('it BLOCKS the rebuild (returns) instead of dropping the sport', /Rebuild blocked — a paid sport has no subscription/.test(src));
R.ok('the guard builds a subscription-key set and flags orphans', /const _subKey = new Set\(\(m\.subscriptions \|\| \[\]\)\.map/.test(src) && /_orphan\.push/.test(src));

R.done();
