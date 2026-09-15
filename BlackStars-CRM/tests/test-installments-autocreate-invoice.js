// v6.493 — Installments must be able to FIX a member whose membership invoice was deleted. Collecting
// a payment for a sport that has NO invoice used to be blocked ("Generate an invoice first"), so Paid
// stayed wrong (Alreem: stuck at a stray 20). Now applyPricingSafe AUTO-CREATES a Membership invoice
// from the PROFILE (the priced sports on the screen) when a payment is collected, so it lands.
// (End-to-end behaviour was verified live in the browser: Paid 20 → 920, invoice 900 auto-created.)
const H = require('./qc-harness.js');
const R = H.reporter('INSTALLMENTS · collecting a payment auto-creates the invoice');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('the old hard block is gone');
ok('no longer aborts with "Generate an invoice first"', !/use .Generate latest invoice. first, then collect the payment/.test(src));
ok('only blocks when the group has nothing priced', /if \(newPay > 0 && !g\.inv && !g\.rows\.some\(r => \(Number\(r\.price\) \|\| 0\) > 0\)\)/.test(src));

R.section('applyPricingSafe builds an invoice from the profile when a payment is collected');
ok('detects a group with a new payment but no invoice', /if \(!inv && groupNewPay > 0\) \{/.test(src));
ok('builds line items from the priced profile rows', /const liList = g\.rows\.filter\(r => \(Number\(r\.price\) \|\| 0\) > 0/.test(src));
ok('creates a Membership invoice', /category: 'Membership', activityType: 'subscription',/.test(src));
ok('the new invoice amount = sum of the profile line prices', /const amt0 = Math\.round\(liList\.reduce\(\(s, l\) => s \+ \(Number\(l\.price\) \|\| 0\), 0\) \* 100\) \/ 100;/.test(src));
ok('pushes it to state.invoices and marks the group invoiced', /state\.invoices\.push\(inv\);\s*g\.inv = inv;/.test(src));
ok('links the subscription to the new invoice', /if \(r\.sub && !r\.sub\.invoiceNumber\) r\.sub\.invoiceNumber = inv\.ref;/.test(src));
ok('then records the collected payment onto it', /recordPayment\(inv, \{ date: d, amount: amt, method: mk, sport: paySport \}\)/.test(src));

R.section('the screen no longer tells the user to generate an invoice first');
ok('hint says the invoice is created automatically on collect', /one is created automatically when you collect a payment below/.test(src));

R.done();
