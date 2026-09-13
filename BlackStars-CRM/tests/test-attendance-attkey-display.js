// v6.515 — a same-sport two-coach student stores the extra coach's attendance under a coach-qualified
// key (sport + ' ' + coachId). Two bugs: (1) the separator had become a NULL byte (\u0000), so the key
// showed as "Kick Boxing\uFFFD1" (a � glyph) and was an illegal Firebase/control-char key; (2) the
// save-confirmation modal displayed that raw key AND fed it to the sessions lookup, so it read the
// wrong sport → "SESSIONS REMAINING: not tracked". Fix: real space separator; the modal strips the
// coach suffix (via a dispSport) for BOTH the label and the sessions lookup.
const H = require('./qc-harness.js');
const R = H.reporter('v6.515 · attKey display + no NULL separator');
const src = H.readSrc();

R.section('no corrupted separator');
R.ok('pages.js contains no NULL byte', !src.includes('\u0000'));
R.ok('the attKey separator is a real space', /sport \+ ' ' \+ coachId/.test(src));

R.section('save-confirmation modal shows the clean sport, not the storage key');
R.ok('a dispSport strips the trailing coach-id suffix', /const dispSport = String\(cell\.sport \|\| ''\)\.replace\(\/ \\d\+\$\/, ''\);/.test(src));
R.ok('the sessions lookup uses dispSport (so it finds the sub → not "not tracked")', /_sessionsLeftFromDoc\(doc, dispSport, cell\.iso\)/.test(src));
R.ok('the modal label uses dispSport', /\$\{escapeHtml\(_verb\)\} · \$\{escapeHtml\(dispSport\)\} · \$\{escapeHtml\(cell\.iso\)\}/.test(src));

R.section('the strip recovers the real sport name (runtime)');
{
  const strip = k => String(k || '').replace(/ \d+$/, '');
  R.ok('"Kick Boxing 1786021158730811" → "Kick Boxing"', strip('Kick Boxing 1786021158730811') === 'Kick Boxing');
  R.ok('"Kick Boxing 1" → "Kick Boxing"', strip('Kick Boxing 1') === 'Kick Boxing');
  R.ok('a plain sport is unchanged', strip('Kick Boxing') === 'Kick Boxing');
  R.ok('a sport with a number word is untouched (no trailing space+digits)', strip('MMA') === 'MMA');
}

R.done();
