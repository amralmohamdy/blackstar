// v6.482 — the member profile (card → ✎ per sport, editSubscription) is now the SINGLE place that
// defines a sport's price / classes / COACH. Saving there syncs all three layers together — the
// subscription, the invoice LINE (price + coach → commission + total), and the ENROLLMENT — so
// "Generate latest invoice" (which reads enrollments) always agrees with the invoice and the drift
// that used to need "Rebuild from profile" can't happen. Verified in a browser: editing price 420→500,
// classes 10→12, coach Leina→Karma updated enrollment, subscription, invoice line and inv.amount.
const H = require('./qc-harness.js');
const R = H.reporter('PROFILE ✎ · one edit syncs subscription + invoice + enrollment');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the profile ✎ now has a coach picker');
ok('a coach <select> #es-coach is rendered', /<select id="es-coach"/.test(src));
ok('coach options are built (active + current)', /const coachOpts = `<option value="">.*?`\s*\+ \(state\.coaches \|\| \[\]\)\.filter\(c => _coachActiveES\(c\) \|\| String\(c\.id\) === String\(curCoach\)\)/.test(src));

R.section('saving syncs the SUBSCRIPTION');
ok('reads the new coach id', /const newCoachId = coEl \? \(coEl\.value === '' \? null : \(parseInt\(coEl\.value, 10\) \|\| coEl\.value\)\) : undefined;/.test(src));
ok('sets sub.coachId + sub.coach', /sub\.coachId = newCoachId; sub\.coach = newCoachId != null \? coachName\(newCoachId\) : '';/.test(src));
ok('sets sub.amountPaid to the price', /if \(!isNaN\(price\)\) sub\.amountPaid = price;/.test(src));

R.section('saving syncs the INVOICE LINE (price + coach → commission)');
ok('sets line.price', /if \(line\) \{\s*\n\s*if \(!isNaN\(price\)\) line\.price = price;/.test(src));
ok('sets line.coachId + line.coach', /line\.coachId = newCoachId; line\.coach = newCoachId != null \? coachName\(newCoachId\) : '';/.test(src));
ok('recomputes inv.amount via the summary-guarded total', /inv\.amount = \(typeof invoiceTotal === 'function'\) \? invoiceTotal\(inv\)/.test(src));

R.section('saving syncs the ENROLLMENT (the source Generate reads)');
ok('finds the matching enrollment', /const enr = m\.enrollments\.find\(e => e\.sport === sub\.activity\);/.test(src));
ok('updates enr price / classes / coach', /enr\.classes = cls;\s*\n\s*if \(!isNaN\(price\)\) enr\.price = price;\s*\n\s*if \(newCoachId !== undefined\) enr\.coachId = newCoachId;/.test(src));
ok('creates an enrollment if the sport had none (and is still active)', /else if \(st !== 'completed' && st !== 'expired' && st !== 'withdrawn'\) \{\s*\n\s*m\.enrollments\.push\(\{ sport: sub\.activity/.test(src));

R.done();
