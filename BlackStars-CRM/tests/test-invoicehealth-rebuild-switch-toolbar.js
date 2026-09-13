// v6.499 — (1) the red invoice-conflict popup offers "🔄 Rebuild from profile" as the primary one-click
// fix; (2) a "🔀 Switch sport / coach" button in the members selection toolbar opens the SAME switchSport
// flow (single member), so the attendance-based commission split is identical.
const H = require('./qc-harness.js');
const R = H.reporter('MEMBERS · invoice-health rebuild + switch-from-toolbar');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('invoice-health popup: one-click rebuild');
ok('rebuild-from-profile is a fix action for red/noinv', /if \(canFix && \(h\.status === 'red' \|\| h\.status === 'noinv'\)\)[\s\S]{0,600}rebuildMemberFromProfile\(m\.id\)/.test(src));
ok('the hint recommends Rebuild from profile', /Fastest fix: <b>🔄 Rebuild from profile<\/b>/.test(src));

R.section('switch sport / coach from the selection toolbar');
ok('the toolbar has a switch button', /id="members-bulk-switch"/.test(src));
ok('it shows only when exactly one member is selected', /const swBtn = \$\('#members-bulk-switch'\);\s*\n\s*if \(swBtn\) swBtn\.style\.display = selected\.size === 1 \? '' : 'none';/.test(src));
ok('it opens the SAME switchSport flow (attendance-based split)', /#members-bulk-switch'\)\?\.addEventListener\('click'[\s\S]{0,320}switchSport\(list\[0\]\.id\)/.test(src));
ok('admin-only guard on the toolbar switch', /Only admins can switch a member/.test(src));

R.section('runtime: the health popup exposes the rebuild action');
const ctx = H.makeCtx({ today: '2026-08-13' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[]; state.settings={};");
// a camp member whose invoices drifted from the subs (paid subs, mismatched invoice) → red health
run(`state.members=[{id:5,name:'C',startDate:'2026-06-14',enrollments:[{sport:'Summer Camp',coachId:null,classes:7,price:415,durationLabel:'Custom',start:'2026-08-05'}],subscriptions:[{activity:'Summer Camp',totalClasses:7,amountPaid:400,durationLabel:'1 week',status:'active',start:'2026-06-14',end:'2026-06-18',invoiceNumber:'A'},{activity:'Summer Camp',totalClasses:7,amountPaid:415,durationLabel:'Custom',status:'active',start:'2026-08-05',end:'2026-08-13',invoiceNumber:'C'}]}];`);
run("state.invoices=[{id:1,ref:'A',customerId:5,date:'2026-06-14',category:'Membership',activityType:'subscription',amount:712,payments:[{amount:415}],lineItems:[{sport:'Summer Camp',price:712,classes:7}]}];");
run("globalThis.__cap=null; showModal=function(cfg){ globalThis.__cap=cfg; }; showMemberInvoiceHealth(5);");
ok('the red popup includes a Rebuild-from-profile action', /Rebuild from profile/.test(run("JSON.stringify((__cap.actions||[]).map(function(a){return a.label;}))")));

R.done();
