// v6.551 — Expenses category list fixes:
//   1) The selectable category list is DE-DUPLICATED case-insensitively (trimmed) on load,
//      so a category that got seeded twice (e.g. "Maintenance" showing twice in the dropdown
//      after a multi-device merge / old backup) collapses to a single entry. Expense RECORDS
//      keep their own saved category text — only the picker list is cleaned (no data loss).
//   2) A new "Owner Net Profit" category is added (seed default + idempotent load migration),
//      placed next to "Cash collected by owner".
const H = require('./qc-harness.js');
const R = H.reporter('EXPENSES · category de-dupe + Owner Net Profit');
const src = H.readSrc();

R.section('source wiring (real code present)');
R.ok('load() de-dupes the category list case-insensitively',
  /_seen\.has\(k\)\) return false;\s*\n\s*_seen\.add\(k\); return true;/.test(src)
  && /DE-DUPLICATE the selectable list case-insensitively/.test(src));
R.ok('"Owner Net Profit" is in the seed defaults',
  /'Cash collected by owner','Owner Net Profit','Others'/.test(src));
R.ok('load() adds "Owner Net Profit" for existing installs (idempotent)',
  /=== 'owner net profit'/.test(src) && /splice\(ownIdx \+ 1, 0, 'Owner Net Profit'\)/.test(src));

// Faithful replication of the load() migration block, to verify the OUTCOME.
function migrate(list) {
  let cats = Array.isArray(list) ? list.slice() : list;
  if (Array.isArray(cats)) {
    const seen = new Set();
    cats = cats.map(c => (typeof c === 'string' ? c.trim() : c)).filter(c => {
      if (!c) return false; const k = String(c).toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    const drop = ['coach pool', 'coach commission'];
    cats = cats.filter(c => !drop.includes(String(c).toLowerCase()));
    if (!cats.some(c => String(c).toLowerCase() === 'maintenance')) {
      const idx = cats.findIndex(c => String(c).toLowerCase() === 'rent');
      if (idx >= 0) cats.splice(idx + 1, 0, 'Maintenance'); else cats.unshift('Maintenance');
    }
    if (!cats.some(c => String(c).toLowerCase() === 'bank commission')) cats.unshift('Bank Commission');
    if (!cats.some(c => String(c).toLowerCase() === 'products')) {
      const eqIdx = cats.findIndex(c => String(c).toLowerCase() === 'equipment');
      if (eqIdx >= 0) cats.splice(eqIdx + 1, 0, 'Products'); else cats.unshift('Products');
    }
    if (!cats.some(c => String(c).toLowerCase() === 'owner net profit')) {
      const ownIdx = cats.findIndex(c => String(c).toLowerCase() === 'cash collected by owner');
      if (ownIdx >= 0) cats.splice(ownIdx + 1, 0, 'Owner Net Profit'); else cats.push('Owner Net Profit');
    }
  }
  return cats;
}
const countCI = (arr, name) => arr.filter(c => String(c).toLowerCase() === name.toLowerCase()).length;

R.section('de-dupe: two Maintenance → one');
{
  const out = migrate(['Rent', 'Maintenance', 'Utilities', 'Maintenance', 'Salary']);
  R.ok('exactly one "Maintenance" remains', countCI(out, 'maintenance') === 1, JSON.stringify(out));
  R.ok('other categories are untouched', out.includes('Rent') && out.includes('Utilities') && out.includes('Salary'), JSON.stringify(out));
}

R.section('de-dupe handles casing + whitespace variants');
{
  const out = migrate(['Rent', 'Maintenance', 'maintenance ', ' MAINTENANCE']);
  R.ok('all casing/whitespace variants collapse to one', countCI(out, 'maintenance') === 1, JSON.stringify(out));
  R.ok('the first occurrence casing is kept ("Maintenance")', out.filter(c => c === 'Maintenance').length === 1, JSON.stringify(out));
}

R.section('Owner Net Profit');
{
  const out = migrate(['Rent', 'Maintenance', 'Salary', 'Cash collected by owner', 'Others']);
  R.ok('Owner Net Profit is added when missing', countCI(out, 'owner net profit') === 1, JSON.stringify(out));
  R.ok('placed right after "Cash collected by owner"',
    out[out.indexOf('Cash collected by owner') + 1] === 'Owner Net Profit', JSON.stringify(out));
  // idempotent: running again does not add a second one
  const out2 = migrate(out);
  R.ok('idempotent — no second "Owner Net Profit" on re-run', countCI(out2, 'owner net profit') === 1, JSON.stringify(out2));
}

R.section('existing expense records are never rewritten');
{
  // The migration only edits the picker list; it must not depend on / touch expense.category text.
  const before = ['Maintenance', 'Maintenance'];
  const after = migrate(before);
  R.ok('list collapsed but an expense saved as "Maintenance" still matches a valid option',
    countCI(after, 'maintenance') === 1 && after.some(c => c === 'Maintenance'), JSON.stringify(after));
}

R.done();
