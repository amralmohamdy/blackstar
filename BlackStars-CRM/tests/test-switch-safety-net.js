// v6.567 — SWITCH SAFETY NET. Every past switch bug ended the same way: a structurally broken
// subscription (backwards window start>end, or a zero-day destination window) written to the data,
// which reads as "expired", blocks marking, and mis-pays commission. The switch handler now snapshots
// the member + invoices before mutating and, via commitSwitch(), validates the RESULT with
// switchResultProblem(); if it would be broken it ROLLS BACK and saves nothing. Defense-in-depth: a new
// edge case fails safe instead of corrupting the data.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.567 · switch safety net (validate + roll back on a broken result)');
const run = (c, s) => vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('switchResultProblem() exists and flags backwards + zero-day windows', /function switchResultProblem\(m\)/.test(src) && /String\(s\.start\) > String\(s\.end\)/.test(src) && /s\.switchFunded && String\(s\.start\) === String\(s\.end\)/.test(src));
  R.ok('the switch handler snapshots member + invoices before mutating', /const _snapMember = JSON\.stringify\(m\);/.test(src) && /const _snapInvoices = JSON\.stringify\(state\.invoices \|\| \[\]\);/.test(src));
  R.ok('commitSwitch rolls back to the snapshot when the result is broken', /if \(prob\) \{[\s\S]{0,200}state\.members\[idx\] = JSON\.parse\(_snapMember\);[\s\S]{0,160}state\.invoices\.length = 0;/.test(src));
  R.ok('both switch paths commit via commitSwitch (validated)', (src.match(/commitSwitch\(/g) || []).length >= 3); // definition + 2 call sites
}

R.section('runtime — switchResultProblem catches the broken shapes, passes clean ones');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const res = run(ctx, `(function(){
    const backwards = { subscriptions: [{ activity:'Swimming', coachId:2, start:'2026-09-12', end:'2026-08-07', status:'active', switchFunded:true }] };
    const zeroDay  = { subscriptions: [{ activity:'Swimming', coachId:2, start:'2026-09-12', end:'2026-09-12', status:'active', switchFunded:true }] };
    const clean    = { subscriptions: [
      { activity:'Swimming', coachId:1, start:'2026-08-13', end:'2026-09-12', status:'completed', switchedAwayTo:'Swimming' },
      { activity:'Swimming', coachId:2, start:'2026-09-12', end:'2026-10-08', status:'active', switchFunded:true }
    ] };
    const oldZeroButCompleted = { subscriptions: [{ activity:'Swimming', coachId:1, start:'2026-09-12', end:'2026-09-12', status:'completed', switchedAwayTo:'Swimming' }] };
    return {
      backwards: switchResultProblem(backwards), zeroDay: switchResultProblem(zeroDay),
      clean: switchResultProblem(clean), oldDone: switchResultProblem(oldZeroButCompleted)
    };
  })()`);
  R.ok('a backwards active window is flagged', !!res.backwards, JSON.stringify(res.backwards));
  R.ok('a zero-day switch-funded window is flagged', !!res.zeroDay, JSON.stringify(res.zeroDay));
  R.ok('a correct switch (valid dest window) is NOT flagged', res.clean === null, JSON.stringify(res.clean));
  R.ok('a completed/switched-away old sub is ignored (only ACTIVE subs checked)', res.oldDone === null, JSON.stringify(res.oldDone));
}

R.done();
