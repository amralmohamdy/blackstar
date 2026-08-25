// v6.524 — attendance logs FREELY (no blocking "already attended all N — mark anyway?" confirm), and
// a regular-sport row shows a 🔴 EXPIRED badge when that package is finished (window ended while the
// member is still active, OR all paid classes attended). Camp keeps its own OVER LIMIT flag.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.524 · attendance logs freely + expired-package badge');
const src = H.readSrc();

R.section('source — no blocking prompt, badge wired');
R.ok('the blocking over-cap confirm is gone', !/Mark another present anyway/.test(src));
R.ok('markCell no longer calls confirm for over-cap', !/has already attended all \$\{planned\}/.test(src));
R.ok('a sportOver flag is computed for regular sports', /let sportOver = false, sportPlanned = 0, sportMarked = 0;/.test(src));
R.ok('sportOver = window ended OR all classes attended', /sportOver = _ended \|\| \(sportPlanned > 0 && sportMarked >= sportPlanned\);/.test(src));
R.ok('an EXPIRED badge is built from sportOver', /const sportOverBadge = sportOver/.test(src) && /EXPIRED/.test(src));
R.ok('the badge is rendered in the row name line', /\$\{campOverBadge\}\$\{sportOverBadge\}\$\{renewBadge\}/.test(src));
R.ok('the badge is skipped when the whole member is Expired (no duplicate)', /if \(sport !== SUMMER_CAMP && !isExpired\)/.test(src));

R.section('runtime — Jabr: Kick Boxing package finished (flagged), MMA still active (not flagged)');
{
  const ctx = H.makeCtx({ today: '2026-08-25', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={};
    state.coaches=[{id:14,name:'Iyad',rate:30,role:'coach',active:true},{id:1,name:'Abdel Salam',rate:30,role:'coach',active:true}];
    state.members=[{id:9,name:'Jabr',sport:'Kick Boxing',coachId:1,expiryDate:'2026-08-28',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:5},{sport:'MMA',coachId:1,classes:12}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:14,totalClasses:7,start:'2026-07-13',end:'2026-08-12',status:'completed',transferredToCoachId:1,amountPaid:320.83,_sid:'ki'},
        {activity:'Kick Boxing',coachId:1,totalClasses:5,start:'2026-08-01',end:'2026-08-12',status:'active',switchFunded:true,amountPaid:229.17,_sid:'ka'},
        {activity:'MMA',coachId:1,totalClasses:12,start:'2026-07-29',end:'2026-08-28',status:'active',amountPaid:550,_sid:'mma'}
      ],
      dailyAttendance:{'2026-08':{'Kick Boxing':{'8':'Y','10':'Y','12':'Y','15':'Y','19':'Y'},'MMA':{'10':'Y','12':'Y','15':'Y','19':'Y'}}}}];
  `);
  // Replicate the row's sportOver computation with the REAL helpers, for each (sport, coach) row.
  const sportOver = (sport, coachId) => run(`(function(sport,coachId){
    const m=state.members[0];
    const rsub=(m.subscriptions||[]).filter(s=>(s.activity||'')===sport && String(s.coachId)===String(coachId) && !s.switchedAwayTo).slice(-1)[0]
      || (m.subscriptions||[]).filter(s=>(s.activity||'')===sport && !s.switchedAwayTo).slice(-1)[0];
    if(!rsub) return {over:false};
    const planned=parseInt(rsub.totalClasses)||0;
    const w=subAttendanceWindow(m,rsub);
    const marked=(liveAttendanceCount(m,sport,w.from,w.to).y)||0;
    const ended=!!(rsub.end && rsub.end < TODAY);
    return {over: ended || (planned>0 && marked>=planned), planned, marked, ended};
  })(${JSON.stringify(sport)}, ${coachId})`);

  const kb = sportOver('Kick Boxing', 1);
  R.ok('Kick Boxing package is FINISHED → flagged', kb.over === true, JSON.stringify(kb));
  R.ok('  because its window ended (Aug 12 < today) or 5/5 attended', kb.ended === true && kb.marked === 5 && kb.planned === 5, JSON.stringify(kb));

  const mma = sportOver('MMA', 1);
  R.ok('MMA is still active (window to Aug 28, 4/12) → NOT flagged', mma.over === false, JSON.stringify(mma));
}

R.section('runtime — an active member with classes remaining and open window is not flagged');
{
  const ctx = H.makeCtx({ today: '2026-08-25', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'Fresh',sport:'Karate',coachId:1,expiryDate:'2026-12-01',status:'Active',
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',end:'2026-12-01',status:'active',amountPaid:600,_sid:'k'}],
      dailyAttendance:{'2026-08':{'Karate':{'5':'Y','10':'Y'}}}}];
  `);
  const k = run(`(function(){const m=state.members[0];const rsub=m.subscriptions[0];const planned=parseInt(rsub.totalClasses)||0;const w=subAttendanceWindow(m,rsub);const marked=(liveAttendanceCount(m,'Karate',w.from,w.to).y)||0;const ended=!!(rsub.end&&rsub.end<TODAY);return ended||(planned>0&&marked>=planned);})()`);
  R.ok('2/8 attended, window open → NOT flagged expired', k === false);
}

R.done();
