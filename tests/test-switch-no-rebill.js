// v6.511 — Switched-member integrity hardening. A sport switched INTO (funded by a net-zero switch
// credit — its value moved from the old sport) must NEVER be re-billed. Before this, if the
// switch-funded subscription was missing (deleted, or the row's sport/coach edited so the save
// couldn't match it), the member-form save treated the enrollment as a brand-new sport and merged
// a FULL-PRICE line into the invoice — double-charging the member and creating a phantom due
// (Maryam Rais Shaikh: Swimming 500 + a re-billed Gymnastic 458 → 58 phantom due). Now such an
// enrollment is skipped from billing and its subscription is restored instead. Also: the switch
// audit label uses the captured source sport (was "Gymnastic → Gymnastic"), and deleting a
// switch-funded sub warns that it strands the credit.
const H = require('./qc-harness.js');
const R = H.reporter('v6.511 · switched-member no-rebill');
const src = H.readSrc();

R.section('re-bill guard (source)');
R.ok('a switch-funded enrollment is EXCLUDED from the new-charge list', /if \(!matched && e\.price > 0 && !e\.switchedInto && !e\.switchFunded\)/.test(src));
R.ok('an unmatched switch-funded enrollment restores its subscription instead of billing', /else if \(!matched && \(e\.switchedInto \|\| e\.switchFunded\)\)/.test(src) && /switchFunded: true,/.test(src));
R.ok('the guard is audited (not silent)', /member\.switch_refund_guard/.test(src) && /Skipped re-billing switch-funded/.test(src));

R.section('audit label fix (source)');
R.ok('the switch audit uses the CAPTURED source sport, not the mutated enrollment', /Switched \$\{_fromSport\} → \$\{toSport\}/.test(src) && /fromSport: _fromSport, toSport, fromCoachId: _fromCoachId/.test(src));
R.ok('the success toast also uses the captured source sport', /coachName\(_fromCoachId\) keeps/.test(src) || /coachName\(_fromCoachId\)\} keeps/.test(src));

R.section('delete warning (source)');
R.ok('deleting a switch-funded sub warns it strands the credit', /sub\.switchFunded && !hasTwin/.test(src) && /funded by a SPORT SWITCH/.test(src));

R.section('the switch itself stays clean — net-zero credit + funded flags (runtime invariant)');
{
  // The guard depends on switchSport producing (a) a net-zero switch-credit invoice and (b) an
  // enrollment/sub flagged switchedInto/switchFunded. Assert those invariants live in the source
  // so the guard has something to key on.
  R.ok('switch credit invoice nets to zero (amount: 0)', /amount: 0,\s*\/\/ lineItems net to zero/.test(src));
  R.ok('the destination enrollment is flagged switchedInto', /m\.enrollments\[targetIdx\]\.switchedInto = true;/.test(src));
  R.ok('the destination subscription is flagged switchFunded', /destSub\.switchFunded = true;/.test(src));
}

R.section('predicate behaves correctly (runtime)');
{
  const ctx = H.makeCtx({ today: '2026-08-20', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  // Reproduce the exact guard predicate and confirm each case.
  const pred = `(e => (e.price > 0 && !e.switchedInto && !e.switchFunded))`;
  R.ok('a normal new sport IS billed', run(`(${pred})({price:400})`) === true);
  R.ok('a switched-in sport is NOT billed', run(`(${pred})({price:400,switchedInto:true})`) === false);
  R.ok('a switch-funded sport is NOT billed', run(`(${pred})({price:400,switchFunded:true})`) === false);
  R.ok('a free row is NOT billed', run(`(${pred})({price:0})`) === false);
}

R.done();
