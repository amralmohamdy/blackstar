// v6.540 — Attendance showed "EXPIRED" for a member who had RENEWED. The day-view row resolved the
// sub for its EXPIRED/over-limit badge with `.slice(-1)[0]` — the LAST element of the subscriptions
// array. That array is NOT date-ordered: a renewal can sit before an older short period, so the badge
// grabbed an already-ended sub and flagged EXPIRED even though a current sub covers today (Ali Salem:
// active Kick Boxing Aug 12→Sep 11 sat before a completed Aug 1→7 4-class period → "EXPIRED 4/4").
// Fix: pick the sub whose window COVERS today (latest-starting among those), else the latest-ending.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.540 · attendance EXPIRED-though-renewed');
const src = H.readSrc();

R.section('source');
R.ok('the badge sub is no longer the raw last array element', !/=== String\(coachId\) && !s\.switchedAwayTo\)\.slice\(-1\)\[0\]/.test(src));
R.ok('it prefers the sub whose window covers today', /_rpool\.filter\(s => \(s\.start \|\| ''\) <= TODAY && \(!s\.end \|\| s\.end >= TODAY\)\)/.test(src));
R.ok('else falls back to the latest-ending sub', /_rpool\.slice\(\)\.sort\(\(a, b\) => String\(b\.end \|\| b\.start/.test(src));

R.section('runtime — the renewed member is NOT flagged expired');
{
  const ctx = H.makeCtx({ today: '2026-08-30', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // reproduce Ali Salem: renewal sub sits BEFORE an older ended 4-class period in the array
  const pick = () => run(`(function(){
    var m={subscriptions:[
      {activity:'Kick Boxing',coachId:1,start:'2026-08-12',end:'2026-09-11',totalClasses:12,status:'active'},
      {activity:'Kick Boxing',coachId:1,start:'2026-08-01',end:'2026-08-07',totalClasses:4,status:'active'}
    ]};
    var sport='Kick Boxing', coachId=1, TODAY='2026-08-30';
    var _rpool0=(m.subscriptions||[]).filter(s=>s.activity===sport && String(s.coachId)===String(coachId) && !s.switchedAwayTo);
    var _rpool=_rpool0.length?_rpool0:(m.subscriptions||[]).filter(s=>s.activity===sport && !s.switchedAwayTo);
    var rsub=_rpool.filter(s=>(s.start||'')<=TODAY && (!s.end||s.end>=TODAY)).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||'')))[0]
      || _rpool.slice().sort((a,b)=>String(b.end||b.start||'').localeCompare(String(a.end||a.start||'')))[0];
    return {start:rsub.start,end:rsub.end,total:rsub.totalClasses,ended:!!(rsub.end && rsub.end<TODAY)};
  })()`);
  const r = pick();
  R.ok('picks the active renewal (Aug 12 → Sep 11, 12 cls)', r.start === '2026-08-12' && r.total === 12);
  R.ok('so the row is NOT flagged expired', r.ended === false);

  // a genuinely expired member (all subs ended) still shows expired
  const exp = run(`(function(){
    var subs=[{activity:'KB',coachId:1,start:'2026-06-01',end:'2026-06-30',totalClasses:8}];
    var TODAY='2026-08-30';
    var rsub=subs.filter(s=>(s.start||'')<=TODAY && (!s.end||s.end>=TODAY)).sort((a,b)=>String(b.start||'').localeCompare(String(a.start||'')))[0]
      || subs.slice().sort((a,b)=>String(b.end||b.start||'').localeCompare(String(a.end||a.start||'')))[0];
    return !!(rsub.end && rsub.end<TODAY);
  })()`);
  R.ok('a truly-ended sub still flags EXPIRED (no false negative)', exp === true);
}

R.done();
