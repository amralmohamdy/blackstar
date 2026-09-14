// v6.570 — MIXED sport: ONE package to try MANY sports, each class under a possibly-different coach.
// Attendance records the actual sport+coach per day (m.mixedAttendance); commission SPLITS across the
// real coaches by classes each taught. This suite drives the REAL commission engine + helpers and
// asserts the split is correct, conserved, month-aware, works on BOTH bases, and doesn't touch normal
// sports.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.570 · Mixed sport (per-class coach split)');
const r2 = n => Math.round(n * 100) / 100;

// Aziz=1, Zakaria=2, Mostafa=3. A Mixed 8-class package @ 800 (100/class). Member tries 3 with Aziz,
// 2 with Zakaria in Sep → 5 attended. Aziz should earn base 300, Zakaria 200; 3 classes unattended pay
// nobody. Coach rate 30% → Aziz commission 90, Zakaria 60.
function seed(ctx, opts) {
  opts = opts || {};
  vm.runInContext(`
    state.settings = { commissionBasis:'${opts.basis || 'attendance'}', commissionStartDate:'', payAttendedOnly:false };
    state.coaches = [
      { id:1, name:'Aziz', rate:30, role:'coach', active:true, commissionBasis:'${opts.coachBasis || ''}' },
      { id:2, name:'Zakaria', rate:30, role:'coach', active:true, commissionBasis:'${opts.coachBasis || ''}' },
      { id:3, name:'Mostafa', rate:30, role:'coach', active:true }
    ];
    state.members = [{
      id:10, name:'Trial Kid', status:'Active', expiryDate:'2026-12-01',
      enrollments:[{ sport:'Mixed', coachId:null, classes:8, price:800 }],
      subscriptions:[{ activity:'Mixed', coachId:null, totalClasses:8, start:'2026-09-01', end:'2026-10-01', status:'active', amountPaid:${opts.paid == null ? 800 : opts.paid}, invoiceNumber:'INVMX' }],
      mixedAttendance:{ '2026-09': {
        '02': { coachId:1, sport:'Boxing', mark:'Y' },
        '05': { coachId:1, sport:'Karate', mark:'Y' },
        '09': { coachId:1, sport:'Boxing', mark:'Y' },
        '12': { coachId:2, sport:'Swimming', mark:'Y' },
        '16': { coachId:2, sport:'Swimming', mark:'Y' }
      } }
    }];
    state.invoices = [{
      id:900, ref:'INVMX', customerId:10, customerName:'Trial Kid', category:'Membership',
      date:'2026-09-01', month:'2026-09', amount:800, coachId:null,
      lineItems:[{ sport:'Mixed', coachId:null, coach:'', classes:8, price:800 }],
      payments:[{ amount:${opts.paid == null ? 800 : opts.paid}, month:'2026-09' }]
    }];
  `, ctx);
}
const commBase = (ctx, coachId, month) => r2(vm.runInContext(`(computeAttendanceCommission(${coachId}, ${JSON.stringify(month)}).base||0)`, ctx));
const monthlyBase = (ctx, coachId, month) => r2(vm.runInContext(`(function(){ const p=computeMonthlyPay(${coachId}, ${JSON.stringify(month)}); return p? p.commissionBase : 0; })()`, ctx));
const monthlyComm = (ctx, coachId, month) => r2(vm.runInContext(`(function(){ const p=computeMonthlyPay(${coachId}, ${JSON.stringify(month)}); return p? p.commissionAmount : 0; })()`, ctx));

R.section('helpers — per-coach attended counting');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx);
  R.ok('mixedAttendedByCoach(Aziz) = 3', vm.runInContext(`mixedAttendedByCoach(state.members[0], 1, null, null)`, ctx) === 3);
  R.ok('mixedAttendedByCoach(Zakaria) = 2', vm.runInContext(`mixedAttendedByCoach(state.members[0], 2, null, null)`, ctx) === 2);
  R.ok('mixedAttendedByCoach(any) = 5 total attended', vm.runInContext(`mixedAttendedByCoach(state.members[0], null, null, null)`, ctx) === 5);
  R.ok('a coach who taught none earns 0 count (Mostafa)', vm.runInContext(`mixedAttendedByCoach(state.members[0], 3, null, null)`, ctx) === 0);
  R.ok('mixedTotalClasses = 8', vm.runInContext(`mixedTotalClasses(state.members[0], state.invoices[0], state.invoices[0].lineItems[0])`, ctx) === 8);
}

R.section('attendance basis — commission splits per real coach (100/class)');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx);
  R.ok('Aziz base = 3 × 100 = 300', commBase(ctx, 1, '2026-09') === 300, 'got ' + commBase(ctx, 1, '2026-09'));
  R.ok('Zakaria base = 2 × 100 = 200', commBase(ctx, 2, '2026-09') === 200, 'got ' + commBase(ctx, 2, '2026-09'));
  R.ok('Mostafa (taught none) base = 0', commBase(ctx, 3, '2026-09') === 0);
  R.ok('split is CONSERVED — Aziz+Zakaria = 500 = 5 attended × 100 (3 unattended pay nobody)',
    r2(commBase(ctx, 1, '2026-09') + commBase(ctx, 2, '2026-09')) === 500);
  R.ok('Salaries screen: Aziz commission = 300 × 30% = 90', monthlyComm(ctx, 1, '2026-09') === 90, 'got ' + monthlyComm(ctx, 1, '2026-09'));
  R.ok('Salaries screen: Zakaria commission = 200 × 30% = 60', monthlyComm(ctx, 2, '2026-09') === 60);
}

R.section('month-aware — a class in another month credits that month only');
{
  const ctx = H.makeCtx({ today: '2026-10-20', role: 'admin' });
  seed(ctx);
  // add an October Aziz class
  vm.runInContext(`state.members[0].mixedAttendance['2026-10'] = { '03': { coachId:1, sport:'MMA', mark:'Y' } }; state.members[0].subscriptions[0].end='2026-10-31';`, ctx);
  R.ok('Aziz Sep base still 300 (Oct class not counted in Sep)', commBase(ctx, 1, '2026-09') === 300);
  R.ok('Aziz Oct base = 100 (the one Oct class)', commBase(ctx, 1, '2026-10') === 100, 'got ' + commBase(ctx, 1, '2026-10'));
}

R.section('payment basis — splits the paid amount by classes taught');
{
  // Both coaches pinned to payment basis; invoice fully paid 800. Aziz taught 3/8, Zakaria 2/8 → of the
  // 800 paid, Aziz fee-share = 800×3/8 = 300, Zakaria = 200; ×30% → 90 / 60.
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx, { basis: 'payment', coachBasis: 'payment' });
  R.ok('Aziz payment-basis commission = 90', monthlyComm(ctx, 1, '2026-09') === 90, 'got ' + monthlyComm(ctx, 1, '2026-09'));
  R.ok('Zakaria payment-basis commission = 60', monthlyComm(ctx, 2, '2026-09') === 60, 'got ' + monthlyComm(ctx, 2, '2026-09'));
}

R.section('payment basis — PART-paid splits only what came in');
{
  // Only 400 of 800 paid → Aziz share 400×3/8=150, Zakaria 400×2/8=100; ×30% → 45 / 30.
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx, { basis: 'payment', coachBasis: 'payment', paid: 400 });
  R.ok('Aziz = 150 × 30% = 45', monthlyComm(ctx, 1, '2026-09') === 45, 'got ' + monthlyComm(ctx, 1, '2026-09'));
  R.ok('Zakaria = 100 × 30% = 30', monthlyComm(ctx, 2, '2026-09') === 30, 'got ' + monthlyComm(ctx, 2, '2026-09'));
}

R.section('Member Commission report — fans out one row per coach');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  seed(ctx);
  const rows = vm.runInContext(`computeMemberCommissions('2026-09').filter(r=>r.sport==='Mixed')`, ctx);
  R.ok('two Mixed rows (one per coach who taught)', rows.length === 2, 'got ' + rows.length);
  const byCoach = {}; rows.forEach(r => byCoach[r.coachId] = r);
  R.ok('Aziz row: base 300, commission 90', byCoach[1] && r2(byCoach[1].commissionBase) === 300 && r2(byCoach[1].commission) === 90, JSON.stringify(byCoach[1]));
  R.ok('Zakaria row: base 200, commission 60', byCoach[2] && r2(byCoach[2].commissionBase) === 200 && r2(byCoach[2].commission) === 60, JSON.stringify(byCoach[2]));
  R.ok('report split conserved = 500', r2((byCoach[1] ? byCoach[1].commissionBase : 0) + (byCoach[2] ? byCoach[2].commissionBase : 0)) === 500);
}

R.section('no impact — a normal sport is unchanged');
{
  const ctx = H.makeCtx({ today: '2026-09-20', role: 'admin' });
  vm.runInContext(`
    state.settings = { commissionBasis:'attendance', commissionStartDate:'' };
    state.coaches = [{ id:1, name:'Aziz', rate:30, role:'coach', active:true }];
    state.members = [{ id:20, name:'Normal', status:'Active', expiryDate:'2026-12-01',
      enrollments:[{ sport:'Karate', coachId:1, classes:8, price:800 }],
      subscriptions:[{ activity:'Karate', coachId:1, totalClasses:8, start:'2026-09-01', end:'2026-10-01', status:'active', amountPaid:800, invoiceNumber:'INVK' }],
      dailyAttendance:{ '2026-09': { Karate: { '02':'Y','05':'Y','09':'Y' } } } }];
    state.invoices = [{ id:901, ref:'INVK', customerId:20, customerName:'Normal', category:'Membership', date:'2026-09-01', month:'2026-09', amount:800, coachId:1, lineItems:[{ sport:'Karate', coachId:1, classes:8, price:800 }], payments:[{ amount:800, month:'2026-09' }] }];
  `, ctx);
  R.ok('normal Karate: Aziz base = 3 × 100 = 300 (Mixed branch not triggered)', commBase(ctx, 1, '2026-09') === 300, 'got ' + commBase(ctx, 1, '2026-09'));
}

R.done();
