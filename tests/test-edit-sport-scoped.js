// v6.590 — "Edit sport (price · classes · coach)" (editSubscription) must change ONLY the selected
// period. It edits the chosen sub + its OWN invoice line (by invoiceNumber), but it also synced the
// ENROLLMENT matched by SPORT ONLY — and a member can have several periods of the same sport sharing one
// enrollment, so editing an OLD period rewrote the CURRENT enrollment ("editing one impacts the other").
// Now the enrollment is synced only when the edited sub is the CURRENT period (latest start), matched by
// sport + coach; a historical-period edit leaves the enrollment (and other periods) untouched.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.590 · edit-sport is scoped to the selected period');
const src = H.readSrc();

R.section('source — enrollment sync is scoped to the current period');
R.ok('computes whether THIS sub is the current period (latest start)', /_isCurrentPeriod = !_sameSport\.some\(s => s !== sub && \(s\.start \|\| ''\) > \(sub\.start \|\| ''\)\)/.test(src));
R.ok('only syncs the enrollment for the current period', /if \(_isCurrentPeriod && Array\.isArray\(m\.enrollments\)\)/.test(src));
R.ok('matches the enrollment by sport + coach (not sport-only)', /m\.enrollments\.find\(e => e\.sport === sub\.activity && String\(e\.coachId\) === String\(sub\.coachId\)\)/.test(src));
R.ok('the invoice line it edits is this sub’s own invoice (by invoiceNumber)', /v\.ref === sub\.invoiceNumber/.test(src));
R.ok('the dialog shows which period is being edited', /Editing ONLY this period/.test(src));

R.section('source — it writes only the selected sub, not others');
R.ok('the edited sub is the one found by sid', /const sub = m\.subscriptions\.find\(s => \(s\._sid \|\| s\._rid\) === sid\)/.test(src));
R.ok('there is no loop writing totalClasses across subscriptions in editSubscription',
  !/editSubscription[\s\S]{0,1400}subscriptions\.forEach\([^)]*\.totalClasses =/.test(src));

R.done();
