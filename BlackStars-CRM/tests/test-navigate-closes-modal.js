// v6.451 — a modal appends a full-screen #modal-backdrop to <body>; navigate() must
// force it closed before rendering, or a stuck overlay blocks every click on the next
// screen ("links not clickable" after using the browser Back button with a popup open).
const H = require('./qc-harness.js');
const R = H.reporter('NAVIGATE · closes a stuck modal overlay');

R.section('source: navigate() force-closes an open modal + clears the scroll lock');
{
  const src = H.readSrc();
  R.ok('navigate() removes an open #modal-backdrop via closeModal()',
    /function navigate\(route, opts\) \{[\s\S]{0,1500}getElementById\('modal-backdrop'\)\) closeModal\(\);/.test(src));
  R.ok('navigate() clears body overflow as a belt-and-braces fallback',
    /function navigate\(route, opts\)[\s\S]{0,1500}document\.body\.style\.overflow = '';/.test(src));
  R.ok('the guard runs BEFORE render() (so the new screen is interactive)',
    /getElementById\('modal-backdrop'\)\) closeModal\(\);[\s\S]{0,1200}state\.route = route;\s*render\(\);/.test(src));
}

R.section('closeModal() actually removes the backdrop + unlocks scroll (unchanged contract)');
{
  const src = H.readSrc();
  R.ok('closeModal removes #modal-backdrop', /function closeModal\(\) \{[\s\S]{0,160}modal-backdrop'\);[\s\S]{0,60}\.remove\(\);/.test(src));
  R.ok('closeModal resets body overflow', /function closeModal\(\)[\s\S]{0,200}document\.body\.style\.overflow = '';/.test(src));
}

R.done();
