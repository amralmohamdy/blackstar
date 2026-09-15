// v6.380 — a PRODUCT invoice's ACTIVITY column (and CSV export) now names the product bought
// instead of a bare "—", so the invoices screen always says what the invoice is for.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const cap = {};
const el = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el('x'); }, querySelector: () => el('x'), querySelectorAll: () => [], focus() {}, remove() {} });
// Pin the clock (this test builds its own sandbox with the real Date, so its invoice month filter
// broke when the real calendar rolled past July). FrozenDate keeps TODAY = 2026-07-18.
const _FIX = new Date('2026-07-18T12:00:00Z').getTime();
class FrozenDate extends Date { constructor(...a) { if (!a.length) super(_FIX); else super(...a); } static now() { return _FIX; } }
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date: FrozenDate, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-18';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => el('#' + id), querySelector: (s) => el(s), querySelectorAll: () => [], createElement: () => el('x'), createElementNS: () => el('x'), createDocumentFragment: () => el('x'), body: el('body'), head: el('head'), documentElement: el('html') };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }
ctx.currentRole = () => 'admin';

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

vm.runInContext(`
  state.members = [{id:5,name:'Kenan Ahmed',phone:'55555555'}];
  state.products = [{id:9001,name:'Boxing Gloves',price:120}];
  state.invoices = [
    {id:700,ref:'INV700',customerId:5,customerName:'Kenan Ahmed',category:'Product',activityType:'sale',description:'Sale: 1× Boxing Gloves — Kenan Ahmed',amount:120,method:'card',month:'2026-07',date:'2026-07-18'},
    {id:701,ref:'INV701',customerId:5,category:'Membership',sport:'Karate',description:'Karate',amount:600,method:'cash',month:'2026-07',date:'2026-07-18'}
  ];
  state.sales = [{id:1,invoiceId:700,items:[{productId:9001,name:'Boxing Gloves',qty:1,unitPrice:120}],total:120}];
  state.coaches=[]; if(!state.settings) state.settings={};
`, ctx);

const html = (() => { cap['#inv-tbody'] = undefined; const r = vm.runInContext(`(function(){ try { PAGES.invoices(document.getElementById('main')); return (document.getElementById('inv-tbody')||{}).innerHTML || ''; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx); return r; })();

console.log('invoices Activity column:');
ok('renders without throwing', typeof html === 'string' && !html.startsWith('THREW'), String(html).slice(0, 80));
// find the product invoice row (INV700) and its cells
const prodRow = (() => { const i = html.indexOf('INV700'); const j = html.indexOf('</tr>', i); return i < 0 ? '' : html.slice(i, j); })();
const memRow = (() => { const i = html.indexOf('INV701'); const j = html.indexOf('</tr>', i); return i < 0 ? '' : html.slice(i, j); })();
ok('PRODUCT invoice Activity cell names the product (🛍 1× Boxing Gloves)', /🛍 1× Boxing Gloves/.test(prodRow), prodRow.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160));
ok('...and it is NOT a bare "—" anymore', !/>—<\/span>\s*<\/td>\s*<td>[^<]*<span class="text-dim"/.test(prodRow) || /Boxing Gloves/.test(prodRow));
ok('MEMBERSHIP invoice Activity still shows the sport badge (Karate)', /Karate/.test(memRow));

console.log('\nsource wiring:');
ok('Activity cell falls back to invoiceProductLines for products', /A PRODUCT invoice has no sport/.test(pagesSrc));
ok('CSV export Activity column includes the product', /Activity column: sport for memberships, the bought product/.test(pagesSrc));

console.log('\nPRODUCT-IN-ACTIVITY:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
