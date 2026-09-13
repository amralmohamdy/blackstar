// v6.478 — DISCOUNT ROUND-TRIP (money corruption fix). QC found the pricing editor showed the Price
// field as the NET (post-discount) amount while both the live recompute and the save derive the net as
// (price − disc). So on every RE-OPEN of a discounted member's invoice the discount was subtracted a
// SECOND time: li.price / inv.amount silently shrank by the discount on each save, and the
// "exceeds balance" guard then blocked collecting the real remaining balance. invoiceTotal (app.js)
// sums li.price and ignores inv.discount, so li.price IS the net owed — the field must therefore show
// the GROSS (net + discount) so (price − disc) round-trips back to the stored net. Same defect + same
// fix in the Summer-Camp editor (curPrice / curDue). Verified end-to-end in a browser.
const H = require('./qc-harness.js');
const R = H.reporter('PRICING · discount round-trip (no double-subtract)');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('pricing editor shows GROSS so price − disc round-trips');
// v6.479: unified per-line gross. disc = apportioned (multi) or inv.discount (single); price = linePrice + disc.
ok('single-sport branch: disc = inv.discount (unified ternary)', /const disc  = multi \? Math\.round\(\(Number\(inv\.discount\) \|\| 0\) \* \(linePrice \/ lineSum\)\) : \(Number\(inv\.discount\) \|\| 0\);/.test(src));
ok('price = net line price + discount (GROSS)', /const price = linePrice \+ disc;   \/\/ GROSS/.test(src));
ok('the OLD net-only read is gone (price = inv.amount with no + disc)', !/price = Number\(inv\.amount\) \|\| 0;\s*\n\s*disc  = Number\(inv\.discount\) \|\| 0;/.test(src));
ok('the OLD multi-sport net-only read is gone', !/price = linePrice;\s*\n\s*disc  = Math\.round/.test(src));

R.section('save + live still derive net = price − disc (unchanged)');
ok('save computes net = price − disc', /const net = Math\.max\(0, price - disc\);/.test(src));
// v6.482: prices are read-only in Installments, so the live recompute takes the STORED net (price − disc).
ok('live recompute uses the stored net (price − disc)', /const net = g\.rows\.reduce\(\(s, r\) => s \+ Math\.max\(0, \(Number\(r\.price\) \|\| 0\) - \(Number\(r\.disc\) \|\| 0\)\), 0\);/.test(src));
// Algebra: with price = amount + disc, net = (amount + disc) − disc = amount = the stored net. Stable.

R.section('camp editor: same gross round-trip');
ok('camp curPrice = amount + discount (gross)', /const curPrice = campInv \? \(\(campInv\.amount \|\| 0\) \+ curDiscount\)/.test(src));
ok('the OLD camp net-only curPrice is gone', !/const curPrice = campInv \? \(campInv\.amount \|\| 0\) : /.test(src));
ok('camp due = price − disc − paid (nets to amount − paid)', /const curDue = Math\.max\(0, curPrice - curDiscount - curPaid\);/.test(src));
ok('camp live due recompute uses p − d − pd', /const due = Math\.max\(0, p - d - pd\);/.test(src));

R.done();
