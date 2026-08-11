// v6.487 — reconciling a switch must split the invoice line's CLASS COUNT too, not just the price. The
// earlier reconcile set the source line price to aShare but left it at the original 12 classes, so the
// printed invoice read "Karate 12 classes · 100" instead of "Karate 3 classes · 100" (+ "Kick Boxing 9
// classes · 300"). Fixed in _applySwitchReconcile; plus a heal in _autoReconcileSwitches syncs the line
// class count for switches ALREADY reconciled on the live site. Verified on the real backup:
// Yaman Karate 12cls/400 → 3cls/100, Kick Boxing 9cls/300.
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH · invoice line class count is split too');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('reconcile splits BOTH price and class count');
ok('source line: price = aShare AND classes = attended', /if \(fl\) \{ fl\.price = aShare; fl\.classes = attended; \}/.test(src));
ok('destination line: price = bShare AND classes = remaining', /if \(tl\) \{ tl\.price = bShare; tl\.classes = remaining; \}/.test(src));
ok('line lookup is String-normalized on coachId', /String\(li\.coachId\) === String\(sw\.fromCoachId\)/.test(src));

R.section('already-reconciled switches get a class-count heal on load');
ok('the auto-reconcile scans switched-away subs whose line class count is stale', /if \(!s\.switchedAwayTo\) continue;/.test(src) && /!== \(parseInt\(s\.totalClasses\) \|\| 0\)\) staleClassSubs\.push/.test(src));
ok('it heals the stale line to the subscription class count', /li\.classes = parseInt\(s\.totalClasses\) \|\| 0;/.test(src));
ok('backup-first when there is any work (pending or heal)', /if \(!pending\.length && !staleClassSubs\.length\) return 0;/.test(src));

R.done();
