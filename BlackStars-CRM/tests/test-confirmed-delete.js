// v6.387 — "I get a success message, then refresh and the data is still there."
// Deleting a sport ran `save(); render(); toast('Deleted')`. `save()` is DEBOUNCED (~1.5s) and
// fire-and-forget, so the success toast fired BEFORE the write left the browser: refresh inside
// that window (or hit the `b.date.localeCompare` crash in the re-render) and the delete was lost
// while the user had been told it worked. Every destructive handler now confirms with the CLOUD
// before claiming success, and reports an explicit failure when the write did not land.
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

console.log('the shared primitive exists:');
{
  const ctx = makeCtx(appSrc);
  ok('confirmSaved is exposed on window', typeof ctx.confirmSaved === 'function');
}

console.log('\nbehaviour — success is shown ONLY when the cloud confirms:');
{
  const ctx = makeCtx(appSrc);
  const run = (cloudResult) => vm.runInContext(`(function(){
    const seen = [];
    window.toast = (msg, kind) => seen.push({ msg: String(msg), kind: kind || 'success' });
    window.save = () => true;
    window.Storage = { isCloud: () => true, saveAndConfirm: () => Promise.resolve(${JSON.stringify(cloudResult)}) };
    return confirmSaved('Deleted Kick Boxing').then(() => seen);
  })()`, ctx);

  return run({ ok: true }).then(good => {
    ok('cloud CONFIRMED → the user sees the success message', good.some(x => /Deleted Kick Boxing/.test(x.msg) && x.kind === 'success'), good);
    ok('...and no scary error alongside it', !good.some(x => x.kind === 'error'), good);

    return run({ ok: false, error: 'permission-denied' }).then(bad => {
      ok('cloud REJECTED → success is NOT claimed (the reported bug)', !bad.some(x => /Deleted Kick Boxing/.test(x.msg)), bad);
      ok('...the user is told it is NOT saved', bad.some(x => x.kind === 'error' && /NOT saved/i.test(x.msg)), bad);
      ok('...and the reason is surfaced', bad.some(x => /permission-denied/.test(x.msg)), bad);

      // a save() blocked locally (stale version) must also never read as success
      const blocked = vm.runInContext(`(function(){
        const seen = [];
        window.toast = (m, k) => seen.push({ msg: String(m), kind: k || 'success' });
        window.save = () => false;                       // blocked by the stale-version guard
        window.Storage = { isCloud: () => true, saveAndConfirm: () => Promise.resolve({ ok: true }) };
        return confirmSaved('Deleted X').then(() => seen);
      })()`, ctx);
      return blocked.then(b => {
        ok('a locally BLOCKED save is never reported as success', !b.some(x => /Deleted X/.test(x.msg)), b);
        finish();
      });
    });
  });
}

function finish() {
  console.log('\nsource wiring — no destructive action can claim success unconfirmed:');
  const L = pagesSrc.split('\n');
  const starts = [];
  L.forEach((ln, i) => { const m = ln.match(/^window\.([A-Za-z_]\w*) = function/); if (m) starts.push({ name: m[1], i }); });
  const risky = [];
  for (let k = 0; k < starts.length; k++) {
    const a = starts[k].i, b = (k + 1 < starts.length ? starts[k + 1].i : L.length);
    const body = L.slice(a, b).join('\n');
    if (!/\bsave\(\)/.test(body)) continue;
    if (/withCloudConfirm\(|saveConfirmed\(|confirmSaved\(/.test(body)) continue;
    if (!/toast\(/.test(body)) continue;
    if (!/^(delete|remove|hardDelete|permanently)/i.test(starts[k].name)) continue;
    risky.push(starts[k].name);
  }
  ok('ZERO destructive handlers left with fire-and-forget success', risky.length === 0, risky);
  ok('all 8 converted handlers call confirmSaved', (pagesSrc.match(/confirmSaved\(/g) || []).length >= 8);
  ok('deleteSportFull (the reported button) verifies the member doc on the SERVER',
    /verify: \[\{ collection: 'members', id: memberId \}\]/.test(pagesSrc));
  ok('permanentlyDeleteMember — the highest-stakes action — is confirmed',
    /confirmSaved\(`Permanently deleted \$\{m\.name\}`\)/.test(pagesSrc));

  console.log('\nthe crash that ALSO ate the delete (unguarded date sorts):');
  const unguarded = (pagesSrc.match(/\bb\.date\.localeCompare\(a\.date\)/g) || []).length;
  ok('no `b.date.localeCompare` left to throw on a row with no date', unguarded === 0, unguarded);
  const guarded = (pagesSrc.match(/String\(b\.date\s*\|\|\s*''\)\.localeCompare\(String\(a\.date\s*\|\|\s*''\)\)/g) || []).length;
  ok('the 6 crashing sorts are String()-guarded instead', guarded >= 6, guarded);
  // any remaining `.date.localeCompare` on a raw property would still throw — none may exist
  ok('no raw `.date.localeCompare(` survives anywhere', !/[^)]\.date\.localeCompare\(/.test(pagesSrc));

  console.log('\ncontrol — restore the OLD fire-and-forget behaviour and confirm it lies:');
  {
    // Put confirmSaved back to what every handler used to do: toast success unconditionally.
    const broken = appSrc.replace(
      /if \(r && r\.ok\) \{\n        if \(okMsg\) \{ try \{ toast\(okMsg, 'success'\); \} catch \(_\) \{\} \}/,
      "if (true) {\n        if (okMsg) { try { toast(okMsg, 'success'); } catch (_) {} }");
    ok('control patch applied', broken !== appSrc);
    const ctx = makeCtx(broken);
    return vm.runInContext(`(function(){
      const seen = [];
      window.toast = (m, k) => seen.push({ msg: String(m), kind: k || 'success' });
      window.save = () => true;
      window.Storage = { isCloud: () => true, saveAndConfirm: () => Promise.resolve({ ok: false, error: 'permission-denied' }) };
      return confirmSaved('Deleted Kick Boxing').then(() => seen);
    })()`, ctx).then(seen => {
      ok('WITHOUT the fix: a REJECTED cloud write still shows "Deleted" — exactly the reported bug',
        seen.some(x => /Deleted Kick Boxing/.test(x.msg) && x.kind === 'success'), seen);
      report();
    });
  }
}

function report() {
  console.log('\nCONFIRMED DELETE:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
}
