// v6.530 — a schedule class can carry a custom name in BOTH English (label) and Arabic (labelAr).
// The Add/Edit dialog has two fields; the tile and poster show the name in the viewer's language.
const H = require('./qc-harness.js');
const R = H.reporter('v6.530 · bilingual custom class names');
const src = H.readSrc();

R.section('source — dialog + save + render');
R.ok('the dialog has an English label field', /id="sch-label"/.test(src) && /Class name — English/.test(src));
R.ok('the dialog has an Arabic label field', /id="sch-label-ar"/.test(src) && /Class name — Arabic/.test(src));
R.ok('the Arabic label is read + saved (add + edit)', /const _labelAr = /.test(src) && /existing\.labelAr = _labelAr/.test(src) && /_rec\.labelAr = _labelAr/.test(src));
R.ok('the schedule tile picks the language-appropriate label', /t\(c\.label \|\| c\.sport, c\.labelAr \|\| c\.label \|\| sportNameAR\(c\.sport\)\)/.test(src));
R.ok('the poster picks the language-appropriate label', /const nm = ar \? \(c\.labelAr \|\| c\.label \|\| sportNameAR\(c\.sport\)\) : \(c\.label \|\| c\.sport\)/.test(src));

R.section('runtime — the fallback chain resolves correctly');
{
  // Replicate the poster's resolution: ar → labelAr || label || sportAR ; en → label || sport.
  const sportAR = { 'Kick Boxing': 'الكيك بوكسينغ', 'Karate': 'الكاراتيه' };
  const nm = (c, ar) => ar ? (c.labelAr || c.label || sportAR[c.sport] || c.sport) : (c.label || c.sport);

  const both = { sport: 'Kick Boxing', label: 'Ladies Kick-Boxing', labelAr: 'كيك بوكسينغ سيدات' };
  R.ok('EN poster shows the English custom name', nm(both, false) === 'Ladies Kick-Boxing');
  R.ok('AR poster shows the Arabic custom name', nm(both, true) === 'كيك بوكسينغ سيدات');

  const enOnly = { sport: 'Karate', label: 'Karate (Kids)' };
  R.ok('EN shows the English custom name', nm(enOnly, false) === 'Karate (Kids)');
  R.ok('AR (no Arabic label) falls back to the English label (not lost)', nm(enOnly, true) === 'Karate (Kids)');

  const none = { sport: 'Kick Boxing' };
  R.ok('no labels → EN shows the sport', nm(none, false) === 'Kick Boxing');
  R.ok('no labels → AR shows the Arabic sport name', nm(none, true) === 'الكيك بوكسينغ');

  const arOnly = { sport: 'Karate', labelAr: 'كاراتيه أطفال' };
  R.ok('AR-only → AR shows the Arabic custom name', nm(arOnly, true) === 'كاراتيه أطفال');
  R.ok('AR-only → EN falls back to the sport (no English label)', nm(arOnly, false) === 'Karate');
}

R.done();
