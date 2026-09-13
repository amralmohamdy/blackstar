// v6.384 — SMART (token-AND) SEARCH. Arabic full names carry father/grandfather names in the
// middle, so the words a user types are real but NOT adjacent: "جابر الميت" must find
// "جابر راشد جابر محمد الميت". The old contiguous-substring match returned 0 results.
// Verified against the OWNER'S REAL backup too.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const BACKUP = 'C:/Users/kshawky/Downloads/blackstars-backup-2026-07-19.json';

function makeCtx(src) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => (typeof f === 'function' ? f() : 0), clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n' }; ctx.addEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, classList: { add() {} } }), body: {}, head: {}, documentElement: { setAttribute() {}, classList: { add() {} } } };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a' }, onAuthStateChanged() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) {}
  return ctx;
}
const ctx = makeCtx(appSrc);
const M = (q, fields, phones) => vm.runInContext('searchMatchesFields', ctx)(q, fields, phones || []);

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

const AR = 'جابر راشد جابر محمد الميت';
const EN = 'Jaber Rashid J M Al-Mayet';

console.log('the reported bug — non-adjacent Arabic words:');
ok('"جابر الميت" now FINDS "جابر راشد جابر محمد الميت"', M('جابر الميت', [EN, AR]));
ok('order-independent: "الميت جابر" also finds it', M('الميت جابر', [EN, AR]));
ok('single word "جابر" still works', M('جابر', [EN, AR]));
ok('single word "الميت" still works', M('الميت', [EN, AR]));

console.log('\nno false positives:');
ok('"جابر السيد" does NOT match (السيد absent)', !M('جابر السيد', [EN, AR]));
ok('a totally different name does not match', !M('محمد الكواري', [EN, AR]));

console.log('\nLatin + mixed still behave:');
ok('"rashid mayet" finds the Latin name (non-adjacent)', M('rashid mayet', [EN, AR]));
ok('"jaber" finds it', M('jaber', [EN, AR]));
ok('unrelated Latin does not match', !M('sara swallmeh', [EN, AR]));

console.log('\nphone search unaffected:');
ok('digits still match a formatted phone', M('30407225', [EN, AR], ['+97430407225']));
ok('wrong digits do not match', !M('99999999', [EN, AR], ['+97430407225']));

console.log('\nagainst the REAL backup:');
if (!fs.existsSync(BACKUP)) console.log('  (backup not found — skipping)');
else {
  const db = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
  const hits = (db.members || []).filter(m => M('جابر الميت', [m.name, m.nameArabic, m.phone, m.qid], [m.phone]));
  ok('"جابر الميت" returns at least one real member', hits.length >= 1, hits.map(h => h.name));
  ok('...and it is Jaber Rashid Al-Mayet', hits.some(h => /Mayet|الميت/i.test((h.name || '') + ' ' + (h.nameArabic || ''))), hits.map(h => h.name));
  // control: the OLD contiguous-only matcher found nothing
  // Disable ONLY the token-AND line → back to contiguous-substring-only matching.
  const broken = appSrc.replace('if (tokens.length > 1 && tokens.every(tk => hay.includes(tk))) return true;', '/* token match removed */');
  const octx = makeCtx(broken);
  const oldM = vm.runInContext('searchMatchesFields', octx);
  const oldHits = (db.members || []).filter(m => oldM('جابر الميت', [m.name, m.nameArabic, m.phone, m.qid], [m.phone]));
  ok('control: the OLD matcher found 0 (confirms the bug)', broken !== appSrc && oldHits.length === 0, { patched: broken !== appSrc, oldHits: oldHits.length });
}

console.log('\nSMART SEARCH:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
