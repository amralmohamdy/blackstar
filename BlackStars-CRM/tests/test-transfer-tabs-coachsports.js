// v6.463 — Transfer Membership screen UX: (1) two clear tabs (New Transfer | History) with the
// history card hidden unless its tab is active; (2) when a COACH is selected in the step-1 filter
// the SPORT dropdown lists only that coach's sports (and an invalid sport pick falls back to "all");
// (3) larger, clearer fonts. This locks the tab wiring, the coach→sports narrowing, and the render.
const H = require('./qc-harness.js');
const R = H.reporter('TRANSFER · two tabs + coach→sports filter');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source: tabs + coach→sports wiring');
{
  const src = H.readSrc();
  R.ok('a tab state is initialised', /st\.tab == null\) st\.tab = 'transfer'/.test(src));
  R.ok('two tab buttons are rendered (data-trtab)', /data-trtab="\$\{k\}"/.test(src) && /\['transfer',[\s\S]{0,80}\['history',/.test(src));
  R.ok('the transfer card toggles on the active tab', /st\.tab === 'transfer' \? 'block' : 'none'/.test(src));
  R.ok('the history card toggles on the active tab', /st\.tab === 'history' \? 'block' : 'none'/.test(src));
  R.ok('tab clicks are wired', /data-trtab.*addEventListener\('click'/.test(src) || /querySelectorAll\('\[data-trtab\]'\)/.test(src));
  R.ok('sport options are derived from the picked coach', /sportsForCoach = \(cid\)/.test(src) && /sportsForCoach\(st\.fcoach\)/.test(src));
  R.ok('an invalid sport pick falls back to all', /!sportsInList\.includes\(st\.fsport\)\) st\.fsport = 'all'/.test(src));
  R.ok('switching coach resets the sport pick', /st\.fcoach = e\.target\.value; st\.fsport = 'all'/.test(src));
  R.ok('the sport "all" label reflects the coach ("All his sports")', /All his sports/.test(src));
}

R.section('rendered markup: the tabs appear and only the active tab shows');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  run(ctx, `window._trState = null;`);
  let r = H.renderScreen(ctx, 'transfers');
  R.ok('renders (admin, transfer tab)', r.ok, r.error);
  R.ok('the New Transfer + History tab buttons are present', /data-trtab="transfer"/.test(r.html) && /data-trtab="history"/.test(r.html), r.html.slice(0, 200));
  R.ok('on the transfer tab the transfer card is visible', /class="card" style="display:block"/.test(r.html));
  R.ok('on the transfer tab the history card is hidden', /class="card" style="display:none"/.test(r.html));

  run(ctx, `window._trState = { fromId: null, sport: null, toId: null, fromQ: '', toQ: '', fcoach: 'all', fsport: 'all', tab: 'history' };`);
  r = H.renderScreen(ctx, 'transfers');
  R.ok('renders (history tab)', r.ok, r.error);
  R.ok('on the history tab the history card is visible', /class="card" style="display:block"/.test(r.html));
}

R.section('coach→sports narrowing: the sport dropdown lists only the picked coach’s sports');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  // Discover a coach who has transferable sports, then assert the rendered sport <select> for that
  // coach is a SUBSET of the all-coaches sport list (and non-empty).
  const probe = run(ctx, `
    (function(){
      const members = (state.members||[]).filter(m=>!m.deleted);
      const eligible = members.filter(m=>memberStatus(m)!=='Withdrawn').map(m=>({m,enrs:transferableEnrollments(m)})).filter(x=>x.enrs.length);
      const allSports = [...new Set(eligible.flatMap(x=>x.enrs.map(e=>e.sport)).filter(Boolean))].sort();
      const coachIds = [...new Set(eligible.flatMap(x=>x.enrs.map(e=>e.coachId)).filter(v=>v!=null))];
      // pick a coach that does NOT teach every sport, if one exists
      let pick=null;
      for (const cid of coachIds){ const s=[...new Set(eligible.flatMap(x=>x.enrs.filter(e=>String(e.coachId)===String(cid)).map(e=>e.sport)).filter(Boolean))]; if (s.length && s.length < allSports.length){ pick={cid,s}; break; } if(!pick&&s.length) pick={cid,s}; }
      return { allSports, pick };
    })()
  `);
  R.ok('the seed has transferable sports', probe.allSports.length > 0, JSON.stringify(probe.allSports));
  if (probe.pick) {
    run(ctx, `window._trState = { fromId: null, sport: null, toId: null, fromQ: '', toQ: '', fcoach: ${JSON.stringify(probe.pick.cid)}, fsport: 'all', tab: 'transfer' };`);
    const r = H.renderScreen(ctx, 'transfers');
    // Extract the <select id="tr-fsport"> options.
    const m = r.html.match(/<select id="tr-fsport"[\s\S]*?<\/select>/);
    const opts = m ? [...m[0].matchAll(/<option value="([^"]+)"/g)].map(x => x[1]).filter(v => v !== 'all') : [];
    R.ok('the coach’s sport list is non-empty', opts.length > 0, JSON.stringify(opts));
    R.ok('every listed sport is one the coach teaches', opts.every(s => probe.pick.s.includes(s)), JSON.stringify({ listed: opts, coach: probe.pick.s }));
    R.ok('it never lists MORE than the all-coaches set', opts.length <= probe.allSports.length);
  }
}

R.done();
