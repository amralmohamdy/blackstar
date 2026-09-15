// v6.430 — (1) the notification bell is now a Facebook-style floating button pinned to the
// top-right corner of the viewport (on <body>), with a fully inline-styled dropdown (the app
// has no .notif-panel CSS rule). (2) The Expiring screen dropped the "Money Due" KPI card and
// lays the remaining bucket cards out in a single row.
const H = require('./qc-harness.js');
const R = H.reporter('NOTIF BELL corner + EXPIRING KPIs one row');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('the notification bell floats in the top-right corner');
{
  const src = H.readSrc('app.js');
  R.ok('the bell wrap is fixed to the top-right corner', /id: 'bs-notif-float'[\s\S]{0,120}position:fixed;top:12px;right:16px/.test(src));
  R.ok('the bell is a circular floating button with a shadow', /width:42px;height:42px;border-radius:50%[\s\S]{0,80}box-shadow/.test(src));
  R.ok('it is mounted on <body> (so no sidebar ancestor affects it)', /document\.body\.append\(notifWrap\)/.test(src));
  R.ok('a stale float bell is removed first (no duplicates)', /getElementById\('bs-notif-float'\)\?\.remove\(\)/.test(src));
  R.ok('the dropdown panel is inline-styled (opens below, right-aligned)', /panel\.style\.cssText = `position:absolute;top:calc\(100% \+ 8px\)/.test(src));
}

R.section('the Expiring screen: no Money Due card, single-row KPIs');
{
  const ctx = H.makeCtx({ role: 'admin' });
  run(ctx, `state.user={role:'admin'};state.session={role:'admin'};
    state.members=[{id:1,name:'A',sport:'Boxing',coachId:1,status:'Active',expiryDate:'2026-08-02'}];
    state.invoices=[]; state.coaches=[{id:1,name:'C',active:'Y'}];`);
  const out = H.renderScreen(ctx, 'expiring');
  R.ok('expiring renders', out.ok, out.error);
  const html = out.html || '';
  R.ok('the "Money due (from these members)" KPI card is GONE', !/Money due \(from these members\)/.test(html));
  R.ok('the KPI grid is forced into a single row', /class="kpi-grid mb-3" style="display:grid;grid-auto-flow:column/.test(html));
  R.ok('the bucket cards remain (Already Expired / Completed / Potential Revenue)', /Already Expired/.test(html) && /Completed/.test(html) && /Potential Revenue/.test(html));
}

R.section('source: the Money-due block was removed from PAGES.expiring');
{
  const src = H.readSrc();
  R.ok('no Money-due IIFE remains in the expiring KPIs', !/Money due \(from these members\)/.test(src));
}

R.done();
