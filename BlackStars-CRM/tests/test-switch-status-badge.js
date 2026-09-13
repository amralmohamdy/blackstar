// v6.483 — a sport the member SWITCHED AWAY FROM must stay visible in the member-card Subscription
// History, clearly flagged "🔀 switched → <new sport>". It used to re-derive as "active" (its end date
// hadn't passed yet), which is why the owner asked "I switched the sport, why doesn't it show right?".
// Verified in a browser: Yaman's Karate row (switchedAwayTo:'Boxing') renders "🔀 switched → Boxing".
const H = require('./qc-harness.js');
const R = H.reporter('SWITCH · switched sport shows a "switched" status');
const src = H.readSrc();
const ok = (n, c) => R.ok(n, c);

R.section('status derivation flags a switched-away sub first');
// v6.484: the destination is _switchedTo — from s.switchedAwayTo (reconciled) OR m.sportSwitches (old-way).
ok('a switched sub is flagged "switched" (wins over active/completed)', /if \(_switchedTo\) \{ label = 'switched'; cls = 'switched'; \}/.test(src));
ok('it is checked BEFORE the isCompleted / end-date branches', /if \(_switchedTo\) \{ label = 'switched'[\s\S]{0,120}else if \(isCompleted\)/.test(src));

R.section('the "switched" badge renders with its own style');
ok('a dedicated switched badge branch exists', /const badge = cls === 'switched'/.test(src));
ok('the badge shows 🔀 switched → the new sport', /🔀 \$\{t\('switched', 'محوّل'\)\} → \$\{escapeHtml\(_switchedTo\)\}/.test(src));
ok('the tooltip explains the coach keeps the attended classes', /the coach keeps the classes attended here; the remaining classes moved to the new sport/.test(src));

R.done();
