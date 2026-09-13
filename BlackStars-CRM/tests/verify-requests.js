// For each change requested yesterday+today: is the CODE in the shipped build, and is there a
// TEST that covers it? Reports honestly — a missing test is reported as missing, not glossed.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const DIR = path.join(__dirname, 'crm238', 'blackstars-localhost');
const app = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const pages = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');
const store = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const S = { app, pages, store };

const ITEMS = [
  ['6.383', 'Accept 0 QR as a salary value',            'app',   /paidTarget <= 0\.005 && payments\.length > 0/, 'test-zero-salary-settlement.js'],
  ['6.383', '...and a 0 payment settles the month',     'pages', /ZERO-VALUE SETTLEMENT \(v6\.383\)/, 'test-zero-salary-settlement.js'],
  ['6.384', 'Keep recent 3 searches on Attendance',     'pages', /recentSearchChipsHtml\('attendance', 'att-recent-search', 3\)/, 'test-recent-searches.js'],
  ['6.384', 'Smart search for Arabic names',            'app',   /tokens\.length > 1 && tokens\.every\(tk => hay\.includes\(tk\)\)/, 'test-smart-search.js'],
  ['6.385', 'Coach filter resolves per sport',          'pages', /_coachSports = coachSportsFor\(m, parseInt\(filter\.coach\)\)/, 'test-attendance-coach-filter.js'],
  ['6.386', 'Attendance before a package start counts', 'app',   /FIRST package for this sport/, 'test-presub-attendance.js'],
  ['6.387', 'Delete confirmed by the server',           'app',   /function confirmSaved\(okMsg, opts\)/, 'test-confirmed-delete.js'],
  ['6.387', 'Date sorts no longer crash the re-render', 'pages', /String\(b\.date \|\| ''\)\.localeCompare/, 'test-confirmed-delete.js'],
  ['6.388', 'Success messages gated on the cloud',      'pages', /v6\.388: confirm the/, 'test-confirmed-sweep.js'],
  ['6.389', 'Unsaved work journalled + replayed',       'store', /function writePendingJournal/, 'test-pending-journal.js'],
  ['6.389', 'Session kept alive / in-place re-login',   'app',   /function showSessionResumePrompt/, 'test-pending-journal.js'],
  ['6.390', 'Search cannot override a status filter',   'pages', /const searchingUnfiltered = isSearching/, 'test-members-archived-filter.js'],
  ['6.391', 'Sport delete sticks (tombstones)',         'app',   /window\._tombstoneSport\(_enrScope, sport\)/, 'test-enrollment-delete-sticks.js'],
  ['6.391', 'Delete shows the server read-back popup',  'pages', /verify: \[\{ collection: 'members', id: memberId \}\],\s*\n\s*okMsg: `"\$\{sport\}" enrollment removed`/, 'test-enrollment-delete-sticks.js'],
  ['6.392', 'Every delete protected generically',       'app',   /_elIsTombstoned\(_dk\(id\)\)/, 'test-delete-tombstones.js'],
  ['6.393', 'Audit log cannot poison a batch',          'store', /if \(name === 'auditLog'\)[\s\S]{0,220}?_auditKnown\.has\(id\)\) continue;/, 'test-audit-batch-poison.js'],
  ['6.393', 'Loader + real result on every CRUD',       'app',   /_showSaving\(\);\s*\/\/ v6\.393/, 'test-audit-batch-poison.js'],
  ['6.394', 'No sign-in card for a non-session fault',  'app',   /if \(_who\) \{ showServerRefusedBar\(\); return; \}/, 'test-audit-batch-poison.js'],
];

// which test files currently pass
const passing = new Set();
for (const f of fs.readdirSync(__dirname).filter(x => /^test-.*\.js$/.test(x))) {
  try { cp.execSync(`node "${path.join(__dirname, f)}"`, { stdio: 'pipe' }); passing.add(f); } catch (_) {}
}

let codeMissing = 0, noTest = 0;
console.log('BUILD  CHANGE                                        CODE   TEST');
console.log('─'.repeat(78));
for (const [v, name, file, re, test] of ITEMS) {
  const inCode = re.test(S[file]);
  if (!inCode) codeMissing++;
  let tcol;
  if (!test) { tcol = 'NONE'; noTest++; }
  else if (passing.has(test)) tcol = 'pass';
  else tcol = 'FAIL/absent';
  console.log(`${v}  ${name.padEnd(46)} ${(inCode ? 'yes' : 'NO!').padEnd(6)} ${tcol}`);
}
console.log('─'.repeat(78));
console.log(`code present: ${ITEMS.length - codeMissing}/${ITEMS.length}   ·   items with no dedicated test: ${noTest}`);
process.exit(codeMissing ? 1 : 0);
