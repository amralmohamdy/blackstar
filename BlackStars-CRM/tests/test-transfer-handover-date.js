// v6.501 — a coach-transfer split must judge "active" as of the HANDOVER date, not today. A back-dated
// handover (Iyad's last day = 31 Jul, done on 15 Aug) must still split a sub that was active on 31 Jul
// but has expired since (end 7 Aug) — else its August classes wrongly keep crediting the departed coach.
const H = require('./qc-harness.js');
const R = H.reporter('TRANSFER · eligibility judged at the handover date');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

ok('the split uses an effective-date eligibility helper', /const _eligibleAtEff = \(s\) =>[\s\S]{0,180}!\(s\.end && String\(s\.end\)\.slice\(0, 10\) < eff\)/.test(src));
ok('the split loop uses _eligibleAtEff (not the TODAY-based _isActiveSub)', /if \(!_sameC\(sub\.coachId, fromId\) \|\| !_eligibleAtEff\(sub\)\) continue;/.test(src));

R.section('runtime: a sub that expired AFTER the handover still splits');
const ctx = H.makeCtx({ today: '2026-08-15' });   // "today" is well after the handover + the sub's end
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[{id:14,name:'Old',rate:100,role:'coach',active:'N'},{id:1,name:'New',rate:100,role:'coach',active:'Y'}]; state.settings={commissionBasis:'attendance'};");
// Sub active on 31 Jul but ended 7 Aug (expired by 15 Aug 'today')
run(`state.members=[{id:9,name:'M',startDate:'2026-07-10',
  enrollments:[{sport:'Kick Boxing',coachId:1,classes:8,price:400}],
  subscriptions:[{_sid:'s',activity:'Kick Boxing',coachId:14,coach:'Old',totalClasses:8,amountPaid:400,start:'2026-07-10',end:'2026-08-07',status:'active',invoiceNumber:'A'}],
  dailyAttendance:{'2026-07':{'Kick Boxing':{'11':'Y','18':'Y'}},'2026-08':{'Kick Boxing':{'3':'Y','5':'Y'}}}}];`);
run("state.invoices=[{id:1,ref:'A',customerId:9,date:'2026-07-10',month:'2026-07',category:'Membership',activityType:'subscription',coachId:14,amount:400,payments:[{amount:400}],lineItems:[{sport:'Kick Boxing',coachId:14,classes:8,price:400}]}];");
run("render=function(){};downloadBackup=function(){};confirmSaved=function(){};toast=function(){};assertCloudWritable=function(){return true};save=function(){};");
run("var __qs=document.querySelector.bind(document);document.querySelector=function(sel){if(sel==='#tr-to')return{value:'1'};if(sel==='#tr-date')return{value:'2026-07-31'};return __qs(sel)};");
run("globalThis.__cap=null;showModal=function(cfg){globalThis.__cap=cfg};transferCoachStudents(14);var a=(__cap.actions||[]).find(function(x){return /Transfer & split/.test(x.label)});if(a)a.onclick();");
const subs = JSON.parse(run("JSON.stringify(state.members[0].subscriptions.filter(function(s){return s.activity==='Kick Boxing'}).map(function(s){return s.coachId+'/'+s.status+'/'+s.totalClasses}))"));
ok('the expired-since sub WAS split (old completed @ attended)', subs.some(s => s === '14/completed/2'));
ok('a new active sub exists for the new coach (remaining)', subs.some(s => /^1\/active\//.test(s)));
ok('no sub is left active on the departed coach', !subs.some(s => /^14\/active/.test(s)));
// the 2 August classes (after the 31 Jul handover) credit the NEW coach, not the old
ok('old coach earns only the pre-handover (July) classes', run("(computeMonthlyPay(14,'2026-08')||{}).base") === 0 || run("Math.round((computeMonthlyPay(14,'2026-08')||{}).base||0)") < 60);

R.done();
