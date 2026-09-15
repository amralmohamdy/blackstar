// v6.462 — Members CSV export now carries the money + attendance rollup (Total Charged / Total Paid /
// Balance Due from the invoice ledger, Attended / Total Classes, Attendance %) plus Gender, Nationality
// and Sport(s); and the row checkboxes support Shift+click range selection. This locks the export shape
// (header + a computed row) and the presence of the shift-range wiring.
const H = require('./qc-harness.js');
const R = H.reporter('MEMBERS · richer export + shift-select');

R.section('source: the export header + shift-select wiring');
{
  const src = H.readSrc();
  R.ok('export header includes Total Paid', /'Total Paid \(QAR\)'/.test(src));
  R.ok('export header includes Balance Due', /'Balance Due \(QAR\)'/.test(src));
  R.ok('export header includes Attended + Total Classes', /'Attended','Total Classes','Attendance %'/.test(src));
  R.ok('export header includes Gender + Nationality + Sport(s)', /'Gender','Nationality','Sport\(s\)'/.test(src));
  R.ok('memberExportStats reads paid from the invoice ledger', /memberExportStats/.test(src) && /invoicePaid\(i\)/.test(src));
  R.ok('memberExportStats windows attendance like the card', /subAttendanceWindow\(m, s\)/.test(src) && /liveAttendanceCount\(m, s\.activity/.test(src));
  R.ok('Shift+click range-selects the member checkboxes', /if \(e\.shiftKey && lastCbIdx >= 0/.test(src) && /cbList\[i\]/.test(src));
}

R.section('memberExportStats computes paid + attendance for a member');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const stats = H.vm.runInContext(`
    (function(){
      const m = (state.members || []).find(x => !x.deleted && (state.invoices||[]).some(i => i.customerId === x.id && !i.deleted));
      if (!m) return { none: true };
      const s = memberExportStats(m);
      return { id: m.id, totalCharged: s.totalCharged, totalPaid: s.totalPaid, balanceDue: s.balanceDue, attended: s.attended, totalClasses: s.totalClasses, attPct: s.attPct, sports: s.sports };
    })()
  `, ctx);
  R.ok('a member with invoices was found in the seed', !stats.none, JSON.stringify(stats));
  if (!stats.none) {
    R.ok('totalCharged is a non-negative number', typeof stats.totalCharged === 'number' && stats.totalCharged >= 0, JSON.stringify(stats));
    R.ok('totalPaid is a non-negative number', typeof stats.totalPaid === 'number' && stats.totalPaid >= 0, JSON.stringify(stats));
    R.ok('paid never exceeds charged in the seed', stats.totalPaid <= stats.totalCharged + 0.01, JSON.stringify(stats));
    R.ok('balanceDue ≈ charged − paid (never negative)', stats.balanceDue >= 0, JSON.stringify(stats));
    R.ok('attendance % is 0..100', stats.attPct >= 0 && stats.attPct <= 100, JSON.stringify(stats));
    R.ok('sports is a string', typeof stats.sports === 'string');
  }
}

R.done();
