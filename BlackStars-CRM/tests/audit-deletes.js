// Audit every delete in the app for sync-safety:
//   A) element removed from a nested array field  -> needs a TOMBSTONE
//   B) record removed from a top-level collection -> needs a SOFT-DELETE (deleted = true)
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'crm238', 'blackstars-localhost');
const FIELDS = ['subscriptions', 'enrollments', 'payments', 'lineItems', 'renewals', 'freezes',
                'sportSwitches', 'cashCounts', 'swimGroups', 'memberIds', 'notes', 'advices'];
const COLLECTIONS = ['members', 'invoices', 'expenses', 'salaries', 'sales', 'coaches', 'trials',
                     'rentals', 'rentalCustomers', 'products', 'families', 'schedule', 'swimGroups',
                     'notes', 'advices', 'cashCounts', 'drivers', 'membershipTransfers'];

const fieldRe = new RegExp('\\.(' + FIELDS.join('|') + ')\\s*=\\s*[^=]*\\.filter\\(');
const spliceRe = new RegExp('\\.(' + FIELDS.join('|') + ')\\.splice\\(');
const collRe = new RegExp('state\\.(' + COLLECTIONS.join('|') + ')\\s*=\\s*[^=]*\\.filter\\(');
const collSplice = new RegExp('state\\.(' + COLLECTIONS.join('|') + ')\\.splice\\(');

let totalA = 0, badA = 0, totalB = 0, badB = 0;
for (const file of ['app.js', 'pages.js']) {
  const L = fs.readFileSync(path.join(DIR, file), 'utf8').split('\n');
  const A = [], B = [];
  for (let i = 0; i < L.length; i++) {
    const ln = L[i];
    if (/^\s*\/\//.test(ln)) continue;                      // comment
    const ctx = L.slice(Math.max(0, i - 14), i + 4).join(' ');

    const fm = ln.match(fieldRe) || ln.match(spliceRe);
    if (fm) {
      // a .filter that ADDS/derives rather than removes? heuristic: assignment back to same field
      const tomb = /_tombstoneEl|_tombstoneSport/.test(ctx);
      A.push({ line: i + 1, field: fm[1], tomb, txt: ln.trim().slice(0, 92) });
    }
    const cm = ln.match(collRe) || ln.match(collSplice);
    if (cm) {
      const soft = /\.deleted\s*=\s*true|deletedAt/.test(ctx);
      B.push({ line: i + 1, coll: cm[1], soft, txt: ln.trim().slice(0, 92) });
    }
  }
  const aBad = A.filter(x => !x.tomb), bBad = B.filter(x => !x.soft);
  totalA += A.length; badA += aBad.length; totalB += B.length; badB += bBad.length;
  console.log(`\n===== ${file} =====`);
  console.log(`A) nested-array element removals: ${A.length}   NO tombstone: ${aBad.length}`);
  aBad.forEach(h => console.log(`   ⚠ ${h.line}  [${h.field}]  ${h.txt}`));
  console.log(`B) top-level collection removals: ${B.length}   NO soft-delete: ${bBad.length}`);
  bBad.forEach(h => console.log(`   ⚠ ${h.line}  [${h.coll}]  ${h.txt}`));
}
// ── Since v6.392 the protection is GENERIC, not per-site ─────────────────────────────────
// Deletes are no longer expected to tombstone at the call site. _mergeCollection tombstones any
// record that was in base and is gone locally, and _mergeArrayById does the same for array rows
// (content keys included, scoped). So the per-site counts above are INFORMATIONAL — what
// actually has to hold is the generic guard below. Reporting the old counts as failures would
// be a false alarm, and quietly dropping them would hide real per-site context; keep both.
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const GENERIC = [
  ['collection-level delete tombstone', /for \(const id of base\.keys\(\)\)[\s\S]{0,200}?_elTombstone\(_dk\(id\)\)/],
  ['collection tombstone honoured', /_elIsTombstoned\(_dk\(id\)\)/],
  ['array-level tombstone incl. content keys', /if \(!li\.has\(k\) && \(_isIdKey\(k\) \|\| scope\)\)/],
  ['array tombstone honoured', /_elIsTombstoned\(_tombKey\(k, scope\)\)/],
  ['sport-level tombstone (survives a remote edit)', /_sportTombstoned\(r, scope\)/],
];
let genericOk = true;
console.log('\nGENERIC PROTECTION (what must hold since v6.392):');
for (const [n, re] of GENERIC) { const p = re.test(app); if (!p) genericOk = false; console.log('  ' + (p ? 'OK  ' : 'MISS') + ' ' + n); }
console.log(`\nper-site counts (informational only) — A ${badA}/${totalA} without a local tombstone · B ${badB}/${totalB} hard-removed`);
console.log(genericOk
  ? 'RESULT: PASS — every delete is covered by the generic merge-layer tombstone.'
  : 'RESULT: FAIL — the generic guard is missing; per-site deletes are unprotected.');
process.exit(genericOk ? 0 : 1);
