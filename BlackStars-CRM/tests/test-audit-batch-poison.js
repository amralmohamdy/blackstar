// v6.393 — "permission-denied / your session expired" popping up FREQUENTLY while adding data.
//
// The session was fine. The security rules make auditLog IMMUTABLE:
//     match /auditLog/{docId} { allow create: if isStaff(); allow update, delete: if false; }
// but every op was written as set(…, {merge:true}), and a merge-set on a document that ALREADY
// EXISTS is an UPDATE in rules terms. A colleague's audit row reaches this device through the
// snapshot listener and lands in `state` but NOT in our `_base`, so the very next save re-sends
// it — as an update — and Firestore denies it. A Firestore batch is ATOMIC, so that single
// denied row failed the WHOLE write and took the member being added down with it.
//
// Fixes: (a) auditLog is append-only — never re-send a row the server already holds;
//        (b) audit ops commit in their OWN batch, so an audit failure can never fail a member.
const fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const storageSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// ── Model the delta rule exactly as shipped, to show the poisoned op is no longer produced.
function buildOps(src, { baseHas, serverKnows }) {
  // mirrors: if (name === 'auditLog') { if (prevStr !== undefined || _auditKnown.has(id)) continue; push create }
  const guarded = /if \(name === 'auditLog'\) \{\s*\n\s*if \(prevStr !== undefined \|\| _auditKnown\.has\(id\)\) continue;/.test(src);
  const ops = [];
  // a normal business record always goes
  ops.push({ name: 'members', id: '270', kind: 'set' });
  // the colleague's audit row: in local state, NOT in our base, but present on the server
  if (!guarded) ops.push({ name: 'auditLog', id: 'a1', kind: 'set', merge: true });      // old: UPDATE → denied
  else if (!(baseHas || serverKnows)) ops.push({ name: 'auditLog', id: 'a1', kind: 'set', _audit: true });
  return ops;
}

console.log('the poisoned write is no longer produced:');
{
  // exactly the production situation: not in our base, but the server has it
  const ops = buildOps(storageSrc, { baseHas: false, serverKnows: true });
  ok('no auditLog op is emitted for a row the server already holds', !ops.some(o => o.name === 'auditLog'), ops);
  ok('the member write still goes out', ops.some(o => o.name === 'members'), ops);

  const old = buildOps(storageSrc.replace(/if \(name === 'auditLog'\) \{/, 'if (false) {'), { baseHas: false, serverKnows: true });
  ok('control: the OLD rule DID emit it (this is what got denied)', old.some(o => o.name === 'auditLog'), old);
}

console.log('\na genuinely NEW local audit row is still recorded:');
{
  const ops = buildOps(storageSrc, { baseHas: false, serverKnows: false });
  ok('it is emitted', ops.some(o => o.name === 'auditLog'), ops);
  ok('...flagged so it commits in the isolated audit batch', ops.find(o => o.name === 'auditLog')._audit === true, ops);
}

console.log('\nan audit row already in our base is never updated:');
{
  const ops = buildOps(storageSrc, { baseHas: true, serverKnows: false });
  ok('no update op is produced', !ops.some(o => o.name === 'auditLog'), ops);
}

console.log('\nsource wiring — append-only + isolated + non-fatal:');
{
  ok('auditLog is excluded from the normal delta path',
    /if \(name === 'auditLog'\) \{[\s\S]{0,220}?_auditKnown\.has\(id\)\) continue;/.test(storageSrc));
  ok('audit ops commit in their OWN batch, separate from business data',
    /const bizOps = group\.filter\(op => !op\._audit\);[\s\S]{0,200}?const auditOps = group\.filter\(op => op\._audit\);/.test(storageSrc));
  ok('audit writes use set WITHOUT merge (a CREATE, so the immutability rule is never tripped)',
    /for \(const op of auditOps\) ab\.set\(colRef\(op\.name\)\.doc\(op\.id\), op\.data\);/.test(storageSrc));
  ok('an audit failure is caught and does NOT fail the save',
    /audit entry not written \(non-fatal\)/.test(storageSrc));
  ok('rows arriving from the live snapshot are marked server-held',
    /if \(name === 'auditLog'\) _auditKnown\.add\(id\);/.test(storageSrc));
  ok('rows from the initial load are marked server-held',
    /noteAuditFromServer\(result\.auditLog\)/.test(storageSrc));
}

console.log('\nauth failures are diagnosed by TESTING the token, not by currentUser alone (v6.407):');
{
  // v6.393/6.394 keyed the message off `currentUser != null` ("still signed in ⇒ server refused,
  // signing in won't help"). But Firebase keeps currentUser populated even when the ID token is
  // DEAD, so a genuinely-lapsed session was wrongly told re-auth wouldn't help — the reported bug.
  // v6.407 decides by whether the token can actually be refreshed.
  ok('the confirm popup no longer pre-judges with _serverRefused/_sessionLapsed',
    !/_serverRefused = _isAuthReason/.test(appSrc) && !/_sessionLapsed = _isAuthReason/.test(appSrc));
  ok('any auth-coded failure is routed to the self-diagnosing resume prompt',
    /if \(_isAuthReason && typeof window\.showSessionResumePrompt === 'function'\)/.test(appSrc));
  ok('the confirm popup shows one neutral "re-checking your sign-in" message',
    /Not saved yet — re-checking your sign-in/.test(appSrc));
}

console.log('\nthe sign-in card is shown for a lapse, the refused bar only for a live-token refusal:');
{
  ok('the resume prompt records whether the token could be refreshed (tokenAlive)',
    /let tokenAlive = false;[\s\S]{0,220}?tokenAlive = !!/.test(appSrc));
  ok('the "server refused" bar requires tokenAlive AND a user (not currentUser alone)',
    /if \(tokenAlive && _who\) \{ showServerRefusedBar\(\); return; \}/.test(appSrc));
  ok('the "server refused" bar still exists and states signing in will not help',
    /function showServerRefusedBar\(\)/.test(appSrc) && /signing in again will not help/.test(appSrc));
  ok('...and still offers a manual retry', /showServerRefusedBar[\s\S]{0,1600}?cloud-retry-now/.test(appSrc));
  ok('a dead token (or no user) falls through to the in-place sign-in prompt',
    /if \(tokenAlive && _who\) \{ showServerRefusedBar\(\); return; \}[\s\S]{0,400}?_sessionPromptOpen = true;/.test(appSrc));
}

console.log('\nevery confirmSaved operation shows a pending state and the real result:');
{
  ok('a saving indicator is shown while waiting', /_showSaving\(\);\s*\/\/ v6\.393/.test(appSrc));
  ok('...cleared on success', /_hideSaving\(\);\s*\n\s*if \(r && r\.ok\)/.test(appSrc));
  ok('...and cleared on failure', /\.catch\(e => \{ _hideSaving\(\);/.test(appSrc));
  ok('it is announced to screen readers', /aria-live', 'polite'/.test(appSrc));
  ok('it respects reduced-motion', /prefers-reduced-motion:reduce/.test(appSrc));
  ok('nested saves do not leave it stuck (depth counted)', /_savingDepth = Math\.max\(0, _savingDepth - 1\)/.test(appSrc));
}

console.log('\nAUDIT BATCH POISON:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
