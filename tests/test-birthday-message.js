// v6.596 — the birthday WhatsApp message: FIRST name in both languages (Arabic used the full name),
// sport-neutral wording (no "on the mat"), and gender-aware Arabic (أنتِ/لكِ for a female member).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.596 · birthday message');
const run = (c, s) => vm.runInContext(s, c);

R.section('female member — Lolwa (full Arabic name)');
{
  const ctx = H.makeCtx({ today: '2026-09-21' });
  const msg = run(ctx, `birthdayWaMessage({ name:'Lolwa Saud A F Al-Athba', nameArabic:'لولوه سعود عبدالرحمن فيصل العذبه', gender:'Female' })`);
  R.ok('English uses the FIRST name only', /Happy Birthday, Lolwa!/.test(msg) && !/Lolwa Saud/.test(msg));
  R.ok('Arabic uses the FIRST name only (not the full name)', /يا لولوه!/.test(msg) && !/لولوه سعود/.test(msg));
  R.ok('no martial-arts-specific "on the mat"', !/on the mat/.test(msg));
  R.ok('English invites back to the club', /see you back at the club/.test(msg));
  R.ok('Arabic uses FEMALE forms (وأنتِ / لكِ / تستحقّين / نراكِ)', /وأنتِ بخير/.test(msg) && /نتمنّى لكِ/.test(msg) && /تستحقّين/.test(msg) && /نراكِ/.test(msg));
  R.ok('both languages present, separated', /———/.test(msg) && /Black Stars Sports Club/.test(msg) && /نادي بلاك ستارز الرياضي/.test(msg));
}

R.section('male member — masculine Arabic');
{
  const ctx = H.makeCtx({ today: '2026-09-21' });
  const msg = run(ctx, `birthdayWaMessage({ name:'Ahmad Ali', nameArabic:'أحمد علي', gender:'Male' })`);
  R.ok('Arabic uses MALE forms (وأنت / لك / تستحقّ)', /وأنت بخير/.test(msg) && /نتمنّى لك /.test(msg) && /تستحقّ كل خير/.test(msg));
  R.ok('not the female forms', !/وأنتِ/.test(msg) && !/تستحقّين/.test(msg));
  R.ok('first name in Arabic', /يا أحمد!/.test(msg));
}

R.section('unknown gender → masculine default, no crash');
{
  const ctx = H.makeCtx({ today: '2026-09-21' });
  const msg = run(ctx, `birthdayWaMessage({ name:'Sam', nameArabic:'' })`);
  R.ok('renders with English first name', /Happy Birthday, Sam!/.test(msg));
  R.ok('defaults to masculine Arabic', /وأنت بخير/.test(msg) && !/وأنتِ/.test(msg));
  R.ok('no " يا " when no Arabic name', !/يا !/.test(msg));
}

R.done();
