// v6.424 — Expenses search was a no-op: with an empty search the description check is short-
// circuited, but the moment you type, e.description.toLowerCase() runs for EVERY expense and a
// row with no description (e.g. an auto Bank-Commission entry) threw, crashing refresh() so the
// list never filtered. The predicate now coerces description to a string.
const H = require('./qc-harness.js');
const R = H.reporter('EXPENSES · search filter (no-description guard)');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.expenses = [
      { id:1, date:'2026-07-29', month:'2026-07', category:'Salary', method:'cash', amount:200, description:'200 Coach Mostafa' },
      { id:2, date:'2026-07-29', month:'2026-07', category:'Salary', method:'cash', amount:1000, description:'1200 Coach Abdel Salaam Advance Salary' },
      { id:3, date:'2026-07-28', month:'2026-07', category:'Bank Commission', method:'card', amount:12, autoBankCommission:true },  // NO description
    ];
  `);
}

R.section('the filter predicate does not throw on a no-description row + filters correctly');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const res = run(ctx, `(function(){
    const filter = { search:'mostafa' };
    try {
      const rows = state.expenses.filter(e => {
        if (filter.search && !String(e.description || '').toLowerCase().includes(filter.search.toLowerCase())) return false;
        return true;
      });
      return { threw:false, ids: rows.map(r => r.id) };
    } catch (e) { return { threw:true, err:e.message }; }
  })()`);
  R.ok('searching "mostafa" does NOT throw (the old bug)', res.threw === false, res);
  R.ok('only the Mostafa row matches', JSON.stringify(res.ids) === JSON.stringify([1]), res);
}

R.section('the OLD (unguarded) predicate WOULD have thrown — proving the root cause');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const threw = run(ctx, `(function(){
    const filter = { search:'mostafa' };
    try { state.expenses.filter(e => { if (filter.search && !e.description.toLowerCase().includes(filter.search.toLowerCase())) return false; return true; }); return false; }
    catch (e) { return true; }
  })()`);
  R.ok('the unguarded e.description.toLowerCase() throws on the no-description row', threw === true);
}

R.section('the Expenses screen renders with a no-description expense present');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `window._expFilterMonthsAll = true;`);
  const out = H.renderScreen(ctx, 'expenses');
  R.ok('expenses screen renders', out.ok, out.error);
}

R.section('source: description is coerced to a string in the filter');
{
  const src = H.readSrc();
  R.ok('the filter coerces description with String(e.description || "")', /if \(filter\.search && !String\(e\.description \|\| ''\)\.toLowerCase\(\)\.includes/.test(src));
}

R.done();
