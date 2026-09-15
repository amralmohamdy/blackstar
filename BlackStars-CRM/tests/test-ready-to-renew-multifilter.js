// Ready to Renew (PAGES.completed) — the month / coach / sport filters are MULTI-select.
// Picking two sports must show BOTH, not force a choice between them; and an empty array
// must mean "no filter", never "match nothing".
const H = require('./qc-harness.js');

const R = H.reporter('READY TO RENEW · MULTI-SELECT FILTERS');

// A club where the same coach teaches two sports and two months are in play, so every
// filter has something real to combine.
const SETUP = `
  state.coaches = [
    { id: 1, name: 'Mostafa', rate: 30, active: 'Y' },
    { id: 2, name: 'Iyad',    rate: 25, active: 'Y' },
  ];
  const mk = (id, name, rows) => ({
    id, name, phone: '+9745500000' + id, startDate: '2026-05-01',
    enrollments: rows.map(r => ({ sport: r.sport, coachId: r.coachId, classes: r.total, price: 500 })),
    subscriptions: rows.map((r, i) => ({
      id: 's' + id + i, activity: r.sport, coachId: r.coachId, start: r.start, end: r.end,
      totalClasses: r.total, attendedClasses: r.total, amountPaid: 500, status: 'Active',
    })),
    dailyAttendance: rows.reduce((acc, r) => {
      // Marks must fall ON/AFTER the start day — the attendance window opens at the start date,
      // so days before it don't count toward "finished all classes".
      const ym = r.start.slice(0, 7);
      const startDay = parseInt(r.start.slice(8, 10), 10);
      acc[ym] = acc[ym] || {};
      acc[ym][r.sport] = {};
      for (let i = 0; i < r.total; i++) acc[ym][r.sport][String(startDay + i).padStart(2, '0')] = 'Y';
      return acc;
    }, {}),
  });
  state.members = [
    mk(201, 'Swim May Kid',  [{ sport: 'Swimming',    coachId: 1, start: '2026-05-04', end: '2026-06-04', total: 4 }]),
    mk(202, 'Karate Jun Kid',[{ sport: 'Karate',      coachId: 1, start: '2026-06-02', end: '2026-07-02', total: 4 }]),
    mk(203, 'Boxing Jun Kid',[{ sport: 'Kick Boxing', coachId: 2, start: '2026-06-08', end: '2026-07-08', total: 4 }]),
  ];
  state.invoices = []; state.session = { role: 'admin' };
`;

const run = (c, s) => H.vm.runInContext(s, c);
// The screen fills its table body with `$('#comp-tbody').innerHTML = ...` inside refresh(),
// and `$` is document.querySelector — which the shared stub throws away for id-selectors. Route
// id-form querySelector calls to the SAME captured node getElementById returns, so the tbody
// write (and the KPI writes) survive and can be read back. App-neutral: only affects this ctx.
const ctx0 = () => {
  const c = H.makeCtx({ role: 'admin' });
  const doc = c.document;
  const realQS = doc.querySelector.bind(doc);
  doc.querySelector = (sel) => (typeof sel === 'string' && /^#[\w-]+$/.test(sel)) ? doc.getElementById(sel.slice(1)) : realQS(sel);
  H.vm.runInContext(SETUP, c);
  return c;
};
// Render the screen, then read the member names actually painted into the table body.
const listed = (c) => {
  const out = H.renderScreen(c, 'completed');
  if (!out.ok) return { error: out.error, names: [] };
  const tbody = String(run(c, `(document.getElementById('comp-tbody')||{}).innerHTML || ''`));
  const html = (out.html || '') + tbody;
  return { html, names: ['Swim May Kid', 'Karate Jun Kid', 'Boxing Jun Kid'].filter(n => tbody.includes(n)) };
};

R.section('the fixture itself is renewable (guards the test, not the app)');
{
  const c = ctx0();
  run(c, 'window._compFilter = null;');
  const ready = run(c, 'membersReadyToRenew().map(r => r.m.name).sort()');
  R.ok('all three members finished their classes', ready.length === 3, ready);
  const l = listed(c);
  R.ok('the screen renders and lists all three with no filter', !l.error && l.names.length === 3, l.error || l.names);
}

R.section('SPORT — more than one sport can be selected at once');
{
  const c = ctx0();
  run(c, `window._compFilter = { search: '', sports: ['Swimming'], months: [], coaches: [] };`);
  let l = listed(c);
  R.ok('one sport selected → only that sport', l.names.join() === 'Swim May Kid', l.names);

  // The whole point of the change: two picks must UNION, not collide.
  run(c, `window._compFilter.sports = ['Swimming', 'Kick Boxing'];`);
  l = listed(c);
  R.ok('TWO sports selected → both are listed', l.names.sort().join() === ['Swim May Kid', 'Boxing Jun Kid'].sort().join(), l.names);
  R.ok('the unselected sport is excluded', !l.names.includes('Karate Jun Kid'), l.names);

  run(c, `window._compFilter.sports = [];`);
  l = listed(c);
  R.ok('an EMPTY selection means no filter (not "match nothing")', l.names.length === 3, l.names);
}

R.section('COACH — multi-select');
{
  const c = ctx0();
  run(c, `window._compFilter = { search: '', sports: [], months: [], coaches: ['Iyad'] };`);
  let l = listed(c);
  R.ok('one coach → only their student', l.names.join() === 'Boxing Jun Kid', l.names);

  run(c, `window._compFilter.coaches = ['Iyad', 'Mostafa'];`);
  l = listed(c);
  R.ok('both coaches → all three students', l.names.length === 3, l.names);
}

R.section('MONTH — multi-select on the enrolment (start) month');
{
  const c = ctx0();
  run(c, `window._compFilter = { search: '', sports: [], months: ['2026-05'], coaches: [] };`);
  let l = listed(c);
  R.ok('May only', l.names.join() === 'Swim May Kid', l.names);

  run(c, `window._compFilter.months = ['2026-05', '2026-06'];`);
  l = listed(c);
  R.ok('May + June → everyone', l.names.length === 3, l.names);
}

R.section('the filters COMBINE (AND across filters, OR within one)');
{
  const c = ctx0();
  // June + {Karate, Kick Boxing} + Mostafa → only Mostafa's June sport survives.
  run(c, `window._compFilter = { search: '', sports: ['Karate', 'Kick Boxing'], months: ['2026-06'], coaches: ['Mostafa'] };`);
  const l = listed(c);
  R.ok('month AND coach AND (sport OR sport) narrows to one member',
    l.names.join() === 'Karate Jun Kid', l.names);
}

R.section('search still works alongside the multi-selects');
{
  const c = ctx0();
  run(c, `window._compFilter = { search: 'Boxing Jun', sports: [], months: [], coaches: [] };`);
  const l = listed(c);
  R.ok('search narrows the list', l.names.join() === 'Boxing Jun Kid', l.names);
}

R.section('the old SINGLE-value filter shape is migrated, not crashed on');
{
  // A session already open on this screen holds the pre-v6.405 shape. It must survive.
  const c = ctx0();
  run(c, `window._compFilter = { search: '', sport: 'Swimming', month: 'all', coach: 'all' };`);
  const l = listed(c);
  R.ok('a legacy { sport: "Swimming" } filter still filters', l.names.join() === 'Swim May Kid', l.names);
  const f = run(c, 'window._compFilter');
  R.ok('it is rewritten to arrays', Array.isArray(f.sports) && Array.isArray(f.months) && Array.isArray(f.coaches), f);
  R.ok('"all" becomes an empty array, not the literal string', f.months.length === 0 && f.coaches.length === 0, f);
  R.ok('the stale single-value keys are removed', f.sport === undefined && f.month === undefined && f.coach === undefined, f);
}

R.section('the pickers render as multi-selects, not <select> dropdowns');
{
  const c = ctx0();
  run(c, `window._compFilter = null;`);
  const { html } = listed(c);
  R.ok('coach picker is a multi-filter', /id="comp-coach"[^>]*class="[^"]*"|class="multi-filter" id="comp-coach"/.test(html) && html.includes('multi-filter'), html.includes('multi-filter'));
  R.ok('sport picker is a multi-filter', /<div class="multi-filter" id="comp-sport"/.test(html));
  R.ok('month picker is the shared month multi-select', /<div class="month-multi" id="comp-month"/.test(html));
  R.ok('no single-select <select id="comp-sport"> remains', !/<select id="comp-sport"/.test(html));
  R.ok('no single-select <select id="comp-coach"> remains', !/<select id="comp-coach"/.test(html));
  R.ok('each multi-filter offers checkboxes', (html.match(/class="mf-cb"/g) || []).length >= 4, (html.match(/class="mf-cb"/g) || []).length);
  R.ok('a Clear button is present', html.includes('id="comp-clear"'));
}

R.section('edge cases must not throw');
{
  const c = ctx0();
  // A pick that matches nothing → empty table, not a crash.
  run(c, `window._compFilter = { search: '', sports: ['Fencing'], months: [], coaches: [] };`);
  let l = listed(c);
  R.ok('a sport nobody finished → empty list, no crash', !l.error && l.names.length === 0, l.error || l.names);

  // Every combination at once.
  run(c, `window._compFilter = { search: 'zzz', sports: ['Swimming'], months: ['2026-05'], coaches: ['Mostafa'] };`);
  l = listed(c);
  R.ok('a search that matches nothing, with filters set → empty, no crash', !l.error && l.names.length === 0, l.error || l.names);

  // Empty club.
  const c2 = H.makeCtx({ role: 'admin' });
  H.vm.runInContext(`state.members=[];state.coaches=[];state.invoices=[];state.session={role:'admin'};window._compFilter=null;`, c2);
  const out = H.renderScreen(c2, 'completed');
  R.ok('renders against an empty database', out.ok, out.error);
}

R.done();
