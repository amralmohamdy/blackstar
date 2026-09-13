// v6.453 — the audit log is LAZY: excluded from the hot load + live listener (it was ~70% of the
// sync payload and kept a heavy real-time query open), fetched on demand via loadAuditLog(). New
// audit rows are STILL written (create-only). This test locks the wiring so it can't silently
// regress back into the hot path.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..');
const storage = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pages = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const H = require('./qc-harness.js');
const R = H.reporter('LAZY AUDIT LOG · hot/lazy split');

R.section('storage.js: auditLog is split OUT of the hot path');
{
  R.ok('LAZY_COLLECTIONS contains auditLog', /LAZY_COLLECTIONS = new Set\(\['auditLog'\]\)/.test(storage));
  R.ok('HOT_COLLECTIONS excludes the lazy ones', /HOT_COLLECTIONS = COLLECTIONS\.filter\(c => !LAZY_COLLECTIONS\.has\(c\)\)/.test(storage));
  R.ok('the blocking load reads HOT_COLLECTIONS (not auditLog)', /readCols = memberScope \? HOT_COLLECTIONS\.filter\(c => MEMBER_READABLE\.has\(c\)\) : HOT_COLLECTIONS/.test(storage));
  R.ok('the live listener subscribes to HOT_COLLECTIONS only', /for \(const name of HOT_COLLECTIONS\) \{\s*\n\s*_seeded\[name\] = false;/.test(storage));
  R.ok('assembleLive delivers HOT_COLLECTIONS only (never clobbers state.auditLog)', /for \(const name of HOT_COLLECTIONS\) out\[name\] = Array\.from/.test(storage));
}

R.section('storage.js: on-demand fetch that does NOT re-poison the immutable write');
{
  R.ok('loadAuditLog() method exists', /async loadAuditLog\(\) \{/.test(storage));
  R.ok('it marks fetched ids server-held via noteAuditFromServer', /async loadAuditLog\(\)[\s\S]{0,400}noteAuditFromServer\(arr\)/.test(storage));
  R.ok('the create-only guard is intact (never UPDATE an existing/known audit row)', /if \(prevStr !== undefined \|\| _auditKnown\.has\(id\)\) continue;/.test(storage));
  R.ok('every written audit id is still marked known on ack', /for \(const op of auditOps\) _auditKnown\.add\(String\(op\.id\)\)/.test(storage));
}

R.section('app.js: background ensureAuditLog after boot; never blocks login');
{
  R.ok('ensureAuditLog is defined', /window\.ensureAuditLog = function/.test(app));
  R.ok('it dedupes fetched history against session entries (no dropped just-recorded action)', /const have = new Set\([\s\S]{0,500}!have\.has\(String\(a\.id\)\)\) merged\.push\(a\)/.test(app));
  R.ok('it is triggered deferred (not on the critical path)', /setTimeout\(\(\) => \{ try \{ window\.ensureAuditLog\(\); \} catch \(_\) \{\} \}, 6000\)/.test(app));
  R.ok('it guards when the backend has no loadAuditLog (local/test)', /typeof window\.Storage\.loadAuditLog !== 'function'/.test(app));
}

R.section('pages.js: Audit + Trash screens fetch on demand and re-render');
{
  R.ok('the Audit screen ensures the log then re-renders', /ensureAuditLog\(\)\.then\(\(\) => \{ try \{ if \(state\.route === 'audit'\) PAGES\.audit\(main\)/.test(pages));
  R.ok('the Trash screen ensures the log then re-renders', /ensureAuditLog\(\)\.then\(\(\) => \{ try \{ if \(state\.route === 'trash'\) PAGES\.trash\(main\)/.test(pages));
}

R.section('the app still boots + renders admin screens with an EMPTY audit log (lazy, not yet fetched)');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  H.vm.runInContext(`state.auditLog = [];`, ctx);   // simulate: not fetched yet
  R.ok('Audit screen renders with no entries (does not throw)', H.renderScreen(ctx, 'audit').ok, H.renderScreen(ctx, 'audit').error);
  R.ok('Trash screen renders with no entries (does not throw)', H.renderScreen(ctx, 'trash').ok, H.renderScreen(ctx, 'trash').error);
  R.ok('Members screen still renders (last-updated lookups tolerate an empty log)', H.renderScreen(ctx, 'members').ok, H.renderScreen(ctx, 'members').error);
}

R.done();
