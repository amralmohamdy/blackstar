// v6.580 — the audit log is now OFF by default and opt-in (state.settings.auditEnabled). It grew
// unbounded (~50% of storage) and caused the localStorage-quota warnings. When disabled: audit()
// records nothing, ensureAuditLog() doesn't fetch, the Audit Log nav entry + screen are hidden behind
// an enable prompt. Also: the member-card money tile now shows the ACTUAL paid amount under a "Paid"
// label (was always the charged total) and flags an overpaid/drifted member.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.580 · audit log opt-in + member-card paid tile');
const src = H.readSrc();
const appSrc = H.readSrc('app.js');

R.section('audit() records only when enabled');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`currentUserId=()=>'u1'; currentUserName=()=>'Admin'; currentRole=()=>'admin';
       state.settings = {}; state.auditLog = [];`);
  run(`audit('member.test','member:1','hi');`);
  R.ok('OFF by default → no audit row written', run(`state.auditLog.length`) === 0, run(`state.auditLog.length`));
  run(`state.settings.auditEnabled = true; audit('member.test','member:1','hi');`);
  R.ok('ON → the audit row is written', run(`state.auditLog.length`) === 1, run(`state.auditLog.length`));
  R.ok('the written row carries the action', run(`state.auditLog[0].action`) === 'member.test');
}

R.section('nav + fetch gating (source)');
R.ok('ROUTES.audit.hidden is a dynamic getter keyed on auditEnabled', /audit:\s*\{[^}]*get hidden\(\) \{ return !\(typeof state !== 'undefined' && state\.settings && state\.settings\.auditEnabled\); \}/.test(appSrc));
R.ok('audit() early-returns when disabled', /function audit\([\s\S]{0,700}if \(!\(state\.settings && state\.settings\.auditEnabled\)\) return;/.test(appSrc));
R.ok('ensureAuditLog does NOT fetch when disabled', /ensureAuditLog = function \(force\) \{[\s\S]{0,200}if \(!\(state\.settings && state\.settings\.auditEnabled\)\)/.test(appSrc));

R.section('ROUTES.audit.hidden flips with the setting (runtime)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  run(`state.settings = {};`);
  R.ok('hidden = true when audit is off', run(`!!ROUTES.audit.hidden`) === true);
  run(`state.settings.auditEnabled = true;`);
  R.ok('hidden = false when audit is on', run(`!!ROUTES.audit.hidden`) === false);
}

R.section('Audit screen + Settings toggle + helper (source)');
R.ok('PAGES.audit shows an enable prompt when disabled', /if \(!\(state\.settings && state\.settings\.auditEnabled\)\) \{[\s\S]{0,1400}setAuditEnabled\(true\)/.test(src));
R.ok('window.setAuditEnabled is defined', /window\.setAuditEnabled = function\(on\)/.test(src));
R.ok('Preferences has an audit-enable checkbox', /id="pref-auditenabled"/.test(src));
R.ok('save-prefs persists the audit toggle', /state\.settings\.auditEnabled = !!auditEl\.checked/.test(src));

R.section('member-card money tile shows actual paid + flags overpaid (source)');
R.ok('tile value = totalPaid when fully paid (not totalCharged)', /kpi-value[^>]*>\$\{fmt\(balanceDue > 0\.5 \? totalCharged : totalPaid\)\}/.test(src));
R.ok('an overpaid member shows an "overpaid" flag', /over > 0\.5 \? `<div[^>]*>⚠ \$\{fmt\(over\)\} overpaid/.test(src));

R.done();
