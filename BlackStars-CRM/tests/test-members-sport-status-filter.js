// v6.489 — Members list: a Sport + Status filter must agree on the SAME sport. Before, the status
// filter matched the member's OVERALL status and the sport filter matched ANY enrolled sport, checked
// independently — so "Active + Summer Camp" matched a member with an ACTIVE Gymnastic + an EXPIRED
// Summer Camp (Muna). Now, when a sport filter is set, status is applied PER-SUBSCRIPTION of the
// selected sport. Verified on the real backup: Muna (Summer Camp expired, Gymnastic active) no longer
// matches "Active + Summer Camp".
const H = require('./qc-harness.js');
const R = H.reporter('MEMBERS · Sport+Status filter agrees on the same sport');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('per-subscription status helper');
ok('_subFilterStatus derives ONE sub\'s status', /function _subFilterStatus\(m, s\)/.test(src));
ok('switched-away sub is not counted Active', /if \(s\.switchedAwayTo\) return 'Switched';/.test(src));
ok('completed uses live attendance >= total', /if \(total > 0 && att >= total\) return 'Completed';/.test(src));
ok('past end date = Expired', /if \(s\.end && s\.end < TODAY\) return 'Expired';/.test(src));

R.section('the members filter combines sport + status per-sport');
ok('overall status only applies when NO sport filter is set', /if \(statusSel\.length && !m\.deleted && !hasSportFilter && !statusSel\.includes\(memberStatus\(m\)\)\) return false;/.test(src));
ok('with a sport filter, status is matched on that sport\'s subscriptions', /if \(!subs\.some\(s => statusSel\.includes\(_subFilterStatus\(m, s\)\)\)\) return false;/.test(src));
ok('sport-only (no status) keeps a sub OR an enrollment for the sport', /if \(!subs\.length && !f\.sports\.some\(sp => enrolled\.has\(sp\)\)\) return false;/.test(src));
ok('the old independent sport check is gone', !/if \(!f\.sports\.some\(sp => sports\.has\(sp\)\)\) return false;/.test(src));

R.done();
