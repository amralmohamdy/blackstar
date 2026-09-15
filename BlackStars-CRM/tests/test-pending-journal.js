// v6.389 — "I am losing NEW MEMBERS." The exact mechanism, reproduced and fixed:
//   1. Staff register a member. The cloud write FAILS (lapsed sign-in).
//   2. The change lives only in the page's memory. localStorage DOES hold a copy (LS_KEY) —
//      but on the next boot the successful cloud read calls _refreshLocalFromCloud(), which
//      OVERWRITES LS_KEY with cloud data that never had the member. Both copies are now gone.
//   3. The red bar told the user to RELOAD to fix it — the one action that destroys step 2.
// Fix: a separate journal key written SYNCHRONOUSLY on write failure and cleared ONLY by a
// confirmed write, so it survives the cloud-read overwrite; app.js replays it on boot.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const storageSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// A localStorage that records whether writes were SYNCHRONOUS (value readable immediately).
function makeLS() {
  const map = new Map();
  return {
    _map: map,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
  };
}

// The journal helpers live inside storage.js's module IIFE, so they aren't reachable from a vm
// context. Rather than test a copy (which could drift from the real thing), lift the ACTUAL
// source text of those functions out of storage.js and run that — a change to the shipped code
// changes what this test executes.
function extract(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  if (a < 0) throw new Error('marker not found: ' + startMarker);
  const b = src.indexOf(endMarker, a);
  if (b < 0) throw new Error('end marker not found: ' + endMarker);
  return src.slice(a, b + endMarker.length);
}
const JOURNAL_SRC = [
  "const DEVICE_ONLY = ['user', 'route', 'session'];",
  extract(storageSrc, "const PENDING_KEY =", "function readPendingJournal() {\n    try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : null; }\n    catch (_) { return null; }\n  }"),
  extract(storageSrc, "function _refreshLocalFromCloud(data) {", "catch (e) { console.warn('[Storage] local cache refresh failed (non-fatal):', e); }\n  }"),
  "const LS_KEY = 'blackstars-crm-v2'; const LS_LEGACY_KEYS = ['blackstars-crm-v1'];",
].join('\n');

function makeCtx(src, ls) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, Promise, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = ls; ctx.sessionStorage = makeLS();
  ctx.indexedDB = undefined;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
  ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, body: el(), head: el(), documentElement: el() };
  vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) {}
  return ctx;
}

const PENDING_KEY = 'blackstars-crm-pending-v1';

console.log('the journal is SYNCHRONOUS (survives a hard close, unlike async IndexedDB):');
{
  const ls = makeLS();
  const ctx = makeCtx(JOURNAL_SRC, ls);
  // drive the module-private helpers the way the write path does
  const wrote = vm.runInContext(`writePendingJournal({ members: [{id: 99, name: 'New Member'}], user: 'x', route: 'y' }, 'unauthenticated')`, ctx);
  ok('writePendingJournal reports success', wrote === true);
  // the value must be readable IMMEDIATELY — no await, no transaction to commit
  const raw = ls.getItem(PENDING_KEY);
  ok('the record is on disk the instant the call returns', !!raw);
  const j = JSON.parse(raw);
  ok('...it holds the unsaved member', j.state.members[0].name === 'New Member', j.state.members);
  ok('...tagged with the failure reason', j.reason === 'unauthenticated', j.reason);
  ok('...and a timestamp', !!j.at);
  ok('device-only keys are stripped (never replay a stale route/user)', !('user' in j.state) && !('route' in j.state), Object.keys(j.state));
}

console.log('\nit is cleared ONLY by a confirmed write:');
{
  const ls = makeLS();
  const ctx = makeCtx(JOURNAL_SRC, ls);
  vm.runInContext(`writePendingJournal({ members: [{id: 1}] }, 'x')`, ctx);
  ok('journal present after a failure', !!ls.getItem(PENDING_KEY));
  vm.runInContext(`clearPendingJournal()`, ctx);
  ok('gone once the cloud confirms', !ls.getItem(PENDING_KEY));
}

console.log('\nsource wiring — the journal is on the real write paths:');
{
  ok('written in the write-FAILURE handler', /lastWriteFailed = true;[\s\S]{0,600}?writePendingJournal\(state,/.test(storageSrc));
  ok('cleared in the write-SUCCESS handler', /lastWriteFailed = false;[\s\S]{0,300}?clearPendingJournal\(\)/.test(storageSrc));
  ok('exposed to the app as getPending()', /getPending\(\)\s*\{\s*return readPendingJournal\(\)/.test(storageSrc));
  // money-safety: a BLOCKED save (suspected wipe) must NOT be journaled or we could replay a wipe
  ok('a BLOCKED (suspected-wipe) save is deliberately NOT journaled',
    /deliberately NOT journaled/.test(storageSrc) && !/blockEmptyWrite[\s\S]{0,400}?writePendingJournal/.test(storageSrc));
}

console.log('\nboot recovery restores only what the cloud is MISSING (never overwrites):');
{
  const ctx = makeCtx(appSrc, makeLS());
  const run = (cloudMembers, journalMembers) => vm.runInContext(`(function(){
    state.members = ${JSON.stringify(cloudMembers)};
    state.invoices = [];
    window.Storage = {
      getPending: () => ({ at: '2026-07-20T20:00:00Z', state: { members: ${JSON.stringify(journalMembers)} } }),
      clearPending: () => { window.__cleared = true; },
    };
    window.__cleared = false;
    const r = recoverPendingWrite();
    return { r, members: state.members, cleared: window.__cleared };
  })()`, ctx);

  // the reported bug: a member that never reached the cloud
  let out = run([{ id: 1, name: 'Existing' }], [{ id: 1, name: 'Existing' }, { id: 2, name: 'Jaber (new)' }]);
  ok('the member the cloud never got is restored', out.members.some(m => m.id === 2), out.members.map(m => m.name));
  ok('...and reported as restored', out.r.restored.length === 1 && out.r.restored[0].label === 'Jaber (new)', out.r.restored);
  ok('the existing member is untouched', out.members.filter(m => m.id === 1).length === 1);

  // SAFETY: a record that exists in BOTH but differs must NOT be auto-applied
  out = run([{ id: 1, name: 'Cloud version' }], [{ id: 1, name: 'Stale local version' }]);
  ok('a conflicting record does NOT overwrite the cloud copy', out.members[0].name === 'Cloud version', out.members);
  ok('...it is surfaced as a conflict for review', out.r.conflicts.length === 1, out.r.conflicts);
  ok('...and nothing is restored', out.r.restored.length === 0);

  // fully absorbed → journal cleared so it can't linger forever
  out = run([{ id: 1, name: 'Same' }], [{ id: 1, name: 'Same' }]);
  ok('a journal the cloud already has is cleared', out.cleared === true);
  ok('...and reports nothing to do', out.r === null);
}

console.log('\ncontrol — without the journal the member is unrecoverable:');
{
  // Simulate the OLD world: only LS_KEY exists, and the cloud read overwrites it.
  const ls = makeLS();
  const ctx = makeCtx(JOURNAL_SRC, ls);
  // staff add a member; the local safety-net cache holds it
  vm.runInContext(`localStorage.setItem('blackstars-crm-v2', JSON.stringify({ members: [{id:1,name:'Existing'},{id:2,name:'Jaber (new)'}] }))`, ctx);
  ok('pre-condition: the new member is in the local cache', /Jaber/.test(ls.getItem('blackstars-crm-v2')));
  // next boot: a successful cloud read refreshes the cache from CLOUD data (no member 2)
  vm.runInContext(`_refreshLocalFromCloud({ members: [{id:1,name:'Existing'}] })`, ctx);
  ok('after the cloud read, the local cache NO LONGER has him (the real bug)', !/Jaber/.test(ls.getItem('blackstars-crm-v2')));
  ok('...and with no journal there is nothing left to recover from', !ls.getItem(PENDING_KEY));
  // with the fix, the journal is a DIFFERENT key, so the same overwrite cannot erase it
  vm.runInContext(`writePendingJournal({ members: [{id:1,name:'Existing'},{id:2,name:'Jaber (new)'}] }, 'unauthenticated')`, ctx);
  vm.runInContext(`_refreshLocalFromCloud({ members: [{id:1,name:'Existing'}] })`, ctx);
  ok('WITH the fix: the cloud read cannot erase the journal', /Jaber/.test(ls.getItem(PENDING_KEY)));
}

console.log('\nsession handling — no red bar, no "reload", no lost work:');
{
  ok('an auth failure opens the in-place resume prompt instead of the bar',
    /if \(isAuth\) \{ showSessionResumePrompt\(\); return; \}/.test(appSrc));
  ok('the prompt tries a SILENT refresh before asking for anything',
    /showSessionResumePrompt[\s\S]{0,900}?refreshAuth[\s\S]{0,400}?retryNow/.test(appSrc));
  ok('signing in flushes the pending write (no reload)',
    /Storage\.signIn\(em, pass\)[\s\S]{0,1600}?retryNow/.test(appSrc));
  ok('the app no longer tells the user their work "will be lost if you close"',
    !/will be lost if you close now/.test(appSrc));
  ok('auth persistence is pinned to LOCAL', /setPersistence\(window\.firebase\.auth\.Auth\.Persistence\.LOCAL\)/.test(storageSrc));
  ok('the token is renewed BEFORE a write when near expiry', /_tokenExpAt && Date\.now\(\) > _tokenExpAt - TOKEN_SKEW_MS/.test(storageSrc));
  ok('...and the common path stays SYNCHRONOUS (tab-close writes still land)',
    /if \(_tokenExpAt && Date\.now\(\)[\s\S]{0,400}?return;\s*\n\s*\}\s*\n\s*_flushWrite\(state\);/.test(storageSrc));
  ok('a fresh sign-in immediately re-sends what the dead session left behind',
    /signInWithEmailAndPassword[\s\S]{0,500}?lastWriteFailed && _lastState && !writeInFlight\) _flushWrite/.test(storageSrc));
}

console.log('\nPENDING JOURNAL:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
