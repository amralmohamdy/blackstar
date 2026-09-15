// v6.554 — the Expiring screen's ATTENDED column counted attendance UNWINDOWED (all present marks
// ever, across every past cycle) but divided by the CURRENT subscription's class limit, so a
// renewed member read e.g. "15/8" (Nada: two Gymnastic cycles, 14 marks total, current limit 8).
// Fix: count only within the CURRENT cycle's window (latest sub + subAttendanceWindow), so it shows
// the current membership's classes (e.g. "6/8") — matching the member card.
const H = require('./qc-harness.js');
const R = H.reporter('EXPIRING · attended = current cycle only');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('attendedBySport uses the latest sub + subAttendanceWindow',
    /const sub = subsSp\.slice\(\)\.sort\(\(a, b\) => \(a\.start \|\| ''\)\.localeCompare\(b\.start \|\| ''\)\)\.slice\(-1\)\[0\];/.test(src)
    && /subAttendanceWindow\(m, sub\)/.test(src));
  R.ok('it counts attendance within that window (win.from/win.to), not null,null',
    /liveAttendanceCount\(m, e\.sport, win\.from, win\.to\)\.y/.test(src));
  R.ok('the old unwindowed count (null, null) is gone from attendedBySport',
    !/liveAttendanceCount\(m, e\.sport, null, null\)/.test(src));
}

R.section('runtime: renewed member with marks in TWO cycles');
{
  const ctx = H.makeCtx({ today: '2026-09-07', role: 'admin' });
  run(ctx, `
    state.coaches = [{id:1,name:'Jennifer',rate:30,active:true}];
    state.invoices = []; state.expenses = []; state.salaries = [];
    state.settings = state.settings || {};
    state.members = [{
      id: 700, name: 'Nada', nameArabic:'ندى', phone:'+97455534813',
      startDate:'2026-08-15', expiryDate:'2026-09-14', status:'Active',
      enrollments:[{sport:'Gymnastic',coachId:1,classes:8,price:350}],
      subscriptions:[
        {activity:'Gymnastic',coachId:1,start:'2026-07-18',end:'2026-08-17',totalClasses:8,status:'active'},
        {activity:'Gymnastic',coachId:1,start:'2026-08-15',end:'2026-09-14',totalClasses:8,status:'active'}
      ],
      // 8 marks in the FIRST (July) cycle + 6 marks in the CURRENT (Sept) cycle = 14 total.
      dailyAttendance:{
        '2026-07':{'Gymnastic':{'18':'Y','19':'Y','20':'Y','21':'Y','22':'Y','25':'Y','26':'Y','27':'Y'}},
        '2026-09':{'Gymnastic':{'01':'Y','02':'Y','03':'Y','04':'Y','05':'Y','06':'Y'}}
      }
    }];
  `);
  // Primitive sanity: unwindowed vs current-cycle window.
  const nums = run(ctx, `(function(){
    var m=state.members[0];
    var cur=(m.subscriptions||[]).slice().sort((a,b)=>(a.start||'').localeCompare(b.start||'')).slice(-1)[0];
    var win=subAttendanceWindow(m,cur);
    return { unwindowed: liveAttendanceCount(m,'Gymnastic',null,null).y,
             current: liveAttendanceCount(m,'Gymnastic',win.from,win.to).y, winFrom:win.from };
  })()`);
  // These two are exactly the inputs attendedBySport now uses (latest sub + its window), so they
  // pin the cell value: attended = 6 (current cycle), planned = 8 → "6/8", never the old "14/8".
  R.ok('unwindowed count is the accumulated 14 (the OLD, wrong basis)', nums.unwindowed === 14, JSON.stringify(nums));
  R.ok('current-cycle window count is 6 (the NEW, correct basis)', nums.current === 6, JSON.stringify(nums));
  R.ok('the two differ → renewed members were being over-counted', nums.unwindowed !== nums.current, JSON.stringify(nums));

  // The screen still renders cleanly with the change (rows are query-injected, so not asserted here).
  const res = H.renderScreen(ctx, 'expiring');
  R.ok('expiring screen renders without error', res.ok, res.error || '');
}

R.done();
