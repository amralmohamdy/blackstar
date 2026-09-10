// v6.377 — one-click, MONEY-SAFE bulk removal of EXACT duplicate invoices. Rules under test:
//  1. an exact duplicate pair (same customer/sport/month/amount) → the extra copy is soft-deleted;
//  2. the copy that HOLDS THE PAYMENT is kept (never lose collected cash), even if it's not oldest;
//  3. a group where TWO copies were separately paid is SKIPPED (possible real double-payment);
//  4. "possible" (within-7-days) duplicates are never auto-removed;
//  5. removal is a SOFT delete (inv.deleted=true), reversible.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-18';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
const _el = () => ({ style: {}, setAttribute() {}, getAttribute() { return null; }, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, addEventListener() {} });
ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: _el, createElementNS: _el, body: _el(), head: _el(), documentElement: _el() };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }
ctx.currentRole = () => 'admin';
ctx.confirm = () => true;            // auto-accept the confirm dialog
ctx.toast = () => {}; ctx.render = () => {}; ctx.audit = () => {}; ctx.save = () => {};

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Scenario:
//  A) Fares/Karate exact dup: INV1 (paid 71) + INV2 (unpaid) → keep INV1 (paid), delete INV2.
//  B) Sara/Karate exact dup, NEITHER paid: INV3 (older) + INV4 → keep INV3, delete INV4.
//  C) Omar/Swimming exact dup, BOTH paid: INV5 + INV6 → SKIP (possible double payment).
//  D) Ali/Karate "possible" (within 7 days, diff month) → NOT touched by exact cleanup.
const setup = () => vm.runInContext(`
  state.members = [{id:1,name:'Fares'},{id:2,name:'Sara'},{id:3,name:'Omar'},{id:4,name:'Ali'}];
  state.invoices = [
    // v6.561: an EXACT (auto-removable) duplicate is a genuine SAME-DAY double-entry, so A/B/C are same-day pairs.
    {id:1,ref:'A1',customerId:1,category:'Membership',sport:'Karate',month:'2026-06',date:'2026-06-10',amount:71,payments:[{amount:71,date:'2026-06-10'}]},
    {id:2,ref:'A2',customerId:1,category:'Membership',sport:'Karate',month:'2026-06',date:'2026-06-10',amount:71,payments:[]},
    {id:3,ref:'B1',customerId:2,category:'Membership',sport:'Karate',month:'2026-06',date:'2026-06-05',amount:90,payments:[]},
    {id:4,ref:'B2',customerId:2,category:'Membership',sport:'Karate',month:'2026-06',date:'2026-06-05',amount:90,payments:[]},
    {id:5,ref:'C1',customerId:3,category:'Membership',sport:'Swimming',month:'2026-06',date:'2026-06-03',amount:150,payments:[{amount:150,date:'2026-06-03'}]},
    {id:6,ref:'C2',customerId:3,category:'Membership',sport:'Swimming',month:'2026-06',date:'2026-06-03',amount:150,payments:[{amount:150,date:'2026-06-03'}]},
    {id:7,ref:'D1',customerId:4,category:'Membership',sport:'Karate',month:'2026-06',date:'2026-06-28',amount:60,payments:[]},
    {id:8,ref:'D2',customerId:4,category:'Membership',sport:'Karate',month:'2026-07',date:'2026-07-02',amount:60,payments:[]}
  ];
  state.coaches=[]; if(!state.settings) state.settings={};
`, ctx);
setup();

const alive = () => vm.runInContext('state.invoices.filter(i=>!i.deleted).map(i=>i.ref)', ctx);
const deletedRefs = () => vm.runInContext('state.invoices.filter(i=>i.deleted).map(i=>i.ref)', ctx);

// exact detector sees A, B, C (3 groups); D is "possible"
const groups = vm.runInContext('detectDuplicateInvoices()', ctx);
console.log('pre-conditions:');
ok('detector finds the 3 exact groups (A,B,C)', groups.filter(g => g.tier === 'exact').length === 3, groups.map(g => g.tier));
ok('D (cross-month, 7 days) is "possible", not exact', groups.some(g => g.tier === 'possible'));

// run the one-click cleanup
vm.runInContext('removeExactDuplicatesSafely()', ctx);

console.log('\nafter one-click "Remove all exact duplicates":');
const del = deletedRefs(), live = alive();
ok('A: the UNPAID copy A2 is deleted', del.includes('A2'), del);
ok('A: the PAID copy A1 is KEPT (no collected cash lost)', live.includes('A1'));
ok('B: one copy deleted (B2, the newer), oldest B1 kept', del.includes('B2') && live.includes('B1'));
ok('C: BOTH-paid group is SKIPPED — neither C1 nor C2 deleted', live.includes('C1') && live.includes('C2') && !del.includes('C1') && !del.includes('C2'));
ok('D: the "possible" pair is untouched (D1 & D2 both alive)', live.includes('D1') && live.includes('D2'));
ok('exactly 2 invoices were removed (A2 + B2)', del.length === 2, del);
ok('removal is a SOFT delete (deleted flag, record still present)', vm.runInContext('state.invoices.filter(i=>i.deleted).every(i=>i.deleted===true) && state.invoices.length===8', ctx));

console.log('\nre-running is idempotent + safe:');
vm.runInContext('removeExactDuplicatesSafely()', ctx);
ok('second run removes nothing new (A,B already clean; C still skipped)', deletedRefs().length === 2, deletedRefs());

console.log('\nsource wiring:');
ok('a "Remove all exact duplicates" button exists on the dup screen', /removeExactDuplicatesSafely\(\)/.test(pagesSrc) && /Remove all exact duplicates/.test(pagesSrc));
ok('keeps the PAID copy (money-safe pick)', /paidRows\.length === 1 \? paidRows\[0\] : rows\[0\]/.test(pagesSrc));
ok('skips groups with 2+ paid copies', /paidRows\.length >= 2\) \{ skipped\+\+; continue;/.test(pagesSrc));
ok('the salary report banner groups repeated bullets (no dup lines)', /_rptDupGroups/.test(pagesSrc));
ok('the Salaries list links straight to the cleanup', /navigate\('dupinvoices'\)/.test(pagesSrc));

console.log('\nDUP INVOICE CLEANUP:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
