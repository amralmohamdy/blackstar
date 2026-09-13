// v6.358 — the Expiring Soon screen gets a new "Expiring in ≤ 7 days" option. It must select
// ONLY active memberships whose expiry is 0–7 days out (today included, day 7 included, day 8 and
// already-expired excluded), spanning both the "soon" (≤ threshold) and "upcoming" buckets.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

// lift the REAL daysUntil (+ its addDays dep) from app.js
const ctx = { console: { log() {} }, Math, Date, String, Number, parseInt };
ctx.TODAY = '2026-07-15';
vm.createContext(ctx);
vm.runInContext(appSrc.match(/^function addDays\([\s\S]*?^\}/m)[0], ctx);
vm.runInContext(appSrc.match(/^function daysUntil\([\s\S]*?^\}/m)[0], ctx);
const daysUntil = ctx.daysUntil, addDays = ctx.addDays;

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// the EXACT screen bucketing (threshold default 3) + the d7 predicate from matchFilter
const threshold = 3;
function classify(expiryDate) {
  const d = daysUntil(expiryDate);
  if (d == null) return { bucket: null, d };
  if (d < 0) return { bucket: 'expired', d };
  if (d <= threshold) return { bucket: 'soon', d };
  if (d <= 30) return { bucket: 'upcoming', d };
  return { bucket: 'beyond', d };
}
const inD7 = (expiryDate) => { const d = daysUntil(expiryDate); return d >= 0 && d <= 7; };

// daysUntil() uses the REAL system clock, so anchor all offsets to the real "today" (not a hardcoded
// string, which would drift with the wall clock and mis-bucket the 0/±1 boundary cases).
const REF = new Date().toISOString().slice(0, 10);
// members at known offsets from TODAY (REF = real today)
const cases = [
  { name: 'today (0)',      exp: REF, wantD7: true,  wantBucket: 'soon' },
  { name: '+3 (soon edge)', exp: addDays(REF, 3), wantD7: true,  wantBucket: 'soon' },
  { name: '+4 (upcoming)',  exp: addDays(REF, 4), wantD7: true,  wantBucket: 'upcoming' },
  { name: '+7 (edge in)',   exp: addDays(REF, 7), wantD7: true,  wantBucket: 'upcoming' },
  { name: '+8 (edge out)',  exp: addDays(REF, 8), wantD7: false, wantBucket: 'upcoming' },
  { name: '+30',            exp: addDays(REF, 30), wantD7: false, wantBucket: 'upcoming' },
  { name: '-1 (expired)',   exp: addDays(REF, -1), wantD7: false, wantBucket: 'expired' },
];
console.log('d7 selection (TODAY = ' + REF + ', soon threshold = 3):');
for (const c of cases) {
  ok(`${c.name} → d7 ${c.wantD7 ? 'IN' : 'out'}`, inD7(c.exp) === c.wantD7, { d: daysUntil(c.exp), inD7: inD7(c.exp) });
}
ok('d7 spans BOTH soon(+3) and upcoming(+4..+7)', inD7(cases[1].exp) && inD7(cases[2].exp) && inD7(cases[3].exp) && classify(cases[1].exp).bucket === 'soon' && classify(cases[3].exp).bucket === 'upcoming');
ok('d7 count over the set = 4 (0, +3, +4, +7)', cases.filter(c => inD7(c.exp)).length === 4, cases.filter(c => inD7(c.exp)).map(c => c.name));

// source wiring assertions on the REAL screen
console.log('\nsource wiring:');
ok('dropdown has the ≤ 7 days option', /<option value="d7">[^<]*Expiring in ≤ 7 days<\/option>/.test(pagesSrc));
ok('matchFilter guards the d7 bucket to 0–7 days', /filter\.bucket === 'd7' && !\(days >= 0 && days <= 7\)/.test(pagesSrc));
// v6.371: the combined d7 list now also includes the new `week` bucket ([...soon, ...week, ...upcoming])
ok('section renders a combined soon+week+upcoming list for d7', /filter\.bucket === 'd7'\)[\s\S]{0,220}\[\.\.\.expiringSoon, \.\.\.week, \.\.\.upcoming\]\.filter\(matchFilter\)/.test(pagesSrc));
ok('select-all covers the whole combined d7 list', /filter\.bucket === 'd7' \? \[\.\.\.expiringSoon, \.\.\.week, \.\.\.upcoming\]\.filter\(matchFilter\)/.test(pagesSrc));

console.log('\nEXPIRING d7:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
