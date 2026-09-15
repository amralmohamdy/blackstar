// v6.466 — the Expenses screen gained a multi-select COACH filter that appears ONLY when the
// "Salary" category is selected, so the owner can narrow salary expenses to one or more coaches.
// A salary row's coach comes from its stored coachName/coachId (with a description-substring
// fallback for free-typed rows); the '—' no-coach placeholder is never offered as a coach.
// Behaviour verified end-to-end in a browser; this locks the wiring + the match logic.
const H = require('./qc-harness.js');
const R = H.reporter('EXPENSES · salary coach filter');
const run = (c, s) => H.vm.runInContext(s, c);

R.section('source wiring');
{
  const src = H.readSrc();
  R.ok('filter carries a coaches[] array', /coaches: \[\]/.test(src) && /if \(!Array\.isArray\(filter\.coaches\)\) filter\.coaches = \[\]/.test(src));
  R.ok('coach options derive from salary expenses', /_salaryExpenses = state\.expenses\.filter\(e => !e\.deleted && isSalaryCategory\(e\.category\)/.test(src));
  R.ok('the picker only shows when Salary is selected', /_salarySelected = \(\) => \(filter\.categories \|\| \[\]\)\.some\(c => isSalaryCategory\(c\)\)/.test(src));
  R.ok('the coach filter applies only to salary rows', /filter\.coaches && filter\.coaches\.length && isSalaryCategory\(e\.category\) && !_rowCoachMatch\(e\)/.test(src));
  R.ok('the picker is rendered (exp-coach-wrap + checkboxes)', /id="exp-coach-wrap"/.test(src) && /class="exp-coach-cb"/.test(src));
  R.ok('the coach picker is wired as a multi-select', /wireExpMulti\('coaches', 'exp-coach-cb'/.test(src));
  R.ok('deselecting Salary clears + hides the coach picker', /_syncExpCoachPicker[\s\S]{0,220}filter\.coaches = \[\]/.test(src));
  R.ok('the "—" no-coach placeholder is excluded from options', /n === '—' \|\| n === '-'/.test(src));
  R.ok('Clear filters resets coaches too', /filter = \{ search: '', months: \[\], categories: \[\], methods: \[\], coaches: \[\] \}/.test(src));
}

R.section('the salary-row → coach match logic (replicated)');
{
  const coachName = (id) => ({ 1: 'Jennifer', 2: 'Aziz', 3: 'Leina' }[id] || '—');
  const salCoachName = (e) => { let n = (e.coachName || '').trim(); if (!n && e.coachId != null) n = (coachName(e.coachId) || '').trim(); return (n === '—' || n === '-') ? '' : n; };
  const rowCoachMatch = (e, coaches) => {
    if (!coaches.length) return true;
    const nm = salCoachName(e);
    if (nm && coaches.includes(nm)) return true;
    const d = String(e.description || '').toLowerCase();
    return coaches.some(sn => d.includes(String(sn).toLowerCase()));
  };
  const rows = [
    { category: 'Salary', coachName: 'Jennifer', coachId: 1, description: 'Coach salary — Jennifer' },
    { category: 'Salary', coachName: 'Aziz', coachId: 2, description: 'Coach salary — Aziz' },
    { category: 'Salary', description: '310 Coach Madi April Salary' },   // free-typed, no stored coach
    { category: 'Salary', description: '6500 Reception Salary' },          // no coach at all
  ];
  R.ok('stored-coach row matches by name', rowCoachMatch(rows[0], ['Jennifer']) && !rowCoachMatch(rows[1], ['Jennifer']));
  R.ok('two selected coaches union', rows.filter(r => rowCoachMatch(r, ['Jennifer', 'Aziz'])).length === 2);
  R.ok('free-typed name matched via description fallback', rowCoachMatch(rows[2], ['Madi']));
  R.ok('a non-coach salary row (Reception) matches nobody', !rowCoachMatch(rows[3], ['Jennifer', 'Aziz', 'Madi']));
  R.ok('empty selection passes everything', rows.every(r => rowCoachMatch(r, [])));
  R.ok('the "—" placeholder never becomes a coach name', salCoachName({ description: 'x' }) === '' && salCoachName({ coachId: 99 }) === '');
}

R.section('the Expenses screen still renders (admin)');
{
  const ctx = H.seed(H.makeCtx({ role: 'admin' }));
  const r = H.renderScreen(ctx, 'expenses');
  R.ok('renders without error', r.ok, r.error);
}

R.done();
