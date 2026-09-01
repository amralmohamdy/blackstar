// v6.546 — an advance/salary recorded as a Salary-category expense only counts toward a coach's pay when
// it is LINKED to that coach (coachId). Several advances were entered with the coach named in the NOTE but
// the coach field left empty (coachId null) → they never appeared on the coach's salary report or reduced
// net (Coach Mostafa's 260 August advance). Two parts: (a) the expense form now WARNS before saving a
// salary with no coach; (b) computeMonthlyPay counts a LINKED salary expense as an advance, not an unlinked one.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.546 · salary advance must be linked to a coach');
const src = H.readSrc();

R.section('source — the unlinked-salary warning');
R.ok('saving a salary with no coach warns first', /if \(salaryCoachId == null && !salaryCoachName\) \{[\s\S]{0,80}?if \(!confirm\(/.test(src) && /isSalaryCategory\(category\)/.test(src));
R.ok('the report already shows advances when they exist', /Advances Given This Month/.test(src) && /pay\.advance > 0/.test(src));

R.section('runtime — advance attribution by coachId');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'attendance'};
    state.coaches=[{id:3,name:'Mostafa',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'M',expiryDate:'2026-12-01',status:'Active',
      subscriptions:[{activity:'Swimming',coachId:3,totalClasses:8,start:'2026-08-01',status:'active',amountPaid:800,invoiceNumber:'I1'}],
      dailyAttendance:{'2026-08':{Swimming:{'2':'Y','5':'Y','9':'Y','12':'Y','15':'Y','18':'Y','21':'Y','24':'Y'}}}}];
    state.invoices=[{id:1,ref:'I1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',amount:800,coachId:3,amountPaid:800,
      lineItems:[{sport:'Swimming',coachId:3,classes:8,price:800}],payments:[{amount:800,date:'2026-08-01',month:'2026-08'}]}];
  `);
  const grossOnly = run(`(function(){var p=computeMonthlyPay(3,'2026-08');return {gross:Math.round(p.gross),advance:Math.round(p.advance),net:Math.round(p.net)};})()`);
  R.ok('no advance → net = gross', grossOnly.advance === 0 && grossOnly.net === grossOnly.gross);

  // UNLINKED salary expense (coach only in the note) → does NOT reduce net
  run(`state.expenses=[{id:9,category:'Salary',month:'2026-08',date:'2026-08-15',amount:260,description:'260 Coach Mostafa advance',method:'cash'}];`);
  const unlinked = run(`(function(){var p=computeMonthlyPay(3,'2026-08');return {advance:Math.round(p.advance),net:Math.round(p.net)};})()`);
  R.ok('an UNLINKED salary (coachId null) does NOT count as an advance', unlinked.advance === 0);

  // LINKED salary expense (coachId set) → counts as advance, reduces net
  run(`state.expenses=[{id:9,category:'Salary',month:'2026-08',date:'2026-08-15',amount:260,coachId:3,description:'260 Coach Mostafa advance',method:'cash'}];`);
  const linked = run(`(function(){var p=computeMonthlyPay(3,'2026-08');return {gross:Math.round(p.gross),advance:Math.round(p.advance),net:Math.round(p.net)};})()`);
  R.ok('a LINKED salary counts as an advance', linked.advance === 260);
  R.ok('  → net = gross − advance', linked.net === linked.gross - 260);
}

R.done();
