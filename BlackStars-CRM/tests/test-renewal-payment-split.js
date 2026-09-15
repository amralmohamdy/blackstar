// v6.455 — the classic single-sport Renew Subscription popup gained a payment-method SPLIT panel
// (Cash / Card / Fawran / Transfer), matching Add Member. The renewal invoice now records the
// method breakdown (payments[] + amountPaid + method) instead of a hardcoded 'cash'. Verified
// end-to-end in a browser; this locks the wiring so it can't regress.
const fs = require('fs');
const path = require('path');
const pages = fs.readFileSync(path.join(__dirname, '..', 'pages.js'), 'utf8');
const H = require('./qc-harness.js');
const R = H.reporter('RENEWAL · payment-method split');

R.section('the renewal modal renders the 4 method boxes + a live paid/due hint');
{
  R.ok('rn-pay-m method inputs exist (data-method)', /class="rn-pay-m" data-method="\$\{mk\}"/.test(pages));
  R.ok('all four methods are offered in the renewal panel', /\['cash'[\s\S]{0,80}\['card'[\s\S]{0,80}\['fawran'[\s\S]{0,80}\['transfer'/.test(pages.split('rn-pay-panel')[1] || ''));
  R.ok('a payment date field is present', /id="rn-paydate"/.test(pages));
  R.ok('a live paid/due hint element is present', /id="rn-pay-hint"/.test(pages));
  R.ok('the fee field is relabelled from "Amount paid" to "Amount / Fee"', /<label>Amount \/ Fee \(QAR\)<\/label>/.test(pages));
}

R.section('the Save handler builds a per-method ledger and puts it on the invoice');
{
  R.ok('reads the .rn-pay-m boxes into a per-method map', /querySelectorAll\('\.rn-pay-m'\)\.forEach\(mi => \{[\s\S]{0,220}_payByMethod\[mi\.dataset\.method\]/.test(pages));
  R.ok('ALL blank ⇒ one cash row for the full fee (preserves prior behaviour)', /: \[\{ date: _payDate, month: _payMonth, amount, method: 'cash' \}\];/.test(pages));
  R.ok('each non-zero method becomes its own dated ledger row', /Object\.entries\(_payByMethod\)\.filter\(\(\[, a\]\) => a > 0\)\.map\(\(\[mk, a\]\) => \(\{ date: _payDate, month: _payMonth, amount: a, method: mk \}\)\)/.test(pages));
  R.ok('over-payment is guarded (paid now can’t exceed the fee)', /_paidNow > amount \+ 0\.001[\s\S]{0,120}return;/.test(pages));
  R.ok('the invoice stores amountPaid + payments + the real method (not hardcoded cash)', /amountPaid: _paidNow,\s*\n\s*payments: _paidNow > 0 \? _payRows : \[\],\s*\n\s*method: _payMethod,/.test(pages));
  R.ok('the renewal invoice uses the computed method + billMonth (not a hardcoded cash)', /method: _payMethod,\s*\n\s*month: start\.slice\(0, 7\),\s*\n\s*ref,/.test(pages));
}

R.section('smoke: the renewal helper is exposed and the Members screen still renders');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  R.ok('window.addRenewal is defined', /window\.addRenewal = function\(memberId\)/.test(pages));
  R.ok('Members screen still renders', H.renderScreen(ctx, 'members').ok, H.renderScreen(ctx, 'members').error);
}

R.done();
