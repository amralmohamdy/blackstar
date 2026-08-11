// v6.482 — the old "Edit pricing & payment" panel is now the PAYMENTS-ONLY "Installments" screen.
// Sports + prices are set in ONE place (the member profile: card → ✎ per sport), so pricing and the
// ledger can never drift. This screen only logs installments (amount · method · date · refund) against
// what the profile already priced. Verified in a browser: no price inputs render, logging a payment
// updates amountPaid + balance but leaves the line price AND the enrollment untouched.
const H = require('./qc-harness.js');
const R = H.reporter('INSTALLMENTS · payments-only screen (prices read-only)');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('the screen is titled + framed as payments-only');
ok('titled 💳 Installments', /title: '💳 ' \+ t\('Installments', 'الأقساط'\)/.test(src));
ok('a note says prices are set in the profile', /This screen LOGS PAYMENTS only\. Prices\/sports are set in the member profile/.test(src));

R.section('sport rows are READ-ONLY (no price/discount/classes/coach inputs)');
ok('no editable price input class is rendered', !/class="pri-price"/.test(src));
ok('no editable discount input class is rendered', !/class="pri-disc"/.test(src));
ok('no editable classes input class is rendered', !/class="pri-classes"/.test(src));
ok('no coach <select> class is rendered', !/class="pri-coach"/.test(src));
ok('the read-only row prints the net + coach for reference', /const net = Math\.max\(0, \(Number\(r\.price\) \|\| 0\) - \(Number\(r\.disc\) \|\| 0\)\);\s*\n\s*const coachNm =/.test(src));

R.section('the live balance uses the STORED price (payments are the only variable)');
ok('net is the stored line sum, not read from inputs', /const net = g\.rows\.reduce\(\(s, r\) => s \+ Math\.max\(0, \(Number\(r\.price\) \|\| 0\) - \(Number\(r\.disc\) \|\| 0\)\), 0\);/.test(src));
ok('recompute listens only to payment inputs now', /querySelectorAll\('\.pri-pay-m, \.pri-exist-amt'\)\.forEach\(inp => inp\.addEventListener\('input', _recomputeGroups\)\)/.test(src));

R.section('the save path writes PAYMENTS ONLY — never prices/enrollment/invoices');
ok('applyPricingSafe takes a paymentsOnly flag', /function applyPricingSafe\(rowVals, groupPays, payDate, payMethod, groupPayMeta, paymentsOnly\)/.test(src));
ok('paymentsOnly skips the entire pricing/line/enrollment loop', /if \(!paymentsOnly\) for \(const rv of rowVals\) \{/.test(src));
ok('the Installments save calls it with paymentsOnly = true', /applyPricingSafe\(rowVals, groupPays, payDate, payMethod, groupPayMeta, true \/\* paymentsOnly \*\/\)/.test(src));
ok('rowVals carry the STORED net (no input reads)', /const rowVals = rows\.map\(r => \(\{ r, price: Number\(r\.price\) \|\| 0, disc: Number\(r\.disc\) \|\| 0, classes: null, coachId: undefined \}\)\)/.test(src));

R.done();
