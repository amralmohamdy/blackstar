// v6.516 — a coach with BOTH a short funded remainder (e.g. Aug 1–7) AND a live open-ended package
// (Aug 12 → ongoing, window.to = null) had their attendance window WRONGLY capped at the short one's
// end, because getRows' per-coach union skipped null bounds (`w.to && …`). Result: every later day
// showed "outside <coach>'s period" and couldn't be marked (Ali Salem Kick Boxing · Abdel Salam on
// Aug 22). Fix: a null bound means OPEN — one open-ended sub makes the whole coach union open.
const H = require('./qc-harness.js');
const R = H.reporter('v6.516 · union window treats null bound as open');
const src = H.readSrc();

R.section('source');
R.ok('union tracks open bounds (openStart/openEnd)', /let from = null, to = null, openStart = false, openEnd = false;/.test(src));
R.ok('a null to makes the coach window open-ended', /if \(w\.to == null\) openEnd = true;/.test(src));
R.ok('the pushed window respects the open flags', /window: \{ from: openStart \? null : from, to: openEnd \? null : to \}/.test(src));

R.section('runtime · Ali Salem (Iyad transferred + two Abdel subs incl. an open one)');
{
  const ctx = H.makeCtx({ today: '2026-08-22', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.user={role:'admin'};state.coaches=[{id:14,name:'Iyad',active:'N',role:'coach'},{id:1,name:'Abdel Salam',active:'Y',role:'coach'}];`);
  run(`state.members=[{id:9,name:'Ali Salem',sport:'Kick Boxing',coachId:1,expiryDate:'2026-09-11',
    enrollments:[{sport:'Kick Boxing',coachId:1,classes:12,price:500,start:'2026-08-12'}],
    subscriptions:[
      {activity:'Kick Boxing',coachId:14,coach:'Iyad',totalClasses:7,status:'completed',transferredToCoachId:1,start:'2026-07-08',end:'2026-08-07'},
      {activity:'Kick Boxing',coachId:1,coach:'Abdel Salam',totalClasses:12,status:'active',start:'2026-08-12',end:'2026-09-11'},
      {activity:'Kick Boxing',coachId:1,coach:'Abdel Salam',totalClasses:4,status:'active',switchFunded:true,start:'2026-08-01',end:'2026-08-07'}
    ],
    dailyAttendance:{'2026-07':{'Kick Boxing':{'11':'Y'}},'2026-08':{'Kick Boxing':{'3':'Y','15':'Y'}}}}];`);
  run(`globalThis.__sink={};function el(id){return {set innerHTML(v){globalThis.__sink[id]=String(v);},get innerHTML(){return globalThis.__sink[id]||'';},textContent:'',value:'',checked:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},focus(){},querySelector(){return el('q');},querySelectorAll(){return [];},closest(){return null;},getAttribute(){return null;}};}document.getElementById=id=>el(id);document.querySelector=s=>el(s);document.querySelectorAll=()=>[];window.$=document.querySelector;`);
  const html = run(`(function(){var h='';var main={set innerHTML(v){h=String(v);},get innerHTML(){return h;},querySelector(){return document.querySelector('q');},querySelectorAll(){return [];},addEventListener(){}};try{PAGES.attendance(main);}catch(e){return 'ERR '+e.message;}return Object.values(globalThis.__sink).join('\\n')+'\\n'+h;})()`);
  R.ok('render ok', !/^ERR/.test(html), html.slice(0,120));
  R.ok('Aug 22 is MARKABLE for Ali Salem (an _attMark cell exists)', /_attMark\(9,/.test(html));
  R.ok('no "outside Abdel Salam" muted cell blocks August', !/outside Abdel Salam/.test(html));
  R.ok('the departed Iyad row is NOT shown in August (v6.514)', !/·\s*Iyad/.test(html));
  R.ok('the Abdel Salam row IS shown', /·\s*Abdel Salam/.test(html));
}

R.done();
