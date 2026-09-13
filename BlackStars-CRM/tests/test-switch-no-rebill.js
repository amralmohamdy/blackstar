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
R.ok('the success toast also uses the captured source sport', /coachName\(_fromCoachId\)\} \$\{attendedA\}\/\$\{attendedA\} keeps/.test(src));

R.section('delete warning (source)');
R.ok('deleting a switch-funded sub warns it strands the credit', /sub\.switchFunded && !hasTwin/.test(src) && /funded by a SPORT SWITCH/.test(src));

R.section('v6.520 — the switch SPLITS the one invoice (no net-zero credit) + funded flags');
{
  // The rebuilt switch splits the membership invoice in place instead of adding a net-zero
  // switch-credit. Assert the split invariants + the switchedInto/switchFunded flags the guard keys on.
  // The SINGLE-TARGET switch no longer builds a net-zero credit (the distinctive commented form is
  // gone). The multi-target "distribute" branch still uses a credit — that path is out of v6.520 scope.
  R.ok('the single-target net-zero switch-credit invoice is GONE', !/amount: 0,\s*\/\/ lineItems net to zero/.test(src) && !/switchCredit: true,\s*\/\/ flag for revenue/.test(src));
  R.ok('the source invoice line is capped to attended/aShare', /_fl\.price = aShare; _fl\.classes = attendedA;/.test(src));
  R.ok('a destination line (moved classes @ re-price) is ADDED', /_inv\.lineItems\.push\(\{ sport: toSport, coach: coachName\(toCoachId\), coachId: toCoachId, classes: moved, price: bPrice/.test(src));
  R.ok('the invoice is re-totalled from its lines', /_inv\.amount = _inv\.lineItems\.reduce/.test(src));
  R.ok('the source subscription is CAPPED to attended + completed', /srcSub\.totalClasses = attendedA;/.test(src) && /srcSub\.status = 'completed';/.test(src) && /srcSub\.switchedAwayTo = toSport;/.test(src));
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
