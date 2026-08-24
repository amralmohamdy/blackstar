// v6.521 — the membership Validity dropdown offers friendly presets: 1 day, 1 week, 2 weeks,
// 1 month, 2 months, 3 months, 6 months (day-counts 1/7/14/30/60/90/180). The STORED value stays
// the day count (expiry math unchanged); a non-preset legacy value is preserved as its own option.
const H = require('./qc-harness.js');
const R = H.reporter('v6.521 · membership validity presets');
const src = H.readSrc();

R.section('source — options + helpers');
R.ok('VALIDITY_OPTIONS is the 7 requested day-counts', /const VALIDITY_OPTIONS = \[1, 7, 14, 30, 60, 90, 180\];/.test(src));
R.ok('a friendly-label helper exists', /function validityLabel\(days\)/.test(src));
R.ok('an option-builder helper exists', /function validityOptionsHtml\(selected\)/.test(src));
R.ok('all four selects use validityOptionsHtml', (src.match(/validityOptionsHtml\(/g) || []).length >= 5); // 1 def + 4 sites
R.ok('the old bare "${v} days" mapping is gone from the validity selects', !/VALIDITY_OPTIONS\.map\(v => `<option value="\$\{v\}"[^>]*>\$\{v\} days/.test(src));

R.section('runtime — labels + option list');
{
  const ctx = H.makeCtx({ today: '2026-08-24', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  const pairs = [[1, '1 day'], [7, '1 week'], [14, '2 weeks'], [30, '1 month'], [60, '2 months'], [90, '3 months'], [180, '6 months']];
  for (const [d, lab] of pairs) {
    R.ok(`validityLabel(${d}) = "${lab}"`, run(`validityLabel(${d})`) === lab, run(`validityLabel(${d})`));
  }
  R.ok('a non-preset value falls back to "<n> days"', run(`validityLabel(45)`) === '45 days', run(`validityLabel(45)`));

  const html30 = run(`validityOptionsHtml(30)`);
  R.ok('option list has all 7 presets', (html30.match(/<option /g) || []).length === 7, 'count=' + (html30.match(/<option /g) || []).length);
  R.ok('30 (1 month) is the selected default', /<option value="30" selected>1 month<\/option>/.test(html30));
  R.ok('values are day counts (30 not "1 month") so expiry math is unchanged', /value="30"/.test(html30) && /value="180"/.test(html30));

  const html45 = run(`validityOptionsHtml(45)`);
  R.ok('a legacy 45-day validity is preserved as its own selected option', /<option value="45" selected>45 days<\/option>/.test(html45));
  R.ok('preserving a legacy value yields 8 options (7 presets + the legacy)', (html45.match(/<option /g) || []).length === 8, 'count=' + (html45.match(/<option /g) || []).length);
}

R.done();
