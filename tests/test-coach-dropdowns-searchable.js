// v6.575 — every MULTI-SELECT coach dropdown is searchable (Arabic + English) with Select-All / Clear.
// The shared multiFilterHTML coach filters (Attendance / Invoices / Ready-to-Renew) already had All/Clear;
// they now always show the search box (o.search) and Attendance includes the Arabic name in the label.
// The two hand-rolled coach menus (Members filter, Schedule filter) gained a search box (All/Clear already
// present). Single-select pickers (enrollment, switch, attendance-mark chooser) are out of scope — no "all".
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.575 · coach dropdowns searchable + All/Clear');
const src = H.readSrc();

R.section('shared multiFilterHTML — search box shows on demand (o.search) and via ≥8 auto');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  const few = run(`multiFilterHTML('t1', [['1','Aziz'],['2','Zakaria']], [], { allText:'All coaches' })`);
  const fewSearch = run(`multiFilterHTML('t2', [['1','Aziz'],['2','Zakaria']], [], { allText:'All coaches', search:true })`);
  R.ok('a short list WITHOUT search:true has no search box', !/class="mf-search"/.test(few));
  R.ok('a short coach list WITH search:true shows the search box', /class="mf-search"/.test(fewSearch));
  R.ok('All + Clear are always present', /class="mf-all"/.test(fewSearch) && /class="mf-none"/.test(fewSearch));
}

R.section('source — the 3 shared coach filters opt into search (+ Attendance carries Arabic)');
R.ok('Attendance coach filter: search:true + Arabic name in the label', /multiFilterHTML\('att-coach'[\s\S]{0,320}c\.nameArabic \? ' · ' \+ c\.nameArabic/.test(src) && /multiFilterHTML\('att-coach'[\s\S]{0,420}search: true \}\)/.test(src));
R.ok('Invoices coach filter: search:true', /multiFilterHTML\('inv-coach'[\s\S]{0,140}search: true \}\)/.test(src));
R.ok('Ready-to-Renew coach filter: search:true', /multiFilterHTML\('comp-coach'[\s\S]{0,140}search: true \}\)/.test(src));

R.section('source — Members-screen coach filter (wireMultiFilter) is searchable + Arabic-aware');
R.ok('the coach menu renders a search box (mf2-search) + empty state', /class="mf2-search"/.test(src) && /class="mf2-empty/.test(src));
R.ok('coach rows include the Arabic name (searchable + shown)', /class="filter-coach-cb"[\s\S]{0,220}c\.nameArabic \? '[\s\S]{0,80}dir="rtl">' \+ escapeHtml\(c\.nameArabic\)/.test(src));
R.ok('wireMultiFilter wires the search (Arabic-folded) + focuses on open', /const _search = menu\.querySelector\('\.mf2-search'\);/.test(src) && /normalizeArabicForSearch/.test(src) && /if \(open && _search\) \{ _search\.value = ''; _applySearch\(\);/.test(src));
R.ok('Members coach filter still has All/Clear', /class="mfilter-all" data-cb="filter-coach-cb"/.test(src) && /class="mfilter-none" data-cb="filter-coach-cb"/.test(src));

R.section('source — Schedule coach filter is searchable + Arabic-aware + All/Clear');
R.ok('schedule coach menu renders a search box + empty state', /id="sch-coach-search"/.test(src) && /id="sch-coach-empty"/.test(src));
R.ok('schedule coach rows include the Arabic name', /class="sch-coach-cb"[\s\S]{0,120}c\.nameArabic \? ' <span[^>]*dir="rtl">' \+ escapeHtml\(c\.nameArabic\)/.test(src));
R.ok('schedule coach search is wired (Arabic-folded) + focus on open', /const sInput = \$\('#sch-coach-search'\)/.test(src) && /norm\(sInput\.value\.trim\(\)\)/.test(src) && /sInput\.focus\(\)/.test(src));
R.ok('schedule coach filter still has All + Clear', /id="sch-filter-coach-all"/.test(src) && /id="sch-filter-coach-clear"/.test(src));

R.done();
