// v6.483 — SWITCH PROFIT-SPLIT. When a member switches sport mid-package, the profit must SPLIT between
// the two coaches: the OLD coach keeps commission for the classes actually attended, the NEW coach gets
// the transferred share. The old design instead flat-fee "clawed back" the source coach in the switch
// month (a −(price−aShare) line tagged to the old coach), so on an attendance-based membership the coach
// showed a NEGATIVE (−90) for a member they actually taught — because they were never credited the full
// fee to begin with. Fix (commission engine, works for existing switches too — recomputed live):
//   (1) SKIP the negative switch-credit clawback line entirely.
//   (2) A switched-away sub earns ONLY its attended classes — no pending, no end-of-term true-up of the
//       switched-out classes — so it can't be double-paid against the new coach's positive share.
// Verified end-to-end in a browser: Yaman (3/12 Karate attended, switched to Boxing) →
//   Mostafa +100 (attended), NewCoach +300 (transferred), total 400, NO deduction.
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH · profit splits between coaches (no clawback)');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the negative clawback line is skipped, not deducted');
// v6.486: narrowed to switch-credit invoices only (a manual negative deduction still counts).
ok('a negative switch-credit line earns nothing (skipped)', /if \(\(inv\.switchCredit \|\| inv\.activityType === 'switch-credit'\) && fee < 0\) continue;/.test(src));
ok('the reason is documented (attendance-based, never credited the full fee)', /SWITCH PROFIT-SPLIT[\s\S]{0,400}?clawback/.test(src));

R.section('a switched-away sub is capped to its attended classes');
// v6.484: switchedAway also fires for an OLD-WAY switch recorded only in m.sportSwitches.
ok('a switchedAway flag is derived from the sub (+ old-way switches)', /const switchedAway = !!\(sub && sub\.switchedAwayTo\) \|\| \(!!sub && !!mem && _memberSwitchedAwayFrom\(mem, sub\.activity, sub\.coachId\)\);/.test(src));
ok('settlement true-up excludes a switched-away sub', /ended && remaining > 0 && attended > 0 && !settledMonth && !switchedAway\)/.test(src));
ok('settlement pending excludes a switched-away sub', /!ended && remaining > 0 && !settledMonth && !switchedAway\) \{  \/\/ still active/.test(src));
ok('monthly true-up excludes a switched-away sub', /endMonth === monthKey && ended && remaining > 0 && attendedAll > 0 && !settledMonth && !switchedAway\)/.test(src));
ok('monthly pending excludes a switched-away sub', /if \(!ended && remaining > 0 && !settledMonth && !switchedAway\) \{\s*\n\s*pendingBase \+= perClass \* remaining;/.test(src));

R.section('the POSITIVE (destination) switch line is untouched — the new coach still earns it');
ok('the skip is guarded by fee < 0 (positive switch lines are NOT skipped)', /\(inv\.switchCredit \|\| inv\.activityType === 'switch-credit'\) && fee < 0\) continue;/.test(src));
ok('the switch-credit still routes through the flat-fee payment path for the positive line', /if \(isSwitch \|\| totalClasses <= 0\)/.test(src));

R.done();
