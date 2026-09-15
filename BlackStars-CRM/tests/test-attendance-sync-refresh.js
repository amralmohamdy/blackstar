// v6.539 — ATTENDANCE STALE-BADGE FIX. The big working grids (Attendance / Schedule) deliberately do NOT
// auto-repaint on a remote sync (NO_AUTO_REPAINT_ROUTES) to avoid the "why did it refresh suddenly" jump.
// Side effect: a payment changed on ANOTHER device left the per-member UNPAID badge stale (reported:
// Abdulrahman showed no UNPAID even though he owed 725, while his identical brother Abdulwahab did). The
// badge LOGIC was always correct (memberOutstanding > 0.5); the screen just hadn't redrawn. Fix: on a
// suppressed sync, show a one-tap "🔄 data changed — tap to refresh" pill; any real render() clears it.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.539 · attendance stale-badge refresh pill');
const src = H.readSrc();

R.section('source — the refresh-pill safety net');
R.ok('attendance is (still) excluded from auto-repaint', /NO_AUTO_REPAINT_ROUTES = new Set\(\['attendance'/.test(src));
R.ok('a suppressed sync shows the refresh pill instead of silently staying stale', /NO_AUTO_REPAINT_ROUTES\.has\(state\.route\)\) \{ _remoteRenderPending = false; _showSyncRefreshPill\(\);/.test(src));
R.ok('the pill helpers exist', /function _showSyncRefreshPill\(\)/.test(src) && /function _hideSyncRefreshPill\(\)/.test(src));
R.ok('tapping the pill re-renders', /_hideSyncRefreshPill\(\); try \{ render\(\); \}/.test(src));
R.ok('a real render() clears the pill (screen is fresh)', /function render\(\)[\s\S]{0,260}?_hideSyncRefreshPill\(\);/.test(src));

R.section('runtime — the badge LOGIC was always right (regression guard for the reported case)');
{
  const ctx = H.makeCtx({ today: '2026-08-30', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // two identical siblings: a fee fully "paid" then reversed by a −correction (nets to 0) → both owe 725
  run(`
    state.members=[
      {id:1,name:'Abdulrahman',expiryDate:'2026-10-01',status:'Active',
        subscriptions:[{activity:'Kick Boxing',coachId:1,start:'2026-09-01',invoiceNumber:'A1'},{activity:'Football',coachId:1,start:'2026-08-29',invoiceNumber:'A1'},{activity:'Swimming',coachId:1,start:'2026-09-01',invoiceNumber:'A1'}]},
      {id:2,name:'Abdulwahab',expiryDate:'2026-10-01',status:'Active',
        subscriptions:[{activity:'Kick Boxing',coachId:1,start:'2026-09-01',invoiceNumber:'B1'}]}
    ];
    state.invoices=[
      {id:1,ref:'A1',customerId:1,category:'Membership',date:'2026-08-27',month:'2026-08',amount:725,amountPaid:0,
        lineItems:[{sport:'Kick Boxing',coachId:1,price:450},{sport:'Football',coachId:1,price:138},{sport:'Swimming',coachId:1,price:137}],
        payments:[{amount:588,date:'2026-08-27',method:'cash'},{amount:137,date:'2026-08-27',method:'cash'},{amount:-725,date:'2026-08-27',method:'cash',_correction:true}]},
      {id:2,ref:'B1',customerId:2,category:'Membership',date:'2026-08-27',month:'2026-08',amount:725,amountPaid:0,
        lineItems:[{sport:'Kick Boxing',coachId:1,price:725}],
        payments:[{amount:450,date:'2026-08-27',method:'cash'},{amount:275,date:'2026-08-27',method:'cash'},{amount:-725,date:'2026-08-27',method:'cash',_correction:true}]}
    ];
  `);
  // the EXACT expression the attendance row uses for the UNPAID badge
  const badge = id => run(`(function(){var m=state.members.find(x=>x.id===${id});var _due=(currentRole()==='coach'||typeof memberOutstanding!=='function')?0:memberOutstanding(m.id);return {due:_due, unpaid:_due>0.5};})()`);
  const a = badge(1), b = badge(2);
  R.ok('reversed-payment member still owes 725', Math.round(a.due) === 725);
  R.ok('  → attendance badge = UNPAID (the bug was staleness, not this logic)', a.unpaid === true);
  R.ok('identical sibling also owes 725 → UNPAID', Math.round(b.due) === 725 && b.unpaid === true);
  R.ok('both siblings resolve identically (no per-member divergence in the logic)', a.unpaid === b.unpaid);
}

R.done();
