// v6.470 — Camp Closure screen: for active Summer Camp members with unused paid days, SWITCH the
// balance to another activity (reuses switchSport) or REFUND the pro-rata value. The refund records
// a money-out "Refund" expense + closes the camp package, leaving the original invoice + the coach's
// commission untouched (reversible by deleting the expense). This locks the balance math, the screen
// wiring, and the money side-effects.
const H = require('./qc-harness.js');
const R = H.reporter('CAMP CLOSURE · switch / refund');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const app = H.readSrc();
  R.ok('a Refund expense category is reserved', /'Refund', 'Cash collected by owner', 'Others'/.test(app) && /'Salary','Refund'/.test(app));
  R.ok('the campclosure route is registered admin-only', /campclosure: \{ label: 'Camp Closure'[\s\S]{0,80}adminOnly: true/.test(app));
  R.ok('the screen is admin-gated', /PAGES\.campclosure = \(main\) => \{[\s\S]{0,120}currentRole\(\) !== 'admin'/.test(app));
  R.ok('balance = paid days − live attended (matches the card)', /const attended = live\.total > 0 \? live\.y : \(parseInt\(sub\.attendedClasses\)/.test(app) && /balance = Math\.max\(0, total - attended\)/.test(app));
  R.ok('refund = balance × per-day', /refund: Math\.round\(balance \* perDay\)/.test(app));
  R.ok('Switch reuses the tested switchSport flow', /onclick="switchSport\(\$\{r\.m\.id\}\)"/.test(app));
  R.ok('Refund opens the refund modal', /onclick="_campRefund\(\$\{r\.m\.id\}\)"/.test(app));
  R.ok('the refund backs up first', /downloadBackup\(\); \} catch \(_\) \{\}   \/\/ safety copy first/.test(app));
  R.ok('the refund is a money-out Refund expense, invoice untouched', /category: 'Refund', amount: amt/.test(app) && !/invoicePaid|inv\.amountPaid *=/.test(app.slice(app.indexOf('_campApplyRefund'), app.indexOf('_campApplyRefund') + 900)));
  R.ok('the refund closes the camp package (reversible marker)', /r\.sub\.status = 'completed';[\s\S]{0,120}campClosureRefund = \{/.test(app));
  R.ok('the refund is audited', /audit\('camp\.refund'/.test(app));
}

R.section('balance math on seeded data');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const probe = run(ctx, `
    (function(){
      // craft a camp member: 22 paid, attend 8 of them
      const id = 900001;
      const start='2026-07-01', end='2026-08-30';
      const att = {};
      // 8 attended days in July for Summer Camp
      att['2026-07'] = { 'Summer Camp': {} };
      for (const d of [1,2,3,6,7,8,9,10]) att['2026-07']['Summer Camp'][String(d)] = 'Y';
      state.members.push({ id, name:'Camp Kid', nameArabic:'طفل', status:'Active', joinDate:start, startDate:start, expiryDate:end,
        enrollments:[{sport:'Summer Camp', coachId:null, classes:22, price:1760, validity:60, start}],
        subscriptions:[{ _sid:'sc900', activity:'Summer Camp', coachId:null, start, end, totalClasses:22, attendedClasses:0, amountPaid:1760, status:'active', invoiceNumber:'INVCC1' }],
        dailyAttendance: att });
      state.invoices.push({ id: 990001, ref:'INVCC1', date:start, customerId:id, amount:1760, amountPaid:1760, category:'Membership', lineItems:[{sport:'Summer Camp', price:1760, classes:22}] });
      const r = _campClosureRow(state.members.find(m=>m.id===id));
      return { total:r.total, attended:r.attended, balance:r.balance, paid:r.paidAmt, perDay:r.perDay, refund:r.refund };
    })()
  `);
  R.ok('paid days read from the package', probe.total === 22, JSON.stringify(probe));
  R.ok('attended counted live from the register (8)', probe.attended === 8, JSON.stringify(probe));
  R.ok('balance = 22 − 8 = 14', probe.balance === 14, JSON.stringify(probe));
  R.ok('per-day = 1760 ÷ 22 = 80', probe.perDay === 80, JSON.stringify(probe));
  R.ok('refund = 14 × 80 = 1120', probe.refund === 1120, JSON.stringify(probe));

  const rendered = H.renderScreen(ctx, 'campclosure');
  R.ok('the screen renders and lists the member', rendered.ok && /Camp Kid/.test(rendered.html), rendered.error || rendered.html.slice(0, 120));
}

R.section('refund side-effects (money-safe)');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = run(ctx, `
    (function(){
      const id = 900002, start='2026-07-01', end='2026-08-30';
      const att = { '2026-07': { 'Summer Camp': {} } };
      for (const d of [1,2,3,6,7,8,9,10]) att['2026-07']['Summer Camp'][String(d)] = 'Y';
      state.members.push({ id, name:'Refund Kid', status:'Active', joinDate:start, startDate:start, expiryDate:end,
        enrollments:[{sport:'Summer Camp', coachId:7, classes:22, price:1760, validity:60, start}],
        subscriptions:[{ _sid:'sc902', activity:'Summer Camp', coachId:7, start, end, totalClasses:22, attendedClasses:0, amountPaid:1760, status:'active', invoiceNumber:'INVCC2' }],
        dailyAttendance: att });
      const inv = { id: 990002, ref:'INVCC2', date:start, customerId:id, amount:1760, amountPaid:1760, category:'Membership', lineItems:[{sport:'Summer Camp', coachId:7, price:1760, classes:22}] };
      state.invoices.push(inv);
      const expBefore = (state.expenses||[]).length;
      const invPaidBefore = inv.amountPaid, invAmtBefore = inv.amount;
      const out = _campApplyRefund(id, 1120, 'cash', '2026-08-13', 'camp closed');
      const m = state.members.find(x=>x.id===id);
      const refundExp = (state.expenses||[]).find(e=>e.refundForMember===id);
      return {
        returned: out,
        expAdded: (state.expenses||[]).length - expBefore,
        expCat: refundExp && refundExp.category, expAmt: refundExp && refundExp.amount,
        subClosed: m.subscriptions[0].status, hasMarker: !!m.subscriptions[0].campClosureRefund,
        invoiceUnchanged: inv.amount === invAmtBefore && inv.amountPaid === invPaidBefore,
        droppedFromList: (function(){ const r=_campClosureRow(m); return (r.sub.status==='completed'||!!r.sub.campClosureRefund); })(),
      };
    })()
  `);
  R.ok('the refund returns an expense id', res.returned && res.returned.expenseId != null, JSON.stringify(res.returned));
  R.ok('exactly one Refund expense is added', res.expAdded === 1 && res.expCat === 'Refund' && res.expAmt === 1120, JSON.stringify(res));
  R.ok('the camp package is closed', res.subClosed === 'completed' && res.hasMarker, JSON.stringify(res));
  R.ok('the ORIGINAL INVOICE is untouched (amount + amountPaid)', res.invoiceUnchanged, JSON.stringify(res));
  R.ok('the member drops off the closure list afterward', res.droppedFromList, JSON.stringify(res));
}

R.done();
