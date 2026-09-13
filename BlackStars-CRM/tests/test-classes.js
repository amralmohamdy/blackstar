// v6.400 — CLASSES screen. A "class" is one weekly Schedule entry (day + slot + coach + sport);
// its student roster is DERIVED from enrollments (classRoster), never stored — so it can never
// drift from the truth and there is nothing to migrate. Read-only: view, filter, print/export a
// register per class. This test pins the roster resolution (the part that must be exact) + render.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const src = appSrc + '\n' + pagesSrc;

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

const cap = {};
const el = () => ({ _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, closest() { return el(); }, querySelector: () => el(), querySelectorAll: () => [], focus() {}, remove() {}, value: '' });
function makeCtx() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-22';
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
  ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true }; ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  ctx.document = { addEventListener() {}, getElementById: id => (cap['#' + id] = cap['#' + id] || el()), querySelector: () => el(), querySelectorAll: () => [], createElement: el, createElementNS: el, createDocumentFragment: el, body: el(), head: el(), documentElement: el() };
  ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a' }, onAuthStateChanged() {} }), app: () => ({}) };
  vm.createContext(ctx); try { vm.runInContext(src, ctx); } catch (e) {}
  ctx.currentRole = () => 'admin';
  return ctx;
}
const C = makeCtx();
const SEED = `
  state.coaches = [{id:1,name:'Mostafa'},{id:2,name:'Iyad'}];
  state.schedule = [
    {id:11,day:'sun',slot:16,sport:'Swimming',coachId:1},
    {id:12,day:'mon',slot:18,sport:'Kick Boxing',coachId:2},
    {id:13,day:'tue',slot:17,sport:'Boxing',coachId:2}
  ];
  state.members = [
    {id:101,name:'Ali',phone:'+97430001',sport:'Swimming',coachId:1,enrollments:[{sport:'Swimming',coachId:1}],subscriptions:[]},
    {id:102,name:'Sara',phone:'+97430002',sport:'Summer Camp',coachId:null,enrollments:[{sport:'Kick Boxing',coachId:2},{sport:'Swimming',coachId:1}],subscriptions:[]},
    {id:103,name:'Omar',phone:'+97430003',sport:'Kick Boxing',coachId:2,enrollments:[],subscriptions:[{activity:'Kick Boxing',coachId:2,start:'2026-07-01',end:'2026-08-01'}]},
    {id:104,name:'Archived',deleted:true,sport:'Swimming',coachId:1,enrollments:[{sport:'Swimming',coachId:1}]}
  ];
  if(!state.settings) state.settings={};
`;
vm.runInContext(SEED, C);
const roster = (sport, cid) => vm.runInContext(`classRoster(${JSON.stringify(sport)}, ${cid}).map(m => m.name)`, C);
const takes = (id, sport, cid) => vm.runInContext(`memberTakesSportWithCoach(state.members.find(m=>m.id===${id}), ${JSON.stringify(sport)}, ${cid})`, C);

console.log('the roster is derived correctly per coach + sport:');
{
  ok('Swimming/Mostafa has Ali and Sara', JSON.stringify(roster('Swimming', 1).sort()) === JSON.stringify(['Ali', 'Sara']), roster('Swimming', 1));
  ok('Kick Boxing/Iyad has Sara and Omar', JSON.stringify(roster('Kick Boxing', 2).sort()) === JSON.stringify(['Omar', 'Sara']), roster('Kick Boxing', 2));
  ok('Boxing/Iyad is empty (scheduled but nobody enrolled)', roster('Boxing', 2).length === 0, roster('Boxing', 2));
}

console.log('\nmembership shapes are all matched:');
{
  ok('primary sport + coach matches (Ali)', takes(101, 'Swimming', 1) === true);
  ok('an ENROLLMENT with a secondary coach matches (Sara → Kick Boxing/Iyad)', takes(102, 'Kick Boxing', 2) === true);
  ok('a SUBSCRIPTION-only coach matches (Omar, legacy shape)', takes(103, 'Kick Boxing', 2) === true);
  ok('the wrong coach does NOT match (Sara is not Iyad’s swimmer)', takes(102, 'Swimming', 2) === false);
  ok('the wrong sport does NOT match', takes(101, 'Boxing', 1) === false);
}

console.log('\narchived + status handling:');
{
  ok('an archived member is never in a roster', !roster('Swimming', 1).includes('Archived'));
  const ordered = vm.runInContext(`(function(){
    state.members.push({id:105,name:'AAActive',sport:'Swimming',coachId:1,enrollments:[{sport:'Swimming',coachId:1}]});
    state.members.push({id:106,name:'BBExpired',sport:'Swimming',coachId:1,expiryDate:'2020-01-01',enrollments:[{sport:'Swimming',coachId:1}],subscriptions:[{activity:'Swimming',coachId:1,start:'2019-01-01',end:'2020-01-01'}]});
    return classRoster('Swimming',1).map(m=>m.name);
  })()`, C);
  ok('active members are listed before non-active', ordered.indexOf('AAActive') < ordered.indexOf('BBExpired'), ordered);
  // reset the seed for the render test
  vm.runInContext(SEED, C);
}

console.log('\nthe page renders and shows the right classes + rosters:');
{
  for (const k of Object.keys(cap)) delete cap[k];
  const r = vm.runInContext(`(function(){ try { PAGES.classes(document.getElementById('main')); return 'OK'; } catch(e){ return 'THREW: '+(e&&e.message); } })()`, C);
  ok('renders without throwing', r === 'OK', r);
  const html = Object.values(cap).map(e => e._h || '').join('\n');
  ok('shows the Swimming · Mostafa class', /Swimming · <span[^>]*>Mostafa/.test(html));
  ok('shows the Kick Boxing · Iyad class', /Kick Boxing · <span[^>]*>Iyad/.test(html));
  ok('lists a student in a roster', html.includes('Ali'));
  ok('shows the empty-class note for Boxing', /No students enrolled/.test(html));
  ok('every class has a Print button', (html.match(/_classPrint\(/g) || []).length >= 3, (html.match(/_classPrint\(/g) || []).length);
  ok('every class has an Excel button', (html.match(/_classXlsx\(/g) || []).length >= 3);
  ok('the day + time slot are shown', /🗓 Sunday · ⏰ 4–5 PM/.test(html), html.slice(0, 0));
}

console.log('\nfilters narrow the list:');
{
  const render = () => { for (const k of Object.keys(cap)) delete cap[k]; vm.runInContext(`PAGES.classes(document.getElementById('main'))`, C); return Object.values(cap).map(e => e._h || '').join('\n'); };
  vm.runInContext(`window._classFilter = { coach: '2', sport: 'all', day: 'all', search: '' }`, C);
  let html = render();
  ok('filtering by coach Iyad hides Mostafa’s class', !/Swimming · <span[^>]*>Mostafa/.test(html) && /Kick Boxing · <span[^>]*>Iyad/.test(html));
  vm.runInContext(`window._classFilter = { coach: 'all', sport: 'all', day: 'all', search: 'Omar' }`, C);
  html = render();
  ok('searching a student shows only classes that contain them', html.includes('Omar') && !html.includes('Ali'), );
  vm.runInContext(`window._classFilter = null`, C);
}

console.log('\nPER-SLOT ASSIGNMENT (v6.401) — one coach, same sport, two times:');
{
  const X = makeCtx();
  vm.runInContext(`
    state.coaches = [{id:2,name:'Iyad'}];
    state.schedule = [
      {id:21,day:'sat',slot:17,sport:'Kick Boxing',coachId:2},
      {id:22,day:'mon',slot:18,sport:'Kick Boxing',coachId:2}
    ];
    state.members = [
      {id:1,name:'Unassigned',sport:'Kick Boxing',coachId:2,enrollments:[{sport:'Kick Boxing',coachId:2}]},
      {id:2,name:'SatOnly',sport:'Kick Boxing',coachId:2,enrollments:[{sport:'Kick Boxing',coachId:2}],classSlots:[{sport:'Kick Boxing',coachId:2,day:'sat',slot:17}]},
      {id:3,name:'MonOnly',sport:'Kick Boxing',coachId:2,enrollments:[{sport:'Kick Boxing',coachId:2}],classSlots:[{sport:'Kick Boxing',coachId:2,day:'mon',slot:18}]},
      {id:4,name:'BothDays',sport:'Kick Boxing',coachId:2,enrollments:[{sport:'Kick Boxing',coachId:2}],classSlots:[{sport:'Kick Boxing',coachId:2,day:'sat',slot:17},{sport:'Kick Boxing',coachId:2,day:'mon',slot:18}]}
    ];
    if(!state.settings) state.settings={};
  `, X);
  const at = (day, slot) => vm.runInContext(`classRoster('Kick Boxing',2,${JSON.stringify(day)},${slot}).map(m=>m.name).sort()`, X);
  const sat = at('sat', 17), mon = at('mon', 18);
  ok('a student assigned to Saturday appears there', sat.includes('SatOnly'), sat);
  ok('...and NOT in the Monday class', !mon.includes('SatOnly'), mon);
  ok('a Monday student appears only on Monday', mon.includes('MonOnly') && !sat.includes('MonOnly'), { sat, mon });
  ok('a student assigned to BOTH appears in both', sat.includes('BothDays') && mon.includes('BothDays'));
  // the backward-compatible rule — this is what stops rosters emptying on upgrade
  ok('an UNASSIGNED student still appears in every class of that coach+sport', sat.includes('Unassigned') && mon.includes('Unassigned'), { sat, mon });
  ok('eligibility ignores slots (drives the assign dialog)',
    vm.runInContext(`classEligible('Kick Boxing',2).length`, X) === 4);
  ok('classRoster with NO day/slot returns everyone (old call shape still works)',
    vm.runInContext(`classRoster('Kick Boxing',2).length`, X) === 4);
}

console.log('\nthe hours filter narrows by time slot:');
{
  const X = makeCtx();
  vm.runInContext(`
    state.coaches=[{id:2,name:'Iyad'}];
    state.schedule=[{id:21,day:'sat',slot:17,sport:'Kick Boxing',coachId:2},{id:22,day:'mon',slot:18,sport:'Kick Boxing',coachId:2}];
    state.members=[{id:1,name:'Ali',sport:'Kick Boxing',coachId:2,enrollments:[{sport:'Kick Boxing',coachId:2}]}];
    if(!state.settings) state.settings={};
  `, X);
  const render = () => { for (const k of Object.keys(cap)) delete cap[k]; vm.runInContext(`PAGES.classes(document.getElementById('main'))`, X); return Object.values(cap).map(e => e._h || '').join('\n'); };
  vm.runInContext(`window._classFilter = null`, X);
  let html = render();
  ok('the hours dropdown is rendered', html.includes('cls-slot') && /All hours/.test(html));
  ok('both time slots are offered', /5–6 PM/.test(html) && /6–7 PM/.test(html));
  vm.runInContext(`window._classFilter = { coach:'all', sport:'all', day:'all', slot:'17', search:'' }`, X);
  html = render();
  ok('choosing 5–6 PM hides the 6–7 PM class', /5–6 PM/.test(html) && !/⏰ 6–7 PM/.test(html));
  vm.runInContext(`window._classFilter = null`, X);
}

console.log('\nsource wiring:');
{
  ok('the route is registered in the nav', /classes:\s*\{ label: 'Classes'/.test(appSrc));
  ok('classRoster + memberTakesSportWithCoach are global', /window\.classRoster = classRoster/.test(appSrc) && /window\.memberTakesSportWithCoach = memberTakesSportWithCoach/.test(appSrc));
  ok('the roster is derived, not stored (reads state.members + schedule, no new collection)',
    !/state\.classes\b/.test(pagesSrc) && /classRoster\(c\.sport, c\.coachId, c\.day, c\.slot\)/.test(pagesSrc));
  ok('slot assignments live on the MEMBER (existing synced array, no new collection)',
    /m\.classSlots/.test(pagesSrc) && !/state\.classAssignments/.test(pagesSrc));
  ok('print + xlsx handlers exist', /window\._classPrint = function/.test(pagesSrc) && /window\._classXlsx = function/.test(pagesSrc));
  // v6.423 — each class card collapses/expands.
  ok('a per-card collapse toggle exists', /window\._clsToggle = function/.test(pagesSrc) && /onclick="window\._clsToggle\(\$\{c\.id\}\)"/.test(pagesSrc));
  ok('the roster body is the collapsible region', /class="cls-body" id="cls-body-\$\{c\.id\}"/.test(pagesSrc));
  ok('action buttons stopPropagation so they do not toggle the card', /onclick="event\.stopPropagation\(\);window\._classPrint/.test(pagesSrc));
  ok('Collapse all / Expand all controls are wired', /cls-collapse-all[\s\S]{0,400}window\._clsCollapsed = new Set\(classes\.map/.test(pagesSrc) && /cls-expand-all[\s\S]{0,200}window\._clsCollapsed = new Set\(\)/.test(pagesSrc));
}

console.log('\nCLASSES:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
