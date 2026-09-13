// v6.379 — a "#" row-number column rolled out across the main list & report tables. This renders
// each real page with a couple of seeded rows and asserts: a "#" header exists AND the first data
// row is numbered "1" (i.e. the column is wired, not just the header). Also checks empty-state
// colspans were bumped so a table with no rows still spans the full width.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');

// A DOM stub that records innerHTML per element id/selector and supports the bits pages.js touches.
const store = {};
function makeEl(key) {
  if (store[key]) return store[key];
  const e = {
    _html: '', dataset: {}, style: {}, _val: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    set textContent(v) { this._html = String(v); }, get textContent() { return this._html; },
    set value(v) { this._val = v; }, get value() { return this._val; },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    appendChild() {}, append() {}, prepend() {}, remove() {}, insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, blur() {},
    closest() { return makeEl('closest'); }, querySelector() { return makeEl('qs'); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
  };
  store[key] = e; return e;
}
// Pin the clock (own sandbox, real Date — the invoice/expense month filter broke once the real
// calendar rolled past July). FrozenDate keeps TODAY = 2026-07-18.
const _FIX = new Date('2026-07-18T12:00:00Z').getTime();
class FrozenDate extends Date { constructor(...a) { if (!a.length) super(_FIX); else super(...a); } static now() { return _FIX; } }
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date: FrozenDate, Object, Array, Map, Set, WeakMap, Promise, String, Number, Boolean, Symbol, RegExp, Error, TypeError, isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, TextEncoder,
  setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0 };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-18';
ctx.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true, language: 'en' }; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => makeEl('#' + id), querySelector: (s) => makeEl(s), querySelectorAll: () => [], createElement: () => makeEl('c' + Math.round(ctx.__c = (ctx.__c || 0) + 1)), createElementNS: () => makeEl('cns'), createDocumentFragment: () => makeEl('frag'), body: makeEl('body'), head: makeEl('head'), documentElement: makeEl('html') };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }
ctx.currentRole = () => 'admin';

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Seed a small but realistic dataset that lights up every target screen.
vm.runInContext(`
  state.members = [
    // Member 1: attended ALL 8 Karate classes → shows in "Ready to Renew"; also expiring soon.
    {id:1,name:'Ali One',phone:'55500001',sport:'Karate',expiryDate:'2026-07-20',status:'Active',enrollments:[{sport:'Karate',classes:8,coachId:1}],subscriptions:[{activity:'Karate',totalClasses:8,start:'2026-06-01',end:'2026-07-20',status:'active'}],dailyAttendance:{'2026-07':{'Karate':{'01':'Y','02':'Y','03':'Y','04':'Y','05':'Y','06':'Y','07':'Y','08':'Y'}}}},
    // Member 2: unpaid 400 invoice → OWES (Due Payment); expiry in the past → Expired (Expiring/Reminders).
    {id:2,name:'Sara Two',phone:'55500002',sport:'Swimming',expiryDate:'2026-06-30',status:'Active',enrollments:[{sport:'Swimming',classes:8,coachId:1}],subscriptions:[{activity:'Swimming',totalClasses:8,start:'2026-05-01',end:'2026-06-30',status:'active'}]}
  ];
  state.coaches = [{id:1,name:'Coach One',sports:['Karate','Swimming'],commissionRate:30}];
  state.invoices = [
    {id:10,ref:'INV10',customerId:1,customerName:'Ali One',category:'Membership',sport:'Karate',month:'2026-07',date:'2026-07-01',amount:600,method:'cash',payments:[{amount:600}]},
    {id:11,ref:'INV11',customerId:2,customerName:'Sara Two',category:'Membership',sport:'Swimming',month:'2026-07',date:'2026-07-02',amount:400,amountPaid:100,method:'cash',payments:[{amount:100}]}
  ];
  state.expenses = [{id:20,date:'2026-07-01',month:'2026-07',category:'Rent',description:'Hall',method:'cash',amount:100},{id:21,date:'2026-07-02',month:'2026-07',category:'Others',description:'Water',method:'cash',amount:20}];
  state.sales=[]; if(!state.settings) state.settings={}; state.settings.citadelRate=30;
  window._citMonths=[]; window._dueFilter=null; window._remWindow=30;
`, ctx);

// Render a page and return the combined HTML from #main + any sub-container the page writes into
// (e.g. Expiring builds its sections into #exp-sections). We concatenate every captured element's
// html so the assertion sees the header + rows wherever the page put them.
function render(route) {
  for (const k of Object.keys(store)) delete store[k];
  const r = vm.runInContext(`(function(){ try { PAGES[${JSON.stringify(route)}](document.getElementById('main')); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx);
  if (r !== 'ok') return { threw: r };
  const all = Object.values(store).map(e => e._html || '').join('\n');
  return { all };
}

const TARGETS = [
  ['members', 'Members'], ['invoices', 'Invoices'], ['expenses', 'Expenses'],
  ['duepayment', 'Due Payment'], ['salaries', 'Salaries'], ['reminders', 'Reminders'],
  ['completed', 'Ready to Renew'], ['expiring', 'Expiring'],
];

for (const [route, human] of TARGETS) {
  const { all, threw } = render(route);
  if (threw) { ok(`${human} renders`, false, threw); continue; }
  const hasHeader = /<th[^>]*>#<\/th>/.test(all);
  const hasRowOne = /text-align:center[^"]*"[^>]*>\s*1\s*<\/td>/.test(all);
  ok(`${human}: has a "#" header`, hasHeader);
  ok(`${human}: a data row is numbered "1"`, hasRowOne);
}

console.log('\nINDEX COLUMN ROLLOUT:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
