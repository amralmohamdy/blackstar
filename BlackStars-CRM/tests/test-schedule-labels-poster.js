// v6.409 — SCHEDULE: (1) editable custom class names (Kids Kick-Boxing, Adult Boxing…), and
// (2) a daily portrait "poster" export to share as a WhatsApp status. The canvas poster is
// verified live in the browser (produces a real PNG); here we lock the wiring + the label logic.
const H = require('./qc-harness.js');
const R = H.reporter('SCHEDULE · custom class names + daily poster');
const src = H.readSrc();

R.section('custom class NAMES');
{
  R.ok('the tile shows the language-appropriate custom label, else the sport (v6.530 bilingual)', /t\(c\.label \|\| c\.sport, c\.labelAr \|\| c\.label \|\| sportNameAR\(c\.sport\)\)/.test(src));
  R.ok('the Edit-Class modal has a class-name input', /id="sch-label"/.test(src) && /Class name \(optional\)/.test(src));
  R.ok('the placeholder is the sport name (blank = use sport)', /id="sch-label"[\s\S]{0,120}placeholder="\$\{escapeHtml\(sport\)\}"/.test(src));
  R.ok('saving stores the label on an EDITED class (or clears it when blank)',
    /existing\.coachId = coachId;[\s\S]{0,80}if \(_label\) existing\.label = _label; else delete existing\.label;/.test(src));
  R.ok('saving stores the label on a NEW class', /_rec = \{ id: nextId[\s\S]{0,120}if \(_label\) _rec\.label = _label;/.test(src));
  R.ok('a label equal to the sport name is NOT stored (kept clean)', /_labelRaw && _labelRaw !== sport/.test(src));
}

R.section('daily poster (WhatsApp status)');
{
  R.ok('exportDayStatus is defined', /function exportDayStatus\(dayKey, lang\)/.test(src));
  R.ok('it is a PORTRAIT canvas (1080 wide, ≥1920 tall)', /const W = 1080/.test(src) && /const H = Math\.max\(1920,/.test(src));
  R.ok('it only lists slots that HAVE classes this day', /classesAt\(day\.key, slot\.hour\)\.filter\(isFiltered\)[\s\S]{0,60}filter\(s => s\.cls\.length\)/.test(src));
  R.ok('each class chip uses the language-appropriate custom label (v6.530 bilingual)', /const nm = ar \? \(c\.labelAr \|\| c\.label \|\| sportNameAR\(c\.sport\)\) : \(c\.label \|\| c\.sport\)/.test(src));
  R.ok('it shows the coach on each chip', /\(ar \? 'المدرب: ' : 'Coach: '\) \+ cn/.test(src));
  R.ok('it downloads a PNG named for the day', /a\.download = `BlackStars-\$\{ar \? 'AR-' : ''\}\$\{day\.label\}-status\.png`/.test(src));

  R.ok('a Day-poster button + day picker are in the toolbar', /id="sch-status"/.test(src) && /id="sch-status-day"/.test(src));
  R.ok('the day picker defaults to today', /_todayKey/.test(src) && /\['sun','mon','tue','wed','thu','fri','sat'\]\[new Date\(\)\.getDay\(\)\]/.test(src));
  R.ok('the poster button is wired (EN + AR)', /sch-status'\)\?\.addEventListener\('click', \(\) => exportDayStatus/.test(src) && /sch-status-ar'\)\?\.addEventListener/.test(src));
  R.ok('the weekly PNG export still exists (not replaced)', /function exportPng\(lang\)/.test(src) && /id="sch-png"/.test(src));
}

R.section('the Schedule screen still renders in every role');
{
  for (const role of ['admin', 'receptionist', 'coach']) {
    const out = H.renderScreen(H.seed(H.makeCtx({ role })), 'schedule');
    R.ok(`renders for ${role}`, out.ok, out.error);
  }
}

R.section('v6.426 — the WEEKLY schedule PNG export is BRIGHT (light theme)');
{
  const src = H.readSrc();
  const exp = (src.split('function exportPng(lang)')[1] || '').split('function exportDayStatus')[0];
  R.ok('a light base fill is drawn first', /ctx\.fillStyle = '#f4f7fb';\s*\n\s*ctx\.fillRect\(0, 0, W, H\)/.test(exp));
  R.ok('the brand band is white with a red underline', /ctx\.fillStyle = '#ffffff';[\s\S]{0,80}ctx\.fillStyle = '#f26060';\s*\n\s*ctx\.fillRect\(0, brandH - 3/.test(exp));
  R.ok('column header + time cells use dark text on a light fill', /ctx\.fillStyle = '#e6edf6'/.test(exp) && /ctx\.fillStyle = '#0f172a'/.test(exp) && /ctx\.fillStyle = '#eef3f9'/.test(exp));
  R.ok('day cells are light (white / f6f9fd)', /colIdx % 2 === 0 \? '#ffffff' : '#f6f9fd'/.test(exp));
  R.ok('class chips keep a soft drop shadow for depth', /shadowColor = 'rgba\(15,23,42,0\.20\)'/.test(exp));
  R.ok('NO dark navy fills remain in the weekly export', !/#0a0e1a|#0e131f|#131826|#1a2030|#252b3d/.test(exp));
}

R.done();
