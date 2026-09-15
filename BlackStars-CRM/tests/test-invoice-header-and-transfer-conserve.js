// v6.512 — (1) the printed invoice no longer shows the browser's "blob:https://…" URL header:
// @page{margin:0} leaves Chrome no margin to draw its header/footer, and the body gets real
// padding for the visual margin. (2) The coach-transfer date field is relabelled to the departing
// coach's LAST day (removing the ambiguity that mis-credited the boundary-day class). (3) A runtime
// proof that the transfer split CONSERVES the class count: old(attended) + new(remaining) = total.
const H = require('./qc-harness.js');
const R = H.reporter('v6.512 · invoice header + transfer conservation');
const src = H.readSrc();

R.section('invoice print header (source)');
R.ok('@page margin is zeroed so the browser prints no URL/title header', /@page \{ margin: 0; \}/.test(src));
R.ok('the printed body keeps a real visual margin', /body \{ padding: 14mm 16mm; \}/.test(src));

R.section('transfer date clarity (source)');
R.ok('the transfer date is labelled the departing coach’s LAST day', /\$\{escapeHtml\(from\.name\)\}'s last day<\/label>/.test(src));
R.ok('it explains classes on/before stay with the old coach', /Classes on\/before this date stay with/.test(src));

R.section('the transfer split CONSERVES classes (runtime)');
{
  const ctx = H.makeCtx({ today: '2026-08-15' });
  const run = c => H.vm.runInContext(c, ctx);
  run("state.coaches=[{id:14,name:'Iyad',rate:100,role:'coach',active:'N'},{id:1,name:'Abdel',rate:100,role:'coach',active:'Y'}]; state.settings={commissionBasis:'attendance'};");
  // 12-class KB package, 1 class attended before the 31-Jul handover
  run(`state.members=[{id:9,name:'M',startDate:'2026-07-10',
    enrollments:[{sport:'Kick Boxing',coachId:14,classes:12,price:500}],
    subscriptions:[{_sid:'s',activity:'Kick Boxing',coachId:14,coach:'Iyad',totalClasses:12,amountPaid:500,start:'2026-07-10',end:'2026-08-31',status:'active',invoiceNumber:'A'}],
    dailyAttendance:{'2026-07':{'Kick Boxing':{'29':'Y'}},'2026-08':{'Kick Boxing':{'1':'Y','3':'Y'}}}}];`);
  run("state.invoices=[{id:1,ref:'A',customerId:9,date:'2026-07-10',month:'2026-07',category:'Membership',activityType:'subscription',coachId:14,amount:500,payments:[{amount:500}],lineItems:[{sport:'Kick Boxing',coachId:14,classes:12,price:500}]}];");
  run("render=function(){};downloadBackup=function(){};confirmSaved=function(){};toast=function(){};assertCloudWritable=function(){return true};save=function(){};");
  run("var __qs=document.querySelector.bind(document);document.querySelector=function(sel){if(sel==='#tr-to')return{value:'1'};if(sel==='#tr-date')return{value:'2026-07-31'};if(sel==='#tr-sport')return null;return __qs(sel)};");
  run("globalThis.__cap=null;showModal=function(cfg){globalThis.__cap=cfg};transferCoachStudents(14);var a=(__cap.actions||[]).find(function(x){return /Transfer & split/.test(x.label)});if(a)a.onclick();");
  const subs = JSON.parse(run("JSON.stringify(state.members[0].subscriptions.filter(s=>s.activity==='Kick Boxing').map(s=>({c:s.coachId,st:s.status,tc:s.totalClasses})))"));
  const old14 = subs.find(s => String(s.c) === '14');
  const new1 = subs.find(s => String(s.c) === '1');
  R.ok('old coach sub completed at his attended count (1)', old14 && old14.st === 'completed' && old14.tc === 1, JSON.stringify(old14));
  R.ok('new coach sub active with the remaining classes (11)', new1 && new1.st === 'active' && new1.tc === 11, JSON.stringify(new1));
  R.ok('CLASS COUNT CONSERVED: old + new = original 12', old14 && new1 && (old14.tc + new1.tc) === 12, `${old14&&old14.tc} + ${new1&&new1.tc}`);
  // invoice lines also conserve: two KB lines summing to the original 12 classes / 500
  const lines = JSON.parse(run("JSON.stringify((state.invoices.find(v=>v.ref==='A').lineItems||[]).filter(l=>/kick/i.test(l.sport)).map(l=>({c:l.coachId,cl:l.classes,p:l.price})))"));
  const clSum = lines.reduce((s, l) => s + (l.cl || 0), 0);
  const pSum = Math.round(lines.reduce((s, l) => s + (l.p || 0), 0) * 100) / 100;
  R.ok('invoice KB lines conserve classes (Σ = 12)', clSum === 12, JSON.stringify(lines));
  R.ok('invoice KB lines conserve money (Σ = 500)', pSum === 500, String(pSum));
}

R.done();
