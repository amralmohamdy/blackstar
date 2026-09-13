// v6.441 — invoiceTotal no longer DOUBLE-counts a redundant sport-less "summary" line. A re-sync
// could leave a flat line (price = whole membership) ALONGSIDE the itemized per-sport lines, so the
// total summed to double (Ali Mohammed: flat 1125 + Kick Boxing/Swimming/Karate 375×3 = 2250) and a
// fully-paid member showed owing the whole amount again on the Due Payment screen. A sport-less line
// whose price EQUALS the itemized sum is now dropped; a different amount (a real registration fee)
// still counts. Also: an admin ✎ Edit lets you change a subscription's classes / price / status.
const H = require('./qc-harness.js');
const R = H.reporter('INVOICE TOTAL · redundant summary line not double-counted');
const run = (c, s) => H.vm.runInContext(s, c);
const ctx = H.makeCtx({ role: 'admin', today: '2026-08-02' });
const total = (lineItems, amount) => run(ctx, `invoiceTotal(${JSON.stringify({ lineItems, amount })})`);

R.section('redundant flat summary line is excluded');
{
  R.ok('flat 1125 + 3×375 itemized → 1125 (not 2250)', total([{ sport: null, price: 1125 }, { sport: 'Kick Boxing', price: 375 }, { sport: 'Swimming', price: 375 }, { sport: 'Karate', price: 375 }]) === 1125);
  R.ok('the due for a member who paid the real 1125 is 0, not 1125', run(ctx, `invoiceBalance({lineItems:[{sport:null,price:1125},{sport:'A',price:375},{sport:'B',price:375},{sport:'C',price:375}], amountPaid:1125, payments:[{amount:1125}]})`) === 0);
}

R.section('legitimate cases are unchanged');
{
  R.ok('a flat-only invoice (no itemized lines) keeps its total', total([{ sport: null, price: 1125 }]) === 1125);
  R.ok('a real add-on fee (different amount) still counts: 50 + 500 = 550', total([{ sport: null, price: 50 }, { sport: 'Karate', price: 500 }]) === 550);
  R.ok('normal itemized-only invoice sums its sport lines: 375×3 = 1125', total([{ sport: 'A', price: 375 }, { sport: 'B', price: 375 }, { sport: 'C', price: 375 }]) === 1125);
  R.ok('a single sport line is unchanged', total([{ sport: 'Karate', price: 500 }]) === 500);
  R.ok('no line items falls back to amount', total(null, 300) === 300);
}

R.section('source wiring — invoiceTotal guard + subscription editor');
{
  const src = H.readSrc();
  R.ok('invoiceTotal drops a sport-less line equal to the itemized sum', /REDUNDANT-SUMMARY GUARD/.test(src) && /hasSported && li && !li\.sport && Math\.abs\(price - sportedSum\) < 0\.5\) continue/.test(src));
  R.ok('editSubscription lets an admin change classes / price / coach / status', /window\.editSubscription = function/.test(src) && /id="es-price"/.test(src) && /id="es-coach"/.test(src));
  // v6.482: the profile ✎ (editSubscription) is now the single price editor — it syncs the line price + coach, recomputes inv.amount, and (below) the enrollment.
  // v6.483: inv.amount now uses the summary-guarded invoiceTotal (so a legacy redundant summary line can't double it).
  R.ok('the editor syncs the invoice line price so commission follows', /if \(!isNaN\(price\)\) line\.price = price;/.test(src) && /inv\.amount = \(typeof invoiceTotal === 'function'\) \? invoiceTotal\(inv\)/.test(src));
}

R.done();
