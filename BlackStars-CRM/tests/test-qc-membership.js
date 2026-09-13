// QC — MEMBERSHIP MODULES regression suite.
//
// Covers the previously-untested membership screens (birthdays, mymembership, onboarding,
// renewaldetail, renewals, transfers) plus the lightly-covered ones (members, duepayment,
// enrolled, families, history, trials, reminders), against the shared realistic club seed
// in qc-harness.js.
//
// Everything here renders the REAL screen (or calls the REAL helper) and asserts on what it
// produced. Lines marked `// DEFECT:` assert the CORRECT behaviour and therefore FAIL on the
// current build — that is deliberate; they are the findings, not noise. Run:
//     node tests/test-qc-membership.js
//
// TIMEZONE: the club is in Qatar (UTC+3). We pin TZ so the date-handling assertions mean the
// same thing on any machine — several of them only reproduce in a UTC-AHEAD zone, which is
// exactly the zone the club runs in.
process.env.TZ = 'Asia/Qatar';

const H = require('./qc-harness.js');
const R = H.reporter('MEMBERSHIP MODULES');

// ── local harness extensions (no app code is modified) ───────────────────────
// The app reaches sub-nodes with `$('#id')` → document.querySelector. The shared DOM stub
// returns a throwaway element for querySelector, so screens that paint into `#enr-tbody`
// etc. would look empty. Route id-selectors to getElementById (real DOM semantics) so their
// output is captured too.
function mkctx(opts) {
  const ctx = H.makeCtx(opts);
  const doc = ctx.document;
  const orig = doc.querySelector.bind(doc);
  doc.querySelector = (sel) => (typeof sel === 'string' && /^#[A-Za-z0-9_-]+$/.test(sel))
    ? doc.getElementById(sel.slice(1))
    : orig(sel);
  return ctx;
}
function club(extra, role) { return H.seed(mkctx({ role: role || 'admin' }), extra); }
const Q = (ctx, expr) => H.vm.runInContext(expr, ctx);
// Full painted output of a screen: #main plus every sub-node it wrote into.
function screen(ctx, name) {
  const out = H.renderScreen(ctx, name);
  out.html = Object.values(ctx.__cap || {}).map(e => (e && e._h) || '').join('\n');
  return out;
}
const node = (ctx, id) => { const n = (ctx.__cap || {})['#' + id]; return n ? n._h : null; };
// Pre-create a node so its addEventListener records handlers — lets us fire a real
// "Export CSV" click and assert on the produced file.
function arm(ctx, id) {
  const el = ctx.document.getElementById(id);
  el.__handlers = {};
  el.addEventListener = (ev, fn) => { (el.__handlers[ev] = el.__handlers[ev] || []).push(fn); };
  return el;
}
function exportCsv(ctx, screenName, buttonId) {
  Q(ctx, 'window.__csv=null; downloadFile=function(n,c){window.__csv=c;}; toast=function(){};');
  const btn = arm(ctx, buttonId);
  screen(ctx, screenName);
  (btn.__handlers.click || []).forEach(f => f());
  return Q(ctx, 'window.__csv') || '';
}
const has = (html, s) => String(html).indexOf(s) >= 0;

// ─────────────────────────────────────────────────────────────────────────────
R.section('FIXTURE — the seed still has the shapes these tests depend on');
{
  const ctx = club();
  R.ok('app sources loaded', !ctx.__loadError, ctx.__loadError);
  R.ok('TODAY is 2026-07-24', Q(ctx, 'TODAY') === '2026-07-24', Q(ctx, 'TODAY'));
  R.ok('member 102 has a birthday that is TODAY', Q(ctx, 'state.members.find(m=>m.id===102).birthdate') === '2012-07-24');
  R.ok('member 102 primary sport has NO coach but a secondary enrollment does',
    Q(ctx, 'state.members.find(m=>m.id===102).coachId') === null &&
    Q(ctx, 'state.members.find(m=>m.id===102).enrollments.some(e=>e.coachId===2)'));
  R.ok('member 104 is archived (deleted:true)', Q(ctx, '!!state.members.find(m=>m.id===104).deleted'));
  R.ok('invoice 904 is soft-deleted and belongs to member 103',
    Q(ctx, 'state.invoices.some(i=>i.id===904 && i.deleted && i.customerId===103)'));
  R.ok('timezone is pinned to UTC+3 (Qatar)', new Date().getTimezoneOffset() === -180, new Date().getTimezoneOffset());
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('DATE HELPERS — the Qatar UTC+3 off-by-one class');
{
  const ctx = club();
  R.ok('addDays keeps local date parts (2026-07-24 +1 = 2026-07-25)',
    Q(ctx, 'addDays("2026-07-24",1)') === '2026-07-25', Q(ctx, 'addDays("2026-07-24",1)'));
  R.ok('addDays -1 across a month boundary (2026-08-01 -1 = 2026-07-31)',
    Q(ctx, 'addDays("2026-08-01",-1)') === '2026-07-31', Q(ctx, 'addDays("2026-08-01",-1)'));
  R.ok('daysUntil(expiry 8 days out) = 8', Q(ctx, 'daysUntil("2026-08-01")') === 8, Q(ctx, 'daysUntil("2026-08-01")'));
  R.ok('daysUntil(TODAY) = 0', Q(ctx, 'daysUntil("2026-07-24")') === 0, Q(ctx, 'daysUntil("2026-07-24")'));
  R.ok('daysUntilBirthday for TOMORROW = 1', Q(ctx, 'daysUntilBirthday("2012-07-25")') === 1, Q(ctx, 'daysUntilBirthday("2012-07-25")'));
  R.ok('daysUntilBirthday for a date later this cycle = 223 (2010-03-04)',
    Q(ctx, 'daysUntilBirthday("2010-03-04")') === 223, Q(ctx, 'daysUntilBirthday("2010-03-04")'));

  // DEFECT 1 — daysUntilBirthday() rolls a birthday that is TODAY forward a whole year.
  // `new Date(TODAY)` parses YYYY-MM-DD as UTC midnight, but `new Date(y, m, d)` builds LOCAL
  // midnight. In Qatar (UTC+3) local midnight is 3h EARLIER than the UTC-parsed "today", so
  // `next < t` is true on the birthday itself and the function advances to next year.
  // Input: daysUntilBirthday('2012-07-24') with TODAY = '2026-07-24'.  Got 365, expected 0.
  R.ok('DEFECT: daysUntilBirthday() returns 0 on the birthday itself',
    Q(ctx, 'daysUntilBirthday("2012-07-24")') === 0, Q(ctx, 'daysUntilBirthday("2012-07-24")'));
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('BIRTHDAYS');
{
  // Archived members must never be wished a happy birthday.
  const ctx = club(`state.members.find(m=>m.id===104).birthdate='2011-07-10';`);
  Q(ctx, 'window._bdayRange="month"');
  const out = screen(ctx, 'birthdays');
  R.ok('renders', out.ok, out.error);
  R.ok('archived member with a birthdate is excluded', !has(out.html, 'Archived Person'));
  R.ok('a member with a birthday this month is listed', has(out.html, 'Sara Ahmed'));
  R.ok('a member with no birthdate is not listed', !has(out.html, 'Frozen Kid'));

  // DEFECT 2 — the "🎉 Today" tab is empty on a day someone has a birthday.
  // Downstream of DEFECT 1 (days===365 fails the `days === 0` filter).
  // Input: Sara Ahmed, birthdate 2012-07-24, TODAY 2026-07-24, tab = 'today'.
  const today = club();
  Q(today, 'window._bdayRange="today"');
  const outToday = screen(today, 'birthdays');
  R.ok("DEFECT: the 'Today' tab lists a member whose birthday is today",
    has(outToday.html, 'Sara Ahmed'),
    has(outToday.html, 'No birthdays in this range') ? "shows 'No birthdays in this range'" : 'missing');

  // DEFECT 3 — wrong age on the birthday itself. `turning = age + (days > 0 ? 1 : 0)`;
  // with the bogus days=365 it adds a year. memberAge('2012-07-24') is correctly 14, so the
  // row should read "turning 14" on the day she turns 14.  Got "turning 15".
  R.ok("DEFECT: the birthday row says 'turning 14' (memberAge=14), not 15",
    /turning 14\b/.test(out.html) && !/turning 15\b/.test(out.html),
    (out.html.match(/turning \d+/) || [])[0]);
  R.ok('memberAge on the birthday itself is correct (14)',
    Q(ctx, 'memberAge("2012-07-24")') === 14, Q(ctx, 'memberAge("2012-07-24")'));

  // The label for a today-birthday should be the "🎉 Today" pill, not "in N days".
  R.ok("DEFECT: today's birthday is not labelled 'in 365 days'",
    !/in 365 days/.test(out.html), (out.html.match(/in \d+ days/) || [])[0]);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('MY MEMBERSHIP (student self-service)');
{
  // Member 103 (Omar) has one live invoice (INV902) and one SOFT-DELETED one (INV904).
  const ctx = club('state.user = { memberId: 103 };');
  const out = screen(ctx, 'mymembership');
  R.ok('renders for a linked member', out.ok, out.error);
  R.ok('shows the live invoice INV902', has(out.html, 'INV902'));
  R.ok('shows the expired-membership banner for an Expired member',
    has(out.html, 'Your membership has expired'));

  // DEFECT 4 — the student's Payment history lists SOFT-DELETED invoices.
  // `myInvoices` filters only on `inv.customerId === m.id`; it never checks `!inv.deleted`.
  // Input: member 103, invoice 904 {deleted:true, amount:650}. The student is shown a
  // 650 QAR invoice the club has voided. (Every other money screen — duepayment, invoices,
  // transactions — excludes deleted invoices, so the member sees a total nobody else does.)
  R.ok('DEFECT: a soft-deleted invoice (INV904) is NOT shown in the payment history',
    !has(out.html, 'INV904'), 'INV904 present');
}
{
  // Member 101: subscription s101 has totalClasses 8 and NO stored attendedClasses, but the
  // roll-call grid has 2 'Y' marks for Swimming inside the subscription window.
  const ctx = club('state.user = { memberId: 101 };');
  const out = screen(ctx, 'mymembership');
  const left = (out.html.match(/line-height:1">(\d+)<\/div><div style="font-size:11px;color:var\(--text-mute\);text-transform:uppercase;letter-spacing:\.5px;margin-top:2px">Left/) || [])[1];
  const canonical = Q(ctx, `(function(){
    var m=state.members.find(x=>x.id===101), s=m.subscriptions[0];
    var w=subAttendanceWindow(m,s);
    return (parseInt(subClassLimit(s))||0) - liveAttendanceCount(m,'Swimming',w.from,w.to).y;
  })()`);
  R.ok('canonical remaining classes (live attendance, windowed) is 6', canonical === 6, canonical);
  R.ok("the page's own attendance log agrees with live attendance (2 attended)",
    has(out.html, '2 classes attended'), (out.html.match(/\d+ class(?:es)? attended/) || [])[0]);

  // DEFECT 5 — "Left" is computed from the STORED sub.attendedClasses, which lags the
  // roll-call grid. Same page, same member, two different truths: the header says
  // "2 classes attended" while the sport card says 8 of 8 classes left.
  // Input: member 101, sub s101 {totalClasses:8, attendedClasses undefined},
  //        dailyAttendance 2026-07 Swimming {03:'Y', 10:'Y'}.  Got 8, expected 6.
  // completedSubsForRenewal()/Ready-to-Renew already use live attendance — this screen does not.
  R.ok('DEFECT: "Left" counts live attendance (expected 6)', String(left) === '6', left);
}
{
  const ctx = club('state.user = { memberId: 105 };');
  const out = screen(ctx, 'mymembership');
  R.ok('a frozen member sees the Frozen status', out.ok && has(out.html, 'Your membership is frozen'), out.error);
}
{
  const ctx = club('state.user = { memberId: 9999 };');
  const out = screen(ctx, 'mymembership');
  R.ok('an unlinked login gets the friendly "not linked" card, not a crash',
    out.ok && has(out.html, "couldn't find a membership"), out.error);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('RENEWALS report');
{
  const ctx = club(`
    state.members.find(m=>m.id===101).renewalsBySport = {'Swimming': 1};
    state.members.find(m=>m.id===104).renewalsBySport = {'Swimming': 3};   // ARCHIVED member
  `);
  const out = screen(ctx, 'renewals');
  R.ok('renders', out.ok, out.error);

  // DEFECT 6 — PAGES.renewals iterates `state.members` with no `!m.deleted` guard, so an
  // ARCHIVED member's renewal counters land in the rows, the three KPI tiles, the per-sport
  // bar chart AND the CSV export.
  // Input: archived member 104 with renewalsBySport {Swimming:3}; live member 101 with {Swimming:1}.
  // Got "4 total renewals · 2 members renewed"; expected "1 total renewals · 1 members renewed".
  const subtitle = (out.html.match(/\d+ total renewals · \d+ members renewed · \d+ sports/) || [])[0];
  R.ok('DEFECT: archived members are excluded from the renewals table',
    !has(out.html, 'Archived Person'), 'Archived Person listed');
  R.ok('DEFECT: renewal KPIs exclude archived members (expect 1 total / 1 member)',
    subtitle === '1 total renewals · 1 members renewed · 1 sports', subtitle);

  const csv = exportCsv(club(`
    state.members.find(m=>m.id===101).renewalsBySport = {'Swimming': 1};
    state.members.find(m=>m.id===104).renewalsBySport = {'Swimming': 3};
  `), 'renewals', 'ren-export');
  R.ok('DEFECT: the renewals CSV export excludes archived members',
    !/Archived Person/.test(csv), csv.split('\n').slice(0, 3));
}
{
  // Sara (102) renewed KICK BOXING (coach Iyad, id 2, on her enrollment). Her headline
  // m.sport is 'Summer Camp' and her headline m.coachId is null.
  const ctx = club(`state.members.find(m=>m.id===102).renewalsBySport = {'Kick Boxing': 2};`);
  const out = screen(ctx, 'renewals');
  R.ok('the renewed sport itself is reported correctly', has(out.html, 'Kick Boxing: 2'));

  // DEFECT 7 — the row's sub-line and the CSV "Coach" column use the HEADLINE m.coachId only,
  // so a multi-sport member's renewal is credited to nobody. Enrolled Members' CSV resolves the
  // same member/sport to "Iyad"; this report prints "—".
  // Input: member 102 {coachId:null, sport:'Summer Camp', enrollments[1]={sport:'Kick Boxing', coachId:2}},
  //        renewalsBySport {'Kick Boxing':2}.  Got coach "—" / sport "Summer Camp"; expected "Iyad" / "Kick Boxing".
  const csv = exportCsv(club(`state.members.find(m=>m.id===102).renewalsBySport = {'Kick Boxing': 2};`),
    'renewals', 'ren-export');
  const saraLine = csv.split('\n').find(l => l.indexOf('Sara Ahmed') >= 0) || '';
  R.ok('DEFECT: the renewals CSV credits the coach of the RENEWED sport (Iyad), not the headline coach',
    /"Iyad"/.test(saraLine), saraLine);
}
{
  const ctx = club();
  const out = screen(ctx, 'renewals');
  R.ok('no renewals recorded → empty-state, no crash and 0 KPIs',
    out.ok && has(out.html, '0 total renewals') && has(out.html, 'No renewals recorded yet'), out.error);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('RENEWAL REVENUE POTENTIAL (renewaldetail)');
{
  const ctx = club();
  const out = screen(ctx, 'renewaldetail');
  R.ok('renders', out.ok, out.error);
  R.ok('archived members are excluded', !has(out.html, 'Archived Person'));
  const subtitle = (out.html.match(/(\d+) enrolments · (\d+) distinct members/) || []);
  const rows = (out.html.match(/<td class="text-mute">\d+<\/td>/g) || []).length;
  R.ok('the heading count matches the number of rows actually listed',
    parseInt(subtitle[1]) === rows, { heading: subtitle[1], rows });
  R.ok('distinct-member count matches the 4 non-archived members', parseInt(subtitle[2]) === 4, subtitle[2]);
  R.ok('total = 650 + 1500 + 650 + 650 + 600 = 4,050 QAR', has(out.html, '4,050'), subtitle[0]);

  const csv = (function () {
    const c = club();
    Q(c, 'window.__csv=null; downloadFile=function(n,cc){window.__csv=cc;};');
    screen(c, 'renewaldetail');
    Q(c, '_renewalDetailCSV()');
    return Q(c, 'window.__csv') || '';
  })();
  R.ok('the CSV export excludes archived members', !/Archived Person/.test(csv));
  R.ok('the CSV has one line per listed enrolment (+ header)', csv.trim().split('\n').length === rows + 1,
    csv.trim().split('\n').length);
}
{
  // memberRenewalValue() is the money behind this screen and the dashboard renewal KPI.
  const ctx = club(`
    state.members.push({id:110,name:'No Price Guy',phone:'+97431000110',sport:'Karate',coachId:1,
      joinDate:'2026-05-01',expiryDate:'2026-09-01',enrollments:[{sport:'Karate',coachId:1,classes:8}],subscriptions:[]});
    state.invoices.push({id:906,ref:'INV906',customerId:110,category:'Membership',date:'2026-05-01',
      month:'2026-05',amount:777,deleted:true,deletedAt:'2026-06-01T00:00:00Z'});
  `);
  R.ok('memberRenewalValue uses the enrolment price when there is one (650 for member 101)',
    Q(ctx, 'memberRenewalValue(state.members.find(m=>m.id===101))') === 650,
    Q(ctx, 'memberRenewalValue(state.members.find(m=>m.id===101))'));

  // DEFECT 8 — memberRenewalValue()'s "last real invoice" fallback (app.js ~2668) does not skip
  // soft-deleted invoices; it only skips `switchCredit` and zero amounts. A member whose only
  // invoice was VOIDED is still valued at that invoice's amount, inflating renewal-potential
  // money on renewaldetail and clubRenewalValue()/the dashboard.
  // Input: member 110, enrolment with no price, single invoice 906 {amount:777, deleted:true}.
  // Got 777, expected 0.
  R.ok('DEFECT: memberRenewalValue ignores soft-deleted invoices (expected 0)',
    Q(ctx, 'memberRenewalValue(state.members.find(m=>m.id===110))') === 0,
    Q(ctx, 'memberRenewalValue(state.members.find(m=>m.id===110))'));
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('TRANSFER MEMBERSHIP');
{
  const ctx = club();
  const out = screen(ctx, 'transfers');
  R.ok('renders for an admin', out.ok, out.error);
  R.ok('archived members are not offered as a source or receiver', !has(out.html, 'Archived Person'));
  R.ok('Summer Camp is not transferable, the secondary sport is',
    JSON.stringify(Q(ctx, 'transferableEnrollments(state.members.find(m=>m.id===102)).map(e=>e.sport)')) === '["Kick Boxing"]',
    Q(ctx, 'transferableEnrollments(state.members.find(m=>m.id===102)).map(e=>e.sport)'));
  R.ok('a frozen member may still transfer (not a terminal state)', has(out.html, 'Frozen Kid'));
  R.ok('the transferable count matches the 4 non-archived members with a transferable sport',
    (out.html.match(/(\d+) of (\d+) transferable members/) || [])[2] === '4',
    (out.html.match(/\d+ of \d+ transferable members/) || [])[0]);
}
{
  const ctx = club(`state.members.find(m=>m.id===103).status='Withdrawn';`);
  const out = screen(ctx, 'transfers');
  R.ok('a Withdrawn member is not offered as a transfer source',
    (out.html.match(/(\d+) of (\d+) transferable members/) || [])[2] === '3',
    (out.html.match(/\d+ of \d+ transferable members/) || [])[0]);
}
{
  const ctx = club(null, 'coach');
  const out = screen(ctx, 'transfers');
  R.ok('a coach is blocked from the transfer screen', out.ok && has(out.html, 'Admins only'), out.error);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('PORTAL ONBOARDING');
{
  const ctx = club();
  const out = screen(ctx, 'onboarding');
  R.ok('renders', out.ok, out.error);
  R.ok('archived members are excluded', !has(out.html, 'Archived Person'));
  R.ok('the header count matches the 4 non-archived members with a usable mobile',
    node(ctx, 'onb-count') === '4 members · 0 invited · 4 not created', node(ctx, 'onb-count'));
}
{
  const ctx = club(null, 'coach');
  const out = screen(ctx, 'onboarding');
  R.ok('a coach is blocked from onboarding', out.ok && has(out.html, 'Admins or receptionists only'), out.error);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('ENROLLED MEMBERS');
{
  const ctx = club();
  const out = screen(ctx, 'enrolled');
  R.ok('renders', out.ok, out.error);
  R.ok('archived members are excluded', !has(out.html, 'Archived Person'));
  R.ok('one row per (member, sport): 5 rows over 4 members',
    /<b>5<\/b> enrollment rows · <b>4<\/b> members/.test(node(ctx, 'enr-count') || ''), node(ctx, 'enr-count'));
  R.ok('baseline paid total is 3,450 QAR', /<b>3,450 QAR<\/b> paid/.test(node(ctx, 'enr-count') || ''), node(ctx, 'enr-count'));

  // This screen DOES resolve the per-sport coach from the enrollment — the reference
  // behaviour that Members-list and Renewals get wrong (see DEFECT 7 / DEFECT 10).
  const baseCsv = exportCsv(club(), 'enrolled', 'enr-export');
  const saraKb = (baseCsv.split('\n').find(l => /Sara Ahmed.*Kick Boxing/.test(l)) || '');
  R.ok('the secondary coach is resolved from the enrollment, not the headline coachId',
    /"Iyad"/.test(saraKb), saraKb);
}
{
  // DEFECT 9 — PAGES.enrolled sums invoice line items with no `!inv.deleted` guard
  // (the loop only checks customerId + category), so a VOIDED invoice's money is
  // reported as paid on this screen and in its CSV export.
  // Input: extra invoice 905 for member 103, {deleted:true, lineItems:[{sport:'Kick Boxing', price:650}]}.
  // Got Omar 1,300 paid / club total 4,100; expected 650 / 3,450.
  const seed = `state.invoices.push({id:905,ref:'INV905',customerId:103,category:'Membership',
    sport:'Kick Boxing',date:'2026-04-01',month:'2026-04',amount:650,deleted:true,deletedAt:'2026-05-01T00:00:00Z',
    lineItems:[{sport:'Kick Boxing',coachId:2,classes:12,price:650}]});`;
  const ctx = club(seed);
  screen(ctx, 'enrolled');
  R.ok('DEFECT: soft-deleted invoices are excluded from "Paid" (expect 3,450 QAR, not 4,100)',
    /<b>3,450 QAR<\/b> paid/.test(node(ctx, 'enr-count') || ''), node(ctx, 'enr-count'));

  const csv = exportCsv(club(seed), 'enrolled', 'enr-export');
  const omar = (csv.split('\n').find(l => l.indexOf('Omar Khalid') >= 0) || '');
  R.ok('DEFECT: the Enrolled CSV shows 650 paid for member 103, not the voided 1,300',
    /"650"/.test(omar), omar);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('MEMBERS list');
{
  const ctx = club();
  // Grid is the default view as of v6.424; this section asserts the TABLE's Coach column,
  // so force list view for the render.
  Q(ctx, `localStorage.getItem = (k) => k === 'bs-members-view' ? 'list' : null;`);
  const out = screen(ctx, 'members');
  R.ok('renders', out.ok, out.error);
  R.ok('archived members are excluded from the list', !has(out.html, 'Archived Person'));
  R.ok('memberCounts() excludes archived from every bucket',
    JSON.stringify(Q(ctx, 'memberCounts()')) === JSON.stringify({ active: 2, expired: 1, completed: 0, frozen: 1, withdrawn: 0, total: 4, current: 3, archived: 1 }),
    Q(ctx, 'memberCounts()'));

  // The coach FILTER already resolves enrollment coaches (pages.js ~1207) — verify it does.
  R.ok('the coach filter matches a coach found only on an enrollment',
    Q(ctx, `(function(){
      var m=state.members.find(x=>x.id===102);
      var ids=new Set([m.coachId].concat((m.enrollments||[]).map(e=>e.coachId)).filter(v=>v!=null));
      return ids.has(2);
    })()`));

  // DEFECT 10 — but the Coach COLUMN prints coachName(m.coachId) only. Member 102's headline
  // coachId is null (her primary sport is Summer Camp, which has no coach) while her Kick Boxing
  // enrollment is with Iyad. So filtering by "Iyad" returns her with a Coach cell of "—":
  // the same screen says both "she is Iyad's student" and "she has no coach".
  // Input: member 102 {sport:'Summer Camp', coachId:null, enrollments:[…,{sport:'Kick Boxing',coachId:2}]}.
  // Got "—", expected "Iyad" (Enrolled Members resolves the identical row to Iyad).
  const i = out.html.indexOf('Sara Ahmed');
  const coachCell = out.html.slice(i, i + 3000).split('</td>').slice(0, 4).map(s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim())[3];
  R.ok('DEFECT: the Coach column resolves a coach held only on an enrollment',
    coachCell === 'Iyad', coachCell);
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('MEMBER HISTORY');
{
  const ctx = club();
  const out = screen(ctx, 'history');
  R.ok('renders', out.ok, out.error);
  R.ok('soft-deleted invoices are not in the member timeline', !has(out.html, 'INV904'));

  // DEFECT 11 — PAGES.history's member list is `state.members.filter(memberFilter)` with no
  // `!m.deleted` guard, so the archived member is a selectable row in the left-hand list, is
  // counted in "N of M", and is badged "Active" (memberStatus() knows nothing about `deleted`).
  // Input: the seed's member 104 {name:'Archived Person', deleted:true}.
  // Got "5 of 5" with an "Archived Person" row; expected "4 of 4" and no such row.
  R.ok('DEFECT: archived members are excluded from the history member list',
    !/Archived Person/.test(node(ctx, 'hist-list') || ''), 'Archived Person listed');
  R.ok('DEFECT: the history member count excludes archived members (expect "4 of 4")',
    node(ctx, 'hist-mem-count') === '4 of 4', node(ctx, 'hist-mem-count'));
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('DUE PAYMENT / REMINDERS / FAMILIES / TRIALS');
{
  const ctx = club(`
    state.invoices.push({id:907,ref:'INV907',customerId:101,category:'Membership',date:'2026-07-20',month:'2026-07',amount:500,deleted:true});
    state.invoices.push({id:908,ref:'INV908',customerId:104,category:'Membership',date:'2026-07-20',month:'2026-07',amount:400});
  `);
  const out = screen(ctx, 'duepayment');
  R.ok('renders', out.ok, out.error);
  R.ok('a soft-deleted unpaid invoice does not create a balance', !has(out.html, 'Ali Hassan'));
  R.ok("an archived member's unpaid invoice does not appear", !has(out.html, 'Archived Person'));
  R.ok('the only member with a real balance is listed with the right total (1,150 QAR)',
    has(out.html, 'Sara Ahmed') && /1 of 1 members with an outstanding balance · 1,150 QAR/.test(out.html),
    (out.html.match(/\d+ of \d+ members with an outstanding balance[^<]*/) || [])[0]);
}
{
  const ctx = club();
  const out = screen(ctx, 'reminders');
  R.ok('renders', out.ok, out.error);
  R.ok('archived members are excluded', !has(out.html, 'Archived Person'));
  R.ok('the Expired member is chased', has(out.html, 'Omar Khalid'));
  R.ok('a Frozen member is NOT chased (paused, not lapsed)', !has(out.html, 'Frozen Kid'));
  R.ok('the Expired KPI matches the single expired row listed',
    /kpi-value num">1</.test(out.html), (out.html.match(/kpi-value num">\d+</g) || []));
}
{
  const ctx = club(`state.members.find(m=>m.id===101).familyId=1; state.members.find(m=>m.id===104).familyId=1;`);
  const out = screen(ctx, 'families');
  R.ok('renders', out.ok, out.error);
  R.ok('familyMembers() excludes an archived sibling',
    JSON.stringify(Q(ctx, 'familyMembers(1).map(m=>m.id)')) === '[101]', Q(ctx, 'familyMembers(1).map(m=>m.id)'));
  R.ok('the household card does not list the archived sibling', !has(out.html, 'Archived Person'));
  R.ok('the household member count matches the rows shown (1)', has(out.html, '1 members'));
}
{
  const ctx = club();
  const out = screen(ctx, 'trials');
  R.ok('renders', out.ok, out.error);
  R.ok('the trial row is listed', has(out.html, 'Trial Kid'));
  R.ok('the trial count matches the rows listed', node(ctx, 'trial-count') === '1 of 1', node(ctx, 'trial-count'));
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('MEMBER STATUS — one member, one status, every screen');
{
  const ctx = club();
  R.ok('101 Active / 103 Expired / 105 Frozen',
    Q(ctx, 'state.members.filter(m=>!m.deleted).map(m=>m.id+":"+memberStatus(m)).join(",")') === '101:Active,102:Active,103:Expired,105:Frozen',
    Q(ctx, 'state.members.filter(m=>!m.deleted).map(m=>m.id+":"+memberStatus(m)).join(",")'));

  const badgeFor = (name, screenName) => {
    const c = club();
    const o = screen(c, screenName);
    const i = o.html.indexOf(name);
    if (i < 0) return null;
    // 2400 chars stays inside one table row on every screen tested here (the next row for
    // the same member starts ~2457 chars later on Enrolled Members).
    const m = o.html.slice(i, i + 2400).match(/badge (active|expired|frozen|completed|withdrawn)\b/);
    return m ? m[1] : null;
  };
  R.ok('Frozen Kid is badged "frozen" on Enrolled Members', badgeFor('Frozen Kid', 'enrolled') === 'frozen', badgeFor('Frozen Kid', 'enrolled'));
  R.ok('Frozen Kid is badged "frozen" on Member History', badgeFor('Frozen Kid', 'history') === 'frozen', badgeFor('Frozen Kid', 'history'));
  R.ok('Omar Khalid is badged "expired" on Enrolled Members', badgeFor('Omar Khalid', 'enrolled') === 'expired', badgeFor('Omar Khalid', 'enrolled'));
  R.ok('Omar Khalid is badged "expired" on Member History', badgeFor('Omar Khalid', 'history') === 'expired', badgeFor('Omar Khalid', 'history'));
  R.ok('Ali Hassan is badged "active" on Enrolled Members', badgeFor('Ali Hassan', 'enrolled') === 'active', badgeFor('Ali Hassan', 'enrolled'));
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('EDGE DATA — a member with nothing on file must not break a screen');
{
  const EDGE = `
    state.members.push(
      {id:201},
      {id:202,name:'',phone:'',enrollments:[],subscriptions:[],dailyAttendance:{}},
      {id:203,name:'No Sub',phone:'+97431000203',sport:'Karate',coachId:1,expiryDate:'2026-12-01'},
      {id:204,name:'Empty Att',phone:'+97431000204',sport:'Karate',coachId:1,expiryDate:'2026-12-01',
       enrollments:[{sport:'Karate',coachId:1,classes:8,price:600}],subscriptions:[],dailyAttendance:{'2026-07':{}}},
      {id:205,name:'Bad Birthdate',phone:'+97431000205',birthdate:'not-a-date',sport:'Karate',coachId:1}
    );
  `;
  const SCREENS = ['birthdays', 'mymembership', 'onboarding', 'renewaldetail', 'renewals', 'transfers',
    'members', 'duepayment', 'enrolled', 'families', 'history', 'trials', 'reminders', 'completed'];
  const bad = [];
  for (const s of SCREENS) {
    const ctx = club(EDGE + (s === 'mymembership' ? 'state.user={memberId:202};' : ''));
    const o = screen(ctx, s);
    if (!o.ok) bad.push(`${s}: ${o.error}`);
  }
  R.ok(`no membership screen throws on nameless / phoneless / enrollment-less members (${SCREENS.length} screens)`,
    bad.length === 0, bad);

  // Helpers called directly with the same junk.
  const ctx = club(EDGE);
  R.ok('memberStatus survives a member that is just an id',
    typeof Q(ctx, 'memberStatus(state.members.find(m=>m.id===201))') === 'string');
  R.ok('liveAttendanceCount on an empty dailyAttendance returns zeroes',
    JSON.stringify(Q(ctx, 'liveAttendanceCount(state.members.find(m=>m.id===204))')) === JSON.stringify({ y: 0, n: 0, total: 0 }),
    Q(ctx, 'liveAttendanceCount(state.members.find(m=>m.id===204))'));
  R.ok('daysUntilBirthday on an unparseable birthdate returns null',
    Q(ctx, 'daysUntilBirthday("not-a-date")') === null, Q(ctx, 'daysUntilBirthday("not-a-date")'));
  R.ok('subAttendanceWindow on a member with no subscriptions does not throw',
    Q(ctx, 'JSON.stringify(subAttendanceWindow(state.members.find(m=>m.id===203),{activity:"Karate"}))') === '{"from":null,"to":null}',
    Q(ctx, 'JSON.stringify(subAttendanceWindow(state.members.find(m=>m.id===203),{activity:"Karate"}))'));
}

// ─────────────────────────────────────────────────────────────────────────────
R.section('EMPTY CLUB — first-run must not crash the membership screens');
{
  const ctx = mkctx({ role: 'admin' });
  H.vm.runInContext(`
    state.members=[];state.invoices=[];state.expenses=[];state.salaries=[];state.sales=[];
    state.products=[];state.rentals=[];state.rentalCustomers=[];state.coaches=[];state.schedule=[];
    state.swimGroups=[];state.trials=[];state.families=[];state.drivers=[];state.notes=[];
    state.posts=[];state.advices=[];state.auditLog=[];state.cashCounts=[];state.membershipTransfers=[];
    state.settings=state.settings||{};state.session={role:'admin'};state.user={};
  `, ctx);
  const bad = [];
  for (const s of ['birthdays', 'mymembership', 'onboarding', 'renewaldetail', 'renewals', 'transfers',
    'members', 'duepayment', 'enrolled', 'families', 'history', 'trials', 'reminders']) {
    const o = H.renderScreen(ctx, s);
    if (!o.ok) bad.push(`${s}: ${o.error}`);
  }
  R.ok('every membership screen renders against an empty database', bad.length === 0, bad);
}

R.done();
