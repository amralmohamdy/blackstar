// v6.520 — owner-confirmed refund policy. The withdrawal admin fee is now 15% of the TOTAL PAID
// (previously 20% of the UNUSED portion), and the refund deducts BOTH the attended value AND that
// fee:  refund = paid − attendedValue − 15%×paid  (= unused − 0.15×paid), floored at 0. Within the
// grace period there is still no fee (full unused refunded).
const H = require('./qc-harness.js');
const R = H.reporter('v6.520 · withdraw refund = paid×0.85 − attended value');
const src = H.readSrc();

R.section('source — engine + defaults');
R.ok('default fee percentage is 15 (was 20)', /const feePct = \(o\.feePct != null && o\.feePct !== ''\) \? \(parseFloat\(o\.feePct\) \|\| 0\) : 15;/.test(src));
R.ok('the fee is a % of the TOTAL PAID (price), not of unused', /const fee = withinGrace \? 0 : r2\(price \* \(feePct \/ 100\)\);/.test(src));
R.ok('refund = unused − fee, floored at 0', /const refund = Math\.max\(0, r2\(unused - fee\)\);/.test(src));
R.ok('withdrawSport defaults the fee to 15%', /state\.settings\.refundFeePct : 15;/.test(src));
R.ok('the settings input + label default to 15% of total paid', /cur\.refundFeePct \?\? 15/.test(src) && /% of the <b>total paid<\/b>/.test(src));

R.section('runtime — computeWithdrawRefund with the new policy');
{
  const ctx = H.makeCtx({ today: '2026-08-23', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  // paid 800, 8 classes, attended 3, after grace → attendedValue = 300, unused = 500,
  // fee = 15% × 800 = 120, refund = 500 − 120 = 380.
  const c = run(`computeWithdrawRefund({ price:800, totalClasses:8, attended:3, startDate:'2026-06-01', refundDate:'2026-08-23', graceDays:7, feePct:15 })`);
  R.ok('attended value (used) = 300', c.used === 300, 'used=' + c.used);
  R.ok('unused = 500', c.unused === 500, 'unused=' + c.unused);
  R.ok('fee = 15% of the 800 paid = 120 (NOT 15% of 500)', c.fee === 120, 'fee=' + c.fee);
  R.ok('refund = paid×0.85 − attendedValue = 380', c.refund === 380, 'refund=' + c.refund);
  R.ok('fee basis is reported as paid', c.feeBasis === 'paid');

  // Within grace → no fee, full unused refunded.
  const g = run(`computeWithdrawRefund({ price:800, totalClasses:8, attended:1, startDate:'2026-08-20', refundDate:'2026-08-23', graceDays:7, feePct:15 })`);
  R.ok('within grace → fee 0, refund = full unused', g.fee === 0 && g.refund === g.unused, `fee=${g.fee} refund=${g.refund} unused=${g.unused}`);

  // Attended almost everything → fee can exceed unused → refund floored at 0 (never negative).
  const z = run(`computeWithdrawRefund({ price:800, totalClasses:8, attended:8, startDate:'2026-06-01', refundDate:'2026-08-23', graceDays:7, feePct:15 })`);
  R.ok('fully attended → refund floored at 0', z.refund === 0, 'refund=' + z.refund);
}

R.done();
