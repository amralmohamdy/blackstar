// v6.587 — the Coach Performance (Staff) screen defaults its status filter to ACTIVE-only, so the
// inactive coaches (0 revenue this month) don't clutter the list. All / Inactive stay selectable.
const H = require('./qc-harness.js');
const R = H.reporter('v6.587 · coach performance defaults to active-only');
const src = H.readSrc();

R.section('default + dropdown');
R.ok('the coaches filter defaults to active', /let filter = \{ active: 'active', search: '', role: 'coach' \}/.test(src));
R.ok('the status dropdown lists Active only FIRST and marks it selected by default', /<option value="active" \$\{filter\.active === 'active' \? 'selected' : ''\}>Active only \(Y\)<\/option>/.test(src));
R.ok('All statuses is still selectable', /<option value="all" \$\{filter\.active === 'all' \? 'selected' : ''\}>All statuses<\/option>/.test(src));
R.ok('Inactive only is still selectable', /<option value="inactive" \$\{filter\.active === 'inactive' \? 'selected' : ''\}>Inactive only \(N\)<\/option>/.test(src));
R.ok('the active/inactive filter predicate is intact', /if \(filter\.active === 'active' && !isActive\) return false;/.test(src) && /if \(filter\.active === 'inactive' && isActive\) return false;/.test(src));

R.done();
