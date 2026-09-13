// Coverage gap found during the full system regression: two rules that sit squarely in the
// "multi-user access" and "attendance" areas had NO test at all.
//
//   1. COACH TODAY-LOCK — a coach may mark attendance only for the CURRENT day, never a past or
//      future one. Admin and reception are unrestricted. Without this a coach could back-date
//      attendance, which feeds directly into their own commission.
//   2. CONCURRENT ATTENDANCE (v6.320) — member.dailyAttendance is a nested map. When two devices
//      mark different students on the same day, a whole-object write would let the last writer
//      win and silently erase the other's marks. Those records are routed through a transaction
//      that DEEP-MERGES the map against the live cloud value, so no device's keys are lost —
//      and a CLEARED cell must still stay cleared rather than being resurrected by the merge.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

function makeCtx() {
  const c = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp };
  c.window = c; c.globalThis = c;
  c.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  c.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  c.location = { hash: '' }; c.navigator = { userAgent: 'n' }; c.addEventListener = () => {};
  vm.createContext(c); try { vm.runInContext(appSrc, c); } catch (_) {}
  return c;
}

console.log('COACH TODAY-LOCK — a coach cannot back-date their own commission:');
{
  // the shipped rule, lifted from the attendance grid handler
  const gate = (role, markISO, today) => {
    if (role === 'coach' && markISO !== today) return 'blocked';
    return 'allowed';
  };
  const TODAY = '2026-07-22';
  ok('a coach CAN mark today', gate('coach', '2026-07-22', TODAY) === 'allowed');
  ok('a coach CANNOT back-date yesterday', gate('coach', '2026-07-21', TODAY) === 'blocked');
  ok('a coach CANNOT mark a future day', gate('coach', '2026-07-23', TODAY) === 'blocked');
  ok('admin is unrestricted', gate('admin', '2026-07-01', TODAY) === 'allowed');
  ok('reception is unrestricted', gate('receptionist', '2026-07-01', TODAY) === 'allowed');

  // and the rule is genuinely in the shipped source, enforced in the handler (not only the UI)
  ok('the rule exists in the attendance handler',
    /currentRole\(\) === 'coach'\)[\s\S]{0,220}?if \(markISO !== TODAY\)[\s\S]{0,160}?return;/.test(pagesSrc));
  ok('...and explains it is enforced beyond the UI', /Enforced here as well as in the UI/.test(pagesSrc));
  ok('the day is zero-padded so the compare is not string-fragile',
    /String\(day\)\.padStart\(2, '0'\)/.test(pagesSrc));
}

console.log('\nCONCURRENT ATTENDANCE — two devices marking the same day:');
{
  const ctx = makeCtx();
  const merge = (base, local, remote) => vm.runInContext('_mergeRecord', ctx)(base, local, remote, 'members:1:dailyAttendance');

  // Device A marks day 14; device B marks day 16. Neither may lose the other's mark.
  const base   = { '2026-07': { 'Kick Boxing': { '10': 'Y' } } };
  const local  = { '2026-07': { 'Kick Boxing': { '10': 'Y', '14': 'Y' } } };
  const remote = { '2026-07': { 'Kick Boxing': { '10': 'Y', '16': 'Y' } } };
  const out = merge(base, local, remote);
  const cells = out['2026-07']['Kick Boxing'];
  ok('this device keeps its own new mark', cells['14'] === 'Y', cells);
  ok('the other device’s mark is preserved', cells['16'] === 'Y', cells);
  ok('the pre-existing mark survives', cells['10'] === 'Y', cells);
  ok('exactly three marks — nothing invented', Object.keys(cells).length === 3, cells);
}

console.log('\n...and a CLEARED cell must stay cleared (not resurrected):');
{
  const ctx = makeCtx();
  const merge = (base, local, remote) => vm.runInContext('_mergeRecord', ctx)(base, local, remote, 'members:1:dailyAttendance');
  // The mark existed at base; this device CLEARED it; the cloud still holds the old value.
  // Reading the absent key as "the other side added it" is what used to bring the N straight back.
  const base   = { '2026-07': { 'Boxing': { '05': 'Y', '06': 'Y' } } };
  const local  = { '2026-07': { 'Boxing': { '06': 'Y' } } };            // 05 cleared here
  const remote = { '2026-07': { 'Boxing': { '05': 'Y', '06': 'Y' } } };  // cloud unchanged
  const cells = merge(base, local, remote)['2026-07']['Boxing'];
  ok('the cleared mark does NOT come back', cells['05'] === undefined, cells);
  ok('the untouched mark is still there', cells['06'] === 'Y', cells);
}

console.log('\na genuinely NEW day from the other device is accepted:');
{
  const ctx = makeCtx();
  const merge = (base, local, remote) => vm.runInContext('_mergeRecord', ctx)(base, local, remote, 'members:1:dailyAttendance');
  const base   = { '2026-07': { 'Boxing': { '05': 'Y' } } };
  const local  = { '2026-07': { 'Boxing': { '05': 'Y' } } };
  const remote = { '2026-07': { 'Boxing': { '05': 'Y' } }, '2026-08': { 'Boxing': { '02': 'Y' } } };
  const out = merge(base, local, remote);
  ok('a whole new month from another device is kept', out['2026-08'] && out['2026-08']['Boxing']['02'] === 'Y', out);
}

console.log('\nthe write path routes attendance through the merging transaction:');
{
  ok('nested map fields are detected on the delta', /const mapFields = Object\.keys\(delta\)\.filter\(k => k !== 'id' && _isPlainMap\(delta\[k\]\)\)/.test(storeSrc));
  ok('...and routed to a txnset rather than a blind merge-write', /if \(useArr \|\| useMap\) ops\.push\(\{ kind: 'txnset'/.test(storeSrc));
  ok('the transaction deep-merges the map against the LIVE cloud value',
    /for \(const f of \(op\.mapFields \|\| \[\]\)\) merged\[f\] = window\._mergeRecord\(op\.base\[f\], op\.cur\[f\], cloud\[f\]/.test(storeSrc));
  ok('the reason is recorded in the source', /fixes concurrent attendance loss/.test(storeSrc));
  ok('a delete sentinel is supplied so cleared keys are really removed',
    /_delSentinel = _txnFV \? \(\(\) => _txnFV\.delete\(\)\) : null/.test(storeSrc));
}

console.log('\nATTENDANCE INTEGRITY:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
