// v6.376 — the Product Sales screen (PAGES.productsales) gets a "Buyers" column: for each product,
// the distinct members / walk-ins who bought it, most-units first, members flagged 🎟, truncated
// "+N more". This test renders the real page against seeded sales and asserts the buyers appear.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const cap = {};
const el = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el('x'); }, querySelector: () => el('x'), querySelectorAll: () => [], focus() {}, remove() {} });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-18';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => el('#' + id), querySelector: (s) => el(s), querySelectorAll: () => [], createElement: () => el('x'), createElementNS: () => el('x'), createDocumentFragment: () => el('x'), body: el('body'), head: el('head'), documentElement: el('html') };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

ctx.currentRole = () => 'admin';
// 2 products; Protein Bar bought by Ali(member,2) + Sara(member,1) + a walk-in(3); Gloves by Ali only.
vm.runInContext(`
  state.members = [{id:7001,name:'Mohammed Ali',phone:'55501234'},{id:7002,name:'Sara',phone:'55505678'}];
  state.products = [{id:9001,name:'Protein Bar',price:15,stock:20},{id:9002,name:'Boxing Gloves',price:120,stock:5}];
  state.sales = [
    {id:1,date:'2026-07-16',month:'2026-07',customerType:'member',customerId:7001,customerName:'Mohammed Ali',items:[{productId:9001,name:'Protein Bar',qty:2,unitPrice:15},{productId:9002,name:'Boxing Gloves',qty:1,unitPrice:120}],total:150},
    {id:2,date:'2026-07-16',month:'2026-07',customerType:'member',customerId:7002,customerName:'Sara',items:[{productId:9001,name:'Protein Bar',qty:1,unitPrice:15}],total:15},
    {id:3,date:'2026-07-16',month:'2026-07',customerType:'walkin',customerId:null,customerName:'Cash Guy',items:[{productId:9001,name:'Protein Bar',qty:3,unitPrice:15}],total:45}
  ];
  if(!window._psState) window._psState={}; window._psState={preset:'all',from:'',to:'',sort:'revenue'};
  state.coaches=[]; if(!state.settings) state.settings={};
`, ctx);

const render = () => { cap['#ps-tbody'] = undefined; const r = vm.runInContext(`(function(){ try { PAGES.productsales(document.getElementById('main')); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx); return r === 'ok' ? (cap['#ps-tbody'] || {})._h || '' : r; };
const html = render();

console.log('Product Sales — Buyers column:');
ok('renders without throwing', typeof html === 'string' && !html.startsWith('THREW'), String(html).slice(0, 90));
ok('a "Buyers" column header exists', /<th>[^<]*Buyers/.test(pagesSrc));
ok('Protein Bar row shows its member buyers (Ali + Sara)', /Mohammed Ali/.test(html) && /Sara/.test(html));
ok('members are flagged with 🎟', /🎟 Mohammed Ali/.test(html) || /🎟 Sara/.test(html), html.slice(0, 300));
ok('the walk-in buyer is shown too', /Cash Guy/.test(html));
ok('Boxing Gloves row shows Ali (its only buyer)', /Boxing Gloves/.test(html) && /Mohammed Ali/.test(html));
// buyers sorted by qty desc → for Protein Bar, walk-in (3) before Ali (2) before Sara (1)
const pbSeg = (() => { const i = html.indexOf('Protein Bar'); const j = html.indexOf('</tr>', i); return html.slice(i, j < 0 ? html.length : j); })();
ok('buyers ordered by units desc (Cash Guy 3 → Ali 2 → Sara 1)', pbSeg.indexOf('Cash Guy') < pbSeg.indexOf('Mohammed Ali') && pbSeg.indexOf('Mohammed Ali') < pbSeg.indexOf('Sara'), pbSeg.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160));

console.log('\nsource wiring:');
ok('build() accumulates a per-product buyers Map', /buyers: new Map\(\)/.test(pagesSrc) && /byProduct\[key\]\.buyers\.set\(/.test(pagesSrc));
ok('resolves the buyer via customerInfo(sale)', /customerInfo\(sale\)/.test(pagesSrc));
ok('empty-state colspan bumped to 7', /colspan="7"[\s\S]{0,80}No product sales/.test(pagesSrc));
ok('CSV export includes a Buyers column', /'Units', 'Revenue', 'Buyers', 'Sales', 'Stock'/.test(pagesSrc));

console.log('\nPRODUCT SALES BUYERS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
