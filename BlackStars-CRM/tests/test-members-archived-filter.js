// v6.390 — "why while search for active member i can see archived members?"
// Members screen, status filter = Active, search "راشد" → ARCHIVED members were listed with
// Restore / Delete-forever buttons, as if they were active.
//
// Cause: applyFilter() exempted the archived-exclusion whenever the user was typing:
//     if (m.deleted && !wantArchived && !isSearching) return false;
// and the status gate on the next lines only ever applied to NON-archived members
//     (`statusSel.length && !m.deleted && ...`).
// So the moment you searched, archived members bypassed the status filter completely — the
// search silently overrode the filter the user had explicitly set.
//
// Fix: an explicit status choice always wins. The search-finds-everyone convenience now applies
// only when NO status was chosen.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// applyFilter lives inside PAGES.members' closure. Lift its REAL source so this test executes
// the shipped code, not a re-implementation that could drift from it.
function extractApplyFilter(src) {
  const start = src.indexOf('  function applyFilter(f = filter) {');
  if (start < 0) throw new Error('applyFilter not found');
  // walk braces to the matching close
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('applyFilter end not found');
  return src.slice(start, end);
}
const APPLY_SRC = extractApplyFilter(pagesSrc);

// Real helpers the filter calls, pulled from app.js where practical; the rest are faithful stubs
// for fields this scenario does not exercise.
function makeCtx() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  ctx.location = { hash: '' }; ctx.navigator = { userAgent: 'n' }; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  // real search matcher (Arabic-aware) from app.js
  const smf = appSrc.match(/function searchMatchesFields[\s\S]*?\n\}/);
  const nrm = appSrc.match(/function normalizeArabicForSearch[\s\S]*?\n\}/);
  vm.runInContext((nrm ? nrm[0] : '') + '\n' + (smf ? smf[0] : ''), ctx);
  vm.runInContext(`
    // status of a NON-archived member (archived is handled by m.deleted)
    function memberStatus(m) { return m._status || 'Active'; }
    function fuzzyMatch() { return false; }
    function memberEnrollMonths() { return new Set(); }
    var dupNameInfo = null;
    var filter = {};
    ${APPLY_SRC}
  `, ctx);
  return ctx;
}

// The owner's screen: several "راشد" members, some active, some archived.
const MEMBERS = [
  { id: 1, name: 'Khalid Sohaim Al Rashdi',   nameArabic: 'خالد سحيم الراشدي', deleted: true },
  { id: 2, name: 'Rashid Almery',             nameArabic: 'راشد المري',        deleted: true },
  { id: 3, name: 'Rashid Abdulla MA Alfahaida', nameArabic: 'راشد عبدالله محمد الحسن الفهيدة', deleted: false, _status: 'Active' },
  { id: 4, name: 'Rashed Ibrahim R A Aljehani', nameArabic: 'راشد ابراهيم راشد المالكي الجهني', deleted: false, _status: 'Active' },
  { id: 5, name: 'Rashid Abdullah Mohamed Alaifa', nameArabic: 'راشد عبد الله محمد العفيقة', deleted: true },
  { id: 6, name: 'Old Expired Rashid',        nameArabic: 'راشد منتهي',        deleted: false, _status: 'Expired' },
];

function run(ctx, f) {
  return vm.runInContext(`(function(){
    state = { members: ${JSON.stringify(MEMBERS)} };
    return applyFilter(${JSON.stringify(f)}).map(m => m.id);
  })()`, ctx);
}

console.log('the reported bug — status "Active" + a search must NOT list archived members:');
{
  const ctx = makeCtx();
  const ids = run(ctx, { statuses: ['Active'], search: 'راشد' });
  ok('no archived member is returned', !ids.some(i => [1, 2, 5].includes(i)), ids);
  ok('the two ACTIVE matches are returned', ids.includes(3) && ids.includes(4), ids);
  ok('the EXPIRED member is excluded too (status filter respected)', !ids.includes(6), ids);
  ok('exactly the 2 active matches', ids.length === 2, ids);
}

console.log('\nsearching with NO status chosen still finds everyone (kept on purpose):');
{
  const ctx = makeCtx();
  const ids = run(ctx, { statuses: [], search: 'راشد' });
  ok('archived members ARE included when no status is filtered', ids.some(i => [1, 2, 5].includes(i)), ids);
  ok('...alongside the active ones', ids.includes(3) && ids.includes(4), ids);
}

console.log('\nasking for Archived explicitly still works:');
{
  const ctx = makeCtx();
  let ids = run(ctx, { statuses: ['Archived'], search: 'راشد' });
  ok('only archived members are returned', ids.length > 0 && ids.every(i => [1, 2, 5].includes(i)), ids);
  ids = run(ctx, { statuses: ['Archived'], search: '' });
  ok('...and without a search too', ids.length > 0 && ids.every(i => [1, 2, 5].includes(i)), ids);
  // Archived + Active together = both
  ids = run(ctx, { statuses: ['Archived', 'Active'], search: 'راشد' });
  ok('Archived + Active returns both kinds', ids.some(i => [1, 2, 5].includes(i)) && ids.includes(3), ids);
}

console.log('\nno-search behaviour is unchanged:');
{
  const ctx = makeCtx();
  const ids = run(ctx, { statuses: ['Active'], search: '' });
  ok('Active with no search excludes archived', !ids.some(i => [1, 2, 5].includes(i)), ids);
  ok('...and excludes Expired', !ids.includes(6), ids);
}

console.log('\ncontrol — restore the old rule and the bug comes back:');
{
  const broken = pagesSrc
    .replace('const searchingUnfiltered = isSearching && statusSel.length === 0 && !wantArchived;\n      if (m.deleted && !wantArchived && !searchingUnfiltered) return false;',
             'if (m.deleted && !wantArchived && !isSearching) return false;');
  ok('control patch applied', broken !== pagesSrc);
  const oldApply = extractApplyFilter(broken);
  const ctx = makeCtx();
  vm.runInContext(`
    function memberStatus(m) { return m._status || 'Active'; }
    function fuzzyMatch() { return false; }
    function memberEnrollMonths() { return new Set(); }
    var dupNameInfo = null; var filter = {};
    ${oldApply.replace('function applyFilter', 'function applyFilterOLD')}
  `, ctx);
  const ids = vm.runInContext(`(function(){
    state = { members: ${JSON.stringify(MEMBERS)} };
    return applyFilterOLD({ statuses: ['Active'], search: 'راشد' }).map(m => m.id);
  })()`, ctx);
  ok('WITHOUT the fix: archived members leak into the Active search (reproduces the report)',
    ids.some(i => [1, 2, 5].includes(i)), ids);
}

console.log('\nMEMBERS ARCHIVED FILTER:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
