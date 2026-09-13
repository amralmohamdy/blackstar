// v6.371 — the New Expense form's "or external / ad-hoc coach name" input must ALWAYS be editable.
// It used to be disabled whenever a registered coach was selected, but only TYPING in it cleared
// the dropdown — a deadlock (Summer Camp selected → field locked → can't type → can't unlock).
// Now: never disabled; picking a coach clears the ad-hoc text, typing an ad-hoc name clears the coach.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

// lift the two real handlers + a tiny DOM
const grab = n => pagesSrc.match(new RegExp('window\\.' + n + ' = function\\(\\) \\{[\\s\\S]*?\\n\\};'))[0];
const els = {
  'f-coach': { value: '19', tagName: 'SELECT' },                 // "Summer Camp" selected
  'f-coach-name': { value: '', disabled: false, tagName: 'INPUT' },
};
const ctx = { console: { log() {} }, document: { getElementById: (id) => els[id] || null } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(grab('_expCoachChanged') + '\n' + grab('_expCoachNameInput'), ctx);

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// 1) the FIELD MARKUP no longer hard-disables when a coach id is present
ok('the input is not conditionally disabled anymore', !/id="f-coach-name"[^>]*\$\{cur\.coachId \? 'disabled'/.test(pagesSrc));
ok('the input has no static disabled attribute either', !/id="f-coach-name"[^>]*\sdisabled/.test(pagesSrc));

// 2) with a coach selected, running the changed-handler leaves the ad-hoc field ENABLED (was the deadlock)
els['f-coach'].value = '19'; els['f-coach-name'] = { value: 'old', disabled: true };
ctx._expCoachChanged();
ok('coach picked → ad-hoc field is ENABLED (not disabled)', els['f-coach-name'].disabled === false, els['f-coach-name'].disabled);
ok('coach picked → ad-hoc text cleared (mutually exclusive)', els['f-coach-name'].value === '');

// 3) the user can now TYPE an external name even though a coach was selected → it clears the dropdown
els['f-coach'].value = '19'; els['f-coach-name'] = { value: 'Coach Aymen', disabled: false };
ctx._expCoachNameInput();
ok('typing an external name → the registered-coach dropdown is cleared', els['f-coach'].value === '', els['f-coach'].value);
ok('...and the typed name is kept', els['f-coach-name'].value === 'Coach Aymen');

// 4) picking a registered coach again clears the external name (the other direction)
els['f-coach'].value = '7'; els['f-coach-name'] = { value: 'Coach Aymen', disabled: false };
ctx._expCoachChanged();
ok('re-picking a coach → external name cleared, field still enabled', els['f-coach-name'].value === '' && els['f-coach-name'].disabled === false);

console.log('\nEXPENSE AD-HOC COACH:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
