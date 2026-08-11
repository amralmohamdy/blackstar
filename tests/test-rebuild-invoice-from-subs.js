// v6.488 — REBUILD A MISSING MEMBERSHIP INVOICE from subscriptions. Some members lost their membership
// invoice (deleted in manual edits) → Paid shows only stray products, balance wrong, coaches earn 0.
// The subs still hold the truth (per-sport coach/classes/amountPaid), so this recreates ONE membership
// invoice from them + records it paid. Preview + backup-first + audited; refuses to run if a membership
// invoice already exists (would double-bill). Verified on the real backup: Alreem 20→1040 paid, coaches
// earn again (pending, since she's frozen). Button shown ONLY when paid subs exist but no invoice.
const H = require('./qc-harness.js');
const R = H.reporter('REPAIR · rebuild missing membership invoice from subs');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the repair function');
ok('window._regenInvoiceFromSubs exists', /window\._regenInvoiceFromSubs = function \(memberId\)/.test(src));
ok('lines come from PAID, non-withdrawn subscriptions', /const subs = \(m\.subscriptions \|\| \[\]\)\.filter\(s => s\.activity && \(s\.status \|\| ''\)\.toLowerCase\(\) !== 'withdrawn' && \(Number\(s\.amountPaid\) \|\| 0\) > 0\);/.test(src));
ok('each line carries sport / coach / classes / price from the sub', /const lines = subs\.map\(s => \(\{ sport: s\.activity, coachId: s\.coachId,[\s\S]{0,120}classes: parseInt\(s\.totalClasses\) \|\| 0, price:/.test(src));
ok('it warns when a membership invoice ALREADY exists (double-bill guard)', /ALREADY has a membership invoice — rebuilding would DOUBLE-bill/.test(src));
ok('backup-first before creating', /if \(typeof window\.downloadBackup === 'function'\) window\.downloadBackup\(\);/.test(src));
ok('the new invoice is recorded PAID for the full total', /amountPaid: total,/.test(src) && /payments: \[\{ amount: total,/.test(src));
ok('it is audited', /audit\('invoice\.rebuildFromSubs'/.test(src));

R.section('the member-card button');
ok('shown only when paid subs exist AND no membership invoice', /if \(hasMemInv \|\| !paidSubs\) return \[\];/.test(src));
ok('the button calls the repair', /window\._regenInvoiceFromSubs\(id\)/.test(src));

R.done();
