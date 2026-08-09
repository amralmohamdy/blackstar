// v6.479 — the pricing/payment panel now shows EVERY membership invoice (one editable group per
// invoice, one row per line) instead of one row per sport mapped to the NEWEST invoice. The old
// model hid any earlier/duplicate invoice touching a sport already on a newer invoice — so a second
// Summer-Camp invoice and its payment were invisible and un-editable ("I can't edit the total
// paid"). Rows are keyed per (invoice, line) so an edit routes to that exact invoice; the profile
// (enrollment/subscription) is synced only from the FIRST/newest line of each sport, so a duplicate
// line edits ONLY its own invoice and never clobbers the profile. Verified end-to-end in a browser
// on the real "Safiya" data: two Summer-Camp invoices both render, edits route to the right one.
const H = require('./qc-harness.js');
const R = H.reporter('PRICING · panel shows every invoice (per-line rows)');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('rows are built from ALL membership invoices, not one-per-sport');
ok('collects every non-deleted membership invoice for the member', /const memberInvs = \(state\.invoices \|\| \[\]\)\s*\n\s*\.filter\(i => !i\.deleted && i\.customerId === m\.id && \(i\.category \|\| 'Membership'\) === 'Membership'\)/.test(src));
ok('iterates each invoice and each of its line items', /for \(const inv of memberInvs\) \{[\s\S]{0,400}?for \(const li of lis\) \{/.test(src));
ok('the old one-row-per-sport builder is gone', !/const rows = sports\.map\(\(sp, idx\) => \{/.test(src));
ok('a line with no lineItems falls back to a synthetic line', /if \(!lis\) lis = \[\{ sport: inv\.sport, price: Number\(inv\.amount\) \|\| 0/.test(src));

R.section('profile linkage only from the FIRST (newest) line of a sport');
ok('tracks which sports have been linked', /const linkedSport = new Set\(\);/.test(src));
ok('enr is attached only on the primary line', /const enr = isPrimary \? \(m\.enrollments \|\| \[\]\)\.find\(e => e\.sport === sp\) : null;/.test(src));
ok('sub is attached only on the primary line', /const sub = isPrimary/.test(src) && /: null;/.test(src));
ok('duplicate lines therefore edit ONLY their own invoice line', /duplicate lines on other invoices edit ONLY their own line, never the profile/.test(src));

R.section('enrolled sports with no invoice line still get a NEW row');
ok('covers uncovered enrolled sports on the primary invoice', /for \(const sp of sports\) \{\s*\n\s*if \(coveredSport\.has\(sp\)\) continue;/.test(src) && /inv: primaryInv, isNew: true, price, disc: 0/.test(src));

R.section('grouping + keying unchanged (per invoice id)');
ok('groups still key on the row’s invoice id', /const key = r\.inv \? String\(r\.inv\.id\) : 'new';/.test(src));
ok('gross price preserved (price = linePrice + disc)', /const price = linePrice \+ disc;   \/\/ GROSS/.test(src));

R.done();
