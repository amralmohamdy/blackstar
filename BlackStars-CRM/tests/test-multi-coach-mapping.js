// v6.491 — one login can be linked to SEVERAL coaches (userRoles[email].coachIds) and switch
// between them from the sidebar. effectiveCoachIds() exposes the full set; effectiveCoachId()
// returns the ACTIVE one (primary by default); setActiveCoach(id) switches it — but only among
// the account's own coaches. Back-compat: an old single-coachId mapping still works as 1 coach.
const H = require('./qc-harness.js');
const R = H.reporter('USERS · one login → multiple coaches');
const ok = (n, c) => R.ok(n, c);

const ctx = H.makeCtx({ today: '2026-08-12' });
ok('app + pages loaded clean', !ctx.__loadError);
const run = (code) => H.vm.runInContext(code, ctx);
run('render = function(){};');   // no-op the re-render setActiveCoach triggers
run("state.coaches = [{id:1,name:'Aziz'},{id:2,name:'Ibrahim'},{id:5,name:'Ahmed'},{id:9,name:'Zara'}];");

// A multi-coach login.
run("state.user = {role:'coach',coachId:1,coachIds:[1,2,5]}; state.session = {role:'coach',coachId:1,coachIds:[1,2,5]};");
ok('effectiveCoachIds returns ALL mapped coaches', run('JSON.stringify(effectiveCoachIds())') === '[1,2,5]');
ok('effectiveCoachId returns the primary (first)', run('effectiveCoachId()') === 1);

// Switch active coach.
run('setActiveCoach(2)');
ok('setActiveCoach(2) makes 2 the active coach', run('effectiveCoachId()') === 2);
ok('the full set is unchanged after switching', run('JSON.stringify(effectiveCoachIds())') === '[1,2,5]');
run("setActiveCoach('5')");   // string id also works
ok('setActiveCoach accepts a string id', run('effectiveCoachId()') === 5);

// Guard: cannot switch to a coach NOT in the account's set.
run('setActiveCoach(9)');
ok('setActiveCoach ignores a coach outside the account set', run('effectiveCoachId()') === 5);

// A stale id (coach deleted) is dropped from the set.
run('state.user.coachIds = [1,2,999]; state.session.coachIds = [1,2,999];');
ok('effectiveCoachIds drops ids that no longer resolve to a coach', run('JSON.stringify(effectiveCoachIds())') === '[1,2]');

// Back-compat: a legacy single-coach login.
run("state.user = {role:'coach',coachId:2}; state.session = {role:'coach',coachId:2};");
ok('legacy single-coach mapping → 1-item set', run('JSON.stringify(effectiveCoachIds())') === '[2]');
ok('legacy single-coach effectiveCoachId works', run('effectiveCoachId()') === 2);

// roleForEmail surfaces coachIds from the stored mapping.
run("state.settings = state.settings || {}; state.settings.userRoles = {'multi@x.com':{role:'coach',coachId:1,coachIds:[1,2,5]},'solo@x.com':{role:'coach',coachId:5}};");
ok('roleForEmail returns coachIds for a multi mapping', run("JSON.stringify(roleForEmail('multi@x.com').coachIds)") === '[1,2,5]');
ok('roleForEmail synthesizes coachIds from a legacy single coachId', run("JSON.stringify(roleForEmail('solo@x.com').coachIds)") === '[5]');

// ---- source: the mapping UI + save wire coachIds ----
const src = H.readSrc();
ok('mapping modal renders coach CHECKBOXES (multi-select)', /class="ur-coach-cb"/.test(src));
ok('save collects checked coach ids into entry.coachIds', /entry\.coachIds = coachIds;/.test(src));
ok('save keeps entry.coachId = first (back-compat)', /entry\.coachId = coachIds\[0\];/.test(src));
ok('save requires at least one coach', /Pick at least one coach/.test(src));
ok('sidebar shows a coach switcher when >1 coach', /onchange="setActiveCoach\(this\.value\)"/.test(src));
ok('users list shows all linked coach names', /function _coachMapNames/.test(src));

R.done();
