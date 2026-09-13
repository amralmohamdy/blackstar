// QC regression — COACHES / SALARIES and SUMMER CAMP.
//
// Screens under test: coachhome, coachsalary, coachattendance, coachperf,
//                     campschedule, campmembers, campdrivers, camproutes
// Probed as well:     coaches, advice, attreport, salaries (the admin pay screen the
//                     coach-facing numbers must agree with)
//
// Every assertion below is either
//   (a) a lock on CORRECT current behaviour  → must PASS, or
//   (b) a `// DEFECT:` proof of a real bug   → FAILS on today's code on purpose,
//       so the run exits non-zero and the defect stays visible until it is fixed.
// Nothing here is weakened to go green. Run: node tests/test-qc-coaches-camp.js
const H = require('./qc-harness.js');
const R = H.reporter('COACHES & CAMP');

const mk = (role, extra) => H.seed(H.makeCtx({ role: role || 'admin' }), extra || '');
const q = (ctx, expr) => H.vm.runInContext('(' + expr + ')', ctx);

// The shared seed stores coach.active as boolean `true`; the app stores 'Y'/'N'.
// Most tests normalise it so the payroll screen actually has rows to assert on —
// see section 8, which pins the boolean handling itself.
const ACTIVE_Y = `state.coaches.forEach(c => c.active = 'Y');`;

// Screens that write into `$('#id')` rather than into `main` need a memoising
// document.querySelector, otherwise their output goes to a detached node.
function capQS(ctx) {
  const memo = {};
  ctx.document.querySelector = (sel) => (memo[sel] = memo[sel] || ctx.document.createElement());
  return { memo, get: (sel) => (memo[sel] && memo[sel]._h) || '' };
}
function renderCoachPerf(ctx) {
  const cap = capQS(ctx);
  const out = H.renderScreen(ctx, 'coachperf');
  return { out, html: cap.get('#cp-body') };
}
function renderSalaries(ctx) {
  const cap = capQS(ctx);
  const out = H.renderScreen(ctx, 'salaries');
  return { out, tbody: cap.get('#sal-tbody'), count: cap.get('#sal-count') };
}
// coachperf commission bars: "NAME <span>rate</span> … <div width:64px>VALUE</div>"
function perfBars(html, section) {
  const parts = html.split('Revenue by Coach');
  const block = section === 'revenue' ? (parts[1] || '') : (parts[0] || '');
  const out = {};
  const re = /width:110px;font-size:12px;font-weight:500[^>]*>([^<]*?)(?:\s*<span[^>]*>([^<]*)<\/span>)?<\/div>[\s\S]*?width:64px[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(block))) out[(m[1] || '').trim()] = { rate: m[2], value: m[3] };
  return out;
}
function perfRates(html) {
  const block = html.split('Attendance Rate by Coach')[1] || '';
  const out = {};
  const re = /width:110px;font-size:12px;font-weight:500">([^<]*)<\/div>[\s\S]*?width:48px[^>]*>([^<]*)</g;
  let m;
  while ((m = re.exec(block))) out[m[1].trim()] = m[2];
  return out;
}
const kpi = (html, label) =>
  (html.match(new RegExp(label + '<\\/div><div class="kpi-value"[^>]*>([^<]*)')) || [])[1];

// ═══════════════════════════════════════════════════════════════════════════
R.section('1 · Pay helpers — baseline (these numbers anchor every cross-screen check)');
{
  const ctx = mk('admin', ACTIVE_Y);
  R.ok('commission basis defaults to "attendance"', q(ctx, 'state.settings.commissionBasis') === 'attendance', q(ctx, 'state.settings.commissionBasis'));

  const p1 = q(ctx, "computeMonthlyPay(1,'2026-07')");
  const p2 = q(ctx, "computeMonthlyPay(2,'2026-07')");
  const p3 = q(ctx, "computeMonthlyPay(3,'2026-07')");
  // Mostafa: Ali's 650 Swimming package, 8 classes, 2 attended in July → 650/8*2 = 162.50 base.
  R.ok('Mostafa Jul base = 162.50 (2 of 8 classes attended)', Math.abs(p1.commissionBase - 162.5) < 1e-9, p1.commissionBase);
  R.ok('Mostafa Jul commission = 48.75 (30%)', Math.abs(p1.commissionAmount - 48.75) < 1e-9, p1.commissionAmount);
  R.ok('Mostafa Jul pending = 146.25 (the 6 unattended classes)', Math.abs(p1.commissionPending - 146.25) < 1e-9, p1.commissionPending);
  // Iyad: Sara's 650 Kick Boxing line on a MULTI-SPORT invoice, 12 classes, 2 attended.
  R.ok('Iyad Jul base = 650/12*2 = 108.33', Math.abs(p2.commissionBase - 650 / 12 * 2) < 1e-9, p2.commissionBase);
  R.ok('Iyad Jul commission = 32.50', Math.abs(p2.commissionAmount - 32.5) < 1e-9, p2.commissionAmount);
  R.ok('Aya (staff) Jul gross = fixed 3000, no commission', p3.gross === 3000 && p3.commissionAmount === 0, [p3.gross, p3.commissionAmount]);

  // Summer Camp must never pay commission — Sara's 1500 camp line is worth 0 to anyone.
  const campElig = q(ctx, "lineCommissionEligibility(state.members[1], state.invoices[1], {sport:'Summer Camp', price:1500}, null)");
  R.ok('Summer Camp line is commission-excluded', campElig.eligible === false && campElig.base === 0 && campElig.mode === 'camp', campElig);
  const anyCamp = q(ctx, "[1,2,3].some(c => (computeAttendanceCommission(c,'2026-07').lines||[]).some(l => l.sport==='Summer Camp'))");
  R.ok('no commission line is ever raised for Summer Camp', anyCamp === false, anyCamp);

  // No NaN / undefined anywhere in a pay object.
  const nan = q(ctx, "[1,2,3].map(c=>computeMonthlyPay(c,'2026-07')).some(p=>Object.values(p).some(v=>typeof v==='number'&&!isFinite(v)))");
  R.ok('no NaN/Infinity in any computeMonthlyPay field', nan === false, nan);
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('2 · Deleted / archived records must not earn money');
{
  const ctx = mk('admin', ACTIVE_Y + `
    // A VOIDED 5000 QAR duplicate for Ali, credited to Mostafa.
    state.invoices.push({id:905,ref:'INV905',customerId:101,customerName:'Ali Hassan',category:'Membership',sport:'Swimming',
      date:'2026-07-20',month:'2026-07',amount:5000,coachId:1,coach:'Mostafa',deleted:true,deletedAt:'2026-07-21T00:00:00Z',
      lineItems:[{sport:'Swimming',coachId:1,coach:'Mostafa',classes:8,price:5000}]});
  `);
  const p1 = q(ctx, "computeMonthlyPay(1,'2026-07')");
  R.ok('computeMonthlyPay ignores a soft-deleted invoice', Math.abs(p1.commissionBase - 162.5) < 1e-9, p1.commissionBase);
  R.ok('coachEarnings ignores a soft-deleted invoice', q(ctx, "coachEarnings(state.coaches[0],'2026-07').revenue") === 650, q(ctx, "coachEarnings(state.coaches[0],'2026-07').revenue"));

  const { out, html } = renderCoachPerf(ctx);
  R.ok('coachperf renders', out.ok && html.length > 500, out.error || html.length);
  // DEFECT 1 (MONEY): PAGES.coachperf → statsFor() loops state.invoices with NO `inv.deleted`
  // guard, so a voided invoice is counted as revenue AND paid commission. Trigger: the voided
  // 5000 QAR INV905 above. Revenue reads 5,650 (should be 650) and Total commission 1,695
  // (should be 81 = Mostafa 48.75 + Iyad 32.50).
  // 1,300 = Mostafa's Swimming 650 + Iyad's Kick Boxing 650. The voided 5,000 is gone (defect 1)
  // AND Iyad's line — which lives on Sara's multi-sport invoice with no invoice-level coachId —
  // is now counted (defect 3). The old screen showed 650: voided money in, a whole coach out.
  R.ok('coachperf Revenue KPI excludes deleted invoices and includes line-item coaches', kpi(html, 'Revenue \\([^)]*\\)') === '1,300', kpi(html, 'Revenue \\([^)]*\\)'));
  R.ok('DEFECT: coachperf Total commission excludes deleted invoices', kpi(html, 'Total commission') !== '1,695', kpi(html, 'Total commission'));
}
{
  const ctx = mk('admin', ACTIVE_Y + `
    // An ARCHIVED member who still carries a July subscription under Mostafa.
    const a = state.members.find(m=>m.id===104);
    a.subscriptions=[{_sid:'s104',activity:'Swimming',coachId:1,totalClasses:8,start:'2026-07-01',end:'2026-08-01',status:'active'}];
    a.dailyAttendance={'2026-07':{'Swimming':{'02':'Y','09':'Y'}}};
  `);
  R.ok('computeAttendanceCommission skips archived members', q(ctx, "computeAttendanceCommission(1,'2026-07').lines.every(l=>l.memberName!=='Archived Person')"), true);
  const { html } = renderCoachPerf(ctx);
  // DEFECT 2: PAGES.coachperf → statsFor() iterates state.members with no `m.deleted` guard,
  // so an archived member is still counted in "Students per Coach" / "Total students".
  // Trigger: member 104 (deleted:true) given a July subscription. Reads 3, should be 2.
  R.ok('DEFECT: coachperf student count excludes archived members', kpi(html, 'Total students') === '2', kpi(html, 'Total students'));
}
{
  const ctx = mk('admin', ACTIVE_Y + `
    state.invoices.push({id:906,customerId:105,customerName:'Frozen Kid',category:'Membership',sport:'Karate',
      date:'2026-07-01',month:'2026-07',amount:600,deleted:true,deletedAt:'2026-07-02T00:00:00Z',
      lineItems:[{sport:'Karate',coachId:1,classes:8,price:600}]});
  `);
  const roster = q(ctx, 'coachStudents(1)');
  // DEFECT 3: coachStudents() (app.js) has no `if (inv.deleted) continue;`. A VOIDED invoice
  // still puts the member on the coach's roster — it feeds coachhome "My Students",
  // coachattendance, and resolvePostRecipients (who a coach may message).
  // Trigger: voided INV906 for Frozen Kid. Roster reads [Ali Hassan, Frozen Kid], should be [Ali Hassan].
  R.ok('DEFECT: coachStudents ignores voided invoices', roster.length === 1 && roster[0].name === 'Ali Hassan', roster.map(r => r.name));
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('3 · Same coach, same month — the screens must agree');
{
  const ctxA = mk('admin', ACTIVE_Y + `window._salMonth='2026-07';`);
  const sal = renderSalaries(ctxA);
  R.ok('salaries screen lists all 3 people for Jul', /Mostafa/.test(sal.tbody) && /Iyad/.test(sal.tbody) && /Aya/.test(sal.tbody), sal.count);
  R.ok('salaries shows Mostafa 30% × 163 = 49', /30% × 163 = 49/.test(sal.tbody), (sal.tbody.match(/30% × [^<]*/g) || []));
  R.ok('salaries shows Iyad 30% × 108 = 33', /30% × 108 = 33/.test(sal.tbody), (sal.tbody.match(/30% × [^<]*/g) || []));

  const ctxC = mk('coach', ACTIVE_Y + `state.user={role:'coach',coachId:1}; state.session={role:'coach',coachId:1};`);
  const cs = H.renderScreen(ctxC, 'coachsalary');
  const csGross = (cs.html.match(/Gross[\s\S]{0,220}?kpi-value num">([^<]*)</) || [])[1];
  R.ok('coachsalary (Mostafa) Gross = 49, same as Salaries', csGross === '49', csGross);

  const ctxH = mk('coach', ACTIVE_Y + `state.user={role:'coach',coachId:1}; state.session={role:'coach',coachId:1};`);
  const ch = H.renderScreen(ctxH, 'coachhome');
  const chNow = (ch.html.match(/This month salary[\s\S]{0,220}?kpi-value num">([^<]*)</) || [])[1];
  R.ok('coachhome (Mostafa) this-month salary = 49, same as Salaries', chNow === '49', chNow);

  const { html: perfHtml } = renderCoachPerf(ctxA);
  const comm = perfBars(perfHtml, 'commission');
  // DEFECT 4 (MONEY): PAGES.coachperf → statsFor() builds its commission base from the WHOLE
  // invoice amount (`paid`/`activeBase`), not from the attendance basis every other screen uses.
  // Mostafa Jul: coachperf 195 vs Salaries / My Salary / coach dashboard 49.
  R.ok('DEFECT: coachperf Mostafa Jul commission agrees with Salaries (49)', comm.Mostafa && comm.Mostafa.value === '49', comm.Mostafa);
  // DEFECT 5 (MONEY): the same statsFor() matches revenue on `inv.coachId` ONLY and never walks
  // `inv.lineItems`. Iyad's 650 Kick Boxing line lives on Sara's MULTI-SPORT invoice 901, which
  // carries no invoice-level coachId — so Coach Performance reports Iyad earning 0 for July
  // while Salaries pays him 33. A coach's whole month can read as worthless.
  R.ok('DEFECT: coachperf Iyad Jul commission agrees with Salaries (33)', comm.Iyad && comm.Iyad.value === '33', comm.Iyad);
  const rev = perfBars(perfHtml, 'revenue');
  R.ok('DEFECT: coachperf Iyad Jul revenue counts his line-item revenue (650)', rev.Iyad && rev.Iyad.value === '650', rev.Iyad);

  // DEFECT 6: the commission-bar label prints `c.rate` from a spread object where statsFor's
  // ATTENDANCE `rate` has already overwritten the coach's commission rate — and unrounded.
  // Mostafa's badge reads "66.66666666666666%" next to his commission; his rate is 30%.
  R.ok('DEFECT: coachperf commission bar shows the coach commission rate (30%)', comm.Mostafa && comm.Mostafa.rate === '30%', comm.Mostafa && comm.Mostafa.rate);
  R.ok('DEFECT: coachperf never prints an unrounded float percentage', !/\d\.\d{6,}%/.test(perfHtml), (perfHtml.match(/\d\.\d{6,}%/) || [])[0]);
}
{
  // A coach whose invoice month and attendance month differ: Omar paid in May, one class
  // attended in May, membership ran 1 May → 1 Jun.
  const ctxH = mk('coach', ACTIVE_Y + `state.user={role:'coach',coachId:2}; state.session={role:'coach',coachId:2};`);
  const ch = H.renderScreen(ctxH, 'coachhome');
  const mayRow = (ch.html.match(/<td>May 26[\s\S]{0,300}?<\/tr>/) || [''])[0].replace(/\s+/g, ' ');
  const mayTotal = (mayRow.match(/font-bold">([^<]*)</) || [])[1];
  const payMay = q(ctxH, "computeMonthlyPay(2,'2026-05').gross");
  R.ok('computeMonthlyPay(Iyad, 2026-05) = 0 on the attendance basis', payMay === 0, payMay);
  // DEFECT 7 (MONEY): PAGES.coachhome's "My Salary" table is built from coachEarnings(), which
  // is the PAYMENT basis (whole fee in the invoice month), while coachsalary, PAGES.salaries and
  // computeMonthlyPay all run the ATTENDANCE basis the club actually pays on. The coach's own
  // dashboard tells Iyad he earned 195 QAR in May 2026; My Salary and the admin payroll say 0.
  R.ok('DEFECT: coachhome May total matches computeMonthlyPay (0)', mayTotal === '0' || mayRow === '', mayRow);
}
{
  // Aya joined 2026-07-01. The admin payroll hides her from earlier months (PAGES.salaries →
  // joinedBy); her own dashboard does not.
  const ctxA = mk('admin', ACTIVE_Y + `state.coaches[2].joinedDate='2026-07-01'; window._salMonth='2026-04';`);
  const sal = renderSalaries(ctxA);
  R.ok('salaries hides a coach from months before joinedDate', !/Aya/.test(sal.tbody), (sal.tbody.match(/<div class="font-bold">[^<]*/g) || []));

  const ctxH = mk('coach', ACTIVE_Y + `state.coaches[2].joinedDate='2026-07-01'; state.user={role:'coach',coachId:3}; state.session={role:'coach',coachId:3};`);
  const ch = H.renderScreen(ctxH, 'coachhome');
  // DEFECT 8 (MONEY): coachhome ignores coach.joinedDate. Aya (fixed 3000, joined 1 Jul 2026)
  // is shown "Apr 26 · 3,000" and "May 26 · 3,000" on her own dashboard — 6,000 QAR of salary
  // she was never owed, for months before she worked here. Salaries (admin) correctly omits them.
  R.ok('DEFECT: coachhome hides months before joinedDate', !/<td>Apr 26/.test(ch.html) && !/<td>May 26/.test(ch.html),
    (ch.html.match(/<td>(Apr|May|Jul) 26/g) || []));
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('4 · Attendance windows');
{
  const ctx = mk('admin', ACTIVE_Y + `
    // A mid-month coach handover: Karate under Mostafa 1–15 Jul, under Iyad 16 Jul–16 Aug.
    // The member trained once in each window (5 Jul and 20 Jul).
    state.members.push({id:120,name:'Handover Kid',phone:'+97431000120',sport:'Karate',coachId:2,
      joinDate:'2026-07-01',expiryDate:'2026-08-16',status:'Active',
      enrollments:[{sport:'Karate',coachId:2,classes:8,price:600}],
      subscriptions:[
        {_sid:'sA',activity:'Karate',coachId:1,totalClasses:4,start:'2026-07-01',end:'2026-07-15',status:'expired'},
        {_sid:'sB',activity:'Karate',coachId:2,totalClasses:8,start:'2026-07-16',end:'2026-08-16',status:'active'}],
      dailyAttendance:{'2026-07':{'Karate':{'05':'Y','20':'Y'}}}});
  `);
  const m = 'state.members.find(x=>x.id===120)';
  R.ok('attendedYForSub honours the subscription window (Mostafa 1–15 Jul → 1)',
    q(ctx, `attendedYForSub(${m}, ${m}.subscriptions[0])`) === 1, q(ctx, `attendedYForSub(${m}, ${m}.subscriptions[0])`));
  R.ok('attendedYForSub honours the subscription window (Iyad 16 Jul–16 Aug → 1)',
    q(ctx, `attendedYForSub(${m}, ${m}.subscriptions[1])`) === 1, q(ctx, `attendedYForSub(${m}, ${m}.subscriptions[1])`));

  const { html } = renderCoachPerf(ctx);
  const rates = perfRates(html);
  // DEFECT 9: PAGES.coachperf → statsFor() reads attendanceFor(m, monthKey, sport) — EVERY mark
  // in the month for that sport — with no [sub.start, sub.end] bound. So the 20 Jul class, which
  // belongs to Iyad's subscription, is ALSO credited to Mostafa. Mostafa's marks should be
  // Ali 2Y+1N plus Handover 1Y = 3 of 4 = 75%; the screen shows 4 of 5 = 80%.
  R.ok('DEFECT: coachperf attendance rate is windowed per subscription (Mostafa 75%)', rates.Mostafa === '75%', rates);
}
{
  // subAttendanceWindow's v6.307 renewal-gap carry. As of v6.434 commission uses this SAME
  // corrected window as the member card — this pins that they now agree (no more raw-window gap).
  const ctx = mk('admin', ACTIVE_Y + `
    state.members.push({id:130,name:'Gap Kid',sport:'Karate',coachId:1,joinDate:'2026-05-01',expiryDate:'2026-08-20',status:'Active',
      enrollments:[{sport:'Karate',coachId:1,classes:8,price:600}],
      subscriptions:[
        {_sid:'g1',activity:'Karate',coachId:1,totalClasses:8,start:'2026-06-01',end:'2026-07-05',status:'expired'},
        {_sid:'g2',activity:'Karate',coachId:1,totalClasses:8,start:'2026-07-20',end:'2026-08-20',status:'active'}],
      dailyAttendance:{'2026-07':{'Karate':{'08':'Y','10':'Y','22':'Y'}}}});
  `);
  const m = 'state.members.find(x=>x.id===130)';
  const win = q(ctx, `subAttendanceWindow(${m}, ${m}.subscriptions[1])`);
  // v6.433: the LAST package now opens its window's end (fill-up-to-paid), so `to` is null unless
  // the class limit was reached. This test's member is under the limit → to === null. The renewal-
  // gap absorption this asserts is about `from`, which is unchanged (day after the prev end).
  R.ok('subAttendanceWindow absorbs the renewal gap (from = day after prev end)', win.from === '2026-07-06' && win.to === null, win);
  R.ok('raw sub.start is later than the corrected window start', q(ctx, `${m}.subscriptions[1].start`) === '2026-07-20', q(ctx, `${m}.subscriptions[1].start`));
  const rawY = q(ctx, `attendedYForSub(${m}, ${m}.subscriptions[1])`);
  const winY = q(ctx, `(()=>{const w=subAttendanceWindow(${m},${m}.subscriptions[1]);return liveAttendanceCount(${m},'Karate',w.from,w.to).y;})()`);
  // v6.434: commission counts attendance through the SAME corrected window as the member card,
  // so a late-but-paid class reads as attended (not a phantom expiry true-up). Both count 3.
  R.ok('commission and the member card agree on attended (both 3, corrected window)', rawY === 3 && winY === 3, { rawY, winY });
}
{
  const ctx = mk('admin', ACTIVE_Y);
  R.ok('liveAttendanceCount on a member with no grid → zeros, no crash', JSON.stringify(q(ctx, 'liveAttendanceCount({})')) === JSON.stringify({ y: 0, n: 0, total: 0 }), q(ctx, 'liveAttendanceCount({})'));
  R.ok('liveAttendanceCount windows by date', q(ctx, "liveAttendanceCount(state.members[0],'Swimming','2026-07-01','2026-07-05').y") === 1, q(ctx, "liveAttendanceCount(state.members[0],'Swimming','2026-07-01','2026-07-05').y"));
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('5 · Coach role — no leakage of other coaches / club money');
{
  const ctx = mk('coach', ACTIVE_Y + `state.user={role:'coach',coachId:2}; state.session={role:'coach',coachId:2};`);
  R.ok('currentRole() is coach and cannot be escalated', q(ctx, 'currentRole()') === 'coach' && q(ctx, 'accountRole()') === 'coach', [q(ctx, 'currentRole()'), q(ctx, 'accountRole()')]);
  // coachsalary was re-enabled v6.448 — a coach CAN reach their own salary page again (but NOT the
  // admin salaries screen, other coaches' perf, camp admin, club revenue, etc.).
  for (const route of ['salaries', 'coachperf', 'campmembers', 'campdrivers', 'camproutes', 'clubrevenue', 'dashboard', 'members', 'attreport', 'coaches'])
    R.ok(`coach is blocked from ${route}`, q(ctx, `roleCanAccess('coach','${route}')`) === false, route);
  for (const route of ['coachhome', 'coachsalary', 'coachattendance', 'campschedule', 'advice'])
    R.ok(`coach can reach ${route}`, q(ctx, `roleCanAccess('coach','${route}')`) === true, route);

  for (const screen of ['coachhome', 'coachattendance']) {
    const o = H.renderScreen(ctx, screen);
    R.ok(`${screen} renders for a coach`, o.ok && o.html.length > 400, o.error || o.html.length);
    R.ok(`${screen} does not name another coach (Mostafa)`, !/Mostafa/.test(o.html), (o.html.match(/Mostafa/g) || []).length);
    R.ok(`${screen} does not leak another coach's student (Ali Hassan)`, !/Ali Hassan/.test(o.html), (o.html.match(/Ali Hassan/g) || []).length);
    R.ok(`${screen} does not show the 3,000 staff salary`, !/3,000/.test(o.html), (o.html.match(/3,000/g) || []).length);
  }
  const adv = H.renderScreen(ctx, 'advice');
  R.ok('advice shows only this coach\'s notes', adv.ok && !/Mostafa private note/.test(adv.html), adv.error || '');
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('6 · Edge data — a coach with nothing, a camp with nothing');
{
  const ctx = mk('coach', ACTIVE_Y + `
    state.coaches.push({id:9,name:'Empty Coach',role:'coach',active:'Y'});   // no rate, no fixed salary, no students
    state.user={role:'coach',coachId:9}; state.session={role:'coach',coachId:9};`);
  const p = q(ctx, "computeMonthlyPay(9,'2026-07')");
  R.ok('empty coach: gross/net 0, no NaN', p.gross === 0 && p.net === 0 && p.commissionAmount === 0, p);
  R.ok('empty coach: paidStatus pending, paidRemaining 0', p.paidStatus === 'pending' && p.paidRemaining === 0, [p.paidStatus, p.paidRemaining]);
  for (const screen of ['coachhome', 'coachsalary', 'coachattendance']) {
    const o = H.renderScreen(ctx, screen);
    R.ok(`${screen} survives a coach with no students/rate/salary`, o.ok, o.error);
    R.ok(`${screen} prints no NaN`, !/NaN/.test(o.html), (o.html.match(/.{20}NaN.{20}/) || [])[0]);
  }
}
{
  const cases = {
    'empty camp schedule days': `state.campSchedule={startDate:'2026-06-14',endDate:'2026-06-28',days:{}};`,
    'no members at all': `state.members=[];`,
    'state.drivers missing': `delete state.drivers;`,
    'driver with no name': `state.drivers=[{id:5}];`,
    'camp member with no name/enrollments': `state.members.push({id:150,sport:'Summer Camp'});`,
    'camp member with no driver and no schedule': `state.drivers=[]; state.members.push({id:151,name:'Solo Kid',sport:'Summer Camp'});`,
  };
  for (const [label, extra] of Object.entries(cases)) {
    const ctx = mk('admin', ACTIVE_Y + extra);
    for (const screen of ['campschedule', 'campmembers', 'campdrivers', 'camproutes']) {
      const o = H.renderScreen(ctx, screen);
      R.ok(`${screen} survives: ${label}`, o.ok, o.error);
    }
  }
}
{
  const ctx = mk('admin', ACTIVE_Y);
  R.ok('campDayKeyForDate: Sun–Thu map to camp days', ['2026-06-14', '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18'].every(d => q(ctx, `campDayKeyForDate('${d}')`)), true);
  R.ok('campDayKeyForDate: Fri/Sat are off days (null)', q(ctx, "campDayKeyForDate('2026-06-19')") === null && q(ctx, "campDayKeyForDate('2026-06-20')") === null, [q(ctx, "campDayKeyForDate('2026-06-19')"), q(ctx, "campDayKeyForDate('2026-06-20')")]);
  R.ok('campDayKeyForDate: junk input → null', q(ctx, "campDayKeyForDate('')") === null && q(ctx, 'campDayKeyForDate(null)') === null, true);
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('7 · Summer Camp screens');
{
  const ctx = mk('admin', ACTIVE_Y);
  const o = H.renderScreen(ctx, 'campmembers');
  R.ok('campmembers lists the camp member (Sara)', o.ok && /Sara Ahmed/.test(o.html), o.error);
  R.ok('campmembers excludes archived members', !/Archived Person/.test(o.html), true);
  R.ok('campmembers excludes non-camp members (Ali)', !/Ali Hassan/.test(o.html), true);
}
{
  // A camp student whose driver id no longer resolves (driver removed on another device,
  // or a merge that dropped the drivers doc). Reception must still see the child somewhere.
  const ctx = mk('admin', ACTIVE_Y + `state.members.find(m=>m.id===102).campDriverId = 99;`);
  const routes = H.renderScreen(ctx, 'camproutes');
  R.ok('camproutes renders', routes.ok, routes.error);
  // DEFECT 10: PAGES.camproutes buckets students as `campDriverId === d.id` OR
  // `!m.campDriverId`. A student pointing at a driver id that no longer exists matches
  // NEITHER — Sara Ahmed vanishes from the pickup roster entirely, and from the exported
  // driver-students CSV, with no warning. PAGES.campdrivers meanwhile still counts her as
  // "Students assigned: 1" while every driver card shows 0, so the totals cannot reconcile.
  R.ok('DEFECT: camproutes still shows a student whose driver id is stale', /Sara Ahmed/.test(routes.html), false);
  const drv = H.renderScreen(ctx, 'campdrivers');
  const assigned = (drv.html.match(/Students assigned<\/div><div class="kpi-value num">(\d+)/) || [])[1];
  const notAssigned = (drv.html.match(/Not assigned<\/div><div class="kpi-value num">(\d+)/) || [])[1];
  R.ok('DEFECT: campdrivers assigned/unassigned counts reconcile with the driver cards', assigned === '0' && notAssigned === '1', { assigned, notAssigned });
}
{
  // ROLE: the code comment on PAGES.campschedule says "Coaches and students get a read-only
  // view" — only `isAdmin` gates drag-and-drop.
  const ctxAdmin = mk('admin', ACTIVE_Y);
  const admin = H.renderScreen(ctxAdmin, 'campschedule');
  R.ok('campschedule is drag-editable for admin', admin.ok && /draggable="true"/.test(admin.html), admin.error);

  const ctxCoach = mk('coach', ACTIVE_Y + `state.user={role:'coach',coachId:2}; state.session={role:'coach',coachId:2};`);
  const coach = H.renderScreen(ctxCoach, 'campschedule');
  R.ok('campschedule is not draggable for a coach', coach.ok && !/draggable="true"/.test(coach.html), coach.error);
  // DEFECT 11 (PERMISSIONS): wireCells() attaches the click→editCampCell handler for EVERY role,
  // and editCampCell/save() perform no role check. So a coach (and a student — campschedule is on
  // their allow-list too) can rewrite the club's camp schedule. The read-only hint even reads
  // "Click any class to edit it.", inviting it.
  R.ok('DEFECT: campschedule does not invite a coach to edit', !/Click any class to edit it\./.test(coach.html), (coach.html.match(/Click any class to edit it\./) || [])[0]);
  R.ok('DEFECT: campschedule cells are not click-editable for a coach', !/data-cc=/.test(coach.html), (coach.html.match(/data-cc="[^"]*"/) || [])[0]);
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('8 · Salary ledger + payroll roll-ups');
{
  const ctx = mk('admin', ACTIVE_Y);
  R.ok('salaryPayments(null) → []', q(ctx, 'salaryPayments(null).length') === 0, true);
  R.ok('salaryPaidTotal sums the payment ledger', q(ctx, "salaryPaidTotal({payments:[{amount:500},{amount:250}]})") === 750, q(ctx, "salaryPaidTotal({payments:[{amount:500},{amount:250}]})"));
  R.ok('legacy record: negative snapshotNet is clamped to 0 (never a negative "payment")',
    q(ctx, "salaryPaidTotal({paidDate:'2026-07-01',snapshotNet:-500})") === 0, q(ctx, "salaryPaidTotal({paidDate:'2026-07-01',snapshotNet:-500})"));
  R.ok('salaryTarget ignores a negative legacy snapshot and uses the live net',
    q(ctx, "salaryTarget({snapshotNet:-500}, 120)") === 120, q(ctx, "salaryTarget({snapshotNet:-500}, 120)"));
}
{
  // Exactly the shape _salAddPay writes: one 'paid' record with a payments[] ledger PLUS the
  // auto-generated Salary expense it books for that same payment.
  const ctx = mk('admin', ACTIVE_Y + `
    state.salaries=[{id:'sal9',coachId:1,coach:'Mostafa',month:'2026-07',kind:'paid',target:2000,snapshotNet:2000,snapshotGross:2000,
      payments:[{id:'p1',amount:2000,date:'2026-07-05',method:'cash'}]}];
    state.expenses=[{id:2,date:'2026-07-05',month:'2026-07',category:'Salary',amount:2000,method:'cash',
      _salaryAutoExpense:true,salaryId:'sal9',salaryPaymentId:'p1',coachId:1}];
  `);
  R.ok('salaryPaidTotal on the real record = 2000', q(ctx, 'salaryPaidTotal(state.salaries[0])') === 2000, q(ctx, 'salaryPaidTotal(state.salaries[0])'));
  R.ok('the auto salary expense is NOT double-charged as an advance', q(ctx, "computeMonthlyPay(1,'2026-07').advance") === 0, q(ctx, "computeMonthlyPay(1,'2026-07').advance"));
  R.ok('the month reads as paid once the ledger covers the target', q(ctx, "computeMonthlyPay(1,'2026-07').paidStatus") === 'paid', q(ctx, "computeMonthlyPay(1,'2026-07').paidStatus"));
  // DEFECT 12 (MONEY): salariesPaidInMonth() adds a 'paid' record's snapshotNet AND every Salary
  // expense in the month — but _salAddPay writes BOTH for one payout. One 2000 QAR payment to
  // Mostafa is reported as 4000 QAR of salary cash paid.
  R.ok('DEFECT: salariesPaidInMonth counts one 2000 payment once', q(ctx, "salariesPaidInMonth('2026-07')") === 2000, q(ctx, "salariesPaidInMonth('2026-07')"));
}
{
  // The shared seed stores coach.active as boolean `true` (as an import/sync could).
  const ctx = mk('admin');   // NOTE: deliberately WITHOUT the 'Y' normalisation
  R.ok('isCoachActive: "Y" is active', q(ctx, "isCoachActive({active:'Y'})") === true, true);
  R.ok('isCoachActive: "N" is inactive', q(ctx, "isCoachActive({active:'N'})") === false, true);
  R.ok('isCoachActive: missing field defaults to active', q(ctx, 'isCoachActive({})') === true, true);
  // DEFECT 13 (MONEY): isCoachActive() is `(c.active || 'Y') === 'Y'`, so a truthy BOOLEAN
  // `true` compares false and the coach is treated as INACTIVE. The v6 migration
  // (`if (!c.active) c.active='Y'`) does not repair it because `true` is truthy. Consequence
  // with the shared seed's 3 coaches: the whole Salaries screen renders "No active
  // coaches/staff" and salariesEarnedInMonth('2026-07') returns 0 instead of 3081.25 —
  // understating the club's salary cost on Dashboard / Monthly Report / Financial Overview.
  R.ok('DEFECT: isCoachActive treats boolean true as active', q(ctx, 'isCoachActive({active:true})') === true, q(ctx, 'isCoachActive({active:true})'));
  R.ok('DEFECT: salariesEarnedInMonth is not zeroed by a boolean active flag', q(ctx, "salariesEarnedInMonth('2026-07')") > 0, q(ctx, "salariesEarnedInMonth('2026-07')"));
  const sal = renderSalaries(ctx);
  R.ok('DEFECT: payroll is not emptied by a boolean active flag', !/No active coaches\/staff/.test(sal.tbody), sal.count);
}

// ═══════════════════════════════════════════════════════════════════════════
R.section('9 · Attendance report (probe)');
{
  const ctx = mk('admin', ACTIVE_Y);
  const cap = capQS(ctx);
  const o = H.renderScreen(ctx, 'attreport');
  R.ok('attreport renders', o.ok, o.error);
  const kpis = cap.get('#ar-kpis');
  const present = (kpis.match(/Total Present<\/div><div class="kpi-value num">(\d+)/) || [])[1];
  const liveY = q(ctx, "state.members.filter(m=>!m.deleted).reduce((s,m)=>s+liveAttendanceCount(m).y,0)");
  R.ok('the club really does have live attendance marks', liveY === 5, liveY);
  // DEFECT 14: PAGES.attreport's DEFAULT view (source:'subscription') sums the STORED
  // `s.attendedClasses` field, which lags the live attendance grid (the same lag fixed for
  // Ready-to-Renew in v6.359). With 5 recorded 'Y' marks in the seed the landing view reports
  // "Total Present 0" and "Overall Attendance Rate 0%", i.e. the report says nobody trained.
  R.ok('DEFECT: attreport default view reflects live attendance marks', present !== '0', { present, liveY });
}

R.done();
