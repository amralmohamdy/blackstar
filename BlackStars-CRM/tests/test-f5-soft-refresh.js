// v6.465 — F5 / Ctrl+R now REFRESH THE DATA IN PLACE (pull from cloud + re-render, keeping the
// signed-in session) instead of a full browser reload that could bounce the admin to the login
// screen. Ctrl+Shift+R (hard reload) is deliberately left alone so a new app version can still be
// picked up, and on the login screen the keys behave normally. This locks the guard's wiring +
// the exact key predicate (verified functionally in the browser: F5/Ctrl+R prevented+refresh,
// Ctrl+Shift+R passes through).
const fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } };

console.log('source wiring:');
ok('a soft-reload key guard exists', /_isSoftReloadKey/.test(src));
ok('it matches plain F5', /e\.key === 'F5' && !e\.ctrlKey && !e\.metaKey && !e\.altKey && !e\.shiftKey/.test(src));
ok('it matches Ctrl/Cmd+R without shift', /\(e\.key === 'r' \|\| e\.key === 'R'\) && \(e\.ctrlKey \|\| e\.metaKey\) && !e\.shiftKey && !e\.altKey/.test(src));
ok('it does NOT intercept the login screen', /onLoginScreen[\s\S]{0,120}login-btn/.test(src) && /!onLoginScreen && cloudUp/.test(src));
ok('it prevents the browser reload and pulls from cloud', /e\.preventDefault\(\);[\s\S]{0,400}window\.refreshFromCloud\(/.test(src));
ok('it flushes any pending write before pulling', /flushPending\(\)[\s\S]{0,120}refreshFromCloud/.test(src));
ok('Ctrl+Shift+R is left alone (hard reload for new versions)', /Ctrl\+Shift\+R \(hard reload\) is/.test(src));

// ── The exact predicate the app ships, exercised against representative key events. ──
console.log('\npredicate behaviour:');
const pred = (e) => ((e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) ||
                     ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey));
ok('F5 → soft refresh', pred({ key: 'F5' }) === true);
ok('Ctrl+R → soft refresh', pred({ key: 'r', ctrlKey: true }) === true);
ok('Cmd+R → soft refresh', pred({ key: 'r', metaKey: true }) === true);
ok('Ctrl+Shift+R → NOT intercepted (hard reload)', !pred({ key: 'r', ctrlKey: true, shiftKey: true }));
ok('plain "r" typing → NOT intercepted', !pred({ key: 'r' }));
ok('Ctrl+F5 → NOT intercepted (browser hard reload)', !pred({ key: 'F5', ctrlKey: true }));

console.log('\nF5 SOFT REFRESH:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
