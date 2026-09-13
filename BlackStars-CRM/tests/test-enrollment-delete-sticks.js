// v6.391 — "I deleted a sport, the panel closed, it looked deleted — then I refreshed and it
// was still there." Two defects in removeEnrollmentData(), the helper behind the edit panel's
// 🗑 "delete as a MISTAKE" button:
//
//   1. NO TOMBSTONES. Every other delete path tombstones the rows it removes (see the
//      edit-pricing panel) precisely because the copy still sitting in the cloud otherwise looks
//      like a fresh REMOTE ADD to the next sync merge and gets re-added — the delete "bounces
//      back". This path never tombstoned, so the sport came back on the next sync.
//   2. HARD-REMOVED INVOICES. A single-sport invoice was spliced out of state.invoices entirely
//      instead of soft-deleted, leaving no tombstone for the collection merge — so the invoice
//      could be resurrected too, and it was not recoverable from the Archived view.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

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

// Jaber's shape from the screenshot: Kick Boxing (kept) + Swimming (deleted), each with a
// subscription (stable _sid) and a content-keyed enrollment, plus one Swimming-only invoice.
const SEED = `
  state.members = [{
    id: 270, name: 'Jaber', sport: 'Kick Boxing', coachId: 1,
    enrollments: [
      { sport: 'Kick Boxing', coachId: 1, classes: 12, price: 650 },
      { sport: 'Swimming',    coachId: 2, classes: 12, price: 650 }
    ],
    subscriptions: [
      { _sid: 'sub_kb', activity: 'Kick Boxing', coachId: 1, totalClasses: 12, start: '2026-07-08', end: '2026-08-07' },
      { _sid: 'sub_sw', activity: 'Swimming',    coachId: 2, totalClasses: 12, start: '2026-07-08', end: '2026-08-07' }
    ]
  }];
  state.invoices = [
    { id: 900, customerId: 270, category: 'Membership', sport: 'Swimming', amount: 650, lineItems: [{ sport: 'Swimming', price: 650 }] },
    { id: 901, customerId: 270, category: 'Membership', sport: 'Kick Boxing', amount: 650, lineItems: [{ sport: 'Kick Boxing', price: 650 }] }
  ];
  state.coaches = [{id:1,name:'Abdel Salam'},{id:2,name:'Mostafa'}];
  if (!state.settings) state.settings = {};
`;

console.log('the delete itself:');
{
  const ctx = makeCtx(appSrc);
  const out = vm.runInContext(`(function(){
    ${SEED}
    removeEnrollmentData(state.members[0], 'Swimming');
    const m = state.members[0];
    return {
      enr: m.enrollments.map(e => e.sport),
      subs: m.subscriptions.map(s => s.activity),
      invLive: state.invoices.filter(i => !i.deleted).map(i => i.id),
      invSoftDeleted: state.invoices.filter(i => i.deleted).map(i => i.id),
      stillPresent: state.invoices.map(i => i.id),
    };
  })()`, ctx);
  ok('the Swimming enrollment is gone', !out.enr.includes('Swimming'), out.enr);
  ok('the Swimming subscription is gone', !out.subs.includes('Swimming'), out.subs);
  ok('Kick Boxing is untouched', out.enr.includes('Kick Boxing') && out.subs.includes('Kick Boxing'), out);
  ok('the Swimming invoice is SOFT-deleted, not spliced away', out.invSoftDeleted.includes(900), out);
  ok('...so it still exists as a record (recoverable from Archived)', out.stillPresent.includes(900), out.stillPresent);
  ok('the Kick Boxing invoice stays live', out.invLive.includes(901), out.invLive);
}

console.log('\nthe reported bug — a concurrent sync must NOT resurrect it:');
{
  const ctx = makeCtx(appSrc);
  const out = vm.runInContext(`(function(){
    ${SEED}
    const m = state.members[0];
    // BASE = what the cloud last confirmed (still has Swimming)
    const base = JSON.parse(JSON.stringify(m));
    // the staff member deletes Swimming (this tombstones the rows)
    removeEnrollmentData(m, 'Swimming');
    const local = JSON.parse(JSON.stringify(m));
    // REMOTE = the cloud copy, which of course still has Swimming. This is exactly what the
    // write-time transaction reads back and merges against.
    const remote = JSON.parse(JSON.stringify(base));
    const mergedEnr = _mergeArrayById(base.enrollments, local.enrollments, remote.enrollments, 'members:270:enrollments');
    const mergedSub = _mergeArrayById(base.subscriptions, local.subscriptions, remote.subscriptions, 'members:270:subscriptions');
    return { enr: mergedEnr.map(e => e.sport), subs: mergedSub.map(s => s.activity) };
  })()`, ctx);
  ok('Swimming does NOT come back in enrollments', !out.enr.includes('Swimming'), out.enr);
  ok('Swimming does NOT come back in subscriptions', !out.subs.includes('Swimming'), out.subs);
  ok('Kick Boxing survives the merge', out.enr.includes('Kick Boxing') && out.subs.includes('Kick Boxing'), out);
}

console.log('\nthe harder case — the cloud copy was TOUCHED since the base (another device):');
{
  // If the cloud row differs from the base, the "removed locally & remote unchanged" rule can no
  // longer recognise the delete. Only the tombstone saves it. This is the case that made the
  // sport reappear for real.
  const ctx = makeCtx(appSrc);
  const out = vm.runInContext(`(function(){
    ${SEED}
    const m = state.members[0];
    const base = JSON.parse(JSON.stringify(m));
    removeEnrollmentData(m, 'Swimming');
    const local = JSON.parse(JSON.stringify(m));
    // another device ticked attendance on the Swimming subscription + edited its enrollment price
    const remote = JSON.parse(JSON.stringify(base));
    remote.subscriptions.find(s => s.activity === 'Swimming').attendedClasses = 3;
    remote.enrollments.find(e => e.sport === 'Swimming').price = 700;
    const mergedEnr = _mergeArrayById(base.enrollments, local.enrollments, remote.enrollments, 'members:270:enrollments');
    const mergedSub = _mergeArrayById(base.subscriptions, local.subscriptions, remote.subscriptions, 'members:270:subscriptions');
    return { enr: mergedEnr.map(e => e.sport), subs: mergedSub.map(s => s.activity) };
  })()`, ctx);
  ok('a touched-in-the-cloud subscription still stays deleted', !out.subs.includes('Swimming'), out.subs);
  ok('a touched-in-the-cloud enrollment still stays deleted', !out.enr.includes('Swimming'), out.enr);
}

console.log('\ncontrol — remove the tombstones and the bug returns:');
{
  const broken = appSrc.replace(
    /try \{\s*\n\s*if \(typeof window !== 'undefined' && typeof window\._tombstoneEl === 'function'\) \{\s*\n\s*_rmEnr\.forEach[\s\S]*?\n\s*\}\s*\n\s*\} catch \(_\) \{\}/,
    '/* tombstones removed for control */'
  );
  ok('control patch applied', broken !== appSrc);
  const ctx = makeCtx(broken);
  const out = vm.runInContext(`(function(){
    ${SEED}
    const m = state.members[0];
    const base = JSON.parse(JSON.stringify(m));
    removeEnrollmentData(m, 'Swimming');
    const local = JSON.parse(JSON.stringify(m));
    const remote = JSON.parse(JSON.stringify(base));
    remote.subscriptions.find(s => s.activity === 'Swimming').attendedClasses = 3;
    remote.enrollments.find(e => e.sport === 'Swimming').price = 700;
    return {
      subs: _mergeArrayById(base.subscriptions, local.subscriptions, remote.subscriptions, 'members:270:subscriptions').map(s => s.activity),
      enr:  _mergeArrayById(base.enrollments,  local.enrollments,  remote.enrollments,  'members:270:enrollments').map(e => e.sport),
    };
  })()`, ctx);
  ok('WITHOUT tombstones the deleted sport comes BACK (reproduces the report)',
    out.subs.includes('Swimming') || out.enr.includes('Swimming'), out);
}

console.log('\nthe delete now proves itself against the SERVER:');
{
  ok('removeEnrollmentMistake reads the member back from the cloud',
    /removeEnrollmentMistake[\s\S]{0,900}?withCloudConfirm\(\{[\s\S]{0,200}?verify: \[\{ collection: 'members', id: memberId \}\]/.test(pagesSrc));
  ok('...and no longer just fires a toast', !/removeEnrollmentData\(m, sport\);\s*\n\s*save\(\);/.test(pagesSrc));
}

console.log('\nENROLLMENT DELETE STICKS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
