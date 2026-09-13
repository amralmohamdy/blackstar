// v6.388 — DATA-LOSS TRUST SWEEP. v6.387 fixed the ONE delete the owner reported, but the same
// false-success pattern (bare `save()` — DEBOUNCED ~1.5s + fire-and-forget — then an immediate
// success toast) lived in ~30 more money & destructive handlers. Each could claim an action
// succeeded before the write reached Firebase, so a refresh inside that window lost it. This test
// pins EVERY converted handler: its success toast must now be reached through confirmSaved() (which
// waits for the server) — never a bare save() followed by the same toast. Behaviour of confirmSaved
// itself (success only on a confirmed write, red 'NOT saved' on rejection) is control-verified in
// test-confirmed-delete.js; here we prove the sweep actually rerouted every site.
const fs = require('fs'), path = require('path');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const pages = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };

// A handler is FIXED when its success message appears as an argument to confirmSaved(...) (or an
// okMsg of withCloudConfirm) AND does NOT appear as a bare `toast(<same>)` on a line whose own
// statement also/previously called save(). We check the positive form: the toast text is passed to
// confirmSaved. Each `needle` is a distinctive fragment of the converted success toast.
function reachedViaConfirm(src, needle) {
  // find every confirmSaved( ... needle ... ) occurrence. v6.567: commitSwitch() is a confirmed wrapper
  // (it calls confirmSaved on success, and rolls back on a broken result), so it counts too.
  const re = new RegExp('(?:confirmSaved|commitSwitch)\\([^\\n]*?' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), '');
  return re.test(src);
}
// The OLD leak: the same needle sitting in a plain `toast(...)` that is NOT the else-fallback under a
// confirm. We approximate "still leaking" as: a `save();` and that `toast(<needle>)` on the same or
// adjacent line, with no confirmSaved/withCloudConfirm on that line.
function stillLeaks(src, needle) {
  const lines = src.split('\n');
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (let i = 0; i < lines.length; i++) {
    const win = lines.slice(i, i + 3).join(' ');
    if (!new RegExp('toast\\([^\\n]*?' + esc).test(win)) continue;
    if (/confirmSaved|withCloudConfirm|saveConfirmed/.test(win)) continue;   // guarded / fallback
    if (/\bsave\(\);/.test(win)) return true;                                // bare save()+toast
  }
  return false;
}

// [file, distinctive toast fragment]  — one per converted handler.
const MONEY = [
  [pages, 'invoice${invs.length === 1'],              // deleteSelectedInvoices
  [pages, 'Merged ${invs.length} invoices into one'], // mergeSelectedInvoices
  [pages, "t('updated', 'تم التحديث')"],               // _icFix (single)
  [pages, "(inv.ref || ('INV' + inv.id)) + ' → ' + m.name"], // _icRelink
  [pages, "n + ' ' + t('invoices updated'"],           // _icFixAll (bulk)
  [pages, 'Invoice ${newInv.ref} created'],            // generateLatestInvoice
  [pages, "t('Invoice restored'"],                     // restoreInvoice
  [pages, 'Invoice regenerated · new balance'],        // regenerateInvoice
  [pages, "t('Cash collection updated'"],              // cash collection
  [pages, "t('Cash count recorded'"],                  // cash count (quick)
  [pages, "t('Payments cleared'"],                     // markPaid clear
  [pages, '+${qty} ${p.name}'],                        // product restock
  [pages, 'carried class${applied === 1'],             // applyCarryForwardToActive
  [pages, 'Fixed ${n} messy ledger'],                  // fix messy ledgers
  [pages, "t('Invoice total corrected'"],              // fixInvoiceTotalUI
  [pages, 'Normalised ${n} invoice method'],           // normalizeAllMethodsUI
  [pages, 'Kept one ${sport} enrollment'],             // dedupeMemberEnrollment
  [pages, "Re-synced ${m.name}'s enrollments"],        // resyncMemberEnrollmentsUI
  [pages, 'Re-synced ${n} member'],                    // resyncAllEnrollmentsUI
  [pages, 'Recalculated camp for ${m.name}'],          // recalcCampMemberUI
  [pages, 'Recalculated ${n} camp member'],            // recalcAllCampUI
  [pages, 'Merged into one "${kept.name}"'],           // mergeDuplicateProductsUI
  [pages, 're-dated to ${fmtDate(fixed.date)}'],       // fixInvoiceDateUI
  [pages, 'Re-dated ${n} invoice'],                    // fixAllInvoiceDatesUI
  [pages, 'Merged into ${kept.ref'],                   // mergeMemberInvoicesUI
  [pages, "'edit payments (date/method/rows)'"],       // edit-payments modal — anchored below
  [pages, "payment edits via edit-pricing"],           // edit-pricing/refund panel — anchored below
  [pages, 'excluded from ${c.name}'],                  // commission-exclude
  [pages, "Transferred ${from.name}'s students"],      // coach transfer
  [pages, 'distributed into '],                        // sport switch
  [pages, 'Booking updated'],                          // rental booking
  [pages, 'Customer updated'],                         // rental customer
];
const DESTRUCTIVE = [
  [pages, "t('Restored from', 'تم الاسترجاع من')"],     // restoreLocalBackup
  [pages, 'Restored · ${state.members.length} members'],// file restore
  [pages, 'Archived ${list.length} member'],           // bulk archive
  [pages, '"${sport}" enrollment removed'],            // removeEnrollmentMistake
  [pages, "t('Group deleted'"],                        // _swimDeleteGroup
  [pages, "'Class removed'"],                          // schedule remove class
  [pages, "'Schedule cleared'"],                       // schedule clear all
  [pages, 'frozen for ${days}'],                       // freeze membership
  [pages, "t('Household disbanded'"],                  // disband
  [pages, 'members added to'],                         // family bulk assign
  [pages, "t('Removed from household'"],               // family remove
  [pages, "t('Saved to household'"],                   // family save
  [app,   'Database cleared. Import your data'],       // manual wipe (resetData)
];

console.log('MONEY handlers — success is now gated on cloud confirmation:');
// handlers whose success toast is the generic t('Saved') — anchor on the distinctive audit line and
// assert a confirmSaved() (not a bare save()+toast) follows within the handler tail.
const ANCHORED = new Set(["'edit payments (date/method/rows)'", "payment edits via edit-pricing"]);
for (const [src, needle] of MONEY) {
  if (ANCHORED.has(needle)) {
    const idx = src.indexOf(needle);
    const after = src.slice(idx, idx + 1100);
    ok('anchored → confirmSaved: ' + needle.slice(0, 34),
      /confirmSaved\(/.test(after) && !/\bsave\(\);\s*closeModal\(\);\s*render\(\);\s*toast/.test(after), after.slice(0, 90));
    continue;
  }
  ok('gated: ' + needle.slice(0, 42), reachedViaConfirm(src, needle) && !stillLeaks(src, needle));
}

console.log('\nDESTRUCTIVE / data handlers — same guarantee:');
for (const [src, needle] of DESTRUCTIVE) {
  ok('gated: ' + needle.slice(0, 42), reachedViaConfirm(src, needle) && !stillLeaks(src, needle));
}

// camp price/paid edit shares the generic t('Saved') toast — anchor on its audit line.
console.log('\nshared-message handlers anchored on their audit line:');
{
  const idx = pages.indexOf("'camp edit: '");
  const seg = pages.slice(idx, idx + 300);
  ok('camp price/paid edit → confirmSaved', /confirmSaved\(/.test(seg) && !/\bsave\(\);\s*closeModal\(\);\s*render\(\);\s*toast/.test(seg));
}

// CONTROL: prove the assertion has teeth — re-introduce the OLD bare pattern for one handler and
// show stillLeaks() catches it (so a real regression could never pass silently).
console.log('\ncontrol — the check actually catches a regression:');
{
  // revert deleteSelectedInvoices to the OLD bare pattern (drop the confirmSaved call + its comment).
  const broken = pages.replace(
    /refresh\(\);\s*\n\s*\/\/ v6\.388[^\n]*\n\s*confirmSaved\((`✓ \$\{invs\.length\} invoice\$\{invs\.length === 1 \? '' : 's'\} deleted`)\);/,
    'save();\n    toast($1);'
  );
  ok('control patch applied (reverted deleteSelectedInvoices)', broken !== pages);
  ok('stillLeaks() flags the reverted handler', stillLeaks(broken, 'invoice${invs.length === 1'));
  ok('reachedViaConfirm() no longer sees it', !reachedViaConfirm(broken, 'invoice${invs.length === 1'));
}

console.log('\nCONFIRMED SWEEP:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
