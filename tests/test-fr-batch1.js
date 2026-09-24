// v6.606 — French batch 1: the parent-facing Attendance report + high-traffic UI now return French
// under the 'fr' locale (t() reads FR_STRINGS). Untranslated keys still fall back to English.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.606 · French batch 1');
const ctx = H.makeCtx({});
vm.runInContext(`localStorage.setItem('bs-lang','fr');`, ctx);
const tr = (en) => vm.runInContext(`t(${JSON.stringify(en)}, '')`, ctx);

R.section('locale is French');
R.ok('getLang() === fr', vm.runInContext(`getLang()`, ctx) === 'fr');

R.section('report strings translate');
{
  R.ok('Attendance details report', tr('Attendance details report') === 'Rapport détaillé de présence');
  R.ok('Student · Sport · Coach', tr('Student · Sport · Coach') === 'Élève · Sport · Entraîneur');
  R.ok('Membership', tr('Membership') === 'Abonnement');
  R.ok('Details report', tr('Details report') === 'Rapport détaillé');
  R.ok('multi-coach', tr('multi-coach') === 'plusieurs entraîneurs');
  R.ok('classes attended in total', tr('classes attended in total') === 'cours suivis au total');
}

R.section('dashboard + payments translate');
{
  R.ok('Renewals', tr('Renewals') === 'Renouvellements');
  R.ok('Collect a payment', tr('Collect a payment') === 'Encaisser un paiement');
  R.ok('Charged = Paid + Due', tr('Charged = Paid + Due') === 'Facturé = Payé + Dû');
  R.ok('Split across methods', tr('Split across methods (e.g. part cash + part card)') === 'Répartir entre les modes (ex. partie espèces + partie carte)');
  R.ok('Storage', tr('Storage') === 'Stockage');
}

R.section('classes screen translates');
{
  R.ok('from the weekly schedule', tr('from the weekly schedule') === 'd’après l’emploi du temps hebdomadaire');
  R.ok('across all shown classes', tr('across all shown classes') === 'sur tous les cours affichés');
}

R.section('fallback + other locales intact');
{
  R.ok('an untranslated key falls back to English', tr('a totally untranslated string xyz') === 'a totally untranslated string xyz');
  const ctxEn = H.makeCtx({});
  R.ok('English locale unchanged', vm.runInContext(`t('Details report','x')`, ctxEn) === 'Details report');
  const ctxAr = H.makeCtx({});
  vm.runInContext(`localStorage.setItem('bs-lang','ar')`, ctxAr);
  R.ok('Arabic still returns the Arabic arg', vm.runInContext(`t('Membership','الاشتراك')`, ctxAr) === 'الاشتراك');
}

R.done();
