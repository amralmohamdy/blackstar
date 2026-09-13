// BOOT TEST — evaluates app.js + storage.js + pages.js TOGETHER (the real load order) under a
// fake DOM and runs init(), catching any runtime error that would blank the browser but which
// the function-lifting tests miss. This closes the gap that let a bad build ship.
const fs = require('fs'), path = require('path'), vm = require('vm');
const DIR = [path.join(__dirname, 'crm238', 'blackstars-localhost'), path.join(__dirname, '..')].find(p => { try { return fs.existsSync(path.join(p, 'app.js')); } catch (_) { return false; } });
const appSrc = fs.readFileSync(path.join(DIR, 'app.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(DIR, 'storage.js'), 'utf8');
const pagesSrc = fs.readFileSync(path.join(DIR, 'pages.js'), 'utf8');

function mk() {
  const e = {
    style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; }, appendChild(c) { return c; }, append() {},
    prepend() {}, insertBefore() {}, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    closest() { return mk(); }, querySelector() { return mk(); }, querySelectorAll() { return []; },
    insertAdjacentHTML() {}, focus() {}, blur() {}, click() {}, cloneNode() { return mk(); },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }, scrollIntoView() {},
    children: [], childNodes: [], firstChild: null, parentNode: null, offsetWidth: 0, offsetHeight: 0,
    set innerHTML(v) { this._h = v; }, get innerHTML() { return this._h || ''; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t || ''; },
    set value(v) { this._v = v; }, get value() { return this._v || ''; },
  };
  return e;
}
const ls = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, clear() { this._d = {}; }, key() { return null; }, length: 0 };

const ctx = {
  console: { log() {}, warn() {}, error(...a) { ctx.__errors.push(a.join(' ')); }, info() {}, debug() {} },
  JSON, Math, Date, Object, Array, Map, Set, WeakMap, WeakSet, Promise, String, Number, Boolean, Symbol,
  RegExp, Error, TypeError, isNaN, isFinite, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  TextEncoder, TextDecoder, Intl, Reflect, Proxy, __errors: [],
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  queueMicrotask: (f) => f(),
  localStorage: ls, sessionStorage: ls,
  location: { href: 'https://blackstarssports.com/', hash: '', host: 'blackstarssports.com', reload() {}, assign() {}, replace() {} },
  history: { pushState() {}, replaceState() {}, back() {} },
  alert: () => {}, confirm: () => true, prompt: () => null,
  getComputedStyle: () => ({ getPropertyValue: () => '', direction: 'ltr' }),
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} }, Blob: function () {}, FileReader: function () {},
  fetch: () => Promise.reject(new Error('no net')),
  crypto: { getRandomValues: (a) => a, randomUUID: () => 'uuid' },
  FIREBASE_CONFIG: { apiKey: '', projectId: 'p', dataPath: 'clubs/blackstars' },   // no apiKey → localStorage backend, no network
};
try { Object.defineProperty(ctx, 'navigator', { value: { userAgent: 'node', onLine: true, clipboard: { writeText: () => Promise.resolve() }, language: 'en' }, configurable: true }); } catch (_) {}
const doc = {
  _byId: {}, addEventListener() {}, removeEventListener() {},
  getElementById(id) { return this._byId[id] || null; }, querySelector() { return mk(); }, querySelectorAll() { return []; },
  createElement() { return mk(); }, createElementNS() { return mk(); }, createDocumentFragment() { return mk(); },
  createTextNode() { return mk(); }, body: mk(), head: mk(), documentElement: mk(),
  title: '', cookie: '', readyState: 'complete', activeElement: null, execCommand() {},
};
ctx.document = doc;
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
ctx.window.addEventListener = () => {}; ctx.window.removeEventListener = () => {};
// no firebase global at all → forces the localStorage backend path (offline), exercising boot without net
vm.createContext(ctx);

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗ FAIL:', n, got !== undefined ? '→ ' + String(got).slice(0, 300) : ''); } };

// 1) Evaluate all three files in the real order — this alone catches a top-level runtime crash.
let evalErr = null;
try {
  vm.runInContext(appSrc + '\n' + storeSrc + '\n' + pagesSrc, ctx, { filename: 'bundle.js' });
} catch (e) { evalErr = e; }
ok('app.js + storage.js + pages.js evaluate together with NO runtime error', !evalErr, evalErr && (evalErr.stack || evalErr.message));

// 2) The core globals the app needs must exist after eval.
// NB: APP_VERSION / PAGES are top-level `const` — lexical bindings, so they do NOT attach to the vm
// context object (ctx.X is undefined). Read them the way the app's own code does: lexically, via
// runInContext. window.Storage/init/etc. ARE assigned onto window, so ctx.X works for those.
const lex = (expr, dflt) => { try { return vm.runInContext(expr, ctx); } catch (_) { return dflt; } };
ok('APP_VERSION is defined', lex('typeof APP_VERSION') === 'string', lex('String(typeof APP_VERSION)'));
ok('window.Storage exists', !!ctx.window.Storage);
ok('PAGES registry exists and is populated', lex('typeof PAGES==="object" && Object.keys(PAGES).length > 10', false), lex('typeof PAGES==="object" && Object.keys(PAGES).length'));
ok('init() is a function', typeof ctx.init === 'function');
ok('loginScreen() is a function', typeof ctx.loginScreen === 'function');
ok('withCloudConfirm() is a function', typeof ctx.withCloudConfirm === 'function');

// 3) Run init() the way the browser does — must not throw.
let initErr = null;
if (typeof ctx.init === 'function') {
  try { const r = ctx.init(); if (r && typeof r.then === 'function') { /* async */ } }
  catch (e) { initErr = e; }
}
ok('init() runs without throwing', !initErr, initErr && (initErr.stack || initErr.message));

// 4) Every PAGES.* renderer must at least be callable without a ReferenceError at definition time.
const pageNames = lex('typeof PAGES==="object" ? Object.keys(PAGES) : []', []);
const nonFn = lex('typeof PAGES==="object" ? Object.keys(PAGES).filter(k=>typeof PAGES[k]!=="function") : ["<no PAGES>"]', ['<err>']);
ok('all page renderers are functions', pageNames.length > 0 && nonFn.length === 0, nonFn);

console.log('\nBOOT:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
