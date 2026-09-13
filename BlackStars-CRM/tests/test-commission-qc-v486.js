// v6.486 — QC-round fixes on the commission engine (frozen / switched edge cases).
// (1) FROZEN member's finished renewal must not re-pend: the freeze was un-ending a PRIOR period that
//     already ended + trued-up in an earlier month, so it re-appeared as pending (Hessa showed twice —
//     18 Jun→25 Jul trued-up in July, then pending again in August). Verified on the real backup: after
//     the fix Hessa's August pending is ONLY the active period; the finished one is gone.
// (2) skip-negative narrowed to SWITCH-CREDIT invoices only (a manual negative deduction still counts).
// (3) the auto-split DEST share pends while the member is FROZEN (not cashed out mid-freeze).
// (4) the reconcile-detection coachId comparison is String-normalized to match the compute path.
const H = require('./qc-harness.js');
const R = H.reporter('COMMISSION QC v6.486 · frozen renewal + switch edges');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('(1) freeze no longer resurrects a prior ended+trued-up period');
ok('settlement path: ended not suppressed for a prior-month period', /const ended = sub\.end && sub\.end <= uptoDate && !\(frozen && _ymOf\(sub\.end\) >= String\(uptoDate \|\| TODAY\)\.slice\(0, 7\)\);/.test(src));
ok('monthly path: ended not suppressed for a prior-month period', /const ended = sub\.end && sub\.end < TODAY && !\(frozen && _ymOf\(sub\.end\) >= monthKey\);/.test(src));
ok('the old blanket !frozen un-ending is gone', !/const ended = !frozen && sub\.end/.test(src));

R.section('(2) skip-negative applies to switch-credit invoices only');
ok('only a switch-credit negative line is skipped', /if \(\(inv\.switchCredit \|\| inv\.activityType === 'switch-credit'\) && fee < 0\) continue;/.test(src));
ok('the broad "any negative" skip is gone', !/if \(isSwitch && fee < 0\) continue;/.test(src));

R.section('(3) the auto-split dest share defers while frozen');
ok('frozen status is checked for the synthesized dest share', /const _frozenNow = \(typeof \(uptoDate \? isMemberFrozenAt : isMemberFrozenInMonth\)/.test(src));
ok('a frozen dest share PENDS, otherwise it is earned', /if \(_frozenNow\) \{ pendingBase \+= bShare; pendingLines\.push\(_line\); \}\s*\n\s*else \{ base \+= bShare; lines\.push\(_line\); \}/.test(src));

R.section('(4) reconcile detection uses String-normalized coachId');
ok('_switchedUnreconciled matches coachId via String()', /String\(s\.coachId\) === String\(sw\.fromCoachId\)/.test(src));

R.done();
