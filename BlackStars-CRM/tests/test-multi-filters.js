// v6.398 — filters were single-value on most screens, so you could look at ONE sport, ONE coach
// or ONE payment method at a time. A generic multi-select control now backs them: an EMPTY
// selection means "all", and a row matches if it satisfies ANY chosen value.
//
// Two things this test guards that are easy to get wrong when converting a filter:
//   1. a SAVED filter still holding the old single value must carry across, not reset the screen
//   2. "Clear filters" must reset the new ARRAYS — resetting the old scalar keys would leave
//      every multi-select still applied while the button claimed everything was cleared
const vm = require('vm'), fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// run the real helpers
function makeCtx() {
  const c = { console: { log() {}, warn() {}, error() {} }, JSON, Math, Date, String, Number, Array, Object, Set, Map, isNaN, isFinite, parseInt, parseFloat, RegExp };
  c.window = c; c.globalThis = c;
  c.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  c.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  c.location = { hash: '' }; c.navigator = { userAgent: 'n' }; c.addEventListener = () => {};
  vm.createContext(c); try { vm.runInContext(appSrc, c); } catch (_) {}
  // lift the shipped helper source rather than re-implementing it
  const s = pagesSrc.indexOf('function multiFilterHTML');
  const e = pagesSrc.indexOf('function monthMultiHTML');
  vm.runInContext(pagesSrc.slice(s, e), c);
  return c;
}
const C = makeCtx();
const asMulti = v => vm.runInContext('asMulti', C)(v);
const html = (...a) => vm.runInContext('multiFilterHTML', C)(...a);

console.log('a saved SINGLE value survives the upgrade:');
{
  ok('an old scalar becomes a one-item array', JSON.stringify(asMulti('cash')) === '["cash"]', asMulti('cash'));
  ok("the 'all' sentinel becomes empty (= no filter)", asMulti('all').length === 0, asMulti('all'));
  ok('an empty string becomes empty', asMulti('').length === 0);
  ok('undefined becomes empty', asMulti(undefined).length === 0);
  ok('an existing array is kept', JSON.stringify(asMulti(['cash', 'card'])) === '["cash","card"]');
  ok("...with any stale 'all' stripped out", JSON.stringify(asMulti(['all', 'cash'])) === '["cash"]', asMulti(['all', 'cash']));
}

console.log('\nthe control renders the right label:');
{
  ok('nothing chosen → the "all" text', html('f', ['a', 'b'], [], { allText: 'All methods' }).includes('All methods'));
  ok('one chosen → that value', html('f', ['Boxing', 'Swimming'], ['Boxing'], { allText: 'All' }).includes('Boxing'));
  ok('several chosen → a count', html('f', ['a', 'b', 'c'], ['a', 'b'], { allText: 'All', noun: 'methods' }).includes('2 methods'));
  ok('chosen boxes are pre-ticked', (html('f', ['a', 'b'], ['a'], {}).match(/checked/g) || []).length === 1);
  ok('value/label pairs are supported', html('f', [['cash', 'Cash']], ['cash'], {}).includes('>Cash<'));
  ok('blank options are dropped', !html('f', ['a', '', null], [], {}).includes('value=""'));
  ok('labels are escaped', html('f', ['<b>x'], [], {}).includes('&lt;b&gt;x'));
}

console.log('\nthe Invoices predicate — ANY chosen value matches:');
{
  // mirrors the shipped predicate for method / coach / category
  const rows = [
    { id: 1, method: 'cash', coach: 'Aya', category: 'Membership', sport: 'Kick Boxing' },
    { id: 2, method: 'card', coach: 'Iyad', category: 'Product', sport: 'Swimming' },
    { id: 3, method: 'fawran', coach: 'Aya', category: 'Membership', sport: 'Karate' },
  ];
  const keep = (f) => rows.filter(i =>
    (!f.methods.length || f.methods.includes(i.method)) &&
    (!f.coaches.length || f.coaches.includes(i.coach)) &&
    (!f.categories.length || f.categories.includes(i.category || 'Membership'))
  ).map(i => i.id);

  ok('no selection shows everything', JSON.stringify(keep({ methods: [], coaches: [], categories: [] })) === '[1,2,3]');
  ok('one method behaves as before', JSON.stringify(keep({ methods: ['cash'], coaches: [], categories: [] })) === '[1]');
  ok('TWO methods show both — the whole point', JSON.stringify(keep({ methods: ['cash', 'card'], coaches: [], categories: [] })) === '[1,2]');
  ok('two coaches', JSON.stringify(keep({ methods: [], coaches: ['Aya', 'Iyad'], categories: [] })) === '[1,2,3]');
  ok('filters still combine (AND across, OR within)', JSON.stringify(keep({ methods: ['cash', 'fawran'], coaches: ['Aya'], categories: [] })) === '[1,3]');
  ok('a value nothing matches yields nothing', keep({ methods: ['transfer'], coaches: [], categories: [] }).length === 0);
}

console.log('\nmulti-sport matching keeps the combined-activity behaviour:');
{
  const SUMMER = 'Summer Camp';
  const isCamp = s => String(s || '').startsWith(SUMMER);
  const match = (i, sports) => !sports.length || sports.some(sp => {
    if (sp === SUMMER) return isCamp(i.sport) || (i.lineItems || []).some(li => isCamp(li.sport));
    const inAct = String(i.sport || '').split(/\s*,\s*/).indexOf(sp) !== -1;
    const inLines = Array.isArray(i.lineItems) && i.lineItems.some(li => li.sport === sp);
    return inAct || inLines;
  });
  const combined = { sport: 'Swimming, Gymnastic' };
  ok('a combined activity still matches one of its sports', match(combined, ['Swimming']));
  ok('...and matches when either of two is chosen', match(combined, ['Karate', 'Gymnastic']));
  ok('it does not match an unrelated sport', !match(combined, ['Karate']));
  ok('Summer Camp still matches its duration variants', match({ sport: 'Summer Camp · 1 month' }, [SUMMER]));
  ok('a line-item sport matches too', match({ sport: 'Karate', lineItems: [{ sport: 'Boxing' }] }, ['Boxing']));
}

console.log('\nsource wiring on the Invoices screen:');
{
  ok('all four filters render the multi control',
    ['inv-category', 'inv-sport', 'inv-coach', 'inv-method'].every(id => new RegExp(`multiFilterHTML\\('${id}'`).test(pagesSrc)));
  ok('...and all four are bound',
    ['inv-category', 'inv-sport', 'inv-coach', 'inv-method'].every(id => new RegExp(`bindMultiFilter\\('${id}'`).test(pagesSrc)));
  ok('the saved single value is migrated, not dropped', /filter\.methods = asMulti\(filter\.methods !== undefined \? filter\.methods : filter\.method\)/.test(pagesSrc));
  ok('Clear filters resets the ARRAYS', /filter\.methods = \[\]; filter\.sports = \[\]; filter\.coaches = \[\]; filter\.categories = \[\]/.test(pagesSrc));
  ok('no <select> remains for these four', !/<select id="inv-(method|sport|coach|category)"/.test(pagesSrc));
  ok('the old scalar keys are deleted after migrating', /delete filter\.method; delete filter\.sport; delete filter\.coach; delete filter\.category;/.test(pagesSrc));
}

console.log('\nMULTI FILTERS:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
