// v6.503 — two admin controls:
//  (1) switchSport lets an ADMIN switch the same member MORE THAN ONCE per cycle
//      (correcting a mistaken switch). Reception/others are still capped at one.
//  (2) transferCoachStudents offers a "Sport to transfer" dropdown when the old coach
//      teaches >1 sport; picking one hands off ONLY that sport, leaving the rest with the coach.
const H = require('./qc-harness.js');
const R = H.reporter('v6.503 · admin re-switch + per-sport transfer');
const run = (c, s) => H.vm.runInContext(s, c);
const src = H.readSrc();

R.section('source wiring');
R.ok('the one-switch guard is admin-overridable', /switchesThisCycle\.length >= 1 && currentRole\(\) !== 'admin'/.test(src));
R.ok('transfer builds the coach\'s sport list', /const _fromSports = Array\.from\(new Set/.test(src));
R.ok('transfer renders a Sport-to-transfer dropdown for multi-sport coaches', /_fromSports\.length > 1 \?[\s\S]{0,120}id="tr-sport"/.test(src));
R.ok('transfer reads the sport filter + a _sportMatch helper', /const sportFilter = \(\$\('#tr-sport'\)[\s\S]{0,120}_sportMatch = \(sp\) =>/.test(src));
R.ok('the split loop skips non-matching sports', /if \(!_sportMatch\(sport\)\) continue;/.test(src));
R.ok('the primary-coach pointer only moves on an all-sports transfer', /sportFilter === '__ALL__' && _sameC\(m\.coachId, fromId\)/.test(src));

R.section('runtime · admin may switch a member a SECOND time; reception cannot');
function seedSwitched(ctx, role) {
  run(ctx, `
    state.user = { role:'${role}' }; state.session = { role:'${role}' };
    state.coaches = [{ id:1, name:'A', active:'Y' }, { id:2, name:'B', active:'Y' }];
    state.members = [{ id:70, name:'Zoya', startDate:'2026-07-06',
      enrollments:[{ sport:'Football', coachId:1, classes:8, price:400, start:'2026-07-06', validity:30 }],
      subscriptions:[{ activity:'Football', coachId:1, totalClasses:8, attendedClasses:1, status:'active', start:'2026-07-06', end:'2026-08-05' }],
      sportSwitches:[{ date:'2026-07-20', fromSport:'Swimming', toSport:'Football' }] }];
    globalThis.__cap = null;
    showModal = function(cfg){ globalThis.__cap = cfg; };
    window.toast = function(){}; toast = window.toast;
  `);
}
{
  const ctx = H.makeCtx({ today: '2026-08-15', role: 'admin' });
  seedSwitched(ctx, 'admin');
  run(ctx, `switchSport(70)`);
  const title = run(ctx, `(__cap && __cap.title) || ''`);
  R.ok('admin: NOT blocked — the Switch Sport dialog opens', /Switch Sport/.test(title), title);
  R.ok('admin: it is NOT the "Already switched" block', !/Already switched/.test(title), title);
}
{
  const ctx = H.makeCtx({ today: '2026-08-15', role: 'receptionist' });
  seedSwitched(ctx, 'receptionist');
  run(ctx, `switchSport(70)`);
  const title = run(ctx, `(__cap && __cap.title) || ''`);
  R.ok('reception: blocked with the "Already switched" notice', /Already switched/.test(title), title);
}

R.section('runtime · a per-sport transfer moves ONLY the chosen sport');
{
  const ctx = H.makeCtx({ today: '2026-08-15', role: 'admin' });
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.settings = {}; state.schedule = [];
    state.coaches = [
      { id:1, name:'Multi', active:'Y', rate:30 },
      { id:2, name:'NewFB', active:'Y', rate:30 },
    ];
    // one member with TWO sports both coached by Multi (id 1)
    state.members = [{ id:80, name:'Kid', coachId:1, startDate:'2026-07-06',
      enrollments:[
        { sport:'Football', coachId:1, classes:8, price:400, start:'2026-07-06', validity:30 },
        { sport:'Karate',   coachId:1, classes:8, price:400, start:'2026-07-06', validity:30 },
      ],
      subscriptions:[
        { activity:'Football', coachId:1, coach:'Multi', totalClasses:8, attendedClasses:0, status:'active', start:'2026-07-06', end:'2026-09-05', invoiceNumber:'INV-1' },
        { activity:'Karate',   coachId:1, coach:'Multi', totalClasses:8, attendedClasses:0, status:'active', start:'2026-07-06', end:'2026-09-05', invoiceNumber:'INV-1' },
      ] }];
    state.invoices = [{ id:1, ref:'INV-1', customerId:80, date:'2026-07-06', category:'Membership',
      amount:800, lineItems:[
        { sport:'Football', coachId:1, coach:'Multi', price:400, classes:8 },
        { sport:'Karate',   coachId:1, coach:'Multi', price:400, classes:8 },
      ] }];
    window.render=function(){}; window.save=function(){}; window.toast=function(){};
    render=window.render; save=window.save; toast=window.toast;
    window.downloadBackup=function(){}; window.assertCloudWritable=function(){return true;};
    window.confirmSaved=function(){}; window.audit=function(){}; window.stampUpdate=function(){};
    window.closeModal=function(){}; closeModal=window.closeModal;
    // no live attendance → 0 attended → whole course hands over
    window.liveAttendanceCount=function(){return {y:0};};
    globalThis.__cap=null; showModal=function(cfg){ globalThis.__cap=cfg; };
  `);
  run(ctx, `transferCoachStudents(1)`);
  // drive the dialog: choose the NewFB coach + Football only
  run(ctx, `
    var _q = document.querySelector.bind(document);
    document.querySelector = function(sel){
      if (sel === '#tr-to') return { value: '2' };
      if (sel === '#tr-date') return { value: '2026-08-15' };
      if (sel === '#tr-sport') return { value: 'Football' };
      return _q(sel);
    };
    window.$ = document.querySelector;
    __cap.actions.find(function(a){ return /Transfer/.test(a.label); }).onclick();
  `);
  const fbCoach = run(ctx, `state.members[0].subscriptions.find(s=>s.activity==='Football').coachId`);
  const krCoach = run(ctx, `state.members[0].subscriptions.find(s=>s.activity==='Karate').coachId`);
  R.ok('Football moved to the new coach (id 2)', String(fbCoach) === '2', fbCoach);
  R.ok('Karate stayed with the original coach (id 1)', String(krCoach) === '1', krCoach);
  const fbEnr = run(ctx, `state.members[0].enrollments.find(e=>e.sport==='Football').coachId`);
  const krEnr = run(ctx, `state.members[0].enrollments.find(e=>e.sport==='Karate').coachId`);
  R.ok('Football enrollment points at the new coach', String(fbEnr) === '2', fbEnr);
  R.ok('Karate enrollment untouched', String(krEnr) === '1', krEnr);
  const krLine = run(ctx, `state.invoices[0].lineItems.find(l=>l.sport==='Karate').coachId`);
  R.ok('Karate invoice line untouched', String(krLine) === '1', krLine);
}

R.done();
