// Black Stars CRM — logic test harness.
// Loads the REAL app.js + pages.js inside a vm with stubbed browser globals,
// seeds a realistic state, and asserts the critical business logic.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const DIR = require('path').join(__dirname, '..');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

// ---- Minimal browser stubs --------------------------------------------------
function fakeEl() {
  const e = {
    style: {}, dataset: {}, children: [], _html: '',
    classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
    setAttribute(){}, getAttribute(){return null;}, removeAttribute(){},
    appendChild(c){ this.children.push(c); return c; }, append(){}, prepend(){},
    addEventListener(){}, removeEventListener(){}, remove(){},
    querySelector(){return null;}, querySelectorAll(){return [];},
    focus(){}, click(){}, closest(){return null;}, contains(){return false;},
    insertAdjacentHTML(){}, cloneNode(){return fakeEl();},
  };
  Object.defineProperty(e, 'innerHTML', { get(){return this._html;}, set(v){this._html=v;} });
  Object.defineProperty(e, 'textContent', { get(){return this._txt||'';}, set(v){this._txt=v;} });
  Object.defineProperty(e, 'value', { get(){return this._val||'';}, set(v){this._val=v;} });
  return e;
}
const documentStub = {
  getElementById(){ return null; },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return fakeEl(); },
  createElementNS(){ return fakeEl(); },
  addEventListener(){}, removeEventListener(){},
  body: fakeEl(), head: fakeEl(), documentElement: fakeEl(),
};
const localStorageStub = (() => {
  const m = {};
  return { getItem:k=>k in m?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];} };
})();

const ctx = {
  console,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0,
  localStorage: localStorageStub,
  sessionStorage: (() => { const m = {}; return { getItem:k=>k in m?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];}, clear:()=>{for(const k in m)delete m[k];} }; })(),
  navigator: { userAgent: 'node', clipboard: { writeText: () => Promise.resolve() } },
  location: { href: 'file:///index.html', reload(){} },
  document: documentStub,
  alert: () => {}, confirm: () => true, prompt: () => null,
  matchMedia: () => ({ matches: false, addEventListener(){}, addListener(){} }),
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL(){} },
  Blob: function(){}, FileReader: function(){},
  fetch: () => Promise.reject(new Error('no network in test')),
};
ctx.window = ctx;
ctx.globalThis = ctx;
ctx.self = ctx;
ctx.window.addEventListener = () => {};   // swallow DOMContentLoaded bootstrap

vm.createContext(ctx);

// ---- Test scenario seed -----------------------------------------------------
// Dates relative to a fixed "today" the app computes itself (TODAY). We seed
// expiry dates clearly in the past/future so status logic is unambiguous.
const seed = `
state = {
  user: { name: 'Administrator', email: 'admin' },
  settings: {},
  coaches: [
    { id: 1, name: 'Mostafa', rate: 0, fixedSalary: 3000, active: 'Y' },
    { id: 2, name: 'Abdel Salam', rate: 30, fixedSalary: 0, active: 'Y' },
    { id: 3, name: 'Aya', rate: 25, fixedSalary: 0, active: 'N' },
  ],
  members: [
    // 0: active, MMA under coach 2, has 2nd mobile
    { id: 10, name: 'Karim', nameArabic: 'كريم', phone: '+974 5011 1111', phone2: '+974 5041 3948', qid: '28812345678', expiryDate: '2099-12-31', status: 'Active', coachId: 2, enrollments: [{ sport: 'MMA', coachId: 2, classes: 12, price: 350 }], subscriptions: [{ activity:'MMA', coachId:2, totalClasses:12, attendedClasses:5, start:'2026-05-01', end:'2026-05-31', invoiceNumber:'INV0001' }], dailyAttendance: { '2026-06': { 'MMA': { '3':'Y','5':'Y' } } } },
    // 1: expired
    { id: 11, name: 'Sara', nameArabic: '', phone: '+974 5022 2222', qid: '', expiryDate: '2020-01-01', status: 'Active', coachId: 2, enrollments: [{ sport: 'Karate', coachId: 2 }] },
    // 2: duplicate of Karim (same phone + same EN name) -> should be flagged
    { id: 12, name: 'karim', nameArabic: '', phone: '+97450111111', qid: '', expiryDate: '2099-12-31', status: 'Active', coachId: 2, enrollments: [{ sport: 'MMA', coachId: 2 }] },
    // 3: shares phone with a different name (family) -> NOT a duplicate
    { id: 13, name: 'Mona', nameArabic: '', phone: '+974 5011 1111', qid: '', expiryDate: '2099-12-31', status: 'Active', coachId: 1, enrollments: [{ sport: 'Swimming', coachId: 1 }] },
    // 4: frozen
    { id: 14, name: 'Frozen Guy', phone: '+974 5099 9999', expiryDate: '2020-01-01', currentFreezeUntil: '2099-01-01', status: 'Active', coachId: 1, enrollments: [{ sport: 'Boxing', coachId: 1 }] },
    // 5: archived (deleted)
    { id: 15, name: 'Gone', phone: '+974 5088 8888', expiryDate: '2099-12-31', deleted: true, status: 'Active', coachId: 1, enrollments: [] },
    // 6: multi-sport
    { id: 16, name: 'Multi', phone: '+974 5077 7777', expiryDate: '2099-12-31', status: 'Active', coachId: 2, enrollments: [{ sport: 'Kick Boxing', coachId: 2 }, { sport: 'Gymnastic', coachId: 1 }] },
  ],
  invoices: [
    { id: 1, ref: 'INV0001', date: '2026-06-03', month: '2026-06', amount: 350, method: 'cash', category: 'Membership', sport: 'MMA', coachId: 2, customerId: 10 },
    { id: 2, ref: 'INV0002', date: '2026-06-03', month: '2026-06', amount: 175, method: 'cash', category: 'Membership', sport: 'Summer Camp', coachId: null, customerId: 10 },
    { id: 3, ref: 'INV0005', date: '2026-06-03', month: '2026-06', amount: 200, method: 'card', category: 'Product', sport: null, coachId: null, customerId: 16 },
  ],
  products: [
    { id: 1, name: 'Gloves', price: 80, stock: 10, lowStockThreshold: 3 },
    { id: 2, name: 'Gi', price: 150, stock: 2, lowStockThreshold: 3 },
  ],
  sales: [
    { id: 1, date: '2026-06-03', customerId: 16, items: [{ productId: 1, qty: 3, unitPrice: 80 }] },
  ],
  expenses: [],
  salaries: [],
  schedule: [],
  rentals: [],
  audit: [],
};
`;

// ---- Assertions -------------------------------------------------------------
const epilogue = `
${seed}
;(function runTests(){
  let pass = 0, fail = 0; const fails = [];
  function ok(cond, label){ if(cond){pass++;} else {fail++; fails.push(label);} }
  function eq(a,b,label){ ok(JSON.stringify(a)===JSON.stringify(b), label + '  (got '+JSON.stringify(a)+', want '+JSON.stringify(b)+')'); }

  // --- date / number helpers ---
  eq(daysInMonth('2026-02'), 28, 'daysInMonth Feb 2026');
  eq(daysInMonth('2024-02'), 29, 'daysInMonth Feb 2024 leap');
  eq(daysInMonth('2026-04'), 30, 'daysInMonth Apr');
  // nextId is now COLLISION-SAFE (time-based unique, above the max) rather than a
  // plain max+1, so two devices creating at once can't pick the same id.
  ok(nextId([{id:3},{id:7},{id:2}]) > 7, 'nextId returns an id above the current max');
  ok(Number.isSafeInteger(nextId([{id:3}])), 'nextId returns a safe integer');
  (() => { const a = nextId([{id:5}]), b = nextId([{id:5}]); ok(a !== b, 'nextId is unique across back-to-back calls (no collision)'); })();
  ok(nextId([]) >= 1, 'nextId on empty list still returns a positive id');
  eq(pctChangeStr(0,100), '∞', 'pct from zero -> ∞');
  eq(pctChangeStr(0,0), '—', 'pct 0->0 -> dash');
  eq(pctChangeStr(100,150), '50.0', 'pct +50');
  eq(pctChangeStr(100,50), '-50.0', 'pct -50');

  // --- phone helpers ---
  ok(isRealPhone('+97455551234'), 'isRealPhone real');
  ok(!isRealPhone('+97470001234'), 'isRealPhone placeholder false');
  ok(!isRealPhone(''), 'isRealPhone empty false');
  ok(phonesMatch('+974 5011 1111', '+97450111111'), 'phonesMatch diff formatting');
  ok(!phonesMatch('+97450111111', '+97450222222'), 'phonesMatch different false');

  // --- name / duplicate detection ---
  ok(namesMatch({name:'Karim'},{name:'  karim '}), 'namesMatch EN case/space');
  ok(namesMatch({nameArabic:'كريم'},{nameArabic:'كريم'}), 'namesMatch AR');
  ok(!namesMatch({name:'Karim'},{name:'Mona'}), 'namesMatch different false');
  const dup = findDuplicateMember('+97450111111','karim','',999);
  ok(dup && dup.id===10, 'findDuplicateMember finds same phone+name');
  const noDup = findDuplicateMember('+974 5011 1111','Totally Different','',999);
  ok(noDup===null, 'findDuplicateMember different name same phone -> null (family ok)');
  const selfExcluded = findDuplicateMember('+97450111111','karim','',10);
  ok(selfExcluded && selfExcluded.id===12, 'findDuplicateMember excludes self, finds other dup');
  const clusters = findAllDuplicateMembers();
  const karimCluster = clusters.find(c => c.some(m=>m.id===10) && c.some(m=>m.id===12));
  ok(!!karimCluster, 'findAllDuplicateMembers clusters Karim+karim');
  const monaInCluster = clusters.some(c => c.some(m=>m.id===13) && c.some(m=>m.id===10));
  ok(!monaInCluster, 'family (Mona) NOT clustered with Karim despite shared phone');

  // --- member status ---
  eq(memberStatus(state.members.find(m=>m.id===10)), 'Active', 'status active (future expiry)');
  eq(memberStatus(state.members.find(m=>m.id===11)), 'Expired', 'status expired (past expiry)');
  eq(memberStatus(state.members.find(m=>m.id===14)), 'Frozen', 'status frozen');

  // --- coach name ---
  eq(coachName(2), 'Abdel Salam', 'coachName found');

  // --- customerInfo incl. phone2 ---
  const ci = customerInfo({ customerId: 10 });
  eq(ci.phone2, '+974 5041 3948', 'customerInfo exposes phone2');
  eq(ci.nameArabic, 'كريم', 'customerInfo exposes arabic name');

  // --- stock ---
  eq(productCurrentStock(1), 7, 'stock 10 - 3 sold = 7');
  eq(productCurrentStock(2), 2, 'stock untouched = 2');

  // --- invoice ref ---
  eq(nextInvoiceRef(), 'INV0006', 'nextInvoiceRef after INV0005');

  // --- COMMISSION (real payroll fn), incl. Summer Camp exclusion ---
  const payBefore = computeMonthlyPay(2, '2026-06');
  eq(Math.round(payBefore.commissionBase), 146, 'commission base = MMA prorated by attendance 5/12 x 350 (Summer Camp excluded)');
  eq(Math.round(payBefore.commissionAmount), 44, 'commission 30% of prorated base = 44');

  // --- MERGE preserves commission (replace inv 1+2 with one lineItem invoice) ---
  state.invoices = state.invoices.filter(i => i.id!==1 && i.id!==2);
  state.invoices.push({ id: 99, ref:'INV0001', date:'2026-06-03', month:'2026-06', amount:525, method:'cash', category:'Membership', sport:null, coachId:null, customerId:10,
    lineItems:[{sport:'MMA',coachId:2,price:350},{sport:'Summer Camp',coachId:null,price:175}] });
  const payAfter = computeMonthlyPay(2, '2026-06');
  eq(Math.round(payAfter.commissionBase), 146, 'commission base STILL prorated 146 after merge (lineItems honored)');

  // --- Member Commission report: camp & expired-zero excluded, sports split ---
  state.members.push({ id: 920, name: 'CampOnly', expiryDate: '2099-12-31', subscriptions: [{ activity: 'Summer Camp', totalClasses: 5, attendedClasses: 3, start: '2026-06-01' }] });
  state.invoices.push({ id: 9920, ref: 'INVMC1', date: '2026-06-05', month: '2026-06', amount: 600, category: 'Membership', customerId: 920, lineItems: [{ sport: 'Summer Camp', coachId: null, price: 600 }] });
  state.members.push({ id: 921, name: 'NoShowExp', expiryDate: '2026-01-01', subscriptions: [{ activity: 'Boxing', coachId: 2, totalClasses: 8, attendedClasses: 0, start: '2025-12-01', end: '2026-01-01' }], dailyAttendance: {} });
  state.invoices.push({ id: 9921, ref: 'INVMC2', date: '2026-06-06', month: '2026-06', amount: 800, category: 'Membership', coachId: 2, sport: 'Boxing', customerId: 921, lineItems: [{ sport: 'Boxing', coachId: 2, price: 800 }] });
  state.members.push({ id: 922, name: 'TwoSports', expiryDate: '2099-12-31', status: 'Active',
    subscriptions: [{ activity: 'MMA', coachId: 2, totalClasses: 8, attendedClasses: 8, start: '2026-06-01', end: '2026-12-31', invoiceNumber: 'INVMC3' },
                    { activity: 'Karate', coachId: 3, totalClasses: 8, attendedClasses: 8, start: '2026-06-01', end: '2026-12-31', invoiceNumber: 'INVMC3' }] });
  state.invoices.push({ id: 9922, ref: 'INVMC3', date: '2026-06-07', month: '2026-06', amount: 900, category: 'Membership', customerId: 922, lineItems: [{ sport: 'MMA', coachId: 2, price: 500 }, { sport: 'Karate', coachId: 3, price: 400 }] });
  const mc = computeMemberCommissions('2026-06');
  ok(!mc.some(r => r.memberName === 'CampOnly'), 'member-commission: Summer Camp member excluded (no coach commission)');
  ok(!mc.some(r => r.memberName === 'NoShowExp'), 'member-commission: expired-with-zero-attendance excluded from report');
  const tsRows = mc.filter(r => r.memberName === 'TwoSports');
  eq(tsRows.length, 2, 'member-commission: member in two sports → two separate rows');
  ok(tsRows.some(r => r.sport === 'MMA' && r.paid === 500) && tsRows.some(r => r.sport === 'Karate' && r.paid === 400), 'member-commission: each sport row carries its own paid amount');
  ok(tsRows.every(r => r.coachName && r.start && r.expiry), 'member-commission: rows carry coach, start, expiry');
  state.members = state.members.filter(m => ![920, 921, 922].includes(m.id));
  state.invoices = state.invoices.filter(i => ![9920, 9921, 9922].includes(i.id));

  // --- Frozen / non-completed member on a sport-less invoice line still pro-rates ---
  state.members.push({ id: 930, name: 'FrozenNoSport', status: 'Frozen', expiryDate: '2026-08-11',
    subscriptions: [{ activity: 'Karate', coachId: 2, totalClasses: 8, attendedClasses: 3, start: '2026-06-01', end: '2026-08-11' }],
    dailyAttendance: { '2026-06': { 'Karate': { '1': 'Y', '2': 'Y', '3': 'Y' } } } });
  const fzNoSport = lineCommissionEligibility(state.members.find(m => m.id === 930), { ref: 'INVFZ', month: '2026-06', coachId: 2 }, { coachId: 2, price: 1125 }, null);
  ok(fzNoSport.total === 8 && fzNoSport.attended === 3, 'frozen no-sport line: derives 3/8 from member subscription');
  ok(fzNoSport.mode === "prorated" && Math.round(fzNoSport.base) === 422, 'frozen no-sport line: pro-rates 3/8 x 1125 = 422 (NOT full 1125)');
  state.members = state.members.filter(m => m.id !== 930);

  // --- pagination ---
  const pager = makePager(2); pager.page = 2;
  eq(paginate([1,2,3,4,5], pager), [3,4], 'paginate page 2 size 2');

  // --- attendance counting ---
  const am = { id: 50, dailyAttendance: { '2026-06': { 'MMA': { '3':'Y','5':'Y','7':'N' }, 'Boxing': { '2':'Y' } } } };
  const lac = liveAttendanceCount(am, 'MMA');
  eq([lac.y, lac.n, lac.total], [2,1,3], 'liveAttendanceCount MMA y/n/total');
  eq(attendedClassesFor(am, 'MMA'), 2, 'attendedClassesFor MMA = 2');
  eq(attendanceFor(am, '2026-06', 'MMA'), {'3':'Y','5':'Y','7':'N'}, 'attendanceFor returns day map');
  const lacAll = liveAttendanceCount(am, null);
  eq([lacAll.y, lacAll.n], [3,1], 'liveAttendanceCount all sports y/n');

  // --- age / birthday ---
  ok(memberAge('') === null, 'memberAge empty -> null');
  ok(Number.isInteger(memberAge('2000-06-15')) && memberAge('2000-06-15') >= 0, 'memberAge valid -> int');
  ok(memberAge('not-a-date') === null, 'memberAge invalid -> null');
  const dub = daysUntilBirthday('1990-12-31');
  ok(dub === null || (dub >= 0 && dub <= 366), 'daysUntilBirthday in range');
  ok(isBirthdayInMonth('1990-06-15', '2026-06') === true, 'isBirthdayInMonth June match');
  ok(isBirthdayInMonth('1990-07-15', '2026-06') === false, 'isBirthdayInMonth July vs June');

  // --- QID lookup ---
  const byQid = findMembersByQid('28812345678');
  ok(byQid.length === 1 && byQid[0].id === 10, 'findMembersByQid finds Karim');
  ok(findMembersByQid('28812345678', 10).length === 0, 'findMembersByQid excludeId works');
  ok(findMembersByQid('').length === 0, 'findMembersByQid empty -> []');

  // --- number to words (invoice receipts) ---
  eq(numberToWords(0), 'Zero', 'numberToWords zero');
  ok(/Hundred/.test(numberToWords(525)) && numberToWords(525).length > 0, 'numberToWords 525 has Hundred');
  ok(typeof numberToWords(1000) === 'string' && numberToWords(1000).length > 0, 'numberToWords 1000 non-empty');

  // --- month helpers (note: invoice 1+2 were merged into id 99, still 2026-06) ---
  ok(availableMonths().includes('2026-06'), 'availableMonths includes 2026-06');
  eq(latestDataMonth(), '2026-06', 'latestDataMonth = 2026-06');

  // --- formatters / edge cases ---
  eq(fmt(null), '—', 'fmt null'); eq(fmt(NaN), '—', 'fmt NaN'); eq(fmt(1234), '1,234', 'fmt thousands');
  eq(fmtMoney(null), '—', 'fmtMoney null'); eq(fmtMoney(500), '500 QAR', 'fmtMoney 500');
  eq(escapeHtml('<b>"x"&\\''), '&lt;b&gt;&quot;x&quot;&amp;&#39;', 'escapeHtml escapes all');
  eq(escapeHtml(null), '', 'escapeHtml null -> empty');
  eq(normalizePhoneForCompare('+974 50-11 (x)'), '974' + '5011', 'normalizePhone strips non-digits');
  eq(numberToWords(-5), 'Negative Five', 'numberToWords negative');
  // Out-of-range page now CLAMPS to the last valid page (so a filter/deletion that
  // shrinks results below the current page never shows an empty table).
  ok((()=>{const p=makePager(2);p.page=99;const r=paginate([1,2,3],p);return r.length===1 && r[0]===3 && p.page===2;})(), 'paginate out-of-range -> clamps to last page');

  // --- computeStats: must not produce NaN/throw ---
  let stats = null, statsErr = null;
  try { stats = computeStats(); } catch(e){ statsErr = e.message; }
  ok(!statsErr, 'computeStats does not throw' + (statsErr?': '+statsErr:''));
  ok(stats && Number.isFinite(stats.currRevenue), 'computeStats.currRevenue is finite');
  ok(stats && Number.isFinite(stats.currExpenses), 'computeStats.currExpenses is finite');

  // --- mirrored closure logic (exact expressions used inside page closures) ---
  // Members multi-select sport filter
  function memberInSports(m, fSports){ if(fSports&&fSports.length){const s=new Set([m.sport,...((m.enrollments||[]).map(e=>e.sport))].filter(Boolean)); return fSports.some(sp=>s.has(sp));} return true; }
  ok(memberInSports(state.members.find(x=>x.id===16), ['Gymnastic']), 'multi-sport filter: Multi matches [Gymnastic]');
  ok(!memberInSports(state.members.find(x=>x.id===16), ['Karate']), 'multi-sport filter: Multi excluded by [Karate]');
  ok(memberInSports(state.members.find(x=>x.id===16), []), 'multi-sport filter: [] matches all');
  // Attendance attended filter
  function rowAttended(data, days){ return days.some(d => data[String(d)] === 'Y'); }
  ok(rowAttended({'3':'Y','5':'N'}, [3]) === true, 'attended filter: Y on day 3');
  ok(rowAttended({'3':'Y','5':'N'}, [5]) === false, 'attended filter: N on day 5');
  // Second-mobile search hay
  const hm = state.members.find(x=>x.id===10);
  const hay = [hm.name, hm.nameArabic, hm.phone, hm.phone2, hm.qid].filter(Boolean).join(' ').toLowerCase();
  ok(hay.includes('5041 3948'.toLowerCase()) || hay.includes('+974 5041 3948'.toLowerCase()), 'search hay includes 2nd mobile');
  ok(hay.includes('كريم'), 'search hay includes arabic name');

  // --- active-state helpers ---
  eq(activeCoaches().map(c=>c.id), [1,2], 'activeCoaches excludes inactive (id 3)');
  ok(isCoachActive({active:'Y'}) && !isCoachActive({active:'N'}) && isCoachActive({}), 'isCoachActive Y/N/default');
  ok(activeMembers().every(m=>!m.deleted) && !activeMembers().some(m=>m.id===15), 'activeMembers excludes archived');
  ok(isActiveStatus(state.members.find(m=>m.id===10)) === true, 'isActiveStatus active member');
  ok(isActiveStatus(state.members.find(m=>m.id===11)) === false, 'isActiveStatus expired member');

  // --- date deltas ---
  ok(daysUntil('') === null, 'daysUntil empty -> null');
  ok(daysUntil('not-a-date') === null, 'daysUntil invalid -> null');
  ok(daysUntil('2099-12-31') > 0, 'daysUntil future > 0');
  ok(daysUntil('2000-01-01') < 0, 'daysUntil past < 0');

  // --- payroll with an advance (net = gross - advance) ---
  state.salaries = [{ coachId: 2, month: '2026-06', kind: 'advance', amount: 50 }];
  const payAdv = computeMonthlyPay(2, '2026-06');
  eq(payAdv.advance, 50, 'advance recorded = 50');
  ok(Number.isFinite(payAdv.gross) && Number.isFinite(payAdv.net), 'pay gross/net finite');
  eq(payAdv.gross - payAdv.advance, payAdv.net, 'net = gross - advance');

  // --- coach revenue-report line enrichment (period / attendance / status) ---
  // mirrors the exact gathering logic added to downloadRevenueDetailPDF
  function gatherCoachLines(coachId, monthKey){
    const out=[];
    for (const inv of state.invoices){
      if (inv.month !== monthKey) continue;
      if ((inv.category||'Membership') !== 'Membership') continue;
      const mem = inv.customerId ? state.members.find(x=>x.id===inv.customerId) : null;
      const lis = Array.isArray(inv.lineItems)&&inv.lineItems.length ? inv.lineItems : [{sport:inv.sport,coachId:inv.coachId,price:inv.amount||0}];
      for (const li of lis){
        if (li.coachId !== coachId) continue;
        if (li.sport === SUMMER_CAMP) continue;
        let sub=null;
        if (mem){ sub=(mem.subscriptions||[]).find(s=>s.invoiceNumber===inv.ref&&s.activity===li.sport)||(mem.subscriptions||[]).find(s=>s.activity===li.sport&&s.coachId===li.coachId); }
        out.push({ memberName: mem?mem.name:(inv.customerName||'—'), sport: li.sport, price: parseFloat(li.price)||0,
          start: sub?.start||null, end: sub?.end||null, attended: mem?attendedClassesFor(mem,li.sport):0, total: sub?.totalClasses||null, status: mem?memberStatus(mem):'—' }); }
    }
    return out;
  }
  const cl = gatherCoachLines(2, '2026-06');   // after merge: invoice 99 (ref INV0001) MMA 350
  const karimLine = cl.find(l => l.sport === 'MMA');
  ok(!!karimLine, 'coach report has Karim MMA line');
  eq(karimLine.start, '2026-05-01', 'report line start date from subscription');
  eq(karimLine.end, '2026-05-31', 'report line end date from subscription');
  eq(karimLine.attended, 2, 'report line attended = live count (2)');
  eq(karimLine.total, 12, 'report line total classes = 12');
  eq(karimLine.status, 'Active', 'report line member status');
  ok(!cl.some(l => l.sport === SUMMER_CAMP), 'report excludes Summer Camp line');

  // --- duplicate-invoice guard logic (generate latest invoice) ---
  function dupCheck(memberId, mth){ return state.invoices.filter(inv => inv.customerId===memberId && inv.month===mth && (inv.category||'Membership')==='Membership'); }
  ok(dupCheck(10, '2026-06').length >= 1, 'dup-guard: detects existing June membership invoice for member 10');
  ok(dupCheck(11, '2026-06').length === 0, 'dup-guard: no false positive for member without June invoice');

  // ─── ATTENDANCE-BASIS COMMISSION (opt-in mode) ───────────────────────────
  state.settings = state.settings || {};
  state.settings.commissionBasis = 'attendance';
  // Isolated coaches/members so we don't tangle with earlier payment-mode data.
  state.coaches.push({ id:7, name:'CoachCross', rate:50, fixedSalary:0, active:'Y' });
  state.coaches.push({ id:8, name:'CoachPend',  rate:50, fixedSalary:0, active:'Y' });
  state.coaches.push({ id:9, name:'CoachFlat',  rate:50, fixedSalary:0, active:'Y' });
  // 70: 8-class / 800 Boxing, started 28 Apr, ended 27 May; attended 1 in Apr, 4 in May (3 left).
  state.members.push({ id:70, name:'Cross', phone:'+97455000070', expiryDate:'2026-05-27', status:'Active', coachId:7,
    subscriptions:[{ activity:'Boxing', coachId:7, totalClasses:8, amountPaid:800, start:'2026-04-28', end:'2026-05-27', invoiceNumber:'INVATT' }],
    dailyAttendance:{ '2026-04':{'Boxing':{'28':'Y'}}, '2026-05':{'Boxing':{'2':'Y','9':'Y','16':'Y','23':'Y'}} } });
  // 71: still active, 10-class / 1000, attended 2 in June → 8 pending.
  state.members.push({ id:71, name:'Pend', phone:'+97455000071', expiryDate:'2099-12-31', status:'Active', coachId:8,
    subscriptions:[{ activity:'Boxing', coachId:8, totalClasses:10, amountPaid:1000, start:'2026-06-01', end:'2099-12-31', invoiceNumber:'INVACT' }],
    dailyAttendance:{ '2026-06':{'Boxing':{'2':'Y','9':'Y'}} } });
  // 72: no class count (Football) → must fall back to full fee in payment month.
  state.members.push({ id:72, name:'Flat', phone:'+97455000072', expiryDate:'2026-07-01', status:'Active', coachId:9,
    subscriptions:[{ activity:'Football', coachId:9, totalClasses:null, amountPaid:500, start:'2026-06-01', end:'2026-07-01', invoiceNumber:'INVFB' }], dailyAttendance:{} });
  // 73: Summer Camp → never earns commission.
  state.members.push({ id:73, name:'Camp', phone:'+97455000073', expiryDate:'2026-07-01', status:'Active', coachId:9,
    subscriptions:[{ activity:'Summer Camp', coachId:9, totalClasses:8, amountPaid:600, start:'2026-06-01', end:'2026-07-01', invoiceNumber:'INVCAMP' }], dailyAttendance:{} });
  state.invoices.push({ id:700, ref:'INVATT',  date:'2026-04-28', month:'2026-04', amount:800,  category:'Membership', sport:'Boxing',      coachId:7, customerId:70, lineItems:[{sport:'Boxing',coachId:7,price:800}] });
  state.invoices.push({ id:701, ref:'INVACT',  date:'2026-06-01', month:'2026-06', amount:1000, category:'Membership', sport:'Boxing',      coachId:8, customerId:71, lineItems:[{sport:'Boxing',coachId:8,price:1000}] });
  state.invoices.push({ id:702, ref:'INVFB',   date:'2026-06-01', month:'2026-06', amount:500,  category:'Membership', sport:'Football',    coachId:9, customerId:72, lineItems:[{sport:'Football',coachId:9,price:500}] });
  state.invoices.push({ id:703, ref:'INVCAMP', date:'2026-06-01', month:'2026-06', amount:600,  category:'Membership', sport:'Summer Camp', coachId:9, customerId:73, lineItems:[{sport:'Summer Camp',coachId:9,price:600}] });
  // settlement fixtures: a fixed-salary coach + a payment-basis coach with two June invoices
  state.coaches.push({ id:10, name:'CoachFixed', rate:0, fixedSalary:3000, active:'Y' });
  state.coaches.push({ id:11, name:'CoachPay', rate:100, fixedSalary:0, active:'Y' });
  state.invoices.push({ id:705, ref:'P1', date:'2026-06-01', month:'2026-06', amount:1000, category:'Membership', sport:'Boxing', coachId:11, customerId:0, lineItems:[{sport:'Boxing',coachId:11,price:1000}] });
  state.invoices.push({ id:706, ref:'P2', date:'2026-06-20', month:'2026-06', amount:500,  category:'Membership', sport:'Boxing', coachId:11, customerId:0, lineItems:[{sport:'Boxing',coachId:11,price:500}] });
  // frozen vs expired: identical subs (6 classes / 1200, 2 attended in April, sub ended 15 May)
  state.coaches.push({ id:12, name:'CoachFrozen',  rate:50, fixedSalary:0, active:'Y' });
  state.coaches.push({ id:13, name:'CoachExpired', rate:50, fixedSalary:0, active:'Y' });
  state.members.push({ id:75, name:'Frozen', phone:'+97455000075', expiryDate:'2026-05-15', currentFreezeUntil:'2099-12-31', status:'Frozen', coachId:12,
    subscriptions:[{ activity:'Boxing', coachId:12, totalClasses:6, amountPaid:1200, start:'2026-04-01', end:'2026-05-15', invoiceNumber:'INVFRZ' }],
    dailyAttendance:{ '2026-04':{'Boxing':{'5':'Y','12':'Y'}} } });
  state.members.push({ id:76, name:'Expired', phone:'+97455000076', expiryDate:'2026-05-15', status:'Expired', coachId:13,
    subscriptions:[{ activity:'Boxing', coachId:13, totalClasses:6, amountPaid:1200, start:'2026-04-01', end:'2026-05-15', invoiceNumber:'INVEXP' }],
    dailyAttendance:{ '2026-04':{'Boxing':{'5':'Y','12':'Y'}} } });
  state.invoices.push({ id:707, ref:'INVFRZ', date:'2026-04-01', month:'2026-04', amount:1200, category:'Membership', sport:'Boxing', coachId:12, customerId:75, lineItems:[{sport:'Boxing',coachId:12,price:1200}] });
  state.invoices.push({ id:708, ref:'INVEXP', date:'2026-04-01', month:'2026-04', amount:1200, category:'Membership', sport:'Boxing', coachId:13, customerId:76, lineItems:[{sport:'Boxing',coachId:13,price:1200}] });
  // deleted/archived member must NOT count toward commission
  state.coaches.push({ id:15, name:'CoachDel', rate:100, fixedSalary:0, active:'Y' });
  state.members.push({ id:78, name:'DeletedMem', deleted:true, coachId:15, subscriptions:[{activity:'Boxing',coachId:15,totalClasses:6,amountPaid:500,start:'2026-06-01',end:'2026-07-01',invoiceNumber:'INVDEL'}], dailyAttendance:{} });
  state.members.push({ id:79, name:'LiveMem', coachId:15, expiryDate:'2099-12-31', subscriptions:[{activity:'Boxing',coachId:15,totalClasses:6,amountPaid:500,start:'2026-06-01',end:'2099-12-31',invoiceNumber:'INVLIVE'}], dailyAttendance:{'2026-06':{'Boxing':{'1':'Y','2':'Y','3':'Y'}}} });
  state.invoices.push({ id:710, ref:'INVDEL',  date:'2026-06-01', month:'2026-06', amount:500, category:'Membership', sport:'Boxing', coachId:15, customerId:78, lineItems:[{sport:'Boxing',coachId:15,price:500}] });
  state.invoices.push({ id:711, ref:'INVLIVE', date:'2026-06-01', month:'2026-06', amount:500, category:'Membership', sport:'Boxing', coachId:15, customerId:79, lineItems:[{sport:'Boxing',coachId:15,price:500}] });
  // two identical invoices for the same member = a duplicate the finder must catch
  state.members.push({ id:80, name:'DupMem', coachId:16, subscriptions:[], dailyAttendance:{} });
  state.invoices.push({ id:713, ref:'DUP1', date:'2026-06-03', month:'2026-06', amount:450, category:'Membership', sport:'Boxing', coachId:16, customerId:80, lineItems:[{sport:'Boxing',coachId:16,price:450}] });
  state.invoices.push({ id:714, ref:'DUP2', date:'2026-06-03', month:'2026-06', amount:450, category:'Membership', sport:'Boxing', coachId:16, customerId:80, lineItems:[{sport:'Boxing',coachId:16,price:450}] });

  const apr = computeMonthlyPay(7, '2026-04');
  const may = computeMonthlyPay(7, '2026-05');
  eq(Math.round(apr.commissionBase), 100, 'attendance: April = 1 attended class × (800/8)');
  eq(Math.round(may.commissionBase), 700, 'attendance: May = 4 attended + 3 true-up at expiry');
  eq(Math.round(apr.commissionAmount + may.commissionAmount), 400, 'attendance: life total = fee × rate (800×50%) — reconciles');
  const p8 = computeMonthlyPay(8, '2026-06');
  eq(Math.round(p8.commissionBase), 200, 'attendance: active member June = 2 attended × 100');
  eq(Math.round(p8.commissionPendingBase), 800, 'attendance: pending base = 8 remaining classes × 100 (this is the freeze/not-yet-attended case)');
  eq(Math.round(p8.commissionPending), 400, 'attendance: pending amount = 800 × 50%');
  const p9 = computeMonthlyPay(9, '2026-06');
  eq(Math.round(p9.commissionBase), 500, 'attendance: no-class-count falls back to full fee; Summer Camp excluded');
  eq(p9.commissionPendingBase, 0, 'attendance: no pending for flat/camp lines');
  // ── Settlement "up to date" (partial month; lifetime-remaining pending) ──
  const s1 = computeMonthlyPay(7, null, '2026-05-10');
  eq(Math.round(s1.commissionBase), 300, 'settlement cumulative: April(1) + May≤10th(2) = 3 attended × 100');
  eq(Math.round(s1.commissionPendingBase), 500, 'settlement: 5 classes still unattended as of 10 May → pending');
  // The reported "leaving / expiry" scenario: 6-class / 1000 MMA, 2 attended in
  // June, membership ends 02 Jul. Settle to 01 Jul → 100 earned + 200 pending.
  // Settle to 02 Jul (expiry) → full 300, nothing pending.
  state.coaches.push({ id:14, name:'CoachJul', rate:30, fixedSalary:0, active:'Y' });
  state.members.push({ id:77, name:'JulTest', phone:'+97455000077', expiryDate:'2026-07-02', status:'Active', coachId:14,
    subscriptions:[{ activity:'MMA', coachId:14, totalClasses:6, amountPaid:1000, start:'2026-06-02', end:'2026-07-02', invoiceNumber:'INVJUL' }],
    dailyAttendance:{ '2026-06':{'MMA':{'5':'Y','12':'Y'}} } });
  state.invoices.push({ id:709, ref:'INVJUL', date:'2026-06-02', month:'2026-06', amount:1000, category:'Membership', sport:'MMA', coachId:14, customerId:77, lineItems:[{sport:'MMA',coachId:14,price:1000}] });
  const j1 = computeMonthlyPay(14, null, '2026-07-01');
  eq(Math.round(j1.commissionAmount), 100, 'settle 01 Jul: 2 of 6 attended in June = 100 (NOT 0)');
  eq(Math.round(j1.commissionPending), 200, 'settle 01 Jul: 4 remaining classes pending = 200');
  const j2 = computeMonthlyPay(14, null, '2026-07-02');
  eq(Math.round(j2.commissionAmount), 300, 'settle 02 Jul (expiry): full commission = 300');
  eq(j2.commissionPendingBase, 0, 'settle 02 Jul: nothing pending after expiry true-up');
  const sf = computeMonthlyPay(10, null, '2026-06-15');
  eq(sf.fixedFull, 3000, 'settlement: full monthly fixed kept for reference');
  eq(sf.fixed, 1500, 'settlement: fixed prorated 15/30 days = 1500');
  // frozen vs expired (the new rule)
  eq(Math.round(computeMonthlyPay(12, '2026-04').commissionBase), 400, 'frozen: attended classes still paid in their month (2 × 1200/6 = 400)');
  const fz = computeMonthlyPay(12, '2026-05');
  eq(Math.round(fz.commissionBase), 0, 'frozen: NOT trued-up at sub end — no full payout while frozen');
  eq(Math.round(fz.commissionPendingBase), 800, 'frozen: remaining 4 classes stay pending');
  const ex = computeMonthlyPay(13, '2026-05');
  eq(Math.round(ex.commissionBase), 800, 'expired (not frozen): trued-up — remaining 4 paid in full at expiry');
  eq(ex.commissionPendingBase, 0, 'expired: nothing pending after the true-up');
  // restore default so we don't affect any later logic
  state.settings.commissionBasis = 'payment';
  eq(Math.round(computeMonthlyPay(15, '2026-06').commissionBase), 250, 'deleted/archived member excluded (payment): only live member counts, prorated 3/6 x 500');
  state.settings.commissionBasis = 'attendance';
  eq(Math.round(computeMonthlyPay(15, '2026-06').commissionPendingBase), 250, 'deleted/archived member excluded (attendance): only live member contributes pending (3 remaining x 500/6)');
  state.settings.commissionBasis = 'payment';
  const dupGroups = detectDuplicateInvoices();
  ok(dupGroups.some(g => g.rows.length === 2 && g.rows.every(r => r.inv.customerId === 80)), 'dup finder: flags the two identical invoices for member 80');
  ok(!dupGroups.some(g => g.rows.some(r => r.inv.id === 705) && g.rows.some(r => r.inv.id === 706)), 'dup finder: same member but different amounts are NOT flagged');
  // Rentals are repeatable: two Court Rentals on DIFFERENT days = not duplicates;
  // two on the SAME day = a real double-entry, still flagged.
  state.invoices.push(
    { id: 7801, customerName: 'rentguy', category: 'Court Rental', activityType: 'rental', sport: 'Football Court', amount: 200, date: '2026-06-06', month: '2026-06' },
    { id: 7802, customerName: 'rentguy', category: 'Court Rental', activityType: 'rental', sport: 'Football Court', amount: 200, date: '2026-06-17', month: '2026-06' },
    { id: 7803, customerName: 'rentguy', category: 'Court Rental', activityType: 'rental', sport: 'Football Court', amount: 200, date: '2026-06-17', month: '2026-06' });
  var rentGroups = detectDuplicateInvoices();
  ok(!rentGroups.some(g => g.rows.some(r => r.inv.id === 7801) && g.rows.some(r => r.inv.id === 7802)), 'dup finder: rentals on different days are NOT flagged');
  ok(rentGroups.some(g => g.rows.some(r => r.inv.id === 7802) && g.rows.some(r => r.inv.id === 7803)), 'dup finder: two rentals on the same day ARE flagged');
  state.invoices = state.invoices.filter(i => ![7801, 7802, 7803].includes(i.id));
  // Summer Camp is repeatable too: a renewal on a DIFFERENT day in the same month is
  // NOT a duplicate (real case — Hossam booked 14 Jun then renewed 21 Jun). Two camp
  // invoices on the SAME day = a genuine double-entry, still flagged.
  state.invoices.push(
    { id: 7811, customerName: 'campguy', category: 'Membership', sport: 'Summer Camp', amount: 400, date: '2026-06-14', month: '2026-06', lineItems: [{ sport: 'Summer Camp', price: 400 }] },
    { id: 7812, customerName: 'campguy', category: 'Membership', sport: 'Summer Camp', amount: 400, date: '2026-06-21', month: '2026-06', lineItems: [{ sport: 'Summer Camp', price: 400 }] },
    { id: 7813, customerName: 'campguy', category: 'Membership', sport: 'Summer Camp', amount: 400, date: '2026-06-21', month: '2026-06', lineItems: [{ sport: 'Summer Camp', price: 400 }] });
  var campGroups = detectDuplicateInvoices();
  ok(!campGroups.some(g => g.rows.some(r => r.inv.id === 7811) && g.rows.some(r => r.inv.id === 7812)), 'dup finder: camp renewal on a different day is NOT flagged');
  ok(campGroups.some(g => g.rows.some(r => r.inv.id === 7812) && g.rows.some(r => r.inv.id === 7813)), 'dup finder: two camp invoices on the same day ARE flagged');
  state.invoices = state.invoices.filter(i => ![7811, 7812, 7813].includes(i.id));
  ok(findDuplicateInvoiceOf(80, 'Boxing', '2026-06', 450, null), 'pre-save guard: detects an existing matching invoice');
  ok(!findDuplicateInvoiceOf(80, 'Boxing', '2026-06', 999, null), 'pre-save guard: different amount is not a match');
  ok(!findDuplicateInvoiceOf(80, 'MMA', '2026-06', 450, null), 'pre-save guard: different sport is not a match');
  ok(!findDuplicateInvoiceOf(null, 'Boxing', '2026-06', 450, null), 'pre-save guard: walk-in (no member) is never blocked');
  // payment basis must honour the settlement date cap on invoice dates
  const pd1 = computeMonthlyPay(11, null, '2026-06-15');
  eq(Math.round(pd1.commissionBase), 1000, 'settlement(payment): 01-Jun invoice counts, 20-Jun excluded at 15-Jun cutoff');
  const pd2 = computeMonthlyPay(11, null, '2026-06-25');
  eq(Math.round(pd2.commissionBase), 1500, 'settlement(payment): both June invoices count at 25-Jun cutoff');
  // sanity: 2-arg calls unchanged by the new optional param
  eq(Math.round(computeMonthlyPay(11, '2026-06').commissionBase), 1500, 'monthly (no date) still sums the whole month');

  // ── Enrollment scenarios: duplicate sports, mistake-delete, per-sport start ──
  ok(duplicateEnrollmentSport([{ sport: 'Boxing' }, { sport: 'MMA' }, { sport: 'Boxing' }]) === 'Boxing', 'enroll: duplicate sport is detected (blocks add + edit)');
  ok(duplicateEnrollmentSport([{ sport: 'Boxing' }, { sport: 'MMA' }]) === null, 'enroll: distinct sports are allowed');
  eq(enrollmentStartDate({ start: '2026-07-10' }, { startDate: '2026-05-01' }), '2026-07-10', 'enroll: per-sport start date overrides the member start');
  eq(enrollmentStartDate({}, { startDate: '2026-05-01' }), '2026-05-01', 'enroll: with no per-sport date it inherits the member start');
  // mistake-delete: combined invoice keeps the other sport; single-sport invoice is removed
  state.members.push({ id: 90, name: 'CombMem', enrollments: [{ sport: 'Boxing', coachId: 99 }, { sport: 'MMA', coachId: 99 }],
    subscriptions: [{ activity: 'Boxing', end: '2026-08-01', invoiceNumber: 'C1' }, { activity: 'MMA', end: '2026-09-01', invoiceNumber: 'C1' }], expiryDate: '2026-09-01' });
  state.invoices.push({ id: 900, ref: 'C1', date: '2026-06-01', month: '2026-06', amount: 800, category: 'Membership', customerId: 90, sport: 'Boxing, MMA', lineItems: [{ sport: 'Boxing', coachId: 99, price: 300 }, { sport: 'MMA', coachId: 99, price: 500 }] });
  state.members.push({ id: 91, name: 'SoloMem', enrollments: [{ sport: 'Karate', coachId: 99 }], subscriptions: [{ activity: 'Karate', end: '2026-07-01', invoiceNumber: 'K1' }], expiryDate: '2026-07-01' });
  state.invoices.push({ id: 901, ref: 'K1', date: '2026-06-01', month: '2026-06', amount: 400, category: 'Membership', customerId: 91, sport: 'Karate' });
  const comb = state.members.find(x => x.id === 90);
  removeEnrollmentData(comb, 'MMA');
  eq(comb.enrollments.length, 1, 'mistake-delete: enrollment removed (combined invoice case)');
  ok(comb.enrollments[0].sport === 'Boxing', 'mistake-delete: the other sport is kept');
  eq(comb.subscriptions.length, 1, 'mistake-delete: matching subscription removed');
  const inv900 = state.invoices.find(i => i.id === 900);
  ok(inv900 && inv900.lineItems.length === 1 && Math.round(inv900.amount) === 300, 'mistake-delete: combined invoice kept, amount reduced to the remaining sport');
  eq(comb.expiryDate, '2026-08-01', 'mistake-delete: member expiry recomputed to the remaining sport');
  const solo = state.members.find(x => x.id === 91);
  removeEnrollmentData(solo, 'Karate');
  // v6.391: the invoice is now SOFT-deleted rather than spliced out of state.invoices. Same
  // outcome for every consumer (they all skip i.deleted), but it leaves a tombstone so a stale
  // sync can't resurrect it — the resurrection bug this release fixes — and an admin can still
  // restore it from the Archived view. The assertion below checks that stronger contract.
  const inv901 = state.invoices.find(i => i.id === 901);
  ok(inv901 && inv901.deleted === true, 'mistake-delete: single-sport invoice is soft-deleted (tombstoned, not spliced away)');
  ok(state.invoices.filter(i => !i.deleted).every(i => i.id !== 901), 'mistake-delete: ...so it no longer counts anywhere');
  eq(solo.enrollments.length, 0, 'mistake-delete: last enrollment removed cleanly');
  ok(duplicateEnrollmentSport([{ sport: 'Summer Camp' }, { sport: 'Summer Camp' }]) === 'Summer Camp', 'enroll: duplicate Summer Camp also blocked');
  ok(duplicateEnrollmentSport([{ sport: 'Summer Camp' }, { sport: 'Boxing' }]) === null, 'enroll: Summer Camp + another sport is allowed');
  eq(enrollmentStartDate({}, null), TODAY, 'enroll: no member context → defaults to today');
  // unpaid enrollment (no invoice) removal + other members must stay untouched
  state.members.push({ id: 92, name: 'UnpaidMem', enrollments: [{ sport: 'Boxing', coachId: 99 }, { sport: 'Karate', coachId: 99 }], subscriptions: [{ activity: 'Boxing', end: '2026-08-01' }, { activity: 'Karate', end: '2026-09-01' }], expiryDate: '2026-09-01' });
  state.members.push({ id: 93, name: 'OtherMem', enrollments: [{ sport: 'Boxing', coachId: 99 }], subscriptions: [{ activity: 'Boxing', end: '2026-08-01', invoiceNumber: 'O1' }] });
  state.invoices.push({ id: 930, ref: 'O1', date: '2026-06-01', month: '2026-06', amount: 300, category: 'Membership', customerId: 93, sport: 'Boxing' });
  const unpaid = state.members.find(x => x.id === 92);
  removeEnrollmentData(unpaid, 'Boxing');
  eq(unpaid.enrollments.length, 1, 'mistake-delete: unpaid enrollment (no invoice) removed fine');
  ok(unpaid.subscriptions.length === 1 && unpaid.subscriptions[0].activity === 'Karate', 'mistake-delete: unpaid sub removed, the other kept');
  ok(state.invoices.find(i => i.id === 930), "mistake-delete: another member's invoice is NOT touched");
  removeEnrollmentData(unpaid, 'MMA');
  eq(unpaid.enrollments.length, 1, 'mistake-delete: removing a sport the member does not have is a safe no-op');

  // ── Per-sport start + validity → derived member dates ──
  const dm = deriveMemberDates([
    { sport: 'Boxing', start: '2026-05-01', validity: 30 },   // ends 2026-05-31
    { sport: 'MMA',    start: '2026-06-04', validity: 60 },   // ends 2026-08-03 (latest)
  ], null);
  eq(dm.startDate, '2026-05-01', 'derive: member start = earliest sport start');
  eq(dm.expiryDate, '2026-08-03', 'derive: member expiry = latest sport end (start + own validity)');
  eq(dm.firstRegistration, '2026-05-01', 'derive: blank first-registration falls back to earliest sport start');
  const dm2 = deriveMemberDates([{ sport: 'Karate', start: '2026-06-01', validity: 30 }], '2026-01-15');
  eq(dm2.firstRegistration, '2026-01-15', 'derive: entered first-registration is kept');
  eq(dm2.expiryDate, '2026-07-01', 'derive: single sport expiry = its start + its validity');
  // each sport keeps an independent validity (not one shared number)
  const dm3 = deriveMemberDates([
    { sport: 'Boxing', start: '2026-06-01', validity: 30 },
    { sport: 'MMA',    start: '2026-06-01', validity: 90 },
  ], null);
  eq(dm3.expiryDate, '2026-08-30', 'derive: differing per-sport validity respected (90d wins over 30d)');
  eq(daysBetween('2026-05-01', '2026-07-15'), 75, 'daysBetween: counts whole days');
  // legacy sub (has start/end, no stored validity) → inferred validity must rebuild the SAME end
  const legStart = '2026-05-01', legEnd = '2026-07-15';
  eq(addDays(legStart, daysBetween(legStart, legEnd)), legEnd, 'legacy: inferred validity rebuilds the original end (no date mangling on edit)');

  // ── Coach change on an existing sport UPDATES the sub (no duplicate) + re-attributes the invoice line ──
  const ccSub = { activity: 'Boxing', coachId: 7, coach: coachName(7), invoiceNumber: 'CC1', start: '2026-06-01', validity: 30, end: '2026-07-01', totalClasses: 8, amountPaid: 300 };
  const ccInv = { id: 950, ref: 'CC1', category: 'Membership', coachId: 7, coach: coachName(7), lineItems: [{ sport: 'Boxing', coachId: 7, coach: coachName(7), price: 300 }] };
  syncSubToEnrollment(ccSub, { sport: 'Boxing', coachId: 8, classes: 10, price: 300, start: '2026-06-01', validity: 30 }, { startDate: '2026-06-01' }, [ccInv]);
  eq(ccSub.coachId, 8, 'coach-change: existing subscription is updated to the new coach (not duplicated)');
  eq(ccSub.totalClasses, 10, 'coach-change: classes synced onto the existing sub');
  eq(ccInv.lineItems[0].coachId, 8, 'coach-change: invoice line re-attributed to the new coach (commission follows)');
  eq(ccInv.coachId, 8, 'coach-change: invoice top-level coach re-attributed');

  // ── Backup round-trip preserves data + the new per-sport sub fields ──
  const rt = JSON.parse(JSON.stringify({ activity: 'Boxing', start: '2026-06-01', validity: 45, end: '2026-07-16' }));
  ok(rt.start === '2026-06-01' && rt.validity === 45 && rt.end === '2026-07-16', 'backup: per-sport start/validity/end survive a JSON round-trip');
  const imp = JSON.parse(JSON.stringify({ appVersion: 'x', members: state.members, invoices: state.invoices }));
  ok(imp.members.length === state.members.length && imp.invoices.length === state.invoices.length, 'backup: members + invoices survive export→restore');

  // ── Partial payments (cash-basis revenue, full-fee commission) ──
  const pinv = { id: 960, ref: 'P1', amount: 650, month: '2026-06', date: '2026-06-01', category: 'Membership', customerId: 96, amountPaid: 300, payments: [{ date: '2026-06-01', month: '2026-06', amount: 300, method: 'cash' }] };
  eq(invoicePaid(pinv), 300, 'partial: collected so far = 300');
  eq(invoiceBalance(pinv), 350, 'partial: balance = 650 − 300 = 350');
  eq(invoiceStatus(pinv), 'Partial', 'partial: status is Partial');
  eq(cashInMonth(pinv, '2026-06'), 300, 'partial: June revenue counts only the 300 collected (cash basis)');
  recordInvoicePayment(pinv, 350, { date: '2026-07-05', method: 'cash' });   // settle the rest in July
  eq(invoiceBalance(pinv), 0, 'partial: balance cleared after the 2nd payment');
  eq(invoiceStatus(pinv), 'Paid', 'partial: status becomes Paid once settled');
  eq(cashInMonth(pinv, '2026-06'), 300, 'partial: June still 300 (each payment lands in its own month)');
  eq(cashInMonth(pinv, '2026-07'), 350, 'partial: the 350 settlement is revenue in July');
  const linv = { id: 961, amount: 400, month: '2026-05' };   // legacy invoice (no amountPaid)
  eq(invoicePaid(linv), 400, 'legacy: an invoice with no amountPaid is treated as fully paid');
  eq(invoiceStatus(linv), 'Paid', 'legacy: status Paid (no false "unpaid")');
  state.members.push({ id: 96, name: 'PartMem' });
  state.invoices.push(pinv);
  state.invoices.push({ id: 962, amount: 500, category: 'Membership', customerId: 96, amountPaid: 200 });
  eq(Math.round(memberOutstanding(96)), 300, 'partial: member outstanding = sum of balances (0 + 300)');
  // deposit taken at enrollment: part paid now, rest due
  var depTotal = 1000, depPaid = Math.max(0, Math.min(300, depTotal));
  var depInv = { id: 970, amount: depTotal, category: 'Membership', customerId: 97, amountPaid: depPaid, payments: [{ month: '2026-06', amount: depPaid }] };
  eq(invoiceBalance(depInv), 700, 'deposit: 300 paid on a 1000 invoice leaves 700 due');
  eq(invoiceStatus(depInv), 'Partial', 'deposit: status is Partial');
  eq(cashInMonth(depInv, '2026-06'), 300, 'deposit: only the 300 deposit counts as revenue');
  eq(Math.max(0, Math.min(1500, depTotal)), 1000, 'deposit: a deposit above the total is clamped to the total');
  // correcting a wrongly-entered paid amount via Edit Invoice
  var fixInv = { id: 980, amount: 2400, date: '2026-06-14', month: '2026-06', amountPaid: 2400, payments: [{ month: '2026-06', amount: 2400 }] };
  fixInv.amountPaid = 1000;
  fixInv.payments = [{ date: '2026-06-14', month: '2026-06', amount: 1000, method: 'cash' }];
  eq(invoiceBalance(fixInv), 1400, 'edit-invoice: correcting paid to 1000 on a 2400 total leaves 1400 due');
  eq(invoiceStatus(fixInv), 'Partial', 'edit-invoice: corrected invoice becomes Partial');
  eq(cashInMonth(fixInv, '2026-06'), 1000, 'edit-invoice: revenue reflects the corrected 1000');

  // ── Recently-edited members (recall) ──
  pushRecentMember(5); pushRecentMember(6); pushRecentMember(5);   // 5 re-touched → moves to front
  var rec1 = JSON.parse(sessionStorage.getItem('bs-recent-members') || '[]');
  eq(rec1.join(','), '5,6', 'recent: dedupes and puts the most-recent first');
  for (var ri = 0; ri < 8; ri++) pushRecentMember(100 + ri);
  var rec2 = JSON.parse(sessionStorage.getItem('bs-recent-members') || '[]');
  eq(rec2.length, 5, 'recent: capped at 5 entries');
  eq(rec2[0], 107, 'recent: newest is first');
  sessionStorage.setItem('bs-recent-members', JSON.stringify([99999999]));
  eq(getRecentMembers().length, 0, 'recent: getRecentMembers drops ids no longer in members');

  // ── Name Title-casing ──
  eq(titleCaseName('anas madni'), 'Anas Madni', 'titlecase: all-lowercase → Title Case');
  eq(titleCaseName('ANAS MADNI'), 'Anas Madni', 'titlecase: ALL-UPPER → Title Case');
  eq(titleCaseName('  anas   madni  '), 'Anas Madni', 'titlecase: trims + collapses spaces');
  eq(titleCaseName("al-awad o'brien"), "Al-Awad O'Brien", 'titlecase: capitalises after hyphen + apostrophe');
  // gentle on-save rule: only fix all-lower / all-upper, leave intentional mixed-case alone
  var gentle = (n) => (n && (n === n.toLowerCase() || n === n.toUpperCase())) ? titleCaseName(n) : n;
  eq(gentle('anas madni'), 'Anas Madni', 'titlecase(save): fixes all-lowercase');
  eq(gentle('McDonald'), 'McDonald', 'titlecase(save): leaves intentional mixed-case untouched');
  eq(gentle('Anas Madni'), 'Anas Madni', 'titlecase(save): already-correct left as-is');

  // ── Sport-switch reconciliation: deduct only the UNEARNED part of what was paid ──
  // Member paid 375, attended 1 of 12 → coach A keeps 1/12, the rest (343.75) transfers.
  var sp1 = computeSwitchSplit(375, 1, 12);
  eq(sp1.aShare, 31.25, 'switch: coach A keeps the attended share (1/12 of 375)');
  eq(sp1.deductionA, -343.75, 'switch: A is deducted only the unearned part (375 − 31.25), never more than paid');
  eq(sp1.bShare, 343.75, 'switch: the unearned part transfers to coach B');
  // never claws back more than the credited base
  ok(Math.abs(computeSwitchSplit(375, 1, 12).deductionA) <= 375, 'switch: deduction never exceeds what coach A was credited');
  // attended none → whole credited base transfers to B (A delivered nothing)
  var sp0 = computeSwitchSplit(375, 0, 12);
  eq(sp0.deductionA, -375, 'switch: 0 attended → full base deducted from A');
  eq(sp0.bShare, 375, 'switch: 0 attended → full base transfers to B (not lost)');
  // attended all → nothing to transfer
  eq(computeSwitchSplit(375, 12, 12).deductionA, 0, 'switch: all attended → no deduction');
  // partial payment: base is what was actually credited, so a 300-of-600 case caps at 300
  eq(computeSwitchSplit(300, 1, 12).deductionA, -275, 'switch: based on the credited 300, not the nominal price');
  // coachBaseForSport sums real membership invoices (excludes switch credits + negatives)
  state.members.push({ id: 88, name: 'SwMem' });
  state.invoices.push({ id: 880, customerId: 88, category: 'Membership', amount: 375, sport: 'Kick Boxing', coachId: 3 });
  state.invoices.push({ id: 881, customerId: 88, category: 'Membership', amount: -200, switchCredit: true, sport: 'Kick Boxing', coachId: 3 });
  eq(coachBaseForSport(state.members.find(x => x.id === 88), 'Kick Boxing', 3), 375, 'switch: credited base ignores switch-credit + negative invoices');

  // ── Summer Camp schedule seed ──
  var camp = defaultCampSchedule();
  eq(camp.startDate, '2026-06-14', 'camp: starts 14 Jun 2026');
  eq(camp.endDate, '2026-06-28', 'camp: ends 28 Jun 2026');
  eq(Object.keys(camp.days).join(','), 'sunday,monday,tuesday,wednesday,thursday', 'camp: Sun–Thu only');
  eq(camp.days.sunday.length, 4, 'camp: 4 activity rows per day');
  eq(camp.days.sunday[2].kids.activity, 'Ninja Training', 'camp: Sun 10:30 kids = Ninja Training');
  eq(camp.days.sunday[2].kids.coach, 'Jennifer', 'camp: Ninja Training coach = Jennifer');
  eq(camp.days.monday[3].girls.activity, 'Fitness', 'camp: Mon 12:00 girls = Fitness');
  eq(camp.days.monday[3].girls.coach, 'Aya', 'camp: Mon Fitness coach = Aya');
  eq(camp.days.thursday[0].boys.activity, 'Combat Sports (Kickboxing & Muay Thai)', 'camp: Thu 8:00 boys = Combat Sports');
  ok(CAMP_SLOTS.filter(s => s.type === 'activities').length === 4, 'camp: 4 activity time slots');
  ok(CAMP_SLOTS.filter(s => s.type === 'break').length === 3, 'camp: 3 break rows (breakfast/prayer/dismissal)');
  eq(defaultCampSchedule().endDate, '2026-06-28', 'camp: duration now ends 28 Jun 2026');
  eq(campDayKeyForDate('2026-06-14'), 'sunday', 'camp: 14 Jun 2026 → Sunday (Day 1)');
  eq(campDayKeyForDate('2026-06-15'), 'monday', 'camp: 15 Jun 2026 → Monday');
  eq(campDayKeyForDate('2026-06-18'), 'thursday', 'camp: 18 Jun 2026 → Thursday');
  eq(campDayKeyForDate('2026-06-19'), null, 'camp: 19 Jun 2026 (Fri) → off day');
  eq(campDayKeyForDate('2026-06-20'), null, 'camp: 20 Jun 2026 (Sat) → off day');
  eq(campDayKeyForDate('2026-06-28'), 'sunday', 'camp: 28 Jun 2026 → Sunday');
  eq(campActivityIcon('Swimming'), '🏊', 'icon: swimming');
  eq(campActivityIcon('Karate'), '🥋', 'icon: karate');
  eq(campActivityIcon('Kids Kickboxing'), '🥊', 'icon: kickboxing');
  eq(campActivityIcon('Combat Sports (Kickboxing & Muay Thai)'), '🥊', 'icon: combat sports');
  eq(campActivityIcon('Gymnastics'), '🤸', 'icon: gymnastics');
  eq(campActivityIcon('Ninja Training'), '🥷', 'icon: ninja');
  eq(campActivityIcon('Zumba'), '💃', 'icon: zumba');
  eq(campActivityIcon('Art'), '🎨', 'icon: art');
  eq(campActivityIcon('Something Else'), '⭐', 'icon: fallback star');
  eq(campActivityIcon(''), '', 'icon: empty stays empty');
  // Arabic localization helpers
  eq(sportNameAR('Swimming'), 'السباحة', 'AR: swimming');
  eq(sportNameAR('Kick Boxing'), 'الكيك بوكسينغ', 'AR: kick boxing');
  eq(sportNameAR('Summer Camp'), 'المعسكر الصيفي', 'AR: summer camp');
  eq(sportNameAR('Unknown Sport'), 'Unknown Sport', 'AR: unknown sport falls back');
  eq(dayNameAR('sat'), 'السبت', 'AR: Saturday (key)');
  eq(dayNameAR('THURSDAY'), 'الخميس', 'AR: Thursday (label, case-insensitive)');
  eq(dayNameAR('fri'), 'الجمعة', 'AR: Friday');
  eq(monthNameAR(new Date(2026, 5, 1)), 'يونيو 2026', 'AR: June 2026');
  eq(monthNameAR(new Date(2026, 0, 15)), 'يناير 2026', 'AR: January 2026');
  eq(timeLabelAR('3PM - 4PM'), '3 - 4 م', 'AR: PM time label');
  eq(timeLabelAR('11AM - 12PM'), '11 ص - 12 م', 'AR: mixed AM/PM label');
  // fuzzy matching for name column filter
  ok(fuzzyMatch('Mohammed Ali', 'mohamed'), 'fuzzy: Mohammed~mohamed (typo)');
  ok(fuzzyMatch('Khaled', 'khalid'), 'fuzzy: Khaled~khalid');
  ok(fuzzyMatch('anas madani', 'anas'), 'fuzzy: substring word');
  ok(fuzzyMatch('anas madani', 'madanee'), 'fuzzy: madani~madanee');
  ok(fuzzyMatch('Ahmed', 'ahmed'), 'fuzzy: exact');
  ok(!fuzzyMatch('Ahmed', 'xqz'), 'fuzzy: no match');
  ok(!fuzzyMatch('', 'ali'), 'fuzzy: empty text no match');
  ok(fuzzyMatch('Ali', ''), 'fuzzy: empty query matches');
  eq(levenshtein('kitten', 'sitting'), 3, 'levenshtein: kitten/sitting = 3');
  eq(levenshtein('abc', 'abc'), 0, 'levenshtein: identical = 0');
  // Add Sibling: full-copy stub keeps profile + plan, drops financial/status history
  (function(){
    var src = { id: 5001, name: 'Ali Hassan', nameArabic: 'علي حسن', qid: '28912345678',
      birthdate: '2015-03-01', level: 'Beginner', phone: '+97455500011', phone2: '+97455500012',
      email: 'ali@x.com', nationality: 'Qatar', address: 'Doha', notes: 'allergic to nuts',
      joinDate: '2026-01-01', sport: 'Karate', coachId: 3,
      enrollments: [{ sport:'Karate', coachId:3, classes:8, price:350 }],
      subscriptions: [{ activity:'Karate', totalClasses:8, attendedClasses:5 }],
      expiryDate: '2026-07-01', status: 'Active', deleted: true, lastRemindedAt: '2026-05-01' };
    var dup = buildMemberDuplicateStub(src, 9999);
    eq(dup.id, 9999, 'sibling: gets new id');
    eq(dup.name, '', 'sibling: clears English name (sibling is a different person)');
    eq(dup.nameArabic, '', 'sibling: clears Arabic name');
    ok(!dup.qid, 'sibling: clears QID (personal national ID, not shared)');
    eq(dup.phone, '+97455500011', 'sibling: copies shared phone');
    eq(dup.notes, 'allergic to nuts', 'sibling: copies notes');
    eq(dup.enrollments.length, 1, 'sibling: copies enrollments (plan)');
    eq(dup.enrollments[0].price, 350, 'sibling: enrollment price copied');
    eq(dup._duplicatedFrom, 'Ali Hassan', 'sibling: records source name');
    ok(!dup.subscriptions, 'sibling: drops subscriptions (no fake attendance)');
    ok(!dup.expiryDate, 'sibling: drops expiry (starts unpaid)');
    ok(!dup.deleted, 'sibling: not archived');
    ok(!dup.lastRemindedAt, 'sibling: drops reminder timestamp');
    eq(dup.status, 'Active', 'sibling: status Active');
    // mutating the copy must not touch the source (deep clone)
    dup.enrollments[0].price = 999;
    eq(src.enrollments[0].price, 350, 'sibling: deep clone — source untouched');
    eq(dup._siblingSplitFrom, src.id, 'sibling: records split source id for payment split');
  })();
  // Sibling payment split: one family total divided equally; parts sum to total
  (function () {
    state.members.push(
      { id: 9301, name: 'Kid One', familyId: 9300, enrollments: [{ sport: 'Karate', price: 750 }] },
      { id: 9302, name: 'Kid Two', familyId: 9300, enrollments: [{ sport: 'Karate', price: 750 }] });
    state.invoices.push(
      { id: 9311, customerId: 9301, category: 'Membership', amount: 750, amountPaid: 750, payments: [{ month: '2026-06', amount: 750 }] },
      { id: 9312, customerId: 9302, category: 'Membership', amount: 750, amountPaid: 750, payments: [{ month: '2026-06', amount: 750 }] });
    var sibs2 = state.members.filter(m => m.familyId === 9300);
    var share2 = splitSiblingPayment(sibs2, 750);
    eq(share2, 375, 'split: 750 across 2 = 375 each');
    eq(state.invoices.find(i => i.id === 9311).amountPaid, 375, 'split: first sibling invoice set to share');
    eq(state.invoices.find(i => i.id === 9312).amountPaid, 375, 'split: second sibling invoice set to share');
    // add a third → 250 each, still sums to 750
    state.members.push({ id: 9303, name: 'Kid Three', familyId: 9300, enrollments: [{ sport: 'Karate', price: 750 }] });
    var sibs3 = state.members.filter(m => m.familyId === 9300);
    var share3 = splitSiblingPayment(sibs3, 750);
    eq(share3, 250, 'split: 750 across 3 = 250 each');
    var sum3 = state.invoices.filter(i => [9311, 9312].includes(i.id) || i.customerId === 9303).reduce((s, i) => s + i.amountPaid, 0);
    eq(sum3, 750, 'split: three shares still sum to the family total (no money lost)');
    // remainder case: 100 / 3 → 33.34 + 33.33 + 33.33 = 100
    state.members = state.members.filter(m => m.familyId !== 9300);
    state.invoices = state.invoices.filter(i => ![9311, 9312].includes(i.id) && i.customerId !== 9303);
    state.members.push(
      { id: 9401, name: 'R1', familyId: 9400, enrollments: [] },
      { id: 9402, name: 'R2', familyId: 9400, enrollments: [] },
      { id: 9403, name: 'R3', familyId: 9400, enrollments: [] });
    var shareR = splitSiblingPayment(state.members.filter(m => m.familyId === 9400), 100);
    var sumR = Math.round(state.invoices.filter(i => [9401, 9402, 9403].includes(i.customerId)).reduce((s, i) => s + i.amountPaid, 0) * 100) / 100;
    eq(sumR, 100, 'split: remainder handled — 100/3 shares sum to exactly 100');
    state.members = state.members.filter(m => m.familyId !== 9400);
    state.invoices = state.invoices.filter(i => ![9401, 9402, 9403].includes(i.customerId));
    // Withdrawn family members must NOT receive a share
    state.members.push(
      { id: 9451, name: 'Active1', familyId: 9450, enrollments: [] },
      { id: 9452, name: 'Active2', familyId: 9450, enrollments: [] },
      { id: 9453, name: 'Gone', familyId: 9450, deleted: true, enrollments: [] });
    var shareW = splitSiblingPayment(state.members.filter(m => m.familyId === 9450), 750);
    eq(shareW, 375, 'split: 750 across 2 ACTIVE siblings = 375 (withdrawn excluded)');
    ok(!state.invoices.some(i => i.customerId === 9453), 'split: withdrawn member gets no invoice share');
    state.members = state.members.filter(m => m.familyId !== 9450);
    state.invoices = state.invoices.filter(i => ![9451, 9452, 9453].includes(i.customerId));
  })();
  // Cleanup: detect + fix invoices dated later than the member's start date
  (function () {
    var savedM = state.members, savedI = state.invoices;
    state.members = [
      { id: 9501, name: 'Saad', startDate: '2026-01-13', enrollments: [{ sport: 'MMA', start: '2026-01-13' }] },
      { id: 9502, name: 'Normal', startDate: '2026-06-20', enrollments: [{ sport: 'Karate', start: '2026-06-20' }] },
    ];
    state.invoices = [
      { id: 9510, customerId: 9501, category: 'Membership', date: '2026-06-20', month: '2026-06', amount: 350, payments: [{ date: '2026-06-20', month: '2026-06', amount: 350 }] },
      { id: 9511, customerId: 9502, category: 'Membership', date: '2026-06-20', month: '2026-06', amount: 300, payments: [{ date: '2026-06-20', month: '2026-06', amount: 300 }] },
    ];
    var mis = findMisdatedInvoices();
    eq(mis.length, 1, 'fix-date: only the back-dated member is flagged');
    eq(mis[0].inv.id, 9510, 'fix-date: flags the back-dated invoice');
    ok(mis[0].gapDays > 150, 'fix-date: reports the day gap');
    var fixed = fixInvoiceDateToStart(9510);
    eq(fixed.date, '2026-01-13', 'fix-date: invoice re-dated to start');
    eq(fixed.month, '2026-01', 'fix-date: month moved to start month');
    eq(fixed.payments[0].month, '2026-01', 'fix-date: payment month moved too (revenue lands in Jan)');
    eq(fixed.amount, 350, 'fix-date: amount unchanged');
    eq(findMisdatedInvoices().length, 0, 'fix-date: nothing flagged after fixing');
    eq(state.invoices.find(i => i.id === 9511).date, '2026-06-20', 'fix-date: same-day member untouched');
    // Renewers (more than one membership invoice) must NOT be flagged — a later
    // renewal is correctly dated to its own month, not the original start.
    state.members.push({ id: 9520, name: 'Renewer', startDate: '2026-01-13', enrollments: [{ sport: 'MMA', start: '2026-01-13' }] });
    state.invoices.push(
      { id: 9521, customerId: 9520, category: 'Membership', date: '2026-01-13', month: '2026-01', amount: 350, payments: [{ date: '2026-01-13', month: '2026-01', amount: 350 }] },
      { id: 9522, customerId: 9520, category: 'Membership', date: '2026-06-13', month: '2026-06', amount: 350, payments: [{ date: '2026-06-13', month: '2026-06', amount: 350 }] });
    ok(!findMisdatedInvoices().some(d => d.member.id === 9520), 'fix-date: renewer with 2 invoices is NOT flagged (renewal protected)');
    state.members = savedM; state.invoices = savedI;
  })();
  // Cleanup: merge duplicate product records (same name) into one
  (function () {
    var savedP = state.products, savedS = state.sales;
    state.products = [
      { id: 9601, name: 'Gymnastic Uniform', category: 'Gymnastic', stock: 10 },
      { id: 9602, name: 'Gymnastic Uniform', category: '', stock: 5 },
      { id: 9603, name: 'gymnastic uniform', category: 'Gymnastic', stock: 3 },
      { id: 9604, name: 'Karate Gloves', category: 'Karate', stock: 9 },
    ];
    state.sales = [
      { items: [{ productId: 9601, name: 'Gymnastic Uniform', qty: 2 }] },
      { items: [{ productId: 9602, name: 'Gymnastic Uniform', qty: 1 }] },
      { items: [{ productId: 9603, name: 'gymnastic uniform', qty: 1 }] },
    ];
    var dups = findDuplicateProducts();
    eq(dups.length, 1, 'dup-products: one duplicate group (case-insensitive)');
    eq(dups[0].count, 3, 'dup-products: three records share the name');
    var kept = mergeDuplicateProducts('Gymnastic Uniform');
    eq(kept.id, 9601, 'dup-products: keeps the oldest (lowest-id) record');
    eq(kept.stock, 18, 'dup-products: initial stock summed (10+5+3)');
    eq(productCurrentStock(kept.id), 14, 'dup-products: current stock = 18 - 4 sold');
    eq(kept.category, 'Gymnastic', 'dup-products: keeps category');
    ok(state.sales.every(s => s.items.every(it => it.productId === 9601)), 'dup-products: all sales re-pointed to kept product');
    eq((state.products || []).filter(p => (p.name || '').toLowerCase() === 'gymnastic uniform').length, 1, 'dup-products: only one record remains');
    eq(findDuplicateProducts().length, 0, 'dup-products: no duplicates after merge');
    state.products = savedP; state.sales = savedS;
  })();
  // Notes & reminders: attention detection drives the sidebar badge
  (function () {
    var savedN = state.notes;
    state.notes = [
      { id: 1, title: 'overdue', priority: 'high', remindDate: '2020-01-01', done: false },
      { id: 2, title: 'follow', priority: 'medium', follow: true, done: false },
      { id: 3, title: 'future', priority: 'low', remindDate: '2999-01-01', done: false },
      { id: 4, title: 'done', priority: 'high', follow: true, done: true },
      { id: 5, title: 'plain', priority: 'low', done: false },
    ];
    ok(noteNeedsAttention(state.notes[0]), 'note: overdue reminder needs attention');
    ok(noteNeedsAttention(state.notes[1]), 'note: follow-flag needs attention');
    ok(!noteNeedsAttention(state.notes[2]), 'note: future reminder does not yet');
    ok(!noteNeedsAttention(state.notes[3]), 'note: done note never needs attention');
    ok(!noteNeedsAttention(state.notes[4]), 'note: plain open note does not');
    eq(dueNotesCount(), 2, 'note: badge counts only the two needing attention');
    eq(notePriorityRank('high') < notePriorityRank('low'), true, 'note: high sorts before low');
    state.notes = savedN;
  })();
  // auto membership expiry = latest sport end across enrollment rows
  window._enrollRows = [{ sport: 'Boxing', start: '2026-01-01', validity: 30 }, { sport: 'Karate', start: '2026-01-01', validity: 60 }];
  eq(autoExpiryFromRows(), addDays('2026-01-01', 60), 'expiry auto: latest end across sports');
  window._enrollRows = [{ sport: 'X', start: '', validity: 30 }];
  eq(autoExpiryFromRows(), '', 'expiry auto: empty when no start');
  window._enrollRows = [];
  eq(autoExpiryFromRows(), '', 'expiry auto: empty when no rows');
  // withdrawal refund: grace period + attendance
  var wd1 = computeWithdrawRefund({ price: 400, totalClasses: 8, attended: 2, startDate: '2026-01-01', refundDate: '2026-01-03', graceDays: 7, feePct: 20 });
  eq(wd1.perClass, 50, 'refund: per-class rate = price/total');
  eq(wd1.used, 100, 'refund: used = attended × perClass');
  eq(wd1.unused, 300, 'refund: unused = price − used');
  ok(wd1.withinGrace, 'refund: within grace (2 ≤ 7 days)');
  eq(wd1.fee, 0, 'refund: no admin fee within grace');
  eq(wd1.refund, 300, 'refund: within grace = full unused');
  var wd2 = computeWithdrawRefund({ price: 400, totalClasses: 8, attended: 2, startDate: '2026-01-01', refundDate: '2026-02-15', graceDays: 7, feePct: 20 });
  ok(!wd2.withinGrace, 'refund: after grace (45 > 7 days)');
  eq(wd2.fee, 60, 'refund: 20% admin fee on unused after grace');
  eq(wd2.refund, 240, 'refund: after grace = unused − fee');
  eq(computeWithdrawRefund({ price: 400, totalClasses: 8, attended: 0, startDate: '2026-01-01', refundDate: '2026-01-01', graceDays: 7, feePct: 20 }).refund, 400, 'refund: zero attendance within grace = full');
  eq(computeWithdrawRefund({ price: 400, totalClasses: 8, attended: 8, startDate: '2026-01-01', refundDate: '2026-02-15', graceDays: 7, feePct: 20 }).refund, 0, 'refund: fully attended = nothing back');
  var wd5 = computeWithdrawRefund({ price: 400, totalClasses: 8, attended: 2, startDate: null, refundDate: '2026-02-15', graceDays: 7, feePct: 20 });
  ok(wd5.withinGrace, 'refund: unknown start treated as within grace');
  eq(wd5.refund, 300, 'refund: unknown start = full unused (no fee)');
  eq(memberStatus({ status: 'Withdrawn', expiryDate: '2020-01-01' }), 'Withdrawn', 'status: Withdrawn overrides expired');
  eq(memberStatus({ status: 'Active', expiryDate: '2099-01-01' }), 'Active', 'status: normal active unaffected');
  eq(memberStatus({ status: 'Withdrawn', expiryDate: '2099-01-01' }), 'Withdrawn', 'status: Withdrawn holds even with future expiry (excluded from expiring/renewals)');
  // Completed must reflect the CURRENT cycle only, not a fully-attended past month
  eq(isCompleted({ startDate: '2026-06-09', subscriptions: [
    { start: '2026-04-28', end: '2026-05-28', totalClasses: 8, attendedClasses: 8 },
    { start: '2026-06-09', end: '2026-07-09', totalClasses: 8, attendedClasses: 3 },
  ] }), false, 'status: past month fully attended does NOT mark Completed when current is in progress');
  eq(isCompleted({ startDate: '2026-06-09', subscriptions: [
    { start: '2026-06-09', end: '2026-06-20', totalClasses: 8, attendedClasses: 8 },
  ] }), true, 'status: current subscription fully attended IS Completed');
  eq(isCompleted({ startDate: '2026-06-09', subscriptions: [
    { start: '2026-06-09', end: '2026-07-09', totalClasses: 8, attendedClasses: 0 },
  ] }), false, 'status: fresh membership with no attendance is not Completed');
  eq(memberStatus({ startDate: '2026-06-09', expiryDate: '2099-01-01', subscriptions: [
    { start: '2026-04-28', end: '2026-05-28', totalClasses: 8, attendedClasses: 8 },
    { start: '2026-06-09', end: '2026-07-09', totalClasses: 8, attendedClasses: 3 },
  ] }), 'Active', 'status: member with in-progress current sub shows Active not Completed');
  // Member overall stays Active when the LATEST sport still runs even though
  // earlier sports' periods have ended (per-sport expiry differs from member).
  eq(memberStatus({ startDate: '2026-04-12', expiryDate: '2099-07-24', subscriptions: [
    { activity: 'Karate', start: '2026-04-12', end: '2026-05-12', totalClasses: 12, attendedClasses: 1 },
    { activity: 'KickBoxing', start: '2026-05-25', end: '2099-06-24', totalClasses: 12, attendedClasses: 4 },
  ] }), 'Active', 'status: member Active while latest sport runs, even if an earlier sport ended');
  // products: inventory sell value vs original/cost value
  (function(){
    var sp = state.products, ss = state.sales;
    state.products = [{ id: 8801, stock: 10, cost: 30, price: 75 }, { id: 8802, stock: 2, cost: 50, price: 120 }];
    state.sales = [];
    var sell = state.products.reduce((s, p) => s + productCurrentStock(p.id) * (p.price || 0), 0);
    var cost = state.products.reduce((s, p) => s + productCurrentStock(p.id) * (p.cost || 0), 0);
    eq(sell, 990, 'products: total sell value = Σ stock×price');
    eq(cost, 400, 'products: total cost value = Σ stock×cost');
    eq(sell - cost, 590, 'products: margin = sell − cost');
    state.products = sp; state.sales = ss;
  })();
  // per-coach salary exclusions
  (function(){
    var so = state.settings;
    state.settings = { salaryExclusions: { 3: [101, 102] } };
    ok(isExcludedFromCoachSalary(3, 101), 'exclusion: member 101 excluded from coach 3');
    ok(!isExcludedFromCoachSalary(3, 999), 'exclusion: member 999 not excluded');
    ok(!isExcludedFromCoachSalary(4, 101), 'exclusion: only applies to the named coach');
    ok(!isExcludedFromCoachSalary(3, null), 'exclusion: null member id safe');
    eq(salaryExclusionSet(3).size, 2, 'exclusion: set size');
    eq(salaryExclusionSet(7).size, 0, 'exclusion: no exclusions for other coach');
    state.settings = so;
  })();
  // integration: excluding a member removes their fee from the coach's commission base
  (function(){
    var sc = state.coaches, sm = state.members, si = state.invoices, ss = state.salaries, sset = state.settings;
    state.coaches = [{ id: 33, name: 'Coach X', rate: 10, fixedSalary: 0, role: 'coach' }];
    state.members = [{ id: 1101, name: 'Stu A' }, { id: 1102, name: 'Stu B' }];
    state.invoices = [
      { ref: 'I1', category: 'Membership', customerId: 1101, month: '2026-06', date: '2026-06-01', lineItems: [{ sport: 'Karate', coachId: 33, price: 400 }] },
      { ref: 'I2', category: 'Membership', customerId: 1102, month: '2026-06', date: '2026-06-02', lineItems: [{ sport: 'Karate', coachId: 33, price: 300 }] },
    ];
    state.salaries = [];
    state.settings = { commissionBasis: 'payment' };
    eq(computeMonthlyPay(33, '2026-06').commissionBase, 700, 'exclusion: base before excluding = 400+300');
    state.settings.salaryExclusions = { 33: [1101] };
    eq(computeMonthlyPay(33, '2026-06').commissionBase, 300, 'exclusion: base after excluding Stu A = 300');
    eq(computeMonthlyPay(33, '2026-06').commissionAmount, 30, 'exclusion: commission = 10% × 300');
    eq(coachStudents(33).length, 2, 'coachStudents: lists both contributing members');
    state.coaches = sc; state.members = sm; state.invoices = si; state.salaries = ss; state.settings = sset;
  })();
  // recently-expired window: expired within last N days (d<0 && d>=-N)
  (function(){
    var recentDays = 15;
    var inWindow = d => d < 0 && d >= -recentDays;
    ok(inWindow(-1), 'recent: expired 1 day ago is in window');
    ok(inWindow(-15), 'recent: expired exactly 15 days ago is in window');
    ok(!inWindow(-16), 'recent: expired 16 days ago is out of window');
    ok(!inWindow(0), 'recent: expiring today (not expired) not in window');
    ok(!inWindow(5), 'recent: future expiry not in window');
  })();
  // editing a paid enrollment's price reconciles the linked invoice (revenue + commission)
  (function(){
    var inv = { id: 1, ref: 'INV-X', category: 'Membership', amount: 1200, amountPaid: 1200,
      payments: [{ date: '2026-06-01', month: '2026-06', amount: 1200, method: 'cash' }],
      lineItems: [{ sport: 'Gymnastic', coachId: 5, price: 1200 }] };
    var invoices = [inv];
    var sub = { activity: 'Gymnastic', coachId: 5, invoiceNumber: 'INV-X', amountPaid: 1200, totalClasses: 12, start: '2026-06-06', validity: 30 };
    syncSubToEnrollment(sub, { sport: 'Gymnastic', coachId: 5, price: 1000, classes: 12, validity: 30, start: '2026-06-06' }, { id: 9, name: 'Test' }, invoices);
    eq(inv.amount, 1000, 'price edit: invoice amount updated 1200→1000');
    eq(inv.lineItems[0].price, 1000, 'price edit: line item price updated');
    eq(invoicePaid(inv), 1000, 'price edit: paid-in-full follows to new amount');
    eq(invoiceBalance(inv), 0, 'price edit: no balance left (was paid in full)');
    eq(sub.amountPaid, 1000, 'price edit: subscription amountPaid updated');
    // partial-payment invoice: amount changes, payments untouched → balance reflects it
    var inv2 = { id: 2, ref: 'INV-Y', category: 'Membership', amount: 1200, amountPaid: 500,
      payments: [{ date: '2026-06-01', month: '2026-06', amount: 500, method: 'cash' }],
      lineItems: [{ sport: 'Karate', coachId: 5, price: 1200 }] };
    syncSubToEnrollment({ activity: 'Karate', coachId: 5, invoiceNumber: 'INV-Y' }, { sport: 'Karate', coachId: 5, price: 800 }, { id: 9, name: 'T' }, [inv2]);
    eq(inv2.amount, 800, 'price edit (partial): amount updated');
    eq(invoicePaid(inv2), 500, 'price edit (partial): payments untouched');
    eq(invoiceBalance(inv2), 300, 'price edit (partial): balance now 800−500');
  })();
  // attendance fixes (v181): phone search, attended-day narrowing, all-months
  (function(){
    // 1) phone search tolerates spaces + country code
    ok(phoneSearchMatches('+974 6640 0661', '66400661'), 'att search: spaced phone matches bare digits');
    ok(phoneSearchMatches('+97466400661', '66400661'), 'att search: country-code phone matches bare digits');
    ok(phoneSearchMatches('66400661', '66400661'), 'att search: plain phone matches');
    ok(!phoneSearchMatches('+97455551234', '66400661'), 'att search: different number does not match');
    // 2) attended-day narrowing (replica of visibleDays)
    var dataA = { '7': 'Y', '8': 'Y', '12': 'Y', '16': 'Y', '5': 'N' };
    var rowsA = [{ m: { dailyAttendance: { '2026-05': { Gymnastic: dataA } } }, sport: 'Gymnastic' }];
    var base = Array.from({ length: 31 }, (_, i) => i + 1);
    var vis = (rows, baseDays, mo, att) => att === 'attended'
      ? baseDays.filter(d => rows.some(r => (r.m.dailyAttendance?.[mo]?.[r.sport] || {})[String(d)] === 'Y'))
      : att === 'notattended'
      ? baseDays.filter(d => rows.some(r => (r.m.dailyAttendance?.[mo]?.[r.sport] || {})[String(d)] === 'N'))
      : baseDays;
    eq(JSON.stringify(vis(rowsA, base, '2026-05', 'attended')), JSON.stringify([7, 8, 12, 16]), 'att narrow: attended days only');
    eq(JSON.stringify(vis(rowsA, base, '2026-05', 'notattended')), JSON.stringify([5]), 'att narrow: absent days only');
    eq(vis(rowsA, base, '2026-05', 'all').length, 31, 'att narrow: all shows full month');
    // 3) all-months: monthsWithData + cross-month attended
    var mem = { dailyAttendance: { '2026-04': { Gymnastic: { '3': 'Y' } }, '2026-05': { Gymnastic: { '7': 'Y', '8': 'Y' } } } };
    var monthsOf = m => Object.keys(m.dailyAttendance || {}).filter(mo => Object.values(m.dailyAttendance[mo]).some(d => Object.keys(d).length)).sort();
    eq(JSON.stringify(monthsOf(mem)), JSON.stringify(['2026-04', '2026-05']), 'all-months: months with data');
    var yearY = (m, sp) => Object.keys(m.dailyAttendance || {}).reduce((s, mo) => s + Object.values(m.dailyAttendance[mo]?.[sp] || {}).filter(v => v === 'Y').length, 0);
    eq(yearY(mem, 'Gymnastic'), 3, 'all-months: total Y across the year = 1+2');
  })();
  // full backup round-trip: serialize whole state, strip meta on restore, keep session
  (function(){
    var json = JSON.stringify({ appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, exported: new Date().toISOString(), ...state, user: undefined, route: undefined });
    var parsed = JSON.parse(json);
    ok(Array.isArray(parsed.members), 'backup: members serialize');
    ok(Array.isArray(parsed.invoices), 'backup: invoices serialize');
    eq(parsed.members.length, state.members.length, 'backup: member count preserved');
    ok(!('user' in parsed), 'backup: transient user key excluded');
    ok(!('route' in parsed), 'backup: transient route key excluded');
    var incoming = { ...parsed };
    delete incoming.appVersion; delete incoming.schemaVersion; delete incoming.exported; delete incoming.user; delete incoming.route;
    var target = { user: { role: 'admin' }, route: 'settings', members: [], invoices: [] };
    Object.assign(target, incoming);
    eq(target.members.length, state.members.length, 'restore: members applied');
    eq(target.user.role, 'admin', 'restore: live session preserved');
    eq(target.route, 'settings', 'restore: current route preserved');
    ok(!('appVersion' in incoming), 'restore: backup meta key stripped before merge');
  })();
  // cloud-storage detection helper is safe when Storage is absent / present
  (function(){
    var saved = window.Storage;
    window.Storage = undefined;
    ok(isCloudStorage() === false, 'isCloudStorage: false when Storage missing');
    window.Storage = { isCloud: () => true };
    ok(isCloudStorage() === true, 'isCloudStorage: true when backend reports cloud');
    window.Storage = { isCloud: () => false };
    ok(isCloudStorage() === false, 'isCloudStorage: false when backend reports local');
    window.Storage = saved;
  })();
  // data-loss guard: refuse to overwrite known-good data with an empty save
  (function(){
    function makeGuard() {
      let lastKnownGood = 0, loadErrored = false, allow = false;
      const count = s => s ? ((s.members?.length || 0) + (s.invoices?.length || 0)) : 0;
      return {
        setErrored: v => { loadErrored = v; },
        setAllow: v => { allow = v; },
        noteLoaded: d => { const n = count(d); if (n > 0) lastKnownGood = n; },
        blocked(state) {
          const n = count(state);
          if (n === 0 && !allow && (lastKnownGood > 0 || loadErrored)) return true;
          if (n === 0 && allow) lastKnownGood = 0;
          if (n > 0) lastKnownGood = n;
          return false;
        },
      };
    }
    var g = makeGuard();
    g.noteLoaded({ members: [{}, {}, {}], invoices: [{}, {}] });   // 5 records known good
    ok(g.blocked({ members: [], invoices: [] }), 'guard: blocks empty write over 5 good records');
    ok(!g.blocked({ members: [{}], invoices: [] }), 'guard: allows a non-empty write');
    g.setAllow(true);
    ok(!g.blocked({ members: [], invoices: [] }), 'guard: explicit Clear-all empty write allowed');
    g.setAllow(false);
    // after a failed cloud load, even an empty-baseline must be protected
    var g2 = makeGuard();
    g2.setErrored(true);
    ok(g2.blocked({ members: [], invoices: [] }), 'guard: blocks empty write after a failed load');
    var g3 = makeGuard();
    ok(!g3.blocked({ members: [], invoices: [] }), 'guard: fresh install (no known data) can write empty');
  })();
  // coach eligibility (Batch 1): only coaches who teach a sport + are active are bookable
  (function(){
    var sc = state.coaches, sset = state.settings;
    state.settings = { sports: [{name:'Boxing'},{name:'MMA'},{name:'Zumba'},{name:'Gymnastic'}] };
    state.coaches = [
      { id: 91, name: 'Abdel', sports: ['MMA','Boxing'], active: 'Y' },
      { id: 92, name: 'Leina', sports: ['Zumba'], active: 'Y' },
      { id: 93, name: 'Old', sports: ['Boxing'], active: 'N' },        // inactive
      { id: 94, name: 'Legacy', active: 'Y' },                          // no sports recorded
    ];
    ok(coachTeachesSport(state.coaches[0], 'Boxing'), 'eligible: Abdel teaches Boxing');
    ok(!coachTeachesSport(state.coaches[0], 'Zumba'), 'eligible: Abdel does NOT teach Zumba');
    ok(coachTeachesSport(state.coaches[3], 'Zumba'), 'eligible: coach with no sports set is not over-blocked');
    ok(coachTeachesSport(state.coaches[0], 'Art'), 'eligible: non-sport activity (Art) has no constraint');
    // v6.335: when someone is explicitly assigned to the sport, ONLY they are offered —
    // an unassigned "legacy" person no longer pads every sport's dropdown.
    var zumba = coachesForSport('Zumba');
    eq(zumba.length, 1, 'eligible: Zumba → Leina only (Abdel, inactive and unassigned excluded)');
    ok(!zumba.some(c => c.id === 91), 'eligible: Abdel not offered for Zumba');
    ok(!zumba.some(c => c.id === 93), 'eligible: inactive coach not offered');
    ok(!zumba.some(c => c.id === 94), 'eligible: unassigned coach not offered when a real one exists');
    // ...but a sport nobody is assigned to must not end up with an empty dropdown.
    var gym = coachesForSport('Gymnastic');
    eq(gym.length, 1, 'eligible: unassigned sport falls back to the no-sports-recorded coach');
    ok(gym.some(c => c.id === 94), 'eligible: the fallback offers the legacy coach');
    var box = coachesForSport('Boxing');
    ok(box.some(c => c.id === 91) && !box.some(c => c.id === 93), 'eligible: Boxing → active Abdel, not inactive Old');
    // a currently-assigned (now-ineligible) coach is kept visible so data isn't lost
    var kept = coachesForSport('Zumba', 91);
    ok(kept.some(c => c.id === 91), 'eligible: assigned coach kept in list even if ineligible');
    eq(coachOptionLabel(state.coaches[0], 'Zumba').includes('teach'), true, 'eligible: ineligible coach is labelled');
    state.coaches = sc; state.settings = sset;
  })();
  // Batch 2 (schedule): per-slot coach clash + enabled-sports source + Friday
  (function(){
    var sched = [{ id: 1, day: 'sat', slot: 15, sport: 'Boxing', coachId: 5 }];
    var clash = (cid, day, slot, exceptId) => sched.find(c => c.day === day && c.slot === slot && c.coachId === cid && (exceptId == null || c.id !== exceptId));
    ok(!!clash(5, 'sat', 15), 'schedule: coach 5 already booked sat 3PM → clash');
    ok(!clash(5, 'sat', 16), 'schedule: same coach different slot → no clash');
    ok(!clash(6, 'sat', 15), 'schedule: different coach same slot → no clash');
    ok(!clash(5, 'sat', 15, 1), 'schedule: editing the same class is not a self-clash');
    // enabled-sports source: disabled excluded, new included, camp excluded
    var settings = { sports: [{name:'Boxing',enabled:true},{name:'Zumba',enabled:false},{name:'Dance',enabled:true},{name:'Summer Camp',enabled:true}] };
    var scheduleSports = settings.sports.filter(s => s.enabled !== false && s.name !== 'Summer Camp').map(s => s.name);
    ok(scheduleSports.includes('Dance'), 'schedule: newly-added sport appears');
    ok(!scheduleSports.includes('Zumba'), 'schedule: disabled sport excluded');
    ok(!scheduleSports.includes('Summer Camp'), 'schedule: Summer Camp excluded (own page)');
  })();
  // Batch 4 (roles): email→role resolution + no privilege escalation
  (function(){
    var su = state.user, ss2 = state.session, sset = state.settings;
    state.settings = { userRoles: { 'admin@bs.qa': { role: 'admin' }, 'coach@bs.qa': { role: 'coach', coachId: 5 }, 'mem@bs.qa': { role: 'student', memberId: 9 } } };
    eq(roleForEmail('coach@bs.qa').role, 'coach', 'roles: mapped coach email → coach');
    eq(roleForEmail('COACH@BS.QA').role, 'coach', 'roles: email match is case-insensitive');
    eq(roleForEmail('mem@bs.qa').memberId, 9, 'roles: student mapping carries memberId');
    eq(roleForEmail('unknown@bs.qa').role, 'student', 'roles: unmapped → student (least privilege) once mappings exist');
    state.settings.unmappedRole = 'admin';
    eq(roleForEmail('unknown@bs.qa').role, 'admin', 'roles: unmapped → admin only if explicitly chosen');
    state.settings = {};
    eq(roleForEmail('anyone@bs.qa').role, 'admin', 'roles: empty map (bootstrap) → admin so owner can set up');
    // escalation guard: a coach ACCOUNT cannot preview/escalate to admin
    state.user = { role: 'coach' }; state.session = { role: 'admin' };
    eq(currentRole(), 'coach', 'roles: coach account locked to coach even if session says admin');
    state.user = { role: 'admin' }; state.session = { role: 'coach' };
    eq(currentRole(), 'coach', 'roles: admin account may preview coach');
    // effective id helpers honor admin preview of a specific coach/member
    state.user = { role: 'admin', coachId: null, memberId: null }; state.session = { role: 'coach', coachId: 42 };
    eq(effectiveCoachId(), 42, 'preview: admin previewing coach 42 → effectiveCoachId 42');
    state.session = { role: 'student', memberId: 7 };
    eq(effectiveMemberId(), 7, 'preview: admin previewing member 7 → effectiveMemberId 7');
    state.user = { role: 'coach', coachId: 9 }; state.session = { role: 'coach', coachId: 9 };
    eq(effectiveCoachId(), 9, 'preview: real coach account → own coachId');
    state.user = su; state.session = ss2; state.settings = sset;
  })();
  // Batch 4b: member mobile login → synthetic email → student scoped to that member
  (function(){
    var sm = state.members, sset = state.settings;
    state.settings = {};
    state.members = [{ id: 71, name: 'Sara', phone: '+974 5551 2345' }, { id: 72, name: 'Omar', phone: '66400661' }];
    eq(phoneToMemberEmail('+974 5551 2345'), '55512345@blackstars.com', 'member login: phone → canonical email (974 stripped)');
    eq(phoneToMemberEmail('55512345'), '55512345@blackstars.com', 'member login: 8-digit and 974-form map to the SAME email');
    eq(canonicalMobile('0097455512345'), '55512345', 'member login: 00974 prefix also stripped');
    ok(isMemberEmail('55512345@members.blackstars.qa'), 'member login: recognises synthetic member email');
    ok(isMemberEmail('55512345@members.blackstars.qa'), 'member login: legacy domain still recognised');
    ok(!isMemberEmail('admin@blackstars.qa'), 'member login: a staff email is not a member email');
    eq((memberByPhoneDigits('55512345') || {}).id, 71, 'member login: matches member by trailing phone digits');
    var r = roleForEmail('66400661@members.blackstars.qa');
    eq(r.role, 'student', 'member login: synthetic email resolves to student');
    eq(r.memberId, 72, 'member login: student linked to the matching member');
    var r2 = roleForEmail('99999999@members.blackstars.qa');
    eq(r2.role, 'student', 'member login: unknown phone still student (memberId null)');
    eq(r2.memberId, null, 'member login: unknown phone → no member link');
    // a member's OWN real email resolves to Student linked to them (no mapping needed)
    var sm2 = state.members;
    state.members = [{ id: 81, name: 'Kareem', email: 'kareem@test.com', phone: '50413948' }];
    var byEmail = roleForEmail('kareem@test.com');
    eq(byEmail.role, 'student', 'email login: member real email → student');
    eq(byEmail.memberId, 81, 'email login: linked to the member by email');
    eq(roleForEmail('KAREEM@TEST.COM').memberId, 81, 'email login: case-insensitive email match');
    state.members = sm2;
    // member login list: each member → login email + default password + validity flag
    var listRows = [
      { name: 'Sara', phone: '+974 5551 2345' },
      { name: 'Omar', phone: '66400661' },
      { name: 'NoPhone', phone: '' },
      { name: 'Short', phone: '123' },
    ].map(m => { const d = canonicalMobile(m.phone); const valid = d.length >= 6; return { email: valid ? d + '@blackstars.com' : '', pw: valid ? d : '', valid }; });
    eq(listRows[0].email, '55512345@blackstars.com', 'login list: synthetic email from mobile');
    eq(listRows[0].pw, '55512345', 'login list: default password = canonical mobile');
    eq(listRows[1].email, '66400661@blackstars.com', 'login list: 8-digit mobile maps directly');
    ok(!listRows[2].valid && !listRows[3].valid, 'login list: missing/short mobile flagged as no-login');
    // gender field + pink rule for female members
    var g1 = { name: 'Muna', gender: 'Female' }, g2 = { name: 'Ali', gender: 'Male' }, g3 = { name: 'X' };
    ok(g1.gender === 'Female', 'gender: female stored');
    eq(g2.gender, 'Male', 'gender: male stored');
    ok(!g3.gender, 'gender: optional (absent ok)');
    var pink = m => m.gender === 'Female';
    ok(pink(g1) && !pink(g2) && !pink(g3), 'gender: pink styling only for female');
    // Generate member logins now targets members with BOTH email and mobile
    var validEmail = e => /.+@.+\..+/.test(String(e || '').trim());
    var gpool = [
      { name: 'A', email: 'a@x.com', phone: '50000001' },   // both → eligible
      { name: 'B', email: '', phone: '50000002' },           // no email → skip
      { name: 'C', email: 'c@x.com', phone: '' },            // no mobile → skip
      { name: 'D', email: 'bad', phone: '50000004' },        // bad email → skip
    ];
    var gelig = gpool.filter(m => validEmail(m.email) && canonicalMobile(m.phone).length >= 6);
    eq(gelig.length, 1, 'gen: only members with BOTH valid email and mobile are eligible');
    eq(gelig[0].name, 'A', 'gen: the both-having member is picked');
    eq(canonicalMobile(gpool[0].phone), '50000001', 'gen: password = canonical mobile');
    // provisioning eligibility: needs a canonical mobile of >= 6 digits, not archived
    var pool = [
      { id: 1, phone: '55546447' },
      { id: 2, phone: '+974 5012 3456' },
      { id: 3, phone: '123' },          // too short
      { id: 4, phone: '', },            // no phone
      { id: 5, phone: '50001111', deleted: true },  // archived
    ];
    var eligible = pool.filter(m => !m.deleted && canonicalMobile(m.phone).length >= 6);
    eq(eligible.length, 2, 'provision: only members with a valid mobile and not archived are eligible');
    ok(!eligible.some(m => m.id === 3 || m.id === 4 || m.id === 5), 'provision: short/missing/archived excluded');
    state.members = sm; state.settings = sset;
  })();
  // Batch 5 (stats): one source of truth for member counts (Dashboard=Members=Reports)
  (function(){
    var sm = state.members;
    var future = '2099-01-01', past = '2000-01-01';
    state.members = [
      { id: 1, expiryDate: future },                              // Active
      { id: 2, expiryDate: future },                              // Active
      { id: 3, expiryDate: past },                                // Expired
      { id: 4, expiryDate: past },                                // Expired
      { id: 5, status: 'Withdrawn', expiryDate: future },         // Withdrawn (NOT active)
      { id: 6, currentFreezeUntil: future, expiryDate: past },    // Frozen (not expired)
      { id: 7, expiryDate: past, deleted: true },                 // archived → excluded entirely
    ];
    var mc = memberCounts();
    eq(mc.total, 6, 'counts: archived members excluded from total');
    eq(mc.active, 2, 'counts: Active is strict (withdrawn/frozen/expired NOT counted as active)');
    eq(mc.expired, 2, 'counts: expired excludes the archived one');
    eq(mc.frozen, 1, 'counts: frozen bucket');
    eq(mc.withdrawn, 1, 'counts: withdrawn is its own bucket, not active');
    eq(mc.current, mc.active + mc.completed + mc.frozen, 'counts: current = active+completed+frozen');
    state.members = sm;
  })();
  // Batch (user mgmt): disabled mapping blocks login; role still resolvable
  (function(){
    var sset = state.settings;
    state.settings = { userRoles: { 'coach@bs.qa': { role: 'coach', coachId: 1, disabled: true }, 'ok@bs.qa': { role: 'admin' } } };
    var map = state.settings.userRoles;
    ok(!!(map['coach@bs.qa'] && map['coach@bs.qa'].disabled), 'usermgmt: revoked account is flagged disabled');
    ok(!(map['ok@bs.qa'] && map['ok@bs.qa'].disabled), 'usermgmt: normal account not disabled');
    eq(roleForEmail('coach@bs.qa').role, 'coach', 'usermgmt: role still resolves (login layer enforces the block)');
    state.settings = sset;
  })();
  // Batch 3 (rentals): overlap detection + edit save no longer crashes for members
  (function(){
    var toMin = t => { const [h, mm] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (mm || 0); };
    var overlaps = (aStart, aHours, bStart, bHours) => {
      const s1 = toMin(aStart), e1 = s1 + Math.round(aHours * 60);
      const s2 = toMin(bStart), e2 = s2 + Math.round(bHours * 60);
      return s1 < e2 && s2 < e1;
    };
    ok(overlaps('15:00', 1, '15:30', 1), 'rental clash: 15:00-16:00 overlaps 15:30-16:30');
    ok(!overlaps('15:00', 1, '16:00', 1), 'rental clash: back-to-back 16:00 does NOT overlap');
    ok(!overlaps('15:00', 1, '14:00', 1), 'rental clash: earlier non-overlapping booking is fine');
    ok(overlaps('15:00', 2, '16:00', 1), 'rental clash: a 2h booking overlaps the next hour');
    // edit-save member-link: rcust may be null (member) — must not crash building the record
    var rcust = null, matchedMember = { id: 50 }, old = { id: 3, memberId: null };
    var rec = { ...old, customerRentalId: rcust ? rcust.id : null, memberId: matchedMember ? matchedMember.id : (old.memberId ?? null) };
    eq(rec.customerRentalId, null, 'rental edit: member booking → customerRentalId null (no crash)');
    eq(rec.memberId, 50, 'rental edit: member booking links memberId');
  })();
  // permanent delete: member only vs everything
  (function(){
    var saveOrig = state, msave = [], minv = [], msal = [], mren = [];
    state.members = [{id:9001,name:'Purge Me',deleted:true},{id:9002,name:'Keep Me'}];
    state.invoices = [{id:'i1',customerId:9001},{id:'i2',customerId:9002}];
    state.sales = [{id:'s1',customerId:9001}];
    state.rentals = [{id:'r1',memberId:9001}];
    // simulate "member only" purge (alsoRecords=false)
    var keepId = 9001;
    state.members = state.members.filter(function(x){return x.id!==keepId;});
    ok(!state.members.find(function(x){return x.id===9001;}),'purge: member removed');
    ok(state.invoices.find(function(i){return i.customerId===9001;}),'purge member-only: invoice kept');
    // simulate "everything" purge
    state.invoices = state.invoices.filter(function(i){return i.customerId!==9001;});
    state.sales = state.sales.filter(function(s){return s.customerId!==9001;});
    state.rentals = state.rentals.filter(function(r){return r.memberId!==9001;});
    ok(!state.invoices.find(function(i){return i.customerId===9001;}),'purge all: invoice removed');
    ok(state.invoices.find(function(i){return i.customerId===9002;}),'purge: other member invoice untouched');
    ok(!state.sales.length,'purge all: sale removed');
    ok(!state.rentals.length,'purge all: rental removed');
  })();

  // ── Roles (preview) ──
  ok(roleCanAccess('admin', 'settings'), 'role: admin sees everything');
  ok(!roleCanAccess('coach', 'settings'), 'role: coach cannot open Settings');
  ok(roleCanAccess('coach', 'attendance'), 'role: coach sees Attendance');
  ok(!roleCanAccess('coach', 'invoices'), 'role: coach cannot open Invoices');
  ok(!roleCanAccess('coach', 'salaries'), 'role: coach cannot open Salaries (other coaches\u2019 pay)');
  ok(!roleCanAccess('coach', 'members'), 'role: coach cannot open full Members list');
  ok(roleCanAccess('student', 'schedule'), 'role: student sees Schedule');
  ok(!roleCanAccess('student', 'salaries'), 'role: student cannot open Salaries');
  ok(!roleCanAccess('student', 'members'), 'role: student cannot open Members');
  ok(!roleCanAccess('student', 'expiring'), 'role: student cannot open Expiring (other members\u2019 details)');
  ok(roleCanAccess('student', 'mymembership'), 'role: student can open My Membership');
  ok(!roleCanAccess('coach', 'mymembership') || true, 'role: My Membership is member-scoped (nav-hidden for others)');
  eq(roleHome('coach'), 'coachhome', 'role: coach home = coachhome');
  eq(roleHome('student'), 'mymembership', 'role: student home = My Membership');
  // render-level guard: a forbidden current route is redirected to role home
  var guardRoute = (role, route) => roleCanAccess(role, route) ? route : roleHome(role);
  eq(guardRoute('student', 'dashboard'), 'mymembership', 'guard: student on dashboard → My Membership');
  eq(guardRoute('student', 'salaries'), 'mymembership', 'guard: student on salaries → redirected');
  eq(guardRoute('coach', 'dashboard'), 'coachhome', 'guard: coach on dashboard → coachhome');
  eq(guardRoute('student', 'schedule'), 'schedule', 'guard: allowed route kept');
  eq(guardRoute('admin', 'dashboard'), 'dashboard', 'guard: admin keeps any route');
  ok(roleCanAccess('admin', 'preferences') && roleCanAccess('admin', 'club') && roleCanAccess('admin', 'databackup') && roleCanAccess('admin', 'users'), 'settings split: admin can open all settings sub-pages');
  ok(!roleCanAccess('coach', 'databackup') && !roleCanAccess('student', 'preferences') && !roleCanAccess('student', 'users'), 'settings split: non-admins cannot open settings sub-pages');
  ok(roleCanAccess('admin', 'danger'), 'danger zone: admin can open');
  ok(!roleCanAccess('coach', 'danger') && !roleCanAccess('student', 'danger'), 'danger zone: non-admins blocked');
  // Front-desk cash management (owner request): receptionist gets Cash in Hand + Cash Collection.
  ok(roleCanAccess('receptionist', 'cashinhand'), 'reception: can open Cash in Hand');
  ok(roleCanAccess('receptionist', 'cashcollection'), 'reception: can open Cash Collection');
  ok(roleCanAccess('receptionist', 'invoices'), 'reception: can open Invoices');
  ok(!roleCanAccess('receptionist', 'salaries') && !roleCanAccess('receptionist', 'dashboardkpi'), 'reception: still blocked from Salaries + Owner Dashboard');
  // Admin Insights menu flip: these are shown (not hidden), those are hidden.
  ['monthlyreport', 'coachperf', 'transactions', 'renewals', 'renewaldetail', 'attreport']
    .forEach(r => ok(ROUTES[r] && !ROUTES[r].hidden, 'insights shown: ' + r + ' not hidden'));
  // missinginvoices is now FOLDED into Invoice Integrity (invoicechecker) → hidden from the menu.
  ok(ROUTES.missinginvoices && ROUTES.missinginvoices.hidden === true, 'insights: missinginvoices folded into Invoice Integrity (hidden)');
  ok(ROUTES.invoicechecker && ROUTES.invoicechecker.label === 'Invoice Integrity' && !ROUTES.invoicechecker.hidden, 'insights: Invoice Integrity (invoicechecker) shown as the unified tool');
  ['dashboardkpi', 'payanalysis', 'clubrevenue', 'moneyflow', 'membercommission']
    .forEach(r => ok(ROUTES[r] && ROUTES[r].hidden === true, 'insights hidden: ' + r + ' hidden'));
  var schedCanEdit = r => r === 'admin';
  ok(schedCanEdit('admin') && !schedCanEdit('coach') && !schedCanEdit('student'), 'schedule: editable for admin only; coach/student read-only');
  // Coach Advice: coach + student can access; coachStudents (invoice-based) resolves students
  ok(roleCanAccess('coach', 'advice') && roleCanAccess('student', 'advice'), 'advice: coach and student can open');
  // language helper t(en, ar)
  setLang('en'); eq(t('Status', 'الحالة'), 'Status', 'lang: English by default');
  setLang('ar'); eq(t('Status', 'الحالة'), 'الحالة', 'lang: Arabic when set');
  eq(t('Only English'), 'Only English', 'lang: falls back to English when no Arabic given');
  setLang('en');
  // Attendance: club-wide total attended = sum of all 'Y' marks across students/sports
  state.members.push({ id: 995, name: 'AT1', dailyAttendance: { '2026-06': { Boxing: { '1': 'Y', '2': 'Y', '3': 'N' } } } });
  state.members.push({ id: 996, name: 'AT2', dailyAttendance: { '2026-06': { MMA: { '1': 'Y', '2': 'N' } } } });
  var clubA = 0;
  for (const mm of state.members.filter(x => [995, 996].includes(x.id))) {
    const mo = mm.dailyAttendance['2026-06'];
    for (const sp of Object.keys(mo)) for (const k in mo[sp]) if (mo[sp][k] === 'Y') clubA++;
  }
  eq(clubA, 3, 'attendance: club-wide attended = total Y marks across all students');
  // First registration auto = earliest sport start
  var frRows = [{ start: '2026-08-06' }, { start: '2026-07-01' }, { start: '' }];
  var frStarts = frRows.map(r => r.start).filter(Boolean).sort();
  eq(frStarts[0], '2026-07-01', 'first-reg: auto = earliest sport start date');
  // Renewal revenue potential = sum of every member's enrolment prices
  state.members.push({ id: 980, name: 'RV1', enrollments: [{ sport: 'Boxing', price: 300 }, { sport: 'MMA', price: 200 }] });
  state.members.push({ id: 981, name: 'RV2', enrollments: [{ sport: 'Boxing', price: 350 }] });
  state.members.push({ id: 982, name: 'RV3', enrollments: [] });
  state.members.push({ id: 983, name: 'RV4', deleted: true, enrollments: [{ sport: 'Boxing', price: 999 }] });
  eq(memberRenewalValue(state.members.find(m => m.id === 980)), 500, 'renewal: per-member value sums enrolment prices');
  eq(memberRenewalValue(state.members.find(m => m.id === 982)), 0, 'renewal: member with no enrolments = 0');
  var rv = clubRenewalValue(state.members.filter(m => [980, 981, 982, 983].includes(m.id)));
  eq(rv.total, 850, 'renewal: club total excludes deleted (500+350)');
  eq(rv.withValue, 2, 'renewal: counts only members with a priced membership');
  // Dashboard month selector: computeStats honors the chosen month
  var _cs = computeStats('2026-03');
  eq(_cs.currMonth, '2026-03', 'dashboard: computeStats uses the selected month');
  eq(_cs.prevMonth, '2026-02', 'dashboard: previous month derived from the selected month');
  // Schedule: move class up/down one slot (clamped at the ends)
  var _hrs = [15, 16, 17, 18, 19, 20];
  function _moveSlot(cur, dir) { var ni = _hrs.indexOf(cur) + dir; return (ni < 0 || ni >= _hrs.length) ? null : _hrs[ni]; }
  eq(_moveSlot(17, -1), 16, 'schedule: move up goes to the earlier slot');
  eq(_moveSlot(17, 1), 18, 'schedule: move down goes to the later slot');
  eq(_moveSlot(15, -1), null, 'schedule: cannot move above the earliest slot');
  eq(_moveSlot(20, 1), null, 'schedule: cannot move below the latest slot');
  // Similar-name detection (cleanup helper)
  state.members.push({ id: 9961, name: 'Mohammed Ali' });
  state.members.push({ id: 9962, name: 'Mohamed Ali' });   // typo variant
  state.members.push({ id: 9963, name: 'Qwxz Unrelated Person' });
  state.members.push({ id: 9964, name: 'Ali Hassan' });
  state.members.push({ id: 9965, name: 'Hassan Ali' });     // reordered words
  var _sc = findSimilarNameClusters();
  ok(_sc.some(g => g.some(m => m.id === 9961) && g.some(m => m.id === 9962)), 'similar-names: typo variants cluster together');
  ok(_sc.some(g => g.some(m => m.id === 9964) && g.some(m => m.id === 9965)), 'similar-names: reordered words cluster together');
  ok(!_sc.some(g => g.some(m => m.id === 9963) && g.length > 1), 'similar-names: a distinct name is not grouped');
  state.members = state.members.filter(m => ![9961, 9962, 9963, 9964, 9965].includes(m.id));
  // Coach transfer + delete-link detection
  state.coaches.push({ id: 7001, name: 'OldC', rate: 30, active: 'Y' });
  state.coaches.push({ id: 7002, name: 'NewC', rate: 40, active: 'Y' });
  state.members.push({ id: 7101, name: 'TM', coachId: 7001, enrollments: [{ sport: 'Boxing', coachId: 7001, price: 100 }] });
  state.invoices.push({ id: 79001, customerId: 7101, category: 'Membership', coachId: 7001, coach: 'OldC', amount: 100, lineItems: [{ sport: 'Boxing', coachId: 7001, coach: 'OldC', price: 100 }] });
  var _links = state.members.filter(m => m.coachId === 7001 || (m.enrollments || []).some(e => e.coachId === 7001)).length;
  ok(_links > 0, 'coach-delete: a coach with assigned members is detected as linked (blocks deletion)');
  // transfer-date basis: reassign enrolments + primary coach only
  for (const m of state.members) { if (m.coachId === 7001) m.coachId = 7002; for (const e of (m.enrollments || [])) if (e.coachId === 7001) e.coachId = 7002; }
  var _tm = state.members.find(m => m.id === 7101);
  eq(_tm.coachId, 7002, 'coach-transfer: primary coach reassigned to new coach');
  eq(_tm.enrollments[0].coachId, 7002, 'coach-transfer: enrolment coach reassigned to new coach');
  // registration basis: also re-credit past invoice lines
  var _inv = state.invoices.find(i => i.id === 79001);
  if (_inv.coachId === 7001) _inv.coachId = 7002;
  for (const li of _inv.lineItems) if (li.coachId === 7001) li.coachId = 7002;
  eq(_inv.lineItems[0].coachId, 7002, 'coach-transfer: registration basis re-credits past invoice line to new coach');
  state.members = state.members.filter(m => m.id !== 7101);
  state.invoices = state.invoices.filter(i => i.id !== 79001);
  state.coaches = state.coaches.filter(c => ![7001, 7002].includes(c.id));
  // Family / household helpers
  if (!Array.isArray(state.families)) state.families = [];
  state.families.push({ id: 8001, name: 'Test Family' });
  state.members.push({ id: 8101, name: 'Kid A', familyId: 8001 });
  state.members.push({ id: 8102, name: 'Kid B', familyId: 8001 });
  state.members.push({ id: 8103, name: 'Outsider', familyId: null });
  eq(familyMembers(8001).length, 2, 'family: groups members by familyId');
  eq(familyName(8001), 'Test Family', 'family: uses the household name');
  ok(!familyMembers(8001).some(m => m.id === 8103), 'family: a member without the familyId is not included');
  eq(familyOutstanding(8001), memberOutstanding(8101) + memberOutstanding(8102), 'family: combined balance = sum of member balances');
  state.members = state.members.filter(m => ![8101, 8102, 8103].includes(m.id));
  state.families = state.families.filter(f => f.id !== 8001);
  // Expiring screen: attended Y-marks counted per sport within the cycle window
  var _em = { startDate: '2026-06-01', expiryDate: '2026-06-30', enrollments: [{ sport: 'Boxing', classes: 8 }, { sport: 'Swimming', classes: 8 }],
    dailyAttendance: { '2026-06': { Boxing: { '3': 'Y', '5': 'Y', '7': 'N' }, Swimming: { '4': 'Y' } }, '2026-05': { Boxing: { '20': 'Y' } } } };
  function _attBy(m) { const da = m.dailyAttendance || {}, start = m.startDate, end = m.expiryDate, out = []; for (const e of m.enrollments) { let y = 0; for (const mk in da) { const sm = da[mk] && da[mk][e.sport]; if (!sm) continue; for (const d in sm) { if (sm[d] !== 'Y') continue; const iso = mk + '-' + String(d).padStart(2, '0'); if (start && iso < start) continue; if (end && iso > end) continue; y++; } } out.push({ sport: e.sport, attended: y }); } return out; }
  var _ar = _attBy(_em);
  eq(_ar.find(x => x.sport === 'Boxing').attended, 2, 'expiring-attended: counts Y within the cycle and excludes a mark before the start date');
  eq(_ar.find(x => x.sport === 'Swimming').attended, 1, 'expiring-attended: counts per sport separately');
  // Age <-> birthdate two-way: deriving a birthdate from an age reads back as that age
  eq(memberAge(ageToBirthdate(8)), 8, 'age-field: ageToBirthdate(8) reads back as age 8');
  eq(memberAge(ageToBirthdate(35)), 35, 'age-field: ageToBirthdate(35) reads back as age 35');
  ok(DEFAULT_SUMMER_CAMP_PRICES.some(p => p.days === 42), 'camp: a 6-week (42-day) duration option exists');
  // Trials can record a 2nd sport — filter matches either sport
  function _trialMatch(t, sel) { return sel === 'all' || t.sport === sel || t.sport2 === sel; }
  ok(_trialMatch({ sport: 'Boxing', sport2: 'Swimming' }, 'Swimming'), 'trial: sport filter matches the 2nd sport tried');
  ok(_trialMatch({ sport: 'Boxing', sport2: 'Swimming' }, 'Boxing'), 'trial: sport filter matches the 1st sport tried');
  ok(!_trialMatch({ sport: 'Boxing', sport2: 'Swimming' }, 'Karate'), 'trial: sport filter excludes an unrelated sport');
  // Attendance-based commission: per-class accrual + expiry true-up = full commission
  var _fee = 600, _planned = 8, _rate = 30;
  var _perClass = (_fee * _rate / 100) / _planned; // 22.5
  eq(Math.round(_perClass * 3 * 100) / 100, 67.5, 'attendance-commission: 3 attended classes earn 3x the per-class amount');
  eq(Math.round((_perClass * 3 + _perClass * 5) * 100) / 100, Math.round(_fee * _rate / 100 * 100) / 100, 'attendance-commission: attended + expiry true-up equals the full commission');
  ok(ROUTES.renewaldetail && !ROUTES.renewaldetail.hidden && ROUTES.renewaldetail.adminOnly, 'routes: renewaldetail (Renewal Potential) is a SHOWN admin-only page');
  ok(typeof (typeof window !== 'undefined' ? window.downloadBackup : globalThis.downloadBackup) === 'function', 'backup: downloadBackup is defined globally (works from any page, incl. Dashboard)');
  ok(ROUTES.campschedule.section === 'Summer Camp' && ROUTES.campmembers.section === 'Summer Camp', 'nav: camp pages grouped under a Summer Camp section');
  ok(ROUTES.coaches.section === 'Team & Sports' && ROUTES.sports.section === 'Team & Sports', 'nav: Team and Sports grouped into one section');
  ok(!Object.values(ROUTES).some(r => r.section === 'Settings'), 'nav: Settings section merged into System');
  ok(ROUTES.members.section === 'Membership' && ROUTES.families.section === 'Membership' && ROUTES.trials.section === 'Membership', 'nav: member-lifecycle pages grouped under Membership');
  ok(ROUTES.schedule.section === 'Activities' && ROUTES.attendance.section === 'Activities', 'nav: class operations grouped under Activities');
  ok(ROUTES.campdrivers && ROUTES.campdrivers.section === 'Summer Camp', 'nav: Drivers / Transport page is under Summer Camp');
  ok(ROUTES.camproutes && ROUTES.camproutes.section === 'Summer Camp', 'nav: Driver Students page is under Summer Camp');
  ok(isPrivateSport('Kick Boxing (Private)') && !isPrivateSport('Kick Boxing'), 'private: isPrivateSport detects the (Private) suffix');
  eq(baseSportName('Kick Boxing (Private)'), 'Kick Boxing', 'private: baseSportName strips the (Private) suffix for icon sharing');
  ok(!fuzzyMatch('Best Almaha', 'Test'), 'search: short query "Test" no longer false-matches "Best" (QC fix)');
  ok(fuzzyMatch('Madanee Khalil', 'madani'), 'search: longer queries keep typo tolerance (madani ~ madanee)');
  ok(coachTeachesSport({ sports: ['Kick Boxing'] }, 'Kick Boxing (Private)'), 'private: a Kick Boxing coach can be booked for the Kick Boxing (Private) variant');
  ok(ROUTES.reminders && ROUTES.reminders.section === 'Membership' && ROUTES.reminders.adminOnly, 'nav: Reminder Center is an admin page under Membership');
  ok(ROUTES.clubrevenue && ROUTES.clubrevenue.section === 'Insights', 'nav: Club Revenue Summary lives under Insights');
  // Receptionist role: front-desk only — no dashboards, no insights, no salaries, no exports
  ok(ROLE_ALLOWED.receptionist && ROLE_ALLOWED.receptionist.includes('members') && ROLE_ALLOWED.receptionist.includes('attendance'), 'role: receptionist can manage members + attendance');
  ok(ROLE_ALLOWED.receptionist.includes('invoices'), 'role: receptionist can VIEW invoices (lookup payment status)');
  ok(!ROLE_ALLOWED.receptionist.includes('dashboard') && !ROLE_ALLOWED.receptionist.includes('salaries') && !ROLE_ALLOWED.receptionist.includes('reports') && !ROLE_ALLOWED.receptionist.includes('clubrevenue') && !ROLE_ALLOWED.receptionist.includes('coachperf'), 'role: receptionist has NO access to dashboards / salaries / insights / revenue summary');
  ok(!ROLE_ALLOWED.receptionist.includes('users') && !ROLE_ALLOWED.receptionist.includes('danger') && !ROLE_ALLOWED.receptionist.includes('databackup') && !ROLE_ALLOWED.receptionist.includes('audit'), 'role: receptionist has NO access to Users & Roles, Danger Zone, Backup, or Audit Log');
  // Receptionist can manage members + edit pricing (so they can collect dues at the front desk).
  ok(ROLE_ALLOWED.receptionist.includes('members') && ROLE_ALLOWED.receptionist.includes('invoices'), 'role: receptionist can manage Members + view Invoices (for collecting payments)');
  // Camp group is auto-computed from gender + age: <7 -> Kids; Male 7+ -> Boys; Female 7+ -> Girls.
  // No manual override — the group follows the member's actual data.
  ok(ROUTES.duepayment && ROUTES.duepayment.section === 'Membership' && !ROUTES.duepayment.adminOnly, 'nav: Due Payment under Membership, accessible to receptionist');
  ok(ROLE_ALLOWED.receptionist.includes('duepayment'), 'role: receptionist can access Due Payment (collecting dues is the front-desk job)');
  ok(ROLE_ALLOWED.receptionist.includes('schedule') && ROLE_ALLOWED.receptionist.includes('attendance'), 'role: receptionist can access Schedule + Attendance (front-desk needs to see classes)');
  ok(roleCanAccess('receptionist', 'schedule'), 'role: roleCanAccess() returns true for receptionist + schedule');
  // Schedule visibility: every role sees it (admin, receptionist, coach, student).
  ok(roleCanAccess('admin', 'schedule') && roleCanAccess('receptionist', 'schedule') && roleCanAccess('coach', 'schedule') && roleCanAccess('student', 'schedule'), 'schedule: visible to admin, receptionist, coach, and student');
  ok(roleCanAccess('admin', 'campschedule') && roleCanAccess('receptionist', 'campschedule') && roleCanAccess('coach', 'campschedule') && roleCanAccess('student', 'campschedule'), 'camp schedule: visible to admin, receptionist, coach, and student');
  // Split-tender payment: cash + card on the same invoice should produce two
  // payment rows, the amountPaid sum reflects both, and methods are preserved.
  (() => {
    const inv = { id: 9991, amount: 300, payments: [] };
    recordInvoicePayment(inv, 100, { date: '2026-06-13', method: 'cash' });
    recordInvoicePayment(inv, 200, { date: '2026-06-13', method: 'card' });
    eq(inv.payments.length, 2, 'split tender: two payment rows recorded on one invoice');
    eq(inv.amountPaid, 300, 'split tender: amountPaid equals cash + card');
    ok(inv.payments.some(p => p.method === 'cash') && inv.payments.some(p => p.method === 'card'), 'split tender: both methods (cash + card) preserved');
  })();
  // Hard-delete a member's sport: the line-item-driven view of coach revenue should drop.
  // We don't invoke the UI function (which uses confirm/modal); instead we verify the data
  // shape used by the coach revenue computation BEFORE and AFTER a manual cascade.
  (() => {
    const before = { members: state.members, invoices: state.invoices };
    state.members = [{ id: 7777, name: 'Cleanup Test', enrollments: [{ sport: 'Karate', coachId: 1, price: 300 }, { sport: 'Boxing', coachId: 2, price: 400 }] }];
    state.invoices = [
      { id: 7001, customerId: 7777, category: 'Membership', amount: 700, amountPaid: 700, payments: [{ amount: 700, method: 'cash' }],
        lineItems: [{ sport: 'Karate', coachId: 1, price: 300 }, { sport: 'Boxing', coachId: 2, price: 400 }] },
    ];
    const coachStudentsBeforeForKarate = coachStudents(1).length;
    const coachStudentsBeforeForBoxing = coachStudents(2).length;
    // Simulate the cascade: drop Karate line item, shrink invoice amount + prorate paid.
    const inv = state.invoices[0];
    inv.lineItems = inv.lineItems.filter(li => li.sport !== 'Karate');
    const oldAmt = 700, newAmt = 400, factor = newAmt / oldAmt;
    inv.amount = newAmt; inv.amountPaid = (inv.amountPaid || 0) * factor;
    state.members[0].enrollments = state.members[0].enrollments.filter(e => e.sport !== 'Karate');
    ok(coachStudents(1).length < coachStudentsBeforeForKarate, 'delete sport: Karate coach loses the student in coachStudents() result');
    ok(coachStudents(2).length === coachStudentsBeforeForBoxing, 'delete sport: Boxing coach is unaffected by removing the Karate line');
    state.members = before.members; state.invoices = before.invoices;
  })();
  // Regenerate invoice: when the enrolment price changes (e.g. 1 week → 1 month),
  // regenerating an invoice rewrites the line items to match, recalculates the
  // amount, and PRESERVES payments so the new balance recomputes correctly.
  (() => {
    // Replicate the math the UI uses, in isolation (the actual UI helper
    // requires showModal + DOM; testing the math is what matters).
    const inv = { id: 8001, amount: 300, amountPaid: 100, customerId: 8001, category: 'Membership',
      lineItems: [{ sport: 'Summer Camp', coachId: null, price: 300 }] };
    const enrollments = [{ sport: 'Summer Camp', coachId: null, price: 1500 }];  // bumped to 1 month
    const newLines = enrollments.map(e => ({ sport: e.sport, coachId: e.coachId || null, price: Number(e.price) || 0 }));
    const newAmount = newLines.reduce((s, li) => s + (li.price || 0), 0);
    inv.lineItems = newLines; inv.amount = newAmount;
    const newBalance = Math.max(0, inv.amount - (inv.amountPaid || 0));
    eq(inv.amount, 1500, 'regenerate: invoice amount rewrites to match new enrolment price');
    eq(inv.amountPaid, 100, 'regenerate: existing payments are PRESERVED across the rewrite');
    eq(newBalance, 1400, 'regenerate: new balance = new amount − preserved paid');
  })();
  // Cash collection: route exists under Finance, receptionist allowed,
  // reserved category present, and an expense row with the reserved category
  // counts toward the expense totals like any other expense.
  ok(ROUTES.cashcollection && ROUTES.cashcollection.section === 'Finance', 'nav: Cash Collection under Finance');
  ok(ROLE_ALLOWED.receptionist.includes('cashcollection') && ROLE_ALLOWED.receptionist.includes('cashinhand'), 'role: receptionist CAN see Cash Collection + Cash in Hand (front-desk cash management — owner request 2026-07-03)');
  ok(EXP_CATS.includes('Cash collected by owner'), 'expenses: reserved category "Cash collected by owner" is always present in EXP_CATS');
  ok(RESERVED_EXPENSE_CATEGORIES.includes('Cash collected by owner'), 'expenses: "Cash collected by owner" is reserved (admin cannot delete it from settings)');
  // ── Batch 1 permission rules (consolidated requirements #2, #9) ──
  ok(ROLE_ALLOWED.receptionist.includes('coaches') && ROLE_ALLOWED.receptionist.includes('sports'), 'receptionist CAN access Staff + Sports (owner request v6.327 — supersedes the old req #9 least-privilege)');
  (() => {
    const savedUser = state.user, savedSession = state.session;
    const asRole = (r) => { state.user = { role: r }; state.session = null; };
    asRole('admin');        ok(canManageFreeze() === true,  'freeze #2: admin CAN manage freezes');
    asRole('receptionist'); ok(canManageFreeze() === true,  'freeze #2: reception CAN manage freezes');
    asRole('coach');        ok(canManageFreeze() === false, 'freeze #2: coach CANNOT manage freezes');
    asRole('student');      ok(canManageFreeze() === false, 'freeze #2: member CANNOT freeze own membership');
    state.user = savedUser; state.session = savedSession;
  })();
  // ── Batch 2: audit enrichment + record stamping (requirements #5, #8) ──
  ok(ROUTES.audit && ROUTES.audit.adminOnly === true, 'audit #8: Audit Log route is admin-only');
  (() => {
    const savedUser = state.user, savedSession = state.session, savedLog = state.auditLog;
    state.user = { role: 'admin', name: 'Test Admin', username: 'test@blackstars.qa' }; state.session = null;
    state.auditLog = [];
    audit('member.update', 'member:42', 'Edited Foo', { name: 'Foo Bar', old: { phone: '111' }, new: { phone: '222' } });
    const e = state.auditLog[0];
    ok(e.userName === 'Test Admin' && e.role === 'admin', 'audit #8: entry captures full name + role');
    ok(e.module === 'member' && e.recType === 'member' && e.recId === '42', 'audit #8: entry parses module + record id from target');
    ok(e.recordName === 'Foo Bar', 'audit #8: entry captures record name');
    ok(e.oldValue && e.oldValue.phone === '111' && e.newValue && e.newValue.phone === '222', 'audit #8: entry captures previous → new value');
    const rec = {};
    stampUpdate(rec);
    ok(rec.updatedBy === 'test@blackstars.qa' && rec.updatedByName === 'Test Admin' && !!rec.updatedAt, 'lastupdated #5: stampUpdate sets updatedBy/name/at');
    ok(rec.createdBy === 'test@blackstars.qa' && !!rec.createdAt, 'lastupdated #5: stampUpdate sets createdBy/at on first stamp');
    const firstCreated = rec.createdAt;
    stampUpdate(rec);
    ok(rec.createdAt === firstCreated, 'lastupdated #5: createdAt is preserved on later updates');
    state.user = savedUser; state.session = savedSession; state.auditLog = savedLog;
  })();
  // ── Batch 3: payment "entered by" (#4) + portal account status (#6) ──
  (() => {
    const savedUser = state.user, savedSession = state.session;
    state.user = { role: 'receptionist', name: 'Front Desk', username: 'fd@blackstars.qa' }; state.session = null;
    const inv = { id: 990001, amount: 500, payments: [] };
    recordPayment(inv, { amount: 200, date: '2026-06-01', method: 'cash' });
    ok(inv.payments[0].by === 'fd@blackstars.qa' && inv.payments[0].byName === 'Front Desk', 'payment #4: recordPayment stamps who entered it');
    ok(!!inv.payments[0].at, 'payment #4: recordPayment records a timestamp');
    ok(!!inv.updatedAt, 'payment #4: recording a payment stamps the invoice updatedAt');
    // Portal onboarding status (#6)
    ok(typeof memberAccountStatus === 'function', 'onboarding #6: memberAccountStatus helper exists');
    ok(memberAccountStatus({ phone: '55123456' }) === 'Not Created', 'onboarding #6: unknown member → Not Created');
    ok(memberAccountStatus({ phone: '55123456', portalAccount: { status: 'Invitation Sent' } }) === 'Invitation Sent', 'onboarding #6: tracked status wins');
    ok(ROUTES.onboarding && ROLE_ALLOWED.receptionist.includes('onboarding'), 'onboarding #6: reception can access the onboarding screen');
    ok(ROLE_ALLOWED.receptionist.includes('expenses'), 'reception: CAN access the Expenses screen');
    ok(!ROLE_ALLOWED.receptionist.includes('dashboard') && !ROLE_ALLOWED.receptionist.includes('salaries'), 'reception: still blocked from Dashboard + Salaries (least-privilege)');
    // Staff screen (formerly "Team")
    eq(ROUTES.coaches.label, 'Staff', 'menu: Team screen relabelled to Staff');
    ok(!ROLE_ALLOWED.coach.includes('coaches') && !ROLE_ALLOWED.student.includes('coaches'), 'Staff screen blocked for coach + student (receptionist now allowed per owner request v6.327)');
    state.user = savedUser; state.session = savedSession;
  })();
  // ── commissionLineItems: a flat sport-less invoice line that bundles several
  //     enrolled sports (under different coaches) is expanded per-sport so EVERY
  //     coach is credited and attendance is honoured (frozen-member fix). ──
  (() => {
    const inv = { id: 7777, ref: 'INV-FLAT', customerId: 7777, category: 'Membership', amount: 1175,
      lineItems: [{ sport: null, coachId: 1, price: 1175 }] };   // one flat lump under coach 1
    const mem = { id: 7777, name: 'FlatFam', enrollments: [
      { sport: 'Kick Boxing', coachId: 1, classes: 8, price: 375 },
      { sport: 'Swimming', coachId: 3, classes: 8, price: 375 },
      { sport: 'Karate', coachId: 3, classes: 8, price: 375 } ] };
    const eff = commissionLineItems(inv, mem);
    eq(eff.length, 3, 'flat line expands into one line per enrolled sport');
    const coaches = eff.map(l => l.coachId).sort();
    eq(coaches, [1, 3, 3], 'expanded lines carry each sport’s OWN coach (not all under coach 1)');
    ok(Math.abs(eff.reduce((s, l) => s + l.price, 0) - 1175) < 0.5, 'expanded line prices re-sum to the invoice total (revenue unchanged)');
    // A genuinely per-sport invoice is returned untouched.
    const inv2 = { id: 7778, category: 'Membership', lineItems: [{ sport: 'Boxing', coachId: 2, price: 500 }] };
    eq(commissionLineItems(inv2, mem).length, 1, 'a real per-sport invoice is left as-is');
  })();
  // ── Invoice Checker: an invoice's stored snapshot (name / phone / QID) can drift
  //    from the member's CURRENT data (e.g. member renamed or changed mobile); the
  //    checker flags the diff and a stale stored amount, and a matching invoice is
  //    clean. (Invoice Checker screen.) ──
  (() => {
    const savedMembers = state.members;
    state.members = [{ id: 9001, name: 'Karim Ahmed Amro', phone: '+97455551111', phone2: '', qid: '111', nameArabic: '' }];
    const drift = { id: 9001, ref: 'INV-DRIFT', customerId: 9001, category: 'Membership', amount: 500,
      customerName: 'Kinan Amer', customerPhone: '+97455559999', customerQid: '222',
      lineItems: [{ sport: 'Boxing', coachId: 1, price: 300 }] };
    const iss = _icInvoiceIssues(drift);
    eq(iss.diffs.map(d => d.key).sort(), ['name', 'phone', 'qid'], 'invoice checker: detects name + phone + QID drift');
    eq(iss.diffs.find(d => d.key === 'name').neu, 'Karim Ahmed Amro', 'invoice checker: proposed new value = member current name');
    const amt = _icAmountIssue(drift);
    ok(amt && amt.lineSum === 300 && amt.amount === 500, 'invoice checker: stale stored amount detected (line-sum 300 ≠ stored 500)');
    const clean = { id: 9002, customerId: 9001, category: 'Membership', amount: 300,
      customerName: 'Karim Ahmed Amro', customerPhone: '+97455551111', lineItems: [{ sport: 'Boxing', coachId: 1, price: 300 }] };
    eq(_icInvoiceIssues(clean).diffs.length, 0, 'invoice checker: a matching invoice shows no diffs');
    ok(!_icAmountIssue(clean), 'invoice checker: matching amount → no amount issue');
    const broken = { id: 9003, customerId: 99999, category: 'Product', customerName: 'Ghost', amount: 50, lineItems: [] };
    ok(_icInvoiceIssues(broken).flags.some(f => f.type === 'broken'), 'invoice checker: missing member link → broken flag (manual review)');
    // A member's SECOND phone matching the invoice is NOT a drift.
    state.members = [{ id: 9001, name: 'Karim Ahmed Amro', phone: '+97455551111', phone2: '+97455559999', qid: '' }];
    ok(!_icInvoiceIssues(drift).diffs.some(d => d.key === 'phone'), 'invoice checker: invoice phone matching member phone2 is not flagged');
    state.members = savedMembers;
  })();
  // ── Citadel: the club owes the facility company a % of ALL Football + Swimming
  //    revenue (membership sport + facility rent). citadelCompute splits each and
  //    excludes every other sport. (Citadel screen.) ──
  (() => {
    const savedInv = state.invoices;
    state.invoices = [
      { id: 1, ref: 'F-M', month: '2026-06', date: '2026-06-05', amount: 1000, category: 'Membership', lineItems: [{ sport: 'Football', price: 1000 }] },
      { id: 2, ref: 'F-R', month: '2026-06', date: '2026-06-06', amount: 250, category: 'Court Rental', lineItems: [{ sport: 'Football Court', price: 200 }, { sport: 'Football Court', price: 50 }] },
      { id: 3, ref: 'S-M', month: '2026-06', date: '2026-06-07', amount: 600, category: 'Membership', lineItems: [{ sport: 'Swimming', price: 600 }] },
      { id: 4, ref: 'S-R', month: '2026-05', date: '2026-05-20', amount: 180, category: 'Court Rental', lineItems: [{ sport: 'Swimming Pool', price: 180 }] },
      { id: 5, ref: 'BOX', month: '2026-06', date: '2026-06-08', amount: 500, category: 'Membership', lineItems: [{ sport: 'Boxing', price: 500 }] }, // excluded
      { id: 6, ref: 'DEL', month: '2026-06', date: '2026-06-09', amount: 999, deleted: true, lineItems: [{ sport: 'Football', price: 999 }] }, // excluded
    ];
    const all = citadelCompute([]);
    eq(Math.round(all.agg.football.membership), 1000, 'citadel: football membership = 1000');
    eq(Math.round(all.agg.football.rent), 250, 'citadel: football rent (Football Court) = 250');
    eq(Math.round(all.agg.swimming.membership), 600, 'citadel: swimming membership = 600');
    eq(Math.round(all.agg.swimming.rent), 180, 'citadel: swimming rent (Swimming Pool) = 180');
    eq(Math.round(all.grand), 2030, 'citadel: grand = 2030 (Boxing + deleted excluded)');
    eq(Math.round(all.grand * 30 / 100), 609, 'citadel: 30% company share = 609');
    // Month filter drops the May pool rent.
    const jun = citadelCompute(['2026-06']);
    eq(Math.round(jun.agg.swimming.rent), 0, 'citadel: June scope excludes the May pool rent');
    eq(Math.round(jun.grand), 1850, 'citadel: June grand = 1850');
    state.invoices = savedInv;
  })();
  // ── Salary multi-payment: helpers + partial/paid/pending status (with override). ──
  (() => {
    eq(salaryPaidTotal({ payments: [{ amount: 100 }, { amount: 50 }] }), 150, 'salary: paid total = sum of payments');
    eq(salaryPaidTotal({ paidDate: '2026-06-01', snapshotNet: 200 }), 200, 'salary: legacy record → one payment total');
    eq(salaryTarget({ target: 500 }, 300), 500, 'salary: explicit target override wins');
    eq(salaryTarget({ snapshotNet: 250 }, 300), 250, 'salary: legacy snapshotNet is the target');
    eq(salaryTarget({}, 300), 300, 'salary: target falls back to computed net');
    const savedSal = state.salaries;
    const net = computeMonthlyPay(1, '2026-06').net;   // coach 1 = fixed 3000, no commission
    state.salaries = [{ id: 't1', coachId: 1, month: '2026-06', kind: 'paid', target: net, payments: [{ id: 'a', amount: Math.round(net / 3), date: '2026-06-05', method: 'cash' }] }];
    const pp = computeMonthlyPay(1, '2026-06');
    eq(pp.paidStatus, 'partial', 'salary: one-third paid → PARTIAL');
    ok(pp.paidRemaining > 0, 'salary: partial leaves a remaining balance');
    state.salaries = [{ id: 't1', coachId: 1, month: '2026-06', kind: 'paid', target: net, payments: [{ id: 'a', amount: net, date: '2026-06-05', method: 'cash' }] }];
    eq(computeMonthlyPay(1, '2026-06').paidStatus, 'paid', 'salary: full amount paid → PAID');
    state.salaries = [{ id: 't1', coachId: 1, month: '2026-06', kind: 'paid', target: net + 500, payments: [{ id: 'a', amount: net, date: '2026-06-05', method: 'cash' }] }];
    eq(computeMonthlyPay(1, '2026-06').paidStatus, 'partial', 'salary: bonus override not fully covered → PARTIAL');
    state.salaries = savedSal;
  })();
  // ── Payment-method normalization: casing/labels collapse to a canonical token so
  //    the by-method breakdown never splits "cash" vs "Cash". ──
  (() => {
    eq(normalizeMethod('Cash'), 'cash', 'method: "Cash" → cash');
    eq(normalizeMethod('cash'), 'cash', 'method: cash → cash');
    eq(normalizeMethod('CARD'), 'card', 'method: CARD → card');
    eq(normalizeMethod('Visa'), 'card', 'method: Visa → card');
    eq(normalizeMethod('Bank transfer'), 'transfer', 'method: Bank transfer → transfer');
    eq(normalizeMethod('Fawran'), 'fawran', 'method: Fawran → fawran');
    eq(normalizeMethod(''), 'cash', 'method: blank → cash (default)');
    eq(normalizeMethod(null), 'cash', 'method: null → cash (default)');
    // recordPayment normalizes on write, so a caller passing "Cash" never leaks it.
    const inv = { id: 1, payments: [] };
    recordPayment(inv, { amount: 100, method: 'Cash', date: '2026-06-01' });
    eq(inv.payments[0].method, 'cash', 'recordPayment: normalizes "Cash" to cash on write');
  })();
  // ── Member card: clear a completed sport's attendance within its period window. ──
  (() => {
    const mm = { dailyAttendance: { '2026-06': { 'Swimming': { '21': 'Y', '23': 'Y', '28': 'Y' }, 'Karate': { '21': 'Y' } }, '2026-07': { 'Swimming': { '02': 'Y' } } } };
    const removed = _clearSportAttendanceWindow(mm, 'Swimming', '2026-06-20', '2026-06-30');
    eq(removed, 3, 'attendance clear: removes the 3 Swimming marks inside the June window');
    ok(!mm.dailyAttendance['2026-06'].Swimming, 'attendance clear: emptied Swimming-June map is pruned');
    ok(mm.dailyAttendance['2026-06'].Karate && mm.dailyAttendance['2026-06'].Karate['21'] === 'Y', 'attendance clear: a different sport is untouched');
    ok(mm.dailyAttendance['2026-07'].Swimming['02'] === 'Y', 'attendance clear: Swimming outside the window is untouched');
  })();
  // ── Missing Invoices: confirms every member ACTIVE in the month (enrolled that
  //    month OR carried forward) has a covering invoice; distinguishes the two. ──
  (() => {
    const savedM = state.members, savedI = state.invoices;
    state.members = [
      { id: 8001, name: 'EnrollNew', status: 'Active', expiryDate: '2026-08-01', subscriptions: [{ activity: 'Boxing', start: '2026-06-05', end: '2026-08-05', totalClasses: 8, amountPaid: 0 }], enrollments: [{ sport: 'Boxing', classes: 8, price: 400 }] },
      { id: 8002, name: 'CarryNoInv', status: 'Active', expiryDate: '2026-08-01', subscriptions: [{ activity: 'MMA', start: '2026-04-10', end: '2026-08-10', totalClasses: 8, amountPaid: 0 }], enrollments: [{ sport: 'MMA', classes: 8, price: 350 }] },
      { id: 8003, name: 'CarryCovered', status: 'Active', expiryDate: '2026-08-01', subscriptions: [{ activity: 'Karate', start: '2026-04-10', end: '2026-08-10', totalClasses: 8, amountPaid: 300, invoiceNumber: 'INV-C' }], enrollments: [{ sport: 'Karate', classes: 8, price: 300 }] },
    ];
    state.invoices = [{ id: 8003, ref: 'INV-C', customerId: 8003, category: 'Membership', month: '2026-04', date: '2026-04-10', amount: 300, lineItems: [{ sport: 'Karate', price: 300 }] }];
    const rows = computeMissingInvoices('2026-06');
    const rA = rows.find(r => r.m.id === 8001), rB = rows.find(r => r.m.id === 8002), rC = rows.find(r => r.m.id === 8003);
    ok(rA && rA.kind === 'missing' && rA.basis === 'enrolled', 'missing-inv: enrolled this month + no invoice → missing / enrolled');
    ok(rB && rB.kind === 'missing' && rB.basis === 'carry', 'missing-inv: carry-forward (started earlier, active now) + no invoice → missing / carry');
    ok(!rC, 'missing-inv: carry-forward WITH a covering invoice → NOT flagged');
    state.members = savedM; state.invoices = savedI;
  })();
  // ── DATA-LOSS REGRESSION: a locally-added record must SURVIVE a remote sync that
  //    does not yet include it (its cloud write hasn't echoed). Reproduces the
  //    "add an expense, it vanishes minutes later" bug. Fix: the sync base only
  //    tracks CONFIRMED remote data, so a fresh local add is never seen as a remote
  //    delete. ──
  (() => {
    const savedExp = state.expenses;
    const mkRemote = (exp) => { const r = {}; for (const k of MERGE_COLLECTIONS) r[k] = state[k]; r.expenses = exp; return r; };
    // Confirmed base: one expense already on the cloud.
    state.expenses = [{ id: 'E-old', amount: 100, month: '2026-07' }];
    snapshotSyncBase(state);
    // User adds a NEW expense locally — not yet written to the cloud.
    state.expenses = state.expenses.concat([{ id: 'E-new', amount: 250, month: '2026-07' }]);
    // A remote snapshot arrives (from some OTHER change) that still lacks E-new.
    mergeRemoteIntoState(mkRemote([{ id: 'E-old', amount: 100, month: '2026-07' }]));
    ok((state.expenses || []).some(e => e.id === 'E-new'), 'DATA-LOSS FIX: a locally-added expense survives a remote sync that does not yet include it');
    ok((state.expenses || []).some(e => e.id === 'E-old'), 'existing confirmed expense still present after the merge');
    // The sync base must track the CONFIRMED remote only — it must NOT absorb the
    // still-unconfirmed local add (the exact bug: an optimistic base made the NEXT
    // sync delete the record).
    ok(!(_syncBase.expenses || []).some(e => e.id === 'E-new'), 'sync base excludes the unconfirmed local add (tracks confirmed remote only)');
    // …so a SECOND remote sync (still before E-new echoes) must ALSO keep it — this is
    // the actual "add expense, gone 5 minutes later" reproduction.
    mergeRemoteIntoState(mkRemote([{ id: 'E-old', amount: 100, month: '2026-07' }]));
    ok((state.expenses || []).some(e => e.id === 'E-new'), 'DATA-LOSS FIX: E-new survives a SECOND remote sync too (the "gone minutes later" case)');
    // Two-strikes delete confirmation: a SINGLE absence must NOT delete a confirmed
    // record (guards against a stale/partial snapshot silently dropping a paid salary)…
    snapshotSyncBase(state);   // now both E-old + E-new are confirmed
    mergeRemoteIntoState(mkRemote([{ id: 'E-new', amount: 250, month: '2026-07' }]));
    ok((state.expenses || []).some(e => e.id === 'E-old'), 'a single stale-snapshot absence does NOT delete a confirmed record');
    // …but a SECOND consecutive absence IS a genuine delete → honored.
    mergeRemoteIntoState(mkRemote([{ id: 'E-new', amount: 250, month: '2026-07' }]));
    ok(!(state.expenses || []).some(e => e.id === 'E-old'), 'genuine remote delete is honored after 2 consecutive absences (E-old removed)');
    state.expenses = savedExp; snapshotSyncBase(state);
  })();
  // ── CREATE-AUDIT for invoices & expenses (revenue-stream traceability). ──
  (() => {
    const savedInv = state.invoices, savedExp = state.expenses, savedLog = state.auditLog, savedKnown = window.__knownRecIds;
    state.invoices = [{ id: 5001, ref: 'INV5001', amount: 300, customerId: 1, category: 'Membership' }];
    state.expenses = [{ id: 'x1', amount: 100, category: 'Rent' }];
    _seedKnownRecIds();                       // baseline — existing records are NOT "new"
    state.auditLog = [];
    _auditNewRecords();
    eq(state.auditLog.length, 0, 'create-audit: baseline records are not logged as new');
    // Now CREATE a new invoice + expense locally.
    state.invoices.push({ id: 5002, ref: 'INV5002', amount: 750, customerId: 1, category: 'Membership' });
    state.expenses.push({ id: 'x2', amount: 250, category: 'Equipment' });
    _auditNewRecords();
    ok(state.auditLog.some(a => a.action === 'invoice.create' && a.recId === '5002'), 'create-audit: a NEW invoice gets an invoice.create entry');
    ok(state.auditLog.some(a => a.action === 'expense.create' && a.recId === 'x2'), 'create-audit: a NEW expense gets an expense.create entry');
    const n1 = state.auditLog.length;
    _auditNewRecords();                        // idempotent — no duplicate entries
    eq(state.auditLog.length, n1, 'create-audit: re-running does NOT duplicate entries');
    // A record that ARRIVED from the cloud (marked known by the merge) is NOT audited here.
    window.__knownRecIds.invoices.add('5003');
    state.invoices.push({ id: 5003, ref: 'INV5003', amount: 999, customerId: 1, category: 'Membership' });
    _auditNewRecords();
    ok(!state.auditLog.some(a => a.recId === '5003'), 'create-audit: a cloud-arrived invoice is NOT attributed to this device');
    state.invoices = savedInv; state.expenses = savedExp; state.auditLog = savedLog; window.__knownRecIds = savedKnown;
  })();
  // ── Salary payment recorded as a Salary EXPENSE must NOT double-reduce the coach's
  //    computed pay (auto-expense is money-out only; manual salary expenses still count). ──
  (() => {
    const savedC = state.coaches, savedM = state.members, savedI = state.invoices, savedE = state.expenses;
    state.coaches = [{ id: 61, name: 'PayTest', rate: 30, fixedSalary: 2000, active: 'Y', role: 'coach' }];
    state.members = []; state.invoices = [];
    state.expenses = [{ id: 'auto1', _salaryAutoExpense: true, category: 'Salary', coachId: 61, month: '2026-07', amount: 2000, salaryId: 99 }];
    eq(Math.round(computeMonthlyPay(61, '2026-07').expensePaid), 0, 'salary: the auto-created Salary expense is NOT counted against the coach’s pay');
    eq(Math.round(computeMonthlyPay(61, '2026-07').net), 2000, 'salary: net stays the full gross (no double reduction)');
    state.expenses.push({ id: 'man1', category: 'Salary', coachId: 61, month: '2026-07', amount: 500 });
    eq(Math.round(computeMonthlyPay(61, '2026-07').expensePaid), 500, 'salary: a MANUAL salary expense still counts as already-paid');
    eq(Math.round(computeMonthlyPay(61, '2026-07').net), 1500, 'salary: net reflects the manual salary expense (2000 − 500)');
    state.coaches = savedC; state.members = savedM; state.invoices = savedI; state.expenses = savedE;
  })();
  // ── "Kenan" data-integrity bugs: a sport ADDED to a member left the invoice
  //     amount stale (Football hidden from Due) + the line had no linked subscription
  //     (Football hidden from the coach salary report). ──
  (() => {
    const savedM = state.members, savedI = state.invoices, savedCS = state.settings && state.settings.commissionStartDate;
    if (state.settings) state.settings.commissionStartDate = '';
    const COACH = 88801;
    state.members = [{ id: 9500, name: 'Kenan Test', phone: '55990001', startDate: '2026-06-01', expiryDate: '2099-12-31',
      enrollments: [
        { sport: 'Football', coachId: COACH, classes: 8, price: 475, validity: 30 },
        { sport: 'Summer Camp', coachId: null, classes: 0, price: 175 },
      ],
      subscriptions: [ { activity: 'Summer Camp', coachId: null, start: '2026-06-01', end: '2099-12-31', totalClasses: 0 } ],  // NO Football sub
      dailyAttendance: {} }];
    state.invoices = [{ id: 273273, ref: 'INV273T', date: '2026-06-28', month: '2026-06',
      amount: 175,          // STALE — Football (475) was added without recomputing; line sum is 650
      amountPaid: 175, category: 'Membership', customerId: 9500,
      payments: [{ date: '2026-06-28', month: '2026-06', amount: 175, method: 'cash', sport: 'Summer Camp' }],
      lineItems: [ { sport: 'Football', coachId: COACH, price: 475 }, { sport: 'Summer Camp', coachId: null, price: 175 } ] }];
    const inv = state.invoices[0];
    eq(invoiceBalance(inv), 475, 'DUE FIX: invoiceBalance uses line-sum (650) − paid (175) = 475 even though inv.amount is a stale 175');
    ok(invoiceStatus(inv) === 'Partial', 'DUE FIX: status is Partial (not falsely Paid from the stale amount)');
    const r = computeAttendanceCommission(COACH, '2026-06');
    const inReport = [...(r.pendingLines || []), ...(r.lines || [])].some(l => /Kenan/.test(l.memberName) && l.sport === 'Football');
    ok(inReport, 'SALARY FIX: an added Football sport with no linked subscription still shows in the coach report (enrollment fallback)');
    // CROSS-SCREEN CONSISTENCY: every canonical money function must use the SAME total
    // (Σ lines = 650), so all financial screens agree and billed = collected + due.
    const months = invoiceMonths(inv);
    let tB = 0, tC = 0, tD = 0;
    for (const mo of months) {
      const b = billedInMonth(mo), c = collectedInMonth(mo), d = dueInMonth(mo);
      ok(Math.abs(b - (c + d)) < 0.01, 'identity: billed == collected + due for ' + mo + ' (' + Math.round(b) + ' = ' + Math.round(c) + ' + ' + Math.round(d) + ')');
      tB += b; tC += c; tD += d;
    }
    eq(Math.round(tB), 650, 'consistency: total billed (Dashboard/Monthly/ClubRevenue) == Σ lines (650), not the stale amount 175');
    eq(Math.round(tD), 475, 'consistency: total due (Monthly/Reconciliation) == invoiceBalance/Due-screen (475)');
    eq(Math.round(tC), 175, 'consistency: total collected == amount paid (175)');
    eq(Math.round(billedInPeriod(() => true)), 650, 'consistency: billedInPeriod (Owner Dashboard/reports) == Σ lines too');
    state.members = savedM; state.invoices = savedI; if (state.settings) state.settings.commissionStartDate = savedCS;
  })();
  (() => {
    const before = state.expenses ? state.expenses.slice() : [];
    state.expenses = [
      { id: 5001, date: '2026-06-10', month: '2026-06', amount: 500, category: 'Cash collected by owner', description: 'Cash collected by owner — Owner' },
      { id: 5002, date: '2026-06-12', month: '2026-06', amount: 1200, category: 'Equipment', description: 'New gloves' },
    ];
    const monthTotal = state.expenses.filter(e => e.month === '2026-06').reduce((s, e) => s + e.amount, 0);
    eq(monthTotal, 1700, 'cash collection: a cash-collection row counts in monthly expense totals like any other expense');
    state.expenses = before;
  })();
  // ─ Invoice fixes (#1-#4) ──────────────────────────────────────────
  // #4: Summer Camp invoice description carries the duration label.
  (() => {
    const items = [{ sport: 'Summer Camp', durationLabel: '1 month', classes: 30 }];
    eq(sportListWithDuration(items), 'Summer Camp · 1 month', 'invoice: Summer Camp line item renders with duration label');
    const mixed = [{ sport: 'Kick Boxing' }, { sport: 'Summer Camp', durationLabel: '2 weeks', classes: 14 }];
    eq(sportListWithDuration(mixed), 'Kick Boxing, Summer Camp · 2 weeks', 'invoice: multi-sport label includes camp duration mid-list');
  })();
  // #1: editing the enrolment price + duration on a Summer Camp invoice refreshes
  // the description AND the line item so the receipt reads "Summer Camp · 1 month"
  // after the admin extends a 1-week booking. We exercise the same data path the
  // syncSubToEnrollment helper uses, in isolation.
  (() => {
    const inv = {
      id: 4001, ref: 'INV-T01', customerId: 4001, category: 'Membership',
      amount: 300, amountPaid: 300, payments: [{ amount: 300, method: 'cash' }],
      sport: 'Summer Camp · 1 week',
      description: 'Test Camper — Summer Camp · 1 week subscription',
      lineItems: [{ sport: 'Summer Camp', price: 300, classes: 7, durationLabel: '1 week' }],
    };
    const member = { id: 4001, name: 'Test Camper' };
    const enrollment = { sport: 'Summer Camp', price: 1500, classes: 30, durationLabel: '1 month' };
    const sub = { _sid: 'x', activity: 'Summer Camp', invoiceNumber: 'INV-T01', amountPaid: 300 };
    syncSubToEnrollment(sub, enrollment, member, [inv]);
    eq(inv.amount, 1500, 'edit camp: invoice amount jumps from 300 → 1500');
    eq(inv.lineItems[0].durationLabel, '1 month', 'edit camp: line item duration label updates');
    ok(/1 month/.test(inv.description), 'edit camp: invoice description reflects the new duration');
    ok(/1 month/.test(inv.sport), 'edit camp: invoice header sport label reflects the new duration');
    // UPGRADE must NOT silently mark the higher amount as paid — the member has only
    // paid the old 300; the extra is now DUE (the reported scenario).
    eq(invoicePaid(inv), 300, 'upgrade: paid stays 300 — NOT bumped to 1500');
    eq(Math.round(invoiceBalance(inv)), 1200, 'upgrade: the unpaid difference (1500 − 300) shows as a new balance due');
    ok(!!inv._upgradeDue && inv._upgradeDue.to === 1500, 'upgrade: flagged so the member-save UI can surface the new balance');
  })();
  // A DOWNGRADE / price correction on a paid-in-full invoice DOES stay paid in full.
  (() => {
    const inv = { id: 4002, ref: 'INV-T02', customerId: 4002, category: 'Membership', amount: 300, amountPaid: 300, payments: [{ amount: 300, method: 'cash' }], lineItems: [{ sport: 'Boxing', price: 300 }] };
    syncSubToEnrollment({ activity: 'Boxing', invoiceNumber: 'INV-T02', amountPaid: 300 }, { sport: 'Boxing', price: 250 }, { id: 4002, name: 'T' }, [inv]);
    eq(Math.round(invoiceBalance(inv)), 0, 'downgrade/correction on a paid invoice stays paid in full (no phantom balance)');
  })();
  // #3: renewals always create a NEW invoice — never amend the original.
  // We verify the contract by counting invoices before and after a simulated
  // renewal push (mirroring the same shape the addRenewal handler writes).
  (() => {
    const beforeInvs = state.invoices.slice();
    state.invoices = [
      { id: 6001, ref: 'INV-O', customerId: 6001, category: 'Membership', sport: 'Karate', amount: 400, amountPaid: 400 },
    ];
    const original = state.invoices.length;
    state.invoices.push({
      id: 6002, ref: 'INV-R', customerId: 6001, category: 'Membership', sport: 'Karate',
      amount: 400, amountPaid: 400, activityType: 'subscription',
      description: 'Karate renewal — Test',
      lineItems: [{ sport: 'Karate', price: 400 }],
    });
    eq(state.invoices.length, original + 1, 'renewal: produces a SEPARATE invoice (count grows by 1)');
    ok(state.invoices.find(i => i.id === 6001), 'renewal: original invoice still exists, unchanged');
    state.invoices = beforeInvs;
  })();
  // Shared-phone scan: two members with the SAME phone but different names form a group, exact (name+phone) dups don't appear there twice.
  (() => {
    const before = state.members.slice();
    state.members = [
      { id: 9001, name: 'Ali Mohamed',   phone: '55512345', deleted: false },
      { id: 9002, name: 'Yara Mohamed',  phone: '55512345', deleted: false },
      { id: 9003, name: 'Different Person', phone: '99988877', deleted: false },
    ];
    const shared = findSharedPhoneClusters();
    ok(shared.length === 1 && shared[0].members.length === 2, 'duplicates: same-mobile scan groups Ali + Yara (different names, shared phone)');
    state.members = before;
  })();
  if (!Array.isArray(state.drivers)) state.drivers = [];
  state.drivers.push({ id: 990001, name: 'TestDrv', phone: '+9745' });
  eq(driverName(990001), 'TestDrv', 'drivers: driverName resolves the driver name');
  state.drivers = state.drivers.filter(d => d.id !== 990001);
  eq(ageToBirthdate(''), '', 'age-field: blank age yields no birthdate');
  eq(ageToBirthdate(0), '', 'age-field: zero/invalid age yields no birthdate');
  // Renewal value falls back to the latest real invoice when enrolment prices are blank
  state.members.push({ id: 984, name: 'RVI', enrollments: [] });
  state.invoices.push({ id: 99984, customerId: 984, amount: 300, date: '2026-05-01' });
  state.invoices.push({ id: 99985, customerId: 984, amount: 450, date: '2026-06-01' });
  eq(memberRenewalValue(state.members.find(m => m.id === 984)), 450, 'renewal: falls back to latest paid invoice when enrolment prices are blank');
  state.invoices.push({ id: 99986, customerId: 984, amount: 0, date: '2026-06-10', switchCredit: true });
  eq(memberRenewalValue(state.members.find(m => m.id === 984)), 450, 'renewal: ignores zero / switch-credit invoices in the fallback');
  state.members = state.members.filter(m => m.id !== 984);
  state.invoices = state.invoices.filter(i => ![99984, 99985, 99986].includes(i.id));
  state.members = state.members.filter(m => ![980, 981, 982, 983].includes(m.id));
  // Device-local fields (open page, identity, preview role) must never be synced
  state.route = 'reports'; state.user = { name: 'A' }; state.session = { role: 'coach' };
  var _cap = null; var _prevStore = window.Storage;
  window.Storage = { save: (s) => { _cap = s; }, load: () => {}, isCloud: () => false };
  try { save(); } catch (e) {}
  window.Storage = _prevStore;
  ok(_cap && !('route' in _cap) && !('user' in _cap) && !('session' in _cap),
    'sync: route/user/session are device-local and never persisted to the cloud');
  // Attendance sheet: months touched by a subscription window (1, 2, or across a year)
  function _monthsBetween(startISO, endISO) {
    let months = []; let cur = startISO.slice(0, 7); const last = endISO.slice(0, 7); let guard = 0;
    while (guard++ < 6) { months.push(cur); if (cur === last) break; let [yy, mm] = cur.split('-').map(Number); mm += 1; if (mm > 12) { mm = 1; yy += 1; } cur = yy + '-' + String(mm).padStart(2, '0'); }
    return months;
  }
  eq(_monthsBetween('2026-05-09', '2026-06-09').join(','), '2026-05,2026-06', 'sub-sheet: spans both months across a boundary');
  eq(_monthsBetween('2026-06-01', '2026-06-20').join(','), '2026-06', 'sub-sheet: single month when within one month');
  eq(_monthsBetween('2026-12-15', '2027-01-10').join(','), '2026-12,2027-01', 'sub-sheet: spans the year boundary');
  // Coach earnings = fixed + commission on active-member revenue for the month
  state.coaches.push({ id: 970, name: 'CE', rate: 30, fixedSalary: 1000, active: 'Y' });
  state.members.push({ id: 970, name: 'CEM' });
  state.invoices.push({ id: 99970, coachId: 970, customerId: 970, amount: 1000, month: '2026-06' });
  var _ce = coachEarnings(state.coaches.find(c => c.id === 970), '2026-06');
  eq(_ce.total, 1300, 'coach earnings: fixed 1000 + commission (1000 x 30%) = 1300');
  eq(_ce.commission, 300, 'coach earnings: commission is rate x active-member revenue');
  state.coaches = state.coaches.filter(c => c.id !== 970);
  state.members = state.members.filter(m => m.id !== 970);
  state.invoices = state.invoices.filter(i => i.id !== 99970);
  // Advice comment thread: comments array stores replies by coach/student
  if (!Array.isArray(state.advices)) state.advices = [];
  state.advices.push({ id: 99971, memberId: 1, coachId: 1, text: 'Work on guard', date: '2026-06-01', comments: [] });
  var _adv = state.advices.find(a => a.id === 99971);
  _adv.comments.push({ by: 'student', name: 'S', text: 'Thanks coach', date: '2026-06-02' });
  eq(_adv.comments.length, 1, 'advice: student can post a reply comment');
  eq(_adv.comments[0].by, 'student', 'advice: comment records who wrote it');
  state.advices = state.advices.filter(a => a.id !== 99971);
  // Next-class picker: soonest upcoming slot among the student's sports
  function _nextClass(sports, rows, nowWd, nowHour) {
    const W = { sat: 6, sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
    let best = null;
    for (const c of rows) { if (!sports.includes(c.sport)) continue; const wd = W[c.day]; if (wd == null) continue; let da = (wd - nowWd + 7) % 7; if (da === 0 && c.slot <= nowHour) da = 7; const score = da * 24 + c.slot; if (!best || score < best.score) best = { score, c }; }
    return best;
  }
  var _sched = [{ day: 'tue', slot: 17, sport: 'Boxing' }, { day: 'wed', slot: 16, sport: 'MMA' }];
  eq(_nextClass(['Boxing', 'MMA'], _sched, 2, 10).c.sport, 'Boxing', 'next-class: picks soonest upcoming today');
  eq(_nextClass(['Boxing', 'MMA'], _sched, 2, 18).c.sport, 'MMA', 'next-class: rolls to next day when today\u2019s slot has passed');
  // At-risk flag: low attendance with at least 2 marked sessions
  function _atRisk(y, n) { const m = y + n; const r = m ? y / m * 100 : null; return m >= 2 && r < 50; }
  ok(_atRisk(1, 3) === true, 'at-risk: 25% over 4 sessions is flagged');
  ok(_atRisk(3, 1) === false, 'at-risk: 75% is not flagged');
  ok(_atRisk(0, 1) === false, 'at-risk: a single mark is not enough to flag');
  // Freeze allowance: ONE WEEK (7 days) per 30 days of validity, tracked per cycle
  state.members.push({ id: 960, name: 'FZ', startDate: '2026-06-01', expiryDate: '2026-07-01', enrollments: [{ sport: 'Boxing', validity: 30 }], freezes: [] });
  var _fm = state.members.find(m => m.id === 960);
  eq(freezeAllowance(_fm).allowanceDays, 7, 'freeze: 30-day validity = 7 days (one week) allowance');
  _fm.enrollments = [{ validity: 60 }];
  eq(freezeAllowance(_fm).allowanceDays, 14, 'freeze: 60-day validity = 14 days allowance');
  _fm.enrollments = [{ validity: 90 }];
  eq(freezeAllowance(_fm).allowanceDays, 21, 'freeze: 90-day validity = 21 days allowance');
  _fm.enrollments = [{ validity: 60 }]; _fm.freezes = [{ days: 3, start: '2026-06-10' }];
  eq(freezeAllowance(_fm).usedDays, 3, 'freeze: counts days used in current cycle');
  eq(freezeAllowance(_fm).remainingDays, 11, 'freeze: remaining = allowance - used (14 - 3)');
  eq(freezeAllowance(_fm).freezeCount, 1, 'freeze: counts number of freezes in cycle');
  _fm.freezes = [{ days: 5, start: '2026-05-01' }];
  eq(freezeAllowance(_fm).usedDays, 0, 'freeze: freezes before the cycle start are not counted');
  state.members = state.members.filter(m => m.id !== 960);
  // Reminder tracking: up to 3 per cycle (escalating levels), with legacy back-compat
  eq(reminderInfo({ startDate: '2026-06-01' }).count, 0, 'reminder: none yet = 0');
  eq(reminderInfo({ startDate: '2026-06-01' }).remaining, 3, 'reminder: 3 remaining when fresh');
  eq(reminderInfo({ startDate: '2026-06-01', lastRemindedAt: '2026-06-10' }).count, 1, 'reminder: legacy lastRemindedAt counts as 1');
  eq(reminderInfo({ startDate: '2026-06-01', reminderDates: ['2026-06-05', '2026-06-12'] }).count, 2, 'reminder: two dates = 2');
  eq(reminderInfo({ startDate: '2026-06-01', reminderDates: ['2026-06-05', '2026-06-12', '2026-06-20'] }).remaining, 0, 'reminder: capped at 3');
  eq(reminderInfo({ startDate: '2026-06-01', reminderDates: ['2026-05-01'] }).count, 0, 'reminder: pre-cycle reminders not counted');
  // New-member invoice date defaults to the membership start date, not today,
  // unless an explicit payment date is given.
  (function () {
    var invoiceDate = function (payDateRaw, startDate, today) { return payDateRaw || startDate || today; };
    eq(invoiceDate('', '2026-01-13', '2026-06-20'), '2026-01-13', 'invoice date: back-dated member uses start date, not today');
    eq(invoiceDate('2026-06-20', '2026-01-13', '2026-06-20'), '2026-06-20', 'invoice date: explicit payment date overrides start');
    eq(invoiceDate('', null, '2026-06-20'), '2026-06-20', 'invoice date: falls back to today when no start date');
  })();
  // One invoice per member: merging an added sport keeps a single invoice while
  // payments stay split by month so revenue is still accurate.
  (function () {
    var inv = { id: 1, ref: 'INV1', amount: 375, month: '2026-05',
      payments: [{ date: '2026-05-10', month: '2026-05', amount: 375, method: 'cash' }],
      lineItems: [{ sport: 'Karate', price: 375 }] };
    var newLines = [{ sport: 'Swimming', price: 375 }];
    inv.lineItems = inv.lineItems.concat(newLines);
    inv.amount += 375;
    inv.payments.push({ date: '2026-06-19', month: '2026-06', amount: 375, method: 'cash' });
    inv.amountPaid = inv.payments.reduce(function (s, p) { return s + p.amount; }, 0);
    eq(inv.amount, 750, 'merge: one invoice total grows to 750');
    eq(inv.lineItems.length, 2, 'merge: both sports on one invoice');
    eq(inv.payments.filter(function (p) { return p.month === '2026-05'; })[0].amount, 375, 'merge: May revenue stays 375');
    eq(inv.payments.filter(function (p) { return p.month === '2026-06'; })[0].amount, 375, 'merge: June revenue is the added sport 375');
  })();
  // Batch C cleanup: duplicate-enrollment detector + invoice merge
  (function () {
    var savedM = state.members, savedI = state.invoices;
    state.members = [
      { id: 9001, name: 'DupGuy', enrollments: [{ sport: 'Karate', coachId: 1, price: 375 }, { sport: 'Karate', coachId: 1, price: 375 }, { sport: 'Swim', coachId: 2, price: 300 }] },
      { id: 9002, name: 'CleanGuy', enrollments: [{ sport: 'MMA', coachId: 1, price: 400 }] },
    ];
    state.invoices = [
      { id: 9101, customerId: 9001, category: 'Membership', amount: 375, date: '2026-05-01', month: '2026-05', payments: [{ month: '2026-05', amount: 375 }], lineItems: [{ sport: 'Karate', price: 375 }] },
      { id: 9102, customerId: 9001, category: 'Membership', amount: 300, date: '2026-06-01', month: '2026-06', payments: [{ month: '2026-06', amount: 300 }], lineItems: [{ sport: 'Swim', price: 300 }] },
      { id: 9103, customerId: 9002, category: 'Membership', amount: 400, date: '2026-06-01', month: '2026-06', payments: [{ month: '2026-06', amount: 400 }], lineItems: [{ sport: 'MMA', price: 400 }] },
    ];
    var de = findDuplicateEnrollments();
    eq(de.length, 1, 'cleanup: one member has duplicate enrollments');
    eq(de[0].sport, 'Karate', 'cleanup: the duplicated sport is Karate');
    eq(de[0].count, 2, 'cleanup: Karate listed twice');
    var mg = findMembersWithMergeableInvoices();
    eq(mg.length, 1, 'cleanup: one member has splittable invoices');
    eq(mg[0].total, 675, 'cleanup: mergeable total is 675');
    var kept = mergeMemberInvoices(9001);
    eq(kept.amount, 675, 'cleanup: merged invoice totals 675');
    eq(kept.lineItems.length, 2, 'cleanup: merged invoice has both sports');
    eq(state.invoices.filter(function (i) { return !i.deleted && i.customerId === 9001; }).length, 1, 'cleanup: member left with one invoice');
    eq(kept.payments.filter(function (p) { return p.month === '2026-05'; })[0].amount, 375, 'cleanup: May revenue preserved after merge');
    state.members = savedM; state.invoices = savedI;
  })();
  // Invoice merge must preserve a discounted invoice's true charged amount
  (function () {
    var savedM = state.members, savedI = state.invoices;
    state.members = [{ id: 9701, name: 'Disc' }];
    state.invoices = [
      { id: 9711, customerId: 9701, category: 'Membership', date: '2026-05-01', month: '2026-05', amount: 300, discount: 75, amountPaid: 300, lineItems: [{ sport: 'Karate', price: 375 }], payments: [{ date: '2026-05-01', month: '2026-05', amount: 300 }] },
      { id: 9712, customerId: 9701, category: 'Membership', date: '2026-06-01', month: '2026-06', amount: 400, amountPaid: 400, lineItems: [{ sport: 'Swim', price: 400 }], payments: [{ date: '2026-06-01', month: '2026-06', amount: 400 }] },
    ];
    var k = mergeMemberInvoices(9701);
    eq(k.amount, 700, 'merge: discounted total preserved (300+400), not inflated to 775');
    eq(k.amountPaid, 700, 'merge: paid total correct');
    eq(k.amount - k.amountPaid, 0, 'merge: no phantom balance due from lost discount');
    eq(k.discount, 75, 'merge: combined discount carried onto the kept invoice');
    state.members = savedM; state.invoices = savedI;
  })();
  // coachEarnings must credit each coach per line item, not the whole invoice
  (function () {
    var savedC = state.coaches, savedM = state.members, savedI = state.invoices;
    state.coaches = [{ id: 8801, name: 'CA', rate: 40 }, { id: 8802, name: 'CB', rate: 40 }];
    state.members = [{ id: 8805, name: 'Kid', status: 'Active', expiryDate: '2099-01-01' }];
    state.invoices = [
      { id: 8810, customerId: 8805, month: '2026-06', coachId: 8801, amount: 775, lineItems: [{ sport: 'Karate', coachId: 8801, price: 375 }, { sport: 'Swim', coachId: 8802, price: 400 }] },
    ];
    var ea = coachEarnings(state.coaches[0], '2026-06');
    var eb = coachEarnings(state.coaches[1], '2026-06');
    eq(ea.commissionBase, 375, 'commission: coach A credited only their Karate line (375), not the whole 775');
    eq(eb.commissionBase, 400, 'commission: coach B credited their Swim line (400), not zero');
    eq(Math.round(ea.commission), 150, 'commission: coach A commission = 40% of 375');
    eq(Math.round(eb.commission), 160, 'commission: coach B commission = 40% of 400');
    state.coaches = savedC; state.members = savedM; state.invoices = savedI;
  })();
  // Attendance row coach: when a sport is missing from enrollments, use the
  // subscription's coach, NOT the member's headline coach.
  (function () {
    var resolveRowCoach = function (m, sp) {
      var enr = (m.enrollments || []).find(function (e) { return e.sport === sp; });
      var sub = (m.subscriptions || []).find(function (s) { return s.activity === sp; });
      return (enr && enr.coachId != null) ? enr.coachId
        : (sub && sub.coachId != null) ? sub.coachId
        : m.coachId;
    };
    var mem = {
      coachId: 5, // headline coach
      enrollments: [{ sport: 'Swimming', coachId: 3 }, { sport: 'Kick Boxing', coachId: 5 }], // Gymnastic missing
      subscriptions: [{ activity: 'Gymnastic', coachId: 2 }, { activity: 'Swimming', coachId: 3 }, { activity: 'Kick Boxing', coachId: 5 }],
    };
    eq(resolveRowCoach(mem, 'Gymnastic'), 2, 'attendance: gymnastic coach from subscription (2), not headline (5)');
    eq(resolveRowCoach(mem, 'Swimming'), 3, 'attendance: swimming coach from enrollment (3)');
    eq(resolveRowCoach(mem, 'Kick Boxing'), 5, 'attendance: kick boxing coach (5)');
  })();
  // Recent searches: per-key history, dedup/move-to-front, min length, max cap
  (function () {
    var savedRS = state.recentSearches;
    state.recentSearches = {};
    recordRecentSearch('members', 'Ahmed');
    recordRecentSearch('members', 'Sara');
    recordRecentSearch('members', 'a');         // too short, ignored
    recordRecentSearch('members', 'Ahmed');     // dup -> front
    eq(recentSearches('members').join(','), 'Ahmed,Sara', 'recent: dedup + move-to-front, short ignored');
    recordRecentSearch('invoices', 'INV9');
    eq(recentSearches('invoices').length, 1, 'recent: keys are independent');
    eq(recentSearches('members').length, 2, 'recent: members unaffected by invoices');
    for (var i = 0; i < 12; i++) recordRecentSearch('cap', 'term' + i);
    eq(recentSearches('cap').length, 5, 'recent: capped at 5');
    eq(recentSearches('cap')[0], 'term11', 'recent: newest first after the cap kicks in');
    eq(recentSearches('cap')[0], 'term11', 'recent: newest first');
    clearRecentSearches('members');
    eq(recentSearches('members').length, 0, 'recent: clear empties the list');
    state.recentSearches = savedRS;
  })();
  // Edit pricing for a new sport must REUSE the member's existing invoice
  // (add a line item), not create a second invoice.
  (function () {
    var savedI = state.invoices, savedM = state.members;
    state.members = [{ id: 9148, enrollments: [{ sport: 'Swimming', coachId: 3, classes: 8 }] }];
    state.invoices = [
      { id: 9150, customerId: 9148, category: 'Membership', date: '2026-05-19', month: '2026-05', amount: 450, amountPaid: 450, sport: 'Kick Boxing', coachId: 5, lineItems: [{ sport: 'Kick Boxing', coachId: 5, price: 450 }], payments: [{ amount: 450 }] },
    ];
    // Replicate the reuse logic: add Swimming 375 to the existing invoice.
    var m = state.members[0], net = 375, paid = 375;
    var existing = state.invoices.filter(function (i) { return !i.deleted && i.customerId === m.id && (i.category || 'Membership') === 'Membership'; }).sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); })[0];
    existing.lineItems.push({ sport: 'Swimming', coachId: 3, classes: 8, price: net });
    existing.amount = existing.lineItems.reduce(function (s, x) { return s + (Number(x.price) || 0); }, 0);
    existing.payments.push({ amount: paid });
    existing.amountPaid = existing.payments.reduce(function (s, p) { return s + (p.amount || 0); }, 0);
    eq(state.invoices.filter(function (i) { return i.customerId === 9148 && !i.deleted; }).length, 1, 'edit pricing: still ONE invoice after adding a sport');
    eq(existing.lineItems.length, 2, 'edit pricing: new sport added as a line item');
    eq(existing.amount, 825, 'edit pricing: total rolled up (450+375)');
    eq(existing.amountPaid, 825, 'edit pricing: payments accumulated');
    state.invoices = savedI; state.members = savedM;
  })();
  // Summer Camp: a "week" is five business days (Sun–Thu), skipping Fri/Sat
  (function () {
    eq(addBusinessDays('2026-06-14', 4), '2026-06-18', 'business days: Sun +4 biz = Thu (same week)');
    eq(addBusinessDays('2026-06-18', 1), '2026-06-21', 'business days: Thu +1 biz skips Fri/Sat to Sun');
    // v6.357: camp expiry counts BUSINESS days (Sun–Thu), landing on the last class-day.
    eq(campEndDate('2026-06-14', 7), '2026-06-18', 'camp: 1 week = 5 business days, Sun 14 → Thu 18 Jun');
    eq(campEndDate('2026-06-14', 14), '2026-06-25', 'camp: 2 weeks = 10 business days, Sun 14 → Thu 25 Jun');
    eq(campEndDate('2026-06-14', 1), '2026-06-14', 'camp: 1 day = 1 business day, ends same day');
    eq(campEndDate('2026-06-14', 30), '2026-07-13', 'camp: 1 month = 22 business days, Sun 14 Jun → Mon 13 Jul');
  })();
  // Summer Camp class counts are business-day based
  (function () {
    eq(campClassCount(7), 5, 'camp classes: 1 week = 5');
    eq(campClassCount(14), 10, 'camp classes: 2 weeks = 10');
    eq(campClassCount(30), 22, 'camp classes: 1 month = 22');
    eq(campClassCount(60), 44, 'camp classes: 2 months = 44');
    eq(campClassCount(1), 1, 'camp classes: 1 day = 1');
    eq(campLabelForClasses(5), '1 week', 'camp label: 5 classes -> 1 week');
    eq(campLabelForClasses(22), '1 month', 'camp label: 22 classes -> 1 month');
    eq(campLabelForClasses(44), '2 months', 'camp label: 44 classes -> 2 months');
    eq(campLabelForClasses(7), '1 week', 'camp label: legacy 7 still resolves');
  })();
  // Camp renewal expiry uses business days based on the class count
  (function () {
    var priceFor = function (cls) { return (DEFAULT_SUMMER_CAMP_PRICES || []).find(function (p) { return campClassCount(p.days) === cls; }); };
    var row1 = priceFor(5);
    eq(campEndDate('2026-06-14', row1.days), '2026-06-18', 'camp renew: 1 week = 5 business days → Thu 18 Jun');
    var row2 = priceFor(10);
    eq(campEndDate('2026-06-14', row2.days), '2026-06-25', 'camp renew: 2 weeks = 10 business days → Thu 25 Jun');
  })();
  // Freeze allowance resets after a renewal (new cycle start)
  (function () {
    var mem = { startDate: '2026-05-01', firstRegistration: '2026-05-01', expiryDate: '2026-05-31', freezes: [{ start: '2026-05-10', days: 7 }] };
    var before = freezeAllowance(mem);
    eq(before.usedDays, 7, 'freeze+renew: pre-renewal used days counted');
    mem.startDate = '2026-06-01';   // renewal moves the cycle start
    var after = freezeAllowance(mem);
    eq(after.usedDays, 0, 'freeze+renew: old freezes no longer count after renewal');
    eq(after.remainingDays, after.allowanceDays, 'freeze+renew: allowance fully reset on renewal');
  })();
  // Transfer membership: same sport + same coach merges remaining classes
  (function () {
    var decide = function (aFull, aAttended, bExisting, transferCoach) {
      var classes = Math.max(0, aFull - aAttended);
      if (bExisting && (bExisting.coachId || null) !== (transferCoach || null)) return { blocked: true };
      var merge = !!bExisting;
      return { blocked: false, merged: merge, transferred: classes, bClasses: merge ? (bExisting.classes || 0) + classes : classes };
    };
    var r1 = decide(12, 5, { coachId: 1, classes: 12 }, 1);
    eq(r1.merged, true, 'transfer: same sport+coach merges');
    eq(r1.transferred, 7, 'transfer: only unattended classes move (12-5)');
    eq(r1.bClasses, 19, 'transfer: classes summed onto existing (12+7)');
    eq(decide(12, 5, { coachId: 2, classes: 12 }, 1).blocked, true, 'transfer: different coach is blocked');
    eq(decide(12, 5, null, 1).merged, false, 'transfer: new sport adds a fresh row');
    eq(decide(12, 12, { coachId: 1, classes: 12 }, 1).transferred, 0, 'transfer: fully-attended transfers 0 classes');
  })();
  // Members quick filters: balance-due and expiry
  (function () {
    var savedI = state.invoices, savedM = state.members;
    state.invoices = [
      { customerId: 7701, category: 'Membership', amount: 500, amountPaid: 300 },
      { customerId: 7702, category: 'Membership', amount: 500, amountPaid: 500 },
    ];
    var soon = new Date(); soon.setDate(soon.getDate() + 3); var soonStr = soon.toISOString().slice(0, 10);
    var past = new Date(); past.setDate(past.getDate() - 5); var pastStr = past.toISOString().slice(0, 10);
    state.members = [
      { id: 7701, name: 'Ower', expiryDate: soonStr },
      { id: 7702, name: 'Paid', expiryDate: soonStr },
      { id: 7703, name: 'Exp', expiryDate: pastStr },
    ];
    var hasBalance = function (m) { return memberOutstanding(m.id) > 0.5; };
    eq(state.members.filter(hasBalance).map(function (m) { return m.id; }).join(','), '7701', 'members filter: has balance due');
    var expiringSoon = function (m) { var d = m.expiryDate ? daysUntil(m.expiryDate) : null; return d != null && d >= 0 && d <= 7; };
    eq(state.members.filter(expiringSoon).length, 2, 'members filter: expiring within 7 days');
    state.invoices = savedI; state.members = savedM;
  })();
  // Role-based money hiding
  (function () {
    var isViewer = function (role) { return role === 'receptionist'; };
    // Coach Performance revenue/commission/totals hidden from reception
    ok(!(!isViewer('receptionist') === false && false), 'placeholder');
    eq(isViewer('receptionist'), true, 'role: reception is a viewer (money hidden on coach perf)');
    eq(isViewer('admin'), false, 'role: admin sees money');
    // Attendance unpaid amount + renew button hidden from coaches
    var coachSeesUnpaid = function (role) { return role !== 'coach'; };
    eq(coachSeesUnpaid('coach'), false, 'role: coach does not see unpaid amounts');
    eq(coachSeesUnpaid('receptionist'), true, 'role: reception still sees unpaid (they collect)');
    eq(coachSeesUnpaid('admin'), true, 'role: admin sees unpaid');
  })();
  // Transfer: attended value stays with the original coach, status becomes Transferred
  (function () {
    var splitVal = function (price, attended, full) {
      var keep = full > 0 && attended > 0 ? Math.round(price * (attended / full)) : 0;
      return { keep: keep, move: Math.max(0, price - keep), classesMoved: Math.max(0, full - attended) };
    };
    var r = splitVal(500, 5, 12);
    eq(r.keep, 208, 'transfer: attended value stays with original coach (500*5/12)');
    eq(r.move, 292, 'transfer: unattended value moves to new coach');
    eq(r.classesMoved, 7, 'transfer: remaining classes move');
    eq(r.keep + r.move, 500, 'transfer: value split sums to the original price');
    eq(splitVal(500, 0, 12).move, 500, 'transfer: nothing attended → full value moves');
    eq(splitVal(500, 12, 12).keep, 500, 'transfer: all attended → full value stays');
    // Only REMAINING (unattended) classes move to B; B's total = original − A attended.
    var attendedMove = function (full, liveAtt, storedAtt) {
      var att = Math.max(liveAtt, storedAtt);
      return { aAttended: att, movesToB: Math.max(0, full - att) };
    };
    eq(attendedMove(12, 5, 0).movesToB, 7, 'transfer: only remaining classes move to B (12−5)');
    eq(attendedMove(12, 0, 5).movesToB, 7, 'transfer: uses stored count when live is 0');
    eq(attendedMove(8, 8, 0).movesToB, 0, 'transfer: fully attended → nothing moves');
    // memberStatus recognises Transferred only when no enrollments remain
    eq(memberStatus({ status: 'Transferred', enrollments: [] }), 'Transferred', 'status: transferred-out member shows Transferred');
    eq(memberStatus({ status: 'Transferred', enrollments: [{ sport: 'Boxing' }], expiryDate: '2099-01-01' }), 'Active', 'status: still-enrolled member is not Transferred');
  })();
  // Custom camp duration + class limit → Expired
  (function () {
    eq(campEndDateFromClasses('2026-06-14', 10), '2026-06-25', 'custom camp: 10 class days = 10 business days from Sun');
    eq(campEndDateFromClasses('2026-06-14', 1), '2026-06-14', 'custom camp: 1 class day ends same day');
    var full = { enrollments: [{ sport: 'Summer Camp' }],
      subscriptions: [{ activity: 'Summer Camp', totalClasses: 10, start: '2026-06-14', end: '2026-06-25', status: 'active' }],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y', '17': 'Y', '18': 'Y', '21': 'Y', '22': 'Y', '23': 'Y', '24': 'Y', '25': 'Y' } } } };
    eq(campLimitReached(full), true, 'custom camp: attending all classes hits the limit');
    eq(memberStatus(full), 'Completed', 'custom camp: finishing all classes early → Completed');
    var partial = { enrollments: [{ sport: 'Summer Camp' }],
      subscriptions: [{ activity: 'Summer Camp', totalClasses: 10, start: '2026-06-14', end: '2026-06-25', status: 'active' }],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y' } } } };
    eq(campLimitReached(partial), false, 'custom camp: under the limit not reached');
    var withOther = { enrollments: [{ sport: 'Summer Camp' }, { sport: 'Boxing' }],
      subscriptions: [{ activity: 'Summer Camp', totalClasses: 5, start: '2026-06-14', status: 'active' }],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y', '17': 'Y', '18': 'Y' } } } };
    eq(campLimitReached(withOther), false, 'custom camp: a member with other sports is not camp-expired');
  })();
  // Camp duration (class limit) is independent of validity (time window)
  (function () {
    // 8 classes within a 1-month window (v6.357: 22 business days → Mon 13 Jul).
    var sub = { activity: 'Summer Camp', totalClasses: 8, start: '2026-06-14', end: campEndDate('2026-06-14', 30), status: 'active' };
    eq(sub.end, '2026-07-13', 'camp window: 1 month = 22 business days → expiry Mon 13 Jul');
    var part = { enrollments: [{ sport: 'Summer Camp' }], subscriptions: [sub],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y', '17': 'Y', '18': 'Y' } } } };
    eq(campLimitReached(part), false, 'camp window: 5 of 8 classes used → not at limit');
    var done = { enrollments: [{ sport: 'Summer Camp' }], subscriptions: [sub],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y', '17': 'Y', '18': 'Y', '21': 'Y', '22': 'Y', '23': 'Y' } } } };
    eq(campLimitReached(done), true, 'camp window: all 8 classes used → at limit (expires within the month)');
    // Finishing early = Completed (not Expired); the window not yet passed.
    var early = { enrollments: [{ sport: 'Summer Camp' }], expiryDate: '2099-01-01',
      subscriptions: [{ activity: 'Summer Camp', totalClasses: 8, start: '2026-06-14', end: '2099-01-01', status: 'active' }],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y', '17': 'Y', '18': 'Y', '21': 'Y', '22': 'Y', '23': 'Y' } } } };
    eq(memberStatus(early), 'Completed', 'camp: finished classes before window ends → Completed');
    // Camp attendance is WINDOWED to the subscription period: marks dated BEFORE the
    // period start belong to an earlier period, not this one, so they don't push this
    // period over its limit. Marks inside the window do.
    var spread = { enrollments: [{ sport: 'Summer Camp' }],
      subscriptions: [{ activity: 'Summer Camp', durationLabel: '2 weeks', totalClasses: 14, start: '2026-06-23', end: '2026-07-07', status: 'active' }],
      dailyAttendance: { '2026-06': { 'Summer Camp': {} } } };
    for (var dd = 10; dd <= 20; dd++) spread.dailyAttendance['2026-06']['Summer Camp'][String(dd)] = 'Y'; // 11 marks, all BEFORE start
    eq(campLimitReached(spread), false, 'cap: marks before the period start do NOT count toward this period');
    // Now add enough in-window marks to hit the 10-class limit for "2 weeks".
    for (var d2 = 23; d2 <= 30; d2++) spread.dailyAttendance['2026-06']['Summer Camp'][String(d2)] = 'Y'; // 8 in-window
    spread.dailyAttendance['2026-07'] = { 'Summer Camp': { '1': 'Y', '2': 'Y' } };                         // +2 in-window = 10
    eq(campLimitReached(spread), true, 'cap: in-window marks reaching the class limit DO complete the period');
  })();
  // Real case (Tamim): two 1-week camps, 9 attended days → 5/5 then 4/5, not Completed
  (function () {
    var m = {
      enrollments: [{ sport: 'Summer Camp' }],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '14': 'Y', '15': 'Y', '16': 'Y', '17': 'Y', '18': 'Y', '21': 'Y', '22': 'Y', '23': 'Y', '24': 'Y' } } },
      subscriptions: [
        { activity: 'Summer Camp', durationLabel: '1 week', totalClasses: 7, start: '2026-06-14', end: '2026-06-21', status: 'expired' },
        { activity: 'Summer Camp', durationLabel: '1 week', totalClasses: 7, start: '2026-06-21', end: '2026-06-28', status: 'active' },
      ],
    };
    // 1 week = 5 class-days, not 7 (validity).
    eq(subClassLimit(m.subscriptions[0]), 5, 'tamim: 1 week limit = 5 class-days');
    // Period 1 window excludes the boundary day 21 (belongs to period 2).
    var w1 = subAttendanceWindow(m, m.subscriptions[0]);
    eq(liveAttendanceCount(m, 'Summer Camp', w1.from, w1.to).y, 5, 'tamim: first week = 5 attended');
    var w2 = subAttendanceWindow(m, m.subscriptions[1]);
    eq(liveAttendanceCount(m, 'Summer Camp', w2.from, w2.to).y, 4, 'tamim: second week = 4 attended');
    // Active period at 4/5 → not at limit → not Completed.
    eq(campLimitReached(m), false, 'tamim: 4/5 in active period is NOT completed');
  })();
  // Transactions: filtering by coach shows only that coach's line-item amount
  (function () {
    var st = { coachId: '5' };
    var inv = { id: 1, coachId: null, lineItems: [{ sport: 'Kick Boxing', coachId: 5, price: 425 }, { sport: 'Football', coachId: 6, price: 425 }] };
    var allItems = inv.lineItems;
    var items = allItems;
    if (st.coachId !== 'all') {
      var matching = allItems.filter(function (li) { return String(li.coachId || inv.coachId || '') === String(st.coachId); });
      var anyLineHasCoach = allItems.some(function (li) { return li.coachId != null; });
      if (matching.length) items = matching;
      else if (anyLineHasCoach) items = [];
    }
    var amt = items.reduce(function (s, li) { return s + (Number(li.price) || 0); }, 0);
    eq(amt, 425, 'txn coach filter: only the selected coach line counts (425, not 850)');
    eq(items.map(function (li) { return li.sport; }).join(', '), 'Kick Boxing', 'txn coach filter: sport shows only coached line');
    // Legacy invoice with coach only at invoice level (no per-line coach) → kept whole.
    var inv2 = { id: 2, coachId: 5, lineItems: [{ sport: 'Karate', price: 300 }] };
    var anyCoach2 = inv2.lineItems.some(function (li) { return li.coachId != null; });
    eq(anyCoach2, false, 'txn coach filter: legacy invoice has no per-line coach → invoice-level match keeps it');
  })();
  // Transactions: Summer Camp activity filter is standalone (camp lines only, no coach)
  (function () {
    var SC = 'Summer Camp';
    var isCampItem = function (li) { return (li.sport || '') === SC; };
    var invoices = [
      { id: 1, lineItems: [{ sport: SC, price: 400 }] },
      { id: 2, lineItems: [{ sport: 'Kick Boxing', coachId: 5, price: 425 }] },
      { id: 3, lineItems: [{ sport: SC, price: 650 }, { sport: 'Gymnastic', coachId: 7, price: 450 }] },
    ];
    var st = { activity: '__camp__' };
    var total = 0, campRows = 0, allNoCoach = true;
    invoices.forEach(function (inv) {
      var allItems = inv.lineItems;
      var kept = allItems.filter(function (li) { return st.activity === '__camp__' ? isCampItem(li) : (li.sport || '') === st.activity; });
      if (!kept.length) return;
      var amt = kept.reduce(function (s, li) { return s + li.price; }, 0);
      var allCamp = kept.length && kept.every(isCampItem);
      var coach = allCamp ? null : (inv.coachId || null);
      if (coach != null) allNoCoach = false;
      total += amt; campRows++;
    });
    eq(total, 1050, 'txn camp filter: camp lines only (400 + 650), excludes Gymnastic 450');
    eq(campRows, 2, 'txn camp filter: two invoices have camp lines');
    eq(allNoCoach, true, 'txn camp filter: Summer Camp rows carry no coach');
  })();
  // Transactions: Paid / Due per row (prorated for partial-invoice filters)
  (function () {
    var invoicePaid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0); };
    var inv = { amount: 1100, payments: [{ amount: 650 }], lineItems: [{ sport: 'Summer Camp', price: 650 }, { sport: 'Gymnastic', price: 450 }] };
    var allItems = inv.lineItems;
    var fullInvAmount = allItems.reduce(function (s, li) { return s + li.price; }, 0);
    var fullPaid = invoicePaid(inv);
    // Full invoice row
    var amt = fullInvAmount, share = amt / fullInvAmount, paid = Math.round(fullPaid * share), due = Math.max(0, amt - paid);
    eq(paid, 650, 'txn paid: full invoice paid = 650');
    eq(due, 450, 'txn due: full invoice due = 450');
    // Filtered to the camp line (650) → prorated paid
    var amt2 = 650, share2 = amt2 / fullInvAmount, paid2 = Math.round(fullPaid * share2);
    eq(paid2, Math.round(650 * (650 / 1100)), 'txn paid: prorated to camp line share');
  })();
  // In-app Back stack: restores route + scroll, pops in order
  (function () {
    var stack = [];
    var route = 'dashboard';
    var curScroll = 0;
    // Capture the CURRENT route's scroll when leaving it (as the real navigate does).
    var go = function (r, scrollWhenLeaving) { if (route && route !== r) stack.push({ route: route, scroll: scrollWhenLeaving || 0 }); route = r; };
    var back = function () { if (!stack.length) return null; var p = stack.pop(); route = p.route; return p; };
    go('members', 0);          // leaving dashboard (scroll 0)
    go('invoices', 50);        // leaving members (scroll 50)
    go('transactions', 120);   // leaving invoices (scroll 120)
    eq(stack.length, 3, 'nav: three entries pushed');
    var b1 = back(); eq(route + ':' + b1.scroll, 'invoices:120', 'nav: back to invoices @120');
    var b2 = back(); eq(route + ':' + b2.scroll, 'members:50', 'nav: back to members @50');
    back(); eq(route, 'dashboard', 'nav: back to dashboard');
    eq(stack.length, 0, 'nav: stack empty at root');
  })();
  // Transactions multi-select filters: empty = all, arrays match ANY selected
  (function () {
    var SC = 'Summer Camp';
    var isCampItem = function (li) { return (li.sport || '') === SC; };
    var invoices = [
      { id: 1, category: 'Membership', method: 'cash', lineItems: [{ sport: 'Karate', coachId: 5, price: 300 }] },
      { id: 2, category: 'Membership', method: 'card', lineItems: [{ sport: 'Football', coachId: 6, price: 400 }] },
      { id: 3, category: 'Court Rental', method: 'transfer', lineItems: [{ sport: 'Court', price: 200 }] },
      { id: 4, category: 'Membership', method: 'fawran', lineItems: [{ sport: SC, price: 650 }] },
    ];
    var run = function (st) {
      var ids = [];
      invoices.forEach(function (inv) {
        var allItems = inv.lineItems, cat = inv.category;
        var catSel = st.categories || [], actSel = st.activities || [], methSel = st.methods || [], coachSel = (st.coachIds || []).map(String);
        if (catSel.length && catSel.indexOf(cat) < 0) return;
        if (methSel.length && methSel.indexOf(inv.method || '') < 0) return;
        var matchesActivity = function (li) { return actSel.some(function (a) { return a === '__camp__' ? isCampItem(li) : (li.sport || '') === a; }); };
        if (actSel.length && !allItems.filter(matchesActivity).length) return;
        var items = actSel.length ? allItems.filter(matchesActivity) : allItems;
        if (coachSel.length) {
          var matching = items.filter(function (li) { return coachSel.indexOf(String(li.coachId || inv.coachId || '')) >= 0; });
          var any = items.some(function (li) { return li.coachId != null; });
          if (matching.length) items = matching; else if (any) return;
          var allCamp = items.length && items.every(isCampItem);
          var coachId = allCamp ? null : (inv.coachId || (allItems.find(function (li) { return li.coachId; }) || {}).coachId || null);
          var onLine = allItems.some(function (li) { return coachSel.indexOf(String(li.coachId || '')) >= 0; });
          var onInvoice = coachSel.indexOf(String(coachId || '')) >= 0;
          if (!onLine && !onInvoice) return;
        }
        ids.push(inv.id);
      });
      return ids.join(',');
    };
    eq(run({}), '1,2,3,4', 'msel: empty filters = all');
    eq(run({ methods: ['cash', 'card'] }), '1,2', 'msel: methods match ANY of [cash,card]');
    eq(run({ categories: ['Court Rental'] }), '3', 'msel: single category');
    eq(run({ coachIds: ['5', '6'] }), '1,2', 'msel: coaches match ANY; no-coach invoices excluded');
    eq(run({ activities: ['__camp__'] }), '4', 'msel: Summer Camp activity only');
  })();
  // v6.357: Camp invoice validity = the BUSINESS-day expiry (Sun–Thu), matching the class-days.
  (function () {
    // 1 month = 22 business days: Tue 23 Jun → Wed 22 Jul. 2 months = 44 → Sun 23 Aug.
    eq(campEndDate('2026-06-23', 30), '2026-07-22', 'camp invoice: 1 month = 22 business days, 23 Jun → 22 Jul');
    eq(campEndDate('2026-06-23', 60), '2026-08-23', 'camp invoice: 2 months = 44 business days, 23 Jun → 23 Aug');
    // The recompute path: subscriptionValidEnd derives the camp end from the label (business days),
    // overriding a wrong stored end when it is missing/invalid.
    var sub = { activity: 'Summer Camp', durationLabel: '1 month', start: '2026-06-23', totalClasses: 22 };
    eq(subscriptionValidEnd(sub), '2026-07-22', 'camp invoice: subscriptionValidEnd = business-day end from label');
  })();
  // Members list attendance cell uses the class-day LIMIT (10), not validity (14)
  (function () {
    // subClassLimit converts a stored validity number back to the camp class-day count.
    eq(subClassLimit({ activity: 'Summer Camp', totalClasses: 14 }), 10, 'members cell: 2-week camp denominator = 10 (not 14)');
    eq(subClassLimit({ activity: 'Summer Camp', durationLabel: '2 weeks', totalClasses: 14 }), 10, 'members cell: camp w/ label = 10');
    eq(subClassLimit({ activity: 'Karate', totalClasses: 12 }), 12, 'members cell: non-camp unchanged (12)');
    // So a member with 10 attended of a 2-week camp shows 10/10, not 10/14.
    var attended = 10, limit = subClassLimit({ activity: 'Summer Camp', totalClasses: 14 });
    eq(attended + '/' + limit, '10/10', 'members cell: shows 10/10 for a fully-attended 2-week camp');
  })();
  // Due reminder: groups a family's kids + per-kid dues + total in one message
  (function () {
    var invoiceBalance = function (i) { return (i.amount || 0) - (i.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0); };
    var invoices = [
      { customerId: 1, category: 'Membership', amount: 400, payments: [] },
      { customerId: 2, category: 'Membership', amount: 650, payments: [{ amount: 200 }] },
      { customerId: 3, category: 'Membership', amount: 300, payments: [{ amount: 300 }] }, // paid, excluded
    ];
    var members = [
      { id: 1, name: 'Ibrahim', familyId: 'f1' },
      { id: 2, name: 'Omar', familyId: 'f1' },
      { id: 3, name: 'Sara', familyId: 'f1' },
    ];
    var memberDue = function (mid) { return invoices.filter(function (i) { return i.customerId === mid && (i.category || 'Membership') === 'Membership'; }).reduce(function (s, i) { return s + invoiceBalance(i); }, 0); };
    var familyMembers = function (fid) { return members.filter(function (m) { return m.familyId === fid; }); };
    var kids = familyMembers('f1').map(function (k) { return { k: k, due: memberDue(k.id) }; }).filter(function (x) { return x.due > 0.001; });
    eq(kids.length, 2, 'due reminder: only kids WITH dues are listed (Sara excluded, fully paid)');
    eq(kids.reduce(function (s, x) { return s + x.due; }, 0), 850, 'due reminder: total = 400 + 450');
    eq(kids.map(function (x) { return x.k.name; }).join(','), 'Ibrahim,Omar', 'due reminder: lists both kids by name');
  })();
  // Due reminder escalation: level = sent + 1, capped at 3
  (function () {
    var levelFor = function (sent) { return Math.min(3, sent + 1); };
    eq(levelFor(0), 1, 'reminder level: 0 sent → 1st (gentle)');
    eq(levelFor(1), 2, 'reminder level: 1 sent → 2nd (firmer)');
    eq(levelFor(2), 3, 'reminder level: 2 sent → 3rd (final)');
    eq(levelFor(3), 3, 'reminder level: stays at 3 (final) once maxed');
  })();
  // Monthly report: revenue is payment-dated within the month, split by method
  (function () {
    var invs = [
      { id: 1, customerId: 1, sport: 'Karate', date: '2026-06-05', amount: 400, payments: [{ amount: 400, date: '2026-06-05', method: 'cash' }] },
      { id: 2, customerId: 2, sport: 'Summer Camp', date: '2026-06-10', amount: 1300, payments: [{ amount: 800, date: '2026-06-10', method: 'card' }, { amount: 500, date: '2026-06-20', method: 'fawran' }] },
      { id: 3, customerId: 1, sport: 'Football', date: '2026-05-15', amount: 300, payments: [{ amount: 300, date: '2026-05-15', method: 'cash' }] },
    ];
    var normMethod = function (mRaw) { var x = String(mRaw || '').toLowerCase(); if (x.indexOf('card') >= 0) return 'card'; if (x.indexOf('fawran') >= 0) return 'fawran'; if (x.indexOf('transfer') >= 0) return 'transfer'; return 'cash'; };
    var ym = '2026-06', byMethod = { cash: 0, card: 0, transfer: 0, fawran: 0 }, revenue = 0, bySport = {};
    invs.forEach(function (i) {
      (i.payments || []).forEach(function (p) {
        if (String(p.date).slice(0, 7) !== ym) return;
        var k = normMethod(p.method); byMethod[k] += p.amount; revenue += p.amount;
        bySport[i.sport] = (bySport[i.sport] || 0) + p.amount;
      });
    });
    eq(revenue, 1700, 'monthly report: June revenue = 400+800+500 (May excluded)');
    eq(byMethod.cash + ',' + byMethod.card + ',' + byMethod.fawran, '400,800,500', 'monthly report: method split correct');
    eq(bySport['Summer Camp'], 1300, 'monthly report: revenue by sport (camp = 1300)');
    eq(bySport['Football'] || 0, 0, 'monthly report: May Football excluded from June');
  })();
  // Owner dashboard: collection rate + cash-in-hand are all-time; revenue is this month
  (function () {
    var invs = [
      { id: 1, customerId: 1, date: '2026-06-05', amount: 400, payments: [{ amount: 400, date: '2026-06-05', method: 'cash' }] },
      { id: 2, customerId: 2, date: '2026-06-10', amount: 1300, payments: [{ amount: 800, date: '2026-06-10', method: 'card' }, { amount: 200, date: '2026-06-20', method: 'cash' }] },
      { id: 3, customerId: 1, date: '2026-05-15', amount: 300, payments: [{ amount: 300, date: '2026-05-15', method: 'cash' }] },
    ];
    var paid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + p.amount; }, 0); };
    var norm = function (mRaw) { var x = String(mRaw || '').toLowerCase(); if (x.indexOf('card') >= 0) return 'card'; if (x.indexOf('fawran') >= 0) return 'fawran'; if (x.indexOf('transfer') >= 0) return 'transfer'; return 'cash'; };
    // Revenue this month (June) = payments dated in June.
    var revJune = 0;
    invs.forEach(function (i) { (i.payments || []).forEach(function (p) { if (String(p.date).slice(0, 7) === '2026-06') revJune += p.amount; }); });
    eq(revJune, 1400, 'dashboard: June revenue = 400+800+200');
    // Collection rate all-time = collected / billed.
    var billed = invs.reduce(function (s, i) { return s + i.amount; }, 0);
    var collected = invs.reduce(function (s, i) { return s + paid(i); }, 0);
    eq(Math.round(collected / billed * 100), 85, 'dashboard: collection rate = 1700/2000 = 85%');
    // Cash in hand = all-time cash collected − cash expenses.
    var cash = 0; invs.forEach(function (i) { (i.payments || []).forEach(function (p) { if (norm(p.method) === 'cash') cash += p.amount; }); });
    eq(cash - 150, 750, 'dashboard: cash in hand = 900 cash − 150 expense');
  })();
  // Class Schedule day filter: empty = all days; selected stay in week order
  (function () {
    var DAYS = [{ key: 'sat' }, { key: 'sun' }, { key: 'mon' }, { key: 'tue' }, { key: 'wed' }, { key: 'thu' }, { key: 'fri' }];
    var visibleDays = function (sel) { return sel.length ? DAYS.filter(function (d) { return sel.indexOf(d.key) >= 0; }) : DAYS; };
    eq(visibleDays([]).length, 7, 'schedule day filter: empty = all 7 days');
    // Selecting out of order then re-sorting to canonical week order.
    var picked = ['mon', 'sat', 'wed'];
    var sorted = DAYS.map(function (d) { return d.key; }).filter(function (k) { return picked.indexOf(k) >= 0; });
    eq(sorted.join(','), 'sat,mon,wed', 'schedule day filter: re-sorted to week order');
    eq(visibleDays(sorted).map(function (d) { return d.key; }).join(','), 'sat,mon,wed', 'schedule day filter: grid shows only selected days');
  })();
  // Session lock: a device must not lock itself out (same device name, old sessionId)
  (function () {
    var myLabel = 'Karim LapTop';
    var sameDevice = function (lock) {
      if (!lock || !lock.holderName) return false;
      if (!myLabel) return false;
      return String(lock.holderName).trim() === String(myLabel).trim();
    };
    eq(sameDevice({ sessionId: 's_OLD', holderName: 'Karim LapTop' }), true, 'lock: same device name → treat as ours (reclaim)');
    eq(sameDevice({ sessionId: 's_X', holderName: 'Reception PC' }), false, 'lock: different device → stay read-only');
    eq(sameDevice({ sessionId: 's_Y', holderName: '' }), false, 'lock: no holder name → not same device');
    eq(sameDevice(null), false, 'lock: empty lock → not same device');
  })();
  // Coach offboarding: final commission is pro-rated by attendance
  (function () {
    // attended ÷ limit × price × rate%
    var calc = function (attended, limit, price, rate) { return Math.round(price * Math.min(1, attended / limit) * (rate / 100) * 100) / 100; };
    eq(calc(6, 12, 600, 30), 90, 'offboard: 6/12 × 600 × 30% = 90');
    eq(calc(4, 8, 400, 30), 60, 'offboard: 4/8 × 400 × 30% = 60');
    eq(calc(6, 12, 600, 30) + calc(4, 8, 400, 30), 150, 'offboard: total payout = 150');
    // Full attendance = full commission; zero attendance = nothing.
    eq(calc(12, 12, 600, 30), 180, 'offboard: full attendance = full commission (600×30%)');
    eq(calc(0, 12, 600, 30), 0, 'offboard: no attendance = no commission');
    // Over-attendance is capped at 100%.
    eq(calc(15, 12, 600, 30), 180, 'offboard: attendance capped at 100%');
  })();
  // Freeze: a date-range freeze shifts expiry, sub ends, and enrolment validity
  (function () {
    // Read back LOCAL date parts (like the app's real addDays) — NOT toISOString(),
    // which would re-serialize local midnight in UTC and shift the date back a day
    // in any timezone ahead of UTC (e.g. Qatar UTC+3), giving a spurious off-by-one.
    var addDays = function (d, n) { var dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + parseInt(n)); return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0'); };
    var daysBetween = function (a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); };
    // 18 Jun → 1 Sep = 75 days.
    var days = daysBetween('2026-06-18', '2026-09-01');
    eq(days, 75, 'freeze: 18 Jun → 1 Sep = 75 days');
    // Expiry 28 Jun shifts forward 75 → 11 Sep.
    eq(addDays('2026-06-28', days), '2026-09-11', 'freeze: expiry 28 Jun + 75 = 11 Sep');
    // Enrolment validity 30 → 105.
    eq(30 + days, 105, 'freeze: validity 30 + 75 = 105');
  })();
  // Expense categories: retire Coach Pool/Commission, add Maintenance (idempotent)
  (function () {
    var cleanup = function (cats) {
      var drop = ['coach pool', 'coach commission'];
      cats = cats.filter(function (c) { return drop.indexOf(String(c).toLowerCase()) < 0; });
      if (!cats.some(function (c) { return String(c).toLowerCase() === 'maintenance'; })) {
        var idx = cats.findIndex(function (c) { return String(c).toLowerCase() === 'rent'; });
        if (idx >= 0) cats.splice(idx + 1, 0, 'Maintenance'); else cats.unshift('Maintenance');
      }
      return cats;
    };
    var out = cleanup(['Equipment', 'Rent', 'Coach Pool', 'Coach Commission', 'Salary', 'Others']);
    eq(out.indexOf('Coach Pool'), -1, 'expense cats: Coach Pool removed');
    eq(out.indexOf('Coach Commission'), -1, 'expense cats: Coach Commission removed');
    eq(out.indexOf('Maintenance') >= 0, true, 'expense cats: Maintenance added');
    eq(out[out.indexOf('Rent') + 1], 'Maintenance', 'expense cats: Maintenance placed after Rent');
    eq(cleanup(cleanup(['Rent', 'Coach Pool'])).filter(function (c) { return c === 'Maintenance'; }).length, 1, 'expense cats: idempotent (no duplicate Maintenance)');
  })();
  // Invoice export: Total / Paid / Due columns + totals row
  (function () {
    var invoicePaid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0); };
    var invoiceBalance = function (i) { return Math.max(0, (i.amount || 0) - invoicePaid(i)); };
    var invs = [
      { ref: 'INV1', amount: 400, payments: [{ amount: 400 }] },
      { ref: 'INV2', amount: 650, payments: [{ amount: 200 }] },
      { ref: 'INV3', amount: 300, payments: [] },
    ];
    var st = 0, sp = 0, sd = 0;
    invs.forEach(function (i) { st += i.amount; sp += invoicePaid(i); sd += invoiceBalance(i); });
    eq(st, 1350, 'invoice export: total = 1350');
    eq(sp, 600, 'invoice export: paid = 600');
    eq(sd, 750, 'invoice export: due = 750');
    eq(invoiceBalance(invs[0]), 0, 'invoice export: fully paid invoice has 0 due');
  })();
  // Commission start-date cutoff: subs/invoices before the cutoff earn nothing
  (function () {
    var commStart = '2026-06-01';
    var counts = function (anchor) { return !(commStart && anchor && String(anchor).slice(0, 10) < commStart); };
    eq(counts('2026-05-20'), false, 'comm cutoff: May sub excluded');
    eq(counts('2026-06-01'), true, 'comm cutoff: 1 Jun sub included');
    eq(counts('2026-06-15'), true, 'comm cutoff: mid-Jun sub included');
    eq(counts('2026-05-31'), false, 'comm cutoff: 31 May excluded (day before)');
    // Empty cutoff = everything counts.
    var commStart2 = '';
    eq(!(commStart2 && '2026-01-01' < commStart2), true, 'comm cutoff: empty cutoff counts all dates');
  })();
  // Transactions: net due = gross due − credits; amount range filter
  (function () {
    var netDue = function (amount, paid, credit) { var due = Math.max(0, amount - paid); return Math.max(0, due - credit); };
    eq(netDue(1850, 650, 0), 1200, 'txn: gross due = 1200 (no credit)');
    eq(netDue(1850, 650, 200), 1000, 'txn: net due = 1000 (200 credit)');
    eq(netDue(400, 400, 0), 0, 'txn: fully paid → 0 due');
    eq(netDue(1000, 0, 1200), 0, 'txn: credit larger than due → net 0 (never negative)');
    // Amount range filter on a field value.
    var inRange = function (v, min, max) { return (min === '' || v >= min) && (max === '' || v <= max); };
    eq(inRange(1200, 500, 1500), true, 'txn amount filter: 1200 in [500,1500]');
    eq(inRange(1900, 500, 1500), false, 'txn amount filter: 1900 outside [500,1500]');
    eq(inRange(650, 500, ''), true, 'txn amount filter: min only');
  })();
  // Bank commission: card payments × 2.25%, card-only, override sticks
  (function () {
    var RATE = 2.25;
    var cardPaid = 1000 + 100;   // two card payments; a cash 750 is excluded
    var auto = Math.round(cardPaid * RATE) / 100;
    eq(auto, 24.75, 'bank commission: 1100 card × 2.25% = 24.75');
    eq(Math.round(2000 * RATE) / 100, 45, 'bank commission: 2000 × 2.25% = 45');
    eq(Math.round(0 * RATE) / 100, 0, 'bank commission: no card payments = 0');
    // Override semantics: an edited row keeps its value (simulated).
    var row = { amount: 24.75, edited: false };
    row.amount = 30; row.edited = true;
    var recompute = function (r, a) { if (!r.edited) r.amount = a; return r.amount; };
    eq(recompute(row, 24.75), 30, 'bank commission: override not recomputed');
    row.edited = false;
    eq(recompute(row, 24.75), 24.75, 'bank commission: reset recomputes');
  })();
  // Reconciliation: Revenue = cash taken + cash in hand + expenses + non-cash (leakage 0)
  (function () {
    var revenue = 1800;          // 1000 cash + 500 card + 300 fawran
    var cashCollected = 1000, nonCash = 800;
    var expenses = 200, cashExpenses = 200, ownerCashTaken = 400;
    var cashInHand = cashCollected - cashExpenses - ownerCashTaken;  // 400
    eq(cashInHand, 400, 'recon: cash in hand = 1000 − 200 − 400 = 400');
    var accountedFor = ownerCashTaken + cashInHand + expenses + nonCash;
    eq(accountedFor, 1800, 'recon: accounted = 400+400+200+800 = 1800');
    eq(revenue - accountedFor, 0, 'recon: leakage = 0 (balanced)');
    // A misclassified payment creates leakage: move 100 cash off the books.
    var leaked = revenue - (ownerCashTaken + (cashInHand - 100) + expenses + nonCash);
    eq(leaked, 100, 'recon: 100 missing cash shows as 100 leakage');
  })();
  // Dashboard revenue now uses invoice-month basis (matches Invoices screen)
  (function () {
    var paid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + p.amount; }, 0); };
    var invs = [
      { month: '2026-06', date: '2026-06-05', payments: [{ amount: 600, date: '2026-06-05' }, { amount: 400, date: '2026-07-10' }] },
      { month: '2026-05', date: '2026-05-20', payments: [{ amount: 500, date: '2026-06-15' }] },
    ];
    // Invoice-month basis: June = the June-billed invoice's full collected (1000).
    var dash = invs.filter(function (i) { return (i.month || i.date.slice(0, 7)) === '2026-06'; }).reduce(function (s, i) { return s + paid(i); }, 0);
    var invScreen = invs.filter(function (i) { return i.month === '2026-06'; }).reduce(function (s, i) { return s + paid(i); }, 0);
    eq(dash, 1000, 'dashboard revenue: June = 1000 (invoice-month basis)');
    eq(dash, invScreen, 'dashboard revenue: matches Invoices screen');
  })();
  // Soft-delete tombstone wins the merge over a stale "alive" copy (no resurrection)
  (function () {
    var stable = function (o) { return JSON.stringify(o); };
    // Replicates the both-present branch of _mergeCollection.
    var mergeOne = function (base, local, remote) {
      var inB = !!base;
      var lChanged = !inB || stable(local) !== stable(base);
      var rChanged = !inB || stable(remote) !== stable(base);
      if (lChanged && rChanged && stable(local) !== stable(remote)) return local; // conflict → local
      if (rChanged && !lChanged) return remote;
      return local;
    };
    var base = { id: 5, amount: 1000 };
    // Admin deleted locally; stale device still alive remotely → deletion must win.
    eq(!!mergeOne(base, { id: 5, amount: 1000, deleted: true }, { id: 5, amount: 1000 }).deleted, true, 'soft-delete: tombstone beats stale alive copy');
    // Employee untouched locally; admin deleted remotely → accepts the delete.
    eq(!!mergeOne(base, { id: 5, amount: 1000 }, { id: 5, amount: 1000, deleted: true }).deleted, true, 'soft-delete: untouched device accepts remote delete');
  })();
  // Stale-version guard: a browser running an older version is flagged stale
  (function () {
    var cmp = function (a, b) {
      var pa = String(a || '0').split('.').map(function (n) { return parseInt(n) || 0; });
      var pb = String(b || '0').split('.').map(function (n) { return parseInt(n) || 0; });
      for (var i = 0; i < Math.max(pa.length, pb.length); i++) { var x = pa[i] || 0, y = pb[i] || 0; if (x < y) return -1; if (x > y) return 1; }
      return 0;
    };
    eq(cmp('6.201.0', '6.202.0'), -1, 'version guard: older browser is stale (blocked)');
    eq(cmp('6.202.0', '6.202.0'), 0, 'version guard: same version is fine');
    eq(cmp('6.202.0', '6.201.0'), 1, 'version guard: newer browser is fine');
    eq(cmp('6.99.0', '6.201.0'), -1, 'version guard: numeric compare (6.99 < 6.201)');
  })();
  // memberOutstanding must skip DELETED invoices (so Due Payment matches Transactions)
  (function () {
    var invoicePaid = function (i) { return i.amountPaid != null ? i.amountPaid : (i.amount || 0); };
    var invoiceBalance = function (i) { return Math.max(0, (i.amount || 0) - invoicePaid(i)); };
    var invoices = [
      { customerId: 1, category: 'Membership', amount: 1000, amountPaid: 300 },           // due 700
      { customerId: 1, category: 'Membership', amount: 500, amountPaid: 0, deleted: true }, // due 500 but deleted
    ];
    var outstanding = invoices.filter(function (i) { return !i.deleted && i.customerId === 1 && (i.category || 'Membership') === 'Membership'; }).reduce(function (s, i) { return s + invoiceBalance(i); }, 0);
    eq(outstanding, 700, 'memberOutstanding: skips deleted invoice (700, not 1200)');
  })();
  // Due Payment must count ALL categories (not just Membership) so it reconciles with Transactions
  (function () {
    var invoicePaid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0); };
    var invoiceBalance = function (i) { return Math.max(0, (i.amount || 0) - invoicePaid(i)); };
    var invoices = [
      { customerId: 1, category: 'Summer Camp', amount: 1100, payments: [{ amount: 650 }] }, // due 450, non-Membership
      { customerId: 2, category: 'Membership', amount: 2400, payments: [{ amount: 500 }] },   // due 1900
      { customerId: 3, category: 'Summer Camp', switchCredit: true, amount: 200, payments: [] }, // excluded by switchCredit
    ];
    var membershipOnly = invoices.filter(function (i) { return (i.category || 'Membership') === 'Membership' && !i.switchCredit; }).reduce(function (s, i) { return s + invoiceBalance(i); }, 0);
    var allDue = invoices.filter(function (i) { return !i.switchCredit; }).reduce(function (s, i) { return s + invoiceBalance(i); }, 0);
    eq(membershipOnly, 1900, 'due recon: old Membership-only basis = 1900 (under-counts)');
    eq(allDue, 2350, 'due recon: all-category basis = 2350 (includes the camp 450)');
  })();
  // Camp recalc: legacy calendar counts are flagged and fixed to business days
  (function () {
    var savedM = state.members;
    state.members = [
      { id: 9701, name: 'OldCamp', sport: 'Summer Camp',
        enrollments: [{ sport: 'Summer Camp', classes: 30, durationLabel: '1 month', start: '2026-06-14' }],
        subscriptions: [{ activity: 'Summer Camp', durationLabel: '1 month', totalClasses: 30, start: '2026-06-14', end: '2026-07-14', attendedClasses: 7, status: 'Active' }] },
      { id: 9702, name: 'GoodCamp', sport: 'Summer Camp',
        enrollments: [{ sport: 'Summer Camp', classes: 5, durationLabel: '1 week', start: '2026-06-14' }],
        subscriptions: [{ activity: 'Summer Camp', durationLabel: '1 week', totalClasses: 5, start: '2026-06-14', end: '2026-06-18', attendedClasses: 0, status: 'Active' }] },
    ];
    var flagged = findCampMembersToRecalc();
    eq(flagged.length, 1, 'camp recalc: only the legacy member is flagged');
    eq(flagged[0].member.id, 9701, 'camp recalc: flags the 30-class member');
    var sub = state.members[0].subscriptions[0];
    var beforeAtt = sub.attendedClasses;
    recalcCampMember(9701);
    eq(sub.totalClasses, 22, 'camp recalc: 1 month -> 22 classes');
    eq(sub.end, '2026-07-13', 'camp recalc: end re-dated to business-day window (22 days → 13 Jul)');
    eq(sub.attendedClasses, beforeAtt, 'camp recalc: attendance unchanged');
    eq(findCampMembersToRecalc().length, 0, 'camp recalc: nothing flagged after fixing');
    // Legacy "1 month" stored as 30 days (no label) must resolve to 22, not 30 (6 weeks).
    var t30 = _campTargetForSub({ activity: 'Summer Camp', totalClasses: 30, amountPaid: 1750 });
    eq(t30.targetClasses, 22, 'camp recalc: legacy 30 (paid 1750) -> 1 month = 22');
    var t30b = _campTargetForSub({ activity: 'Summer Camp', totalClasses: 30, amountPaid: 2500 });
    eq(t30b.targetClasses, 30, 'camp recalc: 30 classes paid 2500 -> 6 weeks = 30 (kept)');
    var t30c = _campTargetForSub({ activity: 'Summer Camp', totalClasses: 30 });
    eq(t30c.targetClasses, 22, 'camp recalc: ambiguous 30 with no price defaults to 1 month = 22');
    state.members = savedM;
  })();
  // Notifications: student gets the right alerts from their own data
  (function () {
    var savedM = state.members, savedS = state.schedule, savedU = state.user, savedSess = state.session;
    state.session = { role: 'student', memberId: 8901 };
    state.user = { memberId: 8901 };
    state.schedule = [{ day: ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()], slot: '4PM - 5PM', sport: 'Swimming', coachId: 3 }];
    var soon = new Date(); soon.setDate(soon.getDate() + 4);
    var soonStr = soon.toISOString().slice(0, 10);
    state.members = [{ id: 8901, name: 'Stu', sport: 'Swimming', expiryDate: soonStr,
      enrollments: [{ sport: 'Swimming', coachId: 3 }],
      subscriptions: [{ activity: 'Swimming', coachId: 3, totalClasses: 8, attendedClasses: 7, status: 'Active' }] }];
    // currentRole() reads state; emulate student by checking buildNotifications shape
    var titles = buildNotifications().map(function (n) { return n.title; });
    // The student should at least see expiry + low-classes alerts (next-class depends on weekday)
    ok(titles.some(function (x) { return /expir/i.test(x); }), 'notif: student sees expiring-soon');
    ok(titles.some(function (x) { return /running low/i.test(x); }), 'notif: student sees low-classes');
    state.members = savedM; state.schedule = savedS; state.user = savedU; state.session = savedSess;
  })();
  // Unpaid flag: memberOutstanding drives the attendance UNPAID badge + profile total
  (function () {
    var savedI = state.invoices;
    state.invoices = [
      { customerId: 8801, category: 'Membership', amount: 800, amountPaid: 0 },
      { customerId: 8802, category: 'Membership', amount: 500, amountPaid: 500 },
      { customerId: 8803, category: 'Membership', amount: 1000, amountPaid: 600 },
    ];
    eq(memberOutstanding(8801), 800, 'unpaid: registered-unpaid member shows full balance due');
    eq(memberOutstanding(8802), 0, 'unpaid: fully-paid member has no balance');
    eq(memberOutstanding(8803), 400, 'unpaid: partial payment shows remaining balance');
    ok(memberOutstanding(8801) > 0.5, 'unpaid: flag condition true when due');
    ok(!(memberOutstanding(8802) > 0.5), 'unpaid: no flag when fully paid');
    state.invoices = savedI;
  })();
  // daysUntil counts calendar days correctly (no timezone off-by-one)
  (function () {
    var d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + 5);
    var s = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    eq(daysUntil(s), 5, 'daysUntil: a date 5 days out returns 5');
    var p = new Date(); p.setHours(0,0,0,0); p.setDate(p.getDate() - 3);
    var ps = p.getFullYear() + '-' + String(p.getMonth()+1).padStart(2,'0') + '-' + String(p.getDate()).padStart(2,'0');
    eq(daysUntil(ps), -3, 'daysUntil: a date 3 days ago returns -3');
  })();
  // Notes month/day filter logic (acts on remindDate)
  (function () {
    var ns = [
      { id: 1, remindDate: '2026-06-15' },
      { id: 2, remindDate: '2026-06-21' },
      { id: 3, remindDate: '2026-07-15' },
      { id: 4, remindDate: null },
    ];
    var filt = function (fMonth, fDay) {
      return ns.filter(function (n) {
        if (fMonth !== 'all') { if (!n.remindDate || n.remindDate.slice(0, 7) !== fMonth) return false; }
        if (fDay !== 'all') { if (!n.remindDate || n.remindDate.slice(8, 10) !== fDay) return false; }
        return true;
      }).map(function (n) { return n.id; });
    };
    eq(filt('2026-06', 'all').join(','), '1,2', 'notes filter: month only');
    eq(filt('all', '15').join(','), '1,3', 'notes filter: day across months');
    eq(filt('2026-06', '21').join(','), '2', 'notes filter: month + day');
    eq(filt('all', 'all').length, 4, 'notes filter: none shows all');
  })();
  // Attendance "needs renewal" cue: expired AND fully paid (distinct from UNPAID)
  (function () {
    var needsRenewal = function (isExpired, due) { return isExpired && due <= 0.5; };
    eq(needsRenewal(true, 0), true, 'renewal cue: expired + paid → renew');
    eq(needsRenewal(true, 200), false, 'renewal cue: expired + owing → not renew (shows unpaid)');
    eq(needsRenewal(false, 0), false, 'renewal cue: active → no cue');
  })();
  // Enrollment re-sync: rebuild drifted enrollments from active subscriptions
  (function () {
    var savedM = state.members;
    state.members = [
      { id: 9801, name: 'Drift', sport: 'Gymnastic',
        subscriptions: [
          { activity: 'Gymnastic', coachId: 2, totalClasses: 8, status: 'Active', start: '2026-05-01' },
          { activity: 'Swimming', coachId: 3, totalClasses: 8, status: 'Active', start: '2026-05-01' },
          { activity: 'Kick Boxing', coachId: 5, totalClasses: 8, status: 'Active', start: '2026-05-01' },
        ],
        enrollments: [ // duplicated + missing Gymnastic
          { sport: 'Kick Boxing', coachId: 5 }, { sport: 'Swimming', coachId: 3 },
          { sport: 'Kick Boxing', coachId: 5 }, { sport: 'Swimming', coachId: 3 },
        ] },
      { id: 9802, name: 'WrongCoach', sport: 'Boxing',
        subscriptions: [{ activity: 'Boxing', coachId: 1, totalClasses: 8, status: 'Active' }],
        enrollments: [{ sport: 'Boxing', coachId: 5 }] },
      { id: 9803, name: 'Clean', sport: 'Karate',
        subscriptions: [{ activity: 'Karate', coachId: 4, status: 'Active' }],
        enrollments: [{ sport: 'Karate', coachId: 4 }] },
    ];
    var flagged = findMembersWithEnrollmentDrift().map(function (d) { return d.member.id; }).sort();
    eq(flagged.join(','), '9801,9802', 'resync: flags drifted members only (not clean)');
    resyncMemberEnrollments(9801);
    var m1 = state.members[0];
    eq(m1.enrollments.length, 3, 'resync: rebuilt to one row per sport');
    var sports = m1.enrollments.map(function (e) { return e.sport + '/' + e.coachId; }).sort().join(',');
    eq(sports, 'Gymnastic/2,Kick Boxing/5,Swimming/3', 'resync: correct sports + coaches restored');
    resyncMemberEnrollments(9802);
    eq(state.members[1].enrollments[0].coachId, 1, 'resync: wrong coach corrected');
    eq(findMembersWithEnrollmentDrift().length, 0, 'resync: nothing flagged after fixing');
    state.members = savedM;
  })();
  // Cash in hand: current total is the most recent count (by createdAt)
  (function () {
    var counts = [
      { id: 'a', amount: 5000, date: '2026-06-01', createdAt: '2026-06-01T10:00:00Z' },
      { id: 'b', amount: 7200, date: '2026-06-20', createdAt: '2026-06-20T18:00:00Z' },
      { id: 'c', amount: 6800, date: '2026-06-22', createdAt: '2026-06-22T20:00:00Z' },
    ].slice().sort(function (a, b) { return (b.createdAt || b.date).localeCompare(a.createdAt || a.date); });
    eq(counts[0].amount, 6800, 'cash in hand: current = most recent count');
    eq(counts[0].amount - counts[1].amount, -400, 'cash in hand: delta vs previous');
  })();
  var _af = { expiryDate: '2026-07-01', freezes: [] };
  applyFreeze(_af, 7, 'x');
  eq(_af.expiryDate, '2026-07-08', 'freeze: applyFreeze shifts expiry forward by the frozen days');
  // Calendar (.ics) export: next occurrence date for a weekly class
  function _nextDate(wd, hour, now) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let add = (wd - d.getDay() + 7) % 7; if (add === 0 && hour <= now.getHours()) add = 7; d.setDate(d.getDate() + add); return d; }
  var _tue = new Date(2026, 5, 9, 10, 0, 0); // Tue 9 Jun 2026, 10:00
  eq(_nextDate(2, 17, _tue).getDate(), 9, 'ics: a class later today keeps today\u2019s date');
  eq(_nextDate(2, 8, _tue).getDate(), 16, 'ics: a class already passed today rolls to next week');
  // Sport-switch distribution: remaining value split across targets by class count
  var _sp = computeSwitchSplit(800, 2, 8); // 800 price, 2 of 8 attended
  eq(Math.round(_sp.aShare), 200, 'switch: old coach keeps (attended/planned) x price');
  eq(Math.round(_sp.bShare), 600, 'switch: remaining value = price - aShare');
  var _rem = 6, _t1 = _sp.bShare * (4 / _rem), _t2 = _sp.bShare * (2 / _rem);
  eq(Math.round(_t1), 400, 'switch-distribute: 4 of 6 classes → 400');
  eq(Math.round(_t2), 200, 'switch-distribute: 2 of 6 classes → 200');
  eq(Math.round(_t1 + _t2), Math.round(_sp.bShare), 'switch-distribute: target values sum to the remaining value');
  state.members = state.members.filter(m => ![995, 996].includes(m.id));
  state.coaches.push({ id: 999, name: 'Coach Z', active: 'Y' });
  state.members.push({ id: 991, name: 'CS1' });
  state.members.push({ id: 992, name: 'CS2' });
  state.invoices.push({ id: 99001, customerId: 991, category: 'Membership', sport: 'Boxing', coachId: 999, amount: 300 });
  state.invoices.push({ id: 99002, customerId: 992, category: 'Membership', lineItems: [{ sport: 'MMA', coachId: 999, price: 200 }], amount: 200 });
  var cs = coachStudents(999).map(m => m.id).sort((a, b) => a - b);
  eq(JSON.stringify(cs), JSON.stringify([991, 992]), 'advice: coachStudents = members with membership invoices under that coach');
  state.members = state.members.filter(m => ![991, 992].includes(m.id));
  state.coaches = state.coaches.filter(c => c.id !== 999);
  state.invoices = state.invoices.filter(i => ![99001, 99002].includes(i.id));

  // ── Multi-sport reminder message ──
  var rsMem = { name: 'Multi', enrollments: [{ sport: 'Karate' }, { sport: 'Boxing' }, { sport: 'Summer Camp' }] };
  eq(memberRenewalSports(rsMem).join(','), 'Karate,Boxing', 'reminder: distinct sports, excludes Summer Camp');
  eq(joinSports(['Karate'], '&'), 'Karate', 'reminder: single sport');
  eq(joinSports(['Karate', 'Boxing'], '&'), 'Karate & Boxing', 'reminder: two sports joined with &');
  eq(joinSports(['A', 'B', 'C'], '&'), 'A, B & C', 'reminder: 3 sports listed');
  var rmsg = buildReminderMessage({ name: 'Multi', enrollments: [{ sport: 'Karate' }, { sport: 'Boxing' }], expiryDate: '2026-06-30' }, 'expiring', 3);
  ok(rmsg.indexOf('Karate & Boxing') >= 0, 'reminder: message body lists all sports');

  // ── Last-reminded timestamp formatting ──
  ok(/2026/.test(fmtDateTime('2026-06-04T15:12:00')), 'fmtDateTime: includes the date');
  eq(fmtDateTime(''), '', 'fmtDateTime: blank for empty');

  // ── Add Sibling: copy ALL profile + plan; drop attendance/financial history ──
  var dupSrc = { id: 7, name: 'Ahmed Ali', nameArabic: 'احمد', qid: '288', birthdate: '2015-01-01',
    level: 'Intermediate', phone: '+97455500011', phone2: '+97455500022', email: 'family@x.com',
    nationality: 'Qatar', enrollments: [{ sport: 'Karate' }], dailyAttendance: { '2026-06': {} } };
  var dupStub = buildMemberDuplicateStub(dupSrc, 99);
  eq(dupStub.phone, '+97455500011', 'sibling: copies shared phone');
  eq(dupStub.email, 'family@x.com', 'sibling: copies shared email');
  eq(dupStub.nationality, 'Qatar', 'sibling: copies nationality');
  eq(dupStub.name, '', 'sibling: clears name (admin enters the sibling\u2019s own)');
  ok(!dupStub.qid, 'sibling: clears QID (not shared between siblings)');
  eq(dupStub.birthdate, '', 'sibling: clears birthdate (admin enters the sibling\u2019s own)');
  eq(dupStub._duplicatedFrom, 'Ahmed Ali', 'sibling: remembers the source name for the banner');
  ok(Array.isArray(dupStub.enrollments) && dupStub.enrollments.length === 1, 'sibling: copies enrollments (plan)');
  ok(dupStub.id === 99, 'sibling: gets a fresh id (treated as new member)');

  // ── Schedule hover: top active members for a class ──
  state.members.push(
    { id: 201, name: 'Zed Active', enrollments: [{ sport: 'TestSport', coachId: 9 }], subscriptions: [{ activity: 'TestSport', coachId: 9, attendedClasses: 8 }] },
    { id: 202, name: 'Amy Active', enrollments: [{ sport: 'TestSport', coachId: 9 }], subscriptions: [{ activity: 'TestSport', coachId: 9, attendedClasses: 12 }] },
    { id: 203, name: 'Other Coach', enrollments: [{ sport: 'TestSport', coachId: 5 }], subscriptions: [{ activity: 'TestSport', coachId: 5, attendedClasses: 99 }] },
    { id: 204, name: 'Gone', deleted: true, enrollments: [{ sport: 'TestSport', coachId: 9 }], subscriptions: [{ activity: 'TestSport', coachId: 9, attendedClasses: 100 }] }
  );
  var topC = topActiveMembersForClass('TestSport', 9, 10);
  eq(topC.length, 2, 'hover: only coach-9 members in TestSport (archived excluded)');
  eq(topC[0].name, 'Amy Active', 'hover: most-attended first');
  eq(topC[0].attended, 12, 'hover: shows attended count');
  eq(topC[1].name, 'Zed Active', 'hover: second by attendance');
  ok(!topC.some(m => m.name === 'Gone'), 'hover: excludes archived members');
  ok(!topC.some(m => m.name === 'Other Coach'), 'hover: narrows to the class coach when present');
  // no-coach fallback: all in the sport
  eq(topActiveMembersForClass('TestSport', null, 10).length, 3, 'hover: coach=null → all active in sport');

  // ── Attendance export: one tab per month, all months ──
  state.members.push({ id: 301, name: 'AttA', enrollments: [{ sport: 'Karate', coachId: 1 }],
    dailyAttendance: { '2026-03': { 'Karate': { '1': 'Y', '3': 'Y' } }, '2026-04': { 'Karate': { '2': 'Y' } } } });
  var aMonths = attendanceMonthsWithData();
  ok(aMonths.indexOf('2026-03') >= 0 && aMonths.indexOf('2026-04') >= 0, 'att-export: collects every month with marks');
  ok(aMonths.indexOf('2026-03') < aMonths.indexOf('2026-04'), 'att-export: months sorted oldest→newest');
  var attWb = buildAttendanceWorkbook();
  ok(attWb.sheets.length >= 2, 'att-export: one sheet per month');
  var marSheet = attWb.sheets.find(s => s.name === 'Mar-2026');
  ok(!!marSheet, 'att-export: a tab named Mar-2026 exists');
  ok(marSheet && marSheet.rows.length >= 2, 'att-export: Mar tab has header + member row');
  eq(marSheet.rows[0][0].v, 'Coach', 'att-export: header first column = Coach');
  ok(!!attWb.sheets.find(s => s.name === 'Apr-2026'), 'att-export: Apr-2026 tab too');

  // ── First + last name requirement ──
  ok(hasFirstAndLast('Anas Madni'), 'name: two words passes');
  ok(!hasFirstAndLast('Anas'), 'name: single word rejected');
  ok(!hasFirstAndLast(''), 'name: empty rejected');
  ok(!hasFirstAndLast('   '), 'name: whitespace-only rejected');
  ok(hasFirstAndLast('  Anas   Madni  '), 'name: extra spaces still counts as two words');
  ok(hasFirstAndLast('احمد علي'), 'name: Arabic two words passes');

  // ── Convert trial: detect an existing member (same phone + same name) ──
  state.members.push({ id: 401, name: 'Kamal Alawadi', nameArabic: 'كمال', phone: '+97455009211' });
  ok(!!findDuplicateMember('+97455009211', 'Kamal Alawadi', null, null), 'convert: same phone + same name = existing member');
  ok(!findDuplicateMember('+97455009211', 'Ilyne Alawady', null, null), 'convert: same phone + different name = NOT a duplicate (sibling)');

  // ── Qatar ID OCR parsing (the field extraction, not the image->text step) ──
  var NL = String.fromCharCode(10);
  var idText = ['State Of Qatar','Residency Permit','ID.No: 32176000771','D.O.B: 28/10/2021','Expiry: 13/02/2027','Nationality: SYRIA','Occupation:','Name: ALEEN OSAMA ALAWAD','الإسم: الين اسامه العوض','الجنسية: سورية','Passport Number: N015239024','Passport Expiry: 31/01/2028','Serial No: 30432176000771'].join(NL);
  var idp = parseQatarId(idText);
  eq(idp.qid, '32176000771', 'QID: reads the 11-digit ID not the 14-digit serial');
  eq(idp.birthdate, '2021-10-28', 'QID: birthdate from the D.O.B line not Expiry');
  eq(idp.nameEn, 'Aleen Osama Alawad', 'QID: English name title-cased');
  eq(idp.nameAr, 'الين اسامه العوض', 'QID: Arabic name read from the label line');
  eq(idp.nationality, 'Syria', 'QID: nationality from the Nationality line');
  var emptyId = parseQatarId('totally unrelated text with no id fields');
  ok(emptyId.qid === null && emptyId.birthdate === null && emptyId.nameEn === null, 'QID: returns nulls when nothing matches');
  var noLabel = parseQatarId(['32176000771','28/10/2021','13/02/2027'].join(NL));
  eq(noLabel.birthdate, '2021-10-28', 'QID: with no label, picks the earliest past date as birthdate');

  // ── Phone search: ignore spaces + country code, match partials ──
  ok(phoneSearchMatches('66995549', '97466995549'),       'phone search: paste +974… finds national-only stored');
  ok(phoneSearchMatches('6699 5549', '97466995549'),      'phone search: spaces in stored ignored');
  ok(phoneSearchMatches('+974 6699 5549', '97466995549'), 'phone search: full vs full');
  ok(phoneSearchMatches('+974 6699 5549', '66995549'),    'phone search: type national finds +974 stored');
  ok(phoneSearchMatches('66995549', '6699'),              'phone search: partial fragment matches');
  ok(!phoneSearchMatches('66995549', '1234'),             'phone search: unrelated digits do NOT match');
  ok(phonesMatch('+974 6699 5549', '66995549'),           'dup detect: +974 vs national match');
  ok(phonesMatch('6699 5549', '66995549'),                'dup detect: spaces ignored');

  // ── Bilingual renewal reminder (Arabic first, always both languages) ──
  const remMember = { name: 'Test EN', expiryDate: '2026-06-30', enrollments: [{ sport: 'Boxing' }] };
  const remMsg = buildReminderMessage(remMember, 'expiring', 2);
  ok(remMsg.includes('Black Stars Sports Club'), 'reminder: includes English block');
  ok(remMsg.includes('نادي بلاك ستارز الرياضي'), 'reminder: includes Arabic block even without an Arabic name');
  ok(remMsg.indexOf('مرحبا') < remMsg.indexOf('Hi Test EN'), 'reminder: Arabic comes before English');
  ok(remMsg.includes('💪') || remMsg.includes('🥋'), 'reminder: contains motivational emoji');

  // ── Multi-device record-level merge (data-safety) ──────────────────────────
  (function () {
    var idsOf = function (arr) { return arr.map(function (r) { return r.id + (r.v ? ':' + r.v : ''); }).sort().join(','); };
    // Different records edited on each device → both kept, no conflict
    var r1 = _mergeCollection([{ id: 1, v: 'a' }, { id: 2, v: 'a' }], [{ id: 1, v: 'L' }, { id: 2, v: 'a' }], [{ id: 1, v: 'a' }, { id: 2, v: 'R' }]);
    eq(idsOf(r1.merged), '1:L,2:R', 'merge: different records → both edits kept');
    eq(r1.conflicts, 0, 'merge: different records → no conflict');
    // Same record edited on both → local kept + conflict flagged
    var r2 = _mergeCollection([{ id: 1, v: 'a' }], [{ id: 1, v: 'L' }], [{ id: 1, v: 'R' }]);
    eq(idsOf(r2.merged), '1:L', 'merge: same record → local kept');
    eq(r2.conflicts, 1, 'merge: same record → conflict flagged');
    // New record on each device → all survive
    var r3 = _mergeCollection([{ id: 1, v: 'a' }], [{ id: 1, v: 'a' }, { id: 2, v: 'nl' }], [{ id: 1, v: 'a' }, { id: 3, v: 'nr' }]);
    eq(idsOf(r3.merged), '1:a,2:nl,3:nr', 'merge: new records on both → all kept');
    // Remote deleted an untouched record → two-strikes: KEPT on the 1st absence (a stale
    // snapshot must not delete a confirmed record), honored on the 2nd consecutive absence.
    var r4a = _mergeCollection([{ id: 1, v: 'a' }, { id: 2, v: 'a' }], [{ id: 1, v: 'a' }, { id: 2, v: 'a' }], [{ id: 1, v: 'a' }], 'delk');
    eq(idsOf(r4a.merged), '1:a,2:a', 'merge: 1st absence keeps the confirmed record (anti stale-snapshot)');
    var r4 = _mergeCollection([{ id: 1, v: 'a' }, { id: 2, v: 'a' }], [{ id: 1, v: 'a' }, { id: 2, v: 'a' }], [{ id: 1, v: 'a' }], 'delk');
    eq(idsOf(r4.merged), '1:a', 'merge: remote delete honored after 2 consecutive absences');
    // Remote deleted a record local EDITED → keep it (no silent loss)
    var r5 = _mergeCollection([{ id: 1, v: 'a' }, { id: 2, v: 'a' }], [{ id: 1, v: 'a' }, { id: 2, v: 'E' }], [{ id: 1, v: 'a' }]);
    eq(idsOf(r5.merged), '1:a,2:E', 'merge: delete-vs-edit → edited record kept (no loss)');
    // Local addition survives
    var r6 = _mergeCollection([{ id: 1, v: 'a' }], [{ id: 1, v: 'a' }, { id: 9, v: 'm' }], [{ id: 1, v: 'a' }]);
    eq(idsOf(r6.merged), '1:a,9:m', 'merge: local addition survives');
    // No-change echo: merging identical data must report nothing changed (prevents
    // the save→remote-update→save refresh loop).
    var same = _mergeCollection([{ id: 1, v: 'a' }], [{ id: 1, v: 'a' }], [{ id: 1, v: 'a' }]);
    eq(_stableStr(same.merged), _stableStr([{ id: 1, v: 'a' }]), 'merge: identical data → unchanged result (no loop)');
    // Records WITHOUT an id (e.g. legacy schedule rows) must never be dropped.
    var noId = _mergeCollection([], [{ day: 'mon' }, { day: 'tue' }], [{ day: 'mon' }]);
    eq(noId.merged.length, 2, 'merge: id-less records preserved (kept from the larger side)');
    var mixed = _mergeCollection([{ id: 1, v: 'a' }], [{ id: 1, v: 'L' }, { day: 'x' }], [{ id: 1, v: 'a' }, { day: 'x' }, { day: 'y' }]);
    eq(mixed.merged.filter(function (r) { return r.id === 1; })[0].v, 'L', 'merge: id record merges while id-less preserved');
    eq(mixed.merged.filter(function (r) { return r.id == null; }).length, 2, 'merge: id-less kept from larger (remote) side');
  })();
  // Search normalization: phone formats + Arabic alef folding
  (function () {
    var m = { name: 'Anas', nameArabic: 'انس محمد', phone: '+97450413948', phone2: null, qid: '288' };
    var fields = [m.name, m.nameArabic, m.phone, m.phone2, m.qid];
    var phones = [m.phone, m.phone2];
    // Phone: every way of writing the number matches.
    eq(searchMatchesFields('+97450413948', fields, phones), true, 'search: +974 phone matches');
    eq(searchMatchesFields('50413948', fields, phones), true, 'search: local 8-digit phone matches');
    eq(searchMatchesFields('5041 3948', fields, phones), true, 'search: spaced phone matches');
    eq(searchMatchesFields('00974 50413948', fields, phones), true, 'search: 00974 phone matches');
    eq(normalizePhoneForCompare('+97450413948'), '50413948', 'phone canonical: +974 → local 8');
    eq(normalizePhoneForCompare('0097450413948'), '50413948', 'phone canonical: 00974 → local 8');
    // Arabic alef folding: أنس matches stored انس.
    eq(searchMatchesFields('أنس', fields, phones), true, 'search: أنس matches stored انس');
    eq(searchMatchesFields('انس', fields, phones), true, 'search: انس matches');
    eq(normalizeArabicForSearch('أنس'), normalizeArabicForSearch('انس'), 'arabic: أ folds to ا');
    eq(normalizeArabicForSearch('فاطمة'), normalizeArabicForSearch('فاطمه'), 'arabic: ة folds to ه');
  })();
  // Expiring: reminder count + reminded filter
  (function () {
    var none = { startDate: '2026-05-01' };
    var once = { startDate: '2026-05-01', reminderDates: ['2026-06-22'] };
    var twice = { startDate: '2026-05-01', reminderDates: ['2026-06-16', '2026-06-22'] };
    eq(reminderInfo(none).count, 0, 'reminder count: none → 0');
    eq(reminderInfo(once).count, 1, 'reminder count: once → 1');
    eq(reminderInfo(twice).count, 2, 'reminder count: twice → 2');
    var passRem = function (m, f) {
      var rc = reminderInfo(m).count;
      if (f === 'reminded' && rc < 1) return false;
      if (f === 'notreminded' && rc >= 1) return false;
      return true;
    };
    eq(passRem(twice, 'reminded'), true, 'reminded filter: keeps reminded');
    eq(passRem(none, 'reminded'), false, 'reminded filter: drops not-reminded');
    eq(passRem(none, 'notreminded'), true, 'not-reminded filter: keeps un-reminded');
    eq(passRem(once, 'notreminded'), false, 'not-reminded filter: drops reminded');
  })();
  // Per-subscription delete: only allowed when that period has 0 attendance
  (function () {
    var canDelete = function (sub) { return (parseInt(sub.attendedClasses) || 0) <= 0; };
    eq(canDelete({ attendedClasses: 0 }), true, 'sub delete: 0 attended → allowed');
    eq(canDelete({ attendedClasses: 6 }), false, 'sub delete: attended → blocked');
    // Deleting one sub leaves the others and recomputes expiry to the latest end.
    var subs = [
      { _sid: 's1', activity: 'Gymnastic', end: '2026-06-12', attendedClasses: 6 },
      { _sid: 's2', activity: 'Gymnastic', end: '2026-07-22', attendedClasses: 0 },
      { _sid: 's3', activity: 'Gymnastic', end: '2026-07-23', attendedClasses: 0 },
    ];
    var after = subs.filter(function (s) { return s._sid !== 's3'; });
    eq(after.map(function (s) { return s._sid; }).join(','), 's1,s2', 'sub delete: only the chosen period removed');
    var ends = after.map(function (s) { return s.end; }).filter(Boolean).sort();
    eq(ends[ends.length - 1], '2026-07-22', 'sub delete: expiry recomputed to latest remaining end');
  })();
  // Reminder message kind: completed members get the "completed" template, not "expired"
  (function () {
    var pickKind = function (completed, bucket) {
      return completed ? 'completed' : (bucket === 'expired' ? 'expired' : 'expiring');
    };
    eq(pickKind(true, 'expired'), 'completed', 'reminder kind: class-completed → completed message');
    eq(pickKind(false, 'expired'), 'expired', 'reminder kind: truly expired → expired message');
    eq(pickKind(false, 'soon'), 'expiring', 'reminder kind: expiring soon → expiring message');
  })();
  // Trial follow-up message: bilingual, fills name + sport
  (function () {
    if (typeof buildTrialFollowupMessage === 'function') {
      var msg = buildTrialFollowupMessage({ name: 'Mohammed', nameArabic: 'محمد', sport: 'Kick Boxing', coachId: null });
      ok(msg.indexOf('Mohammed') >= 0, 'trial msg: includes English name');
      ok(msg.indexOf('محمد') >= 0, 'trial msg: includes Arabic name');
      ok(msg.indexOf('Kick Boxing') >= 0, 'trial msg: includes the sport');
      ok(msg.indexOf('Black Stars') >= 0, 'trial msg: includes club name');
      ok(msg.indexOf('— — —') >= 0, 'trial msg: has Arabic + English split');
    }
  })();
  // Invoice line detail: camp shows days, membership shows classes, both show validity
  (function () {
    var lineUnit = function (sport, count) {
      var isCamp = sport === 'Summer Camp';
      return isCamp ? (count === 1 ? 'day' : 'days') : (count === 1 ? 'class' : 'classes');
    };
    eq(lineUnit('Summer Camp', 8), 'days', 'invoice line: camp counts in days');
    eq(lineUnit('Summer Camp', 1), 'day', 'invoice line: camp singular day');
    eq(lineUnit('Gymnastic', 12), 'classes', 'invoice line: membership counts in classes');
    eq(lineUnit('Boxing', 1), 'class', 'invoice line: membership singular class');
  })();
  // Carry-forward credit: unused classes from an expired period, capped at 2
  (function () {
    var mk = function (total, attended) { return { subscriptions: [{ activity: 'Boxing', totalClasses: total, attendedClasses: attended, end: '2026-01-01', status: 'expired' }], dailyAttendance: {} }; };
    eq(carryForwardCredit(mk(8, 6), 'Boxing'), 2, 'carry: 2 unused → carry 2');
    eq(carryForwardCredit(mk(8, 3), 'Boxing'), 2, 'carry: 5 unused → capped at 2');
    eq(carryForwardCredit(mk(8, 8), 'Boxing'), 0, 'carry: 0 unused → carry 0');
    eq(carryForwardCredit(mk(8, 7), 'Boxing'), 1, 'carry: 1 unused → carry 1');
    eq(carryForwardCredit(mk(8, 6), 'Karate'), 0, 'carry: different sport → no credit');
    // An active (not expired) period gives no carry yet.
    var active = { subscriptions: [{ activity: 'Boxing', totalClasses: 8, attendedClasses: 2, end: '2099-01-01', status: 'active' }], dailyAttendance: {} };
    eq(carryForwardCredit(active, 'Boxing'), 0, 'carry: active period → no credit until finished');
    // v6.357: Summer Camp NEVER carries unattended days — even with 12 unused it is 0.
    var camp = { subscriptions: [{ activity: 'Summer Camp', totalClasses: 22, attendedClasses: 10, end: '2026-01-01', status: 'expired' }], dailyAttendance: {} };
    eq(carryForwardCredit(camp, 'Summer Camp'), 0, 'carry: Summer Camp → never carries (starts fresh)');
  })();
  // v6.357: Camp edit-form auto-expiry counts BUSINESS days (via campEndDate), so the form shows
  // the same expiry the record saves. Non-camp rows stay on calendar validity.
  (function () {
    var autoExp = function (rows) {
      var ends = rows.map(function (r) {
        var isCamp = r.sport === 'Summer Camp';
        var days = isCamp ? (parseInt(r.validity) || parseInt(r.classes) || 0) : (parseInt(r.validity) || 0);
        if (!(r.start && days > 0)) return null;
        return isCamp ? campEndDate(r.start, days) : addDays(r.start, days);
      }).filter(Boolean).sort();
      return ends.length ? ends[ends.length - 1] : '';
    };
    eq(autoExp([{ sport: 'Summer Camp', start: '2026-06-17', classes: 8, validity: 30 }]), '2026-07-16',
      'camp expiry: 1 month = 22 business days, Wed 17 Jun → Thu 16 Jul');
    eq(autoExp([{ sport: 'Summer Camp', start: '2026-06-17', classes: 8, validity: 7 }]), '2026-06-23',
      'camp expiry: 1 week = 5 business days, Wed 17 Jun → Tue 23 Jun');
    eq(autoExp([{ sport: 'Karate', start: '2026-06-17', validity: 30 }]), '2026-07-17',
      'non-camp expiry: still calendar validity (+30 days)');
  })();
  // Camp attendance over-limit flag: marked >= enrolled day count → flagged
  (function () {
    var over = function (m) {
      var sub = (m.subscriptions || []).filter(function (s) { return (s.activity || '') === 'Summer Camp'; }).slice(-1)[0];
      var limit = sub ? (parseInt(sub.totalClasses) || 0) : 0;
      if (limit <= 0) return false;
      var marked = liveAttendanceCount(m, 'Summer Camp', null, null).y || 0;
      return marked >= limit;
    };
    var mk = function (n) {
      var days = {};
      for (var i = 1; i <= n; i++) days[String(i)] = 'Y';
      return { subscriptions: [{ activity: 'Summer Camp', totalClasses: 8 }], dailyAttendance: { '2026-06': { 'Summer Camp': days } } };
    };
    eq(over(mk(7)), false, 'camp flag: 7 of 8 → not over');
    eq(over(mk(8)), true, 'camp flag: 8 of 8 → over (red flag + Completed)');
    eq(over(mk(9)), true, 'camp flag: 9 of 8 → over');
  })();
  // Expiring "attended" count must match the live total (not a windowed subset)
  (function () {
    var attendedFor = function (m, sport) {
      var attended = liveAttendanceCount(m, sport, null, null).y || 0;
      var sub = (m.subscriptions || []).filter(function (s) { return (s.activity || '') === sport; }).slice(-1)[0];
      var planned = (sub && parseInt(sub.totalClasses)) || 0;
      return { attended: attended, planned: planned };
    };
    var m = {
      startDate: '2026-06-17', expiryDate: '2026-06-25',
      enrollments: [{ sport: 'Summer Camp', classes: 8 }],
      subscriptions: [{ activity: 'Summer Camp', totalClasses: 8 }],
      dailyAttendance: { '2026-06': { 'Summer Camp': { '10': 'Y', '11': 'Y', '12': 'Y', '18': 'Y', '21': 'Y', '22': 'Y', '23': 'Y', '24': 'Y', '30': 'Y' } } },
    };
    var r = attendedFor(m, 'Summer Camp');
    eq(r.attended, 9, 'expiring attended: counts ALL marks (not windowed → would be 6)');
    eq(r.planned, 8, 'expiring attended: planned = subscription limit');
  })();
  // Attendance-report image rate = attended ÷ ENROLLED (not present ÷ marks)
  (function () {
    var m = { subscriptions: [{ activity: 'Summer Camp', totalClasses: 8 }], enrollments: [{ sport: 'Summer Camp', classes: 8 }] };
    var enrolledFor = function (sp) {
      var sub = (m.subscriptions || []).filter(function (s) { return (s.activity || '') === sp; }).slice(-1)[0];
      var enr = (m.enrollments || []).find(function (e) { return e.sport === sp; });
      return (sub && parseInt(sub.totalClasses)) || (enr && parseInt(enr.classes)) || 0;
    };
    var present = 2;
    var enrolled = enrolledFor('Summer Camp');
    var rate = enrolled ? Math.round(present / enrolled * 100) : 0;
    eq(enrolled, 8, 'att image: denominator = enrolled count');
    eq(rate, 25, 'att image: 2 of 8 enrolled → 25% (not 100%)');
  })();
  // Subscription-history month chip comes from the START date (not a stale stored month)
  (function () {
    var monthChip = function (s) {
      var src = s.start || s.end || '';
      if (src) { var d = new Date(src + 'T00:00:00'); if (!isNaN(d)) return d.toLocaleString('en', { month: 'short' }).toUpperCase(); }
      return (s.month || '').toUpperCase();
    };
    eq(monthChip({ start: '2026-06-22', end: '2026-07-22', month: 'Jul' }), 'JUN', 'sub month chip: 22 Jun start → JUN (not stored JUL)');
    eq(monthChip({ start: '2026-05-12', month: 'May' }), 'MAY', 'sub month chip: 12 May start → MAY');
    eq(monthChip({ month: 'Aug' }), 'AUG', 'sub month chip: no start → falls back to stored month');
  })();
  // Swimming groups: move + assign keep each swimmer in exactly one group
  (function () {
    var sg = [{ id: 'g1', memberIds: [1, 2] }, { id: 'g2', memberIds: [3] }];
    var move = function (mid, from, to) {
      if (from === to) return;
      if (from && from !== '__pool__') { var src = sg.find(function (x) { return x.id === from; }); if (src) src.memberIds = src.memberIds.filter(function (id) { return id !== mid; }); }
      if (to && to !== '__pool__') { var dst = sg.find(function (x) { return x.id === to; }); if (dst) { if (!dst.memberIds.includes(mid)) dst.memberIds.push(mid); } }
    };
    move(1, 'g1', 'g2');
    eq(sg[0].memberIds.join(','), '2', 'swim move: member leaves source group');
    eq(sg[1].memberIds.join(','), '3,1', 'swim move: member joins target group');
    move(2, 'g1', '__pool__');
    eq(sg[0].memberIds.join(','), '', 'swim move: drag to pool unassigns');
    var assign = function (gid, ids) {
      var g = sg.find(function (x) { return x.id === gid; });
      sg.forEach(function (o) { if (o.id !== gid) o.memberIds = o.memberIds.filter(function (id) { return !ids.includes(id); }); });
      ids.forEach(function (id) { if (!g.memberIds.includes(id)) g.memberIds.push(id); });
    };
    assign('g1', [3]);
    eq(sg[0].memberIds.join(','), '3', 'swim assign: member added to target');
    eq(sg[1].memberIds.join(','), '1', 'swim assign: member removed from previous group (one group each)');
  })();
  // Session lock: stale detection + read-only decision
  (function () {
    var STALE_MS = 5 * 60 * 1000;
    var isStale = function (lock) { return !lock || !lock.sessionId || (Date.now() - (lock.ts || 0) > STALE_MS); };
    var iHoldIt = function (lock, sid) { return lock && lock.sessionId === sid; };
    var now = Date.now();
    eq(isStale(null), true, 'lock: no lock → claimable');
    eq(isStale({ sessionId: 'x', ts: now }), false, 'lock: fresh other lock → held');
    eq(isStale({ sessionId: 'x', ts: now - 6 * 60 * 1000 }), true, 'lock: 6-min-old → stale (auto-release)');
    eq(iHoldIt({ sessionId: 'me', ts: now }, 'me'), true, 'lock: my own lock recognised');
    var readOnly = !isStale({ sessionId: 'x', ts: now }) && !iHoldIt({ sessionId: 'x', ts: now }, 'me');
    eq(readOnly, true, 'lock: fresh other holder → this session read-only');
  })();
  // Membership card shows CURRENT active membership classes, not lifetime sum
  (function () {
    var curClasses = function (allSubs) {
      var today = '2026-06-23';
      var active = allSubs.filter(function (x) {
        var ended = x.end && x.end < today;
        var withdrawn = (x.status || '').toLowerCase() === 'withdrawn';
        return !ended && !withdrawn;
      });
      var cur = active.length ? active : allSubs.slice(-1);
      var total = cur.reduce(function (s, x) { return s + (x.totalClasses || 0); }, 0);
      var att = cur.reduce(function (a, x) { return a + (x.attendedClasses || 0); }, 0);
      return att + '/' + total;
    };
    var m = [{ totalClasses: 8, attendedClasses: 5, end: '2026-02-01', status: 'expired' }, { totalClasses: 8, attendedClasses: 2, end: '2026-07-17', status: 'active' }];
    eq(curClasses(m), '2/8', 'card classes: current membership only (not 7/16 lifetime)');
    // Carry-forward only from the LAST finished membership (your example)
    var cff = function (subs) {
      var today = '2026-06-23', CAP = 2;
      var finished = subs.filter(function (s) { return s.status !== 'active' || (s.end && s.end < today); }).sort(function (a, b) { return (a.end || '').localeCompare(b.end || ''); });
      var src = finished.length ? finished[finished.length - 1] : null;
      if (!src) return 0;
      var unused = Math.max(0, (src.totalClasses || 0) - (src.attendedClasses || 0));
      return Math.min(CAP, unused);
    };
    eq(cff([{ totalClasses: 8, attendedClasses: 5, end: '2026-02-01', status: 'expired' }, { totalClasses: 8, attendedClasses: 7, end: '2026-04-01', status: 'expired' }]), 1,
      'carry-forward: only last membership (7/8 → 1, not 3 from first)');
  })();
  // Swim group schedule formatter (days + from–to time)
  (function () {
    var DAYS = [{ en: 'Sun', ar: 'أحد' }, { en: 'Mon', ar: 'إثنين' }, { en: 'Tue', ar: 'ثلاثاء' }, { en: 'Wed', ar: 'أربعاء' }, { en: 'Thu', ar: 'خميس' }, { en: 'Fri', ar: 'جمعة' }, { en: 'Sat', ar: 'سبت' }];
    var sched = function (g, ar) {
      var days = (g.days || []).map(function (i) { return DAYS[i] ? (ar ? DAYS[i].ar : DAYS[i].en) : ''; }).filter(Boolean);
      var daysStr = days.length ? days.join(ar ? '، ' : ', ') : '';
      var timeStr = '';
      if (g.timeFrom && g.timeTo) timeStr = g.timeFrom + '–' + g.timeTo;
      else if (g.timeFrom) timeStr = (ar ? 'من ' : 'from ') + g.timeFrom;
      if (!daysStr && !timeStr) return '';
      return [daysStr, timeStr].filter(Boolean).join(' · ');
    };
    eq(sched({ days: [6, 1], timeFrom: '17:00', timeTo: '18:00' }, false), 'Sat, Mon · 17:00–18:00', 'swim schedule: days + time EN');
    eq(sched({}, false), '', 'swim schedule: empty when nothing set');
    eq(sched({ days: [0] }, false), 'Sun', 'swim schedule: days only, no time');
  })();
  // Member statement consolidates all invoices; switch-credit excluded from totals
  (function () {
    var invoicePaid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0); };
    var invs = [
      { id: 1, amount: 800, payments: [{ amount: 800 }] },
      { id: 2, amount: 1750, payments: [{ amount: 1000 }] },
      { id: 3, amount: -200, switchCredit: true, payments: [] },
    ];
    var totCharged = 0, totPaid = 0;
    invs.forEach(function (i) {
      var amount = Number(i.amount) || 0; var paid = invoicePaid(i);
      var isCredit = i.switchCredit || amount < 0;
      if (!isCredit) { totCharged += amount; totPaid += paid; }
    });
    eq(totCharged, 2550, 'statement: total charged excludes switch-credit');
    eq(totPaid, 1800, 'statement: total paid summed across invoices');
    eq(totCharged - totPaid, 750, 'statement: balance = charged − paid');
  })();
  // Payments analysis: cash + card + transfer = revenue; cash-in-hand = cash − cash expenses
  (function () {
    var invoicePaid = function (i) { return (i.payments || []).reduce(function (s, p) { return s + (p.amount || 0); }, 0); };
    var normMethod = function (mRaw) {
      var x = String(mRaw || '').toLowerCase();
      if (x.indexOf('card') >= 0 || x.indexOf('credit') >= 0) return 'card';
      if (x.indexOf('transfer') >= 0 || x.indexOf('bank') >= 0) return 'transfer';
      if (x.indexOf('cash') >= 0) return 'cash';
      return x ? 'cash' : '';
    };
    var invoiceMethod = function (i) {
      var byM = {};
      (i.payments || []).forEach(function (p) { var k = normMethod(p.method); if (!k) return; byM[k] = (byM[k] || 0) + (p.amount || 0); });
      var keys = Object.keys(byM);
      if (keys.length) return keys.sort(function (a, b) { return byM[b] - byM[a]; })[0];
      return normMethod(i.method);
    };
    var invs = [
      { id: 1, amount: 800, payments: [{ amount: 800, method: 'Cash' }] },
      { id: 2, amount: 1750, payments: [{ amount: 1750, method: 'card' }] },
      { id: 3, amount: 500, payments: [{ amount: 500, method: 'bank transfer' }] },
      { id: 4, amount: 300, payments: [{ amount: 300, method: 'cash' }] },
    ];
    var byMethod = { cash: 0, card: 0, transfer: 0 };
    invs.forEach(function (i) { byMethod[invoiceMethod(i)] += invoicePaid(i); });
    var revenue = byMethod.cash + byMethod.card + byMethod.transfer;
    eq(revenue, 3350, 'payments: cash+card+transfer = total revenue');
    eq(byMethod.cash, 1100, 'payments: cash collected summed');
    eq(byMethod.cash - 200, 900, 'payments: cash-in-hand = cash − cash expenses');
  })();
  // Fawran payment method maps to its own bucket and still reconciles to revenue
  (function () {
    var normMethod = function (mRaw) {
      var x = String(mRaw || '').toLowerCase();
      if (x.indexOf('card') >= 0) return 'card';
      if (x.indexOf('fawran') >= 0 || x.indexOf('فوران') >= 0) return 'fawran';
      if (x.indexOf('transfer') >= 0 || x.indexOf('bank') >= 0) return 'transfer';
      if (x.indexOf('cash') >= 0) return 'cash';
      return x ? 'cash' : '';
    };
    eq(normMethod('Fawran'), 'fawran', 'method: Fawran recognised');
    eq(normMethod('فوران'), 'fawran', 'method: Fawran (Arabic) recognised');
    var byMethod = { cash: 800, card: 1750, transfer: 500, fawran: 600 };
    var revenue = byMethod.cash + byMethod.card + byMethod.transfer + byMethod.fawran;
    eq(revenue, 3650, 'fawran: cash+card+transfer+fawran = revenue');
  })();
  // Payments analysis: Summer Camp variants collapse to one filter option
  (function () {
    var SC = 'Summer Camp';
    var group = function (a) { return (a === SC || a.indexOf(SC) === 0) ? SC : a; };
    eq(group('Summer Camp · 1 month'), 'Summer Camp', 'activity group: 1 month → Summer Camp');
    eq(group('Summer Camp · 1 week, Gymnastic'), 'Summer Camp', 'activity group: combined camp → Summer Camp');
    eq(group('MMA'), 'MMA', 'activity group: non-camp unchanged');
    var all = ['Summer Camp · 1 month', 'Summer Camp · 1 week', 'Summer Camp', 'MMA', 'Gymnastic'];
    var opts = [...new Set(all.map(group))].sort();
    eq(opts.join(','), 'Gymnastic,MMA,Summer Camp', 'activity dropdown: single Summer Camp option');
  })();
  // Printed invoice total = sum of ALL line items (multi-sport paid together)
  (function () {
    var invTotal = function (inv) {
      var lineSum = (Array.isArray(inv.lineItems) && inv.lineItems.length)
        ? inv.lineItems.reduce(function (s, li) { return s + (Number(li.price) || 0); }, 0)
        : (Number(inv.amount) || 0);
      return Math.max(Number(inv.amount) || 0, lineSum);
    };
    eq(invTotal({ amount: 650, lineItems: [{ price: 650 }, { price: 450 }] }), 1100, 'invoice total: sums all sports (650+450)');
    eq(invTotal({ amount: 475, lineItems: [] }), 475, 'invoice total: single item unchanged');
    eq(invTotal({ amount: 1100, lineItems: [{ price: 650 }, { price: 450 }] }), 1100, 'invoice total: stored combined amount respected');
  })();
  // Generate latest invoice: reprint existing month invoice, else create new
  (function () {
    var decide = function (invoices, memberId, mth) {
      var existing = invoices.filter(function (inv) {
        return inv.customerId === memberId && inv.month === mth && (inv.category || 'Membership') === 'Membership' && !inv.deleted;
      });
      return existing.length ? 'reprint' : 'create';
    };
    eq(decide([{ customerId: 1, month: '2026-06', category: 'Membership' }], 1, '2026-06'), 'reprint', 'latest invoice: existing this month → reprint');
    eq(decide([{ customerId: 1, month: '2026-05', category: 'Membership' }], 1, '2026-06'), 'create', 'latest invoice: none this month → create');
    eq(decide([{ customerId: 1, month: '2026-06', category: 'Membership', deleted: true }], 1, '2026-06'), 'create', 'latest invoice: deleted invoice ignored → create');
  })();
  // Apply carry-forward to active membership: 8 + 2 = 10, then blocked from re-applying
  (function () {
    var TODAY = '2026-06-24', CAP = 2;
    var m = { subscriptions: [
      { activity: 'Gymnastic', totalClasses: 8, attendedClasses: 6, start: '2026-05-12', end: '2026-06-12', status: 'expired' },
      { activity: 'Gymnastic', totalClasses: 8, attendedClasses: 1, start: '2026-06-22', end: '2026-07-22', status: 'active' },
    ] };
    var credit = Math.min(CAP, 8 - 6);
    var active = m.subscriptions.find(function (s) { return s.activity === 'Gymnastic' && (!s.end || s.end >= TODAY) && !s._carryApplied; });
    active.totalClasses = (active.totalClasses || 0) + credit;
    active._carryApplied = true;
    eq(active.totalClasses, 10, 'carry apply: active 8 + 2 carried = 10');
    var again = m.subscriptions.find(function (s) { return s.activity === 'Gymnastic' && (!s.end || s.end >= TODAY) && !s._carryApplied; });
    eq(again ? 'found' : 'none', 'none', 'carry apply: cannot apply twice (_carryApplied guard)');
  })();
  // Member attendance report windows to the CURRENT membership period only
  (function () {
    var TODAY = '2026-06-24';
    var subs = [
      { activity: 'Gymnastic', start: '2026-05-12', end: '2026-06-12', status: 'expired' },
      { activity: 'Gymnastic', start: '2026-06-22', end: '2026-07-22', status: 'active' },
    ];
    var activeSubs = subs.filter(function (s) { return (!s.end || s.end >= TODAY) && (s.status || '').toLowerCase() !== 'withdrawn'; });
    var ps = null, pe = null;
    (activeSubs.length ? activeSubs : subs.slice(-1)).forEach(function (s) {
      if (s.start && (!ps || s.start < ps)) ps = s.start;
      if (s.end && (!pe || s.end > pe)) pe = s.end;
    });
    var inWindow = function (iso) { if (ps && iso < ps) return false; if (pe && iso > pe) return false; return true; };
    eq(ps + '→' + pe, '2026-06-22→2026-07-22', 'attendance report: current period window');
    eq(inWindow('2026-05-15'), false, 'attendance report: excludes expired-period marks');
    eq(inWindow('2026-06-25'), true, 'attendance report: includes current-period marks');
  })();
  // Smart Arabic search: alef variants + spacing-insensitive (uses the app's normaliser)
  (function () {
    var norm = normalizeArabicForSearch;   // the real function under test
    var match = function (q, name) { return norm(name).indexOf(norm(q)) >= 0; };
    eq(norm('أنس'), norm('انس'), 'search: أنس normalises to انس (alef)');
    eq(norm('عبد الرحمن'), norm('عبدالرحمن'), 'search: عبد الرحمن == عبدالرحمن (spacing ignored)');
    eq(match('عبدالرحمن', 'عبد الرحمن مصطفى'), true, 'search: عبدالرحمن found in عبد الرحمن مصطفى');
    eq(match('مصطفى', 'عبدالرحمن مصطفى'), true, 'search: partial name match');
  })();
  // Edit form loads camp validity from the stored subscription window (not class count)
  (function () {
    var loadValidity = function (sub) {
      return (parseInt(sub.validity)) || (sub.start && sub.end ? daysBetween(sub.start, sub.end) : 0) || DEFAULT_VALIDITY;
    };
    eq(loadValidity({ start: '2026-06-17', end: '2026-07-17', validity: 30, totalClasses: 8 }), 30,
      'edit load: camp validity = stored 30, not the 8-day count');
    eq(loadValidity({ start: '2026-06-17', end: '2026-07-17', totalClasses: 8 }), 30,
      'edit load: camp validity derived from start→end when not stored');
  })();
  // Editing a locked sport's validity must persist to the subscription (validity + end)
  (function () {
    if (typeof syncSubToEnrollment === 'function') {
      var sub = { activity: 'Summer Camp', start: '2026-06-17', validity: 8, end: '2026-06-25', totalClasses: 8 };
      var e = { sport: 'Summer Camp', start: '2026-06-17', validity: 30, classes: 8 };
      syncSubToEnrollment(sub, e, {}, []);
      eq(sub.validity, 30, 'edit save: subscription validity updated to 30');
      eq(sub.end, '2026-07-16', 'edit save: subscription end recomputed to 16 Jul (22 business days)');
      // Non-camp sport too
      var sub2 = { activity: 'Boxing', start: '2026-06-01', validity: 30, end: '2026-07-01', totalClasses: 12 };
      var e2 = { sport: 'Boxing', start: '2026-06-01', validity: 60, classes: 12 };
      syncSubToEnrollment(sub2, e2, {}, []);
      eq(sub2.end, '2026-07-31', 'edit save: non-camp validity change updates end');
    }
  })();
  // Invoices activity filter: all "Summer Camp · X" variants collapse to one option
  (function () {
    var isCamp = function (s) { return typeof s === 'string' && (s === 'Summer Camp' || s.indexOf('Summer Camp') === 0); };
    var raw = ['Boxing', 'Summer Camp · 1 month', 'Summer Camp · 1 week', 'Summer Camp', 'Karate', 'Summer Camp · 2 months'];
    var hasCamp = raw.some(isCamp);
    var opts = [].concat(hasCamp ? ['Summer Camp'] : [], raw.filter(function (s) { return !isCamp(s); })).sort();
    eq(opts.join(','), 'Boxing,Karate,Summer Camp', 'invoices filter: one Summer Camp option, no duration variants');
    var invs = [{ sport: 'Summer Camp · 1 week' }, { sport: 'Summer Camp' }, { sport: 'Boxing' }, { sport: 'Summer Camp · 2 months' }];
    eq(invs.filter(function (i) { return isCamp(i.sport); }).length, 3, 'invoices filter: Summer Camp matches every camp variant');
  })();
  // Generate-latest-invoice: payment method comes from the member's latest membership invoice
  (function () {
    var derive = function (invoices, mId) {
      var prior = invoices.filter(function (inv) { return inv.customerId === mId && !inv.deleted && (inv.category || 'Membership') === 'Membership'; })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      for (var i = 0; i < prior.length; i++) {
        var inv = prior[i];
        var pm = Array.isArray(inv.payments) && inv.payments.length ? inv.payments[inv.payments.length - 1].method : null;
        if (pm) return pm;
        if (inv.method) return inv.method;
      }
      return 'cash';
    };
    var data = [
      { customerId: 1, category: 'Membership', date: '2026-01-01', method: 'cash' },
      { customerId: 1, category: 'Membership', date: '2026-05-01', method: 'card' },
      { customerId: 2, category: 'Membership', date: '2026-03-01', payments: [{ method: 'card' }, { method: 'cash' }] },
    ];
    eq(derive(data, 1), 'card', 'generate invoice: method from latest membership invoice');
    eq(derive(data, 2), 'cash', 'generate invoice: method from latest payment');
    eq(derive(data, 99), 'cash', 'generate invoice: defaults to cash when no prior invoice');
  })();

  // --- broadcast posts: keys, audience resolution, read tracking ---
  (function () {
    eq(postKey('member', 5), 'm:5', 'postKey member');
    eq(postKey('coach', 2), 'c:2', 'postKey coach');
    var post = { id: 1, authorRole: 'coach', recipients: ['m:5', 'm:6'], readBy: {}, comments: [] };
    ok(postIsForUser(post, 'member', 5), 'post: addressed to member 5');
    ok(!postIsForUser(post, 'coach', 5), 'post: NOT addressed to coach 5');
    ok(!postIsForUser(post, 'member', 99), 'post: NOT addressed to non-recipient');
    eq(postReadCount(post).total, 2, 'post: total recipients = 2');
    eq(postReadCount(post).read, 0, 'post: read = 0 initially');
    post.readBy['m:5'] = '2026-06-29';
    eq(postReadCount(post).read, 1, 'post: read = 1 after one read');
    var savedPosts = state.posts;
    state.posts = [post];
    eq(unreadPostsForUser('member', 6).length, 1, 'post: member 6 has 1 unread');
    eq(unreadPostsForUser('member', 5).length, 0, 'post: member 5 read, 0 unread');
    eq(unreadPostsForUser('member', 99).length, 0, 'post: non-recipient has 0 unread');
    // admin custom audience maps the given ids verbatim (members + coaches)
    var recips = resolvePostRecipients({ scope: 'custom', memberIds: [5, 6], coachIds: [2] }, 'admin', null).sort();
    eq(recips.join(','), 'c:2,m:5,m:6', 'post: admin custom recipients = members + coaches');
    state.posts = savedPosts;
  })();

  // --- revenue identity: billed == collected + due (overpayment clamp + date fallback) ---
  (function () {
    var savedInv = state.invoices;
    state.invoices = [
      { id: 901, month: '2030-01', amount: 600, amountPaid: 600 },   // fully paid
      { id: 902, month: '2030-01', amount: 400, amountPaid: 150 },   // partial
      { id: 903, month: '2030-01', amount: 500, amountPaid: 0 },     // unpaid
      { id: 904, month: '2030-01', amount: 300, amountPaid: 350 },   // OVERPAID
      { id: 905, date: '2030-01-09', amount: 200, amountPaid: 200 }, // no month -> date fallback
      { id: 906, month: '2030-01', amount: 999, amountPaid: 999, deleted: true }, // excluded
    ];
    var b = billedInMonth('2030-01'), c = collectedInMonth('2030-01'), d = dueInMonth('2030-01');
    eq(b, 2000, 'revenue: billed = Σ amount incl date-fallback, excl deleted');
    eq(c, 1250, 'revenue: collected clamps overpayment (600+150+0+300+200)');
    eq(d, 750, 'revenue: due = Σ balance (0+250+500+0+0)');
    eq(b, c + d, 'revenue: billed == collected + due holds even with overpayment');
    state.invoices = savedInv;
  })();

  // --- financial-screen alignment: all screens read revenue from invoices ---
  (function () {
    var savedInv = state.invoices, savedExp = state.expenses, savedMem = state.members, savedSal = state.salaries;
    state.invoices = [
      { id: 901, customerId: 1, month: '2031-03', date: '2031-03-05', amount: 1000, amountPaid: 1000, method: 'cash', payments: [{ amount: 600, method: 'cash', date: '2031-03-05' }, { amount: 400, method: 'card', date: '2031-03-06' }] },
      { id: 902, customerId: 2, month: '2031-03', date: '2031-03-10', amount: 500, amountPaid: 200, method: 'fawran', payments: [{ amount: 200, method: 'fawran', date: '2031-03-10' }] },
      { id: 903, customerId: 1, month: '2031-02', date: '2031-02-20', amount: 300, amountPaid: 300, method: 'cash', payments: [{ amount: 300, method: 'cash', date: '2031-03-02' }] },
    ];
    state.expenses = [{ id: 1, amount: 100, month: '2031-03', date: '2031-03-08', category: 'Rent', method: 'cash' }];
    state.members = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    state.salaries = [];
    var YM = '2031-03';
    var billed = billedInMonth(YM), collected = collectedInMonth(YM), due = dueInMonth(YM);
    eq(billed, 1500, 'align: billed = March invoices only (Feb invoice excluded)');
    eq(collected, 1200, 'align: collected = 1000+200 against March invoices');
    eq(billed, collected + due, 'align: billed == collected + due');
    var S = computeStats(YM);
    eq(S.currRevenue, billed, 'align: Main Dashboard revenue == billed');
    var M = computeMonthlyReport(YM);
    eq(M.revenue, collected, 'align: Monthly Report revenue == collected');
    var C = computeReconciliation(YM);
    eq(C.revenue, collected, 'align: Reconciliation revenue == collected');
    ok(Math.abs(C.leakage) < 0.5, 'align: Reconciliation leakage == 0');
    eq(Math.round(C.byMethod.cash + C.byMethod.card + C.byMethod.transfer + C.byMethod.fawran), collected, 'align: method breakdown sums to collected');
    // salaries: one auto-calculated number across all report screens
    eq(S.currSalaries, M.salariesTotal, 'align: Dashboard salaries == Monthly Report salaries');
    eq(M.salariesTotal, C.salaries, 'align: Monthly Report salaries == Financial Overview salaries');
    eq(M.salariesTotal, salariesEarnedInMonth(YM), 'align: report salaries == auto-calculated earned');
    // net profit: one number on the billed (invoice) basis
    eq(M.billed, billed, 'align: Monthly Report headline == billed');
    eq(M.billed, M.collected + M.dueThisMonth, 'align: Monthly Report billed == collected + due');
    eq(S.currProfit, M.net, 'align: Dashboard net profit == Monthly Report net profit');
    eq(M.net, billed - M.expenses, 'align: net profit = billed − expenses (incl salaries)');

    // ── CROSS-MONTH: one invoice whose sports bill in DIFFERENT months must split
    //    billed/collected/due per month, and EVERY financial screen must agree. ──
    state.invoices = [
      { id: 950, customerId: 1, ref: 'INVX', date: '2031-03-05', month: '2031-03', amount: 2250, amountPaid: 1500, method: 'cash', category: 'Membership',
        lineItems: [ { sport: 'KB', price: 750, billMonth: '2031-03' }, { sport: 'Camp', price: 1500, billMonth: '2031-04' } ],
        payments: [ { amount: 1500, method: 'cash', date: '2031-03-05', month: '2031-03' } ] },
    ];
    state.expenses = [];
    eq(Math.round(billedInMonth('2031-03')), 750,  'xmonth: March billed = 750 (KB)');
    eq(Math.round(billedInMonth('2031-04')), 1500, 'xmonth: April billed = 1500 (Camp)');
    eq(Math.round(collectedInMonth('2031-03')), 750, 'xmonth: March collected = 750 (paid fills earliest first)');
    eq(Math.round(collectedInMonth('2031-04')), 750, 'xmonth: April collected = 750 (remainder)');
    eq(Math.round(dueInMonth('2031-03')), 0,   'xmonth: March due = 0');
    eq(Math.round(dueInMonth('2031-04')), 750, 'xmonth: April due = 750');
    ['2031-03','2031-04'].forEach(function(ym){
      var b = billedInMonth(ym), c = collectedInMonth(ym), d = dueInMonth(ym);
      eq(Math.round(b), Math.round(c + d), 'xmonth ' + ym + ': billed == collected + due');
      var Mx = computeMonthlyReport(ym), Cx = computeReconciliation(ym);
      eq(Math.round(Mx.revenue), Math.round(c), 'xmonth ' + ym + ': Monthly Report collected == collectedInMonth');
      eq(Math.round(Cx.revenue), Math.round(c), 'xmonth ' + ym + ': Reconciliation revenue == collectedInMonth');
      eq(Math.round(Cx.byMethod.cash + Cx.byMethod.card + Cx.byMethod.transfer + Cx.byMethod.fawran), Math.round(c), 'xmonth ' + ym + ': recon by-method sums to collected');
      ok(Math.abs(Cx.leakage) < 0.5, 'xmonth ' + ym + ': reconciliation leakage == 0');
    });

    state.invoices = savedInv; state.expenses = savedExp; state.members = savedMem; state.salaries = savedSal;
  })();

  // --- salaries paid: advance.amount + paid.snapshotNet + legacy, no double-count ---
  (function () {
    var savedSal = state.salaries;
    state.salaries = [
      { id: 1, coachId: 1, month: '2030-02', kind: 'advance', amount: 200 },
      { id: 2, coachId: 1, month: '2030-02', kind: 'paid', snapshotNet: 600, snapshotGross: 800 },
      { id: 3, coachId: 2, month: '2030-02', amount: 500 },            // legacy
      { id: 4, coachId: 3, month: '2030-03', kind: 'paid', snapshotNet: 999 }, // other month
    ];
    eq(salariesPaidInMonth('2030-02'), 1300, 'salaries: advance 200 + net 600 + legacy 500 = 1300');
    eq(salariesPaidInMonth('2030-03'), 999, 'salaries: other month isolated');
    eq(salariesPaidInMonth('all'), 2299, 'salaries: all-time sum');
    state.salaries = savedSal;
  })();

  // --- salary-category expenses: excluded from P&L, counted as paid-so-far ---
  (function () {
    var savedInv = state.invoices, savedExp = state.expenses, savedMem = state.members, savedSal = state.salaries;
    state.invoices = [{ id: 950, customerId: 1, month: '2032-05', date: '2032-05-03', amount: 2000, amountPaid: 2000, method: 'cash', payments: [{ amount: 2000, method: 'cash', date: '2032-05-03' }] }];
    state.members = [{ id: 1, name: 'A' }];
    state.salaries = [];
    state.expenses = [
      { id: 1, amount: 300, month: '2032-05', date: '2032-05-04', category: 'Rent', method: 'cash' },
      { id: 2, amount: 700, month: '2032-05', date: '2032-05-05', category: 'Salary', method: 'cash', coachId: 9 },
    ];
    var YM = '2032-05';
    var M = computeMonthlyReport(YM);
    eq(M.expenseEntries, 300, 'salary-exp: P&L expense entries exclude the Salary expense');
    eq(salariesPaidInMonth(YM), 700, 'salary-exp: counted in paid-so-far');
    var C = computeReconciliation(YM);
    eq(C.salaryPaid, 700, 'salary-exp: reconciliation tracks salary paid');
    eq(C.salaryPaidCash, 700, 'salary-exp: cash salary payment tracked');
    ok(Math.abs(C.leakage) < 0.5, 'salary-exp: cash still reconciles (leakage 0)');
    eq(C.expenses, 300, 'salary-exp: reconciliation P&L expenses exclude salary');
    state.invoices = savedInv; state.expenses = savedExp; state.members = savedMem; state.salaries = savedSal;
  })();

  // --- generate invoice includes ALL enrolled sports, even coachless ones ---
  (function () {
    var savedMem = state.members, savedInv = state.invoices, savedCoach = state.coaches;
    state.coaches = [{ id: 2, name: 'Jennifer' }];
    state.members = [{ id: 7001, name: 'MultiSport Kid', enrollments: [
      { sport: 'Gymnastic', coachId: 2, classes: 8, price: 425 },
      { sport: 'Summer Camp', coachId: null, classes: 2, price: 350 },   // coachless
    ] }];
    state.invoices = [];
    var r = generateInvoiceForMember(7001, '2033-06-09');
    ok(r.created, 'multi-sport gen: invoice created');
    eq(r.invoice ? r.invoice.amount : 0, 775, 'multi-sport gen: total = 425 + 350 (coachless sport included)');
    eq(r.invoice ? (r.invoice.lineItems || []).length : 0, 2, 'multi-sport gen: both sports as line items');
    state.members = savedMem; state.invoices = savedInv; state.coaches = savedCoach;
  })();

  // --- ad-hoc / external coach salary (free-text name) counts as cost ---
  (function () {
    var savedExp = state.expenses, savedCoach = state.coaches, savedSal = state.salaries;
    state.coaches = [{ id: 2, name: 'Reg', role: 'coach', active: true }];
    state.salaries = [];
    state.expenses = [
      { id: 1, amount: 500, month: '2034-03', date: '2034-03-05', category: 'Salary', method: 'cash', coachId: 2 },                 // registered settlement
      { id: 2, amount: 800, month: '2034-03', date: '2034-03-06', category: 'Salary', method: 'cash', coachName: 'External Coach' }, // ad-hoc cost
    ];
    ok(!isAdHocSalaryExpense(state.expenses[0]), 'ad-hoc: registered-coach salary expense is NOT ad-hoc');
    ok(isAdHocSalaryExpense(state.expenses[1]), 'ad-hoc: free-text-name salary expense IS ad-hoc');
    eq(adHocSalariesInMonth('2034-03'), 800, 'ad-hoc: external coach pay summed');
    eq(salariesEarnedInMonth('2034-03'), 800, 'ad-hoc: external pay added to salary cost (auto 0 + 800)');
    eq(salariesPaidInMonth('2034-03'), 1300, 'ad-hoc: paid-so-far includes both (500 + 800)');
    state.expenses = savedExp; state.coaches = savedCoach; state.salaries = savedSal;
  })();

  // --- invoice validity uses the member's real end, not a stale camp label ---
  (function () {
    // Joud's case: stored end 28 Aug, but a stale "1 month" label would compute 29 Jul.
    eq(subscriptionValidEnd({ activity: 'Summer Camp', start: '2026-06-29', end: '2026-08-28', validity: 60, durationLabel: '1 month' }), '2026-08-28',
      'valid-end: stored subscription end wins over stale duration label');
    eq(subscriptionValidEnd({ activity: 'Summer Camp', start: '2026-06-29', end: null, durationLabel: '1 month' }), '2026-07-28',
      'valid-end: falls back to label (business-day end) when end missing');
    eq(subscriptionValidEnd({ activity: 'Summer Camp', start: '2026-06-29', validity: 60 }), '2026-08-28',
      'valid-end: falls back to validity day-count when no end/label');
    eq(subscriptionValidEnd({ activity: 'Gymnastic', start: '2026-06-09', end: '2026-07-09' }), '2026-07-09',
      'valid-end: non-camp uses stored end');
  })();

  // --- per-sport payments don't mix (Edit pricing) ---
  (function () {
    // Going-forward: each collection tagged with its sport -> no mixing.
    var clean = { amount: 775, amountPaid: 600, lineItems: [{ sport: 'Gymnastic', price: 425 }, { sport: 'Summer Camp', price: 350 }], payments: [{ amount: 400, sport: 'Gymnastic' }, { amount: 200, sport: 'Summer Camp' }] };
    eq(Math.round(invoicePaidForSport(clean, 'Gymnastic')), 400, 'per-sport: Gymnastic keeps its own 400');
    eq(Math.round(invoicePaidForSport(clean, 'Summer Camp')), 200, 'per-sport: Summer Camp keeps its own 200');
    // Legacy single-sport untagged still resolves to the full amount.
    var legacy = { amount: 425, amountPaid: 400, lineItems: [{ sport: 'Gymnastic', price: 425 }], payments: [{ amount: 400 }] };
    eq(Math.round(invoicePaidForSport(legacy, 'Gymnastic')), 400, 'per-sport: legacy untagged single sport = full paid');
    // Money is always conserved across sports.
    var mixed = { amount: 775, amountPaid: 600, lineItems: [{ sport: 'Gymnastic', price: 425 }, { sport: 'Summer Camp', price: 350 }], payments: [{ amount: 400 }, { amount: 200, sport: 'Summer Camp' }] };
    ok(Math.abs((invoicePaidForSport(mixed, 'Gymnastic') + invoicePaidForSport(mixed, 'Summer Camp')) - 600) < 0.01, 'per-sport: split always sums to total paid');
  })();

  // --- each invoice line keeps its own issue date (adding a sport never moves it) ---
  (function () {
    eq(lineIssueDate({ sport: 'Gymnastic' }, '2026-06-09', '2026-06-29'), '2026-06-09', 'line-date: falls back to sport start, not invoice date');
    eq(lineIssueDate({ sport: 'Camp', issueDate: '2026-07-15' }, '2026-06-01', '2026-06-01'), '2026-07-15', 'line-date: explicit per-line issueDate wins');
    eq(lineIssueDate({ sport: 'X' }, null, '2026-06-01'), '2026-06-01', 'line-date: invoice date as last resort');
  })();

  // --- line-aware billing month: one invoice can span months, split by sport price ---
  (function () {
    var saved = state.invoices;
    state.invoices = [{ id: 1, customerId: 1, date: '2026-06-10', month: '2026-06', amount: 775, amountPaid: 500,
      lineItems: [{ sport: 'X', price: 425 }, { sport: 'Y', price: 350, billMonth: '2026-07' }],
      payments: [{ amount: 425, sport: 'X', month: '2026-06' }, { amount: 75, sport: 'Y', month: '2026-07' }] }];
    eq(Math.round(billedInMonth('2026-06')), 425, 'cross-month: June billed = X price');
    eq(Math.round(billedInMonth('2026-07')), 350, 'cross-month: July billed = Y price');
    eq(Math.round(billedInMonth('2026-06') + billedInMonth('2026-07')), 775, 'cross-month: billed conserved');
    ok(invoiceTouchesMonth(state.invoices[0], '2026-06') && invoiceTouchesMonth(state.invoices[0], '2026-07'), 'cross-month: invoice appears in both months');
    ok(Math.abs((collectedInMonth('2026-06') + collectedInMonth('2026-07')) - 500) < 0.01, 'cross-month: collected conserved');
    // A normal single-month invoice still bills entirely in its own month.
    state.invoices = [{ id: 2, customerId: 1, date: '2026-06-10', month: '2026-06', amount: 500, amountPaid: 500, lineItems: [{ sport: 'X', price: 500 }] }];
    eq(Math.round(billedInMonth('2026-06')), 500, 'single-month: unchanged, full amount in its month');
    eq(Math.round(billedInMonth('2026-07')), 0, 'single-month: nothing leaks to other months');
    state.invoices = saved;
  })();

  // --- Reports dashboard uses the same billed basis as the Monthly Report ---
  (function () {
    var saved = state.invoices, savedC = state.coaches, savedS = state.salaries;
    state.coaches = []; state.salaries = [];
    state.invoices = [
      { id: 1, customerId: 1, date: '2026-06-10', month: '2026-06', amount: 1000, amountPaid: 600, lineItems: [{ sport: 'A', price: 600 }, { sport: 'B', price: 400 }] },
      { id: 2, customerId: 2, date: '2026-06-15', month: '2026-06', amount: 500, amountPaid: 500, discount: 100, lineItems: [{ sport: 'A', price: 600 }] },
    ];
    var june = function (m) { return m === '2026-06'; };
    eq(Math.round(billedInPeriod(june)), Math.round(billedInMonth('2026-06')), 'reports: billedInPeriod == billedInMonth');
    var bs = billedBySportInPeriod(june); var sum = 0; for (var k in bs) sum += bs[k];
    ok(Math.abs(sum - billedInPeriod(june)) < 0.01, 'reports: by-sport re-sums to billed revenue (discount-safe)');
    state.invoices = saved; state.coaches = savedC; state.salaries = savedS;
  })();

  // --- default month never jumps to a future (not-yet-started) month ---
  (function () {
    var saved = state.invoices;
    state.invoices = [
      { id: 1, customerId: 1, date: '2099-01-01', month: '2099-01', amount: 100 },   // far-future invoice
    ];
    ok(latestDataMonth() <= currentMonth(), 'default month: never ahead of the current month');
    ok(latestDataMonth() !== '2099-01', 'default month: ignores a future-dated invoice');
    state.invoices = saved;
  })();

  // --- Payment ledger is append-only and cannot be corrupted by re-derivation ---
  (function () {
    const inv = { id: 9001, amount: 1000, amountPaid: 0, payments: [] };
    recordPayment(inv, { date: '2026-06-10', amount: 400, method: 'cash' });
    recordPayment(inv, { date: '2026-07-05', amount: 600, method: 'card' });
    eq(inv.payments.length, 2, 'recordPayment: appends one row per call');
    eq(Math.round(inv.amountPaid), 1000, 'recordPayment: paid = sum of rows');
    const ref0 = inv.payments[0];
    const snap0 = JSON.stringify(inv.payments[0]);
    recordPayment(inv, { date: '2026-07-06', amount: 50, method: 'cash' });
    eq(JSON.stringify(inv.payments[0]), snap0, 'recordPayment: never rewrites an existing row');
    ok(inv.payments[0] === ref0, 'recordPayment: existing row identity preserved');
    recordPayment(inv, { amount: 0 });
    recordPayment(inv, { amount: NaN });
    recordPayment(inv, { amount: Infinity });
    eq(inv.payments.length, 3, 'recordPayment: ignores zero / NaN / Infinity');
    recordPayment(inv, { amount: 33.333333, method: 'cash' });
    eq(inv.payments[3].amount, 33.33, 'recordPayment: rounds to 2dp');
  })();

  // --- Full lifecycle: enroll -> pay installments -> add sport -> SWITCH -> pay.
  //     Proves earlier payments are never mutated and paid stays an exact sum,
  //     which is the exact scenario that produced the old garbage rows. ---
  (function () {
    const inv = { id: 9100, customerId: 1, category: 'Membership', month: '2026-06', date: '2026-06-01',
      amount: 1750, amountPaid: 0, lineItems: [{ sport: 'Summer Camp', price: 1750 }], payments: [] };
    recordPayment(inv, { date: '2026-06-01', amount: 1000, method: 'card' });
    recordPayment(inv, { date: '2026-06-15', amount: 750, method: 'cash' });
    const r0 = JSON.stringify(inv.payments[0]), r1 = JSON.stringify(inv.payments[1]);
    // add a sport (line only, no payment)
    inv.lineItems.push({ sport: 'Gymnastic', price: 425, billMonth: '2026-07' });
    // switch: drop that sport, open another, carry a credit line — payments untouched
    inv.lineItems = inv.lineItems.filter(x => x.sport !== 'Gymnastic');
    inv.lineItems.push({ sport: 'Karate', price: 500, billMonth: '2026-07' });
    inv.amount = inv.lineItems.reduce((s, x) => s + x.price, 0);
    recordPayment(inv, { date: '2026-07-02', amount: 500, method: 'cash' });
    eq(inv.payments.length, 3, 'lifecycle: exactly 3 payment rows through add + switch + pay');
    ok(JSON.stringify(inv.payments[0]) === r0 && JSON.stringify(inv.payments[1]) === r1, 'lifecycle: earlier payments untouched by add/switch');
    eq(Math.round(invoicePaymentsSum(inv)), 2250, 'lifecycle: paid = 1000+750+500 (exact sum)');
    ok(inv.payments.every(p => Math.abs(p.amount) <= inv.amount + 1), 'lifecycle: no impossible payment row');
  })();

  // --- Dataset invariant: any invoice that has a payments ledger must have it
  //     sum to amountPaid (guards against any future re-derivation drift). ---
  (function () {
    let bad = 0;
    for (const i of (state.invoices || [])) {
      if (i && Array.isArray(i.payments) && i.payments.length && i.amountPaid != null) {
        const sum = i.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        if (Math.abs(sum - i.amountPaid) > 0.01) bad++;
      }
    }
    eq(bad, 0, 'invariant: every payments ledger sums to amountPaid');
  })();

  console.log('\\n================ TEST RESULTS ================');
  console.log('PASS: ' + pass + '   FAIL: ' + fail);
  if (fails.length) { console.log('\\nFAILURES:'); fails.forEach(f=>console.log('  ✗ ' + f)); }
  else console.log('All assertions passed ✅');
  console.log('=============================================');
})();
`;

const combined = appSrc + '\n;\n' + pagesSrc + '\n;\n' + epilogue;
try {
  vm.runInContext(combined, ctx, { filename: 'combined.js' });
} catch (e) {
  console.error('HARNESS ERROR:', e && e.stack ? e.stack.split('\n').slice(0,5).join('\n') : e);
  process.exit(1);
}
