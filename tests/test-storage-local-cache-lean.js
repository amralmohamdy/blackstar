// v6.593 — the audit log (append-only history, ~70% of the payload) no longer goes into the browser's
// localStorage when a CLOUD backend is active: it lives authoritatively in Firestore and is fetched on
// demand. This stops the ~5MB localStorage quota from filling ("Storage 95% full … saves may start
// failing"). The cloud copy is untouched — nothing is lost. A pure-offline install still keeps it.
const fs = require('fs'); const path = require('path');
const H = require('./qc-harness.js');
const R = H.reporter('v6.593 · lean local cache (auditLog stays in the cloud)');
const DIR = path.join(__dirname, '..');
const storage = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

R.section('local cache save can skip the heavy lazy collection');
R.ok('localBackend.save takes an opts arg', /save\(state, opts\) \{/.test(storage));
R.ok('it drops auditLog from the local write when skipHeavy', /if \(opts && opts\.skipHeavy\) delete persistable\.auditLog;/.test(storage));

R.section('the CLOUD backend safety-net passes skipHeavy (auditLog is in Firestore)');
R.ok('both firebase safety-net saves pass { skipHeavy: true }', (storage.match(/localBackend\.save\(state, \{ skipHeavy: true \}\)/g) || []).length >= 2);

R.section('the crash journal never blows the quota either');
R.ok('writePendingJournal drops auditLog', /delete persistable\.auditLog;\s*\n\s*localStorage\.setItem\(PENDING_KEY/.test(storage));

R.section('the storage-full warning measures the ACTUAL local footprint (no auditLog)');
R.ok('capacity check excludes auditLog from the measured bytes', /const \{ auditLog, \.\.\.localish \} = stateToSave; approxBytes = JSON\.stringify\(localish\)\.length;/.test(app));

R.done();
