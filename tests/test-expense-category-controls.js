// v6.569 — the Expenses CATEGORY dropdown gains an All / Clear header + a type-to-search box (matching the
// shared multiFilterHTML). Long category lists were tedious to scan/select; now you can search by name and
// select-all / clear in one click. Method + coach menus are unchanged (they don't carry these controls).
const H = require('./qc-harness.js');
const R = H.reporter('v6.569 · expenses category dropdown — All / Clear / search');
const src = H.readSrc();

R.section('source — the category menu markup carries the three controls');
R.ok('an All button (expm-all) is in the category menu', /class="expm-all"[^>]*>\$\{t\('All', 'الكل'\)\}/.test(src));
R.ok('a Clear button (expm-none) is in the category menu', /class="expm-none"[^>]*>\$\{t\('Clear', 'مسح'\)\}/.test(src));
R.ok('a search box (expm-search) is in the category menu', /class="expm-search"[^>]*placeholder="🔍 \$\{t\('Search…', 'بحث…'\)\}"/.test(src));
R.ok('the checkboxes live in an expm-list with a no-matches empty state', /class="expm-list"/.test(src) && /class="expm-empty[^"]*"[^>]*>\$\{t\('No matches', 'لا نتائج'\)\}/.test(src));
R.ok('the category checkboxes keep their exp-cat-cb class (coach-picker sync intact)', /class="exp-cat-cb"/.test(src));

R.section('source — wireExpMulti wires All / Clear / search generically');
R.ok('wireExpMulti takes an afterChange callback', /function wireExpMulti\(key, cbClass, btnId, menuId, labelId, allText, oneFmt, afterChange\)/.test(src));
R.ok('All checks every box then re-syncs', /querySelector\('\.expm-all'\)\?\.addEventListener\('click', e => \{ e\.stopPropagation\(\); boxes\(\)\.forEach\(b => b\.checked = true\); sync\(\); \}\)/.test(src));
R.ok('Clear unchecks every box then re-syncs', /querySelector\('\.expm-none'\)\?\.addEventListener\('click', e => \{ e\.stopPropagation\(\); boxes\(\)\.forEach\(b => b\.checked = false\); sync\(\); \}\)/.test(src));
R.ok('search filters rows Arabic-folded and toggles the empty state', /const applySearch = \(\) => \{/.test(src) && /norm\(l\.textContent\)\.includes\(q\)/.test(src) && /empty\.style\.display = shown \? 'none' : ''/.test(src) && /normalizeArabicForSearch/.test(src));
R.ok('opening the menu resets + focuses the search', /if \(open && search\) \{ search\.value = ''; applySearch\(\); setTimeout\(\(\) => \{ try \{ search\.focus\(\); \}/.test(src));
R.ok('category wiring passes the coach-picker sync as afterChange (covers All/Clear)', /wireExpMulti\('categories'[\s\S]{0,120}\(\) => _syncExpCoachPicker\(\)\)/.test(src));
R.ok('the old standalone exp-cat-cb→coach-picker listener was removed (now via afterChange)', !/\$\$\('\.exp-cat-cb'\)\.forEach\(cb => cb\.addEventListener\('change', _syncExpCoachPicker\)\)/.test(src));

R.done();
