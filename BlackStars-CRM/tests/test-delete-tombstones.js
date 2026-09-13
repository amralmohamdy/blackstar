// v6.392 — CRUD delete safety, swept across the whole app.
//
// An audit of every delete found 21 nested-array element removals with no tombstone and 32
// top-level records hard-removed from their collection. Both are resurrectable: the merge only
// honours a delete when the still-present remote copy is BYTE-IDENTICAL to our base, so the
// moment any other device touched that record (even a stamp) the delete was ignored and the row
// came back. Nested arrays have had tombstones since v6.303; top-level collections had NONE.
//
// Fix (generic, so it covers every delete site at once rather than 53 hand-edits):
//   * _mergeCollection now tombstones any record that was in base and is gone locally, and
//     honours that tombstone when the remote copy is present.
//   * _mergeArrayById now also auto-tombstones CONTENT-keyed rows (scoped per record+field, so
//     they cannot collide) — previously only unique-id rows were protected.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

function makeCtx(src) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, Promise, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
  ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), head: el(), documentElement: el() };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a' }, onAuthStateChanged() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) {}
  return ctx;
}

// Delete a record locally, then merge against a remote that STILL HAS IT AND HAS TOUCHED IT.
// This is the real-world shape: another device stamped the record after our last sync.
const scenario = (ctx, coll) => vm.runInContext(`(function(){
  const base   = [{id:1,name:'Keep'},{id:2,name:'DeleteMe',amount:500}];
  const local  = [{id:1,name:'Keep'}];                                   // we deleted id 2
  const remote = [{id:1,name:'Keep'},{id:2,name:'DeleteMe',amount:500,_updatedAt:'2026-07-21T09:00:00Z'}];
  const r = _mergeCollection(base, local, remote, ${JSON.stringify(coll)});
  return (r.merged || r).map(x => x.id);
})()`, ctx);

console.log('top-level collection deletes survive a TOUCHED remote copy:');
{
  for (const coll of ['expenses', 'salaries', 'sales', 'products', 'trials', 'rentals', 'schedule', 'advices']) {
    const ctx = makeCtx(appSrc);
    const ids = scenario(ctx, coll);
    ok(`${coll}: the deleted record does NOT come back`, !ids.includes(2), ids);
  }
}

console.log('\n...and the untouched record is never harmed:');
{
  const ctx = makeCtx(appSrc);
  const ids = scenario(ctx, 'expenses');
  ok('the kept record is still there', ids.includes(1), ids);
}

console.log('\na record the remote LEGITIMATELY added is still accepted (no over-blocking):');
{
  const ctx = makeCtx(appSrc);
  const ids = vm.runInContext(`(function(){
    const base   = [{id:1,name:'Keep'}];
    const local  = [{id:1,name:'Keep'}];
    const remote = [{id:1,name:'Keep'},{id:9,name:'AddedByOtherDevice'}];   // never in base → a real add
    const r = _mergeCollection(base, local, remote, 'expenses');
    return (r.merged || r).map(x => x.id);
  })()`, ctx);
  ok('a genuine remote ADD is kept', ids.includes(9), ids);
  ok('...alongside the existing record', ids.includes(1), ids);
}

console.log('\nthe 2-strike protection for CONFIRMED records is not broken:');
{
  // A record present locally but missing from a partial/stale remote snapshot must NOT be
  // dropped on the first absence — that guard protects paid salaries from a bad snapshot.
  const ctx = makeCtx(appSrc);
  const ids = vm.runInContext(`(function(){
    const base   = [{id:1,name:'PaidSalary'}];
    const local  = [{id:1,name:'PaidSalary'}];
    const remote = [];                                   // stale/partial snapshot
    const r = _mergeCollection(base, local, remote, 'salaries');
    return (r.merged || r).map(x => x.id);
  })()`, ctx);
  ok('a confirmed record survives the FIRST absence from remote', ids.includes(1), ids);
}

console.log('\nnested arrays: CONTENT-keyed rows are now protected too:');
{
  const ctx = makeCtx(appSrc);
  const out = vm.runInContext(`(function(){
    // invoice line items have no id → content-keyed
    const base   = [{sport:'Boxing',price:300},{sport:'Swimming',price:650}];
    const local  = [{sport:'Boxing',price:300}];                       // Swimming deleted
    const remote = [{sport:'Boxing',price:300},{sport:'Swimming',price:650}];
    return _mergeArrayById(base, local, remote, 'invoices:900:lineItems').map(x => x.sport);
  })()`, ctx);
  ok('a deleted content-keyed line item stays deleted', !out.includes('Swimming'), out);
  ok('the other line item is kept', out.includes('Boxing'), out);
}

console.log('\ncontrol — without the collection tombstone the record returns:');
{
  const broken = appSrc.replace(
    /for \(const id of base\.keys\(\)\) \{\s*\n\s*if \(!local\.has\(id\)\) \{ try \{ _elTombstone\(_dk\(id\)\); \} catch \(_\) \{\} \}\s*\n\s*\}/,
    '/* collection tombstones removed for control */'
  );
  ok('control patch applied', broken !== appSrc);
  const ctx = makeCtx(broken);
  const ids = scenario(ctx, 'expenses');
  ok('WITHOUT it: the deleted expense comes BACK (reproduces the bug class)', ids.includes(2), ids);
}

console.log('\nsource wiring:');
{
  ok('_mergeCollection tombstones base-minus-local', /for \(const id of base\.keys\(\)\)[\s\S]{0,200}?_elTombstone\(_dk\(id\)\)/.test(appSrc));
  ok('_mergeCollection honours the tombstone on the remote-present branch', /_elIsTombstoned\(_dk\(id\)\)/.test(appSrc));
  ok('_mergeArrayById auto-tombstones content keys only when SCOPED (no collisions)',
    /if \(!li\.has\(k\) && \(_isIdKey\(k\) \|\| scope\)\) _elTombstone\(_tombKey\(k, scope\)\)/.test(appSrc));
}

console.log('\nDELETE TOMBSTONES:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
