// v6.378 — Citadel (company-share) screen: (1) recover the COURT-RENTAL renter's name (was "—"
// because the name lives on the linked rental, not the invoice) via customerInfo(); (2) a "#" index
// column on the contributing-invoices table; (3) Excel + PDF export of exactly what's on screen.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const cap = {};
const el = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el('x'); }, querySelector: () => el('x'), querySelectorAll: () => [], focus() {}, remove() {} });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-18';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => el('#' + id), querySelector: (s) => el(s), querySelectorAll: () => [], createElement: () => el('x'), createElementNS: () => el('x'), createDocumentFragment: () => el('x'), body: el('body'), head: el('head'), documentElement: el('html') };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }
ctx.currentRole = () => 'admin';

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Football membership (named member) + Football Court rent whose name is ONLY on the linked rental.
vm.runInContext(`
  state.members = [{id:1,name:'Kenan Raed'}];
  state.rentals = [{id:77,customerName:'Yared Chekoba',customerPhone:'55500011'}];
  state.invoices = [
    {id:900,ref:'INV900',customerId:1,category:'Membership',sport:'Football',month:'2026-06',date:'2026-06-10',amount:475},
    {id:901,ref:'INV901',category:'Court Rental',activityType:'rental',sport:'Football Court',rentalId:77,month:'2026-06',date:'2026-06-11',amount:200},
    {id:902,ref:'INV902',category:'Court Rental',activityType:'rental',sport:'Football Court',month:'2026-06',date:'2026-06-12',amount:45}
  ];
  if(!state.settings) state.settings={}; state.settings.citadelRate=30; window._citMonths=[];
`, ctx);

const cc = vm.runInContext('citadelCompute([])', ctx);
console.log('customer-name recovery (#2):');
const byRef = r => cc.details.find(d => d.ref === r);
ok('membership invoice keeps its member name', byRef('INV900') && byRef('INV900').customer === 'Kenan Raed', byRef('INV900') && byRef('INV900').customer);
ok('court-rental renter name RECOVERED from the linked rental (was "—")', byRef('INV901') && byRef('INV901').customer === 'Yared Chekoba', byRef('INV901') && byRef('INV901').customer);
ok('a rental with genuinely no customer still shows "—"', byRef('INV902') && byRef('INV902').customer === '—', byRef('INV902') && byRef('INV902').customer);

console.log('\n# index column (#3):');
const html = (() => { cap['#cit-detail'] = undefined; const r = vm.runInContext(`(function(){ try { PAGES.citadel(document.getElementById('main')); return document.getElementById('main').innerHTML; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx); return r; })();
ok('citadel renders without throwing', typeof html === 'string' && !html.startsWith('THREW'), String(html).slice(0, 90));
ok('the contributing-invoices table has a "#" header', /<th style="width:36px;text-align:center">#<\/th>/.test(pagesSrc));
ok('rows are numbered 1..N (map index + 1)', /details\.map\(\(d, i\) =>[\s\S]{0,90}\$\{i \+ 1\}/.test(pagesSrc));
ok('empty-state colspan bumped 6 → 7', /colspan="7"[\s\S]{0,80}No Football/.test(pagesSrc));

console.log('\nexport (#1):');
ok('Excel + PDF buttons exist on the screen', /id="cit-export-xlsx"/.test(pagesSrc) && /id="cit-export-pdf"/.test(pagesSrc));
ok('citadelExportXlsx + citadelExportPdf are defined', typeof vm.runInContext('citadelExportXlsx', ctx) === 'function' && typeof vm.runInContext('citadelExportPdf', ctx) === 'function');
// exercise the Excel builder with a captured XlsxMini
let captured = null;
ctx.XlsxMini = { downloadFile: (name, opts) => { captured = { name, opts }; } };
ctx.toast = () => {};
vm.runInContext('citadelExportXlsx(30, "All months")', ctx);
ok('Excel export calls XlsxMini with 2 sheets (Summary + Invoices)', captured && captured.opts.sheets.length === 2 && captured.opts.sheets[1].name === 'Invoices', captured && captured.opts.sheets.map(s => s.name));
const invSheet = captured && captured.opts.sheets[1].rows;
ok('Invoices sheet header starts with "#"', invSheet && invSheet[0][0] === '#', invSheet && invSheet[0]);
ok('Invoices sheet rows are numbered + carry the recovered name', invSheet && invSheet[1][0] === 1 && invSheet.some(r => r[3] === 'Yared Chekoba'), invSheet && invSheet.slice(1).map(r => [r[0], r[3]]));
ok('filename is citadel-*.xlsx', captured && /^citadel-.*\.xlsx$/.test(captured.name), captured && captured.name);

console.log('\nCITADEL EXPORT/NAMES/INDEX:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
