// v6.577 — Citadel: (1) auto-post the monthly facility-company share as a BANK expense
// ("Citadel Company Share"), idempotent + edit-safe like the Bank Commission auto row; (2) the
// report shows collected-from-members + paid-to-company + balance due; (3) PDF numeric headers are
// right-aligned (alignment fix).
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

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
ctx.save = () => {};

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Football membership 400 paid IN FULL + Swimming membership 200 paid HALF (100), same month.
vm.runInContext(`
  state.members = [{id:1,name:'Kenan Raed'},{id:2,name:'Lina S'}];
  state.expenses = [];
  state.invoices = [
    {id:900,ref:'INV900',customerId:1,category:'Membership',sport:'Football',month:'2026-06',date:'2026-06-10',amount:400,amountPaid:400,payments:[{amount:400,date:'2026-06-10',method:'cash'}]},
    {id:901,ref:'INV901',customerId:2,category:'Membership',sport:'Swimming',month:'2026-06',date:'2026-06-11',amount:200,amountPaid:100,payments:[{amount:100,date:'2026-06-11',method:'cash'}]}
  ];
  if(!state.settings) state.settings={}; state.settings.citadelRate=30; window._citMonths=[];
`, ctx);

console.log('citadelCompute — billed + collected:');
const cc = vm.runInContext('citadelCompute([])', ctx);
ok('grand billed = 600 (400 + 200)', Math.round(cc.grand) === 600, cc.grand);
ok('collected from members = 500 (400 full + 100 half)', Math.round(cc.paid) === 500, cc.paid);

console.log('\nsyncCitadelShare — auto bank expense:');
const changed1 = vm.runInContext('syncCitadelShare()', ctx);
ok('first sync reports a change', changed1 === true, changed1);
let exps = vm.runInContext('state.expenses.filter(e=>e.autoCitadelShare)', ctx);
ok('exactly ONE auto Citadel Company Share row created', exps.length === 1, exps.length);
ok('row category = "Citadel Company Share"', exps[0] && exps[0].category === 'Citadel Company Share', exps[0] && exps[0].category);
ok('row method = bank', exps[0] && exps[0].method === 'bank', exps[0] && exps[0].method);
ok('row month = 2026-06', exps[0] && exps[0].month === '2026-06', exps[0] && exps[0].month);
ok('row amount = 180 (600 × 30%)', exps[0] && Math.round(exps[0].amount) === 180, exps[0] && exps[0].amount);

console.log('\nidempotency + edit-safety:');
const changed2 = vm.runInContext('syncCitadelShare()', ctx);
ok('second sync makes NO change (idempotent)', changed2 === false, changed2);
exps = vm.runInContext('state.expenses.filter(e=>e.autoCitadelShare)', ctx);
ok('still exactly one row (no duplicate)', exps.length === 1, exps.length);
// Admin edits the row → sync must not overwrite it.
vm.runInContext(`state.expenses.find(e=>e.autoCitadelShare).edited = true; state.expenses.find(e=>e.autoCitadelShare).amount = 999;`, ctx);
vm.runInContext('syncCitadelShare()', ctx);
const edited = vm.runInContext('state.expenses.find(e=>e.autoCitadelShare)', ctx);
ok('an edited row is NOT overwritten', edited && edited.amount === 999, edited && edited.amount);

console.log('\nrate change refreshes an un-edited row:');
vm.runInContext(`state.expenses.forEach(e=>{ if(e.autoCitadelShare){ e.edited=false; } }); state.settings.citadelRate=50;`, ctx);
vm.runInContext('syncCitadelShare()', ctx);
const rerated = vm.runInContext('state.expenses.find(e=>e.autoCitadelShare)', ctx);
ok('un-edited row refreshes to 300 (600 × 50%)', rerated && Math.round(rerated.amount) === 300, rerated && rerated.amount);

console.log('\ncitadelPaidToCompany — sum of the share expenses in scope:');
const paidTo = vm.runInContext('citadelPaidToCompany([])', ctx);
ok('paid-to-company = 300 (the current row)', Math.round(paidTo) === 300, paidTo);
const paidToOther = vm.runInContext('citadelPaidToCompany(["2026-01"])', ctx);
ok('paid-to-company respects the month scope (0 for an empty month)', Math.round(paidToOther) === 0, paidToOther);

console.log('\ncategory registration:');
ok('"Citadel Company Share" is in DEFAULT_EXPENSE_CATEGORIES', /'Citadel Company Share'/.test(appSrc) && /DEFAULT_EXPENSE_CATEGORIES = \[[\s\S]{0,200}Citadel Company Share/.test(appSrc));
ok('"Citadel Company Share" is a reserved (undeletable) category', /RESERVED_EXPENSE_CATEGORIES = \[[^\]]*Citadel Company Share/.test(appSrc));
ok('EXP_CATS getter surfaces it', vm.runInContext('EXP_CATS.includes("Citadel Company Share")', ctx) === true);

console.log('\nreport UI + PDF:');
const html = vm.runInContext(`(function(){ try { PAGES.citadel(document.getElementById('main')); return document.getElementById('main').innerHTML; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx);
ok('citadel renders without throwing', typeof html === 'string' && !html.startsWith('THREW'), String(html).slice(0, 90));
ok('on-screen report has a "Company settlement" section', /Company settlement/.test(html));
ok('on-screen report shows Collected from members + Paid to company', /Collected from members/.test(html) && /Paid to company/.test(html));
ok('PDF summary numeric headers are right-aligned (th class="n")', /<th class="n">Membership<\/th><th class="n">Rent<\/th><th class="n">Total<\/th>/.test(pagesSrc));
ok('PDF Amount header (contributing invoices) is right-aligned', /<th class="n">Amount<\/th>/.test(pagesSrc));
ok('PDF has the settlement table with Balance due to company', /class="settle"/.test(pagesSrc) && /Balance due to company/.test(pagesSrc));

console.log(`\nCITADEL COMPANY SHARE: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
