// v6.514 — a departed/transferred coach must not be LISTED in a month they no longer teach. Iyad left
// 31 Jul: his Kick Boxing subs became completed/transferred and each student got an Abdel Salam sub
// from 1 Aug. subAttendanceWindow ends Iyad's window on 31 Jul (day before Abdel's 1 Aug start), so
// the August grid cells were already muted — but the ROW still showed. Now the single-month grid drops
// any coach-split row whose window doesn't reach the shown month; the successor coach's row stays.
const H = require('./qc-harness.js');
const R = H.reporter('v6.514 · departed coach not listed in later month');
const src = H.readSrc();

R.section('source');
R.ok('winReachesMonth helper exists', /function winReachesMonth\(win, mo\)/.test(src));
R.ok('single-month view filters rows by winReachesMonth', /if \(filter\.month !== 'all'\) rows = rows\.filter\(r => winReachesMonth\(r\.window, gMonth\)\);/.test(src));

function render(todayISO, monthPick) {
  const ctx = H.makeCtx({ today: todayISO, role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.user={role:'admin'};state.session={role:'admin'};`);
  run(`state.coaches=[{id:14,name:'Iyad',active:'N',role:'coach'},{id:1,name:'Abdel Salam',active:'Y',role:'coach'}];`);
  // one member: Kick Boxing, Iyad (completed/transferred, ends its window 31 Jul) + Abdel (active Aug)
  run(`state.members=[{id:9,name:'Kordi',sport:'Kick Boxing',coachId:1,expiryDate:'2026-08-31',
    enrollments:[{sport:'Kick Boxing',coachId:1,classes:11,price:458,start:'2026-08-01',switchedInto:true}],
    subscriptions:[
      {activity:'Kick Boxing',coachId:14,coach:'Iyad',totalClasses:1,status:'completed',transferredToCoachId:1,start:'2026-07-01',end:'2026-08-31'},
      {activity:'Kick Boxing',coachId:1,coach:'Abdel Salam',totalClasses:11,status:'active',switchFunded:true,start:'2026-08-01',end:'2026-08-31'}
    ],
    dailyAttendance:{'2026-07':{'Kick Boxing':{'29':'Y'}},'2026-08':{'Kick Boxing':{'3':'Y'}}}}];`);
  run(`globalThis.__sink={};
    function el(id){return {_id:id,set innerHTML(v){globalThis.__sink[id]=String(v);},get innerHTML(){return globalThis.__sink[id]||'';},textContent:'',value:'',checked:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},focus(){},querySelector(){return el('q');},querySelectorAll(){return [];},closest(){return null;},getAttribute(){return null;}};}
    document.getElementById=(id)=>el(id);document.querySelector=(s)=>el(s);document.querySelectorAll=()=>[];window.$=document.querySelector;`);
  // pick the month by seeding window._att filter? PAGES.attendance builds its own filter defaulting to
  // the today-month when it has data. today drives gridMonth via _defaultMonth.
  const out = run(`(function(){var h='';var main={set innerHTML(v){h=String(v);},get innerHTML(){return h;},querySelector(){return document.querySelector('x');},querySelectorAll(){return [];},addEventListener(){}};try{PAGES.attendance(main);}catch(e){return 'ERR '+e.message;}return Object.values(globalThis.__sink).join('\\n')+'\\n'+h;})()`);
  return out;
}

R.section('runtime · August view');
{
  const html = render('2026-08-22');
  R.ok('render ok', !/^ERR/.test(html), html.slice(0,120));
  // the grid lists the student's coach in the row; Iyad must NOT appear as a listed row, Abdel must
  // the student cell shows "<sport> · <coach>"; the coach FILTER dropdown lists every coach, so
  // match the row-specific "· <coach>" pattern, not a bare name.
  R.ok('August grid does NOT list an Iyad row', !/·\s*Iyad/.test(html), 'iyad-row=' + /·\s*Iyad/.test(html));
  R.ok('August grid DOES show the Abdel Salam row', /·\s*Abdel Salam/.test(html));
}

R.section('runtime · July view (the coach WAS teaching — must still appear)');
{
  const html = render('2026-07-25');
  R.ok('July grid DOES list the Iyad row (he taught in July)', /·\s*Iyad/.test(html));
}

R.section('runtime · September view (well after Iyad + after this membership)');
{
  // Iyad window ends 29 Jul; in September his row must be gone. Abdel is open-ended → still shown.
  const html = render('2026-09-15');
  R.ok('September grid does NOT list an Iyad row', !/·\s*Iyad/.test(html));
}

R.done();
