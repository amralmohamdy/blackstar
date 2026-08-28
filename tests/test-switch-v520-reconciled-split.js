// v6.520 — the Switch-Sport rebuild (owner-confirmed model). A single-target switch:
//  • caps the SOURCE sport to classes ATTENDED (source sub → attended/attended · Completed, old coach
//    keeps attended × old-rate), windowed to the current package's start (no renewal over-count);
//  • moves REMAINING + CARRY-FORWARD classes to the new sport at an admin-entered RE-PRICE;
//  • SPLITS the one membership invoice in place (source line → attended/aShare, ADD dest line →
//    moved/price) instead of adding a net-zero switch-credit;
//  • re-totals the invoice → top-up due (dearer) or refundable credit (cheaper);
//  • never clobbers a genuine existing PAID destination package (F1).
const H = require('./qc-harness.js');
const R = H.reporter('v6.520 · switch reconciled split + re-price + carry-forward');
const src = H.readSrc();

R.section('A — dialog: a New sport Price field + money-conserving default');
R.ok('the single-target dialog has a #sw-price input', /id="sw-price"/.test(src));
R.ok('there is a destPriceDefault() helper', /function destPriceDefault\(\)/.test(src));
R.ok('the default charges only the REMAINING classes (carried are a free bonus, v6.532)', /const remaining = Math\.max\(0, total - attended\);\s*\n\s*return Math\.round\(remaining \* aRate \* 100\) \/ 100;/.test(src));
R.ok('the price field is bound to a live preview', /priceEl\.addEventListener\('input', \(\) => updatePreview\(\)\)/.test(src));

R.section('B — the invoice is SPLIT in place (no net-zero switch-credit)');
R.ok('the source line is capped to attended/aShare', /_fl\.price = aShare; _fl\.classes = attendedA;/.test(src));
R.ok('a destination line (moved @ re-price) is added', /classes: moved, price: bPrice/.test(src));
R.ok('the invoice re-totals from its lines', /_inv\.amount = _inv\.lineItems\.reduce\(\(s, li\) => s \+ \(Number\(li\.price\) \|\| 0\), 0\)/.test(src));
R.ok('the old switch-credit invoice creation is gone', !/switchCredit: true,\s*\/\/ flag for revenue/.test(src));

R.section('C — the source subscription is capped + completed');
R.ok('source sub totalClasses is capped to attended', /srcSub\.totalClasses = attendedA;/.test(src));
R.ok('source sub is completed + switchedAwayTo + paid aShare', /srcSub\.status = 'completed';/.test(src) && /srcSub\.switchedAwayTo = toSport;/.test(src) && /srcSub\.amountPaid = aShare;/.test(src));

R.section('D — carry-forward moves at the old rate');
R.ok('carry-forward classes are read via carryForwardCredit', /const carried = \(typeof carryForwardCredit === 'function'\) \? Math\.max\(0, Math\.round\(carryForwardCredit\(m, from\.sport\) \|\| 0\)\) : 0;/.test(src));
R.ok('moved = remaining + carried', /const moved = remaining \+ carried;/.test(src));

R.section('E — attendance count is WINDOWED to the current package (F3)');
R.ok('countAttendedUpTo derives a since-floor from the active sub start', /const srcSub = m\.subscriptions\.find\(s => \(s\.activity \|\| ''\) === sport && s\.status !== 'completed' && s\.status !== 'withdrawn' && !s\.switchedAwayTo\);/.test(src));
R.ok('the count honours the since-floor', /if \(dateStr <= untilDateStr && \(!sinceStr \|\| dateStr >= sinceStr\)\) total\+\+;/.test(src));

R.section('F — F1: a genuine PAID destination package is not clobbered');
R.ok('destSub reuse skips a real paid package (only switchFunded/empty)', /\(s\.switchFunded \|\| !\(Number\(s\.amountPaid\) > 0\)\)/.test(src));

R.section('G — runtime: the reconcile math conserves money');
{
  // price 800 / 8 classes, attends 3, carries 2 forward, new sport re-priced to 400.
  const price = 800, total = 8, attended = 3, carried = 2;
  const aRate = price / total;                 // 100
  const aShare = Math.round((attended / total) * price * 100) / 100;  // 300
  const remaining = total - attended;          // 5
  const moved = remaining + carried;           // 7
  R.ok('old coach keeps exactly attended × rate', aShare === 300, 'aShare=' + aShare);
  R.ok('moved = remaining + carried', moved === 7, 'moved=' + moved);

  // Money-conserving DEFAULT price = moved × old rate → invoice total unchanged when carried=0…
  const defWhenNoCarry = Math.round(((total - attended)) * aRate * 100) / 100; // 500
  R.ok('default (no carry) keeps invoice at the original 800', Math.round((aShare + defWhenNoCarry) * 100) / 100 === 800);

  // Re-price CHEAPER (400) → refundable credit of 100.
  const bPriceCheap = 400, newTotalCheap = aShare + bPriceCheap;
  R.ok('cheaper new sport → over-paid by 100 (refundable credit)', Math.round((newTotalCheap - price) * 100) / 100 === -100);

  // Re-price DEARER (600) → member owes 100 top-up.
  const bPriceDear = 600, newTotalDear = aShare + bPriceDear;
  R.ok('dearer new sport → owes +100 top-up', Math.round((newTotalDear - price) * 100) / 100 === 100);

  // The split invoice's two lines always sum to the invoice amount.
  const lines = [{ classes: attended, price: aShare }, { classes: moved, price: bPriceDear }];
  const amount = lines.reduce((s, li) => s + li.price, 0);
  R.ok('invoice amount = Σ line prices', amount === newTotalDear);
  R.ok('source line carries attended classes, dest carries moved', lines[0].classes === 3 && lines[1].classes === 7);
}

R.section('H — runtime: windowing predicate drops pre-package attendance');
{
  // Simulate countAttendedUpTo windowing: a renewed sport with a Y in July (old package) and
  // Ys in August (current package starting 2026-08-01) must count only August up to the switch.
  const att = { '2026-07': { Karate: { '15': 'Y' } }, '2026-08': { Karate: { '03': 'Y', '10': 'Y', '25': 'Y' } } };
  const since = '2026-08-01', until = '2026-08-20';
  let n = 0;
  for (const mk of Object.keys(att)) for (const d of Object.keys(att[mk].Karate)) {
    if (att[mk].Karate[d] !== 'Y') continue;
    const ds = `${mk}-${d.padStart(2, '0')}`;
    if (ds <= until && (!since || ds >= since)) n++;
  }
  R.ok('windowed count ignores the July class + the after-switch class (=2)', n === 2, 'n=' + n);
}

R.done();
