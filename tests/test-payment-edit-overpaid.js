// v6.478 — Edit-pricing payment panel: (1) editing an EXISTING installment amount now updates the
// Paid + Balance live AND persists on save; (2) the "payment exceeds balance" guard no longer aborts
// the whole Save on an ALREADY-OVERPAID invoice — it read the STORED paid sum, so any invoice where
// paid > price (a common state after a switch/edit) blocked every save, which is exactly why editing
// the paid amount "did nothing". The guard now uses the EDITED amounts and only blocks a NEW
// collection that would overpay. Verified end-to-end in a browser (installment 1000→430 on a 1420-
// paid / 850-price invoice: Paid→850 live, saved payment=430, amountPaid=850, no error).
const H = require('./qc-harness.js');
const R = H.reporter('PAYMENT · edit amount on an overpaid invoice');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('live recompute reads the EDITED amounts');
// v6.482: prices are read-only now, so the recompute listens to the PAYMENT inputs only (still incl. .pri-exist-amt).
ok('the recompute listens to .pri-exist-amt', /querySelectorAll\('\.pri-pay-m, \.pri-exist-amt'\)\.forEach\(inp => inp\.addEventListener\('input', _recomputeGroups\)/.test(src));
ok('and to the remove checkbox', /querySelectorAll\('\.pri-exist-del'\)\.forEach\(cb => cb\.addEventListener\('change', _recomputeGroups\)/.test(src));
ok('paid is computed LIVE from the inputs (not the stored sum)', /_paidLive = \(inv\) =>/.test(src) && /aEl && aEl\.value !== ''\) \? \(parseFloat\(aEl\.value\)/.test(src));
ok('the Paid figure in the header updates live (grp-paid)', /class="grp-paid" data-grp/.test(src) && /paidEl\.textContent = fmt\(paid \+ pay\)/.test(src));
ok('an overpayment is shown, not hidden', /overpay > 0\.5 \? fmt\(overpay\) \+ ' ' \+ t\('overpaid'/.test(src));

R.section('the Save guard no longer blocks an already-overpaid invoice');
ok('the guard computes paid from EDITED amounts (minus removals)', /_editedPaidFor = \(invId\) =>/.test(src) && /removals\.some\(r => r\.invId === invId && r\.pi === pi\)/.test(src));
ok('only a NEW collection is guarded (existing edits always allowed)', /if \(newPay > 0 && editedPaid \+ newPay > gNet \+ 0\.001\)/.test(src));
ok('the stale stored-sum guard is gone', !/const paid = g\.inv \? invoicePaymentsSum\(g\.inv\) : 0;\s*\n\s*if \(paid \+ \(groupPays/.test(src));

R.section('the amount edit is applied on confirm');
ok('an edited installment amount is written back', /if \(e\.amount != null && Math\.abs\(e\.amount - \(Number\(p\.amount\) \|\| 0\)\) > 0\.001\) \{ p\.amount = e\.amount; \}/.test(src));

R.done();
