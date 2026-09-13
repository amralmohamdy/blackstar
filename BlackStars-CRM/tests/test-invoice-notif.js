// v6.469 — when a new member is registered or a membership is renewed, a persistent entry appears
// in the notification bell with a one-tap "download the invoice PDF" action, so staff don't have
// to open the Invoices screen to re-export it. Stored locally (capped 8, TTL 3 days), de-duplicated
// per invoice, and cleared once downloaded. This locks the store, the bell wiring, and the creation
// call-sites. Behaviour verified end-to-end in a browser (click → printInvoicePDF → dismiss).
const H = require('./qc-harness.js');
const R = H.reporter('BELL · invoice-ready download notification');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const app = H.readSrc('app.js'), pages = H.readSrc('pages.js');
  R.ok('pushInvoiceNotif is defined', /window\.pushInvoiceNotif = function \(invId, memberId, memberName, kind\)/.test(app));
  R.ok('notifs are stored + TTL-capped', /INV_NOTIF_KEY = 'blackstars-invoice-notifs'/.test(app) && /INV_NOTIF_TTL_MS/.test(app));
  R.ok('duplicate invoices are collapsed', /filter\(n => String\(n\.invId\) !== String\(invId\)\)/.test(app));
  R.ok('admin notifications prepend invoice items', /loadInvoiceNotifs\(\)\.slice\(\)\.reverse\(\)/.test(app) && /action: 'invoice', invId: n\.invId/.test(app));
  R.ok('the panel button carries the action + invoice id', /data-action="\$\{n\.action \|\| ''\}" data-inv="\$\{n\.invId != null \? n\.invId : ''\}"/.test(app));
  R.ok('clicking an invoice item downloads the PDF then dismisses', /action === 'invoice' && inv\)[\s\S]{0,160}printInvoicePDF\(parseInt\(inv\)\)[\s\S]{0,120}dismissInvoiceNotif\(inv\)/.test(app));
  R.ok('the badge refreshes in place after a push', /function refreshNotifBadge\(\)/.test(app));
  R.ok('new-member creation pushes a notif', /pushInvoiceNotif\(newInv\.id, data\.id, data\.name, 'new'\)/.test(pages));
  R.ok('multi-sport renewal pushes a notif', /pushInvoiceNotif\(_invId, m\.id, m\.name, 'renewal'\)/.test(pages));
  R.ok('single-sport renewal pushes a notif', /pushInvoiceNotif\(_rnInvId, m\.id, m\.name, 'renewal'\)/.test(pages));
}

R.section('functional: push → appears in the admin bell → dismiss');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const res = run(ctx, `
    (function(){
      try { localStorage.removeItem('blackstars-invoice-notifs'); } catch(_){}
      window.currentRole = () => 'admin';
      pushInvoiceNotif(4242, 101, 'Test Member', 'new');
      pushInvoiceNotif(4243, 102, 'Renew Member', 'renewal');
      const items = buildNotifications().filter(n => n.action === 'invoice');
      const before = { titles: items.map(n=>n.title), invs: items.map(n=>n.invId) };
      pushInvoiceNotif(4242, 101, 'Test Member', 'new');   // dup — must not add a 2nd
      const dupCount = loadInvoiceNotifs().length;
      dismissInvoiceNotif(4242);
      return { before, dupCount, afterDismiss: loadInvoiceNotifs().map(n=>n.invId) };
    })()
  `);
  R.ok('both appear as invoice bell items', res.before.invs.length === 2 && res.before.invs.includes(4242) && res.before.invs.includes(4243), JSON.stringify(res.before));
  R.ok('newest (renewal) is first', res.before.titles[0] === 'Renewal invoice ready', JSON.stringify(res.before.titles));
  R.ok('a duplicate invoice is collapsed (still 2)', res.dupCount === 2, JSON.stringify(res));
  R.ok('dismiss removes only that invoice', JSON.stringify(res.afterDismiss) === JSON.stringify([4243]), JSON.stringify(res.afterDismiss));
}

R.done();
