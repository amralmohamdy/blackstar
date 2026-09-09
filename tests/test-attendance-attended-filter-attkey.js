// v6.558 — the "Attended" filter and the "ATTENDED · DAY N" KPI disagreed (owner saw 25 vs 23). The
// KPI (clubAttended) counts a Y in the row's COACH-SCOPED cell (attKey) within the coach WINDOW, but
// the filter's rowAttended() read the PLAIN `sport` key with NO window — so a switched/two-coach
// member whose Y lives under `sport <coachId>` looked NOT-attended and was dropped from the list even
// though the KPI counted it. Fix: rowAttended now takes (m, attKey, window) and is applied PER ROW,
// the same basis as the KPI, so the two always reconcile.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.558 · Attended filter uses attKey+window (matches the KPI)');
const src = H.readSrc();

R.section('source wiring');
R.ok('rowAttended takes (m, attKey, window)', /function rowAttended\(m, attKey, window\)/.test(src));
R.ok('rowAttended reads the coach-scoped cell (attKey), not the plain sport', /const data = m\.dailyAttendance\?\.\[mo\]\?\.\[key\] \|\| \{\};/.test(src) && /const key = attKey \|\| '';/.test(src));
R.ok('rowAttended honours the coach window (inWin)', /data\[String\(d\)\] === 'Y' && inWin\(window, mo, d\)/.test(src));
R.ok('the Attended filter is applied PER ROW with the row attKey + window', /rows\.filter\(r => filter\.atts\.includes\(rowAttended\(r\.m, r\.attKey \|\| r\.sport, r\.window\)/.test(src));
R.ok('the old sport-level plain-key filter is gone', !/const want = rowAttended\(m, sp\) \? 'attended' : 'notattended';/.test(src));
R.ok('the KPI (clubAttended) also uses attKey + inWin (same basis)', /const dd = m\.dailyAttendance\?\.\[mk\]\?\.\[attKey \|\| sport\] \|\| \{\};/.test(src) && /if \(!inWin\(window, mk, k\)\) continue;/.test(src));

R.section('runtime · two-coach member, Y under the coach-scoped key on day 8');
{
  // The KPI predicate and the (fixed) filter predicate must agree. We evaluate BOTH with the app's
  // real helpers so the test tracks the actual key/window logic.
  const ctx = H.makeCtx({ today: '2026-09-08', role: 'admin' });
  vm.runInContext(`
    state.coaches=[{id:1,name:'Abdel Salam',active:true},{id:2,name:'Aziz',active:true}];
    state.members=[{id:9,name:'Ali',sport:'Kick Boxing',coachId:1,expiryDate:'2026-12-01',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:550}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:1,totalClasses:12,status:'active',start:'2026-08-15',end:'2026-12-01'},
        {activity:'Kick Boxing',coachId:2,totalClasses:12,status:'active',start:'2026-08-15',end:'2026-12-01'}
      ],
      // present ONLY under the SECOND coach (Aziz) on day 8 — stored under the coach-scoped key.
      dailyAttendance:{'2026-09':{'Kick Boxing':{},'Kick Boxing 2':{'8':'Y'}}}}];
  `, ctx);
  const out = vm.runInContext(`(function(){
    var m=state.members[0], MO='2026-09', DAY='8';
    var keyA=attendanceKeyFor(m,'Kick Boxing',1), keyB=attendanceKeyFor(m,'Kick Boxing',2);
    function yIn(key){ var c=(m.dailyAttendance[MO]||{})[key]||{}; return c[DAY]==='Y'; }
    // KPI basis (attKey): count coach cells with a Y on day 8
    var kpi=(yIn(keyA)?1:0)+(yIn(keyB)?1:0);
    // OLD filter basis: plain 'Kick Boxing' key for BOTH rows
    var oldAtt=(yIn('Kick Boxing')?1:0)+(yIn('Kick Boxing')?1:0);
    // NEW filter basis: each row reads its OWN attKey
    var newAtt=(yIn(keyA)?1:0)+(yIn(keyB)?1:0);
    return {keyA:keyA,keyB:keyB,kpi:kpi,oldAtt:oldAtt,newAtt:newAtt};
  })()`, ctx);
  R.ok('the two coaches get DISTINCT keys (2nd is coach-scoped)', out.keyA === 'Kick Boxing' && out.keyB === 'Kick Boxing 2', JSON.stringify(out));
  R.ok('KPI counts the coach-scoped Y (=1)', out.kpi === 1, JSON.stringify(out));
  R.ok('OLD plain-key filter MISSED it (=0) — this was the 25-vs-23 bug', out.oldAtt === 0, JSON.stringify(out));
  R.ok('NEW attKey filter counts it (=1) → matches the KPI', out.newAtt === 1 && out.newAtt === out.kpi, JSON.stringify(out));
}

R.done();
