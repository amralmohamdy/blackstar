// ═══════════════════════════════════════════════════════════════════════════
// STORAGE ABSTRACTION — bridges the app to either localStorage or Firebase.
// ═══════════════════════════════════════════════════════════════════════════
//
//   await Storage.load()              → returns the saved state object, or null
//   Storage.save(state)               → fire-and-forget save; throttled if cloud
//   Storage.onRemoteUpdate(callback)  → fires when another user updates data
//
// Two backends:
//   1. localStorage (default, offline-only) — used if firebase-config.js has
//      no apiKey, or if Firebase fails to initialize.
//   2. Firebase Firestore — MULTI-DOCUMENT model (one document per record). Used
//      if firebase-config.js has valid keys.
//
// ─── MULTI-DOCUMENT FIRESTORE MODEL (multi-user build) ──────────────────────
// Each record is its OWN document under a subcollection of the club:
//
//     clubs/blackstars                 ← parent "meta" doc: settings, schema,
//                                         campSchedule, recentSearches
//     clubs/blackstars/members/{id}    ← one document per member (attendance is
//                                         here, deep-merged field-by-field)
//     clubs/blackstars/invoices/{id}   ← one document per invoice
//     …one subcollection per collection (see COLLECTIONS).
//
// Why: (1) N users can write at the same time — different records = different
// documents, no clobbering; (2) field-level merge:true deep-merges nested maps,
// so two coaches marking the same member's attendance both keep their marks;
// (3) save() writes only the records that changed; (4) no 1 MiB document limit.
//
// The hardened data-loss guard and the "server is the source of truth" reads
// from the single-document build are PRESERVED below.
// ═══════════════════════════════════════════════════════════════════════════

(function() {
  // Versioned local key — a new deployment uses a NEW key so stale data from an
  // older version is never read as authoritative. The local copy is a non-
  // authoritative emergency cache only; the cloud is the single source of truth.
  const LS_KEY = 'blackstars-crm-v2';
  const LS_LEGACY_KEYS = ['blackstars-crm-v1'];
  const SAVE_THROTTLE_MS = 1500;   // per-record writes are cheap → snappier multi-user sync

  // ─── UNSAVED-WRITE JOURNAL (v6.389) ──────────────────────────────────────────
  // THE data-loss bug staff hit: in cloud mode the ONLY durable local copy was written by
  // _refreshLocalFromCloud(), and that runs solely after a SUCCESSFUL SERVER READ. So when a
  // write FAILED (lapsed session, dropped link) the change existed only in the page's memory —
  // and the red bar told the user to RELOAD, which threw that memory away. A just-registered
  // member disappeared for good. The IndexedDB exit-snapshot was the only net, and IndexedDB is
  // ASYNC: on a hard close the page can die before the transaction commits.
  //
  // This journal is the fix. localStorage.setItem is SYNCHRONOUS — it is already on disk the
  // instant the call returns, so it survives a hard close, a crash, or a reload. We write the
  // full pending state here on every write failure and clear it the moment a write confirms.
  // On boot the app replays it (see Storage.getPending / app.js recovery).
  const PENDING_KEY = 'blackstars-crm-pending-v1';
  function writePendingJournal(state, reason) {
    try {
      if (!state) return false;
      const persistable = { ...state };
      for (const k of DEVICE_ONLY) delete persistable[k];
      localStorage.setItem(PENDING_KEY, JSON.stringify({
        at: new Date().toISOString(), reason: reason || 'write-failed', state: persistable,
      }));
      return true;
    } catch (e) {
      // Quota is the only realistic failure; surface it because it means the safety net is off.
      console.error('[Storage] ⚠ could not journal the unsaved change locally:', e);
      return false;
    }
  }
  function clearPendingJournal() { try { localStorage.removeItem(PENDING_KEY); } catch (_) {} }
  function readPendingJournal() {
    try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : null; }
    catch (_) { return null; }
  }

  // Per-record collections (each becomes a subcollection). Anything else in the
  // saved state (settings, campSchedule, recentSearches, schema/version meta) is
  // stored on the parent "meta" document.
  const COLLECTIONS = [
    'members', 'coaches', 'invoices', 'expenses', 'salaries', 'sales', 'advices',
    'trials', 'rentals', 'rentalCustomers', 'schedule', 'swimGroups', 'auditLog',
    'membershipTransfers', 'cashCounts', 'families', 'notes', 'products', 'drivers',
    'posts',
  ];
  const isCollectionKey = k => COLLECTIONS.indexOf(k) !== -1;
  // LAZY collections (v6.453): the audit log is by far the biggest collection (append-only, grows
  // forever — ~70% of the whole payload) yet is only needed on the admin Audit/Trash screens and
  // the "last updated by" lookups. Keeping it OUT of the hot path — the initial blocking load AND the
  // live per-document snapshot listener — removes that download and a heavy real-time query, so every
  // login and sync is far lighter. New audit rows are STILL written (create-only) by _flushWrite; the
  // full log is fetched on demand via loadAuditLog(). HOT_COLLECTIONS = everything loaded/listened live.
  const LAZY_COLLECTIONS = new Set(['auditLog']);
  const HOT_COLLECTIONS = COLLECTIONS.filter(c => !LAZY_COLLECTIONS.has(c));
  // Collections a MEMBER (portal login on a member domain) is allowed to READ.
  // Everything else — invoices/revenue, expenses, salaries, cash counts, product
  // sales, coach pay, families, transfers, notes, audit, … — is NEVER fetched to a
  // member's browser and is denied server-side by the Firestore rules. (members is
  // included because the portal must find the signed-in member's OWN record; per-
  // record isolation of the roster needs auth custom claims — a later step.)
  const MEMBER_READABLE = new Set(['members', 'schedule', 'advices', 'posts', 'swimGroups']);
  // A MEMBER portal login is created as `<mobile>@blackstars.com` — the local part is
  // ALL DIGITS. STAFF (admin / receptionist) are commonly created on the SAME domain
  // with a NAMED local part (receptionist@…, test@…, admin@…), so we must NOT scope
  // them as members or they'd load none of the club's data (0 invoices, etc.). Only a
  // digit-only local part on a member domain is treated as a member/portal login.
  const _isMemberEmail = em => typeof em === 'string' && /^[0-9]+@(blackstars[.]com|members[.]blackstars[.]qa)$/i.test(em);
  const DEVICE_ONLY = ['user', 'route', 'session'];
  const MAX_BATCH_OPS = 400;   // Firestore hard limit is 500 ops/batch.

  // Refresh the local emergency cache from CONFIRMED cloud data (only after a
  // successful SERVER read). Superseded legacy keys are dropped.
  function _refreshLocalFromCloud(data) {
    if (!data) return;
    try {
      const persistable = { ...data };
      for (const k of DEVICE_ONLY) delete persistable[k];
      localStorage.setItem(LS_KEY, JSON.stringify(persistable));
      for (const k of LS_LEGACY_KEYS) { try { localStorage.removeItem(k); } catch (_) {} }
    } catch (e) { console.warn('[Storage] local cache refresh failed (non-fatal):', e); }
  }

  let activeBackend = null;
  let remoteUpdateCallback = null;
  let saveTimer = null;
  let pendingState = null;
  let lastUser = null;

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const _stable = v => { try { return JSON.stringify(v); } catch (_) { return String(v); } };
  let _idSeq = 0;
  function genId(prefix) {
    _idSeq = (_idSeq + 1) % 100000;
    return (prefix || 'rec') + '_' + Date.now().toString(36) + '_' + _idSeq.toString(36);
  }
  function indexById(arr, prefix) {
    const m = new Map();
    for (const r of (Array.isArray(arr) ? arr : [])) {
      if (!r || typeof r !== 'object') continue;
      if (r.id == null || r.id === '') r.id = genId(prefix);
      m.set(String(r.id), r);
    }
    return m;
  }
  function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
  // True field-level update: only the top-level fields that changed. Fields the
  // writer didn't touch are omitted, so merge:true can never clobber a concurrent
  // edit to a DIFFERENT field. Nested maps (e.g. member.dailyAttendance) are sent
  // whole but Firestore deep-merges them, preserving sibling keys other users set.
  function fieldDelta(prev, cur) {
    const FieldValue = window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue;
    const delta = {};
    for (const k of Object.keys(cur)) { if (_stable(prev[k]) !== _stable(cur[k])) delta[k] = cur[k]; }
    for (const k of Object.keys(prev)) { if (!(k in cur)) delta[k] = FieldValue ? FieldValue.delete() : null; }
    if (cur.id != null) delta.id = cur.id;
    return delta;
  }
  // A PLAIN nested map (e.g. member.dailyAttendance) — an object we own key-by-key.
  // Deliberately EXCLUDES arrays, null, Dates, and Firestore sentinels (FieldValue.delete(),
  // Timestamp, …) whose prototype is not Object.prototype, so those never get treated as a
  // mergeable map. Used to route concurrent map edits through the same transaction merge as
  // lists, so a second device's freshly-added keys are never dropped by merge:true. (v6.320)
  function _isPlainMap(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    const p = Object.getPrototypeOf(v);
    return p === Object.prototype || p === null;
  }
  // Diff two META objects (the shared parent doc's settings/config). Returns ONLY changed
  // keys AND — critically — FieldValue.delete() for keys REMOVED (deep, e.g. a deleted
  // settings.userRoles entry / category / sport). Firestore merge:true never deletes map
  // keys, so without this a removed user mapping silently REAPPEARS on the next reload.
  // Also means the parent doc only writes the changed leaves (better multi-admin concurrency
  // on settings). (v6.330)
  function _deepMetaDelta(prev, cur, FieldValue) {
    prev = _isPlainMap(prev) ? prev : {};
    const out = {};
    for (const k of Object.keys(cur)) {
      if (_isPlainMap(cur[k]) && _isPlainMap(prev[k])) {
        const sub = _deepMetaDelta(prev[k], cur[k], FieldValue);
        if (Object.keys(sub).length) out[k] = sub;          // include only if it actually changed
      } else if (_stable(prev[k]) !== _stable(cur[k])) {
        out[k] = cur[k];
      }
    }
    for (const k of Object.keys(prev)) {
      if (!(k in cur)) out[k] = FieldValue ? FieldValue.delete() : null;   // removed → delete in the cloud
    }
    return out;
  }

  // ─── Data-loss guard (hardened — preserved from the single-doc build) ───────
  // In multi-document mode a "wipe" save would issue deletes for every record, so
  // the same protection applies. cloudReadFailed blocks ALL cloud writes until a
  // real SERVER read succeeds.
  let lastKnownGood = 0, lkgMembers = 0, lkgInvoices = 0;
  let loadErrored = false, cloudReadFailed = false;
  const _counts = s => ({ m: (s && s.members && s.members.length) || 0, i: (s && s.invoices && s.invoices.length) || 0 });
  function _blockReason(state) {
    const force = (typeof window !== 'undefined' && window.__allowEmptySave);
    const c = _counts(state);
    if (force) return null;
    if (cloudReadFailed) return 'cloud not confirmed (working from offline copy)';
    if (c.m + c.i === 0 && (lastKnownGood > 0 || loadErrored)) return 'whole dataset is empty';
    if (lkgInvoices > 5 && c.i === 0) return `invoices went to 0 (had ${lkgInvoices})`;
    if (lkgMembers > 5 && c.m === 0) return `members went to 0 (had ${lkgMembers})`;
    if (lkgInvoices > 20 && c.i < lkgInvoices * 0.1) return `invoices dropped ${lkgInvoices}→${c.i}`;
    if (lkgMembers > 20 && c.m < lkgMembers * 0.1) return `members dropped ${lkgMembers}→${c.m}`;
    return null;
  }
  function blockEmptyWrite(state) {
    const force = (typeof window !== 'undefined' && window.__allowEmptySave);
    const reason = _blockReason(state);
    if (reason) {
      console.error(`[Storage] BLOCKED save — refusing to overwrite good data: ${reason}. (Use "Clear all data" / Restore if intentional.)`);
      try { if (typeof window !== 'undefined' && typeof window.__onCloudWriteBlocked === 'function') window.__onCloudWriteBlocked(lastKnownGood, reason); } catch (_) {}
      return true;
    }
    const c = _counts(state);
    if (force && c.m + c.i === 0) { lkgMembers = 0; lkgInvoices = 0; lastKnownGood = 0; }
    if (c.m > 0) lkgMembers = c.m;
    if (c.i > 0) lkgInvoices = c.i;
    if (c.m + c.i > 0) lastKnownGood = c.m + c.i;
    return false;
  }
  function noteServerLoaded(data) {
    const c = _counts(data);
    if (c.m > 0) lkgMembers = c.m;
    if (c.i > 0) lkgInvoices = c.i;
    if (c.m + c.i > 0) lastKnownGood = c.m + c.i;
    cloudReadFailed = false;
    // Expose a confirmation flag so the UI can show "loaded from the server at HH:MM".
    try {
      if (typeof window !== 'undefined') {
        let docs = 0; for (const k of COLLECTIONS) if (Array.isArray(data && data[k])) docs += data[k].length;
        window.__lastCloudRead = { at: Date.now(), source: 'server', members: c.m, invoices: c.i, documents: docs + 1 /* + parent meta */ };
        if (typeof window.__onCloudReadOK === 'function') window.__onCloudReadOK(window.__lastCloudRead);
      }
    } catch (_) {}
  }

  // ─── localStorage backend (unchanged emergency cache) ───────────────────────
  const localBackend = {
    name: 'local',
    async load() {
      try {
        let raw = localStorage.getItem(LS_KEY);
        if (!raw) { for (const k of LS_LEGACY_KEYS) { const lr = localStorage.getItem(k); if (lr) { raw = lr; break; } } }
        return raw ? JSON.parse(raw) : null;
      } catch (e) { console.warn('[Storage:local] load failed:', e); return null; }
    },
    save(state) {
      if (blockEmptyWrite(state)) return;
      try {
        const persistable = { ...state };
        for (const k of DEVICE_ONLY) delete persistable[k];
        localStorage.setItem(LS_KEY, JSON.stringify(persistable));
      } catch (e) {
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ''));
        if (isQuota) { console.error('[Storage:local] save failed — quota exceeded:', e); throw e; }
        console.warn('[Storage:local] save failed:', e);
      }
    },
    onRemoteUpdate() {},
    async getLock() { return null; },
    async setLock() { return true; },
    async clearLock() {},
    onLockChange() {},
    async signIn(email, password) {
      if ((email === 'admin' || email === 'admin@blackstars.qa') && password === 'admin123') { lastUser = { email, uid: 'local-admin', isAdmin: true }; return lastUser; }
      throw new Error('Invalid credentials');
    },
    async signOut() { lastUser = null; },
    currentUser() { return lastUser; },
    isCloud: false,
    needsMigration() { return false; },
    async migrateToMultiDoc() { return { migrated: false, reason: 'offline mode (localStorage)' }; },
    async verifyDoc() { return true; },   // local mode: data is durable locally
    async fetchDoc() { return null; },    // local mode: there is no server to read back from
    async fetchMeta() { return null; },
    cloudWriteBlocked() { return false; },
  };

  // ─── Firebase backend (MULTI-DOCUMENT) ──────────────────────────────────────
  function buildFirebaseBackend() {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.apiKey) return null;
    if (!window.firebase || !window.firebase.initializeApp) {
      console.warn('[Storage:firebase] Firebase SDK not loaded — falling back to localStorage');
      return null;
    }

    let app, db, auth;
    try {
      app = window.firebase.initializeApp({
        apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId,
        storageBucket: cfg.storageBucket, messagingSenderId: cfg.messagingSenderId, appId: cfg.appId,
      });
      db = window.firebase.firestore();
      // CRITICAL: Firestore REJECTS any write containing an `undefined` field value
      // ("invalid-argument" — e.g. a salary paid record with settledPending: undefined),
      // which silently killed whole saves. Ignore undefined props so a stray undefined
      // field is simply omitted instead of failing the entire write. Must run before any
      // other Firestore call.
      const _fsSettings = { ignoreUndefinedProperties: true };
      // TRANSPORT RESILIENCE (v6.346). Firestore's default transport is a streaming WebChannel
      // (firestore.googleapis.com/.../channel). Firefox Enhanced Tracking Protection, ad/privacy
      // blockers, some VPNs and corporate proxies ABORT that channel — the network tab shows the
      // channel requests failing with NS_BINDING_ABORTED, and the app then can't read → "Cannot
      // reach the cloud" even though the internet is fine. Auto-detecting long-polling makes
      // Firestore fall back to plain HTTP requests, which survive those environments. Auto-detect
      // (not force) means users whose streaming channel works are unaffected. Emulator excluded.
      if (!cfg.useEmulator) _fsSettings.experimentalAutoDetectLongPolling = true;
      try { db.settings(_fsSettings); } catch (e) { console.warn('[Storage:firebase] settings() failed:', e); }
      auth = window.firebase.auth();
      // SESSION DURABILITY (v6.389): pin auth persistence to LOCAL explicitly. The compat SDK
      // already defaults to LOCAL, but leaving it implicit means any future config/SDK change
      // could silently drop the session to in-memory — which logs the user out on every reload
      // and was a candidate cause of the "session expired" red bar staff hit daily.
      try {
        if (window.firebase.auth.Auth && window.firebase.auth.Auth.Persistence) {
          auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
            .catch(e => console.warn('[Storage:firebase] setPersistence failed (non-fatal):', e));
        }
      } catch (e) { console.warn('[Storage:firebase] setPersistence unavailable:', e); }
      // ── LOCAL EMULATOR support (test the cloud path before deployment). Only when
      // firebase-config.js sets useEmulator:true; production is untouched. ──
      if (cfg.useEmulator) {
        const host = cfg.emulatorHost || '127.0.0.1';
        try {
          db.useEmulator(host, cfg.firestoreEmulatorPort || 8080);
          auth.useEmulator('http://' + host + ':' + (cfg.authEmulatorPort || 9099), { disableWarnings: true });
          console.log(`[Storage:firebase] 🔧 Using LOCAL emulators — Firestore ${host}:${cfg.firestoreEmulatorPort || 8080}, Auth ${host}:${cfg.authEmulatorPort || 9099}`);
        } catch (e) { console.warn('[Storage:firebase] useEmulator failed:', e); }
      } else {
        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
          if (err.code === 'failed-precondition') console.warn('[Storage:firebase] Persistence not available (multiple tabs)');
          else if (err.code === 'unimplemented') console.warn('[Storage:firebase] Persistence not supported by this browser');
        });
      }
    } catch (e) { console.error('[Storage:firebase] Init failed:', e); return null; }

    const PARENT = cfg.dataPath || 'clubs/blackstars';
    const parentRef = () => db.doc(PARENT);
    const colRef = name => db.collection(PARENT + '/' + name);

    // Audit ids the SERVER is known to hold. The rules make auditLog immutable (create-only),
    // so re-sending one as a merge-set is an UPDATE and Firestore denies it — which, because a
    // batch is atomic, failed the entire write. Anything that arrives from the server is recorded
    // here so it can never be written again. (v6.393)
    const _auditKnown = new Set();
    const noteAuditFromServer = arr => {
      try { for (const r of (arr || [])) if (r && r.id != null) _auditKnown.add(String(r.id)); } catch (_) {}
    };
    const _base = {};                  // collection → Map<id, jsonString> (last server truth)
    for (const name of COLLECTIONS) _base[name] = new Map();
    let _baseMeta = '';
    const _live = {};                  // collection → Map<id, record> (for realtime delivery)
    for (const name of COLLECTIONS) _live[name] = new Map();
    let _liveMeta = {};
    const _seeded = {}; let _metaSeeded = false;
    const _unsubs = [];
    let writeInFlight = false, pendingAfterWrite = null, lastWriteFailed = false, needsMigrationFlag = false;
    let _confirmWaiters = [], _lastFlushResult = { ok: true };   // write-through confirmation
    function _resolveConfirmWaiters(res) { const w = _confirmWaiters; _confirmWaiters = []; for (const r of w) { try { r(res); } catch (_) {} } }
    // ── AUTO-RETRY ENGINE ──────────────────────────────────────────────────────
    // A cloud write that fails must never sit lost until the user happens to make
    // another change. On failure we re-flush the LATEST state automatically with
    // backoff (base is NOT advanced on failure, so the same delta is re-sent), and
    // keep retrying until it lands. `retryNow()` lets the UI force an immediate try.
    let _retryTimer = null, _retryAttempt = 0, _lastState = null, _lastErrorCode = null;
    const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000];   // ms; last value repeats
    function _clearRetry() { if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; } _retryAttempt = 0; }
    // A 'permission-denied' / 'unauthenticated' WRITE is almost always a LAPSED ID token — the
    // tab stayed open past the token's lifetime and the SDK had no pending call to refresh it on.
    // Re-sending the same delta with the same stale token fails forever, so before any retry of
    // an auth-coded failure we FORCE a token refresh. If it succeeds the next write normally
    // lands; if it fails (or there's nothing to refresh) we behave exactly as before. (v6.354)
    function _isAuthCode(code) { return code === 'permission-denied' || code === 'unauthenticated'; }
    async function _refreshAuthToken() {
      try {
        const u = (typeof window !== 'undefined' && window.firebase && window.firebase.auth) ? window.firebase.auth().currentUser : null;
        if (u && typeof u.getIdToken === 'function') { await u.getIdToken(true); _tokenExpAt = 0; await _noteTokenExpiry(u); return true; }
      } catch (_) {}
      return false;
    }

    // ─── PRE-EMPTIVE TOKEN FRESHNESS (v6.389) ─────────────────────────────────
    // Staff were hitting "your sign-in session expired" daily. The old design was REACTIVE: let
    // the write fail on a stale token, then refresh and retry — which flashes the red bar and,
    // before the journal existed, risked the change. Now we refresh BEFORE writing whenever the
    // token is close to expiry, so in normal use the token is never stale and the bar never
    // appears at all. Firebase ID tokens live ~1h; we renew with 10 min to spare.
    let _tokenExpAt = 0;                       // epoch ms when the current ID token expires
    const TOKEN_SKEW_MS = 10 * 60 * 1000;      // renew this long before expiry
    async function _noteTokenExpiry(u) {
      try {
        if (u && typeof u.getIdTokenResult === 'function') {
          const r = await u.getIdTokenResult();
          if (r && r.expirationTime) _tokenExpAt = new Date(r.expirationTime).getTime() || 0;
        }
      } catch (_) {}
    }
    // Returns true when the session looks usable. Never throws — a failure here must not block
    // the write; the write's own error path (+ journal) still protects the data.
    async function _ensureFreshToken() {
      try {
        const fb = (typeof window !== 'undefined' && window.firebase && window.firebase.auth) ? window.firebase.auth() : null;
        const u = fb && fb.currentUser;
        if (!u) return false;                                   // genuinely signed out
        if (!_tokenExpAt) { await _noteTokenExpiry(u); }
        if (_tokenExpAt && Date.now() > _tokenExpAt - TOKEN_SKEW_MS) {
          await u.getIdToken(true);                             // renew ahead of expiry
          _tokenExpAt = 0; await _noteTokenExpiry(u);
        }
        return true;
      } catch (_) { return true; }   // unknown → let the write proceed and use its normal error path
    }
    function _scheduleRetry() {
      if (_retryTimer || !_lastState) return;                  // already scheduled / nothing to send
      // An auth-coded failure (lapsed ID token) is cured by a token refresh, NOT by waiting — so the
      // FIRST retry fires fast (just long enough to re-mint the token) instead of the 2s backoff. This
      // shrinks the red "not saved" bar to a blink and lands the write before a reload can lose it. (v6.374)
      const authFast = _isAuthCode(_lastErrorCode) && _retryAttempt === 0;
      const delay = authFast ? 350 : RETRY_DELAYS[Math.min(_retryAttempt, RETRY_DELAYS.length - 1)];
      _retryAttempt++;
      console.warn(`[Storage] ↻ auto-retry #${_retryAttempt} in ${Math.round(delay / 1000)}s`);
      _retryTimer = setTimeout(async () => {
        _retryTimer = null;
        if (writeInFlight) return;                             // a fresh write is running; its result drives status
        if (_isAuthCode(_lastErrorCode)) await _refreshAuthToken();   // re-mint a stale token before re-sending
        if (_lastState) _flushWrite(_lastState);
      }, delay);
    }

    function pickMeta(state) {
      const meta = {};
      // `_updatedAt` is a storage-managed touch field, NOT app state — exclude it so the
      // shared parent doc's change-detection ignores it (see _flushWrite). Otherwise the
      // parent would be re-written on every save (write hotspot for many concurrent users).
      for (const k of Object.keys(state || {})) { if (isCollectionKey(k) || k === '_updatedAt' || DEVICE_ONLY.indexOf(k) !== -1) continue; meta[k] = state[k]; }
      return meta;
    }
    function setBaseFromState(state) {
      for (const name of COLLECTIONS) {
        const m = new Map();
        const idx = indexById(state[name], name.slice(0, 3));
        for (const [id, rec] of idx) m.set(id, _stable(rec));
        _base[name] = m;
      }
      _baseMeta = _stable(pickMeta(state));
    }

    function _flushWrite(state) {
      writeInFlight = true;
      _lastState = state;   // remember the newest state so auto-retry re-sends the same delta
      const ops = [];
      // ── SENT SNAPSHOT (v6.368) — THE fix for same-day data loss ──────────────────────────
      // The base MUST be advanced from exactly what we SENT, never from the live `state` object.
      // app.js save() only shallow-copies, so `state` keeps mutating while the write is in flight
      // (the user carries on marking attendance / taking payments during the 1-2s round-trip).
      // Advancing the base from that live object on ack silently ABSORBS those in-flight edits:
      // the next delta compares live-vs-poisoned-base, sees "no change", never writes them, and
      // hasUnsavedCloud() stays false — so the work is lost on the next reload with no warning.
      // Freezing each record's serialization HERE makes the base immune to later mutation.
      const sentBase = {};
      for (const name of COLLECTIONS) {
        const baseMap = _base[name] || new Map();
        const curIdx = indexById(state[name], name.slice(0, 3));
        const snap = new Map();
        sentBase[name] = snap;
        for (const [id, rec] of curIdx) {
          const now = _stable(rec);
          snap.set(id, now);   // frozen string — what this write actually carries
          const prevStr = baseMap.get(id);
          if (prevStr === now) continue;
          // ── AUDIT LOG IS APPEND-ONLY (v6.393) ────────────────────────────────────────
          // THE cause of the frequent "permission-denied / session expired" popup on ADD.
          // The security rules make auditLog immutable: `allow create` but `allow update: if
          // false`. Every op here is written as set(…, {merge:true}), and a merge-set on a
          // document that ALREADY EXISTS is an UPDATE in rules terms. A colleague's audit row
          // arrives on this device through the snapshot listener, lands in `state` but not in
          // our `_base`, and the very next save re-sends it — as an update — which Firestore
          // denies. Batches are ATOMIC, so that one denied row killed the WHOLE write and took
          // the new member/invoice with it. It looked like an expired session; the session was
          // fine. An audit entry is never edited, so: only ever CREATE one we have not already
          // sent, and never re-send one the server is known to hold.
          if (name === 'auditLog') {
            if (prevStr !== undefined || _auditKnown.has(id)) continue;   // already on the server → never update
            ops.push({ kind: 'set', name, id, data: rec, _audit: true });
            continue;
          }
          if (prevStr === undefined) { ops.push({ kind: 'set', name, id, data: rec }); continue; }
          const prev = JSON.parse(prevStr);
          const delta = fieldDelta(prev, rec);
          // If the delta touches a LIST field, Firestore's merge would REPLACE the
          // list and could drop a concurrent add. Route those records through a
          // transaction that element-merges the list against the live cloud value.
          const arrayFields = Object.keys(delta).filter(k => Array.isArray(delta[k]));
          // SAME hazard for a nested MAP field (member.dailyAttendance): two devices marking
          // the same day each write their whole view of the map and merge:true lets the last
          // writer win, silently dropping the other device's freshly-added cells. Route those
          // records through the SAME transaction so the map is deep-merged against live cloud
          // and no device's keys are lost. (v6.320 — fixes concurrent attendance loss.)
          const mapFields = Object.keys(delta).filter(k => k !== 'id' && _isPlainMap(delta[k]));
          const canMergeArr = typeof window !== 'undefined' && typeof window._mergeArrayById === 'function';
          const canMergeMap = typeof window !== 'undefined' && typeof window._mergeRecord === 'function';
          const useArr = arrayFields.length && canMergeArr;
          const useMap = mapFields.length && canMergeMap;
          if (useArr || useMap) ops.push({ kind: 'txnset', name, id, data: delta, base: prev, cur: rec, arrayFields: useArr ? arrayFields : [], mapFields: useMap ? mapFields : [] });
          else ops.push({ kind: 'set', name, id, data: delta });
        }
        // DELETE-op SAFETY (v6.324 architecture review): a record vanishing from local
        // state becomes a cloud DELETE, and the old catastrophic guard covered ONLY
        // members/invoices. Generalize to EVERY collection: (a) if this collection is
        // absent from `state` (undefined — "not loaded", e.g. a partial/derived state was
        // passed) NEVER emit deletes; (b) if a large share of a sizeable collection
        // disappeared at once, treat it as a partial/corrupt state and SKIP the deletes
        // (loudly), unless an explicit clear/restore set __allowEmptySave. Genuine small
        // deletes still propagate. This makes "disappearance ≠ silent mass wipe".
        var _stateHas = state && (name in state) && state[name] != null;
        var _allowWipe = (typeof window !== 'undefined' && window.__allowEmptySave);
        if (_stateHas || _allowWipe) {
          var delIds = []; baseMap.forEach(function (_v, id) { if (!curIdx.has(id)) delIds.push(id); });
          var baseN = baseMap.size, massDrop = baseN >= 8 && curIdx.size < baseN * 0.5;
          if (delIds.length && massDrop && !_allowWipe) {
            console.error('[Storage] ⛔ BLOCKED ' + delIds.length + ' deletes in "' + name + '" (' + baseN + '→' + curIdx.size + ') — looks like a partial/corrupt state, not a real bulk delete. Skipped to protect data.');
            try { if (typeof window !== 'undefined' && typeof window.__onCloudWriteBlocked === 'function') window.__onCloudWriteBlocked(baseN, 'suspicious bulk delete in ' + name + ' (' + baseN + '→' + curIdx.size + ') — skipped'); } catch (_) {}
          } else { for (var di = 0; di < delIds.length; di++) ops.push({ kind: 'del', name, id: delIds[di] }); }
        }
      }
      // Compare meta WITHOUT the always-changing _updatedAt so the shared parent doc
      // (clubs/blackstars) is written ONLY when a real settings/version/meta field
      // changes — not on every attendance mark or payment. Writing that one shared doc
      // on every save would, with many simultaneous users, exceed Firestore's ~1
      // write/sec/document soft limit → contention, latency and failed writes.
      const meta = pickMeta(state);
      const metaStr = _stable(meta); const metaChanged = metaStr !== _baseMeta;
      // Write only the CHANGED meta leaves, and FieldValue.delete() for any REMOVED key, so a
      // deleted settings entry (e.g. a user-role mapping) actually disappears from Firestore
      // instead of being re-merged back. (v6.330)
      let metaWrite = meta;
      if (metaChanged) {
        const _FV = (typeof window !== 'undefined' && window.firebase && window.firebase.firestore) ? window.firebase.firestore.FieldValue : null;
        let _baseMetaObj = {}; try { _baseMetaObj = JSON.parse(_baseMeta || '{}'); } catch (_) { _baseMetaObj = {}; }
        metaWrite = _deepMetaDelta(_baseMetaObj, meta, _FV);
        metaWrite._updatedAt = Date.now();   // stamp only on a real change
      }

      if (ops.length === 0 && !metaChanged) {
        writeInFlight = false;
        if (pendingAfterWrite) { const n = pendingAfterWrite; pendingAfterWrite = null; _flushWrite(n); }
        else _resolveConfirmWaiters({ ok: true, noop: true });   // nothing to write → already persisted
        return;
      }
      // DOC-SIZE SAFETY NET: Firestore hard-rejects any document ≥ 1 MiB, which turns a
      // runaway field into "every write to this record fails" (what the duplicate bloat
      // did). Warn LOUDLY the moment a record approaches the limit, naming it, so it's
      // caught and cleaned long before it starts failing. Non-destructive (never blocks
      // the write). Uses the full record when we have it (new set / txnset), else the delta.
      try {
        const SIZE_WARN = 900 * 1024;   // ~88% of the 1 MiB limit
        for (const op of ops) {
          if (op.kind === 'del') continue;
          const full = op.cur || op.data;   // op.cur = full record (txnset); op.data = full (new) or delta
          const sz = _stable(full).length;
          if (sz >= SIZE_WARN) {
            console.error(`[Storage] ⚠ LARGE DOCUMENT ${op.name}/${op.id} ≈ ${(sz / 1024).toFixed(0)} KB — approaching Firestore's 1024 KB per-document limit; writes will start failing if it grows further.`);
            if (typeof window !== 'undefined' && typeof window.__onOversizeRecord === 'function') { try { window.__onOversizeRecord({ collection: op.name, id: op.id, bytes: sz }); } catch (_) {} }
          }
        }
      } catch (_) {}
      const batchOps = ops.filter(o => o.kind !== 'txnset');   // field-level sets + deletes
      const txnOps = ops.filter(o => o.kind === 'txnset');     // list-changing records → transactions
      const batches = chunk(batchOps, MAX_BATCH_OPS); if (batches.length === 0) batches.push([]);
      // ── SAVE VISIBILITY: summarise EXACTLY what is being written to Firestore. ──
      const perCol = {}; let nSet = 0, nDel = 0;
      for (const op of ops) { perCol[op.name] = (perCol[op.name] || 0) + 1; if (op.kind === 'del') nDel++; else nSet++; }
      const writeSummary = {
        at: new Date().toISOString(), path: PARENT, records: ops.length, sets: nSet, deletes: nDel, listMerges: txnOps.length, metaChanged, byCollection: perCol,
        docs: ops.map(o => ({ doc: PARENT + '/' + o.name + '/' + o.id, kind: o.kind, fields: o.kind !== 'del' ? Object.keys(o.data) : undefined, data: o.kind !== 'del' ? o.data : undefined })),
      };
      console.log(`%c[Storage] ⤴ writing ${ops.length} doc(s)${txnOps.length ? ' (' + txnOps.length + ' list-merge)' : ''}${metaChanged ? ' + settings' : ''} to Firestore (${PARENT})`, 'color:#5b8def;font-weight:600', perCol);
      try {
        if (typeof window !== 'undefined') {
          window.__lastCloudWrite = writeSummary;   // inspect in devtools to SEE the stored object
          window.__cloudWriteLog = (window.__cloudWriteLog || []);
          window.__cloudWriteLog.push({ at: writeSummary.at, records: ops.length, metaChanged, ok: null });
          if (window.__cloudWriteLog.length > 50) window.__cloudWriteLog.shift();
          if (typeof window.__onCloudSaveStatus === 'function') window.__onCloudSaveStatus({ phase: 'saving', records: ops.length, byCollection: perCol });
        }
      } catch (_) {}
      // AUDIT WRITES ARE ISOLATED AND NON-FATAL (v6.393). A Firestore batch is ATOMIC: one
      // rejected op fails every other op in it. Audit entries are a bookkeeping side-effect, so
      // they must never be able to take a member/invoice/payment down with them. They go in
      // their own commit, and a failure there is logged but does NOT fail the save.
      const batchCommits = batches.map((group, bi) => {
        const bizOps = group.filter(op => !op._audit);
        const auditOps = group.filter(op => op._audit);
        const commits = [];
        if (bizOps.length || (bi === 0 && metaChanged)) {
          const batch = db.batch();
          for (const op of bizOps) {
            const ref = colRef(op.name).doc(op.id);
            if (op.kind === 'del') batch.delete(ref);
            else batch.set(ref, op.data, { merge: true });
          }
          if (bi === 0 && metaChanged) batch.set(parentRef(), metaWrite, { merge: true });
          commits.push(batch.commit());
        }
        if (auditOps.length) {
          const ab = db.batch();
          // create-only: no merge, so this is a CREATE and never trips the immutability rule.
          for (const op of auditOps) ab.set(colRef(op.name).doc(op.id), op.data);
          commits.push(ab.commit()
            .then(() => { for (const op of auditOps) _auditKnown.add(String(op.id)); })
            .catch(e => { console.warn('[Storage] audit entry not written (non-fatal):', (e && e.code) || e); }));
        }
        return Promise.all(commits);
      });
      // Each list-changing record: a TRANSACTION that re-reads the live cloud record and
      // element-merges its list(s) (window._mergeArrayById), so a concurrent add/edit on
      // another device is preserved instead of being overwritten by Firestore's whole-array
      // replace. Retries automatically on contention. Non-list fields stay field-level.
      // FieldValue for the map-key delete sentinel below. Deliberately re-read here: the `_FV`
      // above lives inside the `if (metaChanged)` block and is NOT in scope in this closure.
      const _txnFV = (typeof window !== 'undefined' && window.firebase && window.firebase.firestore) ? window.firebase.firestore.FieldValue : null;
      const txnCommits = txnOps.map(op => {
        const ref = colRef(op.name).doc(op.id);
        return db.runTransaction(async t => {
          const snap = await t.get(ref);
          const cloud = snap.exists ? (snap.data() || {}) : {};
          const merged = { ...op.data };
          for (const f of op.arrayFields) merged[f] = window._mergeArrayById(op.base[f], op.cur[f], cloud[f], op.name + ':' + op.id + ':' + f);
          // Nested map (dailyAttendance …): 3-way deep-merge my current view against the LIVE
          // cloud copy so another device's just-added keys survive, mine survive, and I win a
          // true same-key conflict — exactly the array policy, applied key-by-key. (v6.320)
          //
          // Pass a delete-sentinel factory: `set(..., {merge:true})` only ADDS and OVERWRITES
          // map keys, it never removes one. A cleared attendance cell must therefore be written
          // as an explicit FieldValue.delete() or the old mark lives on in the cloud. (v6.341)
          // No FieldValue (local/test backend) → fall back to omitting the key rather than
          // writing `undefined`, which Firestore would reject.
          const _delSentinel = _txnFV ? (() => _txnFV.delete()) : null;
          for (const f of (op.mapFields || [])) merged[f] = window._mergeRecord(op.base[f], op.cur[f], cloud[f], op.name + ':' + op.id + ':' + f, _delSentinel);
          t.set(ref, merged, { merge: true });
        });
      });
      Promise.all([...batchCommits, ...txnCommits])
        .then(() => {
          lastWriteFailed = false; _lastErrorCode = null; _clearRetry();
          // The cloud now HAS this state — the local safety journal is obsolete. (v6.389)
          clearPendingJournal();
          // Advance the base from the SENT snapshot (frozen at flush time), NOT setBaseFromState(state)
          // — `state` is the live object and has kept mutating during this round-trip. Using it here
          // was silently swallowing in-flight edits (same-day data loss). Anything edited during the
          // round-trip stays "dirty" vs this base, so the follow-up flush below really writes it. (v6.368)
          for (const name of COLLECTIONS) _base[name] = sentBase[name] || new Map();
          _baseMeta = metaStr;
          _lastFlushResult = { ok: true, records: ops.length };
          console.log(`%c[Storage] ✅ stored in Firestore — ${nSet} written, ${nDel} deleted${metaChanged ? ', settings updated' : ''} @ ${new Date().toLocaleTimeString()}`, 'color:#16a34a;font-weight:700');
          try { if (typeof window !== 'undefined') { const L = window.__cloudWriteLog; if (L && L.length) L[L.length - 1].ok = true; if (typeof window.__onCloudSaveStatus === 'function') window.__onCloudSaveStatus({ phase: 'saved', records: ops.length, at: Date.now(), byCollection: perCol }); } } catch (_) {}
        })
        .catch(e => {
          lastWriteFailed = true; _lastErrorCode = (e && e.code) || null; _lastFlushResult = { ok: false, error: (e && e.code) || String(e) };
          // DURABILITY FIRST (v6.389): before anything else, put the unsaved state on disk
          // SYNCHRONOUSLY. Until this line existed, a failed write lived only in the page's
          // memory, so a reload/close/crash destroyed it (the "my new member vanished" bug).
          // This runs before the UI is told anything, so even an immediate reload is safe.
          writePendingJournal(state, (e && e.code) || 'write-failed');
          console.error('[Storage] ❌ save FAILED (journaled locally, will retry):', (e && e.code) || e, e);
          try {
            if (typeof window !== 'undefined') {
              const L = window.__cloudWriteLog; if (L && L.length) L[L.length - 1].ok = false;
              if (typeof window.__onCloudSaveError === 'function') window.__onCloudSaveError(e);
              if (typeof window.__onCloudSaveStatus === 'function') window.__onCloudSaveStatus({ phase: 'error', error: (e && e.code) || String(e) });
            }
          } catch (_) {}
        })
        .finally(() => {
          writeInFlight = false;
          // If more was queued while this wrote, flush that next — confirmation waiters
          // resolve only once the WHOLE chain drains (their state is fully persisted).
          if (pendingAfterWrite) { const n = pendingAfterWrite; pendingAfterWrite = null; _flushWrite(n); }
          else {
            _resolveConfirmWaiters(_lastFlushResult);
            // Chain drained on a FAILURE → keep trying automatically until it lands.
            if (_lastFlushResult && _lastFlushResult.ok === false) _scheduleRetry();
          }
        });
    }

    function assembleLive() {
      const out = {};
      for (const k of Object.keys(_liveMeta)) { if (isCollectionKey(k)) continue; out[k] = _liveMeta[k]; }
      // HOT only — auditLog is never delivered through a remote snapshot (it isn't listened to);
      // the app holds its own lazily-fetched copy, so omitting it here never clobbers state.auditLog.
      for (const name of HOT_COLLECTIONS) out[name] = Array.from(_live[name].values());
      return out;
    }

    return {
      name: 'firebase',
      isCloud: true,
      // Session lock decommissioned — concurrency is safe by design.
      async getLock() { return null; },
      async setLock() { return true; },
      async clearLock() {},
      onLockChange() {},
      needsMigration() { return needsMigrationFlag; },

      async load() {
        try {
          // Read the parent meta doc FIRST — it carries settings.userRoles, which lets
          // us tell a real member from a STAFF login that merely LOOKS like one. A coach
          // onboarded as <mobile>@blackstars.com has an all-digit email (the member
          // pattern), but the admin mapped it to role 'coach' — such an account must NOT
          // be member-scoped, or the coaches/invoices it needs never load.
          const parentSnap = await parentRef().get({ source: 'server' });
          const parent = parentSnap.exists ? (parentSnap.data() || {}) : null;
          // MEMBER SCOPE: a member-domain login reads only the portal collections; the
          // club's financials/operational data are never fetched (and are denied by the
          // rules). A digit-email that the roles map assigns a STAFF role (coach / admin
          // / receptionist) is treated as staff and reads everything (UI scopes the view).
          const _email = (() => { try { return ((auth.currentUser && auth.currentUser.email) || '').toLowerCase(); } catch (_) { return ''; } })();
          const _roleEntry = (parent && parent.settings && parent.settings.userRoles) ? parent.settings.userRoles[_email] : null;
          const _mappedStaff = !!(_roleEntry && ['coach', 'admin', 'receptionist'].indexOf(_roleEntry.role) !== -1);
          const memberScope = _isMemberEmail(_email) && !_mappedStaff;
          // Load the HOT collections only — auditLog is lazy (fetched on demand, see loadAuditLog).
          const readCols = memberScope ? HOT_COLLECTIONS.filter(c => MEMBER_READABLE.has(c)) : HOT_COLLECTIONS;
          const colResults = await Promise.all(readCols.map(name =>
            colRef(name).get({ source: 'server' })
              .then(qs => { const arr = []; qs.forEach(d => arr.push(d.data())); return [name, arr]; })
              .catch(e => { console.warn('[Storage:firebase] read ' + name + ' failed:', (e && e.code) || e); return [name, null]; })
          ));
          const assembled = {}; let anySubData = false, anyReadFail = false;
          for (const [name, arr] of colResults) { if (arr === null) { anyReadFail = true; continue; } assembled[name] = arr; if (arr.length) anySubData = true; }
          // Collections a member is not allowed to read are present as empty arrays,
          // so the app has a consistent shape (and never shows stale local copies).
          if (memberScope) for (const name of COLLECTIONS) if (!(name in assembled)) assembled[name] = [];

          // A partial/failed SERVER read → don't trust it, block writes (read-only). The PARENT
          // read already succeeded here (auth was fine), so a failed SUBcollection read is a
          // transient network/backend problem, not an auth one. (v6.345)
          if (anyReadFail) {
            loadErrored = true; cloudReadFailed = true;
            console.warn('[Storage:firebase] SERVER read incomplete — CLOUD-ONLY mode: refusing to run on a local copy.');
            try { if (typeof window !== 'undefined' && typeof window.__onCloudReadFailed === 'function') window.__onCloudReadFailed(new Error('partial read')); } catch (_) {}
            return { __cloudUnavailable: true, reason: 'network', code: 'partial-read' };   // v6.332: NO offline fallback
          }

          // Legacy single-document back-compat: old doc kept collections INLINE.
          const parentHasInlineArrays = parent && COLLECTIONS.some(k => Array.isArray(parent[k]) && parent[k].length);
          if (!anySubData && parentHasInlineArrays) {
            needsMigrationFlag = true; loadErrored = false; cloudReadFailed = false;
            noteServerLoaded(parent); _refreshLocalFromCloud(parent);
            console.warn('[Storage:firebase] Legacy single-document detected — running on inline data. Migration recommended.');
            return parent;
          }
          if (!parent && !anySubData) { loadErrored = false; cloudReadFailed = false; return null; }

          const result = {};
          if (parent) for (const k of Object.keys(parent)) { if (!isCollectionKey(k)) result[k] = parent[k]; }
          Object.assign(result, assembled);
          needsMigrationFlag = false; loadErrored = false; cloudReadFailed = false;
          noteServerLoaded(result); _refreshLocalFromCloud(result);
          try { console.log(`%c[Storage] ✅ loaded from Firestore — ${(result.members || []).length} members, ${(result.invoices || []).length} invoices from ${PARENT}`, 'color:#16a34a;font-weight:600'); } catch (_) {}
          setBaseFromState(result);
          _liveMeta = pickMeta(result);
          noteAuditFromServer(result.auditLog);   // never re-write an audit row the server has (v6.393)
          for (const name of COLLECTIONS) { _live[name] = new Map(); for (const r of (assembled[name] || [])) if (r && r.id != null) _live[name].set(String(r.id), r); }
          return result;
        } catch (e) {
          // Distinguish a SESSION problem from a NETWORK problem. The parent-doc read requires
          // request.auth != null (firestore.rules), so an expired / missing sign-in returns
          // 'permission-denied' (or 'unauthenticated'). That is NOT "no internet" — the fix is
          // to sign in again, so the app routes it to the login screen instead of the dead-end
          // "cannot reach cloud" block. Anything else is treated as a real network outage. (v6.345)
          const code = (e && e.code) || (e && e.message) || 'unknown';
          const reason = (code === 'permission-denied' || code === 'unauthenticated') ? 'auth' : 'network';
          console.warn('[Storage:firebase] SERVER load failed — CLOUD-ONLY mode (' + reason + '):', code, e);
          loadErrored = true; cloudReadFailed = true;
          try { if (typeof window !== 'undefined' && typeof window.__onCloudReadFailed === 'function') window.__onCloudReadFailed(e); } catch (_) {}
          return { __cloudUnavailable: true, reason, code: String(code) };   // v6.332: NO offline fallback
        }
      },
      // Read-back verification: confirm a specific record REALLY exists on the SERVER (not the
      // local cache). Used to gate a "success" message on proof the object is stored in the
      // cloud and retrievable. (v6.332)
      async verifyDoc(collection, id) {
        try { const snap = await colRef(collection).doc(String(id)).get({ source: 'server' }); return snap.exists; }
        catch (_) { return false; }
      },
      // Like verifyDoc, but hands back what the SERVER actually holds so the caller can
      // echo a field (e.g. the member's name) that came from the cloud rather than from
      // local state. Returns null when the record is absent or unreachable. (v6.336)
      async fetchDoc(collection, id) {
        try {
          const snap = await colRef(collection).doc(String(id)).get({ source: 'server' });
          return snap.exists ? snap.data() : null;
        } catch (_) { return null; }
      },
      // The parent "meta" document (settings, userRoles, schema…), read from the SERVER.
      // Lets a settings write — e.g. granting or removing a user role — be confirmed against
      // the cloud the same way a record write is. Returns null when unreachable. (v6.344)
      async fetchMeta() {
        try {
          const snap = await parentRef().get({ source: 'server' });
          return snap.exists ? (snap.data() || {}) : null;
        } catch (_) { return null; }
      },

      save(state) {
        if (blockEmptyWrite(state)) {
          // A blocked save (cloud-read-not-confirmed, or a suspicious empty/corrupt state)
          // used to return SILENTLY: no cloud write, no local cache, and hasUnsavedCloud()
          // stayed false — so the reload guard + banner never fired and a whole session
          // could be lost on refresh. Now flag it UNSAVED so the leave-page guard blocks and
          // the persistent error banner shows — the user is warned, never silently dropped.
          lastWriteFailed = true;
          // v6.389: deliberately NOT journaled. blockEmptyWrite() fires when the state looks
          // empty/corrupt (a suspected wipe), and replaying that on the next boot would destroy
          // good data. The unsaved flag + banner + leave-page guard already protect this case.
          try { if (typeof window !== 'undefined' && typeof window.__onCloudSaveStatus === 'function') window.__onCloudSaveStatus({ phase: 'error' }); } catch (_) {}
          return;
        }
        try { localBackend.save(state); } catch (e) { console.warn('[Storage:firebase] local safety-net save failed:', e); }
        if (writeInFlight) { pendingAfterWrite = state; return; }
        // v6.389: renew a near-expired ID token BEFORE sending, so a long-open tab stops failing
        // its first write of the day and flashing the "session expired" bar. The check is
        // SYNCHRONOUS in the normal case (cached expiry, nothing due) — critical because
        // flushPending() calls save() on tab close, where deferring to a promise would let the
        // page die before the write was ever handed to Firestore. Only a genuinely near-expired
        // token takes the async path.
        //
        // A RESTORED session (plain page reload) never went through signIn(), so the expiry is
        // unknown and _tokenExpAt is 0. Learn it in the background — without this the check below
        // could never fire for exactly the long-open tab that was failing every morning.
        if (!_tokenExpAt) { try { const u = auth && auth.currentUser; if (u) Promise.resolve(_noteTokenExpiry(u)).catch(() => {}); } catch (_) {} }
        if (_tokenExpAt && Date.now() > _tokenExpAt - TOKEN_SKEW_MS) {
          Promise.resolve(_ensureFreshToken())
            .catch(() => {})
            .then(() => { if (writeInFlight) pendingAfterWrite = state; else _flushWrite(state); });
          return;
        }
        _flushWrite(state);
      },
      // WRITE-THROUGH: persist `state` and return a Promise that resolves ONLY when the
      // CLOUD write is confirmed — { ok:true } on success, { ok:false, error } on failure.
      // Lets the app hold a critical action (payment/member/invoice) until it's really saved.
      saveConfirmed(state) {
        if (state) {
          if (blockEmptyWrite(state)) return Promise.resolve({ ok: false, blocked: 'empty-guard' });
          try { localBackend.save(state); } catch (e) { console.warn('[Storage:firebase] local safety-net save failed:', e); }
        }
        return new Promise(resolve => {
          if (!state && !writeInFlight) { resolve({ ok: true, noop: true }); return; }
          _confirmWaiters.push(resolve);
          if (writeInFlight) { if (state) pendingAfterWrite = state; }
          else _flushWrite(state);
        });
      },

      // Is there a change that failed to reach the cloud and is only on this device?
      // Also TRUE while a save is QUEUED behind an in-flight write (`pendingAfterWrite`): it has
      // not been sent yet, so a reload in that window would lose it. Counting it here makes the
      // leave-page guard hold the tab until it is really flushed. (v6.368)
      hasUnsaved() { return !!lastWriteFailed || !!pendingAfterWrite; },
      // TRUE when the cloud could NOT be confirmed on load (working from the read-only offline
      // copy) — every write is blocked, so the UI must PREVENT creating records that would be
      // lost on reload, not just warn. (v6.331)
      cloudWriteBlocked() { return !!cloudReadFailed; },
      // PROACTIVE session keep-alive: force-refresh the Firebase ID token so a write attempted
      // right after a wake-from-sleep / long background doesn't fail on a lapsed token. Called on a
      // timer and on tab-refocus / reconnect from app.js. Resolves true if a token was refreshed.
      // Also opportunistically re-sends anything still unsaved once the token is fresh. (v6.374)
      refreshAuth() {
        return _refreshAuthToken().then(ok => {
          try { if (ok && lastWriteFailed && !writeInFlight && _lastState) _flushWrite(_lastState); } catch (_) {}
          return ok;
        });
      },
      // Force an immediate retry of the last failed/queued write; resolves with the
      // cloud result ({ ok:true } once it lands, { ok:false, error } if it fails again).
      retryNow() {
        if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
        _retryAttempt = 0;
        if (writeInFlight) return new Promise(resolve => _confirmWaiters.push(resolve));   // ride the in-flight write
        if (!_lastState || !lastWriteFailed) return Promise.resolve({ ok: true, noop: true });
        return new Promise(resolve => {
          _confirmWaiters.push(resolve);
          // Same stale-token recovery as the auto-retry: force a fresh token before a manual
          // "Retry now" when the last failure was auth-coded, so the button can actually fix it. (v6.354)
          const go = () => _flushWrite(_lastState);
          if (_isAuthCode(_lastErrorCode)) _refreshAuthToken().then(go); else go();
        });
      },

      // LAZY AUDIT LOG (v6.453): fetch the full auditLog collection on demand (Audit / Trash screens,
      // "last updated by"). A one-time server GET — NOT a live listener. Marks every fetched id as
      // server-held (_auditKnown) so the create-only write path never re-sends one as an update (which
      // the immutable-auditLog rule denies — the v6.393 batch-poison bug). Deliberately does NOT touch
      // _base/_live: the write path already keys on _auditKnown, and every SUCCESSFULLY-written session
      // entry is added to _auditKnown on ack, so a fetch that races an unsynced local add can't drop it.
      // Returns the array (or null on failure). Safe to call repeatedly. (Member scope is denied this
      // collection by the rules; the catch handles that as a no-op.)
      async loadAuditLog() {
        try {
          const qs = await colRef('auditLog').get({ source: 'server' });
          const arr = []; qs.forEach(d => arr.push(d.data()));
          noteAuditFromServer(arr);   // never re-write a row the server already holds
          return arr;
        } catch (e) {
          console.warn('[Storage:firebase] loadAuditLog failed:', (e && e.code) || e);
          return null;
        }
      },

      // PURE server read for a sync-check / discrepancy diff: reads the authoritative
      // cloud copy with NO side effects (does not touch the write base, live maps or
      // local cache), so it can be safely compared against the in-memory state.
      async readCloud() {
        const parentSnap = await parentRef().get({ source: 'server' });
        const parent = parentSnap.exists ? (parentSnap.data() || {}) : null;
        const colResults = await Promise.all(COLLECTIONS.map(name =>
          colRef(name).get({ source: 'server' }).then(qs => { const arr = []; qs.forEach(d => arr.push(d.data())); return [name, arr]; })
        ));
        const result = {};
        if (parent) for (const k of Object.keys(parent)) { if (!isCollectionKey(k)) result[k] = parent[k]; }
        for (const [name, arr] of colResults) result[name] = arr;
        return result;
      },

      onRemoteUpdate(callback) {
        remoteUpdateCallback = callback;
        while (_unsubs.length) { try { _unsubs.pop()(); } catch (_) {} }
        const deliver = () => { if (!callback) return; try { callback(assembleLive()); } catch (e) { console.warn('[Storage:firebase] deliver failed:', e); } };
        // HOT collections only — auditLog gets NO live listener (it would keep a real-time query
        // over thousands of append-only rows open for the whole session). It is fetched on demand.
        for (const name of HOT_COLLECTIONS) {
          _seeded[name] = false;
          const unsub = colRef(name).onSnapshot(qs => {
            qs.docChanges().forEach(ch => {
              const id = String(ch.doc.id);
              if (ch.type === 'removed') _live[name].delete(id);
              else {
                _live[name].set(id, ch.doc.data());
                // THIS is the path that caused the frequent permission-denied: a colleague's
                // audit row arrives here, gets merged into local state, and our next save
                // re-sent it as an update — which the immutable-auditLog rule denies, failing
                // the whole atomic batch and with it the member being added. Record it as
                // server-held so it is never written again. (v6.393)
                if (name === 'auditLog') _auditKnown.add(id);
              }
            });
            const fromLocalWrite = qs.metadata && qs.metadata.hasPendingWrites;
            if (!_seeded[name]) { _seeded[name] = true; return; }
            if (fromLocalWrite) return;
            deliver();
          }, err => console.warn('[Storage:firebase] ' + name + ' listener error:', err));
          _unsubs.push(unsub);
        }
        const metaUnsub = parentRef().onSnapshot(snap => {
          if (snap.exists) { const d = snap.data() || {}; _liveMeta = {}; for (const k of Object.keys(d)) if (!isCollectionKey(k)) _liveMeta[k] = d[k]; }
          const fromLocalWrite = snap.metadata && snap.metadata.hasPendingWrites;
          if (!_metaSeeded) { _metaSeeded = true; return; }
          if (fromLocalWrite) return;
          deliver();
        }, err => console.warn('[Storage:firebase] meta listener error:', err));
        _unsubs.push(metaUnsub);
      },

      // One-time migration: legacy single doc → subcollections. Idempotent.
      async migrateToMultiDoc(onProgress) {
        const report = p => { try { if (typeof onProgress === 'function') onProgress(p); } catch (_) {} };
        const parentSnap = await parentRef().get({ source: 'server' }).catch(() => parentRef().get());
        if (!parentSnap.exists) return { migrated: false, reason: 'no data document found' };
        const data = parentSnap.data() || {};
        const inlineCols = COLLECTIONS.filter(k => Array.isArray(data[k]) && data[k].length);
        if (inlineCols.length === 0) { needsMigrationFlag = false; return { migrated: false, reason: 'already multi-document (nothing inline to migrate)' }; }
        const ops = []; const perCollection = {};
        for (const name of inlineCols) {
          const idx = indexById(data[name], name.slice(0, 3));
          perCollection[name] = idx.size;
          for (const [id, rec] of idx) ops.push({ name, id, data: rec });
        }
        report({ phase: 'writing', totalDocs: ops.length, perCollection });
        let done = 0;
        for (const group of chunk(ops, MAX_BATCH_OPS)) {
          const batch = db.batch();
          for (const op of group) batch.set(colRef(op.name).doc(op.id), op.data, { merge: true });
          await batch.commit();
          done += group.length; report({ phase: 'writing', written: done, totalDocs: ops.length, perCollection });
        }
        const FieldValue = window.firebase.firestore.FieldValue;
        const cleanup = { _multiDoc: true, _migratedAt: Date.now() };
        for (const name of inlineCols) cleanup[name] = FieldValue.delete();
        await parentRef().set(cleanup, { merge: true });
        needsMigrationFlag = false;
        return { migrated: true, collections: inlineCols, totalDocs: ops.length, perCollection };
      },

      async signIn(email, password) {
        try {
          const e = email.includes('@') ? email : (email + '@blackstars.qa');
          const cred = await auth.signInWithEmailAndPassword(e, password);
          lastUser = { email: cred.user.email, uid: cred.user.uid, isAdmin: true };
          _tokenExpAt = 0; try { await _noteTokenExpiry(cred.user); } catch (_) {}   // seed pre-emptive refresh (v6.389)
          // A fresh sign-in is exactly the moment to push anything a dead session left behind.
          try { if (lastWriteFailed && _lastState && !writeInFlight) _flushWrite(_lastState); } catch (_) {}
          return lastUser;
        } catch (e) {
          console.warn('[Storage:firebase] signIn failed:', e.code, e.message);
          const code = e.code || '';
          // Newer Firebase SDKs consolidated wrong-password / user-not-found into
          // 'auth/invalid-credential' (and briefly 'auth/invalid-login-credentials'); older
          // ones still emit the specific codes. Map them all to one clear, actionable message
          // so a stale auto-filled password reads as "wrong password", not a mysterious failure. (v6.464)
          if (/wrong-password|user-not-found|invalid-credential|invalid-login-credentials/.test(code)) {
            const err = new Error('Wrong password — please type it again (a saved/auto-filled password may be out of date).');
            err.authKind = 'bad-password'; throw err;
          }
          if (/too-many-requests/.test(code)) { const err = new Error('Too many attempts — wait a minute and try again.'); err.authKind = 'throttled'; throw err; }
          if (/network-request-failed/.test(code)) { const err = new Error('No connection to the cloud — check your internet and try again.'); err.authKind = 'network'; throw err; }
          if (/user-disabled/.test(code)) { const err = new Error('This account is disabled — contact the administrator.'); err.authKind = 'disabled'; throw err; }
          throw new Error('Sign-in failed: ' + (e.message || code));
        }
      },
      async signOut() { while (_unsubs.length) { try { _unsubs.pop()(); } catch (_) {} } await auth.signOut().catch(() => {}); lastUser = null; },
      currentUser() { if (lastUser) return lastUser; const u = auth.currentUser; if (u) lastUser = { email: u.email, uid: u.uid, isAdmin: true }; return lastUser; },
      async updatePassword(newPassword) {
        const u = auth.currentUser; if (!u) throw new Error('Not signed in');
        try { await u.updatePassword(newPassword); return true; }
        catch (e) { if (e && e.code === 'auth/requires-recent-login') throw new Error('Please sign out and sign in again, then change your password.'); throw new Error(e.message || 'Could not change password'); }
      },
      async provisionMemberLogin(email, password) {
        let secondary;
        try { secondary = firebase.app('memberProvisioner'); }
        catch (_) { secondary = firebase.initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain, projectId: cfg.projectId }, 'memberProvisioner'); }
        try { await secondary.auth().createUserWithEmailAndPassword(email, password); await secondary.auth().signOut().catch(() => {}); return 'created'; }
        catch (e) { if (e && e.code === 'auth/email-already-in-use') return 'exists'; throw e; }
      },
      async sendPasswordReset(email) { await auth.sendPasswordResetEmail(email); return true; },
    };
  }

  // ─── LOCAL AUTO-BACKUP RING (IndexedDB) ─────────────────────────────────────
  // A rolling history of full-state snapshots kept on THIS device, independent of
  // the cloud. Even if a sync bug or a bad edit ever loses data, the admin can roll
  // back to a recent snapshot. Snapshots are taken: on load (baseline), throttled
  // while working, and on tab close — and pruned to a useful window. All operations
  // are wrapped so a backup failure can NEVER block or break a normal save.
  const LocalBackups = (function () {
    const DBNAME = 'blackstars-backups', STORE = 'snaps';
    const SNAP_THROTTLE_MS = 12 * 60 * 1000;   // at most one auto-snapshot every 12 min
    let _db = null, _lastSnapAt = 0, _lastHash = '';
    const available = () => { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; } };
    function open() {
      return new Promise((res, rej) => {
        if (_db) return res(_db);
        const r = indexedDB.open(DBNAME, 1);
        r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'ts' }); };
        r.onsuccess = () => { _db = r.result; res(_db); };
        r.onerror = () => rej(r.error);
      });
    }
    const _tx = (mode) => open().then(db => db.transaction(STORE, mode).objectStore(STORE));
    function put(rec) { return _tx('readwrite').then(os => new Promise((res, rej) => { const rq = os.put(rec); rq.onsuccess = () => res(); rq.onerror = () => rej(rq.error); })); }
    function getAll() { return _tx('readonly').then(os => new Promise((res, rej) => { const rq = os.getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); })); }
    function del(ts) { return _tx('readwrite').then(os => new Promise((res) => { const rq = os.delete(ts); rq.onsuccess = () => res(); rq.onerror = () => res(); })); }
    async function prune() {
      try {
        const all = (await getAll()).sort((a, b) => b.ts - a.ts);
        const now = Date.now(); const keep = new Set(); const seenDay = new Set();
        for (const s of all) {
          const ageH = (now - s.ts) / 3600000, day = new Date(s.ts).toISOString().slice(0, 10);
          if (ageH <= 48) keep.add(s.ts);                                   // everything from the last 48h
          else if (!seenDay.has(day) && (now - s.ts) / 86400000 <= 21) { seenDay.add(day); keep.add(s.ts); }  // then 1/day for 21 days
        }
        for (const s of all) if (!keep.has(s.ts)) await del(s.ts);
      } catch (_) {}
    }
    return {
      available,
      // Take a snapshot now. `force` bypasses the throttle (used on unload / manual).
      async snapshot(state, reason, force) {
        if (!available() || !state) return null;
        try {
          const now = Date.now();
          if (!force && now - _lastSnapAt < SNAP_THROTTLE_MS) return null;
          const json = JSON.stringify(state);
          if (!json || json.length < 2) return null;
          // Skip if identical to the last snapshot (no churn when nothing changed).
          let hash = 0; for (let i = 0; i < json.length; i += 997) hash = (hash * 31 + json.charCodeAt(i)) | 0;
          const sig = json.length + ':' + hash;
          if (!force && sig === _lastHash) return null;
          _lastSnapAt = now; _lastHash = sig;
          const counts = {};
          for (const k of COLLECTIONS) counts[k] = Array.isArray(state[k]) ? state[k].length : 0;
          await put({ ts: now, at: new Date(now).toISOString(), reason: reason || 'auto', appVersion: state.__appVersion || state.appVersion || '', bytes: json.length, counts, data: json });
          prune();   // fire-and-forget
          return now;
        } catch (e) { console.warn('[backups] snapshot failed (non-fatal):', e); return null; }
      },
      async list() { try { return (await getAll()).sort((a, b) => b.ts - a.ts).map(({ data, ...meta }) => meta); } catch (_) { return []; } },
      async get(ts) { try { return (await getAll()).find(x => x.ts === ts) || null; } catch (_) { return null; } },
    };
  })();

  // ─── Public API ──────────────────────────────────────────────────────────────
  window.Storage = {
    init() { activeBackend = buildFirebaseBackend() || localBackend; console.log(`[Storage] Active backend: ${activeBackend.name}`); return activeBackend.name; },
    backendName() { return activeBackend?.name || 'none'; },
    isCloud() { return !!activeBackend?.isCloud; },
    async load() {
      if (!activeBackend) this.init();
      const data = await activeBackend.load();
      // CLOUD-ONLY (v6.332): the cloud was unreachable — do NOT snapshot/return a usable state;
      // the app shows a blocking "can't connect" screen and refuses to run on stale local data.
      if (data && data.__cloudUnavailable) return data;
      try { if (data) LocalBackups.snapshot(data, 'load', true); } catch (_) {}   // baseline snapshot of loaded data
      return data;
    },
    // Confirm a specific record exists on the SERVER (read-back verification). (v6.332)
    verifyDoc(collection, id) { try { return (activeBackend && activeBackend.verifyDoc) ? activeBackend.verifyDoc(collection, id) : Promise.resolve(true); } catch (_) { return Promise.resolve(false); } },
    fetchDoc(collection, id) { try { return (activeBackend && activeBackend.fetchDoc) ? activeBackend.fetchDoc(collection, id) : Promise.resolve(null); } catch (_) { return Promise.resolve(null); } },
    fetchMeta() { try { return (activeBackend && activeBackend.fetchMeta) ? activeBackend.fetchMeta() : Promise.resolve(null); } catch (_) { return Promise.resolve(null); } },
    save(state) {
      if (!activeBackend) this.init();
      pendingState = state;
      try { LocalBackups.snapshot(state, 'save'); } catch (_) {}   // throttled + deduped + non-blocking
      if (activeBackend.isCloud) { clearTimeout(saveTimer); saveTimer = setTimeout(() => { activeBackend.save(pendingState); pendingState = null; }, SAVE_THROTTLE_MS); }
      else activeBackend.save(state);
    },
    saveNow(state) { clearTimeout(saveTimer); activeBackend.save(state); pendingState = null; },
    // WRITE-THROUGH confirm: flush the latest queued state NOW and resolve once the cloud
    // has acknowledged it. Resolves { ok:true } (incl. offline/local = instantly durable)
    // or { ok:false, error } so the caller can hold the action + offer a retry.
    saveAndConfirm() {
      if (!activeBackend) this.init();
      clearTimeout(saveTimer); saveTimer = null;
      const s = pendingState; pendingState = null;
      if (s) { try { LocalBackups.snapshot(s, 'save'); } catch (_) {} }
      if (!activeBackend) return Promise.resolve({ ok: true, offline: true });
      if (!activeBackend.isCloud) { if (s) { try { activeBackend.save(s); } catch (_) {} } return Promise.resolve({ ok: true, local: true }); }
      if (activeBackend.saveConfirmed) return activeBackend.saveConfirmed(s);
      if (s) activeBackend.save(s); return Promise.resolve({ ok: true });
    },
    // Flush any throttled-but-not-yet-written save immediately (used on tab close so
    // an in-flight change can never be lost). Safe to call anytime.
    flushPending() { try { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } if (pendingState && activeBackend) { activeBackend.save(pendingState); pendingState = null; } } catch (e) { console.warn('[Storage] flushPending failed:', e); } },
    // TRUE while a change is saved on THIS device but not yet confirmed in the cloud.
    // Drives the "Retry now" banner and the leave-page guard. Local backend = always saved.
    // Also TRUE while a write is still in the throttle window (`pendingState` set but not yet
    // handed to Firestore) — so a reload/close during those ~1.5s is BLOCKED and the write is
    // flushed first, closing the "add → reload fast → record gone" gap. (v6.322)
    hasUnsavedCloud() { try { return !!(activeBackend && activeBackend.isCloud && ((activeBackend.hasUnsaved && activeBackend.hasUnsaved()) || pendingState)); } catch (_) { return false; } },
    // TRUE when we're on a cloud device but the cloud is NOT writable (offline/read-only). The
    // UI uses this to BLOCK creating members/invoices that would be lost. Local backend = always
    // writable (no cloud). (v6.331)
    cloudWriteBlocked() { try { return !!(activeBackend && activeBackend.isCloud && activeBackend.cloudWriteBlocked && activeBackend.cloudWriteBlocked()); } catch (_) { return false; } },
    // Force an immediate retry of a failed cloud write (from the "Retry now" button).
    retryNow() {
      try {
        if (!activeBackend) this.init();
        // Make sure the freshest throttled state is queued before we push it.
        if (saveTimer && pendingState) { clearTimeout(saveTimer); saveTimer = null; activeBackend.save(pendingState); pendingState = null; }
        if (activeBackend.retryNow) return activeBackend.retryNow();
      } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); }
      return Promise.resolve({ ok: true, noop: true });
    },
    // Proactively re-mint the Firebase ID token so a write right after wake-from-sleep / long
    // background doesn't fail on a lapsed token. No-op (resolves false) on the local backend or
    // when signed out. Safe to call often. (v6.374)
    refreshAuth() {
      try {
        if (!activeBackend) this.init();
        if (activeBackend && activeBackend.isCloud && activeBackend.refreshAuth) return activeBackend.refreshAuth();
      } catch (_) {}
      return Promise.resolve(false);
    },
    // Local auto-backup ring (IndexedDB) — independent recovery history on this device.
    // ─── Unsaved-write journal (v6.389) ──────────────────────────────────────
    // The cloud read overwrites the LS_KEY cache with cloud data, so a change that never
    // reached the cloud used to be erased from disk on the next boot. The journal lives under
    // its OWN key and is cleared only by a CONFIRMED write, so it outlives that overwrite and
    // the app can replay it. See app.js recoverPendingWrite().
    getPending() { return readPendingJournal(); },
    hasPending() { return !!readPendingJournal(); },
    clearPending() { clearPendingJournal(); },
    snapshotBackup(state, reason, force) { return LocalBackups.snapshot(state, reason, force); },
    listBackups() { return LocalBackups.list(); },
    getBackup(ts) { return LocalBackups.get(ts); },
    backupsAvailable() { return LocalBackups.available(); },
    // Pure server read for a discrepancy check (cloud only; null offline).
    async readCloud() { if (!activeBackend) this.init(); return activeBackend.readCloud ? await activeBackend.readCloud() : null; },
    // Lazy audit-log fetch (v6.453) — the audit log is not in the hot sync; the Audit/Trash screens
    // and the "last updated by" lookups pull it on demand. Null on a backend that can't provide it.
    async loadAuditLog() { if (!activeBackend) this.init(); return activeBackend.loadAuditLog ? await activeBackend.loadAuditLog() : null; },
    onRemoteUpdate(cb) { if (!activeBackend) this.init(); activeBackend.onRemoteUpdate(cb); },
    needsMigration() { if (!activeBackend) this.init(); return activeBackend.needsMigration ? activeBackend.needsMigration() : false; },
    async migrateToMultiDoc(onProgress) { if (!activeBackend) this.init(); if (!activeBackend.migrateToMultiDoc) throw new Error('Migration requires cloud sign-in (Firebase).'); return await activeBackend.migrateToMultiDoc(onProgress); },
    async getLock() { if (!activeBackend) this.init(); return activeBackend.getLock ? await activeBackend.getLock() : null; },
    async setLock(lock) { if (!activeBackend) this.init(); return activeBackend.setLock ? await activeBackend.setLock(lock) : true; },
    async clearLock(sessionId) { if (!activeBackend) this.init(); if (activeBackend.clearLock) await activeBackend.clearLock(sessionId); },
    onLockChange(cb) { if (!activeBackend) this.init(); if (activeBackend.onLockChange) activeBackend.onLockChange(cb); },
    async signIn(email, password) { if (!activeBackend) this.init(); return await activeBackend.signIn(email, password); },
    async signOut() { if (!activeBackend) this.init(); await activeBackend.signOut(); },
    currentUser() { if (!activeBackend) this.init(); return activeBackend.currentUser(); },
    async updatePassword(newPassword) { if (!activeBackend) this.init(); if (!activeBackend.updatePassword) throw new Error('Password change isn’t available in offline mode'); return await activeBackend.updatePassword(newPassword); },
    async provisionMemberLogin(email, password) { if (!activeBackend) this.init(); if (!activeBackend.provisionMemberLogin) throw new Error('Creating member logins requires cloud sign-in (Firebase).'); return await activeBackend.provisionMemberLogin(email, password); },
    async sendPasswordReset(email) { if (!activeBackend) this.init(); if (!activeBackend.sendPasswordReset) throw new Error('Password reset requires cloud sign-in (Firebase).'); return await activeBackend.sendPasswordReset(email); },
  };
})();
