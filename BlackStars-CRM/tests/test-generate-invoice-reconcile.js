// v6.480 — "Generate latest invoice" preview reconciles against reality. The preview summed the
// member's PROFILE (enrollment) prices, but Generate RE-PRINTS an existing membership invoice for
// that month instead of charging the profile sum — so a member whose profile drifted from what was
// actually billed (e.g. Alreem: profile 920, real invoice 1000) saw a scary wrong number and thought
// the generator was broken. It wasn't: it re-prints the real 1000. The preview now shows a banner
// when a membership invoice already exists for the target month ("will RE-PRINT … NOT re-charged"),
// flags when the profile total differs from that invoice, and warns when the profile total disagrees
// with the member's last membership invoice (stale profile before billing a new month). The
// underlying generate/re-print logic is unchanged. Verified in a browser on the real Alreem data.
const H = require('./qc-harness.js');
const R = H.reporter('GENERATE INVOICE · preview reconciles vs the real invoice');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the preview looks up existing / last membership invoices');
ok('collects the member’s non-deleted membership invoices', /const _memInvs = \(state\.invoices \|\| \[\]\)\.filter\(inv => inv\.customerId === m\.id && \(inv\.category \|\| 'Membership'\) === 'Membership' && !inv\.deleted\);/.test(src));
ok('finds an existing invoice for the TARGET month', /const existingThisMonth = _memInvs\.filter\(inv => inv\.month === mth\)/.test(src));
ok('the target month comes from the date field (or earliest start)', /const mth = String\(\(dateInput && dateInput\.value\) \|\| earliestStart\)\.slice\(0, 7\);/.test(src));
ok('totals via invoiceTotal (line-sum, not stale inv.amount)', /const _iTotal = \(inv\) => \(typeof invoiceTotal === 'function'\) \? invoiceTotal\(inv\)/.test(src));

R.section('the banner explains RE-PRINT, not re-charge');
ok('says Generate will RE-PRINT that invoice', /Generate will <b>RE-PRINT that invoice<\/b> — the profile total below is NOT re-charged/.test(src));
ok('flags when the profile total differs from that invoice', /The profile total \(\$\{fmt\(total\)\}\) differs from that invoice/.test(src));
ok('warns when profile total disagrees with the LAST membership invoice', /lastTotal != null && Math\.abs\(lastTotal - total\) > 0\.5/.test(src) && /this member's last membership invoice was/.test(src));
ok('labels the list "Profile (for reference)" when an invoice exists', /existingThisMonth \? 'Profile \(for reference\):' : 'Will invoice:'/.test(src));

R.section('the preview re-runs when the date (month) changes');
ok('a date listener re-runs the preview', /dEl\.addEventListener\('input', \(\) => \{ dEl\.dataset\.touched = '1'; update\(\); \}\)/.test(src));

R.section('the generate/re-print behaviour itself is unchanged');
ok('still re-prints an existing same-month invoice', /already has an invoice for \$\{fmtMonth\(mth\)\}/.test(src) && /printInvoicePDF\(latest\.id\)/.test(src));
ok('new invoice total still = enrollment sum', /const totalAmt = enrollments\.reduce\(\(s, e\) => s \+ \(e\.price \|\| 0\), 0\);/.test(src));

R.done();
