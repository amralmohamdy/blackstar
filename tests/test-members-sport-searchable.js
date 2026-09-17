// v6.578 — the Members-screen SPORT filter is now type-to-search (it already had All/Clear). The
// sport menu gained the shared .mf2-search box + .mf2-empty state, wired by the generic
// wireMultiFilter (which filters the .filter-sport-cb rows by label, Arabic-folded). Mirrors the
// coach filter that became searchable in v6.575.
const H = require('./qc-harness.js');
const R = H.reporter('v6.578 · Members sport filter searchable');
const src = H.readSrc('pages.js') || H.readSrc();

R.section('sport menu markup');
R.ok('sport menu has a search box (.mf2-search) right after All/Clear', /data-cb="filter-sport-cb"[\s\S]{0,260}<input type="text" class="mf2-search"/.test(src));
R.ok('sport menu has a "No matches" empty state (.mf2-empty)', /filter-sport-cb[\s\S]{0,600}<div class="mf2-empty text-mute"/.test(src));

R.section('wiring — the generic wireMultiFilter drives the search');
R.ok('wireMultiFilter is called for sports', /wireMultiFilter\('sports', 'filter-sport-cb'/.test(src));
R.ok('wireMultiFilter reads .mf2-search + .mf2-empty from the menu', /menu\.querySelector\('\.mf2-search'\)/.test(src) && /menu\.querySelector\('\.mf2-empty'\)/.test(src));
R.ok('the search filters rows Arabic-folded (normalizeArabicForSearch) + toggles the empty state', /normalizeArabicForSearch/.test(src) && /_empty\.style\.display = shown \? 'none' : ''/.test(src));
R.ok('the search box resets + focuses when the menu opens', /if \(open && _search\) \{ _search\.value = ''; _applySearch\(\);/.test(src));

R.section('unchanged — All/Clear still present on the sport filter');
R.ok('sport filter keeps All + Clear', /class="mfilter-all" data-cb="filter-sport-cb"/.test(src) && /class="mfilter-none" data-cb="filter-sport-cb"/.test(src));

R.done();
