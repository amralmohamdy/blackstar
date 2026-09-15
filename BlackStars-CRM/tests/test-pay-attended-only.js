// v6.535 — optional "pay attended only" for expired memberships. On the attendance basis, an expired
// membership normally trues-up the unattended remainder to the coach; with this ON (per-coach OR club-
// wide) the coach is paid the NET ATTENDED amount only. Off by default.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.535 · pay attended only (skip expiry true-up)');
const src = H.readSrc();

R.section('source');
R.ok('the flag resolves per-coach OR club-wide', /const attendedOnly = !!\(_cForPay && _cForPay\.payAttendedOnly\) \|\| !!\(state\.settings && state\.settings\.payAttendedOnly\);/.test(src));
R.ok('both true-up branches are gated by !attendedOnly', (src.match(/if \(!attendedOnly && /g) || []).length >= 2);
R.ok('the Salaries screen has the club-wide checkbox', /id="sal-attended-only-cb"/.test(src) && /state\.settings\.payAttendedOnly = !!e\.target\.checked;/.test(src));
R.ok('the coach form has the per-coach checkbox, saved', /id="c-attended-only"/.test(src) && /commissionBasis, payAttendedOnly, role: roleVal/.test(src));

R.section('runtime — expired member, attended 3 of 8 @ 800');
{
  const setup = flag => `
    state.settings={commissionBasis:'attendance',payAttendedOnly:${flag}};
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'M',expiryDate:'2026-08-31',status:'Expired',
      subscriptions:[{activity:'Karate',coachId:1,totalClasses:8,start:'2026-08-01',end:'2026-08-31',status:'active',amountPaid:800,invoiceNumber:'I1'}],
      dailyAttendance:{'2026-08':{Karate:{'2':'Y','5':'Y','9':'Y'}}}}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:800,coachId:1,lineItems:[{sport:'Karate',coachId:1,classes:8,price:800}],payments:[{amount:800,month:'2026-08'}]}];`;
  const baseOf = () => { const ctx = H.makeCtx({ today: '2026-09-15', role: 'admin' }); return { ctx, run: s => vm.runInContext(s, ctx) }; };

  let e = baseOf(); e.run(setup(false));
  R.ok('default (true-up ON): base 800 = 3 attended + 5 trued-up', Math.round(e.run(`computeAttendanceCommission(1,'2026-08').base`) * 100) / 100 === 800);

  e = baseOf(); e.run(setup(true));
  R.ok('club-wide ON: base 300 = 3 attended only (no true-up)', Math.round(e.run(`computeAttendanceCommission(1,'2026-08').base`) * 100) / 100 === 300);
  R.ok('  and no trueup line is produced', !(e.run(`JSON.stringify(computeAttendanceCommission(1,'2026-08').lines)`).includes('trueup')));

  // per-coach flag alone (club setting off)
  e = baseOf(); e.run(setup(false)); e.run(`state.coaches[0].payAttendedOnly=true;`);
  R.ok('per-coach flag alone: base 300', Math.round(e.run(`computeAttendanceCommission(1,'2026-08').base`) * 100) / 100 === 300);

  // an ACTIVE (not expired) member is unaffected — remainder still pends, not trued-up either way
  e = baseOf(); e.run(setup(true).replace("expiryDate:'2026-08-31',status:'Expired'", "expiryDate:'2026-12-01',status:'Active'").replace("end:'2026-08-31'", "end:'2026-12-01'"));
  R.ok('active member: attended-only leaves base = 3 attended (unchanged behaviour)', Math.round(e.run(`computeAttendanceCommission(1,'2026-08').base`) * 100) / 100 === 300);
}

R.done();
