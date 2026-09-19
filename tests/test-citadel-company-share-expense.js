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
// v6.582 — pinned directly AFTER "Bank Commission" (both auto bank expenses at the top).
{
  // default install (no settings.expenseCategories)
  vm.runInContext(`state.settings = {};`, ctx);
  const def = vm.runInContext(`EXP_CATS`, ctx);
  ok('default: Citadel Company Share is right after Bank Commission', def.indexOf('Citadel Company Share') === def.indexOf('Bank Commission') + 1, def.slice(0, 3).join(' · '));
  // existing install whose saved list PREDATES the category (it was near the bottom before)
  vm.runInContext(`state.settings = { expenseCategories: ['Bank Commission','Equipment','Rent','Salary','Others'] };`, ctx);
  const ex = vm.runInContext(`EXP_CATS`, ctx);
  ok('old install: Citadel Company Share re-pinned after Bank Commission', ex.indexOf('Citadel Company Share') === ex.indexOf('Bank Commission') + 1, ex.join(' · '));
}
// dynamic description reflects the configured rate (not a hardcoded 30%)
{
  vm.runInContext(`
    state.settings = { citadelRate: 40 }; state.expenses = [];
    state.members = [{id:9,name:'Z'}];
    state.invoices = [{id:701,ref:'F',customerId:9,category:'Membership',sport:'Football',month:'2026-08',date:'2026-08-01',amount:1000}];
    syncCitadelShare();
  `, ctx);
  const row = vm.runInContext(`state.expenses.find(e=>e.autoCitadelShare)`, ctx);
  ok('auto row description carries the live rate (40%)', row && /40% of Football \+ Swimming revenue/.test(row.description), row && row.description);
  ok('auto row amount = 400 (1000 × 40%)', row && Math.round(row.amount) === 400, row && row.amount);
}

console.log('\ncitadelCategories — Rental / Swimming membership / Football membership:');
{
  vm.runInContext(`
    state.members = [{id:10,name:'A'},{id:11,name:'B'},{id:12,name:'C'}];
    state.rentals = [];
    state.invoices = [
      {id:801,ref:'F1',customerId:10,category:'Membership',sport:'Football',month:'2026-08',date:'2026-08-02',amount:400},
      {id:802,ref:'FR',category:'Court Rental',activityType:'rental',sport:'Football Court',month:'2026-08',date:'2026-08-03',amount:200},
      {id:803,ref:'S1',customerId:11,category:'Membership',sport:'Swimming',month:'2026-08',date:'2026-08-04',amount:300},
      {id:804,ref:'S2',customerId:12,category:'Membership',sport:'Swimming',month:'2026-08',date:'2026-08-05',amount:250}
    ];
    if(!state.settings) state.settings={}; state.settings.citadelRate=30; window._citMonths=[];
  `, ctx);
  const cats = vm.runInContext(`citadelCategories(citadelCompute([]))`, ctx);
  const by = {}; cats.forEach(c => by[c.label] = c.amount);
  ok('Rental = 200 (all court/pool rent)', Math.round(by['Rental']) === 200, by['Rental']);
  ok('Football membership = 400', Math.round(by['Football membership']) === 400, by['Football membership']);
  ok('Swimming membership = 550 (300 + 250)', Math.round(by['Swimming membership']) === 550, by['Swimming membership']);
  ok('exactly 3 categories', cats.length === 3, cats.length);
  ok('order Rental → Swimming membership → Football membership', cats[0].label === 'Rental' && cats[1].label === 'Swimming membership' && cats[2].label === 'Football membership', cats.map(c=>c.label).join(' · '));
}

console.log('\nsource — the 3-way category table is on screen + PDF + Excel:');
ok('screen has a "Summary by category" card', /Summary by category/.test(pagesSrc));
ok('PDF builds a category table (catRowsPdf)', /const catRowsPdf =/.test(pagesSrc) && /<h2>Summary by category<\/h2>/.test(pagesSrc));
ok('Excel has a By category block', /summary\.push\(\['By category'/.test(pagesSrc));

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
