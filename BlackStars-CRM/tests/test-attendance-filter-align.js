// v6.513 — the Attendance filter bar must top-align its controls. With align-items:stretch, a tall
// student picker (its "Recent:" chips add a second line) stretched the row and vertically-centred the
// year/month control, dropping "2026 / Aug 26" below the day/week/status filters. align-items must be
// flex-start so every control lines up at the top regardless of the picker's height.
const H = require('./qc-harness.js');
const R = H.reporter('v6.513 · attendance filter alignment');
const src = H.readSrc();

R.ok('the attendance filter bar top-aligns its controls (align-items:flex-start)',
  /class="filter-bar att-filter-bar" style="flex-wrap:wrap;align-items:flex-start"/.test(src));
R.ok('it no longer uses the stretch that caused the vertical skew',
  !/class="filter-bar att-filter-bar" style="flex-wrap:wrap;align-items:stretch"/.test(src));

R.done();
