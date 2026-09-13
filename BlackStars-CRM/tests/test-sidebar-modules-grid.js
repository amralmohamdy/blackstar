// v6.424 — (1) sidebar reorg: Birthdays+Portal Onboarding → "Engagement"; Coach Advice +
// Advice & Articles → "Advice"; Products + Product Sales → "Shop". Renewal Potential and
// Duplicate Invoices are disabled (hidden). (2) Members: grid is the DEFAULT view, 5 cards/row.
const H = require('./qc-harness.js');
const R = H.reporter('SIDEBAR MODULES + MEMBERS GRID');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('the six pages moved into their new module sections');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('Birthdays → Engagement', run(ctx, `ROUTES.birthdays.section`) === 'Engagement');
  R.ok('Portal Onboarding → Engagement', run(ctx, `ROUTES.onboarding.section`) === 'Engagement');
  R.ok('Coach Advice → Advice', run(ctx, `ROUTES.advice.section`) === 'Advice');
  R.ok('Advice & Articles → Advice', run(ctx, `ROUTES.posts.section`) === 'Advice');
  R.ok('Products → Shop', run(ctx, `ROUTES.products.section`) === 'Shop');
  R.ok('Product Sales → Shop', run(ctx, `ROUTES.productsales.section`) === 'Shop');
}

R.section('Renewal Potential + Duplicate Invoices are disabled');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('renewaldetail is hidden', run(ctx, `!!ROUTES.renewaldetail.hidden`) === true);
  R.ok('dupinvoices is hidden', run(ctx, `!!ROUTES.dupinvoices.hidden`) === true);
}

R.section('the new sections appear in the sidebar order (source)');
{
  const src = H.readSrc();
  R.ok('sections array — primary set first, then the "more" set', /'Membership','Attendance','Activities','Finance','Shop','Summer Camp','Engagement','Advice','Team & Sports','Insights','System'/.test(src));
  R.ok('each new section has an Arabic label', /Engagement: 'التواصل'/.test(src) && /Advice: 'النصائح'/.test(src) && /Shop: 'المتجر'/.test(src));
}

R.section('admin nav now renders the new module headers, not the disabled pages');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const nav = run(ctx, `(function(){
    const sections = ['Main','Membership','Engagement','Activities','Advice','Summer Camp','Team & Sports','Finance','Shop','Insights','System'];
    const out = {};
    for (const section of sections) for (const [key, route] of Object.entries(ROUTES)) {
      if (route.section !== section || route.hidden) continue;
      if (!roleCanAccess('admin', key)) continue;
      (out[section] = out[section] || []).push(key);
    }
    return out;
  })()`);
  R.ok('Engagement holds birthdays + onboarding', (nav.Engagement || []).includes('birthdays') && (nav.Engagement || []).includes('onboarding'), nav.Engagement);
  R.ok('Advice holds advice + posts', (nav.Advice || []).includes('advice') && (nav.Advice || []).includes('posts'), nav.Advice);
  R.ok('Shop holds products + productsales', (nav.Shop || []).includes('products') && (nav.Shop || []).includes('productsales'), nav.Shop);
  R.ok('renewaldetail is NOT in the nav (disabled)', !Object.values(nav).flat().includes('renewaldetail'));
  R.ok('dupinvoices is NOT in the nav (disabled)', !Object.values(nav).flat().includes('dupinvoices'));
}

R.section('Members: grid is the default view, 5 cards per row');
{
  const src = H.readSrc();
  R.ok('default view is grid unless the user chose list', /getItem\('bs-members-view'\) === 'list' \? 'list' : 'grid'/.test(src));
  R.ok('the fallback (no localStorage) is also grid', /catch \(_\) \{ return 'grid'; \}/.test(src));
  R.ok('the grid uses exactly 5 columns', /id="members-grid"[^>]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/.test(src));
  // render sanity: the Members screen still builds.
  R.ok('Members screen renders', H.renderScreen(H.seed(H.makeCtx({ role: 'admin' })), 'members').ok);
}

R.done();
