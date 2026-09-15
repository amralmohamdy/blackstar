// v6.548 — the Edit Member form built its sport rows from `enrollments` only, so an ACTIVE subscription
// with no matching enrollment (a same-sport two-coach enrolment, or a manual coach-change that left the
// second coach only in subscriptions) was INVISIBLE in Edit — even though the member card showed it.
// (Ezz El-Din: card showed Kick Boxing·Aziz + Kick Boxing·Abdel Salam + MMA, but Edit showed only 2.)
// Fix: Edit now also surfaces active, non-switched-away subs that aren't already covered by an enrollment.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.548 · Edit shows every active sport/coach');
const src = H.readSrc();

R.section('source');
R.ok('Edit adds uncovered ACTIVE subs to the rows', /also surface ACTIVE subscriptions that have NO matching enrollment/.test(src) && /_covered\.has\(_key\)\) continue;/.test(src));
R.ok('completed / withdrawn / switched-away subs are NOT re-added', /_st === 'completed' \|\| _st === 'withdrawn' \|\| s\.switchedAwayTo\) continue;/.test(src));

R.section('runtime — editMember row-building');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`window.showModal=function(){}; window.closeModal=function(){}; currentRole=function(){return 'admin';};
    state.coaches=[{id:1,name:'Abdel Salam',rate:30},{id:2,name:'Aziz',rate:30}];
    state.members=[{id:50,name:'Ezz',expiryDate:'2026-09-15',status:'Active',startDate:'2026-08-16',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:8,price:350},{sport:'MMA',coachId:1,classes:8,price:350}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:2,start:'2026-08-16',end:'2026-09-15',totalClasses:8,amountPaid:350,status:'active'},
        {activity:'MMA',coachId:1,start:'2026-08-16',end:'2026-09-15',totalClasses:8,amountPaid:350,status:'active'},
        {activity:'Kick Boxing',coachId:1,start:'2026-08-16',end:'2026-09-15',totalClasses:8,amountPaid:350,status:'active'}
      ]}];`);
  run(`editMember(50)`);
  const rows = run(`(window._enrollRows||[]).map(function(r){return r.sport+'|'+r.coachId;})`);
  R.ok('Edit now shows 3 rows (was 2)', rows.length === 3);
  R.ok('  includes Kick Boxing · Aziz (the sub-only coach)', rows.includes('Kick Boxing|2'));
  R.ok('  includes Kick Boxing · Abdel Salam', rows.includes('Kick Boxing|1'));
  R.ok('  includes MMA · Abdel Salam', rows.includes('MMA|1'));

  // a member whose extra sub is a COMPLETED switch-away must NOT get an extra row
  run(`state.members=[{id:51,name:'Switched',expiryDate:'2026-09-15',status:'Active',startDate:'2026-08-01',
    enrollments:[{sport:'Karate',coachId:1,classes:8,price:300}],
    subscriptions:[
      {activity:'Karate',coachId:2,start:'2026-07-01',end:'2026-08-01',totalClasses:8,amountPaid:300,status:'completed',switchedAwayTo:'Karate'},
      {activity:'Karate',coachId:1,start:'2026-08-09',end:'2026-09-09',totalClasses:8,amountPaid:300,status:'active'}
    ]}];`);
  run(`editMember(51)`);
  const rows2 = run(`(window._enrollRows||[]).map(function(r){return r.sport+'|'+r.coachId;})`);
  R.ok('a completed/switched-away sub is NOT added as a row', rows2.length === 1 && rows2[0] === 'Karate|1');
}

R.done();
