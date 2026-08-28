// v6.536 — Member Money Panel (Phase 1). A clean per-member money view (window.moneyPanel) that reads
// existing data with NO migration/restructuring: authoritative Charged/Paid/Due header (member-level
// netted, always reconciles) + per-sport paid/price rows + one Collect action that appends a payment
// through the SAFE append-only recordPayment primitive. The switched-away sport is the one shown as owed
// (its remainder moved to the new sport), so untagged historical payments land on the sport they were for.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.536 · member money panel');
const src = H.readSrc();

R.section('source — the panel exists and reuses verified primitives');
R.ok('window.moneyPanel is defined', /window\.moneyPanel = function/.test(src));
R.ok('_memberMoneyRows helper is defined', /function _memberMoneyRows\(/.test(src));
R.ok('the header is authoritative (member-level netting)', /memberMembershipPaid\(/.test(src) && /memberOutstanding\(/.test(src));
R.ok('Collect routes through the SAFE append-only recordPayment', /window\._moneyCollect[\s\S]{0,1200}?recordPayment\(/.test(src));
R.ok('Collect NEVER rewrites/derives amountPaid itself (append-only)', !/_moneyCollect[\s\S]{0,1200}?\.amountPaid\s*=/.test(src));
R.ok('active sports are filled before switched-away ones', /fillOrder[\s\S]{0,120}?a\.switched/.test(src));
R.ok('the Installments/Collect buttons open the panel', (src.match(/moneyPanel\(\$\{/g) || []).length >= 3);
R.ok('the full price editor stays reachable as Edit prices', /editMemberPricing\(/.test(src));

R.section('runtime — a member with a switched-away sport reconciles + attributes correctly');
{
  const ctx = H.makeCtx({ today: '2026-08-28', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings={commissionBasis:'attendance'};
    state.coaches=[{id:1,name:'C',rate:30,role:'coach',active:true}];
    state.members=[{id:1,name:'M',expiryDate:'2026-12-01',status:'Active',
      subscriptions:[
        {activity:'Gymnastic',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',switchedAwayTo:'Taekwondo',invoiceNumber:'INV1'},
        {activity:'Taekwondo',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'INV1'},
        {activity:'Kick Boxing',coachId:1,totalClasses:8,start:'2026-08-01',status:'active',invoiceNumber:'INV1'}
      ]}];
    // one invoice, three sported lines; two payments — one TAGGED Taekwondo, one UNTAGGED (was really Kick Boxing)
    state.invoices=[{id:1,ref:'INV1',customerId:1,category:'Membership',date:'2026-08-01',month:'2026-08',
      amount:550,coachId:1,
      lineItems:[{sport:'Gymnastic',coachId:1,classes:8,price:140.63},{sport:'Taekwondo',coachId:1,classes:8,price:234.37},{sport:'Kick Boxing',coachId:1,classes:8,price:175}],
      payments:[{amount:234.37,date:'2026-08-02',month:'2026-08',sport:'Taekwondo'},{amount:175,date:'2026-08-05',month:'2026-08'}]}];
  `);
  const md = run(`_memberMoneyRows(state.members[0])`);
  R.ok('Charged = 550 (sum of sported lines)', Math.round(md.charged * 100) / 100 === 550);
  R.ok('Paid = 409.37 (deduped payments)', Math.round(md.paidTotal * 100) / 100 === 409.37);
  R.ok('Due = 140.63 (member-netted)', Math.round(md.due * 100) / 100 === 140.63);
  R.ok('header reconciles exactly: Charged = Paid + Due', Math.abs(md.charged - (md.paidTotal + md.due)) < 0.02);
  const gym = md.rows.find(r => r.sport === 'Gymnastic'), tk = md.rows.find(r => r.sport === 'Taekwondo'), kb = md.rows.find(r => r.sport === 'Kick Boxing');
  R.ok('the SWITCHED-AWAY sport (Gymnastic) is the one shown as owed', gym && Math.round(gym.remaining * 100) / 100 === 140.63 && gym.switched === true);
  R.ok('the tagged sport (Taekwondo) reads fully paid', tk && tk.remaining === 0);
  R.ok('the untagged payment filled the ACTIVE sport (Kick Boxing), not the switched one', kb && kb.remaining === 0);

  R.section('runtime — Collect appends a payment (no rows lost, no restructuring)');
  const before = run(`state.invoices[0].payments.length`);
  run(`window.moneyPanel=function(){}; window.toast=function(){}; currentRole=()=>'admin';
    document={getElementById:id=>({value:({'mp-amt':'140.63','mp-method':'cash','mp-date':'2026-08-28'})[id]})};`);
  run(`_moneyCollect(1)`);
  const after = run(`state.invoices[0].payments.length`);
  const md2 = run(`_memberMoneyRows(state.members[0])`);
  R.ok('a new payment row was APPENDED (not replaced)', after === before + 1);
  R.ok('the appended row is tagged to the owed sport (Gymnastic)', run(`state.invoices[0].payments[state.invoices[0].payments.length-1].sport`) === 'Gymnastic');
  R.ok('Due is now 0 and Gymnastic is settled', Math.round(md2.due * 100) / 100 === 0 && (md2.rows.find(r => r.sport === 'Gymnastic') || {}).remaining === 0);
  R.ok('every original payment survived (append-only, no data loss)', run(`state.invoices[0].payments.filter(p=>p.amount===234.37||p.amount===175).length`) === 2);
}

R.done();
