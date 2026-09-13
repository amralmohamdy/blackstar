// v6.426 — (1) TRASH screen: one place to recover soft-deleted records (archived members +
// deleted invoices) via restoreMember/restoreInvoice, plus a read-only deletion + sync-conflict
// log. Admin-only. (2) SYNC CONFLICT GUARD: the client merge now reports WHICH records both
// devices edited (conflictItems) into a device-local log, so the owner is aware — resolution
// itself is unchanged (both sides' distinct changes still merge; a true clash keeps local).
const H = require('./qc-harness.js');
const R = H.reporter('TRASH + SYNC CONFLICT GUARD');
const run = (c, s) => H.vm.runInContext(s, c);

function seed(ctx) {
  run(ctx, `
    state.user = { role:'admin' }; state.session = { role:'admin' };
    state.coaches = [{ id:1, name:'Coach', active:'Y' }];
    state.members = [
      { id:601, name:'Active Kid', sport:'Boxing', coachId:1, status:'Active', enrollments:[{sport:'Boxing',coachId:1,classes:8,price:400}] },
      { id:602, name:'Archived Kid', sport:'Karate', coachId:1, deleted:true, deletedAt:'2026-07-28T10:00:00Z', deletedReason:'left the club', enrollments:[{sport:'Karate',coachId:1,classes:8,price:425}] },
    ];
    state.invoices = [
      { id:9001, ref:'INV-A', customerId:601, customerName:'Active Kid', amount:400, date:'2026-07-01', month:'2026-07', category:'Membership', lineItems:[{sport:'Boxing',price:400}] },
      { id:9002, ref:'INV-DEL', customerId:602, customerName:'Archived Kid', amount:425, date:'2026-07-01', month:'2026-07', category:'Membership', deleted:true, deletedAt:'2026-07-28T10:05:00Z', deletedBy:'Owner', lineItems:[{sport:'Karate',price:425}] },
    ];
    state.auditLog = [{ id:1, ts:'2026-07-28T10:00:00Z', action:'member.archive', recId:602, recordName:'Archived Kid', summary:'Archived Archived Kid', userName:'Owner' }];
  `);
}

R.section('trashCount + route');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  R.ok('trashCount() = 2 (1 member + 1 invoice)', run(ctx, `trashCount()`) === 2, run(ctx, `trashCount()`));
  R.ok('a trash route exists, admin-only', run(ctx, `ROUTES.trash && ROUTES.trash.adminOnly === true`) === true);
}

R.section('the Trash screen lists recoverable records with restore actions');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  const out = H.renderScreen(ctx, 'trash');
  R.ok('trash renders', out.ok, out.error);
  const html = out.html || '';
  R.ok('the archived member is listed', /Archived Kid/.test(html));
  R.ok('the deleted invoice is listed', /INV-DEL/.test(html));
  R.ok('a restoreMember action is wired', /restoreMember\(602\)/.test(html));
  R.ok('a restoreInvoice action is wired', /restoreInvoice\(9002\)/.test(html));
  R.ok('the ACTIVE member/invoice are NOT in trash', !/Active Kid/.test(html) || !/restoreMember\(601\)/.test(html));
  R.ok('the deletion log shows the archive audit', /member\.archive/.test(html));
}

R.section('non-admins cannot use the Trash screen');
{
  const ctx = H.makeCtx({ role: 'coach' }); seed(ctx);
  run(ctx, `state.session={role:'coach',coachId:1};state.user={role:'coach',coachId:1};`);
  const out = H.renderScreen(ctx, 'trash');
  R.ok('coach sees an admins-only message', /Admins only|المشرفون فقط/.test(out.html || ''));
}

R.section('restoreMember clears the deleted flag (record leaves trash)');
{
  const ctx = H.makeCtx({ role: 'admin' }); seed(ctx);
  run(ctx, `window.withCloudConfirm = (o)=>{ if(o&&o.afterOk) o.afterOk(); return Promise.resolve({ok:true}); }; window.render=()=>{};`);
  run(ctx, `restoreMember(602)`);
  R.ok('member 602 is no longer deleted', run(ctx, `!state.members.find(m=>m.id===602).deleted`) === true);
  R.ok('trashCount drops to 1', run(ctx, `trashCount()`) === 1);
}

R.section('SYNC CONFLICT GUARD — the merge reports which records both devices edited');
{
  const ctx = H.makeCtx({ role: 'admin' });
  // Same record edited on both sides (local set phone, remote set email) → a conflict item.
  const res = run(ctx, `_mergeCollection(
    [{id:1,name:'Rashed'}],
    [{id:1,name:'Rashed',phone:'111'}],
    [{id:1,name:'Rashed',email:'x@y.z'}],
    'members')`);
  R.ok('one conflict counted', res.conflicts === 1, res.conflicts);
  R.ok('conflictItems names the record + collection', Array.isArray(res.conflictItems) && res.conflictItems[0].coll === 'members' && res.conflictItems[0].name === 'Rashed', res.conflictItems);
  R.ok('both sides’ distinct fields still merged (phone AND email kept)', res.merged[0].phone === '111' && res.merged[0].email === 'x@y.z', res.merged[0]);
}

R.section('conflicts are recorded to a device-local log (not synced)');
{
  const ctx = H.makeCtx({ role: 'admin' });
  run(ctx, `window.__syncConflictLog = [];`);
  run(ctx, `_recordSyncConflicts([{coll:'invoices',id:5,name:'INV-9'}])`);
  R.ok('the conflict log captured the event', run(ctx, `window.__syncConflictLog.length`) === 1);
  R.ok('the log entry carries the item name', run(ctx, `window.__syncConflictLog[0].items[0].name`) === 'INV-9');
  R.ok('the log is NOT part of synced state', run(ctx, `state.__syncConflictLog === undefined`) === true);
}

R.section('source: resolution policy is unchanged (guard is visibility-only)');
{
  const src = H.readSrc();
  R.ok('_mergeCollection returns conflictItems', /return \{ merged: out, conflicts, conflictItems \}/.test(src));
  R.ok('mergeRemoteIntoState records conflicts via _recordSyncConflicts', /_recordSyncConflicts\(allConflictItems\)/.test(src));
  R.ok('the conflict notice points to Trash → Sync conflicts', /Review in Trash → Sync conflicts/.test(src));
}

R.done();
