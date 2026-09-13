// v6.533 — the Expense dialog gains (A) a Fawran mobile-number field shown only when method='fawran'
// (saved as payMobile), and (B) an optional Comments box (saved as notes). Both surface in the table row.
const H = require('./qc-harness.js');
const R = H.reporter('v6.533 · expense Fawran mobile + comments');
const src = H.readSrc();

R.section('source — form fields + toggle + save + row display');
R.ok('a Fawran mobile field exists, hidden unless method is Fawran', /id="f-mobile-row" style="\$\{cur\.method === 'fawran' \? '' : 'display:none'\}"/.test(src) && /id="f-mobile"/.test(src));
R.ok('the method select toggles the mobile row', /onchange="window\._expMethodChanged/.test(src) && /window\._expMethodChanged = function\(\)/.test(src));
R.ok('the toggle shows the row only for Fawran', /row\.style\.display = \(m\.value === 'fawran'\) \? '' : 'none';/.test(src));
R.ok('a Comments textarea exists', /id="f-notes"/.test(src) && /Comments/.test(src));
R.ok('payMobile is only kept for the Fawran method', /const payMobile = \(method === 'fawran'\) \? \(\(\$\('#f-mobile'\) \|\| \{\}\)\.value \|\| ''\)\.trim\(\) : '';/.test(src));
R.ok('both payMobile and notes are saved on the expense', /payMobile, notes,/.test(src));
R.ok('the expense row shows the comment sub-line', /💬 \$\{escapeHtml\(e\.notes\)\}/.test(src));
R.ok('the expense row shows the Fawran mobile', /📱 \$\{escapeHtml\(e\.payMobile\)\}/.test(src));

R.done();
