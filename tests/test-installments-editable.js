// v6.497 — the Installments screen was simplified + made editable (user request): it shows ONLY the
// CURRENT (latest) invoice, the PRICE is editable inline (syncs the invoice line + total + enrollment,
// NOT the paid side), a 🔄 Rebuild-from-profile button sits at the top, and older invoices are hidden.
// Verified: editing 712→415 on the current invoice sets its amount to 415, leaves the older invoice at
// 400 and the paid amount (415) untouched → Balance becomes 0.
const H = require('./qc-harness.js');
const R = H.reporter('INSTALLMENTS · current-invoice only + editable price');
const ok = (n, c) => R.ok(n, c);
const src = H.readSrc();

R.section('screen structure');
ok('shows only the current invoice (older ones deleted from the map)', /if \(_allInvKeys\.length > 1\) \{[\s\S]{0,400}for \(const k of \[\.\.\.groups\.keys\(\)\]\) if \(!keep\.has\(k\)\) groups\.delete\(k\);/.test(src));
ok('counts the hidden older invoices', /const _hiddenInvoiceCount = _allInvKeys\.length -/.test(src));
ok('renders an editable price input', /class="pri-price" data-idx="\$\{r\.idx\}"/.test(src));
ok('has a Rebuild-from-profile button on the screen', /onclick="closeModal\(\);rebuildMemberFromProfile\(\$\{m\.id\}\)"/.test(src));
ok('price-apply only touches DISPLAYED groups’ rows', /const rowVals = \[\.\.\.groups\.values\(\)\]\.flatMap\(g => g\.rows\)\.map/.test(src));
ok('a changed price updates the invoice line + total', /li\.price = newP;[\s\S]{0,220}inv\.amount = \(typeof invoiceTotal/.test(src));
ok('the paid side is NOT changed by a price edit (only payments ledger)', /We do NOT touch what was PAID/.test(src));

R.section('runtime: edit price 712→415 on the current invoice');
const ctx = H.makeCtx({ today: '2026-08-13' });
const run = (c) => H.vm.runInContext(c, ctx);
run("state.coaches=[];");
run(`state.members=[{id:800,name:'C',startDate:'2026-06-14',enrollments:[{sport:'Summer Camp',coachId:null,classes:7,price:415,durationLabel:'Custom',start:'2026-08-05'}],subscriptions:[{activity:'Summer Camp',totalClasses:7,amountPaid:400,durationLabel:'1 week',status:'active',start:'2026-06-14',end:'2026-06-18',invoiceNumber:'OLD'},{activity:'Summer Camp',totalClasses:7,amountPaid:415,durationLabel:'Custom',status:'active',start:'2026-08-05',end:'2026-08-13',invoiceNumber:'CUR'}]}];`);
run(`state.invoices=[{id:1,ref:'OLD',customerId:800,date:'2026-06-14',category:'Membership',activityType:'subscription',amount:400,payments:[{amount:400,date:'2026-06-14',method:'cash'}],lineItems:[{sport:'Summer Camp',price:400,classes:7}]},{id:2,ref:'CUR',customerId:800,date:'2026-08-05',category:'Membership',activityType:'subscription',amount:712,payments:[{amount:415,date:'2026-08-05',method:'fawran'}],lineItems:[{sport:'Summer Camp',price:712,classes:7}]}];`);
run("render=function(){}; downloadBackup=function(){}; confirmSaved=function(){}; toast=function(){}; save=function(){}; saveConfirmed=function(){return {then:function(){}}}; assertCloudWritable=function(){return true;};");
run("var __qs=document.querySelector.bind(document); document.querySelector=function(sel){ if(sel && sel.indexOf('.pri-price')===0) return {value:'415'}; return __qs(sel); };");
run("globalThis.__mods=[]; showModal=function(cfg){ globalThis.__mods.push(cfg); }; editMemberPricing(800);");
ok('current invoice (CUR) is shown', /CUR/.test(run("(__mods[0]&&__mods[0].body)||''")));
ok('older invoice (OLD) is hidden', !/>OLD</.test(run("(__mods[0]&&__mods[0].body)||''")));
run("var s1=(__mods[0].actions||[]).find(function(a){return /Save/.test(a.label)&&!/Cancel/.test(a.label);}); if(s1) s1.onclick(); var m2=__mods[__mods.length-1]; var c2=(m2.actions||[]).find(function(a){return /Confirm/.test(a.label);}); if(c2) c2.onclick();");
ok('current invoice amount edited to 415', run("(state.invoices.find(i=>i.ref==='CUR')||{}).amount") === 415);
ok('older invoice untouched (400)', run("(state.invoices.find(i=>i.ref==='OLD')||{}).amount") === 400);
ok('paid amount unchanged (415)', run("(function(){var i=state.invoices.find(x=>x.ref==='CUR'); return (i.payments||[]).reduce((s,p)=>s+(+p.amount||0),0);})()") === 415);

R.done();
