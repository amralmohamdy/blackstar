// v6.592 — a Summer-Camp member (camp-only) gets a WELCOME-BACK message inviting them to the club's
// year-round activities, instead of the generic "renew your Summer Camp" expiry reminder. A member who
// ALSO does a year-round sport keeps the normal reminder (they're already engaged).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.592 · Summer Camp win-back message');
const src = H.readSrc('app.js');

R.section('source wiring');
R.ok('campWinbackMessage is defined + exposed', /function campWinbackMessage\(m\)/.test(src) && /window\.campWinbackMessage = campWinbackMessage/.test(src));
R.ok('the activity list normalises objects → names, enabled-only, minus camp + Mixed', /\.filter\(s => s && s\.name && s\.enabled !== false && s\.name !== SUMMER_CAMP && \(typeof MIXED === 'undefined' \|\| s\.name !== MIXED\)\)[\s\S]{0,80}\.map\(s => s\.name\)/.test(src));
R.ok('a camp-ONLY reminder routes to the win-back message', /_campOnly = _sports\.length > 0 && _sports\.every\(s => \(String\(s \|\| ''\)\.split\(' · '\)\[0\]\) === SUMMER_CAMP\)/.test(src) && /if \(_campOnly && typeof campWinbackMessage === 'function'\) return campWinbackMessage\(m\)/.test(src));

R.section('runtime — camp-only member (Hossam)');
{
  const ctx = H.makeCtx({ today: '2026-09-21' });
  const run = s => vm.runInContext(s, ctx);
  // v6.594 — settings.sports holds OBJECTS ({name, enabled, order}); the message must print their NAMES.
  run(`
    state.settings = { sports: [
      {name:'Kick Boxing',enabled:true,order:2},{name:'Football',enabled:true,order:6},{name:'Boxing',enabled:true,order:1},
      {name:'Taekwondo',enabled:true,order:4},{name:'Karate',enabled:true,order:3},{name:'Art Workshop',enabled:true,order:9},
      {name:'Gymnastic',enabled:true,order:5},{name:'Swimming',enabled:true,order:7},{name:'Zumba',enabled:false,order:8},
      {name:'Summer Camp',enabled:true,order:10},{name:'Mixed',enabled:true,order:11}
    ] };
    state.members = [{ id:1, name:'Hossam Awadalla', nameArabic:'حسام رائد', sport:'Summer Camp', expiryDate:'2026-08-13', status:'Expired',
      enrollments:[{sport:'Summer Camp'}],
      subscriptions:[{activity:'Summer Camp', start:'2026-07-15', end:'2026-08-13', status:'expired', totalClasses:5, attendedClasses:5}] }];
  `);
  const expiredMsg = run(`buildReminderMessage(state.members[0], 'expired', -39)`);
  R.ok('camp member gets the WELCOME-BACK message (not the generic expiry one)', /Welcome back/.test(expiredMsg) && /أهلاً بك مجدداً/.test(expiredMsg));
  R.ok('it does NOT use the generic "expired X days ago" wording', !/expired 39 days ago/.test(expiredMsg));
  R.ok('activities print their NAMES, never [object Object]', !/\[object Object\]/.test(expiredMsg));
  R.ok('it lists the year-round activities (Kick Boxing, Football, Karate, Swimming…)', /Kick Boxing/.test(expiredMsg) && /Football/.test(expiredMsg) && /Karate/.test(expiredMsg) && /Swimming/.test(expiredMsg));
  R.ok('a disabled sport (Zumba) is excluded', !/Zumba/.test(expiredMsg));
  R.ok('the list does NOT include Summer Camp or Mixed', !/· Summer Camp/.test(expiredMsg.split('all year round')[1] || expiredMsg) && !/· Mixed/.test(expiredMsg));
  R.ok('the 20% camp-student discount on Taekwondo & Karate is promoted', /20%/.test(expiredMsg) && /Taekwondo/.test(expiredMsg) && /Karate/.test(expiredMsg) && /التايكوندو/.test(expiredMsg) && /الكاراتيه/.test(expiredMsg));
  // Same welcome-back regardless of kind (completed camp too).
  const completedMsg = run(`buildReminderMessage(state.members[0], 'completed', 0)`);
  R.ok('a completed camp also gets the welcome-back', /Welcome back/.test(completedMsg));
}

R.section('runtime — camp + a year-round sport → normal reminder (not win-back)');
{
  const ctx = H.makeCtx({ today: '2026-09-21' });
  const run = s => vm.runInContext(s, ctx);
  run(`
    state.settings = { sports: ['Karate','Summer Camp'] };
    state.coaches = [{ id:2, name:'Zakaria', role:'coach', active:'Y' }];
    state.members = [{ id:2, name:'Mixed Member', nameArabic:'عضو', expiryDate:'2026-09-30', status:'Active',
      enrollments:[{sport:'Summer Camp'},{sport:'Karate', coachId:2}],
      subscriptions:[
        {activity:'Summer Camp', start:'2026-07-15', end:'2026-08-13', status:'expired', totalClasses:5, attendedClasses:5},
        {activity:'Karate', coachId:2, start:'2026-08-16', end:'2026-09-30', status:'active', totalClasses:8, attendedClasses:3}
      ] }];
  `);
  const msg = run(`buildReminderMessage(state.members[0], 'expiring', 5)`);
  R.ok('a member with a year-round sport does NOT get the camp win-back', !/Welcome back/.test(msg) && !/أهلاً بك مجدداً/.test(msg));
  R.ok('they get the normal reminder (names Karate)', /Karate/.test(msg));
}

R.done();
