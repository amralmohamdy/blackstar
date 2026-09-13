// v6.485 — AUTO-RECONCILE sport switches on load, so the split + the corrected member card are fully
// automatic with NO manual "Switch reconciliation" screen. A switch leaves the OLD sport active and the
// payment un-split (source coach over-credited, dest double-billed by the switch-credit line, card
// wrong). _applySwitchReconcile fixes the DATA (complete source at attended, resize dest, split the
// invoice, void the switch-credit). Verified on the REAL 08-11 backup: Hoor Swimming→completed 37.5/1cls
// + Gymnastic active 262.5/7cls; Jennifer 300→37.5 (double-bill removed); Leina 38 for the attended
// class. Runs admin + cloud only, backup-first, idempotent — mirrors the v6.297 duplicate-sub auto-heal.
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH · auto-reconcile on load (no manual screen)');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('an auto-reconcile wrapper applies every pending switch');
ok('window._autoReconcileSwitches exists', /window\._autoReconcileSwitches = function \(\) \{/.test(src));
ok('it reads the unreconciled switches', /const pending = _switchedUnreconciled\(\);/.test(src));
ok('it backs up first', /if \(typeof window\.downloadBackup === 'function'\) window\.downloadBackup\(\);/.test(src));
ok('it applies the proven per-member reconcile', /n \+= \(window\._applySwitchReconcile\(id\) \|\| 0\)/.test(src));

R.section('init runs it on load — admin + cloud, guarded like the dedup auto-heal');
ok('init calls _autoReconcileSwitches', /const fixed = window\._autoReconcileSwitches\(\);/.test(src));
ok('gated to admin + cloud', /window\.Storage\.isCloud\(\) && typeof currentRole === 'function' && currentRole\(\) === 'admin' && typeof window\._autoReconcileSwitches/.test(src));
ok('it save-confirms + toasts when it fixed any', /Auto-split \$\{fixed\} switched membership/.test(src));

R.section('the underlying reconcile still produces the split (unchanged)');
ok('source sub completed at attended, price = aShare', /fromSub\.totalClasses = attended; fromSub\.status = 'completed';/.test(src) && /fromSub\.amountPaid = aShare;/.test(src));
ok('the redundant switch-credit invoice is voided', /if \(swInv\) \{ swInv\.deleted = true;/.test(src));

R.done();
