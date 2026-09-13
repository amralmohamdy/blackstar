// v6.419 — sidebar changes: (1) My Dashboard icon fixed from the ZWJ 🧑‍🏫 (rendered as two
// glyphs) to a single-glyph 🏠; (2) the coach "My Salary" page is disabled (hidden from nav);
// (3) the whole nav is ONE flat list — no category section headers.
const H = require('./qc-harness.js');
const R = H.reporter('SIDEBAR · flat nav + coach tweaks');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('ROUTES config: icon fixed + My Salary re-enabled (v6.448)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  R.ok('My Dashboard icon is the single-glyph 🏠 (no ZWJ)', run(ctx, `ROUTES.coachhome.icon`) === '🏠', run(ctx, `ROUTES.coachhome.icon`));
  R.ok('My Dashboard icon is NOT the old teacher ZWJ emoji', !/‍/.test(run(ctx, `ROUTES.coachhome.icon`)));
  R.ok('My Salary (coachsalary) is NOT hidden — page re-enabled', run(ctx, `!!ROUTES.coachsalary.hidden`) === false);
}

R.section('My Salary page is RE-ENABLED for coaches (v6.448 — route allowed)');
{
  const ctx = H.makeCtx({ role: 'coach' });
  run(ctx, `state.session = { role:'coach', coachId:1 }; state.user = { role:'coach', coachId:1 };`);
  R.ok('coachsalary IS in the coach access list', run(ctx, `ROLE_ALLOWED.coach.indexOf('coachsalary')`) >= 0, run(ctx, `ROLE_ALLOWED.coach`));
  R.ok('roleCanAccess(coach, coachsalary) is true — the coach can open their salary page', run(ctx, `roleCanAccess('coach','coachsalary')`) === true);
  R.ok('the coach can still reach My Dashboard', run(ctx, `roleCanAccess('coach','coachhome')`) === true);
  R.ok('but the coach is still blocked from the ADMIN salaries screen', run(ctx, `roleCanAccess('coach','salaries')`) === false);
}

R.section('the coach dashboard no longer shows a My Salary card');
{
  const ctx = H.seed(H.makeCtx({ role: 'coach' }));
  run(ctx, `state.session = { role:'coach', coachId:1 }; state.user = { role:'coach', coachId:1 };`);
  const out = H.renderScreen(ctx, 'coachhome');
  R.ok('coachhome still renders', out.ok, out.error);
  const html = out.html || '';
  R.ok('the "My Salary" salary table/card is gone from the dashboard', !/My Salary|راتبي/.test(html));
  R.ok('the dashboard still shows My Students', /My Students|طلابي/.test(html));
}

R.section('a coach sees a flat list without My Salary');
{
  const ctx = H.makeCtx({ role: 'coach' });
  run(ctx, `state.session = { role:'coach', coachId:1 }; state.user = { role:'coach', coachId:1 };`);
  // Replay the exact flat-entries filter renderSidebar now uses.
  const keys = run(ctx, `(function(){
    const sections = ['Main','Membership','Activities','Summer Camp','Team & Sports','Finance','Insights','System'];
    const out = [];
    for (const section of sections) for (const [key, route] of Object.entries(ROUTES)) {
      if (route.section !== section || route.hidden) continue;
      if (!roleCanAccess(currentRole(), key)) continue;
      if (route.memberOnly && currentRole() !== 'student') continue;
      if (route.coachOnly && currentRole() !== 'coach') continue;
      if (route.adminOnly && currentRole() !== 'admin') continue;
      out.push(key);
    }
    return out;
  })()`);
  R.ok('coach nav INCLUDES My Dashboard', keys.includes('coachhome'), keys);
  R.ok('coach nav INCLUDES My Salary (re-enabled v6.448)', keys.includes('coachsalary'), keys);
  R.ok('Main-section items come before later sections (order preserved)', keys.indexOf('coachhome') === 0 || keys.indexOf('coachhome') < keys.indexOf('schedule'), keys);
}

R.section('admin still sees the full set (now grouped again — see source section)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const keys = run(ctx, `(function(){
    const sections = ['Main','Membership','Activities','Summer Camp','Team & Sports','Finance','Insights','System'];
    const out = [];
    for (const section of sections) for (const [key, route] of Object.entries(ROUTES)) {
      if (route.section !== section || route.hidden) continue;
      if (!roleCanAccess(currentRole(), key)) continue;
      if (route.memberOnly && currentRole() !== 'student') continue;
      if (route.coachOnly && currentRole() !== 'coach') continue;
      if (route.adminOnly && currentRole() !== 'admin') continue;
      out.push(key);
    }
    return out;
  })()`);
  R.ok('admin gets Members, Invoices, Salaries etc.', keys.includes('members') && keys.includes('invoices') && keys.includes('salaries'));
  R.ok('coach-only pages are NOT in the admin list', !keys.includes('coachhome'));
}

R.section('source: coach/student flat, admin/reception grouped (v6.422 revert for admin)');
{
  const src = H.readSrc();
  R.ok('a flatNav gate targets ONLY coach + student', /const flatNav = \(currentRole\(\) === 'coach' \|\| currentRole\(\) === 'student'\);/.test(src));
  R.ok('coach/student branch renders a flat list', /if \(flatNav\) \{[\s\S]{0,320}nav\.append\(makeNavItem/.test(src));
  R.ok('admin/reception branch restores collapsible category groups', /nav\.append\(header\); nav\.append\(group\);/.test(src));
  R.ok('category collapse state is used again for the grouped roles', /bs-nav-collapsed/.test(src));
  R.ok('category section headers exist again in the page nav', /className: 'nav-section nav-section-toggle'/.test(src));
}

R.done();
