// v6.509 — a member enrolled in the SAME sport with TWO coaches AT THE SAME TIME (v6.504) gets one
// attendance row per coach. Bug: both rows wrote the same cell (m.dailyAttendance[month][sport]), so
// marking one toggled BOTH. Fix: the first active coach keeps the plain `sport` key; each additional
// SIMULTANEOUS coach writes a per-coach key — so the two rows are independent. A sequential SWITCH
// (one completed + one active sub) still shares the `sport` key (its windows separate the days).
const H = require('./qc-harness.js');
const R = H.reporter('v6.509 · same-sport two-coach attendance cells');
const src = H.readSrc();

R.section('source wiring');
R.ok('attKeyForSport helper exists', /function attKeyForSport\(m, sport, coachId\)/.test(src));
R.ok('the first active coach keeps the plain sport key', /String\(coachId\) === coaches\[0\] \? sport :/.test(src));
R.ok('only >1 ACTIVE coaches trigger a per-coach key', /if \(coaches\.length < 2\) return sport;/.test(src));
R.ok('getRows attaches attKey to split rows', /attKey: attKeyForSport\(m, sp, cid\)/.test(src));
R.ok('the single-coach row uses the plain sport key', /rows\.push\(\{ m, sport: sp, coachId: rowCoachId, window: null, attKey: sp \}\)/.test(src));
R.ok('the grid reads/writes via attKey', /const aKey = attKey \|\| sport;/.test(src) && /cellRender\(m\.id, aKey,/.test(src));

R.section('runtime · the two coach rows target DIFFERENT cells');
{
  const ctx = H.makeCtx({ today: '2026-08-20', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.user={role:'admin'};state.session={role:'admin'};`);
  run(`state.coaches=[{id:11,name:'Aziz',active:'Y'},{id:1,name:'Abdel Salam',active:'Y'}];`);
  // ONE member, Kick Boxing with BOTH coaches, both active, overlapping period
  run(`state.members=[{id:9,name:'Ezz',sport:'Kick Boxing',coachId:11,expiryDate:'2026-12-01',
    subscriptions:[
      {activity:'Kick Boxing',coachId:11,totalClasses:8,status:'active',start:'2026-08-01',end:'2026-12-01'},
      {activity:'Kick Boxing',coachId:1,totalClasses:8,status:'active',start:'2026-08-01',end:'2026-12-01'}
    ],
    dailyAttendance:{'2026-08':{'Kick Boxing':{'17':'Y'}}}}];`);
  // stub the DOM so PAGES.attendance renders
  run(`globalThis.__sink={};
    function el(id){return {_id:id,set innerHTML(v){globalThis.__sink[id]=String(v);},get innerHTML(){return globalThis.__sink[id]||'';},textContent:'',value:'',style:{},dataset:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},removeEventListener(){},appendChild(){},setAttribute(){},focus(){},querySelector(){return el('q');},querySelectorAll(){return [];},closest(){return null;},getAttribute(){return null;}};}
    document.getElementById=(id)=>el(id);document.querySelector=(s)=>el(s);document.querySelectorAll=()=>[];window.$=document.querySelector;`);
  const out = run(`(function(){
    var main=(function(){var h='';return {set innerHTML(v){h=String(v);},get innerHTML(){return h;},querySelector(){return document.querySelector('x');},querySelectorAll(){return [];},addEventListener(){}};})();
    try{ PAGES.attendance(main);
      var tbl = Object.values(globalThis.__sink).join('\\n');
      // pull the _attMark(...) sport keys used by the cells
      var keys=[]; var re=/_attMark\\(9,\\s*'([^']*)'/g, mm;
      while((mm=re.exec(tbl))) keys.push(mm[1]);
      return {ok:true, keys:[...new Set(keys)]};
    }catch(e){ return {ok:false, err:e.message}; }
  })()`);
  R.ok('render succeeded', out.ok, JSON.stringify(out));
  R.ok('the two coach rows use TWO different attendance keys', out.ok && out.keys.length === 2, JSON.stringify(out.keys));
  R.ok('one key is the plain sport, the other is coach-qualified', out.ok && out.keys.includes('Kick Boxing') && out.keys.some(k => k !== 'Kick Boxing' && k.indexOf('Kick Boxing') === 0), JSON.stringify(out.keys));
}

R.done();
