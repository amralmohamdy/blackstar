// v6.374 — SESSION HARDENING. A Firebase write attempted with a LAPSED id token fails with
// permission-denied (the "red bar, data not saving" the owner sees after a laptop sleeps). The
// storage layer must (1) auto-recover: refresh the token and re-send the SAME delta so the write
// lands with no user action, FAST (not after a 2s backoff); (2) expose refreshAuth() so app.js can
// PROACTIVELY re-mint the token on wake/reconnect before any write is even attempted.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const storageSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

// ── A faithful-enough Firestore mock: a key→data store, batch writes that REJECT while the token
// is stale, and getIdToken(force:true) that "re-mints" the token so subsequent writes succeed.
const cloud = new Map();                 // "col/id" → data
let tokenFresh = false;                  // starts STALE (as after a long sleep)
let forceRefreshCount = 0, commitAttempts = 0, commitFails = 0;
const applyOps = (ops) => { for (const o of ops) { if (o.kind === 'del') cloud.delete(o.key); else cloud.set(o.key, Object.assign(cloud.get(o.key) || {}, o.data)); } };
const makeBatch = () => { const ops = []; return {
  set(ref, data) { ops.push({ kind: 'set', key: ref.__key, data }); },
  delete(ref) { ops.push({ kind: 'del', key: ref.__key }); },
  commit() { commitAttempts++; if (!tokenFresh) { commitFails++; const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return Promise.reject(e); } applyOps(ops); return Promise.resolve(); },
}; };
const docRef = (key) => ({ __key: key, onSnapshot() { return () => {}; }, get() { return Promise.resolve({ exists: cloud.has(key), data: () => cloud.get(key) }); } });
const colRef = (pathStr) => ({ __path: pathStr, doc: (id) => docRef(pathStr.split('/').pop() + '/' + id), onSnapshot() { return () => {}; }, get() { return Promise.resolve({ forEach() {} }); } });
const db = {
  settings() {}, enablePersistence() { return Promise.resolve(); }, useEmulator() {},
  doc: (p) => docRef('__meta__'), collection: (p) => colRef(p), batch: makeBatch,
  runTransaction: (fn) => fn({ get: (ref) => Promise.resolve({ exists: cloud.has(ref.__key), data: () => cloud.get(ref.__key) }), set: (ref, data) => cloud.set(ref.__key, data) }),
};
const auth = { currentUser: { email: 'admin@blackstars.qa', uid: 'u1', getIdToken(force) { if (force) { forceRefreshCount++; tokenFresh = true; } return Promise.resolve('tok'); } }, onAuthStateChanged() {}, useEmulator() {} };
const firestoreFn = Object.assign(() => db, { FieldValue: { delete: () => ({ __delete: true }) } });

const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder,
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {}, Promise };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
ctx.FIREBASE_CONFIG = { apiKey: 'test', dataPath: 'clubs/blackstars' };
ctx.firebase = { initializeApp: () => ({}), firestore: firestoreFn, auth: () => auth, app: () => ({}) };
vm.createContext(ctx);
vm.runInContext(storageSrc, ctx);

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const Storage = ctx.Storage;
  ok('Storage.init picks the cloud backend', Storage.init() === 'firebase');
  ok('facade exposes refreshAuth()', typeof Storage.refreshAuth === 'function');

  // ── 1) AUTO-RECOVERY: a write while the token is stale fails, but recovers WITHOUT user action.
  const state = { members: [{ id: 'm1', name: 'Ali', note: 'first' }], invoices: [{ id: 'i1', amount: 100 }] };
  const t0 = Date.now();
  Storage.saveNow(state);
  await sleep(60);
  ok('the first write FAILED (stale token → permission-denied)', commitFails >= 1, { commitFails });
  ok('...so it is flagged unsaved (red bar would show)', Storage.hasUnsavedCloud() === true);
  // auto-retry should refresh the token FAST (≤ ~500ms) and land the write
  await sleep(700);
  const recoveredMs = Date.now() - t0;
  ok('the token was force-refreshed by the auto-retry', forceRefreshCount >= 1, { forceRefreshCount });
  ok('the write LANDED in the cloud (member m1 present)', cloud.has('members/m1') && cloud.get('members/m1').name === 'Ali', [...cloud.keys()]);
  ok('nothing is left unsaved after recovery', Storage.hasUnsavedCloud() === false);
  ok('recovery was FAST (auth-fast retry ~350ms, not the 2s backoff)', recoveredMs < 1500, { recoveredMs });

  // ── 2) PROACTIVE refresh: refreshAuth() re-mints the token (what app.js calls on wake/reconnect).
  tokenFresh = false; const before = forceRefreshCount;
  const r = await Storage.refreshAuth();
  ok('refreshAuth() returns true and force-refreshed the token', r === true && forceRefreshCount === before + 1, { r, delta: forceRefreshCount - before });

  // ── 3) refreshAuth() also re-sends anything still unsaved once the token is fresh.
  tokenFresh = false;
  Storage.saveNow({ members: [{ id: 'm1', name: 'Ali', note: 'second' }, { id: 'm2', name: 'Sara' }], invoices: [{ id: 'i1', amount: 100 }] });
  await sleep(60);
  ok('a fresh stale-token write is again unsaved', Storage.hasUnsavedCloud() === true);
  await Storage.refreshAuth();          // simulate wake → proactive refresh
  await sleep(120);
  ok('refreshAuth() re-sent the unsaved write → m2 now in cloud', cloud.has('members/m2'), [...cloud.keys()]);
  ok('and it is no longer unsaved', Storage.hasUnsavedCloud() === false);

  // ── 4) SOURCE WIRING in app.js: proactive keep-alive on timer + wake/reconnect events.
  console.log('\napp.js session keep-alive wiring:');
  ok('a token-refresh heartbeat interval exists', /setInterval\(\(\) => _keepAuthAlive\('interval'\), TOKEN_REFRESH_MS\)/.test(appSrc));
  ok('refreshes on tab re-focus (visibilitychange visible)', /visibilitychange[\s\S]{0,120}visibilityState === 'visible'\) _keepAuthAlive\('visible'\)/.test(appSrc));
  ok('refreshes on network reconnect (online) and window focus', /addEventListener\('online', \(\) => _keepAuthAlive\('online'\)\)/.test(appSrc) && /addEventListener\('focus', \(\) => _keepAuthAlive\('focus'\)\)/.test(appSrc));
  ok('keep-alive calls Storage.refreshAuth()', /_keepAuthAlive = \(why\) => \{[\s\S]{0,200}Storage\.refreshAuth\(\)/.test(appSrc));

  // v6.468 — hardened keep-alive: shorter interval, self-retrying wake refresh, activity warming.
  console.log('\nv6.468 hardened keep-alive:');
  ok('the refresh interval is 15 min (was 30) — survives background throttling', /TOKEN_REFRESH_MS = 15 \* 60 \* 1000/.test(appSrc));
  ok('a failed refresh RETRIES with backoff (covers no-network-on-wake)', /_scheduleAuthRetry = \(\) =>/.test(appSrc) && /_AUTH_RETRY_DELAYS = \[/.test(appSrc));
  ok('it warms the token on user activity (active session never lapses)', /_onUserActivity/.test(appSrc) && /\['click', 'keydown', 'pointerdown'\]\.forEach/.test(appSrc));
  ok('it also refreshes on bfcache restore (pageshow)', /addEventListener\('pageshow', \(\) => _keepAuthAlive\('pageshow'\)\)/.test(appSrc));
  ok('failures + the prompt are breadcrumbed for diagnosis (window.__sessionLog)', /window\.__sessionLog = \(\)/.test(appSrc) && /blackstars-session-log/.test(appSrc));

  // ── 5) v6.407 — CORRECT lapsed-vs-refused DIAGNOSIS. Firebase keeps auth.currentUser populated
  // even when the ID token is DEAD, so keying the "signing in won't help" message off
  // `currentUser != null` mislabelled a genuinely-lapsed session. The red "server refused" bar
  // must appear ONLY when the token was actually refreshed (session alive) AND the write is still
  // refused; a token that cannot be refreshed must route to the sign-in prompt (which fixes it).
  // (The three runtime cases are verified live in the browser; these lock the source wiring.)
  console.log('\nv6.407 session diagnosis wiring:');
  ok('showSessionResumePrompt captures whether the token could be refreshed (tokenAlive)',
    /let tokenAlive = false;[\s\S]{0,200}refreshAuth[\s\S]{0,80}tokenAlive = !!/.test(appSrc), null);
  ok('the "server refused" bar is gated on tokenAlive && _who (not currentUser alone)',
    /if \(tokenAlive && _who\) \{ showServerRefusedBar\(\); return; \}/.test(appSrc), null);
  ok('a dead token (tokenAlive false) falls through to the in-place sign-in prompt',
    /if \(tokenAlive && _who\) \{ showServerRefusedBar\(\); return; \}[\s\S]{0,400}_sessionPromptOpen = true;/.test(appSrc), null);
  ok('withCloudConfirm no longer pre-judges "signing in again will not help"',
    !/you are still signed in, so signing in again will not help[\s\S]{0,60}send this code to support/i.test(appSrc), null);
  ok('withCloudConfirm routes ANY auth-coded failure to the self-diagnosing resume prompt',
    /if \(_isAuthReason && typeof window\.showSessionResumePrompt === 'function'\)/.test(appSrc), null);
  ok('the dead _stillSignedIn / _sessionLapsed / _serverRefused branching is gone from the confirm popup',
    !/_serverRefused = _isAuthReason/.test(appSrc) && !/const _sessionLapsed = /.test(appSrc), null);

  // ── 6) v6.464 — BULLETPROOF RECOVERY when the in-place sign-in itself won't take (the reported
  // "session expired AND login not working" loop). The usual cause is a stale AUTO-FILLED password
  // in a masked field. The prompt now: (a) has a 👁 reveal so the admin can see/fix the password;
  // (b) maps the modern consolidated Firebase codes to a clear "wrong password" message; (c) on a
  // bad password clears + reveals + refocuses the field; and (d) ALWAYS offers a ↻ Reload escape
  // hatch that takes them to the normal login (work is journaled → replays after login, nothing lost).
  console.log('\nv6.464 recovery affordances:');
  ok('the sign-in prompt has a 👁 show/hide password toggle', /id="sr-eye"/.test(appSrc) && /sr-eye'\)\.onclick[\s\S]{0,140}p\.type = p\.type === 'password' \? 'text' : 'password'/.test(appSrc));
  ok('the sign-in prompt has a ↻ Reload escape hatch', /id="sr-reload"/.test(appSrc) && /sr-reload'\)\.onclick[\s\S]{0,160}location\.reload\(\)/.test(appSrc));
  ok('the reload hatch flushes pending before reloading (belt-and-suspenders)', /sr-reload'\)\.onclick[\s\S]{0,120}Storage\.flushPending\(\)/.test(appSrc));
  ok('a bad password clears + reveals + refocuses the field', /e\.authKind === 'bad-password'[\s\S]{0,140}p\.value = ''; p\.type = 'text'/.test(appSrc));
  ok('storage maps consolidated Firebase codes to a clear wrong-password message',
    /invalid-credential\|invalid-login-credentials/.test(storageSrc) && /authKind = 'bad-password'/.test(storageSrc));
  ok('storage distinguishes throttled / network / disabled auth failures',
    /too-many-requests/.test(storageSrc) && /network-request-failed/.test(storageSrc) && /user-disabled/.test(storageSrc));

  // ── 7) v6.471 — the "Later" button is gone (it just dismissed the box without fixing anything),
  // and a SUCCESSFUL sign-in ALWAYS closes the box: a failing/ throwing pending-write retry must
  // never trap the admin in the dialog after they've re-authenticated (the "signed in but the box
  // won't go away" bug). Only a real sign-in failure keeps it open.
  console.log('\nv6.471 sign-in prompt hardening:');
  ok('the Later button is removed', !/id="sr-later"/.test(appSrc) && !/sr-later'\)\.onclick/.test(appSrc));
  ok('the Reload escape hatch + Sign-in button remain', /id="sr-reload"/.test(appSrc) && /id="sr-go"/.test(appSrc));
  ok('a sign-in FAILURE returns early (keeps the box open with a message)',
    /await window\.Storage\.signIn\(em, pass\);[\s\S]{0,60}\} catch \(e\) \{[\s\S]{0,800}return;\s*\}/.test(appSrc));
  ok('after sign-in, a retry error does NOT keep the box open (always close)',
    /try \{ const r = await \(window\.Storage\.retryNow[\s\S]{0,120}\} catch \(_\) \{ ok = false; \}\s*close\(\);/.test(appSrc));

  console.log('\nSESSION RECOVERY:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
})();
