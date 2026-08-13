// v6.496 — "Rebuild from profile" now reconciles a member whose SUBSCRIPTION HISTORY (the real packages
// bought + paid) drifted from their membership INVOICES — the Summer Camp multi-renewal case (Tamim:
// subs 2615 vs invoices 2912 → phantom 297/212 due). It rebuilds one clean invoice per package from the
// subs (paid = amountPaid), voiding the stale ones → Total = Paid = Σ packages, Due = 0. Verified on the
// real backup: Tamim 265 total 2912/paid 2700/due 212 → total 2615/paid 2615/due 0.
const H = require('./qc-harness.js');
const R = H.reporter('MEMBER · rebuild invoices from subscription history');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('rebuildMemberFromProfile routes to the subs-rebuild on a mismatch');
ok('detects subs-vs-invoices mismatch', /if \(Math\.abs\(_subsPaid - _invTotal\) > 0\.5\) return window\._reconcileInvoicesFromSubs\(memberId\);/.test(src));
ok('_reconcileInvoicesFromSubs exists', /window\._reconcileInvoicesFromSubs = function \(memberId\)/.test(src));
ok('voids the stale membership invoices', /iv\.deleted = true; iv\.deletedAt/.test(src));
ok('one clean invoice per sub, paid = amountPaid', /payments: paid > 0 \? \[\{ amount: paid/.test(src));
ok('keeps camp durationLabel on the rebuilt line', /durationLabel: s\.durationLabel \|\| null/.test(src));

R.section('runtime: a camp member with drifted invoices → Total = Paid = Σ packages, Due = 0');
const ctx = H.makeCtx({ today: '2026-08-13' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[]; state.settings={};");
run(`state.members=[{id:5,name:'Camp',startDate:'2026-06-14',
  enrollments:[{sport:'Summer Camp',coachId:null,classes:7,price:415,durationLabel:'Custom',start:'2026-08-05'}],
  subscriptions:[
    {activity:'Summer Camp',totalClasses:7,amountPaid:400,durationLabel:'1 week',status:'active',start:'2026-06-14',end:'2026-06-18',invoiceNumber:'A'},
    {activity:'Summer Camp',totalClasses:22,amountPaid:1400,durationLabel:'1 month',status:'active',start:'2026-07-05',end:'2026-08-03',invoiceNumber:'B'},
    {activity:'Summer Camp',totalClasses:7,amountPaid:415,durationLabel:'Custom',status:'active',start:'2026-08-05',end:'2026-08-13',invoiceNumber:'C'}
  ]}];`);
// messy invoices: total 2912 (extra dup), only part paid
run(`state.invoices=[
  {id:1,ref:'X1',customerId:5,category:'Membership',activityType:'subscription',amount:1400,payments:[{amount:0}],lineItems:[{sport:'Summer Camp',price:1400,classes:22}]},
  {id:2,ref:'X2',customerId:5,category:'Membership',activityType:'subscription',amount:712,payments:[{amount:500}],lineItems:[{sport:'Summer Camp',price:712,classes:12}]},
  {id:3,ref:'A',customerId:5,category:'Membership',activityType:'subscription',amount:400,payments:[{amount:400}],lineItems:[{sport:'Summer Camp',price:400,classes:7}]},
  {id:4,ref:'C',customerId:5,category:'Membership',activityType:'subscription',amount:400,payments:[{amount:0}],lineItems:[{sport:'Summer Camp',price:400,classes:7}]}
];`);
run("render=function(){}; downloadBackup=function(){}; confirmSaved=function(){}; toast=function(){}; assertCloudWritable=function(){return true;}; viewMember=function(){};");
const totals = () => JSON.parse(run("(function(){var mi=state.invoices.filter(i=>i.customerId===5&&!i.deleted&&(i.category||'Membership')==='Membership'&&!i.switchCredit); var t=mi.reduce((a,i)=>a+invoiceTotal(i),0); var p=mi.reduce((a,i)=>a+invoicePaid(i),0); return JSON.stringify({total:Math.round(t),paid:Math.round(p),due:Math.round(Math.max(0,t-p)),n:mi.length});})()"));
ok('before: total 2912 · due > 0 (drifted)', (()=>{const b=totals(); return b.total===2912 && b.due>0;})());
run("globalThis.__cap=null; showModal=function(cfg){ globalThis.__cap=cfg; }; rebuildMemberFromProfile(5);");
ok('routes to the subs-rebuild modal', /Rebuild invoices from subscription history/.test(run("(__cap&&__cap.title)||''")));
run("var act=(__cap.actions||[]).find(function(a){return /Rebuild/.test(a.label)&&!/Cancel/.test(a.label);}); if(act) act.onclick();");
const a = totals();
ok('after: total = Σ packages (2215)', a.total === 2215);
ok('after: paid = total (all packages marked paid)', a.paid === 2215);
ok('after: due = 0', a.due === 0);
ok('after: one clean invoice per package (3)', a.n === 3);

R.done();
