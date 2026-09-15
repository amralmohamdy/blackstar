// v6.436 — (1) Salaries recalculate LIVE on open + a 🔄 Recalculate button re-runs the compute and
// stamps the time, so figures are never stale. (2) A sport SWITCH now carries the remaining classes
// and the transferred price onto the destination sport, marks the source subscription completed at
// what was used, and flags the destination as switch-funded — so a switch splits ONE package instead
// of leaving two full-price sports (and a later invoice re-sync won't re-charge the switched-in sport).
const H = require('./qc-harness.js');
const R = H.reporter('SALARY recalc-on-open + SWITCH class/price transfer');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('Salaries recalculate on open');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-01' });
  H.seed(ctx);
  const o = H.renderScreen(ctx, 'salaries');
  R.ok('salaries screen renders', o.ok, o.error);
  R.ok('a 🔄 Recalculate button is present', /🔄[^<]*Recalculate|Recalculate/.test(o.html));
  R.ok('window._salRecalc is exposed (button re-runs the live compute)', run(ctx, `typeof window._salRecalc`) === 'function');
  const pagesSrc = require('fs').readFileSync(require('path').join(H.DIR, 'pages.js'), 'utf8');
  R.ok('the count line is stamped with a "recalculated HH:MM" freshness time', /recalculated \$\{String\(d\.getHours\(\)\)\.padStart\(2, '0'\)\}:\$\{String\(d\.getMinutes\(\)\)\.padStart\(2, '0'\)\}/.test(pagesSrc));
  // calling recalc again keeps it working (idempotent re-render)
  let threw = false; try { run(ctx, `window._salRecalc()`); } catch (e) { threw = true; }
  R.ok('_salRecalc() re-runs without error', !threw);
}

R.section('Switch carries classes + price to the destination sport (source completed)');
{
  const src = H.readSrc(); // app.js + storage.js + pages.js joined
  R.ok('the destination enrollment takes the MOVED classes (remaining + carry-forward, v6.520)', /_remainingCls = skipReconciliation \? \(from\.classes \|\| 0\) : moved/.test(src));
  R.ok('the destination enrollment takes the RE-PRICED amount (bPrice, v6.520)', /_destPrice = skipReconciliation \? \(from\.price \|\| 0\) : bPrice/.test(src));
  R.ok('the destination is flagged switchedInto (never re-billed as a fresh membership)', /switchedInto: true/.test(src));
  R.ok('the source subscription is marked completed + switchedAwayTo', /srcSub\.status = 'completed'[\s\S]{0,80}switchedAwayTo = toSport/.test(src));
  R.ok('the destination subscription is sized to the remaining classes + switchFunded', /destSub\.totalClasses = _remainingCls[\s\S]{0,140}switchFunded = true/.test(src));
}

R.done();
