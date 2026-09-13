// v6.375 — a PRODUCT invoice must show its contents (which products, how many) right in the
// invoices LIST, not only when you open Edit. invoiceProductLines() resolves the items from the
// linked SALE (or parses the description), and each product row renders a "🛍 2× X · 1× Y" summary.
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

// seed: 2 products, a product invoice linked to a sale (2× Protein Bar, 1× Gloves), a membership invoice
vm.runInContext(`
  state.products = [{id:1,name:'Protein Bar',price:15},{id:2,name:'Boxing Gloves',price:120}];
  state.invoices = [
    {id:900, category:'Product', activityType:'sale', description:'Sale: 2× Protein Bar · 1× Boxing Gloves — Ali', amount:150, customerId:5, customerName:'Ali'},
    {id:901, category:'Membership', description:'Karate', amount:600, customerId:5, sport:'Karate'},
    {id:902, category:'Product', activityType:'sale', description:'Sale: 3× Water Bottle — Walk-in', amount:30, customerId:null, customerName:'Walk-in'} // no linked sale → description fallback
  ];
  state.sales = [{id:1, invoiceId:900, items:[{productId:1,name:'Protein Bar',qty:2,unitPrice:15},{productId:2,name:'Boxing Gloves',qty:1,unitPrice:120}], total:150}];
  state.members = [{id:5,name:'Ali',phone:'55512345'}]; state.coaches=[]; if(!state.settings) state.settings={};
`, ctx);

const lines = vm.runInContext('invoiceProductLines', ctx);
const summary = vm.runInContext('invoiceProductSummaryHtml', ctx);
const inv = (id) => vm.runInContext(`state.invoices.find(x=>x.id===${id})`, ctx);

console.log('invoiceProductLines():');
const l900 = lines(inv(900));
ok('product invoice → resolves items from the linked sale', l900.length === 2, l900);
ok('...with correct product names', l900[0].name === 'Protein Bar' && l900[1].name === 'Boxing Gloves', l900.map(x => x.name));
ok('...with correct quantities', l900[0].qty === 2 && l900[1].qty === 1, l900.map(x => x.qty));
ok('...with unit prices', l900[0].unitPrice === 15 && l900[1].unitPrice === 120, l900.map(x => x.unitPrice));
ok('membership invoice → NO product lines', lines(inv(901)).length === 0);
const l902 = lines(inv(902));
ok('product invoice with NO linked sale → parses items from the description', l902.length === 1 && l902[0].name === 'Water Bottle' && l902[0].qty === 3, l902);

console.log('\ninvoiceProductSummaryHtml():');
const s900 = summary(inv(900));
ok('renders a 🛍 product summary', /🛍/.test(s900) && /2× Protein Bar/.test(s900) && /1× Boxing Gloves/.test(s900), s900.slice(0, 80));
ok('membership invoice → empty summary', summary(inv(901)) === '');
ok('walk-in product (desc fallback) → shows the parsed item', /3× Water Bottle/.test(summary(inv(902))));

console.log('\nrow wiring (the invoices LIST actually shows it):');
ok('the row builds prodSummary via invoiceProductSummaryHtml', /const prodSummary = \(typeof invoiceProductSummaryHtml === 'function'\) \? invoiceProductSummaryHtml\(i\)/.test(pagesSrc));
ok('the customer cell injects prodSummary (member branch)', /\$\{cust\.phone[\s\S]{0,120}\$\{prodSummary\}/.test(pagesSrc));
ok('the walk-in cell also injects prodSummary', /split\(\/\\s\/\)\.slice\(0, 2\)\.join\(' '\)\)\}<\/span>\$\{prodSummary\}/.test(pagesSrc));

// truncation: 4 items → show 3 + "+1 more"
vm.runInContext(`state.sales.push({id:2, invoiceId:903, items:[{productId:1,name:'A',qty:1},{productId:1,name:'B',qty:1},{productId:1,name:'C',qty:1},{productId:1,name:'D',qty:1}]});
  state.invoices.push({id:903,category:'Product',activityType:'sale',description:'Sale: many',customerId:5});`, ctx);
const s903 = summary(inv(903));
ok('4+ items → shows first 3 then "+N more"', /\+1/.test(s903) && /more|أخرى/.test(s903), s903.slice(0, 120));

console.log('\nINVOICE PRODUCT DETAILS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
