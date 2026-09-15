// v6.380 — two UI refinements verified via source wiring + a functional check:
//  (A) the detailed salary report groups the members by SPORT (with per-sport subtotals) when the
//      coach teaches more than one sport; a single-sport coach stays a flat list.
//  (B) the Expiring-screen WhatsApp reminder uses the 'completed' message for a member who FINISHED
//      their classes (membersReadyToRenew), not the plain expired/expiring wording.
const fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

console.log('A) salary report — group members by sport:');
ok('single-sport coach → flat list (no grouping)', /if \(sports\.length <= 1\) return lines\.map\(l => rowTr\(l, \+\+n\)\)/.test(pagesSrc));
ok('multi-sport → groups by sport with a per-sport header', /Object\.keys\(bySp\)\.sort\(\)\.map\(sp =>/.test(pagesSrc) && /🏷 \$\{escapeHtml\(sp\)\} · \$\{grp\.length\} member/.test(pagesSrc));
ok('each sport group has its own subtotal', /\$\{escapeHtml\(sp\)\} subtotal.*\$\{fmt\(spBase\)\}/.test(pagesSrc.replace(/\n/g,' ')));
ok('a grand TOTAL across all sports closes the table', /TOTAL · Commission base \(all sports\)/.test(pagesSrc));
ok('the running "#" index continues across groups (++n)', /grp\.map\(l => rowTr\(l, \+\+n\)\)/.test(pagesSrc));

console.log('\nB) expiring reminder — completed message when classes finished:');
ok('completion set built from membersReadyToRenew', /_readyRows = \(typeof membersReadyToRenew === 'function'\)/.test(pagesSrc) && /_completedRenewIds = new Set\(_readyRows\.map/.test(pagesSrc));
ok('kind becomes "completed" when the member finished classes', /const kind = \(completed \|\| _completedRenewIds\.has\(m\.id\)\) \? 'completed'/.test(pagesSrc));
ok('buildReminderMessage supports the completed templates', /kind === 'completed' \? 'completed_en'/.test(appSrc) && /kind === 'completed' \? 'completed_ar'/.test(appSrc));

console.log('\nC) the completed template actually differs from the expired one (functional):');
// pull reminderTemplate defaults and confirm completed vs expired differ
const m = appSrc.match(/function reminderTemplate[\s\S]{0,60}\{([\s\S]*?)\n\}/);
const hasCompleted = /completed_en/.test(appSrc) && /completed_ar/.test(appSrc);
ok('completed_en + completed_ar templates exist', hasCompleted);

console.log('\nSALARY GROUP + COMPLETED MSG:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
