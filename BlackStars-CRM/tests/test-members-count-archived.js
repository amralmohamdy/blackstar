// v6.418 — the Members header count now shows the archived breakdown:
// "<shown> of <active> · <total> incl. <archived> archived". The tail only appears
// when archived members exist. Filtering logic (archived excluded) is unchanged.
const H = require('./qc-harness.js');
const R = H.reporter('MEMBERS · count shows archived total');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.members = [];
    // 285 active (non-archived) + 128 archived = 413 total, mirroring the reported screen.
    for (let i = 1; i <= 285; i++) state.members.push({ id:i, name:'A'+i, sport:'Boxing', coachId:1, status:'Active', expiryDate:'2026-08-30' });
    for (let i = 286; i <= 413; i++) state.members.push({ id:i, name:'Z'+i, sport:'Boxing', coachId:1, status:'Active', deleted:true });
    state.coaches = [{ id:1, name:'Coach', active:'Y' }];
    state.invoices = [];
  `);
}

R.section('activeMembers() excludes archived; totals add up');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  R.ok('activeMembers() = 285 (archived excluded)', run(ctx, `activeMembers().length`) === 285);
  R.ok('state.members total = 413 (incl. archived)', run(ctx, `state.members.length`) === 413);
  R.ok('archived = 128', run(ctx, `state.members.length - activeMembers().length`) === 128);
}

R.section('the count string formula matches "of active · total incl. N archived"');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const label = run(ctx, `(function(){
    const shown = 210;                                  // e.g. after a filter hides some
    const _active = activeMembers().length, _total = state.members.length, _arch = _total - _active;
    return _arch > 0 ? shown+' of '+_active+' · '+_total+' incl. '+_arch+' archived' : shown+' of '+_active;
  })()`);
  R.ok('reads "210 of 285 · 413 incl. 128 archived"', label === '210 of 285 · 413 incl. 128 archived', label);
}

R.section('with NO archived members the tail is omitted');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `state.members = state.members.filter(m => !m.deleted);`);   // drop all archived
  const label = run(ctx, `(function(){
    const shown = 285, _active = activeMembers().length, _total = state.members.length, _arch = _total - _active;
    return _arch > 0 ? shown+' of '+_active+' · '+_total+' incl. '+_arch+' archived' : shown+' of '+_active;
  })()`);
  R.ok('plain "285 of 285" (no archived tail)', label === '285 of 285', label);
}

R.section('source: both the live update and initial render carry the breakdown');
{
  const src = H.readSrc();
  R.ok('live update computes _active/_total/_arch and appends the archived tail', /_arch > 0[\s\S]{0,160}\$\{_total\} \$\{t\('incl\.'[\s\S]{0,40}\$\{_arch\} \$\{t\('archived'/.test(src));
  R.ok('initial render appends the archived tail when total > active', /\$\{\(state\.members \|\| \[\]\)\.length\} \$\{t\('incl\.'[\s\S]{0,80}activeMembers\(\)\.length\} \$\{t\('archived'/.test(src));
  R.ok('the Members screen still renders', H.renderScreen(H.seed(H.makeCtx({ role: 'admin' })), 'members').ok);
}

R.done();
