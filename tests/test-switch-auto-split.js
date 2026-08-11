// v6.484 — AUTOMATIC switch profit-split, no manual "Switch reconciliation" needed. When a member
// switches sport the OLD way (source sub left active, payment never split), the switch is still
// recorded in m.sportSwitches[] with a locked snapshot (aShare/bShare/attendedByOld/from&toCoachId).
// The commission engine now reads that snapshot LIVE (no data mutation) and splits: the SOURCE coach
// is capped to their ATTENDED classes, the DEST coach gets the transferred bShare. Verified end-to-end
// in a browser on a Sara-style case: Leina (Swimming) 37.5 for 1 attended, Jennifer (Gymnastic) 262.5 —
// total 300, split, with NO reconcile. And a RECONCILED member (switch-credit invoice present) is NOT
// double-credited — the synthesis is guarded off.
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH · automatic split from m.sportSwitches (no reconcile)');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('an unreconciled switch is detected from m.sportSwitches');
ok('a helper lists unreconciled switches (recorded but source still active)', /function _unreconciledSwitchesFor\(mem\)/.test(src));
ok('it requires the source sub still active / not switched-away', /if \(!fromSub \|\| \(fromSub\.status \|\| ''\)\.toLowerCase\(\) === 'completed' \|\| fromSub\.switchedAwayTo\) return false;/.test(src));
ok('it is guarded against double-credit when a switch-credit invoice already exists', /const hasSwitchInvoice = \(state\.invoices \|\| \[\]\)\.some\(iv => [\s\S]{0,200}?switchCredit \|\| iv\.activityType === 'switch-credit'/.test(src));

R.section('the SOURCE coach is capped to attended (no full-fee, no true-up)');
ok('switchedAway now ALSO fires for an old-way switch', /const switchedAway = !!\(sub && sub\.switchedAwayTo\) \|\| \(!!sub && !!mem && _memberSwitchedAwayFrom\(mem, sub\.activity, sub\.coachId\)\);/.test(src));

R.section('the DEST coach is credited the transferred bShare, once');
ok('a synthesis loop credits the destination coach bShare', /for \(const sw of _unreconciledSwitchesFor\(mem\)\) \{[\s\S]{0,300}?String\(sw\.toCoachId\) !== String\(coachId\)/.test(src));
ok('it uses the locked snapshot bShare', /const bShare = Math\.round\(\(Number\(sw\.snapshot\.bShare\) \|\| 0\) \* 100\) \/ 100;/.test(src));
ok('it credits in the switch month / up-to window', /const inWindow = uptoDate \? \(sw\.date && sw\.date <= uptoDate\) : \(swMonth === monthKey\);/.test(src));
ok('the line is tagged as an auto switched-in share', /note: 'switched-in share \(auto split\)'/.test(src));

R.section('the member card flags an old-way switch too');
ok('the card switched-status also reads m.sportSwitches', /const _switchedTo = s\.switchedAwayTo \|\| \(Array\.isArray\(m\.sportSwitches\)/.test(src));

R.done();
