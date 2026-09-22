// v6.598 — a STALLED cloud write (Firestore batch.commit() stays pending on a slow/intermittent
// link) must NOT trap the user behind the full-screen "Saving to cloud…" overlay forever.
// withCloudConfirm now races saveConfirmed() against a stall timeout: on a stall it hides the
// overlay, applies the change locally (onOk), tells the user it is safe + still syncing, and returns
// true — the pending-journal + auto-retry keep pushing the write. A genuine fast success/failure is
// unchanged. (The QC harness fires setTimeout synchronously, so we flip navigator.userAgent off 'qc'
// to exercise the real race path.)
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.598 · slow-save never traps the user');
const run = (c, s) => vm.runInContext(s, c);

R.section('source wiring');
{
  const app = H.readSrc();
  R.ok('withCloudConfirm has a stall timeout (SLOW_SAVE_MS)', /SLOW_SAVE_MS\s*=\s*\(opts\.slowMs != null\)/.test(app));
  R.ok('a stall resolves { slow:true } and does NOT reject', /resolve\(\{ ok: false, slow: true \}\)/.test(app));
  R.ok('a stall hides the blocking overlay + returns true', /if \(res && res\.slow\)[\s\S]{0,300}hideSavingOverlay\(\)[\s\S]{0,900}return true;/.test(app));
  R.ok('the QC-harness synchronous-timer guard is present', /navigator\.userAgent === 'qc'[\s\S]{0,120}\? await saveConfirmed\(\)/.test(app));
}

R.section('a STALLED write unblocks instead of hanging');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = run(ctx, `
    (function(){
      navigator.userAgent = 'not-qc';               // take the real race path (harness fires timers now)
      var events = { onOk:0, afterOk:0, overlayHidden:0, toast:'' };
      window.saveConfirmed = () => new Promise(function(){ /* NEVER resolves — a stalled commit */ });
      window.showSavingOverlay = () => {};
      window.hideSavingOverlay = () => { events.overlayHidden++; };
      window.showLockedModal = () => { events.locked = true; };
      window.toast = (m) => { events.toast = String(m); };
      return withCloudConfirm({
        slowMs: 5,                                    // fire the stall timer promptly for the test
        onOk: () => { events.onOk++; },
        afterOk: () => { events.afterOk++; },
      }).then(function(ret){ events.ret = ret; return events; });
    })()
  `);
  return Promise.resolve(res).then(ev => {
    R.ok('withCloudConfirm resolved (did NOT hang)', ev && ev.ret === true, JSON.stringify(ev));
    R.ok('the blocking overlay was hidden', ev.overlayHidden === 1);
    R.ok('the change was applied locally (onOk ran)', ev.onOk === 1);
    R.ok('afterOk ran (caller UI continues)', ev.afterOk === 1);
    R.ok('an honest "still saving / safe on this device" toast was shown', /still saving|keeps syncing|safe on this device/i.test(ev.toast), ev.toast);
    R.ok('NO scary locked "NOT saved" popup on a mere stall', !ev.locked);

    R.section('a FAST success is unchanged (no false stall)');
    const ctx2 = H.seed(H.makeCtx({ role: 'admin' }));
    const res2 = run(ctx2, `
      (function(){
        // keep userAgent='qc' → the guarded original 'await saveConfirmed()' path (the harness fires
        // timers synchronously, so a race here would always mis-trigger the stall). This proves the
        // guard preserves the normal fast-confirm flow in production for a prompt server ack.
        var ev = { locked:false, okay:null };
        window.saveConfirmed = () => Promise.resolve({ ok:true });
        window.showSavingOverlay = () => {}; window.hideSavingOverlay = () => {};
        window.showLockedModal = (o) => { ev.locked = true; ev.okay = o.okay; };
        window.toast = () => {};
        return withCloudConfirm({ slowMs: 5000, onOk:()=>{} }).then(function(ret){ ev.ret = ret; return ev; });
      })()
    `);
    return Promise.resolve(res2);
  }).then(ev2 => {
    R.ok('a fast confirmed save still shows the green locked popup', ev2.locked === true && ev2.okay === true, JSON.stringify(ev2));
    R.ok('a fast confirmed save returns true', ev2.ret === true);
    R.done();
  });
}
