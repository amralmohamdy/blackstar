// v6.492 — one login can access a whole FAMILY (userRoles[email].familyId). effectiveMemberIds()
// returns every family member (recomputed from familyMembers so a later sibling auto-appears);
// effectiveMemberId() is the ACTIVE one (primary by default); setActiveMember(id) switches it,
// but only among the login's own members. A single-member login stays a 1-item list.
const H = require('./qc-harness.js');
const R = H.reporter('USERS · one login → a whole family');
const ok = (n, c) => R.ok(n, c);

const ctx = H.makeCtx({ today: '2026-08-12' });
ok('app + pages loaded clean', !ctx.__loadError);
const run = (code) => H.vm.runInContext(code, ctx);
run('render = function(){};');

run("state.families = [{id:70,name:'Awadalla family'}];");
run("state.members = [" +
  "{id:301,name:'Hossam',familyId:70}," +
  "{id:302,name:'Yaman',familyId:70}," +
  "{id:303,name:'Lana',familyId:70}," +
  "{id:999,name:'Unrelated'}" +
"];");

// A family login.
run("state.user = {role:'student',memberId:301,memberIds:[301],familyId:70}; state.session = {role:'student',memberId:301,familyId:70};");
ok('effectiveFamilyId returns the linked family', run('effectiveFamilyId()') === 70);
ok('effectiveMemberIds returns ALL family members', run('JSON.stringify(effectiveMemberIds())') === '[301,302,303]');
ok('effectiveMemberId returns the primary (active)', run('effectiveMemberId()') === 301);

// A sibling added LATER auto-appears (list is derived from familyMembers).
run("state.members.push({id:304,name:'NewBaby',familyId:70});");
ok('a sibling added later is auto-included', run('JSON.stringify(effectiveMemberIds())') === '[301,302,303,304]');

// Switch the active member.
run('setActiveMember(302)');
ok('setActiveMember(302) switches the active member', run('effectiveMemberId()') === 302);
run("setActiveMember('303')");
ok('setActiveMember accepts a string id', run('effectiveMemberId()') === 303);

// Guard: cannot switch to a member outside the family.
run('setActiveMember(999)');
ok('setActiveMember ignores a member outside the family', run('effectiveMemberId()') === 303);

// Deleted members drop out of the set.
run("state.members.find(x=>x.id===304).deleted = true;");
ok('a deleted member drops out of the family set', run('JSON.stringify(effectiveMemberIds())') === '[301,302,303]');

// Back-compat: a plain single-member login.
run("state.user = {role:'student',memberId:999,memberIds:[999],familyId:null}; state.session = {role:'student',memberId:999};");
ok('single-member login → 1-item set', run('JSON.stringify(effectiveMemberIds())') === '[999]');
ok('single-member effectiveMemberId works', run('effectiveMemberId()') === 999);
ok('single-member has no family', run('effectiveFamilyId()') === null);

// roleForEmail surfaces familyId + memberIds.
run("state.settings = state.settings || {}; state.settings.userRoles = {'fam@x.com':{role:'student',memberId:301,familyId:70},'solo@x.com':{role:'student',memberId:999}};");
ok('roleForEmail returns familyId for a family mapping', run("roleForEmail('fam@x.com').familyId") === 70);
ok('roleForEmail: solo login has null familyId', run("String(roleForEmail('solo@x.com').familyId)") === 'null');

// ---- source: mapping UI + mymembership strip ----
const src = H.readSrc();
ok('mapping modal offers a FAMILY picker', /id="ur-family"/.test(src));
ok('save stores entry.familyId from the family picker', /entry\.familyId = famId;/.test(src));
ok('save derives member list from the family', /entry\.memberIds = mids;/.test(src));
ok('My Membership renders a family overview strip', /a "smart" overview of EVERY family member/.test(src));
ok('family strip cards call setActiveMember', /onclick="setActiveMember\(\$\{id\}\)"/.test(src));
ok('sidebar shows a member switcher for a family login', /onchange="setActiveMember\(this\.value\)"/.test(src));
ok('users list shows the family label', /function _memberMapLabel/.test(src));

R.done();
