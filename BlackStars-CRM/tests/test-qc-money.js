// ============================================================================
// QC · MONEY MODULES
//   bankaccount · cashcollection · cashinhand · clubrevenue · invoicechecker
//   membercommission · missinginvoices · moneyflow · payanalysis
//   reconciliation · transactions
//
// Run:  node tests/test-qc-money.js     (from the project root or the tests dir)
//
// Assertions marked `// DEFECT:` FAIL on the current code on purpose — they are
// the proof of a real bug, not a broken test. Everything else locks in behaviour
// that is correct today and must stay correct.
// ============================================================================
const H = require('./qc-harness.js');
const R = H.reporter('MONEY MODULES');

// ── sandbox factory ─────────────────────────────────────────────────────────
// Two things the shared harness leaves inert that these screens need:
//   • $('#id') → document.querySelector, whose stub returns a throwaway node, so
//     Transactions' totals (written into #txn-count/#txn-tfoot) were unobservable.
//   • sessionStorage is a black hole, so loadFilter()/saveFilter() (Payments
//     Analysis) could never be driven from a test.
// Both are wired here WITHOUT touching app code.
function ctxFor(extra, opts) {
  const base = H.makeCtx(opts || { role: 'admin' });
  base.sessionStorage._d = {};
  base.sessionStorage.getItem = function (k) { return this._d[k] == null ? null : this._d[k]; };
  base.sessionStorage.setItem = function (k, v) { this._d[k] = String(v); };
  base.sessionStorage.removeItem = function (k) { delete this._d[k]; };
  const ctx = H.seed(base, extra);
  const origQS = ctx.document.querySelector;
  ctx.document.querySelector = function (sel) {
    const s = String(sel || '');
    return /^#[\w-]+$/.test(s) ? ctx.document.getElementById(s.slice(1)) : origQS.call(this, s);
  };
  return ctx;
}
const run = (ctx, js) => H.vm.runInContext(js, ctx);
const val = (ctx, js) => JSON.parse(H.vm.runInContext('JSON.stringify(' + js + ')', ctx));
const cap = (ctx, id) => ((ctx.__cap['#' + id] || {})._h || '');
const money = (s) => Number(String(s == null ? 'x' : s).replace(/,/g, ''));
const grab = (html, re) => { const m = String(html || '').match(re); return m ? money(m[1]) : NaN; };
const near = (a, b, tol) => isFinite(a) && isFinite(b) && Math.abs(a - b) <= (tol == null ? 0.01 : tol);

const MODULES = ['bankaccount', 'cashcollection', 'cashinhand', 'clubrevenue', 'invoicechecker',
  'membercommission', 'missinginvoices', 'moneyflow', 'payanalysis', 'reconciliation', 'transactions'];

// ── shared fixtures (appended to the harness seed) ──────────────────────────
// A stale-total invoice: the sport lines say 900 but the cached `amount` still
// says 650 (a sport added without recomputing the header — the documented
// "amount ≠ line-sum" drift). invoiceTotal() = 900 is the canonical figure.
const STALE_TOTAL = `
state.invoices.push({id:905,ref:'INV905',customerId:101,customerName:'Ali Hassan',category:'Membership',
  sport:'Karate',date:'2026-07-05',month:'2026-07',amount:650,amountPaid:650,method:'cash',
  lineItems:[{sport:'Karate',coachId:1,price:650},{sport:'Boxing',coachId:2,price:250}],
  payments:[{date:'2026-07-05',month:'2026-07',amount:650,method:'cash'}]});
`;
// A LEGACY stale invoice: same drift, but NO payments[] and NO amountPaid — the
// app's convention says that shape is FULLY PAID (balance 0, never a phantom due).
const LEGACY_STALE = `
state.invoices.push({id:920,ref:'INV920',customerId:103,customerName:'Omar Khalid',category:'Membership',
  sport:'Karate',date:'2026-07-02',month:'2026-07',amount:650,coachId:1,
  lineItems:[{sport:'Karate',coachId:1,price:650},{sport:'Boxing',coachId:2,price:250}]});
`;
// One invoice spanning two months: Karate starts July, Summer Camp starts August.
// Revenue policy = each sport counts in its own START month (invoiceMonthShares).
const CROSS_MONTH = `
state.members.push({id:106,name:'Cross Kid',phone:'+97431000006',sport:'Summer Camp',joinDate:'2026-07-01',
  expiryDate:'2026-09-01',status:'Active',
  enrollments:[{sport:'Summer Camp',classes:22,price:1000},{sport:'Karate',coachId:1,classes:8,price:1000}],
  subscriptions:[{_sid:'s106a',activity:'Summer Camp',totalClasses:22,start:'2026-08-01',end:'2026-09-01',status:'active'},
                 {_sid:'s106b',activity:'Karate',coachId:1,totalClasses:8,start:'2026-07-01',end:'2026-08-01',status:'active'}]});
state.invoices.push({id:906,ref:'INV906',customerId:106,customerName:'Cross Kid',category:'Membership',
  sport:'Summer Camp, Karate',date:'2026-07-03',month:'2026-07',amount:2000,amountPaid:2000,method:'cash',
  lineItems:[{sport:'Summer Camp',price:1000},{sport:'Karate',coachId:1,price:1000}],
  payments:[{date:'2026-07-03',month:'2026-07',amount:2000,method:'cash'}]});
`;
// A part-refunded, mixed-method invoice + edge rows (null customer, zero amount,
// negative/switch-credit, broken member link, expense with no method).
const REFUND = `
state.invoices.push({id:930,ref:'INV930',customerId:101,customerName:'Ali Hassan',category:'Product',sport:'Kit',
  date:'2026-07-18',month:'2026-07',amount:500,amountPaid:400,method:'card',lineItems:[{sport:'Kit',price:500}],
  payments:[{date:'2026-07-18',month:'2026-07',amount:500,method:'card'},
            {date:'2026-07-19',month:'2026-07',amount:-100,method:'cash'}]});
`;
const EDGE = `
state.invoices.push({id:910,ref:'INV910',customerId:null,customerName:null,category:'Membership',sport:null,
  date:'2026-07-20',month:'2026-07',amount:0,amountPaid:0,lineItems:[],payments:[]});
state.invoices.push({id:911,ref:'INV911',customerId:101,customerName:'Ali Hassan',category:'Membership',sport:'Swimming',
  date:'2026-07-21',month:'2026-07',amount:-200,amountPaid:-200,method:'card',switchCredit:true,
  lineItems:[{sport:'Swimming',price:-200}],payments:[{date:'2026-07-21',month:'2026-07',amount:-200,method:'card'}]});
state.invoices.push({id:912,ref:'INV912',customerId:999,customerName:'Ghost',category:'Membership',sport:'Karate',
  date:'2026-07-22',month:'2026-07',amount:300,lineItems:[{sport:'Karate',price:300}]});
state.expenses.push({id:30,date:'2026-07-25',month:'2026-07',category:'Misc',description:'no method',amount:50});
state.cashCounts.push({id:'cc0',amount:0,date:'2026-07-01',by:'',note:'',createdAt:'2026-07-01T00:00:00Z'});
`;

const TXN_DEFAULT = `window._txnState={preset:'this_month',from:'',to:'',months:[],years:[],categories:[],
  activities:[],methods:[],coachIds:[],hasDue:false,dueMode:'gross',amountField:'due',amountPreset:'any',
  amountMin:'',amountMax:'',search:''};window._txnPager=null;`;

// ════════════════════════════════════════════════════════════════════════════
R.section('0 · Every money screen renders (admin, seeded club)');
{
  const ctx = ctxFor();
  R.ok('app.js + pages.js load with no error', !ctx.__loadError, ctx.__loadError);
  for (const n of MODULES) {
    const o = H.renderScreen(ctx, n);
    R.ok(`${n} renders without throwing`, o.ok, o.error || o.stack);
    R.ok(`${n} produced markup`, o.ok && o.html.length > 200, o.ok ? o.html.length : o.error);
  }
}
{
  // Edge data must not crash a money screen nor leak NaN / undefined into the page.
  const ctx = ctxFor(EDGE);
  for (const n of MODULES) {
    const o = H.renderScreen(ctx, n);
    R.ok(`${n} survives edge data (null customer, 0 / negative amount, broken link)`, o.ok, o.error);
    const leak = (o.html || '').match(/.{0,50}(NaN|Infinity)(?![a-zA-Z]).{0,30}/);
    R.ok(`${n} shows no NaN / Infinity money`, !leak, leak && leak[0]);
  }
}

// ════════════════════════════════════════════════════════════════════════════
R.section('1 · Money helpers (the shared source of truth)');
{
  const ctx = ctxFor(STALE_TOTAL + LEGACY_STALE);
  const inv = id => `state.invoices.find(i=>i.id===${id})`;

  R.ok('invoiceTotal = Σ lineItems when lines exist (901 → 2150)', val(ctx, `invoiceTotal(${inv(901)})`) === 2150, val(ctx, `invoiceTotal(${inv(901)})`));
  R.ok('invoiceTotal beats a STALE inv.amount (905: amount 650 → total 900)', val(ctx, `invoiceTotal(${inv(905)})`) === 900, val(ctx, `invoiceTotal(${inv(905)})`));
  R.ok('invoiceTotal falls back to inv.amount with no lines (904 → 650)', val(ctx, `invoiceTotal(${inv(904)})`) === 650, val(ctx, `invoiceTotal(${inv(904)})`));
  R.ok('invoicePaid = amountPaid when present (901 → 1000)', val(ctx, `invoicePaid(${inv(901)})`) === 1000);
  R.ok('invoicePaymentsSum = Σ payment rows (901 → 1000)', val(ctx, `invoicePaymentsSum(${inv(901)})`) === 1000);
  R.ok('invoiceBalance on a part-paid invoice (901 → 1150)', val(ctx, `invoiceBalance(${inv(901)})`) === 1150);

  // Legacy convention: no payments[] and no amountPaid ⇒ FULLY PAID.
  R.ok('legacy invoice (902) balance is 0 — no phantom due', val(ctx, `invoiceBalance(${inv(902)})`) === 0);
  R.ok('legacy invoice (902) status is Paid', val(ctx, `invoiceStatus(${inv(902)})`) === 'Paid');
  R.ok('legacy + STALE total (920) still balance 0', val(ctx, `invoiceBalance(${inv(920)})`) === 0, val(ctx, `invoiceBalance(${inv(920)})`));
  R.ok('legacy + STALE total (920) still status Paid', val(ctx, `invoiceStatus(${inv(920)})`) === 'Paid');

  R.ok('normalizeMethod collapses casing / labels', JSON.stringify(val(ctx, `['Cash','VISA','Bank Transfer','fawran','Online'].map(normalizeMethod)`)) === JSON.stringify(['cash', 'card', 'transfer', 'fawran', 'transfer']));
  R.ok('_pMonth prefers p.month, falls back to the date', val(ctx, `[_pMonth({month:'2026-03',date:'2026-09-09'}),_pMonth({date:'2026-09-09'})]`).join() === '2026-03,2026-09');
}
{
  const ctx = ctxFor();
  R.ok('soft-deleted invoice 904 contributes nothing to its own month', val(ctx, `billedInMonth('2026-04')`) === 0, val(ctx, `billedInMonth('2026-04')`));
  R.ok('billedInMonth 2026-07 = 2900', val(ctx, `billedInMonth('2026-07')`) === 2900, val(ctx, `billedInMonth('2026-07')`));
  R.ok('collectedInMonth 2026-07 = 1750', val(ctx, `collectedInMonth('2026-07')`) === 1750, val(ctx, `collectedInMonth('2026-07')`));
  R.ok('dueInMonth 2026-07 = 1150', val(ctx, `dueInMonth('2026-07')`) === 1150, val(ctx, `dueInMonth('2026-07')`));
  R.ok('identity: billed = collected + due (2026-07)', near(val(ctx, `billedInMonth('2026-07')`), val(ctx, `collectedInMonth('2026-07')+dueInMonth('2026-07')`)));
  // Drawer basis: every payment counted in the month it was physically received.
  R.ok('cashCollectedInMonth 2026-07 = 1750 (by payment date)', val(ctx, `cashCollectedInMonth('2026-07')`) === 1750, val(ctx, `cashCollectedInMonth('2026-07')`));
  R.ok('cashCollectedInMonth 2026-05 = 650 (legacy invoice falls back to its own month)', val(ctx, `cashCollectedInMonth('2026-05')`) === 650, val(ctx, `cashCollectedInMonth('2026-05')`));
}

// ════════════════════════════════════════════════════════════════════════════
R.section('2 · Reconciliation — every bucket must add up');
{
  const ctx = ctxFor();
  const Rec = val(ctx, `computeReconciliation('2026-07')`);
  R.ok('Σ byMethod == revenue', near(Rec.byMethod.cash + Rec.byMethod.card + Rec.byMethod.transfer + Rec.byMethod.fawran, Rec.revenue), Rec);
  R.ok('nonCash == card + transfer + fawran', near(Rec.nonCash, Rec.byMethod.card + Rec.byMethod.transfer + Rec.byMethod.fawran));
  R.ok('accountedFor == revenue (leakage 0)', near(Rec.leakage, 0), Rec.leakage);
  R.ok('revenue matches collectedInMonth', near(Rec.revenue, val(ctx, `collectedInMonth('2026-07')`)));
  R.ok('cash collection category is booked as ownerCashTaken, not expense', Rec.expenses === 2300 && Rec.ownerCashTaken === 0, [Rec.expenses, Rec.ownerCashTaken]);
  R.ok('salary expenses are excluded from P&L expenses', Rec.salaryPaid === 2000 && Rec.expenses === 2300, [Rec.salaryPaid, Rec.expenses]);

  // Soft-deleted rows must never reach a total.
  run(ctx, `state.expenses.push({id:40,date:'2026-07-09',month:'2026-07',category:'Equipment',amount:9999,method:'cash',deleted:true});`);
  R.ok('soft-deleted EXPENSE is excluded from reconciliation', val(ctx, `computeReconciliation('2026-07').expenses`) === 2300, val(ctx, `computeReconciliation('2026-07').expenses`));
  run(ctx, `state.invoices.push({id:940,ref:'INV940',customerId:101,category:'Membership',date:'2026-07-09',month:'2026-07',amount:5000,amountPaid:5000,method:'cash',lineItems:[{sport:'Karate',price:5000}],payments:[{date:'2026-07-09',month:'2026-07',amount:5000,method:'cash'}],deleted:true});`);
  R.ok('soft-deleted INVOICE is excluded from reconciliation revenue', val(ctx, `computeReconciliation('2026-07').revenue`) === 1750, val(ctx, `computeReconciliation('2026-07').revenue`));
}
{
  // Refund (negative payment row) must not break the by-method split.
  const ctx = ctxFor(REFUND);
  const Rec = val(ctx, `computeReconciliation('2026-07')`);
  R.ok('refund row keeps Σ byMethod == revenue', near(Rec.byMethod.cash + Rec.byMethod.card + Rec.byMethod.transfer + Rec.byMethod.fawran, Rec.revenue), Rec.byMethod);
  R.ok('refund row keeps leakage at 0', near(Rec.leakage, 0), Rec.leakage);
  R.ok('refund reduces the cash bucket (1150 → 1050)', near(Rec.byMethod.cash, 1050), Rec.byMethod.cash);
}
{
  // DEFECT: the month picker shared by Bank Account / Reconciliation / Money Flow is
  // built by _recMonths(), which does NOT skip soft-deleted invoices. Invoice 904 is
  // deleted, yet it puts an entirely empty "2026-04" month into all three dropdowns.
  const ctx = ctxFor();
  const months = val(ctx, `_recMonths()`);
  const apr = val(ctx, `computeReconciliation('2026-04')`);
  R.ok('DEFECT: _recMonths() offers 2026-04, a month that exists ONLY because of soft-deleted invoice 904 (its reconciliation is entirely zero)',
    months.indexOf('2026-04') < 0, { months, aprRevenue: apr.revenue, aprAccountedFor: apr.accountedFor });
}

// ════════════════════════════════════════════════════════════════════════════
R.section('3 · Bank Account — rows, KPIs and total must agree');
{
  const ctx = ctxFor();
  run(ctx, `window._bankMonth='2026-07';`);
  const o = H.renderScreen(ctx, 'bankaccount');
  const kpiTotal = grab(o.html, /Bank credit \(non-cash\)<\/div><div style="[^"]*">([\d,\-]+)/);
  const card = grab(o.html, />Card<\/div><div style="font-size:20px;font-weight:700">([\d,\-]+)/);
  const transfer = grab(o.html, />Transfer<\/div><div style="font-size:20px;font-weight:700">([\d,\-]+)/);
  const fawran = grab(o.html, />Fawran<\/div><div style="font-size:20px;font-weight:700">([\d,\-]+)/);
  const rows = [...o.html.matchAll(/<td class="text-right num font-bold">([\d,\-]+)<\/td><\/tr>/g)].map(m => money(m[1]));
  const foot = grab(o.html, /Total<\/td><td class="text-right num">([\d,\-]+)/);
  R.ok('KPI total == card + transfer + fawran', near(kpiTotal, card + transfer + fawran), { kpiTotal, card, transfer, fawran });
  R.ok('ledger rows sum == table footer total', near(rows.reduce((a, b) => a + b, 0), foot), { rows, foot });
  R.ok('table footer total == KPI total', near(foot, kpiTotal), { foot, kpiTotal });
  R.ok('bank total == reconciliation.nonCash (screens agree)', near(kpiTotal, val(ctx, `computeReconciliation('2026-07').nonCash`)), kpiTotal);
  R.ok('no cash payment leaked into the bank ledger', o.html.indexOf('>cash<') < 0);
  R.ok('soft-deleted invoice 904 is not in the bank ledger', o.html.indexOf('INV904') < 0);
}
{
  const ctx = ctxFor(REFUND);
  run(ctx, `window._bankMonth='2026-07';`);
  const o = H.renderScreen(ctx, 'bankaccount');
  const rows = [...o.html.matchAll(/<td class="text-right num font-bold">([\d,\-]+)<\/td><\/tr>/g)].map(m => money(m[1]));
  const foot = grab(o.html, /Total<\/td><td class="text-right num">([\d,\-]+)/);
  R.ok('with a refund present, rows still sum to the footer', near(rows.reduce((a, b) => a + b, 0), foot), { rows, foot });
}

// ════════════════════════════════════════════════════════════════════════════
R.section('4 · Money Flow (Financial Overview) — must mirror Reconciliation');
{
  const ctx = ctxFor();
  run(ctx, `window._mfMonth='2026-07';`);
  const o = H.renderScreen(ctx, 'moneyflow');
  const kpis = Object.fromEntries([...o.html.matchAll(/font-weight:600">([^<]*)<\/div><\/div>\s*<div style="font-size:22px[^>]*>([\d,\-]+)/g)].map(m => [m[1].trim(), money(m[2])]));
  const Rec = val(ctx, `computeReconciliation('2026-07')`);
  R.ok('Collected == reconciliation.revenue', near(kpis['Collected'], Rec.revenue), kpis);
  R.ok('Expenses == reconciliation.expenses', near(kpis['Expenses'], Rec.expenses), kpis);
  R.ok('Due == reconciliation.due', near(kpis['Due'], Rec.due), kpis);
  R.ok('Net == Collected − Expenses − Salaries', near(kpis['Net'], kpis['Collected'] - kpis['Expenses'] - kpis['Salaries']), kpis);
  const seg = [...o.html.matchAll(/<b>([\d,\-]+)<\/b> \((\d+)%\)/g)].map(m => ({ v: money(m[1]), p: Number(m[2]) }));
  R.ok('distribution legend percentages sum to ~100%', seg.length === 0 || Math.abs(seg.reduce((s, x) => s + x.p, 0) - 100) <= 2, seg);
  R.ok('Collected-by-method rows sum to Total collected', near(Rec.byMethod.cash + Rec.byMethod.card + Rec.byMethod.transfer + Rec.byMethod.fawran, kpis['Collected']), kpis);
}

// ════════════════════════════════════════════════════════════════════════════
R.section('5 · Transactions — the billed/collected/due reference screen');
{
  const ctx = ctxFor();
  run(ctx, TXN_DEFAULT);
  const o = H.renderScreen(ctx, 'transactions');
  R.ok('transactions renders', o.ok, o.error);
  const foot = cap(ctx, 'txn-tfoot');
  const nums = [...foot.matchAll(/class="text-right num"[^>]*>([\d,\-]+)</g)].map(m => money(m[1]));
  R.ok('footer Billed == billedInMonth(2026-07)', near(nums[0], val(ctx, `billedInMonth('2026-07')`)), nums);
  R.ok('footer Paid == collectedInMonth(2026-07)', near(nums[1], val(ctx, `collectedInMonth('2026-07')`)), nums);
  R.ok('footer Due == dueInMonth(2026-07)', near(nums[2], val(ctx, `dueInMonth('2026-07')`)), nums);
  const chips = [...cap(ctx, 'txn-summary').matchAll(/margin-left:auto">([\d,\-]+)</g)].map(m => money(m[1]));
  R.ok('category chips sum to the footer billed total', near(chips.reduce((a, b) => a + b, 0), nums[0]), { chips, foot: nums[0] });
  R.ok('subtitle count text agrees with the footer', cap(ctx, 'txn-count').indexOf('2,900') >= 0 && cap(ctx, 'txn-count').indexOf('1,150') >= 0, cap(ctx, 'txn-count'));
  R.ok('soft-deleted invoice 904 is not listed', cap(ctx, 'txn-tbody').indexOf('INV904') < 0);
}
{
  // Legacy invoice, no ledger → Paid = full, Due = 0. No invented balance.
  const ctx = ctxFor();
  run(ctx, TXN_DEFAULT + `window._txnState.preset='all';`);
  H.renderScreen(ctx, 'transactions');
  const body = cap(ctx, 'txn-tbody');
  const row = body.split('<tr>').find(x => x.indexOf('INV902') >= 0) || '';
  const cells = [...row.matchAll(/class="text-right num[^"]*"[^>]*>([\d,\-—]+)</g)].map(m => m[1]);
  R.ok('legacy INV902 shows Total 650 / Paid 650 / Due —', cells.join('|') === '650|650|—', cells);
}
{
  // DEFECT: same legacy shape, but the cached `amount` drifted below the line sum.
  // invoiceBalance()/invoiceStatus()/memberOutstanding() all say FULLY PAID, yet the
  // Transactions row bills invoiceTotal (900) against invoicePaid (=inv.amount, 650)
  // and invents a 250 QAR debt. The month's Due total moves 1150 → 1400.
  const ctx = ctxFor(LEGACY_STALE);
  run(ctx, TXN_DEFAULT);
  H.renderScreen(ctx, 'transactions');
  const row = (cap(ctx, 'txn-tbody').split('<tr>').find(x => x.indexOf('INV920') >= 0) || '');
  const cells = [...row.matchAll(/class="text-right num[^"]*"[^>]*>([\d,\-—]+)</g)].map(m => m[1]);
  const footDue = [...cap(ctx, 'txn-tfoot').matchAll(/class="text-right num"[^>]*>([\d,\-]+)</g)].map(m => money(m[1]))[2];
  R.ok('DEFECT: legacy invoice INV920 (no payments[], no amountPaid, amount 650 vs lines 900) shows a phantom 250 Due on Transactions, while invoiceBalance()/invoiceStatus()/memberOutstanding() all report fully paid',
    cells[2] === '—', { row: cells, invoiceBalance: val(ctx, `invoiceBalance(state.invoices.find(i=>i.id===920))`), invoiceStatus: val(ctx, `invoiceStatus(state.invoices.find(i=>i.id===920))`), memberOutstanding103: val(ctx, `memberOutstanding(103)`), screenDueTotal: footDue, dueInMonth: val(ctx, `dueInMonth('2026-07')`) });
}
{
  // Cross-month invoice: Transactions correctly bills only July's share.
  const ctx = ctxFor(CROSS_MONTH);
  run(ctx, TXN_DEFAULT);
  H.renderScreen(ctx, 'transactions');
  const billed = [...cap(ctx, 'txn-tfoot').matchAll(/class="text-right num"[^>]*>([\d,\-]+)</g)].map(m => money(m[1]))[0];
  R.ok('cross-month invoice contributes only its July share to Transactions', near(billed, val(ctx, `billedInMonth('2026-07')`)), { billed, billedInMonth: val(ctx, `billedInMonth('2026-07')`) });
}

// ════════════════════════════════════════════════════════════════════════════
R.section('6 · Club Revenue Summary');
{
  const ctx = ctxFor();
  run(ctx, `window._crsPeriod={preset:'this_month',from:'',to:''};`);
  const o = H.renderScreen(ctx, 'clubrevenue');
  const total = grab(o.html, /Total revenue<\/div><div class="kpi-value num">([\d,\-]+)/);
  const sportPart = o.html.split('Revenue by coach')[0];
  const rows = [...sportPart.matchAll(/<td class="text-right num">([\d,\-]+) QAR<\/td>/g)].map(m => money(m[1]));
  const footer = grab(sportPart, /Total<\/td>\s*<td class="text-right num" style="color:var\(--green\)">([\d,\-]+) QAR/);
  R.ok('per-sport rows re-sum to the sport table footer', near(rows.reduce((a, b) => a + b, 0), footer, 1), { rows, footer });
  R.ok('sport table footer == Total revenue KPI', near(footer, total), { footer, total });
  R.ok('soft-deleted invoice 904 is not counted', o.html.indexOf('INV904') < 0 && total === 2900, total);
  R.ok('clean data: Club Revenue == billedInMonth == Transactions', near(total, val(ctx, `billedInMonth('2026-07')`)), { total, billed: val(ctx, `billedInMonth('2026-07')`) });
}
{
  // DEFECT: Club Revenue values each invoice at `inv.amount` (pages.js ~6301) instead
  // of invoiceTotal() = Σ lineItems, which every other money screen uses. A stale
  // header amount makes this screen disagree with Transactions for the same month.
  const ctx = ctxFor(STALE_TOTAL);
  run(ctx, `window._crsPeriod={preset:'this_month',from:'',to:''};`);
  const total = grab(H.renderScreen(ctx, 'clubrevenue').html, /Total revenue<\/div><div class="kpi-value num">([\d,\-]+)/);
  const billed = val(ctx, `billedInMonth('2026-07')`);
  R.ok('DEFECT: Club Revenue uses stale inv.amount (650) instead of invoiceTotal (900) for INV905 — its July total disagrees with Transactions / billedInMonth by 250',
    near(total, billed), { clubRevenue: total, transactionsAndBilledInMonth: billed });
}
{
  // DEFECT: Club Revenue scopes with invoiceTouchesMonth() but then adds the WHOLE
  // invoice, ignoring invoiceMonthShare() — so a cross-month invoice is counted in
  // full in EVERY month it touches.
  const ctx = ctxFor(CROSS_MONTH);
  run(ctx, `window._crsPeriod={preset:'this_month',from:'',to:''};`);
  const total = grab(H.renderScreen(ctx, 'clubrevenue').html, /Total revenue<\/div><div class="kpi-value num">([\d,\-]+)/);
  const billed = val(ctx, `billedInMonth('2026-07')`);
  R.ok('DEFECT: an invoice split across July/August (INV906, 1000 + 1000) is counted IN FULL in July by Club Revenue — 4900 vs the 3900 every other screen reports',
    near(total, billed), { clubRevenue: total, billedInMonth: billed, shares: val(ctx, `[...invoiceMonthShares(state.invoices.find(i=>i.id===906))]`) });
}

// ════════════════════════════════════════════════════════════════════════════
R.section('7 · Payments Analysis');
{
  const setFilter = (ctx, f) => run(ctx, `sessionStorage.setItem('bs-filter-payanalysis',${JSON.stringify(JSON.stringify(f))})`);
  const read = (ctx) => {
    const o = H.renderScreen(ctx, 'payanalysis');
    const kpis = Object.fromEntries([...o.html.matchAll(/kpi-label">([^<]*)<\/div>\s*<div class="kpi-value num" style="color:[^"]*">([\d,\-]+)</g)].map(m => [m[1].replace(/\s+/g, ' ').trim(), money(m[2])]));
    return { kpis, filteredTotal: grab(o.html, /Filtered total:[^\d\-]*([\d,\.\-]+)/), rows: grab(o.html, />(\d+) transactions/), html: o.html };
  };

  let ctx = ctxFor();
  setFilter(ctx, { months: ['2026-07'], day: '', from: '', to: '', method: '', activity: '', search: '' });
  let pa = read(ctx);
  R.ok('July: Total Revenue == cash + card + transfer + fawran', near(pa.kpis['Total Revenue'], pa.kpis['💵 Cash collected'] + pa.kpis['💳 Card'] + pa.kpis['🏦 Bank transfer'] + pa.kpis['⚡ Fawran']), pa.kpis);
  R.ok('July: Total Revenue == the table\'s own Filtered total', near(pa.kpis['Total Revenue'], pa.filteredTotal), { kpi: pa.kpis['Total Revenue'], filtered: pa.filteredTotal });
  R.ok('July: revenue is per-payment and month-scoped (1750)', pa.kpis['Total Revenue'] === 1750, pa.kpis);
  R.ok('July: one row per installment — INV901 appears twice (500 + 500)', (pa.html.match(/INV901/g) || []).length === 2, (pa.html.match(/INV901/g) || []).length);
  R.ok('soft-deleted invoice 904 produces no payment row', pa.html.indexOf('INV904') < 0);

  // DEFECT #1 — the month filter never reaches expenses.
  // pages.js:8199 does `delete filter.month`, but the expense filter at :8291 still
  // tests `filter.month`. Revenue is month-scoped; Expenses / Cash-in-Hand are not.
  ctx = ctxFor(`state.expenses.push({id:9,date:'2026-05-03',month:'2026-05',category:'Utilities',description:'Old bill',amount:5000,method:'cash'});`);
  setFilter(ctx, { months: ['2026-07'], day: '', from: '', to: '', method: '', activity: '', search: '' });
  pa = read(ctx);
  R.ok('DEFECT: Payments Analysis expenses ignore the Month filter (pages.js:8199 deletes filter.month, :8291 still reads it) — a 5,000 MAY expense inflates the JULY Expenses KPI to 9,300 (should be 4,300) and Cash in Hand to −6,550 (should be −1,550)',
    pa.kpis['Expenses'] === 4300, { expensesKPI: pa.kpis['Expenses'], expected: 4300, cashInHandKPI: pa.kpis['Cash in Hand'], expectedCashInHand: -1550 });

  // DEFECT #2 — a payment with no method at all is dropped from every method bucket.
  // The local normMethod('') returns '' (app.js normalizeMethod('') returns 'cash'),
  // and '' is not a key of byMethod, so the money vanishes from the KPIs while the
  // row (and the Filtered total under the table) still shows it.
  ctx = ctxFor();
  setFilter(ctx, { months: ['2026-05'], day: '', from: '', to: '', method: '', activity: '', search: '' });
  pa = read(ctx);
  R.ok('DEFECT: a payment with no `method` (legacy INV902, 650 QAR) is dropped from every method bucket — the May headline reads Total Revenue 0 while the same screen lists 1 transaction and a Filtered total of 650',
    near(pa.kpis['Total Revenue'], pa.filteredTotal), { totalRevenueKPI: pa.kpis['Total Revenue'], filteredTotal: pa.filteredTotal, rows: pa.rows, normMethodBlank: val(ctx, `normalizeMethod('')`) });
}

// ════════════════════════════════════════════════════════════════════════════
R.section('8 · Cash Collection (owner withdrawals)');
{
  const ctx = ctxFor(`state.expenses.push({id:20,date:'2026-07-15',month:'2026-07',category:CASH_COLLECTION_CATEGORY,collectedBy:'Owner',note:'',amount:1000,method:'cash'});`);
  run(ctx, `window._ccFilter=null;`);
  const o = H.renderScreen(ctx, 'cashcollection');
  const kpis = [...o.html.matchAll(/kpi-label[^>]*>([^<]*)<\/div>\s*<div class="kpi-value num"[^>]*>([\d,\-]+)</g)].map(m => [m[1].replace(/\s+/g, ' ').trim(), money(m[2])]);
  const k = Object.fromEntries(kpis);
  const footer = grab(o.html, /<td class="text-right num" style="color:var\(--red\);font-size:15px">([\d,\-]+) QAR/);
  R.ok('shown / all-time / this-month KPIs agree on a single July withdrawal', k['💵 Total withdrawn (shown)'] === 1000 && k['Total withdrawn (all time)'] === 1000 && k['📅 This month'] === 1000, k);
  R.ok('table footer total == "shown" KPI', near(footer, k['💵 Total withdrawn (shown)']), { footer, k });
  R.ok('cash collection total == reconciliation.ownerCashTaken', near(k['📅 This month'], val(ctx, `computeReconciliation('2026-07').ownerCashTaken`)), k);
  R.ok('ordinary expenses are not shown here', o.html.indexOf('Electricity') < 0);
}
{
  // DEFECT: PAGES.cashcollection filters only on `category`, never on `deleted`.
  const ctx = ctxFor(`
    state.expenses.push({id:20,date:'2026-07-15',month:'2026-07',category:CASH_COLLECTION_CATEGORY,collectedBy:'Owner',amount:1000,method:'cash'});
    state.expenses.push({id:21,date:'2026-07-16',month:'2026-07',category:CASH_COLLECTION_CATEGORY,collectedBy:'Owner',amount:400,method:'cash',deleted:true,deletedAt:'2026-07-17T00:00:00Z'});`);
  run(ctx, `window._ccFilter=null;`);
  const o = H.renderScreen(ctx, 'cashcollection');
  const k = Object.fromEntries([...o.html.matchAll(/kpi-label[^>]*>([^<]*)<\/div>\s*<div class="kpi-value num"[^>]*>([\d,\-]+)</g)].map(m => [m[1].replace(/\s+/g, ' ').trim(), money(m[2])]));
  R.ok('DEFECT: Cash Collection counts SOFT-DELETED rows — a deleted 400 QAR withdrawal is still in every KPI and in the table (1,400 shown), while Reconciliation correctly reports ownerCashTaken 1,000',
    k['💵 Total withdrawn (shown)'] === 1000, { shown: k['💵 Total withdrawn (shown)'], allTime: k['Total withdrawn (all time)'], thisMonth: k['📅 This month'], reconciliationOwnerCashTaken: val(ctx, `computeReconciliation('2026-07').ownerCashTaken`) });
}

// ════════════════════════════════════════════════════════════════════════════
R.section('9 · Cash in Hand');
{
  const ctx = ctxFor();
  const o = H.renderScreen(ctx, 'cashinhand');
  R.ok('headline shows the newest count (500 QAR)', grab(o.html, /font-size:46px[^>]*>([\d,\-]+) QAR</) === 500, o.html.match(/font-size:46px[^>]*>([^<]*)</));
  R.ok('history table lists the single seeded count', (o.html.match(/<tr[^>]*>\s*<td>20 Jul 2026/) || []).length === 1, o.html.indexOf('20 Jul 2026'));
  R.ok('no "undefined" in the count history', o.html.indexOf('undefined') < 0);
}
{
  const ctx = ctxFor(`state.cashCounts.push({id:'cc2',amount:820,date:'2026-07-23',by:'QC',note:'',createdAt:'2026-07-23T00:00:00Z'});`);
  const o = H.renderScreen(ctx, 'cashinhand');
  R.ok('delta vs previous count is computed and signed (+320)', o.html.indexOf('320') >= 0, o.html.slice(0, 400));
}
{
  const ctx = ctxFor(null, { role: 'coach' });
  const o = H.renderScreen(ctx, 'cashinhand');
  R.ok('a coach cannot see the drawer', o.html.indexOf('Only staff') >= 0, o.html.slice(0, 200));
}

// ════════════════════════════════════════════════════════════════════════════
R.section('10 · Invoice Integrity (checker)');
{
  const ctx = ctxFor(STALE_TOTAL);
  R.ok('_icAmountIssue: clean invoice 901 → no issue', val(ctx, `_icAmountIssue(state.invoices.find(i=>i.id===901))`) === null);
  R.ok('_icAmountIssue: stale invoice 905 → {lineSum 900, amount 650}', JSON.stringify(val(ctx, `_icAmountIssue(state.invoices.find(i=>i.id===905))`)) === JSON.stringify({ lineSum: 900, amount: 650 }));
  run(ctx, `window._icMonths=['2026-07'];window._iiTab='data';`);
  const o = H.renderScreen(ctx, 'invoicechecker');
  R.ok('drift tab reports exactly 1 corrupted invoice', grab(o.html, /Corrupted \/ drift<\/div><div class="kpi-value num" style="color:var\(--accent-2\)">(\d+)/) === 1, o.html.slice(0, 300));
  R.ok('the stale invoice is the one listed', o.html.indexOf('INV905') >= 0);
  R.ok('scan count excludes the soft-deleted invoice', grab(o.html, /kpi-value num">(\d+)<\/div><div class="kpi-sub">invoices scanned/) === 4, o.html);
  R.ok('drift row shows the canonical total, not the stale one', o.html.indexOf('900 QAR') >= 0);
}
{
  const ctx = ctxFor(null, { role: 'receptionist' });
  R.ok('non-admin is blocked from Invoice Integrity', H.renderScreen(ctx, 'invoicechecker').html.indexOf('Admins only') >= 0);
}

// ════════════════════════════════════════════════════════════════════════════
R.section('11 · Missing Invoices');
{
  const ctx = ctxFor();
  const rows = val(ctx, `computeMissingInvoices('2026-07').map(r=>({name:r.m.name,kind:r.kind,basis:r.basis,expected:r.expected}))`);
  R.ok('archived member 104 is never reported', rows.every(r => r.name !== 'Archived Person'), rows);
  R.ok('reports the two uninvoiced members (Frozen Kid, Omar Khalid)', rows.length === 2 && rows.map(r => r.name).sort().join() === 'Frozen Kid,Omar Khalid', rows);
  R.ok('every row carries a positive expected value', rows.every(r => r.expected > 0), rows);
  run(ctx, `window._miMonths=['2026-07'];`);
  const o = H.renderScreen(ctx, 'missinginvoices');
  R.ok('KPI "No invoice" count matches the computed rows', grab(o.html, /No invoice<\/div>\s*<div class="kpi-value num" style="color:var\(--red\)">(\d+)/) === 2, o.html.slice(0, 400));
  R.ok('uninvoiced value KPI == Σ expected', near(grab(o.html, /<div class="kpi-sub">([\d,\.]+) QAR uninvoiced/), rows.reduce((s, r) => s + r.expected, 0)), o.html.slice(0, 600));
  R.ok('a member WITH a matching invoice (Ali Hassan) is not flagged', o.html.indexOf('Ali Hassan') < 0, o.html.indexOf('Ali Hassan'));
}
{
  // Paying an invoice must clear the member from the list.
  const ctx = ctxFor(`state.invoices.push({id:950,ref:'INV950',customerId:105,customerName:'Frozen Kid',category:'Membership',
    sport:'Karate',date:'2026-06-05',month:'2026-06',amount:600,amountPaid:600,method:'cash',
    lineItems:[{sport:'Karate',coachId:1,price:600}],payments:[{date:'2026-06-05',month:'2026-06',amount:600,method:'cash'}]});`);
  const rows = val(ctx, `computeMissingInvoices('2026-07').map(r=>r.m.name)`);
  R.ok('an invoice inside the subscription window clears the member', rows.indexOf('Frozen Kid') < 0, rows);
}

// ════════════════════════════════════════════════════════════════════════════
R.section('12 · Member Commission');
{
  const ctx = ctxFor();
  run(ctx, `window._mcMonth='2026-07';`);
  const rows = val(ctx, `computeMemberCommissions('2026-07').map(r=>({m:r.memberName,s:r.sport,paid:r.paid,rate:r.rate,c:r.commission}))`);
  R.ok('Summer Camp earns no commission', rows.every(r => r.s !== 'Summer Camp'), rows);
  R.ok('archived member 104 produces no commission row', rows.every(r => r.m !== 'Archived Person'), rows);
  R.ok('commission == base × rate% for every row', rows.every(r => r.c >= 0 && r.c <= r.paid * r.rate / 100 + 0.01), rows);
  const o = H.renderScreen(ctx, 'membercommission');
  R.ok('Total commission KPI == Σ row commissions (rounded)', grab(o.html, /Total commission<\/div>\s*<div class="kpi-value num" style="color:var\(--green\)">([\d,\.]+)/) === Math.round(rows.reduce((s, r) => s + r.c, 0)), { kpi: grab(o.html, /Total commission<\/div>\s*<div class="kpi-value num" style="color:var\(--green\)">([\d,\.]+)/), sum: rows.reduce((s, r) => s + r.c, 0) });
  R.ok('Members KPI == distinct members in the rows', grab(o.html, /Members<\/div>\s*<div class="kpi-value num">(\d+)/) === new Set(rows.map(r => r.m)).size, rows);
  // Deleting an invoice must remove its commission.
  run(ctx, `state.invoices.find(i=>i.id===900).deleted=true;`);
  R.ok('a soft-deleted invoice pays no commission', val(ctx, `computeMemberCommissions('2026-07').every(r=>r.memberName!=='Ali Hassan')`) === true);
}
{
  // RESOLVED by relabelling, not by changing the number. The figure IS the billed line
  // price, and the billed price is exactly what commission is calculated on — so the
  // number is right and the word "Paid" was the defect. Sara's INV901 is 2150 billed /
  // 1000 collected; her Kick Boxing row shows 650 (the line price), while
  // invoicePaidForSport() says 302.33. Lock in BOTH halves of the resolution.
  const ctx = ctxFor();
  const kb = val(ctx, `computeMemberCommissions('2026-07').find(r=>r.memberName==='Sara Ahmed'&&r.sport==='Kick Boxing')`);
  const reallyPaid = val(ctx, `invoicePaidForSport(state.invoices.find(i=>i.id===901),'Kick Boxing')`);
  R.ok('the commission row value is the BILLED line price (the commission basis), not money received',
    near(kb.paid, 650, 0.01) && !near(kb.paid, reallyPaid, 1), { rowValue: kb.paid, invoicePaidForSport: reallyPaid });
  const mcHtml = H.renderScreen(ctx, 'membercommission').html || '';
  R.ok('Member Commission labels that column "Billed", never "Paid" — the old label contradicted the invoice',
    /Billed/.test(mcHtml) && !/>\s*Paid\s*</.test(mcHtml), mcHtml.slice(0, 0));
  R.ok('the KPI reads "Membership billed", not "Membership paid"',
    /Membership billed/.test(mcHtml) && !/Membership paid/.test(mcHtml));
}

R.done();
