// v6.519 — (A) the Expiring screen's sport filter is now a MULTI-select (was a single <select>) with
// a "Clear all filters" button; filter.sports is an array matched with .some(). (B) the "today at the
// club" schedule IMAGE sets the canvas bidi direction for Arabic so mixed emoji+Arabic and
// Arabic-label+Latin-name strings render whole (they were clipped to a few letters).
const H = require('./qc-harness.js');
const R = H.reporter('v6.519 · expiring multi-sport + schedule RTL');
const src = H.readSrc();

R.section('A — Expiring sport filter is multi-select + Clear all');
R.ok('filter state uses a sports ARRAY (not a single sport)', /let filter = \{ sports: \[\], coach: 'all'/.test(src));
R.ok('the sport control renders via multiFilterHTML', /multiFilterHTML\('exp-sport', sportsInList\.map\(s => \[s, s\]\), filter\.sports/.test(src));
R.ok('matching keeps a member doing ANY chosen sport', /if \(filter\.sports\.length\)/.test(src) && /if \(!filter\.sports\.some\(sp => ms\.has\(sp\)\)\) return false;/.test(src));
R.ok('the sport filter is bound with bindMultiFilter', /bindMultiFilter\('exp-sport', v => \{ filter\.sports = v;/.test(src));
R.ok('a "Clear all filters" button exists', /id="exp-clear-all"/.test(src) && /Clear all filters/.test(src));
R.ok('Clear all resets EVERY filter to default', /filter = \{ sports: \[\], coach: 'all', search: '', bucket: 'all', sort: 'expiry', reminded: 'all' \};\s*\n\s*PAGES\.expiring\(main\);/.test(src));

R.section('A runtime — multi-sport match predicate');
{
  const some = (chosen, member) => { const ms = new Set(member); return !(chosen.length && !chosen.some(sp => ms.has(sp))); };
  R.ok('no sports chosen → keep everyone', some([], ['Karate']) === true);
  R.ok('member doing one of the chosen sports is kept', some(['Karate', 'Swimming'], ['Swimming', 'Football']) === true);
  R.ok('member doing none of the chosen sports is dropped', some(['Karate', 'Swimming'], ['Football']) === false);
}

R.section('B — schedule image sets canvas RTL direction');
R.ok('the card text sets ctx.direction for Arabic', /ctx\.direction = ar \? 'rtl' : 'ltr';/.test(src));
R.ok('direction is reset to ltr for the LTR chrome', /ctx\.direction = 'ltr';\s*\/\/ reset/.test(src));

R.done();
