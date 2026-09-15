// v6.510 — Welcome Messages screen. Surfaces recent NEW JOINERS and RENEWALS and lets the
// admin/receptionist WhatsApp each a warm welcome pre-filled with their membership details
// (sport, coach, start, valid-until, sessions). welcomedAt stamps prevent double-greeting for
// the same joining/renewal; a later renewal (newer start) makes the member pending again.
const H = require('./qc-harness.js');
const R = H.reporter('v6.510 · welcome messages');
const src = H.readSrc();

R.section('nav + wiring (source)');
R.ok('a Welcome Messages nav route is registered', /welcome:\s*\{ label: 'Welcome Messages'/.test(src));
R.ok('the nav badge counts pending welcomes', /pendingWelcomeCount/.test(src) && /badge: \(\) => \(typeof pendingWelcomeCount/.test(src));
R.ok('reception is allowed to see it', /'reminders', 'welcome'/.test(src));
R.ok('PAGES.welcome exists', /PAGES\.welcome = \(main\) => \{/.test(src));
R.ok('the message builder + wa link exist', /function buildWelcomeMsg\(m, kind\)/.test(src) && /function welcomeWaLink\(m, kind\)/.test(src));
R.ok('sending stamps welcomedAt', /window\.markWelcomed = function/.test(src) && /m\.welcomedAt = TODAY/.test(src));

R.section('classification + message (runtime)');
{
  const ctx = H.makeCtx({ today: '2026-08-20', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.user={role:'admin'};state.session={role:'admin'};`);
  run(`state.coaches=[{id:3,name:'Mostafa',active:'Y'},{id:1,name:'Abdel Salam',active:'Y'}];`);
  run(`state.members=[
    { id:1, name:'Newbie', nameArabic:'الجديد', phone:'50111111', joinDate:'2026-08-15', expiryDate:'2026-12-01',
      subscriptions:[{activity:'Karate',coachId:3,totalClasses:8,status:'active',start:'2026-08-15',end:'2026-12-01'}] },
    { id:2, name:'Renewer', phone:'50222222', joinDate:'2026-01-01', expiryDate:'2027-01-01',
      subscriptions:[
        {activity:'Karate',coachId:3,totalClasses:8,status:'completed',start:'2026-01-01',end:'2026-07-01'},
        {activity:'Karate',coachId:1,totalClasses:8,status:'active',start:'2026-08-10',end:'2027-01-01'}
      ] },
    { id:3, name:'OldTimer', phone:'50333333', joinDate:'2026-01-01', expiryDate:'2026-07-01',
      subscriptions:[{activity:'Karate',coachId:3,totalClasses:8,status:'completed',start:'2026-01-01',end:'2026-07-01'}] },
    { id:4, name:'GoneRecent', phone:'50444444', joinDate:'2026-08-15', status:'Withdrawn',
      subscriptions:[{activity:'Karate',coachId:3,totalClasses:8,status:'withdrawn',start:'2026-08-15',end:'2026-12-01'}] }
  ];`);
  const cutoff = run(`addDays(TODAY, -30)`);
  R.ok('cutoff is 30 days before today', cutoff === '2026-07-21', cutoff);
  R.ok('a first membership in-window classifies as "new"', run(`welcomeKind(state.members[0], addDays(TODAY,-30))`) === 'new');
  R.ok('an existing member with a recent new period is "renewal"', run(`welcomeKind(state.members[1], addDays(TODAY,-30))`) === 'renewal');
  R.ok('nothing recent classifies as null', run(`welcomeKind(state.members[2], addDays(TODAY,-30))`) === null);
  R.ok('a withdrawn member is excluded (null)', run(`welcomeKind(state.members[3], addDays(TODAY,-30))`) === null);

  const msgNew = run(`buildWelcomeMsg(state.members[0], 'new')`);
  R.ok('the welcome message greets the member by name', msgNew.includes('Newbie') && msgNew.includes('الجديد'));
  R.ok('it names the sport and coach', msgNew.includes('Karate') && msgNew.includes('Mostafa'));
  R.ok('it states start and valid-until dates', /Starts:/.test(msgNew) && /Valid until:/.test(msgNew) && /Sessions: 8/.test(msgNew));
  R.ok('it is bilingual (Arabic welcome + English welcome)', msgNew.includes('أهلاً وسهلاً') && msgNew.includes('Welcome Newbie'));

  const msgRen = run(`buildWelcomeMsg(state.members[1], 'renewal')`);
  R.ok('a renewal message thanks for renewing + uses the current coach', /renewing/i.test(msgRen) && msgRen.includes('تجديد') && msgRen.includes('Abdel Salam'));

  // welcomedAt gating
  R.ok('an un-welcomed recent member is NOT done', run(`welcomeDone(state.members[0])`) === false);
  run(`state.members[0].welcomedAt='2026-08-16';`);
  R.ok('welcoming on/after the ref date marks it done', run(`welcomeDone(state.members[0])`) === true);
  run(`state.members[0].welcomedAt='2026-05-01';`);   // stale (before latest start) → pending again
  R.ok('a stale welcome (before the latest start) is still pending', run(`welcomeDone(state.members[0])`) === false);
  run(`delete state.members[0].welcomedAt;`);

  R.ok('pendingWelcomeCount = the 2 un-welcomed recent members', run(`pendingWelcomeCount()`) === 2, String(run(`pendingWelcomeCount()`)));
}

R.section('render (runtime)');
{
  const ctx = H.makeCtx({ today: '2026-08-20', role: 'admin' });
  const run = s => H.vm.runInContext(s, ctx);
  run(`state.user={role:'admin'};state.session={role:'admin'};`);
  run(`state.coaches=[{id:3,name:'Mostafa',active:'Y'}];`);
  run(`state.members=[
    { id:1, name:'Newbie', phone:'50111111', joinDate:'2026-08-15', expiryDate:'2026-12-01',
      subscriptions:[{activity:'Karate',coachId:3,totalClasses:8,status:'active',start:'2026-08-15',end:'2026-12-01'}] }
  ];`);
  run(`globalThis.__sink={};
    function el(id){return {_id:id,set innerHTML(v){globalThis.__sink[id]=String(v);},get innerHTML(){return globalThis.__sink[id]||'';},textContent:'',value:'',checked:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},appendChild(){},setAttribute(){},focus(){},querySelector(){return el('q');},querySelectorAll(){return [];},closest(){return null;},getAttribute(){return null;}};}
    document.getElementById=(id)=>el(id);document.querySelector=(s)=>el(s);document.querySelectorAll=()=>[];window.$=document.querySelector;`);
  const out = run(`(function(){
    var h=''; var main={set innerHTML(v){h=String(v);},get innerHTML(){return h;},querySelector(){return document.querySelector('x');},querySelectorAll(){return [];},addEventListener(){}};
    try{ PAGES.welcome(main); return {ok:true, html:h}; }catch(e){ return {ok:false, err:e.message}; }
  })()`);
  R.ok('the page renders without error', out.ok, JSON.stringify(out).slice(0, 200));
  R.ok('it lists the new joiner with a Send welcome action', out.ok && out.html.includes('Newbie') && out.html.includes('Send welcome'));
  R.ok('each row offers a Preview', out.ok && out.html.includes('previewWelcome(1'));
  R.ok('the New joiners KPI counts 1', out.ok && /New joiners[\s\S]{0,120}>1<\/div>/.test(out.html));
}

R.done();
