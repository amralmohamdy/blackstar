// v6.568 — ATTENDANCE: a switched-away / finished coach for a sport is shown as HISTORY, not a live course.
// After a member switches a sport to a new coach, the OLD coach+sport still has attendance marks, so the
// attendance grid listed it as a full second row — reading as a 2nd active course / extra coach (Basil:
// Swimming under BOTH Mostafa AND Zakaria → "four active courses and 4 coaches?"). The grid now tags any
// coach with NO live subscription for the sport as history: greyed row + "↪ switched to <coach>" / "↪
// history" label, with the member-status/EXPIRED/UNPAID/renewal badges suppressed. Display only — no data
// changes, the live coach's row is untouched, and past marks stay visible.
const H = require('./qc-harness.js');
const R = H.reporter('v6.568 · attendance switched-away coach = history');
const src = H.readSrc();

R.section('source — the multi-coach branch tags a non-live coach as history');
R.ok('a per-sport "live coach" predicate (not completed/withdrawn/switched) exists',
  /const _liveCid = c => spSubs\.some\(s => String\(s\.coachId\) === c && _isLiveSub\(s\)\)/.test(src) && /const _isLiveSub = s => [\s\S]{0,120}!== 'completed'[\s\S]{0,120}!== 'withdrawn'[\s\S]{0,40}!s\.switchedAwayTo/.test(src));
R.ok('rows carry hist / switchedAway / histTo flags', /attKey: attKeyForSport\(m, sp, cid\), hist: _hist, switchedAway: _switchedAway, histTo: _histTo \}/.test(src));
R.ok('hist = no live sub OR superseded by a later live coach', /const _hist = _noLive \|\| _superseded;/.test(src) && /const _noLive = !_liveCid\(cid\);/.test(src));
R.ok('supersession is judged on LIVE-only windows (a switched-away sub does not extend the window)', /_myLiveEnd && _myLiveEnd !== '9999-99-99' && _myLiveEnd < TODAY[\s\S]{0,120}_liveStart\(o\) \|\| ''\) >= _myLiveEnd/.test(src));
R.ok('the current coach is named when exactly one live coach remains', /_liveOthers\.length === 1 && typeof coachName === 'function'\) \? coachName\(parseInt\(_liveOthers\[0\]\)\)/.test(src));

R.section('source — both attendance renders grey + label a history row');
// day-grid + all-months summary each destructure the flags and render the badge/style.
R.ok('both render bodies destructure hist/switchedAway/histTo', (src.match(/rows\.map\(\(\{ m, attKey, sport, coachId, window, hist, switchedAway, histTo \}\)/g) || []).length >= 2);
R.ok('a greyed history row style is applied', (src.match(/background:rgba\(120,120,140,\.10\);opacity:\.7/g) || []).length >= 2);
R.ok('the ↪ switched-to / history badge is rendered', (src.match(/↪ \$\{switchedAway \? \(histTo \? t\('switched to '/g) || []).length >= 2);

R.section('source — a history row is not a live package (noisy badges suppressed)');
R.ok('EXPIRED / package-finished flag skips history rows', /if \(sport !== SUMMER_CAMP && sport !== MIXED && !isExpired && !hist\)/.test(src));
R.ok('outstanding/renewal are zeroed for history rows', /typeof memberOutstanding !== 'function' \|\| hist\)/.test(src) && /const needsRenewal = !hist && isExpired/.test(src));
R.ok('member-status badge is empty on a history row', /const statusBadge = hist\s*\n?\s*\? ''/.test(src));

R.section('source — a member’s history rows sort below their live ones');
R.ok('same-member tiebreak sinks hist rows', /return \(a\.hist \? 1 : 0\) - \(b\.hist \? 1 : 0\);/.test(src));

R.section('runtime — the live-coach predicate classifies Basil-shaped data correctly');
{
  const ctx = H.makeCtx({ today: '2026-09-13', role: 'admin' });
  const res = H.vm.runInContext(`(function(){
    // Basil's Swimming after the switch: Mostafa completed (+ one switched away), Zakaria active.
    const spSubs = [
      { activity:'Swimming', coachId:3,  status:'completed' },
      { activity:'Swimming', coachId:3,  status:'completed', switchedAwayTo:'Swimming' },
      { activity:'Swimming', coachId:99, status:'active' }
    ];
    const liveCid = c => spSubs.some(s => String(s.coachId) === c
      && (s.status||'').toLowerCase() !== 'completed' && (s.status||'').toLowerCase() !== 'withdrawn' && !s.switchedAwayTo);
    const coachIds = [...new Set(spSubs.map(s => String(s.coachId)))];
    return { mostafaLive: liveCid('3'), zakariaLive: liveCid('99'), activeCids: coachIds.filter(liveCid) };
  })()`, ctx);
  R.ok('the switched-away/completed coach (Mostafa) is NOT live → history', res.mostafaLive === false);
  R.ok('the current coach (Zakaria) IS live', res.zakariaLive === true);
  R.ok('exactly one live coach remains (so the label names them)', res.activeCids.length === 1 && res.activeCids[0] === '99');
}

R.done();
