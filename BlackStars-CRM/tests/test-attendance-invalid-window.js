// v6.557 — attendance must NEVER be hard-blocked. A day OUTSIDE a coach's computed period used to be
// a dead, non-clickable cell (muted "·", tooltip "outside <coach>'s period"), so the desk simply
// couldn't log a class — e.g. a switched member whose window dates are off (Ali: Abdel Salam → Aziz,
// the Aziz sub started later than the member actually attends). Fix: outside-period cells are now
// CLICKABLE with an amber warning + a reason tooltip. Marking writes THIS row's own key, so a
// two-coach member is not double-counted. Also, a corrupt window (from > to) is treated as open.
const H = require('./qc-harness.js');
const R = H.reporter('v6.557 · attendance is always markable (outside period → warn, not block)');
const src = H.readSrc();

R.section('source wiring');
R.ok('cellRender takes a warn/reason arg', /function cellRender\(memberId, sport, day, mark, warn\)/.test(src));
R.ok('a warned cell is still clickable (keeps the _attMark onclick)', /\$\{warn \? ' att-outside' : ''\}"\$\{style\}\$\{title\} onclick="window\._attMark/.test(src));
R.ok('outside-period days now render via cellRender WITH a reason (no dead cell)', /: cellRender\(m\.id, aKey, d, dayData\[String\(d\)\], `Outside \$\{coachName\(coachId\)\}/.test(src));
R.ok('the old dead "outside period" muted cell is gone', !/att-cell att-empty" style="opacity:\.2" title="outside /.test(src));
R.ok('inWin still treats a corrupt (from>to) window as open', /if \(win\.from && win\.to && win\.from > win\.to\) return true;/.test(src));

R.section('runtime · a day outside the coach period is CLICKABLE + carries a warning');
{
  const ctx = H.makeCtx({ today: '2026-09-03', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.user={role:'admin'};state.session={role:'admin'};`);
  run(`state.coaches=[{id:1,name:'Abdel Salam',active:'Y'},{id:2,name:'Aziz',active:'Y'}];`);
  // Aziz sub STARTS 06 Sep, so day 3 Sep is legitimately BEFORE his period → old code muted it dead.
  run(`state.members=[{id:9,name:'Ali',sport:'Kick Boxing',coachId:1,expiryDate:'2026-09-14',status:'Active',
    enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:550}],
    subscriptions:[
      {activity:'Kick Boxing',coachId:1,totalClasses:12,status:'active',start:'2026-08-15',end:'2026-09-14'},
      {activity:'Kick Boxing',coachId:2,totalClasses:2,status:'active',switchFunded:true,start:'2026-09-06',end:'2026-08-07'}
    ],
    dailyAttendance:{'2026-09':{'Kick Boxing':{},'Kick Boxing 2':{'6':'Y'}}}}];`);
  run(`state._forceDays=[3];`);
  run(`globalThis.__sink={};
    function el(id){return {_id:id,set innerHTML(v){globalThis.__sink[id]=String(v);},get innerHTML(){return globalThis.__sink[id]||'';},textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},removeEventListener(){},appendChild(){},setAttribute(){},focus(){},querySelector(){return el('q');},querySelectorAll(){return [];},closest(){return null;},getAttribute(){return null;}};}
    document.getElementById=(id)=>el(id);document.querySelector=(s)=>el(s);document.querySelectorAll=()=>[];window.$=document.querySelector;`);
  const out = run(`(function(){
    var main=(function(){var h='';return {set innerHTML(v){h=String(v);},get innerHTML(){return h;},querySelector(){return document.querySelector('x');},querySelectorAll(){return [];},addEventListener(){}};})();
    try{ PAGES.attendance(main);
      var tbl = Object.values(globalThis.__sink).join('\\n');
      // Every day cell (in or out of period) must be a clickable _attMark cell.
      var markCells = (tbl.match(/_attMark\\(9,/g)||[]).length;
      var deadOutside = /att-empty" style="opacity:\\.2" title="outside/.test(tbl);
      var warnedOutside = /att-outside/.test(tbl) && /Outside .*period for this membership/.test(tbl);
      return {ok:true, markCells:markCells, deadOutside:deadOutside, warnedOutside:warnedOutside};
    }catch(e){ return {ok:false, err:e.message}; }
  })()`);
  R.ok('attendance rendered', out.ok, JSON.stringify(out));
  R.ok('there are NO dead/non-clickable "outside period" cells', out.ok && !out.deadOutside, JSON.stringify(out));
  R.ok('at least one clickable mark cell exists on day 3 (both coach rows)', out.ok && out.markCells >= 1, JSON.stringify(out));
  R.ok('the outside-period cell carries the amber warning + reason', out.ok && out.warnedOutside, JSON.stringify(out));
}

R.done();
