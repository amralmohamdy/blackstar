// v6.432 — (1) sidebar reordered to Main · Membership · Attendance · Activities · Finance · Shop
// · Summer Camp — then a SEPARATOR — then Engagement · Advice · Team & Sports · Insights · System.
// (2) auto-refresh idle behaviour: mouse/keyboard activity keeps the app "busy"; a remote change
// only repaints after 30s idle (and re-renders the SAME screen, so filters/scroll persist).
const H = require('./qc-harness.js');
const R = H.reporter('NAV separator + idle auto-refresh');

R.section('sidebar order + separator');
{
  const src = H.readSrc('app.js');
  R.ok('the primary set precedes the "more" set in order', /'Main','Membership','Attendance','Activities','Finance','Shop','Summer Camp','Engagement','Advice','Team & Sports','Insights','System'/.test(src));
  R.ok('MORE_SECTIONS marks the post-separator group', /const MORE_SECTIONS = new Set\(\['Engagement','Advice','Team & Sports','Insights','System'\]\)/.test(src));
  R.ok('a divider is inserted before the first "more" section', /MORE_SECTIONS\.has\(section\) && nav\.childNodes\.length[\s\S]{0,120}nav-divider/.test(src));
  R.ok('the divider is placed only once', /let _dividerPlaced = false/.test(src) && /_dividerPlaced = true/.test(src));
}

R.section('idle auto-refresh: 30s threshold + mouse/keyboard activity');
{
  const src = H.readSrc('app.js');
  R.ok('the busy window is 30 seconds', /const ACTIVE_MS = 30000/.test(src));
  R.ok('mouse movement now counts as activity', /'pointermove', 'mousemove'/.test(src));
  R.ok('a remote change defers the repaint while busy', /if \(isBusyEditing\(\)\) \{[\s\S]{0,200}_remoteRenderPending = true/.test(src));
  R.ok('the pending repaint only fires when NOT busy (idle)', /_remoteRenderPending && !isBusyEditing\(\)/.test(src));
  R.ok('it re-renders the same screen (filters/scroll preserved), not a reset', /_renderKeepScroll/.test(src));
}

R.done();
