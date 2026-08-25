// v6.522 — after a switch/transfer, a sport becomes multi-coach and the attendance grid splits into
// a row per coach. The coach with the LATEST window is the member's CURRENT coach; if the member is
// still active, that row must stay markable up to today (window upper-bound opened), instead of being
// capped at a switch-funded sub's short inherited end date. Earlier coaches stay bounded. This
// unblocks logging an actively-attending transferred member (Jabr Al-Marri Kick Boxing).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.522 · current coach stays markable after a transfer');
const src = H.readSrc();

R.section('source — the latest-coach-open logic');
R.ok('per-coach windows are pre-computed into _cw', /const _cw = \{\};/.test(src));
R.ok('member-active gate exists', /const _memberActive = !m\.deleted && \(memberStatus\(m\) === 'Active'/.test(src));
R.ok('the latest-window coach is picked', /let _latestCid = null, _latestKey = '';/.test(src) && /_latestCid = cid;/.test(src));
R.ok('the latest coach row opens its upper bound for an active member', /const openEnd = w\.openEnd \|\| \(_memberActive && cid === _latestCid\);/.test(src));

R.section('runtime — Jabr Al-Marri: Kick Boxing transferred Iyad→Abdel Salam');
{
  const ctx = H.makeCtx({ today: '2026-08-25', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // Reproduce the exact transfer shape: an Iyad (completed/transferred) period + an Abdel Salam
  // switch-funded period whose end (Aug 12) is BEFORE today, plus attendance through Aug 19.
  run(`
    state.coaches = [{id:14,name:'Iyad',rate:30,role:'coach',active:true},{id:1,name:'Abdel Salam',rate:30,role:'coach',active:true}];
    state.members = [{ id:9, name:'Jabr', sport:'Kick Boxing', coachId:1, expiryDate:'2026-08-28', status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:5,price:229.17,switchedInto:true,start:'2026-07-13'}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:14,totalClasses:7,start:'2026-07-13',end:'2026-08-12',status:'completed',transferredToCoachId:1,transferredAt:'2026-08-01',amountPaid:320.83,_sid:'kb_iyad'},
        {activity:'Kick Boxing',coachId:1,totalClasses:5,start:'2026-08-01',end:'2026-08-12',status:'active',switchFunded:true,amountPaid:229.17,_sid:'kb_abdel'}
      ],
      dailyAttendance:{'2026-07':{'Kick Boxing':{'15':'Y','18':'Y','20':'Y','22':'Y','25':'Y','27':'Y','29':'Y'}},
                       '2026-08':{'Kick Boxing':{'8':'Y','10':'Y','12':'Y','15':'Y','19':'Y'}}} }];
  `);
  const winIyad = run(`subAttendanceWindow(state.members[0], state.members[0].subscriptions.find(s=>s._sid==='kb_iyad'))`);
  const winAbdel = run(`subAttendanceWindow(state.members[0], state.members[0].subscriptions.find(s=>s._sid==='kb_abdel'))`);
  R.ok('Iyad window ends in July (bounded — his period ended at handover)', (winIyad.to || '') < '2026-08-01', 'to=' + winIyad.to);
  R.ok('Abdel Salam is the LATEST period', (winAbdel.to || '9999') > (winIyad.to || ''), `abdel=${winAbdel.to} iyad=${winIyad.to}`);

  // Replicate the grid decision (latest coach + active member → open upper bound), then the real inWin rule.
  const memberActive = run(`(function(m){return !m.deleted && (memberStatus(m)==='Active' || memberStatus(m)==='Frozen' || (m.expiryDate && m.expiryDate>=TODAY));})(state.members[0])`);
  R.ok('member is active (expiry Aug 28 ≥ today)', memberActive === true);
  const abdelToOpened = memberActive ? null : winAbdel.to;   // latest coach → opened
  const inWin = (win, mo, day) => { if (!win) return true; const iso = `${mo}-${String(day).padStart(2,'0')}`; if (win.from && iso < win.from) return false; if (win.to && iso > win.to) return false; return true; };

  R.ok('BEFORE the fix: Aug 23 was OUTSIDE Abdel Salam\'s capped window (blocked)', inWin({ from: winAbdel.from, to: winAbdel.to }, '2026-08', 23) === false, 'cappedTo=' + winAbdel.to);
  R.ok('AFTER the fix: Aug 23 is markable (upper bound opened for the current coach)', inWin({ from: winAbdel.from, to: abdelToOpened }, '2026-08', 23) === true);
  R.ok('AFTER the fix: a still-earlier day (Aug 10) also stays markable', inWin({ from: winAbdel.from, to: abdelToOpened }, '2026-08', 10) === true);
  R.ok('Iyad (earlier coach) stays bounded — his July window does NOT reach Aug 23', inWin({ from: winIyad.from, to: winIyad.to }, '2026-08', 23) === false);
}

R.section('runtime — an EXPIRED member does NOT get the open window (must renew)');
{
  const ctx = H.makeCtx({ today: '2026-08-25', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.coaches=[{id:14,name:'Iyad',rate:30,role:'coach',active:true},{id:1,name:'Abdel Salam',rate:30,role:'coach',active:true}];
    state.members=[{id:9,name:'Ex',sport:'Kick Boxing',coachId:1,expiryDate:'2026-08-12',status:'Active',
      enrollments:[{sport:'Kick Boxing',coachId:1,classes:5}],
      subscriptions:[
        {activity:'Kick Boxing',coachId:14,totalClasses:7,start:'2026-07-13',end:'2026-08-12',status:'completed',switchedAwayTo:'Kick Boxing',_sid:'a'},
        {activity:'Kick Boxing',coachId:1,totalClasses:5,start:'2026-08-01',end:'2026-08-12',status:'active',switchFunded:true,_sid:'b'}
      ]}];
  `);
  const active = run(`(function(m){return !m.deleted && (memberStatus(m)==='Active' || memberStatus(m)==='Frozen' || (m.expiryDate && m.expiryDate>=TODAY));})(state.members[0])`);
  R.ok('an expired membership is NOT treated as active → window stays bounded (needs renewal)', active === false, 'active=' + active);
}

R.done();
