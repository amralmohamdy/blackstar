// v6.607 — the Members-screen filter dropdowns are searchable. Sport + Coach already had a type-to-
// search box; this adds the SAME box to the Nationality and Enroll-month menus (long lists). The
// shared wireMultiFilter auto-wires any menu that contains .mf2-search + .mf2-empty.
const H = require('./qc-harness.js');
const R = H.reporter('v6.607 · members filter search');

R.section('render: nationality + enroll-month menus have a search box');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin', today: '2026-07-24' }));
  const r = H.renderScreen(ctx, 'members');
  const html = r.html || '';
  R.ok('members screen renders', r.ok, r.error);
  const natMenu = (html.match(/id="filter-nat-menu"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  const emoMenu = (html.match(/id="filter-emonth-menu"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
  R.ok('nationality menu has a mf2-search box', /id="filter-nat-menu"[\s\S]*?class="mf2-search"/.test(html));
  R.ok('nationality menu has a mf2-empty "No matches" row', /id="filter-nat-menu"[\s\S]*?mf2-empty/.test(html));
  R.ok('enroll-month menu has a mf2-search box', /id="filter-emonth-menu"[\s\S]*?class="mf2-search"/.test(html));
  R.ok('enroll-month menu has a mf2-empty row', /id="filter-emonth-menu"[\s\S]*?mf2-empty/.test(html));
  // still present on sport + coach (unchanged)
  R.ok('sport menu still has search', /id="filter-sport-menu"[\s\S]*?class="mf2-search"/.test(html));
  R.ok('coach menu still has search', /id="filter-coach-menu"[\s\S]*?class="mf2-search"/.test(html));
}

R.section('source: the shared search wiring is generic (filters by cbClass, Arabic-folded)');
{
  const src = H.readSrc();
  R.ok('wireMultiFilter reads .mf2-search / .mf2-empty from the menu', /const _search = menu\.querySelector\('\.mf2-search'\)/.test(src) && /const _empty = menu\.querySelector\('\.mf2-empty'\)/.test(src));
  R.ok('it is called for nationalities + enrollMonths', /wireMultiFilter\('nationalities'/.test(src) && /wireMultiFilter\('enrollMonths'/.test(src));
}

R.done();
