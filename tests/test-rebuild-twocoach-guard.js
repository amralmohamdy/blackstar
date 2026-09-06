// v6.549 — "Rebuild from profile" matches invoice lines/subs by SPORT only and rebuilds from enrollments,
// so it CANNOT represent a same-sport TWO-COACH enrolment (one sport under two coaches). Running it on
// such a member collapsed the two coaches into one and mis-billed them (Ezz El-Din: Kick Boxing under Aziz
// AND Abdel Salam — "it messed up the things"). Fix: rebuild now DETECTS the two-coach case and STOPS with
// a clear message (pointing to Edit pricing / Switch review), instead of mangling the data. Single-coach
// members are unaffected.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.549 · rebuild guards the two-coach case');
const src = H.readSrc();

R.section('source');
R.ok('rebuild detects a sport under >1 active coach', /_coachesPerSport\[sp\]\.size > 1/.test(src));
R.ok('and stops with a "not available here" message', /Rebuild not available here/.test(src) && /const _twoCoach = Object\.keys\(_coachesPerSport\)\.filter/.test(src));

R.section('runtime');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`window.__modalTitle=''; window.showModal=function(o){window.__modalTitle=(o&&o.title)||'';}; window.closeModal=function(){}; currentRole=function(){return 'admin';};
    try{ window.downloadBackup=function(){}; }catch(e){}
    state.coaches=[{id:1,name:'Abdel Salam',rate:30},{id:2,name:'Aziz',rate:30}];`);

  // A) two-coach member → rebuild is BLOCKED, data untouched
  run(`state.members=[{id:60,name:'Ezz',expiryDate:'2026-09-15',status:'Active',startDate:'2026-08-16',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:8,price:350},{sport:'MMA',coachId:1,classes:8,price:350}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:2,start:'2026-08-16',end:'2026-09-15',totalClasses:8,amountPaid:350,status:'active'},
        {activity:'Kick Boxing',coachId:1,start:'2026-08-16',end:'2026-09-15',totalClasses:8,amountPaid:350,status:'active'},
        {activity:'MMA',coachId:1,start:'2026-08-16',end:'2026-09-15',totalClasses:8,amountPaid:350,status:'active'}
      ]}];
    state.invoices=[{id:70,ref:'E1',customerId:60,category:'Membership',date:'2026-08-16',month:'2026-08',amount:200,amountPaid:200,lineItems:[{sport:'Kick Boxing',coachId:2,price:200,classes:8}],payments:[{amount:200,date:'2026-08-16'}]}];`);
  const before = run(`JSON.stringify(state.invoices[0].lineItems)`);
  run(`rebuildMemberFromProfile(60)`);
  R.ok('two-coach member: rebuild is BLOCKED (shows "not available")', /not available here/i.test(run(`window.__modalTitle`)));
  R.ok('  and the invoice was NOT modified', run(`JSON.stringify(state.invoices[0].lineItems)`) === before);
  R.ok('  the two Kick Boxing subs are intact (coaches not collapsed)', run(`state.members[0].subscriptions.filter(function(s){return s.activity==='Kick Boxing';}).map(function(s){return String(s.coachId);}).sort().join(',')`) === '1,2');

  // B) single-coach member with a price drift → rebuild PROCEEDS (normal reconcile modal, not the block)
  run(`window.__modalTitle=''; state.members=[{id:61,name:'Solo',expiryDate:'2026-09-15',status:'Active',startDate:'2026-08-01',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:300}],
      subscriptions:[{activity:'Karate',coachId:1,start:'2026-08-01',end:'2026-09-01',totalClasses:8,amountPaid:300,status:'active'}]}];
    state.invoices=[{id:71,ref:'S1',customerId:61,category:'Membership',date:'2026-08-01',month:'2026-08',amount:200,amountPaid:200,lineItems:[{sport:'Karate',coachId:1,price:200,classes:8}],payments:[{amount:200,date:'2026-08-01'}]}];`);
  run(`rebuildMemberFromProfile(61)`);
  R.ok('single-coach member is NOT blocked by the two-coach guard', !/not available here/i.test(run(`window.__modalTitle`)));
}

R.done();
