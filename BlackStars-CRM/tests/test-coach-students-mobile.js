// v6.417 — the coach dashboard "My Students" table shows each student's mobile number
// (a tap-to-WhatsApp link), between Sports and This-month. Display-only, from mem.phone.
const H = require('./qc-harness.js');
const R = H.reporter('COACH · My Students shows mobile number');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('the coach dashboard renders with the new Mobile column');
{
  const ctx = H.seed(H.makeCtx({ role: 'coach' }));
  // Log in AS coach #1 (Mostafa) so the dashboard scopes to their students.
  run(ctx, `state.user = { role:'coach', coachId:1 }; state.session = { role:'coach', coachId:1 };`);
  const out = H.renderScreen(ctx, 'coachhome');
  R.ok('coachhome renders without throwing', out.ok, out.error);
  const html = out.html || '';
  R.ok('a Mobile column header is present', /Mobile|الجوال/.test(html), html.slice(0, 200));
  R.ok('a student phone renders as a wa.me WhatsApp link', /wa\.me\/\d+/.test(html));
  R.ok('coach #1 student Ali Hassan (+97431000001) phone shows', html.indexOf('97431000001') !== -1);
}

R.section('the column is wired in source between Sports and This-month');
{
  const src = H.readSrc();
  R.ok('My Students header adds a Mobile th after Sports', /Sports', 'الرياضات'\)\}<\/th><th>\$\{t\('Mobile', 'الجوال'\)\}<\/th>/.test(src));
  R.ok('the cell renders mem.phone as a wa.me link with a no-phone fallback', /r\.mem && r\.mem\.phone \? `<a href="https:\/\/wa\.me\//.test(src) && /: '<span class="text-mute">—<\/span>'/.test(src));
}

R.done();
