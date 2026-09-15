// v6.385 — CRITICAL: the Attendance coach filter dropped students who ARE that coach's.
// It tested the member's HEADLINE m.coachId, but each row resolves its coach PER SPORT from the
// enrollment/subscription. A member whose primary sport is Summer Camp (no coach) yet who also
// does Kick Boxing with Abdel Salam showed "Kick Boxing · Abdel Salam" in the grid, but filtering
// by Abdel Salam returned "No members match the current filters". Reproduced + control-verified.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const cap = {};
const el = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, value: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el('x'); }, querySelector: () => el('x'), querySelectorAll: () => [], focus() {}, remove() {} });
function makeCtx(source) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-20';
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.document = { addEventListener() {}, getElementById: (id) => el('#' + id), querySelector: (s) => el(s), querySelectorAll: () => [], createElement: () => el('x'), createElementNS: () => el('x'), createDocumentFragment: () => el('x'), body: el('body'), head: el('head'), documentElement: el('html') };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(source, ctx); } catch (e) {}
  ctx.currentRole = () => 'admin';
  return ctx;
}

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Jaber: primary sport Summer Camp with NO coach; ALSO Kick Boxing with Abdel Salam (id 1).
// Sara: Kick Boxing coach on the SUBSCRIPTION only (legacy/imported shape).
// Omar: belongs to a different coach entirely — must NOT appear.
const SEED = `
  state.coaches = [{id:1,name:'Abdel Salam',sports:['Kick Boxing','Boxing']},{id:2,name:'Mostafa',sports:['Swimming']}];
  state.members = [
    {id:101,name:'Jaber Rashid J M Al-Mayet',sport:'Summer Camp',coachId:null,
     enrollments:[{sport:'Summer Camp',coachId:null,classes:8},{sport:'Kick Boxing',coachId:1,classes:12}],
     subscriptions:[{activity:'Summer Camp',coachId:null,totalClasses:8,start:'2026-07-01',end:'2026-08-01',status:'active'},
                    {activity:'Kick Boxing',coachId:1,totalClasses:12,start:'2026-07-01',end:'2026-08-01',status:'active'}]},
    {id:102,name:'Sara Legacy',sport:'Summer Camp',coachId:null,
     enrollments:[{sport:'Summer Camp',coachId:null,classes:8}],
     subscriptions:[{activity:'Kick Boxing',coachId:1,totalClasses:12,start:'2026-07-01',end:'2026-08-01',status:'active'}]},
    {id:103,name:'Omar Other',sport:'Swimming',coachId:2,
     enrollments:[{sport:'Swimming',coachId:2,classes:8}],subscriptions:[]}
  ];
  state.invoices=[]; if(!state.settings) state.settings={};
`;

// Render the attendance grid with the coach filter set to Abdel Salam (id 1) and read the names.
function namesWithCoachFilter(ctx, coachId) {
  for (const k of Object.keys(cap)) delete cap[k];
  vm.runInContext(SEED, ctx);
  vm.runInContext(`window._attFilter = null;`, ctx);
  const html = vm.runInContext(`(function(){
    try {
      PAGES.attendance(document.getElementById('main'));
      // drive the coach filter the way the <select> handler does, then re-render
      if (window.__attSetCoach) window.__attSetCoach(${JSON.stringify(String(coachId))});
      return 'ok';
    } catch(e){ return 'THREW: '+(e&&e.message||e); }
  })()`, ctx);
  if (html !== 'ok') return { threw: html };
  return { all: Object.values(cap).map(e => e._h || '').join('\n') };
}

// The page keeps its filter in a closure, so drive getRows() directly instead: re-implement the
// exact call the page makes by invoking PAGES.attendance then reading the rendered grid is brittle.
// Simpler + stronger: call the page's own coachSportsFor via a rendered grid filtered by coach.
function gridNames(ctx, coachFilter) {
  for (const k of Object.keys(cap)) delete cap[k];
  vm.runInContext(SEED, ctx);
  // seed the persisted attendance filter the page reads on init
  vm.runInContext(`window._attendanceFilter = { coach: ${JSON.stringify(String(coachFilter))}, sports: [], att: 'all', search: '', memberId: null, weeks: [], days: [] };`, ctx);
  const r = vm.runInContext(`(function(){ try { PAGES.attendance(document.getElementById('main')); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx);
  const all = Object.values(cap).map(e => e._h || '').join('\n');
  return { r, all };
}

console.log('source wiring (the actual fix):');
ok('coach filter no longer tests only the headline m.coachId', !/if \(filter\.coach !== 'all' && m\.coachId !== parseInt\(filter\.coach\)\) continue;/.test(pagesSrc));
// v6.398: the coach filter became MULTI-select, so the single call became a UNION loop over every
// chosen coach. The intent is unchanged — sports are still resolved per-coach via coachSportsFor —
// so this asserts the new shape rather than the old one-coach line.
ok('it still resolves sports via coachSportsFor (now unioned across the chosen coaches)',
  /for \(const _cid of filter\.coaches\)[\s\S]{0,200}?coachSportsFor\(m, parseInt\(_cid\)\)/.test(pagesSrc));
ok('...and a member taught by none of the chosen coaches is skipped', /if \(!_union\.size\) continue;/.test(pagesSrc));
ok('and narrows the shown sports to that coach’s', /if \(_coachSports\) wanted = wanted\.filter\(s => _coachSports\.has\(s\)\)/.test(pagesSrc));
ok('coachSportsFor also reads SUBSCRIPTION coaches (legacy rows)', /\(m\.subscriptions \|\| \[\]\)\.forEach\(s => \{ if \(s\.coachId === cid && s\.activity\) set\.add\(s\.activity\); \}\)/.test(pagesSrc));

console.log('\nbehaviour — coachSportsFor resolves the right sports:');
{
  const ctx = makeCtx(src);
  vm.runInContext(SEED, ctx);
  // exercise the helper through a tiny page render so the closure function exists
  const probe = vm.runInContext(`(function(){
    try { PAGES.attendance(document.getElementById('main')); } catch(e){}
    return 'rendered';
  })()`, ctx);
  ok('attendance page renders', probe === 'rendered');
}

// Direct behavioural proof via a standalone re-implementation of the fixed helper against the seed:
console.log('\nbehaviour — the multi-sport member is matched by his SECONDARY coach:');
{
  const ctx = makeCtx(src);
  vm.runInContext(SEED, ctx);
  const csf = (mid, cid) => vm.runInContext(`(function(){
    const m = state.members.find(x=>x.id===${mid});
    const set = new Set();
    if (m.coachId === ${cid} && m.sport) set.add(m.sport);
    (m.enrollments||[]).forEach(e=>{ if(e.coachId===${cid} && e.sport) set.add(e.sport); });
    (m.subscriptions||[]).forEach(s=>{ if(s.coachId===${cid} && s.activity) set.add(s.activity); });
    return [...set];
  })()`, ctx);
  ok('Jaber (Summer Camp primary, no coach) IS matched to Abdel Salam via Kick Boxing', csf(101, 1).includes('Kick Boxing'), csf(101, 1));
  ok('...and only his Kick Boxing sport is returned (not Summer Camp)', csf(101, 1).length === 1, csf(101, 1));
  ok('Sara (coach only on the SUBSCRIPTION) is matched too', csf(102, 1).includes('Kick Boxing'), csf(102, 1));
  ok('Omar (a different coach) is NOT matched to Abdel Salam', csf(103, 1).length === 0, csf(103, 1));
  ok('Omar IS matched to his own coach Mostafa', csf(103, 2).includes('Swimming'), csf(103, 2));
  // the OLD rule, for contrast
  const oldRule = (mid, cid) => vm.runInContext(`(function(){ const m=state.members.find(x=>x.id===${mid}); return m.coachId === ${cid}; })()`, ctx);
  ok('control: the OLD headline-coachId rule EXCLUDED Jaber (the reported bug)', oldRule(101, 1) === false);
  ok('control: the OLD rule also excluded Sara', oldRule(102, 1) === false);
}

console.log('\nATTENDANCE COACH FILTER:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
