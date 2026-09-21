// v6.595 — on the Expiring screen, clicking a row's "Remind" button used to call markReminded(), which
// does a full render() — rebuilding PAGES.expiring and RESETTING its local filter/search/collapsed
// sections/selection. Now the button records the reminder WITHOUT a full render (rerender:false) and
// refreshes only the sections via the exposed partial renderer, so all the filters/settings stay put.
const H = require('./qc-harness.js');
const R = H.reporter('v6.595 · Remind keeps the Expiring filters');
const src = H.readSrc();

R.section('the partial section renderer is exposed');
R.ok('window._expRerender = renderSections is set on the Expiring screen', /window\._expRerender = renderSections;/.test(src));

R.section('the Remind button no longer triggers a full render');
R.ok('the row Remind button records without a full render (rerender:false)', /markReminded\(\$\{m\.id\}, \{ rerender: false \}\)/.test(src));
R.ok('and then refreshes only the sections via the partial renderer', /markReminded\(\$\{m\.id\}, \{ rerender: false \}\);window\._expRerender && window\._expRerender\(\)/.test(src));
R.ok('markReminded honours rerender:false (no render() when asked to skip)', /if \(!opts \|\| opts\.rerender !== false\) render\(\);/.test(src));

R.section('Due Payment already persists its filter + search (unchanged)');
R.ok('due-payment search restores its value + uses the persisted filter', /id="dp-search"[\s\S]{0,120}value="\$\{escapeHtml\(f\.search\)\}"/.test(src) && /window\._dueFilter/.test(src));

R.done();
