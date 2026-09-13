// v6.498 — the Transfer-students split must find a sub's invoice line even when the sub's stored
// invoiceNumber is STALE (a regenerated invoice got a new ref). Before, the line wasn't found, only the
// SUB's class count was capped, and the un-shrunk 12-class line paid the OLD coach a DOUBLED per-class
// (Adham: 500/6 not 500/12 → +12.50 over-credit). Now it falls back to a Membership invoice with a
// matching sport+coach line (renewal disambiguated by date). Verified on the real backup: grand total
// conserved (delta 0.00), and the departed coach's date-expired subs are stamped 'expired'.
const H = require('./qc-harness.js');
const R = H.reporter('TRANSFER · robust invoice match on a stale ref');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('the transfer wires the robust lookup + expiry stamp');
ok('falls back to a sport+coach invoice line when the ref match fails', /const cands = \(state\.invoices \|\| \[\]\)\.filter\(v => [\s\S]{0,220}l\.sport === sport && _sameC\(l\.coachId, fromId\)/.test(src));
ok('disambiguates a renewal by closest invoice date', /Math\.abs\(\(Date\.parse\(a\.date\) \|\| 0\) - \(Date\.parse\(sub\.start\) \|\| 0\)\)/.test(src));
ok('stamps the departed coach’s date-expired active subs as expired', /String\(sub\.end\)\.slice\(0, 10\) < eff && \(sub\.status \|\| ''\)\.toLowerCase\(\) === 'active' && !sub\.switchedAwayTo\) sub\.status = 'expired';/.test(src));

R.section('runtime: stale sub.invoiceNumber → old coach NOT over-credited');
const ctx = H.makeCtx({ today: '2026-08-13' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[{id:14,name:'Old',rate:100,role:'coach',active:'N'},{id:1,name:'New',rate:100,role:'coach',active:'Y'}]; state.settings={commissionBasis:'attendance'};");
// sub names INV-STALE, but the real invoice ref is INV-REAL (only sport+coach line matches)
run(`state.members=[{id:9,name:'M',startDate:'2026-07-20',
  enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:500}],
  subscriptions:[{_sid:'s',activity:'Kick Boxing',coachId:14,coach:'Old',totalClasses:12,amountPaid:500,start:'2026-07-20',end:'2026-08-19',status:'active',invoiceNumber:'INV-STALE'}],
  dailyAttendance:{'2026-08':{'Kick Boxing':{'1':'Y'}},'2026-07':{'Kick Boxing':{'22':'Y','25':'Y','27':'Y','29':'Y'}}}}];`);
run("state.invoices=[{id:1,ref:'INV-REAL',customerId:9,date:'2026-07-20',month:'2026-07',category:'Membership',activityType:'subscription',coachId:14,amount:500,payments:[{amount:500,date:'2026-07-20',method:'cash'}],lineItems:[{sport:'Kick Boxing',coachId:14,classes:12,price:500}]}];");
run("render=function(){}; downloadBackup=function(){}; confirmSaved=function(){}; toast=function(){}; assertCloudWritable=function(){return true;}; save=function(){};");
run("var __qs=document.querySelector.bind(document); document.querySelector=function(sel){ if(sel==='#tr-to') return {value:'1'}; if(sel==='#tr-date') return {value:'2026-08-13'}; return __qs(sel); };");
const gBefore = run("Math.round((((computeMonthlyPay(14,'2026-08')||{}).net||0)+(((computeMonthlyPay(1,'2026-08')||{}).net)||0))*100)/100");
run("globalThis.__cap=null; showModal=function(cfg){ globalThis.__cap=cfg; }; transferCoachStudents(14); var act=(__cap.actions||[]).find(function(a){return /Transfer & split/.test(a.label);}); if(act) act.onclick();");
const gAfter = run("Math.round((((computeMonthlyPay(14,'2026-08')||{}).net||0)+(((computeMonthlyPay(1,'2026-08')||{}).net)||0))*100)/100");
ok('the REAL invoice line was found + split despite the stale ref', /INV-REAL/.test(run("JSON.stringify(state.invoices.map(function(i){return i.ref+':'+i.lineItems.map(function(l){return l.coachId+'x'+l.classes;}).join(',');}))")));
const lineParts = run("JSON.stringify(state.invoices[0].lineItems.map(function(l){return l.coachId+':'+l.price+'x'+l.classes;}))");
ok('old-coach line shrunk to attended classes (not left at 12)', /14:[\d.]+x[45]\b/.test(lineParts) && !/14:[\d.]+x12\b/.test(lineParts));
ok('grand August net conserved (no doubled per-class)', Math.abs(gAfter - gBefore) < 0.5);

R.done();
