// v6.425 — the Families screen gained a GRID view (compact summary cards) as the default,
// with a toggle back to the detailed expandable LIST. Members link via m.familyId.
const H = require('./qc-harness.js');
const R = H.reporter('FAMILIES · grid view');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Coach', active:'Y' }];
    state.families = [{ id:11, name:'Al-Marri', contactPhone:'+97450007611' }];
    state.members = [
      { id:501, name:'Rashed Al-Marri', familyId:11, phone:'+97450007611', sport:'Boxing', coachId:1, status:'Active', expiryDate:'2026-08-30',
        enrollments:[{ sport:'Boxing', coachId:1, classes:8, price:400 }] },
      { id:502, name:'Noora Al-Marri', familyId:11, phone:'+97450007612', sport:'Gymnastic', coachId:1, status:'Active', expiryDate:'2026-08-30',
        enrollments:[{ sport:'Gymnastic', coachId:1, classes:8, price:300 }] },
    ];
    state.invoices = [];
  `);
}

R.section('grid is the default layout with compact family cards');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `localStorage.getItem = () => null;`);   // no stored preference → grid
  const out = H.renderScreen(ctx, 'families');
  R.ok('families screen renders', out.ok, out.error);
  const html = out.html || '';
  R.ok('the list container is a grid', /id="fam-list" style="display:grid;grid-template-columns:repeat\(auto-fill,minmax\(240px,1fr\)\)/.test(html));
  R.ok('a compact grid card is rendered', /class="card fam-card fam-grid-card"/.test(html));
  R.ok('the family name shows', /Al-Marri/.test(html));
  R.ok('the compact card has a View action', /viewFamily\(11\)/.test(html));
  R.ok('grid mode hides the expand/collapse-all controls', !/id="fam-expand-all"/.test(html));
  R.ok('a grid⇄list toggle is present', /id="fam-view-toggle"/.test(html));
}

R.section('an explicit LIST preference shows the detailed expandable cards');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `localStorage.getItem = (k) => k === 'bs-families-view' ? 'list' : null;`);
  const out = H.renderScreen(ctx, 'families');
  R.ok('families screen renders in list mode', out.ok, out.error);
  const html = out.html || '';
  R.ok('list mode is NOT a grid container', !/id="fam-list" style="display:grid/.test(html));
  R.ok('list mode restores the expand-all control', /id="fam-expand-all"/.test(html));
  R.ok('list mode keeps the per-member table (Owes column)', /Owes|مستحق/.test(html));
}

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('famView defaults to grid unless list is chosen', /localStorage\.getItem\('bs-families-view'\) === 'list' \? 'list' : 'grid'/.test(src));
  R.ok('a compactCard builder exists', /const compactCard = \(f, members\) =>/.test(src));
  R.ok('the toggle persists + re-renders', /fam-view-toggle[\s\S]{0,220}localStorage\.setItem\('bs-families-view', famView\)[\s\S]{0,60}PAGES\.families\(main\)/.test(src));
}

R.done();
