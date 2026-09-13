// v6.565 — the Attendance coach filter listed INACTIVE / departed coaches (Abdel Salam left 31 Aug,
// Iyad, Mohammed, Karma). The dropdown used state.coaches.filter(isCoachRole), which only drops STAFF,
// not inactive coaches. Fix: it now lists active coaches only (isCoachRole && isCoachActive), plus any
// coach already selected in the current filter (so an active selection never silently vanishes).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.565 · Attendance coach filter = active coaches only');
const src = H.readSrc();

R.section('source wiring');
R.ok('att-coach filter requires isCoachActive (plus already-selected)', /multiFilterHTML\('att-coach', state\.coaches\.filter\(c => isCoachRole\(c\) && \(isCoachActive\(c\) \|\| filter\.coaches\.map\(String\)\.includes\(String\(c\.id\)\)\)\)/.test(src));

R.section('runtime — inactive/departed coaches are excluded; active kept');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const res = vm.runInContext(`(function(){
    state.coaches = [
      { id: 1, name: 'Abdel Salam', role: 'coach', active: false },   // departed 31 Aug
      { id: 2, name: 'Iyad', role: 'coach', active: 'N' },            // left
      { id: 3, name: 'Aziz', role: 'coach', active: 'Y' },
      { id: 4, name: 'Ester', role: 'staff', active: 'Y' },           // staff — not a member-coach
      { id: 5, name: 'Aya', role: 'coach' }                            // no flag → active
    ];
    const filterCoaches = [];
    const shown = state.coaches.filter(c => isCoachRole(c) && (isCoachActive(c) || filterCoaches.map(String).includes(String(c.id)))).map(c => c.name).sort();
    // with an inactive coach already selected, it stays visible
    const filterCoaches2 = ['1'];
    const shown2 = state.coaches.filter(c => isCoachRole(c) && (isCoachActive(c) || filterCoaches2.map(String).includes(String(c.id)))).map(c => c.name).sort();
    return { shown, shown2 };
  })()`, ctx);
  R.ok('active coaches shown, inactive + staff excluded', JSON.stringify(res.shown) === JSON.stringify(['Aya','Aziz']), JSON.stringify(res.shown));
  R.ok('an already-selected inactive coach stays visible', res.shown2.includes('Abdel Salam'), JSON.stringify(res.shown2));
}

R.done();
