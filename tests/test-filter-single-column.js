// v6.588 — the Members sport/coach filter (and the Schedule coach filter) are hand-rolled menus whose
// checkbox rows are <label style="display:flex">. Their type-to-search re-showed a matching row with
// `lab.style.display = ''`, which reverts a <label> to its INLINE default — so short options flowed
// horizontally and paired up (Boxing+Football, Mixed+MMA). Re-showing must set 'flex' to keep the
// single-column layout. (multiFilterHTML .mf-list and the expenses .expm-list wrap rows in a
// flex-column parent, so they were never affected.)
const H = require('./qc-harness.js');
const R = H.reporter('v6.588 · filter rows stay single-column after search');
const src = H.readSrc();

R.section('hand-rolled menus re-show rows as flex (not inline)');
R.ok('wireMultiFilter (Members sport + coach) re-shows rows as flex', /const lab = cb\.parentElement;[^\n]*hit \? 'flex' : 'none'/.test(src));
R.ok('the Schedule coach filter re-shows rows as flex', /sch-coach-cb'\)\.forEach\(cb => \{[\s\S]{0,140}lab\.style\.display = hit \? 'flex' : 'none'/.test(src));
R.ok('no hand-rolled label search resets display to the inline default ("")', !/const lab = cb\.parentElement; if \(!lab\) return; const hit = [^\n]*lab\.style\.display = hit \? '' : 'none'/.test(src));

R.section('flex-column menus are unaffected (kept as-is)');
R.ok('multiFilterHTML uses a flex-column list', /class="mf-list" style="display:flex;flex-direction:column"/.test(src));
R.ok('expenses filter uses a flex-column list', /class="expm-list" style="display:flex;flex-direction:column"/.test(src));

R.done();
