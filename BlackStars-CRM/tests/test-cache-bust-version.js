// v6.481 — CRITICAL deploy guard. index.html cache-busts its scripts/styles with ?v=<version>.
// That string was frozen at ?v=6.403.0 while version.json/APP_VERSION marched on to 6.480, so every
// deploy since 6.403 served browsers the STALE CACHED app.js/pages.js (the browser re-requests the
// SAME ?v=6.403.0 URL it already has). ~77 versions of fixes never reached users unless they hard-
// refreshed. This test fails the build if the cache-bust in index.html ever drifts from version.json
// again — so a forgotten bump can never silently ship stale code to the club.
const fs = require('fs'); const path = require('path');
const H = require('./qc-harness.js');
const R = H.reporter('DEPLOY · index.html cache-bust matches version.json');
const dir = H.DIR;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const ver = JSON.parse(fs.readFileSync(path.join(dir, 'version.json'), 'utf8')).version;
const ok = (n, c) => R.ok(n, c);

R.section('every ?v= in index.html equals the release version');
const tags = [...html.matchAll(/(?:src|href)=["']([^"']+\?v=([^"'&]+))["']/g)];
ok('index.html actually cache-busts its local assets', tags.length >= 4, tags.length);
const versions = [...new Set(tags.map(m => m[2]))];
ok('there is exactly ONE cache-bust version across all tags', versions.length === 1, versions);
ok(`that version equals version.json (${ver})`, versions.length === 1 && versions[0] === ver, { inHtml: versions[0], versionJson: ver });

R.section('the core money/UI scripts are the ones being busted');
for (const f of ['app.js', 'pages.js', 'styles.css', 'storage.js']) {
  const m = html.match(new RegExp(f.replace('.', '\\.') + '\\?v=([^"\'&]+)'));
  ok(`${f} is loaded with ?v=${ver}`, !!m && m[1] === ver, m ? m[1] : 'NOT cache-busted');
}
ok('the stale 6.403.0 pin is gone', !/\?v=6\.403\.0/.test(html));

R.done();
