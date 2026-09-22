// v6.598 — a COACH logging a Mixed class shouldn't have to hunt for their own name: the Mixed
// chooser now pre-selects the logged-in coach (they taught it), so they only pick the sport and Save.
// Admins still get the blank "— pick coach —" default; an existing record keeps its own coach.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.598 · Mixed chooser defaults to the logged-in coach');

function openChooser(role, opts) {
  opts = opts || {};
  const ctx = H.seed(H.makeCtx({ today: '2026-07-24', role }));
  vm.runInContext(`
    document.querySelector = (sel) => (typeof sel==='string' && sel[0]==='#') ? document.getElementById(sel.slice(1)) : ({style:{},innerHTML:'',classList:{add(){},remove(){}},querySelectorAll:()=>[],appendChild(){}});
    state.user = { coachId: 1, email:'c1@blackstars.qa' };
    state.session = { role:'${role}', email:'c1@blackstars.qa', coachId:1 };
    state.settings.sports = ['Swimming','Kick Boxing','Karate','Football','Mixed'].map((n,i)=>({name:n,enabled:true,order:i}));
    state.members.push({ id:501, name:'Mix Trial Kid', sport:'Mixed', coachId:null,
      joinDate:'2026-07-01', expiryDate:'2026-09-01', status:'Active',
      subscriptions:[{_sid:'sMix',activity:'Mixed',coachId:null,totalClasses:12,start:'2026-07-01',end:'2026-09-01',status:'active'}],
      mixedAttendance:${JSON.stringify(opts.mixedAttendance || {})} });
    window.__modal=null; window.showModal=(o)=>{ window.__modal=o; }; window.closeModal=()=>{};
    window.toast=()=>{};
  `, ctx);
  H.renderScreen(ctx, 'attendance');
  return vm.runInContext(`(function(){ window._attMarkMixed(501, ${opts.day || 24}); return (window.__modal && window.__modal.body) || ''; })()`, ctx);
}

// Which coach <option> carries `selected`?
function selectedCoach(body) {
  const m = body.match(/<select id="mix-coach">([\s\S]*?)<\/select>/);
  if (!m) return '(no coach select)';
  const opt = m[1].match(/<option value="([^"]*)"[^>]*selected[^>]*>([^<]*)</);
  return opt ? { value: opt[1], label: opt[2] } : '(none selected)';
}

R.section('coach login → own name pre-selected');
{
  const body = openChooser('coach');
  const sel = selectedCoach(body);
  R.ok('the coach dropdown defaults to the logged-in coach (id 1 / Mostafa)', sel && sel.value === '1' && /Mostafa/.test(sel.label), JSON.stringify(sel));
}

R.section('admin login → blank default (unchanged)');
{
  const body = openChooser('admin');
  const sel = selectedCoach(body);
  R.ok('admin keeps the blank "— pick coach —" default (no coach pre-selected)', sel === '(none selected)', JSON.stringify(sel));
}

R.section('existing record keeps its own credited coach (not overridden by self)');
{
  const body = openChooser('coach', { mixedAttendance: { '2026-07': { '24': { coachId: 2, sport: 'Kick Boxing', mark: 'Y' } } } });
  const sel = selectedCoach(body);
  R.ok('an already-logged class keeps its recorded coach (id 2), not the viewer', sel && sel.value === '2', JSON.stringify(sel));
}

R.done();
