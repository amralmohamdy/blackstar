// v6.476 — the "Edit pricing & payment" panel can now edit each line's NUMBER OF CLASSES and its
// COACH (not just price + discount). On save the change reflects onto the invoice line, the matching
// subscription, and the enrollment — so the member card, attendance windows and coach commission all
// follow the corrected values. Behaviour verified end-to-end in a browser (classes 10→8, coach
// Leina→Jennifer, price 420→500 flowed to invoice line + amount + sub + enrollment). This locks the
// wiring so the money path can't silently regress.
const H = require('./qc-harness.js');
const R = H.reporter('PRICING · edit classes + coach per line');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the panel renders a Classes input + a Coach picker per line');
ok('a Classes number input per line', /<input class="pri-classes" data-i="\$\{r\.idx\}"/.test(src));
ok('a Coach <select> per line (coachSelectHtml)', /coachSelectHtml = \(r\) =>/.test(src) && /class="pri-coach" data-i="\$\{r\.idx\}"/.test(src));
ok('the coach picker includes the current coach even if inactive', /_coachActive\(c\) \|\| String\(c\.id\) === String\(cur\)/.test(src));
ok('the row derives current classes + coach (line→sub→enrollment)', /const classes = \(li && li\.classes != null\)/.test(src) && /const coachId = \(li && li\.coachId != null\)/.test(src));

R.section('the Save handler captures the new classes + coach');
ok('rowVals reads .pri-classes', /classes: \(clsEl && clsEl\.value !== ''\) \? Math\.max\(0, parseInt\(clsEl\.value, 10\) \|\| 0\) : null/.test(src));
ok('rowVals reads .pri-coach ("" = clear, undefined = unchanged)', /coachId: coEl \? \(coEl\.value === '' \? null : \(parseInt\(coEl\.value, 10\) \|\| coEl\.value\)\) : undefined/.test(src));

R.section('applyPricingSafe writes classes + coach to invoice line + subscription + enrollment');
ok('captures newClasses / newCoachId', /const newClasses = rv\.classes;[\s\S]{0,80}const newCoachId = rv\.coachId;/.test(src));
ok('updates the existing invoice LINE (classes + coach + label)', /li\.classes = newClasses;[\s\S]{0,120}li\.coachId = newCoachId; li\.coach = newCoachId != null \? coachName\(newCoachId\)/.test(src));
ok('updates the SUBSCRIPTION (totalClasses + coach)', /r\.sub\.totalClasses = newClasses;[\s\S]{0,120}r\.sub\.coachId = newCoachId; r\.sub\.coach = newCoachId != null/.test(src));
ok('updates the ENROLLMENT (classes + coach)', /r\.enr\.classes = newClasses;[\s\S]{0,80}r\.enr\.coachId = newCoachId/.test(src));
ok('a NEW invoice line seeds the chosen coach + classes', /lineItems: \[\{ sport: r\.sport, coachId: effCoach,[\s\S]{0,60}classes: effClasses/.test(src));

R.done();
