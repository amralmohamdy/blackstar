// v6.457 — the Charts dashboard (PAGES.charts): inline-SVG graphs for revenue, cost, net profit,
// revenue-by-category donut, revenue-by-sport, coach performance, payroll and new members. Admin-only,
// reuses the same billed-basis aggregates as Reports. This locks the screen + its access + wiring.
const H = require('./qc-harness.js');
const R = H.reporter('CHARTS · dashboard renders + is admin-only');
const run = (c, s) => H.vm.runInContext(s, c);

function seedMonths(ctx) {
  run(ctx, `
    state.settings = state.settings || {}; state.settings.commissionBasis = 'payment';
    state.coaches = [{id:1,name:'Aya',rate:40,active:true},{id:2,name:'Jen',rate:35,active:true}];
    state.members = []; state.invoices = []; state.expenses = []; state.salaries = [];
    var months = ['2026-05','2026-06','2026-07','2026-08']; var id = 1;
    months.forEach(function(mk,i){
      state.invoices.push({id:id++,ref:'I'+id,customerId:100+i,category:'Membership',date:mk+'-05',month:mk,amount:9000+i*2000,lineItems:[{sport:i%2?'Boxing':'Summer Camp',coachId:(i%2)+1,classes:8,price:9000+i*2000,billMonth:mk}]});
      state.invoices.push({id:id++,ref:'I'+id,customerId:200+i,category:'Court Rental',date:mk+'-10',month:mk,amount:500,lineItems:[{sport:'Court Rental',price:500}]});
      state.expenses.push({id:id++,month:mk,date:mk+'-03',category:'Utilities',amount:1500+i*100});
      state.members.push({id:400+i,name:'M'+i,firstRegistration:mk+'-05',sport:'Boxing',coachId:1,status:'Active',expiryDate:'2026-12-01',enrollments:[{sport:'Boxing',coachId:1,classes:8,price:400}]});
    });
  `);
}

R.section('the Charts screen renders SVG graphs from real aggregates');
{
  const ctx = H.makeCtx({ role: 'admin', today: '2026-08-15' }); seedMonths(ctx);
  const out = H.renderScreen(ctx, 'charts');
  R.ok('charts screen renders without error', out.ok, out.error);
  const html = out.html || '';
  R.ok('produces multiple inline SVG charts', (html.match(/<svg/g) || []).length >= 4, 'svgs=' + (html.match(/<svg/g) || []).length);
  R.ok('draws bar rects (revenue vs cost / payroll)', /<rect /.test(html));
  R.ok('draws line paths (net profit / new members)', /<path /.test(html));
  R.ok('draws donut segments (revenue by category)', /<circle /.test(html));
  R.ok('has the headline cards', /Revenue vs Cost/.test(html) && /Net Profit trend/.test(html) && /Coach Performance/.test(html));
  R.ok('shows KPI totals', /kpi-value/.test(html));
}

R.section('admin-only — reception / coach are locked out');
{
  R.ok('roleCanAccess(admin, charts) = true', run(H.makeCtx({ role: 'admin' }), `roleCanAccess('admin','charts')`) === true);
  R.ok('reception CANNOT reach charts (club-earnings sensitivity, like reports)', run(H.makeCtx({ role: 'receptionist' }), `roleCanAccess('receptionist','charts')`) === false);
  R.ok('coach CANNOT reach charts', run(H.makeCtx({ role: 'coach' }), `roleCanAccess('coach','charts')`) === false);
  // The page itself hard-guards too.
  const ctxR = H.makeCtx({ role: 'receptionist' });
  const outR = H.renderScreen(ctxR, 'charts');
  R.ok('the page body shows "Admins only" for non-admins', /Admins only|للمسؤولين/.test(outR.html || ''), outR.error);
}

R.section('source: route registered + chart helpers exist');
{
  const src = H.readSrc();
  R.ok('a charts route is registered in the Main section', /charts:\s*\{\s*label:\s*'Charts',\s*icon:\s*'📊',\s*section:\s*'Main'/.test(src));
  R.ok('the Charts page reuses the billed-basis aggregates', /billedInPeriod\(m => m === mk\)/.test(src) && /salariesEarnedInPeriod\(m => m === mk\)/.test(src));
  R.ok('inline SVG chart helpers are defined (no external chart lib)', /function _chBars\(/.test(src) && /function _chLine\(/.test(src) && /function _chDonut\(/.test(src));
  R.ok('the net-profit line handles negative (loss) months', /niceMn = mn < 0 \? -_chNiceMax\(-mn\) : 0/.test(src));
}

R.done();
