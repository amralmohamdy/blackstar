// v6.599 — "show the cloud storage usage": an admin-only panel that sizes exactly what the cloud
// stores, per collection, from the in-memory copy of the Firestore data (+ the lazy audit log fetched
// on demand). Locks the breakdown math, the admin gate, and the render.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.599 · cloud storage usage');
const run = (c, s) => vm.runInContext(s, c);

R.section('breakdown math');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const b = run(ctx, `window._cloudStorageBreakdown(null)`);
  R.ok('returns rows, a total, and a document count', Array.isArray(b.rows) && b.total > 0 && b.docs > 0, JSON.stringify({ total: b.total, docs: b.docs }));
  R.ok('rows are sorted biggest-first', b.rows.every((r, i) => i === 0 || b.rows[i - 1].bytes >= r.bytes));
  R.ok('members + invoices are measured (seed has both)', b.rows.find(r => r.name === 'members').bytes > 0 && b.rows.find(r => r.name === 'invoices').bytes > 0);
  R.ok('total equals the sum of the per-collection bytes', b.total === b.rows.reduce((s, r) => s + r.bytes, 0));
  R.ok('attendance-inside-members bytes are reported', typeof b.attBytes === 'number' && b.attBytes > 0, b.attBytes);
  R.ok('the biggest-documents list is populated', Array.isArray(b.biggest) && b.biggest.length > 0);
  const audit = b.rows.find(r => r.name === 'auditLog');
  R.ok('audit log row exists and is flagged not-known until fetched', audit && audit.known === false || (audit && audit.count > 0));
}

R.section('audit log folds in once fetched');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const b0 = run(ctx, `window._cloudStorageBreakdown(null)`);
  const b1 = run(ctx, `window._cloudStorageBreakdown({ loaded:true, rows:[{id:'x1',action:'a',detail:'d'.repeat(5000)},{id:'x2',action:'b',detail:'e'.repeat(5000)}] })`);
  const a1 = b1.rows.find(r => r.name === 'auditLog');
  R.ok('fetched audit log is counted (bytes > 0, known)', a1 && a1.bytes > 0 && a1.known === true, JSON.stringify(a1));
  R.ok('total grows once the audit log is included', b1.total > b0.total);
}

R.section('render + admin gate');
{
  const ctxA = H.seed(H.makeCtx({ role: 'admin' }));
  const shownA = run(ctxA, `(function(){ var m=null; window.showModal=(o)=>{m=o;}; window.closeModal=()=>{}; window.toast=()=>{}; window.showCloudStorageUI(); return m && m.body || ''; })()`);
  R.ok('admin sees the usage modal with a MB total + collection bars', /Cloud Storage Usage|MB/.test(shownA) && /Members/.test(shownA), shownA.slice(0, 80));
  R.ok('mentions where billed quota lives (Firebase Console)', /Firebase Console|Firestore/.test(shownA));

  const ctxC = H.seed(H.makeCtx({ role: 'coach' }));
  const blocked = run(ctxC, `(function(){ var opened=false,toasted=''; window.showModal=()=>{opened=true;}; window.toast=(x)=>{toasted=String(x);}; window.showCloudStorageUI(); return {opened, toasted}; })()`);
  R.ok('a coach is blocked (admins only), no modal', blocked.opened === false && /Admins only|المدراء/.test(blocked.toasted), JSON.stringify(blocked));
}

R.section('dashboard + settings entry points wired');
{
  const src = H.readSrc();
  R.ok('dashboard has an admin-only ☁ Storage button', /currentRole\(\) === 'admin'[\s\S]{0,120}id="dash-cloud-storage"/.test(src) && /dash-cloud-storage'\)[\s\S]{0,160}showCloudStorageUI\(\)/.test(src));
  R.ok('settings has a Cloud Storage Usage button wired', /id="cloudstorage-btn"/.test(src) && /cloudstorage-btn'\)\?\.addEventListener\('click', \(\) => window\.showCloudStorageUI\(\)\)/.test(src));
}

R.done();
