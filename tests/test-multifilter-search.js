// v6.565 — long multi-select filters (coaches, sports) are now type-to-search: a search box appears at
// the top of the popup when the list is long (>= 8 options) and filters the rows by label as you type
// (Arabic-folded). Short filters (status/attendance, a few options) stay plain.
const H = require('./qc-harness.js');
const vm = H.vm;
const R = H.reporter('v6.565 · long filters are searchable');

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('multiFilterHTML adds a search box for long lists (>= 8)', /pairs\.length >= 8 \? `<input type="text" class="mf-search"/.test(src));
  R.ok('bindMultiFilter filters rows on input (Arabic-folded)', /const applySearch = \(\) => \{/.test(src) && /norm\(lab\.textContent\)\.includes\(q\)/.test(src));
  R.ok('search focuses + resets when the popup opens', /if \(open && search\) \{ search\.value = ''; applySearch\(\);/.test(src));
}

R.section('runtime — HTML shows the search box only for long lists');
{
  const ctx = H.makeCtx({ role: 'admin' });
  const run = s => vm.runInContext(s, ctx);
  const many = run(`multiFilterHTML('t1', ${JSON.stringify(Array.from({length:10},(_,i)=>['c'+i,'Coach '+i]))}, [], { allText:'All coaches' })`);
  const few = run(`multiFilterHTML('t2', [['a','A'],['b','B'],['c','C']], [], { allText:'All' })`);
  R.ok('a 10-option filter includes the search input', /class="mf-search"/.test(many), 'many');
  R.ok('a 3-option filter does NOT include a search input', !/class="mf-search"/.test(few), 'few');
}

R.done();
