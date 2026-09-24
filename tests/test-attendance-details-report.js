// v6.604 — Attendance "Details report": a printable report over the SELECTED months covering every
// sport + coach in the filtered view, listing the ACTUAL attended dates per student·sport·coach (not
// just a per-month count). Must use the same data as the grid: attKey (Mixed + per-coach split) and
// the row window, and honour the selected months (filter.months), not all months.
const H = require('./qc-harness.js');
const R = H.reporter('v6.604 · attendance details report');

R.section('toolbar button + wiring');
{
  const src = H.readSrc();
  R.ok('a "Details report" button exists in the attendance toolbar', /id="att-export-details"[\s\S]{0,400}Details report/.test(src));
  R.ok('the button is wired to the details export', /\$\('#att-export-details'\)\?\.addEventListener\('click'[\s\S]{0,300}exportAttendanceDetailsPdf\(rows\)/.test(src));
  R.ok('the export function is defined', /function exportAttendanceDetailsPdf\(rows\)/.test(src));
}

R.section('respects the SELECTED months, not all months');
{
  const src = H.readSrc();
  R.ok('months come from filter.months when set (falls back to monthsWithData)', /const months = \(filter\.months && filter\.months\.length\) \? filter\.months\.slice\(\)\.sort\(\) : monthsWithData\(\)/.test(src));
}

R.section('same data as the grid: attKey / Mixed / window');
{
  const src = H.readSrc();
  R.ok('Mixed rows read mixedDayMarks; normal rows read attKey||sport', /\(attKey === MIXED\) \? mixedDayMarks\(m, mo\) : \(m\.dailyAttendance\?\.\[mo\]\?\.\[attKey \|\| sport\] \|\| \{\}\)/.test(src));
  R.ok('a day counts only inside the row window (inWin)', /if \(dd\[k\] === 'Y' && inWin\(win, mo, k\)\) days\.push/.test(src));
  R.ok('the attended DATES are listed in FULL (v6.606: "5 Jul"), not just day numbers', /const dateList = days\.map\(d => d \+ ' ' \+ _monShort\)\.join\(' · '\)/.test(src));
  R.ok('per-row total + grand total accumulate', /rowY \+= days\.length/.test(src) && /grandY \+= rowY/.test(src));
}

R.section('v6.606 — membership Start → Expiry per row');
{
  const src = H.readSrc();
  R.ok('resolves the sub for this sport (coach-matched, Mixed/camp exempt)', /const _sub = \(m\.subscriptions \|\| \[\]\)\.filter\(su => \(su\.activity \|\| ''\) === sport\)/.test(src));
  R.ok('start/expiry fall back to the window when no sub', /const _start = \(_sub && _sub\.start\) \|\| \(win && win\.from\)/.test(src) && /const _exp = \(_sub && _sub\.end\) \|\| \(win && win\.to\)/.test(src));
  R.ok('a 📅 start → expiry line is rendered in the name cell', /📅 \$\{t\('Membership'[\s\S]{0,60}<b>\$\{_start \? fmtDate\(_start\) : '—'\}<\/b> → <b>\$\{_exp \? fmtDate\(_exp\) : '—'\}<\/b>/.test(src));
  R.ok('v6.606 parent-friendly styling present (big count + total pill)', /\.cnt\{font-size:22px/.test(src) && /\.tpill\{[\s\S]{0,80}font-size:20px/.test(src));
}

R.section('renders on the attendance screen');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin', today: '2026-07-24' }));
  const r = H.renderScreen(ctx, 'attendance');
  R.ok('the Details report button appears in the rendered toolbar', r.ok && /att-export-details/.test(r.html) && /Details report/.test(r.html), r.error || (r.html || '').slice(0, 60));
}

R.done();
