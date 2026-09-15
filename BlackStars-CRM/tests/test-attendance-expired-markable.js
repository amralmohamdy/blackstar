// v6.542 — attendance must be markable for ANY member, including EXPIRED (and unpaid). In a two-coach
// (switched) sport the day-grid extends the CURRENT coach's window to today only for "active" members;
// an EXPIRED switched member (Jabr: Iyad → Abdel Salam, membership expired Aug 28) had today's cell muted
// → the desk couldn't log the class. Fix: extend for any non-FROZEN member (expired included); only a
// deliberately-Frozen membership stays paused. Earlier coaches stay bounded to their handover (correct pay).
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.542 · attendance markable when expired');
const src = H.readSrc();

R.section('source');
R.ok('the window extension now allows expired (only Frozen is paused)', /const _memberActive = !m\.deleted && memberStatus\(m\) !== 'Frozen';/.test(src));
R.ok('it still extends only the CURRENT coach up to today (guarded)', /_memberActive && _to && _to < TODAY && _latestKey !== '9999-99-99' && \(w\.to \|\| ''\) === _latestKey\) _to = TODAY/.test(src));

R.section('runtime — the two-coach window extension by member status');
{
  const ctx = H.makeCtx({ today: '2026-08-30', role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  // helper that mirrors the grid's per-coach window resolution for a sport
  const resolve = statusOverride => run(`(function(){
    var m={id:1,deleted:false,expiryDate:'2026-08-28',status:${JSON.stringify(statusOverride)},currentFreezeUntil:${JSON.stringify(statusOverride === 'Frozen' ? '2026-09-15' : null)},subscriptions:[
      {activity:'KB',coachId:14,start:'2026-07-06',end:'2026-07-29',totalClasses:8,status:'completed'},
      {activity:'KB',coachId:1,start:'2026-08-01',end:'2026-08-12',totalClasses:8,status:'active'}
    ]};
    var TODAY='2026-08-30', sp='KB';
    var spSubs=m.subscriptions.filter(s=>s.activity===sp && s.coachId!=null);
    var coachIds=[...new Set(spSubs.map(s=>String(s.coachId)))];
    var _cw={};
    for(const cid of coachIds){var from=null,to=null,oe=false,os=false;
      spSubs.filter(s=>String(s.coachId)===cid).forEach(s=>{var w={from:s.start||null,to:s.end||null};
        if(w.from==null)os=true;else if(!from||w.from<from)from=w.from; if(w.to==null)oe=true;else if(!to||w.to>to)to=w.to;});
      _cw[cid]={from,to,openStart:os,openEnd:oe};}
    var _memberActive=!m.deleted && (typeof memberStatus==='function'?memberStatus(m):m.status)!=='Frozen';
    var _latestKey=''; for(const cid of coachIds){var w=_cw[cid];var k=w.openEnd?'9999-99-99':(w.to||'');if(k>_latestKey)_latestKey=k;}
    var out={};
    for(const cid of coachIds){var w=_cw[cid];var _to=w.openEnd?null:w.to;
      if(!w.openEnd && _memberActive && _to && _to<TODAY && _latestKey!=='9999-99-99' && (w.to||'')===_latestKey) _to=_to='2026-08-30';
      out[cid]={to:_to};}
    return out;
  })()`);
  const canMark = (w, cid) => { const to = w[cid].to; return !to || '2026-08-30' <= to; };

  const exp = resolve('Expired');
  R.ok('EXPIRED member: current coach (Abdel Salam=1) markable today', canMark(exp, '1'));
  R.ok('EXPIRED member: earlier coach (Iyad=14) stays bounded (not today)', !canMark(exp, '14'));

  const frozen = resolve('Frozen');
  R.ok('FROZEN member: current coach NOT extended (stays paused)', !canMark(frozen, '1'));

  const active = resolve('Active');
  R.ok('ACTIVE member: current coach markable today (unchanged)', canMark(active, '1'));
}

R.done();
