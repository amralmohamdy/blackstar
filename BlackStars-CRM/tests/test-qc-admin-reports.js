/* ═══════════════════════════════════════════════════════════════════════════
   QC — ADMIN/DATA + DASHBOARD/REPORTS
   Modules under test: danger, databackup, dataexport, dataimport, preferences,
   dashboard, dashboardkpi, monthlyreport (+ probes: settings, users, club,
   sports, audit, cleanup, reports, notes, posts, products, productsales,
   sales, rentals).

   Run:  node tests/test-qc-admin-reports.js     (exits non-zero on failure)

   Assertions describing CORRECT behaviour PASS. Assertions marked `// DEFECT:`
   describe what the code SHOULD do and currently FAIL — they are the bug report.
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const H = require('./qc-harness.js');
const R = H.reporter('ADMIN & REPORTS');

const SRC = H.readSrc();
const PAGES_SRC = fs.readFileSync(path.join(H.DIR, 'pages.js'), 'utf8');
const APP_SRC = fs.readFileSync(path.join(H.DIR, 'app.js'), 'utf8');

// The body of `PAGES.<name> = ...` up to the next top-level PAGES definition.
function pageSource(name) {
  const start = PAGES_SRC.indexOf(`PAGES.${name} = (main`);
  if (start < 0) return '';
  const next = PAGES_SRC.indexOf('\nPAGES.', start + 10);
  return PAGES_SRC.slice(start, next < 0 ? PAGES_SRC.length : next);
}
// The body of a top-level `function <name>(` in app.js or pages.js.
function fnSource(name) {
  for (const src of [APP_SRC, PAGES_SRC]) {
    const start = src.indexOf(`\nfunction ${name}(`);
    if (start < 0) continue;
    let i = src.indexOf('{', start), depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (!depth) return src.slice(start, j + 1); }
    }
  }
  return '';
}

const run = (ctx, js) => H.vm.runInContext(js, ctx);
const mk = (role, extra) => H.seed(H.makeCtx({ role }), extra);

// draw*() helpers write into containers fetched with $('#id') → document.querySelector,
// which the harness stubs non-capturing. Swap in a capturing stub for the call.
function capture(ctx, call) {
  const store = {};
  const prev = ctx.document.querySelector;
  ctx.document.querySelector = (sel) => {
    if (!store[sel]) store[sel] = {
      _h: '', style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      get innerHTML() { return this._h; }, set innerHTML(v) { this._h = String(v); },
      get textContent() { return this._h; }, set textContent(v) { this._h = String(v); },
      addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {},
    };
    return store[sel];
  };
  let err = null;
  try { run(ctx, call); } catch (e) { err = e; }
  ctx.document.querySelector = prev;
  return { store, err, html: (sel) => (store[sel] && store[sel]._h) || '' };
}

// Extra fixture on top of the shared seed: the shapes that expose these bugs.
//  - the archived member gains a subscription + attendance (so exports can leak them)
//  - a WITHDRAWN member (terminal state — must never count as "active")
//  - a soft-deleted expense (the tombstone shape the money screens already honour)
const EXTRA = `
state.members.find(m => m.id === 104).subscriptions = [{_sid:'s104',activity:'Swimming',coachId:1,totalClasses:8,start:'2026-07-01',end:'2026-08-01',status:'active',amountPaid:650}];
state.members.find(m => m.id === 104).dailyAttendance = {'2026-07':{'Swimming':{'02':'Y','09':'Y'}}};
state.members.push({id:106,name:'Gone Away',phone:'+97431000006',sport:'Karate',coachId:1,status:'Withdrawn',
  joinDate:'2026-01-01',expiryDate:'2026-12-01',enrollments:[],subscriptions:[]});
state.expenses.push({id:9,date:'2026-07-09',month:'2026-07',category:'Equipment',description:'Ghost (deleted)',amount:5000,method:'cash',deleted:true});
`;

const MY_SCREENS = ['dashboard', 'dashboardkpi', 'monthlyreport', 'preferences', 'club', 'databackup', 'danger', 'settings', 'dataexport', 'dataimport'];
const PROBE_SCREENS = ['users', 'sports', 'audit', 'cleanup', 'reports', 'notes', 'posts', 'products', 'productsales', 'sales', 'rentals'];

// ───────────────────────────────────────────────────────────────────────────
R.section('A · fixture + load sanity');
{
  const ctx = mk('admin');
  R.ok('app sources load with no error', !ctx.__loadError, ctx.__loadError);
  R.ok('every assigned screen exists in PAGES', run(ctx, `${JSON.stringify(MY_SCREENS)}.every(n => typeof PAGES[n] === 'function')`));
  R.ok('every probe screen exists in PAGES', run(ctx, `${JSON.stringify(PROBE_SCREENS)}.every(n => typeof PAGES[n] === 'function')`));
  R.ok('TODAY is the frozen QC date', run(ctx, 'TODAY') === '2026-07-24', run(ctx, 'TODAY'));
  const ctx2 = mk('admin', EXTRA);
  R.ok('fixture: archived member 104 present and soft-deleted', run(ctx2, '!!(state.members.find(m=>m.id===104)||{}).deleted'));
  R.ok('fixture: withdrawn member 106 present', run(ctx2, "memberStatus(state.members.find(m=>m.id===106)) === 'Withdrawn'"));
  R.ok('fixture: soft-deleted invoice 904 present', run(ctx2, '!!(state.invoices.find(i=>i.id===904)||{}).deleted'));
  R.ok('fixture: soft-deleted expense 9 present', run(ctx2, '!!(state.expenses.find(e=>e.id===9)||{}).deleted'));
}

// ───────────────────────────────────────────────────────────────────────────
R.section('B · every assigned screen renders for admin / receptionist / coach');
for (const role of ['admin', 'receptionist', 'coach']) {
  const ctx = mk(role, EXTRA);
  const broke = [];
  for (const s of MY_SCREENS.concat(PROBE_SCREENS)) {
    const o = H.renderScreen(ctx, s);
    if (!o.ok) broke.push(s + ': ' + o.error);
  }
  R.ok(`no assigned/probe screen throws as ${role}`, broke.length === 0, broke);
}
{
  const ctx = mk('admin', EXTRA);
  const dirty = [];
  for (const s of MY_SCREENS) {
    const o = H.renderScreen(ctx, s);
    if (o.ok && /\bNaN\b|\[object Object\]|\bundefined\b/.test(o.html)) dirty.push(s);
  }
  R.ok('no assigned screen leaks NaN / undefined / [object Object]', dirty.length === 0, dirty);
}

// ───────────────────────────────────────────────────────────────────────────
R.section('C · Dashboard KPI numbers must agree with the underlying data');
{
  const ctx = mk('admin', EXTRA);
  const s = run(ctx, 'computeStats()');
  const mc = run(ctx, 'memberCounts()');
  R.ok('Dashboard "Active Members" == memberCounts().active', s.activeMembers === mc.active, { kpi: s.activeMembers, members: mc.active });
  R.ok('Dashboard "expired" == memberCounts().expired', s.expiredMembers === mc.expired, { kpi: s.expiredMembers, members: mc.expired });
  R.ok('member counts exclude the archived member', mc.total === run(ctx, 'state.members.length') - 1, { total: mc.total });
  R.ok('Dashboard revenue == billedInMonth (deleted invoices excluded)',
    s.currRevenue === run(ctx, 'billedInMonth("2026-07")') && s.currRevenue === 2900, s.currRevenue);
  R.ok('billedInMonth ignores the soft-deleted invoice 904',
    run(ctx, 'billedInMonth("2026-04")') === 0, run(ctx, 'billedInMonth("2026-04")'));

  // "Needs attention" expired tile vs the canonical Expired bucket.
  const dashExpired = run(ctx, `(() => { let n = 0; for (const m of state.members) { if (m.deleted) continue;
    const st = memberStatus(m); if (st === 'Withdrawn') continue; if (st === 'Expired') n++; } return n; })()`);
  R.ok('Dashboard "Expired memberships" tile == memberCounts().expired', dashExpired === mc.expired, { tile: dashExpired, canonical: mc.expired });
}

// ───────────────────────────────────────────────────────────────────────────
R.section('D · Owner Dashboard (dashboardkpi) vs the Members screen it links to');
{
  const ctx = mk('admin', EXTRA);
  const D = run(ctx, 'computeDashboard("2026-07")');
  const mc = run(ctx, 'memberCounts()');
  R.ok('Owner Dashboard "expired" == memberCounts().expired', D.expired === mc.expired, { kpi: D.expired, canonical: mc.expired });

  // DEFECT: computeDashboard() buckets everything that is not 'Expired' into `active`,
  // so a WITHDRAWN (refunded & left) member — and a frozen one — are shown as "Active
  // members" on the Owner Dashboard. The card links to the Members screen, which shows 2.
  // RESOLVED as strict Active. The card LINKS to the Members screen, so it must show the same
  // number the Active chip there shows — matching the click-through beats the broader "current"
  // reading. Withdrawn and Frozen are both excluded; the donut/leaderboard below use the wider
  // isCurrentMember() (active + completed + frozen) because they are headcounts, not this KPI.
  R.ok('Owner Dashboard "Active members" counts neither Withdrawn nor Frozen members',
    D.active === mc.active,
    { ownerDashboard: D.active, members_active: mc.active, withdrawn: mc.withdrawn, frozen: mc.frozen });

  // DEFECT (same root cause, stated as the user-visible mismatch): the KPI links to
  // `members`, where the Active chip reads 2 — the Owner Dashboard says 4.
  R.ok('DEFECT: Owner Dashboard "Active members" agrees with the Members screen Active count',
    D.active === mc.active, { ownerDashboard: D.active, membersScreen: mc.active });

  R.ok('Owner Dashboard collection rate excludes deleted invoices',
    D.billed === run(ctx, '(state.invoices||[]).filter(i=>!i.deleted).reduce((s,i)=>s+invoiceTotal(i),0)'), D.billed);
  R.ok('Owner Dashboard revenue trend has 6 buckets, none NaN',
    D.trend.length === 6 && D.trend.every(t => typeof t.value === 'number' && !isNaN(t.value)), D.trend);
}

// ───────────────────────────────────────────────────────────────────────────
R.section('E · soft-deleted / archived records must never reach a dashboard widget');
{
  const ctx = mk('admin', EXTRA);

  // DEFECT: drawRecentInvoices() iterates the raw state.invoices — a soft-deleted
  // invoice (deleted:true, excluded from every money helper) is still listed on the
  // Dashboard's "Recent Invoices" table.
  const ri = capture(ctx, 'drawRecentInvoices()');
  R.ok('drawRecentInvoices does not throw', !ri.err, ri.err && ri.err.message);
  R.ok('DEFECT: Dashboard "Recent Invoices" must exclude soft-deleted invoices',
    !/INV904/.test(ri.html('#recent-invoices')),
    (ri.html('#recent-invoices').match(/INV904[^<]*/) || ['(not found)'])[0]);

  // DEFECT: drawSportDonut() filters on isActiveStatus() only — which returns true for
  // an archived member with no expiryDate — so the donut total and per-sport counts
  // include the archived member and disagree with the "Active Members" KPI.
  const dn = capture(ctx, 'drawSportDonut()');
  const donutTotal = parseInt(((dn.html('#sport-chart').match(/font-weight="700"[^>]*>(\d+)</) || [])[1]) || '-1', 10);
  const mc = run(ctx, 'memberCounts()');
  R.ok('DEFECT: Dashboard "Members by Sport" donut must exclude archived members',
    donutTotal === mc.active + mc.completed + mc.frozen,
    { donutSaysActive: donutTotal, currentMembers: mc.active + mc.completed + mc.frozen });
  const swim = ((dn.html('#sport-chart').match(/Swimming<\/span>\s*<span class="legend-value">(\d+)</) || [])[1]);
  R.ok('DEFECT: donut Swimming count must exclude the archived Swimming member',
    swim === '1', { donutSwimming: swim, nonArchivedActiveSwimming: 1 });

  // DEFECT: drawCoachLeaderboard() has the same isActiveStatus()-only filter.
  const lb = capture(ctx, 'drawCoachLeaderboard()');
  const mostafa = ((lb.html('#coach-leaderboard').match(/Mostafa<\/div>[\s\S]{0,120}?>(\d+)\s*<span/) || [])[1]);
  R.ok('DEFECT: "Top Coaches by Students" must exclude archived members',
    mostafa === '2', { leaderboardSaysMostafa: mostafa, expectedNonArchived: 2 });
}

// ───────────────────────────────────────────────────────────────────────────
R.section('F · Monthly Report (computeMonthlyReport)');
{
  const ctx = mk('admin', EXTRA);
  const M = run(ctx, 'computeMonthlyReport("2026-07")');
  R.ok('billed = collected + due (the identity every money screen relies on)',
    Math.abs(M.billed - (M.collected + M.dueThisMonth)) < 0.005, { billed: M.billed, collected: M.collected, due: M.dueThisMonth });
  R.ok('by-method breakdown re-sums to the collected headline',
    Math.abs(Object.values(M.byMethod).reduce((a, b) => a + b, 0) - M.revenue) < 0.005, M.byMethod);
  R.ok('revenue-by-sport rows re-sum to the collected headline',
    Math.abs(M.sportRows.reduce((a, r) => a + r.amt, 0) - M.revenue) < 0.005, M.sportRows);
  R.ok('attendance rate is an integer percentage, never NaN',
    Number.isInteger(M.attendanceRate) && M.attendanceRate >= 0 && M.attendanceRate <= 100, M.attendanceRate);
  R.ok('month boundaries are correct for July (Qatar UTC+3 — no day shift)',
    M.monthStart === '2026-07-01' && M.monthEnd === '2026-07-31', { start: M.monthStart, end: M.monthEnd });
  R.ok('month boundaries are correct for a 28-day February',
    run(ctx, 'computeMonthlyReport("2026-02").monthEnd') === '2026-02-28', run(ctx, 'computeMonthlyReport("2026-02").monthEnd'));
  R.ok('archived members are excluded from the report attendance total',
    M.present === 4, { present: M.present, note: 'archived 104 has 2 Y marks that must not count' });

  // DEFECT: the expense loop in computeMonthlyReport() (and in computeStats()) does not
  // skip `e.deleted`, unlike moneyflow / cashinhand / payanalysis / availableExpenseMonths.
  // A tombstoned expense inflates Expenses and understates Net profit on BOTH screens.
  const liveExpenses = run(ctx, '(state.expenses||[]).filter(e=>!e.deleted && e.month==="2026-07" && !isSalaryCategory(e.category)).reduce((s,e)=>s+e.amount,0)');
  R.ok('DEFECT: Monthly Report expenses must exclude soft-deleted expenses',
    M.expenseEntries === liveExpenses, { reportSays: M.expenseEntries, liveExpenses });
  R.ok('DEFECT: Dashboard "Total Expenses" must exclude soft-deleted expenses',
    run(ctx, 'computeStats().currExpenses') === liveExpenses, { dashboardSays: run(ctx, 'computeStats().currExpenses'), liveExpenses });

  // DEFECT: bySport is keyed on the invoice-level `i.sport` string. For a multi-sport
  // invoice that string is "Summer Camp, Kick Boxing", so the Monthly Report invents a
  // sport that does not exist and can never be reconciled with the Owner Dashboard's
  // per-line breakdown (billedBySportInPeriod).
  const known = new Set(JSON.parse(run(ctx, 'JSON.stringify(Object.keys(billedBySportInPeriod(function (m) { return m === "2026-07"; })))')));
  const invented = M.sportRows.map(r => r.sport).filter(s => !known.has(s));
  R.ok('DEFECT: Monthly Report "Revenue by sport" must use real sports, not the joined invoice label',
    invented.length === 0, { invented, realSports: [...known] });
}

// ───────────────────────────────────────────────────────────────────────────
R.section('G · Data Export must not ship archived / soft-deleted rows');
{
  const ctx = mk('admin', EXTRA);
  const members = JSON.stringify(run(ctx, 'JSON.parse(JSON.stringify(buildMembersWorkbook()))'));
  const attend = JSON.stringify(run(ctx, 'JSON.parse(JSON.stringify(buildAttendanceWorkbook()))'));
  const expenses = JSON.stringify(run(ctx, 'JSON.parse(JSON.stringify(buildExpensesWorkbook()))'));
  const sales = JSON.stringify(run(ctx, 'JSON.parse(JSON.stringify(buildSalesWorkbook()))'));

  R.ok('members export contains the live members', members.includes('Ali Hassan'));
  R.ok('sales export builds without throwing', sales.length > 10);

  // DEFECT: buildMembersWorkbook() iterates state.members with no !m.deleted filter.
  R.ok('DEFECT: members export must exclude archived (soft-deleted) members',
    !members.includes('Archived Person'), 'Archived Person present in Club-Members.xlsx');

  // DEFECT: buildAttendanceSheetForMonth() has the same gap.
  R.ok('DEFECT: attendance export must exclude archived members',
    !attend.includes('Archived Person'), 'Archived Person present in Club-Attendance.xlsx');

  // DEFECT: buildExpensesWorkbook() has no !e.deleted filter, so a tombstoned expense
  // is exported AND folded into the sheet's "total" row.
  R.ok('DEFECT: expenses export must exclude soft-deleted expenses',
    !expenses.includes('Ghost (deleted)'), 'deleted expense present in Club-Expenses.xlsx');
}

// ───────────────────────────────────────────────────────────────────────────
R.section('H · role gating — non-admins must not reach admin-only screens');
{
  const ctx = mk('admin');
  const ADMIN_ONLY = ['danger', 'databackup', 'settings', 'preferences', 'club', 'dataimport', 'dataexport',
    'audit', 'users', 'cleanup', 'reports', 'dashboard', 'dashboardkpi', 'monthlyreport'];
  for (const role of ['receptionist', 'coach', 'student']) {
    const leaked = ADMIN_ONLY.filter(r => run(ctx, `roleCanAccess(${JSON.stringify(role)}, ${JSON.stringify(r)})`));
    R.ok(`router blocks ${role} from every admin-only route`, leaked.length === 0, leaked);
    R.ok(`${role} home route is one they are allowed to open`,
      run(ctx, `roleCanAccess(${JSON.stringify(role)}, roleHome(${JSON.stringify(role)}))`));
  }
  // (asserted on the source: the harness replaces currentRole() to pin the test role,
  // so the real implementation cannot be exercised at runtime here)
  const crSrc = fnSource('currentRole');
  R.ok('a non-admin ACCOUNT cannot escalate via the session preview role',
    /acct\s*!==\s*'admin'\s*\)\s*return acct/.test(crSrc.replace(/\s+/g, ' ')), crSrc.replace(/\s+/g, ' '));

  // In-page hard guards (defence in depth — the router is not the only line).
  const ctxR = mk('receptionist');
  const audit = H.renderScreen(ctxR, 'audit');
  R.ok('Audit Trail renders an "Admins only" wall for a receptionist', /Admins only/i.test(audit.html), audit.html.slice(0, 120));
  const cleanup = H.renderScreen(ctxR, 'cleanup');
  R.ok('Cleanup Centre renders an "Admins only" wall for a receptionist', /Admins only/i.test(cleanup.html), cleanup.html.slice(0, 120));

  // DEFECT: Users & Roles has no in-page role guard. It renders the full role map,
  // the "Preview as another role" escalation buttons and the revoke-access controls
  // for whoever reaches the handler — only the router keeps a non-admin out.
  const users = H.renderScreen(ctxR, 'users');
  R.ok('DEFECT: Users & Roles must hard-guard on role like Audit/Cleanup do',
    /Admins only/i.test(users.html) || !/Preview as another role/i.test(users.html),
    'receptionist render exposes the role-preview + role-map controls');
  R.ok('DEFECT: Users & Roles handler contains a currentRole() admin guard',
    /currentRole\(\)\s*!==\s*'admin'/.test(pageSource('users').slice(0, 800)),
    'no admin guard in the first 800 chars of PAGES.users');
}

// ───────────────────────────────────────────────────────────────────────────
R.section('I · destructive actions: admin gate + backup + audit + cloud confirmation');
{
  const settingsSrc = pageSource('settings');
  const importSrc = pageSource('dataimport');

  // The shared danger-zone guard is correct: admin check, backup, two confirms,
  // then a re-check of the role after the (async) confirms.
  R.ok('dangerAction() gates on admin', /const dangerAction[\s\S]{0,400}currentRole\(\)\s*!==\s*'admin'/.test(settingsSrc));
  R.ok('dangerAction() forces a backup download between the two confirms',
    /dangerAction[\s\S]{0,600}downloadBackup/.test(settingsSrc));
  R.ok('dangerAction() re-checks the role after the second confirm',
    (settingsSrc.match(/currentRole\(\)\s*!==\s*'admin'/g) || []).length >= 2);
  R.ok('Clear-all-data is wired through dangerAction', /#reset-btn'\)?\??\.addEventListener\('click', \(\) => dangerAction/.test(settingsSrc));
  R.ok('Hard-Reset is wired through dangerAction', /#hard-reset-btn'\)?\??\.addEventListener\('click', \(\) => dangerAction/.test(settingsSrc));
  R.ok('on-device auto-backup restore is admin-gated', /restoreLocalBackup = async function[\s\S]{0,200}currentRole\(\)\s*!==\s*'admin'/.test(PAGES_SRC));
  R.ok('the cloud sync-check is admin-gated', /runSyncCheck = async function[\s\S]{0,200}currentRole\(\)\s*!==\s*'admin'/.test(PAGES_SRC));
  R.ok('restore-from-file confirms against the cloud before claiming success', /confirmSaved\(`✓ Restored/.test(settingsSrc));
  R.ok('restore-from-file writes an audit entry', /audit\('data\.restore'/.test(settingsSrc));

  // DEFECT: "Restore from backup" replaces the ENTIRE database from an arbitrary
  // file, but — unlike every sibling destructive action — never checks the role.
  const restoreBlock = settingsSrc.slice(settingsSrc.indexOf("$('#restore-btn')"), settingsSrc.indexOf('// Shared guard for destructive actions'));
  R.ok('DEFECT: "Restore from backup" must be admin-only like every other destructive action',
    /currentRole\(\)\s*!==\s*'admin'/.test(restoreBlock),
    'no role check anywhere in the #restore-btn / #restore-file handler');

  // DEFECT: Data Import "Apply & Reset" wholesale-replaces members, coaches, expenses
  // and sales behind ONE confirm(): no admin gate, no forced backup, no audit entry,
  // and it reports "Imported successfully" from a bare save() instead of confirmSaved()
  // — i.e. it claims success without confirming the write reached the cloud.
  const applyBlock = importSrc.slice(importSrc.indexOf("$('#apply-import')"));
  R.ok('DEFECT: Data Import "Apply & Reset" must be admin-only',
    /currentRole\(\)\s*!==\s*'admin'/.test(applyBlock), 'no role check in the apply handler');
  R.ok('DEFECT: Data Import "Apply & Reset" must download a backup first',
    /downloadBackup/.test(importSrc), 'no downloadBackup() anywhere in PAGES.dataimport');
  R.ok('DEFECT: Data Import "Apply & Reset" must write an audit entry',
    /audit\(/.test(importSrc), 'PAGES.dataimport never calls audit()');
  R.ok('DEFECT: Data Import must confirm against the cloud before reporting success',
    /confirmSaved/.test(applyBlock), 'apply handler calls save() then toasts success immediately');

  // DEFECT: resetData() and loadDemoData() are the two most destructive operations in
  // the app and neither leaves an audit entry (restore does).
  R.ok('DEFECT: "Clear all data" must write an audit entry', /audit\(/.test(fnSource('resetData')), 'resetData() never calls audit()');
  R.ok('DEFECT: "Load demo data" must write an audit entry', /audit\(/.test(fnSource('loadDemoData')), 'loadDemoData() never calls audit()');
}

// ───────────────────────────────────────────────────────────────────────────
R.section('J · the audit trail stays immutable');
{
  const ctx = mk('admin', EXTRA);
  const before = run(ctx, 'JSON.stringify(state.auditLog)');
  for (const s of MY_SCREENS.concat(['audit', 'cleanup', 'users', 'reports'])) H.renderScreen(ctx, s);
  run(ctx, 'computeStats(); computeMonthlyReport("2026-07"); computeDashboard("2026-07"); buildMembersWorkbook(); buildExpensesWorkbook();');
  R.ok('rendering every admin/report screen never rewrites an existing audit entry',
    run(ctx, 'JSON.stringify(state.auditLog)') === before);
  R.ok('audit() only appends — no cap / splice / trim in its body',
    !/splice|shift\(\)|slice\(-|length\s*=\s*\d/.test(fnSource('audit')), fnSource('audit').slice(0, 80));
  R.ok('no screen in scope deletes or updates an audit entry',
    !MY_SCREENS.concat(['audit', 'cleanup', 'users']).some(n => /state\.auditLog\s*=(?!=)|auditLog\.(splice|shift|pop)/.test(pageSource(n))));
}

// ───────────────────────────────────────────────────────────────────────────
R.section('K · Settings / Preferences / Danger Zone markup + section filtering');
{
  const ctx = mk('admin');
  const out = H.renderScreen(ctx, 'settings');
  R.ok('Settings renders the four sub-sections', ['preferences', 'club', 'data', 'danger']
    .every(s => out.html.includes(`data-sset="${s}"`)));
  R.ok('the Danger Zone card is inside a data-sset="danger" card', /data-sset="danger"[\s\S]{0,400}Danger Zone/.test(out.html));
  R.ok('the idle-logout preference is admin-only in the markup',
    H.renderScreen(mk('admin'), 'preferences').html.includes('pref-idlemin') &&
    !H.renderScreen(mk('receptionist'), 'preferences').html.includes('pref-idlemin'));

  // DEFECT: the "Data Statistics" table lost its opening <div class="card" data-sset="data">.
  // It therefore (a) renders outside any card and outside any section, so it is visible on
  // EVERY settings sub-page — including Preferences and the Danger Zone — and (b) leaves a
  // stray </div> that closes an ancestor early.
  const opens = (out.html.match(/<div\b/g) || []).length, closes = (out.html.match(/<\/div>/g) || []).length;
  R.ok('DEFECT: Settings markup must have balanced <div> tags',
    opens === closes, { open: opens, close: closes });
  const afterDanger = out.html.slice(out.html.indexOf('Each button downloads a full backup'));
  R.ok('DEFECT: the Data Statistics table must live in its own data-sset="data" card',
    /<div class="card" data-sset="data">[\s\S]{0,200}<table>[\s\S]{0,200}Members/.test(afterDanger.slice(0, 600)),
    afterDanger.slice(0, 160).replace(/\s+/g, ' '));
}

// ───────────────────────────────────────────────────────────────────────────
R.section('L · robustness against absent optional fields');
{
  const GAPS = {
    'invoice with neither customerName nor description':
      `state.invoices.push({id:950,category:'Membership',date:'2026-07-05',month:'2026-07',amount:120,lineItems:[{sport:'Karate',price:120}]});`,
    'invoice with no sport and no lineItems':
      `state.invoices.push({id:951,customerId:101,customerName:'Ali Hassan',date:'2026-07-06',month:'2026-07',amount:90});`,
    'invoice with no date': `state.invoices.push({id:952,customerName:'X',month:'2026-07',amount:70,lineItems:[{sport:'Karate',price:70}]});`,
    'expense with no description': `state.expenses.push({id:20,date:'2026-07-11',month:'2026-07',category:'Others',amount:33,method:'cash'});`,
    'expense with no category': `state.expenses.push({id:21,date:'2026-07-12',month:'2026-07',description:'no cat',amount:44,method:'cash'});`,
    'member with no name': `state.members.push({id:150,phone:'+9743x',sport:'Karate',coachId:1,expiryDate:'2026-09-01',enrollments:[],subscriptions:[{_sid:'z',activity:'Karate',coachId:1,totalClasses:8,start:'2026-07-01',end:'2026-09-01'}]});`,
    'member with no sport': `state.members.push({id:151,name:'No Sport',phone:'+9743y',coachId:1,expiryDate:'2026-09-01',enrollments:[],subscriptions:[]});`,
    'product with no name': `state.products.push({id:9,category:'Gear',price:10,stock:0});`,
    'sale with no items and no customerName': `state.sales.push({id:9,date:'2026-07-13',month:'2026-07',total:25});`,
    'rental with no customerName': `state.rentals.push({id:9,date:'2026-07-14',month:'2026-07',facility:'Boxing Room',hours:1,amount:100,method:'cash'});`,
    'note with no text': `state.notes.push({id:9,createdAt:'2026-07-01T00:00:00Z'});`,
    'legacy audit entry with no action/summary': `state.auditLog.push({id:'a9',ts:'2026-07-02T10:00:00Z'});`,
    'salary row with no coach': `state.salaries.push({id:'sal9',month:'2026-07',amount:100});`,
  };
  for (const [label, extra] of Object.entries(GAPS)) {
    const ctx = mk('admin', extra);
    const broke = [];
    for (const s of MY_SCREENS.concat(PROBE_SCREENS)) { const o = H.renderScreen(ctx, s); if (!o.ok) broke.push(s + ': ' + o.error); }
    for (const b of ['buildMembersWorkbook', 'buildAttendanceWorkbook', 'buildExpensesWorkbook', 'buildSalesWorkbook',
      'computeStats', 'computeDashboard']) { try { run(ctx, b + '()'); } catch (e) { broke.push(b + ': ' + e.message); } }
    try { run(ctx, 'computeMonthlyReport("2026-07")'); } catch (e) { broke.push('computeMonthlyReport: ' + e.message); }
    R.ok(`survives: ${label}`, broke.length === 0, broke);
  }

  // DEFECT: PAGES.rentals dereferences state.settings.facilityRates[...] unguarded.
  // settings.facilityRates is backfilled by a load-time migration only — restoring a
  // backup does Object.assign(state, incoming) and bypasses it, so a backup taken
  // before that setting existed makes the Rentals screen throw on open.
  const ctxNoRates = mk('admin', `state.settings = {};`);
  const rentals = H.renderScreen(ctxNoRates, 'rentals');
  R.ok('DEFECT: Rentals must not crash when settings.facilityRates is absent (restored backup)',
    rentals.ok, rentals.error);
}

// ───────────────────────────────────────────────────────────────────────────
R.section('M · "Clear all data" really clears the database');
{
  const ctx = mk('admin', EXTRA);
  // resetData() calls render()/save(), which need browser+Storage plumbing the harness
  // does not provide — the state wipe itself happens first, which is what we assert.
  try { run(ctx, 'resetData(true)'); } catch (_) {}
  const left = run(ctx, `JSON.stringify({ members: state.members.length, invoices: state.invoices.length,
    expenses: state.expenses.length, families: (state.families||[]).length, notes: (state.notes||[]).length,
    cashCounts: (state.cashCounts||[]).length, swimGroups: (state.swimGroups||[]).length, drivers: (state.drivers||[]).length })`);
  const L = JSON.parse(left);
  R.ok('members / invoices / expenses are cleared', L.members === 0 && L.invoices === 0 && L.expenses === 0, L);
  R.ok('the audit trail survives a wipe (it is immutable)', run(ctx, 'state.auditLog.length') >= 1);

  // DEFECT: the button says "Clear all data (start empty)" and the copy says it
  // "permanently empties the ENTIRE database", but resetData() never touches families,
  // notes, cashCounts, swimGroups or drivers — they are left orphaned, pointing at
  // member ids that no longer exist.
  R.ok('DEFECT: "Clear all data" must also clear families / notes / cash counts / swim groups / drivers',
    L.families === 0 && L.notes === 0 && L.cashCounts === 0 && L.swimGroups === 0 && L.drivers === 0, L);
}

R.done();
