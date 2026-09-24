// v6.611 — Logins Logs Audit: every explicit sign-in is captured into the synced `loginLogs`
// collection (recordLogin, called from doLogin), shown on a new admin-only screen.
const H = require('./qc-harness.js');
const vm = H.vm;
const fs = require('fs');
const R = H.reporter('v6.611 · logins logs audit');

R.section('recordLogin appends rows');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = vm.runInContext(`
    (function(){
      state.loginLogs = [];
      recordLogin({ email:'rawan@blackstars.com', name:'Rawan', role:'receptionist' });
      recordLogin({ email:'c@blackstars.com', name:'Leina', role:'coach' });
      recordLogin(null);            // ignored
      recordLogin({ name:'no email' });  // ignored (no email)
      return state.loginLogs.map(l => ({ email:l.email, role:l.role, hasAt: !!l.at, hasId: l.id != null }));
    })()
  `, ctx);
  R.ok('two valid logins recorded (null / no-email ignored)', res.length === 2, JSON.stringify(res));
  R.ok('rows carry email, role, timestamp, id', res.every(r => r.email && r.role && r.hasAt && r.hasId), JSON.stringify(res));
  R.ok('captured the receptionist + coach', res[0].email === 'rawan@blackstars.com' && res[1].role === 'coach');
}

R.section('the log is bounded (last 3000)');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const n = vm.runInContext(`(function(){ state.loginLogs = []; for (let i=0;i<3010;i++) recordLogin({email:'u'+i+'@x.com',name:'U',role:'student'}); return state.loginLogs.length; })()`, ctx);
  R.ok('caps at 3000 rows', n === 3000, n);
}

R.section('screen renders (admin) + blocks non-admin');
{
  const ctxA = H.seed(H.makeCtx({ role: 'admin' }));
  vm.runInContext(`state.loginLogs = [{ id:1, email:'a@b.com', name:'Aya', role:'admin', at:'2026-09-24T08:00:00Z', device:'Reception', ua:'qc' }];`, ctxA);
  const r = H.renderScreen(ctxA, 'loginlogs');
  R.ok('renders the Logins Logs Audit screen', r.ok && /Logins Logs Audit/.test(r.html), r.error);
  R.ok('shows a captured login (email + device)', /a@b\.com/.test(r.html) && /Reception/.test(r.html));
  R.ok('has an Export CSV button', /loginlogs-export/.test(r.html));

  const ctxC = H.seed(H.makeCtx({ role: 'coach' }));
  const rc = H.renderScreen(ctxC, 'loginlogs');
  R.ok('a coach is blocked (Admins only)', rc.ok && /Admins only|للمسؤولين/.test(rc.html), rc.error);
}

R.section('wiring: route + collection + doLogin hook');
{
  const src = H.readSrc();
  R.ok('nav route registered (System, admin-only)', /loginlogs:\s*\{ label: 'Logins Logs Audit'[\s\S]{0,80}adminOnly: true/.test(src));
  R.ok('recordLogin is called on sign-in (doLogin)', /recordLogin\(state\.user\)/.test(src));
  const store = fs.readFileSync(require('path').join(H.DIR, 'storage.js'), 'utf8');
  R.ok('loginLogs is a synced collection', /'posts', 'loginLogs'/.test(store));
}

R.done();
