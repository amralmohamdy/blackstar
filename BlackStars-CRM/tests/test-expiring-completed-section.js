// v6.423 — (1) the Expiring screen now has a "Completed — finished classes, ready to renew"
// group (same source as the Ready-to-Renew screen), plus a Completed option in the status
// filter. (2) The Reminders screen is disabled (hidden from the nav).
const H = require('./qc-harness.js');
const R = H.reporter('EXPIRING · completed group + reminders disabled');
const run = (c, s) => H.vm.runInContext(s, c);

// One member who FINISHED all classes (attended >= total, expiry still in the future) and one
// who is just expiring by date (not completed).
function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Jennifer', active:'Y' }];
    state.members = [
      { id:801, name:'Finisher', phone:'+97455000001', sport:'Gymnastic', coachId:1, status:'Active', expiryDate:'2026-08-20',
        enrollments:[{ sport:'Gymnastic', coachId:1, classes:6, price:275 }],
        subscriptions:[{ _sid:'a', activity:'Gymnastic', coachId:1, start:'2026-07-01', end:'2026-08-20', totalClasses:6, attendedClasses:6, status:'active' }],
        dailyAttendance:{ '2026-07': { Gymnastic:{ '01':'Y','02':'Y','03':'Y','04':'Y','05':'Y','06':'Y' } } } },
      { id:802, name:'ExpiringOnly', phone:'+97455000002', sport:'Boxing', coachId:1, status:'Active', expiryDate:'2026-07-31',
        enrollments:[{ sport:'Boxing', coachId:1, classes:12, price:600 }],
        subscriptions:[{ _sid:'b', activity:'Boxing', coachId:1, start:'2026-07-01', end:'2026-07-31', totalClasses:12, attendedClasses:2, status:'active' }],
        dailyAttendance:{ '2026-07': { Boxing:{ '01':'Y','02':'Y' } } } },
    ];
    state.invoices = [];
  `);
}

R.section('membersReadyToRenew flags the finisher (the group source)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const ids = run(ctx, `membersReadyToRenew().map(r => r.m.id)`);
  R.ok('the finisher (801) is ready-to-renew / completed', ids.includes(801), ids);
  R.ok('the not-finished member (802) is NOT completed', !ids.includes(802), ids);
}

R.section('the Expiring screen renders + exposes the Completed status filter');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const out = H.renderScreen(ctx, 'expiring');
  R.ok('expiring screen renders', out.ok, out.error);
  R.ok('the status filter has a Completed option', /value="completed">✅ Completed/.test(out.html || ''));
}

R.section('v6.427 — the KPI row has all 4 bucket cards, each a clickable filter');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const html = H.renderScreen(ctx, 'expiring').html || '';
  R.ok('a "Expiring in ≤ 3 days" KPI → soon filter', /value='soon'[\s\S]{0,260}Expiring in ≤/.test(html));
  R.ok('a "Expiring in ≤ 7 days" KPI → d7 filter', /value='d7'[\s\S]{0,260}Expiring in ≤ 7 days/.test(html));
  R.ok('a "Completed" KPI → completed filter', /value='completed'[\s\S]{0,260}Completed/.test(html));
  R.ok('a "Expiring in ≤ 30 days" KPI → upcoming filter', /value='upcoming'[\s\S]{0,260}Expiring in ≤ 30 days/.test(html));
}

R.section('v6.427 — Renewals Report + Ready-to-Renew screens are disabled');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('renewals (Renewals Report) is hidden', run(ctx, `!!ROUTES.renewals.hidden`) === true);
  R.ok('completed (Ready to Renew) is hidden', run(ctx, `!!ROUTES.completed.hidden`) === true);
}

R.section('the completed bucket (as the screen builds it) contains the finisher only');
{
  // The section rows are injected into #exp-sections after render (not in main.innerHTML),
  // so prove the bucket the screen builds directly — the same expression PAGES.expiring uses.
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const bucket = run(ctx, `(function(){
    const rows = membersReadyToRenew()
      .filter(r => r.m && !r.m.deleted && memberStatus(r.m) !== 'Withdrawn' && memberStatus(r.m) !== 'Frozen')
      .map(r => ({ id:r.m.id, name:r.m.name, days:(daysUntil(r.m.expiryDate)||0), completed:true }));
    return rows;
  })()`);
  R.ok('the completed bucket lists the finisher (801)', bucket.some(x => x.id === 801), bucket);
  R.ok('it does NOT list the not-finished member (802)', !bucket.some(x => x.id === 802), bucket);
  R.ok('each completed row carries the completed flag', bucket.every(x => x.completed === true));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('a completed bucket is built from membersReadyToRenew', /const completed = _readyRows[\s\S]{0,200}_synth|const completed = _readyRows/.test(src));
  R.ok('the Completed section is pushed for all/completed buckets', /filter\.bucket === 'all' \|\| filter\.bucket === 'completed'[\s\S]{0,120}'completed'\)\)/.test(src));
  R.ok('the completed collapse key exists', /completed: false \}/.test(src));
}

R.section('the Reminders screen is disabled (hidden from the nav)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('ROUTES.reminders.hidden is true', run(ctx, `!!ROUTES.reminders.hidden`) === true);
  // Replay the sidebar filter: a hidden route never enters the admin nav.
  const inNav = run(ctx, `(function(){
    const sections = ['Main','Membership','Activities','Summer Camp','Team & Sports','Finance','Insights','System'];
    for (const section of sections) for (const [key, route] of Object.entries(ROUTES)) {
      if (route.section !== section || route.hidden) continue;
      if (!roleCanAccess('admin', key)) continue;
      if (key === 'reminders') return true;
    }
    return false;
  })()`);
  R.ok('reminders is NOT rendered in the admin nav', inNav === false);
}

R.done();
