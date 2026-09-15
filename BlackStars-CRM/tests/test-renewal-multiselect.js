// v6.421 — SMART MULTI-SELECT RENEWAL. A member in 2+ sports now renews via a checkbox
// list: tick which sports, each at its OWN editable amount (never bundled), one combined
// receipt with a per-sport line item. Amount is prefilled SMART — from the last Membership
// invoice LINE for that sport — so a contaminated enrolment price (e.g. a 100 product typed
// into the sport price) doesn't carry forward. Single-sport members keep the classic modal.
const H = require('./qc-harness.js');
const R = H.reporter('RENEWAL · smart multi-select');
const run = (c, s) => H.vm.runInContext(s, c);

// Football: enrolment price is a CONTAMINATED 750, but the real membership invoice LINE is 650.
// Karate: 425. Two sports → the multi-select path.
function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.settings = state.settings || {};
    state.coaches = [{ id:1, name:'Abdel', active:'Y' }, { id:2, name:'Mostafa', active:'Y' }];
    state.members = [{ id:9100, name:'Amjad', phone:'+9740000', startDate:'2026-07-06', expiryDate:'2026-08-05',
      enrollments:[
        { sport:'Football', coachId:1, classes:8, price:750 },   // contaminated (650 + a 100 product)
        { sport:'Karate',   coachId:2, classes:8, price:425 },
      ],
      subscriptions:[
        { _sid:'f1', activity:'Football', coachId:1, start:'2026-07-06', end:'2026-08-05', totalClasses:8, attendedClasses:3, status:'active' },
        { _sid:'k1', activity:'Karate',   coachId:2, start:'2026-07-06', end:'2026-08-05', totalClasses:8, attendedClasses:1, status:'active' },
      ],
      renewals:[] }];
    state.invoices = [
      { id:7001, ref:'INV-F', customerId:9100, date:'2026-07-06', month:'2026-07', category:'Membership', sport:'Football', amount:650,
        lineItems:[{ sport:'Football', coachId:1, classes:8, price:650 }] },   // the TRUE membership charge = 650
      { id:7002, ref:'INV-K', customerId:9100, date:'2026-07-06', month:'2026-07', category:'Membership', sport:'Karate', amount:425,
        lineItems:[{ sport:'Karate', coachId:2, classes:8, price:425 }] },
      { id:7003, ref:'INV-P', customerId:9100, date:'2026-07-06', month:'2026-07', category:'Product', amount:100 },   // the product, separate
    ];
    // Stub the surfaces the Save handler touches so the money math runs deterministically.
    window.showModal = (cfg) => { window.__modal = cfg; };
    window.confirm = () => true; window.render = () => {};
    window.assertCloudWritable = () => true;
    window.withCloudConfirm = () => Promise.resolve({ ok:true });
  `);
}

const openMulti = (ctx) => run(ctx, `window.__modal=null; addRenewal(9100); window.__modal ? 'ok' : 'no-modal'`);
const setInputs = (ctx, obj) => run(ctx, Object.entries(obj).map(([k, v]) =>
  (typeof v === 'boolean') ? `document.getElementById('${k}').checked=${v};` : `document.getElementById('${k}').value=${JSON.stringify(String(v))};`).join(''));
const clickSave = (ctx) => run(ctx, `(function(){ const b = window.__modal.actions.find(a=>/Save Renewal/.test(a.label)); b.onclick(); return true; })()`);

R.section('a 2-sport member routes to the multi-select modal with SMART per-sport prices');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  R.ok('addRenewal opens the multi-select modal (not the single one)', openMulti(ctx) === 'ok');
  const body = run(ctx, `window.__modal.body`);
  R.ok('the modal is the multi-select ("Which sports to renew?")', /Which sports to renew/.test(body));
  R.ok('Football prefills the TRUE membership price 650 (from the invoice line), NOT the contaminated 750', /value="650"/.test(body) && !/value="750"/.test(body), body.match(/value="\d+"/g));
  R.ok('Karate prefills 425', /value="425"/.test(body));
}

R.section('ticking BOTH sports → one combined invoice with a per-sport line each');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx); openMulti(ctx);
  setInputs(ctx, { 'rnm-start':'2026-09-01', 'rnm-validity':'30', 'rnm-status':'active', 'rnm-adjust':true,
    'rnm-pick-0':true, 'rnm-amt-0':'650', 'rnm-cls-0':'8', 'rnm-pick-1':true, 'rnm-amt-1':'425', 'rnm-cls-1':'8' });
  const invBefore = run(ctx, `state.invoices.length`);
  clickSave(ctx);
  R.ok('exactly ONE new invoice was created (combined)', run(ctx, `state.invoices.length`) === invBefore + 1);
  const inv = run(ctx, `state.invoices[state.invoices.length-1]`);
  R.ok('the combined invoice totals 650 + 425 = 1075', inv.amount === 1075, inv.amount);
  R.ok('it has a line item PER sport (2 lines)', Array.isArray(inv.lineItems) && inv.lineItems.length === 2, inv.lineItems);
  R.ok('each line keeps its own coach (commission splits)', inv.lineItems.find(l=>l.sport==='Football').coachId===1 && inv.lineItems.find(l=>l.sport==='Karate').coachId===2);
  R.ok('two new subscriptions were added (one per sport) starting 2026-09-01',
    run(ctx, `state.members[0].subscriptions.filter(s=>s.start==='2026-09-01').map(s=>s.activity).sort().join()`) === 'Football,Karate');
  R.ok('member expiry advanced to the renewal end', run(ctx, `state.members[0].expiryDate`) >= '2026-09-30', run(ctx, `state.members[0].expiryDate`));
}

R.section('UNTICKING a sport renews ONLY the selected one (nothing bundled)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx); openMulti(ctx);
  setInputs(ctx, { 'rnm-start':'2026-09-01', 'rnm-validity':'30', 'rnm-status':'active', 'rnm-adjust':true,
    'rnm-pick-0':true, 'rnm-amt-0':'650', 'rnm-cls-0':'8', 'rnm-pick-1':false, 'rnm-amt-1':'425', 'rnm-cls-1':'8' });
  clickSave(ctx);
  const inv = run(ctx, `state.invoices[state.invoices.length-1]`);
  R.ok('only Football is on the invoice (Karate unticked)', inv.amount === 650 && inv.lineItems.length === 1 && inv.lineItems[0].sport === 'Football', inv);
  R.ok('only ONE new subscription (Football) was added', run(ctx, `state.members[0].subscriptions.filter(s=>s.start==='2026-09-01').map(s=>s.activity).join()`) === 'Football');
}

R.section('editing a per-sport amount is honored (admin can correct 750→650 here too)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx); openMulti(ctx);
  setInputs(ctx, { 'rnm-start':'2026-09-01', 'rnm-validity':'30', 'rnm-status':'active', 'rnm-adjust':false,
    'rnm-pick-0':true, 'rnm-amt-0':'600', 'rnm-cls-0':'8', 'rnm-pick-1':false, 'rnm-amt-1':'0', 'rnm-cls-1':'0' });
  clickSave(ctx);
  const inv = run(ctx, `state.invoices[state.invoices.length-1]`);
  R.ok('the typed 600 (not the 650 prefill) is what gets billed', inv.amount === 600, inv.amount);
}

R.section('a SINGLE-sport member still uses the classic modal (no regression)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `state.members[0].enrollments = [state.members[0].enrollments[0]]; state.members[0].subscriptions = [state.members[0].subscriptions[0]];`);
  run(ctx, `window.__modal=null; addRenewal(9100);`);
  const body = run(ctx, `window.__modal.body`);
  R.ok('single-sport opens the classic modal (has the rn-amount field, not rnm-*)', /id="rn-amount"/.test(body) && !/Which sports to renew/.test(body));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('addRenewalMulti is defined', /window\.addRenewalMulti = function/.test(src));
  R.ok('addRenewal branches to it for 2+ sports', /enrolledUnique\.length > 1 && typeof window\.addRenewalMulti === 'function'\) \{ return window\.addRenewalMulti/.test(src));
  R.ok('the combined invoice carries per-sport lineItems', /lineItems: invLines/.test(src));
  R.ok('smart price reads the membership invoice LINE for the sport', /const smartPrice = \(sp, fallback\)/.test(src));
}

R.done();
