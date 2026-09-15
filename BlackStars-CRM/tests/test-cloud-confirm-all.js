// v6.344 — EVERY write goes through withCloudConfirm, which now re-reads the affected records
// from the SERVER and shows them in the same locked popup the attendance flow uses.
//   Part A: readBackFromCloud (records, deletes, settings keys) — real source from app.js
//   Part B: cloudRecordCardHtml renders the SERVER doc, never local state
//   Part C: withCloudConfirm end-to-end against a mock Firestore (real app.js + storage.js)
//   Part D: source-level sweep of all 21 call sites
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// ══ shared mock Firestore ═══════════════════════════════════════════════════════════════
function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v) && !v.__delete; }
function deepMerge(t, s) { for (const k of Object.keys(s)) { const v = s[k]; if (v && v.__delete) { delete t[k]; continue; } if (isObj(v)) { if (!isObj(t[k])) t[k] = {}; deepMerge(t[k], v); } else t[k] = clone(v); } return t; }
function makeDevice(cloud, flags) {
  const setDoc = (p, d, o) => { const b = (o && o.merge && cloud.has(p)) ? cloud.get(p) : {}; cloud.set(p, deepMerge(b, clone(d))); };
  const getDoc = p => { if (flags.read) throw Object.assign(new Error('unavailable'), { code: 'unavailable' }); return { exists: cloud.has(p), id: p.split('/').pop(), data: () => clone(cloud.get(p)) }; };
  const docRef = p => ({ _p: p, get: async () => getDoc(p), set: async (d, o) => setDoc(p, d, o), delete: async () => cloud.delete(p) });
  const colRef = base => ({ _p: base, doc: id => docRef(base + '/' + id), get: async () => { if (flags.read) throw new Error('unavailable'); const arr = []; const pre = base + '/'; for (const [p, d] of cloud) { if (p.indexOf(pre) === 0 && p.slice(pre.length).indexOf('/') < 0) arr.push(clone(d)); } return { forEach: fn => arr.forEach(d => fn({ id: d.id, data: () => d })) }; } });
  const db = { doc: p => docRef(p), collection: p => colRef(p), settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {},
    batch() { const o = []; return { set(r, d, op) { o.push([r._p, d, op]); }, delete(r) { o.push([r._p]); }, async commit() { for (const x of o) { if (x.length === 1) cloud.delete(x[0]); else setDoc(x[0], x[1], x[2]); } } }; },
    async runTransaction(fn) { return await fn({ async get(r) { return getDoc(r._p); }, set(r, d, op) { setDoc(r._p, d, op); } }); } };
  const auth = { currentUser: { email: 'a@b.c' }, useEmulator() {}, onAuthStateChanged() {}, async signInWithEmailAndPassword() { return { user: auth.currentUser }; } };
  const ls = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem() {}, clear() {} };
  const mk = () => ({ id: '', style: {}, dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {}, appendChild(c) { return c; }, append() {}, addEventListener() {}, querySelector: () => mk(), querySelectorAll: () => [mk()], focus() {}, remove() {}, set innerHTML(v) {}, get innerHTML() { return ''; } });
  const c = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, Object, Array, Map, Set, Promise, String, Number, Boolean, TextEncoder, RegExp, isNaN, parseInt, parseFloat,
    setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0,
    localStorage: ls, sessionStorage: ls, location: { href: 'x', hash: '', reload() {} }, alert: () => {}, confirm: () => true,
    getComputedStyle: () => ({ getPropertyValue: () => '', direction: 'ltr' }), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    FIREBASE_CONFIG: { apiKey: 't', projectId: 'p', dataPath: 'clubs/blackstars' } };
  try { Object.defineProperty(c, 'navigator', { value: { userAgent: 'n' }, configurable: true }); } catch (_) {}
  c.document = { addEventListener() {}, getElementById: () => null, querySelector: () => mk(), querySelectorAll: () => [mk()], createElement: () => mk(), createElementNS: () => mk(), createDocumentFragment: () => mk(), body: { appendChild() {}, append() {} }, head: mk(), documentElement: mk() };
  c.window = c; c.globalThis = c; c.self = c; c.window.addEventListener = () => {}; c.window.removeEventListener = () => {};
  c.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => db, { FieldValue: { delete: () => ({ __delete: true }) } }), auth: () => auth, app: () => ({}) };
  vm.createContext(c);
  vm.runInContext(appSrc + '\n' + storeSrc, c, { filename: 'dev.js' });
  c.window.Storage.init();
  return c;
}
const inCtx = (D, code) => vm.runInContext('(async () => { ' + code + ' })()', D);
const P = 'clubs/blackstars';

(async () => {
  const cloud = new Map();
  cloud.set(P, { settings: { userRoles: { 'coach@bs.qa': { role: 'coach' } } } });
  cloud.set(P + '/members/1', { id: 1, name: 'Fares Hamdan', nameArabic: 'فارس حمدان', phone: '50413948', status: 'Active', expiryDate: '2026-08-01' });
  cloud.set(P + '/invoices/9', { id: 9, ref: 'INV639142', customerName: 'Fares Hamdan', amount: 425, amountPaid: 200, date: '2026-06-28' });
  cloud.set(P + '/expenses/3', { id: 3, category: 'Equipment', description: 'Mats', amount: 300, date: '2026-07-01' });
  cloud.set(P + '/salaries/4', { id: 4, coach: 'Mostafa', month: '2026-06', amount: 1500 });
  for (let i = 2; i <= 6; i++) cloud.set(P + '/members/' + i, { id: i, name: 'M' + i });
  const flags = { read: false };
  const D = makeDevice(cloud, flags);
  await inCtx(D, 'await load();');

  // ══ Part A — readBackFromCloud ══════════════════════════════════════════════════════════
  console.log('A — readBackFromCloud reads the SERVER');
  let r = await inCtx(D, 'return await readBackFromCloud([{collection:"members", id:1}]);');
  ok('existing record → ok, card rendered', r.ok === true && r.cards.includes('Fares Hamdan'));
  ok('card shows the ARABIC name from the server', r.cards.includes('فارس حمدان'));

  r = await inCtx(D, 'return await readBackFromCloud([{collection:"members", id:99999}]);');
  ok('missing record → NOT ok', r.ok === false && r.missing === 'members/99999', r.missing);

  r = await inCtx(D, 'return await readBackFromCloud([{collection:"members", id:99999, absent:true, label:"gone"}]);');
  ok('absent target that IS absent → ok', r.ok === true && r.cards.includes('confirmed deleted'));

  r = await inCtx(D, 'return await readBackFromCloud([{collection:"members", id:1, absent:true}]);');
  ok('absent target that still EXISTS → NOT ok (delete did not stick)', r.ok === false, r.missing);

  r = await inCtx(D, 'return await readBackFromCloud([{metaPath:["settings","userRoles","coach@bs.qa"], label:"coach@bs.qa"}]);');
  ok('settings key present on server → ok', r.ok === true && r.cards.includes('coach@bs.qa'));

  r = await inCtx(D, 'return await readBackFromCloud([{metaPath:["settings","userRoles","nobody@bs.qa"]}]);');
  ok('settings key missing → NOT ok', r.ok === false, r.missing);

  r = await inCtx(D, 'return await readBackFromCloud([{metaPath:["settings","userRoles","nobody@bs.qa"], absent:true, label:"nobody"}]);');
  ok('settings key expected ABSENT and is absent → ok', r.ok === true && r.cards.includes('removed on the server'));

  r = await inCtx(D, 'return await readBackFromCloud([{metaPath:["settings","userRoles","coach@bs.qa"], absent:true}]);');
  ok('settings key expected absent but still there → NOT ok (the reappearing-user bug)', r.ok === false);

  r = await inCtx(D, 'return await readBackFromCloud([{collection:"members",id:1},{collection:"invoices",id:9}]);');
  ok('multiple targets → all cards rendered', r.ok === true && r.cards.includes('Fares Hamdan') && r.cards.includes('INV639142'));

  r = await inCtx(D, 'return await readBackFromCloud([]);');
  ok('no targets → ok with no cards (ack-only write)', r.ok === true && r.cards === '');

  flags.read = true;
  r = await inCtx(D, 'return await readBackFromCloud([{collection:"members", id:1}]);');
  ok('cloud unreachable → NOT ok (never a false success)', r.ok === false);
  flags.read = false;

  // ══ Part B — cards are built from the SERVER doc ════════════════════════════════════════
  console.log('\nB — cards render the server document');
  const card = await inCtx(D, 'return cloudRecordCardHtml("invoices", await Storage.fetchDoc("invoices", 9));');
  ok('invoice card shows ref, amount, paid, balance', card.includes('INV639142') && card.includes('425') && card.includes('200') && card.includes('225'), card.slice(0, 80));
  const exp = await inCtx(D, 'return cloudRecordCardHtml("expenses", await Storage.fetchDoc("expenses", 3));');
  ok('expense card shows category + amount', exp.includes('Equipment') && exp.includes('300'));
  const sal = await inCtx(D, 'return cloudRecordCardHtml("salaries", await Storage.fetchDoc("salaries", 4));');
  ok('salary card shows coach + amount', sal.includes('Mostafa') && sal.includes('1,500'));
  const unknown = await inCtx(D, 'return cloudRecordCardHtml("families", {id: 7, name: "Marri family"});');
  ok('unknown collection falls back to a generic card (no lying)', unknown.includes('Marri family'));

  // a LOCAL edit that was never saved must not appear on the card
  await inCtx(D, 'const m = state.members.find(x => String(x.id) === "1"); m.name = "LOCAL ONLY"; return 1;');
  const card2 = await inCtx(D, 'return cloudRecordCardHtml("members", await Storage.fetchDoc("members", 1));');
  ok('card ignores an unsaved LOCAL edit (proves it is the server copy)', card2.includes('Fares Hamdan') && !card2.includes('LOCAL ONLY'));
  await inCtx(D, 'const m = state.members.find(x => String(x.id) === "1"); m.name = "Fares Hamdan"; return 1;');

  // ══ Part C — withCloudConfirm end to end ════════════════════════════════════════════════
  console.log('\nC — withCloudConfirm shows the locked popup');
  await inCtx(D, 'window.__popups = []; window.showLockedModal = (o) => { window.__popups.push(o); };');

  let res = await inCtx(D, `window.__popups = [];
    state.members.push({id: 777, name: 'New Guy', nameArabic: 'الجديد', phone: '111', status: 'Active'});
    const okRes = await withCloudConfirm({ verify: [{collection:'members', id:777}], okMsg: 'Member added' });
    return { okRes, popups: window.__popups };`);
  ok('create + verify → returns true', res.okRes === true);
  ok('exactly one popup, the success variant', res.popups.length === 1 && res.popups[0].okay === true);
  ok('popup shows the record AS THE SERVER HAS IT', res.popups[0].body.includes('New Guy') && res.popups[0].body.includes('الجديد'));
  ok('popup says it was read back from the server', /Read back from the server/.test(res.popups[0].body));

  res = await inCtx(D, `window.__popups = [];
    const okRes = await withCloudConfirm({ verify: [{collection:'members', id:888888}], okMsg: 'Nope' });
    return { okRes, popups: window.__popups };`);
  ok('verify a record that was never written → returns false', res.okRes === false);
  ok('...and shows the FAILURE popup', res.popups.length === 1 && res.popups[0].okay === false);
  ok('...naming what could not be verified', res.popups[0].body.includes('members/888888'));

  // no verify targets → still a popup, but it must NOT claim a read-back
  res = await inCtx(D, `window.__popups = [];
    state.members.push({id: 778, name: 'Bulk'});
    const okRes = await withCloudConfirm({ okMsg: 'Bulk repair done' });
    return { okRes, popups: window.__popups };`);
  ok('write with no verify targets → success popup', res.okRes === true && res.popups[0].okay === true);
  ok('...honestly says only that the server ACKNOWLEDGED the write', /acknowledged the write/.test(res.popups[0].body) && !/Read back from the server/.test(res.popups[0].body));

  // onOk runs BEFORE the popup (it re-renders and would otherwise wipe it)
  res = await inCtx(D, `window.__popups = []; const order = [];
    state.members.push({id: 779, name: 'Ordered'});
    await withCloudConfirm({ verify: [{collection:'members', id:779}], onOk: () => order.push('onOk'), okMsg: 'x' });
    order.push('popup:' + window.__popups.length);
    return order;`);
  ok('onOk runs before the confirmation popup is shown', res[0] === 'onOk' && res[1] === 'popup:1', res);

  // afterOk fires when OK is pressed
  res = await inCtx(D, `window.__popups = [];
    await withCloudConfirm({ verify: [{collection:'members', id:779}], okMsg: 'x', afterOk: () => 'reopened' });
    return typeof window.__popups[0].onClose;`);
  ok('afterOk is wired to the popup OK button', res === 'function');

  // delete confirmation
  res = await inCtx(D, `window.__popups = [];
    const okRes = await withCloudConfirm({ verify: [{collection:'members', id:999999, absent:true, label:'Old sub'}], okMsg: 'Deleted' });
    return { okRes, popups: window.__popups };`);
  ok('delete verified as absent → success popup confirming deletion', res.okRes === true && res.popups[0].body.includes('confirmed deleted'));

  // v6.349 — a delete with a SNAPSHOT shows WHAT was removed, read back as gone
  res = await inCtx(D, `window.__popups = [];
    const snap = { id: 555, name: 'Bye Bye', nameArabic: 'وداعاً', phone: '99', status: 'Expired' };
    const okRes = await withCloudConfirm({ verify: [{collection:'members', id:555, absent:true, snapshot: snap}], okMsg: 'Removed' });
    return { okRes, popups: window.__popups };`);
  ok('delete-with-snapshot → success (record is gone from server)', res.okRes === true && res.popups[0].okay === true);
  ok('...popup shows the DELETED marker', /DELETED/.test(res.popups[0].body));
  ok('...popup shows the removed record details from the snapshot', res.popups[0].body.includes('Bye Bye') && res.popups[0].body.includes('وداعاً'));
  ok('...popup confirms it is gone from the server', /confirmed gone from the server/.test(res.popups[0].body));

  // a snapshot delete where the record is STILL on the server → failure (delete did not stick)
  res = await inCtx(D, `window.__popups = [];
    const okRes = await withCloudConfirm({ verify: [{collection:'members', id:1, absent:true, snapshot:{id:1,name:'Still Here'}}], okMsg: 'x' });
    return { okRes, popups: window.__popups };`);
  ok('delete that did NOT stick (record still present) → failure popup', res.okRes === false && res.popups[0].okay === false);

  // ══ Part D — the source sweep ═══════════════════════════════════════════════════════════
  console.log('\nD — every call site + shared shell');
  // The sweep is ongoing (v6.347 added ~23 operational-CRUD sites). Assert the coverage keeps
  // GROWING and that money/CRUD handlers all verify, rather than pinning an exact count.
  const sites = (pagesSrc.match(/withCloudConfirm\(\{/g) || []).length;
  ok(`withCloudConfirm covers a growing set of writes (${sites} ≥ 40)`, sites >= 40, sites);
  // Sites that intentionally have NO verify target (ack-only popup): bulk-repair tools with no
  // single record, plus the salary advance/undo-carry (multi-record). Everything else must verify.
  const lines = pagesSrc.split('\n');
  const noVerify = [];
  lines.forEach((l, i) => {
    if (!l.includes('withCloudConfirm({')) return;
    const window6 = lines.slice(i, i + 6).join('\n');
    if (!/\bverify\b/.test(window6)) noVerify.push(l.trim());   // matches `verify:` and `{ verify, … }` shorthand
  });
  const ackOnlyOk = noVerify.every(l =>
    /okMsg, onOk: \(\) => render\(\)/.test(l)                 // the 3 bulk-repair tools
    || /Advance saved/.test(l)                                // recordAdvance (multi-field salary)
    || /Carry-forward undone/.test(l));                       // undoSalaryCarry (multi-record)
  ok('every no-verify site is an intentional ack-only one (bulk repair / advance / carry-undo)', ackOnlyOk, noVerify);
  // v6.347 operational-CRUD conversions each verify their record:
  ok('freeze verifies the member', /verify: \[\{ collection: 'members', id: m\.id \}\], okMsg: `\$\{m\.name\} frozen/.test(pagesSrc));
  ok('unfreeze verifies the member', /verify: \[\{ collection: 'members', id: m\.id \}\], okMsg: `\$\{m\.name\} unfrozen/.test(pagesSrc));
  ok('coach add/edit verifies the coach', /verify: \[\{ collection: 'coaches', id: _savedCoachId \}\]/.test(pagesSrc));
  ok('coach delete verifies it is gone', /collection: 'coaches', id, absent: true/.test(pagesSrc));
  ok('product save verifies the product', /verify: \[\{ collection: 'products', id: _prodId \}\]/.test(pagesSrc));
  ok('product delete verifies it is gone', /collection: 'products', id, absent: true/.test(pagesSrc));
  ok('driver add verifies the driver', /verify: \[\{ collection: 'drivers', id: d\.id \}\]/.test(pagesSrc));
  ok('cash count verifies the entry', /collection: 'cashCounts', id: entry\.id/.test(pagesSrc));
  ok('note save verifies the note', /verify: \[\{ collection: 'notes', id: _noteId \}\]/.test(pagesSrc));
  ok('trial save verifies the trial', /verify: \[\{ collection: 'trials', id: data\.id \}\]/.test(pagesSrc));
  ok('rental delete verifies it is gone', /collection: 'rentals', id, absent: true/.test(pagesSrc));
  // v6.349 delete sweep + snapshots
  ok('coach delete shows the removed record (snapshot)', /collection: 'coaches', id, absent: true, label: c\.name, snapshot: c/.test(pagesSrc));
  ok('product delete shows the removed record', /collection: 'products', id, absent: true, label: p\.name, snapshot: p/.test(pagesSrc));
  ok('hard-delete invoice shows the removed invoice', /collection: 'invoices', id, absent: true, snapshot: inv/.test(pagesSrc));
  ok('delete sale shows the removed sale', /collection: 'sales', id, absent: true, snapshot: s/.test(pagesSrc));
  ok('delete cash collection shows the removed expense', /collection: 'expenses', id, absent: true, snapshot: ex/.test(pagesSrc));
  ok('delete advance shows the removed salary record', /collection: 'salaries', id, absent: true, snapshot: adv/.test(pagesSrc));
  ok('member archive/restore verifies the member', /verify: \[\{ collection: 'members', id: m\.id \}\], okMsg: `📦 Archived/.test(pagesSrc) && /okMsg: `Restored \$\{m\.name\}`/.test(pagesSrc));
  ok('invoice archive (soft) shows the live record, permanent shows the snapshot', /collection: 'invoices', id, absent: true, snapshot: inv \}\], okMsg: t\('Invoice permanently deleted/.test(pagesSrc));
  ok('the delete-snapshot renderer exists in readBackFromCloud', /if \(v\.snapshot\) \{[\s\S]{0,200}cloudRecordCardHtml\(v\.collection, v\.snapshot\)/.test(appSrc));
  ok('money paths verify: expense', /verify: \[\{ collection: 'expenses', id: _expId \}\]/.test(pagesSrc));
  ok('money paths verify: salary payment + its expense', /collection: 'salaries', id: rec\.id.*collection: 'expenses', id: _salExpense\.id/s.test(pagesSrc));
  ok('salary reopens the manager only AFTER OK (afterOk, not .finally)', /afterOk: \(\) => markPaid\(coachId, monthKey\)/.test(pagesSrc) && !/\}\)\.finally\(\(\) => markPaid/.test(pagesSrc));
  ok('member edit verifies the member', /verify: \[\{ collection: 'members', id: data\.id \}\], onOk: _finishOk/.test(pagesSrc));
  ok('sibling add verifies the member', /verify: \[\{ collection: 'members', id: data\.id \}\], okMsg: `\$\{t\('Sibling added/.test(pagesSrc));
  ok('user-role grant verifies the settings key on the server', /metaPath: \['settings', 'userRoles', e\]/.test(pagesSrc));
  ok('user-role removal verifies the key is GONE', /metaPath: \['settings', 'userRoles', email\], absent: true/.test(pagesSrc));
  ok('subscription delete verifies the member doc', /verify: \[\{ collection: 'members', id: m\.id \}\], okMsg: `🗑/.test(pagesSrc));
  ok('there is ONE locked-modal implementation', (pagesSrc.match(/window\.showLockedModal = function/g) || []).length === 1);
  ok('attendance reuses it instead of duplicating', /_attendanceModal = \(o\) => window\.showLockedModal\(o\)/.test(pagesSrc));
  ok('the locked modal still refuses Esc + backdrop', /bd\.dataset\.modalLocked === '1'\) return;/.test(pagesSrc));
  ok('Storage exposes fetchMeta', /fetchMeta\(\) \{ try \{ return \(activeBackend/.test(storeSrc));
  // The write-failure branch shows the LOCKED popup (okay:false) with the raw reason — not a toast.
  // (v6.354 refactored the message to be auth-aware, so match on the reason display + the branch.)
  // Intent: the failure path shows the LOCKED popup carrying the raw reason — never a toast.
  // (Matched on the popup itself rather than a variable name, which v6.393 renamed.)
  ok('failed WRITES also get the locked popup (not a toast)', /const _failHeadline =/.test(appSrc) && /popup\(\{\s*okay: false,/.test(appSrc) && /escapeHtml\(String\(reason\)\)/.test(appSrc));
  // v6.407 — a permission-denied write can be EITHER a lapsed session OR a genuine server refusal,
  // and Firebase keeps currentUser populated even on a dead token, so the popup can no longer tell
  // them apart itself. It shows ONE neutral "re-checking your sign-in" message and hands off to
  // showSessionResumePrompt(), which refreshes the token and decides: sign-in card if the token is
  // dead, "server refused" bar if the token is alive but the write is still denied.
  ok('an auth-coded write shows one neutral "re-checking your sign-in" message',
    /_isAuthReason\s*\n?\s*\?\s*t\('Not saved yet — re-checking your sign-in'/.test(appSrc));
  ok('the popup no longer pre-labels it session-lapse vs server-refused',
    !/_sessionLapsed = _isAuthReason/.test(appSrc) && !/_serverRefused = _isAuthReason/.test(appSrc));
  ok('any auth-coded failure hands off to the self-diagnosing resume prompt',
    /if \(_isAuthReason && typeof window\.showSessionResumePrompt === 'function'\)/.test(appSrc));
  // v6.347 loader
  ok('a saving loader overlay exists', /function showSavingOverlay\(\)/.test(appSrc) && /function hideSavingOverlay\(\)/.test(appSrc));
  ok('the loader is shown at the start of withCloudConfirm', /if \(wantOverlay\) showSavingOverlay\(\);/.test(appSrc));
  ok('the loader is hidden before the popup', /if \(wantOverlay\) hideSavingOverlay\(\);/.test(appSrc));
  ok('the loader can be opted out with overlay:false', /opts\.overlay !== false/.test(appSrc));

  console.log('\nCLOUD CONFIRM ALL:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('THREW:', String(e && e.stack || e).slice(0, 1500)); process.exit(1); });
