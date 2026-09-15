// v6.428 — Members filter cleanup + Danger Zone PIN + footer "More" grouping.
// (1) removed: the tip banner, the "Similar names" toggle, the Enrolled/Created date-range filter.
// (2) added: a "Completed" option to the expiry filter (filters memberStatus === 'Completed') + an
//     always-visible Clear-filters button. (3) Danger Zone destructive actions now require PIN 4242.
// (4) the Administrator pill + Refresh-from-cloud moved into the footer "More" group.
const H = require('./qc-harness.js');
const R = H.reporter('MEMBERS FILTERS + DANGER PIN + FOOTER MORE');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Coach', active:'Y' }];
    state.members = [
      { id:1, name:'Active One', sport:'Boxing', coachId:1, status:'Active', expiryDate:'2026-12-31',
        enrollments:[{sport:'Boxing',coachId:1,classes:8,price:400}],
        subscriptions:[{activity:'Boxing',coachId:1,start:'2026-07-01',end:'2026-12-31',totalClasses:8,attendedClasses:2,status:'active'}] },
      { id:2, name:'Finished One', sport:'Karate', coachId:1, status:'Completed', expiryDate:'2026-12-31',
        enrollments:[{sport:'Karate',coachId:1,classes:6,price:300}],
        subscriptions:[{activity:'Karate',coachId:1,start:'2026-07-01',end:'2026-12-31',totalClasses:6,attendedClasses:6,status:'completed'}] },
    ];
    state.invoices = [];
  `);
}

R.section('Members filter bar: cleaned up + Completed option');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const html = H.renderScreen(ctx, 'members').html || '';
  R.ok('the "Use + Add Member…" tip banner is GONE', !/Use <strong>\+ Add Member/.test(html));
  R.ok('the "Similar names" toggle is GONE', !/id="filter-dupnames"/.test(html));
  R.ok('the Enrolled/Created date-range filter is GONE', !/id="filter-date-basis"/.test(html) && !/id="filter-date-from"/.test(html));
  R.ok('the expiry filter has a Completed option', /value="completed"[^>]*>✅ /.test(html));
  R.ok('an always-visible Clear-filters button is present', /id="members-clear-filters-inline"/.test(html));
}

R.section('v6.431 — the inline Clear-filters handler is in-scope (no DEFAULT_F ReferenceError)');
{
  const src = H.readSrc();
  // The handler runs at the top level of PAGES.members; DEFAULT_F is scoped to refresh(), so the
  // handler must NOT reference DEFAULT_F (that threw the "something glitched" toast and left the
  // list stuck at 0). It must save an inline default object instead.
  const handler = (src.split("members-clear-filters-inline")[1] || '').slice(0, 400);
  R.ok('the inline clear handler does NOT reference the out-of-scope DEFAULT_F', !/\bDEFAULT_F\b/.test(handler.split('addEventListener')[1] || handler));
  R.ok('the inline clear handler saves an inline default filter', /saveFilter\('members', \{ search: '', statuses: \[\]/.test(src));
  // DEFAULT_F itself is only referenced inside refresh() (declaration + the banner clear).
  const refs = (src.match(/\bDEFAULT_F\b/g) || []).length;
  R.ok('DEFAULT_F is referenced only where it is declared (≤3 times, all in refresh)', refs <= 3, refs);
}

R.section('the Completed expiry filter narrows to Completed-status members');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  R.ok('member 2 is Completed status', run(ctx, `memberStatus(state.members[1])`) === 'Completed', run(ctx, `memberStatus(state.members[1])`));
  // Replay the predicate the members list uses for expiry==='completed'.
  const kept = run(ctx, `state.members.filter(m => { const f={expiry:'completed'}; if (f.expiry==='completed' && memberStatus(m)!=='Completed') return false; return true; }).map(m=>m.id)`);
  R.ok('only the Completed member passes', JSON.stringify(kept) === JSON.stringify([2]), kept);
  R.ok('the source applies the completed expiry filter', /f\.expiry === 'completed'[\s\S]{0,80}memberStatus\(m\) !== 'Completed'/.test(H.readSrc()));
}

R.section('Danger Zone destructive actions require PIN 4242');
{
  const src = H.readSrc();
  R.ok('a DANGER_PIN of 4242 is defined', /const DANGER_PIN = '4242'/.test(src));
  R.ok('dangerAction prompts for the PIN and cancels on mismatch', /const pin = prompt\(/.test(src) && /String\(pin\)\.trim\(\) !== DANGER_PIN\) \{ toast/.test(src));
  R.ok('the PIN gate sits BEFORE the first confirm', /String\(pin\)\.trim\(\) !== DANGER_PIN[\s\S]{0,140}if \(!confirm\(firstMsg\)\)/.test(src));
}

R.section('footer: Administrator pill + Refresh-from-cloud moved into the "More" group');
{
  const src = H.readSrc('app.js');
  // The user-pill now lives INSIDE #foot-more-group, after the toggle button.
  R.ok('the More toggle comes before the user pill', /id="foot-more-group"[\s\S]{0,120}class="user-pill"/.test(src));
  R.ok('the Refresh-from-cloud button is inside the More group', /id="foot-more-group"[\s\S]{0,800}id="sidebar-refresh"/.test(src));
}

R.done();
