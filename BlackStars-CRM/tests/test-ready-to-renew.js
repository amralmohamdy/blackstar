// v6.359 — (1) a subscription with all class-days attended reads "completed", not "active"
// (member-card status now uses LIVE attendance, not the stale stored field); (2) completedSubsForRenewal
// / membersReadyToRenew surface those members; (3) the new "Ready to Renew" screen renders.
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const src = ['app.js', 'storage.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

const mk = () => new Proxy(function () {}, { get: (t, k) => (k === 'style' || k === 'dataset' || k === 'classList') ? mk() : (k === 'value' ? '' : (k === 'textContent' || k === 'innerHTML' ? '' : mk())), set: () => true, apply: () => mk() });
const ctx = { console: { log() {}, warn() {}, error() {}, info() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp, TextEncoder, setTimeout: f => { if (typeof f === 'function') f(); return 0; }, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.TODAY = '2026-07-15';
ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }; ctx.sessionStorage = ctx.localStorage;
ctx.location = { href: '', hash: '' }; ctx.navigator = { userAgent: 'n', onLine: true };
ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' }); ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
const store = {};
// capture innerHTML written via $('#sel') so we can inspect the rendered rows
const cap = {};
const capEl = (sel) => (cap[sel] = cap[sel] || { _h: '', get innerHTML() { return this._h; }, set innerHTML(v) { this._h = v; }, set textContent(v) { this._h = v; }, get textContent() { return this._h; }, style: {}, dataset: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, querySelector: () => capEl('x'), querySelectorAll: () => [], focus() {}, remove() {} });
ctx.document = { addEventListener() {}, getElementById: (id) => store[id] || (store[id] = Object.assign(mk(), { id, _html: '' })), querySelector: (sel) => capEl(sel), querySelectorAll: () => [], createElement: () => mk(), createElementNS: () => mk(), createDocumentFragment: () => mk(), body: mk(), head: mk(), documentElement: mk() };
ctx.firebase = { initializeApp: () => ({}), firestore: Object.assign(() => ({ settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {}, doc: () => ({}), collection: () => ({ onSnapshot: () => () => {} }) }), { FieldValue: { delete: () => ({}) } }), auth: () => ({ currentUser: { email: 'a@b.c' }, onAuthStateChanged() {}, useEmulator() {} }), app: () => ({}) };
vm.createContext(ctx);
try { vm.runInContext(src, ctx); } catch (e) { console.log('eval (partial ok):', String(e).slice(0, 90)); }

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// Ali-like member: Football 8/8 (finished), Karate 3/8 (ongoing). Stored attendedClasses is STALE (0).
const member = {
  id: 1, name: 'Ali Al Hajri', phone: '55512345', startDate: '2026-06-21', expiryDate: '2026-07-21',
  enrollments: [{ sport: 'Football', classes: 8, start: '2026-06-21' }, { sport: 'Karate', classes: 8, start: '2026-06-21' }],
  subscriptions: [
    { activity: 'Football', totalClasses: 8, attendedClasses: 0, start: '2026-06-21', end: '2026-07-21', status: 'active', coachId: 7, amountPaid: 425 },
    { activity: 'Karate',   totalClasses: 8, attendedClasses: 0, start: '2026-06-21', end: '2026-07-21', status: 'active', coachId: 8, amountPaid: 425 },
  ],
  dailyAttendance: {
    '2026-06': {
      Football: { '21': 'Y', '22': 'Y', '23': 'Y', '24': 'Y', '25': 'Y', '26': 'Y', '27': 'Y', '28': 'Y' },  // 8 → finished
      Karate:   { '21': 'Y', '22': 'Y', '23': 'Y' },  // 3 → ongoing
    },
  },
};
vm.runInContext(`state.members = ${JSON.stringify([member, { id: 2, name: 'Empty', subscriptions: [], enrollments: [] }])}; if(!state.coaches) state.coaches = [{id:7,name:'Coach F'},{id:8,name:'Coach K'}];`, ctx);

const run = code => vm.runInContext(code, ctx);

console.log('(1) completedSubsForRenewal — live-based:');
const done = run('completedSubsForRenewal(state.members[0])');
ok('Ali has exactly ONE finished sport', done.length === 1, done.map(d => d.sport));
ok('...it is Football (8/8 live), NOT Karate (3/8)', done[0] && done[0].sport === 'Football' && done[0].attended === 8 && done[0].total === 8, done[0]);
ok('Karate (3/8) is NOT flagged', !done.some(d => d.sport === 'Karate'));
ok('uses LIVE attendance despite stored attendedClasses = 0', done[0] && done[0].attended === 8, done[0] && done[0].attended);

console.log('\n(2) membersReadyToRenew / count:');
const ready = run('membersReadyToRenew().map(r=>r.m.id)');
ok('one member is ready to renew', ready.length === 1 && ready[0] === 1, ready);
ok('completedRenewalCount() === 1', run('completedRenewalCount()') === 1, run('completedRenewalCount()'));

// already-renewed: a NEWER Football sub with 0 attendance should drop Football off the list
run(`state.members[0].subscriptions.push({ activity:'Football', totalClasses:8, attendedClasses:0, start:'2026-07-22', end:'2026-08-22', status:'active', coachId:7, amountPaid:425 });`);
ok('after renewing Football (new empty period) → Football no longer ready', !run('completedSubsForRenewal(state.members[0]).some(d=>d.sport==="Football")'), run('completedSubsForRenewal(state.members[0]).map(d=>d.sport)'));

// withdrawn sport is excluded
run(`state.members[0].subscriptions.forEach(s=>{ if(s.activity==='Football') s.status='Withdrawn'; });`);
ok('withdrawn Football is excluded', !run('completedSubsForRenewal(state.members[0]).some(d=>d.sport==="Football")'));

console.log('\n(3) source: member-card status uses LIVE attendance (not stored s.attendedClasses):');
ok('status no longer shadows total/attended with s.totalClasses/s.attendedClasses', !/const total = s\.totalClasses, attended = s\.attendedClasses;\s*\n\s*const isCompleted/.test(pagesSrc));
ok('status derives isCompleted from the live attended/total in scope', /Use the SAME live attendance/.test(pagesSrc) && /const isCompleted = total != null && total > 0 && attended != null && attended >= total;/.test(pagesSrc));

console.log('\n(3b) source: enriched columns + month/coach filters (v6.359.1):');
ok('screen has an Arabic-name line', /m\.nameArabic \? `<div style="font-size:11px;color:var\(--text-dim\)" dir="rtl">/.test(pagesSrc));
ok('screen has Start + Expiry columns', /<th>\$\{t\('Start', 'البداية'\)\}<\/th>/.test(pagesSrc) && /<th>\$\{t\('Expiry', 'الانتهاء'\)\}<\/th>/.test(pagesSrc));
// The month/coach/sport filters are MULTI-select now (v6.405 — see test-ready-to-renew-multifilter.js
// for the behavioural coverage). These assert the wiring is present and multi-shaped.
// (the id is emitted by the shared helper as id="${id}", so assert the render + bind calls)
ok('screen has an enrolled-month MULTI filter', /monthMultiHTML\('comp-month'/.test(pagesSrc) && /bindMonthMulti\('comp-month'/.test(pagesSrc));
ok('screen has a coach MULTI filter', /multiFilterHTML\('comp-coach'/.test(pagesSrc) && /bindMultiFilter\('comp-coach'/.test(pagesSrc));
ok('month filter matches the finished sub START month', /f\.months\.includes\(\(d\.sub\.start \|\| ''\)\.slice\(0, 7\)\)/.test(pagesSrc));
ok('coach filter matches the finished sub coach', /f\.coaches\.includes\(coachNameOf\(d\)\)/.test(pagesSrc));
ok('search field is full-width + larger', /id="comp-search"[\s\S]{0,400}width:100%;font-size:16px;padding:12px 14px/.test(pagesSrc));

console.log('\n(3c) source: Due-Payment-style reminder + real WhatsApp icon (v6.370):');
const compSrc = pagesSrc.slice(pagesSrc.indexOf('PAGES.completed'), pagesSrc.indexOf('PAGES.expiring'));
ok('the Renew button is GONE', !/addRenewal/.test(compSrc));
ok('the Reminded BUTTON is gone (it is a label now)', !/remindedBtn/.test(compSrc) && /const remindedLabel = ri\.count/.test(compSrc));
ok('reminded → GREEN "✓ N/3 · date" badge (Due-Payment design)', /badge \$\{ri\.count >= 3 \? '' : 'active'\}/.test(compSrc) && /✓ \$\{ri\.count\}\/3/.test(compSrc));
ok('not reminded → YELLOW badge', /background:rgba\(245,158,11,\.16\);color:var\(--accent-2\)/.test(compSrc) && /t\('Not reminded', 'لم يُذكَّر'\)/.test(compSrc));
ok('tooltip shows HOW MANY reminders were sent', /title="\$\{ri\.count\} \$\{ri\.count === 1 \? t\('reminder sent'/.test(compSrc));
ok('...and the last reminder date', /t\('last', 'آخر'\) \+ ' ' \+ fmtDate\(ri\.last\)/.test(compSrc));
ok('escalating label: 1st / 2nd / Final reminder (like Due Payment)', /_lvl === 1 \? t\('1st reminder'[\s\S]{0,120}Final reminder/.test(compSrc));
ok('uses the REAL WhatsApp svg icon (not the 💬 "..." emoji)', /waIconSvg\(14\)/.test(compSrc) && !/>💬<\/a>/.test(compSrc));
ok('the WhatsApp button marks the reminder on click', /href="\$\{wl\}" target="_blank" rel="noopener" onclick="_compRemind\(\$\{m\.id\}\)"/.test(compSrc));
ok('3/3 used → disabled "✓ Reminded" (same as Due Payment)', /_sent >= 3[\s\S]{0,160}All 3 reminders sent this cycle/.test(compSrc));
ok('a Reminder column header exists', /<th class="text-center">\$\{t\('Reminder', 'التذكير'\)\}<\/th>/.test(compSrc));
ok('_compRemind marks silently + repaints rows (no global render)', /markReminded\(id, \{ rerender: false, silent: true \}\)/.test(compSrc));
ok('markReminded supports rerender:false + silent opts', /if \(info\.count >= 1 && !\(opts && opts\.silent\)\)/.test(pagesSrc) && /if \(!opts \|\| opts\.rerender !== false\) render\(\);/.test(pagesSrc));
ok('Due Payment now uses the real WhatsApp icon too', /const lvlIcon = \(typeof waIconSvg === 'function'\) \? waIconSvg\(14\) : '💬';/.test(pagesSrc));
ok('waIconSvg is a self-contained inline SVG (no network)', /function waIconSvg\(size\)/.test(fs.readFileSync(path.join(DIR, 'app.js'), 'utf8')));
ok('reminded state comes from reminderInfo (per membership cycle)', /const ri = \(typeof reminderInfo === 'function'\) \? reminderInfo\(m\)/.test(pagesSrc));
ok('filters persist across the render() markReminded triggers', /window\._compFilter = f;/.test(pagesSrc));

console.log('\n(4) the Ready-to-Renew screen renders without throwing:');
vm.runInContext(`state.members[0].subscriptions.forEach(s=>{ if(s.activity==='Football' && s.start==='2026-06-21') s.status='active'; }); state.members[0].subscriptions = state.members[0].subscriptions.filter(s=>!(s.activity==='Football' && s.start==='2026-07-22'));`, ctx);
ctx.currentRole = () => 'admin';
let r = vm.runInContext(`(function(){ try { const main = document.getElementById('main-x'); PAGES.completed(main); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx);
ok('PAGES.completed renders without throwing', r === 'ok', r);
ok('PAGES.completed is registered', vm.runInContext('typeof PAGES.completed', ctx) === 'function');

// functional: CLICKING the button must turn it green immediately — WITHOUT the global render().
// We make render() throw to prove the button repaints its own rows and never depends on it. (v6.366)
ctx.confirm = () => true; ctx.toast = () => {};
vm.runInContext(`window.save = function(){}; window.render = function(){ throw new Error('global render() must NOT be called'); };`, ctx);
const renderRows = () => { cap['#comp-tbody'] = undefined; vm.runInContext(`PAGES.completed(document.getElementById('main-x'))`, ctx); return (cap['#comp-tbody'] || {})._h || ''; };
vm.runInContext(`window._compFilter = undefined; state.members[0].startDate = '2026-06-21'; state.members[0].reminderDates = []; delete state.members[0].lastRemindedAt;`, ctx);
let rows = renderRows();
ok('not-yet-reminded → YELLOW badge (no green)', /background:rgba\(245,158,11,\.16\)/.test(rows) && /🔔/.test(rows) && !/badge active/.test(rows), rows.slice(0, 90));
ok('no Renew button in the rendered row', !/🔄/.test(rows) && !/addRenewal/.test(rows));
ok('a real WhatsApp SVG icon renders (not the "..." emoji)', /<svg viewBox="0 0 24 24"/.test(rows) && !/💬/.test(rows));
ok('the button reads "1st reminder" first', /1st reminder/.test(rows));
// clicking the WhatsApp button marks the reminder
const clicked = vm.runInContext(`(function(){ try { _compRemind(1); return 'ok'; } catch(e){ return 'THREW: '+(e&&e.message||e); } })()`, ctx);
ok('clicking WhatsApp marks it WITHOUT the global render()', clicked === 'ok', clicked);
ok('...it recorded the reminder (count = 1)', vm.runInContext('reminderInfo(state.members[0]).count', ctx) === 1);
rows = renderRows();
ok('AFTER → GREEN "✓ 1/3" badge', /badge active/.test(rows) && /✓ 1\/3/.test(rows), rows.slice(0, 90));
ok('...the yellow state is gone', !/background:rgba\(245,158,11,\.16\)/.test(rows));
ok('...tooltip reports "1 reminder sent"', /title="1 reminder sent/.test(rows), (rows.match(/title="[^"]*reminder[^"]*"/) || [])[0]);
ok('...and the button escalates to "2nd reminder"', /2nd reminder/.test(rows));
// a second reminder → "✓ 2/3" + pluralised tooltip (silent: no confirm interrupts WhatsApp)
vm.runInContext(`_compRemind(1);`, ctx);
rows = renderRows();
ok('2nd WhatsApp reminder → "✓ 2/3" + "2 reminders sent"', /✓ 2\/3/.test(rows) && /title="2 reminders sent/.test(rows), (rows.match(/title="[^"]*reminders sent[^"]*"/) || [])[0]);
// third → all used → disabled "✓ Reminded", no more sending
vm.runInContext(`_compRemind(1);`, ctx);
rows = renderRows();
ok('after 3/3 → button disabled "✓ Reminded" (cap respected)', /All 3 reminders sent this cycle/.test(rows) && /✓ 3\/3/.test(rows), (rows.match(/✓ \d\/3/) || [])[0]);

console.log('\nREADY TO RENEW:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
