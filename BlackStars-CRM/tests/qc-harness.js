// Shared QC harness: a browser-shaped sandbox + a realistic club dataset, so any test can render
// a real screen and assert on what it produced. Exported so every module test uses the SAME
// environment and the same seed — a failure then means the screen is wrong, not the fixture.
const vm = require('vm'), fs = require('fs'), path = require('path');

const DIR = [path.join(__dirname, '..'), path.join(__dirname, 'crm238', 'blackstars-localhost')]
  .find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });

function readSrc() {
  return ['app.js', 'pages.js'].map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
}

// A DOM stub rich enough for these screens: they build innerHTML, query nodes, attach handlers.
function makeEl(cap, key) {
  const node = {
    _h: '', style: {}, dataset: {}, value: '', checked: false, files: [], options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    get innerHTML() { return this._h; },
    set innerHTML(v) { this._h = String(v); if (cap && key) cap[key] = this; },
    get textContent() { return this._h; },
    set textContent(v) { this._h = String(v); },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, insertBefore() {},
    append() {}, prepend() {}, replaceChildren() {},
    removeChild() {}, remove() {}, setAttribute() {}, removeAttribute() {},
    getAttribute: () => null, hasAttribute: () => false, focus() {}, blur() {}, click() {},
    closest() { return makeEl(); }, contains: () => false, scrollIntoView() {},
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
    getContext: () => ({ fillRect() {}, fillText() {}, measureText: () => ({ width: 10 }), beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, setTransform() {}, drawImage() {} }),
    toDataURL: () => 'data:,', width: 100, height: 100,
  };
  return node;
}

function makeCtx(opts) {
  opts = opts || {};
  const cap = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    JSON, Math, Date, String, Number, Array, Object, Set, Map, WeakMap, Promise, RegExp, Error,
    isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, Boolean,
    TextEncoder: typeof TextEncoder !== 'undefined' ? TextEncoder : function () {},
    setTimeout: (f) => { if (typeof f === 'function') { try { f(); } catch (_) {} } return 0; },
    clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: (f) => { if (typeof f === 'function') { try { f(); } catch (_) {} } return 0; },
    cancelAnimationFrame() {}, atob: s => Buffer.from(String(s), 'base64').toString('binary'),
    btoa: s => Buffer.from(String(s), 'binary').toString('base64'),
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  const FROZEN = opts.today || '2026-07-24';
  ctx.TODAY = FROZEN;
  // FREEZE the clock inside the sandbox. app.js computes `const TODAY = new Date()...` at load,
  // so without this the whole suite reads the REAL system date and every date-pinned assertion
  // breaks at midnight (that is exactly what happened on the 24→25 rollover). Argless `new Date()`
  // and `Date.now()` return the frozen instant; `new Date(str)` parsing is untouched.
  const _RealDate = Date;
  const _frozenMs = new _RealDate(FROZEN + 'T00:00:00').getTime();
  function FrozenDate(...args) {
    if (!(this instanceof FrozenDate)) return new _RealDate(_frozenMs).toString();
    return args.length === 0 ? new _RealDate(_frozenMs) : new _RealDate(...args);
  }
  FrozenDate.prototype = _RealDate.prototype;
  FrozenDate.now = () => _frozenMs;
  FrozenDate.parse = _RealDate.parse;
  FrozenDate.UTC = _RealDate.UTC;
  ctx.Date = FrozenDate;
  ctx.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  ctx.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  ctx.location = { href: 'https://x/', hash: '', reload() {}, origin: 'https://x' };
  ctx.navigator = { userAgent: 'qc', onLine: true, clipboard: { writeText: () => Promise.resolve() } };
  ctx.history = { pushState() {}, replaceState() {} };
  ctx.addEventListener = () => {}; ctx.removeEventListener = () => {};
  ctx.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {}, removeListener() {} });
  ctx.getComputedStyle = () => ({ getPropertyValue: () => '', direction: 'ltr' });
  ctx.alert = () => {}; ctx.confirm = () => true; ctx.prompt = () => null;
  ctx.open = () => ({ document: { write() {}, close() {} }, print() {}, focus() {}, close() {} });
  ctx.print = () => {};
  ctx.URL = { createObjectURL: () => 'blob:', revokeObjectURL() {} };
  ctx.Blob = function () {}; ctx.FileReader = function () { this.readAsText = () => {}; };
  // `Node` is a real DOM global some helpers test with `instanceof Node` (app.js el() append
  // path). Without it those helpers throw "Node is not defined" in the sandbox — which is why
  // the invoice PDF builder couldn't run here. A stub constructor is enough: stub elements are
  // not instances of it, so the code takes the createTextNode branch, which we also provide.
  ctx.Node = function Node() {};
  ctx.document = {
    addEventListener() {}, removeEventListener() {},
    getElementById: (id) => (cap['#' + id] = cap['#' + id] || makeEl(cap, '#' + id)),
    querySelector: () => makeEl(), querySelectorAll: () => [],
    createElement: () => makeEl(), createElementNS: () => makeEl(), createDocumentFragment: () => makeEl(),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t == null ? '' : t) }),
    body: makeEl(), head: makeEl(), documentElement: makeEl(),
    visibilityState: 'visible', activeElement: null, execCommand() {},
  };
  ctx.firebase = {
    initializeApp: () => ({}),
    firestore: Object.assign(() => ({
      settings() {}, enablePersistence: () => Promise.resolve(), useEmulator() {},
      doc: () => ({ get: () => Promise.resolve({ exists: false, data: () => ({}) }), set: () => Promise.resolve() }),
      collection: () => ({ onSnapshot: () => () => {}, get: () => Promise.resolve({ forEach() {} }), doc: () => ({}) }),
      batch: () => ({ set() {}, delete() {}, commit: () => Promise.resolve() }),
      runTransaction: () => Promise.resolve(),
    }), { FieldValue: { delete: () => ({}), serverTimestamp: () => ({}) } }),
    auth: Object.assign(() => ({ currentUser: { email: 'qc@blackstars.qa', uid: 'qc' }, onAuthStateChanged() {}, setPersistence: () => Promise.resolve(), useEmulator() {} }), { Auth: { Persistence: { LOCAL: 'local' } } }),
    app: () => ({}),
  };
  ctx.XlsxMini = { downloadFile() {} };
  vm.createContext(ctx);
  try { vm.runInContext(readSrc(), ctx); } catch (e) { ctx.__loadError = e.message; }
  ctx.currentRole = () => opts.role || 'admin';
  ctx.__cap = cap;
  return ctx;
}

// A realistic club: members across sports/coaches/statuses, invoices with installments, expenses,
// salaries, sales, rentals, schedule, camp. Deliberately includes the shapes that have bitten us:
// a member whose secondary coach differs, a part-paid invoice, a legacy invoice with no ledger,
// an archived member, a soft-deleted invoice, and Arabic names.
const SEED = `
state.coaches = [
  {id:1,name:'Mostafa',rate:30,role:'coach',active:true,phone:'+97430000001'},
  {id:2,name:'Iyad',rate:30,role:'coach',active:true,phone:'+97430000002'},
  {id:3,name:'Aya',rate:0,fixedSalary:3000,role:'staff',active:true,phone:'+97430000003'}
];
state.members = [
  {id:101,name:'Ali Hassan',nameArabic:'علي حسن',phone:'+97431000001',qid:'28912345',sport:'Swimming',coachId:1,
   joinDate:'2026-05-01',expiryDate:'2026-08-01',status:'Active',nationality:'Qatari',birthdate:'2010-03-04',
   enrollments:[{sport:'Swimming',coachId:1,classes:8,price:650}],
   subscriptions:[{_sid:'s101',activity:'Swimming',coachId:1,totalClasses:8,start:'2026-07-01',end:'2026-08-01',status:'active'}],
   dailyAttendance:{'2026-07':{'Swimming':{'03':'Y','10':'Y','17':'N'}}}},
  {id:102,name:'Sara Ahmed',nameArabic:'سارة أحمد',phone:'+97431000002',sport:'Summer Camp',coachId:null,
   joinDate:'2026-06-01',expiryDate:'2026-09-01',status:'Active',nationality:'Egyptian',birthdate:'2012-07-24',
   enrollments:[{sport:'Summer Camp',coachId:null,classes:22,price:1500},{sport:'Kick Boxing',coachId:2,classes:12,price:650}],
   subscriptions:[{_sid:'s102a',activity:'Summer Camp',coachId:null,totalClasses:22,start:'2026-07-01',end:'2026-08-01',status:'active'},
                  {_sid:'s102b',activity:'Kick Boxing',coachId:2,totalClasses:12,start:'2026-07-01',end:'2026-08-01',status:'active'}],
   dailyAttendance:{'2026-07':{'Kick Boxing':{'05':'Y','12':'Y'}}}},
  {id:103,name:'Omar Khalid',nameArabic:'عمر خالد',phone:'+97431000003',sport:'Kick Boxing',coachId:2,
   joinDate:'2026-01-01',expiryDate:'2026-06-01',status:'Expired',nationality:'Jordanian',
   enrollments:[{sport:'Kick Boxing',coachId:2,classes:12,price:650}],
   subscriptions:[{_sid:'s103',activity:'Kick Boxing',coachId:2,totalClasses:12,start:'2026-05-01',end:'2026-06-01',status:'expired'}],
   dailyAttendance:{'2026-05':{'Kick Boxing':{'02':'Y'}}}},
  {id:104,name:'Archived Person',phone:'+97431000004',sport:'Swimming',coachId:1,deleted:true,deletedAt:'2026-06-01T00:00:00Z',
   enrollments:[{sport:'Swimming',coachId:1,classes:8}],subscriptions:[]},
  {id:105,name:'Frozen Kid',phone:'+97431000005',sport:'Karate',coachId:1,joinDate:'2026-04-01',expiryDate:'2026-09-01',
   currentFreezeUntil:'2026-08-15',
   enrollments:[{sport:'Karate',coachId:1,classes:8,price:600}],
   subscriptions:[{_sid:'s105',activity:'Karate',coachId:1,totalClasses:8,start:'2026-06-01',end:'2026-09-01',status:'active'}]}
];
state.invoices = [
  {id:900,ref:'INV900',customerId:101,customerName:'Ali Hassan',category:'Membership',sport:'Swimming',
   date:'2026-07-01',month:'2026-07',amount:650,amountPaid:650,method:'cash',coachId:1,coach:'Mostafa',
   lineItems:[{sport:'Swimming',coachId:1,coach:'Mostafa',classes:8,price:650}],
   payments:[{date:'2026-07-01',month:'2026-07',amount:650,method:'cash',by:'qc',byName:'QC',at:'2026-07-01T09:00:00Z'}]},
  {id:901,ref:'INV901',customerId:102,customerName:'Sara Ahmed',category:'Membership',sport:'Summer Camp, Kick Boxing',
   date:'2026-07-01',month:'2026-07',amount:2150,amountPaid:1000,method:'card',
   lineItems:[{sport:'Summer Camp',classes:22,price:1500},{sport:'Kick Boxing',coachId:2,coach:'Iyad',classes:12,price:650}],
   payments:[{date:'2026-07-01',month:'2026-07',amount:500,method:'card',at:'2026-07-01T09:00:00Z',by:'qc'},
             {date:'2026-07-15',month:'2026-07',amount:500,method:'cash',at:'2026-07-15T09:00:00Z',by:'qc'}]},
  {id:902,ref:'INV902',customerId:103,customerName:'Omar Khalid',category:'Membership',sport:'Kick Boxing',
   date:'2026-05-01',month:'2026-05',amount:650,coachId:2,coach:'Iyad',
   lineItems:[{sport:'Kick Boxing',coachId:2,coach:'Iyad',classes:12,price:650}]},
  {id:903,ref:'INV903',customerId:101,customerName:'Ali Hassan',category:'Product',sport:'Boxing Gloves',
   date:'2026-07-10',month:'2026-07',amount:100,amountPaid:100,method:'card',
   lineItems:[{sport:'Boxing Gloves',price:100}],payments:[{date:'2026-07-10',month:'2026-07',amount:100,method:'card'}]},
  {id:904,ref:'INV904',customerId:103,category:'Membership',date:'2026-04-01',month:'2026-04',amount:650,deleted:true,deletedAt:'2026-05-01T00:00:00Z'}
];
state.expenses = [
  {id:1,date:'2026-07-02',month:'2026-07',category:'Utilities',description:'Electricity',amount:1600,method:'transfer'},
  {id:2,date:'2026-07-05',month:'2026-07',category:'Salary',description:'Coach payout',amount:2000,method:'cash',_salaryAutoExpense:true,salaryId:'sal1',coachId:1},
  {id:3,date:'2026-07-08',month:'2026-07',category:'Equipment',description:'Mats',amount:700,method:'cash'}
];
state.salaries = [
  {id:'sal1',coachId:1,coach:'Mostafa',month:'2026-07',amount:2000,
   payments:[{id:'p1',amount:2000,date:'2026-07-05',method:'cash'}]}
];
state.sales = [
  {id:1,date:'2026-07-10',month:'2026-07',productId:1,productName:'Boxing Gloves',qty:1,price:100,total:100,
   customerId:101,customerName:'Ali Hassan',method:'card',invoiceId:903}
];
state.products = [
  {id:1,name:'Boxing Gloves',category:'Gear',price:100,cost:60,stock:10},
  {id:2,name:'Swimming Goggles',category:'Gear',price:50,cost:30,stock:2}
];
state.rentals = [
  {id:1,date:'2026-07-12',month:'2026-07',facility:'Football Court',customerName:'Walk-in Group',
   hours:2,amount:300,method:'cash',category:'Court Rental'}
];
state.rentalCustomers = [{id:1,name:'Walk-in Group',phone:'+97432000001'}];
state.schedule = [
  {id:11,day:'sat',slot:17,sport:'Kick Boxing',coachId:2},
  {id:12,day:'sun',slot:16,sport:'Swimming',coachId:1},
  {id:13,day:'mon',slot:18,sport:'Karate',coachId:1}
];
state.swimGroups = [{id:1,name:'Group A',coachId:1,memberIds:[101],order:0,createdAt:'2026-07-01T00:00:00Z'}];
state.trials = [{id:1,name:'Trial Kid',phone:'+97433000001',sport:'Karate',coachId:1,date:'2026-07-20',status:'pending'}];
state.families = [{id:1,name:'Hassan family',phone:'+97431000001',familyTotal:650}];
state.drivers = [{id:1,name:'Driver One',phone:'+97434000001',capacity:12}];
state.notes = [{id:1,text:'Order new mats',priority:'high',createdAt:'2026-07-01T00:00:00Z'}];
state.posts = [];
state.advices = [];
state.auditLog = [{id:'a1',action:'member.add',entity:'member:101',detail:'Added Ali Hassan',at:'2026-07-01T09:00:00Z',byName:'QC',module:'members'}];
state.cashCounts = [{id:'cc1',amount:500,date:'2026-07-20',by:'QC',note:'',createdAt:'2026-07-20T00:00:00Z'}];
state.membershipTransfers = [];
state.settings = state.settings || {};
state.settings.expenseCategories = ['Utilities','Equipment','Cleaning','Marketing','Salary','Rent'];
state.settings.facilityRates = {'Football Court':150,'Boxing Room':100,'Swimming Pool':200};
state.session = { role: 'admin', email: 'qc@blackstars.qa' };
`;

function seed(ctx, extra) {
  vm.runInContext(SEED + (extra || ''), ctx);
  return ctx;
}

// Render a screen and return { ok, html, error }. Never throws — a crash is a RESULT, not an abort.
function renderScreen(ctx, name) {
  const out = vm.runInContext(`(function(){
    try {
      if (!PAGES[${JSON.stringify(name)}]) return { ok:false, error:'no such screen' };
      const el = document.getElementById('main');
      el.innerHTML = '';
      PAGES[${JSON.stringify(name)}](el);
      return { ok:true, html: String(el.innerHTML || '') };
    } catch (e) { return { ok:false, error: (e && e.message) || String(e), stack: (e && e.stack || '').split('\\n').slice(0,3).join(' | ') }; }
  })()`, ctx);
  if (out && out.ok && (!out.html || out.html.length < 5)) {
    // Some screens write into captured child nodes rather than #main.
    const all = Object.values(ctx.__cap || {}).map(e => (e && e._h) || '').join('\n');
    if (all.length > out.html.length) out.html = all;
  }
  return out;
}

function reporter(title) {
  let pass = 0, fail = 0; const failures = [];
  return {
    ok(name, cond, got) {
      if (cond) { pass++; console.log('  ✓', name); }
      else { fail++; failures.push(name); console.log('  ✗ FAIL:', name, got !== undefined ? '→ ' + JSON.stringify(got).slice(0, 200) : ''); }
    },
    section(s) { console.log('\n' + s); },
    done() {
      console.log(`\n${title}: ${pass} passed, ${fail} failed`);
      process.exit(fail ? 1 : 0);
    },
    get pass() { return pass; }, get fail() { return fail; },
  };
}

module.exports = { DIR, makeCtx, seed, renderScreen, reporter, SEED, readSrc, vm };
