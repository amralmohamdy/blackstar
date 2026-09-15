// v6.380 — a DELETED (voided / duplicate-removed) invoice must NOT pay attendance commission.
// This was why soft-deleted "Test" invoices + already-removed duplicates kept showing on the salary
// report. Verified two ways: (1) a minimal unit case + control; (2) against the OWNER'S REAL backup —
// Abdel Salam's commission must no longer include the deleted "Test" MMA invoices.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const BACKUP = 'C:/Users/kshawky/Downloads/blackstars-backup-2026-07-19.json';

function makeCtx(source) {
  source = source || appSrc;
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => (typeof f === 'function' ? f() : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, classList: { add() {} } }), body: {}, head: {}, documentElement: { setAttribute() {}, classList: { add() {} } } };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(source, ctx); } catch (e) {}
  return ctx;
}

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// ── 1) UNIT: a deleted invoice yields NO commission line; a live one does. ──
console.log('unit — deleted invoice earns no commission:');
{
  const ctx = makeCtx();
  vm.runInContext(`
    state.members=[{id:1,name:'Live Guy'},{id:2,name:'Test'}];
    state.coaches=[{id:9,name:'C',sports:['MMA']}];
    state.invoices=[
      {id:100,ref:'LIVE',customerId:1,category:'Membership',sport:'MMA',month:'2026-07',date:'2026-07-01',amount:350,coachId:9,lineItems:[{sport:'MMA',price:350,coachId:9}]},
      {id:200,ref:'DEL',customerId:2,category:'Membership',sport:'MMA',month:'2026-07',date:'2026-07-01',amount:350,coachId:9,deleted:true,lineItems:[{sport:'MMA',price:350,coachId:9}]}
    ];
    if(!state.settings) state.settings={};
  `, ctx);
  const r = vm.runInContext(`computeAttendanceCommission(9,'2026-07')`, ctx);
  const names = (r.lines || []).map(l => l.memberName);
  const pend = (r.pendingLines || []).map(l => l.memberName);
  ok('the LIVE member appears (some line or pending)', names.includes('Live Guy') || pend.includes('Live Guy'), { names, pend });
  ok('the DELETED "Test" invoice produces NO line at all', !names.includes('Test') && !pend.includes('Test'), { names, pend });
}

// control: revert the guard → the deleted invoice comes back
console.log('\ncontrol — without the fix the deleted invoice WOULD pay:');
{
  // Remove ONLY the guard inside computeAttendanceCommission (the one immediately before the
  // membership-category check), leaving the identical-looking guard in coachEarnings untouched.
  const broken = appSrc.replace(/if \(inv\.deleted\) continue;(\s*\n\s*)if \(\(inv\.category \|\| 'Membership'\) !== 'Membership'\) continue;/, `if ((inv.category || 'Membership') !== 'Membership') continue;`);
  if (broken === appSrc) { console.log('  (control patch did not apply — regex needs update)'); }
  const ctx = makeCtx(broken);
  vm.runInContext(`
    state.members=[{id:2,name:'Test'}]; state.coaches=[{id:9,name:'C',sports:['MMA']}];
    state.invoices=[{id:200,ref:'DEL',customerId:2,category:'Membership',sport:'MMA',month:'2026-07',date:'2026-07-01',amount:350,coachId:9,deleted:true,lineItems:[{sport:'MMA',price:350,coachId:9}]}];
    if(!state.settings) state.settings={};
  `, ctx);
  const r = vm.runInContext(`computeAttendanceCommission(9,'2026-07')`, ctx);
  const all = [...(r.lines || []), ...(r.pendingLines || [])].map(l => l.memberName);
  ok('control confirms the bug: deleted "Test" DOES pay without the guard', all.includes('Test'), all);
}

// ── 2) REAL BACKUP: Abdel Salam (coachId 1) must not be credited for the deleted Test/duplicate invoices. ──
console.log('\nreal backup (blackstars-backup-2026-07-19):');
if (!fs.existsSync(BACKUP)) { console.log('  (backup not found — skipping)'); }
else {
  const db = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
  const ctx = makeCtx();
  const COLS = ['members','coaches','invoices','expenses','salaries','sales','advices','trials','rentals','rentalCustomers','schedule','swimGroups','auditLog','membershipTransfers','cashCounts','families','notes','products','drivers','posts'];
  for (const k of COLS) if (Array.isArray(db[k])) vm.runInContext(`state.${k} = ${JSON.stringify(db[k])};`, ctx);
  if (db.settings) vm.runInContext(`state.settings = ${JSON.stringify(db.settings)};`, ctx);
  // Which invoices are deleted + membership + coach Abdel Salam (id 1)?
  const delAbdel = (db.invoices || []).filter(i => i.deleted && (i.category || 'Membership') === 'Membership' && (i.coachId === 1 || i.coach === 'Abdel Salam'));
  console.log('  deleted membership invoices tagged to Abdel Salam:', delAbdel.length, '→', delAbdel.map(i => (i.customerName || '') + '/' + i.sport).join(', '));
  // Run his attendance commission across all months (uptoDate = today) and also month 2026-07.
  const r = vm.runInContext(`computeAttendanceCommission(1, '2026-07')`, ctx);
  const lineNames = [...(r.lines || []), ...(r.pendingLines || [])].map(l => (l.memberName || '') + '|' + (l.sport || ''));
  ok('NO "Test" line in Abdel Salam’s commission after the fix', !lineNames.some(n => /^Test\|/.test(n)), lineNames.filter(n => /^Test/.test(n)));
  // none of his lines should reference a deleted invoice's member+sport that ONLY exists as deleted
  const delKeys = new Set(delAbdel.map(i => (i.customerName || '') + '|' + i.sport));
  const liveKeys = new Set((db.invoices || []).filter(i => !i.deleted).map(i => { const m = (db.members || []).find(x => x.id === i.customerId); return ((m ? m.name : i.customerName) || '') + '|' + i.sport; }));
  const onlyDeleted = [...delKeys].filter(k => !liveKeys.has(k));
  const leaked = lineNames.filter(n => onlyDeleted.includes(n));
  ok('no commission line comes from an ONLY-deleted invoice', leaked.length === 0, leaked);
  console.log('  Abdel Salam attendance base (2026-07) now:', Math.round(r.base));
}

console.log('\nDELETED-INVOICE COMMISSION:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
