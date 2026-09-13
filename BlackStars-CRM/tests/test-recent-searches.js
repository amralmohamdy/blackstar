// v6.384 — "in attendance screen, keep recent 3 searches".
// This shipped without a dedicated test; a verification pass caught the gap, so it is covered
// here. The recent-search store already existed app-wide (cap 5) — the Attendance screen asks
// for the last THREE, so the limit must be honoured per screen without changing the store.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

function makeCtx() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  ctx.location = { hash: '' }; ctx.navigator = { userAgent: 'n' }; ctx.addEventListener = () => {};
  vm.createContext(ctx);
  try { vm.runInContext(appSrc, ctx); } catch (_) {}
  return ctx;
}

console.log('the Attendance screen asks for exactly 3:');
{
  ok('PAGES.attendance passes a limit of 3', /recentSearchChipsHtml\('attendance', 'att-recent-search', 3\)/.test(pagesSrc));
  ok('the helper accepts a per-screen limit', /function recentSearchChipsHtml\([^)]*limit/.test(appSrc));
}

console.log('\nthe limit is actually applied (not just passed):');
{
  const ctx = makeCtx();
  const out = vm.runInContext(`(function(){
    state.recentSearches = { attendance: ['aaa','bbb','ccc','ddd','eee'] };
    const html = recentSearchChipsHtml('attendance', 'x', 3);
    return ['aaa','bbb','ccc','ddd','eee'].filter(t => html.indexOf(t) !== -1);
  })()`, ctx);
  ok('only 3 chips are rendered from a store of 5', out.length === 3, out);
  ok('...and they are the 3 most recent', out.join(',') === 'aaa,bbb,ccc', out);
}

console.log('\nthe shared store is unchanged for other screens:');
{
  const ctx = makeCtx();
  const n = vm.runInContext(`(function(){
    state.recentSearches = { members: ['a','b','c','d','e'] };
    const html = recentSearchChipsHtml('members', 'x');       // no limit → screen default
    return ['a','b','c','d','e'].filter(t => html.indexOf(t) !== -1).length;
  })()`, ctx);
  ok('a screen without a limit still shows its full list (cap 5)', n === 5, n);
  ok('RECENT_SEARCH_MAX is still 5', /RECENT_SEARCH_MAX\s*=\s*5/.test(appSrc));
}

console.log('\nrecording behaviour is intact:');
{
  const ctx = makeCtx();
  const r = vm.runInContext(`(function(){
    state.recentSearches = {};
    recordRecentSearch('attendance', 'jaber');
    recordRecentSearch('attendance', 'x');          // under 2 chars → ignored
    recordRecentSearch('attendance', 'sara');
    recordRecentSearch('attendance', 'jaber');      // repeat → moves to front, no duplicate
    return state.recentSearches.attendance;
  })()`, ctx);
  ok('a 1-character term is not stored', !r.includes('x'), r);
  ok('a repeated term is not duplicated', r.filter(t => t === 'jaber').length === 1, r);
  ok('the most recent term is first', r[0] === 'jaber', r);
}

console.log('\nRECENT SEARCHES:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
