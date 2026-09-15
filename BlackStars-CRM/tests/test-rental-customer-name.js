// v6.361 — a Court Rental invoice whose own customerName is missing must show the RENTER'S name
// (recovered from the linked rental record), not the "⚽ Football" description fallback.
const vm = require('vm'), fs = require('fs'), path = require('path');
const _APPDIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(_APPDIR, 'app.js'), 'utf8');
const ctx = { console: { log() {} }, Math, Date, String, Number, Array, Object, parseInt, parseFloat, isNaN };
ctx.window = ctx; ctx.globalThis = ctx; ctx.TODAY = '2026-07-16';
ctx.document = { getElementById: () => null }; ctx.localStorage = { getItem: () => null, setItem() {} }; ctx.addEventListener = () => {};
vm.createContext(ctx);
try { vm.runInContext(appSrc, ctx); } catch (e) {}
const run = code => vm.runInContext(code, ctx);
run(`state.members = [{ id: 5, name: 'Ali Member', phone: '55500000' }];
     state.rentals = [{ id: 99, facility: 'Football Court', customerName: 'Khalid Al Rashed', customerPhone: '55511111', invoiceId: 900 }];`);

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + JSON.stringify(got) : ''); } };
const info = json => run('customerInfo(' + json + ')');

// 1) rental invoice MISSING its own customerName → recovered from the linked rental
let r = info(`{ id:900, category:'Court Rental', sport:'Football Court', rentalId:99, description:'🏟 Football Court rental — 1h — Khalid Al Rashed' }`);
ok('missing customerName → recovered from rental', r && r.name === 'Khalid Al Rashed', r);
ok('...phone also recovered from rental', r && r.phone === '55511111', r && r.phone);

// 2) invoice with its OWN customerName → uses it (unchanged)
r = info(`{ id:900, category:'Court Rental', rentalId:99, customerName:'Typed Name', customerPhone:'55522222' }`);
ok('own customerName wins (unchanged)', r && r.name === 'Typed Name' && r.phone === '55522222', r);

// 3) member-linked invoice → member name (unchanged path)
r = info(`{ id:901, customerId:5 }`);
ok('member-linked invoice → member name (unchanged)', r && r.name === 'Ali Member' && r.isMember === true, r);

// 4) no customerName, no rentalId → null (list then shows the description fallback)
r = info(`{ id:902, category:'Court Rental' }`);
ok('no name + no rentalId → null (unchanged degraded fallback)', r && r.name == null, r);

// 5) rentalId points to a missing rental → null, no throw
r = info(`{ id:903, rentalId:12345 }`);
ok('dangling rentalId → null, no crash', r && r.name == null, r);

// 6) a NON-rental walk-in invoice with a name is untouched
r = info(`{ id:904, customerName:'Walk In Guy' }`);
ok('non-rental walk-in name preserved', r && r.name === 'Walk In Guy', r);

console.log('\nRENTAL CUSTOMER NAME:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
