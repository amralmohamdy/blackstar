// v6.576 — the coach salary/revenue report (both the on-screen modal and the downloadable PDF) now
// shows a "Course total (QAR)" column: the FULL package price of each member/sport line (per-class
// fee × total classes for attendance basis; the coach's full line fee otherwise), next to the
// attendance-prorated "Amount" and the commission. This is the owner's request — a coach should see
// the whole course value, not only what they earned this month.
const H = require('./qc-harness.js');
const R = H.reporter('v6.576 · salary report "Course total" column');
const src = H.readSrc('pages.js') || H.readSrc();

R.section('PDF report (downloadRevenueDetailPDF)');
R.ok('PDF table has a "Course total (QAR)" header', /<th style="text-align:right">Course total \(QAR\)<\/th>\s*<th style="text-align:right">Amount \(QAR\)<\/th>/.test(src));
R.ok('PDF derives the full course fee from perClass × total (attendance basis)', /fee: \(l\.perClass != null && l\.total\) \? Math\.round\(l\.perClass \* l\.total \* 100\) \/ 100 : null/.test(src));
R.ok('PDF defines a course-total cell helper + grand sum', /const ct = \(l\) =>/.test(src) && /const ctCell = \(l\) =>/.test(src) && /const grandCourse = lines\.reduce/.test(src));
R.ok('PDF row renders the course-total cell before Amount', /\$\{ctCell\(l\)\}\s*<td class="num \$\{l\.price < 0/.test(src));
R.ok('PDF per-sport subtotal includes a course-total column (spCourse)', /const spCourse = grp\.reduce\(\(s, l\) => s \+ \(l\._dupIgnored \? 0 : \(ct\(l\) \|\| 0\)\), 0\);/.test(src));
R.ok('PDF grand/subtotal rows print grandCourse', /fmt\(grandCourse\)/.test(src));
R.ok('PDF sport-group header colspan widened to 10 (was 9)', /<td colspan="10" style="font-weight:800;color:#3730a3/.test(src));
R.ok('the stale colspan="9" group header is gone', !/<td colspan="9" style="font-weight:800;color:#3730a3/.test(src));

R.section('on-screen modal (showRevenueDetail)');
R.ok('modal table has a "Course total (QAR)" header', /<th style="text-align:right;padding:8px">Course total \(QAR\)<\/th>\s*<th style="text-align:right;padding:8px">Amount \(QAR\)<\/th>/.test(src));
R.ok('modal empty-state colspan widened to 5', /colspan="5" style="padding:18px;text-align:center;color:var\(--text-mute\)">No commission-generating revenue/.test(src));
R.ok('modal summary box shows a Course total line', /line\$\{lines\.length === 1 \? '' : 's'\} · Course total/.test(src));
R.ok('modal attendance rows carry a full-course fee', /fee: \(l\.perClass != null && l\.total\) \? Math\.round\(l\.perClass \* l\.total \* 100\) \/ 100 : null/.test(src));

R.section('sanity — course total = perClass × total (the full package price)');
{
  // Mohamed 4/8 attended, amount 250 → perClass 62.5 → full course 500 (from the screenshot).
  const perClass = 62.5, total = 8, attended = 4;
  const amount = perClass * attended;         // commission base
  const courseTotal = perClass * total;       // NEW column
  R.ok('amount (base) is perClass × attended = 250', Math.round(amount) === 250, amount);
  R.ok('course total is perClass × total = 500', Math.round(courseTotal) === 500, courseTotal);
  R.ok('course total ≥ amount always (full ≥ earned)', courseTotal >= amount);
}

R.done();
