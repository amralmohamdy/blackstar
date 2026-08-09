// v6.477 — "🔄 Rebuild from profile": the member's ENROLLMENTS are the source of truth. When a
// switch or edit leaves the SUBSCRIPTIONS (which drive salary) and INVOICE LINES out of step with
// the enrollments, "Generate latest invoice" (reads enrollments) and the salary report (reads subs)
// disagree. This admin tool re-syncs each enrolled sport's subscription + invoice line to its
// enrollment (classes/price/coach), completes subs for dropped sports, and optionally removes their
// invoice lines. Preview-first, backup-first, audited; paid amounts untouched. Verified end-to-end
// in a browser (Alreem: invoice 1000→920, sub Swimming 1×50→10×420, Taekwondo 19×850→12×500).
const H = require('./qc-harness.js');
const R = H.reporter('MEMBER · rebuild from profile');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the tool + its button');
ok('rebuildMemberFromProfile is defined, admin-only', /window\.rebuildMemberFromProfile = function \(memberId\)/.test(src) && /rebuildMemberFromProfile = function[\s\S]{0,120}currentRole\(\) !== 'admin'/.test(src));
ok('the member card shows a "Rebuild from profile" button (admin)', /onclick="rebuildMemberFromProfile\(\$\{m\.id\}\)"/.test(src));

R.section('it treats the ENROLLMENTS as the source of truth');
ok('it iterates the enrollments (the profile)', /const enrollments = \(m\.enrollments \|\| \[\]\)\.filter\(e => e\.sport\)/.test(src));
ok('it syncs the INVOICE LINE to the enrollment (price/classes/coach)', /li\.price = ePrice; li\.classes = eCls; li\.coachId = eCoach; li\.coach = eCoach != null \? coachName\(eCoach\)/.test(src));
ok('it syncs the SUBSCRIPTION to the enrollment (totalClasses/paid/coach)', /sub\.totalClasses = eCls; sub\.amountPaid = ePrice; sub\.coachId = eCoach; sub\.coach = eCoach != null/.test(src));
ok('it only changes a record that actually differs', /!== ePrice \|\| \(parseInt\(li\.classes\) \|\| 0\) !== eCls \|\| String\(li\.coachId\) !== String\(eCoach\)/.test(src));

R.section('dropped sports + safety');
ok('an active sub for a sport NOT in the profile is completed', /if \(!s\.activity \|\| enrolledSports\.has\(s\.activity\)\) continue;/.test(src) && /applies\.push\(\(\) => \{ s\.status = 'completed'; \}\)/.test(src));
ok('invoice lines for dropped sports are opt-in removable', /class="rbp-orphan" data-i/.test(src) && /rbp-orphan:checked/.test(src));
ok('the invoice total is recomputed from the remaining lines', /iv\.amount = iv\.lineItems\.reduce\(\(s, x\) => s \+ \(Number\(x\.price\) \|\| 0\), 0\)/.test(src));
ok('paid amounts are NOT touched (overpayment surfaces instead)', !/iv\.amountPaid *=/.test(src.slice(src.indexOf('rebuildMemberFromProfile'), src.indexOf('window.editMemberPricing'))));
ok('backup first + audit + cloud-confirm', /downloadBackup\(\);[\s\S]{0,200}applies\.forEach/.test(src) && /audit\('member\.rebuildFromProfile'/.test(src) && /confirmSaved\(/.test(src));

R.done();
