// v6.467 — a one-click "↩ Unpaid" button on each PAID/partly-paid Salaries row reverses the
// payment: it removes the coach/month's salary payment record AND the linked auto Salary
// expense(s), audits it as salary.unpaid, and the row reverts to Pending. Same effect as the
// pay manager's "Clear all payments", surfaced directly on the row. Money-safe: only THIS
// coach/month's own records are touched.
const H = require('./qc-harness.js');
const R = H.reporter('SALARIES · mark coach unpaid');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('an ↩ Unpaid button shows on paid/partial rows', /const unpaidBtn = \(p\.paidStatus === 'paid' \|\| p\.paidStatus === 'partial'\)/.test(src) && /_salMarkUnpaid\(\$\{p\.coachId\}/.test(src));
  R.ok('the button is appended to the row actions', /\+ undoSettleBtn \+ unpaidBtn;/.test(src));
  R.ok('_salMarkUnpaid is defined', /window\._salMarkUnpaid = function \(coachId, monthKey\)/.test(src));
  R.ok('it removes the salary record for that coach/month', /state\.salaries = \(state\.salaries \|\| \[\]\)\.filter\(s => s\.id !== rec\.id\)/.test(src));
  R.ok('it removes the linked auto Salary expense(s)', /state\.expenses = \(state\.expenses \|\| \[\]\)\.filter\(e => !\(e\._salaryAutoExpense && String\(e\.salaryId\) === String\(rec\.id\)\)\)/.test(src));
  R.ok('it audits as salary.unpaid', /audit\('salary\.unpaid'/.test(src));
  R.ok('it confirms the change reached the cloud', /confirmSaved\(/.test(src));
}

R.section('functional: paid coach → unpaid removes payment + linked expense');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = run(ctx, `
    (function(){
      // Stub the side-effecting UI so the handler runs headlessly.
      window.confirm = () => true;
      window.render = () => {};
      window.confirmSaved = () => {};
      if (typeof audit !== 'function') window.audit = () => {};
      if (typeof toast !== 'function') window.toast = () => {};
      const coachId = (state.coaches && state.coaches[0] && state.coaches[0].id) || 1;
      if (!state.coaches || !state.coaches.length) state.coaches = [{ id: coachId, name: 'Test Coach' }];
      const month = '2026-08';
      // A paid salary record + its linked auto Salary expense.
      state.salaries = state.salaries || [];
      state.expenses = state.expenses || [];
      state.salaries.push({ id: 'rec-unpaid-1', coachId, month, kind: 'paid', payments: [{ id: 'p1', amount: 500, method: 'cash', date: '2026-08-02' }] });
      state.expenses.push({ id: 'exp-unpaid-1', _salaryAutoExpense: true, salaryId: 'rec-unpaid-1', category: 'Salary', amount: 500, month, description: 'Coach salary — Test' });
      // An UNRELATED salary record + expense that must survive.
      state.salaries.push({ id: 'rec-keep', coachId: coachId + 999, month, kind: 'paid', payments: [{ id: 'x', amount: 111 }] });
      state.expenses.push({ id: 'exp-keep', _salaryAutoExpense: true, salaryId: 'rec-keep', category: 'Salary', amount: 111, month });

      const before = { recFound: !!_salPaidRec(coachId, month) };
      _salMarkUnpaid(coachId, month);
      return {
        before,
        recGone: !_salPaidRec(coachId, month),
        expGone: !state.expenses.some(e => e.id === 'exp-unpaid-1'),
        otherRecKept: state.salaries.some(s => s.id === 'rec-keep'),
        otherExpKept: state.expenses.some(e => e.id === 'exp-keep'),
      };
    })()
  `);
  R.ok('the paid record existed before', res.before.recFound, JSON.stringify(res));
  R.ok('the salary payment record is removed', res.recGone, JSON.stringify(res));
  R.ok('the linked Salary expense is removed', res.expGone, JSON.stringify(res));
  R.ok('an unrelated coach’s record is untouched', res.otherRecKept, JSON.stringify(res));
  R.ok('an unrelated Salary expense is untouched', res.otherExpKept, JSON.stringify(res));
}

R.done();
