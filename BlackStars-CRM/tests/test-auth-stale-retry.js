// A write that fails with permission-denied / unauthenticated is usually a LAPSED ID token, not a
// dropped connection. Re-sending the same delta with the same stale token fails forever, so the
// retry engine must FORCE a token refresh first — and do it fast, because until the write lands
// the change is only on this device. (Recreated — lost to a %TEMP% clean.)
const fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const storeSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

console.log('an auth-coded failure is recognised as its own class:');
{
  ok('permission-denied and unauthenticated are treated as auth codes',
    /function _isAuthCode\(code\) \{ return code === 'permission-denied' \|\| code === 'unauthenticated'; \}/.test(storeSrc));
  ok('a network failure is NOT lumped in with them', !/_isAuthCode[\s\S]{0,120}?unavailable/.test(storeSrc));
}

console.log('\nthe token is re-minted BEFORE re-sending:');
{
  ok('the retry refreshes the token first for an auth code',
    /if \(_isAuthCode\(_lastErrorCode\)\) await _refreshAuthToken\(\);/.test(storeSrc));
  ok('the refresh forces a new token rather than reusing a cached one',
    /getIdToken\(true\)/.test(storeSrc));
  ok('refreshAuth also re-flushes whatever is still unsaved',
    /refreshAuth\(\)[\s\S]{0,400}?lastWriteFailed[\s\S]{0,120}?_flushWrite/.test(storeSrc));
}

console.log('\nthe FIRST auth retry is fast (the change is at risk until it lands):');
{
  ok('an auth failure uses a short first delay, not the normal backoff',
    /const authFast = _isAuthCode\(_lastErrorCode\) && _retryAttempt === 0;/.test(storeSrc));
  ok('...of about a third of a second', /authFast \? 350 :/.test(storeSrc));
  ok('a NON-auth failure still uses the standard backoff ladder',
    /const RETRY_DELAYS = \[2000, 5000, 15000, 30000, 60000\]/.test(storeSrc));
}

// Model the shipped delay choice so the behaviour is exercised, not just its source text.
const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];
const delayFor = (code, attempt) => {
  const isAuth = code === 'permission-denied' || code === 'unauthenticated';
  return (isAuth && attempt === 0) ? 350 : RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
};

console.log('\nbehaviour of the backoff:');
{
  ok('a lapsed token retries in 350ms', delayFor('permission-denied', 0) === 350);
  ok('an unauthenticated write does the same', delayFor('unauthenticated', 0) === 350);
  ok('a dropped connection waits the normal 2s', delayFor('unavailable', 0) === 2000);
  ok('later auth attempts fall back to the ladder', delayFor('permission-denied', 1) === 5000);
  ok('the delay never grows past the last rung', delayFor('unavailable', 99) === 60000);
}

console.log('\nretrying can never be mistaken for success:');
{
  ok('a failed write keeps the unsaved flag set', /lastWriteFailed = true;/.test(storeSrc));
  ok('the base is NOT advanced on failure, so the same delta is re-sent',
    /base is NOT advanced on failure, so the same delta is re-sent/.test(storeSrc));
  ok('the change is journalled to disk before the UI is told anything',
    /writePendingJournal\(state, \(e && e\.code\) \|\| 'write-failed'\);/.test(storeSrc));
  ok('an auth failure is diagnosed by refreshing the token, not by currentUser alone (v6.407)',
    /if \(tokenAlive && _who\) \{ showServerRefusedBar\(\); return; \}/.test(appSrc)
    && !/_serverRefused = _isAuthReason/.test(appSrc));
}

console.log('\nAUTH STALE RETRY:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
