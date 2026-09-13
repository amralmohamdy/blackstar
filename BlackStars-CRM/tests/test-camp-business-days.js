// v6.357 — Summer Camp rules (owner-confirmed):
//   (1) Camp expiry counts BUSINESS days (Sun–Thu; closed Fri/Sat). "1 month" = 22 working days,
//       so a member starting Sun 14-Jun expires Mon 13-Jul.
//   (2) On renewal, NO unattended days carry forward — camp always starts fresh.
// Uses the REAL functions from app.js.
const vm = require('vm'), fs = require('fs'), path = require('path');
const _APPDIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(_APPDIR, 'app.js'), 'utf8');
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, parseInt, parseFloat, isNaN, isFinite, RegExp };
ctx.window = ctx; ctx.globalThis = ctx; ctx.TODAY = '2026-07-15';
ctx.document = { getElementById: () => null }; ctx.localStorage = { getItem: () => null, setItem() {} }; ctx.addEventListener = () => {};
vm.createContext(ctx); try { vm.runInContext(appSrc, ctx); } catch (e) {}

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
const C = ctx;

console.log('(1) BUSINESS-DAY EXPIRY (start Sun 14-Jun-2026):');
ok('THE example: 1 month (22 biz days) → Mon 13-Jul', C.campEndDate('2026-06-14', 30) === '2026-07-13', C.campEndDate('2026-06-14', 30));
ok('1 day → same day (14-Jun)', C.campEndDate('2026-06-14', 1) === '2026-06-14', C.campEndDate('2026-06-14', 1));
ok('1 week (5 biz) → Thu 18-Jun', C.campEndDate('2026-06-14', 7) === '2026-06-18', C.campEndDate('2026-06-14', 7));
ok('2 weeks (10 biz) → Thu 25-Jun', C.campEndDate('2026-06-14', 14) === '2026-06-25', C.campEndDate('2026-06-14', 14));
ok('3 weeks (15 biz) → Thu 2-Jul', C.campEndDate('2026-06-14', 21) === '2026-07-02', C.campEndDate('2026-06-14', 21));
ok('6 weeks (30 biz) → Thu 23-Jul', C.campEndDate('2026-06-14', 42) === '2026-07-23', C.campEndDate('2026-06-14', 42));
ok('2 months (44 biz) → Wed 12-Aug', C.campEndDate('2026-06-14', 60) === '2026-08-12', C.campEndDate('2026-06-14', 60));
// the expiry never lands on a Fri/Sat (camp is closed then)
const allEnds = [7, 14, 21, 30, 42, 60].map(d => C.campEndDate('2026-06-14', d));
ok('no expiry falls on a Friday/Saturday', allEnds.every(e => { const wd = new Date(e + 'T00:00:00').getDay(); return wd !== 5 && wd !== 6; }), allEnds);

console.log('\n  through subscriptionValidEnd + deriveMemberDates:');
ok('subscriptionValidEnd(1 month camp, no stored end) → business-day 13-Jul', C.subscriptionValidEnd({ activity: 'Summer Camp', durationLabel: '1 month', start: '2026-06-14' }) === '2026-07-13', C.subscriptionValidEnd({ activity: 'Summer Camp', durationLabel: '1 month', start: '2026-06-14' }));
ok('stored end still wins (never overrides an admin-set end)', C.subscriptionValidEnd({ activity: 'Summer Camp', durationLabel: '1 month', start: '2026-06-14', end: '2026-07-20' }) === '2026-07-20');
const dm = C.deriveMemberDates([{ sport: 'Summer Camp', start: '2026-06-14', validity: 30 }]);
ok('deriveMemberDates: member camp expiry = business-day 13-Jul', dm.expiryDate === '2026-07-13', dm);
const dmMix = C.deriveMemberDates([{ sport: 'Summer Camp', start: '2026-06-14', validity: 30 }, { sport: 'Karate', start: '2026-06-14', validity: 30 }]);
ok('non-camp sibling still calendar (+30 → 14-Jul), so member expiry = later of the two = 14-Jul', dmMix.expiryDate === '2026-07-14', dmMix);

console.log('\n(2) RENEWAL — no carry-forward for camp:');
const campMember = { subscriptions: [{ activity: 'Summer Camp', totalClasses: 22, attendedClasses: 8, end: '2026-06-01', status: 'expired' }], dailyAttendance: {} };
ok('camp member with 14 unattended classes → carry 0', C.carryForwardCredit(campMember, 'Summer Camp') === 0, C.carryForwardCredit(campMember, 'Summer Camp'));
const campFull = { subscriptions: [{ activity: 'Summer Camp', totalClasses: 22, attendedClasses: 22, end: '2026-06-01', status: 'expired' }], dailyAttendance: {} };
ok('camp member who attended all → still 0 (no change)', C.carryForwardCredit(campFull, 'Summer Camp') === 0);
// other sports are UNCHANGED — they still carry up to 2
const boxMember = { subscriptions: [{ activity: 'Boxing', totalClasses: 8, attendedClasses: 6, end: '2026-06-01', status: 'expired' }], dailyAttendance: {} };
ok('Boxing (non-camp) still carries 2 unused (rule unchanged)', C.carryForwardCredit(boxMember, 'Boxing') === 2, C.carryForwardCredit(boxMember, 'Boxing'));

console.log('\nCAMP BUSINESS DAYS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
