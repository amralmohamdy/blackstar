// v6.506 — Repair switched members. A same-sport coach switch could leave the new coach's classes in
// the PROFILE (enrollment) only, with no subscription or invoice line. This restores them FROM THE
// PROFILE, but ONLY when the member's existing payment already covers it (never bills anyone), and
// only ADDS records (idempotent). Mirrors Kordi: paid 825, invoice 554.17 → restore Karate/Zakaria.
const H = require('./qc-harness.js');
const R = H.reporter('v6.506 · repair switched members');
const run = (c, s) => H.vm.runInContext(s, c);
const src = H.readSrc();

// Kordi-like: profile has Karate/Zakaria (5/270.83) with NO active sub; paid 825 vs invoice 554.17.
function seed(ctx) {
  run(ctx, `
    state.coaches = [{id:14,name:'Iyad'},{id:1,name:'Abdel Salam'},{id:3,name:'Mostafa'},{id:99,name:'Zakaria'}];
    state.members = [{ id:70, name:'Kordi', startDate:'2026-07-29',
      enrollments:[
        { sport:'Kick Boxing', coachId:1, classes:10, price:416.67, start:'2026-07-29', validity:30 },
        { sport:'Karate', coachId:99, classes:5, price:270.83, start:'2026-08-06', validity:30 } ],
      subscriptions:[
        { activity:'Kick Boxing', coachId:14, totalClasses:2, amountPaid:83.33, status:'completed', start:'2026-07-29', end:'2026-08-28' },
        { activity:'Karate', coachId:3, totalClasses:1, amountPaid:54.17, status:'completed', switchedAwayTo:'Karate', start:'2026-08-06', end:'2026-09-05' },
        { activity:'Kick Boxing', coachId:1, totalClasses:10, amountPaid:416.67, status:'active', switchFunded:true, start:'2026-08-02', end:'2026-08-28' } ] }];
    state.invoices = [{ id:1, ref:'INV1', customerId:70, date:'2026-07-29', category:'Membership', activityType:'subscription',
      amount:554.17, amountPaid:825, payments:[{amount:500},{amount:325}],
      lineItems:[ {sport:'Kick Boxing',coachId:14,price:83.33,classes:2},
                  {sport:'Karate',coachId:3,price:54.17,classes:1},
                  {sport:'Kick Boxing',coachId:1,price:416.67,classes:10} ] }];
    window.save=function(){}; window.render=function(){}; save=window.render;
  `);
}

R.section('dry-run detects the divergence, does not mutate');
{
  const ctx = H.makeCtx({ today: '2026-08-16' }); seed(ctx);
  const rep = run(ctx, `JSON.stringify(repairSwitchedMembers({apply:false}))`);
  const r = JSON.parse(rep);
  R.ok('finds Karate/Zakaria to repair', r.repaired.length === 1 && r.repaired[0].sport === 'Karate' && r.repaired[0].price === 270.83, rep);
  R.ok('nothing skipped (payment covers it)', r.skipped.length === 0, rep);
  R.ok('dry-run did NOT add a subscription', run(ctx, `state.members[0].subscriptions.length`) === 3);
  R.ok('dry-run did NOT change the invoice amount', Math.abs(run(ctx, `state.invoices[0].amount`) - 554.17) < 0.01);
}

R.section('apply restores the sub + invoice line, invoice balances to paid');
{
  const ctx = H.makeCtx({ today: '2026-08-16' }); seed(ctx);
  run(ctx, `repairSwitchedMembers({apply:true})`);
  R.ok('a Karate/Zakaria ACTIVE subscription now exists', run(ctx, `state.members[0].subscriptions.some(s=>s.activity==='Karate'&&String(s.coachId)==='99'&&s.status==='active')`) === true);
  R.ok('a Karate/Zakaria invoice line was added', run(ctx, `state.invoices[0].lineItems.some(l=>l.sport==='Karate'&&String(l.coachId)==='99'&&l.price===270.83)`) === true);
  R.ok('invoice amount now equals what was paid (825) — balanced', Math.abs(run(ctx, `state.invoices[0].amount`) - 825) < 0.5);
  R.ok('the completed Mostafa Karate history is untouched', run(ctx, `state.members[0].subscriptions.some(s=>s.activity==='Karate'&&String(s.coachId)==='3'&&s.status==='completed')`) === true);
}

R.section('idempotent — a second apply changes nothing');
{
  const ctx = H.makeCtx({ today: '2026-08-16' }); seed(ctx);
  run(ctx, `repairSwitchedMembers({apply:true})`);
  const subsAfter1 = run(ctx, `state.members[0].subscriptions.length`);
  const rep2 = JSON.parse(run(ctx, `JSON.stringify(repairSwitchedMembers({apply:true}))`));
  R.ok('second run repairs 0', rep2.repaired.length === 0, JSON.stringify(rep2.repaired));
  R.ok('no duplicate subscription created', run(ctx, `state.members[0].subscriptions.length`) === subsAfter1);
}

R.section('SAFETY — a member without an overpayment is SKIPPED, never billed');
{
  const ctx = H.makeCtx({ today: '2026-08-16' });
  run(ctx, `
    state.coaches=[{id:99,name:'Zakaria'}];
    state.members=[{ id:80, name:'NoOverpay', startDate:'2026-08-01',
      enrollments:[{ sport:'Karate', coachId:99, classes:5, price:270, start:'2026-08-06', validity:30 }],
      subscriptions:[] }];
    state.invoices=[{ id:1, ref:'INV2', customerId:80, category:'Membership', activityType:'subscription', amount:0, amountPaid:0, lineItems:[] }];
  `);
  const rep = JSON.parse(run(ctx, `JSON.stringify(repairSwitchedMembers({apply:true}))`));
  R.ok('it is SKIPPED (no overpayment to cover it)', rep.skipped.length === 1 && rep.repaired.length === 0, JSON.stringify(rep));
  R.ok('no subscription was created for the unfunded member', run(ctx, `state.members[0].subscriptions.length`) === 0);
  R.ok('the invoice amount was NOT increased (no new bill)', run(ctx, `state.invoices[0].amount`) === 0);
}

R.section('source — admin-only tool wired into Invoice Integrity');
R.ok('a Repair-switched button exists on the integrity screen', /id="ic-switchrepair"/.test(src));
R.ok('it opens the repair preview tool', /#ic-switchrepair'\)\?\.addEventListener\('click', \(\) => window\.showSwitchRepairTool\(\)\)/.test(src));
R.ok('the tool is admin-gated', /showSwitchRepairTool = function[\s\S]{0,120}currentRole\(\) !== 'admin'/.test(src));
R.ok('apply downloads a backup first', /showSwitchRepairTool[\s\S]{0,4000}downloadBackup\(\)/.test(src));
R.ok('apply verifies the write in the cloud', /showSwitchRepairTool[\s\S]{0,4000}withCloudConfirm/.test(src));

R.done();
