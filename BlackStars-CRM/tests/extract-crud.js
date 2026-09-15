// Enumerate every write/delete in the app and classify HOW its client-side success message is
// gated on the cloud. Output is derived from source, not from memory.
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, 'crm238', 'blackstars-localhost');

const rows = [];
for (const file of ['pages.js', 'app.js']) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8');
  const L = src.split('\n');

  for (let i = 0; i < L.length; i++) {
    const ln = L[i];
    let mech = null, msg = '';

    // strongest: withCloudConfirm with a SERVER READ-BACK
    if (/withCloudConfirm\(/.test(ln)) {
      const win = L.slice(i, i + 6).join(' ');
      mech = /verify:\s*\[/.test(win) ? 'READBACK' : 'ACK';
      const m = win.match(/okMsg:\s*([^,}]{0,70})/) || win.match(/okMsg\b/);
      msg = m ? String(m[1] || '').trim() : '';
    } else if (/[^.]\bconfirmSaved\(/.test(ln)) {
      mech = 'ACK';
      const m = ln.match(/confirmSaved\(\s*([^,;]{0,70})/);
      msg = m ? m[1].trim() : '';
    } else if (/[^.]\bsave\(\);/.test(ln)) {
      // bare save -> is a success toast nearby that is NOT under a confirm?
      const above = L.slice(Math.max(0, i - 3), i).join(' ');
      if (/withCloudConfirm\(|confirmSaved\(/.test(above)) continue;   // fallback branch
      const run = [];
      for (let j = i; j < Math.min(i + 4, L.length); j++) {
        if (j > i && (/^\s*[}\])]/.test(L[j]) || /onclick:|label:/.test(L[j]))) break;
        run.push(L[j]); if (j > i && /toast\(/.test(L[j])) break;
      }
      const win = run.join(' ');
      if (!/toast\(/.test(win)) continue;
      if (/,\s*'error'\)|,\s*'info'\)|,\s*'warning'\)/.test(win)) continue;
      const h = L.slice(Math.max(0, i - 14), i).join(' ');
      if (/withCloudConfirm\(|confirmSaved\(/.test(h)) continue;
      mech = 'OPTIMISTIC';
      const m = win.match(/toast\(\s*([^,;]{0,70})/); msg = m ? m[1].trim() : '';
    }
    if (!mech) continue;

    // nearest enclosing named function / handler, searching upward
    let owner = '';
    for (let j = i; j >= 0 && j > i - 260; j--) {
      const f = L[j].match(/^\s*(?:window\.)?([A-Za-z_]\w*)\s*=\s*(?:async\s*)?function|^\s*(?:async\s+)?function\s+([A-Za-z_]\w*)|^\s*PAGES\.(\w+)\s*=/);
      if (f) { owner = f[1] || f[2] || ('PAGES.' + f[3]); break; }
    }
    rows.push({ file, line: i + 1, owner, mech, msg: msg.replace(/[`'"]/g, '').slice(0, 60) });
  }
}

const byMech = m => rows.filter(r => r.mech === m).length;
console.log(`TOTAL mutation sites with a success message: ${rows.length}`);
console.log(`  READBACK (server read-back popup): ${byMech('READBACK')}`);
console.log(`  ACK      (waits for server ack)  : ${byMech('ACK')}`);
console.log(`  OPTIMISTIC (NOT confirmed)       : ${byMech('OPTIMISTIC')}`);
console.log('\n--- OPTIMISTIC remaining ---');
rows.filter(r => r.mech === 'OPTIMISTIC').forEach(r => console.log(`  ${r.file}:${r.line} ${r.owner} :: ${r.msg}`));
fs.writeFileSync(path.join(__dirname, 'crud-map.json'), JSON.stringify(rows, null, 1));
console.log('\nwrote crud-map.json');
