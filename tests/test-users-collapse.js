// v6.611 — Users & Roles role groups (Admin/Receptionist/Coach/Student) collapse/expand by clicking
// the group header. State in window._userGroupCollapsed; search forces all groups open.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.611 · users collapsible groups');

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('_toggleUserGroup flips the collapsed state + re-renders', /window\._toggleUserGroup = function\(role\) \{[\s\S]{0,180}renderUserRolesList\(\)/.test(src));
  R.ok('group header is clickable → _toggleUserGroup(role)', /onclick="window\._toggleUserGroup\('\$\{role\}'\)"/.test(src));
  R.ok('collapsed hides the group rows (chevron ▸/▾)', /const collapsed = !_searching && !!window\._userGroupCollapsed\[role\]/.test(src) && /collapsed \? '' : list\.map\(rowHtml\)/.test(src));
  R.ok('active search forces groups open', /const _searching = !!\(window\._userSearch/.test(src));
}

R.section('render + toggle behaviour');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  vm.runInContext(`
    state.settings = state.settings || {};
    state.settings.userRoles = {
      'admin@bs.com': { role:'admin' },
      'r@bs.com': { role:'receptionist' },
      'c1@bs.com': { role:'coach', coachId:1 },
      'c2@bs.com': { role:'coach', coachId:2 },
    };
    window._userSearch = ''; window._userGroupCollapsed = {};
  `, ctx);
  const r = H.renderScreen(ctx, 'users');
  R.ok('users screen renders with clickable group headers', r.ok && /_toggleUserGroup\('coach'\)/.test(r.html), r.error);
  const toggled = vm.runInContext(`(function(){ window._toggleUserGroup('coach'); return window._userGroupCollapsed.coach === true; })()`, ctx);
  R.ok('clicking a header sets that group collapsed', toggled === true);
  const toggled2 = vm.runInContext(`(function(){ window._toggleUserGroup('coach'); return !!window._userGroupCollapsed.coach; })()`, ctx);
  R.ok('clicking again expands it', toggled2 === false);
}

R.done();
