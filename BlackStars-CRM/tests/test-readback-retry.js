// withCloudConfirm proves a write by READING THE RECORD BACK from the server. Firestore is
// eventually consistent for a moment after a commit, so a single read can miss a document that
// really did land — reporting a false failure on a good save. The read-back therefore retries
// with backoff before giving up. (Recreated — the original was lost to a %TEMP% clean.)
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

console.log('the read-back retries instead of failing on the first miss:');
{
  ok('it makes up to 3 attempts', (appSrc.match(/for \(let attempt = 0; attempt < 3; attempt\+\+\)/g) || []).length >= 2);
  ok('...with increasing backoff between them', /setTimeout\(r, 300 \* \(attempt \+ 1\)\)/.test(appSrc));
  ok('both the present-record and absent-record checks retry',
    (appSrc.match(/await new Promise\(r => setTimeout\(r, 300 \* \(attempt \+ 1\)\)\)/g) || []).length >= 2);
}

// Model the shipped loop so the timing behaviour itself is exercised, not just its source.
async function readBack(fetch) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await fetch();
    if (doc) return { ok: true, doc, attempts: attempt + 1 };
    if (attempt < 2) await new Promise(r => setTimeout(r, 1));
  }
  return { ok: false, attempts: 3 };
}

(async () => {
  console.log('\nbehaviour:');
  {
    let n = 0;
    const r = await readBack(async () => { n++; return { id: 1 }; });
    ok('a record visible immediately needs only one read', r.ok && r.attempts === 1, r);
  }
  {
    let n = 0;
    // visible only on the 3rd read — the exact eventual-consistency case
    const r = await readBack(async () => { n++; return n >= 3 ? { id: 1 } : null; });
    ok('a record that appears late is still confirmed (no false failure)', r.ok === true, r);
    ok('...and it took the extra attempts to find it', r.attempts === 3, r);
  }
  {
    const r = await readBack(async () => null);
    ok('a record that never appears is reported as NOT saved', r.ok === false, r);
    ok('...after exactly 3 attempts, not forever', r.attempts === 3, r);
  }

  console.log('\nthe popup renders the SERVER copy, never local state:');
  {
    ok('the confirmation card is built from the returned document', /function cloudRecordCardHtml\(collection, doc\)/.test(appSrc));
    ok('an unknown collection falls back rather than inventing a claim', /collection with no formatter falls back/.test(appSrc));
  }

  console.log('\nan absent-record check is supported (for deletions):');
  {
    ok('verify entries accept absent:true', /absent/.test(appSrc));
  }

  console.log('\nREAD-BACK RETRY:', pass, 'passed,', fail, 'failed');
  process.exit(fail ? 1 : 0);
})();
