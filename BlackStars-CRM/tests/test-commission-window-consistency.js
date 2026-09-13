// v6.434 — commission counts attendance through the SAME "fill up to paid classes" window as the
// member card, so a class attended a day or two AFTER the validity date reads as an ATTENDED class
// (in its own month), NOT a phantom "expiry true-up". Same total pay, correct labels.
//
// Reported case — Noor Chakori (Jennifer's Gymnastic student, 12-class / 450 package):
//   marks: Jun 21,23,28,30 (4) + Jul 2,7,9,12,14,16,21,23 (8) = 12 attended, package end 2026-07-21.
//   Before: June 4 attended, July 7 attended + 1 "expiry true-up" (the 23-Jul class read as unattended).
//   After:  June 4 attended, July 8 attended, NO true-up. Total unchanged: 450 → Jennifer 35% = 157.5.
const H = require('./qc-harness.js');
const R = H.reporter('COMMISSION · window consistency (no phantom true-up)');
const run = (c, s) => H.vm.runInContext(s, c);

// TODAY after the package end so the monthly path treats the sub as ended (would otherwise pend).
const ctx = H.makeCtx({ role: 'admin', today: '2026-08-01' });
run(ctx, `
  state.members = [{ id:501, name:'Noor Chakori', sport:'Gymnastic', coachId:2, gender:'female',
    startDate:'2026-06-21', expiryDate:'2026-07-21', status:'Active',
    enrollments:[{sport:'Gymnastic',coachId:2,classes:12,price:450}],
    subscriptions:[{activity:'Gymnastic',coachId:2,totalClasses:12,start:'2026-06-21',end:'2026-07-21',status:'active'}],
    dailyAttendance:{
      '2026-06':{Gymnastic:{'21':'Y','23':'Y','28':'Y','30':'Y'}},
      '2026-07':{Gymnastic:{'02':'Y','07':'Y','09':'Y','12':'Y','14':'Y','16':'Y','21':'Y','23':'Y'}} } }];
  state.coaches = [{ id:2, name:'Jennifer', sports:['Gymnastic'], commissionRate:35 }];
  state.invoices = [{ id:900, ref:'INV900', customerId:501, customerName:'Noor Chakori', category:'Membership',
    sport:'Gymnastic', coachId:2, month:'2026-06', date:'2026-06-21', amount:450, method:'cash', payments:[{amount:450}] }];
`);

const jun = run(ctx, `computeAttendanceCommission(2, '2026-06')`);
const jul = run(ctx, `computeAttendanceCommission(2, '2026-07')`);
const junL = jun.lines.filter(l => l.mid === 'm501');
const julL = jul.lines.filter(l => l.mid === 'm501');

R.section('the member card counts all 12 as attended (fill-up-to-paid window)');
{
  const w = run(ctx, `subAttendanceWindow(state.members[0], state.members[0].subscriptions[0])`);
  const y = run(ctx, `attendedYForSub(state.members[0], state.members[0].subscriptions[0])`);
  R.ok('window end extends to the 12th class (23 Jul)', w.to === '2026-07-23', w);
  R.ok('attendedYForSub reads 12', y === 12, y);
}

R.section('June — 4 attended, no true-up');
{
  R.ok('June has an ATTENDED line for 4 classes', junL.some(l => l.kind === 'attended' && l.classes === 4), junL);
  R.ok('June has NO true-up line', !junL.some(l => l.kind === 'trueup'), junL);
}

R.section('July — 8 attended (incl. the late-but-paid 23-Jul class), NO phantom true-up');
{
  R.ok('July has an ATTENDED line for 8 classes', julL.some(l => l.kind === 'attended' && l.classes === 8), julL);
  R.ok('July has NO true-up line (the 23-Jul class is attended, not trued up)', !julL.some(l => l.kind === 'trueup'), julL);
}

R.section('totals unchanged — 12 classes, 450 base, Jennifer 35% = 157.5');
{
  const base = jun.base + jul.base;
  R.ok('total attended classes across months = 12', junL.concat(julL).filter(l => l.kind === 'attended').reduce((a, l) => a + l.classes, 0) === 12);
  R.ok('total base revenue = 450', Math.round(base) === 450, base);
  R.ok('commission at 35% = 157.5', Math.round(base * 0.35 * 100) / 100 === 157.5, base * 0.35);
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('attendedYForSub uses subAttendanceWindow', /function attendedYForSub[\s\S]{0,220}subAttendanceWindow/.test(src));
  R.ok('monthly commission path uses the corrected window', /count per-month attendance over the fill-up-to-paid window/.test(src) && /const _cw = [\s\S]{0,80}subAttendanceWindow\(mem, sub\)/.test(src));
}

R.section('coach salary report flags an expiry true-up clearly (not bare grey text)');
{
  const pagesSrc = require('fs').readFileSync(require('path').join(H.DIR, 'pages.js'), 'utf8');
  R.ok("true-up rows carry the line kind so the report can flag them", /_kind: l\.kind, _trueupClasses: l\.classes/.test(pagesSrc));
  R.ok('the report renders a styled "EXPIRED — paid but not attended" flag', /_kind === 'trueup'[\s\S]{0,260}EXPIRED — \$\{l\._trueupClasses\} paid class/.test(pagesSrc));
  R.ok('a true-up row shows the trued-up class count (not attended) in the Classes column', /l\._kind === 'trueup' \? \(l\._trueupClasses != null \? l\._trueupClasses : 0\) : \(l\.attended/.test(pagesSrc));
}

R.done();
