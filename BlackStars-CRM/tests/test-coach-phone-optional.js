// v6.353 — a coach/staff member with NO mobile could not be created: the phone field was
// validated as if it were required, so "no phone" blocked the save entirely. Only a phone that
// was actually TYPED and is too short should be rejected; an empty one is fine.
// (Recreated — the original test file was lost when Windows cleaned %TEMP% mid-session.)
const fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// the coach form's save handler, isolated
const start = pagesSrc.indexOf('window.editCoach = function');
const seg = pagesSrc.slice(start, start + 9000);

console.log('the coach form treats the mobile as optional:');
{
  ok('the field is labelled optional', /phoneInputHtml\('c-phone', c\.phone, \{ label: 'Mobile \(optional\)'/.test(seg));
  ok('a new coach starts with an empty phone', /phone: '', qid: '', birthdate: '', email: ''/.test(seg));
  ok('only the NAME is required', /if \(!name\) \{ toast\('Name required'/.test(seg));
  ok('there is no "phone required" rejection', !/phone.*required/i.test(seg.replace(/\/\/[^\n]*/g, '')));
  ok('the intent is documented (empty phone must not block)', /an empty\s*\n?\s*\/\/ one is fine, so "no phone" no longer blocks creating a coach/.test(seg));
}

console.log('\na TYPED but invalid phone is still rejected:');
{
  // The guard is gated on `phoneInput.digits` — i.e. it only fires when something was actually
  // entered. An unconditional `!phoneInput.valid` here would re-break empty-phone saves.
  ok('an invalid-number check still exists', /toast\(phoneInput\.error \|\| 'Mobile number is invalid', 'error'\)/.test(seg));
  ok('...gated on digits having been entered', /if \(phoneInput\.digits && !phoneInput\.valid\)/.test(seg));
  ok('...so it can never fire on an empty field', !/if \(!phoneInput\.valid\)/.test(seg));
}

console.log('\nthe coach save is cloud-confirmed (not an optimistic toast):');
{
  ok('editCoach goes through withCloudConfirm', /window\.editCoach[\s\S]{0,12000}?withCloudConfirm\(/.test(pagesSrc));
}

console.log('\nCOACH PHONE OPTIONAL:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
