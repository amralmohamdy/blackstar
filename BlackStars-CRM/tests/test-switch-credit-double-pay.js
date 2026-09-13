// v6.545 — SWITCH-CREDIT DOUBLE-PAY FIX. A switch-credit invoice's POSITIVE line pays the NEW coach the
// transferred share. But some switches (old net-zero-credit model, later reconciled) left BOTH a
// switch-credit line AND a real destination line/sub for the same sport+coach — so the new coach was paid
// TWICE: once attendance-based on the real line, once flat on the credit line. (Coach Ahmed's revenue
// detail showed Layla Karim's Taekwondo twice: 234 + a 234 "SWITCH" line.) Fix: skip a switch-credit's
// positive line when a real (non-switch) membership invoice already carries that member+sport+coach.
// Old-model-only switches (no real destination line) still get their credit — nothing to match.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.545 · switch-credit double-pay');
const src = H.readSrc();

R.section('source');
R.ok('the guard skips a switch-credit positive line when a switchFunded sub already carries it', /switchCredit \|\| inv\.activityType === 'switch-credit'\) && fee > 0 && mem[\s\S]{0,220}?\(s\.activity \|\| ''\) === li\.sport && String\(s\.coachId\) === String\(li\.coachId\) && s\.switchFunded\)\) continue;/.test(src));
R.ok('it still skips the negative clawback (unchanged)', /switchCredit \|\| inv\.activityType === 'switch-credit'\) && fee < 0\) continue;/.test(src));

R.section('runtime');
{
  const ctx = H.makeCtx({ today: '2026-08-31', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // Member A (Layla-like): a real Taekwondo·Ahmed line on INV1 AND a switch-credit line on SW1 → count ONCE.
  // Member B (old-model-only): ONLY a switch-credit Taekwondo·Ahmed line → still credited.
  run(`
    state.settings={commissionBasis:'attendance'};
    state.coaches=[{id:7,name:'Ahmed',rate:30,role:'coach',active:true},{id:8,name:'Jennifer',rate:30,role:'coach',active:true}];
    state.members=[
      {id:1,name:'Layla',expiryDate:'2026-12-01',status:'Active',
        subscriptions:[{activity:'Taekwondo',coachId:7,start:'2026-08-22',end:'2026-09-15',totalClasses:5,amountPaid:234.37,status:'active',switchFunded:true,invoiceNumber:'INV1'}],
        dailyAttendance:{'2026-08':{Taekwondo:{'23':'Y','24':'Y','25':'Y','26':'Y','27':'Y'}}}},
      {id:2,name:'OldModel',expiryDate:'2026-12-01',status:'Active',
        subscriptions:[{activity:'Taekwondo',coachId:7,start:'2026-08-01',end:'2026-08-31',totalClasses:5,amountPaid:200,status:'active',invoiceNumber:'SWX'}],
        dailyAttendance:{'2026-08':{Taekwondo:{'2':'Y','5':'Y'}}}}
    ];
    state.invoices=[
      {id:11,ref:'INV1',customerId:1,category:'Membership',date:'2026-08-22',month:'2026-08',amount:234.37,amountPaid:234.37,
        lineItems:[{sport:'Taekwondo',coachId:7,classes:5,price:234.37}],payments:[{amount:234.37,date:'2026-08-22',month:'2026-08'}]},
      {id:12,ref:'SW-1',customerId:1,category:'Membership',date:'2026-08-25',month:'2026-08',amount:0,switchCredit:true,activityType:'switch-credit',
        lineItems:[{sport:'Gymnastic',coachId:8,classes:-5,price:-234.37},{sport:'Taekwondo',coachId:7,classes:5,price:234.37}]},
      // old-model-only member: the destination lives ONLY on the switch-credit
      {id:21,ref:'SWX',customerId:2,category:'Membership',date:'2026-08-01',month:'2026-08',amount:0,switchCredit:true,activityType:'switch-credit',
        lineItems:[{sport:'Karate',coachId:8,classes:-5,price:-200},{sport:'Taekwondo',coachId:7,classes:5,price:200}]}
    ];
  `);
  const ahmed = () => run(`(function(){var r=computeAttendanceCommission(7,'2026-08');return (r.lines||[]).filter(l=>l.sport==='Taekwondo');})()`);
  const laylaLines = run(`(function(){var r=computeAttendanceCommission(7,'2026-08');return (r.lines||[]).filter(l=>l.sport==='Taekwondo'&&l.memberName==='Layla').length;})()`);
  R.ok('Layla now has exactly ONE Taekwondo line (was two)', laylaLines === 1);
  R.ok('  and it is NOT the flat "switch credit" line', run(`(function(){var r=computeAttendanceCommission(7,'2026-08');return (r.lines||[]).some(l=>l.memberName==='Layla'&&l.note==='switch credit');})()`) === false);

  // old-model-only member still credited via the switch-credit line
  R.ok('old-model-only member STILL credited (switch-credit line kept)', run(`(function(){var r=computeAttendanceCommission(7,'2026-08');return (r.lines||[]).some(l=>l.memberName==='OldModel'&&l.sport==='Taekwondo');})()`) === true);

  // Ahmed's total no longer double-counts Layla
  const base = run(`Math.round(computeAttendanceCommission(7,'2026-08').base*100)/100`);
  R.ok('Ahmed base counts Layla once (≈234 attended) + OldModel, not doubled', base < 234.37 + 200 + 1 && base > 200);
}

R.done();
