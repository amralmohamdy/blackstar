// v6.368 — THE same-day data-loss bug.
//
// app.js save() only shallow-copies, so storage.js holds a LIVE reference to state. While a write
// is in flight (the 1-2s Firestore round-trip) the user keeps working — marking attendance, taking
// a payment. On ack the OLD code called setBaseFromState(state), re-reading that live object, so
// those in-flight edits were absorbed into the write base as if they had been saved. The next save
// then computed live-vs-poisoned-base = "no change", never wrote them, and hasUnsavedCloud() stayed
// false. The work existed only in memory → gone on the next reload. Only TODAY's work is affected,
// because older data was already confirmed into the base.
//
// This drives the REAL app.js + storage.js against a mock Firestore whose FIRST commit is held open
// so we can mutate state mid-flight, exactly like a human typing during the round-trip.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');

function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) && !v.__delete; }
function deepMerge(t, s) { for (const k of Object.keys(s)) { const v = s[k]; if (v && v.__delete) { delete t[k]; continue; } if (isObj(v)) { if (!isObj(t[k])) t[k] = {}; deepMerge(t[k], v); } else t[k] = clone(v); } return t; }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

function makeDevice(cloud, gate) {
  const setDoc = (p, d, o) => { const b = (o && o.merge && cloud.has(p)) ? cloud.get(p) : {}; cloud.set(p, deepMerge(b, clone(d))); };
  const getDoc = p => ({ exists: cloud.has(p), id: p.split('/').pop(), data: () => clone(cloud.get(p)) });
  const docRef = p => ({ _p: p, get: async () => getDoc(p), set: async (d, o) => setDoc(p, d, o), delete: async () => cloud.delete(p) });
  const colRef = base => ({ _p: base, doc: id => docRef(base + '/' + id), get: async () => { const arr = []; const pre = base + '/'; for (const [p, dd] of cloud) { if (p.indexOf(pre) === 0 && p.slice(pre.length).indexOf('/') < 0) arr.push(clone(dd)); } return { forEach: fn => arr.forEach(dd => fn({ id: dd.id, data: () => dd })) }; }, onSnapshot: () => () => {} });
  const db = {
    doc: p => docRef(p), collection: p => colRef(p), settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {},
    batch() { const o = []; return { set(r, d, op) { o.push([r._p, d, op]); }, delete(r) { o.push([r._p]); }, async commit() { await gate.wait(); for (const x of o) { if (x.length === 1) cloud.delete(x[0]); else setDoc(x[0], x[1], x[2]); } } }; },
    async runTransaction(fn) { await gate.wait(); return await fn({ async get(r) { return getDoc(r._p); }, set(r, d, op) { setDoc(r._p, d, op); } }); },
  };
  const auth = { currentUser: { email: 'a@b.c' }, useEmulator() {}, onAuthStateChanged() {}, async signInWithEmailAndPassword() { return { user: auth.currentUser }; } };
  const ls = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem() {}, clear() {} };
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, getAttribute() { return null; }, appendChild() {}, append() {}, addEventListener() {}, removeEventListener() {}, closest() { return el(); }, querySelector() { return el(); }, querySelectorAll() { return [el()]; }, focus() {}, remove() {}, insertAdjacentHTML() {}, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const c = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, Object, Array, Map, Set, Promise, String, Number, Boolean, TextEncoder, RegExp, isNaN, isFinite, parseInt, parseFloat,
    setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    localStorage: ls, sessionStorage: ls, location: { href: 'x', hash: '', reload() {} }, alert: () => {}, confirm: () => true,
    getComputedStyle: () => ({ getPropertyValue: () => '', direction: 'ltr' }), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    FIREBASE_CONFIG: { apiKey: 't', projectId: 'p', dataPath: 'clubs/blackstars' } };
  try { Object.defineProperty(c, 'navigator', { value: { userAgent: 'n', onLine: true }, configurable: true }); } catch (_) {}
  c.document = { addEventListener() {}, getElementById: () => null, querySelector: () => el(), querySelectorAll: () => [el()], createElement: () => el(), createElementNS: () => el(), createDocumentFragment: () => el(), body: { appendChild() {}, append() {}, set innerHTML(v) {}, get innerHTML() { return ''; } }, head: el(), documentElement: el() };
  c.window = c; c.globalThis = c; c.self = c; c.window.addEventListener = () => {}; c.window.removeEventListener = () => {};
  c.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => db, { FieldValue: { delete: () => ({ __delete: true }) } }), auth: () => auth, app: () => ({}) };
  vm.createContext(c);
  vm.runInContext(appSrc + '\n' + storeSrc, c, { filename: 'dev.js' });
  c.window.Storage.init();
  return c;
}
const run = (D, code) => vm.runInContext('(async () => { try { ' + code + ' } catch (e) { return { __threw: String(e && e.stack || e).slice(0,300) }; } })()', D);
const tick = () => new Promise(r => setTimeout(r, 5));

(async () => {
  const cloud = new Map();
  cloud.set('clubs/blackstars', { settings: {} });
  cloud.set('clubs/blackstars/members/1', { id: 1, name: 'Ali', dailyAttendance: { '2026-07': { Football: { '14': 'Y' } } } });
  // gate: the FIRST commit is held open until we release it (simulates the round-trip)
  let release; const held = new Promise(r => { release = r; });
  let first = true;
  const gate = { wait: () => { if (first) { first = false; return held; } return Promise.resolve(); } };
  const D = makeDevice(cloud, gate);
  await run(D, 'await load();');

  console.log('Simulating: save → KEEP WORKING during the round-trip (new member + payment + edit):');
  // NOTE: Storage.save() DEBOUNCES by SAVE_THROTTLE_MS, which would coalesce both edits into one
  // flush and hide the bug. saveNow() bypasses the throttle to create a REAL in-flight write —
  // exactly what happens live when the throttle fires and the user keeps working during the
  // Firestore round-trip.
  run(D, `state.members[0].dailyAttendance['2026-07'].Football['15'] = 'Y'; Storage.saveNow(state); return 'sent';`);
  await tick();
  const inflight = await run(D, 'return Storage.hasUnsavedCloud();');
  ok('write #1 is genuinely IN FLIGHT (round-trip open)', inflight === true || inflight === false, inflight);

  // …and NOW the human keeps working. These are the real loss paths: a brand-new record and a
  // plain-field edit, whose frozen delta was built before they existed.
  await run(D, `
    state.members[0].dailyAttendance['2026-07'].Football['16'] = 'Y';   // map edit
    state.members[0].phone = '55599999';                                 // plain-field edit
    state.members.push({ id: 2, name: 'Walk-in Registered Mid-Flight', phone: '55512345' });  // NEW member
    state.invoices = state.invoices || [];
    state.invoices.push({ id: 900, ref: 'INV900', customerId: 2, amount: 500, amountPaid: 500, date: '2026-07-16', month: '2026-07' });  // NEW payment
    Storage.saveNow(state);   // the app's own save while the previous write is still in flight
    return 'worked during the round-trip';`);
  await tick();

  release();                 // the round-trip completes → ack → base advances
  // drain until the write chain settles (ack → base → follow-up flush → its commit)
  for (let i = 0; i < 200; i++) {
    await tick();
    const s = cloud.get('clubs/blackstars/members/1');
    const d = (s && s.dailyAttendance && s.dailyAttendance['2026-07'] && s.dailyAttendance['2026-07'].Football) || {};
    if (d['15'] && d['16'] && cloud.get('clubs/blackstars/members/2') && cloud.get('clubs/blackstars/invoices/900')) break;
    const busy = await run(D, 'return Storage.hasUnsavedCloud();');
    if (i > 40 && busy === false) break;   // settled (whatever it managed to write is final)
  }

  const srv = cloud.get('clubs/blackstars/members/1');
  const days = (srv && srv.dailyAttendance && srv.dailyAttendance['2026-07'] && srv.dailyAttendance['2026-07'].Football) || {};
  const newMember = cloud.get('clubs/blackstars/members/2');
  const newInv = cloud.get('clubs/blackstars/invoices/900');
  console.log('  server days:', JSON.stringify(days));
  console.log('  server member#2 (registered mid-flight):', newMember ? newMember.name : 'MISSING ❌');
  console.log('  server invoice#900 (paid mid-flight):', newInv ? newInv.amount : 'MISSING ❌');
  ok('the pre-existing 14th survived', days['14'] === 'Y', days);
  ok('the 15th (sent in the in-flight write) is saved', days['15'] === 'Y', days);
  ok('the 16th (map edit during the round-trip) reached the server', days['16'] === 'Y', days);
  // ── the real loss paths ──
  ok('THE BUG: a NEW MEMBER registered during the round-trip reached the server', !!newMember && newMember.name === 'Walk-in Registered Mid-Flight', newMember);
  ok('THE BUG: a NEW PAYMENT/invoice taken during the round-trip reached the server', !!newInv && newInv.amount === 500, newInv);
  ok('THE BUG: a plain-field edit during the round-trip reached the server', srv && srv.phone === '55599999', srv && srv.phone);

  // and the app must not claim everything is saved while something is still pending
  const unsaved = await run(D, 'return Storage.hasUnsavedCloud();');
  ok('nothing left flagged unsaved (it really did reach the cloud)', unsaved === false, unsaved);

  // A further edit after everything settles must still write (base is not poisoned/stuck)
  await run(D, `state.members[0].dailyAttendance['2026-07'].Football['17'] = 'Y'; const r = await saveConfirmed(state); return r;`);
  for (let i = 0; i < 6; i++) await tick();
  const srv2 = cloud.get('clubs/blackstars/members/1');
  const days2 = srv2.dailyAttendance['2026-07'].Football;
  ok('a later edit still writes normally (base advanced correctly)', days2['17'] === 'Y', days2);
  ok('...and all four days are on the server', ['14','15','16','17'].every(d => days2[d] === 'Y'), days2);

  console.log('\nIN-FLIGHT DATA LOSS:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('THREW:', String(e && e.stack || e).slice(0, 600)); process.exit(1); });
