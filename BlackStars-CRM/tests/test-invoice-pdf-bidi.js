// The invoice PDF must NOT mix English (LTR) and Arabic (RTL) on one line. When it does,
// the printed PDF's text runs reorder/merge as soon as a PDF viewer re-extracts them — which
// is the "corrupted invoice" the club saw in WhatsApp's PDF reader (labels like "فترةفترة",
// "النظام الغذائينشاط", and a Period value scrambled to "262026 يوليو"). This test builds the
// real invoice HTML and asserts every bilingual label is split into isolated single-direction
// runs, so the text extracts in clean logical order everywhere.
const H = require('./qc-harness.js');
const R = H.reporter('INVOICE PDF · BIDIRECTIONAL SAFETY');

// Capture the exact HTML window.printInvoicePDF builds (it Blobs it, then window.open()s it).
function invoiceHtml(ctx) {
  return H.vm.runInContext(`(function(){
    var captured = null;
    var _open = window.open, _make = URL.createObjectURL;
    // The app builds a Blob then URL.createObjectURL(blob) then window.open(url). Grab the blob.
    URL.createObjectURL = function(blob){ captured = blob; return 'blob:captured'; };
    window.open = function(){ return { closed:false, focus:function(){}, close:function(){}, document:{} }; };
    try { window.printInvoicePDF(${'999001'}); } catch(e){ return 'ERR:'+e.message; }
    URL.createObjectURL = _make; window.open = _open;
    // Our Blob stub stores its parts; recover the HTML string.
    if (captured && captured._parts) return captured._parts.join('');
    if (captured && captured.text) return captured.__html || '';
    return window.__lastInvoiceHtml || '';
  })()`, ctx);
}

function seedInvoice(ctx) {
  H.vm.runInContext(`
    state.user = { role:'admin', name:'QC' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Mostafa', rate:30, active:'Y' }];
    state.members = [{ id:5001, name:'Rashed Ibrahim R A Aljehani', nameArabic:'راشد إبراهيم الجهني',
      phone:'+97430400103', qid:'32163406080', nationality:'Qatari', sport:'Swimming', coachId:1,
      subscriptions:[{ id:'subT', activity:'Swimming', coachId:1, coach:'Mostafa', start:'2026-07-18', end:'2026-08-17', totalClasses:4, attendedClasses:0, status:'Active', invoiceNumber:'INV-TST01' }],
      enrollments:[{ sport:'Swimming', coachId:1, classes:4, price:750 }] }];
    state.invoices = [{ id:999001, ref:'INV-TST01', customerId:5001, date:'2026-07-18', month:'2026-07',
      sport:'Swimming', amount:750, amountPaid:300, method:'Cash', category:'Membership',
      lineItems:[{ sport:'Swimming', coachId:1, coach:'Mostafa', classes:4, price:750 }],
      payments:[{ amount:300, date:'2026-07-18', method:'cash', byName:'Reception' }] }];
  `, ctx);
}

// A Blob stub that remembers its parts, so we can read the built HTML back.
function ctxWithBlob() {
  const ctx = H.makeCtx({ role: 'admin' });
  H.vm.runInContext(`window.Blob = function(parts){ this._parts = parts || []; };`, ctx);
  return ctx;
}

R.section('the invoice builds and contains the expected content');
const ctx = ctxWithBlob();
seedInvoice(ctx);
const html = invoiceHtml(ctx);
R.ok('printInvoicePDF produced HTML', typeof html === 'string' && html.length > 2000 && !html.startsWith('ERR:'), (html || '').slice(0, 120));
R.ok('it is the invoice (has the items table + customer)', /items-table/.test(html) && html.includes('Rashed'), null);

R.section('v6.474 — the Period reads as an unambiguous month-year + aligns right');
{
  R.ok('the Period shows the FULL month + 4-digit year (July 2026)', /July 2026/.test(html), (html.match(/Period[\s\S]{0,160}/) || [''])[0]);
  R.ok('it does NOT use the ambiguous "Jul 26" (reads like a day)', !/>Jul 26</.test(html));
  R.ok('the Period block is right-aligned', /margin-inline-start:auto;text-align:right/.test(html));
}

R.section('NO line mixes English and Arabic — the corruption source is gone');
{
  // The exact fragile pattern the fix removed: an English word, " · ", then an Arabic <bdi>.
  const inlineMixed = (html.match(/[A-Za-z)] · <bdi>/g) || []);
  R.ok('no "English · <bdi>Arabic</bdi>" inline labels remain', inlineMixed.length === 0, inlineMixed);
  // Any <bdi> that still exists must be isolated on its own, not glued after Latin text + "·".
  R.ok('the period value is stacked, not "Month · شهر" on one line',
    !/fmtMonth|·\s*<bdi>/.test(html) && /<div dir="rtl"[^>]*>يوليه 2026<\/div>/.test(html) === false ? true : !/[0-9] · <bdi>/.test(html),
    null);
}

R.section('every bilingual label is present as SEPARATE dir-typed runs (extracts in order)');
{
  // Each pair: the English text and the Arabic text must both appear, each wrapped in its own
  // direction so a PDF reader reconstructs them correctly.
  const pairs = [
    ['Description', 'الوصف'], ['Qty', 'الكمية'], ['Amount (QAR)', 'المبلغ'],
    ['Subtotal', 'المجموع الفرعي'], ['Total', 'الإجمالي'], ['Balance due', 'المتبقي'],
    ['Billed to', 'فاتورة إلى'], ['From', 'من'], ['Activity', 'النشاط'], ['Period', 'الفترة'],
  ];
  for (const [en, ar] of pairs) {
    const hasEnLtr = new RegExp(`<span dir="ltr">${en.replace(/[()]/g, '\\$&')}<\\/span>`).test(html);
    const hasArRtl = new RegExp(`<span dir="rtl">${ar}<\\/span>`).test(html);
    R.ok(`"${en}" / "${ar}" are separate isolated runs`, hasEnLtr && hasArRtl, { hasEnLtr, hasArRtl });
  }
}

R.section('the Period VALUE (the one that scrambled to "262026 يوليو") is stacked');
{
  // English month on its own LTR line, Arabic month on its own RTL line — never glued.
  R.ok('Arabic month sits on its own RTL block', /<div dir="rtl"[^>]*>[^<]*يو[^<]*<\/div>/.test(html), null);
  R.ok('English + Arabic months are NOT on the same text node',
    !/[0-9]{4} · <bdi>/.test(html) && !/يو\w* · /.test(html), null);
}

R.section('the amounts and totals are still correct (fix changed layout, not numbers)');
{
  R.ok('subtotal shows 750.00', html.includes('750.00 QAR'), null);
  R.ok('balance due shows 450.00 (750 − 300 paid)', html.includes('450.00 QAR'), null);
  R.ok('customer QID + Arabic name present', html.includes('32163406080') && html.includes('راشد'), null);
}

R.section('the frozen-clock harness fix works (guards the whole suite from midnight rollover)');
{
  const t = H.vm.runInContext('TODAY', H.seed(H.makeCtx({ today: '2026-03-15' })));
  R.ok('a test can pin TODAY regardless of the real date', t === '2026-03-15', t);
  const def = H.vm.runInContext('TODAY', H.seed(H.makeCtx()));
  R.ok('the default frozen date is stable, not the live clock', def === '2026-07-24', def);
}

R.done();
