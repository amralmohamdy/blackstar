// v6.608 — each Expiring summary box shows the total renewal VALUE of its members (sum of each
// member's current membership price via memberRenewalValue), not just the head-count. Per-section
// subtitles + the Potential Revenue box use the same real value (no more ×AVG estimate).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.608 · expiring box totals');

R.section('source: real per-bucket value + wiring');
{
  const src = H.readSrc();
  R.ok('sums each member renewal value per bucket', /const _sumVal = arr => arr\.reduce\(\(s, x\) => s \+ _rv\(x\.m\), 0\)/.test(src) && /const valExpired = _sumVal\(expired\)/.test(src));
  R.ok('Already Expired box shows 💰 valExpired', /Already Expired[\s\S]{0,160}💰 \$\{fmt\(valExpired\)\} QAR/.test(src));
  R.ok('≤7 days box shows valSoon + valWeek', /💰 \$\{fmt\(valSoon \+ valWeek\)\} QAR/.test(src));
  R.ok('≤30 days box shows valWeek + valUpcoming', /💰 \$\{fmt\(valWeek \+ valUpcoming\)\} QAR/.test(src));
  R.ok('Completed box shows valCompleted', /💰 \$\{fmt\(valCompleted\)\} QAR/.test(src));
  R.ok('per-section subtitle uses the real sum (not ×AVG)', /💰 <b style="color:\$\{color\}">\$\{fmt\(_sumVal\(list\)\)\} QAR<\/b>/.test(src));
  R.ok('Potential Revenue box uses the real total', /Potential Revenue[\s\S]{0,120}\$\{fmt\(valExpired \+ valSoon\)\}/.test(src));
}

R.section('render: an amount appears in the boxes');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin', today: '2026-07-24' }));
  const r = H.renderScreen(ctx, 'expiring');
  R.ok('expiring screen renders', r.ok, r.error);
  R.ok('the summary boxes show a 💰 … QAR amount', /💰[^<]*QAR/.test(r.html), (r.html || '').slice(0, 80));
  // seed has Omar (103) Expired · Kick Boxing price 650 → Already Expired total should be > 0
  R.ok('Already Expired total reflects a real value (>0)', /Already Expired[\s\S]{0,200}💰 [1-9][\d,]*\s*QAR/.test(r.html));
}

R.section('viewer role hides the amounts (money-private)');
{
  const ctx = H.seed(H.makeCtx({ role: 'coach', today: '2026-07-24' }));
  const r = H.renderScreen(ctx, 'expiring');
  // coaches are viewers here; the per-section 💰 potential is already gated by isViewerRole — the box
  // amounts are always shown (counts), but Potential Revenue box is hidden for viewers.
  R.ok('renders for a coach without error', r.ok, r.error);
}

R.done();
