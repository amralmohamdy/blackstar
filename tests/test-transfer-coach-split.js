// v6.495 — Staff-screen "Transfer students" now SPLITS each active course like a switch: the old
// coach's sub becomes COMPLETED at the classes ATTENDED (paid that share), a new ACTIVE sub for the
// new coach takes the REMAINING classes, and the invoice line is split. It also finally updates
// SUBSCRIPTIONS (the old code only moved enrollments/primary). Verified on the real backup: Kordi's
// Kick Boxing → Iyad completed 6cls/250 + Abdel Salam active 6cls/250, no commission double-count.
const H = require('./qc-harness.js');
const R = H.reporter('STAFF · transfer students splits each course');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('the transfer wires the split');
ok('operates on SUBSCRIPTIONS (not just enrollments)', /for \(const sub of \(m\.subscriptions \|\| \[\]\)\.slice\(\)\)/.test(src));
ok('skips finished courses (completed/withdrawn/switched/EXPIRED)', /!\(s\.end && String\(s\.end\)\.slice\(0, 10\) < TODAY\)/.test(src));
ok('coachId compares are String-normalized', /const _sameC = \(a, b\) => String\(a\) === String\(b\);/.test(src));
ok('old sub → completed at attended, paid its share', /sub\.totalClasses = attended; sub\.status = 'completed'; sub\.amountPaid = aShare;/.test(src));
ok('new sub → remaining classes, active, new coach', /activity: sport, coachId: to\.id[\s\S]{0,80}totalClasses: remaining[\s\S]{0,80}status: 'active'/.test(src));
ok('invoice line is split (old aShare/attended + new bShare/remaining)', /line\.price = aShare; line\.classes = attended;/.test(src));
ok('findSubForLine prefers the line coach (no double-count on a split invoice)', /s\.invoiceNumber === inv\.ref && s\.activity === li\.sport && \(li\.coachId == null \|\| String\(s\.coachId\) === String\(li\.coachId\)\)/.test(src));

R.section('runtime: a clean split conserves commission');
const ctx = H.makeCtx({ today: '2026-08-13' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[{id:1,name:'Old',rate:100,role:'coach',active:'Y'},{id:2,name:'New',rate:100,role:'coach',active:'Y'}];");
run("state.settings={commissionBasis:'attendance'};");
run(`state.members=[{id:9,name:'M',startDate:'2026-07-29',
  enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:500}],
  subscriptions:[{_sid:'a',activity:'Kick Boxing',coachId:1,totalClasses:12,amountPaid:500,start:'2026-07-29',end:'2026-08-28',status:'active',invoiceNumber:'INV1'}],
  dailyAttendance:{'2026-08':{'Kick Boxing':{'1':'Y','3':'Y','8':'Y','10':'Y','12':'Y'}},'2026-07':{'Kick Boxing':{'29':'Y'}}}}];`);
run("state.invoices=[{id:1,ref:'INV1',customerId:9,date:'2026-07-29',month:'2026-07',category:'Membership',activityType:'subscription',coachId:1,amount:500,amountPaid:500,payments:[{amount:500,date:'2026-07-29',method:'cash'}],lineItems:[{sport:'Kick Boxing',coachId:1,classes:12,price:500}]}];");
run("render=function(){}; downloadBackup=function(){}; confirmSaved=function(){}; toast=function(){}; assertCloudWritable=function(){return true;};");
run("var __qs=document.querySelector.bind(document); document.querySelector=function(sel){ if(sel==='#tr-to') return {value:'2'}; if(sel==='#tr-date') return {value:'2026-08-13'}; return __qs(sel); };");
const beforeSum = run("Math.round((((computeMonthlyPay(1,'2026-08')||{}).net||0)+(((computeMonthlyPay(2,'2026-08')||{}).net)||0))*100)/100");
run("globalThis.__cap=null; showModal=function(cfg){ globalThis.__cap=cfg; }; transferCoachStudents(1); var act=(__cap.actions||[]).find(function(a){return /Transfer & split/.test(a.label);}); if(act) act.onclick();");
const kb = JSON.parse(run("JSON.stringify((state.members[0].subscriptions||[]).filter(s=>s.activity==='Kick Boxing').map(s=>({c:s.coachId,st:s.status,tot:s.totalClasses,paid:s.amountPaid})))"));
ok('old sub completed at 6 attended, paid 250', kb.some(s => s.c === 1 && s.st === 'completed' && s.tot === 6 && s.paid === 250));
ok('new sub active with 6 remaining, paid 250, new coach', kb.some(s => s.c === 2 && s.st === 'active' && s.tot === 6 && s.paid === 250));
const lines = run("JSON.stringify((state.invoices[0].lineItems||[]).filter(l=>l.sport==='Kick Boxing').map(l=>l.coachId+':'+l.price+'x'+l.classes))");
ok('invoice line split 1:250x6 + 2:250x6', /1:250x6/.test(lines) && /2:250x6/.test(lines));
const afterSum = run("Math.round((((computeMonthlyPay(1,'2026-08')||{}).net||0)+(((computeMonthlyPay(2,'2026-08')||{}).net)||0))*100)/100");
ok('grand August net is conserved (no double-count)', Math.abs(afterSum - beforeSum) < 0.5);
ok('new coach August net is unchanged (remaining pends, not earned yet)', run("Math.round(((computeMonthlyPay(2,'2026-08')||{}).net||0)*100)/100") === 0);

R.done();
