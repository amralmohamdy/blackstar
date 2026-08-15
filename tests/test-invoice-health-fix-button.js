// v6.416 — FIX FROM THE INVOICE-HEALTH BADGE. The Members-table 🧾 badge popup
// (showMemberInvoiceHealth) used to only explain the issue + link to the Invoice
// Integrity screen. It now offers the fix in place: a RED (mismatch) badge → a
// "Fix invoice" button that opens editMemberPricing (adds a missing sport line,
// corrects price, re-aligns total on Save); a NO-INVOICE badge → a "Generate
// invoice" button that calls generateInvoiceForMember. Admin/receptionist only.
const H = require('./qc-harness.js');
const R = H.reporter('INVOICE HEALTH · fix from the badge popup');
const run = (c, s) => H.vm.runInContext(s, c);

// Member with TWO enrolled sports but an invoice that only lists ONE (Karate missing) → RED health.
function seedRed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Mohammed', active:'Y' }, { id:2, name:'Mostafa', active:'Y' }];
    state.members = [{ id:5001, name:'Amjad Hamdan', phone:'+97470512674', sport:'Football', coachId:1,
      startDate:'2026-07-06', expiryDate:'2026-08-05',
      enrollments:[
        { sport:'Football', coachId:1, classes:8, price:425, start:'2026-07-06', validity:30 },
        { sport:'Karate',   coachId:2, classes:8, price:425, start:'2026-07-06', validity:30 },
      ],
      subscriptions:[
        { id:'subF', activity:'Football', coachId:1, start:'2026-07-06', end:'2026-08-05', totalClasses:8, attendedClasses:3, status:'active' },
      ] }];
    state.invoices = [{ id:9001, ref:'INV-F', customerId:5001, date:'2026-07-06', month:'2026-07',
      category:'Membership', sport:'Football', amount:425, coachId:1,
      lineItems:[{ sport:'Football', coachId:1, classes:8, price:425 }] }];
  `);
}

// Member enrolled but with NO membership invoice at all → NO-INVOICE health.
function seedNoInv(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Mohammed', active:'Y' }];
    state.members = [{ id:5002, name:'Nour', sport:'Football', coachId:1, startDate:'2026-07-06',
      enrollments:[{ sport:'Football', coachId:1, classes:8, price:425, start:'2026-07-06', validity:30 }],
      subscriptions:[] }];
    state.invoices = [];
  `);
}

R.section('the fixtures produce the health states we target');
{
  const ctx = H.makeCtx({ role: 'admin' }); seedRed(ctx);
  const st = run(ctx, `memberInvoiceHealth(state.members[0]).status`);
  R.ok('the missing-Karate member reads RED', st === 'red', st);
  R.ok('the health names the uninvoiced sport', run(ctx, `memberInvoiceHealth(state.members[0]).reasons.join(' ')`).indexOf('Karate') !== -1);
}
{
  const ctx = H.makeCtx({ role: 'admin' }); seedNoInv(ctx);
  const st = run(ctx, `memberInvoiceHealth(state.members[0]).status`);
  R.ok('the un-invoiced member reads noinv', st === 'noinv', st);
}

R.section('the RED popup fix opens pricing, whose Save adds the missing sport to the invoice');
{
  const ctx = H.makeCtx({ role: 'admin' }); seedRed(ctx);
  // The popup's Fix button routes to editMemberPricing; replay what that panel does on Save:
  // a brand-new sport attaches its line to the most recent membership invoice. Prove the invoice
  // CAN carry the Karate line (the pre-condition for the fix to turn the badge green).
  const before = run(ctx, `memberInvoiceHealth(state.members[0]).status`);
  run(ctx, `(function(){
    const inv = state.invoices.find(i=>i.id===9001);
    inv.lineItems.push({ sport:'Karate', coachId:2, classes:8, price:425 });
    inv.amount = inv.lineItems.reduce((s,li)=>s+(li.price||0),0);
  })()`);
  const after = run(ctx, `memberInvoiceHealth(state.members[0]).status`);
  R.ok('was red before the line was added', before === 'red');
  R.ok('goes green once Karate + the corrected total are on the invoice', after === 'green', after);
}

R.section('the NO-INVOICE popup fix generates the latest invoice from enrolments');
{
  const ctx = H.makeCtx({ role: 'admin' }); seedNoInv(ctx);
  run(ctx, `window.save = function(){}; window.stampUpdate = window.stampUpdate || function(){};`);
  const r = run(ctx, `generateInvoiceForMember(5002)`);
  R.ok('an invoice is created', r && r.created === true, r);
  R.ok('it totals the enrolled price (425)', r && Math.round(r.invoice.amount) === 425, r && r.invoice.amount);
  R.ok('the member now reads green', run(ctx, `memberInvoiceHealth(state.members[0]).status`) === 'green');
}

R.section('the popup wires the fix actions + gates them to admin/receptionist (source)');
{
  const src = H.readSrc();
  R.ok('a Generate-invoice action calls generateInvoiceForMember', /generateInvoiceForMember\(m\.id\)/.test(src));
  R.ok('a Fix-invoice action opens editMemberPricing', /editMemberPricing\(m\.id\)/.test(src));
  R.ok('the fix is gated to admin/receptionist', /const canFix = \(currentRole\(\) === 'admin' \|\| currentRole\(\) === 'receptionist'\);/.test(src));
  R.ok('the RED case offers a fix (Rebuild from profile + Edit pricing) — v6.499', /h\.status === 'red' \|\| h\.status === 'noinv'[\s\S]{0,600}rebuildMemberFromProfile/.test(src) && /Edit pricing/.test(src));
  R.ok('the noinv case offers Generate invoice', /h\.status === 'noinv'[\s\S]{0,200}Generate invoice/.test(src));
}

R.section('a NON-privileged viewer gets NO fix button');
{
  const src = H.readSrc();
  // The fixActions array only fills when canFix; a coach/member role must see just Open/Close.
  R.ok('fixActions is guarded by canFix (v6.499)', /if \(canFix && \(h\.status === 'red' \|\| h\.status === 'noinv'\)\)/.test(src));
}

R.done();
