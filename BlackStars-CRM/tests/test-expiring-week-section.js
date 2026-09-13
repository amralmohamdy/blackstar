// v6.371 — the Expiring Soon screen gets a new "Expiring within 7 days" SECTION, a non-overlapping
// tier between "≤ threshold (ASAP)" and "≤ 30 days". A member expiring in 4–7 days appears there
// and NOWHERE else; the ≤30 KPI still counts everyone within a month (incl. the 4–7 tier).
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const cap = {};
const el = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el('x'); }, querySelector: () => el('x'), querySelectorAll: () => [], focus() {}, remove() {} });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-17';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => el('#' + id), querySelector: (s) => el(s), querySelectorAll: () => [], createElement: () => el('x'), createElementNS: () => el('x'), createDocumentFragment: () => el('x'), body: el('body'), head: el('head'), documentElement: el('html') };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// members at known day-offsets from TODAY. NOTE: daysUntil() uses the REAL system clock, so we must
// anchor dates to the app's actual TODAY (also derived from the real clock) — a hardcoded string
// would drift with the wall clock and mis-bucket boundary members.
ctx.currentRole = () => 'admin';
const addDays = (d) => vm.runInContext(`addDays(TODAY, ${d})`, ctx);
const mem = (id, name, off) => ({ id, name, phone: '5551234' + id, expiryDate: addDays(off), status: 'Active',
  enrollments: [{ sport: 'Karate', classes: 8, start: '2026-06-01' }],
  subscriptions: [{ activity: 'Karate', totalClasses: 8, start: '2026-06-01', end: addDays(off), status: 'active' }] });
vm.runInContext(`state.members = ${JSON.stringify([
  mem(1, 'Expired', -5), mem(2, 'ASAP-2d', 2), mem(3, 'ASAP-3d', 3),
  mem(4, 'Week-4d', 4), mem(5, 'Week-7d', 7), mem(6, 'Upcoming-8d', 8), mem(7, 'Upcoming-20d', 20),
])}; state.coaches = []; if(!state.settings) state.settings = {};`, ctx);

function render() { cap['#exp-sections'] = undefined; const r = vm.runInContext(`(function(){ try { PAGES.expiring(document.getElementById('main')); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx); return r === 'ok' ? (cap['#exp-sections'] || {})._h || '' : r; }
const html = render();

console.log('section render (threshold = 3):');
ok('renders without throwing', typeof html === 'string' && !html.startsWith('THREW'), String(html).slice(0, 80));
ok('the new "Expiring within 7 days" section exists', /Expiring within 7 days/.test(html));
ok('...it contains the 4-day and 7-day members', /Week-4d/.test(html) && /Week-7d/.test(html));
// non-overlap: a section boundary — the 4/7-day members must NOT also be in the "within 3 days" or "within 30 days" chunks
const sec = (title, next) => { const i = html.indexOf(title); const j = next ? html.indexOf(next, i + 1) : html.length; return i < 0 ? '' : html.slice(i, j < 0 ? html.length : j); };
const asapChunk = sec('Expiring within 3 days', 'Expiring within 7 days');
const weekChunk = sec('Expiring within 7 days', 'Already expired');
const upcomingChunk = sec('Expiring within 30 days', null);
ok('ASAP section (≤3) has the 2d/3d members, NOT the 4d/7d', /ASAP-2d/.test(asapChunk) && /ASAP-3d/.test(asapChunk) && !/Week-4d/.test(asapChunk) && !/Week-7d/.test(asapChunk), asapChunk.slice(0, 40));
ok('Week section has 4d/7d, NOT the 8d/20d', /Week-4d/.test(weekChunk) && /Week-7d/.test(weekChunk) && !/Upcoming-8d/.test(weekChunk) && !/Upcoming-20d/.test(weekChunk));
ok('≤30 section has the 8d/20d, NOT the 4d/7d (no double-listing)', /Upcoming-8d/.test(upcomingChunk) && /Upcoming-20d/.test(upcomingChunk) && !/Week-4d/.test(upcomingChunk) && !/Week-7d/.test(upcomingChunk));
// order: ASAP → within 7 → expired → within 30
ok('section order: ≤3 → ≤7 → expired → ≤30', html.indexOf('Expiring within 3 days') < html.indexOf('Expiring within 7 days') && html.indexOf('Expiring within 7 days') < html.indexOf('Expiring within 30 days'));

console.log('\nsource wiring:');
ok('a separate week bucket carves (threshold,7] out of upcoming', /else if \(d <= 7\) week\.push/.test(pagesSrc));
ok('≤30 KPI counts week + upcoming (stays correct)', /\$\{week\.length \+ upcoming\.length\}/.test(pagesSrc));
ok('week section only shown when threshold < 7 (no empty/overlap)', /filter\.bucket === 'upcoming'\) && threshold < 7/.test(pagesSrc));
ok('select-all + header-count know the week bucket', /b === 'week' \? week\.filter\(matchFilter\)/.test(pagesSrc) && /bucket === 'week' \? week\.filter\(matchFilter\)/.test(pagesSrc));

console.log('\nEXPIRING WEEK SECTION:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
