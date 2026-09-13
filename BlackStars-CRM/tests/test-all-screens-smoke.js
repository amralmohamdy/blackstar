// QC SMOKE: render EVERY screen in the app against a realistic club dataset, as each role.
// Before this existed only 8 of 67 screens had ever been rendered by a test — a screen could
// throw on load and nothing would know until a user hit it. A crash here is a real defect.
const fs = require('fs'), path = require('path');
const H = require('./qc-harness.js');

const pagesSrc = fs.readFileSync(path.join(H.DIR, 'pages.js'), 'utf8');
const screens = [...new Set((pagesSrc.match(/^PAGES\.([a-zA-Z]+)/gm) || []).map(s => s.replace('PAGES.', '')))].sort();

const R = H.reporter('ALL-SCREENS SMOKE');

console.log(`rendering ${screens.length} screens as ADMIN:`);
const crashed = [];
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  if (ctx.__loadError) { R.ok('app sources load cleanly', false, ctx.__loadError); }
  else R.ok('app sources load cleanly', true);
  for (const s of screens) {
    const out = H.renderScreen(ctx, s);
    if (!out.ok) crashed.push({ screen: s, error: out.error, stack: out.stack });
  }
  R.ok(`no screen throws while rendering (${screens.length} screens)`, crashed.length === 0,
    crashed.map(c => `${c.screen}: ${c.error}`));
  if (crashed.length) crashed.forEach(c => console.log(`      ⤷ ${c.screen} — ${c.error}\n         ${c.stack || ''}`));
}

console.log('\nevery screen produces visible output (not a blank page):');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const blank = [];
  for (const s of screens) {
    const out = H.renderScreen(ctx, s);
    if (out.ok && (!out.html || out.html.replace(/<[^>]*>/g, '').trim().length < 3)) blank.push(s);
  }
  R.ok('no screen renders empty', blank.length === 0, blank);
}

console.log('\nrendering as RECEPTIONIST (role gating must not crash):');
{
  const ctx = H.seed(H.makeCtx({ role: 'receptionist' }));
  const bad = [];
  for (const s of screens) { const o = H.renderScreen(ctx, s); if (!o.ok) bad.push(`${s}: ${o.error}`); }
  R.ok('no screen throws for reception', bad.length === 0, bad);
}

console.log('\nrendering as COACH (the most restricted role):');
{
  const ctx = H.seed(H.makeCtx({ role: 'coach' }));
  const bad = [];
  for (const s of screens) { const o = H.renderScreen(ctx, s); if (!o.ok) bad.push(`${s}: ${o.error}`); }
  R.ok('no screen throws for a coach', bad.length === 0, bad);
}

console.log('\nEMPTY DATABASE — a brand-new club must not crash any screen:');
{
  const ctx = H.makeCtx({ role: 'admin' });
  H.vm.runInContext(`
    state.members=[];state.invoices=[];state.expenses=[];state.salaries=[];state.sales=[];
    state.products=[];state.rentals=[];state.rentalCustomers=[];state.coaches=[];state.schedule=[];
    state.swimGroups=[];state.trials=[];state.families=[];state.drivers=[];state.notes=[];
    state.posts=[];state.advices=[];state.auditLog=[];state.cashCounts=[];state.membershipTransfers=[];
    state.settings=state.settings||{};state.session={role:'admin'};
  `, ctx);
  const bad = [];
  for (const s of screens) { const o = H.renderScreen(ctx, s); if (!o.ok) bad.push(`${s}: ${o.error}`); }
  R.ok('no screen throws on an empty database', bad.length === 0, bad);
}

console.log('\nrendering twice in a row is stable (no state corrupted by a first render):');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const bad = [];
  for (const s of screens) {
    H.renderScreen(ctx, s);
    const second = H.renderScreen(ctx, s);
    if (!second.ok) bad.push(`${s}: ${second.error}`);
  }
  R.ok('every screen survives a second render', bad.length === 0, bad);
}

console.log('\nthe seeded club data itself is coherent (guards the fixture):');
{
  const ctx = H.seed(H.makeCtx());
  const q = (expr) => H.vm.runInContext(expr, ctx);
  R.ok('members seeded', q('state.members.length') === 5, q('state.members.length'));
  R.ok('an archived member is present (exclusion tests need one)', q('state.members.filter(m=>m.deleted).length') === 1);
  R.ok('a part-paid invoice is present', q('state.invoices.some(i=>i.amountPaid>0 && i.amountPaid<i.amount)'));
  R.ok('a legacy invoice with no payment ledger is present', q('state.invoices.some(i=>!i.payments && !i.deleted)'));
  R.ok('a soft-deleted invoice is present', q('state.invoices.some(i=>i.deleted)'));
  R.ok('a member with a SECONDARY coach is present', q('state.members.some(m=>m.coachId==null && (m.enrollments||[]).some(e=>e.coachId!=null))'));
}

R.done();
