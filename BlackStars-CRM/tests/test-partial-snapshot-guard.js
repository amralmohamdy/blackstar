// v6.382 — THE core "data randomly disappears" fix. A remote snapshot can arrive PARTIAL (a
// per-collection listener not yet seeded, a reconnect after sleep, a dropped sub-collection read) —
// a collection shows EMPTY while local holds many real records. mergeRemoteIntoState must NOT treat
// those as "deleted remotely" and drop them. The read-side guard skips a collection whose remote
// copy is drastically smaller than local. Proven with a CONTROL (remove the guard → data is lost).
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

function makeCtx(src) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => (typeof f === 'function' ? f() : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, classList: { add() {} } }), body: {}, head: {}, documentElement: { setAttribute() {}, classList: { add() {} } } };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) {}
  return ctx;
}

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

const mkMembers = n => Array.from({ length: n }, (_, i) => ({ id: 'm' + (i + 1), name: 'Member ' + (i + 1), sport: 'Karate' }));
const mkInvoices = n => Array.from({ length: n }, (_, i) => ({ id: 'i' + (i + 1), customerId: 'm' + (i + 1), category: 'Membership', sport: 'Karate', amount: 100 }));

function seed(ctx, members, invoices) {
  vm.runInContext(`state.members = ${JSON.stringify(members)}; state.invoices = ${JSON.stringify(invoices)}; state.coaches=[]; if(!state.settings) state.settings={};`, ctx);
  // Make these the CONFIRMED sync base (as if the cloud already echoed them back).
  vm.runInContext(`snapshotSyncBase(state);`, ctx);
}
const memberCount = ctx => vm.runInContext('(state.members||[]).length', ctx);
const invCount = ctx => vm.runInContext('(state.invoices||[]).length', ctx);

// ── 1) PARTIAL snapshot (members empty, invoices empty) must NOT wipe local. ──
console.log('partial snapshot must not drop confirmed local records:');
{
  const ctx = makeCtx(appSrc);
  seed(ctx, mkMembers(40), mkInvoices(30));
  // A partial live snapshot: one small collection changed (coaches), but members/invoices came back
  // EMPTY because their listeners had not seeded yet.
  const partial = { members: [], invoices: [], coaches: [{ id: 'c1', name: 'Coach' }] };
  vm.runInContext(`mergeRemoteIntoState(${JSON.stringify(partial)}); mergeRemoteIntoState(${JSON.stringify(partial)});`, ctx);  // twice (beats the 2-strike delete)
  ok('40 members survived a partial (empty) remote snapshot ×2', memberCount(ctx) === 40, memberCount(ctx));
  ok('30 invoices survived too', invCount(ctx) === 30, invCount(ctx));
}

// ── 2) CONTROL: without the guard, the partial snapshot WIPES local (the actual bug). ──
console.log('\ncontrol — without the guard the partial snapshot destroys data:');
{
  const broken = appSrc.replace(/if \(!window\.__allowEmptySave && localArr\.length >= 8 && remoteArr\.length < localArr\.length \* 0\.5\) \{[\s\S]*?continue;\s*\n\s*\}/, '/* guard removed */');
  const applied = broken !== appSrc;
  const ctx = makeCtx(broken);
  seed(ctx, mkMembers(40), mkInvoices(30));
  const partial = { members: [], invoices: [], coaches: [{ id: 'c1', name: 'Coach' }] };
  vm.runInContext(`mergeRemoteIntoState(${JSON.stringify(partial)}); mergeRemoteIntoState(${JSON.stringify(partial)});`, ctx);
  ok('control patch applied', applied);
  ok('WITHOUT guard: members are wiped (0) — confirms the bug', memberCount(ctx) === 0, memberCount(ctx));
}

// ── 3) The guard must NOT block a LEGITIMATE normal sync (a real add + a single delete). ──
console.log('\nlegitimate syncs still work (guard is not over-broad):');
{
  const ctx = makeCtx(appSrc);
  seed(ctx, mkMembers(40), mkInvoices(30));
  // Remote: same 40 members but ONE edited + ONE new (41 total), invoices unchanged.
  const full = mkMembers(40); full[0] = { id: 'm1', name: 'Member 1 EDITED', sport: 'Boxing' }; full.push({ id: 'm41', name: 'New Member', sport: 'MMA' });
  const remote = { members: full, invoices: mkInvoices(30), coaches: [] };
  vm.runInContext(`mergeRemoteIntoState(${JSON.stringify(remote)});`, ctx);
  ok('a normal remote (edit + add) merges → 41 members', memberCount(ctx) === 41, memberCount(ctx));
  ok('the edited member took the remote change', /Member 1 EDITED/.test(vm.runInContext('JSON.stringify(state.members.find(m=>m.id==="m1"))', ctx)));
}

// ── 4) A genuine SMALL delete (remote = local-1, above the 50% floor) still propagates. ──
console.log('\na single genuine delete still propagates:');
{
  const ctx = makeCtx(appSrc);
  seed(ctx, mkMembers(40), mkInvoices(30));
  const remote = { members: mkMembers(39), invoices: mkInvoices(30), coaches: [] };   // one member removed remotely
  vm.runInContext(`mergeRemoteIntoState(${JSON.stringify(remote)}); mergeRemoteIntoState(${JSON.stringify(remote)});`, ctx);  // 2-strike delete
  ok('39 members (the one real delete propagated, guard did not block it)', memberCount(ctx) === 39, memberCount(ctx));
}

console.log('\nPARTIAL-SNAPSHOT GUARD:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
