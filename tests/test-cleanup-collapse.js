// v6.614 — Cleanup Center section cards collapse/expand. A generic post-render enhancer wires each
// .card header to toggle its body (skipping clicks on the header's own buttons), with a ▾/▸ chevron.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.614 · cleanup collapse');

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('the enhancer is defined', /function _wireCardCollapse\(root\)/.test(src));
  R.ok('PAGES.cleanup calls it after render', /_wireCardCollapse\(main\);/.test(src));
  R.ok('a click on a header button does NOT toggle', /closest\('button, a, input, select'\)\) return;/.test(src));
  R.ok('it toggles the body display + rotates a chevron', /b\.style\.display = hidden \? '' : 'none'/.test(src) && /rotate\(-90deg\)/.test(src));
}

R.section('cleanup screen still renders (enhancer is a no-op without a real DOM)');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const r = H.renderScreen(ctx, 'cleanup');
  R.ok('PAGES.cleanup renders without error', r.ok, r.error);
}

R.section('functional: header click toggles the body, buttons are ignored');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = vm.runInContext(`
    (function(){
      // mock a single .card { header, body }
      const head = { style:{}, _collapseWired:false, appendChild(){}, addEventListener(ev,fn){ if(ev==='click') this._fn = fn; } };
      const body = { style:{ display:'' } };
      const card = { children:[head, body], querySelector:(s)=> s==='.card-header' ? head : null };
      const root = { querySelectorAll:(s)=> s==='.card' ? [card] : [] };
      _wireCardCollapse(root);
      const wired = typeof head._fn === 'function';
      head._fn({ target:{ closest:()=>null } });   // header click → collapse
      const afterCollapse = body.style.display;
      head._fn({ target:{ closest:()=>null } });   // header click → expand
      const afterExpand = body.style.display;
      head._fn({ target:{ closest:()=> ({}) } });  // a BUTTON click → ignored (no toggle)
      const afterButton = body.style.display;
      return { wired, afterCollapse, afterExpand, afterButton };
    })()
  `, ctx);
  R.ok('header gets a click handler', res.wired === true, JSON.stringify(res));
  R.ok('first click collapses the body (display:none)', res.afterCollapse === 'none', JSON.stringify(res));
  R.ok('second click expands it', res.afterExpand === '', JSON.stringify(res));
  R.ok('a button click inside the header is ignored (stays expanded)', res.afterButton === '', JSON.stringify(res));
}

R.done();
