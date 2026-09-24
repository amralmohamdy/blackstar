// v6.612 — the Danger Zone is PIN-gated ('4242'). Until unlocked it shows a PIN prompt, not the
// destructive actions; a wrong PIN is rejected; navigating away re-locks it.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.612 · danger zone PIN');

R.section('locked by default — shows the PIN prompt, not the destructive buttons');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  vm.runInContext(`window._dangerUnlocked = false;`, ctx);
  const r = H.renderScreen(ctx, 'danger');
  R.ok('renders the PIN gate', r.ok && /danger-pin/.test(r.html) && /Protected page|صفحة محمية/.test(r.html), r.error);
  R.ok('does NOT show "Clear all data" while locked', !/Clear all data/.test(r.html));
}

R.section('correct PIN unlocks; wrong PIN is rejected');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const wrong = vm.runInContext(`
    (function(){
      window._dangerUnlocked = false; var toasted='';
      window.toast = (m) => { toasted = String(m); }; window.render = () => {};
      document.getElementById = (id) => id === 'danger-pin' ? { value:'0000', focus(){} } : null;
      window._dangerUnlock();
      return { unlocked: !!window._dangerUnlocked, toasted };
    })()
  `, ctx);
  R.ok('wrong PIN keeps it locked + toasts an error', wrong.unlocked === false && /Wrong PIN|رمز/.test(wrong.toasted), JSON.stringify(wrong));
  const right = vm.runInContext(`
    (function(){
      window._dangerUnlocked = false; window.render = () => {}; window.toast = () => {};
      document.getElementById = (id) => id === 'danger-pin' ? { value:'4242', focus(){} } : null;
      window._dangerUnlock();
      return !!window._dangerUnlocked;
    })()
  `, ctx);
  R.ok('PIN 4242 unlocks', right === true);
}

R.section('once unlocked, the destructive actions render');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  vm.runInContext(`window._dangerUnlocked = true;`, ctx);
  const r = H.renderScreen(ctx, 'danger');
  R.ok('shows the Danger Zone actions after unlock', r.ok && /Clear all data|Hard Reset/.test(r.html), r.error);
}

R.section('non-admin blocked outright');
{
  const ctx = H.seed(H.makeCtx({ role: 'coach' }));
  vm.runInContext(`window._dangerUnlocked = true;`, ctx);   // even if flag set, role wins
  const r = H.renderScreen(ctx, 'danger');
  R.ok('a coach cannot open Danger Zone', r.ok && /Admins only|للمسؤولين/.test(r.html) && !/Clear all data/.test(r.html), r.error);
}

R.section('navigate away re-locks (source)');
{
  const src = H.readSrc();
  R.ok('navigate() clears _dangerUnlocked when leaving', /if \(route !== 'danger'\) \{ try \{ window\._dangerUnlocked = false;/.test(src));
  R.ok('the PIN is 4242', /const DANGER_PIN = '4242'/.test(src) && /v === DANGER_PIN/.test(src));
}

R.done();
