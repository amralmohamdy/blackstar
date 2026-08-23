// v6.494 — SWITCH SPORT correctness. Two bugs made a switch leave the OLD coach on the full fee and
// the destination sport NOT sized to the remaining classes:
//   (1) `from` is a LIVE reference into m.enrollments; the enrollment update rewrote from.sport /
//       from.coachId to the destination BEFORE the subscription block read them, so the source sub
//       was looked up by the NEW sport → never found → never marked "switched", no dest sub created.
//   (2) coachId compared with strict === (a string coachId vs a number, common in imports) failed the
//       source-sub / dest-sub / enrollment / credited-base lookups.
// Fix: capture the source sport/coach BEFORE the enrollment mutation, and normalize every coachId
// comparison with String(). Verified live in the browser with a MIXED-type member: source Karate
// completed @3 (300), dest Boxing sized to 5 (500), old coach 300, new coach 500, under both bases.
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH · source captured before mutation + coachId normalized');
const ok = (n, c) => R.ok(n, c);

// ---- source: the fixes are wired ----
const src = H.readSrc();
R.section('capture the source sport/coach before the enrollment is mutated');
ok('captures _fromSport / _fromCoachId', /const _fromSport = from\.sport, _fromCoachId = from\.coachId;/.test(src));
ok('enrollment lookup uses the captured source', /m\.enrollments\.findIndex\(e => e\.sport === _fromSport && _sameCoach\(e\.coachId, _fromCoachId\)\)/.test(src));
ok('source-sub lookup uses the captured source (not the mutated from.*)', /m\.subscriptions\.find\(s => \(s\.activity \|\| ''\) === _fromSport && _sameCoach\(s\.coachId, _fromCoachId\)/.test(src));
ok('legacy primary lookup uses the captured source', /if \(m\.sport === _fromSport && _sameCoach\(m\.coachId, _fromCoachId\)\)/.test(src));

R.section('coachId comparisons are String-normalized');
ok('switch uses a String() coach comparator', /const _sameCoach = \(a, b\) => String\(a\) === String\(b\);/.test(src));
ok('dest-sub lookup normalizes coachId', /\(s\.activity \|\| ''\) === toSport && _sameCoach\(s\.coachId, finalToCoachId\)/.test(src));
ok('coachBaseForSport normalizes line coachId', /String\(li\.coachId\) === String\(coachId\)/.test(src));

R.section('v6.520 — source paid = earned share AND its class total IS capped (invoice is now split in place)');
ok('source amountPaid set to the earned share', /srcSub\.amountPaid = aShare;/.test(src));
ok('source totalClasses IS capped to attended (v6.520 reconciled split)', /srcSub\.totalClasses = attendedA;/.test(src));
ok('dest sub amountPaid set to the transferred share', /destSub\.amountPaid = _destPrice;/.test(src));
ok('dest sub totalClasses = the remaining classes', /destSub\.totalClasses = _remainingCls;/.test(src));

// ---- runtime: the salary engine pays a properly-switched member correctly (both bases) ----
R.section('salary engine: old coach = attended share, new coach = remaining');
const ctx = H.makeCtx({ today: '2026-08-20' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[{id:1,name:'Old',rate:100,role:'coach',active:true},{id:2,name:'New',rate:100,role:'coach',active:true}];");
run(`state.members=[{id:701,name:'Sw',startDate:'2026-08-01',
  enrollments:[{sport:'Boxing',coachId:2,classes:5,price:500,switchedInto:true}],
  subscriptions:[
    {_sid:'a',activity:'Karate',coachId:1,totalClasses:8,amountPaid:300,start:'2026-08-01',end:'2026-09-01',status:'completed',switchedAwayTo:'Boxing',switchedAt:'2026-08-10'},
    {_sid:'b',activity:'Boxing',coachId:2,totalClasses:5,amountPaid:500,start:'2026-08-10',end:'2026-09-01',status:'active',switchFunded:true}],
  sportSwitches:[{id:'s1',date:'2026-08-10',fromSport:'Karate',fromCoachId:1,toSport:'Boxing',toCoachId:2,
    snapshot:{attendedByOld:3,totalClasses:8,originalPrice:800,aShare:300,bShare:500,switchMonth:'2026-08'}}],
  dailyAttendance:{'2026-08':{'Karate':{'02':'Y','04':'Y','06':'Y'}}}}];`);
run(`state.invoices=[
  {id:1,customerId:701,date:'2026-08-01',month:'2026-08',category:'Membership',activityType:'subscription',coachId:1,amount:800,amountPaid:800,payments:[{amount:800,date:'2026-08-01',method:'cash'}],lineItems:[{sport:'Karate',coachId:1,classes:8,price:800}]},
  {id:2,customerId:701,date:'2026-08-10',month:'2026-08',category:'Membership',activityType:'switch-credit',switchCredit:true,amount:0,lineItems:[{sport:'Karate',coachId:1,classes:-5,price:-500},{sport:'Boxing',coachId:2,classes:5,price:500}]}];`);
function pay(basis){ run("state.settings={commissionBasis:'"+basis+"'};"); return [run("(computeMonthlyPay(1,'2026-08')||{}).net"), run("(computeMonthlyPay(2,'2026-08')||{}).net")]; }
const [op,np] = pay('payment');
ok('by-payment: old coach = 300 (attended 3/8×800)', op === 300);
ok('by-payment: new coach = 500 (remaining)', np === 500);
const [oa,na] = pay('attendance');
ok('by-attendance: old coach = 300', oa === 300);
ok('by-attendance: new coach = 500', na === 500);

R.done();
