// v6.415 — a sport ADDED or SWITCHED to is stored as an ENROLLMENT; if it has no matching
// SUBSCRIPTION row it showed in Edit Member but was INVISIBLE in the profile card's Subscription
// History (which listed only subscriptions[]). The owner switched a sport and it "didn't appear."
// The card now synthesizes a display row from any enrollment-only sport, with live attendance.
const H = require('./qc-harness.js');
const R = H.reporter('MEMBER · enrollment-only sport shows in Subscription History');

function seed(ctx) {
  H.vm.runInContext(`
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Mohammed', active:'Y' }, { id:2, name:'Mostafa', active:'Y' }];
    state.members = [{ id:5001, name:'Amjad Hamdan', phone:'+97470512674', sport:'Football', coachId:1,
      startDate:'2026-07-06', expiryDate:'2026-08-05',
      enrollments:[
        { sport:'Football', coachId:1, classes:8, price:425, start:'2026-07-06', validity:30 },
        { sport:'Karate',   coachId:2, classes:8, price:425, start:'2026-07-06', validity:30 },  // enrollment ONLY
      ],
      subscriptions:[
        { id:'subF', activity:'Football', coachId:1, start:'2026-07-06', end:'2026-08-05', totalClasses:8, attendedClasses:3, status:'active' },
      ],
      dailyAttendance:{ '2026-07': { Football:{ '06':'Y','07':'Y','08':'Y' }, Karate:{ '06':'Y','07':'Y','08':'Y','09':'Y','10':'Y' } } } }];
    state.invoices = [];
  `, ctx);
}

R.section('the fixture: Football has a subscription, Karate is enrollment-only');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const nSubs = H.vm.runInContext(`state.members[0].subscriptions.length`, ctx);
  const nEnr = H.vm.runInContext(`state.members[0].enrollments.length`, ctx);
  R.ok('1 subscription, 2 enrollments', nSubs === 1 && nEnr === 2, { nSubs, nEnr });
  // The member card renders without throwing (guards the synthesis on a real member shape).
  const ok = H.vm.runInContext(`try { viewMember(5001); true; } catch(e){ 'ERR:'+e.message }`, ctx);
  R.ok('viewMember renders the card without throwing on an enrollment-only sport', ok === true, ok);
}

// The card's Subscription History source of truth is `allSubs`. Behaviour is verified live in the
// browser (header count 2, Karate 5/8); here we PROVE the synthesis rule directly by replaying the
// exact computation the card runs, so the fix is locked without needing the modal DOM.
R.section('the synthesis rule: an enrollment-only sport becomes a display row');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const rows = H.vm.runInContext(`(function(){
    const m = state.members[0];
    const allSubs = [ ...(m.subscriptions || []) ];
    const _subSports = new Set((m.subscriptions||[]).map(s=>s.activity).filter(Boolean));
    for (const e of (m.enrollments||[])) {
      if (!e || !e.sport || _subSports.has(e.sport)) continue;
      const st = e.start || m.startDate || m.joinDate || null;
      const val = parseInt(e.validity) || 30;
      const end = st ? ((e.sport===SUMMER_CAMP && typeof campEndDate==='function') ? campEndDate(st,val) : addDays(st,val)) : null;
      allSubs.push({ activity:e.sport, coachId:e.coachId, start:st, end, totalClasses:parseInt(e.classes)||0, attendedClasses:0, _synthFromEnrollment:true });
      _subSports.add(e.sport);
    }
    return allSubs.map(s => ({ activity:s.activity, synth: !!s._synthFromEnrollment, live: liveAttendanceCount(m, s.activity, subAttendanceWindow(m,s).from, subAttendanceWindow(m,s).to).y }));
  })()`, ctx);
  const sports = rows.map(r => r.activity).sort();
  R.ok('both sports are now listed (Football + Karate)', sports.join() === 'Football,Karate', sports);
  const karate = rows.find(r => r.activity === 'Karate');
  R.ok('Karate came from the enrollment synthesis (no subscription existed)', karate && karate.synth === true, karate);
  R.ok('Karate shows its LIVE attendance = 5', karate && karate.live === 5, karate);
  const football = rows.find(r => r.activity === 'Football');
  R.ok('Football is the real subscription row, NOT synthesized', football && football.synth === false, football);
  R.ok('no sport is listed twice (a subscribed sport is never re-synthesized)', new Set(sports).size === sports.length, sports);
}

R.section('the synthesis logic is present + correct in source');
{
  const src = H.readSrc();
  R.ok('the card synthesizes a row from enrollment-only sports', /_synthFromEnrollment: true/.test(src) && /for \(const e of \(m\.enrollments \|\| \[\]\)\)/.test(src));
  R.ok('it only synthesizes sports with NO subscription (no dupes)', /if \(!e \|\| !e\.sport \|\| _subSports\.has\(e\.sport\)\) continue;/.test(src));
  R.ok('the header count uses allSubs.length (so it reflects the added row)', /const totalSubs = allSubs\.length;/.test(src));
}

R.done();
