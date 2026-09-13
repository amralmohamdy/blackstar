// v6.369 — DOUBLE-PAY GUARD. A duplicate INVOICE yields two identical commission lines, so the
// coach is paid twice for the same membership (the owner's real case: Fares Hamdan · Karate ×2 in
// Mostafa's June report). duplicateCommissionLines() must flag it — and must NOT flag the
// legitimate look-alikes in that same report (Meshlesh: Swimming + Karate at the same price; two
// different siblings at the same price). It never changes the maths.
const vm = require('vm'), fs = require('fs'), path = require('path');
const _APPDIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(_APPDIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(_APPDIR, 'pages.js'), 'utf8');
const ctx = { console: { log() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, parseInt, parseFloat, isNaN, isFinite, RegExp };
ctx.window = ctx; ctx.globalThis = ctx; ctx.TODAY = '2026-07-17';
ctx.document = { getElementById: () => null }; ctx.localStorage = { getItem: () => null, setItem() {} }; ctx.addEventListener = () => {};
vm.createContext(ctx); try { vm.runInContext(appSrc, ctx); } catch (e) {}

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
const dup = ctx.duplicateCommissionLines;
ok('duplicateCommissionLines is exported', typeof dup === 'function');

// Mostafa's June report, exactly as the owner screenshotted it
const L = (memberName, sport, start, end, amountBase, attended, total) =>
  ({ memberName, sport, kind: 'attended', start, end, amountBase, attended, total, classes: attended });
const lines = [
  L('Meshlesh Mohammed M A Alkhayarin', 'Swimming', '2026-06-15', '2026-07-15', 150, 3, 8),
  L('Meshlesh Mohammed M A Alkhayarin', 'Karate',   '2026-06-15', '2026-07-15', 150, 3, 8),   // different SPORT → legit
  L('Abdulrahman Saaod A F Al-Azba',    'Karate',   '2026-06-24', '2026-07-24', 92, 2, 12),
  L('Taim Saod A F Al-Azba',            'Karate',   '2026-06-24', '2026-07-24', 92, 2, 12),   // different SIBLING → legit
  L('Fares Hamdan',                     'Karate',   '2026-06-28', '2026-07-28', 71, 2, 12),
  L('Fares Hamdan',                     'Karate',   '2026-06-28', '2026-07-28', 71, 2, 12),   // TRUE DUPLICATE
];
const d = dup(lines);
console.log('  flagged:', JSON.stringify(d.map(x => ({ m: x.line.memberName, sport: x.line.sport, count: x.count, extra: x.extra }))));
ok('exactly ONE duplicate group flagged', d.length === 1, d.length);
ok('...it is Fares Hamdan · Karate ×2', d[0] && d[0].line.memberName === 'Fares Hamdan' && d[0].line.sport === 'Karate' && d[0].count === 2, d[0] && d[0].line);
ok('...over-counted base = 71 (the extra copy)', d[0] && Math.abs(d[0].extra - 71) < 0.01, d[0] && d[0].extra);
ok('Meshlesh (Swimming + Karate, same price) NOT flagged', !d.some(x => /Meshlesh/.test(x.line.memberName)));
ok('the two Al-Azba siblings NOT flagged', !d.some(x => /Al-Azba/.test(x.line.memberName)));

// a genuine second purchase of the same sport on a DIFFERENT date must not be flagged
ok('same sport, different period → NOT a duplicate', dup([
  L('Sara', 'Karate', '2026-05-01', '2026-05-31', 400, 4, 8),
  L('Sara', 'Karate', '2026-06-01', '2026-06-30', 400, 4, 8),
]).length === 0);
// same sport, same period, DIFFERENT amount → not the duplicate signature
ok('same period, different amount → NOT a duplicate', dup([
  L('Sara', 'Karate', '2026-06-01', '2026-06-30', 400, 4, 8),
  L('Sara', 'Karate', '2026-06-01', '2026-06-30', 250, 4, 8),
]).length === 0);
ok('a triple counts ×3 with 2 extra copies', (() => { const r = dup([lines[4], lines[4], lines[4]]); return r.length === 1 && r[0].count === 3 && Math.abs(r[0].extra - 142) < 0.01; })());
ok('empty / no lines → no crash', dup([]).length === 0 && dup(null).length === 0);

console.log('\n source wiring (v6.372 — duplicates are now auto-EXCLUDED from pay, not just warned):');
ok('Salaries row shows a "DUP EXCLUDED" badge', /✓ \$\{_dups\.length\} DUP EXCLUDED/.test(pagesSrc));
ok('Salaries row states the coach was NOT overpaid', /coach NOT overpaid/.test(pagesSrc));
ok('payslip report shows the amber "auto-excluded / already correct" banner', /auto-excluded — this subtotal is already correct/.test(pagesSrc) && /\$\{dupBanner\}/.test(pagesSrc));
ok('the report reads the source-corrected lines (excludedDuplicateLines, not re-detect)', /excludedDuplicateLines\(pay\.attendanceLines\.lines\)/.test(pagesSrc));

console.log('\nCOMMISSION DUPLICATE GUARD:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
