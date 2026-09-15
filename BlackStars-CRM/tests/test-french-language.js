// v6.437 — FRENCH (fr) added as a third UI language. To avoid editing the thousands of t(en, ar)
// call sites, French is a dictionary (FR_STRINGS) keyed by the ENGLISH string: when French is
// active, t() returns FR_STRINGS[en] if present, else falls back to English. French is LTR (unlike
// Arabic RTL). The language toggle cycles English → العربية → Français → English.
const H = require('./qc-harness.js');
const R = H.reporter('FRENCH language (fr) as a third locale');
const run = (c, s) => H.vm.runInContext(s, c);
const ctx = H.makeCtx({ role: 'admin', today: '2026-08-01' });

R.section('setLang / getLang accept fr');
{
  run(ctx, `setLang('fr')`);
  R.ok('getLang() returns fr after setLang(fr)', run(ctx, `getLang()`) === 'fr');
  R.ok('an unknown lang falls back to en', (run(ctx, `setLang('zz'); getLang()`)) === 'en');
}

R.section('t() returns French from the dictionary, English otherwise');
{
  run(ctx, `setLang('fr')`);
  R.ok("t('Save', …) → Enregistrer", run(ctx, `t('Save','حفظ')`) === 'Enregistrer');
  R.ok("t('Members', …) → Membres", run(ctx, `t('Members','الأعضاء')`) === 'Membres');
  R.ok("t('Active', …) → Actif", run(ctx, `t('Active','x')`) === 'Actif');
  R.ok('an untranslated string falls back to English', run(ctx, `t('Some Untranslated Label','x')`) === 'Some Untranslated Label');
}

R.section('French is LTR; Arabic + English are unaffected');
{
  run(ctx, `setLang('fr')`);
  R.ok('document dir = ltr under French', run(ctx, `document.documentElement.dir`) === 'ltr');
  R.ok('document lang = fr under French', run(ctx, `document.documentElement.lang`) === 'fr');
  run(ctx, `setLang('ar')`);
  R.ok('Arabic still returns the Arabic string', run(ctx, `t('Save','حفظ')`) === 'حفظ');
  R.ok('Arabic still sets dir = rtl', run(ctx, `document.documentElement.dir`) === 'rtl');
  run(ctx, `setLang('en')`);
  R.ok('English returns English and dir = ltr', run(ctx, `t('Save','حفظ')`) === 'Save' && run(ctx, `document.documentElement.dir`) === 'ltr');
}

R.section('source wiring — a 3-language drop-down');
{
  const src = H.readSrc();
  R.ok('FR_STRINGS dictionary exists', /const FR_STRINGS = \{/.test(src));
  R.ok('t() consults FR_STRINGS when French is active', /if \(l === 'fr'\) return \(FR_STRINGS\[en\] != null/.test(src));
  R.ok('the in-app switcher is a compact <select> with EN/ع/FR codes', /const langBtn = el\('select'/.test(src) && /\[\['en', 'EN'\], \['ar', 'ع'\], \['fr', 'FR'\]\]/.test(src));
  R.ok('changing the drop-down sets the language', /langBtn\.addEventListener\('change', \(\) => \{ setLang\(langBtn\.value\); render\(\); \}\)/.test(src));
  R.ok('the login switcher is a <select id="login-lang"> drop-down', /<select id="login-lang"/.test(src) && /langToggle\.addEventListener\('change', \(\) => \{ setLang\(langToggle\.value\)/.test(src));
}

R.done();
