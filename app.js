/* ═══════════════════════════════════════════════════════════════════════
   Black Stars CRM — Self-contained vanilla JS app
   Runs entirely in the browser. No build step. No server. No internet.
   ═══════════════════════════════════════════════════════════════════════ */

// ─── State ──────────────────────────────────────────────────────────
const LS_KEY = 'blackstars-crm-v1';
const LS_VERSION_KEY = 'blackstars-crm-dataver';

// ─── Versioning (two-track) ─────────────────────────────────────────
// APP_VERSION  — display label for the running code. Bumps on every release.
//                CHANGING THIS DOES NOT TOUCH USER DATA.
// SCHEMA_VERSION — only bump when state.* shape actually changes (e.g. adding
//                a required field that needs back-filling on existing data).
//                A bump here triggers the runMigrations() pipeline which
//                MUTATES existing data in place rather than wiping it.
const APP_VERSION = '6.526.0';   // 6.526.0 "PER-COACH COMMISSION BASIS" — each coach can be pinned to their OWN commission basis on the Team/Coaches edit form: "Use club default" (blank), "By attendance", or "By payment (on amount paid that month)". computeMonthlyPay now resolves the basis per coach — a coach's own `commissionBasis` overrides the club-wide Salaries toggle for them ONLY (blank falls back to the club setting). So a private coach can be fixed to "By payment" while everyone else stays "By attendance", regardless of the global toggle. The per-coach value is saved on add/edit; the resolved basis is returned so the Salaries row's Pending column reflects it (payment-basis coaches never pend). || 6.525.0 "PAYMENT-BASIS COMMISSION = ON AMOUNT PAID THAT MONTH" — the Salaries "By payment" basis now pays a coach rate% of the amount ACTUALLY PAID in the month (full rate, attendance ignored), split across an invoice's coach lines in proportion to each line's fee, counted in the month of the PAYMENT date, with NO carry-forward. Previously it paid rate% of the full CHARGED fee in the billing month whether or not it had been collected — over-paying when a member hadn't fully paid (e.g. Aziz Private: 60%×6920 charged = 4152, now 60%×4360 collected in Aug = 2616). This is the owner rule for private coaches on a full monthly fee: pay on what came in, settle each month on its own collections. The "By attendance" basis is UNCHANGED (per class + expiry true-up + carry-forward). || 6.524.0 "ATTENDANCE LOGS FREELY + EXPIRED-PACKAGE BADGE" — logging a present no longer pops a blocking "already attended all N classes — mark anyway? (they may need to renew)" confirm. The class ALWAYS records; instead the attendance row shows a 🔴 EXPIRED n/planned badge beside the student when that sport's package is finished (its window has ended while the member is still overall active, OR every paid class is attended). So the desk sees the over-limit / renewal-due state at a glance without being interrupted, and never has to answer a popup to record a real class. Regular sports only (Summer Camp keeps its own OVER LIMIT flag); the badge is amber and distinct from the red membership-level EXPIRED. || 6.523.0 "GET-INVOICE LABEL + PER-PACKAGE EXPORT WHEN AN INVOICE WAS VOIDED" — (A) the member "Get Invoice" button said "(N sports)" when N was really the number of live membership INVOICES — a member with several same-sport packages (e.g. weekly 120 private Kick Boxing sessions) saw "2 sports" for one sport. Relabeled "(N packages)". (B) the per-row 📄 export (printMemberSubInvoicePDF): if a period's OWN linked invoice was deleted/voided, it used to pool the member's OTHER same-sport packages and export the wrong total (e.g. 240 for a voided 120 session). Now it reconstructs that one package from the subscription itself. NOTE the underlying data issue this surfaced (Mohammed Kayed Al-Shammari: 3 Kick Boxing sessions @120, but INV986619 for the 22-Aug one is deleted while its subscription stays active+paid) is a DATA fix pending owner confirmation, not code. || 6.522.0 "ATTENDANCE: KEEP CURRENT COACH MARKABLE AFTER A TRANSFER" — when a sport was taught by more than one coach (a switch/transfer, so the grid splits into a row per coach), the coach with the LATEST window is the member's CURRENT coach for that sport. If the member is still active, that row now stays markable up to TODAY instead of being capped at the sub's (often short, inherited) end date. Before this, a switch-funded/transferred sub that carried a stale end (e.g. Aug 12) muted every later day as "outside <coach>'s period", so an actively-attending member (Jabr Al-Marri Kick Boxing, Ali Salem) could not be logged even while their membership was valid. Earlier coaches (whose period genuinely ended at the handover) stay bounded; this is GRID-ONLY (salary still reads subAttendanceWindow directly and is unchanged); marking past the paid class count still shows the over-cap "renew?" warning. || 6.521.0 "VALIDITY PRESETS + PER-SPORT INVOICE" — (A) the membership/enrollment Validity dropdown now offers 1 day, 1 week, 2 weeks, 1 month, 2 months, 3 months, 6 months (day-counts 1/7/14/30/60/90/180) with friendly EN/AR labels instead of the old bare "30/45/60/90/180 days". The stored value is still the day count (expiry math unchanged); a legacy validity that isn't a preset (e.g. an old 45-day membership) is preserved as its own option so it's never silently dropped. Applied to all four validity selects (member form, both renewal dialogs, change-validity). (B) each row in a member's Subscription History now has a 📄 button that exports an invoice for JUST that sport/period (printMemberSubInvoicePDF) — vs the existing "Get Invoice" which prints the whole membership. So a member with several sports, or the same sport renewed several times (e.g. Sattam's two Kick Boxing packages: 120 and 1440), can get a receipt for exactly the package asked about. Prefers the period's own linked invoice (sub.invoiceNumber), isolates only that sport's line(s), attributes the paid amount proportionally, and never persists the synthetic invoice. || 6.520.0 "SWITCH REBUILD — RECONCILED SPLIT + RE-PRICE + CARRY-FORWARD" — the Switch-Sport operation was rebuilt to the owner-confirmed model. On a single-target switch the ONE membership invoice is now SPLIT in place (no separate net-zero switch-credit): the source sport line is capped to the classes ATTENDED (source sub → attended/attended · Completed, old coach keeps attended × old-rate), and the remaining + CARRY-FORWARD classes move to the new sport at an admin-entered RE-PRICE (new "New sport price" field, defaulted to moved × old per-class rate, editable). The invoice is re-totalled so a dearer new sport shows a top-up due and a cheaper one a refundable over-payment credit — all shown live in the dialog preview. Attendance counting is now WINDOWED to the current package's start so a renewed sport no longer over-counts attended (over-crediting the old coach). A genuine existing PAID destination package is no longer clobbered (a separate switch-funded sub is created alongside). These switches are already-reconciled by construction (source sub completed + switchedAwayTo), so the load-time auto-reconciler correctly leaves them alone. || 6.519.0 "EXPIRING MULTI-SPORT + SCHEDULE RTL" —(1) the Expiring screen's sport filter is now a MULTI-select (was a single dropdown): pick several sports at once (keeps a member doing ANY chosen sport), with the built-in All/Clear plus a new "✕ Clear all filters" button that resets every filter. (2) the "today at the club" shareable schedule IMAGE now sets the canvas bidi base direction (ctx.direction='rtl') for Arabic — mixed emoji+Arabic sport names and "المدرب: <Latin name>" strings were being reordered/clipped to a few letters; RTL direction lays them out whole. || 6.518.0 "SWITCH AUDIT — BATCH 2 (coachId + rebuild guard)" — (A) EVERY coach-salary / revenue function matched a line's coachId with a strict !==, so a coach whose id is a big number (e.g. Zakaria's 16-digit id) silently earned 0 whenever the id arrived as a string instead of a number. Swept ALL 7 sites (computeAttendanceCommission, coachEarnings, computeMonthlyPay, and the revenue/report helpers) to String()-compare. (B) "Rebuild invoices from subscriptions" recreates invoices ONLY from the subscriptions, so a PAID sport that lives on an invoice but has NO matching subscription would be silently DELETED — losing paid classes (this is exactly how Bakhit's paid Zakaria Karate vanished in an earlier rebuild). The rebuild now BLOCKS with a warning that lists the at-risk paid sports and tells the admin to add the missing subscription first. || 6.517.0 "SWITCH AUDIT — SAFE FIXES (batch 1)" — a full audit of the sport-switch / coach-transfer code turned up ~14 issues; this ships the 3 safe, contained ones. (F4) `_applySwitchReconcile` matched the destination coachId with strict === so it silently failed on string/number imports (destination sub/enrollment never resized) — now String()-compared like the rest of that function. (F5) the coach-transfer matched the destination ENROLLMENT by sport only, so a member enrolled in the SAME sport under two coaches could have the OTHER coach's enrollment rewritten — both lookups are now coach-aware (match the departing coach, fall back to sport). (B1) the member-card "N/M classes" KPI counted a subscription even after it was SWITCHED to another sport or TRANSFERRED to another coach if its end date was still in the future — a double-count (Maryam-family) — switchedAwayTo / transferredToCoachId subs are now excluded from the active-class total. The remaining, money-critical audit findings (destination-sub overwrite on switch, multi-target distribute not creating subscriptions, unwindowed switch-attendance count, and the switched-sub downstream-counting family — enrollment drift, attendance report, invoice-health, expiry, ready-to-renew, dashboard renewals) are reserved for tested follow-up batches. || 6.516.0 "ATTENDANCE WINDOW UNION (can't-mark bug)" — a coach with MORE THAN ONE active period for a sport (Abdel Salam took over Iyad's students: a short transferred remainder Aug 1–7 PLUS his own new open-ended package Aug 12→) had their COMBINED attendance window wrongly capped at the earlier period's end. getRows unions each coach's per-sub windows, but it skipped null (open) bounds (`w.to && …`), so the finite Aug-7 clobbered the open Aug-12→ window → every later August day showed "outside Abdel Salam's period" and couldn't be marked (Ali Salem Kick Boxing on Aug 22). Fix: a null bound means OPEN — one ongoing sub makes the coach's whole union open on that side; the day is markable again. (Combines with v6.514, which already drops the departed Iyad row from August, so the student now shows ONE markable Abdel Salam row.) || 6.515.0 "ATTENDANCE KEY FIX (the � glyph)" — a same-sport two-coach student (v6.504, e.g. Ezz El-Din: Kick Boxing under BOTH Aziz and Abdel Salam) stores each extra coach's attendance under a coach-qualified key (sport + ' ' + coachId). Two bugs: (1) the separator had somehow become a NULL byte (U+0000), so the key rendered as "Kick Boxing�1" and was an illegal control-char storage/Firebase key; (2) the "Attendance saved in the cloud" confirmation showed that RAW key and also passed it to the sessions lookup — which found no sub of that name, so SESSIONS REMAINING read "not tracked". Fixed: the separator is a real space again (single stray NULL removed; guard test asserts none remain), and the confirmation modal derives a clean dispSport (strips the trailing " <coachId>") used for BOTH the label and the sessions lookup. Only same-sport two-coach students were affected; normal attendance was never touched. || 6.514.0 "DEPARTED COACH OFF LATER-MONTH ATTENDANCE" — a coach who left/was replaced mid-term (e.g. Iyad, gone 31 Jul; his Kick Boxing students were transferred to Abdel Salam from 1 Aug) still LISTED in the August attendance grid. The transfer was correct (Iyad's subs completed/transferred, each with an Abdel sub) and subAttendanceWindow already ended Iyad's window in July so the August cells were muted — but the ROW itself still rendered, so filtering the grid by Iyad in August (or just viewing August) showed his old students. Fixed: the single-month attendance grid now DROPS any coach-split row whose window doesn't reach the shown month (new winReachesMonth helper) — Iyad no longer appears in August/September, the successor coach's row shows instead, and the row/'# attendance rows' count agree. "All months" view keeps every row; single-coach (unsplit) rows are unaffected, so ongoing/expired members still appear. || 6.513.0 "ATTENDANCE FILTER ALIGNMENT" — the Attendance screen's filter bar used align-items:stretch, so when the student picker grew tall (its "Recent:" search chips render a second line under the input) the flex row stretched and the year/month control (display:inline-flex; align-items:center) vertically-centred its buttons — dropping "2026 / Aug 26" ~20px BELOW the day/week/status/attendance/sports filters, which looked like a broken split row (the coach/status multi-filters skewed too). Fixed by switching the bar to align-items:flex-start so every control top-aligns at the same line regardless of the picker's height (verified in-browser: all controls share one top). || 6.512.0 "INVOICE HEADER + TRANSFER CLARITY" — (1) the printed/shared invoice PDF no longer shows the browser's "blob:https://www.blackstarssports.com/…" URL in the top-right: @page{margin:0} leaves Chrome/Edge no page margin to draw its own header/footer, and the printed body gets 14mm/16mm padding for a clean visual margin. (2) The coach-transfer (Staff 🔁) date field is relabelled from the vague "Effective date" to "<Coach>'s last day", with a hint: classes on/before that date stay with the departing coach and the new coach starts the next day (enter 31 Jul for "left 31 Jul"). This removes the boundary ambiguity that could credit the departing coach with the handover-day class. The transfer split itself already CONSERVES the class count (old.attended + new.remaining = total) — proven by a new runtime test; the Kordi/Saad/Ali class-drops came from a later manual correction, fixed in data. || 6.511.0 "SWITCHED-MEMBER INTEGRITY" — a sport switched INTO is funded by the old sport's value via a net-zero switch credit; its enrollment/subscription is flagged switchedInto/switchFunded so it's NEVER re-billed. Bug: if that switch-funded subscription went missing (deleted, or the row's sport/coach edited so the member-form save couldn't match it), the save treated the enrollment as a brand-new sport and merged a FULL-PRICE line into the invoice — double-charging the member and creating a phantom due (Maryam Rais Shaikh: Swimming 500 + a re-billed Gymnastic 458 → phantom 58 due, while a -250 orphaned switch credit sat ignored). FIX: (1) the save's new-charge path now SKIPS any enrollment flagged switchedInto/switchFunded and restores its subscription instead of billing it; (2) deleting a switch-funded subscription now warns it will strand the switch credit; (3) the switch audit/toast use the CAPTURED source sport (was mislabeled "Gymnastic → Gymnastic" because from.sport had been mutated). || 6.510.0 "WELCOME MESSAGES" — a new Engagement screen (👋 Welcome Messages, admin + reception) that surfaces recent NEW JOINERS and RENEWALS (window selectable 7–90 days) and lets you WhatsApp each a warm, bilingual (Arabic-first) welcome PRE-FILLED with their own membership details: sport, coach, start date, valid-until, and session count. New = a first membership within the window; Renewal = an existing member whose latest period started within it. 👁 Preview shows the exact text with Copy + Send; 💬 Send opens WhatsApp and stamps m.welcomedAt so nobody is greeted twice for the same joining — a later renewal (a newer start date) makes them pending again. Family members use the household contact number. Nav badge = pending welcomes (last 30d). || 6.509.0 "ATTENDANCE: independent cells for same-sport two-coach" — a student enrolled in ONE sport under TWO coaches at the same time (v6.504) shows one attendance row per coach, but both rows wrote the SAME storage cell (dailyAttendance[month][sport]), so marking present under one coach toggled the other too. Now the first active coach keeps the plain sport key and each additional simultaneous coach gets a per-coach key (sport + ' ' + coachId), so the two rows are independent. A sequential SWITCH (one completed + one active sub) still shares the sport key — its windows already separate the days — so no existing data or salary is disturbed. The confirm dialog shows only the sport name, never the coach-qualified key. || 6.508.0 "ATTENDANCE: member-status filter" — the Attendance screen gains a Status filter (🟢 Active / 🔵 Frozen / ⚪ Expired / 🟣 Completed / 🔴 Withdrawn) beside the coach/sport/attendance filters. It's a multi-select that combines with every other filter (AND), so e.g. "Active + Kick Boxing + Abdel Salam" lists only that coach's active kick-boxing students. Matches memberStatus(m) in getRows; filter.statuses in the attendance filter state. || 6.507.0 "STAFF OUT OF COACH FILTERS" — staff (role:'staff' — e.g. Ester, on a fixed salary, teaches no sport) were appearing in the member-facing COACH filters (Members, Attendance, Schedule) because the filter used isCoachActive (active flag) but never checked the role. New isCoachRole()/teachingCoaches() helpers exclude staff from those filters; a role-less legacy record still counts as a coach. Salaries/reports are UNCHANGED — staff still get paid there. || 6.506.0 "REPAIR SWITCHED MEMBERS" — a same-sport coach switch could leave the new coach's classes in the PROFILE (enrollment) only — no subscription, no invoice line — so the Edit form showed a sport the read-only card/attendance/salary didn't (Kordi: profile Karate·Zakaria 270.83 with no sub; paid 825 but invoice only 554.17). New admin tool (Invoice Integrity → 🔀 Repair switched) previews then restores the missing subscription + invoice line FROM THE PROFILE — but ONLY when the member's existing payment already covers it (an overpayment), so no one is ever billed; unfunded cases are listed for manual review, never touched. Adds only (never deletes), idempotent, backup + cloud-confirmed. On the 2026-08-16 data: 6 members auto-repaired, 19 flagged. || 6.505.0 "ATTENDANCE: split a switched student per coach" — the Attendance screen showed a switched student's classes under BOTH coaches (all 7 under Iyad AND all 7 under Abdel Salam). Now a sport taught by >1 coach shows ONE row per coach, each scoped to that coach's attendance WINDOW (the same boundaries salary uses) — Iyad's window 2, Abdel Salam's 5, total 7, never double. Out-of-window grid cells are muted + non-clickable so a day is only markable on the coach who taught it; the club total no longer double-counts. Coach logins see only their own window. Salary was already correct — this fixes the DISPLAY. || 6.504.0 "SAME SPORT, TWO COACHES" — a member may now enrol in the SAME sport under a DIFFERENT coach (e.g. Karate with Mostafa AND Karate with Zakaria, or different days/times) — two independent subscriptions, two invoice lines, each coach earns their own commission. The add-sport form no longer rejects a duplicate sport when the coach differs (only a TRUE duplicate = same sport + same coach is blocked). Safe: enrolment rows now carry their original coach, so CHANGING a row's coach still updates that one subscription (never a double-charge) while a fresh "+ Add sport" row of an existing sport becomes its own subscription. Invoice-line sync is coach-aware so two same-sport lines stay independent. || 6.503.0 "ADMIN re-switch + PER-SPORT transfer" — (1) an ADMIN may now switch the same member's sport MORE THAN ONCE per cycle (the one-switch-per-cycle cap still applies to reception/others) — e.g. to correct a mistaken switch. (2) Staff-screen 🔁 Transfer students now offers a "Sport to transfer" dropdown when the old coach teaches MORE THAN ONE sport: pick one to hand off ONLY that sport's courses (split as usual), or leave "All sports". A scoped transfer only touches that sport's subs/enrollments/schedule and leaves the coach's other sports untouched. || 6.502.0 "REVERT Salaries date-filter UI" — reverted today's Salaries-screen changes (the month + 'up to day' scoping) back to the previous version at the user's request: the month dropdown disables again when a settle date is set, the 'or settle up to:' label + behaviour are restored. The coach-transfer split fixes (v6.494-6.501) are UNTOUCHED. Note: 'Commission from' is a pre-existing setting, not part of this revert. || 6.501.0 "TRANSFER: eligibility judged at the HANDOVER date" — Transfer-students split judged 'active' using TODAY, so a back-dated handover (e.g. Iyad's last day 31 Jul) SKIPPED subs that were active then but expired since (Ali end 7 Aug, Jabr 12 Aug) — leaving their August classes wrongly crediting the departed coach. Now eligibility uses the effective date, so every sub active AT the handover is split; its post-handover classes correctly credit the new coach. || 6.500.0 "SALARIES: month + up-to-day filter" — the Salaries partial-month settle already existed but disabled the month dropdown (confusing). Now: pick a month AND (optionally) an 'up to day' date scoped to that month — each coach's pay is calculated from the 1st of the month up to and including that day (computeMonthlyPay uptoDate). The month dropdown stays enabled and in sync; changing the month re-scopes/clears the day. || 6.499.0 "INVOICE-HEALTH 1-CLICK REBUILD + SWITCH FROM TOOLBAR" — (1) the red 🧾! invoice-conflict popup now offers 🔄 Rebuild from profile as the primary one-click fix (rebuilds invoice+payments from the subscription history so Paid/Total/Due reconcile — Tamim). (2) A 🔀 Switch sport / coach button in the members selection toolbar (shown when exactly one member is selected) opens the SAME switchSport flow the card uses, so the attendance-based commission split is calculated identically. || 6.498.0 "TRANSFER: robust invoice match + expire skipped subs" — the Transfer-students split failed to find a sub's invoice line when the sub's stored invoiceNumber was STALE (a regenerated invoice got a new ref — Adham: sub named INV946292 but the real one is INV946297), so only the sub's class count was capped and the un-shrunk 12-class line paid the OLD coach a DOUBLED per-class (500/6 not 500/12). Now the transfer falls back to a Membership invoice with a matching sport+coach line, disambiguating a renewal by closest date; and it stamps the departed coach's date-expired 'active' subs as 'expired' so they don't linger under him. || 6.497.0 "INSTALLMENTS SCREEN SIMPLIFIED + EDITABLE" — the Installments screen now shows ONLY the CURRENT (latest) invoice (older ones hidden with a count), the PRICE is editable inline (syncs invoice line + enrollment + a fully-paid camp sub on Save; the paid side stays the payments ledger), a '🔄 Rebuild from profile' button sits at the top (rebuilds invoice+payments from the subscription history), payments remain editable, and a new payment can be split across methods or several dated installments. || 6.496.0 "REBUILD INVOICES FROM SUBSCRIPTION HISTORY" — 'Rebuild from profile' now detects when a member's Subscription History (the real packages bought + paid) does not match their membership invoices and rebuilds the invoices STRAIGHT from the subs: one clean invoice per package (sport/duration/classes/paid=amountPaid), voiding stale/duplicated ones. Fixes Summer Camp members with several renewals whose invoices drifted (Tamim: subs 2615 vs invoices 2912 phantom 297 due) — Paid+Total become the sum of packages and Due goes to 0. Backup-first, preview, audited. || 6.495.0 "TRANSFER STUDENTS = SPLIT + dashboard expenses show both" — (1) Staff-screen 'Transfer students' now SPLITS each active course like a switch: old coach's sub becomes COMPLETED at the classes ATTENDED (paid that share), a new ACTIVE sub for the new coach takes the REMAINING classes (earns those); the invoice line is split too. It also finally updates SUBSCRIPTIONS (the old code only moved enrollments/primary, so a member whose coach lived on the subscription still showed the old coach). All coachId compares String-normalized. (2) Dashboard Total Expenses now shows BOTH cash paid out (matches the Expenses screen) and payroll earned (accrual). || 6.494.0 "SWITCH SPORT ROBUSTNESS" — switching a member could leave the OLD coach earning the full fee and the destination sport NOT sized to the remaining classes, because switchSport + coachBaseForSport compared coachId with strict === (a string coachId on one record vs a number on another — common in imported data — silently failed the source-sub / dest-sub / enrollment / credited-base lookups). Now all coachId comparisons in the switch path use String() normalization, and the source sub is completed at what was ATTENDED (totalClasses=attended, amountPaid=aShare) + the dest sub sized to the remaining classes (amountPaid=bShare) — so remaining classes are correct and the old coach is paid only for attended classes, the new coach gets the remainder. || 6.493.0 "INSTALLMENTS FIXES A MISSING INVOICE" — collecting a payment on the Installments screen for a sport with NO invoice used to be BLOCKED ('Generate an invoice first'), stranding members whose membership invoice was deleted (Alreem: Paid stuck at a stray 20, Rebuild didn't help). Now applyPricingSafe AUTO-CREATES a Membership invoice from the PROFILE (the priced sports shown) the moment you collect a payment, so the money lands and Paid/Balance/commission become correct. Only blocked if nothing is priced. || 6.492.0 "FAMILY LOGIN" — one login can access a WHOLE FAMILY: the student mapping now offers a Family picker (stored as userRoles[email].familyId; siblings added later are auto-included because the member list is derived live from familyMembers()). A family login gets a member SWITCHER in the sidebar + a smart Family overview strip at the top of My Membership (every member's status/sport/attendance/dues; tap to view full details; shows family balance). New effectiveMemberIds()/effectiveFamilyId()/setActiveMember() mirror the coach helpers; every student-scoped screen focuses on the active member via effectiveMemberId(). Single-member logins unchanged. || 6.491.0 "ONE LOGIN → MULTIPLE COACHES" — the Users const APP_VERSION = '6.490.0';   // 6.490.0 Roles coach mapping now accepts SEVERAL coaches (tick a checkbox list; stored as userRoles[email].coachIds, primary kept in coachId for back-compat). A multi-coach login gets a coach SWITCHER in the sidebar banner; picking one makes it the active coach and every coach-scoped screen (home, salary, attendance, schedule, students) focuses on it via effectiveCoachId(). New effectiveCoachIds() exposes the full set; setActiveCoach() switches among the account's own coaches only. Legacy single-coach mappings still work unchanged. || 6.490.0 "CAMP EDIT: CLASS COUNT ACTUALLY TAKES EFFECT" — a Summer Camp's class-day LIMIT was derived only from its duration LABEL (subClassLimit: '1 week'->5) and IGNORED totalClasses, so the profile-card ✎ Edit (which wrote totalClasses) had NO effect on a preset camp. Hossam's 7-working-day camp (5->13 Aug, 415 QAR) was stored as '1 week' (=5 class-days) so it read 5/5 'completed' instead of 5/7 'active'. Now: (1) editing a camp's class count off its preset label flips it to 'Custom'; (2) subClassLimit trusts a Custom camp's totalClasses VERBATIM (never through the validity->classes map, which used to misread a custom 7 as a '1 week'=5). So editing Hossam to 7 -> 5/7 -> active. || 6.489.0 "SPORT+STATUS FILTER AGREES ON THE SAME SPORT" — the Members list Sport+Status filters used to be checked INDEPENDENTLY (overall member status AND any enrolled sport), so 'Active + Summer Camp' matched a member with an active Gymnastic + an EXPIRED Summer Camp (Muna). Now a status filter applies to the member overall ONLY when no sport filter is set; with a sport filter, status is matched PER-SUBSCRIPTION of that sport (new _subFilterStatus helper), so 'Active + Summer Camp' = an actually-active Summer Camp. Verified on the real backup. || 6.488.0 "REBUILD INVOICE FROM SUBS (repair tool)" — a member card '🔧 Rebuild invoice' button (admin, shown ONLY when the member has PAID subscriptions but NO membership invoice) recreates one membership invoice from the subs (per-sport coach/classes/amountPaid) and records it paid — fixing members whose invoice was deleted in manual edits (Paid shows only stray products, coaches earn 0). Preview + backup-first + audited; refuses if an invoice already exists. Verified on the real backup: Alreem 20 to 1040 paid, coaches earn again (pending while frozen). || 6.487.0 "SWITCH INVOICE CLASS COUNT" — reconciling a switch now splits the invoice line's CLASS COUNT as well as the price: the source sport keeps the classes ATTENDED, the destination gets the remaining (Yaman: Karate 12cls/400 to 3cls/100, Kick Boxing 9cls/300) — the printed invoice no longer reads a mismatched 12 classes for 100 QAR. A heal in the on-load auto-reconcile also fixes switches already reconciled on the live site (syncs each switched-away line's class count to its subscription). Verified on the real backup. || 6.486.0 "FROZEN RENEWAL + SWITCH-EDGE QC FIXES" — QC round on the salary engine: (1) a FROZEN member's FINISHED renewal no longer re-appears as pending — the freeze was un-ending a prior period that already trued-up in an earlier month, so it showed up twice (Hessa: 18Jun-25Jul trued-up in July then pended again in August); the freeze now only suppresses ending for a period ending this month or later. (2) the skip of a switch-credit's negative clawback is narrowed to switch-credit invoices only (a manual negative deduction still reduces commission). (3) the auto-split destination share now PENDS while the member is frozen (not cashed out mid-freeze). (4) reconcile detection String-normalizes coachId to match the compute path. Verified on the real backup. || 6.485.0 "SWITCH AUTO-RECONCILE ON LOAD" — the switch split + the corrected member card are now FULLY automatic: on load (admin+cloud) any switched membership whose old sport was left active + payment un-split is reconciled — old sport completed at what was ATTENDED, the rest moved to the new sport, the one payment split, and the redundant switch-credit voided. Fixes the source-coach over-credit AND the new-coach double-bill (switch-credit + membership line). Verified on the real backup: Hoor Swimming completed 37.5 + Gymnastic active 262.5; Jennifer 300 to 37.5; no coach has a negative line; no frozen member wrongly earns a full line. Backup-first, audited, idempotent (mirrors the v6.297 dup-sub auto-heal). || 6.484.0 "SWITCH SPLIT IS NOW AUTOMATIC" — no more manual "Switch reconciliation" for the money. When a member switches sport, the commission engine now splits it AUTOMATICALLY from the recorded switch snapshot (m.sportSwitches: aShare/bShare/attendedByOld): the OLD coach is capped to the classes ATTENDED, the NEW coach gets the transferred share — even for switches done "the old way" that left the source sport active and the payment un-split. Read live (no data mutation), and guarded so a reconciled member (switch-credit invoice present) is never double-credited. Verified: Sara Swimming→Gymnastic = Leina 37.5 (1 attended) + Jennifer 262.5 = 300, split, zero manual steps. The card also flags an old-way switch "🔀 switched → <sport>". The Switch-reconciliation screen is now OPTIONAL (data tidiness only). || 6.483.0 "SWITCH PROFIT-SPLIT + QC FIXES" — MONEY: when a member switches sport mid-package the profit now SPLITS between coaches — the OLD coach keeps commission for the classes actually ATTENDED, the NEW coach gets the transferred share. The old code flat-fee "clawed back" the source coach in the switch month (−90 for Yaman/Mostafa) even though attendance-based pay never credited him the full fee — a switched-away sub now earns only its attended classes and the negative clawback line is skipped (fixes existing switches live, no migration). The switched-away sport now stays on the member card flagged "🔀 switched → <sport>". Plus 4 QC-engineer fixes on the v6.482 money screens: (1) a payment on an un-invoiced sport is blocked (was silently dropped); (2) the profile ✎ invoice-line lookup is type-safe (string/number coachId no longer leaves invoice+commission stale); (3) inv.amount uses the summary-guarded total and Installments never touches the total; (4) clearer un-invoiced-group header. || 6.482.0 "PROFILE PRICES · INSTALLMENTS PAYS" — clean separation to end the pricing/ledger drift for good. (1) The member profile (card → ✎ per sport) is now the SINGLE place to set a sport's price / classes / COACH — one save syncs the subscription + invoice line (price + coach → commission) + the ENROLLMENT together, so "Generate invoice" (reads enrollments) always matches the invoice; no more "Rebuild from profile" needed for edits. (2) The old "Edit pricing & payment" panel is now the payments-only "💳 Installments" screen: prices show read-only (from the profile), you only log installments (amount · method · date · refund). Prices and the ledger can no longer diverge because each lives in exactly one screen. || 6.481.0 "CACHE-BUST UNFROZEN (critical)" — the script/style tags in index.html were pinned at ?v=6.403.0 and never bumped, so since v6.403 every deploy served browsers the STALE CACHED app.js/pages.js/styles.css — none of ~77 versions of fixes actually reached the running app unless the user hard-refreshed. That is why fix after fix "still showed the old behaviour". index.html now cache-busts to the release version, and a QC guard (test-cache-bust-version.js) fails the build if index.html's ?v= ever drifts from version.json again. HARD-REFRESH once (Ctrl+Shift+R) after this deploy; every deploy after this is automatic. || 6.480.0 "GENERATE-INVOICE PREVIEW TELLS THE TRUTH" — the ⚡ Generate latest invoice preview summed the member's PROFILE (enrollment) prices, but clicking Generate RE-PRINTS an existing membership invoice for that month rather than charging the profile sum. So a member whose profile drifted from what was actually billed (profile 920 vs a real 1000 invoice) saw a wrong number and assumed the generator was broken — it wasn't, it re-prints the real 1000. The preview now shows a banner when a membership invoice already exists for the target month ("Generate will RE-PRINT it — NOT re-charged"), flags when the profile total differs, and warns when the profile disagrees with the last membership invoice (stale profile). Generate/re-print logic unchanged; products stay on their own invoice. || 6.479.0 "EVERY INVOICE IN THE PAYMENT PANEL" — the Edit-pricing/payment panel now shows EVERY membership invoice (one editable group per invoice, one row per line), not just the newest invoice per sport. The old model HID any earlier or duplicate invoice that touched a sport already on a newer invoice — so a member with a second Summer-Camp invoice had that invoice + its payment completely invisible and un-editable, which is exactly why the total paid "couldn't be edited". Rows are keyed per (invoice, line) so an edit routes to that exact invoice, and the profile is synced only from the newest line of each sport so a duplicate line never clobbers it. Invoice groups now show the ref + date. || 6.478.0 "EDIT THE PAID AMOUNT" — the pricing/payment panel now lets you fully edit an existing payment (amount, method, date) and see Paid + Balance recompute live. Root-cause fix: an ALREADY-OVERPAID invoice (paid > price, common after a sport switch) tripped the "payment exceeds balance" guard on EVERY save because it read the STORED paid sum — so editing the paid amount silently did nothing. The guard now uses the EDITED amounts and only blocks a NEW collection that would overpay; existing-payment edits always save. Bigger modal + larger, clearer controls. ALSO (QC audit): fixed a discount double-subtraction — the Price field showed the NET while save/live derive net = price − disc, so reopening a DISCOUNTED invoice subtracted the discount AGAIN and silently shrank the invoice total on every save (and then blocked collecting the real balance). The field now shows the GROSS so it round-trips losslessly; same fix in the Summer-Camp editor. || 6.477.0 "🔄 REBUILD FROM PROFILE" — make invoice + salary agree with the member's enrollments. When a switch or a manual edit left a member's records inconsistent, "Generate latest invoice" (which reads the ENROLLMENTS = the current profile) and the salary/commission report (which reads the SUBSCRIPTIONS) disagreed — e.g. a member whose Swimming enrollment says 10×420/Leina but whose subscription still says 1×50, so the coach's report showed the wrong base. New admin button on the member card, "🔄 Rebuild from profile": it treats the ENROLLMENTS as the single source of truth and re-syncs each enrolled sport's active subscription AND its invoice line to the enrollment (classes, price, coach); it completes any active subscription for a sport the member is no longer enrolled in (so it drops off the salary report); and it offers to remove the invoice lines for those dropped sports (opt-in per line) so the invoice total matches the profile. Preview-first (every change shown From→To), backup-first, admin-only, audited, cloud-confirmed. PAID AMOUNTS ARE NEVER CHANGED — if the new total is below what was paid, the difference simply shows as an overpayment to refund. Verified end-to-end in a browser (Alreem: invoice 1000→920, Swimming sub 1×50→10×420, Taekwondo sub 19×850→12×500, Gymnastic line removed). New guard test tests/test-rebuild-from-profile.js (11). pages.js changed. // 6.476.0 EDIT PRICING PANEL — now edits CLASSES + COACH too. When a member changed her sport / number of classes / prices, the "💰 Edit pricing / record payment" panel only let you change the PRICE and DISCOUNT per line — not the number of classes or the coach — so the invoice couldn't be brought back in line. Each sport line now also has a CLASSES box and a COACH picker (the picker lists active coaches plus the line's current coach even if now inactive). On Save the new values flow onto the invoice LINE (classes + coach), the matching SUBSCRIPTION (totalClasses + coach) and the ENROLLMENT — so the member card, attendance windows and coach commission all follow the corrected figures, and the invoice total/label regenerate. Price + discount + the full payments editor (edit amount/date/method, delete, split, refund) are unchanged. Verified end-to-end in a browser (classes 10→8, coach Leina→Jennifer, price 420→500 reflected on the line, invoice amount, subscription and enrollment). New guard test tests/test-pricing-edit-classes-coach.js (11). pages.js changed. // 6.475.0 Hid the "Camp Closure" screen from the Summer Camp menu per owner (not needed for now). The screen + all its logic (switch/refund) stay intact — just hidden:true, so it can be re-enabled instantly later by removing that flag. app.js changed. // 6.474.0 INVOICE — CLEARER PERIOD + ALIGNMENT. The invoice PDF printed the billing month as "Jul 26", which reads like a DAY (July 26th), not a month-year. It now prints the FULL, unambiguous month + 4-digit year — "July 2026" — on the English line (the Arabic line already showed "يوليه 2026"), via a new fmtMonthLong() helper. The Activity + Period header block is also tidied: the Period column is right-aligned so its label and both value lines line up on the right edge, Activity stays left-aligned, and both values are explicitly LTR/RTL so nothing reorders in any PDF viewer. Invoice numbers/totals unchanged; only the month label + alignment. app.js + pages.js changed; test-invoice-pdf-bidi.js (24). // 6.473.0 CHARTS — removed the "Payroll by month" chart per owner request (payroll already lives on the Salaries screen + the Payroll KPI tile). The Coach Performance / Revenue-by-Sport / Revenue-by-Category row is now three cards. No other chart changed. pages.js changed. // 6.472.0 SOCIAL MEDIA MODULE (compose once, share everywhere). New admin-only "🌐 Social Media" screen (Engagement menu): upload a photo/video + write the caption + link ONCE, then push it to each platform in a single click. Client-side only — no backend, no API keys, no cost. Facebook, X (Twitter), WhatsApp, Telegram and LinkedIn open PRE-FILLED via their web-share links; Instagram, TikTok and YouTube have no web-posting API, so those buttons DOWNLOAD the media + COPY the caption to the clipboard and open the app so you paste it in (marked with a ✋). Also: 📋 Copy caption, ⬇ Download media, a live character counter, an image/video preview, and a device-local "post log" that keeps your last 40 posts so you can re-load a caption into the composer (↺) or delete it (🗑). Admin-only. NOTE: this is the free, no-server approach — a true one-click auto-post to ALL connected accounts needs a publisher service (e.g. Ayrshare) + a small secure proxy, which can be layered on later. app.js + pages.js changed; new guard test tests/test-social-composer.js (17). // 6.471.0 TWO FIXES — BLACK-BOX TITLE EMOJIS + SIGN-IN BOX. (1) UI: every page title (📊 Charts, 🔁 Transfer, 🏁 Camp Closure, …) showed its emoji as a solid BLACK SQUARE. Cause: the .topbar h1 used gradient text-clip (background-clip:text + transparent text-fill), which paints emojis as black silhouettes. Fixed app-wide by giving the title a solid colour instead of the gradient — emojis now render normally on every screen. (2) SESSION: removed the "Later" button from the "Sign in to continue" box (it only dismissed the box without fixing anything). More importantly, a SUCCESSFUL sign-in now ALWAYS closes the box — previously, if re-authentication worked but the follow-up pending-write retry threw/failed, the whole handler errored and the box stayed open, so it looked like sign-in "didn't work" even though you were signed in. Now only a real sign-in failure (wrong password) keeps the box open (with a clear message + 👁 to check the password); once signed in it closes and the pending change is pushed (and auto-retries from the journal if the network is still catching up). The ↻ "Reload & sign in fresh" escape hatch stays. app.js + styles.css changed; test-session-recovery.js (37). // 6.470.0 CAMP CLOSURE SCREEN (switch or refund unused days). New admin-only "🏁 Camp Closure" screen (Summer Camp menu) for winding the camp down: it lists every ACTIVE camp member who still has UNUSED paid days, with their LIVE balance (paid days − days actually attended, computed exactly as the member card does — so the numbers match), the per-day price (amount paid ÷ package days) and the pro-rata refund value. Per member you can either (a) 🔄 SWITCH the remaining balance into another activity — this reuses the existing, tested sport-switch flow (carries the remaining classes + value onto the new sport, no new charge), or (b) 💵 REFUND the value in cash. The refund is MONEY-SAFE and reversible: it records a documented money-out "Refund" expense (new reserved expense category, shows on the Expenses screen) and marks the camp package completed, but LEAVES THE ORIGINAL INVOICE AND THE COACH'S ALREADY-EARNED COMMISSION UNTOUCHED — to undo, just delete the Refund expense. Every refund downloads a backup first, is audited (camp.refund), and confirms the cloud write before saying done; the amount is editable and capped at what the member paid. Header shows totals (unused days + refund value) and a CSV export. Admin-only at the route + the page. app.js + pages.js changed; new guard test tests/test-camp-closure.js (22). // 6.469.0 INVOICE-READY NOTIFICATION IN THE BELL. After you register a new member or renew a membership, the invoice used to be reachable only by going to the Invoices screen to export it. Now a notification lands in the 🔔 bell (top-right) — "🧾 New member invoice ready" / "Renewal invoice ready" with the member's name — and tapping it DOWNLOADS the invoice PDF straight away (then clears that entry). So staff can hand over / re-download the receipt without leaving the current screen. The entries are stored on the device (newest first, de-duplicated per invoice, kept 8 max / 3 days), the red bell count updates the moment one is created, and they sit above the existing admin reminders. Wired at all three creation points: new-member registration, single-sport renewal, and the multi-sport renewal. app.js + pages.js changed; new guard test tests/test-invoice-notif.js (14). // 6.468.0 SESSION STAYS ALIVE — stop the "sign in to continue" box from appearing. v6.464 made that box escapable; this attacks the ROOT so it rarely appears. The old keep-alive was a single 30-min fire-and-forget token refresh whose error was swallowed — so when a laptop woke from sleep the wake-refresh fired BEFORE wifi reconnected, failed silently, the token then expired, and the next click showed the box. Now the keep-alive is hardened: (1) the proactive refresh runs every 15 min (was 30) so it survives background timer throttling; (2) the wake/reconnect/focus/bfcache refresh RETRIES with backoff (3s→8s→20s→45s→90s) until it actually lands — covering the seconds after wake when there's no network yet; (3) it also warms the token on user activity (click/keydown), throttled to once per 8 min, so an actively-working admin's session NEVER expires out from under a click; (4) it refreshes once on boot and on pageshow (back/forward cache). Every refresh failure and every time the box appears is written to a small local breadcrumb log (window.__sessionLog(), capped at 40 entries) so a genuine recurrence can be diagnosed (was there network? could the token refresh? did a user object still exist?). NOTE: if Firebase's REFRESH token itself is dead (password changed, revoked, or the browser cleared its site storage) a real re-login is unavoidable — but that is now one tap (👁 + ↩ Reload) and should become rare. app.js changed; test-session-recovery.js (33). // 6.467.0 SALARIES — ONE-CLICK "↩ UNPAID". Reversing a coach's salary payment was buried: you had to open the ✓ "Manage payments" dialog and click "Clear all payments" — most people couldn't find it (asked "how do I mark a coach unpaid?"). Each PAID or partly-paid coach's Salaries row now has a clear red "↩ Unpaid" button. One click → confirm → it removes that coach/month's recorded payment(s) AND the linked auto Salary expense (the money-out row on the Expenses screen), writes it to the audit trail, and the row flips back to Pending (the red Pay button returns). You can pay again anytime. Money-safe: only THAT coach/month's own records are touched — an unrelated coach's payments and expenses are never affected — and confirmSaved verifies the change reached the cloud before saying it's done. The existing ✓ Manage → Clear-all path still works; this just surfaces it on the row. New guard test tests/test-salary-mark-unpaid.js (12). pages.js changed. // 6.466.0 EXPENSES — FILTER SALARIES BY COACH. On the Expenses screen, selecting the "Salary" category now reveals a multi-select COACH picker so you can narrow the salary expenses to one or more coaches (e.g. show only Jennifer + Aziz). A salary row's coach comes from its stored coach (set by the expense form's coach picker); as a fallback the coach's name is matched inside the description, so free-typed rows like "310 Coach Madi April Salary" are caught too. The picker only appears while Salary is among the selected categories and clears itself when you deselect Salary; the '—' no-coach placeholder is never offered, and picking several coaches UNIONs them. The filtered total + Clear-filters button account for it. Verified end-to-end in a browser (Jennifer + Aziz → exactly those two rows, total 3,843). New guard test tests/test-expenses-coach-filter.js (16). pages.js changed. // 6.465.0 F5 / Ctrl+R = REFRESH DATA IN PLACE, NO LOGOUT. Pressing F5 (or Ctrl/Cmd+R) used to do a full BROWSER reload — which re-boots the app and, if the signed-in session had lapsed, dropped the admin at the login screen just for wanting fresh data. F5 and Ctrl+R now REFRESH THE CONTENT IN PLACE instead: they pull the latest from the cloud and re-render the current screen (keeping your scroll, filters and, crucially, your SESSION — you are never logged out). Any not-yet-saved change is flushed first so the pull can't race a pending write. Deliberately preserved: Ctrl+Shift+R still does a real HARD reload (so a new app version can always be picked up), plain typing of "r" is untouched, and on the LOGIN screen the keys behave normally. Built on the existing in-place "Refresh from cloud" path (sidebar icon), so it reuses the same safe merge. New guard test tests/test-f5-soft-refresh.js (13); verified functionally in a browser (F5/Ctrl+R prevent the reload + pull; Ctrl+Shift+R passes through). app.js changed. // 6.464.0 SESSION RECOVERY — SIGN-IN THAT ACTUALLY UNBLOCKS YOU. Owner hit "session expired AND login not working": after the sign-in timed out, the in-place "🔐 Sign in to continue" box wouldn't take. The usual cause is the browser AUTO-FILLING a STALE saved password into a MASKED field — every attempt fails "invalid" and you can't see why, with no way out. Three fixes: (1) the prompt now has a 👁 SHOW/HIDE toggle so you can see and correct the password, plus a tip that a saved password may be out of date; (2) it now has a ↻ "Reload & sign in fresh" escape hatch — a clean reload to the normal login screen (where sign-in always works). This is 100% SAFE: the unsaved change is journaled to this device (localStorage, synchronous) and REPLAYS automatically after you log in, so nothing is lost — the button also flushes any pending write first. (3) storage.js now maps the modern Firebase error codes (auth/invalid-credential + auth/invalid-login-credentials, which newer SDKs use INSTEAD of auth/wrong-password) to a clear "Wrong password — type it again (a saved/auto-filled password may be out of date)" message, and distinguishes too-many-attempts / no-connection / disabled-account; a wrong password now clears, reveals and refocuses the field so you retype instead of resubmitting the bad saved value. The existing proactive keep-alive (token refresh on heartbeat + wake/reconnect, v6.374/6.407) and the durable pending-write journal (v6.389) are unchanged — this makes the LAST-RESORT recovery bulletproof. New guard assertions in tests/test-session-recovery.js (28). app.js + storage.js changed. // 6.463.0 TRANSFER SCREEN UX — TWO TABS + COACH→HIS-SPORTS FILTER + CLEARER FONTS. The Transfer Membership screen was one long scroll (the transfer form AND the full history table stacked together) with small, faint labels. It now has TWO clear tabs at the top — "🔁 New Transfer" and "🗂 History (N)" — so the form and the past-transfers table are separate views (the history count shows on its tab); only the active tab's card is shown. In step 1 the COACH filter now comes FIRST and DRIVES the sport list: pick a coach and the sport drop-down lists ONLY that coach's transferable sports (labelled "All his sports"), instead of every sport in the club — switching coach resets the sport pick, and a sport that the new coach doesn't teach falls back to "all" automatically. Fonts throughout the screen are larger and clearer (step headings 13→16px with bigger number badges, the coach/sport selectors and search boxes 13/14→14/15px and semibold, the member result rows 13→14.5px, the subtitle and the whole history table bumped up with no-wrap names so rows don't break awkwardly). Logic of the transfer itself is unchanged. New guard test tests/test-transfer-tabs-coachsports.js (19). pages.js changed. // 6.462.0 CHARTS MULTI-YEAR + EXPENSES GRAPHS + MEMBERS SHIFT-SELECT & RICHER EXPORT. (1) CHARTS: the month filter is now a MULTI-YEAR checkbox picker — it lists months across every year that has data with year sub-headers, so you can chart one month, several months, a whole year, or multiple years at once from ONE control; the separate "All years" filter (which was showing a bogus "0001" bucket from a malformed month) is removed, and months are sanitized to real YYYY-MM within the club's lifetime so "0001" can never appear again. Selecting a month/year no longer CLOSES the drop-down (tick several without it snapping shut). Added two EXPENSE charts — "🧾 Expenses by Category" donut (non-payroll spend over the scoped period) + "📉 Expenses by month" bars — both following the same month scope as every other chart. (2) MEMBERS: SHIFT+click a row checkbox now range-selects every member between the last click and this one (standard list-select UX), applying the clicked box's new state to the whole range — tick one, Shift+tick another, the whole span selects. (3) MEMBERS EXPORT CSV is now the full picture: added Gender, Nationality, Sport(s), and the money+attendance rollup — Total Charged, Total Paid, Balance Due (from the invoice ledger, the source of truth), Attended / Total Classes and Attendance % — so an export carries each member's paid amount and attendance alongside their details. app.js (version + FR) + pages.js changed. // 6.461.0 SIDEBAR — SEPARATOR ABOVE "MORE". Added a thin divider line at the top of the sidebar footer, so the "More" utilities group is visually separated from the last nav section (SYSTEM) above it — matching the separator already used mid-list (after Summer Camp). Cosmetic only (one line in renderSidebar's footer). app.js changed. // 6.460.0 FRENCH DICTIONARY +298 LABELS. Added 298 more French translations to FR_STRINGS (now ~1,346 of the ~1,966 t()-wrapped strings), so far fewer labels fall back to English when the app is in French. This pass covered the common admin + money UI that was still English in French mode: buttons/actions (Add Member, Renew Subscription, Permanently delete, Find Duplicates, Remove duplicates, Collect a new payment, Record cash collection, Edit pricing & payment…), filters + statuses (All years, Outstanding balance, Expired memberships, To expire ≤ 3/7/30 days, months selected…), screen titles + labels (Duplicate Invoices, Attendance report, Commission by Coach/member, Renewals by Member/Sport, Court Rental Revenue, Facility Company Share, Payment ledger review, Switch reconciliation…), the login/session strings, and many toasts/hints. Mechanism unchanged (t() returns FR_STRINGS[en] when lang=fr, else the English text — never a blank); French apostrophes use the typographic ’ so no string ever breaks. Arabic is unaffected (every t() call already carries its Arabic). ~620 lower-frequency / longer strings still remain for future passes. app.js changed (FR_STRINGS only). // 6.459.0 CHARTS DASHBOARD — MULTI-SELECT MONTH + YEAR FILTERS. The smart Charts screen only ever showed the last 8 months. It now has a multi-select MONTH picker AND a multi-select YEAR picker (the same shared controls used on Invoices / Due Payment / Attendance). Both empty = the default last-8-months view; otherwise a month is in scope when it passes BOTH active filters (an empty filter passes everything), so you can chart one month, several months, a whole year, or multiple years at once. EVERY chart follows the selection — the KPI tiles (revenue / net profit / payroll), Revenue-vs-Cost bars, Net-Profit line, Revenue-by-Category donut, Revenue-by-Sport bars, Coach Performance (now the coach's GROSS summed across the selected months, not just the latest), Payroll-by-month, and New-Members — plus a "✕ Clear filters" button and a period label in the header. All aggregates still use the same billed-basis engine as Reports, so the numbers match. Verified end-to-end in a browser: year 2026 → 2,400 (Jun+Jul+Aug), year 2025 → 1,100 (Nov+Dec), one month Aug → 900, two months → 1,500, clear → back to last-8. New guard test tests/test-charts-filters.js (16). pages.js changed. // 6.458.0 CUSTOM CAMP EXPIRY = ITS BOOKED DAYS. A Custom Summer Camp package expired on the wrong date — it inherited the "1 month" default window (22 camp-days) instead of the number of days actually booked (reported: Hossam Awadalla — 12-day custom camp from Wed 5 Aug showed expiry 3 Sept, the 22nd camp-day, instead of Thu 20 Aug, the 12th). Cause: the camp form has a SEPARATE "Validity" dropdown (defaulting to 1 month) and a Custom day-count box; the code used the Validity for the expiry and applied the typed count only as the class limit. Fix: for a CUSTOM camp the admin-typed day count IS the window — expiry = the Nth camp-day counting Sun–Thu (campEndDateFromClasses); presets ("1 week"/"1 month"/…) keep their own EDITABLE validity, unchanged. New shared helper rowEndDate() routes every place a camp end is stored or shown — the enrolment→subscription sync, deriveMemberDates, the Add/Edit form's live expiry, the renewal, convert-trial, coach-transfer, and subscriptionValidEnd's derive path — so the form preview and the saved value always agree. Existing wrong records are corrected in one click by the already-present admin "🛠 Fix camp dates" tool (it recomputes end = campEndDateFromClasses(start, class-days); it flags Hossam 3 Sept → 20 Aug). Verified: custom 12d→20 Aug, custom 7d→13 Aug, preset 1-month→3 Sept (unchanged), non-camp calendar unchanged. New guard test tests/test-custom-camp-expiry.js (14). app.js + pages.js changed. // 6.457.0 CHARTS DASHBOARD (smart graphs). New admin-only "📊 Charts" screen (Main menu, next to Reports) with inline-SVG graph charts — NO external libraries, so it works offline and under the strict CSP, and reads in light + dark themes. Charts: (1) REVENUE vs COST — grouped monthly bars (revenue green vs expenses+payroll orange) over the last 8 months; (2) NET PROFIT TREND — a filled line with a zero baseline that shows loss months in red; (3) REVENUE BY CATEGORY — donut with legend + %; (4) REVENUE BY SPORT — ranked horizontal bars (top 8); (5) COACH PERFORMANCE — gross-pay bars per coach for the latest month; (6) PAYROLL BY MONTH — monthly salary-cost bars; (7) NEW MEMBERS — monthly registrations line; plus KPI tiles (revenue / net profit / payroll over the window). All figures reuse the SAME billed-basis aggregates as Reports (billedInPeriod / billedByCategoryInPeriod / billedBySportInPeriod / salariesEarnedInPeriod / computeMonthlyPay), so the numbers match every other screen. Admin-only (same club-earnings sensitivity as Reports — reception + coach are blocked at the route AND the page). EN/AR/FR labels. New guard test tests/test-charts-dashboard.js (15). app.js + pages.js changed. // 6.456.0 COMBINED INVOICE — EACH LINE KEEPS ITS OWN PERIOD. On the "Get Invoice (N sports)" combined receipt, EVERY line printed the SAME validity window — the member's most recent package (reported: Hossam Awadalla — all 4 Summer Camp lines showed "05 Aug → 03 Sept" although they run Jun / Jun / Jul / Aug). Cause: printMemberInvoicePDF merges all the member's invoices into ONE synthetic invoice dated with the LATEST date, and the renderer re-derived each line's period from that single date — so every same-sport line mapped to the newest sub (the v6.454 per-invoice fix only helped SEPARATE invoices; a combined one has one date for many packages). Fix: printMemberInvoicePDF now resolves each line against ITS OWN source invoice (correct date + ref, via findSubForLine) and carries the resolved window on the line as `_period`; printInvoicePDF PREFERS li._period when present. Verified end-to-end in a browser on the real data: the 4 lines now read 14–18 Jun, 21–25 Jun, 05 Jul–03 Aug, 05 Aug–03 Sept — matching the member card (the two same-month June packages disambiguate by exact date). Single-invoice printing is unchanged (no _period → the v6.454 path). Guard test tests/test-invoice-camp-days.js extended (14). pages.js changed. // 6.455.0 RENEWAL — PAYMENT-METHOD SPLIT. The classic single-sport "Renew Subscription" popup only had one "Amount paid" box and always recorded the renewal invoice as 'cash' with no payment ledger. It now has the SAME split panel as Add Member: Cash / Card / Fawran / Transfer amount boxes + a payment date + a live Paid/Due summary. Enter one method, or SPLIT across several (paid with cash + card at once); leave ALL blank = paid in full in cash (the previous behaviour, preserved); pay less than the fee = the remainder is recorded as a DUE balance. The renewal invoice now stores the real method(s): amountPaid, a per-method payments[] ledger (each method its own dated row), and the primary method — so the money reconciles by method and shows correctly on Due Payment / Cash Collection. The "Amount paid (QAR)" field is relabelled "Amount / Fee (QAR)" to make clear it's the price, with the split panel recording what was actually collected. Over-payment (paid > fee) is blocked. Verified end-to-end in a browser: split cash 200 + card 120 → ledger [cash:200, card:120]; all-blank → [cash:full]; partial 200/320 → paid 200, 120 due; single Fawran → [fawran:full]. New guard test tests/test-renewal-payment-split.js (13). NOTE: this covers the SINGLE-sport renewal (the reported screen); the multi-sport renewal popup can get the same panel next if you use it. Add Member + the Edit-pricing/Due panels already had the split — this closes the renewal gap. pages.js changed. // 6.454.0 INVOICE PDF — CAMP "DAYS" (and class counts) NOW PER-INVOICE. Every Summer Camp invoice for a member was printing the SAME day-count — the member's MOST RECENT camp package — instead of what THAT invoice billed (reported: Hossam & Tamim Awadalla — all camp invoices showed "12 days"; the July invoices are 22-day / 1-month packages). Cause in printInvoicePDF: it linked the line to a subscription by sub.invoiceNumber === inv.ref, and when that failed it fell back to subscriptions.slice(-1) (the newest package) for BOTH the printed Qty and the validity period. These members' sub.invoiceNumber values are out of sync with the invoice refs (e.g. the 22-class sub names INV639111 but the real invoice is INV639107), so the ref match always missed and every camp invoice inherited the latest package's 12 days + Aug dates. Fix: link the line with the canonical findSubForLine (matches by ref, then disambiguates a renewal by DATE — the sub whose START matches the invoice date), and take the Qty from the invoice LINE's own `classes` (the authoritative billed count) rather than the linked sub's total. Verified on the live data: each invoice now prints its own count (June 7, July 22, Aug 12) and its own validity window. Applies to all sports (a mis-linked class count is corrected the same way). New guard test tests/test-invoice-camp-days.js (8). NOTE (data, not code): those subscriptions' invoiceNumber fields are stale vs the invoice refs — the display is now robust to it, but the linkage could be re-synced separately if you want the stored link exact. pages.js changed. // 6.453.0 PERFORMANCE — LAZY AUDIT LOG (faster login + saves). The audit log had grown to the biggest collection by far (~4,800 rows / 2.1 MB — about 70% of the entire synced dataset) yet is only needed on the admin Audit/Trash screens and the "last updated by" lookups. It was being DOWNLOADED on every login and kept a heavy real-time listener open over thousands of append-only rows for the whole session — slowing loads and competing with every save. It is now LAZY: excluded from the hot initial load AND the live listener (storage.js HOT_COLLECTIONS), and fetched on demand via a new Storage.loadAuditLog() (a one-time server GET, not a listener) — the app pulls it once in the background a few seconds after boot, and the Audit/Trash screens pull it on open. New audit rows are STILL written normally (the create-only path is unchanged, so the immutable-auditLog rule is never violated — every written id is marked known and never re-sent). This removes ~70% of the sync payload and the giant listener, so login and saves are markedly lighter. NOTHING is lost: the full trail still lives in Firestore and loads when viewed. Guards: mergeRemoteIntoState never clobbers state.auditLog (it's absent from remote snapshots); ensureAuditLog dedupes the fetched history against session-created entries. New guard test tests/test-lazy-auditlog.js (18); the existing audit-batch-poison (26) + partial-snapshot + inflight-dataloss + pending-journal + boot tests all still green. app.js + pages.js + storage.js changed. // 6.452.0 OVER-ATTENDANCE CARRIES INTO THE RENEWAL. When a member attended MORE classes than their package paid for and then RENEWED, the extra class(es) used to inflate the OLD package (e.g. "9/8") while the new package showed 0 — the overflow was stranded, not moved forward (reported: Layan Chortan — Gymnastic 9/8 in Jul, 0/8 in the Aug renewal). Root cause in subAttendanceWindow: the "fill up to paid classes" cap (v6.433) only ran for the LAST package (no later renewal), so an over-attended package that HAD a renewal kept counting every mark. Fix: (1) the cap now applies to EVERY package — the window ends on the date of the limit-th class, so an over-attended package reads exactly its paid count (Jul → 8/8); (2) the renewal's carry-back now reaches to the previous package's CAPPED end (its last paid class) instead of its raw calendar end, so the extra class falls into the new package (Aug → 1/8). Total attended is conserved (9 marks → 8 + 1, nothing lost or double-counted); a package with UNUSED classes is unchanged (last package stays open so a late class still fills a slot; a middle package keeps its day-before-next-start end); a lone over-attended package still caps (v6.433 preserved). This flows through the member card, ATT rate, Ready-to-Renew and attendance-basis commission consistently. New guard test tests/test-overattendance-carry.js (5 assertions, the Layan case). app.js changed. // 6.451.0 FROZEN-PAGE FIX (links not clickable). A modal popup (e.g. a coach's Revenue Detail) appends a FULL-SCREEN #modal-backdrop to <body> and sets body overflow:hidden. navigate() re-renders the screen content but never removed that backdrop — so when a navigation fired while a popup was open (most often the browser BACK button, or opening a deep link), the invisible backdrop survived on top of the NEW screen and swallowed every click: the page looked completely frozen ("links are not clickable"), though no data was affected and nothing was unsaved. navigate() now force-closes any open modal (and clears the scroll lock) before rendering, so a stuck overlay can never carry across a screen change. Verified in-browser: open modal → backdrop present + body locked; navigate → backdrop gone, body unlocked, elementFromPoint at screen-centre is real page content (no overlay intercepting). app.js changed. // 6.450.0 "BY PAYMENT" SALARY — TWO REAL BUGS (money). Commission basis "By payment (full fee in payment month)" is meant to pay the coach their % of the WHOLE billed fee that month, attendance IRRELEVANT. On the live data Aziz showed 60% × 240 = 144 for a member (Kayid Alshammari) billed 960 — it should be 576. Two independent defects, both fixed: (1) ATTENDANCE-PRORATED BASE — the Salaries screen (computeMonthlyPay) and the per-coach Revenue-Detail report/PDF (showRevenueDetail + the PDF builder) summed lineCommissionEligibility's ATTENDANCE-prorated base (960 × 1/8 attended = 120) and gated on elig.eligible, instead of the FULL line price. They now add the full price for every non-excluded line (Summer Camp and expired-0-attendance no-shows still earn nothing). (2) DELETED INVOICES STILL PAID — the by-payment loop in computeMonthlyPay AND both Revenue-Detail builders skipped archived MEMBERS but never checked inv.deleted, so a member whose invoice was deleted and re-generated (the common "fix the invoice" flow — Kayid had deleted INV946349 + live INV946350, both 960) was counted TWICE, doubling the coach's pay and showing a phantom duplicate line in the report. All four sites now `if (inv.deleted) continue`. Verified on the 03-Aug backup: Aziz 144 → 576 (single live 960 × 60%), the phantom second line gone, and no other coach's total changed except the intended full-fee lift (Aya 626, Jennifer 563.5, Mostafa 225, Abdel Salam 210). NOTE for the owner: under by-payment a FROZEN member billed this month now also pays the coach the full fee this month (the frozen "pay-attended-only, defer the rest" rule lives in the ATTENDANCE basis); tell me if frozen members should instead pro-rate under by-payment too. app.js + pages.js changed. // 6.449.0 MEMBERS SCREEN — full EN/AR/FR (screen 2 of the app-wide 3-language pass). The Members table COLUMN HEADERS (Member / Arabic Name / QID / Nationality / Phone 2 / Joined / Created / Level / Birthdate / Outstanding / Sport / Coach / Attendance / Last Renewal / Expiry / Status / Invoice) + the same labels in the Columns show/hide menu + the sort tooltip now translate (Arabic map MEMBER_COL_AR + French via t()), the BULK-ACTION bar (N selected · Add to family · Freeze · Export selected · Archive selected · Clear), both "No members match your filters" empty states, the incomplete-data filter (All data / Missing any field / No phone / No QID / No email / No birthdate / No nationality) and the nationality picker's All/Clear/"No nationalities recorded" are all wrapped in t() with Arabic + French. Combined with v6.448's title/count/chips/toolbar/filters, the Members screen now renders fully in the chosen language. ~38 screens remain, one per release. app.js + pages.js changed. // 6.448.0 FOUR FIXES. (1) COACH "MY SALARY" RE-ENABLED — the coachsalary page is back in the coach's menu and access list (was disabled v6.419/6.420); a coach can open their own salary page again (still blocked from the admin Salaries screen). (2) INVOICE-HEALTH FALSE RED — a member whose invoice BILLS the current renewal's sport (a sport added to an existing invoice keeps the invoice's original header date) wrongly showed the red "Current renewal not invoiced" badge, even after fixing/regenerating (reported: Jaber Rashid — invoice dated 29 Jun bills Summer Camp + Kick Boxing 550, Kick Boxing added for the 19 Jul renewal). Coverage now also passes when the (latest) invoice actually bills the current sub's sport, not only when its header date falls in the window. (3) "BY PAYMENT" COMMISSION USED THE ATTENDANCE-PRORATED BASE — the payment basis ("full fee in payment month") paid on lineCommissionEligibility's attendance-prorated base (a member billed 960 who attended 3/12 → base 240 → 144) instead of the FULL fee; it now pays the whole fee for every non-Summer-Camp line regardless of attendance (Aziz → 60% × 960 = 576). (4) MEMBERS SCREEN translation started (EN/AR/FR): title, count, status chips, toolbar (Find Duplicates / Columns / Export CSV / Add Member), the All-status/sports/coaches/nationalities filter labels, Recent, and the filters-hiding banner. Regression green. app.js + pages.js changed. // 6.447.0 FRENCH DICTIONARY ~1000 labels + LANGUAGE SWITCHER UI FINALLY FIXED. (1) Added ~485 more French translations (FR_STRINGS now ~1,018 of the ~1,884 t() strings) — bringing French toward parity with Arabic on every bilingual string across the money/member/coach screens (statuses, columns, buttons, filters, cash/salary/invoice/reconciliation labels, etc.). (2) The sidebar language switcher was STILL clipping ("🌐 Engli…") because the brand header's flex text pushed it off the edge; it now shows a short code (EN / ع / FR) at auto width, the brand text shrinks with ellipsis instead of overflowing, and logo/theme/lang are all flex:0 0 auto — so nothing clips on desktop or mobile. app.js changed. // 6.446.0 LANGUAGE UI FIX + SIDEBAR/COACH FRENCH. (1) The language drop-down was clipped ("Franç…") and cramped on mobile — it now shows a compact 🌐+code as the selected value (EN/ع/FR) with full names in the open list, and won't shrink/overflow. (2) SIDEBAR is now fully EN/AR/FR: the nav always runs each route label through t() (previously a label with no Arabic entry showed raw English, French too), + French added for every route label (History→Historique, Due Payment→Paiement dû, Transfer Membership→Transfert d’abonnement, Swimming Groups, Attendance Report, My Dashboard, etc.) and Arabic filled in for the 3 routes that lacked it. (3) COACH VIEW: the coach's Attendance screen reuses the (already-translated) attendance grid, and the coach dashboard/help are already t()-wrapped, so they follow the dictionary; the Attendance KPI badge + "showing day X only" subtitle are now translated too. app.js + pages.js changed. // 6.445.0 ZERO-ATTENDANCE = NO COACH PAY. A member who attended NONE of their classes and then EXPIRED no longer earns the coach anything — the attendance-basis commission used to TRUE-UP the whole fee ("12 paid classes not attended, paid in full") even at 0 attendance, so the coach was paid for a member who never showed up (reported: Ali Salem Al-Afeefah — 0/12 swimming, expired, paid the coach 165). Both true-up branches (cumulative-settlement + monthly) now require attended > 0; with no attended line and no true-up, a zero-attendance expired member produces NO commission lines and disappears from the salary report entirely. UNCHANGED: a member with ≥1 attended still trues up the remaining paid classes; an ACTIVE member with 0 attendance still PENDS (they may yet attend); frozen handling unchanged. This matches the club rule (expired + 0 attended = 0). New guard test tests/test-zero-attendance-commission.js (8 assertions). Regression 89 files green. app.js changed. // 6.444.0 ATTENDANCE SCREEN — full EN/AR/FR (screen 1 of the app-wide 3-language pass). The Attendance screen's title, count subtitle, toolbar (Today / Import CSV / Export CSV / Export PDF / Image EN+AR), all filters (day / week / coach / sport / attendance / student search), the Y/N/not-marked legend and the table column headers (Student / Total / Rate / Export) are now wrapped in t() with Arabic + French, so this screen renders fully in the chosen language. Verified rendering in en/ar/fr. Sizeable remainder — ~39 more screens get the same treatment, one complete screen per release, until the whole app is EN/AR/FR. pages.js + app.js changed. // 6.443.0 FRENCH DICTIONARY EXPANDED (~470 labels). Added ~320 more French translations to FR_STRINGS covering common UI labels (statuses, columns, buttons, filters, weekdays, actions). IMPORTANT LIMIT (unchanged architecture): this only affects strings the code passes through the t() helper (the sidebar nav + member-facing screens — those get MORE French now). MANY admin-screen labels are still HARDCODED English (never wrapped in t()) — e.g. the Attendance screen's "All sports" / "Import CSV" — so they stay English no matter how big the dictionary gets. Full French on those screens requires wrapping each string in t() first (a per-screen job). ~1,000+ labels remain. app.js changed. // 6.442.0 LANGUAGE SWITCHER → DROP-DOWN. The English/العربية/Français switcher (login screen + sidebar) is now a proper <select> drop-down instead of a cycle button — pick the language directly. Same 3 locales; French stays LTR. NOTE ON FRENCH COVERAGE: strings translate only where the code calls the t() helper (member-facing screens + the whole sidebar nav — those already show Membres/Familles/Présence in French). Most ADMIN screen labels (Attendance, Members list, filters like "All sports"/"Import CSV") are still HARDCODED English and were never wrapped in t(), so they stay English regardless of the dictionary — fully translating them is a per-screen job (wrap each string in t() + add French), tracked by the queued "Add French language" task. app.js changed. // 6.441.0 DUE PAYMENT DOUBLE-COUNT FIX + EDIT A SUBSCRIPTION. (1) invoiceTotal() no longer DOUBLE-counts a redundant sport-less "summary" line. A re-sync could leave a flat line (price = the whole membership) ALONGSIDE the itemized per-sport lines, so the total summed to DOUBLE — e.g. Ali Mohammed & Salem Mohammed Almerri had a flat 1125 + Kick Boxing/Swimming/Karate 375×3, totalling 2250, so each (having paid his real 1125 in full) showed owing another 1125 on Due Payment. invoiceTotal now drops a sport-less line whose price EQUALS the itemized sum (a duplicate summary); a sport-less line with a DIFFERENT amount — a real registration fee — still counts. Verified on the live data: those two members drop to 0 due, the grand Due Payment total falls 8,000 → 5,750, and no other member's due changes. (2) NEW admin ✎ EDIT on each Subscription-History row: change a sport's CLASSES, PRICE and STATUS directly (e.g. set a switched sport's old package Completed at what was attended, the new package to the remaining classes/price). Saving syncs the linked membership invoice LINE price so commission follows; if the sport still has an un-voided switch credit it warns to run 🔀 Switch check for the complete (duplicate-free) fix. New guard test tests/test-invoice-total-summary.js (10 assertions). Regression 88 files green. NOTE ON THE PENDING DUPLICATE: a member shown twice in a coach's Pending (e.g. Alreem in Leina's Swimming) is the un-reconciled switch — the sport has BOTH a membership pending AND a switch-credit pending; 🔀 Switch check collapses it to one. app.js + pages.js changed. // 6.440.0 SWITCH RECONCILE TOOL — fix a member switched BEFORE v6.436. The v6.436 switch fix only applies to NEW switches; a member who switched a sport earlier still has the OLD broken shape: the source sport stays ACTIVE at its full class count, the one payment was never split, and the source coach carries a PHANTOM PENDING for classes that actually moved to the new sport (the reported Alreem case: Gymnastic still "active" 12 classes, Jennifer showing +146/−146 noise). New admin tool 🔀 "Switch check" on the Salaries screen (only shows when there is something to fix): using the LOCKED switch snapshot (attendedByOld / aShare / bShare) it (1) completes the source sub at what was attended (Gymnastic → 2 classes, status completed), (2) resizes the destination sub to the remaining classes (Swimming → 10, switch-funded), (3) splits the invoice line prices so the ONE package is ONE split payment (Gymnastic 83.33 + Swimming 416.67, invoice 1500→1000), and (4) voids the now-redundant switch-credit invoice. It downloads a backup first and audits each fix. Result for Alreem, verified on the live data: Gymnastic completed@2 (Jennifer paid 2 classes, ZERO pending in Jul AND Aug), Swimming 10 classes (Leina: 1 attended paid + 9 pending while frozen), one 500 split. New guard test tests/test-switch-reconcile.js (16 assertions). Also: the coach report's "⏳ Pending" table is now NUMBERED (# column). Full pending review across ALL coaches confirmed the salary engine is otherwise correct — the ONLY real double-count was Alreem's switch (fixed by the reconcile above); everything the earlier by-name scan flagged is legitimate: a member enrolled in TWO sports under the same coach (e.g. Mostafa's Almerri family = Swimming + Karate) correctly gets one pending line PER SPORT, and a renewal (two packages of the same sport) correctly gets one line per package (v6.435). Frozen members correctly pay only attended classes and pend the rest (verified: after reconciling Alreem, ZERO pending doubles remain across every coach). Regression 87 files green. pages.js changed. // 6.439.0 DUE PAYMENT ACCURACY — TRUST THE PAYMENT LEDGER, NOT THE STALE CACHE. The Due Payment screen (and every money screen) read invoicePaid(), which returned the cached `amountPaid` scalar. The payment system APPENDS immutable rows to payments[] and re-syncs amountPaid — but a MULTI-DEVICE MERGE desyncs them: (a) the cached amountPaid goes STALE, missing a payment another device recorded (a member shows owing more than they do — reported case: Aleen paid 500 on 14 Jun AND 500 on 13 Jul = 1000, but amountPaid stuck at 500, so the screen showed 1900 due instead of 1400), or (b) a row is DUPLICATED (two identical rows sharing a pid base like `c634|…|card#1`/`#2`). Fix: invoicePaid() now credits the HIGHER of amountPaid and the DEDUPLICATED ledger sum (new helper invoicePaymentsSumDeduped collapses rows sharing a pid base, so a merge-duplicate counts once while genuinely distinct payments all count). This CORRECTS a stale amountPaid (the ledger proves more was paid → the due drops) yet never lets a merge-clobbered ledger INCREASE what a member owes — so the change can ONLY reduce an over-stated balance, never create a phantom one (verified across the live data: grand dues 11,650 → 11,150, the single Aleen correction, and ZERO members' dues increased). Legacy invoices with no ledger keep amountPaid. New guard test tests/test-invoice-paid-ledger.js (11 assertions). Regression 87 files green. app.js changed. // 6.438.0 FROZEN MEMBER — SWITCH CREDIT NO LONGER PAID MID-FREEZE. A frozen member's coach must be paid ONLY for classes actually attended, with the rest pending until the member returns. That already held for normal memberships, but the frozen deferral explicitly EXCLUDED switch credits (`frozen && !isSwitch`), so a frozen member's sport-switch was cashed out to the coach in full immediately (the reported Alreem case: she is FROZEN, yet Leina was paid 125 on a 417 swimming switch credit). Now a frozen member's switch credit PENDS ("frozen — switch credit pending until return") — the coach is paid only the attended classes while frozen (Leina → 42 for the 1 attended class), and the switch amount is paid by the settlement path once the member is no longer frozen. The paired NEGATIVE deduction on the source coach pends too, so both sides of the switch stay balanced (Jennifer's -417 defers, netting her frozen pending to 0). New guard test tests/test-frozen-switch-pending.js (6 assertions). Regression 86 files green. NOTE: this stops the frozen over-pay; Alreem's underlying DOUBLE record (a 500 membership + the switch both funding swimming) is separate broken data still awaiting the one-time correction. app.js changed. // 6.437.0 FRENCH LANGUAGE (fr) — third UI language alongside English + Arabic. The app was bilingual EN/AR via a simple t(en, ar) helper + getLang()/setLang(). French is added WITHOUT touching the thousands of t() call sites: it's a dictionary (FR_STRINGS) keyed by the ENGLISH string, so when French is active t() returns FR_STRINGS[en] if present and otherwise falls back to the English text (any not-yet-translated string simply shows in English — safe, no blanks). French is LTR (only Arabic flips document.dir to rtl); document.lang is set per language. The language toggle now CYCLES English → العربية → Français → English on both the login screen and the in-app sidebar button (labels EN / ع / FR). A solid starter dictionary covers the common member-facing UI (auth, nav, buttons, membership/attendance labels, statuses); it can be extended over time. New guard test tests/test-french-language.js (15 assertions). Regression 85 files green. app.js changed. // 6.436.0 SWITCH SPLITS ONE PACKAGE + SALARIES RECALC ON OPEN. (1) SPORT SWITCH now updates CLASSES + PRICES: switching A→B carries the REMAINING classes and the TRANSFERRED value (bShare) onto the destination sport, marks the SOURCE subscription completed at what was actually used (e.g. Gymnastic → 2 attended → completed), and flags the destination `switchedInto`/`switchFunded`. Before, a switch flipped the enrollment's sport but LEFT classes/price at the original full amount and created no destination subscription — so the member looked like they had TWO full-price sports (Gym 500 + Swim 500) instead of ONE 500 split, and a later invoice re-sync, seeing "the switched-in sport has no subscription", RE-CHARGED it a full membership (the Alreem double-fund). Now the destination reads its true split (e.g. Swimming 10 classes / 416.67 from a 500 Gym package where 2 were attended), the card shows one split package, and the re-sync can't duplicate it. (2) SALARIES RECALCULATE LIVE ON OPEN: the screen already recomputed every coach's commission from the latest attendance/invoices/payments on each open, but that is now explicit — a 🔄 Recalculate button re-runs it on demand and the header carries a "recalculated HH:MM" stamp so the figures are visibly fresh, never cached. New guard test tests/test-salary-recalc-switch.js (10 assertions). Regression 83 files green. NOTE: this fixes the switch flow GOING FORWARD; Alreem's already-broken record still needs the one-time correction (Gym completed @2 / Swim 10-classes-416.67 / drop the duplicate 500 / keep the extra 500 as account credit). pages.js changed. // 6.435.0 SALARY AUDIT — RENEWAL DOUBLE-COUNT FIXED. A full recheck of every coach's salary across all months (against the live data) surfaced one real calculation bug: when a member had TWO packages for the SAME sport+coach (a RENEWAL), the coach's commission could be counted TWICE over the first package's window and ZERO over the renewal window. Root cause in findSubForLine(): a commission line with no invoice-ref link matched the FIRST subscription for that sport+coach, so a renewal invoice attached to the OLD package. Both the original and renewal invoices then read attendance from the OLD window, double-paying it, while the renewal window earned nothing. Reported case: Adham Ragab, Kick Boxing — two 12-class packages (20 Jun→20 Jul and 20 Jul→19 Aug), 17 classes actually attended, but the coach was paid for 24. findSubForLine now DISAMBIGUATES a renewal by the invoice's date: it links each invoice to the subscription whose START matches (exact date, then start-month, then the window containing the date, then the closest start) — preferring START over END so a package that begins the day another ends links to the one that STARTS then. Each package is now counted exactly once over its own window (Adham → 12 + 5 = 17). This corrects BOTH over- and under-payments: across the current 26 renewal members it removed Iyad's ~88 over-credit and restored renewal-window attendance that was being dropped (e.g. Jennifer +334, Abdel Salam +120) — every package now pays at most its bought class count, verified with 0 over-limit packages across all 10 coaches. The single invoice-ref match and single-subscription cases are unchanged. New guard test tests/test-renewal-sub-attribution.js (7 assertions, the Adham case). Regression 82 files green. Also on the coach salary report: an expiry TRUE-UP row's Classes column showed the ATTENDED count (e.g. 6/8) even though the row pays only the trued-up classes (its amount is 2 classes) — it now shows the trued-up count (2/8), matching the row's "⏳ EXPIRED — 2 paid classes not attended" flag and its amount. NOTE: a separate DATA issue (not a code bug) remains for one member — Alreem Addulla's Swimming is funded by BOTH a 500 membership (paid in cash 1 Aug) AND a 416.67 switch credit; that needs an owner decision on which is correct and is not auto-fixed. app.js changed. // 6.434.0 SALARY LABELS — COMMISSION COUNTS A LATE-BUT-PAID CLASS AS ATTENDED (no phantom "expiry true-up"). The v6.433 fill-up-to-paid window fixed the member CARD, but coach commission still counted attendance over the RAW sub.start→end window and paid the leftover as a separate "expiry true-up" line. So a member who attended all 12 of their 12 paid classes — with the last one landing a day or two after the validity date (using up a paid slot, exactly the case v6.433 addressed) — showed on the salary sheet as e.g. "11 attended + 1 expiry true-up" instead of "12 attended". Same TOTAL pay, but a confusing/incorrect label that read as if a class was unattended-but-paid (Noor Chakori: card 12/12 · 100%, but salary said 7 July + a true-up). Commission now counts attendance through the SAME subAttendanceWindow the card uses, in both the cumulative-settlement path (attendedYForSub) and the per-month path — so a late-but-paid class reads as ATTENDED in its own month and no phantom true-up appears (Noor → Jun 4 + Jul 8 = 12 attended, 450, Jennifer 35% = 157.5, unchanged total). This also FIXES a latent over-pay the raw window allowed: a member who attended MORE classes than they paid for made the attended count exceed the package limit, paying the coach beyond the member's fee — the corrected window caps attended at the paid count, so the coach is paid for at most what the member bought. Money totals for normal/under-attending members are unchanged; only over-attenders (paid > fee) are corrected DOWN to the fee. New guard test tests/test-commission-window-consistency.js (13 assertions, the Noor case). Also on the coach salary REPORT: an "expiry true-up" line (the remaining paid-but-not-attended classes paid out when a membership ends) was a faint grey label a coach could misread; it's now a clear amber flag — "⏳ EXPIRED — N paid class(es) not attended, paid in full" — so the coach understands exactly what that line is. app.js + pages.js changed. // 6.433.0 ATTENDANCE "FILL UP TO PAID CLASSES" (fixes card + coach commission). A class a member attended shortly AFTER their package's validity date — using up a paid class slot — was orphaned: the card showed e.g. 11/12 (and paid the coach for 11) even though the member attended 12 of their 12 paid classes. subAttendanceWindow now, for a member's LAST package of a sport (no later renewal), extends the window's END to the date they reached their paid class count — so late-but-within-allotment classes fill the remaining slots (Aseel Chakori: 12th class on 23 Jul, 2 days after a 21 Jul expiry → 12/12), and NEVER beyond it: a member who kept attending extra classes after using up the package stays capped at their paid count, so no coach is over-paid. This flows through the profile card, ATT rate, Ready-to-Renew and coach salaries consistently. Across the current data this credits ~157 previously-orphaned classes (52 members) and caps 8 over-attended classes (6 members) — net a small commission increase reflecting classes coaches actually taught within what members paid for. app.js changed. // 6.432.0 MEMBERS CLEAR-FILTERS HOTFIX + SIDEBAR REORDER/SEPARATOR + IDLE AUTO-REFRESH. (1) HOTFIX: the always-visible inline "Clear filters" button (added v6.428) referenced the default-filter constant that is scoped to the inner refresh() function — clicking it threw ReferenceError (the "something glitched — your data is safe" toast) and did NOT clear the filters, so the member list stayed stuck at 0 whenever a filter combo (e.g. Active + Football + Has balance due) matched nobody. No data was ever lost — only hidden. It now resets with an in-scope inline default. (2) SIDEBAR reordered: Main · Membership · Attendance · Activities · Finance · Shop · Summer Camp, then a visual SEPARATOR, then Engagement · Advice · Team & Sports · Insights · System. (3) AUTO-REFRESH: mouse/keyboard activity now keeps the app "busy" and an incoming cloud change only repaints after 30s idle — and even then it re-renders the SAME screen so filters/search/scroll persist (data refreshes without disturbing what you're doing). app.js + pages.js changed. // 6.430.0 NOTIFICATION BELL → TOP-RIGHT CORNER + EXPIRING KPI TIDY. (1) The notification bell moved out of the cramped sidebar into a Facebook-style floating button pinned to the TOP-RIGHT corner of the viewport, with a proper dropdown (fully inline-styled — the app ships no .notif-panel CSS rule — opening below the bell, right-aligned, with a red unread count). (2) The Expiring screen dropped the "Money Due" KPI card and now lays its bucket cards (Already Expired · ≤3d · ≤7d · Completed · ≤30d · Potential) out in a single row. app.js + pages.js changed. // 6.429.0 SIDEBAR ORDER — the Attendance module now sits right after Membership (was after Activities). Nav order only. app.js changed. // 6.428.0 MEMBERS FILTER CLEANUP + DANGER-ZONE PIN + FOOTER TIDY. MEMBERS: removed the "Use + Add Member…" tip banner, the "Similar names" toggle, and the Enrolled/Created date-range filter; ADDED a "✅ Completed" option to the expiry filter (narrows to Completed-status members) + an always-visible "✕ Clear filters" button — a cleaner, clearer filter bar. DANGER ZONE: the destructive actions (Clear all data / Hard Reset / Load demo) now require a security PIN (4242) before running, on top of the existing admin-only + auto-backup + double-confirm. SIDEBAR FOOTER: the Administrator profile pill and "Refresh from cloud" moved inside the collapsible "More" group. app.js + pages.js changed. // 6.427.0 ATTENDANCE MODULE + RENEWAL SCREENS CONSOLIDATED. (1) The Attendance grid + Attendance Report screens moved into their own "Attendance" sidebar section (out of Activities / Insights); the coach's report sits there too. (2) DISABLED the "Renewals Report" and "Ready to Renew" screens (hidden from the menu) — Ready-to-Renew's data now lives on the Expiring screen. (3) The Expiring screen's KPI row now has all four bucket cards, each a click-to-filter: Expiring ≤3 days, ≤7 days, ✅ Completed (finished classes), ≤30 days — alongside Already Expired / Money Due / Potential Revenue. Nav + Expiring-KPI changes only; underlying screens/logic unchanged. app.js + pages.js changed. // 6.426.0 TRASH + SYNC-CONFLICT VISIBILITY + BRIGHT WEEKLY SCHEDULE. (1) TRASH (admin, System menu): one screen to recover soft-deleted records — archived MEMBERS + deleted INVOICES — each with a one-click Restore (reuses restoreMember/restoreInvoice) and a permanent-delete; plus a read-only "Deletion log" (from the immutable audit trail, so hard-deletes are visible too) and a "Sync conflicts" review. Hard-deleted collections (expenses, salaries, sales…) aren't one-click restorable yet — a follow-up would route them through the same soft-delete flag. (2) SYNC CONFLICT GUARD (visibility): when two devices edited the SAME record at the same time, the client merge already keeps your version + merges both sides' distinct fields; it now also RECORDS which records collided into a device-local log and names them in the existing "synced" notice ("↔ another device also edited X — your version was kept. Review in Trash → Sync conflicts"). Resolution policy is unchanged; this is awareness only (a true write-time optimistic lock is a larger follow-up). (3) The WEEKLY schedule PNG export is now BRIGHT (light theme) to match the day poster — white base, light header/time cells with dark text, light zebra day cells, colour class chips with a soft drop-shadow. app.js + pages.js changed. // 6.425.0 FAMILIES GRID VIEW. The Families screen now defaults to a GRID of compact household cards (name · members · expiring · Paid · Balance · WhatsApp/View/Edit) that flow responsively (~4–5 per row); a ▦/☰ toggle switches to the detailed LIST view (the previous expandable per-member tables), and the choice is remembered. Search works in both. app.js + pages.js changed. // 6.424.0 SIDEBAR MODULES + MEMBERS GRID DEFAULT + EXPENSES SEARCH FIX. (1) Sidebar reorg into new "modules" (sections): Birthdays + Portal Onboarding → "Engagement"; Coach Advice + Advice & Articles → "Advice"; Products + Product Sales → "Shop". Renewal Potential and Duplicate Invoices are disabled (hidden from the menu). (2) The Members screen now defaults to GRID view (an explicit "list" choice still sticks) and the grid is a fixed 5 cards per row — with the default 10 rows/page that's two rows of five. (3) BUGFIX — the Expenses screen search did nothing: with an empty box the description check is skipped, but typing ran e.description.toLowerCase() over every expense and an auto Bank-Commission row (no description) threw, crashing the refresh so the list never filtered. The predicate now coerces the description to a string. app.js + pages.js changed. // 6.423.0 EXPIRING "COMPLETED" GROUP + REMINDERS DISABLED + CLASSES COLLAPSE. (1) The Expiring screen gained a "Completed — finished classes, ready to renew" group (same source as the Ready-to-Renew screen) plus a "✅ Completed" option in the status filter, so members who finished their classes are surfaced here for renewal regardless of their calendar expiry. (2) The Reminders screen is disabled (hidden from the menu) — renewal reminders live on the Expiring screen. (3) On the Classes screen each class card now collapses/expands (click the header; a chevron shows the state), with Collapse-all / Expand-all controls; the roster loads exactly as before, just foldable. app.js + pages.js changed. // 6.422.0 ATTENDANCE-REPORT COUNT FIX + SIDEBAR REVERT FOR ADMIN. (1) CRITICAL: the shared Attendance report (🖼 Attendance EN/AR image) counted present days over the STRICT membership period (sub.start→end), but the profile card, the "Att rate" KPI, sessions-remaining and payroll all count over subAttendanceWindow — which reaches back a 7-day grace before a FIRST package's start so a class trained just before the registration date still counts toward that membership. So a member could show 5/6 · 83% everywhere in the app but the shared report printed 4/6 · 67% — an under-count the club was sending to parents. The report now counts each sport over the SAME subAttendanceWindow, and the printed "current membership" range is widened to that window so no counted class falls outside the stated period. Numbers now match the card exactly. (2) The one-flat-list navigation (v6.419) is REVERTED for admin & reception — they get the collapsible category groups back (Main / Membership / Activities / … / System); only the two simple roles, COACH and STUDENT, keep the flat uncategorized list. pages.js + app.js changed. // 6.421.0 SMART MULTI-SELECT RENEWAL. A member enrolled in 2+ sports now renews via a checkbox list: TICK exactly which sports to renew, each at its OWN editable amount with a live running total — nothing is ever bundled into one figure (the "renew shows 750 instead of 650" complaint). The suggested amount per sport is SMART: it comes from what was actually BILLED as membership for that sport last (the most recent Membership invoice LINE), so a contaminated enrolment price — e.g. a 100 QAR product mistakenly typed into the sport price — does NOT carry into the renewal; the admin can still edit any amount. Saving creates ONE combined receipt with a per-sport line item (so commission still splits per coach), plus one subscription + renewal record per ticked sport; carry-forward credit and post-expiry class deductions are applied per sport via a single toggle, and each sport's expiry is computed on its own (camp = business days). Single-sport members are UNCHANGED — they keep the classic modal with its per-sport deduction/carry banners and expiry override. New guard test tests/test-renewal-multiselect.js (18 assertions drive the real Save handler: smart 650-not-750 prefill, combined 2-line invoice = 1075, untick renews only the selected sport, edited amount honored, single-sport still classic). pages.js changed. // 6.420.0 FULLY DISABLE COACH SALARY. Completes v6.419's "disable My Salary": the coachsalary route is now removed from the coach ROLE_ALLOWED list (so a direct link is BLOCKED, not merely hidden from the menu), AND the "💰 My Salary" summary card on the coach dashboard is removed — a coach no longer sees their salary/commission figures anywhere. Admin/reception salary screens are untouched. app.js + pages.js changed. // 6.419.0 SIDEBAR CLEANUP. Three menu fixes: (1) the coach "My Dashboard" icon was 🧑‍🏫 — a ZWJ emoji that renders as two overlapping figures on some systems (the broken double-avatar the owner circled); swapped to a clean single-glyph 🏠. (2) Disabled the coach "My Salary" PAGE — it's now hidden from the menu (a coach no longer opens the salary page). (3) Flattened the whole navigation into ONE list — the category headers (Main / Membership / Activities / Summer Camp / Team & Sports / Finance / Insights / System) are gone; every page a role can see now sits in a single flat, uncategorized list, keeping the old section ORDER so related pages still group naturally. The footer "More" utilities block is unchanged. app.js changed. // 6.418.0 MEMBERS COUNT SHOWS ARCHIVED TOTAL. The Members header count ("210 of 285") only ever counted NON-archived members, so the true roster size including archived wasn't visible. It now reads "210 of 285 · 413 incl. 128 archived" — the filtered/shown count, the active (non-archived) total, then the grand total WITH archived and how many of those are archived. The " · N incl. M archived" tail only appears when archived members exist; the filtering logic is unchanged (archived still excluded from the list unless the Archived status is chosen). Both the initial render and the live post-filter update carry the breakdown. pages.js changed. // 6.417.0 COACH "MY STUDENTS" — MOBILE COLUMN. The coach dashboard's 👥 My Students table now shows each student's mobile number (between Sports and This-month), rendered as a tap-to-WhatsApp link (wa.me, opens in a new tab) so a coach can message a student directly; a student with no phone shows "—". Display-only, pulled from the roster's already-loaded member record (mem.phone) — no data or permission change. pages.js changed. // 6.416.0 FIX INVOICE FROM THE HEALTH BADGE. The Members table's invoice-health badge (🧾! red / 🧾— no-invoice) opened a popup that only explained the problem and linked out to the Invoice Integrity screen — so fixing a flagged invoice meant leaving the members list. The popup now offers the fix IN PLACE (admin/receptionist only): a RED (mismatch) badge shows a "🔧 Fix invoice" button that opens the member's pricing panel — which adds any missing sport line (e.g. a switched/added Karate that wasn't on the invoice), corrects a drifted price and re-aligns the total on Save; a NO-INVOICE badge shows a "🧾 Generate invoice" button that creates the latest invoice from the member's current enrolled sports & prices (and opens it), or opens the existing one if a duplicate would result. A blue hint explains what each button does and that nothing changes until Save/confirm. GREEN badges are unchanged (info only). No money is written until the underlying pricing-Save / generate confirms. pages.js changed. // 6.415.0 SWITCHED/ADDED SPORT NOW SHOWS ON THE MEMBER CARD. A sport added or switched to is stored as an ENROLLMENT; if it had no matching SUBSCRIPTION row it appeared in Edit Member (which lists enrollments) but was INVISIBLE in the profile card's "Subscription History" (which listed only subscriptions[]) — the owner switched a sport and it "didn't appear", and the SUBS count read low. The card now synthesizes a display row for every enrollment-only sport (with its live attendance from the grid), so all enrolled sports are listed and the count matches. It only synthesizes sports that have NO subscription (a subscribed sport is never duplicated); the synth row has no delete button (remove via Manage sport history / Edit Member). Attendance & commission already handled enrollment-only sports via a fallback — this fixes only the display. Verified live (header 1→2, Karate shows 5/8). pages.js changed. // 6.414.0 BRIGHT DAY-POSTER THEME. The 📲 Day poster (shareable WhatsApp-status image) was dark navy; switched it to a BRIGHT/light theme per owner request — white→light-blue background gradient, light header band with the red brand mark + dark day title + blue date, light time pills with a warm-amber time, and the colour class chips now sit on the light background with a soft drop-shadow for depth plus a subtle text-shadow so the white label/coach text stays readable on every chip colour. Pure colour change (canvas), layout/data unchanged. pages.js changed. // 6.413.0 FIX CAMP VALIDITY DATES. A Summer Camp pass lasts its class-DAYS counted Sun–Thu (camp closed Fri/Sat): "1 month" = 22 class-days, ending on the 22nd. Records created before that rule (or via a plain-calendar path) stored the wrong end — e.g. a 5-Jul start showed 4 Aug (5 Jul + 30 calendar days) instead of the correct 3 Aug (22nd class-day). New admin tool "🛠 Fix camp dates" on the Camp Members page: it recomputes every Summer Camp subscription's end = campEndDateFromClasses(start, class-days), previews every change (member · start · old end → correct end) before applying, downloads a backup first, keeps each member's top-level expiry in sync when it was driven by that camp period, and audits each fix. Non-camp sports and already-correct records are never touched; the tool is idempotent (re-run finds nothing). Verified on the reported case (Rashed 4 Aug → 3 Aug, expiry synced). pages.js changed. // 6.412.0 UNDO SETTLE PENDING. Adds the reverse of the settle-pending action (v6.411): window._salUndoSettlePending(coachId, month) removes the settle payment + its Salary expense, gives the pending back, and RE-OPENS the memberships (clears sub.commissionSettled) so they earn normally again next month. A "↩ Undo settle" button appears on the Salaries row whenever that month has a settlement (salaryRecord.settledPending > 0). Verified the full round-trip: settle → pending 0 + students closed + next month 0; undo → pending restored + students re-opened + settle expense removed; both audited. Lets a settle done by mistake be reversed and redone cleanly. pages.js changed. // 6.411.0 SETTLE PENDING ANYTIME. The "Settle pending in full" action — pay a coach for the not-yet-attended classes NOW and stamp those memberships so they don't carry / true-up next month (even though the coach keeps teaching them) — was only reachable on the FIRST payment of an UNPAID month. An already-PAID or OVER-ADVANCED coach (e.g. Aziz, "Paid 30 Jun", net −2,050) could never reach it. New window._salSettlePending(coachId, month): one click, reachable from the Salaries row 💰 Settle button on ANY coach with unsettled pending (paid or over-advanced) — it pays the pending amount as CASH now (records a payment + Salary expense, per admin choice), stamps each pending membership commissionSettled=this month, and is audited. Verified: this month's pending → 0, paid += pending, membership closed, and NEXT month the same students earn 0 (no double-pay). The over-advanced 💰 Settle button now runs this directly instead of opening the pay dialog where the tick was hidden. pages.js changed. // 6.410.0 COACH ATTRIBUTION FIX + SECURITY. (1) The "I printed coach Karma but the report shows a DIFFERENT coach's students" bug: commission FOLLOWS THE INVOICE LINE's coach, so when a member's sport coach is reassigned, the enrollment gets the new coach but the OLD invoice lines keep the old coach — the old coach keeps earning and shows on the wrong report. New admin tool 🧭 "Coach check" on the Salaries screen lists every membership invoice line whose coach differs from the member's CURRENT enrollment coach for that sport (from → should-be, per member/sport/month) and re-credits it, per row or all, each fix audited. Verified the commission MONEY moves off the old coach onto the current one. (2) SECURITY (Firestore rules, deployed separately): only an ADMIN may change the role map (settings.userRoles) — previously ANY staff login could rewrite it and promote itself to admin or lock everyone out. A bootstrap exception keeps a brand-new club (empty role map) settable by the first login, matching roleForEmail. Emulator-verified (28 rules assertions incl. escalation blocked, lock-out blocked, admin allowed, normal settings writes unaffected, bootstrap). pages.js + firestore.rules changed. // 6.409.0 SALARY + SCHEDULE FEATURES. SALARIES: (a) the "Settle pending in full now" checkbox (already in the Pay dialog — pays net + pending and stamps the memberships so they NEVER true-up again, no double-pay) was UNREACHABLE for over-advanced coaches whose row showed only "Carry" — they now also get a 💰 Settle button, so you can always close a month in full; (b) NEW per-coach 📅 Salary History panel: every month for one coach in one table (Gross · Pending · Advance · Net · Paid · Status) with a Pay button on each month and a total-outstanding summary, so you can review a coach's whole history and take payment action from one place. Money guard verified: settling in month M zeroes that month's pending AND suppresses the later expiry true-up AND any post-settle attended class — the coach is paid exactly once. SCHEDULE: (c) editable custom CLASS NAMES — click a class and set a label like "Kids Kick-Boxing" / "Adult Boxing" (blank = the sport name); shown on the grid and in exports; (d) NEW 📲 Day poster — export ONE day's classes as a portrait 1080×1920 image (brand header, each time slot, colour class chips with label + coach) to share as a WhatsApp status, EN or Arabic, with a day picker defaulting to today. The weekly wide PNG export is unchanged. app.js version only; pages.js changed. // 6.408.0 RELIABILITY WAVE 1 — two safe, self-contained hardening additions. (1) DEPLOY AUTO-RELOAD: an already-open tab kept running the OLD cached app.js after a new deploy until it happened to reload (the "I deployed but it still shows the old version" problem). The app now watches the server directly — it fetches version.json (regenerated to match APP_VERSION at package time) on start, every 15 min, and on tab-refocus, and shows a dismissible blue "a new version is available — reload to update" banner when the served build is newer. It never reloads on its own; "Reload now" flushes any unsaved change first. (Also actually DEFINES showStaleVersionBanner, which the existing cloud-version-stamp check was calling but was a no-op.) (2) GLOBAL ERROR CAPTURE: window.onerror + unhandledrejection catch-all — an unexpected error inside a click handler used to silently break a screen with nothing shown; it now logs to a ring buffer (window.__errorLog, inspectable) and shows a gentle THROTTLED non-blocking toast ("something glitched — your data is safe"), never a modal or reload prompt, so it can't interrupt a payment. Cloud-save failures are handled explicitly elsewhere and don't reach here. app.js changed; new version.json. // 6.407.0 RED-BAR SESSION DIAGNOSIS — the red "The server refused this change — you are still signed in, so signing in again will not help" bar was appearing for sessions that HAD actually lapsed. Root cause: the app decided "you are still signed in" purely from auth.currentUser being non-null, but Firebase keeps currentUser populated even when the ID token is DEAD (revoked/expired refresh token, password change). So a genuinely-lapsed session was told re-auth wouldn't help — the opposite of the truth, and exactly the owner's complaint ("why not extend the session"). Fix: diagnose by actually TRYING to refresh the token. showSessionResumePrompt() now shows the red "server refused" bar ONLY when the token was successfully refreshed (session truly alive) but the write is still denied — a real rules/server refusal that re-auth genuinely can't fix; when the token CANNOT be refreshed it shows the in-place sign-in prompt, which re-authenticates and immediately flushes the pending write (no reload, no lost work). The money-confirm popup (withCloudConfirm) likewise stops pre-judging: it shows one neutral "re-checking your sign-in" message and hands any auth-coded failure to that same self-diagnosing prompt. The proactive token keep-alive (30-min heartbeat + on focus/visibility/online) is unchanged, so in normal foreground use the token never lapses and the bar never appears. app.js changed; test-session-recovery.js extended (22) + audit-batch-poison / auth-stale-retry / cloud-confirm-all updated to the corrected diagnosis. // 6.406.0 INVOICE PDF ARABIC FIX — the PDF invoice mixed English (LTR) and Arabic (RTL) on the SAME line in 29 places (e.g. "Activity · النشاط", "Description · الوصف", and the Period value "July 2026 · يوليو 2026"). Rendered in a browser this looked fine, but the moment a PDF reader RE-EXTRACTS the text — which is exactly what WhatsApp's PDF viewer / "Edit PDF" does — the bidirectional runs reordered and merged, producing the "corrupted invoice" the club reported (garbled labels like "فترةفترة" / "النظام الغذائينشاط" and a Period scrambled to "262026 يوليو"). Every bilingual label is now split into two isolated single-direction runs (<span dir="ltr">English</span> <span dir="rtl">العربية</span>), and the Period VALUE stacks the two months on their own lines — so no line ever mixes directions and the text extracts in correct logical order in every viewer. Numbers/layout unchanged; verified live that the invoice extracts as "Description الوصف", "Subtotal المجموع الفرعي 750.00 QAR", etc. Also: froze the QC harness clock (it read the real system date, so every date-pinned test broke at the 24→25 midnight rollover) and taught it `Node`/`append`/`createTextNode` so the invoice builder runs under test; new guard test tests/test-invoice-pdf-bidi.js (21 assertions) locks the no-mixed-direction rule. pages.js changed. // 6.405.0 READY-TO-RENEW MULTI-SELECT — the Ready to Renew screen's Month, Coach and Sport filters are now multi-select (checkbox pickers, same shared multiFilterHTML/monthMultiHTML the Invoices/Attendance/Due-Payment screens use), so you can view several sports/coaches/months at once instead of one at a time. Two picks UNION (show both); an empty pick means "no filter" (show all); filters AND across each other. A "✕ Clear" button resets them. The old single-value filter shape (a session already open on the screen) migrates to arrays automatically. New behavioural test tests/test-ready-to-renew-multifilter.js (26 assertions actually drive the pickers and read the rendered table, not just the markup). pages.js changed. // 6.404.0 FULL-SYSTEM QC — four QC engineers reviewed every module against new, purpose-built test suites (tests/test-qc-money.js, test-qc-membership.js, test-qc-coaches-camp.js, test-qc-admin-reports.js — 473 new assertions on top of the all-screens smoke test). They found 50 real defects; all 50 are fixed here. SECURITY / DATA-LOSS: Data Import "Apply & Reset" replaced whole collections with NO admin check, NO backup, NO audit entry, and toasted "Imported successfully" after a fire-and-forget save() — it is now admin-only, downloads a backup, confirms twice, writes an audit entry and reports success only after the CLOUD confirms; "Restore from backup" had no admin gate at all (now gated on both the button and the file handler); Users & Roles — which exposes the role map, revoke-access and the preview-as-another-role switch — had no in-page guard (now walls off like Audit/Cleanup); "Clear all data" and "Load demo data" wrote no audit entry (now audited BEFORE the wipe, while the counts still exist) and the wipe missed families/notes/cashCounts/swimGroups/drivers/advices/posts/transfers, which survived as orphans pointing at deleted members. MONEY: Club Revenue valued invoices at the stale cached inv.amount instead of invoiceTotal() and counted a July+August invoice IN FULL in both months (it disagreed with Transactions by 250 and 1,000 QAR on the seeded club); Payments Analysis never month-filtered EXPENSES at all (the multi-select migration deleted filter.month but the expense test still read it) so one month's revenue was shown against ALL-TIME expenses; a payment with no method recorded was dropped from every KPI bucket while still being listed in the table below (headline "Total Revenue 0" over a "Filtered total: 650"); Cash Collection counted soft-deleted withdrawals; a legacy invoice whose amount drifted below its line sum showed a phantom Due on Transactions while invoiceBalance/invoiceStatus/memberOutstanding all said Paid; a coach payment was DOUBLE-COUNTED in salariesPaidInMonth (one 2,000 payout read as 4,000) because _salAddPay writes both a salary record and a mirror Salary expense; isCoachActive() treated a boolean true as INACTIVE, so an affected coach vanished from Salaries entirely and dropped out of payroll cost on the Dashboard and Monthly Report; the Member Commission column labelled "Paid" is really the BILLED line price (the commission basis) — relabelled "Billed", no number changed. COACH PAY: Coach Performance counted voided invoices and archived members, matched revenue on the invoice-level coachId only (a coach whose sport is one line on someone else's multi-sport invoice showed revenue 0 while payroll paid them), built its commission from the whole invoice amount instead of the attendance basis payroll uses, credited a mid-month handover class to BOTH coaches, and printed the attendance percentage where the commission rate belongs ("66.66666666666666%" beside a 30% coach) — it now runs off the canonical commission engine; a coach's own dashboard quoted a payment-basis number the payroll would never pay and showed months from BEFORE the coach joined. DATA LEAKS: archived members appeared in Renewals (and its CSV), Member History, the Dashboard sport donut, Top Coaches by Students, the members workbook and the attendance workbook; soft-deleted invoices/expenses appeared in the member's own portal, Enrolled Members' paid totals, Recent Invoices, the Monthly Report's expenses, the Dashboard's Total Expenses/Net Profit, the expenses workbook (folded into its total), coachStudents(), _recMonths() and memberRenewalValue(). CORRECTNESS: daysUntilBirthday() returned 365 on the birthday ITSELF (UTC-midnight TODAY compared against a local-midnight birthday — the Qatar UTC+3 off-by-one), so the Today tab said "no birthdays" on the day and the row read "turning 15" for a member turning 14; the member portal's "Left" counter and the Attendance Report's landing view both read the stored attendedClasses, which lags the register (the report showed Total Present 0 against 5 live marks); the Members Coach column printed "—" for a member whose coach sits on an enrollment, while the coach filter beside it correctly found them; Renewals credited the headline coach instead of the coach who teaches the renewed sport; the Monthly Report invented a sport named "Summer Camp, Kick Boxing" by keying on the joined invoice label; the Owner Dashboard counted Withdrawn and Frozen members as "Active members" while the screen it links to said otherwise; the Settings page had a missing card wrapper and an unbalanced </div>, so the Data Statistics table leaked onto Preferences and Club Setup and closed an ancestor early; and the Rentals screen threw on open after restoring a backup taken before facilityRates existed (restore bypasses the load-time migrations). Regression: 56 files, 1,295 assertions, 0 failures. app.js + pages.js changed.
// prior: 6.402.0 attendance credit bound + no auto-repaint on big grids.
// prior: 6.400.0 Classes screen (derived rosters from the weekly schedule).
// prior: 6.399.0 attendance popup Sessions-remaining now uses the corrected window.
// prior: 6.398.0 multi-select filters (Invoices + Attendance).
// prior: 6.397.0 payment + invoice module review - one invoice, two totals.
// prior: 6.396.0 removed a duplicate drift detector; bundled the test suite into the package.
// prior: 6.395.0 INSTALLMENTS: stop destroying the payment ledger.
// prior: 6.394.0 no sign-in card for a problem signing in cannot fix.
// prior: 6.393.0 THE FREQUENT permission-denied ON ADD - REAL CAUSE FOUND (immutable auditLog poisoning the atomic batch).
// prior: 6.392.0 CRUD DELETE SAFETY, SWEPT APP-WIDE.
// prior: 6.391.0 DELETE A SPORT AND IT STAYS DELETED.
// prior: 6.390.0 SEARCH NO LONGER OVERRIDES THE STATUS FILTER.
// prior: 6.389.0 NO MORE LOST WORK + SEAMLESS SESSION. Staff complained daily that new members vanished and a red "session expired" bar kept appearing. Root cause found: in cloud mode a FAILED write left the change only in memory and in the LS_KEY cache — and on the next boot the successful cloud read calls _refreshLocalFromCloud(), which OVERWRITES LS_KEY with cloud data that never had the record. Both copies gone. Worse, the red bar told the user to RELOAD to fix it, which is precisely the action that destroyed the unsaved record. Fixes: (1) UNSAVED-WRITE JOURNAL — on every write failure the full state is written SYNCHRONOUSLY to its own localStorage key (survives a hard close/crash, unlike the ASYNC IndexedDB exit-snapshot that may never commit) and cleared ONLY by a CONFIRMED write, so it outlives the cloud-read overwrite; app.js replays it on boot. Recovery restores ONLY records the cloud is MISSING (pure additions — can never overwrite anything); a record present in both but differing is NOT auto-applied, it is surfaced for admin review per the never-silently-merge-money rule. A BLOCKED (suspected-wipe) save is deliberately NOT journaled so a wipe can never be replayed. (2) SEAMLESS SESSION — auth persistence pinned to LOCAL; the ID token is now renewed BEFORE a write when within 10 min of expiry (previously purely reactive: fail, then refresh, then retry, flashing the bar), with the common path kept SYNCHRONOUS so tab-close writes still land, and the expiry learned in the background for restored sessions. (3) NO RED BAR for auth — an auth failure now tries a silent refresh + retry first (resolves nearly every real case invisibly) and only then shows a small in-place "Sign in to continue" card that re-authenticates and immediately flushes the pending write — no reload, and signIn() itself re-sends whatever a dead session left behind. Tests: test-pending-journal 32/32, control-verified (proves the cloud read erases the old cache but cannot touch the journal). app.js + storage.js changed.
// prior: 6.388.0 DATA-LOSS TRUST SWEEP: v6.387 fixed the ONE delete the owner reported, but an audit found the same false-success pattern (bare save() — DEBOUNCED ~1.5s + fire-and-forget — then an immediate 'done' toast) across ~30 MORE money & destructive handlers. Every one could tell the user an action succeeded before the write reached Firebase, so a refresh inside that window silently lost it. All now route through confirmSaved()/withCloudConfirm so success is shown ONLY after the server confirms; on failure the standard red 'NOT saved to the cloud' warning fires instead. Converted (money): bulk-delete invoices, merge invoices, invoice-checker sync/relink/bulk-sync, generate invoice, restore/regenerate invoice, cash collection, cash count, clear salary payments, product restock, salary carry-forward, edit invoice payments, camp price/paid edit, commission-exclude, transfer coach students, rental customer/booking edits, and all 8 ledger-repair tools (fix messy ledgers, fix/normalise totals & methods, re-sync enrollments, recalc camp, merge products, re-date invoices, merge member invoices). Converted (destructive/data): on-device + file restore (whole-DB replace), bulk archive members, remove-enrollment-mistake, delete swim group, remove/clear schedule, sport switch-distribute, freeze membership, household assign/remove/save/disband/rename, manual database wipe. Deferred (deliberate, low-risk): pure settings/config toggles (commission basis/date, category list, sport catalog, reminder templates, preferences, facility rates) and community advice/replies — a failed save there just needs a re-click, no entered data lost. Tests: test-confirmed-sweep control-verified (revert any one handler to the old bare save()+toast -> a REJECTED write still falsely says 'done'; with the fix it says NOT saved). app.js + pages.js changed.
// prior: 6.387.0 DATA-LOSS TRUST FIX: a delete showed a SUCCESS message that the cloud had never confirmed. Deleting a sport ran 'save(); render(); toast(Deleted)' — save() is DEBOUNCED (~1.5s) and fire-and-forget, so the success toast fired BEFORE the write left the browser; refreshing inside that window (or hitting the crash below during the re-render) silently lost the delete while the user had been told it worked. This was NOT one button: an audit found 8 destructive handlers with the same fire-and-forget-then-claim-success pattern, including permanentlyDeleteMember, deleteMemberSport, deleteExpense, deleteRenewal and both duplicate-invoice removers. Fix: new confirmSaved(okMsg) helper in app.js flushes, WAITS for the server, and reports the REAL outcome — success only on a confirmed write, otherwise an explicit 'NOT saved to the cloud' with the reason; all 8 converted, and deleteSportFull (the reported button) now goes through withCloudConfirm with a server read-back of the member doc. Also fixed the companion crash: 6 sorts called b.date.localeCompare(a.date) and threw on any row with no date, aborting the re-render mid-delete — all now String()-guarded. Tests: test-confirmed-delete 16/16, control-verified (restore the old unconditional toast -> a REJECTED write still says 'Deleted'). Zero destructive handlers now claim success without cloud confirmation. app.js + pages.js changed.
// Club logo (uploaded marketing image, used in sidebar/login/favicon contexts)
const BRAND_LOGO = 'data:image/jpeg;base64,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';
const SCHEMA_VERSION = 9;       // v9: clean Summer Camp coachIds from legacy data

// ── Stale-version guard ──────────────────────────────────────────────────
// Each save stamps the running APP_VERSION into the shared document. On load /
// remote update we compare: if the cloud carries a NEWER version than this
// browser is running, this browser is STALE (running cached old code) and is
// blocked from saving — so it can't overwrite newer data with old. The user is
// shown a "please refresh" banner. Purely defensive: never reads/writes records.
function _verCmp(a, b) {
  // Compare dotted versions. Returns -1 if a<b, 0 if equal, 1 if a>b.
  const pa = String(a || '0').split('.').map(n => parseInt(n) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
let _staleVersion = false;   // set true when the cloud is ahead of this browser
let _cloudAppVersion = '';   // highest __appVersion we've seen in the cloud (never downgrade the stamp)
function _checkVersionFromRemote(remoteState) {
  if (!remoteState) return;
  const remoteVer = remoteState.__appVersion;
  if (remoteVer && (!_cloudAppVersion || _verCmp(_cloudAppVersion, remoteVer) < 0)) _cloudAppVersion = remoteVer;
  // Only flag stale when the cloud is STRICTLY newer than what we run.
  if (remoteVer && _verCmp(APP_VERSION, remoteVer) < 0) {
    if (!_staleVersion) {
      _staleVersion = true;
      try { if (typeof showStaleVersionBanner === 'function') showStaleVersionBanner(remoteVer); } catch (_) {}
    }
  }
}

// ── DEPLOY AUTO-RELOAD (v6.408) ───────────────────────────────────────────────
// A newly DEPLOYED build sits on the server, but an already-open tab keeps running the OLD
// cached app.js until it happens to reload — the "I deployed but it's still the old version"
// problem. This watches the SERVER directly: it fetches version.json (regenerated to match
// APP_VERSION at package time) and, when the served build is newer, shows a gentle, dismissible
// "reload to update" banner. It NEVER reloads on its own.
//
// This is DISTINCT from showStaleVersionBanner (defined in pages.js), which fires only when the
// CLOUD DATA carries a newer version stamp — i.e. another device already SAVED on a newer build —
// and there saving is BLOCKED to stop old code overwriting newer data. Here nothing has been saved
// yet, so saving is fine and the message is a friendly nudge, not a stop. Different case, different
// banner — don't merge them.
function showUpdateAvailableBanner(newVer) {
  try {
    if (document.getElementById('update-available-banner')) return;
    if (document.getElementById('stale-version-banner')) return;   // the stronger save-block banner already covers it
    const b = document.createElement('div');
    b.id = 'update-available-banner';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:10002;background:#1d4ed8;color:#fff;' +
      'padding:11px 16px;font-size:13px;line-height:1.4;display:flex;align-items:center;justify-content:center;' +
      'gap:14px;flex-wrap:wrap;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.3)';
    const vlabel = newVer ? ' (v' + escapeHtml(String(newVer)) + ')' : '';
    b.innerHTML =
      `<span>✨ <b>${t('A new version is available', 'يتوفر إصدار جديد')}${vlabel}</b> — ${t('reload to get the latest fixes.', 'أعد التحميل للحصول على آخر التحسينات.')}</span>` +
      `<button id="upd-reload" style="background:#fff;color:#1d4ed8;border:none;border-radius:8px;padding:7px 15px;font-weight:800;cursor:pointer;white-space:nowrap">↻ ${t('Reload now', 'أعد التحميل الآن')}</button>` +
      `<button id="upd-dismiss" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:7px 12px;cursor:pointer;white-space:nowrap">${t('Later', 'لاحقاً')}</button>`;
    document.body.appendChild(b);
    document.getElementById('upd-reload').onclick = () => {
      // Flush anything not yet in the cloud FIRST, so updating never costs a change (it is also
      // journalled to disk and replays on next boot, so this is belt-and-suspenders).
      try { if (window.Storage && window.Storage.flushPending) window.Storage.flushPending(); } catch (_) {}
      setTimeout(() => location.reload(), 120);
    };
    document.getElementById('upd-dismiss').onclick = () => { try { b.remove(); } catch (_) {} };
  } catch (_) {}
}
let _deployPollTimer = null;
async function _pollDeployedVersion() {
  try {
    if (typeof fetch !== 'function') return;
    const res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res || !res.ok) return;                       // no version.json deployed → silently skip
    const j = await res.json();
    const served = j && j.version;
    if (served && _verCmp(APP_VERSION, served) < 0) showUpdateAvailableBanner(served);
  } catch (_) {}   // network hiccup / missing file → never disturb the user
}
function startDeployWatch() {
  if (_deployPollTimer) return;
  _pollDeployedVersion();                                             // check once on start
  _deployPollTimer = setInterval(_pollDeployedVersion, 15 * 60 * 1000);   // then every 15 min
  // Coming back to the tab is the most likely moment a new build has shipped — check then too.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _pollDeployedVersion(); });
  window.addEventListener('focus', _pollDeployedVersion);
}

// ── GLOBAL ERROR CAPTURE (v6.408) ─────────────────────────────────────────────
// The QC smoke test proves every screen RENDERS, but an unexpected error inside a click handler
// (a bad shape, a null, a typo reached only at runtime) could still silently break a screen with
// nothing shown to the user. This installs a catch-all: it logs to a small ring buffer
// (window.__errorLog, inspectable in devtools) and shows a gentle, THROTTLED, non-blocking toast —
// never a modal, never a reload prompt, never anything that could interrupt a payment. Cloud-save
// failures are handled explicitly elsewhere (they never throw), so they don't reach here.
(function installGlobalErrorCapture() {
  if (typeof window === 'undefined' || window.__errorCaptureInstalled) return;
  window.__errorCaptureInstalled = true;
  window.__errorLog = window.__errorLog || [];
  let _lastToastAt = 0;
  const record = (kind, msg, where) => {
    try {
      window.__errorLog.push({ at: new Date().toISOString(), kind, msg: String(msg == null ? '' : msg).slice(0, 300), where: where ? String(where).slice(0, 200) : '' });
      while (window.__errorLog.length > 50) window.__errorLog.shift();
    } catch (_) {}
    try {
      const now = Date.now();
      if (now - _lastToastAt > 8000 && typeof window.toast === 'function' && typeof t === 'function') {
        _lastToastAt = now;
        window.toast(t('Something glitched — your data is safe. If it repeats, reload the page.', 'حدث خلل بسيط — بياناتك آمنة. إذا تكرر، أعد تحميل الصفحة.'), 'error');
      }
    } catch (_) {}
  };
  window.addEventListener('error', (e) => {
    // A resource that failed to load (img/script 404) has no .message — ignore those; only real
    // script errors carry a message. Never let the handler itself throw.
    try { if (e && e.message) record('error', e.message, e.filename ? e.filename + ':' + e.lineno : ''); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    try { const r = e && e.reason; record('promise', (r && (r.message || r.code)) || r || 'unhandled rejection'); } catch (_) {}
  });
})();


// Legacy: kept for the version-bump UI toast, but no longer used to wipe data
const SEED_VERSION = '2026-06-08-v285-invoice-suite'
// TODAY is the actual current date. The data file is mostly Apr/May 2026, so
// for testing in a different real-time period it's fine — comparisons against
// expiry dates etc. use the actual today.
const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
})();
// Default sports list — used to seed state.settings.sports on first install.
// At runtime, SPORTS is a getter that reads the live admin-managed list.
const DEFAULT_SPORTS = ['MMA','Boxing','Kick Boxing','Karate','Taekwondo','Gymnastic','Football','Swimming','Zumba','Summer Camp'];
// Summer Camp is a special sport: enrollment is by duration (1 day / 1 week /
// 1 month / 2 months) instead of by class count. The enrollment form swaps the
// Classes input for a Duration dropdown when this sport is picked.
const SUMMER_CAMP = 'Summer Camp';
const DEFAULT_SUMMER_CAMP_PRICES = [
  { label: '1 day',    days: 1,  price: 175  },
  { label: '1 week',   days: 7,  price: 650  },
  { label: '2 weeks',  days: 14, price: 1300 },
  { label: '3 weeks',  days: 21, price: 1500 },
  { label: '1 month',  days: 30, price: 1750 },
  { label: '6 weeks',  days: 42, price: 2500 },
  { label: '2 months', days: 60, price: 3000 },
];
// Map a camp duration LABEL (e.g. "1 week") to its calendar-days value. Uses the
// admin-configured prices if present, else the defaults. Returns 0 if unknown.
function campDaysForLabel(label) {
  if (!label) return 0;
  const rows = (typeof state !== 'undefined' && state.settings && state.settings.summerCampPrices) || DEFAULT_SUMMER_CAMP_PRICES;
  const row = rows.find(p => p.label === label);
  return row ? (parseInt(row.days) || 0) : 0;
}

// The correct class-day LIMIT for a subscription. For Summer Camp this is the camp
// class-day count (e.g. "1 week" = 5), derived from the duration — NOT the stored
// totalClasses, which on older/auto rows may hold the calendar validity (e.g. 7).
// For other sports it's just the stored totalClasses.
function subClassLimit(sub) {
  if (!sub) return 0;
  if ((sub.activity || '') === SUMMER_CAMP) {
    // A CUSTOM camp stores its EXACT class-day count in totalClasses (same as
    // subscriptionValidEnd's Custom branch), so trust it VERBATIM — never run it
    // through the validity→classes map below, or a custom 7-class camp would be
    // misread as a "1 week"=5 validity and wrongly read 5/5 completed. (v6.490)
    if (sub.durationLabel === 'Custom') return parseInt(sub.totalClasses) || 0;
    if (sub.durationLabel) {
      const d = campDaysForLabel(sub.durationLabel);
      if (d) return campClassCount(d);
    }
    // No label: if the stored total matches a known validity (7/14/21/30/42/60),
    // convert it to the class-day count; otherwise trust the stored total.
    const stored = parseInt(sub.totalClasses) || 0;
    const validityToClasses = { 7: 5, 14: 10, 21: 15, 30: 22, 42: 30, 60: 44, 1: 1 };
    return validityToClasses[stored] || stored;
  }
  return parseInt(sub.totalClasses) || 0;
}

// The attendance window for a subscription that does NOT overlap the member's next
// period of the same activity. Returns { from, to } (to is exclusive of next start).
// v6.307 — from this date onward, a renewal's attendance window absorbs the "gap"
// between the previous package's end and this one's start (see subAttendanceWindow).
// Gated by date so ALL historical attribution + already-settled coach commission is
// left exactly as it was (forward-only). Effective 2026-07-06.
const CONTIGUOUS_ATTENDANCE_FROM = '2026-07-06';
// How far BEFORE its start date the first package of a sport may claim attendance. The case this
// exists for is "the member trained a few days before the subscription was dated/paid" (the
// reported one was 4 days), so a week covers it. Anything older belongs to no package and must
// NOT spend this one's credit — that is what produced "2 of 8 sessions left" on a package that
// had only just started. Tunable: raise it if your paperwork commonly lags more than a week.
// (v6.402 — see subAttendanceWindow.)
const FIRST_PACKAGE_GRACE_DAYS = 7;
function subAttendanceWindow(m, sub) {
  let from = sub.start || null;
  let to = sub.end || null;
  if (m && Array.isArray(m.subscriptions) && sub.start) {
    const sameAct = m.subscriptions
      .filter(s => (s.activity || '') === (sub.activity || '') && s.start && s.start > sub.start)
      .sort((a, b) => a.start.localeCompare(b.start));
    if (sameAct.length) {
      // End the window the day BEFORE the next period starts (no boundary overlap).
      // Use addDays (local date parts) — NOT `new Date(start+'T00:00:00')` + toISOString(),
      // which reads local midnight back as UTC and silently shifts the day BACK in a
      // UTC-ahead zone like Qatar (UTC+3), shrinking the window by a day. (v6.373)
      const exclusive = addDays(sameAct[0].start, -1);
      if (!to || (exclusive && exclusive < to)) to = exclusive;
    }
    // CARRY ATTENDANCE ACROSS A RENEWAL GAP (forward-only). When this package is a
    // renewal that STARTS after a previous same-sport package ENDED, pull the window
    // back to the day AFTER that package's end, so classes attended in the gap (after
    // the old package expired, before this one started) count toward THIS (the new)
    // membership — not lost. Cut = the OLD package's end date. Only applies to packages
    // starting on/after CONTIGUOUS_ATTENDANCE_FROM, so nothing historical shifts.
    if (from && from >= CONTIGUOUS_ATTENDANCE_FROM) {
      const earlier = m.subscriptions
        .filter(s => (s.activity || '') === (sub.activity || '') && s.end && s.start && s.start < sub.start)
        .sort((a, b) => a.end.localeCompare(b.end));
      if (earlier.length) {
        // Use the previous package's CAPPED end (the date of ITS last PAID class), not its raw
        // calendar end — so classes the member attended OVER that package's paid limit fall into
        // THIS renewal instead of inflating the old package (Layan: Gymnastic 9/8 in Jul → the 9th
        // class moves to the Aug renewal, leaving Jul 8/8 and Aug 1/8). subAttendanceWindow recurses
        // ONLY into earlier packages (start < this start), so the chain terminates at the first
        // package — no infinite loop. (v6.452)
        const prevSub = earlier[earlier.length - 1];
        const prevWin = subAttendanceWindow(m, prevSub);
        const prevEnd = (prevWin && prevWin.to) || prevSub.end;   // capped end, else raw end
        if (prevEnd && prevEnd < from) {                    // a real gap (or back-to-back)
          // Day AFTER prevEnd, computed in UTC so the local timezone never shifts the
          // date (new Date('...T00:00:00') is LOCAL; toISOString() is UTC — that combo
          // silently moves the day in a non-UTC zone like Qatar UTC+3).
          const d = new Date(prevEnd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1);
          const dayAfter = d.toISOString().slice(0, 10);
          if (dayAfter < from) from = dayAfter;             // absorb the gap into this new package
        }
      } else {
        // FIRST package for this sport: there is NO earlier period that could own an earlier
        // mark, so attendance recorded shortly BEFORE the start date — the member trained before
        // the subscription was dated/paid — belongs to THIS package. Without reaching back those
        // classes are ORPHANED: the member card showed "Kick Boxing 0/12" while the attendance
        // grid showed 2 attended on 15 & 18 Jul for a package dated 19 Jul. (v6.386)
        //
        // BUT the reach-back must be BOUNDED (v6.402). Dropping the bound entirely (from = null)
        // meant EVERY mark that sport ever had counted against the new package: a member who had
        // trained for months under an older, unrecorded arrangement showed "2 of 8 sessions left"
        // the day his 8-class package started, because months of history were spending its
        // credit. The intent was only ever "a few days before it was dated", so allow a grace
        // window before the start and no further. Anything older belongs to no package and is
        // simply not counted against this one.
        const graceFrom = addDays(sub.start, -FIRST_PACKAGE_GRACE_DAYS);
        from = graceFrom || sub.start;
      }
    }
    // FILL UP TO PAID CLASSES + CARRY OVERFLOW FORWARD (v6.433, generalised in v6.452). A package
    // owns attendance from `from` onward but only up to its PAID class count: the window ENDS on the
    // date of the limit-th class, so a class attended shortly AFTER the validity date still fills the
    // last paid slot (12th class on 23 Jul, 2 days after a 21 Jul expiry → 12/12), and NEVER beyond it.
    // This now applies to EVERY package, not only the last one — previously an over-attended package
    // that HAD a later renewal kept counting all its marks (Layan: Gymnastic 9/8 in Jul, 0/8 in the Aug
    // renewal). Capping it here + the carry-back above (which reaches to this package's CAPPED end)
    // moves the extra class into the renewal instead (Jul 8/8, Aug 1/8). Unused classes leave the
    // window as-is: the LAST package stays OPEN (a late class still fills a slot); a MIDDLE package
    // keeps its day-before-next-start end.
    if (m.dailyAttendance) {
      const limit = (typeof subClassLimit === 'function') ? (parseInt(subClassLimit(sub)) || 0) : (parseInt(sub.totalClasses) || 0);
      if (limit > 0) {
        // Upper bound for deciding the cap: a MIDDLE package must not count the NEXT package's marks
        // (bound by the day-before-next-start `to` set above); the LAST package is UNBOUNDED so a
        // late-but-within-allotment class still counts toward its slots.
        const upperBound = sameAct.length ? to : null;
        const marks = [];
        for (const mk of Object.keys(m.dailyAttendance)) {
          const sm = m.dailyAttendance[mk] && m.dailyAttendance[mk][sub.activity || ''];
          if (!sm || typeof sm !== 'object') continue;
          for (const d of Object.keys(sm)) {
            if (sm[d] !== 'Y') continue;
            const iso = mk + '-' + String(parseInt(d, 10)).padStart(2, '0');
            if (from && iso < from) continue;
            if (upperBound && iso > upperBound) continue;
            marks.push(iso);
          }
        }
        marks.sort();
        if (marks.length >= limit) to = marks[limit - 1];   // cap: window ends on the limit-th class
        else if (!sameAct.length) to = null;                // last package, unused classes → leave open
        // else: middle package with unused classes → keep the day-before-next-start end set above
      }
    }
  }
  return { from, to };
}
// SPORTS reflects the CURRENT enabled sports (admin can add/disable on the Sports page).
Object.defineProperty(globalThis, 'SPORTS', {
  configurable: true,
  get() {
    const list = state?.settings?.sports;
    if (Array.isArray(list) && list.length) {
      return list.filter(s => s && (s.enabled !== false)).map(s => typeof s === 'string' ? s : s.name);
    }
    return DEFAULT_SPORTS;
  },
});
// ALL_SPORTS (including disabled) — used for showing historical records.
Object.defineProperty(globalThis, 'ALL_SPORTS', {
  configurable: true,
  get() {
    const list = state?.settings?.sports;
    if (Array.isArray(list) && list.length) {
      return list.map(s => typeof s === 'string' ? s : s.name);
    }
    return DEFAULT_SPORTS;
  },
});
// "Private" sport variants share a base sport's icon/colour but are priced &
// scheduled separately. Convention: name ends with " (Private)".
function isPrivateSport(s) { return typeof s === 'string' && /\(private\)\s*$/i.test(s.trim()); }
function baseSportName(s) { return typeof s === 'string' ? s.replace(/\s*\(private\)\s*$/i, '').trim() : s; }
// Expense categories — admin-configurable from Settings page.
// DEFAULT_EXPENSE_CATEGORIES seeds new installs; once settings.expenseCategories
// is populated, the getter below reads from there. "Others" is always available
// as a safety-net fallback the admin can't accidentally delete (see settings UI).
const DEFAULT_EXPENSE_CATEGORIES = [
  'Bank Commission','Equipment','Cleaning','Utilities','Marketing','Subscriptions',
  'Transport','Operations','Rent','Maintenance','Salary','Refund',
  'Cash collected by owner','Others',
];
// Reserved categories that should always exist (used by other features or
// kept as common safety options). Admin cannot delete these from settings.
// 'Refund' backs the Camp Closure refund flow (money paid back to a member). (v6.470)
const RESERVED_EXPENSE_CATEGORIES = ['Refund', 'Cash collected by owner', 'Others'];

Object.defineProperty(globalThis, 'EXP_CATS', {
  get() {
    const cats = state?.settings?.expenseCategories;
    const base = (Array.isArray(cats) && cats.length) ? cats : DEFAULT_EXPENSE_CATEGORIES;
    // Always ensure reserved categories are available, even on old installs whose
    // settings.expenseCategories array predates them. Insert just before "Others".
    const out = base.slice();
    for (const reserved of RESERVED_EXPENSE_CATEGORIES) {
      if (!out.includes(reserved)) {
        const othersIdx = out.indexOf('Others');
        if (othersIdx >= 0) out.splice(othersIdx, 0, reserved);
        else out.push(reserved);
      }
    }
    return out;
  },
});

const INVOICE_CATS = ['Membership','Court Rental','Boxing Room','Product','Other'];
// Validity periods in days for membership/enrollment transactions. The stored value is the DAY
// COUNT (what expiry math uses); the dropdown shows a friendly label (1 day … 6 months).
const VALIDITY_OPTIONS = [1, 7, 14, 30, 60, 90, 180];
const DEFAULT_VALIDITY = 30;
// Friendly EN/AR label per preset day-count. Anything not listed falls back to "<n> days".
const VALIDITY_PRESET_LABELS = {
  1: ['1 day', 'يوم'], 7: ['1 week', 'أسبوع'], 14: ['2 weeks', 'أسبوعان'],
  30: ['1 month', 'شهر'], 60: ['2 months', 'شهران'], 90: ['3 months', '3 أشهر'], 180: ['6 months', '6 أشهر'],
};
function validityLabel(days) {
  const d = parseInt(days) || 0;
  const p = VALIDITY_PRESET_LABELS[d];
  const tt = (en, ar) => (typeof t === 'function' ? t(en, ar) : en);
  return p ? tt(p[0], p[1]) : `${d} ${tt('days', 'يوم')}`;
}
// Full <option> list for a validity <select>, with the friendly labels. Any stored value that
// isn't a preset (e.g. a legacy 45-day membership) is appended so it stays selected, not dropped.
function validityOptionsHtml(selected) {
  const sel = parseInt(selected) || DEFAULT_VALIDITY;
  let html = VALIDITY_OPTIONS.map(v => `<option value="${v}" ${v === sel ? 'selected' : ''}>${validityLabel(v)}</option>`).join('');
  if (!VALIDITY_OPTIONS.includes(sel)) html += `<option value="${sel}" selected>${validityLabel(sel)}</option>`;
  return html;
}
// Sanity bounds for the Classes field — stop fat-finger entries (e.g. typing a
// year "2026" into the classes box) from polluting attendance math and coach
// reports. Above SOFT we ask for confirmation; above HARD we reject outright.
const MAX_CLASSES_SOFT = 60;    // unusual but possible (e.g. long intensive plan)
const MAX_CLASSES_HARD = 365;   // nothing legitimate exceeds this

// Nationality list — GCC + Arab world + common expat communities first, then
// the rest A–Z. Used as suggestions in a datalist (free text still allowed).
const NATIONALITIES = [
  // GCC
  'Qatari','Saudi','Emirati','Kuwaiti','Bahraini','Omani',
  // Arab world
  'Egyptian','Jordanian','Lebanese','Syrian','Palestinian','Iraqi','Yemeni',
  'Sudanese','Moroccan','Tunisian','Algerian','Libyan',
  // Common expat in Qatar
  'Indian','Pakistani','Bangladeshi','Filipino','Nepali','Sri Lankan',
  'Iranian','Turkish','Afghan',
  // Other major
  'American','British','Canadian','Australian',
  'French','German','Italian','Spanish','Portuguese','Dutch','Greek','Russian',
  'Chinese','Japanese','Korean','Indonesian','Malaysian','Thai','Vietnamese',
  'South African','Nigerian','Kenyan','Ethiopian','Ghanaian',
  'Brazilian','Argentine','Mexican','Colombian','Chilean',
  'Albanian','Armenian','Austrian','Azerbaijani','Belarusian','Belgian',
  'Bosnian','Bulgarian','Croatian','Czech','Danish','Estonian','Finnish',
  'Georgian','Hungarian','Icelandic','Irish','Israeli','Kazakh','Latvian',
  'Lithuanian','Luxembourgish','Macedonian','Maltese','Moldovan','Mongolian',
  'Montenegrin','Norwegian','Polish','Romanian','Serbian','Slovak','Slovenian',
  'Swedish','Swiss','Tajik','Turkmen','Ukrainian','Uzbek',
  'Burmese','Cambodian','Laotian','Singaporean','Taiwanese',
  'Algerian','Angolan','Beninese','Botswanan','Burkinabe','Burundian',
  'Cameroonian','Cape Verdean','Central African','Chadian','Comorian','Congolese',
  'Djiboutian','Equatorial Guinean','Eritrean','Eswatini','Gabonese','Gambian',
  'Guinean','Guinea-Bissauan','Ivorian','Lesothan','Liberian','Madagascan',
  'Malawian','Malian','Mauritanian','Mauritian','Mozambican','Namibian',
  'Nigerien','Rwandan','São Toméan','Senegalese','Seychellois','Sierra Leonean',
  'Somali','South Sudanese','Tanzanian','Togolese','Ugandan','Zambian','Zimbabwean',
  'Bolivian','Costa Rican','Cuban','Dominican','Ecuadorian','Salvadoran',
  'Guatemalan','Guyanese','Haitian','Honduran','Jamaican','Nicaraguan',
  'Panamanian','Paraguayan','Peruvian','Surinamese','Trinidadian','Uruguayan','Venezuelan',
  'Fijian','New Zealander','Papua New Guinean','Samoan','Tongan','Vanuatuan',
  'Bhutanese','Maldivian','Stateless','Other',
];

// Add `days` days to a YYYY-MM-DD date string, return YYYY-MM-DD.
function addDays(dateStr, days) {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + parseInt(days));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Add N BUSINESS days (Sun–Thu) to a date, skipping Fridays (5) and Saturdays (6),
// which are the weekend in Qatar. Returns the date that is N business days after
// the start (the start day itself is not counted). Used for Summer Camp, where a
// "week" is five business days, Sunday through Thursday.
function addBusinessDays(dateStr, n) {
  if (!dateStr || n == null) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  let added = 0;
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(parseInt(n));
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    const wd = d.getDay();            // 0=Sun .. 6=Sat
    if (wd !== 5 && wd !== 6) remaining--;   // count only Sun–Thu
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Camp durations are sold as "1 week", "2 weeks", etc. A camp WEEK is five
// business days (Sun–Thu), so convert week-based durations to business days for
// the expiry date. Day/month durations stay on the calendar. `days` is the value
// stored on the camp price row (7=1 week, 14=2 weeks, …, 30=1 month, 1=1 day).
const CAMP_BUSINESS_DAYS_PER_WEEK = 5;
// Number of camp CLASS days for a sold duration, counted in business days
// (Sun–Thu). A week = 5 class days, a month = 22, two months = 44. Day-based and
// other durations fall back to a sensible business-day count. `days` is the value
// on the camp price row (1, 7, 14, 21, 30, 42, 60).
function campClassCount(days) {
  const n = parseInt(days) || 0;
  const map = { 1: 1, 7: 5, 14: 10, 21: 15, 30: 22, 42: 30, 60: 44 };
  if (map[n] != null) return map[n];
  // Generic fallback: whole weeks → 5/week; months (multiples of 30) → ~22/month.
  if (n > 0 && n % 7 === 0) return (n / 7) * CAMP_BUSINESS_DAYS_PER_WEEK;
  if (n > 0 && n % 30 === 0) return (n / 30) * 22;
  return n;
}
// Map a stored class count back to its camp duration label. Class counts are now
// business-day based (1 week=5, 1 month=22, …); this also accepts legacy calendar
// counts (7, 30, …) so old records still resolve.
function campLabelForClasses(classCount) {
  const n = parseInt(classCount) || 0;
  if (!n) return '';
  // Prefer a business-day class-count match; only fall back to legacy calendar
  // day counts if nothing matches, so 30 classes → "6 weeks" not "1 month".
  for (const p of (DEFAULT_SUMMER_CAMP_PRICES || [])) {
    if (campClassCount(p.days) === n) return p.label;
  }
  for (const p of (DEFAULT_SUMMER_CAMP_PRICES || [])) {
    if (p.days === n) return p.label;
  }
  return '';
}
function campEndDate(startDate, days) {
  if (!startDate) return null;
  const n = parseInt(days) || 0;
  if (n <= 0) return startDate;
  // Camp expiry counts BUSINESS days (Sun–Thu; the camp is CLOSED Fri/Sat). A camp pass gives
  // exactly its class-days and expires on the LAST one: "1 month" = 22 business days → the 22nd
  // working day from the start (e.g. Sun 14-Jun start → Mon 13-Jul). The `days` passed in is the
  // camp price-row value (7=1 week, 30=1 month, …); convert it to the business-day CLASS count,
  // then walk that many working days. (v6.357 — owner rule; was calendar days.)
  const classes = (typeof campClassCount === 'function') ? campClassCount(n) : n;
  return campEndDateFromClasses(startDate, classes);
}

// THE authoritative "valid until" date for a subscription line — the same date the
// member modal shows. We trust the STORED end (what the admin set/edited); only
// when it is missing or clearly invalid do we derive it (camp: duration label, then
// the validity day-count). This stops the invoice from silently recomputing the
// camp end from a stale durationLabel and disagreeing with the member's real end.
// The issue date to print for ONE invoice line: an explicit per-line issueDate,
// else the sport's subscription start (when that sport was enrolled), else the
// invoice's own issue date. Keeps each sport's date independent so adding a new
// sport later never rewrites an earlier sport's printed issue date.
function lineIssueDate(li, subStart, invDate) {
  return (li && li.issueDate) || subStart || invDate || null;
}

function subscriptionValidEnd(sub) {
  if (!sub) return null;
  if (sub.start && sub.end && sub.end > sub.start) return sub.end;   // stored end wins
  if (!sub.start) return sub.end || null;
  const isCamp = (sub.activity || '') === SUMMER_CAMP;
  if (isCamp) {
    // A CUSTOM camp expires on the Nth camp-day (its own class-day count), not a preset window. (v6.458)
    if (sub.durationLabel === 'Custom') {
      const cc = parseInt(sub.totalClasses) || 0;
      if (cc > 0 && typeof campEndDateFromClasses === 'function') return campEndDateFromClasses(sub.start, cc);
    }
    // Camp expiry is BUSINESS-day based (Sun–Thu) — go through campEndDate, not raw addDays. (v6.357)
    const labelDays = (typeof campDaysForLabel === 'function' && sub.durationLabel) ? campDaysForLabel(sub.durationLabel) : 0;
    if (labelDays > 0 && typeof campEndDate === 'function') return campEndDate(sub.start, labelDays);
  }
  if (sub.validity && typeof addDays === 'function') return addDays(sub.start, sub.validity);
  return sub.end || null;
}

// End date for a CUSTOM camp duration given the number of class days directly
// (business days, Sun–Thu). N class days span N-1 business days from the start.
function campEndDateFromClasses(startDate, classCount) {
  if (!startDate) return null;
  const n = parseInt(classCount) || 0;
  if (n <= 0) return startDate;
  return addBusinessDays(startDate, n - 1);
}

// THE end date for an enrolment / subscription row. (v6.458 — Custom-camp expiry.)
// • A CUSTOM Summer Camp package: the admin-typed day count IS the window — the pass runs exactly
//   that many camp-days (Sun–Thu) and expires on the LAST one (campEndDateFromClasses). Booking 12
//   days from Wed 5 Aug ⇒ Thu 20 Aug (NOT the 22-day "1 month" default it was inheriting).
// • A PRESET camp ("1 week"/"1 month"/…): keeps its own calendar validity, which stays admin-EDITABLE
//   (campEndDate converts it to the business-day span). Not touched.
// • Any other sport: plain calendar validity.
function rowEndDate(sport, start, validity, classCount, durationLabel, isCustomFlag) {
  if (!start) return null;
  const isCamp = sport === SUMMER_CAMP;
  if (isCamp) {
    const custom = (durationLabel === 'Custom') || !!isCustomFlag;
    if (custom) {
      const cc = parseInt(classCount) || 0;
      if (cc > 0 && typeof campEndDateFromClasses === 'function') return campEndDateFromClasses(start, cc);
    }
    const v = parseInt(validity) || 0;
    return (typeof campEndDate === 'function') ? campEndDate(start, v) : addDays(start, v);
  }
  return addDays(start, parseInt(validity) || 0);
}

// Whole days from start→end (used to recover a subscription's validity from its
// dates when no explicit validity was stored, so legacy ends aren't mangled).
function daysBetween(startStr, endStr) {
  if (!startStr || !endStr) return null;
  const a = new Date(startStr + 'T00:00:00'), b = new Date(endStr + 'T00:00:00');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

let state = {
  user: null,
  members: [],
  coaches: [],
  invoices: [],
  expenses: [],
  salaries: [],
  sales: [],
  advices: [],            // coach→student advice: {id, memberId, coachId, text, date}
  trials: [],
  rentals: [],            // booking log: facility, customer, date, hours, amount
  rentalCustomers: [],    // {id, name, phone, qid, notes} — reusable rental contacts
  schedule: [],           // class schedule: {id, day, slot, sport, coachId}
  swimGroups: [],         // swimming groups: {id, name, coachId, memberIds:[], order, createdAt}
  auditLog: [],           // {id, ts, user, action, target, summary, details}
  settings: {
    expiringSoonDays: 3,
    lowStockThreshold: 3,
    commissionBasis: 'attendance',   // 'payment' (fee counts in payment month) | 'attendance' (per class attended)
    commissionStartDate: '2026-06-01',  // commission only counts invoices/subs dated ON OR AFTER this; '' = no cutoff
    facilityRates: {      // default hourly rates per facility, editable in Settings
      'Football Court': 150,
      'Boxing Room': 100,
      'Swimming Pool': 200,
    },
    sports: [             // populated by load()/migrations on first run from DEFAULT_SPORTS
    ],
  },
  route: 'dashboard',
};

// Facility list — used in rental forms + dropdowns
const FACILITIES = ['Football Court', 'Boxing Room', 'Swimming Pool'];

// ─── Persistence ──────────────────────────────────────────────────────────
// save()/load() now delegate to the Storage abstraction (storage.js), which
// chooses between localStorage and Firebase based on firebase-config.js.
// We tag the state with the current schema version on every save.

// localStorage capacity monitoring. Browsers cap localStorage at ~5MB; once
// it's full, setItem throws QuotaExceededError and changes are silently lost.
// We warn the admin before that happens (gentle at 70%, urgent at 90%) and
// loudly if a save actually fails.
const LS_LIMIT_BYTES = 5 * 1024 * 1024;   // ~5 MB typical quota
let _lastStorageWarnLevel = 0;            // 0 / 70 / 90 — dedupe repeat warnings

// Storage-capacity warning that doubles as a one-click backup: clicking the
// toast triggers a JSON backup export so the admin can act immediately.
function storageToast(msg, type) {
  toast(msg, type);
  const el = document.querySelector('.toast');
  if (el) {
    el.style.cursor = 'pointer';
    el.title = 'Click to export a backup now';
    el.addEventListener('click', () => {
      if (typeof window.downloadBackup === 'function') window.downloadBackup();
    });
  }
}

function isCloudStorage() {
  try { return !!(window.Storage && typeof window.Storage.isCloud === 'function' && window.Storage.isCloud()); }
  catch (_) { return false; }
}

// ─── Multi-device safe merge ────────────────────────────────────────────────
// The cloud stores ONE document and saves overwrite it wholesale. To let two
// devices work at once without losing data, we 3-way MERGE at the record level
// instead of blindly replacing local state with the remote snapshot.
//
//   base   = the data as we last loaded/synced it (per-record reference point)
//   local  = what THIS device currently has (may include unsaved edits)
//   remote = what the OTHER device just saved
//
// Rule per record id (across every id-keyed collection):
//   • changed remotely only  → take remote
//   • changed locally only   → keep local
//   • changed on both        → keep local, and flag a conflict warning
//   • new on either side      → keep it
//   • a record present in base but missing on one side = a delete; honor a delete
//     ONLY if the other side did not also modify that record (otherwise keep it,
//     to avoid silently dropping someone's concurrent edit).
// Net effect: no record from either device is ever lost; only true same-record
// double-edits surface a warning.

const MERGE_COLLECTIONS = [
  'members', 'coaches', 'invoices', 'expenses', 'salaries', 'sales', 'advices',
  'trials', 'rentals', 'rentalCustomers', 'schedule', 'auditLog', 'products',
  'families', 'notes', 'cashCounts', 'swimGroups', 'posts', 'membershipTransfers', 'drivers',
];
let _syncBase = null;        // snapshot of data as last loaded/synced
// A confirmed record that goes missing from a remote snapshot is only treated as a
// genuine remote DELETE after it's absent for TWO consecutive syncs. A single stale /
// partial snapshot (multi-listener race) must NEVER delete a record — that caused a
// just-saved paid salary to vanish after refresh. Key = 'collection|id'.
const _delStrikes = new Map();
const _stableStr = v => { try { return JSON.stringify(v); } catch (_) { return String(v); } };
function _indexById(arr) {
  const m = new Map();
  for (const r of (Array.isArray(arr) ? arr : [])) {
    if (r && r.id != null) m.set(r.id, r);
  }
  return m;
}
// Capture the current data as the new merge base (deep copy so later edits to
// `state` don't mutate the base out from under us).
// ─── SINGLE-WRITER SESSION LOCK ─────────────────────────────────────────
// Bank-style: only ONE session can write at a time. Other sessions are
// read-only and can view everything but cannot save. An admin in a read-only
// session may "take over" (which puts the previous writer into read-only).
// The lock lives in a separate cloud doc with a heartbeat; if the holder goes
// idle/closes, the lock auto-releases so nobody is locked out for long.
const SessionLock = (() => {
  const HEARTBEAT_MS = 30 * 1000;    // refresh our hold every 30s
  const STALE_MS = 5 * 60 * 1000;    // a hold with no heartbeat for 5 min is dead
  const sessionId = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  let readOnly = false;              // is THIS session currently read-only?
  let holder = null;                 // current lock record from cloud
  let heartbeatTimer = null;
  let started = false;
  let lastBlockedToast = 0;

  function isCloud() {
    try { return !!(window.Storage && window.Storage.isCloud && window.Storage.isCloud()); } catch (_) { return false; }
  }
  function holderName() {
    // All staff share one admin login, so the username can't tell them apart.
    // Use a per-DEVICE label (set once, remembered in this browser) instead.
    try {
      const label = localStorage.getItem('bs-device-name');
      if (label) return label;
    } catch (_) {}
    try {
      const u = state.user;
      return (u && (u.name || u.email)) || 'A device';
    } catch (_) { return 'A device'; }
  }

  // Ask for (or update) this browser's device/staff label. Remembered locally.
  function promptDeviceName(force) {
    let current = '';
    try { current = localStorage.getItem('bs-device-name') || ''; } catch (_) {}
    if (current && !force) return current;
    const entered = prompt(
      (typeof t === 'function' ? t('Name this device (so others know who holds the editing session): e.g. Reception, Ahmed', 'سمِّ هذا الجهاز (ليعرف الآخرون من يملك جلسة التعديل): مثل الاستقبال، أحمد') : 'Name this device: e.g. Reception, Ahmed'),
      current || ''
    );
    const name = (entered || '').trim().slice(0, 30);
    if (name) { try { localStorage.setItem('bs-device-name', name); } catch (_) {} return name; }
    return current;
  }
  function myRole() {
    try { return (typeof accountRole === 'function') ? accountRole() : 'admin'; } catch (_) { return 'admin'; }
  }
  function isStale(lock) {
    return !lock || !lock.sessionId || (Date.now() - (lock.ts || 0) > STALE_MS);
  }
  function iHoldIt(lock) { return lock && lock.sessionId === sessionId; }
  // True when the lock is held under THIS device's name (same physical device/browser,
  // e.g. another tab or a stale hold from a previous load). A device must never lock
  // itself out, so we treat this as "ours" and re-claim rather than going read-only.
  function sameDevice(lock) {
    if (!lock || !lock.holderName) return false;
    try {
      const myLabel = localStorage.getItem('bs-device-name');
      if (!myLabel) return false;   // no explicit label → can't be sure it's us
      return String(lock.holderName).trim() === String(myLabel).trim();
    } catch (_) { return false; }
  }

  async function claim() {
    const lock = { sessionId, holderName: holderName(), role: myRole(), ts: Date.now() };
    const ok = await window.Storage.setLock(lock);
    if (ok) { holder = lock; setReadOnly(false); }
    return ok;
  }

  function startHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(async () => {
      if (readOnly) return;
      // Refresh our timestamp so others see we're alive.
      try { await window.Storage.setLock({ sessionId, holderName: holderName(), role: myRole(), ts: Date.now() }); } catch (_) {}
    }, HEARTBEAT_MS);
  }

  function setReadOnly(ro) {
    const changed = (ro !== readOnly);
    readOnly = ro;
    if (changed) renderBanner();
  }

  // The persistent banner at the top of the screen telling the user their mode.
  function renderBanner() {
    try {
      let bar = document.getElementById('session-lock-bar');
      if (!readOnly) { if (bar) bar.remove(); return; }
      const who = (holder && holder.holderName) ? holder.holderName : 'another user';
      const canTakeOver = myRole() === 'admin';
      const msg = `${t('🔒 Read-only —', '🔒 وضع القراءة فقط —')} ${t('the editing session is held by', 'جلسة التعديل بحوزة')} <b>${escapeHtml(who)}</b>. ${t('Your changes can’t be saved until you take over.', 'لا يمكن حفظ تغييراتك حتى تستلم الجلسة.')}`;
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'session-lock-bar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;background:#7c2d12;color:#fff;padding:8px 14px;display:flex;align-items:center;gap:12px;font-size:13px;box-shadow:0 2px 12px rgba(0,0,0,.3)';
        document.body.appendChild(bar);
      }
      bar.innerHTML = `<div style="flex:1">${msg}</div>
        <span style="opacity:.8;font-size:11px;white-space:nowrap">${t('This device:', 'هذا الجهاز:')} <b>${escapeHtml(holderName())}</b> <a href="#" id="session-rename" style="color:#fde68a">${t('(rename)', '(تغيير)')}</a></span>
        ${canTakeOver
          ? `<button id="session-takeover" style="background:#fff;color:#7c2d12;border:none;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;white-space:nowrap">${t('Take over session', 'استلام الجلسة')}</button>`
          : `<span style="opacity:.85;font-size:12px;white-space:nowrap">${t('Ask an admin, or wait', 'انتظر أو اطلب المشرف')}</span>`}`;
      const btn = document.getElementById('session-takeover');
      if (btn) btn.onclick = takeOver;
      const rn = document.getElementById('session-rename');
      if (rn) rn.onclick = (e) => { e.preventDefault(); promptDeviceName(true); renderBanner(); };
    } catch (e) { console.warn('[lock] banner error', e); }
  }

  async function takeOver() {
    if (myRole() !== 'admin') { toast(t('Only an admin can take over', 'المشرف فقط يمكنه الاستلام'), 'error'); return; }
    const who = (holder && holder.holderName) ? holder.holderName : 'the current user';
    if (!confirm(`${t('Take over the editing session?', 'استلام جلسة التعديل؟')}\n\n${t('This will put', 'سيتم تحويل')} ${who} ${t('into read-only mode. Make sure they are not mid-edit.', 'إلى وضع القراءة فقط. تأكّد أنه ليس في منتصف تعديل.')}`)) return;
    const ok = await claim();
    if (ok) { toast(t('✅ You now hold the editing session', '✅ أنت الآن تملك جلسة التعديل')); }
    else toast(t('Could not take over — try again', 'تعذّر الاستلام — حاول مجدداً'), 'error');
  }

  // React to lock changes pushed from the cloud.
  function onLock(lock) {
    holder = lock;
    if (iHoldIt(lock)) { setReadOnly(false); return; }
    // Same physical device (another tab / stale hold under our own name) → take it
    // back instead of locking ourselves out.
    if (sameDevice(lock)) { claim(); return; }
    // Someone else holds it (and it's fresh) → we're read-only.
    if (!isStale(lock)) { setReadOnly(true); return; }
    // Stale/empty lock → it's up for grabs. If WE were the writer, re-claim;
    // otherwise stay read-only until the user takes over (avoids two auto-claims
    // racing). The very first claim happens in start().
    if (!readOnly) claim();
  }

  async function start() {
    // DECOMMISSIONED in the multi-document multi-user model: there is no single-
    // writer lock anymore, so every session is always writable. The function (and
    // this module's read-only-safe getters) are kept so existing callers in
    // pages.js / app.js don't break, but it now does nothing except guarantee
    // writable mode for this session.
    if (started) return;
    started = true;
    setReadOnly(false);
  }

  function notifyBlockedSave() {
    const now = Date.now();
    // Throttle so a burst of blocked saves doesn't stack popups.
    if (now - lastBlockedToast < 600) return;
    lastBlockedToast = now;
    const who = (holder && holder.holderName) ? holder.holderName : t('another user', 'مستخدم آخر');
    renderBanner();
    // If a blocked-save popup is already open, don't open another.
    if (document.getElementById('blocked-save-modal')) return;
    const isAdmin = myRole() === 'admin';
    const overlay = document.createElement('div');
    overlay.id = 'blocked-save-modal';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div role="alertdialog" aria-modal="true" style="background:var(--surface,#fff);color:var(--text,#1a1a1a);max-width:420px;width:100%;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden;border:1px solid var(--border,#e3e3e8)">
        <div style="padding:18px 20px;border-bottom:1px solid var(--border,#eee);display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">🔒</span>
          <div style="font-size:16px;font-weight:800">${t('Action blocked', 'تم منع الإجراء')}</div>
        </div>
        <div style="padding:18px 20px;font-size:14px;line-height:1.6">
          ${t('Sorry, you can’t do this action right now because the editing session is held by', 'عذراً، لا يمكنك تنفيذ هذا الإجراء الآن لأن جلسة التعديل بحوزة')}
          <b>${escapeHtml(who)}</b>.
          <div style="margin-top:10px;color:var(--text-dim,#777);font-size:12.5px">
            ${isAdmin
              ? t('You can take over the session to edit — this will switch the other device to read-only.', 'يمكنك استلام الجلسة للتعديل — سيتحول الجهاز الآخر إلى وضع القراءة فقط.')
              : t('Please wait until they finish, or ask an admin to take over.', 'يرجى الانتظار حتى ينتهوا، أو اطلب من المشرف استلام الجلسة.')}
          </div>
        </div>
        <div style="padding:14px 20px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid var(--border,#eee)">
          ${isAdmin ? `<button id="blocked-takeover" style="background:var(--accent,#7a1f2b);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer">${t('Take over session', 'استلام الجلسة')}</button>` : ''}
          <button id="blocked-dismiss" style="background:transparent;border:1px solid var(--border,#ccc);color:var(--text,#333);border-radius:8px;padding:9px 16px;font-weight:600;cursor:pointer">${t('OK', 'حسناً')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => { overlay.remove(); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const dismiss = document.getElementById('blocked-dismiss');
    if (dismiss) dismiss.addEventListener('click', close);
    const take = document.getElementById('blocked-takeover');
    if (take) take.addEventListener('click', () => { close(); try { takeOver(); } catch (_) {} });
  }

  return {
    start,
    isReadOnly: () => readOnly,
    notifyBlockedSave,
    takeOver,
    setDeviceName: () => { const n = promptDeviceName(true); renderBanner(); return n; },
    _sessionId: () => sessionId,
    // Who currently holds the editing session (the device that can edit).
    holderInfo: () => holder ? { name: holder.holderName || 'A device', role: holder.role || '', ts: holder.ts || 0, sessionId: holder.sessionId, isMe: iHoldIt(holder), stale: isStale(holder) } : null,
    iHoldSession: () => !readOnly,
    myDeviceName: () => holderName(),
  };
})();


function snapshotSyncBase(src) {
  const s = src || state;
  const base = {};
  for (const key of MERGE_COLLECTIONS) {
    try { base[key] = JSON.parse(JSON.stringify(s[key] || [])); }
    catch (_) { base[key] = []; }
  }
  try { base.settings = JSON.parse(JSON.stringify(s.settings || {})); } catch (_) { base.settings = {}; }
  _syncBase = base;
}

// ─── Element-level list merge (concurrency-safe lists) ──────────────────────
// Firestore replaces arrays wholesale, so two people adding to the SAME record's
// list (invoice payments, member subscriptions, salary payments…) could overwrite
// each other. These helpers 3-way-merge a list BY ELEMENT so every addition sticks
// and edits/removals are still honoured. Used by BOTH the client merge (below) and
// the cloud WRITE (storage.js, via window._mergeArrayById) so the fix is end-to-end.
function _isPlainObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function _elKey(e) {
  if (!_isPlainObj(e)) return 'v:' + _stableStr(e);
  if (e.id != null) return 'id:' + e.id;
  if (e._rid != null) return 'rid:' + e._rid;
  // `_sid` = subscription rows' stable id. MUST be recognized here: without it a
  // subscription is keyed by its whole CONTENT, so the moment any field changes
  // (e.g. an attendance tick bumps attendedClasses) a concurrent merge treats the
  // edited row as a NEW element and keeps BOTH copies — one clone per sync, growing
  // unbounded (the "infinite duplicate subscriptions" bug). Keying by _sid makes an
  // edit stay the SAME element. (v6.295.0)
  if (e._sid != null) return 'sid:' + e._sid;
  if (e.pid != null) return 'pid:' + e.pid;
  // id-less element (enrollment / invoice line-item / payment) → identity by CANONICAL
  // content. MUST use the SAME key as the dedupe guard (_enrKey): it ignores transient
  // UI-only fields (_originalSport/_paid/_attended) and sorts keys, so the merge collapses
  // exactly the rows the cleaner removes. If they disagree, the sync merge RE-ADDS a
  // duplicate the cleaner just deleted → the cleanup "bounces back" (v6.301.0). This also
  // makes the merge itself self-dedupe id-less rows everywhere. (Payments have none of the
  // ignored fields, so their keying is unchanged.)
  return 's:' + (typeof _enrKey === 'function' ? _enrKey(e) : _stableStr(e));
}
// ── DELETE TOMBSTONES (v6.303.0) ────────────────────────────────────────────
// When you delete a list row (a subscription, payment, invoice line…) the sync merge
// would otherwise treat the still-in-the-cloud copy as a fresh remote ADD and RE-ADD it
// — so the delete "bounces back" and a "Deleted ✓" is a lie. A tombstone remembers
// "this element was deleted" so no sync can resurrect it for a while. Only UNIQUE-ID
// keys (id:/rid:/sid:/pid:) are tombstoned — content keys (s:…) could collide across
// different records, and those rows are kept unique by the one-per-sport / dedupe guards.
const _elTomb = (typeof window !== 'undefined') ? (window.__elTomb = window.__elTomb || new Map()) : new Map();
const _EL_TOMB_MS = 6 * 60 * 1000;   // honour a delete against stale syncs for ~6 minutes
const _isIdKey = k => /^(id|rid|sid|pid):/.test(k);
// A content-keyed row (s:…, e.g. an ENROLLMENT or invoice line — no stable id) is only unique
// WITHIN one record's field, so its tombstone MUST be scoped (record:id:field|key), or deleting
// e.g. Raed's MMA could wrongly drop an identical MMA row on another member. Unique-id keys
// (id/rid/sid/pid) are globally unique, so they tombstone UNSCOPED (scope ignored). (v6.308.0)
function _tombKey(key, scope) { return (_isIdKey(key) || !scope) ? key : (scope + '|' + key); }
function _elTombstone(key) { _elTomb.set(key, Date.now() + _EL_TOMB_MS); }   // caller passes the final (scoped) key
function _elIsTombstoned(key) { const t = _elTomb.get(key); if (t == null) return false; if (Date.now() > t) { _elTomb.delete(key); return false; } return true; }
// Explicitly remember a deleted element so a stale/concurrent sync can't resurrect it. Pass
// `scope` (e.g. 'members:270:enrollments') for content-keyed rows so the tombstone is per-record.
if (typeof window !== 'undefined') { window._tombstoneEl = (e, scope) => { try { _elTombstone(_tombKey(_elKey(e), scope)); } catch (_) {} }; }

// ── SPORT-LEVEL TOMBSTONE (v6.391) ──────────────────────────────────────────
// A content-keyed row (an ENROLLMENT — no stable id) is identified by its CONTENT, so if the
// cloud's copy was edited since our base (another device changed the price, classes, coach…)
// its key no longer matches the row we deleted. Both defences then fail at once: the
// "removed locally & remote unchanged" rule can't see the delete, and the per-element
// tombstone is filed under the OLD content key. The row came back — the exact "I deleted
// Swimming, refreshed, it's still there" report.
//
// The app already guarantees one enrollment per sport per member, so (record, field, sport) is a
// safe stronger identity for this purpose. Tombstoning at that level survives any edit to the
// cloud copy. Subscriptions don't need it (they key off a stable _sid) but it is harmless there.
const _sportTombKey = (scope, sport) => scope + '|sport:' + String(sport || '').trim().toLowerCase();
function _sportTombstoned(el, scope) {
  if (!el || !scope) return false;
  const s = el.sport || el.activity;
  return s ? _elIsTombstoned(_sportTombKey(scope, s)) : false;
}
if (typeof window !== 'undefined') {
  window._tombstoneSport = (scope, sport) => { try { if (scope && sport) _elTombstone(_sportTombKey(scope, sport)); } catch (_) {} };
}

// 3-way merge of a list by element key: adds from either side kept, edits favour
// local on true conflict, a removal is honoured only if the other side didn't touch it.
function _mergeArrayById(baseArr, localArr, remoteArr, scope) {
  const L = Array.isArray(localArr) ? localArr : [];
  const R = Array.isArray(remoteArr) ? remoteArr : [];
  const B = Array.isArray(baseArr) ? baseArr : [];
  const bi = new Map(), li = new Map(), ri = new Map();
  for (const e of B) bi.set(_elKey(e), e);
  for (const e of L) li.set(_elKey(e), e);
  for (const e of R) ri.set(_elKey(e), e);
  // An element that WAS in the base but is now gone from local = a delete → remember it, so the
  // same element arriving from a stale remote isn't re-added below.
  // v6.392: this used to tombstone UNIQUE-ID keys only, because a bare content key ('s:…') can
  // collide across records. But _tombKey SCOPES content keys to record:id:field, which removes
  // that collision — so content-keyed rows (enrollments, invoice line items, payments with no
  // id) can safely be auto-tombstoned too, and their deletes now survive a stale remote the same
  // way id-keyed ones always have.
  // (A content key is only tombstoned when we HAVE a scope — unscoped it could still collide
  // across records, which is exactly why this was id-only before.)
  for (const k of bi.keys()) { if (!li.has(k) && (_isIdKey(k) || scope)) _elTombstone(_tombKey(k, scope)); }
  const out = [], seen = new Set();
  const order = [...L.map(_elKey), ...R.map(_elKey)];   // local order first, then remote-only
  for (const k of order) {
    if (seen.has(k)) continue; seen.add(k);
    const b = bi.get(k), l = li.get(k), r = ri.get(k);
    const inL = li.has(k), inR = ri.has(k), inB = bi.has(k);
    if (inL && inR) {
      const lCh = !inB || _stableStr(l) !== _stableStr(b);
      const rCh = !inB || _stableStr(r) !== _stableStr(b);
      if (lCh && rCh && _stableStr(l) !== _stableStr(r)) out.push(l);   // conflicting edit → local
      else if (rCh && !lCh) out.push(r);                               // only remote edited
      else out.push(l);                                                // only local edited / identical
    } else if (inL && !inR) {
      const lCh = !inB || _stableStr(l) !== _stableStr(b);
      if (inB && !lCh) { /* removed remotely, untouched locally → drop */ } else out.push(l);
    } else if (inR && !inL) {
      const rCh = !inB || _stableStr(r) !== _stableStr(b);
      // Drop if: removed locally & remote unchanged (normal delete), OR this element was
      // explicitly tombstoned by a delete (honour it even if it isn't in the base). The
      // tombstone lookup uses the SCOPED key so a content-keyed enrollment delete sticks
      // per-record without touching an identical row on another member. (v6.308.0)
      // _sportTombstoned also catches a remote row whose CONTENT changed since our base — its
      // content key differs from the one we deleted, so the per-element tombstone above misses
      // it. (v6.391)
      if ((inB && !rCh) || _elIsTombstoned(_tombKey(k, scope)) || _sportTombstoned(r, scope)) { /* deleted → do not resurrect */ } else out.push(r);
    }
  }
  return out;
}
// 3-way merge of ONE record's fields: element-merge arrays, deep-merge nested maps,
// scalars favour whichever side changed (local wins a true conflict). Used when a
// record was edited on BOTH sides so no field/element is dropped.
// 3-way deep merge of a nested map. When `del` is supplied it is a factory producing the
// backend's "delete this key" sentinel (Firestore FieldValue.delete()) and the result is a
// WRITE payload, so removed keys are explicitly marked for deletion. Without `del` the result
// is a plain READ merge and removed keys are simply absent.
//
// Deletion is the hard case. An absent key on one side is AMBIGUOUS: it can mean "I deleted
// it" or "the other side just added it". Only `base` (the last-synced snapshot) separates the
// two. Getting this wrong resurrected cleared attendance cells — clearing a cell removed the
// key locally while the cloud still held the old mark, the merge read that as "remote added
// it", and the N came straight back on the next refresh. (v6.341)
function _mergeRecord(base, local, remote, scope, del) {
  const b = _isPlainObj(base) ? base : {}, l = _isPlainObj(local) ? local : {}, r = _isPlainObj(remote) ? remote : {};
  const out = { ...l };
  const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
  for (const k of keys) {
    const lv = l[k], rv = r[k], bv = b[k], inL = (k in l), inR = (k in r), inB = (k in b);
    // Only a LEAF (a scalar such as an attendance cell's 'Y'/'N') may be inferred as deleted.
    // An absent array or sub-object is NOT treated as a deletion: a Firestore doc that simply
    // never carried `subscriptions` would otherwise wipe the member's real subscriptions. For
    // those, the old rule holds — keep whichever side has the data. (v6.324 protection, kept.)
    const _isLeaf = v => v === null || (typeof v !== 'object');
    if (inL && !inR) {
      // Absent remotely. If it was in base, is a leaf, and I never touched it, then the OTHER
      // side deleted it → honour their delete. Otherwise keep mine (added, changed, or a subtree).
      if (inB && _isLeaf(bv) && _stableStr(lv) === _stableStr(bv)) { delete out[k]; continue; }
      out[k] = lv; continue;
    }
    if (!inL && inR) {
      // Absent locally. If it was in base, is a leaf, and remote still holds the base value,
      // then *I* deleted it and nobody else changed it → the delete must WIN. (This branch used
      // to keep `rv` unconditionally, which is what put a cleared attendance N straight back.)
      // If remote changed it since my base, that is a newer write by someone else → keep theirs.
      if (inB && _isLeaf(bv) && _stableStr(rv) === _stableStr(bv)) { if (del) out[k] = del(); else delete out[k]; continue; }
      out[k] = rv; continue;
    }
    // pass a per-field scope so a content-keyed delete tombstone is honoured on the READ
    // merge too (not just the cloud write) — makes an enrollment delete stick even if a
    // stale second tab pushes the row back. (v6.308.0)
    if (Array.isArray(lv) || Array.isArray(rv)) { out[k] = _mergeArrayById(bv, lv, rv, scope ? scope + ':' + k : undefined); continue; }
    if (_isPlainObj(lv) && _isPlainObj(rv)) { out[k] = _mergeRecord(bv, lv, rv, scope ? scope + ':' + k : undefined, del); continue; }
    const lCh = _stableStr(lv) !== _stableStr(bv), rCh = _stableStr(rv) !== _stableStr(bv);
    out[k] = (rCh && !lCh) ? rv : lv;   // only remote changed → remote; else local (incl. conflict)
  }
  return out;
}
if (typeof window !== 'undefined') { window._mergeArrayById = _mergeArrayById; window._mergeRecord = _mergeRecord; }

// Merge one collection. Returns { merged: [...], conflicts: n }.
function _mergeCollection(baseArr, localArr, remoteArr, collKey) {
  const base = _indexById(baseArr);
  const local = _indexById(localArr);
  const remote = _indexById(remoteArr);
  const _dk = id => (collKey || '') + '|' + id;
  // Records WITHOUT an id can't be merged by key. To avoid ever dropping them,
  // handle them separately: if this collection contains any id-less records,
  // keep the side (local vs remote) that has more of them, and never lose data.
  const localNoId = (Array.isArray(localArr) ? localArr : []).filter(r => !r || r.id == null);
  const remoteNoId = (Array.isArray(remoteArr) ? remoteArr : []).filter(r => !r || r.id == null);
  const allIds = new Set([...local.keys(), ...remote.keys(), ...base.keys()]);
  // RECORD-LEVEL DELETE TOMBSTONES (v6.392). A record that was CONFIRMED (in base) and is now
  // gone locally is a local delete. Without remembering that, the branch below only drops the
  // still-present remote copy when it is byte-identical to base — so if ANY other device touched
  // that record since (even just a stamp), the delete was ignored and the record came straight
  // back. Nested arrays have had this protection since v6.303; top-level collections never did,
  // which left every hard delete in the app (expenses, salaries, sales, products, trials,
  // rentals, schedule, advices, …) able to resurrect. Tombstoning here fixes all of them at once
  // without changing what any screen reads, and it expires on its own so it can never wedge.
  for (const id of base.keys()) {
    if (!local.has(id)) { try { _elTombstone(_dk(id)); } catch (_) {} }
  }
  const out = [];
  let conflicts = 0;
  const conflictItems = [];   // v6.426 — which records both devices edited (for the conflict guard)
  for (const id of allIds) {
    const b = base.get(id), l = local.get(id), r = remote.get(id);
    const inL = local.has(id), inR = remote.has(id), inB = base.has(id);
    if (inR) _delStrikes.delete(_dk(id));   // present in remote → clear any pending-delete strike
    // Present on both sides → compare against base to decide.
    if (inL && inR) {
      const lChanged = !inB || _stableStr(l) !== _stableStr(b);
      const rChanged = !inB || _stableStr(r) !== _stableStr(b);
      if (lChanged && rChanged && _stableStr(l) !== _stableStr(r)) {
        // Both sides edited this record → field/element-level merge so NObody's list
        // entry (payment, sport, …) or field is dropped, instead of keeping local whole.
        out.push(_mergeRecord(b, l, r, (collKey || '') + ':' + id)); conflicts++;
        const _nm = (l && (l.name || l.ref || l.description || l.title || l.customerName)) || (r && (r.name || r.ref || r.description)) || ('#' + id);
        conflictItems.push({ coll: collKey, id, name: String(_nm) });
      } else if (rChanged && !lChanged) {
        out.push(r);                         // only remote changed
      } else {
        out.push(l);                         // only local changed, or identical
      }
      continue;
    }
    // Present on only one side.
    if (inL && !inR) {
      // Missing remotely. If it was CONFIRMED (in base, unchanged locally) the other
      // device MAY have deleted it — but only honour that after TWO consecutive absences,
      // so a single stale/partial snapshot can't delete a confirmed record (paid salary).
      // The strike itself carries the "was confirmed, now missing once" state across the
      // base advancing to the record-less remote, so genuine deletes still propagate.
      const lChanged = inB ? _stableStr(l) !== _stableStr(b) : false;
      const hadStrike = _delStrikes.has(_dk(id));
      if ((inB && !lChanged) || hadStrike) {
        if (hadStrike) { _delStrikes.delete(_dk(id)); /* 2nd consecutive absence → honour delete (drop) */ }
        else { _delStrikes.set(_dk(id), 1); out.push(l); /* 1st absence → KEEP this round */ }
      } else out.push(l);   // genuine fresh local add (never confirmed) → always keep
      continue;
    }
    if (inR && !inL) {
      const rChanged = !inB || _stableStr(r) !== _stableStr(b);
      // v6.392: the tombstone also honours the delete when the remote copy was TOUCHED since our
      // base — the case the byte-comparison alone could never recognise, which is how a deleted
      // expense/salary/sale/product reappeared after another device stamped it.
      if ((inB && !rChanged) || _elIsTombstoned(_dk(id))) { /* deleted locally → drop */ }
      else out.push(r);
      continue;
    }
    // (in base only → deleted on both → drop)
  }
  // Re-attach id-less records as a UNION of both sides, de-duplicated by content key —
  // never drop the smaller side. The old "keep whichever side has more" silently lost the
  // other side's distinct rows (e.g. Device A adds 1 schedule slot while remote already has
  // 2 different ones → A's slot vanished). (v6.324 architecture review)
  const _noIdSeen = new Set();
  for (const r of localNoId.concat(remoteNoId)) { const k = _elKey(r); if (_noIdSeen.has(k)) continue; _noIdSeen.add(k); out.push(r); }
  return { merged: out, conflicts, conflictItems };
}

// SYNC CONFLICT GUARD (v6.426) — device-local visibility only; does NOT change how conflicts
// resolve (the field/element merge above already keeps both sides' distinct data; a true
// same-field clash keeps local). Records what another device changed at the same time so the
// owner is AWARE, and fires an optional throttled UI notice. Not synced to the cloud.
function _recordSyncConflicts(items) {
  if (!items || !items.length) return;
  try {
    if (typeof window === 'undefined') return;
    window.__syncConflictLog = window.__syncConflictLog || [];
    window.__syncConflictLog.unshift({ ts: new Date().toISOString(), count: items.length, items: items.slice(0, 20) });
    if (window.__syncConflictLog.length > 50) window.__syncConflictLog.length = 50;
    if (typeof window.__onSyncConflict === 'function') window.__onSyncConflict(items);
  } catch (_) {}
}
if (typeof window !== 'undefined') window._recordSyncConflicts = _recordSyncConflicts;

// Merge a remote snapshot into local state in place. Returns the conflict count.
function mergeRemoteIntoState(remoteState) {
  if (!remoteState) return { conflicts: 0, changed: false };
  _checkVersionFromRemote(remoteState);   // flag if cloud is newer than this browser
  const base = _syncBase || {};
  let totalConflicts = 0;
  let changed = false;
  const allConflictItems = [];   // v6.426 conflict-guard visibility
  for (const key of MERGE_COLLECTIONS) {
    if (!(key in remoteState) && !(key in state)) continue;
    const localArr = Array.isArray(state[key]) ? state[key] : [];
    const remoteArr = Array.isArray(remoteState[key]) ? remoteState[key] : [];
    // ── READ-SIDE PARTIAL-SNAPSHOT GUARD (v6.382 — the core "data randomly disappears" fix) ──
    // A remote snapshot can arrive PARTIAL: a per-collection listener that hasn't seeded yet, a
    // reconnect after sleep, or a dropped sub-collection read → a collection shows EMPTY (or a tiny
    // fraction) while local holds many real records. Merging it makes every one of those records
    // look "deleted remotely" and drops them from local state. A genuine bulk delete is not a normal
    // action AND is separately blocked on the WRITE side, so: if remote is drastically smaller than
    // local for a sizeable collection, this snapshot is untrustworthy for that collection — SKIP it,
    // keep local intact. `__allowEmptySave` (explicit Clear/Restore) bypasses the guard.
    if (!window.__allowEmptySave && localArr.length >= 8 && remoteArr.length < localArr.length * 0.5) {
      console.warn(`[merge] ⛔ SKIP "${key}" — remote has ${remoteArr.length} vs local ${localArr.length} (partial/stale snapshot); kept local to prevent data loss.`);
      try { if (typeof window !== 'undefined' && typeof window.__onPartialSnapshotSkipped === 'function') window.__onPartialSnapshotSkipped(key, localArr.length, remoteArr.length); } catch (_) {}
      continue;
    }
    const before = _stableStr(state[key] || []);
    const { merged, conflicts, conflictItems } = _mergeCollection(base[key] || [], localArr, remoteArr, key);
    if (_stableStr(merged) !== before) { state[key] = merged; changed = true; }
    totalConflicts += conflicts;
    if (conflictItems && conflictItems.length) allConflictItems.push(...conflictItems);
  }
  // settings: object — take remote only for keys local didn't change vs base.
  if (remoteState.settings) {
    const bs = (base.settings) || {}, ls = state.settings || {}, rs = remoteState.settings;
    const out = { ...ls };
    for (const k of Object.keys(rs)) {
      const lChanged = _stableStr(ls[k]) !== _stableStr(bs[k]);
      if (!lChanged) out[k] = rs[k];   // local untouched → accept remote
    }
    if (_stableStr(out) !== _stableStr(ls)) { state.settings = out; changed = true; }
  }
  // The CONFIRMED remote snapshot becomes the new shared base — NOT the merged
  // result. The merged state also contains our own local records that the cloud has
  // not echoed back yet; if those went into the base, the very next remote sync would
  // see them as "in base + local but missing remotely" and DELETE them (silent data
  // loss). Basing on the confirmed remote keeps unsynced local adds/edits as genuine
  // local changes that the merge preserves until the cloud confirms them.
  snapshotSyncBase(remoteState);
  // Records that ARRIVED from the cloud are marked "known" so the create-audit
  // tracker won't attribute another device's invoices/expenses to this one.
  try {
    if (window.__knownRecIds) {
      for (const inv of (remoteState.invoices || [])) window.__knownRecIds.invoices.add(String(inv.id));
      for (const e of (remoteState.expenses || [])) window.__knownRecIds.expenses.add(String(e.id));
    }
  } catch (_) {}
  // BELT-AND-SUSPENDERS (v6.301.0): dedupe the MERGED result so no remote snapshot can
  // ever leave a duplicate in local state (which the next save would push back to the
  // cloud). With _elKey now aligned to _enrKey the merge already self-dedupes; this
  // guarantees it even if a future path slips through.
  try { if (typeof _dedupeSubsGuard === 'function') _dedupeSubsGuard(); } catch (_) {}
  // Conflict-guard visibility: another device edited the same record(s) this sync.
  if (allConflictItems.length) { try { _recordSyncConflicts(allConflictItems); } catch (_) {} }
  return { conflicts: totalConflicts, changed };
}

// BACKSTOP against the duplicate-subscriptions bug (v6.296.0). A subscription's
// `_sid` is a UNIQUE per-row id (registration `s<mid>_<i>`, renewal `s<ts>`, …), so
// two rows sharing a `_sid` are ALWAYS the same subscription cloned — never a legit
// distinct row (genuine rows, incl. family/twins, always get their own `_sid`). This
// runs on EVERY save and collapses same-`_sid` rows to ONE (keeping the most-attended),
// so the bloat can never persist or regrow no matter what created it. Cheap: it only
// rebuilds a member's list when a duplicate `_sid` is actually present; rows without a
// `_sid` are left untouched. Attendance is unaffected (it lives in dailyAttendance).
// Canonical signature of an enrollment for exact-duplicate detection. Enrollments have
// NO stable id and are meant to be ONE per sport, so two rows with the same content are
// always redundant clones. Built from sorted keys so field order can't fool it; volatile
// UI-only fields (stripped before save anyway) are ignored.
function _enrKey(e) {
  if (!e || typeof e !== 'object') return 'v:' + JSON.stringify(e);
  // IGNORE display-only / volatile fields so two otherwise-identical rows key the SAME.
  // `coach` is a DISPLAY string derived from `coachId` (which IS kept) and flips between
  // null / '—' (no-coach placeholder) / a name — that flip made two identical Summer-Camp
  // invoice lines look DIFFERENT, so the sync merge doubled them and the dedupe guard
  // couldn't collapse them (v6.310.0). coachId still distinguishes genuinely different coaches.
  const IGN = { _originalSport: 1, _paid: 1, _attended: 1, coach: 1 };
  const keys = Object.keys(e).filter(k => !IGN[k]).sort();
  return keys.map(k => k + '=' + JSON.stringify(e[k])).join('|');
}
function _dedupeSubsGuard() {
  let collapsed = 0, membersHit = 0, enrCollapsed = 0, enrMembers = 0, liCollapsed = 0, liInv = 0;
  for (const m of (state.members || [])) {
    // ── subscriptions: dedupe by the stable unique id `_sid` ──
    const subs = m && m.subscriptions;
    if (Array.isArray(subs) && subs.length >= 2) {
      const sids = new Set(); let hasDupe = false;
      for (const s of subs) { const k = s && s._sid; if (k == null) continue; if (sids.has(k)) { hasDupe = true; break; } sids.add(k); }
      if (hasDupe) {
        const seen = new Map(); const out = [];
        for (const s of subs) {
          const k = s && s._sid;
          if (k == null) { out.push(s); continue; }              // id-less row → keep as-is
          const prev = seen.get(k);
          if (!prev) { seen.set(k, s); out.push(s); continue; }
          collapsed++;                                            // duplicate _sid → collapse
          if ((s.attendedClasses || 0) > (prev.attendedClasses || 0)) { const i = out.indexOf(prev); if (i >= 0) out[i] = s; seen.set(k, s); }
        }
        m.subscriptions = out; membersHit++;
      }
    }
    // ── enrollments: STRICTLY ONE PER SPORT (the app's invariant — _enrollmentsMatchSubs
    // treats a repeated sport as drift, the edit path matches by sport). Keying by content
    // missed near-identical same-sport rows (e.g. a 2nd "Summer Camp" differing in a hidden
    // field), which is the "duplicate sport I deleted keeps coming back" bug. Collapse to one
    // per sport, KEEPING the row whose coach matches the active subscription (else the first).
    // v6.302.0
    const enr = m && m.enrollments;
    if (Array.isArray(enr) && enr.length >= 2) {
      let subsBySport = null;
      try { subsBySport = (typeof _activeSubsBySport === 'function') ? _activeSubsBySport(m) : null; } catch (_) {}
      const seen = new Map(); const out = []; let hit = false;
      for (const e of enr) {
        const sp = e && e.sport;
        if (!sp) { out.push(e); continue; }                    // rows without a sport → keep
        const kept = seen.get(sp);
        if (!kept) { seen.set(sp, e); out.push(e); continue; }
        enrCollapsed++; hit = true;                            // duplicate sport → collapse
        const sub = subsBySport && subsBySport.get(sp);
        if (sub && (e.coachId || null) === (sub.coachId || null) && (kept.coachId || null) !== (sub.coachId || null)) {
          const i = out.indexOf(kept); if (i >= 0) out[i] = e; seen.set(sp, e);   // prefer the coach-correct row
        }
      }
      if (hit) { m.enrollments = out; enrMembers++; }
    }
  }
  // ── invoice line-items: no id → collapse EXACT-content duplicate lines (the merge
  // doubled them). NEVER touches invoice.amount, so REVENUE cannot move — only the
  // redundant line rows are removed so the line-sum matches the (correct) stored amount.
  for (const inv of (state.invoices || [])) {
    const li = inv && inv.lineItems;
    if (!Array.isArray(li) || li.length < 2) continue;
    const seen = new Set(); const out = []; let hit = false;
    for (const l of li) { const k = _enrKey(l); if (seen.has(k)) { liCollapsed++; hit = true; continue; } seen.add(k); out.push(l); }
    if (hit) { inv.lineItems = out; liInv++; }
  }
  if (collapsed > 0) { try { console.warn(`[dedupe-guard] collapsed ${collapsed} duplicate subscription row(s) across ${membersHit} member(s) before save`); } catch (_) {} }
  if (enrCollapsed > 0) { try { console.warn(`[dedupe-guard] collapsed ${enrCollapsed} duplicate enrollment row(s) across ${enrMembers} member(s) before save`); } catch (_) {} }
  if (liCollapsed > 0) { try { console.warn(`[dedupe-guard] collapsed ${liCollapsed} duplicate invoice line-item(s) across ${liInv} invoice(s) before save (amounts untouched)`); } catch (_) {} }
  return collapsed + enrCollapsed + liCollapsed;
}

// Give every invoice payment a STABLE, cross-device-deterministic `pid` if it lacks one, so
// the element-merge keys it by id (never by volatile content). Two IDENTICAL installments
// (same amount+date+method, no id) get DISTINCT ids via a per-content collision counter, so
// a later merge can't silently collapse them into one and under-count money. Idempotent:
// a payment that already has a pid/id is left untouched. (v6.324 architecture review)
function _ensurePaymentIds() {
  for (const inv of (state.invoices || [])) {
    const ps = inv && inv.payments;
    if (!Array.isArray(ps) || !ps.length) continue;
    const seen = {};
    for (const p of ps) {
      if (!p || typeof p !== 'object') continue;
      if (p.pid != null && p.pid !== '') continue;
      if (p.id != null && p.id !== '') { p.pid = 'i' + p.id; continue; }   // reuse an existing id
      const at = (p.at != null ? String(p.at) : '');
      const base = at ? ('a' + at) : ('c' + (Number(p.amount) || 0) + '|' + (p.date || '') + '|' + String(p.method || '').toLowerCase());
      const n = seen[base] = (seen[base] || 0) + 1;
      p.pid = base + '#' + n;
    }
  }
}

// ── PAYMENT-LEDGER INTEGRITY (v6.355) ───────────────────────────────────────────
// Find + fix the "first installment shows twice" duplicate. A PHANTOM row is a
// reconstruction/seed row — created when an invoice had `amountPaid` but no itemized
// `payments[]` on a device (tagged `_recon`, or the legacy seed shape: no `at` AND no `by`)
// — that duplicates a REAL recorded payment (same amount + date + method, and the real one
// carries `at`/`by`). Across multiple devices the sync-merge can keep BOTH. The real row is
// authoritative; the phantom is redundant. These helpers are READ-ONLY except _fixPaymentPhantoms,
// which ONLY ever removes a phantom that an exact real row already covers — so it can never lose
// real money (it will not touch a reconstruction that has no matching real row = genuine prior money).
function _payKey(p) {
  return (Math.round((Number(p && p.amount) || 0) * 100)) + '|' + ((p && p.date) || '') + '|' + String((p && p.method) || '').toLowerCase();
}
function _payIsReal(p) { return !!(p && p._recon !== true && (p.at != null || p.by != null)); }
function _payIsSeed(p) { return !!(p && (p._recon === true || (p.at == null && p.by == null))); }
// Indices of phantom rows in inv.payments (a seed/recon row an exact real row already covers).
function _paymentPhantomRows(inv) {
  const ps = (inv && Array.isArray(inv.payments)) ? inv.payments : [];
  if (ps.length < 2) return [];
  const realKeys = new Set();
  for (const p of ps) if (_payIsReal(p)) realKeys.add(_payKey(p));
  const idx = [];
  for (let i = 0; i < ps.length; i++) if (_payIsSeed(ps[i]) && realKeys.has(_payKey(ps[i]))) idx.push(i);
  return idx;
}
// Every invoice whose payments don't reconcile: a phantom duplicate and/or amountPaid≠sum drift.
function _paymentLedgerIssues() {
  const out = [];
  for (const inv of (state.invoices || [])) {
    if (inv && inv.deleted) continue;
    const ps = (inv && Array.isArray(inv.payments)) ? inv.payments : null;
    if (!ps || !ps.length) continue;
    const sum = Math.round(ps.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
    const ap = Math.round((Number(inv.amountPaid) || 0) * 100) / 100;
    const phantomIdx = _paymentPhantomRows(inv);
    const drift = Math.abs(sum - ap) > 0.5;
    if (phantomIdx.length || drift) out.push({ inv, sum, amountPaid: ap, phantomIdx, drift });
  }
  return out;
}
// Remove this invoice's phantom rows + recompute amountPaid from what remains. Safe: only drops
// rows _paymentPhantomRows flagged (a seed an exact real row covers). Returns count removed.
function _fixPaymentPhantoms(inv) {
  const idx = _paymentPhantomRows(inv);
  if (!idx.length) return 0;
  const drop = new Set(idx);
  inv.payments = inv.payments.filter((_, i) => !drop.has(i));
  inv.amountPaid = Math.round(inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
  if (typeof stampUpdate === 'function') stampUpdate(inv);
  return idx.length;
}
if (typeof window !== 'undefined') {
  window._paymentLedgerIssues = _paymentLedgerIssues;
  window._paymentPhantomRows = _paymentPhantomRows;
  window._fixPaymentPhantoms = _fixPaymentPhantoms;
}

function save() {
  // Stamp a create-audit for any new invoice/expense before persisting, so the
  // revenue stream is always traceable (runs before the stale/quota guards below
  // so a to-be-saved creation is logged even if that save is later deferred).
  try { _auditNewRecords(); } catch (_) {}
  // BACKSTOP: never let duplicate-subscription clones reach the cloud (see above).
  try { _dedupeSubsGuard(); } catch (_) {}
  // MONEY SAFETY (v6.324 review): give every invoice payment a STABLE pid so the element-
  // merge can never collapse two genuine identical installments (same amount+date+method
  // with no id) into one — which would silently under-count collected money.
  try { _ensurePaymentIds(); } catch (_) {}
  // Stale-version guard (v6.313.0 — NON-DESTRUCTIVE). This tab runs OLDER code than the
  // cloud (common right after a deploy, or when another device is on a newer build). We WARN
  // the user to refresh for the latest features — but we NO LONGER BLOCK the save. The old
  // behaviour (return false, persist nothing) SILENTLY THREW THE USER'S DATA AWAY: they saved,
  // refreshed, and it was gone. With field-level + element-level merge an older tab only writes
  // the fields/records IT changed and CANNOT wipe newer data, so persisting is safe — and never
  // losing the user's work is the priority. (The persistent banner already asks them to refresh.)
  if (_staleVersion) {
    try { if (typeof showStaleVersionBanner === 'function') showStaleVersionBanner(_cloudAppVersion); } catch (_) {}
  }
  // MULTI-DOCUMENT model (multi-user build): the old single-writer "session lock"
  // that forced everyone but one device into read-only is GONE. The storage layer
  // now writes only the records that changed, each as its own Firestore document
  // with field-level merge (nested maps like member.dailyAttendance are deep-merged),
  // so any number of users — reception, coaches marking attendance, the owner — can
  // edit at the same time without overwriting each other. No save is ever blocked
  // for being a non-holder. (The stale-version guard above still applies.)
  let stateToSave;
  try {
    // Device-local / session-only fields must NEVER be synced to other devices:
    // the open page (route), the signed-in identity (user) and the admin
    // preview role (session) belong to THIS browser only.
    const { user, route, session, ...persistable } = state;
    // Never let a stale tab roll the cloud's version stamp BACKWARD (that would un-flag other
    // newer tabs as stale). Stamp the HIGHER of our version and the highest cloud version seen.
    const stampVer = (_cloudAppVersion && _verCmp(_cloudAppVersion, APP_VERSION) > 0) ? _cloudAppVersion : APP_VERSION;
    stateToSave = { ...persistable, __schema: SCHEMA_VERSION, __appVersion: stampVer };

    // Capacity check on the serialized payload (the dominant localStorage user).
    let approxBytes = 0;
    try { approxBytes = JSON.stringify(stateToSave).length; } catch (_) {}
    const pct = LS_LIMIT_BYTES ? (approxBytes / LS_LIMIT_BYTES * 100) : 0;
    const mb = (approxBytes / 1048576).toFixed(1);
    if (pct >= 90 && _lastStorageWarnLevel < 90) {
      _lastStorageWarnLevel = 90;
      storageToast(`⚠ Storage ${Math.round(pct)}% full (${mb}MB of ~5MB). Click to export a backup now, then archive old data — saves may soon start failing.`, 'error');
    } else if (pct >= 70 && _lastStorageWarnLevel < 70) {
      _lastStorageWarnLevel = 70;
      storageToast(`Storage is ${Math.round(pct)}% full (${mb}MB of ~5MB). Click here to export a backup.`, 'info');
    } else if (pct < 70) {
      _lastStorageWarnLevel = 0;   // dropped back down (e.g. after archiving) — re-arm
    }

    window.Storage.save(stateToSave);
    localStorage.setItem(LS_VERSION_KEY, SEED_VERSION);
    // NOTE: we deliberately do NOT advance the sync base here. A local save is not yet
    // confirmed by the cloud, so treating it as the base would make the next remote
    // merge delete our just-added records as "missing remotely" (silent data loss).
    // The base only advances from CONFIRMED cloud data — on load(), and after a remote
    // snapshot is merged (mergeRemoteIntoState → snapshotSyncBase(remoteState)).
  } catch (e) {
    const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22 ||
      e.code === 1014 || /quota/i.test(e.message || ''));
    if (isQuota) {
      _lastStorageWarnLevel = 90;
      console.error('Save failed — storage quota exceeded:', e);
      try {
        storageToast('❌ SAVE FAILED — browser storage is full. Your latest change was NOT saved. Click here to export a backup now, then archive or delete old records to free space.', 'error');
      } catch (_) {}
    } else {
      console.warn('Save failed:', e);
    }
  }
  return true;   // save was attempted (queued to cloud + written locally)
}

// ─── Write-through confirmation (persist to the cloud BEFORE proceeding) ─────
// HARD block against the worst data-loss case: creating a record while the cloud is NOT
// writable (the device loaded from the read-only offline copy because it couldn't reach
// Firebase). Such a record lives only in this browser and is LOST on refresh — the exact
// "new member + invoice gone after refresh" bug. Returns FALSE (and alerts) so the caller
// aborts BEFORE creating anything / generating a PDF. Local (non-cloud) mode is always OK.
// (v6.331)
function assertCloudWritable(whatEn, whatAr) {
  try {
    if (window.Storage && window.Storage.isCloud && window.Storage.isCloud() && window.Storage.cloudWriteBlocked && window.Storage.cloudWriteBlocked()) {
      const msg = t(
        '⚠ CANNOT ' + (whatEn || 'create records') + ' right now — the app is OFFLINE (it could not reach the cloud on load). Anything entered now would be LOST on refresh.\n\nReconnect to the internet and RELOAD the page, then try again.',
        '⚠ لا يمكن ' + (whatAr || 'إنشاء سجلات') + ' الآن — التطبيق غير متصل (تعذّر الوصول للسحابة عند التحميل). أي بيانات تُدخلها الآن ستُفقد عند التحديث.\n\nأعد الاتصال بالإنترنت وحدّث الصفحة ثم حاول مجدداً.'
      );
      try { alert(msg); } catch (_) {}
      try { toast(t('Offline — record NOT created (it would be lost)', 'غير متصل — لم يُنشأ السجل (سيُفقد)'), 'error'); } catch (_) {}
      return false;
    }
  } catch (_) {}
  return true;
}
window.assertCloudWritable = assertCloudWritable;
// saveConfirmed(): run the normal save, then RESOLVE only once the cloud has the data.
// Returns { ok:true } (offline/local are durable instantly) or { ok:false, error }.
// NEVER claim success before the CLOUD has it. `save()` is DEBOUNCED (~1.5s) and fire-and-forget,
// so the long-standing `save(); toast('Deleted')` pattern told the user an action succeeded before
// the write had even left the browser — refresh inside that window (or hit any throw in the
// re-render) and the change was silently lost while the UI had said it worked. Destructive actions
// use this instead: it flushes, WAITS for the server, and reports the REAL outcome — success only
// on a confirmed write, otherwise an explicit "not saved" so the user is never misled. (v6.387)
// ─── PENDING INDICATOR (v6.393) ──────────────────────────────────────────────
// Every CRUD must visibly report the REAL server outcome, so the wait itself has to be
// visible too — otherwise a slow write looks like nothing happened and staff click again.
// This is a small non-blocking bar (the heavier locked popup stays for destructive actions,
// which use withCloudConfirm). It appears only if the write takes long enough to notice.
let _savingEl = null, _savingTimer = null, _savingDepth = 0;
function _showSaving() {
  _savingDepth++;
  if (_savingTimer || _savingEl) return;
  _savingTimer = setTimeout(() => {
    _savingTimer = null;
    if (_savingDepth <= 0) return;
    try {
      _savingEl = document.createElement('div');
      _savingEl.id = 'saving-indicator';
      _savingEl.setAttribute('role', 'status');
      _savingEl.setAttribute('aria-live', 'polite');
      _savingEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:10002;' +
        'background:var(--surface,#111);color:var(--text,#fff);border:1px solid var(--border,#333);' +
        'border-radius:99px;padding:9px 18px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:9px;' +
        'box-shadow:0 8px 28px rgba(0,0,0,.28)';
      _savingEl.innerHTML = '<span style="width:13px;height:13px;border:2px solid currentColor;border-right-color:transparent;' +
        'border-radius:50%;display:inline-block;animation:sv-spin .7s linear infinite"></span>' +
        '<span>' + t('Saving to the cloud…', 'جارٍ الحفظ في السحابة…') + '</span>';
      if (!document.getElementById('sv-spin-style')) {
        const st = document.createElement('style'); st.id = 'sv-spin-style';
        st.textContent = '@keyframes sv-spin{to{transform:rotate(360deg)}}' +
          '@media (prefers-reduced-motion:reduce){#saving-indicator span{animation:none!important}}';
        document.head.appendChild(st);
      }
      document.body.appendChild(_savingEl);
    } catch (_) {}
  }, 400);   // only surfaces when the write is slow enough to be worth showing
}
function _hideSaving() {
  _savingDepth = Math.max(0, _savingDepth - 1);
  if (_savingDepth > 0) return;
  if (_savingTimer) { clearTimeout(_savingTimer); _savingTimer = null; }
  if (_savingEl) { try { _savingEl.remove(); } catch (_) {} _savingEl = null; }
}

function confirmSaved(okMsg, opts) {
  const o = opts || {};
  const fail = (why) => {
    try { toast(t('NOT saved to the cloud — the change is only on this device and will keep retrying. Do not close the app.', 'لم يُحفظ في السحابة — التغيير على هذا الجهاز فقط وستستمر إعادة المحاولة. لا تغلق التطبيق.') + (why ? ' (' + why + ')' : ''), 'error'); } catch (_) {}
    if (o.onFail) { try { o.onFail(); } catch (_) {} }
  };
  _showSaving();   // v6.393: the wait is visible, so a slow write never looks like nothing happened
  return Promise.resolve()
    .then(() => (typeof saveConfirmed === 'function' ? saveConfirmed() : { ok: true }))
    .then(r => {
      _hideSaving();
      if (r && r.ok) {
        if (okMsg) { try { toast(okMsg, 'success'); } catch (_) {} }
        if (o.onOk) { try { o.onOk(); } catch (_) {} }
      } else fail(r && r.error);
      return r;
    })
    .catch(e => { _hideSaving(); fail((e && (e.code || e.message)) || String(e)); return { ok: false }; });
}
if (typeof window !== 'undefined') window.confirmSaved = confirmSaved;

async function saveConfirmed() {
  const okLocal = save();   // create-audit + guards + queue the write (Storage.save)
  // save() returns false when it was BLOCKED (stale version) — never falsely confirm.
  if (okLocal === false) return { ok: false, error: 'save blocked — refresh to the latest version' };
  try {
    if (window.Storage && typeof window.Storage.saveAndConfirm === 'function') return await window.Storage.saveAndConfirm();
  } catch (e) { return { ok: false, error: (e && (e.code || e.message)) || String(e) }; }
  return { ok: true };
}
window.saveConfirmed = saveConfirmed;

// ─── Cloud-confirmation popup: rendering the SERVER's copy of a record ───────────────
// Every card below is built from the document Firestore handed back, never from local state.
// A collection with no formatter falls back to a generic line rather than lying about what
// was checked. (v6.344)
const _ccRow = (label, value) => (value == null || value === '') ? '' :
  `<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:13px">
     <span style="color:var(--text-mute)">${escapeHtml(label)}</span>
     <span style="font-weight:700;text-align:right">${escapeHtml(String(value))}</span>
   </div>`;
const _ccMoney = n => (typeof fmt === 'function' ? fmt(Number(n) || 0) : String(n)) + ' QAR';
const _ccBox = inner => `<div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-top:10px;text-align:left">${inner}</div>`;
const _ccHead = (icon, main, sub) => `
  <div style="text-align:center;margin-bottom:8px">
    <div style="font-size:15px;font-weight:900;color:var(--text)">${icon} ${escapeHtml(main)}</div>
    ${sub ? `<div style="font-size:12px;color:var(--text-mute);margin-top:2px">${escapeHtml(sub)}</div>` : ''}
  </div>`;

function cloudRecordCardHtml(collection, doc) {
  if (!doc) return '';
  let inner;
  if (collection === 'members') {
    const status = (typeof memberStatus === 'function') ? memberStatus(doc) : '';
    inner = _ccHead('👤', doc.name || ('#' + doc.id), doc.nameArabic || '')
      + _ccRow(t('Mobile', 'الجوال'), doc.phone)
      + _ccRow(t('Status', 'الحالة'), status)
      + _ccRow(t('Expiry', 'الانتهاء'), doc.expiryDate);
  } else if (collection === 'invoices') {
    const total = Number(doc.amount) || 0, paid = Number(doc.amountPaid) || 0;
    inner = _ccHead('🧾', doc.ref || ('#' + doc.id), doc.customerName || '')
      + _ccRow(t('Amount', 'المبلغ'), _ccMoney(total))
      + _ccRow(t('Paid', 'المدفوع'), _ccMoney(paid))
      + _ccRow(t('Balance', 'المتبقي'), _ccMoney(Math.max(0, total - paid)))
      + _ccRow(t('Date', 'التاريخ'), doc.date);
  } else if (collection === 'expenses') {
    inner = _ccHead('💸', doc.category || ('#' + doc.id), doc.description || '')
      + _ccRow(t('Amount', 'المبلغ'), _ccMoney(doc.amount))
      + _ccRow(t('Date', 'التاريخ'), doc.date);
  } else if (collection === 'salaries') {
    inner = _ccHead('💰', doc.coach || ('#' + doc.id), doc.month || '')
      + _ccRow(t('Amount', 'المبلغ'), _ccMoney(doc.amount != null ? doc.amount : doc.paid));
  } else if (collection === 'sales') {
    inner = _ccHead('🛒', doc.customerName || ('#' + doc.id), doc.date || '')
      + _ccRow(t('Amount', 'المبلغ'), _ccMoney(doc.total != null ? doc.total : doc.amount));
  } else if (collection === 'coaches') {
    inner = _ccHead('🥋', doc.name || ('#' + doc.id), (doc.sports || []).join(', '));
  } else {
    inner = _ccHead('📄', doc.name || doc.ref || doc.title || ('#' + doc.id), collection);
  }
  return _ccBox(inner);
}

// Read every `verify` target back from the SERVER. Returns {ok, cards, missing}.
// Supported targets:
//   {collection, id}                       → must EXIST; its server copy is rendered
//   {collection, id, absent:true, label}   → must be GONE (deletes)
//   {metaPath:[…], label}                  → that settings key must EXIST on the server
//   {metaPath:[…], absent:true, label}     → that settings key must be GONE
async function readBackFromCloud(targets) {
  const S = window.Storage;
  const out = { ok: true, cards: '', missing: null };
  if (!Array.isArray(targets) || !targets.length) return out;
  if (!S || typeof S.fetchDoc !== 'function') { out.ok = false; out.missing = 'storage'; return out; }
  const note = (icon, main, sub) => _ccBox(`<div style="text-align:center">
      <div style="font-size:15px;font-weight:900">${icon} ${escapeHtml(main)}</div>
      <div style="font-size:12px;color:var(--text-mute);margin-top:2px">${escapeHtml(sub)}</div>
    </div>`);
  for (const v of targets) {
    if (v.metaPath) {
      // Same transient-blip / propagation-lag hardening as the doc path below: retry the
      // parent-meta read a couple of times before declaring the settings key un-verifiable. (v6.354)
      let meta = null, present = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { meta = (typeof S.fetchMeta === 'function') ? await S.fetchMeta() : null; } catch (_) { meta = null; }
        let node = meta;
        for (const k of v.metaPath) node = (node && typeof node === 'object') ? node[k] : undefined;
        present = node !== undefined;
        const matches = meta && (v.absent ? !present : present);
        if (matches || attempt === 2) break;
        await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
      }
      if (!meta) { out.ok = false; out.missing = v.metaPath.join('.'); return out; }
      if (v.absent ? present : !present) { out.ok = false; out.missing = v.metaPath.join('.'); return out; }
      out.cards += note('⚙️', v.label || v.metaPath[v.metaPath.length - 1],
        v.absent ? t('removed on the server', 'أُزيل من الخادم') : t('present on the server', 'موجود على الخادم'));
      continue;
    }
    // Read the record back from the SERVER. A single {source:'server'} read can transiently
    // fail (a momentary transport blip during rapid back-to-back saves — e.g. a 2nd/3rd
    // installment fired right after the 1st) or briefly lag propagation. So if the first read
    // doesn't match what we expect — missing when it should EXIST, or still present right after
    // a delete — retry a couple of times with a short backoff before alarming the user. The
    // record IS saved (saveConfirmed already awaited the write ack); this only hardens the
    // read-back against a false "could NOT verify" popup. (v6.354)
    let doc = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { doc = await S.fetchDoc(v.collection, v.id); } catch (_) { doc = null; }
      const matches = v.absent ? !doc : !!doc;
      if (matches || attempt === 2) break;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
    if (v.absent) {
      if (doc) { out.ok = false; out.missing = v.collection + '/' + v.id; return out; }
      // Show WHAT was removed. If the caller captured the record BEFORE deletion (v.snapshot),
      // render its details so the user sees exactly what is now gone — then confirm the server
      // no longer holds it. Otherwise fall back to a simple "deleted" line. (v6.349)
      if (v.snapshot) {
        out.cards += '<div style="font-size:11px;font-weight:800;color:var(--red);letter-spacing:.5px;margin-top:12px">🗑 ' + escapeHtml(t('DELETED', 'محذوف')) + '</div>'
          + cloudRecordCardHtml(v.collection, v.snapshot)
          + '<div style="font-size:11px;color:var(--text-mute);margin-top:4px">' + escapeHtml(t('confirmed gone from the server', 'تم تأكيد إزالته من الخادم')) + '</div>';
      } else {
        out.cards += note('🗑', v.label || (v.collection + ' #' + v.id), t('confirmed deleted on the server', 'تم تأكيد الحذف على الخادم'));
      }
      continue;
    }
    if (!doc) { out.ok = false; out.missing = v.collection + '/' + v.id; return out; }
    out.cards += cloudRecordCardHtml(v.collection, doc);
  }
  return out;
}
window.readBackFromCloud = readBackFromCloud;
window.cloudRecordCardHtml = cloudRecordCardHtml;

// A full-screen loader shown the instant the user confirms a write, held until the cloud has
// acknowledged AND (where applicable) the record has been read back. So the user always sees
// "working…" between their click and the confirmation popup — no silent gap. (v6.347)
let _savingOverlayTimer = null;
function showSavingOverlay() {
  try {
    if (document.getElementById('cloud-saving-overlay')) return;
    window.__cloudSaveSummary = '';
    const d = document.createElement('div');
    d.id = 'cloud-saving-overlay';
    // TOP of everything (above any modal) so nothing can be clicked until the write is done +
    // read back. inset:0 + fixed makes it swallow every click/scroll — the screen is blocked.
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(10,14,26,.6);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    d.innerHTML = '<div style="background:var(--surface,#fff);color:var(--text,#111);border-radius:16px;padding:26px 34px;box-shadow:0 12px 48px rgba(0,0,0,.35);text-align:center;min-width:240px">'
      + '<div class="cloud-spin" style="width:44px;height:44px;margin:0 auto 14px;border:4px solid rgba(120,120,140,.25);border-top-color:#5b8def;border-radius:50%;animation:cloudspin .8s linear infinite"></div>'
      + '<div style="font-size:15px;font-weight:800">☁ ' + t('Saving to cloud…', 'جاري الحفظ في السحابة…') + '</div>'
      + '<div id="cloud-saving-sub" style="font-size:12px;color:var(--text-mute,#888);margin-top:4px">' + t('Confirming it reached the server', 'نتأكد من وصولها إلى الخادم') + '</div>'
      + '</div>';
    if (!document.getElementById('cloud-spin-kf')) {
      const st = document.createElement('style'); st.id = 'cloud-spin-kf';
      st.textContent = '@keyframes cloudspin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(d);
    try { document.body.style.overflow = 'hidden'; } catch (_) {}   // no background scroll while blocked
    // Mirror the live save summary (e.g. "17 members · 143 invoices") so a big flush visibly
    // shows it is working, not frozen. (v6.348)
    clearInterval(_savingOverlayTimer);
    _savingOverlayTimer = setInterval(() => {
      try {
        const sub = document.getElementById('cloud-saving-sub');
        const sum = window.__cloudSaveSummary;
        if (sub && sum) sub.textContent = t('Saving', 'جارٍ حفظ') + ' ' + sum + '…';
      } catch (_) {}
    }, 300);
  } catch (_) {}
}
function hideSavingOverlay() {
  try { clearInterval(_savingOverlayTimer); _savingOverlayTimer = null; } catch (_) {}
  try { const d = document.getElementById('cloud-saving-overlay'); if (d) d.remove(); } catch (_) {}
  try { document.body.style.overflow = ''; } catch (_) {}
}
window.showSavingOverlay = showSavingOverlay;
window.hideSavingOverlay = hideSavingOverlay;

// UI wrapper for a CRITICAL action (payment / invoice / member / attendance): perform the
// mutation, WAIT for the cloud to confirm, then RE-READ the affected records from the server
// and show the user what the cloud actually holds, in a locked popup they must acknowledge.
// "Saved" therefore always means "the server has it, and here it is". On failure → a red
// locked popup and no false success. opts.btn (optional) shows "Saving…". (v6.344)
async function withCloudConfirm(opts) {
  opts = opts || {};
  const btn = opts.btn || null;
  let btnHtml = null;
  if (btn) { btnHtml = btn.innerHTML; btn.disabled = true; btn.innerHTML = '⏳ ' + t('Saving…', 'جاري الحفظ…'); }
  // Show the loader the instant the action is confirmed (unless the caller opts out), held
  // until the server has acked + read back. (v6.347)
  const wantOverlay = opts.overlay !== false;
  if (wantOverlay) showSavingOverlay();
  const res = await saveConfirmed();

  let readBack = { ok: true, cards: '', missing: null };
  if (res && res.ok && Array.isArray(opts.verify) && opts.verify.length) readBack = await readBackFromCloud(opts.verify);
  if (btn) { btn.disabled = false; if (btnHtml != null) btn.innerHTML = btnHtml; }
  if (wantOverlay) hideSavingOverlay();

  const popup = (o) => {
    if (typeof window.showLockedModal === 'function') window.showLockedModal(o);
    else { try { toast((o.okay ? '✓ ' : '⚠ ') + (opts.okMsg || ''), o.okay ? 'success' : 'error'); } catch (_) {} if (typeof o.onClose === 'function') o.onClose(); }
  };

  if (res && res.ok && readBack.ok) {
    // Run the caller's success handler FIRST — it usually closes its own modal and re-renders,
    // which would otherwise wipe our confirmation off the screen — then show the popup.
    if (typeof opts.onOk === 'function') { try { opts.onOk(res); } catch (_) {} }
    const verified = Array.isArray(opts.verify) && opts.verify.length > 0;
    popup({
      okay: true,
      title: '✅ ' + (opts.okTitle || t('Saved in the cloud', 'حُفظ في السحابة')),
      body: `<div style="text-align:center">
          <div style="font-size:46px;line-height:1">✅</div>
          <div style="font-size:16px;font-weight:800;margin-top:8px;color:var(--green)">${escapeHtml(opts.okMsg || t('Saved and confirmed by the server', 'تم الحفظ والتأكيد من الخادم'))}</div>
          ${readBack.cards}
          <div style="font-size:11px;color:var(--text-mute);margin-top:14px">☁ ${escapeHtml(verified
            ? t('Read back from the server — this is what the cloud holds.', 'تمت القراءة من الخادم — هذا ما تحتفظ به السحابة.')
            : t('The server acknowledged the write.', 'أكّد الخادم عملية الكتابة.'))}</div>
        </div>`,
      onClose: opts.afterOk,
    });
    return true;
  }

  if (!readBack.ok) {
    popup({
      okay: false,
      title: '⚠ ' + t('NOT saved in the cloud', 'لم يُحفظ في السحابة'),
      body: `<div style="text-align:center;padding:8px 0">
          <div style="font-size:46px;line-height:1">⚠️</div>
          <div style="font-size:16px;font-weight:800;color:var(--red);margin-top:8px">${escapeHtml(t('Could NOT verify the record on the server — do not assume it saved.', 'تعذّر التأكد من حفظ السجل على الخادم — لا تفترض أنه حُفظ.'))}</div>
          <div style="font-size:12px;color:var(--text-mute);margin-top:8px">${escapeHtml(String(readBack.missing))}</div>
          <div style="font-size:13px;color:var(--text);margin-top:10px">${escapeHtml(t('Check your connection and try again.', 'تحقق من الاتصال وحاول مرة أخرى.'))}</div>
        </div>`,
      onClose: opts.afterOk,
    });
    if (typeof opts.onFail === 'function') { try { opts.onFail({ ok: false, verifyFailed: true }); } catch (_) {} }
    return false;
  }
  // The write itself failed (blocked, offline, error) — same locked popup, so a failed save is
  // as impossible to miss as a successful one.
  const reason = (res && (res.error || res.blocked)) || 'unknown';
  // A 'permission-denied' / 'unauthenticated' write is NOT a connection problem — it means the
  // sign-in session lapsed while the tab stayed open (Firestore requires a valid auth token to
  // write). "Check your connection" was misleading. Show the real cause + the real fix, and
  // reassure the user their change is safe locally: storage auto-refreshes the token and retries,
  // so it usually saves on its own within seconds; a reload + sign-in guarantees it. (v6.354)
  const _isAuthReason = (reason === 'permission-denied' || reason === 'unauthenticated');
  // v6.407: DON'T pre-judge "lapsed session" vs "server refused" here. Both surface as
  // permission-denied, and `currentUser()` stays populated even when the ID token is actually
  // DEAD — so keying the message off `_stillSignedIn` wrongly told a genuinely-lapsed user that
  // "signing in will not help." We can only tell them apart by TRYING to refresh the token, which
  // showSessionResumePrompt() does on close. So show one neutral, honest message and let that
  // prompt do the real diagnosis + recovery.
  const _failHeadline = _isAuthReason
    ? t('Not saved yet — re-checking your sign-in', 'لم يُحفظ بعد — يُعاد التحقق من تسجيل دخولك')
    : t('NOT saved to the cloud', 'لم يُحفظ في السحابة');
  const _failHelp = _isAuthReason
    ? t('Your change is safe on this device and keeps retrying. We’ll refresh your sign-in and save it now — if the sign-in has expired you’ll be asked to sign in again.', 'تغييرك محفوظ على هذا الجهاز وتتم إعادة المحاولة. سنحدّث تسجيل دخولك ونحفظه الآن — وإذا انتهت الجلسة سيُطلب منك تسجيل الدخول مجدداً.')
    : t('Check your connection and try again.', 'تحقق من الاتصال وحاول مرة أخرى.');
  popup({
    okay: false,
    title: '⚠ ' + t('NOT saved in the cloud', 'لم يُحفظ في السحابة'),
    body: `<div style="text-align:center;padding:8px 0">
        <div style="font-size:46px;line-height:1">${_isAuthReason ? '🔑' : '⚠️'}</div>
        <div style="font-size:16px;font-weight:800;color:var(--red);margin-top:8px">${escapeHtml(_failHeadline)}</div>
        <div style="font-size:12px;color:var(--text-mute);margin-top:8px">${escapeHtml(String(reason))}</div>
        <div style="font-size:13px;color:var(--text);margin-top:10px">${escapeHtml(_failHelp)}</div>
      </div>`,
    onClose: () => {
      try { if (typeof opts.afterOk === 'function') opts.afterOk(); } catch (_) {}
      // ANY auth-coded failure is recoverable in place. showSessionResumePrompt() refreshes the
      // token and decides for real: if the token is alive but the write is still refused it shows
      // the "server refused" bar; if the token is dead it shows the sign-in card that re-auths and
      // flushes this pending write. No reload either way. (v6.407: was gated on _sessionLapsed,
      // which mis-fired because currentUser stays set on a dead token.)
      if (_isAuthReason && typeof window.showSessionResumePrompt === 'function') {
        try { window.showSessionResumePrompt(); } catch (_) {}
      }
    },
  });
  if (typeof opts.onFail === 'function') { try { opts.onFail(res); } catch (_) {} }
  return false;
}
window.withCloudConfirm = withCloudConfirm;

// CLOUD-ONLY: a full-screen, non-dismissable block shown when the cloud is unreachable, so the
// app never runs on a stale local copy (which is how offline-entered records got lost). (v6.332)
function showCloudUnavailableScreen(code) {
  try {
    try { const bs = document.getElementById('boot-splash'); if (bs) bs.remove(); } catch (_) {}   // clear the boot splash
    if (document.getElementById('cloud-unavailable-screen')) return;
    const d = document.createElement('div');
    d.id = 'cloud-unavailable-screen';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0f1115;color:#e7ebf2;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:24px;text-align:center';
    // If a browser privacy tool / ad-blocker is aborting Firestore's connection (a common cause,
    // esp. in Firefox with Enhanced Tracking Protection), the internet is fine — so add a hint
    // pointing at that, and show the raw error code so support can see the real cause without
    // opening DevTools. (v6.346)
    const codeStr = code ? String(code) : '';
    const hint = '<div style="font-size:12px;line-height:1.6;color:#7c8698;margin-bottom:16px">'
      + t('If your internet works elsewhere, a browser privacy/ad-blocker or tracking protection may be blocking the connection. Try turning it off for this site, or open the app in a private/incognito window or another browser.',
          'إذا كان الإنترنت يعمل في مواقع أخرى، فقد يكون هناك مانع إعلانات أو حماية من التتبّع في المتصفح يمنع الاتصال. جرّب إيقافه لهذا الموقع، أو افتح التطبيق في نافذة خاصة أو متصفح آخر.')
      + '</div>';
    d.innerHTML = '<div style="max-width:460px">'
      + '<div style="font-size:52px;margin-bottom:12px">📡</div>'
      + '<div style="font-size:20px;font-weight:800;margin-bottom:8px">' + t('Cannot reach the cloud', 'تعذّر الوصول إلى السحابة') + '</div>'
      + '<div style="font-size:14px;line-height:1.6;color:#9aa4b2;margin-bottom:14px">' + t('This app works ONLINE only. It will not open on a local copy — so nothing you enter can ever be lost. Check your internet connection and reload.', 'هذا التطبيق يعمل عبر الإنترنت فقط. لن يفتح على نسخة محلية — حتى لا تُفقد أي بيانات تُدخلها. تحقق من اتصالك بالإنترنت وحدّث الصفحة.') + '</div>'
      + hint
      + '<button onclick="location.reload()" style="background:#5b8def;color:#fff;border:none;border-radius:10px;padding:11px 22px;font-size:15px;font-weight:700;cursor:pointer">🔄 ' + t('Reload', 'إعادة التحميل') + '</button>'
      + '<div style="margin-top:14px;font-size:11px;color:#6b7280">Black Stars CRM · v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') + (codeStr ? ' · ' + escapeHtml(codeStr) : '') + '</div>'
      + '</div>';
    document.body.appendChild(d);
  } catch (_) {}
}
window.showCloudUnavailableScreen = showCloudUnavailableScreen;

// ─── PENDING-WRITE RECOVERY (v6.389) ─────────────────────────────────────────
// Storage journals the full state to its own localStorage key whenever a cloud write FAILS,
// and clears it only when a write is CONFIRMED. So if a session died mid-save — the classic
// "I registered a member, got the red bar, reloaded, and he was gone" — the record is still on
// disk here even though the cloud read has since overwritten the ordinary local cache.
//
// SAFETY RULE: only records the cloud is MISSING are restored. Those are pure additions, so
// recovery can never overwrite or destroy anything. A record that exists in BOTH but differs is
// NOT auto-applied — another device may hold the newer truth — it is counted and surfaced for
// the admin to review, per the never-silently-merge-financial-data rule.
function recoverPendingWrite() {
  const S = window.Storage;
  if (!S || typeof S.getPending !== 'function') return null;
  const journal = S.getPending();
  if (!journal || !journal.state) return null;

  const stripVolatile = (r) => { const o = { ...r }; delete o._updatedAt; delete o.lastUpdated; return JSON.stringify(o); };
  const restored = [];      // records the cloud never received
  const conflicts = [];     // present in both but different — surfaced, never auto-applied

  for (const key of Object.keys(journal.state)) {
    const jArr = journal.state[key];
    if (!Array.isArray(jArr) || !jArr.length) continue;
    if (!Array.isArray(state[key])) continue;             // only per-record collections
    const cur = state[key];
    const byId = new Map();
    for (const r of cur) if (r && r.id != null) byId.set(String(r.id), r);
    for (const rec of jArr) {
      if (!rec || typeof rec !== 'object' || rec.id == null) continue;
      const mine = byId.get(String(rec.id));
      if (!mine) {
        // The cloud has no such record — it never landed. Put it back.
        cur.push(rec);
        restored.push({ key, id: rec.id, label: rec.name || rec.ref || rec.description || ('#' + rec.id) });
      } else if (stripVolatile(mine) !== stripVolatile(rec)) {
        conflicts.push({ key, id: rec.id, label: rec.name || rec.ref || ('#' + rec.id) });
      }
    }
  }

  if (!restored.length && !conflicts.length) { S.clearPending(); return null; }   // fully absorbed

  if (restored.length) {
    console.warn(`[recover] restored ${restored.length} record(s) that never reached the cloud:`, restored);
    // Push them now. A CONFIRMED write clears the journal; a failed one re-journals, so the
    // record keeps surviving reloads until it truly lands.
    window.__pendingRecovery = { restored, conflicts, at: journal.at };
  } else {
    // Nothing to restore, only differing records — keep the journal for the review UI.
    window.__pendingRecovery = { restored: [], conflicts, at: journal.at };
  }
  return { restored, conflicts };
}
window.recoverPendingWrite = recoverPendingWrite;

async function load() {
  try {
    const parsed = await window.Storage.load();
    // CLOUD-ONLY (v6.332): the cloud could not be reached. Do NOT start the app on a stale
    // local copy — that is how new records got entered offline and lost. Show a blocking
    // "can't connect" screen and refuse to run until the cloud is reachable + reloaded.
    if (parsed && parsed.__cloudUnavailable) {
      window.__cloudUnavailable = true;
      // A SESSION problem (expired / signed out) is recovered by signing in again — the login
      // handler re-runs load() once authenticated. Show the login screen with a notice, NOT the
      // dead-end "cannot reach cloud" block (which offered no way back in). A real NETWORK outage
      // still gets the block screen. (v6.345)
      if (parsed.reason === 'auth') {
        try { state.user = null; } catch (_) {}
        window.__authExpiredNotice = true;
        try { loginScreen(); } catch (_) { showCloudUnavailableScreen(); }
        return 'blocked-auth';
      }
      showCloudUnavailableScreen(parsed.code);
      return 'blocked';
    }
    if (!parsed) return false;
    _checkVersionFromRemote(parsed);   // flag if the stored data is from a newer app version

    // Migrate from older schemas. NEVER wipe user data — only adapt its shape.
    const savedSchema = parsed.__schema || 1;
    if (savedSchema < SCHEMA_VERSION) {
      runMigrations(parsed, savedSchema);
      parsed.__schema = SCHEMA_VERSION;
      window._schemaMigrated = { from: savedSchema, to: SCHEMA_VERSION };
    }

    // Apply parsed onto live state (preserve session-only fields for THIS device)
    const savedUser = state.user, savedRoute = state.route, savedSession = state.session;
    Object.assign(state, parsed);
    state.user = savedUser; state.route = savedRoute; state.session = savedSession;

    // Ensure all expected fields exist (safe no-ops if already present).
    if (!Array.isArray(state.trials))          state.trials = [];
    if (!Array.isArray(state.rentals))         state.rentals = [];
    if (!Array.isArray(state.rentalCustomers)) state.rentalCustomers = [];
    if (!Array.isArray(state.schedule))        state.schedule = [];
    if (!Array.isArray(state.products))        state.products = [];
    // One-time, non-destructive expense-category update: the legacy "Coach Pool" and
    // "Coach Commission" categories are retired (coach payouts live on the Salaries
    // screen), and "Maintenance" is added. Existing expenses keep their saved category
    // text — only the SELECTABLE list changes. Idempotent: safe to run every load.
    if (state.settings && Array.isArray(state.settings.expenseCategories)) {
      const drop = ['coach pool', 'coach commission'];
      state.settings.expenseCategories = state.settings.expenseCategories.filter(c => !drop.includes(String(c).toLowerCase()));
      if (!state.settings.expenseCategories.some(c => String(c).toLowerCase() === 'maintenance')) {
        // Insert Maintenance near the other operational categories (after Rent if present).
        const idx = state.settings.expenseCategories.findIndex(c => String(c).toLowerCase() === 'rent');
        if (idx >= 0) state.settings.expenseCategories.splice(idx + 1, 0, 'Maintenance');
        else state.settings.expenseCategories.unshift('Maintenance');
      }
      // Ensure "Bank Commission" exists (used by the auto card-fee row), pinned first.
      if (!state.settings.expenseCategories.some(c => String(c).toLowerCase() === 'bank commission')) {
        state.settings.expenseCategories.unshift('Bank Commission');
      }
    }
    if (!Array.isArray(state.sales))           state.sales = [];
    if (!Array.isArray(state.advices))         state.advices = [];
    // Broadcast advice/articles (coach→students, admin→coaches+members) with
    // audience targeting, read receipts and reply threads.
    if (!Array.isArray(state.posts))           state.posts = [];
    state.posts.forEach(p => {
      if (!Array.isArray(p.comments)) p.comments = [];
      if (!Array.isArray(p.recipients)) p.recipients = [];
      if (!p.readBy || typeof p.readBy !== 'object') p.readBy = {};
      if (!p.audience || typeof p.audience !== 'object') p.audience = { scope: 'all' };
    });
    if (!Array.isArray(state.families))        state.families = [];
    if (!Array.isArray(state.drivers))         state.drivers = [];
    if (!Array.isArray(state.cashCounts))      state.cashCounts = [];
    // Each advice can carry a comment thread (coach ↔ student). Ensure it exists.
    state.advices.forEach(a => { if (!Array.isArray(a.comments)) a.comments = []; });
    // Every invoice MUST carry a billing month. Some imported/legacy invoices only
    // had a date; backfill month = date[:7] so the revenue screens (which fall back
    // to the date) and the commission/payroll screens (which read i.month) can never
    // disagree about which month an invoice belongs to.
    (state.invoices || []).forEach(i => { if (i && !i.month && i.date) i.month = String(i.date).slice(0, 7); });
    // Same for expenses: the dashboard filters by e.month while the Monthly Report
    // falls back to the date — backfill so both screens count the same expenses.
    (state.expenses || []).forEach(e => { if (e && !e.month && e.date) e.month = String(e.date).slice(0, 7); });
    if (!state.settings) state.settings = {};
    if (state.settings.expiringSoonDays == null) state.settings.expiringSoonDays = 3;
    if (state.settings.lowStockThreshold == null) state.settings.lowStockThreshold = 3;
    // Commission basis: keep a valid stored value; default unknown → attendance.
    if (state.settings.commissionBasis !== 'attendance' && state.settings.commissionBasis !== 'payment') state.settings.commissionBasis = 'attendance';
    // One-time switch of existing clubs to the agreed attendance-based rule.
    // (Sets a flag so the admin can still switch back to 'payment' afterwards.)
    if (!state.settings.commissionBasisInit) {
      state.settings.commissionBasis = 'attendance';
      state.settings.commissionBasisInit = true;
    }
    // Commission start date: commission only counts invoices/subscriptions dated on or
    // after this. Default to 1 June 2026 the first time; admin can change it in Settings.
    if (state.settings.commissionStartDate === undefined) state.settings.commissionStartDate = '2026-06-01';
    if (!state.campSchedule || !state.campSchedule.days) state.campSchedule = defaultCampSchedule();
    if (!state.session || !state.session.role) state.session = { role: 'admin' };
    // Camp duration corrected to 14–28 Jun 2026 — fix existing data that still has the old end date.
    if (state.campSchedule && state.campSchedule.endDate === '2026-08-27') {
      state.campSchedule.startDate = '2026-06-14';
      state.campSchedule.endDate = '2026-06-28';
    }
    // Partial payments: existing invoices predate amountPaid → treat as fully paid
    // so no historical revenue changes. New invoices set amountPaid explicitly.
    for (const inv of (state.invoices || [])) {
      if (inv.amountPaid == null) inv.amountPaid = inv.amount;
    }
    if (!state.settings.facilityRates) {
      state.settings.facilityRates = { 'Football Court': 150, 'Boxing Room': 100, 'Swimming Pool': 200 };
    }
    if (!Array.isArray(state.settings.sports) || state.settings.sports.length === 0) {
      state.settings.sports = DEFAULT_SPORTS.map((name, i) => ({ name, enabled: true, order: i }));
    }
    if (!Array.isArray(state.settings.summerCampPrices) || state.settings.summerCampPrices.length === 0) {
      state.settings.summerCampPrices = DEFAULT_SUMMER_CAMP_PRICES.map(p => ({ ...p }));
    }
    (state.coaches || []).forEach(c => { if (!c.active) c.active = 'Y'; });
    (state.members || []).forEach(m => { if (!Array.isArray(m.sportSwitches)) m.sportSwitches = []; });
    (state.invoices || []).forEach(inv => { if (!Array.isArray(inv.lineItems)) inv.lineItems = []; });

    // Auto-sync stale m.status with derived memberStatus(). The UI always uses
    // memberStatus() (which derives from expiryDate), but the stored m.status
    // can drift after import or after time passes. This one-time sweep aligns
    // them so CSV exports + other consumers that read m.status see fresh values.
    let statusSyncs = 0;
    (state.members || []).forEach(m => {
      const live = memberStatus(m);
      // Don't override Completed (it's tied to attendance, not just dates)
      if (live === 'Completed') return;
      // Don't sync if frozen — keep stored status as set
      if (live === 'Frozen') return;
      if (m.status !== live) {
        m.status = live;
        statusSyncs++;
      }
    });
    if (statusSyncs > 0) {
      // Defer the toast until after the UI is ready
      window.__pendingStatusSync = statusSyncs;
    }

    localStorage.setItem(LS_VERSION_KEY, SEED_VERSION);
    // RECOVER anything a previous session entered but never got into the cloud. Runs BEFORE the
    // sync base is snapshotted so recovered records count as local changes and get pushed. (v6.389)
    try { recoverPendingWrite(); } catch (e) { console.warn('[recover] pending-write recovery failed:', e); }
    // Record the freshly-loaded data as the merge base for multi-device sync.
    try { snapshotSyncBase(state); } catch (_) {}
    // Baseline the create-audit tracker: existing invoices/expenses are NOT "new".
    try { _seedKnownRecIds(); } catch (_) {}
    return true;
  } catch (e) {
    console.warn('Load failed:', e);
  }
  return false;
}

// ─── Schema migrations ───────────────────────────────────────────────
// Each numbered step transforms data from version N to N+1 IN PLACE.
// Add a new step here when you bump SCHEMA_VERSION above. NEVER delete
// existing migrations — older installs need them to catch up.
function runMigrations(data, fromVersion) {
  // 1 → 2: add rentalCustomers if missing
  if (fromVersion < 2) {
    if (!Array.isArray(data.rentalCustomers)) data.rentalCustomers = [];
  }
  // 2 → 3: add schedule array if missing
  if (fromVersion < 3) {
    if (!Array.isArray(data.schedule)) data.schedule = [];
  }
  // 3 → 4: salaries reshape from manual records to computed model.
  //   Old records: { name, rate, salary, advance, balance, paidDate, status, month }
  //   New records: { coachId, month, kind: 'advance'|'paid', amount?, paidDate?, note? }
  //   We convert old records into 'paid' rows linked to a coach by name match.
  //   Also: coaches gain fixedSalary + role fields.
  if (fromVersion < 4) {
    (data.coaches || []).forEach(c => {
      if (c.fixedSalary == null) c.fixedSalary = 0;
      if (!c.role) c.role = 'coach';
    });
    if (Array.isArray(data.salaries)) {
      const migrated = [];
      for (const s of data.salaries) {
        // Already new-shape? leave alone
        if (s.kind === 'advance' || s.kind === 'paid') { migrated.push(s); continue; }
        // Find matching coach by name
        const c = (data.coaches || []).find(x => x.name && s.name &&
          x.name.toLowerCase().trim() === s.name.toLowerCase().trim());
        if (!c) continue; // orphan record, drop
        if (s.advance && s.advance > 0) {
          migrated.push({
            id: s.id ? s.id * 100 + 1 : Date.now(),
            coachId: c.id, month: s.month, kind: 'advance',
            amount: s.advance, paidDate: s.advanceDate || s.paidDate, note: 'Migrated from v3 record',
          });
        }
        if (s.status === 'paid' && s.salary > 0) {
          migrated.push({
            id: s.id || Date.now(),
            coachId: c.id, month: s.month, kind: 'paid',
            paidDate: s.paidDate,
            snapshotGross: s.salary, snapshotNet: s.balance ?? (s.salary - (s.advance || 0)),
            snapshotFixed: s.rate ? 0 : s.salary,
            snapshotCommission: s.rate ? s.salary : 0,
            snapshotCommissionBase: null,
          });
        }
      }
      data.salaries = migrated;
    }
  }
  // 4 → 5: Each invoice gets a lineItems[] array so commission can be split
  // per-sport when a member registers for multiple sports. Existing single-sport
  // invoices get wrapped in a single-item array. Each line carries its own
  // coachId so the payroll calc can attribute to the right coach.
  // Also: members gain sportSwitches[] for tracking mid-month sport changes.
  if (fromVersion < 5) {
    (data.invoices || []).forEach(inv => {
      if (Array.isArray(inv.lineItems) && inv.lineItems.length > 0) {
        // Already has line items — but they might lack coachId. Patch by name lookup.
        inv.lineItems.forEach(li => {
          if (li.coachId == null && li.coach) {
            const c = (data.coaches || []).find(co => co.name === li.coach);
            if (c) li.coachId = c.id;
          }
        });
        return;
      }
      // Wrap single-sport invoice in a one-item lineItems array.
      // Only do this for Membership invoices (Product/Rental don't need splitting).
      const cat = inv.category || 'Membership';
      if (cat === 'Membership' || cat === 'Other' || !inv.category) {
        inv.lineItems = [{
          sport: inv.sport || null,
          coach: inv.coach || null,
          coachId: inv.coachId || null,
          classes: null,
          price: inv.amount || 0,
        }];
      } else {
        inv.lineItems = [];
      }
    });
    (data.members || []).forEach(m => {
      if (!Array.isArray(m.sportSwitches)) m.sportSwitches = [];
    });
  }
  // 5 → 6: Sports become dynamic. Seed state.settings.sports[] with the default list.
  // Coaches gain optional profile fields (phone, qid, birthdate, email).
  if (fromVersion < 6) {
    if (!data.settings) data.settings = {};
    if (!Array.isArray(data.settings.sports)) {
      data.settings.sports = DEFAULT_SPORTS.map((name, i) => ({
        name, enabled: true, order: i,
      }));
    }
    (data.coaches || []).forEach(c => {
      if (c.phone === undefined) c.phone = null;
      if (c.qid === undefined) c.qid = null;
      if (c.birthdate === undefined) c.birthdate = null;
      if (c.email === undefined) c.email = null;
    });
  }
  // 6 → 7: Summer Camp introduced. Add it to state.settings.sports if missing.
  // Seed state.settings.summerCampPrices with the default price table.
  if (fromVersion < 7) {
    if (!data.settings) data.settings = {};
    if (!Array.isArray(data.settings.sports)) data.settings.sports = [];
    const hasSummerCamp = data.settings.sports.some(s => (s.name || s) === SUMMER_CAMP);
    if (!hasSummerCamp) {
      const maxOrder = Math.max(0, ...data.settings.sports.map(s => s.order ?? 0));
      data.settings.sports.push({ name: SUMMER_CAMP, enabled: true, order: maxOrder + 1 });
    }
    if (!Array.isArray(data.settings.summerCampPrices)) {
      data.settings.summerCampPrices = DEFAULT_SUMMER_CAMP_PRICES.map(p => ({ ...p }));
    }
  }
  // 7 → 8: Add intermediate Summer Camp tiers (2 weeks, 3 weeks).
  // Inserts each missing tier in the correct position by `days` count.
  // Idempotent: doesn't touch existing tiers, including any custom ones admin
  // has already saved. Only ADDS the missing 2w/3w slots if neither exists.
  if (fromVersion < 8) {
    if (!data.settings) data.settings = {};
    if (!Array.isArray(data.settings.summerCampPrices) || data.settings.summerCampPrices.length === 0) {
      data.settings.summerCampPrices = DEFAULT_SUMMER_CAMP_PRICES.map(p => ({ ...p }));
    } else {
      const want = [
        { label: '2 weeks', days: 14, price: 1300 },
        { label: '3 weeks', days: 21, price: 1500 },
        { label: '6 weeks', days: 42, price: 2500 },
      ];
      for (const tier of want) {
        // Skip if admin already has a tier with this exact day count
        if (data.settings.summerCampPrices.some(p => p.days === tier.days)) continue;
        data.settings.summerCampPrices.push({ ...tier });
      }
      // Re-sort by days so the dropdown reads naturally (1d, 1w, 2w, 3w, 1m, 2m)
      data.settings.summerCampPrices.sort((a, b) => (a.days || 0) - (b.days || 0));
    }
  }

  // 8 → 9: Strip coachId from existing Summer Camp enrollments + subscriptions.
  // From v100 onward, Summer Camp has no coach — but older data may have coach
  // assignments that now confuse the UI. Clean them up on first load.
  if (fromVersion < 9) {
    for (const m of (data.members || [])) {
      (m.enrollments || []).forEach(e => {
        if (e.sport === SUMMER_CAMP) { e.coachId = null; e.coach = null; }
      });
      (m.subscriptions || []).forEach(s => {
        if (s.activity === SUMMER_CAMP) { s.coachId = null; s.coach = null; }
      });
    }
    // Also clean line items on existing invoices
    for (const inv of (data.invoices || [])) {
      (inv.lineItems || []).forEach(li => {
        if (li.sport === SUMMER_CAMP) { li.coachId = null; li.coach = null; }
      });
    }
  }
  // Future migrations go here as more `if (fromVersion < N)` blocks.
}

function resetData(skipConfirm) {
  if (!skipConfirm && !confirm('Clear ALL data and start with an empty database? You will need to re-import your Excel sheets. This cannot be undone.')) return;
  // Audit BEFORE the wipe, while the counts still exist. The two most destructive actions in
  // the app used to leave no trace at all, while far smaller changes were fully audited.
  // (auditLog itself is intentionally kept — the trail must survive the wipe it records.)
  try {
    audit('data.reset', 'database', `Cleared ALL data (${(state.members || []).length} members, ${(state.invoices || []).length} invoices, ${(state.expenses || []).length} expenses)`, {
      members: (state.members || []).length, invoices: (state.invoices || []).length,
      expenses: (state.expenses || []).length, coaches: (state.coaches || []).length,
    });
  } catch (_) {}
  localStorage.removeItem(LS_KEY);
  // Reset state to empty defaults. The button says it "permanently empties the ENTIRE
  // database", so every collection goes — families/notes/cashCounts/swimGroups/drivers used
  // to survive as orphans pointing at member ids that no longer existed.
  state.members = []; state.coaches = []; state.invoices = [];
  state.expenses = []; state.salaries = []; state.sales = [];
  state.trials = []; state.rentals = []; state.rentalCustomers = [];
  state.schedule = []; state.products = [];
  state.families = []; state.notes = []; state.cashCounts = [];
  state.swimGroups = []; state.drivers = []; state.advices = [];
  state.posts = []; state.membershipTransfers = [];
  state.settings = { expiringSoonDays: 3, lowStockThreshold: 3,
    facilityRates: { 'Football Court': 150, 'Boxing Room': 100, 'Swimming Pool': 200 },
    sports: DEFAULT_SPORTS.map((name, i) => ({ name, enabled: true, order: i })),
    summerCampPrices: DEFAULT_SUMMER_CAMP_PRICES.map(p => ({ ...p })) };
  state.__schema = SCHEMA_VERSION;
  window.__allowEmptySave = true;   // this empty write is intentional — bypass the wipe-guard
  render();
  if (skipConfirm) {
    // import flow: caller loads + saves the new data right after — keep this synchronous.
    save();
    window.__allowEmptySave = false;
  } else {
    // v6.388: a manual wipe REPLACES everything — confirm it reached the cloud before saying so.
    Promise.resolve(confirmSaved('Database cleared. Import your data from the Data Import page.'))
      .finally(() => { window.__allowEmptySave = false; });
  }
}

// Loads the bundled demo data (the 207 sample members, etc.). This is now
// opt-in only — called only by the "Load demo data" button. Real installs
// should never see this content; the admin imports his own data manually.
function loadDemoData() {
  const seed = window.SEED_DATA;
  if (!seed) { toast('Demo data not available', 'error'); return; }
  // Audit before the overwrite, while the real counts are still readable.
  try {
    audit('data.demo', 'database', `Replaced ALL data with demo data (was ${(state.members || []).length} members, ${(state.invoices || []).length} invoices)`,
      { wasMembers: (state.members || []).length, wasInvoices: (state.invoices || []).length });
  } catch (_) {}
  state.members = (seed.members || []).map(m => ({...m}));
  state.coaches = (seed.coaches || []).map(c => ({...c}));
  state.invoices = (seed.invoices || []).map(i => ({...i}));
  state.expenses = (seed.expenses || []).map(e => ({...e}));
  state.salaries = (seed.salaries || []).map(s => ({...s}));
  state.sales = (seed.sales || []).map(s => ({...s}));
  state.trials = (seed.trials || []).map(t => ({...t}));
  state.rentals = (seed.rentals || []).map(r => ({...r}));
  state.rentalCustomers = (seed.rentalCustomers || []).map(c => ({...c}));
  state.schedule = (seed.schedule || []).map(c => ({...c}));
  state.products = (seed.products || []).map(p => ({...p}));
  state.settings = seed.settings || { expiringSoonDays: 3, lowStockThreshold: 3,
    facilityRates: { 'Football Court': 150, 'Boxing Room': 100, 'Swimming Pool': 200 } };
  state.__schema = SCHEMA_VERSION;
  save();
}

// Legacy alias for any code that still calls loadSeed() — does nothing now.
function loadSeed() { /* intentionally empty — see loadDemoData() */ }
// Expose loadDemoData for inline onclick handlers
window.loadDemoData = loadDemoData;

// ─── Helpers ──────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'innerHTML') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) child.forEach(c => c != null && e.append(c instanceof Node ? c : document.createTextNode(c)));
    else e.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return e;
}

function html(strings, ...values) {
  // Simple template tag — assembles HTML string
  let result = '';
  strings.forEach((s, i) => {
    result += s;
    if (i < values.length) {
      const v = values[i];
      if (v == null) result += '';
      else if (Array.isArray(v)) result += v.join('');
      else result += String(v);
    }
  });
  return result;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' QAR';
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function fmtMonth(m) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(mo)-1]} ${y.slice(-2)}`;
}
// Unambiguous full month + 4-digit year (e.g. "July 2026") for customer-facing
// documents like invoices, where fmtMonth's "Jul 26" reads like a day. (v6.474)
function fmtMonthLong(m) {
  if (!m) return '—';
  const [y, mo] = String(m).split('-');
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const i = parseInt(mo) - 1;
  return (i >= 0 && i < 12 && y) ? `${months[i]} ${y}` : String(m);
}

// Arabic month names (e.g. يونيه, مايو) for the Arabic side of invoices.
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيه','يوليه','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function fmtDateAr(d) {
  if (!d) return '—';
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${parseInt(m[3], 10)} ${AR_MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`;
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    return `${dt.getDate()} ${AR_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  } catch { return d; }
}
function fmtMonthAr(m) {
  if (!m) return '—';
  const [y, mo] = m.split('-');
  return `${AR_MONTHS[parseInt(mo) - 1]} ${y}`;
}

// Discover every YYYY-MM that appears anywhere in the data. Single source of
// truth — never hard-code a month list. Pass {includeFuture:true} to also add
// today's month and the next one (useful for selectors when entering new data).
function availableMonths(opts = {}) {
  const set = new Set();
  (state.invoices || []).forEach(i => { if (i.month) set.add(i.month); });
  (state.expenses || []).forEach(e => {
    if (e.month) set.add(e.month);
    if (e.date) set.add(String(e.date).slice(0, 7));
  });
  (state.salaries || []).forEach(x => { if (x.month) set.add(x.month); });
  (state.members || []).forEach(m => {
    if (m.firstRegistration) set.add(String(m.firstRegistration).slice(0, 7));
    if (m.startDate) set.add(String(m.startDate).slice(0, 7));
    (m.subscriptions || []).forEach(s => {
      if (s.month && /^\d{4}-\d{2}$/.test(s.month)) set.add(s.month);
    });
    if (m.dailyAttendance) Object.keys(m.dailyAttendance).forEach(k => set.add(k));
  });
  if (opts.includeFuture) {
    const now = new Date();
    const ym = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    set.add(ym(now));
    set.add(ym(new Date(now.getFullYear(), now.getMonth()+1, 1)));
  }
  return [...set].filter(Boolean).sort();
}

// Days in a YYYY-MM string (uses Date so it's always correct, no hard-coded map).
function daysInMonth(ym) {
  if (!ym) return 31;
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Today's month as YYYY-MM
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// Convert YYYY-MM to a 3-letter month short ('2026-05' → 'may'). Used by
// legacy fields like subscription.month / expense.month that store the short.
function ymToShort(ym) {
  if (!ym) return null;
  const m = String(ym).match(/^\d{4}-(\d{2})$/);
  if (!m) return ym;  // already short
  const shorts = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  return shorts[parseInt(m[1])-1] || null;
}

// Latest month that actually has data, but never AHEAD of the current month, so a
// future-dated invoice (e.g. a July renewal created in June) doesn't make every
// screen default to a month that hasn't started yet. Falls back to today.
function latestDataMonth() {
  const cm = currentMonth();
  const a = availableMonths();
  if (!a.length) return cm;
  const started = a.filter(m => m && m <= cm);          // months that have begun
  if (started.length) return started.reduce((x, y) => (y > x ? y : x));
  return a.reduce((x, y) => (y > x ? y : x));            // all data is future-dated → newest
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length || !parts[0]) return '?';
  return ((parts[0][0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

// ─── Gender-aware member avatar ─────────────────────────────────────
// Boys (gender Male) get a 👦 on a blue tile, girls (Female) a 👧 on a pink tile;
// a member with no gender set keeps their initials on the default tile. Returns
// { content, bg, isEmoji } so callers can size the tile themselves.
function memberAvatarParts(m) {
  const g = m && m.gender;
  if (g === 'Male')   return { content: '👦', bg: 'linear-gradient(135deg,#5b8def,#3870d0)', isEmoji: true };
  if (g === 'Female') return { content: '👧', bg: 'linear-gradient(135deg,#ec4899,#d13d8a)', isEmoji: true };
  return { content: initials(m && m.name), bg: 'linear-gradient(135deg,var(--blue),var(--purple))', isEmoji: false };
}
// Full .avatar div for a member at the given pixel size (default 32).
function memberAvatarHtml(m, size, extraStyle) {
  size = size || 32;
  const { content, bg, isEmoji } = memberAvatarParts(m);
  const fs = Math.round(size * (isEmoji ? 0.58 : 0.36));
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${bg}${extraStyle ? ';' + extraStyle : ''}">${content}</div>`;
}

// ─── Coach avatar (sport-based emoji + gender-tinted tile) ───────────
// An emoji for a sport/activity. Reuses the camp icon map (hoisted). Returns ''
// for an empty sport and '⭐' for an unknown one.
function sportIcon(sport) { return (typeof campActivityIcon === 'function') ? campActivityIcon(sport) : ''; }
// A coach's primary (first) sport — drives their avatar emoji.
function coachPrimarySport(c) { return (c && Array.isArray(c.sports) && c.sports.length) ? c.sports[0] : null; }
// Tile colour by gender: male=blue, female=pink, unset=neutral brand gradient.
function genderTile(gender) {
  if (gender === 'Male')   return 'linear-gradient(135deg,#5b8def,#3870d0)';
  if (gender === 'Female') return 'linear-gradient(135deg,#ec4899,#d13d8a)';
  return 'linear-gradient(135deg,var(--blue),var(--purple))';
}
// Avatar for a coach/staff: their PRIMARY sport's emoji on a gender-tinted tile.
// Staff (no sport) fall back to 👔; a coach with no sport set falls back to 🥋.
function coachAvatarHtml(c, size, extraStyle) {
  size = size || 32;
  const sport = coachPrimarySport(c);
  const emoji = sport ? sportIcon(sport) : ((c && c.role === 'staff') ? '👔' : '🥋');
  const bg = genderTile(c && c.gender);
  const fs = Math.round(size * 0.56);
  return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${fs}px;background:${bg}${extraStyle ? ';' + extraStyle : ''}">${emoji || '🥋'}</div>`;
}

// The coach record for the signed-in account, resolved ROBUSTLY: prefer the
// account's mapped coachId, but if that is missing/stale (points to a coach that
// no longer exists) fall back to matching the LOGIN EMAIL to a coach's email.
// Returns the coach object, or null when the account isn't a coach / can't link.
function myCoach() {
  const u = state.user;
  if (!u || u.role !== 'coach') return null;
  const byId = (u.coachId != null) ? (state.coaches || []).find(c => c.id === u.coachId) : null;
  if (byId) return byId;
  const em = (u.email || u.username || '').trim().toLowerCase();
  if (em) {
    const byEmail = (state.coaches || []).find(c => (c.email || '').trim().toLowerCase() === em && em);
    if (byEmail) return byEmail;
  }
  return null;
}

// ─── Phone display + WhatsApp helpers ───────────────────────────────
// List of country codes shown in the mobile-input dropdown. Ordered by
// relevance to a Qatar-based club: GCC first, then Levant + nearby Arab
// states, then the most common nationalities working in Qatar, then a
// few major Western codes for visiting members. Qatar is the default.
const COUNTRY_CODES = [
  { code: '+974', flag: '🇶🇦', name: 'Qatar' },
  { code: '+971', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+965', flag: '🇰🇼', name: 'Kuwait' },
  { code: '+973', flag: '🇧🇭', name: 'Bahrain' },
  { code: '+968', flag: '🇴🇲', name: 'Oman' },
  { code: '+20',  flag: '🇪🇬', name: 'Egypt' },
  { code: '+962', flag: '🇯🇴', name: 'Jordan' },
  { code: '+961', flag: '🇱🇧', name: 'Lebanon' },
  { code: '+963', flag: '🇸🇾', name: 'Syria' },
  { code: '+964', flag: '🇮🇶', name: 'Iraq' },
  { code: '+967', flag: '🇾🇪', name: 'Yemen' },
  { code: '+970', flag: '🇵🇸', name: 'Palestine' },
  { code: '+218', flag: '🇱🇾', name: 'Libya' },
  { code: '+216', flag: '🇹🇳', name: 'Tunisia' },
  { code: '+213', flag: '🇩🇿', name: 'Algeria' },
  { code: '+212', flag: '🇲🇦', name: 'Morocco' },
  { code: '+249', flag: '🇸🇩', name: 'Sudan' },
  { code: '+91',  flag: '🇮🇳', name: 'India' },
  { code: '+92',  flag: '🇵🇰', name: 'Pakistan' },
  { code: '+880', flag: '🇧🇩', name: 'Bangladesh' },
  { code: '+94',  flag: '🇱🇰', name: 'Sri Lanka' },
  { code: '+977', flag: '🇳🇵', name: 'Nepal' },
  { code: '+63',  flag: '🇵🇭', name: 'Philippines' },
  { code: '+62',  flag: '🇮🇩', name: 'Indonesia' },
  { code: '+60',  flag: '🇲🇾', name: 'Malaysia' },
  { code: '+90',  flag: '🇹🇷', name: 'Turkey' },
  { code: '+98',  flag: '🇮🇷', name: 'Iran' },
  { code: '+254', flag: '🇰🇪', name: 'Kenya' },
  { code: '+27',  flag: '🇿🇦', name: 'South Africa' },
  { code: '+44',  flag: '🇬🇧', name: 'UK' },
  { code: '+1',   flag: '🇺🇸', name: 'USA / Canada' },
  { code: '+49',  flag: '🇩🇪', name: 'Germany' },
  { code: '+33',  flag: '🇫🇷', name: 'France' },
];
const DEFAULT_COUNTRY_CODE = '+974';
const MIN_PHONE_DIGITS = 8;  // National-number portion (excluding country code)

// Parse a stored phone string like "+97450012345" or "97450012345" or
// "974 5001 2345" into { code, digits }. Best-effort: matches the longest
// known country code prefix; if none matches, defaults to Qatar.
function parseStoredPhone(stored) {
  if (!stored) return { code: DEFAULT_COUNTRY_CODE, digits: '' };
  let s = String(stored).trim();
  const leadPlus = s.startsWith('+');
  const cleaned = s.replace(/[^\d]/g, '');
  // Sort codes by length DESC so '+974' wins over '+9'
  const codesSorted = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

  // Pass 1: explicit '+' prefix → match by country code
  if (leadPlus) {
    for (const c of codesSorted) {
      const digitsOfCode = c.code.replace('+', '');
      if (cleaned.startsWith(digitsOfCode)) {
        return { code: c.code, digits: cleaned.slice(digitsOfCode.length) };
      }
    }
  }

  // Pass 2: no '+' but the digits start with a known country code AND the
  // remaining national-number portion is at least MIN_PHONE_DIGITS long.
  // This catches CSV imports / legacy data where the leading '+' was missing.
  // Example: "97450012345" → +974 + 50012345
  for (const c of codesSorted) {
    const digitsOfCode = c.code.replace('+', '');
    if (cleaned.startsWith(digitsOfCode) &&
        cleaned.length - digitsOfCode.length >= MIN_PHONE_DIGITS) {
      return { code: c.code, digits: cleaned.slice(digitsOfCode.length) };
    }
  }

  // Pass 3: no country code detectable — treat the whole thing as the local
  // number under the default country (Qatar).
  return { code: DEFAULT_COUNTRY_CODE, digits: cleaned };
}

// Render the country-code dropdown + digit input as a single block.
// idPrefix: e.g. 'f-phone' → produces #f-phone-code and #f-phone-digits.
// currentPhone: stored value to pre-populate (best-effort parse).
function phoneInputHtml(idPrefix, currentPhone, opts = {}) {
  const { code, digits } = parseStoredPhone(currentPhone);
  const placeholder = opts.placeholder || `e.g. 50012345`;
  const required = opts.required !== false;
  const reqStar = required ? ' <span style="color:var(--accent)">*</span>' : '';
  const label = opts.label || 'Mobile';
  const fieldStyle = opts.fieldStyle || '';
  return `
    <div class="field" style="${fieldStyle}">
      <label>${escapeHtml(label)}${reqStar}</label>
      <div style="display:grid;grid-template-columns:120px 1fr;gap:6px">
        <select id="${idPrefix}-code">
          ${COUNTRY_CODES.map(c => `<option value="${c.code}" ${c.code === code ? 'selected' : ''}>${c.flag} ${c.code}</option>`).join('')}
        </select>
        <input id="${idPrefix}-digits" type="tel" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(digits)}" placeholder="${escapeHtml(placeholder)}" />
      </div>
      <div class="text-mute" style="font-size:10px;margin-top:3px">Country + ${MIN_PHONE_DIGITS}+ digits</div>
    </div>
  `;
}

// Read the phone input back. Returns { phone, code, digits, valid, error }.
// `phone` is the canonical combined string like "+97450012345".
// `valid` is false if digits < MIN_PHONE_DIGITS (caller decides what to do).
function readPhoneInput(idPrefix) {
  const codeEl = document.getElementById(idPrefix + '-code');
  const digitsEl = document.getElementById(idPrefix + '-digits');
  const code = codeEl ? codeEl.value : DEFAULT_COUNTRY_CODE;
  const rawDigits = digitsEl ? digitsEl.value.replace(/[^\d]/g, '') : '';
  // If admin pasted "+97450012345" into the digits field, strip the redundant code
  let digits = rawDigits;
  const codeDigits = code.replace('+', '');
  if (digits.startsWith(codeDigits) && digits.length > MIN_PHONE_DIGITS) {
    digits = digits.slice(codeDigits.length);
  }
  const valid = digits.length >= MIN_PHONE_DIGITS;
  const phone = digits ? `${code}${digits}` : '';
  return {
    phone,
    code,
    digits,
    valid,
    error: !digits ? 'Mobile required' : (!valid ? `Mobile must be at least ${MIN_PHONE_DIGITS} digits` : null),
  };
}

// Renders a phone number with a clickable WhatsApp icon. Used everywhere
// admin sees a phone (Members, Invoices, Rentals, Coaches, etc.) so the
// "message this person" action is always one click away.
//
// Filters out the +9747000... placeholder phones from old imports — they
// look like real numbers but reach nobody.
//
// opts:
//   stop:  default true — adds event.stopPropagation() so clicking the icon
//          inside a row doesn't also open the row's detail view
//   empty: HTML to show when no phone — defaults to a muted "—"
//   text:  pre-filled WhatsApp message (URL-encoded automatically)
function isRealPhone(phone) {
  if (!phone) return false;
  const trimmed = String(phone).trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('+9747000')) return false;  // legacy placeholder
  return true;
}

function waLink(phone, text) {
  if (!isRealPhone(phone)) return null;
  const clean = String(phone).replace(/[^\d]/g, '');
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${clean}${t}`;
}

// Bilingual birthday celebration message for the Birthdays screen.
function birthdayWaMessage(m) {
  const first = (m && m.name) ? String(m.name).split(' ')[0] : '';
  const ar = (m && m.nameArabic) ? String(m.nameArabic).trim() : '';
  const en = `Happy Birthday ${first}! 🎂🎉\n\nEveryone at Black Stars Sports Club wishes you a wonderful day filled with joy and success. Keep shining — see you on the mat! 🥋💪`;
  const arMsg = `🎂🎉 كل عام وأنت بخير${ar ? ' يا ' + ar : ''}!\n\nيتمنى لك جميع أعضاء نادي بلاك ستارز الرياضي يوماً سعيداً مليئاً بالفرح والنجاح. نراك في النادي! 🥋💪`;
  return en + '\n\n———\n\n' + arMsg;
}

// ─── REMINDER TEMPLATES ──────────────────────────────────────────
// Bilingual WhatsApp messages for renewal nudges. Stored in settings so
// admin can customize from System → Settings. Tokens are substituted at
// send time: {name}, {nameArabic}, {sport}, {coach}, {expiry}, {daysAgo}, {daysLeft}.
// If a member has no Arabic name, the Arabic section is skipped automatically.
const DEFAULT_REMINDER_TEMPLATES = {
  expired_en: `Hi {name} 👋

Your {sport} membership at Black Stars Sports Club expired {daysAgo} ago (on {expiry}).

We miss you on the mat! 🥋 Come back and pick up right where you left off — your goals are still waiting 💪🔥

Renew today and let's get back to work 🌟

⭐ Black Stars Sports Club`,
  expired_ar: `مرحباً {nameArabic} 👋

انتهى اشتراكك في {sport} بنادي بلاك ستارز الرياضي منذ {daysAgo} (بتاريخ {expiry}).

اشتقنا لك على البساط! 🥋 عُد وأكمل من حيث توقفت — أهدافك ما زالت تنتظرك 💪🔥

جدد اشتراكك اليوم ولنعد إلى التدريب 🌟

⭐ نادي بلاك ستارز الرياضي`,
  expiring_en: `Hi {name} 👋

Friendly reminder: your {sport} membership at Black Stars Sports Club expires in {daysLeft} (on {expiry}) ⏳

Don't break your momentum now! 🔥 Renew today and keep training toward your goals 💪 See you on the mat 🥋

⭐ Black Stars Sports Club`,
  expiring_ar: `مرحباً {nameArabic} 👋

تذكير ودّي: اشتراكك في {sport} بنادي بلاك ستارز الرياضي سينتهي خلال {daysLeft} (بتاريخ {expiry}) ⏳

لا توقف اندفاعك الآن! 🔥 جدد اشتراكك اليوم وواصل التقدّم نحو أهدافك 💪 نراك على البساط 🥋

⭐ نادي بلاك ستارز الرياضي`,
  completed_en: `Hi {name} 👋

Congratulations — you've completed all your {sport} sessions at Black Stars Sports Club! 🎉🥋

You put in the work and it shows 💪 Ready for the next round? Renew now to keep the momentum going 🔥

⭐ Black Stars Sports Club`,
  completed_ar: `مرحباً {nameArabic} 👋

مبارك — لقد أكملت جميع حصص {sport} بنادي بلاك ستارز الرياضي! 🎉🥋

بذلت جهداً رائعاً وظهرت النتيجة 💪 جاهز للجولة القادمة؟ جدّد الآن لتواصل تقدّمك 🔥

⭐ نادي بلاك ستارز الرياضي`,
  trial_en: `Hi {name} 👋

It was great having you at Black Stars Sports Club for your {sport} trial! 🥋 Our coaches were impressed 💪

Ready to make it official? Join us and start your journey — your spot is waiting and the team can't wait to train with you 🔥

Reply here and we'll get you set up 🌟

⭐ Black Stars Sports Club`,
  trial_ar: `مرحباً {nameArabic} 👋

سعدنا بوجودك في نادي بلاك ستارز الرياضي في حصة {sport} التجريبية! 🥋 وقد أعجب المدربون بأدائك 💪

جاهز للانضمام رسمياً؟ ابدأ رحلتك معنا — مكانك بانتظارك والفريق متحمس للتدريب معك 🔥

ردّ علينا هنا وسنجهّز لك كل شيء 🌟

⭐ نادي بلاك ستارز الرياضي`,
};

function reminderTemplate(key) {
  const fromSettings = state.settings?.reminderTemplates?.[key];
  return (typeof fromSettings === 'string' && fromSettings.trim())
    ? fromSettings
    : DEFAULT_REMINDER_TEMPLATES[key];
}

function joinSports(arr, conj) {
  if (!arr || !arr.length) return '';
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return arr[0] + ' ' + conj + ' ' + arr[1];
  return arr.slice(0, -1).join(', ') + ' ' + conj + ' ' + arr[arr.length - 1];
}

// Distinct sports a member would need to renew (their enrolments, excluding camp).
function memberRenewalSports(m) {
  const out = [];
  for (const e of (m?.enrollments || [])) {
    if (e.sport && e.sport !== SUMMER_CAMP && !out.includes(e.sport)) out.push(e.sport);
  }
  if (!out.length && m?.sport) out.push(m.sport);
  return out;
}

// A coach's earnings for a month: fixed salary + commission (rate% of revenue
// from invoices linked to this coach for currently-active members that month).
// monthKey = 'YYYY-MM'. Mirrors the Coach Performance / Salaries logic.
function coachEarnings(coach, monthKey) {
  let revenue = 0, commissionBase = 0; const studentSet = new Set();
  for (const inv of (state.invoices || [])) {
    if (inv.deleted) continue;
    if (monthKey && invoiceBillMonth(inv) !== monthKey) continue;
    // Walk LINE ITEMS so a multi-sport / merged invoice credits each coach only
    // for their own sport's price — not the whole invoice. Fall back to the
    // invoice-level coach when an invoice has no line items.
    const lines = (Array.isArray(inv.lineItems) && inv.lineItems.length)
      ? inv.lineItems
      : [{ coachId: inv.coachId, price: inv.amount || 0 }];
    let coachAmt = 0, involved = false, eligBase = 0;
    const mem = inv.customerId ? state.members.find(x => x.id === inv.customerId) : null;
    for (const li of lines) {
      if (li.coachId !== coach.id) continue;
      involved = true;
      coachAmt += parseFloat(li.price) || 0;
      // "BY PAYMENT (full fee in payment month)" pays the coach the WHOLE fee in the month the
      // membership was billed — attendance is IRRELEVANT here (that is the ATTENDANCE basis). Only
      // Summer Camp is excluded (it earns no coach commission); everything else counts at its FULL
      // price. (v6.448 — was elig.base, the attendance-prorated amount, AND gated on ≥1 attended
      // class, so a member billed 960 who had 0–3 attended paid the coach 0–240 instead of 576.)
      const elig = lineCommissionEligibility(mem, inv, li, null);
      if (!elig.excluded) eligBase += (parseFloat(li.price) || 0);
    }
    if (!involved) continue;
    revenue += coachAmt;
    if (inv.customerId && mem) {
      studentSet.add(mem.id);
      commissionBase += eligBase;
    }
  }
  const rate = coach.rate || 0;
  const commission = commissionBase * rate / 100;
  const fixed = coach.fixedSalary || 0;
  return { revenue, commissionBase, rate, commission, fixed, total: fixed + commission, students: studentSet.size };
}

// What ONE member is worth per renewal cycle = the sum of all their enrolment
// prices (what they pay each cycle for every sport they're enrolled in).
function memberRenewalValue(m) {
  if (!m) return 0;
  // 1) Preferred: sum of current enrolment prices (the intended renewal price).
  const list = (m.enrollments && m.enrollments.length)
    ? m.enrollments
    : (m.sport ? [{ price: m.price }] : []);
  let v = list.reduce((s, e) => s + (parseFloat(e.price) || 0), 0);
  if (v > 0) return v;
  // 2) Fallback: the member's most recent REAL invoice total (what they actually
  //    last paid). Skips zero / internal switch-credit invoices. This covers
  //    imported or renewed members whose enrolment prices weren't captured.
  if (state && Array.isArray(state.invoices)) {
    let best = null;
    for (const inv of state.invoices) {
      if (inv.customerId !== m.id || inv.switchCredit || inv.deleted) continue;
      if (!((parseFloat(inv.amount) || 0) > 0)) continue;
      const key = inv.date || inv.month || '';
      if (!best || key > best.key) best = { key, amount: parseFloat(inv.amount) || 0 };
    }
    if (best) return best.amount;
  }
  // 3) Last resort: latest subscription amountPaid.
  if (Array.isArray(m.subscriptions) && m.subscriptions.length) {
    for (let i = m.subscriptions.length - 1; i >= 0; i--) {
      const amt = parseFloat(m.subscriptions[i].amountPaid) || 0;
      if (amt > 0) return amt;
    }
  }
  return 0;
}

// Club-wide: if EVERY distinct (non-deleted) member renewed once, total value +
// how many members that covers, and how many of them have a priced membership.
function clubRenewalValue(members) {
  const list = (members || (state && state.members) || []).filter(m => !m.deleted);
  let total = 0, withValue = 0;
  for (const m of list) {
    const v = memberRenewalValue(m);
    total += v;
    if (v > 0) withValue++;
  }
  return { total, members: list.length, withValue };
}


// Date + time (e.g. "04 Jun 2026 · 03:12 PM").
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return fmtDate(iso.slice(0, 10)) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Build the WhatsApp message body for a given member + scenario.
// `kind` is 'expired' or 'expiring'. Pads English + Arabic, separated by a
// horizontal divider. Skips the Arabic section if the member has no Arabic name.
// Encouraging WhatsApp follow-up for a trial (prospect who came for a free class).
// Bilingual — Arabic first, then English. Uses a customisable template (Settings →
// reminder templates) with sensible defaults, and fills {name}/{sport}/{coach}.
function buildTrialFollowupMessage(t) {
  if (!t) return '';
  const sportEn = t.sport || 'training';
  const sportAr = t.sport || 'التدريب';
  const coach = t.coachId ? coachName(t.coachId) : '';
  function fill(tpl, isArabic) {
    return tpl
      .replace(/\{name\}/g, (isArabic ? (t.nameArabic || t.name) : t.name) || '')
      .replace(/\{nameArabic\}/g, t.nameArabic || t.name || '')
      .replace(/\{sport\}/g, isArabic ? sportAr : sportEn)
      .replace(/\{coach\}/g, coach);
  }
  const ar = fill(reminderTemplate('trial_ar'), true);
  const en = fill(reminderTemplate('trial_en'), false);
  return `${ar}\n\n— — — — — — —\n\n${en}`;
}

function buildReminderMessage(m, kind, daysFromToday) {
  const _sports = memberRenewalSports(m);
  const sportEn = joinSports(_sports, '&') || 'membership';
  const sportAr = joinSports(_sports, 'و') || 'membership';
  const coach = m.coachId ? coachName(m.coachId) : '';
  const expiry = fmtDate(m.expiryDate);
  // Days strings — Arabic uses Arabic numerals naturally via the locale; we
  // emit plain numbers since WhatsApp renders them correctly in both contexts
  const daysAbs = Math.abs(daysFromToday || 0);
  const daysAgoEn = daysAbs === 1 ? '1 day' : `${daysAbs} days`;
  const daysAgoAr = daysAbs === 1 ? 'يوم واحد' : daysAbs === 2 ? 'يومين' : `${daysAbs} أيام`;
  const daysLeftEn = daysAbs === 0 ? 'today' : daysAbs === 1 ? '1 day' : `${daysAbs} days`;
  const daysLeftAr = daysAbs === 0 ? 'اليوم' : daysAbs === 1 ? 'يوم واحد' : daysAbs === 2 ? 'يومين' : `${daysAbs} أيام`;

  function fill(tpl, isArabic) {
    return tpl
      .replace(/\{name\}/g, m.name || '')
      .replace(/\{nameArabic\}/g, m.nameArabic || m.name || '')
      .replace(/\{sport\}/g, isArabic ? sportAr : sportEn)
      .replace(/\{coach\}/g, coach)
      .replace(/\{expiry\}/g, expiry || '')
      .replace(/\{daysAgo\}/g, isArabic ? daysAgoAr : daysAgoEn)
      .replace(/\{daysLeft\}/g, isArabic ? daysLeftAr : daysLeftEn);
  }

  const enKey = kind === 'expired' ? 'expired_en' : kind === 'completed' ? 'completed_en' : 'expiring_en';
  const arKey = kind === 'expired' ? 'expired_ar' : kind === 'completed' ? 'completed_ar' : 'expiring_ar';
  const en = fill(reminderTemplate(enKey), false);
  const ar = fill(reminderTemplate(arKey), true);   // {nameArabic} falls back to {name}
  // Always send BOTH languages, Arabic first.
  return `${ar}\n\n— — — — — — —\n\n${en}`;
}

// ─── DUPLICATE DETECTION ─────────────────────────────────────────
// Normalizes a phone for comparison: digits-only.
// Two phones are considered "duplicates" if:
//   (a) their digits-only forms are equal, OR
//   (b) one is a suffix of the other AND the shorter one has ≥ 8 digits
//       (catches the "+97450012345" vs "50012345" case where one stored the
//        country code and the other didn't)
// Shared search matcher: builds a normalised haystack from the given fields and
// tests the query against it (Arabic-letter-folded + lowercase), then falls back
// to phone-digit matching. `phones` are the stored phone fields to digit-match.
function searchMatchesFields(query, textFields, phones) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  const q = normalizeArabicForSearch(raw);
  const hay = normalizeArabicForSearch((textFields || []).filter(Boolean).join(' '));
  if (q && hay.includes(q)) return true;   // fast path: the whole phrase appears as typed
  // SMART (token-AND) MATCH (v6.384): Arabic full names carry father/grandfather names in the
  // middle, so the words a user types are real but NOT adjacent — "جابر الميت" must find
  // "جابر راشد جابر محمد الميت", which a contiguous substring match misses entirely. Require every
  // WORD of the query to appear somewhere in the record instead, so word order and the words in
  // between stop mattering ("rashid mayet" also finds "Jaber Rashid J M Al-Mayet").
  // NB: normalizeArabicForSearch() STRIPS whitespace (so "عبد الله" matches "عبدالله"), so the raw
  // query must be split into words FIRST and each word normalized on its own — splitting the
  // already-normalized string would yield one glued token and never match.
  if (hay) {
    const tokens = raw.split(/\s+/).map(normalizeArabicForSearch).filter(Boolean);
    if (tokens.length > 1 && tokens.every(tk => hay.includes(tk))) return true;
  }
  // Phone-aware fallback: match by digits, format-insensitive.
  const qDigits = raw.replace(/\D/g, '');
  if (qDigits.length >= 4) {
    for (const p of (phones || [])) {
      if (p && phoneSearchMatches(p, qDigits)) return true;
    }
  }
  return false;
}

function normalizePhoneForCompare(phone) {
  if (!phone) return '';
  let d = String(phone).replace(/[^\d]/g, '');
  // Canonicalise Qatari numbers to the local 8-digit form so every way of writing
  // the same number compares equal: +97450413948 / 0097450413948 / 974 50413948 /
  // 50413948 / "5041 3948" all reduce to 50413948.
  d = d.replace(/^00/, '');        // 00974… → 974…
  if (d.length > 8 && d.startsWith('974')) d = d.slice(3);   // drop 974 country code
  return d;
}

// Normalise Arabic text so common letter variants compare equal in search:
//  • alef forms أ إ آ ٱ → ا
//  • ة → ه , ى → ي , ؤ → و , ئ → ي
//  • strip tashkeel (diacritics) and tatweel (ـ)
// Also lowercases, so it's safe to run on mixed Arabic/Latin strings.
function normalizeArabicForSearch(s) {
  if (!s) return '';
  return String(s)
    .replace(/[أإآٱ]/g, 'ا')        // alef variants → ا
    .replace(/ة/g, 'ه')             // ة → ه
    .replace(/ى/g, 'ي')             // ى → ي
    .replace(/ؤ/g, 'و')             // ؤ → و
    .replace(/ئ/g, 'ي')             // ئ → ي
    .replace(/ء/g, '')              // standalone hamza ء → (drop)
    .replace(/[\u064B-\u0652\u0670]/g, '')   // tashkeel/diacritics
    .replace(/ـ/g, '')              // tatweel ـ
    .replace(/[ \t\n\r\u00A0\u200B\u200C\u200D\u202F\uFEFF]+/g, '')   // all spaces incl Arabic/NBSP/zero-width
    .toLowerCase()
    .trim();
}

// Returns true if two stored phones likely refer to the same person.
function phonesMatch(a, b) {
  const aD = normalizePhoneForCompare(a);
  const bD = normalizePhoneForCompare(b);
  if (!aD || !bD) return false;
  if (aD === bD) return true;
  // Suffix match — the shorter one is missing the country code
  const minLen = MIN_PHONE_DIGITS;  // 8
  if (aD.length >= minLen && bD.length >= minLen) {
    if (aD.endsWith(bD) || bD.endsWith(aD)) return true;
  }
  return false;
}

// ─── Partial payments ───────────────────────────────────────────────
// An invoice's `amount` is the full price. `amountPaid` is cash collected so
// far, and `payments` is the receipt ledger [{date, month, amount, method}].
// Legacy invoices (neither field) are treated as fully paid, so historical
// revenue is unchanged. Revenue is CASH-basis: counted in the month each
// payment is received. Coach commission stays on the full fee (uses `amount`).
// Sum of the payment LEDGER with merge-duplicates collapsed. The payments[] ledger is the
// designed source of truth ("paid is always just the sum of these rows"), but multi-device
// merges can (a) leave the cached `amountPaid` STALE — missing a payment another device
// recorded (e.g. a member paid 500 twice on different days, amountPaid still shows 500), or
// (b) DUPLICATE a row (two identical rows sharing a pid base like `c634|…|card#1`/`#2`).
// This collapses rows that share a pid base (`…#N` stripped) so a merge-duplicate is counted
// once, while genuinely distinct payments (different pid bases) all count. Returns null when
// the invoice has no ledger (legacy invoice → fall back to amountPaid). (v6.439)
function invoicePaymentsSumDeduped(inv) {
  const pmts = (inv && Array.isArray(inv.payments)) ? inv.payments : [];
  if (!pmts.length) return null;
  const seen = new Set();
  let sum = 0;
  for (const p of pmts) {
    const base = p && p.pid ? String(p.pid).replace(/#\d+$/, '') : null;
    if (base) { if (seen.has(base)) continue; seen.add(base); }   // pid-bearing rows dedup by base; pid-less rows always count
    sum += Number(p.amount) || 0;
  }
  return Math.round(sum * 100) / 100;
}
function invoicePaid(inv) {
  if (!inv) return 0;
  // Credit the HIGHER of the cached amountPaid and the deduplicated ledger. This corrects a stale
  // amountPaid (the ledger proves more was paid → the due drops), while never letting a
  // merge-clobbered ledger INCREASE what a member owes. Net effect: this can only ever REDUCE an
  // over-stated balance, never create a phantom one. Legacy invoices (no ledger) keep amountPaid. (v6.439)
  const led = invoicePaymentsSumDeduped(inv);
  if (led != null) return Math.max(Number(inv.amountPaid) || 0, led);
  if (inv.amountPaid != null) return inv.amountPaid;
  return inv.amount || 0;               // legacy = fully paid
}

// Canonical payment-method token. Collapses any casing / label ("Cash", "Bank
// transfer", "Visa", Arabic) to exactly one of: cash | card | fawran | transfer.
// Applied on WRITE (recordPayment) so a by-method breakdown can NEVER split into
// separate "cash" vs "Cash" buckets (the accuracy bug where 19 camp payments were
// stored as capital-C "Cash"). The financial screens also normalise on read.
function normalizeMethod(mRaw) {
  const x = String(mRaw == null ? '' : mRaw).toLowerCase();
  if (x.indexOf('card') >= 0 || x.indexOf('visa') >= 0 || x.indexOf('mada') >= 0) return 'card';
  if (x.indexOf('fawran') >= 0 || x.indexOf('فوران') >= 0) return 'fawran';
  if (x.indexOf('transfer') >= 0 || x.indexOf('bank') >= 0 || x.indexOf('online') >= 0 || x.indexOf('حويل') >= 0) return 'transfer';
  return 'cash';
}

// ── The ONE supported way to add money to an invoice ─────────────────────────
// Append a single immutable, dated payment row. APPEND-ONLY: existing rows are
// never rewritten, re-split, or re-derived. Amount is rounded to 2dp and must be
// finite and non-zero. `paid` is always just the sum of these rows. This is the
// guardrail that makes the payment ledger impossible to corrupt by re-derivation
// (the failure mode that produced the old garbage rows cannot occur here).
function recordPayment(inv, opts) {
  if (!inv) return null;
  opts = opts || {};
  const amt = Math.round((Number(opts.amount) || 0) * 100) / 100;
  if (!isFinite(amt) || amt === 0) return null;
  if (!Array.isArray(inv.payments)) inv.payments = [];
  const date = opts.date || TODAY;
  const row = { date, month: String(date).slice(0, 7), amount: amt, method: normalizeMethod(opts.method) };
  if (opts.sport) row.sport = opts.sport;   // tag: which SPORT this installment pays for (drives the per-month split)
  // Who recorded this installment (req #4 payment history + #5 last-updated).
  row.by = opts.by || currentUserId();
  row.byName = opts.byName || currentUserName();
  row.at = new Date().toISOString();
  inv.payments.push(row);
  inv.amountPaid = inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  stampUpdate(inv);
  return row;
}
// Sum of an invoice's recorded payment rows (the canonical paid amount when a
// payments[] ledger exists). Falls back to invoicePaid for legacy invoices.
function invoicePaymentsSum(inv) {
  if (inv && Array.isArray(inv.payments) && inv.payments.length) {
    return inv.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  }
  return invoicePaid(inv);
}

// How much of a (possibly multi-sport) invoice was paid TOWARD ONE sport.
// Payments tagged with that sport are counted directly; any remaining (untagged,
// legacy) paid amount is apportioned by the sport's price share. This stops the
// "Edit pricing" screen from mixing two sports' partial payments together.
function invoicePaidForSport(inv, sport) {
  if (!inv) return 0;
  const total = invoicePaid(inv);
  const pays = Array.isArray(inv.payments) ? inv.payments : [];
  let taggedForSport = 0, taggedTotal = 0;
  for (const p of pays) {
    if (p && p.sport) {
      const amt = Number(p.amount) || 0;
      taggedTotal += amt;
      if (p.sport === sport) taggedForSport += amt;
    }
  }
  const lineSum = (Array.isArray(inv.lineItems) && inv.lineItems.length)
    ? inv.lineItems.reduce((s, x) => s + (Number(x.price) || 0), 0)
    : (Number(inv.amount) || 0);
  const li = Array.isArray(inv.lineItems) ? inv.lineItems.find(x => x.sport === sport) : null;
  const linePrice = li ? (Number(li.price) || 0) : (Number(inv.amount) || 0);
  const share = lineSum > 0 ? (linePrice / lineSum) : 1;
  const untagged = Math.max(0, total - taggedTotal);
  return taggedForSport + untagged * share;
}
// Canonical invoice TOTAL. When an invoice has line items, THEY are the bill (each
// sport's price) — `inv.amount` is only a cache that can go stale if a sport was
// added without recomputing it (e.g. Football added to a member who already had
// Summer Camp). Using the line sum makes balance / status / dues reflect what the
// member actually owes — the same figure the Edit-pricing screen shows. Falls back
// to inv.amount for single-line / legacy invoices with no line items.
function invoiceTotal(inv) {
  if (!inv) return 0;
  const lis = inv.lineItems;
  if (Array.isArray(lis) && lis.length) {
    // REDUNDANT-SUMMARY GUARD (v6.441): a re-sync can leave a sport-LESS "summary" line (price = the
    // whole membership) ALONGSIDE the itemized per-sport lines, which DOUBLES the total (e.g. a flat
    // 1125 + Kick Boxing/Swimming/Karate 375×3 summed to 2250, so a fully-paid member showed owing the
    // whole amount again). When itemized sport lines exist, drop any sport-less line whose price equals
    // their sum — it's a duplicate summary, not a real add-on. A sport-less line with a DIFFERENT
    // amount (e.g. a registration fee) still counts.
    const sportedSum = lis.reduce((s, li) => s + (li && li.sport ? (Number(li.price) || 0) : 0), 0);
    const hasSported = lis.some(li => li && li.sport);
    let total = 0;
    for (const li of lis) {
      const price = Number(li && li.price) || 0;
      if (hasSported && li && !li.sport && Math.abs(price - sportedSum) < 0.5) continue;   // redundant summary line
      total += price;
    }
    return total;
  }
  return Number(inv.amount) || 0;
}
function invoiceBalance(inv) {
  if (!inv) return 0;
  // Legacy invoices with NO payment ledger are treated as fully paid (the app's
  // long-standing convention) — never invent a phantom balance for them.
  if (inv.amountPaid == null && !(Array.isArray(inv.payments) && inv.payments.length)) return 0;
  return Math.max(0, invoiceTotal(inv) - invoicePaid(inv));
}
function invoiceStatus(inv) {
  if (!inv || invoiceTotal(inv) <= 0) return 'Paid';
  const paid = invoicePaid(inv);
  if (paid <= 0.001) return 'Unpaid';
  if (invoiceBalance(inv) > 0.001) return 'Partial';
  return 'Paid';
}
// ── Canonical month-revenue (SINGLE SOURCE OF TRUTH) ─────────────────────────
// Every "revenue / billed / collected / due" KPI MUST go through these so the
// Invoices, Transactions, Club Revenue and Owner Dashboard screens can never
// disagree again. Definition (matches the Invoices screen, the agreed truth):
//   • Scope  = invoices whose BILLING MONTH (i.month, falling back to the date)
//              equals the given YYYY-MM, excluding soft-deleted invoices.
//   • Value  = i.amount  (the invoice's own charged amount — NOT a re-sum of
//              line items, which can drift from amount and caused the 92,480 vs
//              91,530 gap). Line items are still used ONLY for per-sport / per-
//              coach attribution, never for the headline total.
function invoiceBillMonth(i) { return (i && (i.month || String(i.date || '').slice(0, 7))) || ''; }

// Fast member-by-id lookup, rebuilt only when the members array reference changes
// (i.e. on load / remote merge), so the hot revenue paths below stay O(1) per line.
let _memberIdx = null, _memberIdxSrc = null;
function memberById(id) {
  if (_memberIdxSrc !== state.members) {
    _memberIdxSrc = state.members;
    _memberIdx = new Map();
    for (const m of (state.members || [])) if (m) _memberIdx.set(m.id, m);
  }
  return _memberIdx.get(id) || null;
}

// The month a sport (invoice line) actually STARTS, taken from the member's
// subscription for that sport — the basis for revenue recognition (club policy:
// revenue follows the sport's start date, not the invoice month or payment date).
function lineSportStartMonth(li, inv) {
  if (!li || !inv || inv.customerId == null) return null;
  const sport = li.sport;
  if (!sport) return null;
  const mem = memberById(inv.customerId);
  if (!mem || !Array.isArray(mem.subscriptions)) return null;
  const subs = mem.subscriptions.filter(s => s && (s.activity || '') === sport);
  if (!subs.length) return null;
  const invMonth = inv.month || String(inv.date || '').slice(0, 7);
  const invDate = String(inv.date || (inv.month ? inv.month + '-15' : '')).slice(0, 10);
  // Pick the RIGHT subscription for THIS invoice (a member who renewed has several
  // for the same sport). Order: (1) exact invoice-ref link, (2) a subscription that
  // STARTED the same month as the invoice — a renewal invoice dated 30 Jun belongs to
  // the June period, not the member's original April enrolment, (3) the latest
  // subscription that started on/before the invoice date, (4) the first as a fallback.
  let sub = subs.find(s => s.invoiceNumber && inv.ref && s.invoiceNumber === inv.ref);
  if (!sub && invMonth) sub = subs.find(s => String(s.start || '').slice(0, 7) === invMonth);
  if (!sub && invDate) sub = subs.filter(s => s.start && String(s.start).slice(0, 10) <= invDate)
    .sort((a, b) => String(b.start).localeCompare(String(a.start)))[0];
  if (!sub) sub = subs[0];
  return (sub && sub.start) ? String(sub.start).slice(0, 7) : null;
}

// Day-level START date of every activity on an invoice — the subscription start date
// (YYYY-MM-DD) for each sport line, using the SAME subscription-picking as
// lineSportStartMonth. Used by the Invoices date filter so a picked date / range can
// match the invoice date OR any activity's start date. A walk-in / unlinked invoice
// (no member or no matching subscription) returns [] → it matches on its invoice date
// only, as intended.
function invoiceActivityStartDates(inv) {
  if (!inv || inv.customerId == null) return [];
  const mem = memberById(inv.customerId);
  if (!mem || !Array.isArray(mem.subscriptions)) return [];
  const items = (Array.isArray(inv.lineItems) && inv.lineItems.length) ? inv.lineItems : (inv.sport ? [{ sport: inv.sport }] : []);
  const invMonth = inv.month || String(inv.date || '').slice(0, 7);
  const invDate = String(inv.date || (inv.month ? inv.month + '-15' : '')).slice(0, 10);
  const out = new Set();
  for (const li of items) {
    const sport = li && li.sport;
    if (!sport) continue;
    const subs = mem.subscriptions.filter(s => s && (s.activity || '') === sport);
    if (!subs.length) continue;
    let sub = subs.find(s => s.invoiceNumber && inv.ref && s.invoiceNumber === inv.ref);
    if (!sub && invMonth) sub = subs.find(s => String(s.start || '').slice(0, 7) === invMonth);
    if (!sub && invDate) sub = subs.filter(s => s.start && String(s.start).slice(0, 10) <= invDate).sort((a, b) => String(b.start).localeCompare(String(a.start)))[0];
    if (!sub) sub = subs[0];
    if (sub && sub.start) out.add(String(sub.start).slice(0, 10));
  }
  return [...out];
}

// Per-line billing month: a sport added in a later month carries its own billMonth;
// otherwise it bills in the invoice's month. Used by COMMISSION scoping (kept on the
// invoice month so payroll is unchanged). REVENUE uses lineRevenueMonth() below.
function lineBillMonth(li, inv) { return (li && li.billMonth) || invoiceBillMonth(inv); }

// Per-line REVENUE month = the month that SPORT's revenue is recognized. Order:
//   1) an explicit li.billMonth (set when a sport is added in a later month), then
//   2) the sport's subscription START month (club policy — e.g. a Summer Camp that
//      starts in July counts in July even though the invoice was issued in June), then
//   3) the invoice's own month as a fallback.
// This lets ONE invoice span months — each sport's revenue counts in its start
// month — without splitting the invoice. (Commission stays on lineBillMonth.)
function lineRevenueMonth(li, inv) {
  if (li && li.billMonth) return li.billMonth;
  return lineSportStartMonth(li, inv) || invoiceBillMonth(inv);
}

// Map of month -> fraction of the invoice's value billed that month (by line price),
// on the REVENUE basis (each sport in its start month). No lineItems (rentals/sales/
// products) -> the whole invoice in its own month.
function invoiceMonthShares(inv) {
  const base = invoiceBillMonth(inv);
  const items = (inv && Array.isArray(inv.lineItems) && inv.lineItems.length) ? inv.lineItems : null;
  if (!items) return new Map([[base, 1]]);
  const sum = items.reduce((s, li) => s + (Number(li.price) || 0), 0);
  const m = new Map();
  if (sum <= 0) { m.set(base, 1); return m; }
  for (const li of items) {
    const mo = lineRevenueMonth(li, inv);
    m.set(mo, (m.get(mo) || 0) + (Number(li.price) || 0) / sum);
  }
  return m;
}
function invoiceMonths(inv) { return [...invoiceMonthShares(inv).keys()]; }
function invoiceMonthShare(inv, ym) { return invoiceMonthShares(inv).get(ym) || 0; }
function invoiceTouchesMonth(inv, ym) { return invoiceMonthShares(inv).has(ym); }

// Invoices whose PRIMARY month is ym (back-compat for counts).
function monthInvoices(ym) {
  return (state.invoices || []).filter(i => i && !i.deleted && invoiceBillMonth(i) === ym);
}
// Invoices that bill ANY value in ym — used for SEARCH / listing / month dropdowns
// so a multi-month invoice shows up under every month it touches.
function monthInvoicesAny(ym) {
  return (state.invoices || []).filter(i => i && !i.deleted && invoiceTouchesMonth(i, ym));
}
// Billed / collected / due in ym are LINE-aware: each invoice contributes its share
// for that month. For a single-month invoice the share is 1, so these are byte-for-
// byte identical to the old invoice-level sums (no change to existing data).
function billedInMonth(ym, pred) {
  let t = 0;
  for (const i of (state.invoices || [])) {
    if (!i || i.deleted) continue;
    if (pred && !pred(i)) continue;
    const sh = invoiceMonthShare(i, ym);
    if (sh) t += invoiceTotal(i) * sh;   // invoiceTotal = Σ line prices (or inv.amount if no lines) — the SAME total balance/dues use, so every screen agrees
  }
  return t;
}
// Collected toward a month's billing, using the PRECISE per-payment attribution
// (invoicePaidInMonth: tagged installments count in their sport's month, untagged
// waterfall earliest-first), capped at that month's billed so it can never exceed
// billed. This is the SAME "collected" the Invoices & Transactions screens show, so
// every financial screen agrees. The identity billed = collected + due holds per
// month (see dueInMonth). Raw cash by payment date is separate: cashCollectedInMonth.
function invoiceBilledInMonth(inv, ym) { return invoiceTotal(inv) * invoiceMonthShare(inv, ym); }
function collectedInMonth(ym) {
  let t = 0;
  for (const i of (state.invoices || [])) {
    if (!i || i.deleted) continue;
    const billed = invoiceBilledInMonth(i, ym);
    if (billed <= 0) continue;
    t += Math.min(invoicePaidInMonth(i, ym), billed);
  }
  return t;
}
function dueInMonth(ym) {
  let t = 0;
  for (const i of (state.invoices || [])) {
    if (!i || i.deleted) continue;
    const billed = invoiceBilledInMonth(i, ym);
    if (billed <= 0) continue;
    t += Math.max(0, billed - invoicePaidInMonth(i, ym));
  }
  return t;
}
// CASH actually collected in a month, by each PAYMENT's own date (drawer basis) —
// money physically received that month. Distinct from billedInMonth (revenue,
// recognized in each sport's START month). A camp prepaid in June but starting in
// July shows here in June (cash in) yet in July's revenue.
function cashCollectedInMonth(ym) {
  let t = 0;
  for (const i of (state.invoices || [])) { if (!i || i.deleted) continue; t += cashInMonth(i, ym); }
  return t;
}
// How much of an invoice's PAID amount belongs to a given month, using each
// payment's SPORT tag: a payment tagged to a sport counts in that sport's START
// month (regardless of the date it was physically paid — that stays in history).
// Untagged payments are applied EARLIEST-MONTH-FIRST against the remaining billed.
// This is the precise per-payment attribution behind the per-month Paid / Due.
function invoicePaidInMonth(inv, ym) {
  if (!inv) return 0;
  const pays = Array.isArray(inv.payments) ? inv.payments : [];
  if (!pays.length) {   // legacy invoice, no ledger → its paid sits in its own month
    if (invoiceBillMonth(inv) !== ym) return 0;
    // Derive from invoiceBalance so this can never contradict it. A legacy invoice whose
    // cached inv.amount drifted BELOW its line sum used to report a phantom Due here (and
    // on Transactions) while invoiceBalance/invoiceStatus/memberOutstanding all said Paid.
    return invoiceTotal(inv) - invoiceBalance(inv);
  }
  const invValue = invoiceTotal(inv);   // canonical total (Σ lines)
  const billedByMonth = new Map();
  for (const [mo, frac] of invoiceMonthShares(inv)) billedByMonth.set(mo, invValue * frac);
  // 1) Tagged payments → their sport's start month, exactly.
  const taggedByMonth = new Map();
  let tagged = 0, total = 0;
  for (const p of pays) {
    const a = Number(p.amount) || 0; total += a;
    if (p && p.sport) {
      const mo = lineSportStartMonth({ sport: p.sport }, inv) || _pMonth(p);
      taggedByMonth.set(mo, (taggedByMonth.get(mo) || 0) + a);
      tagged += a;
    }
  }
  // 2) Untagged remainder → waterfall over (billed − tagged), earliest month first.
  let untagged = total - tagged;
  const untaggedByMonth = new Map();
  for (const mo of [...billedByMonth.keys()].sort()) {
    const remain = Math.max(0, (billedByMonth.get(mo) || 0) - (taggedByMonth.get(mo) || 0));
    const alloc = Math.min(untagged, remain);
    if (alloc !== 0) untaggedByMonth.set(mo, alloc);
    untagged -= alloc;
  }
  return (taggedByMonth.get(ym) || 0) + (untaggedByMonth.get(ym) || 0);
}

// Period-aware (predicate on YYYY-MM) versions for the Reports dashboard, so it
// uses the SAME billed basis as the Monthly Report instead of a separate cash one.
function billedInPeriod(monthPred) {
  let t = 0;
  for (const i of (state.invoices || [])) {
    if (!i || i.deleted) continue;
    for (const [mo, sh] of invoiceMonthShares(i)) if (monthPred(mo)) t += invoiceTotal(i) * sh;   // canonical total (Σ lines) — matches billedInMonth
  }
  return t;
}
function billedByCategoryInPeriod(monthPred) {
  const out = {};
  for (const i of (state.invoices || [])) {
    if (!i || i.deleted) continue;
    const cat = i.category || 'Membership';
    for (const [mo, sh] of invoiceMonthShares(i)) if (monthPred(mo)) out[cat] = (out[cat] || 0) + invoiceTotal(i) * sh;
  }
  return out;
}
function billedBySportInPeriod(monthPred) {
  const out = {};
  for (const i of (state.invoices || [])) {
    if (!i || i.deleted) continue;
    const amount = invoiceTotal(i);
    const items = (Array.isArray(i.lineItems) && i.lineItems.length) ? i.lineItems
      : [{ sport: i.sport || i.activity || i.category || 'Other', price: amount }];
    const lineSum = items.reduce((s, li) => s + (Number(li.price) || 0), 0);
    for (const li of items) {
      const mo = lineBillMonth(li, i);
      if (!monthPred(mo)) continue;
      const sp = li.sport || i.sport || i.activity || i.category || 'Other';
      // Normalize line price to the invoice amount so per-sport totals re-sum to
      // billedInPeriod even when the invoice carries a discount.
      const val = lineSum > 0 ? amount * ((Number(li.price) || 0) / lineSum) : (items.length ? amount / items.length : 0);
      out[sp] = (out[sp] || 0) + val;
    }
  }
  return out;
}
// All months that appear anywhere in the data (invoices / expenses / salaries).
function allDataMonths() {
  const s = new Set();
  for (const i of (state.invoices || [])) if (!i.deleted) for (const mo of invoiceMonths(i)) if (mo) s.add(mo);
  for (const e of (state.expenses || [])) { if (e.deleted) continue; const mo = e.month || String(e.date || '').slice(0, 7); if (mo) s.add(mo); }
  for (const x of (state.salaries || [])) if (x.month) s.add(x.month);
  return [...s];
}
// Auto-calculated salary COST over a period = Σ salariesEarnedInMonth for each
// month in the period (same single source of truth used by the Monthly Report).
function salariesEarnedInPeriod(monthPred) {
  let t = 0;
  for (const mo of allDataMonths()) if (monthPred(mo)) t += salariesEarnedInMonth(mo);
  return t;
}
// Attribute an invoice's i.amount across its line items proportionally, so a
// per-sport / per-coach breakdown always re-sums to billedInMonth (no drift).
function invoiceLineShares(i) {
  const items = (i.lineItems && i.lineItems.length) ? i.lineItems
    : [{ sport: i.sport || null, coachId: i.coachId || null, price: i.amount || 0 }];
  const liSum = items.reduce((s, li) => s + (Number(li.price) || 0), 0);
  const amount = invoiceTotal(i);   // canonical total (Σ lines) — per-sport/coach shares re-sum to billedInMonth
  const factor = liSum > 0 ? amount / liSum : (items.length ? amount / items.length : 0);
  return items.map(li => ({
    sport: li.sport, coachId: li.coachId != null ? li.coachId : i.coachId,
    value: liSum > 0 ? (Number(li.price) || 0) * factor : factor,
  }));
}
function _pMonth(p) { return p.month || (p.date || '').slice(0, 7); }
// Cash received for this invoice in a specific month.
function cashInMonth(inv, monthKey) {
  if (!inv) return 0;
  if (Array.isArray(inv.payments) && inv.payments.length)
    return inv.payments.reduce((s, p) => s + (_pMonth(p) === monthKey ? (p.amount || 0) : 0), 0);
  return inv.month === monthKey ? invoicePaid(inv) : 0;   // legacy fallback
}
// Cash received within a month-range, given a predicate on the YYYY-MM string.
function cashInPeriod(inv, monthPred) {
  if (!inv) return 0;
  if (Array.isArray(inv.payments) && inv.payments.length)
    return inv.payments.reduce((s, p) => s + (monthPred(_pMonth(p)) ? (p.amount || 0) : 0), 0);
  return monthPred(inv.month) ? invoicePaid(inv) : 0;     // legacy fallback
}
// Total salary CASH actually paid out for a month ('all' = whole dataset).
// A 'paid' record stores snapshotNet (net handed over after deducting any
// advance); an 'advance' record stores amount. Summing advance.amount +
// paid.snapshotNet = the real money out (no double-count). Older/legacy records
// that used amount/paid are still handled by the fallback.
// A "Salary" expense category (any spelling: Salary / Salaries) means money paid
// to a coach — a settlement of the auto-calculated salary cost, NOT an extra P&L
// expense. So these are excluded from the expense total and counted as paid-so-far.
function isSalaryCategory(cat) {
  return String(cat || '').toLowerCase().startsWith('salar');
}

// An AD-HOC / external coach salary payment: a "Salary" expense with a free-text
// coach name and NO registered coach id. These coaches have no auto-calculated
// pay, so their payment IS their salary cost (it must be counted in the P&L),
// unlike a registered coach's payment which merely settles the auto-calc cost.
function isAdHocSalaryExpense(e) {
  return e && !e.deleted && isSalaryCategory(e.category) && !!String(e.coachName || '').trim() && !e.coachId;
}
function adHocSalariesInMonth(ym) {
  let total = 0;
  for (const e of (state.expenses || [])) {
    if (!isAdHocSalaryExpense(e)) continue;
    const m = e.month || String(e.date || '').slice(0, 7);
    if (ym !== 'all' && m !== ym) continue;
    total += Number(e.amount) || 0;
  }
  return total;
}

function salariesPaidInMonth(ym) {
  let total = 0;
  for (const s of (state.salaries || [])) {
    if (ym !== 'all' && (s.month || '') !== ym) continue;
    if (s.kind === 'advance') total += Number(s.amount || 0) || 0;
    // A modern record carries its own payments[] — sum THOSE, not a stale snapshotNet
    // (the snapshot is what was owed at pay time, not what was handed over).
    else if (Array.isArray(s.payments)) total += salaryPaidTotal(s);
    else if (s.kind === 'paid') total += Number(s.snapshotNet != null ? s.snapshotNet : (s.amount != null ? s.amount : s.paid || 0)) || 0;
    else total += Number(s.amount != null ? s.amount : (s.paid || 0)) || 0;   // legacy
  }
  // Salary payments logged on the Expenses screen (category "Salary") also count
  // as money handed to coaches. These are settlements of the already-booked
  // salary cost, so they are EXCLUDED from the P&L expense total (see
  // isSalaryCategory usage) and surface here as "paid so far" instead.
  for (const e of (state.expenses || [])) {
    if (e.deleted) continue;
    if (!isSalaryCategory(e.category)) continue;
    // _salaryAutoExpense rows are the MIRROR of a salary payment already counted above —
    // _salAddPay writes both for a single payout, so counting both doubled every coach
    // payment (one 2,000 QAR payout reported as 4,000). Only MANUAL salary expenses
    // (typed on the Expenses screen, with no salary record behind them) add money here.
    if (e._salaryAutoExpense || e.salaryPaymentId) continue;
    const m = e.month || String(e.date || '').slice(0, 7);
    if (ym !== 'all' && m !== ym) continue;
    total += Number(e.amount) || 0;
  }
  return total;
}

// THE salary figure for reports: the auto-calculated salary COST for the month —
// every active coach's computed pay (fixed + commission). Admins change it by
// editing a coach's fixed salary / commission settings; the total recomputes.
// This is the single number shown across Dashboard, Monthly Report and the
// Financial Overview so the screens never disagree. (salariesPaidInMonth above
// is the separate "cash actually handed over so far" figure.)
function salariesEarnedInMonth(ym) {
  if (typeof computeMonthlyPay !== 'function') return 0;
  const months = ym === 'all'
    ? [...new Set((state.salaries || []).map(s => s.month).filter(Boolean))]
    : [ym];
  let total = 0;
  for (const c of (state.coaches || [])) {
    if (typeof isCoachActive === 'function' && !isCoachActive(c)) continue;
    for (const m of months) {
      const p = computeMonthlyPay(c.id, m);
      if (p) total += Number(p.gross || 0) || 0;
    }
  }
  // Ad-hoc / external coaches (free-text name on a Salary expense) have no
  // auto-calculated pay, so their payment IS the cost — add it to the total.
  total += adHocSalariesInMonth(ym);
  return total;
}

// Record a cash receipt against an invoice (defaults to today's month).
function recordInvoicePayment(inv, amount, opts) {
  if (!inv || !(amount > 0)) return;
  opts = opts || {};
  const date = opts.date || TODAY;
  const month = opts.month || date.slice(0, 7);
  if (!Array.isArray(inv.payments)) {
    const prior = inv.amountPaid != null ? inv.amountPaid : 0;   // seed ledger from any prior partial
    // RECONSTRUCTION row: this represents money that was in `amountPaid` but had no itemized
    // row on THIS device. It is NOT a freshly-recorded payment. Give it a STABLE, deterministic
    // invoice-scoped id + a `_recon` flag so (a) if another device reconstructs the same missing
    // ledger it produces the SAME pid → the sync-merge collapses them instead of keeping two, and
    // (b) the Invoice Checker can spot a reconstruction that duplicates a real recorded row (the
    // "first installment appears twice" bug on multi-device). (v6.355)
    inv.payments = prior > 0 ? [{ date: inv.date || date, month: inv.month || month, amount: prior, method: inv.method || 'cash', pid: 'recon:' + inv.id, _recon: true }] : [];
  }
  inv.payments.push({ date, month, amount, method: opts.method || inv.method || 'cash', by: opts.by || currentUserId(), byName: opts.byName || currentUserName(), at: new Date().toISOString() });
  inv.amountPaid = inv.payments.reduce((s, p) => s + (p.amount || 0), 0);
  stampUpdate(inv);
}

// ── Qatar ID (residency permit) OCR parsing ────────────────────────
// Takes raw OCR text from a QID card photo and best-effort extracts the
// fields we can auto-fill. Heuristic + label-anchored; the admin always
// verifies. Returns {nameEn, nameAr, birthdate, qid, nationality} (nulls if
// not confidently found). The OCR image→text step happens in the browser
// (Tesseract.js); this function is pure so it can be unit-tested.
function _qidTitleCaseName(s) {
  return titleCaseName(s);
}
function _qidCleanArabic(s) {
  // keep Arabic letters, spaces and Arabic-Indic digits; drop the rest
  return String(s).replace(/[^\u0600-\u06FF\u0660-\u0669\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseQatarId(text) {
  const out = { nameEn: null, nameAr: null, birthdate: null, qid: null, nationality: null };
  if (!text) return out;
  const raw = String(text);
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // QID — an 11-digit number standalone (the 14-digit serial that contains it
  // is bounded by digits, so it won't match).
  const qidM = raw.match(/(?:^|\D)(\d{11})(?:\D|$)/);
  if (qidM) out.qid = qidM[1];

  const toISO = (d, m, y) => {
    d = +d; m = +m; y = +y;
    if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  const oneDate = (s) => { const m = s.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/); return m ? toISO(m[1], m[2], m[3]) : null; };

  // Birthdate — prefer the date on the line labelled D.O.B / Birth / الميلاد,
  // so we don't grab the Expiry or Passport-Expiry dates.
  for (const ln of lines) {
    if (/d\.?\s*o\.?\s*b|birth|الميلاد/i.test(ln)) { const iso = oneDate(ln); if (iso) { out.birthdate = iso; break; } }
  }
  if (!out.birthdate) {   // fallback: earliest plausible past date in the card
    const all = []; const rx = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{4})/g; let mm;
    while ((mm = rx.exec(raw))) { const iso = toISO(mm[1], mm[2], mm[3]); if (iso) all.push(iso); }
    const past = all.filter(d => d <= TODAY).sort();
    if (past.length) out.birthdate = past[0];
  }

  // Nationality — Latin word(s) after the "Nationality" label.
  for (const ln of lines) {
    const m = ln.match(/nationality\s*[:\-]?\s*([A-Za-z][A-Za-z \-']{2,})/i);
    if (m) { out.nationality = _qidTitleCaseName(m[1]); break; }
  }

  // English name — uppercase Latin after a "Name:" label.
  for (const ln of lines) {
    const m = ln.match(/\bname\s*[:\-]\s*([A-Za-z][A-Za-z \-'.]{2,})/i);
    if (m) { const c = m[1].replace(/\s+/g, ' ').trim(); if (c.length >= 3) { out.nameEn = _qidTitleCaseName(c); break; } }
  }

  // Arabic name — after the الإسم / الاسم label, else the longest Arabic-only,
  // non-label line on the card.
  const AR_LABELS = ['دولة', 'قطر', 'رخصة', 'إقامة', 'اقامة', 'الجنسية', 'الميلاد', 'الصلاحية', 'المهنة', 'الرقم', 'جواز', 'السفر', 'المستقدم', 'الرخصة', 'عائلية', 'طفلة', 'توقيع', 'حامل'];
  for (const ln of lines) {
    const m = ln.match(/(?:الإسم|الاسم|الإسـم|الأسم)\s*[:：]?\s*(.+)/);
    if (m && /[\u0600-\u06FF]/.test(m[1])) { out.nameAr = _qidCleanArabic(m[1]); break; }
  }
  if (!out.nameAr) {
    let best = null;
    for (const ln of lines) {
      if (/[A-Za-z]/.test(ln)) continue;
      const arCount = (ln.match(/[\u0600-\u06FF]/g) || []).length;
      if (arCount >= 4 && !AR_LABELS.some(lbl => ln.includes(lbl))) { if (!best || arCount > best.c) best = { s: ln, c: arCount }; }
    }
    if (best) out.nameAr = _qidCleanArabic(best.s);
  }
  return out;
}

// What a coach was ACTUALLY credited (commission base) for a given sport for a
// member — summed from real Membership invoices, excluding switch credits and
// negatives. A sport-switch reconciliation is based on THIS (never the nominal
// enrollment price), so a switch can never claw back more than was credited.
function coachBaseForSport(member, sport, coachId) {
  let total = 0;
  for (const inv of (state.invoices || [])) {
    if (!member || inv.customerId !== member.id) continue;
    if ((inv.category || 'Membership') !== 'Membership') continue;
    if (inv.switchCredit || inv.activityType === 'switch-credit' || (inv.amount || 0) < 0) continue;
    if (Array.isArray(inv.lineItems) && inv.lineItems.length) {
      for (const li of inv.lineItems) {
        // v6.494: normalize coachId (string vs number) so a mixed-type record still matches — else
        // the credited base reads 0 and a switch falls back to a wrong price, mis-splitting commission.
        if (li.sport === sport && (coachId == null || String(li.coachId) === String(coachId))) total += parseFloat(li.price) || 0;
      }
    } else if (inv.sport === sport && (coachId == null || String(inv.coachId) === String(coachId))) {
      total += parseFloat(inv.amount) || 0;
    }
  }
  return Math.round(total * 100) / 100;
}

// Sport-switch reconciliation split. Coach A keeps commission on the classes the
// member actually attended; the unearned remainder transfers to coach B. The
// deduction from A is exactly (credited − attended value) and never exceeds the
// credited base.
function computeSwitchSplit(base, attendedA, totalClasses) {
  base = parseFloat(base) || 0;
  if (base <= 0) return { aShare: 0, bShare: 0, deductionA: 0 };
  let aShare;
  if (totalClasses > 0) aShare = Math.round((Math.max(0, attendedA) / totalClasses) * base * 100) / 100;
  else aShare = 0;                               // no planned classes → A earned nothing yet
  aShare = Math.min(aShare, base);
  const bShare = Math.round((base - aShare) * 100) / 100;   // unearned → transfers to B
  return { aShare, bShare, deductionA: -bShare };
}

// ─── Summer Camp schedule (Sun–Thu, 14 Jun – 27 Aug 2026) ───────────
const CAMP_GROUPS = [
  { key: 'kids',  label: 'Kids Stars (4-7)',   color: '#2e9e4f' },
  { key: 'boys',  label: 'Boys Stars (7-12)',  color: '#1565c0' },
  { key: 'girls', label: 'Girls Stars (7-12)', color: '#d81b60' },
];
const CAMP_SLOTS = [
  { time: '8:00 - 9:00',   type: 'activities' },
  { time: '9:00 - 9:30',   type: 'break', label: '🍳 Breakfast & Break', bg: 'rgba(245,200,80,.20)' },
  { time: '9:30 - 10:30',  type: 'activities' },
  { time: '10:30 - 11:30', type: 'activities' },
  { time: '11:30 - 12:00', type: 'break', label: '🕌 Prayer Break', bg: 'rgba(80,180,100,.18)' },
  { time: '12:00 - 1:00',  type: 'activities' },
  { time: '1:00 - 1:30',   type: 'break', label: '🎒 Dismissal', bg: 'rgba(150,150,160,.14)' },
];
const CAMP_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const CAMP_DAY_LABELS = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday' };

function defaultCampSchedule() {
  const C = (a, coach) => ({ activity: a, coach: coach || '' });
  const COMBAT = 'Combat Sports (Kickboxing & Muay Thai)';
  return {
    startDate: '2026-06-14',
    endDate: '2026-06-28',
    days: {
      sunday: [
        { kids: C('Swimming'),               boys: C('Taekwondo'), girls: C('Swimming') },
        { kids: C('Karate'),                 boys: C(COMBAT),      girls: C('Art') },
        { kids: C('Ninja Training','Jennifer'), boys: C(COMBAT),   girls: C('Art') },
        { kids: C('Art'),                    boys: C('Karate'),    girls: C('Zumba','Jennifer') },
      ],
      monday: [
        { kids: C('Art'),                    boys: C('Swimming'),  girls: C('Kickboxing') },
        { kids: C('Kids Kickboxing'),        boys: C('Taekwondo'), girls: C('Gymnastics') },
        { kids: C('Karate'),                 boys: C(COMBAT),      girls: C('Zumba','Jennifer') },
        { kids: C('Ninja Training','Jennifer'), boys: C('Karate'), girls: C('Fitness','Aya') },
      ],
      tuesday: [
        { kids: C('Swimming'),               boys: C('Karate'),    girls: C('Swimming') },
        { kids: C('Art'),                    boys: C('Taekwondo'), girls: C('Kickboxing') },
        { kids: C('Art'),                    boys: C(COMBAT),      girls: C('Gymnastics') },
        { kids: C('Ninja Training'),         boys: C(COMBAT),      girls: C('Zumba','Jennifer') },
      ],
      wednesday: [
        { kids: C('Art'),                    boys: C('Swimming'),  girls: C('Kickboxing') },
        { kids: C('Karate'),                 boys: C('Taekwondo'), girls: C('Art') },
        { kids: C('Kids Kickboxing'),        boys: C(COMBAT),      girls: C('Gymnastics') },
        { kids: C('Ninja Training'),         boys: C('Karate'),    girls: C('Zumba','Jennifer') },
      ],
      thursday: [
        { kids: C('Karate'),                 boys: C(COMBAT),      girls: C('Swimming') },
        { kids: C('Kids Kickboxing'),        boys: C('Taekwondo'), girls: C('Kickboxing') },
        { kids: C('Art'),                    boys: C('Karate'),    girls: C('Gymnastics') },
        { kids: C('Ninja Training','Jennifer'), boys: C(COMBAT),   girls: C('Art') },
      ],
    },
  };
}

// True if a name has at least a first AND last name (2+ space-separated words).
function hasFirstAndLast(name) {
  return !!name && String(name).trim().split(/\s+/).filter(Boolean).length >= 2;
}

// ── Withdrawal refund (grace period + attendance) ──
// Member keeps the value of classes attended. The unused portion is refundable;
// within the grace window it's fully refundable, after it an admin fee applies.
//   perClass = price / totalClasses
//   used     = perClass × attended           (kept by club)
//   unused   = price − used
//   withinGrace = daysSinceStart ≤ graceDays  (true if start unknown)
//   fee      = withinGrace ? 0 : unused × feePct%
//   refund   = max(0, unused − fee)
function computeWithdrawRefund(o) {
  const price = parseFloat(o.price) || 0;
  const total = parseInt(o.totalClasses) || 0;
  let attended = parseInt(o.attended) || 0;
  if (total > 0) attended = Math.min(attended, total);
  const graceDays = (o.graceDays != null && o.graceDays !== '') ? (parseInt(o.graceDays) || 0) : 7;
  // v6.520 — owner-confirmed refund policy: the admin fee is 15% of the TOTAL PAID (not of the
  // unused portion), and the refund deducts BOTH the attended value AND that fee:
  //   refund = paid − attendedValue − 15%×paid  (= unused − 0.15×paid), floored at 0.
  const feePct = (o.feePct != null && o.feePct !== '') ? (parseFloat(o.feePct) || 0) : 15;
  const perClass = total > 0 ? price / total : 0;
  const r2 = n => Math.round(n * 100) / 100;
  const used = r2(perClass * attended);
  const unused = Math.max(0, r2(price - used));
  let daysSinceStart = null, withinGrace = true;
  if (o.startDate && o.refundDate) {
    daysSinceStart = daysBetween(o.startDate, o.refundDate);
    withinGrace = daysSinceStart <= graceDays;
  }
  // Fee is a percentage of the TOTAL PAID (price), applied outside the grace period.
  const fee = withinGrace ? 0 : r2(price * (feePct / 100));
  const refund = Math.max(0, r2(unused - fee));
  return { price, total, attended, perClass: r2(perClass), used, unused, daysSinceStart, withinGrace, graceDays, feePct, fee, feeBasis: 'paid', refund };
}

// ── Fuzzy text matching (used by the members name column filter) ──
function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
// True if `query` matches `text` exactly, as a substring, or as a close
// (typo-tolerant) match against the whole string or any word in it.
function fuzzyMatch(text, query) {
  text = String(text || '').toLowerCase().trim();
  query = String(query || '').toLowerCase().trim();
  if (!query) return true;
  if (!text) return false;
  if (text.includes(query)) return true;
  // Short queries must match exactly / by prefix — a wide edit-distance on a
  // 3-4 letter query matches half the dictionary ("test" ≈ "best", "tens"…).
  // Longer queries keep typo tolerance (madani ≈ madanee).
  const thr = query.length <= 4 ? 0 : query.length <= 6 ? 2 : 3;
  if (thr && levenshtein(text, query) <= thr) return true;
  for (const w of text.split(/\s+/)) {
    if (!w) continue;
    if (w.startsWith(query)) return true;
    if (thr && levenshtein(w, query) <= thr) return true;
  }
  return false;
}

// ── Arabic localization (used by the schedule Arabic export / future i18n) ──
const SPORT_AR = {
  'Gymnastic': 'الجمباز',
  'Taekwondo': 'التايكوندو',
  'Kick Boxing': 'الكيك بوكسينغ',
  'Boxing': 'الملاكمة',
  'Football': 'كرة القدم',
  'MMA': 'الفنون القتالية',
  'Karate': 'الكاراتيه',
  'Swimming': 'السباحة',
  'Zumba': 'الزومبا',
  'Summer Camp': 'المعسكر الصيفي',
};
function sportNameAR(sport) { return SPORT_AR[sport] || sport; }

const DAY_AR = {
  sat: 'السبت', sun: 'الأحد', mon: 'الإثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة',
  saturday: 'السبت', sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة',
};
function dayNameAR(key) { return DAY_AR[String(key || '').toLowerCase()] || key; }

const MONTH_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function monthNameAR(date) { const d = date instanceof Date ? date : new Date(date); return MONTH_AR[d.getMonth()] + ' ' + d.getFullYear(); }

// "3PM - 4PM" → "3 - 4 م"  (م = PM, ص = AM). Keeps western digits.
function timeLabelAR(label) {
  const m = String(label || '').match(/(\d+)\s*(AM|PM)\s*-\s*(\d+)\s*(AM|PM)/i);
  if (!m) return label;
  const suf = ap => (/pm/i.test(ap) ? 'م' : 'ص');
  return suf(m[2]) === suf(m[4])
    ? `${m[1]} - ${m[3]} ${suf(m[4])}`
    : `${m[1]} ${suf(m[2])} - ${m[3]} ${suf(m[4])}`;
}

// Emoji for a camp activity name (best-effort match).
function campActivityIcon(activity) {
  const a = String(activity || '').toLowerCase();
  if (!a) return '';
  if (a.includes('swim')) return '🏊';
  if (a.includes('taekwondo')) return '🦵';
  if (a.includes('karate')) return '🥋';
  if (a.includes('kick') || a.includes('box') || a.includes('combat')) return '🥊';
  if (a.includes('gymnast')) return '🤸';
  if (a.includes('art')) return '🎨';
  if (a.includes('zumba') || a.includes('dance')) return '💃';
  if (a.includes('ninja')) return '🥷';
  if (a.includes('football') || a.includes('soccer')) return '⚽';
  if (a.includes('fitness') || a.includes('gym ')) return '💪';
  if (a.includes('mma')) return '🥋';
  if (a.includes('yoga')) return '🧘';
  return '⭐';
}

// Map a YYYY-MM-DD date to its camp day key (sunday..thursday), or null on an
// off day (Fri/Sat). Parsed in local time to avoid UTC weekday drift.
function campDayKeyForDate(dateStr) {
  if (!dateStr) return null;
  const p = String(dateStr).split('-').map(Number);
  if (p.length < 3 || !p[0]) return null;
  const wd = new Date(p[0], p[1] - 1, p[2]).getDay();   // 0=Sun..6=Sat
  return CAMP_DAYS[wd] || null;                          // 5/6 → undefined → null
}

// Proper-case a person's name: "anas madni" → "Anas Madni", "al-awad" → "Al-Awad".
function titleCaseName(s) {
  if (s == null) return s;
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/(^|[\s\-'’])([a-z\u00e0-\u024f])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

// ── Family / household helpers ──────────────────────────────────────────────
// A household groups several members (e.g. siblings + parent) under one shared
// contact. m.familyId references state.families[].id.
function familyMembers(famId, includeArchived) {
  return (state.members || []).filter(m => m.familyId === famId && (includeArchived || !m.deleted));
}
function getFamily(famId) { return (state.families || []).find(f => f.id === famId) || null; }
function familyName(famId) {
  const f = getFamily(famId);
  if (f && f.name) return f.name;
  const ms = familyMembers(famId);
  return ms.length ? (ms[0].name || '').split(' ').slice(-1)[0] + ' family' : 'Family';
}
function familyContactPhone(famId) {
  const f = getFamily(famId);
  if (f && f.phone) return f.phone;
  const m = familyMembers(famId).find(x => isRealPhone(x.phone));
  return m ? m.phone : '';
}
function familyOutstanding(famId) {
  return familyMembers(famId, true).reduce((s, m) => s + memberOutstanding(m.id), 0);
}

// Total outstanding balance for a member across their membership invoices.
function memberOutstanding(memberId) {
  return (state.invoices || [])
    .filter(i => !i.deleted && i.customerId === memberId && (i.category || 'Membership') === 'Membership')
    .reduce((s, i) => s + invoiceBalance(i), 0);
}

// Total amount this member has PAID across all their (non-deleted) invoices —
// every category, cash-basis. Used for the family financial summary.
function memberPaidTotal(memberId) {
  return (state.invoices || [])
    .filter(i => i.customerId === memberId && !i.deleted)
    .reduce((s, i) => s + invoicePaid(i), 0);
}
function familyPaidTotal(famId) {
  return familyMembers(famId, true).reduce((s, m) => s + memberPaidTotal(m.id), 0);
}

// Split ONE family payment equally across a set of sibling members. `members` is
// the list of sibling member objects; `familyTotal` is the single amount the
// parent paid for the whole group. Each sibling's membership invoice is set to
// (familyTotal / N) as both amount and paid, with a "Family share (1/N)" note.
// Members with no membership invoice get one created. Returns the per-head share.
function splitSiblingPayment(members, familyTotal) {
  const sibs = (members || []).filter(m => m && !m.deleted);   // active siblings only
  const n = sibs.length;
  if (n === 0 || !(familyTotal > 0)) return 0;
  // Round to 2dp; put any rounding remainder on the first sibling so the parts
  // sum exactly to the family total.
  const share = Math.floor((familyTotal / n) * 100) / 100;
  const remainder = Math.round((familyTotal - share * n) * 100) / 100;
  sibs.forEach((m, idx) => {
    const myShare = idx === 0 ? Math.round((share + remainder) * 100) / 100 : share;
    let inv = (state.invoices || []).find(iv => !iv.deleted && iv.customerId === m.id
      && (iv.category || 'Membership') === 'Membership' && !iv.switchCredit && (iv.amount || 0) >= 0);
    const note = `Family share (1/${n})`;
    if (inv) {
      inv.amount = myShare;
      inv.amountPaid = myShare;
      inv.payments = [{ date: (inv.payments && inv.payments[0] && inv.payments[0].date) || inv.date || TODAY,
        month: (inv.payments && inv.payments[0] && inv.payments[0].month) || inv.month || (TODAY).slice(0, 7),
        amount: myShare, method: (inv.method || 'cash') }];
      inv.familyShare = { of: n, total: familyTotal };
      if (inv.description && !/Family share/.test(inv.description)) inv.description += ` — ${note}`;
    } else {
      const enr = Array.isArray(m.enrollments) ? m.enrollments.filter(e => e && e.sport) : [];
      const label = (typeof sportListWithDuration === 'function' && sportListWithDuration(enr)) || enr.map(e => e.sport).join(', ') || 'Membership';
      state.invoices.push({
        id: nextId(state.invoices), date: TODAY, month: (TODAY).slice(0, 7),
        ref: nextInvoiceRef(), category: 'Membership', activityType: 'subscription',
        customerId: m.id, customerName: m.name, customerPhone: m.phone,
        sport: label, coach: enr[0] ? coachName(enr[0].coachId) : '', coachId: enr[0] ? enr[0].coachId : null,
        amount: myShare, amountPaid: myShare,
        payments: [{ date: TODAY, month: (TODAY).slice(0, 7), amount: myShare, method: 'cash' }],
        method: 'cash', familyShare: { of: n, total: familyTotal },
        description: `${m.name} — ${label} subscription — ${note}`,
        lineItems: enr.map(e => ({ sport: e.sport, coach: coachName(e.coachId), coachId: e.coachId, classes: e.classes, price: e.price })),
      });
    }
  });
  return share;
}

// Returns the first sport enrolled more than once (a member may hold only one
// active enrollment per sport), or null. Used to block duplicate enrollments.
function duplicateEnrollmentSport(enrollments) {
  // v6.504: a member MAY hold the same sport more than once when the COACH differs
  // (e.g. Karate with Mostafa AND Karate with Zakaria — two independent courses, two
  // coaches, two commissions). Only a TRUE duplicate — same sport AND same coach — is
  // blocked. Summer Camp has no coach (null) so two camps still collide (blocked), which
  // preserves the old one-camp rule.
  const seen = new Set();
  for (const e of (enrollments || [])) {
    if (!e || !e.sport) continue;
    const key = e.sport + '|' + (e.coachId == null ? 'nocoach' : e.coachId);
    if (seen.has(key)) return e.sport;
    seen.add(key);
  }
  return null;
}

// v6.506 — REPAIR SWITCHED MEMBERS. A same-sport coach switch could leave the destination coach's
// portion in the PROFILE (enrollment) ONLY — with no matching active SUBSCRIPTION or INVOICE LINE — so
// the member card, attendance and salary couldn't see it (the Edit form showed a sport the card
// didn't). This scans every member, finds each profile sport (enrollment) that has no matching active
// subscription, and RESTORES the missing subscription + invoice line from the profile.
// SAFETY: it only repairs a member when their EXISTING payment already covers the missing line (an
// overpayment ≥ the line price) — so it records money that is ALREADY IN, never creates a new amount
// owed. Members whose money does NOT cover it are SKIPPED for manual review. It only ADDS records
// (never deletes/edits existing ones) and is IDEMPOTENT (a restored sub makes the next run skip it).
// Pass { apply:false } for a dry-run report; { apply:true } to write.
function repairSwitchedMembers(opts) {
  const apply = !!(opts && opts.apply);
  const SC = (typeof SUMMER_CAMP !== 'undefined') ? SUMMER_CAMP : 'Summer Camp';
  const _sc = (a, b) => String(a) === String(b);
  const report = { repaired: [], skipped: [], scanned: 0 };
  for (const m of (state.members || [])) {
    if (m.deleted) continue;
    report.scanned++;
    // The member's MAIN membership invoice (oldest non-switch-credit membership invoice).
    const memInv = (state.invoices || [])
      .filter(iv => !iv.deleted && String(iv.customerId) === String(m.id) && (iv.category || 'Membership') === 'Membership' && !iv.switchCredit && iv.activityType !== 'switch-credit')
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0];
    for (const e of (m.enrollments || [])) {
      if (!e.sport || e.sport === SC || e.coachId == null) continue;
      // Is there already an ACTIVE subscription for this exact sport + coach? Then it's consistent.
      const hasActive = (m.subscriptions || []).some(s => s.activity === e.sport && _sc(s.coachId, e.coachId)
        && (s.status || '').toLowerCase() !== 'completed' && (s.status || '').toLowerCase() !== 'withdrawn' && !s.switchedAwayTo);
      if (hasActive) continue;
      const price = Number(e.price) || 0;
      const overpay = memInv ? ((Number(memInv.amountPaid) || 0) - (Number(memInv.amount) || 0)) : 0;
      const canBill = !!memInv && overpay >= price - 0.5;   // already paid → safe to restore
      const rec = { memberId: m.id, member: m.name || m.nameArabic || ('#' + m.id), sport: e.sport,
        coachId: e.coachId, coach: coachName(e.coachId), classes: e.classes || 0, price,
        overpay: Math.round(overpay * 100) / 100, invRef: memInv && memInv.ref };
      if (!canBill) { report.skipped.push(rec); continue; }
      if (apply) {
        const start = e.start || m.startDate || TODAY;
        const end = (typeof addDays === 'function' && start && e.validity) ? addDays(start, parseInt(e.validity) || DEFAULT_VALIDITY) : (e.end || null);
        if (!Array.isArray(m.subscriptions)) m.subscriptions = [];
        m.subscriptions.push({ activity: e.sport, coachId: e.coachId, coach: coachName(e.coachId),
          totalClasses: e.classes || null, attendedClasses: 0, amountPaid: price, status: 'active', start, end,
          switchFunded: true, invoiceNumber: memInv.ref, _sid: 's_rep' + Date.now() + '_' + report.repaired.length });
        if (!Array.isArray(memInv.lineItems)) memInv.lineItems = [];
        memInv.lineItems.push({ sport: e.sport, coachId: e.coachId, coach: coachName(e.coachId), price, classes: e.classes || null, _repaired: true });
        memInv.amount = Math.round(((Number(memInv.amount) || 0) + price) * 100) / 100;
        if (typeof stampUpdate === 'function') { stampUpdate(memInv); stampUpdate(m); }
        if (typeof audit === 'function') audit('member.switch_repair', 'member:' + m.id,
          `Restored ${e.sport} · ${coachName(e.coachId)} (${e.classes || 0} cls / ${price}) from profile — subscription + invoice line were missing after a switch`, rec);
      }
      report.repaired.push(rec);
    }
  }
  return report;
}
window.repairSwitchedMembers = repairSwitchedMembers;

// A sport added later can carry its own start date; otherwise it inherits the
// member's start date (then today as a last resort).
function enrollmentStartDate(enrollment, member) {
  return (enrollment && enrollment.start) || (member && member.startDate) || TODAY;
}

// Apply edited enrollment values onto its existing subscription, and keep the
// linked invoice line's coach in sync so commission re-attributes correctly.
// Matching is by SPORT only (a member holds one active enrollment per sport),
// so changing the coach must UPDATE this subscription — never create a duplicate.
// Build a sport-list label that includes a duration suffix for Summer Camp
// (e.g. "Summer Camp · 1 month" instead of just "Summer Camp"). For multi-sport
// invoices, joins with ", ". Pure helper, used in invoice descriptions / sport
// fields so receipts and reports read clearly. Accepts either an array of
// enrolment objects ({sport, durationLabel, classes}) or invoice lineItems
// ({sport, durationLabel, classes}). Falls back to the sport name only when no
// label is available.
function sportListWithDuration(items) {
  if (!Array.isArray(items)) return '';
  return items.map(it => {
    if (!it || !it.sport) return '';
    if (it.sport !== SUMMER_CAMP) return it.sport;
    const label = it.durationLabel || (typeof DEFAULT_SUMMER_CAMP_PRICES !== 'undefined'
      ? (campLabelForClasses(it.classes) || '')
      : '');
    return label ? `${SUMMER_CAMP} · ${label}` : SUMMER_CAMP;
  }).filter(Boolean).join(', ');
}

function syncSubToEnrollment(sub, e, member, invoices) {
  if (!sub || !e) return;
  // v6.504: a member can now hold the SAME sport under two coaches, so an invoice can carry
  // TWO same-sport lines. Match the line belonging to THIS sub by sport + the sub's coach (not
  // sport alone) — otherwise editing one coach's line would clobber the other coach's line.
  const _sc = (a, b) => String(a) === String(b);
  if (e.classes != null) sub.totalClasses = e.classes;
  if (e.durationLabel != null) sub.durationLabel = e.durationLabel;
  if (sub.coachId !== e.coachId) {
    const oldCoach = sub.coachId;
    sub.coachId = e.coachId;
    sub.coach = coachName(e.coachId);
    const inv = (invoices || []).find(iv => iv.ref === sub.invoiceNumber);
    if (inv) {
      // Only THIS sub's line (its old coach, or a legacy line with no coach) moves to the new coach.
      (inv.lineItems || []).forEach(li => { if (li.sport === e.sport && (li.coachId == null || _sc(li.coachId, oldCoach))) { li.coachId = e.coachId; li.coach = coachName(e.coachId); } });
      if (inv.coachId === oldCoach) { inv.coachId = e.coachId; inv.coach = coachName(e.coachId); }
    }
  }
  // Price change on a paid enrollment → reconcile the linked invoice so REVENUE and
  // coach COMMISSION follow the new price (not just the subscription's amountPaid).
  if (e.price != null && invoices && sub.invoiceNumber) {
    const inv = invoices.find(iv => iv.ref === sub.invoiceNumber);
    if (inv && (inv.category || 'Membership') === 'Membership' && !inv.switchCredit && inv.activityType !== 'switch-credit') {
      const hasLines = Array.isArray(inv.lineItems) && inv.lineItems.length;
      // Prefer the line for THIS coach (two same-sport lines can coexist), fall back to sport-only (legacy).
      const line = hasLines ? (inv.lineItems.find(li => li.sport === e.sport && _sc(li.coachId, e.coachId)) || inv.lineItems.find(li => li.sport === e.sport)) : null;
      const oldPrice = hasLines ? (line ? (parseFloat(line.price) || 0) : null) : (parseFloat(inv.amount) || 0);
      const newPrice = parseFloat(e.price) || 0;
      // Keep the line's duration / classes fresh too — even when the price did NOT change,
      // changing a Summer Camp duration (e.g. 1 week → 1 month at the same price) should
      // still update the invoice description + lineItem labels.
      if (hasLines && line) {
        if (e.classes != null) line.classes = e.classes;
        if (e.durationLabel != null) line.durationLabel = e.durationLabel;
        if (e.coachId != null) { line.coachId = e.coachId; line.coach = coachName(e.coachId); }
      }
      if (oldPrice != null && Math.abs(oldPrice - newPrice) > 0.001) {
        const wasPaidInFull = invoiceBalance(inv) <= 0.01;
        // An UPGRADE (price went UP — e.g. Summer Camp 1 day → 1 month) means the member
        // is buying MORE; the extra is NOT paid yet. Only a price CORRECTION or a
        // downgrade on a fully-paid invoice should stay "paid in full". So we keep the
        // paid amount as-is on an increase, letting the difference show as a NEW balance
        // due — instead of silently pretending the higher amount was already paid.
        const isUpgrade = newPrice > oldPrice + 0.001;
        if (hasLines && line) { line.price = newPrice; inv.amount = inv.lineItems.reduce((s, li) => s + (parseFloat(li.price) || 0), 0); }
        else { inv.amount = newPrice; }
        if (wasPaidInFull && !isUpgrade) {
          // Price correction / downgrade on a paid invoice → keep it paid in full.
          inv.amountPaid = inv.amount;
          if (Array.isArray(inv.payments) && inv.payments.length) {
            const others = inv.payments.slice(0, -1).reduce((s, p) => s + (p.amount || 0), 0);
            inv.payments[inv.payments.length - 1].amount = Math.max(0, Math.round((inv.amount - others) * 100) / 100);
          } else {
            inv.payments = [{ date: inv.date, month: inv.month, amount: inv.amount, method: inv.method || 'cash' }];
          }
        }
        // else (an UPGRADE, or an already-partial invoice): leave payments alone, so the
        // amount the member hasn't paid yet correctly appears as a balance due.
        if (isUpgrade) inv._upgradeDue = { sport: e.sport, from: oldPrice, to: newPrice, paid: invoicePaid(inv) };
        stampUpdate(inv);
        if (typeof audit === 'function') audit('invoice.price_edit', `invoice:${inv.id}`,
          `Adjusted ${e.sport} price ${fmt(oldPrice)} → ${fmt(newPrice)}${member ? ' for ' + member.name : ''}`,
          { invoiceId: inv.id, recordName: member ? member.name : (inv.customerName || ''), sport: e.sport, old: oldPrice, new: newPrice, wasPaidInFull });
      }
      // After any edit, refresh the description + header sport so receipts read
      // clearly (e.g. "Summer Camp · 1 month" instead of stale "Summer Camp · 1 week").
      if (hasLines) {
        const label = sportListWithDuration(inv.lineItems);
        if (label) {
          inv.sport = label;
          if (member && member.name) inv.description = `${member.name} — ${label} subscription`;
          else inv.description = `${label} subscription`;
        }
      }
    }
  }
  if (e.price != null) sub.amountPaid = e.price;
  const eStart = enrollmentStartDate(e, member);
  // Camp: the time window is the VALIDITY (calendar days, e.g. 1 month), independent
  // of the class-day count (e.classes). Using e.classes here was the bug that reverted
  // an edited validity back to the day-count on save.
  const eValidity = e.sport === SUMMER_CAMP
    ? (parseInt(e.validity) || parseInt(e.classes) || DEFAULT_VALIDITY)
    : (parseInt(e.validity) || DEFAULT_VALIDITY);
  // Camp end = BUSINESS days (Sun–Thu) via campEndDate; every other sport = calendar validity. (v6.357)
  if (eStart) {
    sub.start = eStart; sub.validity = eValidity;
    // Custom camp expires on the Nth camp-day (its day count); presets keep editable validity. (v6.458)
    sub.end = rowEndDate(e.sport, eStart, eValidity, e.classes, e.durationLabel, e._campCustom);
  }
}

// Derive member-level dates from the per-sport enrollment cards (each sport has
// its own start + validity). Member start = earliest sport start; member expiry
// = latest sport end (start + validity); first registration = entered value, or
// the earliest sport start when left blank.
function deriveMemberDates(enrollments, firstRegInput) {
  const list = enrollments || [];
  const starts = list.map(e => e.start || TODAY).sort();
  const minStart = starts[0] || TODAY;
  // Camp sports expire on BUSINESS days (Sun–Thu) via campEndDate; other sports use calendar validity. (v6.357)
  const ends = list.map(e => {
    const st = e.start || minStart, v = e.validity || DEFAULT_VALIDITY;
    return rowEndDate(e.sport, st, v, e.classes, e.durationLabel, e._campCustom);   // Custom camp → Nth camp-day (v6.458)
  }).filter(Boolean).sort();
  return {
    startDate: minStart,
    firstRegistration: firstRegInput || minStart,
    expiryDate: ends.length ? ends[ends.length - 1] : null,
  };
}

// Cleanly remove an enrollment added by mistake: drops the enrollment row, its
// subscription, and its invoice line(s) — NO refund record (that's Withdraw).
// Combined invoices keep their other sports (amount reduced); single-sport
// invoices for this sport are deleted. Member expiry is recomputed.
function removeEnrollmentData(member, sport) {
  if (!member || !sport) return;
  // TOMBSTONE the rows we're about to remove (v6.391). Without this the delete "bounced back":
  // the copy still sitting in the cloud looked like a fresh REMOTE ADD to the next sync merge and
  // was re-added, so the sport reappeared after a refresh even though the write had succeeded.
  // Enrollments are content-keyed, so their tombstone MUST be scoped per member. Every other
  // delete path already did this (see the edit-pricing panel) — this one was missed.
  const _enrScope = 'members:' + member.id + ':enrollments';
  const _subScope = 'members:' + member.id + ':subscriptions';
  const _rmEnr = (member.enrollments || []).filter(e => e.sport === sport);
  const _rmSub = (member.subscriptions || []).filter(s => s.activity === sport);
  try {
    if (typeof window !== 'undefined' && typeof window._tombstoneEl === 'function') {
      _rmEnr.forEach(e => window._tombstoneEl(e, _enrScope));
      _rmSub.forEach(s => window._tombstoneEl(s, _subScope));
    }
    // Also tombstone the SPORT itself. The per-element tombstones above are filed under the
    // row's CONTENT key, which stops matching if another device edited the cloud copy — the
    // case that actually resurrected the sport. (v6.391)
    if (typeof window !== 'undefined' && typeof window._tombstoneSport === 'function') {
      window._tombstoneSport(_enrScope, sport);
      window._tombstoneSport(_subScope, sport);
    }
  } catch (_) {}
  member.enrollments = (member.enrollments || []).filter(e => e.sport !== sport);
  member.subscriptions = (member.subscriptions || []).filter(s => s.activity !== sport);
  for (const inv of state.invoices) {
    if (inv.customerId !== member.id || (inv.category || 'Membership') !== 'Membership') continue;
    if (Array.isArray(inv.lineItems) && inv.lineItems.length) {
      const before = inv.lineItems.length;
      inv.lineItems = inv.lineItems.filter(li => li.sport !== sport);
      if (inv.lineItems.length === 0) {
        // Whole invoice was just this sport. SOFT-delete it (v6.391) — it used to be spliced out
        // of state.invoices entirely, leaving no tombstone, so the collection merge treated the
        // still-present cloud copy as a remote add and brought the invoice back. Soft-delete is
        // also how every other invoice-delete path works, and keeps it recoverable from Archived.
        inv.deleted = true;
        inv.deletedAt = new Date().toISOString();
        continue;
      }
      if (inv.lineItems.length !== before) {                    // had other sports → keep, reduce amount
        inv.amount = inv.lineItems.reduce((s, li) => s + (parseFloat(li.price) || 0), 0);
        inv.sport = inv.lineItems.map(li => li.sport).join(', ');
      }
    } else if ((inv.sport || '') === sport) {
      inv.deleted = true;                                       // single-sport invoice → soft-delete
      inv.deletedAt = new Date().toISOString();
    }
  }
  const ends = (member.subscriptions || []).map(s => s.end).filter(Boolean).sort();
  if (ends.length) member.expiryDate = ends[ends.length - 1];
}

// Pre-save guard: returns an existing Membership invoice that matches a new one
// (same member, sport, month, amount) so callers can warn before creating a copy.
function findDuplicateInvoiceOf(customerId, sport, month, amount, excludeId) {
  if (!customerId) return null;
  return state.invoices.find(inv =>
    inv.id !== excludeId &&
    (inv.category || 'Membership') === 'Membership' &&
    !inv.switchCredit && inv.activityType !== 'switch-credit' &&
    inv.customerId === customerId &&
    (inv.sport || '') === (sport || '') &&
    (inv.month || '') === (month || '') &&
    Math.abs((parseFloat(inv.amount) || 0) - (parseFloat(amount) || 0)) < 0.01
  ) || null;
}

// Returns duplicate-invoice groups across ALL categories, in two tiers:
//   tier 'exact'    — same customer, category, sport/items, month AND amount
//   tier 'possible' — same customer, category, items and amount, dated within
//                     7 days of each other (catches same-purchase duplicates that
//                     straddle a month boundary, or near-identical re-entries)
// Skips deleted, switch-credit, and negative (refund/credit) invoices.
function detectDuplicateInvoices() {
  const usable = state.invoices.filter(inv =>
    !inv.deleted &&
    !inv.switchCredit && inv.activityType !== 'switch-credit' &&
    (inv.amount || 0) > 0
  );
  const info = (inv) => {
    const mem = inv.customerId ? state.members.find(x => x.id === inv.customerId) : null;
    const memName = mem ? mem.name : (inv.customerName || inv.customer || '— walk-in —');
    const cat = inv.category || 'Membership';
    const items = (Array.isArray(inv.lineItems) && inv.lineItems.length)
      ? inv.lineItems.map(l => l.sport || l.name || l.product).filter(Boolean).sort().join('+')
      : (inv.sport || inv.description || '—');
    return { memName, cat, items };
  };
  // Rentals (Court Rental / Boxing Room) are inherently REPEATABLE — the same
  // customer books the same facility many times. So a rental is only a true
  // duplicate when it's on the exact SAME DATE (a double-entry), never just the
  // same month, and it's excluded from the "within 7 days" possible tier.
  const isRental = (inv) => inv.activityType === 'rental' || inv.category === 'Court Rental' || inv.category === 'Boxing Room';
  // Summer Camp is also REPEATABLE: a member can buy several camp packages in one
  // month (e.g. a 1-week camp, then renew for another week). Different DATES are
  // legitimate renewals, NOT duplicates — so, like rentals, a camp invoice is only
  // a true duplicate when it falls on the exact SAME DATE (a genuine double-entry).
  const isCampInv = (inv) => {
    if ((inv.activity || inv.sport) === SUMMER_CAMP) return true;
    const items = (Array.isArray(inv.lineItems) && inv.lineItems.length)
      ? inv.lineItems.map(l => l.sport || l.name).filter(Boolean) : [];
    return items.includes(SUMMER_CAMP);
  };
  // Invoices that may legitimately repeat within a month → key on exact date.
  const isRepeatable = (inv) => isRental(inv) || isCampInv(inv);

  // Tier 1 — EXACT
  const exactGroups = {};
  for (const inv of usable) {
    const { memName, cat, items } = info(inv);
    // For repeatable invoices (rentals + Summer Camp), key by the full DATE (only a
    // same-day double entry is a real duplicate); for everything else, key by month
    // (a repeat membership/product in one month is suspect).
    const period = isRepeatable(inv) ? (inv.date || '') : (inv.month || (inv.date || '').slice(0, 7));
    const key = (inv.customerId || memName) + '|' + cat + '|' + items + '|' + period + '|' + (inv.amount || 0);
    (exactGroups[key] = exactGroups[key] || []).push({ inv, memName, sport: items, cat });
  }
  const exact = Object.values(exactGroups).filter(g => g.length > 1).map(g => ({ tier: 'exact', rows: g }));

  // Tier 2 — POSSIBLE (same customer+cat+items+amount, ≤7 days apart, not already
  // exact). Rentals AND camp are skipped here — repeat purchases days apart are normal.
  const exactInvIds = new Set(exact.flatMap(g => g.rows.map(r => r.inv.id)));
  const bySig = {};
  for (const inv of usable) {
    if (isRepeatable(inv)) continue;
    const { memName, cat, items } = info(inv);
    const sig = (inv.customerId || memName) + '|' + cat + '|' + items + '|' + (inv.amount || 0);
    (bySig[sig] = bySig[sig] || []).push({ inv, memName, sport: items, cat });
  }
  const possible = [];
  for (const rows of Object.values(bySig)) {
    if (rows.length < 2) continue;
    const sorted = rows.slice().sort((a, b) => (a.inv.date || '').localeCompare(b.inv.date || ''));
    let cluster = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date((cluster[cluster.length - 1].inv.date || '1970-01-01') + 'T00:00:00');
      const cur = new Date((sorted[i].inv.date || '1970-01-01') + 'T00:00:00');
      const days = Math.abs((cur - prev) / 86400000);
      if (days <= 7) cluster.push(sorted[i]);
      else { if (cluster.length > 1) possible.push(cluster); cluster = [sorted[i]]; }
    }
    if (cluster.length > 1) possible.push(cluster);
  }
  const possibleGroups = possible
    .filter(c => !c.every(r => exactInvIds.has(r.inv.id)))   // drop clusters already fully captured as exact
    .map(rows => ({ tier: 'possible', rows }));

  return [...exact, ...possibleGroups];
}

// ─── Batch C cleanup detectors ──────────────────────────────────────────────
// Members whose enrollments[] list the SAME sport more than once (usually a
// legacy-import artifact). Returns [{ member, sport, rows:[enrollment,...] }].
function findDuplicateEnrollments() {
  const out = [];
  for (const m of (state.members || [])) {
    if (m.deleted || !Array.isArray(m.enrollments) || m.enrollments.length < 2) continue;
    const bySport = {};
    m.enrollments.forEach((e, i) => {
      if (!e || !e.sport) return;
      (bySport[e.sport] = bySport[e.sport] || []).push({ e, i });
    });
    for (const [sport, rows] of Object.entries(bySport)) {
      if (rows.length > 1) out.push({ member: m, sport, rows: rows.map(r => r.e), count: rows.length });
    }
  }
  return out;
}

// Members holding more than one non-deleted Membership invoice — candidates for
// consolidation into a single invoice (the v6.55 rule, applied to legacy data).
// Returns [{ member, invoices:[...], total, paid }].
// Membership invoices whose DATE is meaningfully later than the member's earliest
// sport start — usually old members registered after the fact, so the invoice (and
// its revenue month) landed on the entry day instead of the real start. Returns
// [{ member, inv, invDate, startDate, gapDays }] sorted by biggest gap first.
// Products that share the same NAME (case-insensitive) — duplicate catalog
// records that split stock and sales reporting. Returns
// [{ name, products:[...], totalStock, count }] for groups with 2+ records.
// ─── Personal Notes & Reminders ─────────────────────────────────────────────
// state.notes[] = { id, title, body, priority('high'|'medium'|'low'),
//   remindDate(YYYY-MM-DD|null), done(bool), follow(bool), createdAt, updatedAt }
const NOTE_PRIORITIES = ['high', 'medium', 'low'];
function allNotes() { return state.notes || (state.notes = []); }
// A note "needs attention" (drives the sidebar badge) if it's not done AND is
// either flagged to follow up, or has a reminder date that's today/overdue.
function noteNeedsAttention(n) {
  if (!n || n.done) return false;
  if (n.follow) return true;
  if (n.remindDate && n.remindDate <= TODAY) return true;
  return false;
}
function dueNotesCount() { return allNotes().filter(noteNeedsAttention).length; }

// Build and toggle the notifications dropdown panel under the bell.
function toggleNotifPanel(wrap) {
  const existing = wrap.querySelector('.notif-panel');
  if (existing) { existing.remove(); document.removeEventListener('click', _notifOutside, true); return; }
  const items = buildNotifications();
  const panel = el('div', { className: 'notif-panel' });
  // Fully inline-styled dropdown (the app has no .notif-panel stylesheet rule), opening below
  // the corner bell and right-aligned so it never runs off-screen. (v6.430)
  const _rtl = (typeof getLang === 'function' && getLang() === 'ar');
  panel.style.cssText = `position:absolute;top:calc(100% + 8px);${_rtl ? 'left:0' : 'right:0'};width:340px;max-width:calc(100vw - 32px);max-height:min(70vh,520px);overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);z-index:1400;padding:6px`;
  const toneColor = (tone) => tone === 'urgent' ? 'var(--red)' : tone === 'warn' ? 'var(--accent-2)' : 'var(--blue)';
  const header = `<div class="notif-head" style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;padding:10px 12px 8px">${t('Notifications', 'الإشعارات')}${items.length ? ` <span class="notif-head-count" style="background:var(--red);color:#fff;font-size:11px;font-weight:700;border-radius:10px;padding:1px 8px">${items.length}</span>` : ''}</div>`;
  const body = items.length
    ? items.map((n, i) => `<button type="button" class="notif-item" data-route="${n.route || ''}" data-action="${n.action || ''}" data-inv="${n.invId != null ? n.invId : ''}" data-i="${i}" style="display:flex;align-items:flex-start;gap:10px;width:100%;text-align:${_rtl ? 'right' : 'left'};background:none;border:none;border-radius:10px;padding:9px 10px;cursor:pointer;color:var(--text)" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='none'">
        <span class="notif-ico" style="flex-shrink:0;width:32px;height:32px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:15px;background:${toneColor(n.tone)}22;color:${toneColor(n.tone)}">${n.icon}</span>
        <span class="notif-txt" style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="notif-title" style="font-weight:600;font-size:13px">${escapeHtml(n.title)}</span><span class="notif-body" style="font-size:11.5px;color:var(--text-mute);line-height:1.4">${escapeHtml(n.body)}</span></span>
      </button>`).join('')
    : `<div class="notif-empty" style="text-align:center;padding:28px 16px;font-size:13px;color:var(--text-mute)">🎉 ${t('You\\u2019re all caught up', 'لا توجد إشعارات جديدة')}</div>`;
  panel.innerHTML = header + `<div class="notif-list">${body}</div>`;
  wrap.append(panel);
  panel.querySelectorAll('.notif-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const route = btn.getAttribute('data-route');
      const action = btn.getAttribute('data-action');
      const inv = btn.getAttribute('data-inv');
      panel.remove(); document.removeEventListener('click', _notifOutside, true);
      // Invoice-ready item → download the PDF straight away, then clear the entry. (v6.469)
      if (action === 'invoice' && inv) {
        if (typeof printInvoicePDF === 'function') { try { printInvoicePDF(parseInt(inv)); } catch (_) {} }
        if (typeof window.dismissInvoiceNotif === 'function') window.dismissInvoiceNotif(inv);
        return;
      }
      if (route && typeof navigate === 'function') navigate(route);
    });
  });
  setTimeout(() => document.addEventListener('click', _notifOutside, true), 0);
}
function _notifOutside(e) {
  const wrap = document.querySelector('.notif-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const p = wrap.querySelector('.notif-panel');
    if (p) p.remove();
    document.removeEventListener('click', _notifOutside, true);
  }
}

// ─── Notifications (Facebook-style bell) ────────────────────────────────────
// Role-aware notification list. Each item: { icon, title, body, tone, route? }.
// tone: 'info' | 'warn' | 'urgent'. Computed live from current data.
const SCHED_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];   // JS getDay() 0..6
function _todayDayKey(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return SCHED_DAY_KEYS[d.getDay()];
}
function _memberSports(m) {
  const set = new Set();
  (m.enrollments || []).forEach(e => e.sport && set.add(e.sport));
  (m.subscriptions || []).forEach(s => s.activity && s.status !== 'Withdrawn' && set.add(s.activity));
  if (m.sport) set.add(m.sport);
  return [...set];
}
// Next scheduled class for a set of sports (and optionally a coach), today first
// then tomorrow. Returns { whenLabel, slot, sport, coachId } or null.
function _nextClassFor(sports, coachId) {
  const sched = state.schedule || [];
  for (const [offset, label] of [[0, 'today'], [1, 'tomorrow']]) {
    const dayKey = _todayDayKey(offset);
    const matches = sched.filter(c => c.day === dayKey
      && (!sports || sports.includes(c.sport))
      && (coachId == null || c.coachId === coachId));
    if (matches.length) {
      // Earliest slot wins (slots sort lexically well enough with hour prefixes,
      // but fall back to array order).
      const first = matches[0];
      return { whenLabel: label, slot: first.slot, sport: first.sport, coachId: first.coachId };
    }
  }
  return null;
}

// ─── Invoice-ready notifications (v6.469) ───────────────────────────────────
// When a new member is registered or a membership is renewed, drop a persistent
// entry in the notification bell with a one-tap "download the invoice PDF" action
// — so staff don't have to open the Invoices screen to re-export it. Stored on
// THIS device (localStorage), capped + TTL'd so the bell stays tidy.
const INV_NOTIF_KEY = 'blackstars-invoice-notifs';
const INV_NOTIF_TTL_MS = 3 * 24 * 60 * 60 * 1000;   // drop entries older than 3 days
function loadInvoiceNotifs() {
  try {
    const now = Date.now();
    const a = JSON.parse(localStorage.getItem(INV_NOTIF_KEY) || '[]');
    return (Array.isArray(a) ? a : []).filter(n => n && n.invId != null && (!n.at || (now - new Date(n.at).getTime()) < INV_NOTIF_TTL_MS)).slice(-8);
  } catch (_) { return []; }
}
function _saveInvoiceNotifs(a) { try { localStorage.setItem(INV_NOTIF_KEY, JSON.stringify(a.slice(-8))); } catch (_) {} }
window.pushInvoiceNotif = function (invId, memberId, memberName, kind) {
  if (invId == null) return;
  const a = loadInvoiceNotifs().filter(n => String(n.invId) !== String(invId));   // no duplicate for the same invoice
  a.push({ invId, memberId: memberId != null ? memberId : null, memberName: memberName || '', kind: kind || 'new', at: new Date().toISOString() });
  _saveInvoiceNotifs(a);
  try { refreshNotifBadge(); } catch (_) {}
};
window.dismissInvoiceNotif = function (invId) { _saveInvoiceNotifs(loadInvoiceNotifs().filter(n => String(n.invId) !== String(invId))); try { refreshNotifBadge(); } catch (_) {} };
// Update the bell's red count badge in place (no full re-render needed).
function refreshNotifBadge() {
  try {
    const bell = document.getElementById('quick-notif'); if (!bell) return;
    const c = (typeof notificationCount === 'function') ? notificationCount() : 0;
    let badge = bell.querySelector('.notif-badge');
    if (c > 0) { if (!badge) { badge = el('span', { className: 'notif-badge' }); bell.append(badge); } badge.textContent = c > 9 ? '9+' : String(c); }
    else if (badge) { badge.remove(); }
  } catch (_) {}
}

function buildNotifications() {
  const role = (typeof currentRole === 'function') ? currentRole() : 'admin';
  const out = [];
  const LOW_CLASSES = 2;            // "running low" threshold
  const EXPIRE_SOON_DAYS = 7;

  if (role === 'student') {
    const id = effectiveMemberId();
    const m = id != null ? state.members.find(x => x.id === id) : null;
    if (m) {
      const sports = _memberSports(m);
      const nc = _nextClassFor(sports, null);
      if (nc) out.push({ icon: '📅', tone: 'info', title: t('Next class', 'الحصة القادمة'),
        body: `${escapeHtml(nc.sport)} · ${escapeHtml(nc.slot)} · ${nc.whenLabel === 'today' ? t('today', 'اليوم') : t('tomorrow', 'غداً')}`, route: 'mymembership' });
      const dexp = m.expiryDate ? daysUntil(m.expiryDate) : null;
      if (memberStatus(m) !== 'Frozen' && dexp != null && dexp >= 0 && dexp <= EXPIRE_SOON_DAYS) out.push({ icon: '⏳', tone: dexp <= 2 ? 'urgent' : 'warn',
        title: t('Membership expiring soon', 'الاشتراك ينتهي قريباً'),
        body: `${t('Expires', 'ينتهي')} ${fmtDate(m.expiryDate)} · ${dexp} ${t('days left', 'يوم متبقٍ')}`, route: 'mymembership' });
      // Low remaining classes per active subscription
      for (const s of (m.subscriptions || [])) {
        if (s.status === 'Withdrawn') continue;
        const remaining = (parseInt(s.totalClasses) || 0) - (parseInt(s.attendedClasses) || 0);
        if (remaining > 0 && remaining <= LOW_CLASSES) out.push({ icon: '🎯', tone: 'warn',
          title: t('Classes running low', 'الحصص قاربت على الانتهاء'),
          body: `${escapeHtml(s.activity)} · ${remaining} ${t('classes left — finish them before expiry', 'حصص متبقية — أنهِها قبل الانتهاء')}`, route: 'mymembership' });
      }
      const due = memberOutstanding(m.id);
      if (due > 0.5) out.push({ icon: '💳', tone: 'warn', title: t('Unpaid balance', 'رصيد غير مدفوع'),
        body: `${fmt(due)} QAR ${t('still due', 'مستحقة')}`, route: 'mymembership' });
      const unreadP = (typeof unreadPostsForUser === 'function') ? unreadPostsForUser('member', m.id) : [];
      if (unreadP.length) out.push({ icon: '📢', tone: 'info', title: t('New advice / article', 'نصيحة / مقال جديد'),
        body: `${unreadP.length} ${t('new message(s) from your coach or the club', 'رسالة جديدة من مدربك أو النادي')}`, route: 'posts' });
    }
  } else if (role === 'coach') {
    const cid = effectiveCoachId();
    const unreadPC = (cid != null && typeof unreadPostsForUser === 'function') ? unreadPostsForUser('coach', cid) : [];
    if (unreadPC.length) out.push({ icon: '📢', tone: 'info', title: t('New advice / article', 'نصيحة / مقال جديد'),
      body: `${unreadPC.length} ${t('new message(s) from the club', 'رسالة جديدة من النادي')}`, route: 'posts' });
    const nc = _nextClassFor(null, cid);
    if (nc) out.push({ icon: '📅', tone: 'info', title: t('Your next class', 'حصتك القادمة'),
      body: `${escapeHtml(nc.sport)} · ${escapeHtml(nc.slot)} · ${nc.whenLabel === 'today' ? t('today', 'اليوم') : t('tomorrow', 'غداً')}`, route: 'coachhome' });
    // Students of this coach: expiring soon + low classes + recently assigned
    const myStudents = (state.members || []).filter(m => !m.deleted
      && ((m.enrollments || []).some(e => e.coachId === cid) || (m.subscriptions || []).some(s => s.coachId === cid && s.status !== 'Withdrawn')));
    const expiring = myStudents.filter(m => { const st = memberStatus(m); if (st === 'Frozen' || st === 'Withdrawn') return false; const d = m.expiryDate ? daysUntil(m.expiryDate) : null; return d != null && d >= 0 && d <= EXPIRE_SOON_DAYS; });
    if (expiring.length) out.push({ icon: '⏳', tone: 'warn', title: t('Students expiring soon', 'طلاب اشتراكهم ينتهي قريباً'),
      body: `${expiring.length} ${t('of your students expire within a week — nudge them to renew', 'من طلابك ينتهي اشتراكهم خلال أسبوع — ذكّرهم بالتجديد')}`, route: 'coachhome' });
    let lowCount = 0;
    for (const m of myStudents) for (const s of (m.subscriptions || [])) {
      if (s.coachId !== cid || s.status === 'Withdrawn') continue;
      const remaining = (parseInt(s.totalClasses) || 0) - (parseInt(s.attendedClasses) || 0);
      if (remaining > 0 && remaining <= LOW_CLASSES) { lowCount++; break; }
    }
    if (lowCount) out.push({ icon: '🎯', tone: 'info', title: t('Students with few classes left', 'طلاب لديهم حصص قليلة'),
      body: `${lowCount} ${t('students have classes running low', 'طلاب حصصهم قاربت على الانتهاء')}`, route: 'coachhome' });
    const newly = myStudents.filter(m => { const d = m.firstRegistration ? daysUntil(m.firstRegistration) : null; return d != null && d <= 0 && d >= -7; });
    if (newly.length) out.push({ icon: '🆕', tone: 'info', title: t('New students assigned', 'طلاب جدد'),
      body: `${newly.length} ${t('new students joined your classes this week', 'طلاب جدد انضموا لحصصك هذا الأسبوع')}`, route: 'coachhome' });
  } else {
    // Admin / staff: actionable summaries.
    // Freshly-created invoices first — a one-tap download of the new-member / renewal PDF. (v6.469)
    for (const n of loadInvoiceNotifs().slice().reverse()) {
      out.push({ icon: '🧾', tone: 'info',
        title: n.kind === 'renewal' ? t('Renewal invoice ready', 'فاتورة تجديد جاهزة') : t('New member invoice ready', 'فاتورة عضو جديد جاهزة'),
        body: (n.memberName ? n.memberName + ' · ' : '') + t('tap to download the PDF', 'اضغط لتنزيل الفاتورة PDF'),
        action: 'invoice', invId: n.invId });
    }
    const dn = dueNotesCount();
    if (dn) out.push({ icon: '📝', tone: 'warn', title: t('Notes need attention', 'ملاحظات تحتاج انتباه'),
      body: `${dn} ${t('reminders due or flagged to follow up', 'تذكير مستحق أو معلّم للمتابعة')}`, route: 'notes' });
    const campSoon = (typeof campExpiringSoonCount === 'function') ? campExpiringSoonCount() : 0;
    if (campSoon) out.push({ icon: '☀️', tone: 'warn', title: t('Camp members expiring', 'أعضاء معسكر ينتهون'),
      body: `${campSoon} ${t('camp members expire within a week', 'أعضاء معسكر ينتهي اشتراكهم خلال أسبوع')}`, route: 'campmembers' });
    const expSoon = (state.members || []).filter(m => { if (m.deleted || m.sport === SUMMER_CAMP) return false; const st = memberStatus(m); if (st === 'Frozen' || st === 'Withdrawn') return false; const d = m.expiryDate ? daysUntil(m.expiryDate) : null; return d != null && d >= 0 && d <= EXPIRE_SOON_DAYS; }).length;
    if (expSoon) out.push({ icon: '⏳', tone: 'info', title: t('Memberships expiring soon', 'اشتراكات تنتهي قريباً'),
      body: `${expSoon} ${t('members expire within a week', 'أعضاء ينتهي اشتراكهم خلال أسبوع')}`, route: 'expiring' });
  }
  return out;
}
function notificationCount() { try { return buildNotifications().length; } catch (_) { return 0; } }

// Count of camp members whose membership expires within the next week (0–7 days),
// for the sidebar reminder badge on Camp Members. Mirrors the page's own check.
function campExpiringSoonCount() {
  const isCamp = m => m && !m.deleted && (m.sport === SUMMER_CAMP || (Array.isArray(m.enrollments) && m.enrollments.some(e => e.sport === SUMMER_CAMP)));
  return (state.members || []).filter(m => {
    if (!isCamp(m)) return false;
    if (typeof memberStatus === 'function' && memberStatus(m) === 'Withdrawn') return false;
    const d = m.expiryDate ? daysUntil(m.expiryDate) : null;
    return d != null && d >= 0 && d <= 7;
  }).length;
}
function notePriorityRank(p) { return p === 'high' ? 0 : p === 'medium' ? 1 : 2; }

// ─── Camp business-day recalculation (Cleanup) ──────────────────────────────
// Camp members created before the business-day rules (v6.87/6.88) may still carry
// calendar-based class counts (7/14/30…) and calendar expiry dates. This finds
// camp memberships whose stored class count or end date doesn't match the
// business-day rule (1 week = 5 classes, 1 month = 22, …; week-based expiry counted
// Sun–Thu), and the fixer recomputes them. Attendance is never changed.
function _campTargetForSub(sub) {
  // Recover the sold duration from the stored class count or duration label, then
  // return the correct business-day class count + end date for it.
  let priceRow = null;
  if (sub.durationLabel) priceRow = (DEFAULT_SUMMER_CAMP_PRICES || []).find(p => p.label === sub.durationLabel);
  if (!priceRow) {
    const cls = parseInt(sub.totalClasses) || 0;
    const paid = parseFloat(sub.amountPaid) || 0;
    const rows = DEFAULT_SUMMER_CAMP_PRICES || [];
    // A stored count can be ambiguous: it may be a legacy CALENDAR-days value
    // (7, 14, 30, 60 …) or an already-correct BUSINESS-day count (5, 10, 22, 44 …).
    // 30 in particular is both "1 month" (legacy days) and "6 weeks" (business days).
    // Disambiguate by the amount paid when we can; otherwise prefer the legacy
    // calendar-days interpretation, since this tool exists to convert old records.
    const legacyMatch = rows.find(p => p.days === cls);
    const bizMatch = rows.find(p => campClassCount(p.days) === cls);
    if (legacyMatch && bizMatch && legacyMatch.label !== bizMatch.label) {
      // Ambiguous — pick the row whose price is closest to what was paid.
      if (paid > 0) {
        priceRow = Math.abs((legacyMatch.price || 0) - paid) <= Math.abs((bizMatch.price || 0) - paid)
          ? legacyMatch : bizMatch;
      } else {
        priceRow = legacyMatch;   // default to the legacy reading
      }
    } else {
      priceRow = legacyMatch || bizMatch;
    }
  }
  if (!priceRow) return null;
  const targetClasses = campClassCount(priceRow.days);
  const targetEnd = sub.start ? campEndDate(sub.start, priceRow.days) : sub.end;
  return { priceRow, targetClasses, targetEnd };
}

function findCampMembersToRecalc() {
  const out = [];
  for (const m of (state.members || [])) {
    if (m.deleted) continue;
    const isCamp = m.sport === SUMMER_CAMP || (Array.isArray(m.enrollments) && m.enrollments.some(e => e.sport === SUMMER_CAMP));
    if (!isCamp) continue;
    const fixes = [];
    for (const sub of (m.subscriptions || [])) {
      if ((sub.activity || '') !== SUMMER_CAMP || sub.status === 'Withdrawn') continue;
      const tgt = _campTargetForSub(sub);
      if (!tgt) continue;
      const clsOff = (parseInt(sub.totalClasses) || 0) !== tgt.targetClasses;
      const endOff = tgt.targetEnd && sub.end !== tgt.targetEnd;
      if (clsOff || endOff) {
        fixes.push({ sub, label: tgt.priceRow.label, fromClasses: parseInt(sub.totalClasses) || 0, toClasses: tgt.targetClasses, fromEnd: sub.end, toEnd: tgt.targetEnd });
      }
    }
    if (fixes.length) out.push({ member: m, fixes });
  }
  return out;
}

function recalcCampMember(memberId) {
  const m = (state.members || []).find(x => x.id === memberId);
  if (!m) return 0;
  let changed = 0;
  for (const sub of (m.subscriptions || [])) {
    if ((sub.activity || '') !== SUMMER_CAMP || sub.status === 'Withdrawn') continue;
    const tgt = _campTargetForSub(sub);
    if (!tgt) continue;
    let touched = false;
    if ((parseInt(sub.totalClasses) || 0) !== tgt.targetClasses) { sub.totalClasses = tgt.targetClasses; touched = true; }
    if (tgt.targetEnd && sub.end !== tgt.targetEnd) { sub.end = tgt.targetEnd; touched = true; }
    if (!sub.durationLabel && tgt.priceRow) sub.durationLabel = tgt.priceRow.label;
    // Mirror onto the matching enrollment + the member's expiry/headline.
    const enr = (m.enrollments || []).find(e => e.sport === SUMMER_CAMP);
    if (enr) { enr.classes = tgt.targetClasses; if (tgt.priceRow) enr.durationLabel = tgt.priceRow.label; }
    if (m.sport === SUMMER_CAMP && tgt.targetEnd) m.expiryDate = tgt.targetEnd;
    if (touched) changed++;
  }
  return changed;
}

// ─── Enrollment ↔ subscription re-sync (Cleanup) ────────────────────────────
// A member's enrollments[] (the headline sport rows shown on cards/attendance) can
// drift out of sync with subscriptions[] (the source-of-truth billing/attendance
// records) — e.g. a sport duplicated, missing, or pointing at the wrong coach. This
// was the root cause behind wrong-coach attendance. The detector flags those members;
// the fixer rebuilds enrollments from the ACTIVE subscriptions (one row per sport,
// correct coach), preserving the existing enrollment's classes/price/dates/validity
// where it already had a matching row. Attendance and subscriptions are NOT touched.
function _activeSubsBySport(m) {
  const bySport = new Map();
  for (const s of (m.subscriptions || [])) {
    if (!s.activity || s.status === 'Withdrawn') continue;
    // Keep the most recent active sub per sport (later start wins).
    const prev = bySport.get(s.activity);
    if (!prev || (s.start || '') >= (prev.start || '')) bySport.set(s.activity, s);
  }
  return bySport;
}
function _enrollmentsMatchSubs(m) {
  const subsBySport = _activeSubsBySport(m);
  const enr = Array.isArray(m.enrollments) ? m.enrollments.filter(e => e && e.sport) : [];
  // Duplicate sport in enrollments?
  const seen = new Set();
  for (const e of enr) { if (seen.has(e.sport)) return false; seen.add(e.sport); }
  // Same set of sports?
  if (seen.size !== subsBySport.size) return false;
  for (const sport of subsBySport.keys()) if (!seen.has(sport)) return false;
  // Coach matches the active sub for each sport?
  for (const e of enr) {
    const s = subsBySport.get(e.sport);
    if (!s) return false;
    if ((e.coachId || null) !== (s.coachId || null)) return false;
  }
  return true;
}
function findMembersWithEnrollmentDrift() {
  const out = [];
  for (const m of (state.members || [])) {
    if (m.deleted) continue;
    // Only meaningful for members that have subscriptions to compare against.
    if (!Array.isArray(m.subscriptions) || !m.subscriptions.some(s => s.status !== 'Withdrawn')) continue;
    if (!_enrollmentsMatchSubs(m)) {
      const subsBySport = _activeSubsBySport(m);
      const enrSports = (m.enrollments || []).filter(e => e && e.sport).map(e => e.sport);
      out.push({
        member: m,
        enrollmentSports: enrSports,
        subscriptionSports: [...subsBySport.keys()],
      });
    }
  }
  return out;
}
function resyncMemberEnrollments(memberId) {
  const m = (state.members || []).find(x => x.id === memberId);
  if (!m) return false;
  const subsBySport = _activeSubsBySport(m);
  if (!subsBySport.size) return false;
  const oldBySport = new Map();
  for (const e of (m.enrollments || [])) if (e && e.sport && !oldBySport.has(e.sport)) oldBySport.set(e.sport, e);
  const rebuilt = [];
  for (const [sport, s] of subsBySport) {
    const old = oldBySport.get(sport) || {};
    rebuilt.push({
      sport,
      coachId: s.coachId != null ? s.coachId : (old.coachId ?? null),
      classes: old.classes != null ? old.classes : (s.totalClasses || 0),
      price: old.price != null ? old.price : (s.amountPaid || 0),
      start: old.start || s.start || null,
      validity: old.validity || s.validity || DEFAULT_VALIDITY,
      ...(old.durationLabel ? { durationLabel: old.durationLabel } : (s.durationLabel ? { durationLabel: s.durationLabel } : {})),
      ...(old.transferLocked ? { transferLocked: true } : {}),
    });
  }
  m.enrollments = rebuilt;
  // Keep the headline sport pointing at something that still exists.
  if (m.sport && !subsBySport.has(m.sport)) m.sport = rebuilt[0] ? rebuilt[0].sport : m.sport;
  return true;
}

function findDuplicateProducts() {
  const byName = {};
  for (const p of (state.products || [])) {
    if (p.deleted) continue;
    const key = (p.name || '').trim().toLowerCase();
    if (!key) continue;
    (byName[key] = byName[key] || []).push(p);
  }
  const out = [];
  for (const group of Object.values(byName)) {
    if (group.length < 2) continue;
    const sorted = group.slice().sort((a, b) => (a.id || 0) - (b.id || 0));   // keep lowest id
    const totalStock = sorted.reduce((s, p) => s + (typeof productCurrentStock === 'function' ? productCurrentStock(p.id) : (p.stock || 0)), 0);
    const initialStock = sorted.reduce((s, p) => s + (p.stock || 0), 0);
    out.push({ name: sorted[0].name, products: sorted, totalStock, initialStock, count: sorted.length });
  }
  return out;
}

// Merge all product records sharing a name into the OLDEST (lowest-id) record:
// re-point every sale line item to the kept id, set the kept record's initial
// stock to the SUM of all the merged records' initial stock (so current stock =
// summed initial − all sales), and remove the duplicate records. Returns the kept
// product.
function mergeDuplicateProducts(name) {
  const key = (name || '').trim().toLowerCase();
  const group = (state.products || []).filter(p => !p.deleted && (p.name || '').trim().toLowerCase() === key)
    .sort((a, b) => (a.id || 0) - (b.id || 0));
  if (group.length < 2) return null;
  const keep = group[0];
  const rest = group.slice(1);
  const restIds = new Set(rest.map(p => p.id));
  // Sum initial stock onto the kept record.
  keep.stock = group.reduce((s, p) => s + (p.stock || 0), 0);
  // Inherit category/sku/threshold from a duplicate if the kept one is missing them.
  for (const p of rest) {
    if (!keep.category && p.category) keep.category = p.category;
    if (!keep.sku && p.sku) keep.sku = p.sku;
    if (keep.lowStockThreshold == null && p.lowStockThreshold != null) keep.lowStockThreshold = p.lowStockThreshold;
  }
  // Re-point all sale line items from the duplicates to the kept product.
  for (const sale of (state.sales || [])) {
    for (const it of (sale.items || [])) {
      if (restIds.has(it.productId)) { it.productId = keep.id; if (!it.name) it.name = keep.name; }
    }
  }
  // Remove the duplicate product records.
  state.products = (state.products || []).filter(p => !restIds.has(p.id));
  return keep;
}

function findMisdatedInvoices(minGapDays = 3) {
  const out = [];
  // Group membership invoices per member; only the member's OLDEST invoice should
  // line up with their start date. Renewals and later invoices are dated to their
  // own period and must never be re-dated back to the original start.
  const byMember = {};
  for (const inv of (state.invoices || [])) {
    if (inv.deleted || inv.switchCredit || inv.activityType === 'switch-credit') continue;
    if ((inv.category || 'Membership') !== 'Membership') continue;
    if (inv.customerId == null || !inv.date) continue;
    (byMember[inv.customerId] = byMember[inv.customerId] || []).push(inv);
  }
  for (const [cid, invs] of Object.entries(byMember)) {
    const m = state.members.find(x => x.id === parseInt(cid));
    if (!m || m.deleted) continue;
    // If the member has more than one membership invoice, they've renewed — the
    // later ones are legitimately dated to their own months, so skip this member
    // entirely (consolidating is a separate Cleanup tool). Only fix single-invoice
    // members whose one invoice drifted off their start date.
    if (invs.length !== 1) continue;
    const inv = invs[0];
    const enrStarts = (Array.isArray(m.enrollments) ? m.enrollments : [])
      .map(e => enrollmentStartDate(e, m)).filter(Boolean).sort();
    const startDate = enrStarts[0] || m.startDate || m.firstRegistration || null;
    if (!startDate) continue;
    const gapDays = daysBetween(startDate, inv.date);
    if (gapDays >= minGapDays && inv.date > startDate) {
      out.push({ member: m, inv, invDate: inv.date, startDate, gapDays });
    }
  }
  return out.sort((a, b) => b.gapDays - a.gapDays);
}

// Re-date one invoice (and its payment records / month) to the member's start
// date. Keeps amounts intact; only the date/month move, so revenue is recognised
// in the correct month. Returns the corrected invoice.
function fixInvoiceDateToStart(invId) {
  const inv = (state.invoices || []).find(i => i.id === invId && !i.deleted);
  if (!inv) return null;
  const m = state.members.find(x => x.id === inv.customerId);
  if (!m) return null;
  const enrStarts = (Array.isArray(m.enrollments) ? m.enrollments : [])
    .map(e => enrollmentStartDate(e, m)).filter(Boolean).sort();
  const startDate = enrStarts[0] || m.startDate || m.firstRegistration || null;
  if (!startDate) return null;
  const newMonth = startDate.slice(0, 7);
  inv.date = startDate;
  inv.month = newMonth;
  if (Array.isArray(inv.payments)) {
    inv.payments.forEach(p => { p.date = startDate; p.month = newMonth; });
  }
  return inv;
}

function findMembersWithMergeableInvoices() {
  const byMember = {};
  for (const inv of (state.invoices || [])) {
    if (inv.deleted || inv.switchCredit || inv.activityType === 'switch-credit') continue;
    if ((inv.category || 'Membership') !== 'Membership') continue;
    if (inv.customerId == null) continue;
    (byMember[inv.customerId] = byMember[inv.customerId] || []).push(inv);
  }
  const out = [];
  for (const [cid, invs] of Object.entries(byMember)) {
    if (invs.length < 2) continue;
    const member = state.members.find(x => x.id === parseInt(cid));
    if (!member || member.deleted) continue;
    const sorted = invs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const total = sorted.reduce((s, i) => s + invoiceTotal(i), 0);
    const paid = sorted.reduce((s, i) => s + invoicePaid(i), 0);
    out.push({ member, invoices: sorted, total, paid });
  }
  return out;
}

// Merge all of a member's membership invoices into the OLDEST one: combine line
// items + payments, set the oldest's amount to the sum, soft-delete the rest.
// Payments keep their own months so revenue stays accurate. Returns the kept inv.
function mergeMemberInvoices(memberId) {
  const invs = (state.invoices || []).filter(inv =>
    !inv.deleted && inv.customerId === memberId && !inv.switchCredit
    && inv.activityType !== 'switch-credit' && (inv.category || 'Membership') === 'Membership');
  if (invs.length < 2) return null;
  const sorted = invs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  // Capture the TRUE charged total and combined discount BEFORE merging, so a
  // discounted invoice (whose amount is below its line-price sum) isn't inflated
  // by recomputing the total from raw line prices.
  const trueChargedTotal = invs.reduce((s, iv) => s + (Number(iv.amount) || 0), 0);
  const combinedDiscount = invs.reduce((s, iv) => s + (Number(iv.discount) || 0), 0);
  const keep = sorted[0];
  const rest = sorted.slice(1);
  if (!Array.isArray(keep.lineItems)) {
    keep.lineItems = [{ sport: keep.sport, coach: keep.coach, coachId: keep.coachId, price: keep.amount || 0, classes: keep.classes }];
  }
  if (!Array.isArray(keep.payments)) {
    keep.payments = (keep.amountPaid || 0) > 0 ? [{ date: keep.date, month: keep.month || (keep.date || '').slice(0, 7), amount: keep.amountPaid, method: keep.method || 'cash' }] : [];
  }
  for (const r of rest) {
    const rLines = (Array.isArray(r.lineItems) && r.lineItems.length)
      ? r.lineItems
      : [{ sport: r.sport, coach: r.coach, coachId: r.coachId, price: r.amount || 0, classes: r.classes }];
    keep.lineItems.push(...rLines);
    const rPays = (Array.isArray(r.payments) && r.payments.length)
      ? r.payments
      : ((r.amountPaid || 0) > 0 ? [{ date: r.date, month: r.month || (r.date || '').slice(0, 7), amount: r.amountPaid, method: r.method || 'cash' }] : []);
    keep.payments.push(...rPays);
    r.deleted = true;
    r.deletedReason = 'Merged into ' + (keep.ref || ('INV' + keep.id));
  }
  keep.amount = trueChargedTotal;
  if (combinedDiscount > 0) keep.discount = combinedDiscount;
  keep.amountPaid = (keep.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  const mem = state.members.find(x => x.id === memberId);
  if (mem) {
    const label = (typeof sportListWithDuration === 'function' && sportListWithDuration(keep.lineItems)) || keep.lineItems.map(li => li.sport).join(', ');
    keep.sport = label;
    keep.description = `${mem.name} — ${label} subscription`;
  }
  return keep;
}


// Phone-aware SEARCH match. The query may include spaces, a +974 country code,
// or be a partial fragment. We compare digits-only so "+974 6699 5549",
// "6699 5549" and "66995549" all match the same stored number, and a partial
// like "6699" still matches. queryDigits is the digits-only form of what the
// user typed.
function phoneSearchMatches(storedPhone, queryDigits) {
  if (!storedPhone || !queryDigits) return false;
  const d = normalizePhoneForCompare(storedPhone);
  if (!d) return false;
  if (d.includes(queryDigits)) return true;     // partial / space-insensitive
  return phonesMatch(d, queryDigits);           // full number with/without +974
}
// trim, exact match.
function findMembersByQid(qid, excludeId) {
  if (!qid) return [];
  const target = String(qid).trim().toUpperCase();
  if (!target) return [];
  return state.members.filter(m => {
    if (m.id === excludeId) return false;
    const mQid = String(m.qid || '').trim().toUpperCase();
    return mQid && mQid === target;
  });
}

// ─── NAME MATCHING (for the composite uniqueness key) ────────────
// A member is uniquely identified by Mobile + Name. Two records with the
// same phone are only the SAME person when a name also matches; if the names
// differ they're distinct people (e.g. a family sharing one phone), which is
// allowed. Names match on EITHER the English or the Arabic field.
function normalizeNameForCompare(name) {
  if (!name) return '';
  // Trim, lowercase (no-op for Arabic), collapse internal whitespace.
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Group members whose names are the SAME or very SIMILAR (likely accidental
// duplicates). Compares English and Arabic names with normalized edit distance,
// so "Mohamed Ali" ≈ "Mohammed Ali", "ahmad" ≈ "ahmed", and exact matches all
// cluster. Returns an array of groups: [{ key, members:[m,...], reason }].
// `threshold` is the max similarity distance ratio (0 = identical only).
function findSimilarNameMembers(members, opts = {}) {
  const list = (members || []).filter(m => m && !m.deleted && (m.name || m.nameArabic));
  // Similarity test between two members (true if names are close enough).
  const ratio = opts.ratio != null ? opts.ratio : 0.2;   // ≤20% of length may differ
  const close = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen < 4) return a === b;                 // too short to fuzz safely
    const allowed = Math.max(1, Math.floor(maxLen * ratio));
    return levenshtein(a, b) <= allowed;
  };
  const simMembers = (m1, m2) => {
    const e1 = normalizeNameForCompare(m1.name), e2 = normalizeNameForCompare(m2.name);
    const a1 = normalizeNameForCompare(m1.nameArabic), a2 = normalizeNameForCompare(m2.nameArabic);
    let how = null;
    if (e1 && e2 && close(e1, e2)) how = (e1 === e2) ? 'exact' : 'similar';
    if (!how && a1 && a2 && close(a1, a2)) how = (a1 === a2) ? 'exact' : 'similar';
    return how;
  };
  // Union-find style clustering.
  const parent = list.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const reasons = {};
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const how = simMembers(list[i], list[j]);
      if (how) { union(i, j); if (how === 'exact') reasons[find(i)] = 'exact'; else if (!reasons[find(i)]) reasons[find(i)] = 'similar'; }
    }
  }
  const clusters = {};
  for (let i = 0; i < list.length; i++) {
    const r = find(i);
    (clusters[r] = clusters[r] || []).push(list[i]);
  }
  return Object.entries(clusters)
    .filter(([, ms]) => ms.length > 1)
    .map(([r, ms]) => ({ members: ms, reason: reasons[r] || 'similar', key: (ms[0].name || ms[0].nameArabic || '') }))
    .sort((a, b) => (a.reason === b.reason ? b.members.length - a.members.length : (a.reason === 'exact' ? -1 : 1)));
}

// True if two members share an English name OR an Arabic name (non-empty).
function namesMatch(a, b) {
  const aEn = normalizeNameForCompare(a.name);
  const bEn = normalizeNameForCompare(b.name);
  if (aEn && bEn && aEn === bEn) return true;
  const aAr = normalizeNameForCompare(a.nameArabic);
  const bAr = normalizeNameForCompare(b.nameArabic);
  if (aAr && bAr && aAr === bAr) return true;
  return false;
}

// Composite-key duplicate lookup used at save time. Returns the existing
// member (active OR archived) that is the SAME person as the one being saved
// — i.e. phone matches AND a name matches — or null. Same phone with a
// different name is NOT a duplicate (returns null).
function findDuplicateMember(phone, nameEn, nameAr, excludeId) {
  if (!phone) return null;
  const candidate = { name: nameEn, nameArabic: nameAr };
  return state.members.find(m => {
    if (m.id === excludeId) return false;
    if (!phonesMatch(m.phone, phone)) return false;
    return namesMatch(m, candidate);
  }) || null;
}

// Group members who share a phone number, REGARDLESS of name. Returns clusters
// of 2+ members on the same last-8 digits. Use case: spotting a child wrongly
// registered with a parent's mobile, or any two records on the same number
// before they get merged into a Family. Members in this list may legitimately
// be siblings on a shared family phone — admin reviews.
function findSharedPhoneClusters() {
  const buckets = new Map();
  for (const m of state.members) {
    const d = normalizePhoneForCompare(m.phone);
    if (!d || d.length < MIN_PHONE_DIGITS) continue;
    const key = d.slice(-8);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }
  const out = [];
  for (const [key, members] of buckets) {
    if (members.length >= 2) out.push({ key, members });
  }
  // Largest first; ties broken by name for stable display.
  out.sort((a, b) => b.members.length - a.members.length || (a.members[0].name || '').localeCompare(b.members[0].name || ''));
  return out;
}

// Group members into TRUE duplicate clusters: same phone AND same name.
// Returns an array of arrays, each inner array being 2+ members that are the
// same person. Members who merely share a phone (different names — families)
// are intentionally NOT clustered.
function findAllDuplicateMembers() {
  // 1. Bucket by phone (last 8 digits — the stable portion across formats).
  const phoneBuckets = new Map();  // phoneKey -> [members]
  for (const m of state.members) {
    const d = normalizePhoneForCompare(m.phone);
    if (!d || d.length < MIN_PHONE_DIGITS) continue;
    const key = d.slice(-8);
    if (!phoneBuckets.has(key)) phoneBuckets.set(key, []);
    phoneBuckets.get(key).push(m);
  }
  // 2. Within each phone bucket, sub-group members whose names also match.
  const clusters = [];
  for (const members of phoneBuckets.values()) {
    if (members.length < 2) continue;
    const used = new Set();
    for (let i = 0; i < members.length; i++) {
      if (used.has(members[i].id)) continue;
      const group = [members[i]];
      used.add(members[i].id);
      for (let j = i + 1; j < members.length; j++) {
        if (used.has(members[j].id)) continue;
        if (namesMatch(members[i], members[j])) {
          group.push(members[j]);
          used.add(members[j].id);
        }
      }
      if (group.length >= 2) clusters.push(group);
    }
  }
  return clusters;
}

// Group members whose NAMES are similar (typo-tolerant), regardless of phone —
// for cleanup. Uses Levenshtein on the raw and word-sorted name (so reordered
// names match), in English or Arabic. Clusters fully covered by the exact
// phone+name duplicate scan are skipped to avoid showing the same group twice.
function findSimilarNameClusters() {
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const sortWords = s => norm(s).split(' ').filter(Boolean).sort().join(' ');
  const members = state.members.filter(m => norm(m.name) || norm(m.nameArabic));
  const similar = (a, b) => {
    const an = norm(a.name), bn = norm(b.name);
    if (an && bn) {
      if (an === bn) return true;
      const aw = sortWords(a.name), bw = sortWords(b.name);
      if (aw === bw) return true;
      const thr = Math.max(1, Math.floor(Math.max(an.length, bn.length) * 0.2));
      if (levenshtein(an, bn) <= thr || levenshtein(aw, bw) <= thr) return true;
    }
    const aa = norm(a.nameArabic), ba = norm(b.nameArabic);
    if (aa && ba) {
      if (aa === ba) return true;
      if (levenshtein(aa, ba) <= Math.max(1, Math.floor(Math.max(aa.length, ba.length) * 0.2))) return true;
    }
    return false;
  };
  const parent = members.map((_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++)
      if (similar(members[i], members[j])) union(i, j);
  const groupsMap = new Map();
  for (let i = 0; i < members.length; i++) {
    const r = find(i);
    if (!groupsMap.has(r)) groupsMap.set(r, []);
    groupsMap.get(r).push(members[i]);
  }
  const dupIds = new Set();
  for (const c of findAllDuplicateMembers()) for (const m of c) dupIds.add(m.id);
  const out = [];
  for (const g of groupsMap.values()) {
    if (g.length < 2) continue;
    if (g.every(m => dupIds.has(m.id))) continue;  // already in the phone+name scan
    out.push(g);
  }
  out.sort((a, b) => b.length - a.length || (a[0].name || '').localeCompare(b[0].name || ''));
  return out;
}

function phoneCell(phone, opts = {}) {
  if (!isRealPhone(phone)) {
    return opts.empty != null ? opts.empty : '<span class="text-mute">—</span>';
  }
  const url = waLink(phone, opts.text);
  const stop = opts.stop === false ? '' : 'event.stopPropagation();';
  // Real WhatsApp glyph in WhatsApp green. The 💬 emoji used to render on Windows as a plain
  // speech balloon that reads as "…", so nobody could tell it opened WhatsApp. (v6.370)
  const icon = (typeof waIconSvg === 'function') ? waIconSvg(13) : '💬';
  return `<span style="white-space:nowrap">${escapeHtml(phone)} <a href="${url}" target="_blank" onclick="${stop}" title="Open WhatsApp" style="color:#25D366;text-decoration:none;vertical-align:middle;margin-left:3px">${icon}</a></span>`;
}

function coachName(id) {
  if (id == null) return '—';
  const c = state.coaches.find(x => x.id === id);
  return c ? c.name : 'Unknown';
}

// Every coach this member trains with — headline coach plus each enrollment/subscription.
// A member's coachId is only the HEADLINE coach; a second sport can be taught by someone
// else (and for a Summer Camp member the headline coach is null entirely).
function memberCoachIds(m) {
  if (!m) return [];
  return [...new Set([
    m.coachId,
    ...((m.enrollments || []).map(e => e.coachId)),
    ...((m.subscriptions || []).filter(s => s.status !== 'Withdrawn').map(s => s.coachId)),
  ].filter(v => v != null))];
}

// The coach who actually teaches THIS sport to this member; falls back to the headline
// coach so a caller always gets the best available answer. Reports that credit a coach
// for a specific sport must use this, not m.coachId.
function coachIdForSport(m, sport) {
  if (!m) return null;
  if (sport != null) {
    const e = (m.enrollments || []).find(x => (x.sport || '') === sport && x.coachId != null);
    if (e) return e.coachId;
    const s = (m.subscriptions || []).find(x => (x.activity || '') === sport && x.coachId != null && x.status !== 'Withdrawn');
    if (s) return s.coachId;
    // Only claim the headline coach for the headline sport.
    if (m.coachId != null && (m.sport || '') === sport) return m.coachId;
    return null;
  }
  return m.coachId != null ? m.coachId : null;
}

// Names of every coach this member trains with, headline first. Empty for a camp-only member.
function memberCoachNames(m) {
  const head = m && m.coachId != null ? [m.coachId] : [];
  const ids = [...new Set([...head, ...memberCoachIds(m)])];
  return ids.map(coachName).filter(n => n && n !== '—');
}

// Display name of the coach for a member+sport ('—' when nobody teaches it, e.g. camp).
function coachNameForSport(m, sport) {
  const id = coachIdForSport(m, sport);
  return id == null ? '—' : coachName(id);
}

// ── CLASS ROSTER (v6.400) ────────────────────────────────────────────────────
// A "class" is one weekly Schedule entry (day + time-slot + coach + sport). Its roster is
// DERIVED, never stored: every member who trains that sport with that coach. A member is matched
// through the SAME per-sport coach resolution the Attendance grid uses — primary sport, any
// enrollment, and any subscription — so a member whose headline coach differs but who takes this
// sport with this coach still appears. Global (the Attendance page had a closure-local copy).
function memberTakesSportWithCoach(m, sport, coachId) {
  if (!m || sport == null || coachId == null) return false;
  const cid = parseInt(coachId);
  if (m.coachId === cid && (m.sport || '') === sport) return true;
  if ((m.enrollments || []).some(e => e.coachId === cid && (e.sport || '') === sport)) return true;
  if ((m.subscriptions || []).some(s => s.coachId === cid && (s.activity || '') === sport)) return true;
  return false;
}
// ── PER-SLOT ASSIGNMENT (v6.401) ─────────────────────────────────────────────
// A coach may teach the SAME sport at several times (Saturday 5PM and Monday 6PM). Derived-only
// rosters put every student in BOTH, because coach+sport cannot tell them apart. Optional
// assignments fix that, stored on the MEMBER as m.classSlots[] = [{ sport, coachId, day, slot }]
// — inside the member document, so it rides the existing well-tested member array merge: no new
// collection, no migration, and it syncs like everything else.
//
// The rule is deliberately backward-compatible: a student with NO assignment for a given
// sport+coach still appears in EVERY class of that sport+coach (exactly today's behaviour), so
// nothing empties out the day this ships. As soon as they are assigned to at least one slot for
// that sport+coach, they appear ONLY in the slots they were assigned to.
function memberClassSlots(m, sport, coachId) {
  const cid = parseInt(coachId);
  return ((m && Array.isArray(m.classSlots)) ? m.classSlots : [])
    .filter(a => a && (a.sport || '') === sport && parseInt(a.coachId) === cid);
}
function memberInClassSlot(m, sport, coachId, day, slot) {
  const mine = memberClassSlots(m, sport, coachId);
  if (!mine.length) return true;                       // unassigned → belongs to all of them
  return mine.some(a => a.day === day && Number(a.slot) === Number(slot));
}
// The live roster for a class, active members first, then name. Never includes archived members.
// `day`/`slot` are optional — pass them to honour per-slot assignments.
function classRoster(sport, coachId, day, slot) {
  const useSlot = day != null && slot != null;
  return (state.members || [])
    .filter(m => m && !m.deleted && memberTakesSportWithCoach(m, sport, coachId))
    .filter(m => !useSlot || memberInClassSlot(m, sport, coachId, day, slot))
    .sort((a, b) => {
      const sa = (typeof memberStatus === 'function' ? memberStatus(a) : '') === 'Active' ? 0 : 1;
      const sb = (typeof memberStatus === 'function' ? memberStatus(b) : '') === 'Active' ? 0 : 1;
      return sa - sb || String(a.name || '').localeCompare(String(b.name || ''));
    });
}
// Everyone eligible for this class (sport+coach), regardless of slot — drives the assign dialog.
function classEligible(sport, coachId) {
  return (state.members || [])
    .filter(m => m && !m.deleted && memberTakesSportWithCoach(m, sport, coachId))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}
if (typeof window !== 'undefined') {
  window.memberTakesSportWithCoach = memberTakesSportWithCoach;
  window.memberClassSlots = memberClassSlots;
  window.memberInClassSlot = memberInClassSlot;
  window.classRoster = classRoster;
  window.classEligible = classEligible;
}

// Resolve current customer info for a record (invoice/sale/rental/etc).
// If the record has a customerId pointing to an existing member, the LIVE
// member fields win — so renaming a member instantly propagates to all their
// historical records. Falls back to the record's own snapshot fields for
// walk-ins or members that have been deleted.
//
// Returns { id, name, phone, nationality, isMember, isDeleted }.
function customerInfo(record) {
  if (!record) return { id: null, name: null, phone: null, nationality: null, isMember: false, isDeleted: false };
  const cid = record.customerId;
  if (cid) {
    const m = state.members.find(x => x.id === cid);
    if (m) {
      return {
        id: m.id,
        name: m.name,
        phone: m.phone || null,
        phone2: m.phone2 || null,
        nationality: m.nationality || null,
        nameArabic: m.nameArabic || null,
        qid: m.qid || null,
        isMember: true,
        isDeleted: false,
      };
    }
    // customerId set but member missing → deleted; use snapshot
    return {
      id: cid,
      name: record.customerName || '(deleted member)',
      phone: record.customerPhone || null,
      nationality: null,
      isMember: false,
      isDeleted: true,
    };
  }
  // No link → walk-in. RENTAL invoices carry a back-reference `rentalId`; if the invoice's own
  // customerName wasn't stored (legacy / imported / cleared), recover the renter's name + phone
  // from the linked rental record (where the customer name is a REQUIRED field) so the invoice
  // list shows the person, not the facility name from the description fallback. (v6.361)
  let wName = record.customerName || null;
  let wPhone = record.customerPhone || null;
  if ((!wName || !wPhone) && record.rentalId != null && typeof state !== 'undefined' && Array.isArray(state.rentals)) {
    const rr = state.rentals.find(r => r && r.id === record.rentalId);
    if (rr) { wName = wName || rr.customerName || null; wPhone = wPhone || rr.customerPhone || null; }
  }
  return {
    id: null,
    name: wName,
    phone: wPhone,
    nationality: null,
    isMember: false,
    isDeleted: false,
  };
}

// Read a member's daily marks for a specific (month, sport). Handles both the
// new per-sport structure ({mo:{sport:{day:Y}}}) and legacy ({mo:{day:Y}}).
function attendanceFor(m, monthKey, sport) {
  const mo = m?.dailyAttendance?.[monthKey];
  if (!mo) return {};
  // Per-sport: values are objects keyed by day
  const sample = Object.values(mo)[0];
  if (sample && typeof sample === 'object') {
    return mo[sport] || {};
  }
  // Legacy flat: only return if it's the primary sport
  return sport === m.sport ? mo : {};
}

// Count Y/N marks for a member, optionally filtered by sport. Returns {y, n,
// total} computed from dailyAttendance across all months. This is the LIVE
// count — updated whenever the user marks a cell in the attendance grid.
function liveAttendanceCount(m, sport = null, fromDate = null, toDate = null) {
  let y = 0, n = 0;
  const da = m?.dailyAttendance;
  if (!da) return { y, n, total: 0 };
  // Build a full YYYY-MM-DD for a (monthKey, dayKey) so we can window by date.
  const inWindow = (monthKey, dayKey) => {
    if (!fromDate && !toDate) return true;
    const d = String(parseInt(dayKey, 10)).padStart(2, '0');
    const full = `${monthKey}-${d}`;            // e.g. 2026-05-08
    if (fromDate && full < fromDate) return false;
    if (toDate && full > toDate) return false;
    return true;
  };
  for (const monthKey of Object.keys(da)) {
    const mo = da[monthKey];
    if (!mo) continue;
    const sample = Object.values(mo)[0];
    if (sample && typeof sample === 'object') {
      // Per-sport shape
      for (const sp of Object.keys(mo)) {
        if (sport && sp !== sport) continue;
        const days = mo[sp] || {};
        for (const [dayKey, v] of Object.entries(days)) {
          if (!inWindow(monthKey, dayKey)) continue;
          if (v === 'Y') y++;
          else if (v === 'N') n++;
        }
      }
    } else {
      // Legacy flat (counts as primary sport)
      if (sport && sport !== m.sport) continue;
      for (const [dayKey, v] of Object.entries(mo)) {
        if (!inWindow(monthKey, dayKey)) continue;
        if (v === 'Y') y++;
        else if (v === 'N') n++;
      }
    }
  }
  return { y, n, total: y + n };
}

// Authoritative "attended classes" reading. If the member has ANY live
// attendance marks (Y or N), the live count wins. Otherwise we fall back to
// the static subscription field (imported from spreadsheet). Pass `sport` to
// restrict to one enrolled sport.
function attendedClassesFor(m, sport = null) {
  const live = liveAttendanceCount(m, sport);
  if (live.total > 0) return live.y;   // user has been marking attendance → trust the grid
  // Fallback: sum subscription rows
  let att = 0;
  for (const sub of (m?.subscriptions || [])) {
    if (sport && sub.activity !== sport) continue;
    att += sub.attendedClasses || 0;
  }
  return att;
}

// Top N most active members for a scheduled class (a sport + optional coach),
// ranked by attended classes in that sport. Narrows to the class's coach when
// any of that sport's members are with them; otherwise shows all in the sport.
function topActiveMembersForClass(sport, coachId, limit) {
  limit = limit || 10;
  const inSport = (m) => !m.deleted && (
    (m.enrollments || []).some(e => e.sport === sport) ||
    (m.subscriptions || []).some(s => s.activity === sport)
  );
  const withCoach = (m) => (
    (m.enrollments || []).some(e => e.sport === sport && e.coachId === coachId) ||
    (m.subscriptions || []).some(s => s.activity === sport && s.coachId === coachId)
  );
  let pool = (state.members || []).filter(inSport);
  if (coachId != null) {
    const byCoach = pool.filter(withCoach);
    if (byCoach.length) pool = byCoach;
  }
  return pool
    .map(m => ({ id: m.id, name: m.name || m.nameArabic || ('#' + m.id), attended: attendedClassesFor(m, sport) }))
    .sort((a, b) => b.attended - a.attended || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit);
}

// Same idea for total expected classes (denominator)
function totalClassesFor(m, sport = null) {
  let tot = 0;
  for (const sub of (m?.subscriptions || [])) {
    if (sport && sub.activity !== sport) continue;
    tot += sub.totalClasses || 0;
  }
  return tot;
}

// A coach counts as active unless explicitly flagged 'N'.
function isCoachActive(c) {
  if (!c) return false;
  const a = c.active;
  if (a == null || a === '') return true;          // never set → active
  if (typeof a === 'boolean') return a;            // a BOOLEAN true used to read as inactive
  const s = String(a).trim().toLowerCase();        // ...and the v6 migration couldn't repair it,
  // because `if (!c.active) c.active = 'Y'` leaves a truthy `true` alone. A coach stored that way
  // vanished from Salaries entirely and dropped out of salariesEarnedInMonth, understating payroll
  // on the Dashboard and the Monthly Report.
  return !(s === 'n' || s === 'no' || s === 'false' || s === '0' || s === 'inactive');
}

// v6.507: staff (role === 'staff') get a fixed salary but do NOT coach any sport, so they must
// NOT appear in a member-facing COACH filter (Members / Attendance / Schedule). A record with no
// role defaults to coach (legacy data). Salaries still list staff — they're paid — so this helper
// is used only where we mean "someone who actually coaches members".
function isCoachRole(c) { return !!c && (c.role || 'coach') !== 'staff'; }
// The coaches who teach (excludes staff), for member-facing coach dropdowns/filters.
function teachingCoaches() { return (state.coaches || []).filter(isCoachRole); }

// Hourly facility rates, self-healing. "Restore from backup" does Object.assign(state, incoming)
// and so bypasses the load-time migrations — a backup taken before facilityRates existed left
// state.settings.facilityRates undefined and the Rentals screen threw the moment it was opened.
const DEFAULT_FACILITY_RATES = { 'Football Court': 150, 'Boxing Room': 100, 'Swimming Pool': 200 };
function facilityRates() {
  if (!state.settings) state.settings = {};
  if (!state.settings.facilityRates) state.settings.facilityRates = { ...DEFAULT_FACILITY_RATES };
  return state.settings.facilityRates;
}
function facilityRate(f) { return Number(facilityRates()[f]) || 0; }

// Is this a real, bookable sport (so coach-eligibility should be enforced)?
// Summer-camp activities like "Art"/"Combat" aren't sports, so no constraint there.
function isBookableSport(sport) {
  if (!sport) return false;
  const names = ((state.settings && state.settings.sports) || []).map(s => s.name);
  if (names.includes(sport)) return true;
  return (typeof DEFAULT_SPORTS !== 'undefined' && DEFAULT_SPORTS.includes(sport));
}
// Does this coach teach the given sport? Coaches with no sports recorded are not
// over-blocked (returns true) so legacy data still works; admins should set sports.
// Private variants ("Kick Boxing (Private)") match coaches of the BASE sport.
function coachTeachesSport(coach, sport) {
  if (!coach) return false;
  if (!isBookableSport(sport) && !isBookableSport(baseSportName(sport))) return true;  // unknown / camp activity → no constraint
  const list = coach.sports || [];
  if (!list.length) return true;                   // sports not recorded → don't block
  return list.includes(sport) || list.includes(baseSportName(sport));
}
// Coaches eligible to be booked for `sport`: active AND teach it. `selectedId`
// (a currently-assigned coach) is always kept in the list — even if now inactive
// or no longer teaching — so existing bookings stay visible and aren't dropped.
//
// For a real bookable sport we list ONLY the people explicitly assigned to it, so
// choosing a Football coach never offers unrelated staff. The fallback to people
// with no sports recorded matters for activities nobody is assigned to (Summer
// Camp, a freshly-added sport) — without it that dropdown would be empty. (v6.335)
function coachesForSport(sport, selectedId) {
  const all = state.coaches || [];
  const active = all.filter(isCoachActive);
  const bookable = isBookableSport(sport) || isBookableSport(baseSportName(sport));
  let eligible;
  if (bookable) {
    eligible = active.filter(c => (c.sports || []).length && coachTeachesSport(c, sport));
    if (!eligible.length) eligible = active.filter(c => !(c.sports || []).length);
  } else {
    eligible = active.filter(c => coachTeachesSport(c, sport));  // camp activity → no constraint
  }
  if (selectedId != null && selectedId !== '') {
    const sel = all.find(c => String(c.id) === String(selectedId));
    if (sel && !eligible.some(c => c.id === sel.id)) eligible.unshift(sel);
  }
  return eligible;
}
// Dropdown label that flags why a kept-but-ineligible coach is shown.
function coachOptionLabel(c, sport) {
  if (!isCoachActive(c)) return escapeHtml(c.name) + ' (inactive)';
  if (isBookableSport(sport) && !coachTeachesSport(c, sport)) return escapeHtml(c.name) + ' (doesn\u2019t teach ' + escapeHtml(sport) + ')';
  return escapeHtml(c.name);
}

// Coaches selectable for NEW enrollments / renewals / registrations.
// Inactive coaches are excluded here, but still appear in search/filter dropdowns
// and remain attached to their historical records.
function activeCoaches() {
  return state.coaches.filter(isCoachActive);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  // Parse date-only strings as LOCAL midnight (append T00:00:00) so the day count
  // doesn't drift by one in non-UTC timezones — matching addDays/addBusinessDays.
  const target = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr + 'T00:00:00' : dateStr);
  if (isNaN(target)) return null;
  const today = new Date();
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

function lastRenewalDate(m) {
  if (!m) return null;
  const dates = [];
  for (const s of (m.subscriptions || [])) if (s.start) dates.push(s.start);
  for (const r of (m.renewals || [])) if (r.start) dates.push(r.start);
  if (!dates.length) return null;
  return dates.sort().slice(-1)[0];
}

// Did the member finish all classes in a package within < 1 month?
// Returns true if ANY subscription/renewal has attended === total (and >0)
// AND the start→end gap is under ~30 days.
// ─── Member helpers: age, tenure, birthday ──────────────────────────
// All accept ISO date strings (YYYY-MM-DD) and return display values.

// Years from birthdate to today. Returns null if birthdate missing/invalid.
function memberAge(birthdate) {
  if (!birthdate) return null;
  const b = new Date(birthdate);
  if (isNaN(b)) return null;
  const t = new Date(TODAY);
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  // Adjust if the birthday hasn't happened yet this year
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age >= 0 ? age : null;
}

// Approximate birthdate from a plain age (today minus N years) — used for quick
// age-only entry. memberAge() of the result reads back as exactly `age` today.
function ageToBirthdate(age) {
  const a = parseInt(age);
  if (!Number.isFinite(a) || a < 3 || a > 120) return '';
  const t = new Date(TODAY);
  return `${t.getFullYear() - a}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

// Returns true if the member's birthday falls in the given YYYY-MM (default: this month)
function isBirthdayInMonth(birthdate, monthKey) {
  if (!birthdate) return false;
  const m = (monthKey || currentMonth()).slice(5, 7);
  return birthdate.slice(5, 7) === m;
}

// Days until next birthday (positive number). null if no birthdate.
function daysUntilBirthday(birthdate) {
  if (!birthdate) return null;
  const b = String(birthdate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b) || isNaN(new Date(b + 'T00:00:00'))) return null;
  // Compare as plain YYYY-MM-DD strings. Building this year's birthday with
  // new Date(y, m, d) gave LOCAL midnight while new Date(TODAY) gave UTC midnight —
  // 3 hours apart in Qatar (UTC+3) — so a birthday that is TODAY looked like it had
  // already passed and rolled forward a full year (365 instead of 0).
  const md = b.slice(5);
  let next = TODAY.slice(0, 4) + '-' + md;
  if (next < TODAY) next = (Number(TODAY.slice(0, 4)) + 1) + '-' + md;
  // Feb 29 in a non-leap year: celebrate on Mar 1, as the old Date-based build did.
  if (isNaN(new Date(next + 'T00:00:00'))) next = next.slice(0, 4) + '-03-01';
  return daysBetween(TODAY, next);
}

// "1 year 4 months" since the given date. Returns null if missing/future.
function memberTenure(joinDateStr) {
  if (!joinDateStr) return null;
  const j = new Date(joinDateStr);
  if (isNaN(j)) return null;
  const t = new Date(TODAY);
  if (j > t) return null;
  let years = t.getFullYear() - j.getFullYear();
  let months = t.getMonth() - j.getMonth();
  if (t.getDate() < j.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years === 0 && months === 0) return 'New';
  if (years === 0) return `${months} month${months === 1 ? '' : 's'}`;
  if (months === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'} ${months} month${months === 1 ? '' : 's'}`;
}

function isCompleted(m) {
  if (!m) return false;
  // "Completed" means the member finished all classes of their CURRENT membership
  // early. It must reflect the current cycle only — a fully-attended PAST month
  // must not keep marking them Completed once they've renewed into a new, still-
  // in-progress subscription. So we look only at subscriptions belonging to the
  // current cycle (on/after the current start date), and require ALL of those to
  // be fully attended.
  const cycleStart = m.startDate || m.firstRegistration || null;
  const subs = [...(m.subscriptions || []), ...(m.renewals || [])];
  // Current-cycle subscriptions: those that start on/after the cycle start. If we
  // can't tell (no dates), fall back to the most recent subscription only.
  let current = cycleStart ? subs.filter(s => (s.start || '') >= cycleStart) : [];
  if (!current.length && subs.length) {
    // No cycle match — use the latest by start/end date as "current".
    current = [subs.slice().sort((a, b) => (a.start || a.end || '').localeCompare(b.start || b.end || '')).slice(-1)[0]];
  }
  if (!current.length) return false;
  // Every current subscription with a class plan must be fully attended, and at
  // least one must actually have a plan (so a 0-class row doesn't count).
  let sawPlan = false;
  for (const s of current) {
    const total = s.totalClasses, attended = s.attendedClasses;
    if (total == null || total <= 0) continue;     // no plan on this row → skip
    sawPlan = true;
    if (attended == null || attended < total) return false;   // still has classes left → not completed
  }
  return sawPlan;
}

// ── READY-TO-RENEW: sports a member FINISHED (all class-days attended) (v6.359) ──────
// Returns one row per sport whose LATEST subscription has attended ≥ its class limit, counted
// with LIVE attendance (the roll-call grid) — the SAME basis the member card shows — NOT the
// stored s.attendedClasses, which can lag and made a real 8/8 read "active". Taking the latest
// period per sport means an already-renewed sport (whose new period isn't full yet) drops off.
function completedSubsForRenewal(m) {
  if (!m || m.deleted) return [];
  const subs = (m.subscriptions || []).filter(s => s && s.activity && (s.status || '').toLowerCase() !== 'withdrawn');
  if (!subs.length) return [];
  const latestBySport = new Map();
  for (const s of subs) {
    const sp = s.activity;
    const prev = latestBySport.get(sp);
    if (!prev || (s.start || '') >= (prev.start || '')) latestBySport.set(sp, s);
  }
  const out = [];
  for (const [sport, sub] of latestBySport) {
    const total = (typeof subClassLimit === 'function') ? (parseInt(subClassLimit(sub)) || 0) : (parseInt(sub.totalClasses) || 0);
    if (!(total > 0)) continue;   // date-based membership (no class plan) → not a finished-classes case
    const win = (typeof subAttendanceWindow === 'function') ? subAttendanceWindow(m, sub) : { from: sub.start || null, to: sub.end || null };
    const live = (typeof liveAttendanceCount === 'function') ? liveAttendanceCount(m, sport, win.from, win.to) : { y: 0, total: 0 };
    const attended = (live && live.total > 0) ? live.y : (parseInt(sub.attendedClasses) || 0);
    if (attended >= total) {
      const expired = !!(sub.end && sub.end < (typeof TODAY !== 'undefined' ? TODAY : ''));
      out.push({ sport, sub, total, attended, expired, coachId: sub.coachId || null, coach: sub.coach || '' });
    }
  }
  return out;
}
// Distinct non-withdrawn/non-frozen members with at least one finished-classes sport (nav badge + KPI).
function membersReadyToRenew() {
  const out = [];
  for (const m of (state.members || [])) {
    if (m.deleted) continue;
    const st = (typeof memberStatus === 'function') ? memberStatus(m) : '';
    if (st === 'Withdrawn' || st === 'Frozen') continue;
    const done = completedSubsForRenewal(m);
    if (done.length) out.push({ m, done });
  }
  return out;
}
function completedRenewalCount() { return membersReadyToRenew().length; }
// Trash = recoverable soft-deleted records (archived members + deleted invoices). (v6.426)
function trashCount() {
  const m = (state.members || []).filter(x => x.deleted).length;
  const i = (state.invoices || []).filter(x => x.deleted).length;
  return m + i;
}
if (typeof window !== 'undefined') {
  window.completedSubsForRenewal = completedSubsForRenewal;
  window.membersReadyToRenew = membersReadyToRenew;
  window.completedRenewalCount = completedRenewalCount;
  window.trashCount = trashCount;
}

// True when a Summer Camp member has attended at least all the classes their camp
// duration allows (the class limit = totalClasses). Counts live attendance within
// the camp subscription's window. Only applies to camp; regular sports renew by date.
// Carry-forward credit for a renewal: when a member's previous period for a sport
// EXPIRED with classes still unused (paid but not attended), they may carry a few of
// those classes into their next membership. Capped at CARRY_FORWARD_MAX (2).
//   credit = min( unused classes on the latest finished sub for this sport, 2 )
// "unused" = totalClasses − classes actually attended (live), never negative.
const CARRY_FORWARD_MAX = 2;
function carryForwardCredit(m, sport) {
  if (!m || !Array.isArray(m.subscriptions)) return 0;
  // SUMMER CAMP never carries unattended days into a renewal — each camp package starts fresh
  // with its full class-days from the new start date, for existing and new members alike.
  // (v6.357, owner rule.) Other sports keep the ≤2-class carry.
  if (sport === SUMMER_CAMP) return 0;
  const subs = m.subscriptions.filter(s => (s.activity || '') === sport);
  if (!subs.length) return 0;
  // Use the most recent FINISHED period (expired/completed/ended) as the source.
  const today = (typeof TODAY !== 'undefined' ? TODAY : '9999-99-99');
  const finished = subs
    .filter(s => s.status !== 'active' || (s.end && s.end < today))
    .sort((a, b) => (a.end || '').localeCompare(b.end || ''));
  const src = finished.length ? finished[finished.length - 1] : null;
  if (!src) return 0;
  const total = parseInt(src.totalClasses) || 0;
  if (total <= 0) return 0;
  const liveAtt = (typeof liveAttendanceCount === 'function')
    ? (liveAttendanceCount(m, sport, src.start || null, src.end || null).y || 0) : 0;
  const attended = Math.max(parseInt(src.attendedClasses) || 0, liveAtt);
  const unused = Math.max(0, total - attended);
  return Math.min(CARRY_FORWARD_MAX, unused);
}

function campLimitReached(m) {
  if (!m || !Array.isArray(m.subscriptions)) return false;
  const campSubs = m.subscriptions.filter(s => (s.activity || '') === SUMMER_CAMP && s.status !== 'Withdrawn');
  if (!campSubs.length) return false;
  // A non-camp member (has other active sports) is not expired by camp alone.
  const hasOtherSport = (m.enrollments || []).some(e => e.sport && e.sport !== SUMMER_CAMP);
  if (hasOtherSport) return false;
  // Use the most recent camp subscription as the current one.
  const sorted = campSubs.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const sub = sorted[sorted.length - 1];
  // Limit = the camp class-day count for this duration (e.g. 1 week = 5), NOT the
  // calendar validity window. Prefer durationLabel/days; fall back to stored total.
  let limit = 0;
  if (sub.durationLabel && typeof campDaysForLabel === 'function') {
    const d = campDaysForLabel(sub.durationLabel);
    if (d) limit = campClassCount(d);
  }
  if (!limit) limit = parseInt(sub.totalClasses) || 0;
  if (limit <= 0) return false;
  // Count ONLY the attendance that falls inside THIS period's window [start, nextStart)
  // so days from earlier camp periods (or the next renewal's boundary day) don't leak in.
  const idx = sorted.indexOf(sub);
  const winStart = sub.start || null;
  const nextStart = (idx >= 0 && sorted[idx + 1]) ? sorted[idx + 1].start : null;
  // End the window the day BEFORE the next period starts (exclusive boundary), else
  // use the sub's own end.
  let winEnd = sub.end || null;
  // day BEFORE next start (exclusive boundary). addDays reads LOCAL date parts, so Qatar
  // (UTC+3) never shifts the day back the way new Date(local)+toISOString() would. (v6.373)
  if (nextStart) winEnd = addDays(nextStart, -1);
  let attended = 0;
  if (typeof liveAttendanceCount === 'function') {
    const live = liveAttendanceCount(m, SUMMER_CAMP, winStart, winEnd);
    attended = (live && live.total > 0) ? live.y : (parseInt(sub.attendedClasses) || 0);
  } else {
    attended = parseInt(sub.attendedClasses) || 0;
  }
  return attended >= limit;
}

// Derived display status: 'Completed' | 'Active' | 'Expired'
// Completed members are still ACTIVE (current), just finished their package early.
function memberStatus(m) {
  if (!m) return 'Expired';
  // Withdrawn is a terminal, explicitly-set state (refunded & left) — trust it.
  if (m.status === 'Withdrawn') return 'Withdrawn';
  // Transferred: the member moved their membership(s) to someone else and has no
  // sports of their own left. Terminal, explicitly-set (cleared if they re-enroll).
  if (m.status === 'Transferred' && !((m.enrollments || []).length)) return 'Transferred';
  // Frozen takes priority: freeze pauses the membership and shifts the expiry,
  // so a frozen member is never considered Expired even if their original
  // expiry slipped past today.
  if (m.currentFreezeUntil && TODAY <= m.currentFreezeUntil) return 'Frozen';
  // Derive Expired from data — don't trust the stored status field. This fixes
  // the case where status was set once (e.g. on import) and never updated as
  // the expiry date passed.
  if (m.expiryDate && m.expiryDate < TODAY) return 'Expired';
  // Camp class limit: once a Summer Camp member has attended all the classes their
  // duration allows, they've COMPLETED the camp (even if their validity window hasn't
  // ended yet). If the window itself has passed, the expiry check above already
  // returned 'Expired'. Uses live attendance so it reflects the roll-call grid.
  if (campLimitReached(m)) return 'Completed';
  // If the stored status explicitly says Expired and we have no expiryDate
  // to argue otherwise, respect it (legacy data).
  if (!m.expiryDate && m.status === 'Expired') return 'Expired';
  if (isCompleted(m)) return 'Completed';
  return 'Active';
}

// Is the member counted as active (Active, Completed, AND Frozen all count)?
// Frozen members are not Expired — they're paused but still paying customers.
// Returns the list of members NOT soft-deleted. Use for active-state operations
// (lists, dashboards, counts, exports). For looking up a specific member by id
// (e.g. to show their name on an old invoice), still use state.members.find()
// directly — historical references should resolve even for archived members.
function activeMembers() {
  return state.members.filter(m => !m.deleted);
}

function isActiveStatus(m) {
  return memberStatus(m) !== 'Expired';
}

// "Still on the books": not archived, not expired, and not withdrawn. isActiveStatus() alone
// treats a WITHDRAWN member (refunded and gone) as active, and says nothing about archiving —
// which is how archived and withdrawn members ended up inside dashboard headcounts.
// Matches memberCounts().current = active + completed + frozen.
function isCurrentMember(m) {
  if (!m || m.deleted) return false;
  const s = memberStatus(m);
  return s !== 'Expired' && s !== 'Withdrawn';
}

// ── Canonical member counts — ONE source of truth used by every page ──
// Always computed over non-archived members, with strict per-status buckets so
// the Dashboard, Members header, Reports, etc. can never disagree.
//   active/expired/completed/frozen/withdrawn = exact memberStatus buckets
//   current = memberships valid right now (active + completed + frozen)
//   total   = non-archived members
function memberCounts() {
  const list = activeMembers();
  const c = { active: 0, expired: 0, completed: 0, frozen: 0, withdrawn: 0, total: list.length };
  for (const m of list) {
    const s = memberStatus(m);
    if (s === 'Active') c.active++;
    else if (s === 'Expired') c.expired++;
    else if (s === 'Completed') c.completed++;
    else if (s === 'Frozen') c.frozen++;
    else if (s === 'Withdrawn') c.withdrawn++;
  }
  c.current = c.active + c.completed + c.frozen;
  // Archived (soft-deleted) members are excluded from activeMembers(), so they are counted
  // separately here and never fold into `total`, `current`, or any status above. (v6.339)
  c.archived = (state.members || []).filter(m => m && m.deleted).length;
  return c;
}

// ─── Payroll: compute monthly pay for a coach/staff member ───────────
//
// MODEL (as of v92):
//   Each invoice has `lineItems[]`, one per sport. Each lineItem has its own
//   `coachId` and `price`. Commission for coach C in month M = sum over all
//   lineItems where the line is credited to C:
//
//     base × (coach.rate / 100)
//
//   Credit rule (sport-switch handling):
//     For each lineItem on a Membership invoice for an Active member in month M,
//     find any sport-switch the member made in month M for this sport.
//     - If the member switched out of this sport in M AND has at least one
//       attended class (Y) for this sport in M BEFORE the switch → credit goes
//       to the OLD coach (lineItem.coachId).
//     - If they switched and NO attendance was marked → credit goes to the
//       NEW coach (the one in the current enrollment).
//     - No switch in this month → credit goes to lineItem.coachId as-is.
//
//   Staff (non-coach) earn fixedSalary only; their commissionRate is usually 0.
//
// Returns: { fixed, commissionBase, commissionRate, commissionAmount, gross, advance, net, paidStatus, paidDate, hasRevenue }
// ─── Attendance-based commission (opt-in) ──────────────────────────────────
// Default is the original "payment basis" (whole fee counts in the month the
// invoice was recorded). When state.settings.commissionBasis === 'attendance',
// a coach is instead paid PER CLASS ATTENDED, in the month attended. Paid-but-
// unattended classes show as "pending" and pay out either as they're attended
// or, when the membership ends, as a one-off true-up. Over a membership's life
// the two approaches sum to exactly the same fee × rate — only the timing moves.
// Falls back to payment basis for memberships with no class count and for
// sport-switch credit lines (kept on their existing behaviour for now).
// ── Per-coach salary exclusions ──
// Lets the club drop specific members from a coach's commission (e.g. the coach's
// own child, or a comped member). Stored as settings.salaryExclusions[coachId] = [memberIds].
function salaryExclusionSet(coachId) {
  const map = (state.settings && state.settings.salaryExclusions) || {};
  return new Set(map[coachId] || map[String(coachId)] || []);
}
function isExcludedFromCoachSalary(coachId, memberId) {
  if (memberId == null) return false;
  return salaryExclusionSet(coachId).has(memberId);
}
// Distinct members who contribute commissionable membership revenue to a coach.
function coachStudents(coachId) {
  const seen = new Map();
  for (const inv of (state.invoices || [])) {
    if (inv.deleted) continue;   // a voided invoice never put a student on a coach's roster
    if ((inv.category || 'Membership') !== 'Membership') continue;
    if (!inv.customerId) continue;
    const mem = state.members.find(x => x.id === inv.customerId);
    if (!mem) continue;
    const lineItems = commissionLineItems(inv, mem);
    for (const li of lineItems) {
      if (String(li.coachId) !== String(coachId)) continue;
      if (li.sport === SUMMER_CAMP) continue;
      const isSwitch = !!inv.switchCredit || inv.activityType === 'switch-credit' || (parseFloat(li.price) || 0) < 0;
      if (isSwitch) continue;
      if (!seen.has(mem.id)) seen.set(mem.id, { id: mem.id, name: mem.name || mem.nameArabic || ('#' + mem.id), sports: new Set(), deleted: !!mem.deleted });
      seen.get(mem.id).sports.add(li.sport);
    }
  }
  return Array.from(seen.values())
    .map(s => ({ id: s.id, name: s.name, deleted: s.deleted, sports: Array.from(s.sports) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Broadcast posts: advice / articles with audience + read receipts ───────
// Recipient keys: members are "m:<id>", coaches are "c:<id>". This keeps the
// audience list and read map compact and role-aware.
function postKey(role, id) { return (role === 'coach' ? 'c:' : 'm:') + id; }

function _activeMembersForPosts() {
  return (state.members || []).filter(m => !m.deleted);
}
function _memberInSport(m, sport) {
  if (!sport) return false;
  if (m.sport === sport) return true;
  return (m.enrollments || []).some(e => e.sport === sport);
}

// Resolve an audience descriptor into a flat list of recipient keys.
//  authorRole: 'coach' | 'admin'
//  audience: { scope:'all'|'sport'|'custom', sport, memberIds:[], coachIds:[], includeCoaches:bool }
function resolvePostRecipients(audience, authorRole, authorId) {
  audience = audience || { scope: 'all' };
  const keys = new Set();
  if (authorRole === 'coach') {
    // A coach can only reach THEIR OWN students (members).
    const mine = coachStudents(authorId).filter(s => !s.deleted);
    let list = mine;
    if (audience.scope === 'sport' && audience.sport) {
      list = mine.filter(s => (s.sports || []).includes(audience.sport));
    } else if (audience.scope === 'custom') {
      const pick = new Set((audience.memberIds || []).map(Number));
      list = mine.filter(s => pick.has(Number(s.id)));
    }
    list.forEach(s => keys.add(postKey('member', s.id)));
  } else {
    // Admin: members + (optionally) coaches, across the whole club.
    if (audience.scope === 'custom') {
      (audience.memberIds || []).forEach(id => keys.add(postKey('member', id)));
      (audience.coachIds || []).forEach(id => keys.add(postKey('coach', id)));
    } else {
      let members = _activeMembersForPosts();
      let coaches = (state.coaches || []).filter(c => !c.deleted);
      if (audience.scope === 'sport' && audience.sport) {
        members = members.filter(m => _memberInSport(m, audience.sport));
        coaches = coaches.filter(c => (state.invoices || []).some(i => !i.deleted
          && (i.coachId === c.id || (Array.isArray(i.lineItems) && i.lineItems.some(li => li.coachId === c.id && li.sport === audience.sport)))));
      }
      members.forEach(m => keys.add(postKey('member', m.id)));
      if (audience.includeCoaches) coaches.forEach(c => keys.add(postKey('coach', c.id)));
    }
  }
  return Array.from(keys);
}

// Is this post addressed to the given user?
function postIsForUser(post, role, id) {
  if (!post || id == null) return false;
  return (post.recipients || []).includes(postKey(role, id));
}
function postsForUser(role, id) {
  return (state.posts || [])
    .filter(p => postIsForUser(p, role, id))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function markPostRead(postId, role, id) {
  const p = (state.posts || []).find(x => x.id === postId);
  if (!p || id == null) return;
  if (!p.readBy || typeof p.readBy !== 'object') p.readBy = {};
  const k = postKey(role, id);
  if (!postIsForUser(p, role, id)) return;     // only recipients can be "read"
  if (!p.readBy[k]) { p.readBy[k] = TODAY; save(); }
}
function postReadCount(post) {
  const recips = (post.recipients || []).length;
  const read = Object.keys(post.readBy || {}).filter(k => (post.recipients || []).includes(k)).length;
  return { read, total: recips };
}
function unreadPostsForUser(role, id) {
  if (id == null) return [];
  const k = postKey(role, id);
  return postsForUser(role, id).filter(p => !(p.readBy || {})[k]);
}
function postRecipientName(key) {
  const parts = String(key).split(':');
  const id = Number(parts[1]);
  if (parts[0] === 'c') return (state.coaches.find(c => c.id === id) || {}).name || ('Coach #' + id);
  const m = state.members.find(x => x.id === id) || {};
  return m.name || m.nameArabic || ('Member #' + id);
}

// Create + store a broadcast post. Returns the post (or null if no recipients).
function publishPost(opts) {
  const audience = opts.audience || { scope: 'all' };
  const recipients = resolvePostRecipients(audience, opts.authorRole, opts.authorId);
  if (!recipients.length) return null;
  const post = {
    id: nextId(state.posts),
    authorRole: opts.authorRole,
    authorId: opts.authorId != null ? opts.authorId : null,
    authorName: opts.authorName || (opts.authorRole === 'admin' ? 'Admin' : 'Coach'),
    title: (opts.title || '').trim() || null,
    text: (opts.text || '').trim(),
    date: TODAY,
    audience,
    recipients,
    readBy: {},
    comments: [],
  };
  state.posts.push(post);
  if (typeof audit === 'function') audit('post.publish', `post:${post.id}`, `${opts.authorRole} -> ${recipients.length} recipients`);
  save();
  return post;
}

function _ymOf(d) { return d ? String(d).slice(0, 7) : null; }

// Count 'Y' marks for a member+sport in one month, bounded to a subscription's
// [start,end] window so renewals of the same sport don't double-count.
function attendedYInMonth(m, sport, monthKey, startDate, endDate, uptoDate) {
  const day = attendanceFor(m, monthKey, sport) || {};
  let y = 0;
  for (const d of Object.keys(day)) {
    if (day[d] !== 'Y') continue;
    const iso = monthKey + '-' + String(d).padStart(2, '0');
    if (uptoDate && iso > uptoDate) continue;          // settlement cap
    if (startDate || endDate) {
      if (startDate && iso < startDate) continue;
      if (endDate && iso > endDate) continue;
    }
    y++;
  }
  return y;
}

// Total 'Y' for a subscription across its whole life (bounded to [start,end]).
function attendedYForSub(m, sub, uptoDate) {
  const da = m && m.dailyAttendance;
  if (!da) return 0;
  // v6.434 — count over the SAME window the card uses (subAttendanceWindow), so a class
  // attended shortly after the validity date (within the paid allotment) counts as ATTENDED
  // for commission too — not left to the expiry true-up. Keeps card + salary consistent.
  const w = (typeof subAttendanceWindow === 'function') ? subAttendanceWindow(m, sub) : { from: sub.start, to: sub.end };
  let y = 0;
  for (const monthKey of Object.keys(da)) y += attendedYInMonth(m, sub.activity, monthKey, w.from, w.to, uptoDate);
  return y;
}

// The subscription (for a sport) that a given attendance date belongs to — so a
// renewed member's new present is counted against the NEW cycle, not the expired
// one. Prefers the sub whose [start,end] window CONTAINS the date; else the latest
// sub that started on/before it; else the earliest upcoming. Handles unordered
// subscription arrays (renewals aren't guaranteed to be pushed in date order).
function subForAttendanceDate(m, sport, dateISO) {
  const subs = (m && Array.isArray(m.subscriptions) ? m.subscriptions : []).filter(s => (s.activity || '') === sport);
  if (!subs.length) return null;
  const d = String(dateISO || '').slice(0, 10);
  const byStartDesc = (a, b) => String(b.start || '').localeCompare(String(a.start || ''));
  const containing = subs.filter(s => (!s.start || s.start <= d) && (!s.end || d <= s.end)).sort(byStartDesc);
  if (containing.length) return containing[0];
  const started = subs.filter(s => !s.start || s.start <= d).sort(byStartDesc);
  if (started.length) return started[0];
  return subs.slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))[0];
}

// ── Freeze-window helpers ─────────────────────────────────────────────────────
// Is the member paused (frozen) as of a specific date / month? Uses the freeze
// records (start–end) when present for MONTH-ACCURATE history (so a member frozen
// in July is NOT treated as frozen in June); falls back to the coarse
// currentFreezeUntil for legacy members that predate freeze records.
function memberFreezeSpans(m) {
  return (m && Array.isArray(m.freezes)) ? m.freezes.filter(f => f && f.start && f.end) : [];
}
function isMemberFrozenAt(m, dateStr) {
  if (!m || !dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  const spans = memberFreezeSpans(m);
  if (spans.length) return spans.some(f => d >= String(f.start).slice(0, 10) && d <= String(f.end).slice(0, 10));
  return !!(m.currentFreezeUntil && d <= String(m.currentFreezeUntil).slice(0, 10));
}
function isMemberFrozenInMonth(m, ym) {
  if (!m || !ym) return false;
  const spans = memberFreezeSpans(m);
  if (spans.length) return spans.some(f => String(f.start).slice(0, 7) <= ym && ym <= String(f.end).slice(0, 7));
  return !!(m.currentFreezeUntil && ym <= String(m.currentFreezeUntil).slice(0, 7));
}

// Link an invoice line to its subscription row (for class count + attendance).
function findSubForLine(m, inv, li) {
  if (!m) return null;
  const subs = m.subscriptions || [];
  // 1. Exact invoice-ref link — the strongest signal (a sub that names this invoice). Prefer a sub
  //    whose COACH also matches the line: after a coach transfer/switch ONE invoice can hold two lines
  //    for the same sport (old coach + new coach) that share the ref, so a coach-blind match would link
  //    BOTH lines to the first (old) sub and double-count its attendance. Fall back to sport-only. (v6.495)
  const byRef = subs.find(s => s.invoiceNumber === inv.ref && s.activity === li.sport && (li.coachId == null || String(s.coachId) === String(li.coachId)))
    || subs.find(s => s.invoiceNumber === inv.ref && s.activity === li.sport);
  if (byRef) return byRef;
  // 2. Candidates for this sport (preferring the line's coach).
  const sport = li.sport, coach = li.coachId;
  let cands = subs.filter(s => (s.activity || '') === sport && (coach == null || s.coachId == null || s.coachId === coach));
  if (!cands.length) cands = subs.filter(s => (s.activity || '') === sport);
  if (cands.length <= 1) return cands[0] || null;
  // 3. RENEWAL DISAMBIGUATION (v6.435). When a member has MORE THAN ONE package for the same
  //    sport+coach (a renewal), matching only by sport+coach returns the FIRST (oldest) sub — so a
  //    renewal invoice was mis-linked to the OLD package and the coach was PAID TWICE over the old
  //    window's attendance while the renewal window earned nothing. A renewal creates a new sub whose
  //    START equals the renewal invoice's date, so pick the sub by date: exact start, then same start
  //    month, then the window that contains the invoice date, then the closest start. Prefer START over
  //    END so a package that begins the same day another ends (07-20) links to the one that STARTS then.
  const invDate = String((li && li.billMonth) ? (li.billMonth + '-01') : (inv.date || (inv.month ? inv.month + '-01' : ''))).slice(0, 10);
  if (!invDate) return cands[0];
  const bm = invDate.slice(0, 7);
  const ms = d => { const t = Date.parse(d); return isNaN(t) ? null : t; };
  const iT = ms(invDate);
  return cands.find(s => String(s.start || '').slice(0, 10) === invDate)
      || cands.find(s => String(s.start || '').slice(0, 7) === bm)
      || cands.find(s => s.start && String(s.start).slice(0, 10) <= invDate && (!s.end || String(s.end).slice(0, 10) >= invDate))
      || (iT != null ? cands.slice().filter(s => ms(s.start) != null).sort((a, b) => Math.abs(ms(a.start) - iT) - Math.abs(ms(b.start) - iT))[0] : null)
      || cands[0];
}

// ── Coach commission eligibility for ONE membership invoice line ──────────────
// Club rule (payment-basis):
//   • COMPLETED member → FULL fee (they finished all their classes).
//   • EXPIRED member who attended at least one class → FULL fee (they forfeited
//     the classes they didn't take; the coach still earns the whole fee).
//   • EVERYONE ELSE — Active, Frozen, Expired-with-no-class, Withdrawn, … → the
//     commission is PRO-RATED by attendance: attended ÷ total × price. A member
//     with zero attended classes earns the coach nothing.
// Returns { eligible, base, attended, total, status, ratio, mode }.
function lineCommissionEligibility(m, inv, li, uptoDate) {
  const price = parseFloat(li && li.price) || 0;
  // SUMMER CAMP earns the coach NO commission — ever (camp has no coach).
  if (li && li.sport === SUMMER_CAMP) {
    return { eligible: false, excluded: true, base: 0, attended: 0, total: 0, status: m ? memberStatus(m) : 'Active', ratio: 0, mode: 'camp' };
  }
  const status = m ? memberStatus(m) : 'Active';
  let attended = 0, total = 0;
  if (m) {
    const sub = findSubForLine(m, inv, li);
    if (sub) {
      total = subClassLimit(sub) || (parseInt(sub.totalClasses) || 0);
      attended = attendedYForSub(m, sub, uptoDate || null);
      if (!attended && sub.attendedClasses) attended = parseInt(sub.attendedClasses) || 0;
    } else {
      // The line didn't map to a specific subscription (e.g. a membership invoice
      // with no sport on the line). Derive attended ÷ total from the member's own
      // subscription(s) — preferring this line's coach (and sport, if given) — so
      // non-completed members STILL pro-rate by attendance instead of defaulting
      // to full just because the line carries no class count.
      const subs = Array.isArray(m.subscriptions) ? m.subscriptions : [];
      const sport = li && li.sport;
      const wantCoach = (li && li.coachId != null) ? li.coachId : (inv && inv.coachId);
      const subTotal = s => (subClassLimit(s) || parseInt(s.totalClasses) || 0);
      let relevant = subs.filter(s => subTotal(s) > 0
        && (!sport || (s.activity || '') === sport)
        && (wantCoach == null || s.coachId == null || s.coachId === wantCoach));
      if (!relevant.length) relevant = subs.filter(s => subTotal(s) > 0 && (!sport || (s.activity || '') === sport));
      for (const s of relevant) {
        total += subTotal(s);
        let a = attendedYForSub(m, s, uptoDate || null);
        if (!a && s.attendedClasses) a = parseInt(s.attendedClasses) || 0;
        attended += a;
      }
      if (total === 0) {                       // member truly has no class plan
        total = parseInt(li && li.classes) || 0;
        attended = attendedClassesFor(m, sport);
      }
    }
  }
  // COMPLETED → full fee.
  if (status === 'Completed') {
    return { eligible: price > 0, excluded: false, base: price, attended, total, status, ratio: 1, mode: 'full' };
  }
  // EXPIRED with ≥1 attended class → full fee.
  if (status === 'Expired' && attended >= 1) {
    return { eligible: price > 0, excluded: false, base: price, attended, total, status, ratio: 1, mode: 'full' };
  }
  // EXPIRED with ZERO attendance → never showed up: exclude from the coach report.
  if (status === 'Expired') {
    return { eligible: false, excluded: true, base: 0, attended, total, status, ratio: 0, mode: 'expired-noshow' };
  }
  // FROZEN → the membership is PAUSED. The coach earns ONLY the classes the member
  // has ACTUALLY attended (pro-rated attended ÷ total); the remaining/deferred
  // portion is NOT paid until they return, or the freeze ends and they expire (then
  // it trues up to full via the Expired rules above). Crucially, unlike an Active
  // member, a FROZEN membership with NO class plan (total unknown) does NOT default
  // to the full fee — a paused flat membership earns 0 until it resolves.
  if (status === 'Frozen') {
    const fratio = total > 0 ? Math.min(1, attended / total) : 0;
    const fbase = price * fratio;
    return { eligible: fbase > 0, excluded: false, base: fbase, attended, total, status, ratio: fratio, mode: 'frozen' };
  }
  // Everyone else (Active, …) → pro-rate by attendance.
  // With no class total to divide by, there is nothing to pro-rate against → full fee.
  const ratio = total > 0 ? Math.min(1, attended / total) : 1;
  const base = price * ratio;
  return { eligible: base > 0, excluded: false, base, attended, total, status, ratio, mode: 'prorated' };
}

// ── Per-member commission rows (for the admin Member Commission report) ───────
// One row per (member, sport) membership line. Summer Camp lines and expired-
// with-zero-attendance lines are dropped (no coach commission). Pass a billing
// month ('2026-06') to scope, or '' / 'all' for every month.
function computeMemberCommissions(ym) {
  const all = !ym || ym === 'all';
  const invs = all
    ? state.invoices.filter(i => (i.category || 'Membership') === 'Membership' && !i.deleted)
    : monthInvoicesAny(ym).filter(i => (i.category || 'Membership') === 'Membership');   // line-month aware: include multi-month invoices
  const rows = [];
  for (const inv of invs) {
    const mem = inv.customerId ? state.members.find(x => x.id === inv.customerId) : null;
    if (mem && mem.deleted) continue;
    const lineItems = commissionLineItems(inv, mem);
    for (const li of lineItems) {
      if (!all && lineBillMonth(li, inv) !== ym) continue;   // per-line month (a sport added later bills in its own month)
      const elig = lineCommissionEligibility(mem, inv, li, null);
      if (elig.excluded) continue;                       // camp + expired-no-show
      const coachId = (li.coachId != null) ? li.coachId : inv.coachId;
      const coach = (coachId != null) ? state.coaches.find(c => c.id === coachId) : null;
      const rate = coach ? (parseFloat(coach.rate) || 0) : 0;
      const sub = mem ? findSubForLine(mem, inv, li) : null;
      rows.push({
        invoiceId: inv.id, ref: inv.ref || '', month: lineBillMonth(li, inv),
        memberId: mem ? mem.id : null,
        memberName: mem ? (mem.name || '') : (inv.customerName || '—'),
        nameArabic: mem ? (mem.nameArabic || '') : '',
        sport: li.sport || '—',
        coachId,
        coachName: (coachId != null) ? coachName(coachId) : '—',
        start: (sub && sub.start) || inv.date || (inv.month ? inv.month + '-01' : ''),
        expiry: (mem && mem.expiryDate) || (sub && sub.end) || '',
        paid: parseFloat(li.price) || 0,
        attended: elig.attended || 0,
        total: elig.total || 0,
        status: elig.status,
        mode: elig.mode,
        ratio: elig.ratio || 0,
        commissionBase: elig.base || 0,
        rate,
        commission: (elig.base || 0) * rate / 100,
      });
    }
  }
  rows.sort((a, b) =>
    (a.memberName || '').localeCompare(b.memberName || '') ||
    (a.sport || '').localeCompare(b.sport || ''));
  return rows;
}

// Effective commission line items for an invoice. Usually the invoice's own
// lineItems — but a legacy / family invoice sometimes lumps SEVERAL enrolled sports
// into ONE sport-less line under a single coach. That hides the other coaches and
// defeats per-class attendance (their classes never get counted, and a frozen member
// dumps the whole fee on the wrong coach). When a line has no sport AND the member's
// per-sport ENROLLMENTS sum to that same total, expand into one line per enrolment
// (its own sport, coach, price, class count) so EVERY coach is credited and
// attendance is honoured. Revenue is unchanged — the parts sum to the invoice total.
function commissionLineItems(inv, mem) {
  const raw = (Array.isArray(inv.lineItems) && inv.lineItems.length)
    ? inv.lineItems
    : [{ sport: inv.sport, coachId: inv.coachId, price: inv.amount || 0 }];
  if (raw.some(li => li && li.sport)) return raw;                  // any per-sport info → trust the invoice
  const enr = (mem && Array.isArray(mem.enrollments)) ? mem.enrollments.filter(e => e && e.sport && (Number(e.price) || 0) > 0) : [];
  if (enr.length < 2) return raw;                                  // single sport → nothing to split
  const enrSum = enr.reduce((s, e) => s + (Number(e.price) || 0), 0);
  const invTot = raw.reduce((s, li) => s + (Number(li.price) || 0), 0);
  if (enrSum <= 0 || invTot <= 0) return raw;
  // Safety: the flat line must plausibly bundle THESE enrolments — its coach is one of
  // the enrolment coaches (or unset), and the totals are in the same ballpark — so we
  // never re-attribute an invoice whose enrolments have since changed.
  const flatCoaches = new Set(raw.map(li => li.coachId));
  const coachMatch = raw.some(li => li.coachId == null) || enr.some(e => flatCoaches.has(e.coachId));
  const ratio = invTot / enrSum;
  if (!coachMatch || ratio < 0.6 || ratio > 1.6) return raw;
  // Scale enrolment prices to the invoice total so revenue attribution stays exact
  // (e.g. a 50 QAR registration add-on spreads across the sports).
  const scale = invTot / enrSum;
  return enr.map(e => ({ sport: e.sport, coachId: e.coachId, price: (Number(e.price) || 0) * scale, classes: e.classes, _expandedFromEnrollment: true }));
}

// v6.484 — AUTOMATIC SWITCH SPLIT. When a member switches sport, the profit must split: the OLD coach
// keeps commission for the classes ATTENDED, the NEW coach gets the transferred share — WITHOUT any
// manual "Switch reconciliation". The switch always records `m.sportSwitches[]` with a locked snapshot
// (attendedByOld / aShare / bShare / from&toCoachId / switchMonth). We read that snapshot directly at
// compute time (no data mutation), so a switch done "the old way" (source sub left active, payment
// never split) is corrected LIVE. Only UNRECONCILED switches are synthesized here — a reconciled one
// already has its switch-credit invoice + switchedAwayTo cap, so synthesizing would double-count.
function _unreconciledSwitchesFor(mem) {
  if (!mem || !Array.isArray(mem.sportSwitches)) return [];
  return mem.sportSwitches.filter(sw => {
    if (!sw || !sw.snapshot || sw.distributed) return false;
    const fromSub = (mem.subscriptions || []).find(s => (s.activity || '') === sw.fromSport && String(s.coachId) === String(sw.fromCoachId));
    if (!fromSub || (fromSub.status || '').toLowerCase() === 'completed' || fromSub.switchedAwayTo) return false;  // already reconciled → invoice handles it
    // Guard against double-credit: skip if a switch-credit invoice already carries the destination share.
    const hasSwitchInvoice = (state.invoices || []).some(iv => !iv.deleted && iv.customerId === mem.id
      && (iv.switchCredit || iv.activityType === 'switch-credit') && Array.isArray(iv.lineItems)
      && iv.lineItems.some(l => l.sport === sw.toSport && (Number(l.price) || 0) > 0));
    return !hasSwitchInvoice;
  });
}
function _memberSwitchedAwayFrom(mem, sport, coachId) {
  return _unreconciledSwitchesFor(mem).some(sw => sw.fromSport === sport && String(sw.fromCoachId) === String(coachId));
}

// Returns { base, pendingBase, lines, pendingLines } for a coach in a month.
function computeAttendanceCommission(coachId, monthKey, uptoDate) {
  let base = 0, pendingBase = 0;
  const lines = [];        // earned this month (attended classes + expiry true-up)
  const pendingLines = []; // not-yet-earned remainder on still-active memberships
  // Commission start-date cutoff: ignore invoices/subscriptions dated before this.
  const commStart = (state.settings && state.settings.commissionStartDate) || '';
  for (const inv of state.invoices) {
    // A DELETED (voided / duplicate-removed) invoice must NEVER pay commission — this is why a
    // soft-deleted duplicate or a removed "Test" invoice kept showing on the salary report and the
    // coach kept being credited for it. The by-payment path (coachEarnings) already skipped these;
    // the attendance path was missing it. (v6.380 — money-critical)
    if (inv.deleted) continue;
    if ((inv.category || 'Membership') !== 'Membership') continue;
    const mem = inv.customerId ? state.members.find(x => x.id === inv.customerId) : null;
    if (mem && mem.deleted) continue;   // archived member → treated as not existing
    const lineItems = commissionLineItems(inv, mem);
    for (const li of lineItems) {
      // v6.518: String()-compare — a coachId is a NUMBER on the line but can arrive as a STRING from
      // the caller (or vice-versa, e.g. Zakaria's 16-digit id). A strict !== then skipped every line
      // and the coach silently earned 0. (Same string/number trap fixed across the switch code.)
      if (String(li.coachId) !== String(coachId)) continue;
      if (mem && isExcludedFromCoachSalary(coachId, mem.id)) continue;   // excluded from this coach's salary
      if (li.sport === SUMMER_CAMP) continue;             // camp earns no commission
      const fee = parseFloat(li.price) || 0;
      const isSwitch = !!inv.switchCredit || inv.activityType === 'switch-credit' || fee < 0;
      // v6.483 (SWITCH PROFIT-SPLIT): a switch-credit's NEGATIVE line is a flat-fee "clawback" of the
      // SOURCE coach's supposed overpayment. But commission here is ATTENDANCE-based — the source coach
      // was never credited the full fee (they earn per attended class) — so deducting it wrongly leaves
      // the coach with a negative for a member they actually taught ("why did my coach get −90 when the
      // member switched?"). Skip the clawback: the source coach keeps their ATTENDED share (their
      // switched-away sub is capped to attended below, so the switched-out classes never true-up), and
      // the POSITIVE switch line still pays the NEW coach their transferred share. Profit is split, no
      // one is deducted. Works for existing switches too (recomputed live — no data migration).
      // v6.486: only skip a SWITCH-CREDIT's negative clawback — NOT every negative line (a deliberate
      // manual deduction/refund line on a normal invoice must still reduce the coach's commission).
      if ((inv.switchCredit || inv.activityType === 'switch-credit') && fee < 0) continue;
      let sub = findSubForLine(mem, inv, li);
      let totalClasses = (sub && parseFloat(sub.totalClasses)) || 0;
      // FALLBACK: a sport added to a member without a linked subscription row still
      // has an ENROLLMENT carrying its class count + coach. Synthesize a sub from it so
      // the coach still earns / pends by attendance — otherwise a class-based line with
      // no sub falls into the month-gated flat-fee path and the member silently vanishes
      // from the coach's salary report. (Root cause: adding a sport via the pricing panel
      // created the invoice line + enrolment but no subscription.)
      if (totalClasses <= 0 && !isSwitch && mem && Array.isArray(mem.enrollments)) {
        const enr = mem.enrollments.find(e => (e.sport || '') === li.sport
          && (e.coachId == null || li.coachId == null || e.coachId === li.coachId)
          && (parseInt(e.classes) || 0) > 0);
        if (enr) {
          totalClasses = parseInt(enr.classes) || 0;
          const _start = (sub && sub.start) || inv.date || (inv.month ? inv.month + '-01' : TODAY);
          const _end = (sub && sub.end) || (enr.validity ? addDays(_start, parseInt(enr.validity) || 0) : null);
          sub = { activity: li.sport, coachId: li.coachId, start: _start, end: _end, totalClasses, _synthFromEnrollment: true };
        }
      }
      // Apply the commission start-date cutoff: use the subscription start if present,
      // else the invoice date. Anything dated before the cutoff earns no commission.
      const anchor = (sub && sub.start) || inv.date || inv.month || '';
      if (commStart && anchor && String(anchor).slice(0, 10) < commStart) continue;
      const memberName = mem ? mem.name : (inv.customerName || '— deleted —');
      // Member IDENTITY for the duplicate-collapse pass below. Keyed on the real member id (never the
      // name) so two different people who happen to share a name are NEVER merged; deleted/no-member
      // invoices fall back to a stable per-customer / per-name token. (v6.372)
      const mid = mem ? ('m' + mem.id) : (inv.customerId != null ? 'c' + inv.customerId : 'n:' + memberName);
      const status = mem ? memberStatus(mem) : '—';

      // SETTLE-PENDING: an admin paid this membership's commission IN FULL in
      // `settledMonth` (even though classes weren't finished). After that month the
      // coach earns nothing more for it, and it never pends or trues-up — so the
      // pending is not carried forward. `sub.commissionSettled` holds the month.
      const settledMonth = sub && sub.commissionSettled ? String(sub.commissionSettled).slice(0, 7) : null;
      const _refMonth = uptoDate ? String(uptoDate).slice(0, 7) : monthKey;
      if (settledMonth && _refMonth && _refMonth > settledMonth) continue;

      // A FROZEN membership is paused: the coach earns nothing for it while frozen —
      // the fee is DEFERRED (pending) until the member returns, or the freeze ends and
      // they expire (then it trues up). Computed here so BOTH the flat-fee fallback and
      // the per-class path below honour it. Only a genuinely EXPIRED membership trues up.
      const frozen = mem && (uptoDate ? isMemberFrozenAt(mem, uptoDate) : isMemberFrozenInMonth(mem, monthKey));

      // Fallback to PAYMENT basis: switch credits, and memberships with no class count.
      if (isSwitch || totalClasses <= 0) {
        const inWindow = uptoDate ? (inv.date && inv.date <= uptoDate) : (lineBillMonth(li, inv) === monthKey);
        if (inWindow) {
          if (frozen) {
            // Frozen member → DEFER the whole line while frozen; the coach is NOT paid now. This
            // covers a flat membership (no class plan) AND a switch credit (v6.437) — a frozen
            // member's switch is NOT cashed out mid-freeze, it pends until they return (the
            // settlement path then pays it once they're no longer frozen). The paired negative
            // deduction on the source coach pends too, so both sides stay balanced.
            pendingBase += fee;
            pendingLines.push({ memberName, mid, sport: li.sport, classes: null, amountBase: fee,
              start: sub?.start || inv.date, end: sub?.end || null,
              attended: mem ? attendedClassesFor(mem, li.sport) : 0, total: totalClasses || null, status,
              note: isSwitch ? 'frozen — switch credit pending until return' : 'frozen — pending until return / expiry' });
          } else {
            base += fee;
            lines.push({ memberName, mid, sport: li.sport, kind: isSwitch ? 'switch' : 'flat',
              classes: null, amountBase: fee, start: sub?.start || inv.date, end: sub?.end || null,
              attended: mem ? attendedClassesFor(mem, li.sport) : 0, total: totalClasses || null, status,
              note: isSwitch ? 'switch credit' : 'no class count — full fee' });
          }
        }
        continue;
      }

      const perClass = fee / totalClasses;
      const ref = uptoDate || TODAY;
      // v6.483 (SWITCH PROFIT-SPLIT): a sub the member SWITCHED AWAY FROM will never get more
      // attendance — its unattended classes went to the new coach (the +switch line pays them). So the
      // source coach earns ONLY the classes actually attended: no pending, no end-of-term true-up of the
      // switched-out classes. This is what makes the split come out right (A = attended, B = transferred)
      // instead of A being paid the whole fee and then clawed back.
      const switchedAway = !!(sub && sub.switchedAwayTo) || (!!sub && !!mem && _memberSwitchedAwayFrom(mem, sub.activity, sub.coachId));

      if (uptoDate) {
        // ── SETTLEMENT (cumulative): everything earned from the start through the date ──
        const attended = attendedYForSub(mem, sub, uptoDate);
        const remaining = Math.max(0, totalClasses - attended);
        // v6.486: a FROZEN member's currently-paused membership must not true-up (pay out remaining)
        // while frozen — BUT the freeze must NOT resurrect a PRIOR period that already ended + trued-up
        // in an earlier month (the "frozen member's finished renewal re-appears as pending" bug:
        // Hessa's 18 Jun→25 Jul period trued-up in July, then showed pending again in August). So the
        // freeze only suppresses "ended" for a period ending in the current window or later.
        const ended = sub.end && sub.end <= uptoDate && !(frozen && _ymOf(sub.end) >= String(uptoDate || TODAY).slice(0, 7));
        if (attended > 0) {
          base += perClass * attended;
          lines.push({ memberName, mid, sport: li.sport, kind: 'attended', classes: attended, perClass,
            amountBase: perClass * attended, start: sub.start, end: sub.end, attended, total: totalClasses, status });
        }
        if (ended && remaining > 0 && attended > 0 && !settledMonth && !switchedAway) {   // expired WITH ≥1 attended → pay the rest in full
          base += perClass * remaining;
          lines.push({ memberName, mid, sport: li.sport, kind: 'trueup', classes: remaining, perClass,
            amountBase: perClass * remaining, start: sub.start, end: sub.end, attended, total: totalClasses, status,
            note: 'membership ended — remaining paid out' });
        }
        // ZERO-ATTENDANCE rule (v6.445): a member who attended NONE of their classes and then expired
        // earns the coach NOTHING — no attended line, no true-up — so they don't appear in the salary
        // report at all. (An ACTIVE member with 0 attendance still pends below; they may yet attend.)
        if (!ended && remaining > 0 && !settledMonth && !switchedAway) {  // still active → remainder pending (unless settled in full)
          pendingBase += perClass * remaining;
          pendingLines.push({ memberName, mid, sport: li.sport, classes: remaining, perClass,
            amountBase: perClass * remaining, start: sub.start, end: sub.end, attended, total: totalClasses, status });
        }
      } else {
        // ── MONTHLY: per-month attended + true-up only in the month the sub ended ──
        // v6.434 — count per-month attendance over the fill-up-to-paid window (same as the card),
        // so a class attended just after the validity date is paid as ATTENDED in its month.
        const _cw = (typeof subAttendanceWindow === 'function') ? subAttendanceWindow(mem, sub) : { from: sub.start, to: sub.end };
        const attMonth = attendedYInMonth(mem, li.sport, monthKey, _cw.from, _cw.to);
        if (attMonth > 0) {
          base += perClass * attMonth;
          lines.push({ memberName, mid, sport: li.sport, kind: 'attended', classes: attMonth, perClass,
            amountBase: perClass * attMonth, start: sub.start, end: sub.end, attended: attMonth, total: totalClasses, status });
        }
        const endMonth = _ymOf(sub.end);
        // v6.486: freeze must not resurrect a PRIOR period that already ended+trued-up (see settlement
        // path above) — only suppress "ended" for a period ending this month or later.
        const ended = sub.end && sub.end < TODAY && !(frozen && _ymOf(sub.end) >= monthKey);
        const attendedAll = attendedYForSub(mem, sub);
        const remaining = Math.max(0, totalClasses - attendedAll);
        if (endMonth === monthKey && ended && remaining > 0 && attendedAll > 0 && !settledMonth && !switchedAway) {   // v6.445: only if ≥1 attended
          base += perClass * remaining;
          lines.push({ memberName, mid, sport: li.sport, kind: 'trueup', classes: remaining, perClass,
            amountBase: perClass * remaining, start: sub.start, end: sub.end, attended: attendedAll, total: totalClasses, status,
            note: 'membership ended — remaining paid out' });
        }
        if (!ended && remaining > 0 && !settledMonth && !switchedAway) {
          pendingBase += perClass * remaining;
          pendingLines.push({ memberName, mid, sport: li.sport, classes: remaining, perClass,
            amountBase: perClass * remaining, start: sub.start, end: sub.end, attended: attendedAll, total: totalClasses, status });
        }
      }
    }
  }

  // ── AUTO SWITCH SPLIT — the DESTINATION coach's transferred share (v6.484) ───────────────────
  // For any UNRECONCILED switch INTO this coach, credit the locked snapshot bShare. The SOURCE coach
  // is already capped to their attended classes above (via _memberSwitchedAwayFrom), so this completes
  // the split — old coach = attended, new coach = the remainder — with no manual reconciliation and no
  // data mutation. Skipped once the switch is reconciled (then its switch-credit invoice pays bShare).
  for (const mem of state.members) {
    if (!mem || mem.deleted) continue;
    if (typeof isExcludedFromCoachSalary === 'function' && isExcludedFromCoachSalary(coachId, mem.id)) continue;
    for (const sw of _unreconciledSwitchesFor(mem)) {
      if (String(sw.toCoachId) !== String(coachId)) continue;
      if (sw.toSport === SUMMER_CAMP) continue;                        // camp earns no commission
      const bShare = Math.round((Number(sw.snapshot.bShare) || 0) * 100) / 100;
      if (bShare <= 0) continue;
      const swMonth = sw.snapshot.switchMonth || (sw.date ? String(sw.date).slice(0, 7) : monthKey);
      if (commStart && swMonth && String(swMonth) < String(commStart).slice(0, 7)) continue;
      const inWindow = uptoDate ? (sw.date && sw.date <= uptoDate) : (swMonth === monthKey);
      if (!inWindow) continue;
      // v6.486: a FROZEN member's switched-in share is NOT cashed out mid-freeze — it PENDS until they
      // return, exactly like the invoice-based switch-credit path (mirrors the frozen defer for
      // consistency). Otherwise the new coach would be paid the transfer immediately while frozen.
      const _frozenNow = (typeof (uptoDate ? isMemberFrozenAt : isMemberFrozenInMonth) === 'function')
        ? (uptoDate ? isMemberFrozenAt(mem, uptoDate) : isMemberFrozenInMonth(mem, monthKey)) : false;
      const _line = { memberName: mem.name || '—', mid: 'm' + mem.id, sport: sw.toSport, kind: 'switch',
        classes: null, amountBase: bShare, start: sw.date || null, end: null,
        status: (typeof memberStatus === 'function' ? memberStatus(mem) : '—'),
        note: _frozenNow ? 'switched-in share (auto split) — frozen, pending' : 'switched-in share (auto split)' };
      if (_frozenNow) { pendingBase += bShare; pendingLines.push(_line); }
      else { base += bShare; lines.push(_line); }
    }
  }

  // ── DUPLICATE-COLLAPSE (v6.372) ─────────────────────────────────────────────────────────────
  // Commission lines are built one-per-invoice-line-item, so a DUPLICATE INVOICE (or a repeated line
  // item on one invoice) yields two IDENTICAL lines for the SAME membership — which would pay the
  // coach twice and inflate the commission base (the "Fares Hamdan ×2" the owner spotted). Collapse
  // exact repeats to a SINGLE paid line. This is money-SAFE: it mutates NO stored data (invoices are
  // untouched and still surface in Finance → Duplicate Invoices for cleanup); it only stops the coach
  // being paid twice for one thing. The key is the member ID + sport + kind + period + amount — never
  // the NAME, so two different people who share a name are never merged, and a member genuinely can't
  // buy the identical package for the exact same window twice. The dropped repeats are KEPT in the
  // list (flagged `_dupIgnored`, `_origAmount` preserved, amountBase zeroed) so the report can show
  // them struck-through and the admin can see the source data needs a cleanup.
  const _collapseDupes = (list) => {
    const seen = new Map();
    let removed = 0;
    for (const l of list) {
      if (!l || l._dupIgnored) continue;
      const amt = Math.round((Number(l.amountBase) || 0) * 100);
      const key = [l.mid || '', l.sport || '', l.kind || '', l.start || '', l.end || '', amt].join('|');
      if (seen.has(key)) {
        removed += Number(l.amountBase) || 0;
        l._dupIgnored = true;
        l._origAmount = Number(l.amountBase) || 0;
        l._dupTwin = seen.get(key);   // the kept line it duplicates
        l.amountBase = 0;             // no longer counted toward base / pay
      } else {
        seen.set(key, l);
      }
    }
    return removed;
  };
  base -= _collapseDupes(lines);
  pendingBase -= _collapseDupes(pendingLines);

  return { base, pendingBase, lines, pendingLines };
}

// The duplicate commission lines that computeAttendanceCommission ALREADY excluded from pay
// (flagged `_dupIgnored`). The report uses this to show a reassuring "auto-excluded" note instead of
// re-detecting — the money is corrected at source, this is just transparency. (v6.372)
function excludedDuplicateLines(lines) {
  const out = [];
  for (const l of (lines || [])) if (l && l._dupIgnored) out.push({ line: l, extra: Number(l._origAmount) || 0 });
  return out;
}
if (typeof window !== 'undefined') window.excludedDuplicateLines = excludedDuplicateLines;

// A REAL WhatsApp glyph (inline SVG). The 💬 emoji renders on Windows as a plain speech balloon
// that reads as "…" / a generic menu — not "send a WhatsApp". Inline SVG so it needs no network
// (the CSP/offline-safe rule) and inherits the button's colour via currentColor. (v6.370)
function waIconSvg(size) {
  const s = size || 14;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" style="vertical-align:-2px;flex:0 0 auto" aria-hidden="true" focusable="false">`
    + `<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.85 9.85 0 0 0 12.04 2zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z"/>`
    + `<path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.48-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z"/></svg>`;
}
if (typeof window !== 'undefined') window.waIconSvg = waIconSvg;

// ── DOUBLE-PAY GUARD (v6.369) ───────────────────────────────────────────────────────
// Commission lines are built one-per-invoice-line-item, so a DUPLICATE INVOICE in the data
// produces two identical lines and the coach gets paid TWICE for the same membership (it also
// inflates the commission base and the reported revenue). Find lines that repeat on the same
// member + sport + kind + period + amount, so the Salaries screen can WARN before anyone is paid.
// Deliberately DOES NOT merge or change the math: a member genuinely can buy the same sport twice,
// so the admin decides in Finance → Duplicate Invoices. Returns [{ line, count, extra }] where
// `extra` is the over-counted base (the amount the coach would be overpaid).
function duplicateCommissionLines(lines) {
  const seen = new Map();
  for (const l of (lines || [])) {
    if (!l) continue;
    const amt = Math.round((Number(l.amountBase) || 0) * 100);
    const k = [l.memberName || '', l.sport || '', l.kind || '', l.start || '', l.end || '', amt].join('|');
    const prev = seen.get(k);
    if (prev) { prev.count++; prev.extra += (Number(l.amountBase) || 0); }
    else seen.set(k, { line: l, count: 1, extra: 0 });
  }
  const out = [];
  for (const v of seen.values()) if (v.count > 1) out.push(v);
  return out;
}
if (typeof window !== 'undefined') window.duplicateCommissionLines = duplicateCommissionLines;

// Mark every ACTIVE membership that still has pending (unattended) commission for a
// coach as "settled in full" as of `monthKey`. After this, those memberships earn the
// coach nothing further and never carry a pending remainder — used when an admin pays
// a coach's full salary (incl. pending) in one month. Returns how many were settled.
function settleCoachPendingCommission(coachId, monthKey) {
  let count = 0;
  const commStart = (state.settings && state.settings.commissionStartDate) || '';
  for (const inv of (state.invoices || [])) {
    if (!inv || inv.deleted || (inv.category || 'Membership') !== 'Membership') continue;
    const mem = inv.customerId ? state.members.find(x => x.id === inv.customerId) : null;
    if (!mem || mem.deleted) continue;
    const lines = commissionLineItems(inv, mem);
    for (const li of lines) {
      if (String(li.coachId) !== String(coachId)) continue;
      if (li.sport === SUMMER_CAMP) continue;
      const sub = findSubForLine(mem, inv, li);
      if (!sub || sub.commissionSettled) continue;
      const anchor = (sub.start) || inv.date || inv.month || '';
      if (commStart && anchor && String(anchor).slice(0, 10) < commStart) continue;
      const total = (subClassLimit(sub) || parseInt(sub.totalClasses) || 0);
      if (total <= 0) continue;
      const remaining = Math.max(0, total - attendedYForSub(mem, sub));
      const ended = sub.end && sub.end < TODAY;
      const frozen = isMemberFrozenAt(mem, TODAY);
      if (ended || frozen || remaining <= 0) continue;   // only active memberships with a real pending remainder
      sub.commissionSettled = monthKey;
      count++;
    }
  }
  return count;
}

// ─── Coach salary payments (multi-payment ledger) ────────────────────────────
// A 'paid' salary record can now hold MULTIPLE payments (different dates/methods)
// toward a TARGET (the agreed payout — defaults to the computed net, but an admin
// may override it to add a bonus or deduct). These helpers normalise that and stay
// backward-compatible with the old single-payment record (paidDate/payMethod/
// snapshotNet, no payments[]).
function salaryPayments(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.payments)) return rec.payments;
  // Legacy single-payment record (has paidDate, no payments[]). Its snapshotNet was
  // the NET at pay time, which can be NEGATIVE (the coach was over-advanced) — a
  // negative "payment" is nonsensical and corrupts paidTotal, so clamp at 0.
  if (rec.paidDate != null) return [{ id: 'legacy', amount: Math.max(0, rec.snapshotNet != null ? Number(rec.snapshotNet) : 0), date: rec.paidDate, method: rec.payMethod || 'cash', _legacy: true }];
  return [];
}
function salaryPaidTotal(rec) { return salaryPayments(rec).reduce((s, p) => s + (Number(p.amount) || 0), 0); }
// The agreed payout: explicit override, else a POSITIVE legacy snapshot, else the
// live computed net. A stale/negative snapshotNet (over-advanced legacy record) is
// ignored so the target reflects what the coach is actually owed now.
function salaryTarget(rec, netFallback) {
  if (rec && rec.target != null && rec.target !== '') return Number(rec.target);
  if (rec && rec.snapshotNet != null && Number(rec.snapshotNet) > 0.005) return Number(rec.snapshotNet);
  return netFallback;
}

function computeMonthlyPay(coachId, monthKey, uptoDate) {
  const c = state.coaches.find(x => x.id === coachId);
  if (!c) return null;
  // Settlement mode: when an "up to date" is given, we report that date's month
  // counting only what happened on or before it (a partial-month settlement).
  if (uptoDate) monthKey = String(uptoDate).slice(0, 7);
  const fixedFull = parseFloat(c.fixedSalary) || 0;
  const commissionRate = parseFloat(c.rate) || 0;
  // v6.526: a coach can be pinned to their OWN commission basis (e.g. a private coach = 'payment')
  // which overrides the club-wide toggle for them only. Blank/absent → fall back to the club setting.
  const coachBasis = (c.commissionBasis === 'attendance' || c.commissionBasis === 'payment') ? c.commissionBasis : '';
  const basis = coachBasis || (state.settings && state.settings.commissionBasis) || 'payment';
  let commissionBase = 0;
  let commissionPendingBase = 0;   // attendance basis only: paid-but-unattended remainder
  let attendanceLines = null;      // { lines, pendingLines } for the per-member report

  if (basis === 'attendance') {
    // Pay per class attended in the month; remainder pends / trues-up at expiry.
    const r = computeAttendanceCommission(coachId, monthKey, uptoDate);
    commissionBase = r.base;
    commissionPendingBase = r.pendingBase;
    attendanceLines = { lines: r.lines, pendingLines: r.pendingLines };
  } else {
    // Payment basis (v6.525): commission = the coach's % of the amount ACTUALLY PAID in the month, at
    // FULL rate (attendance is irrelevant), with NO carry-forward. Each payment is counted in the month
    // of its OWN date, and split across its invoice's coach lines in proportion to each line's fee — so
    // a coach earns their share of the cash collected that month, nothing more, nothing deferred. (Was:
    // the whole CHARGED fee in the billing month, whether or not it had been collected — which over-paid
    // when a member hadn't fully paid yet. Owner rule for private coaches: pay on what came in.)
    // In settlement mode (uptoDate) sum payments dated on/before the date.
    const commStartP = (state.settings && state.settings.commissionStartDate) || '';
    for (const inv of state.invoices) {
      // A DELETED / voided invoice earns the coach NOTHING (v6.449).
      if (inv.deleted) continue;
      const cat = inv.category || 'Membership';
      if (cat !== 'Membership') continue;
      if (inv.customerId) {
        const mem = state.members.find(x => x.id === inv.customerId);
        if (mem && mem.deleted) continue;   // archived member → treated as not existing
      }
      const memForLine = inv.customerId ? state.members.find(x => x.id === inv.customerId) : null;
      const lineItems = commissionLineItems(inv, memForLine);
      // This coach's ELIGIBLE fee on the invoice, and the invoice's TOTAL fee (incl. camp), so a
      // payment can be attributed to the coach in the right proportion.
      let coachFee = 0, totalFee = 0;
      for (const li of lineItems) {
        const price = parseFloat(li.price) || 0;
        totalFee += price;
        if (li.sport === SUMMER_CAMP) continue;                       // camp earns no commission
        if (String(li.coachId) !== String(coachId)) continue;
        if (isExcludedFromCoachSalary(coachId, inv.customerId)) continue;
        const elig = lineCommissionEligibility(memForLine, inv, li, uptoDate);
        if (!elig.excluded) coachFee += price;
      }
      if (coachFee <= 0 || totalFee <= 0) continue;
      const shareRatio = coachFee / totalFee;
      // Sum the payments received in the target month (or up to the settle date), the coach's share.
      for (const p of (inv.payments || [])) {
        const pAmt = Number(p.amount) || 0;
        if (pAmt <= 0) continue;
        const pDate = p.date || (p.month ? p.month + '-01' : (inv.date || ''));
        const pKey = p.month || String(pDate).slice(0, 7);
        if (commStartP && pDate && String(pDate).slice(0, 10) < commStartP) continue;
        if (uptoDate) { if (!pDate || String(pDate).slice(0, 10) > uptoDate) continue; }   // cumulative up to date
        else if (monthKey && pKey !== monthKey) continue;                                   // this month's collections only
        commissionBase += pAmt * shareRatio;
      }
    }
  }

  // Fixed salary: full month normally; prorated by days when settling to a date.
  let fixed = fixedFull;
  if (uptoDate && fixedFull > 0) {
    const y = parseInt(uptoDate.slice(0, 4), 10), mo = parseInt(uptoDate.slice(5, 7), 10);
    const day = parseInt(uptoDate.slice(8, 10), 10);
    const daysInMonth = new Date(y, mo, 0).getDate();
    fixed = Math.round(fixedFull * day / daysInMonth * 100) / 100;
  }

  const commissionAmount = commissionBase * commissionRate / 100;
  const commissionPending = commissionPendingBase * commissionRate / 100;
  const gross = fixed + commissionAmount;
  const advanceRecords = (state.salaries || [])
    .filter(s => s.coachId === coachId && s.kind === 'advance' && (uptoDate ? s.month <= monthKey : s.month === monthKey))
    .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  // Salary payments logged on the Expenses screen (category "Salary") attributed
  // to this coach also count as money already handed over this month.
  const expensePaid = (state.expenses || [])
    .filter(e => !e.deleted && !e._salaryAutoExpense && isSalaryCategory(e.category) && String(e.coachId) === String(coachId)
      && (uptoDate ? (e.month || String(e.date || '').slice(0, 7)) <= monthKey : (e.month || String(e.date || '').slice(0, 7)) === monthKey))
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const advance = advanceRecords + expensePaid;
  // Carry-forward of a prior month's over-advance (negative net). A 'carry' record
  // { kind:'carry', fromMonth, month:<target>, amount } moves an over-advance out of
  // its source month (CREDIT — settles that month's negative net back toward 0) and
  // into a later month (DEBIT — behaves like an opening advance there). Symmetric, so
  // the club's real cash total is unchanged and the "settle up to a date" cumulative
  // view stays exact (credit + debit cancel once both months are in scope).
  const carryRecords = (state.salaries || []).filter(s => s.coachId === coachId && s.kind === 'carry');
  const carriedOut = carryRecords
    .filter(s => uptoDate ? s.fromMonth <= monthKey : s.fromMonth === monthKey)
    .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const carriedIn = carryRecords
    .filter(s => uptoDate ? s.month <= monthKey : s.month === monthKey)
    .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
  const paidRecord = (state.salaries || [])
    .find(s => s.coachId === coachId && s.month === monthKey && s.kind === 'paid');

  const net = gross - advance + carriedOut - carriedIn;
  // Multi-payment settlement: sum the payments made toward the agreed target.
  const payments = salaryPayments(paidRecord);
  const paidTotal = salaryPaidTotal(paidRecord);
  const paidTarget = paidRecord ? salaryTarget(paidRecord, net) : net;
  // Settlement tolerance: a coach is paid in WHOLE QAR (the payment box defaults to a
  // rounded amount), but a commission target is often fractional (e.g. 30% × 391 =
  // 117.3). Treat any gap under 1 QAR as fully settled so paying the default amount
  // marks the month PAID instead of sticking at "partial · 0.30 remaining".
  const PAY_EPS = 0.5;
  const _rem = paidTarget - paidTotal;
  const paidRemaining = _rem > PAY_EPS ? _rem : 0;
  let paidStatus = 'pending';
  if (paidRecord) {
    // ZERO-VALUE SETTLEMENT (v6.383): a coach who earned nothing this month (target 0) can be
    // settled with a recorded 0 QAR payment. Without this, `paidTotal > 0.005` never matched and
    // the month stayed "Not paid yet" forever even after the admin settled it.
    if (paidTarget <= 0.005 && payments.length > 0) paidStatus = 'paid';
    else if (paidTotal >= paidTarget - PAY_EPS && paidTotal > 0.005) paidStatus = 'paid';
    else if (paidTotal > 0.005) paidStatus = 'partial';   // some — but not all — paid
    else paidStatus = 'pending';
  }
  const paidDate = payments.length ? payments[payments.length - 1].date : (paidRecord ? paidRecord.paidDate : null);

  return {
    coachId, month: monthKey,
    uptoDate: uptoDate || null,
    fixedFull,
    name: c.name,
    role: c.role || 'coach',
    fixed,
    commissionBase,
    commissionRate,
    commissionAmount,
    basis,
    commissionPendingBase,
    commissionPending,
    attendanceLines,
    gross,
    advance,
    advanceRecords,
    expensePaid,
    carriedOut,
    carriedIn,
    net,
    salaryRecord: paidRecord || null,
    payments,
    paidTotal,
    paidTarget,
    paidRemaining,
    paidDate,
    paidStatus,
    hasRevenue: commissionBase > 0 || fixed > 0,
  };
}

// DEPRECATED (v95): formerly resolved switch-month credits at runtime.
// Now the switch action itself rewrites the lineItem prices and creates a
// new switch-credit invoice for the new coach's share. Kept as a no-op for
// any callers that might still reference it.
function resolveCreditedCoach(m, li, monthKey) {
  return li.coachId || null;
}

// Apply a freeze to a member. Shifts expiryDate forward by `days`, records the
// freeze in m.freezes[], and sets m.currentFreezeUntil so status reflects it.
// `opts` may carry { start, end } to freeze a specific date range (e.g. 18 Jun →
// 1 Sep) instead of starting today; if given, `days` is derived from the range.
function applyFreeze(m, days, reason, opts) {
  opts = opts || {};
  let startDate = opts.start || TODAY;
  let endDate, frozenDays;
  if (opts.start && opts.end) {
    endDate = opts.end;
    frozenDays = Math.max(1, daysBetween(opts.start, opts.end));
  } else {
    frozenDays = parseInt(days);
    if (!m || !frozenDays || frozenDays < 1) return;
    endDate = addDays(startDate, frozenDays);
  }
  if (!m) return;
  if (!m.freezes) m.freezes = [];
  m.freezes.push({
    id: 'fr_' + Date.now(),
    days: frozenDays,
    start: startDate,
    end: endDate,
    reason: reason || '',
    appliedAt: new Date().toISOString(),
    previousExpiry: m.expiryDate,
  });
  m.currentFreezeUntil = endDate;
  // Shift expiry forward by the freeze duration.
  if (m.expiryDate) m.expiryDate = addDays(m.expiryDate, frozenDays);
  // Shift each subscription's end too so per-sport expiry stays in sync.
  for (const sub of (m.subscriptions || [])) {
    if (sub.end) sub.end = addDays(sub.end, frozenDays);
  }
  // Extend each enrolment's validity window by the freeze days so the stored
  // validity period reflects the pause too (keeps expiry recomputation correct).
  for (const e of (m.enrollments || [])) {
    if (e.validity != null && e.validity !== '') e.validity = (parseInt(e.validity) || 0) + frozenDays;
  }
  stampUpdate(m);
  audit('member.freeze', `member:${m.id}`, `Froze ${m.name} for ${frozenDays} day(s) (${startDate} → ${endDate})${reason ? ' · ' + reason : ''}`, {
    name: m.name, memberId: m.id, membershipNo: m.membershipNo || m.qid || '', mobile: m.phone || '',
    new: { frozenUntil: endDate, days: frozenDays, reason: reason || '' },
  });
}

// The membership validity in days — the longest enrolment validity, falling back
// to the current cycle length. Used to size the self-service freeze allowance.
function memberValidityDays(m) {
  let v = 0;
  for (const e of (m?.enrollments || [])) v = Math.max(v, parseInt(e.validity) || 0);
  if (!v && m?.startDate && m?.expiryDate) v = daysBetween(m.startDate, m.expiryDate);
  return v || 30;
}

// Self-service freeze allowance: ONE WEEK (7 days) per 30 days of validity
// (30d→7, 60d→14, 90d→21 …), tracked per current membership cycle (renewing
// resets it). Members may freeze MULTIPLE times as long as the total stays
// within the allowance; each freeze can be any number of days up to whatever
// allowance remains.
const FREEZE_DAYS_PER_MONTH = 7;
function freezeAllowance(m) {
  const validityDays = memberValidityDays(m);
  const months = Math.max(1, Math.round(validityDays / 30));   // 1-month plans → 1 week
  const allowanceDays = months * FREEZE_DAYS_PER_MONTH;
  const cycleStart = m?.startDate || m?.firstRegistration || '0000-00-00';
  let usedDays = 0;
  let freezeCount = 0;
  for (const f of (m?.freezes || [])) {
    if ((f.start || '') >= cycleStart) { usedDays += (parseInt(f.days) || 0); freezeCount++; }
  }
  const remainingDays = Math.max(0, allowanceDays - usedDays);
  return { validityDays, months, allowanceDays, usedDays, remainingDays, freezeCount, cycleStart, perRequestCap: remainingDays };
}

function nextId(arr) {
  // COLLISION-SAFE new-record id. A plain max+1 makes two devices that create a
  // record at the same moment pick the SAME id — and since each record is its own
  // Firestore doc written with merge:true, the two then fuse into one document and
  // one person's record is silently lost. So we mint a TIME-BASED unique number
  // (ms × 1000 + random), always kept above any existing id. It stays numeric,
  // sortable and a safe JS integer, so every id lookup / reference keeps working.
  const list = Array.isArray(arr) ? arr : [];
  const maxExisting = list.length ? Math.max(0, ...list.map(x => Number(x && x.id) || 0)) : 0;
  const unique = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  return unique > maxExisting ? unique : maxExisting + 1;
}

// Generate the next sequential invoice ref. Derives from the maximum existing
// numeric portion of any "INV####" ref in state.invoices, so we never collide
// with imported refs and never depend on a hardcoded starting counter.
// Falls back to INV0001 if nothing exists yet.
function nextInvoiceRef() {
  let maxN = 0;
  for (const inv of (state.invoices || [])) {
    if (!inv.ref) continue;
    const m = String(inv.ref).match(/(\d+)\s*$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `INV${String(maxN + 1).padStart(4, '0')}`;
}

// ─── Searchable member picker ──────────────────────────────────────
// Renders a text input that filters members as you type, backed by a hidden
// input (id=`${id}`) holding the selected member id — so existing code that
// reads $('#id').value keeps working unchanged.
function memberPickerHtml(id, { placeholder = '— none —', selectedId = null } = {}) {
  const sel = selectedId != null ? state.members.find(m => m.id === selectedId) : null;
  return `
    <div class="member-picker" data-picker="${id}" style="position:relative">
      <input type="hidden" id="${id}" value="${sel ? sel.id : ''}" />
      <input type="text" id="${id}-search" autocomplete="off" placeholder="${escapeHtml(placeholder)}"
        value="${sel ? escapeHtml(sel.name) : ''}" data-placeholder="${escapeHtml(placeholder)}" style="width:100%" />
      <div id="${id}-list" class="member-picker-list" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:50;max-height:240px;overflow:auto;background:var(--surface,#1b2130);border:1px solid var(--border,#2a3142);border-radius:8px;margin-top:2px;box-shadow:0 8px 24px rgba(0,0,0,.4)"></div>
    </div>`;
}

// Wire a member picker after its DOM is in place.
function bindMemberPicker(id, { placeholder = '— none —', allowNone = true } = {}) {
  const hidden = document.getElementById(id);
  const search = document.getElementById(id + '-search');
  const list = document.getElementById(id + '-list');
  if (!hidden || !search || !list) return;

  function renderList(q) {
    const query = (q || '').trim().toLowerCase();
    let matches = state.members;
    if (query) {
      matches = state.members.filter(m => {
        const hay = [m.name, m.nameArabic, m.phone, m.phone2, m.qid].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(query);
      });
    }
    matches = matches.slice(0, 60);
    const allSportsOf = m => {
      const set = new Set([m.sport, ...((m.enrollments || []).map(e => e.sport)), ...((m.subscriptions || []).map(s => s.activity))].filter(Boolean));
      return Array.from(set);
    };
    const noneRow = allowNone ? `<div class="mp-opt" data-mid="" style="padding:8px 12px;cursor:pointer;color:var(--text-mute)">${escapeHtml(placeholder)}</div>` : '';
    list.innerHTML = noneRow + (matches.length
      ? matches.map(m => {
          const sports = allSportsOf(m);
          const sportLabel = sports.length > 1
            ? sports.map(s => `<span style="display:inline-block;background:var(--surface-2);border-radius:4px;padding:1px 6px;margin-left:4px;font-size:10px">${escapeHtml(s)}</span>`).join('')
            : `<span class="text-mute" style="font-size:10px">${escapeHtml(sports[0] || '')}</span>`;
          return `
          <div class="mp-opt" data-mid="${m.id}" style="padding:8px 12px;cursor:pointer;display:flex;align-items:center;gap:8px">
            <span style="font-weight:600">${escapeHtml(m.name)}</span>
            ${m.nameArabic ? `<span class="text-dim" dir="rtl" style="font-size:12px">${escapeHtml(m.nameArabic)}</span>` : ''}
            <span style="margin-left:auto;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:2px">${sportLabel}</span>
          </div>`;
        }).join('')
      : `<div style="padding:10px 12px;color:var(--text-mute);font-size:12px">No members match "${escapeHtml(q)}"</div>`);
    list.querySelectorAll('.mp-opt').forEach(o => {
      o.addEventListener('mouseenter', () => o.style.background = 'rgba(91,141,239,.15)');
      o.addEventListener('mouseleave', () => o.style.background = '');
      o.addEventListener('mousedown', e => {
        e.preventDefault();
        const mid = o.dataset.mid;
        hidden.value = mid;
        const m = mid ? state.members.find(x => x.id === parseInt(mid)) : null;
        search.value = m ? m.name : '';
        list.style.display = 'none';
      });
    });
  }

  search.addEventListener('focus', () => { renderList(''); list.style.display = 'block'; });
  search.addEventListener('input', () => { hidden.value = ''; renderList(search.value); list.style.display = 'block'; });
  search.addEventListener('blur', () => { setTimeout(() => { list.style.display = 'none'; }, 150); });
}

// ─── Pagination helper ──────────────────────────────────────────────
// Renders a control bar with "showing X–Y of Z" + page-size dropdown + prev/next.
// Call buildPagination(state, totalCount) → returns HTML string for the bar.
// The caller slices its rows with paginate(rows, pgState).
function makePager(initialSize = 10) {
  return { page: 1, size: initialSize };
}

function paginate(rows, pg) {
  if (pg.size === 'all') return rows;
  // Clamp the current page into range first. Otherwise, if a filter/deletion
  // shrinks the result set below the current page (e.g. you were on page 5 and now
  // there's only 1 page), the slice would fall past the end and show an empty table.
  const totalPages = Math.max(1, Math.ceil(rows.length / pg.size));
  if (pg.page > totalPages) pg.page = totalPages;
  if (pg.page < 1) pg.page = 1;
  const start = (pg.page - 1) * pg.size;
  return rows.slice(start, start + pg.size);
}

function paginationBar(pg, totalCount, id) {
  const size = pg.size === 'all' ? totalCount : pg.size;
  const totalPages = pg.size === 'all' ? 1 : Math.max(1, Math.ceil(totalCount / pg.size));
  if (pg.page > totalPages) pg.page = totalPages;
  const start = totalCount === 0 ? 0 : (pg.size === 'all' ? 1 : (pg.page - 1) * pg.size + 1);
  const end = pg.size === 'all' ? totalCount : Math.min(pg.page * pg.size, totalCount);
  return `
    <div class="pagination-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 4px 4px;flex-wrap:wrap">
      <div class="text-dim" style="font-size:12px">
        Showing <strong>${start}–${end}</strong> of <strong>${totalCount}</strong> records
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="display:flex;align-items:center;gap:6px;font-size:12px" class="text-dim">
          <span>Rows per page</span>
          <select data-pager-size="${id}" class="btn ghost" style="padding:4px 8px">
            <option value="10" ${pg.size===10?'selected':''}>10</option>
            <option value="20" ${pg.size===20?'selected':''}>20</option>
            <option value="50" ${pg.size===50?'selected':''}>50</option>
            <option value="all" ${pg.size==='all'?'selected':''}>All</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="btn ghost sm" data-pager-prev="${id}" ${pg.page<=1?'disabled':''} style="${pg.page<=1?'opacity:.4;cursor:not-allowed':''}">‹ Prev</button>
          <span class="text-dim" style="font-size:12px;min-width:80px;text-align:center">Page ${pg.page} / ${totalPages}</span>
          <button class="btn ghost sm" data-pager-next="${id}" ${pg.page>=totalPages?'disabled':''} style="${pg.page>=totalPages?'opacity:.4;cursor:not-allowed':''}">Next ›</button>
        </div>
      </div>
    </div>
  `;
}

// Wire up the pager controls. onChange is called after page/size changes.
function bindPagination(id, pg, totalCount, onChange) {
  const sizeSel = document.querySelector(`[data-pager-size="${id}"]`);
  if (sizeSel) sizeSel.addEventListener('change', e => {
    pg.size = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
    pg.page = 1;
    onChange();
  });
  const prev = document.querySelector(`[data-pager-prev="${id}"]`);
  if (prev) prev.addEventListener('click', () => { if (pg.page > 1) { pg.page--; onChange(); } });
  const next = document.querySelector(`[data-pager-next="${id}"]`);
  if (next) next.addEventListener('click', () => {
    const totalPages = pg.size === 'all' ? 1 : Math.max(1, Math.ceil(totalCount / pg.size));
    if (pg.page < totalPages) { pg.page++; onChange(); }
  });
}

// Convenience wrapper used by Products / Sales / Rentals: takes the container
// element id (e.g. 'prod-pagination'), renders the bar into it, and wires the
// controls. The logical pager id is the element id without the '-pagination'
// suffix ('prod', 'sale', 'rent'), which is what paginationBar/bindPagination key on.
function renderPagination(elId, pg, totalCount, onChange) {
  const logical = String(elId).replace(/-pagination$/, '');
  const el = document.getElementById(elId);
  if (el) el.innerHTML = paginationBar(pg, totalCount, logical);
  bindPagination(logical, pg, totalCount, onChange);
}

let toastTimer;
// ─── AUDIT LOG ─────────────────────────────────────────────────────
// Records significant actions so admin can trace "who changed what, when".
// Lightweight: just an in-array log capped at 1000 entries (oldest dropped).
// Hook into delete/restore, withdraw, refunds, expense edits, salary marks,
// member edits — any action that affects money or membership state.
// ── Current-user identity + record stamping ─────────────────────
// Short login id (email/username) and full display name of whoever is acting.
function currentUserId() { return (state.user && (state.user.username || state.user.email)) || 'system'; }
function currentUserName() { return (state.user && state.user.name) || currentUserId(); }
// Stamp a record with who/when last modified it (and created it the first time),
// so the UI can show "last updated by X at Y" without opening the Audit Log.
// Used across members, invoices, payments, attendance, freeze and user accounts.
function stampUpdate(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  const now = new Date().toISOString();
  if (!rec.createdAt) { rec.createdAt = now; rec.createdBy = currentUserId(); rec.createdByName = currentUserName(); }
  rec.updatedAt = now;
  rec.updatedBy = currentUserId();
  rec.updatedByName = currentUserName();
  return rec;
}
// Human "last updated by X · <date>" line for a stamped record (or '' if none).
function lastUpdatedLine(rec) {
  if (!rec || !rec.updatedAt) return '';
  const who = rec.updatedByName || rec.updatedBy || 'unknown';
  return `${who} · ${typeof fmtDateTime === 'function' ? fmtDateTime(rec.updatedAt) : rec.updatedAt}`;
}

function audit(action, target, summary, details = null) {
  if (!Array.isArray(state.auditLog)) state.auditLog = [];
  const tgt = String(target || '');
  const colon = tgt.indexOf(':');
  const recType = colon >= 0 ? tgt.slice(0, colon) : (action || '').split('.')[0];
  const recId = colon >= 0 ? tgt.slice(colon + 1) : '';
  const d = details || {};
  state.auditLog.push({
    id: 'al_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    ts: new Date().toISOString(),
    user: currentUserId(),                         // login id / email
    userName: currentUserName(),                   // full display name
    role: (typeof currentRole === 'function' ? currentRole() : (state.user?.role || 'admin')),
    action,                                        // e.g. 'member.archive', 'invoice.payments'
    module: (action || '').split('.')[0],          // e.g. 'member', 'invoice', 'attendance'
    target,                                        // e.g. 'member:42', 'invoice:107'
    recType, recId,                                // parsed from target
    recordName: d.name || d.recordName || d.member || d.memberName || d.customer || d.customerName || '',
    summary,                                       // short human description
    oldValue: (d.old !== undefined ? d.old : (d.oldValue !== undefined ? d.oldValue : null)),
    newValue: (d.new !== undefined ? d.new : (d.newValue !== undefined ? d.newValue : null)),
    details,                                       // optional object with extra context
  });
  // NO cap / trimming: the audit trail is IMMUTABLE and append-only (req #8) —
  // dropping oldest entries would delete synced Firestore docs, which the
  // immutable-audit security rule now forbids anyway. Entries live forever.
}

// ─── CREATE-AUDIT for invoices & expenses (traceability for the revenue stream) ──
// Invoices are the main revenue stream, so every new invoice/expense gets a
// 'invoice.create' / 'expense.create' audit entry — CENTRALLY, on save(), so no
// creation site can be missed. If a record ever goes missing, the audit log still
// proves it existed (id, ref, amount, who, when) so it can be reconstructed.
// Records that ARRIVED from another device via the sync merge are pre-marked
// "known" (see mergeRemoteIntoState) so we never attribute them to this device.
function _seedKnownRecIds() {
  window.__knownRecIds = {
    invoices: new Set((state.invoices || []).map(r => String(r.id))),
    expenses: new Set((state.expenses || []).map(r => String(r.id))),
  };
}
function _auditNewRecords() {
  if (typeof audit !== 'function') return;
  if (window.__allowEmptySave) return;          // a restore / clear-all — not real creations
  if (!window.__knownRecIds) { _seedKnownRecIds(); return; }   // first pass → seed baseline, don't audit history
  const K = window.__knownRecIds;
  for (const inv of (state.invoices || [])) {
    const id = String(inv.id);
    if (K.invoices.has(id)) continue;
    K.invoices.add(id);
    const mem = inv.customerId ? (state.members || []).find(m => m.id === inv.customerId) : null;
    const who = mem ? mem.name : (inv.customerName || '—');
    const amt = (typeof invoiceTotal === 'function') ? invoiceTotal(inv) : (Number(inv.amount) || 0);
    try { audit('invoice.create', 'invoice:' + id, `Created ${inv.ref || ('#' + id)} · ${fmt(amt)} QAR · ${who}`, { recordName: who, amount: amt, ref: inv.ref, category: inv.category }); } catch (_) {}
  }
  for (const e of (state.expenses || [])) {
    const id = String(e.id);
    if (K.expenses.has(id)) continue;
    K.expenses.add(id);
    try { audit('expense.create', 'expense:' + id, `Created expense · ${fmt(Number(e.amount) || 0)} QAR · ${e.category || 'Others'}`, { amount: Number(e.amount) || 0, category: e.category, description: e.description }); } catch (_) {}
  }
}

// Common status/toast messages → Arabic. This lets short, exact-match toasts
// localize centrally without editing every call site. Interpolated messages
// (with ${...}) still need t() at the call site. Extend this map as needed.
const TOAST_AR = {
  'Member not found': 'العضو غير موجود',
  'Invoice not found': 'الفاتورة غير موجودة',
  'Coach not found': 'المدرب غير موجود',
  'Subscription not found': 'الاشتراك غير موجود',
  'Name required': 'الاسم مطلوب',
  'Admins only': 'للمسؤولين فقط',
  'Admins or receptionists only': 'للمسؤولين أو موظفي الاستقبال فقط',
  'Only an admin can perform this action': 'هذا الإجراء متاح للمسؤول فقط',
  'Only an admin can clear the schedule': 'مسح الجدول متاح للمسؤول فقط',
  'Only an admin can freeze a membership': 'تجميد الاشتراك متاح للمسؤول فقط',
  'No active members selected': 'لم يتم اختيار أعضاء نشطين',
  'No selected members have phone numbers': 'لا توجد أرقام هواتف للأعضاء المحددين',
  'Customer has no phone number on file': 'لا يوجد رقم هاتف مسجّل للعميل',
  'Enter a valid amount': 'أدخل مبلغاً صحيحاً',
  'Email format is invalid': 'صيغة البريد الإلكتروني غير صحيحة',
  'Birthdate cannot be in the future': 'تاريخ الميلاد لا يمكن أن يكون في المستقبل',
  'Use at least 6 characters': 'استخدم 6 أحرف على الأقل',
  'Walk-in customer name required': 'اسم العميل المباشر مطلوب',
  'This member has no sports enrolled yet': 'هذا العضو غير مسجّل في أي رياضة بعد',
  'This member has no invoices': 'لا توجد فواتير لهذا العضو',
  'No attendance recorded yet for this member': 'لا يوجد حضور مسجّل لهذا العضو بعد',
  'The end date must be after the start date': 'يجب أن يكون تاريخ الانتهاء بعد تاريخ البداية',
  'Tick at least 2 invoices to merge': 'حدّد فاتورتين على الأقل للدمج',
  'Merge failed': 'فشل الدمج',
  'Nothing to recalculate': 'لا يوجد ما يُعاد حسابه',
  'Nothing to re-sync': 'لا يوجد ما تتم إعادة مزامنته',
  'Popup blocked — please allow popups': 'تم حظر النافذة المنبثقة — يرجى السماح بالنوافذ المنبثقة',
  'Allow pop-ups to print': 'اسمح بالنوافذ المنبثقة للطباعة',
  'Image export failed — try the PDF instead': 'فشل تصدير الصورة — جرّب ملف PDF بدلاً منها',
  'Refreshed': 'تم التحديث',
  'Saved': 'تم الحفظ',
  'Member saved': 'تم حفظ العضو',
  'Trial deleted': 'تم حذف الحصة التجريبية',
  'Trials exported': 'تم تصدير الحصص التجريبية',
  'Templates restored to defaults': 'تمت استعادة القوالب الافتراضية',
  '✓ Password updated': '✓ تم تحديث كلمة المرور',
  '✓ Cash collection deleted': '✓ تم حذف التحصيل النقدي',
  '💬 Reminder templates saved': '💬 تم حفظ قوالب التذكير',
  'Write some advice first': 'اكتب بعض الملاحظات أولاً',
  'Summer Camp schedule reset': 'تمت إعادة ضبط جدول المعسكر الصيفي',
  'Summer Camp prices reset to defaults': 'تمت إعادة أسعار المعسكر الصيفي إلى الافتراضي',
  'Demo data loaded': 'تم تحميل البيانات التجريبية',
};

function toast(msg, type = 'success') {
  if (typeof msg === 'string' && getLang() === 'ar' && TOAST_AR[msg]) msg = TOAST_AR[msg];
  const existing = $('.toast');
  if (existing) existing.remove();
  clearTimeout(toastTimer);
  const t = el('div', { className: `toast ${type}` }, msg);
  document.body.append(t);
  toastTimer = setTimeout(() => t.remove(), 3000);
}

// ─── Login ──────────────────────────────────────────────────────────
function loginScreen() {
  document.body.innerHTML = '';
  const root = el('div', { className: 'login' });
  const card = el('div', { className: 'login-card' });
  const cloudBadge = window.Storage.isCloud()
    ? '<div style="margin-top:8px;padding:4px 10px;background:rgba(91,141,239,.15);color:var(--blue);border-radius:99px;font-size:11px;display:inline-block">☁️ Cloud sync enabled</div>'
    : '<div style="margin-top:8px;padding:4px 10px;background:var(--surface-2);color:var(--text-mute);border-radius:99px;font-size:11px;display:inline-block">💾 Offline mode</div>';
  const isCloud = window.Storage.isCloud();
  const userLabel = isCloud ? t('Email or mobile number', 'البريد الإلكتروني أو رقم الجوال') : t('Username', 'اسم المستخدم');
  const userPlaceholder = isCloud ? 'admin@blackstars.qa  or  55512345' : 'admin';
  const userDefault = isCloud ? '' : 'admin';
  const passDefault = isCloud ? '' : 'admin123';
  const hint = isCloud
    ? t('Staff: use your email + password. Members: use your mobile number (password is your mobile number the first time).',
        'الموظفون: استخدم بريدك وكلمة المرور. الأعضاء: استخدم رقم جوالك (كلمة المرور هي رقم جوالك في أول مرة).')
    : t('Default: admin / admin123', 'الافتراضي: admin / admin123');
  // Shown when the app sent the user here because their SESSION expired mid-use (a Firestore
  // read came back permission-denied), rather than a normal fresh visit. Cleared on show. (v6.345)
  const expiredNotice = window.__authExpiredNotice
    ? `<div style="margin-top:12px;padding:9px 12px;background:rgba(245,158,11,.14);color:var(--accent-2, #f59e0b);border:1px solid rgba(245,158,11,.4);border-radius:10px;font-size:12px;line-height:1.5">⏳ ${t('Your session expired for security. Please sign in again — your data is safe in the cloud.', 'انتهت جلستك لأسباب أمنية. يرجى تسجيل الدخول مرة أخرى — بياناتك محفوظة في السحابة.')}</div>`
    : '';
  window.__authExpiredNotice = false;
  card.innerHTML = `
    <div style="text-align:${getLang() === 'ar' ? 'left' : 'right'}"><select id="login-lang" class="btn ghost" style="padding:3px 10px;font-size:12px" title="English / العربية / Français">${[['en', 'English'], ['ar', 'العربية'], ['fr', 'Français']].map(([c, n]) => `<option value="${c}"${getLang() === c ? ' selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="login-logo" style="background-image:url('${BRAND_LOGO}');background-size:cover;background-position:center;font-size:0"></div>
    <h1>Black Stars CRM</h1>
    <div class="subtitle">${t('Sports Club · Waab, Doha', 'نادي رياضي · الوعب، الدوحة')}</div>
    ${cloudBadge}
    ${expiredNotice}
    <div class="field" style="margin-top:14px">
      <label>${userLabel}</label>
      <input id="login-user" type="text" value="${userDefault}" placeholder="${userPlaceholder}" autofocus />
    </div>
    <div class="field">
      <label>${t('Password', 'كلمة المرور')}</label>
      <input id="login-pass" type="password" value="${passDefault}" />
    </div>
    <button class="btn primary full lg" id="login-btn">${t('Sign in', 'تسجيل الدخول')}</button>
    <div class="text-mute mt-3" style="text-align:center;font-size:11px">
      ${hint}
    </div>
  `;
  root.append(card);
  document.body.append(root);
  const langToggle = card.querySelector('#login-lang');
  if (langToggle) langToggle.addEventListener('change', () => { setLang(langToggle.value); loginScreen(); });

  const doLogin = async () => {
    const raw = $('#login-user').value.trim();
    const p = $('#login-pass').value;
    // A phone-like entry (digits, no "@") is a member mobile login → synthetic email.
    const looksPhone = !raw.includes('@') && raw.replace(/\D/g, '').length >= 6;
    const btn = $('#login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in...';
    try {
      let user;
      if (looksPhone) {
        // Try the number with and without the 974 country code, and the password
        // both as typed and canonicalised — so members get in however they type it.
        const d = raw.replace(/\D/g, '');
        const canon = canonicalMobile(raw);
        const digitForms = [...new Set([canon, d, d.startsWith('974') ? d : ('974' + d)])];
        // Build candidate emails across BOTH the current domain and the legacy one,
        // so members provisioned under either domain can still sign in.
        const emails = [];
        for (const dom of MEMBER_EMAIL_DOMAINS) for (const x of digitForms) emails.push(x + '@' + dom);
        const passwords = [...new Set([p, canonicalMobile(p)])];
        let lastErr;
        for (const em of emails) {
          for (const pw of passwords) {
            try { user = await window.Storage.signIn(em, pw); break; } catch (err) { lastErr = err; }
          }
          if (user) break;
        }
        if (!user) throw lastErr || new Error('Invalid credentials');
      } else {
        user = await window.Storage.signIn(raw, p);
      }
      state.user = { username: user.email, name: 'Administrator', role: 'admin', email: user.email };
      if (window.Storage.isCloud()) await load();
      // App-level access revoke: account exists in Firebase but admin disabled it.
      const _map = (state.settings && state.settings.userRoles) || {};
      const _me = _map[(user.email || '').toLowerCase()];
      if (_me && _me.disabled) {
        await window.Storage.signOut().catch(() => {});
        state.user = null;
        toast('This account\u2019s access has been revoked. Please contact the club.', 'error');
        btn.disabled = false; btn.textContent = 'Sign in';
        return;
      }
      const resolved = roleForEmail(user.email);
      let name = 'Administrator';
      if (resolved.role === 'coach') {
        // Heal a missing/stale coach link by matching the login email to a coach's
        // email — so the account still scopes correctly even if the admin forgot
        // to pick a coach (or the coach record was recreated with a new id).
        let cid = (resolved.coachId != null && state.coaches.some(c => c.id === resolved.coachId)) ? resolved.coachId : null;
        if (cid == null) {
          const em = (user.email || '').trim().toLowerCase();
          const byEmail = em ? state.coaches.find(c => (c.email || '').trim().toLowerCase() === em) : null;
          if (byEmail) cid = byEmail.id;
        }
        resolved.coachId = cid;
        // Multi-coach mapping (v6.491): a login may be linked to SEVERAL coaches and switch
        // between them at runtime. Keep every mapped coach that still resolves, with the
        // primary (cid) first, so effectiveCoachIds() sees the full set and the banner shows
        // a coach switcher. Back-compat: an old single-coachId mapping becomes a 1-item list.
        let cids = Array.isArray(resolved.coachIds) ? resolved.coachIds.filter(id => state.coaches.some(c => String(c.id) === String(id))) : [];
        if (cid != null && !cids.some(id => String(id) === String(cid))) cids.unshift(cid);
        if (!cids.length && cid != null) cids = [cid];
        resolved.coachIds = cids;
        name = cid != null ? coachName(cid) : 'Coach (unlinked)';
      }
      else if (resolved.role === 'student') {
        // Family login (v6.492): a mapping linked to a FAMILY grants one login access to ALL
        // its members, with a member switcher. Resolve the family → its member ids (primary
        // first) so effectiveMemberIds() sees them all; a plain single-member login is a
        // 1-item list. Reading from familyMembers() means a sibling added LATER auto-appears.
        let mids = [];
        if (resolved.familyId != null && typeof familyMembers === 'function') mids = familyMembers(resolved.familyId).map(x => x.id);
        if (!mids.length && Array.isArray(resolved.memberIds)) mids = resolved.memberIds.filter(id => state.members.some(m => m.id === id));
        if (resolved.memberId != null && !mids.some(x => String(x) === String(resolved.memberId))) mids.unshift(resolved.memberId);
        if (resolved.memberId == null && mids.length) resolved.memberId = mids[0];
        resolved.memberIds = mids;
        const mm = state.members.find(m => m.id === resolved.memberId);
        name = (resolved.familyId != null && typeof familyName === 'function') ? familyName(resolved.familyId) : ((mm && mm.name) || 'Member');
      }
      state.user = { username: user.email, name, role: resolved.role, email: user.email, coachId: resolved.coachId, coachIds: resolved.coachIds || (resolved.coachId != null ? [resolved.coachId] : []), memberId: resolved.memberId, memberIds: resolved.memberIds || (resolved.memberId != null ? [resolved.memberId] : []), familyId: resolved.familyId ?? null };
      state.session = { role: resolved.role, coachId: resolved.coachId, coachIds: resolved.coachIds || (resolved.coachId != null ? [resolved.coachId] : []), memberId: resolved.memberId, memberIds: resolved.memberIds || (resolved.memberId != null ? [resolved.memberId] : []), familyId: resolved.familyId ?? null };
      // Land on this role's own home, not whatever route was left over.
      state.route = roleHome(resolved.role);
      // Still on the default password? True if a member typed their mobile as the
      // password — whether they signed in by mobile OR by their email.
      let stillDefault = looksPhone && canonicalMobile(p) === canonicalMobile(raw);
      if (!stillDefault && resolved.role === 'student' && resolved.memberId != null) {
        const mm = state.members.find(x => x.id === resolved.memberId);
        const mob = mm ? canonicalMobile(mm.phone) : '';
        if (mob && mob.length >= 6 && canonicalMobile(p) === mob) stillDefault = true;
      }
      render();
      try { _idleReset(); } catch (_) {}   // start the idle auto-logout timer
      // Claim/observe the single-writer session lock now that we know who's in.
      try { if (typeof SessionLock !== 'undefined') SessionLock.start(); } catch (_) {}
      if (stillDefault && typeof window.promptPasswordChange === 'function') window.promptPasswordChange(true);
    } catch (e) {
      toast(e.message || 'Invalid credentials', 'error');
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  };

  $('#login-btn').addEventListener('click', doLogin);
  ['#login-user','#login-pass'].forEach(s =>
    $(s).addEventListener('keypress', e => e.key === 'Enter' && doLogin())
  );
}

// ─── Logout ──────────────────────────────────────────────────────────
async function logout() {
  _idleStop();
  await window.Storage.signOut();
  state.user = null;
  loginScreen();
}

// ─── Idle session guard ──────────────────────────────────────────────
// After N minutes with NO activity (N = state.settings.idleLogoutMin, admin-
// configurable, default 10; 0 = never), a dialog asks "Continue session or Log
// out?". An ACTIVE user is never interrupted — any click / keypress / mouse move
// resets the clock, so the dialog only appears when the device is genuinely idle.
// If the dialog is ignored, a grace countdown signs the user out (so a walked-away
// device still locks). Pending cloud writes are flushed before sign-out.
const IDLE_DEFAULT_MIN = 10;             // default idle minutes when nothing is configured
const IDLE_GRACE_MS = 60 * 1000;         // once the dialog shows, auto sign-out after this if ignored
let _idleTimer = null, _idleGraceIv = null, _idleWarning = false;
function _idleMin() {
  const v = (typeof state !== 'undefined' && state && state.settings) ? state.settings.idleLogoutMin : undefined;
  if (v === undefined || v === null || v === '') return IDLE_DEFAULT_MIN;
  const n = Number(v);
  return (isNaN(n) || n < 0) ? IDLE_DEFAULT_MIN : n;
}
function _idleSignedIn() { return !!(typeof state !== 'undefined' && state && state.user); }
function _idleClearWarn() {
  _idleWarning = false;
  if (_idleGraceIv) { clearInterval(_idleGraceIv); _idleGraceIv = null; }
  try { const el = document.getElementById('idle-warn'); if (el) el.remove(); } catch (_) {}
}
function _idleStop() { clearTimeout(_idleTimer); _idleTimer = null; _idleClearWarn(); }
function _idleExpire() {
  _idleStop();
  try { if (window.Storage && window.Storage.flushPending) window.Storage.flushPending(); } catch (_) {}
  try { logout(); } catch (_) {}
  try { toast(t('Signed out for inactivity', 'تم تسجيل الخروج لعدم النشاط'), 'info'); } catch (_) {}
}
function _idleWarn() {
  if (!_idleSignedIn()) return;
  _idleClearWarn();
  _idleWarning = true;                   // a decision is pending — activity no longer auto-resets
  let secs = Math.round(IDLE_GRACE_MS / 1000);
  const el = document.createElement('div');
  el.id = 'idle-warn';
  el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px';
  el.innerHTML = `<div style="background:var(--surface,#fff);color:var(--text,#16202e);max-width:400px;width:100%;border-radius:14px;box-shadow:0 16px 50px rgba(0,0,0,.4);padding:22px;text-align:center">
    <div style="font-size:34px;margin-bottom:6px">🔒</div>
    <div style="font-size:17px;font-weight:800;margin-bottom:6px">${t('Are you still there?', 'هل ما زلت موجوداً؟')}</div>
    <div style="font-size:13px;color:var(--text-mute,#5c6b7f);line-height:1.5;margin-bottom:16px">${t('Your session has been idle for', 'جلستك خاملة منذ')} ${_idleMin()} ${t('minutes', 'دقيقة')}. ${t('Auto sign-out in', 'تسجيل خروج تلقائي خلال')} <b id="idle-count">${secs}</b>s.</div>
    <div style="display:flex;gap:10px">
      <button id="idle-logout" style="flex:1;background:transparent;color:var(--red,#c0392b);border:1px solid var(--red,#c0392b);border-radius:9px;padding:11px;font-weight:700;cursor:pointer">${t('Log out', 'تسجيل الخروج')}</button>
      <button id="idle-continue" style="flex:2;background:var(--green,#12724a);color:#fff;border:none;border-radius:9px;padding:11px;font-weight:700;cursor:pointer">${t('Continue session', 'متابعة الجلسة')}</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  try { el.querySelector('#idle-continue').addEventListener('click', () => { _idleClearWarn(); _idleReset(); }); } catch (_) {}
  try { el.querySelector('#idle-logout').addEventListener('click', _idleExpire); } catch (_) {}
  _idleGraceIv = setInterval(() => {
    secs -= 1;
    const c = document.getElementById('idle-count'); if (c) c.textContent = String(Math.max(0, secs));
    if (secs <= 0) _idleExpire();
  }, 1000);
}
function _idleReset() {
  if (_idleWarning) return;   // a Continue/Log-out decision is pending — don't silently reset
  clearTimeout(_idleTimer); _idleTimer = null;
  if (!_idleSignedIn()) return;                 // no timer on the login screen
  const min = _idleMin();
  if (!(min > 0)) return;                        // 0 / disabled → never auto sign-out
  _idleTimer = setTimeout(_idleWarn, min * 60 * 1000);
}
window._idleReset = _idleReset;   // (re)started after login, on init, and when the setting changes
(function _wireIdleActivity() {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  ['mousedown', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, _idleReset, { passive: true, capture: true }));
  // Throttle high-frequency events so we don't reset the timer on every pixel of movement.
  let _last = 0;
  const throttled = () => { const now = Date.now(); if (now - _last > 2000) { _last = now; _idleReset(); } };
  ['mousemove', 'scroll', 'wheel'].forEach(ev => document.addEventListener(ev, throttled, { passive: true, capture: true }));
})();

// ─── Routes ──────────────────────────────────────────────────────────
const ROUTES = {
  mymembership: { label: 'My Membership', icon: '🪪', section: 'Main', memberOnly: true },
  coachhome:  { label: 'My Dashboard', icon: '🏠', section: 'Main', coachOnly: true },
  coachsalary: { label: 'My Salary', icon: '💰', section: 'Main', coachOnly: true },   // v6.448 re-enabled per owner — coaches can see their own salary page again
  dashboard:  { label: 'Dashboard',  icon: '📊', section: 'Main' },
  reports:    { label: 'Reports',    icon: '📈', section: 'Main' },
  charts:     { label: 'Charts',     icon: '📊', section: 'Main', adminOnly: false },   // v6.457 smart-charts dashboard (admin + reception)
  notes:      { label: 'Notes & Reminders', icon: '📝', section: 'Main', badge: () => dueNotesCount() },
  members:    { label: 'Members',    icon: '👥', section: 'Membership' },
  families:   { label: 'Families',   icon: '👨‍👩‍👧', section: 'Membership' },
  history:    { label: 'History',    icon: '📜', section: 'Membership' },
  schedule:   { label: 'Schedule',   icon: '🗓', section: 'Activities' },
  classes:    { label: 'Classes',    icon: '📋', section: 'Activities' },
  swimgroups: { label: 'Swimming Groups', icon: '🏊', section: 'Activities' },
  campschedule: { label: 'Summer Camp', icon: '☀️', section: 'Summer Camp', hidden: true },
  campmembers: { label: 'Camp Members', icon: '🚌', section: 'Summer Camp', badge: () => campExpiringSoonCount() },
  campdrivers: { label: 'Drivers', icon: '🚐', section: 'Summer Camp' },
  camproutes: { label: 'Driver Students', icon: '🧒', section: 'Summer Camp' },
  campclosure: { label: 'Camp Closure', icon: '🏁', section: 'Summer Camp', adminOnly: true, hidden: true },   // v6.470 — switch/refund active camp members at close. v6.475: hidden per owner (not needed for now; the screen + logic stay, just off the menu)
  expiring:   { label: 'Expiring',   icon: '⏰', section: 'Membership' },
  completed:  { label: 'Ready to Renew', icon: '✅', section: 'Membership', hidden: true, badge: () => (typeof completedRenewalCount === 'function' ? completedRenewalCount() : 0) },   // v6.427 disabled — completed members now shown on the Expiring screen
  duepayment: { label: 'Due Payment', icon: '💰', section: 'Membership' },
  reminders:  { label: 'Reminders',  icon: '🔔', section: 'Membership', adminOnly: true, hidden: true },   // v6.423 disabled per owner — renewal reminders live on the Expiring screen
  birthdays:  { label: 'Birthdays',   icon: '🎂', section: 'Engagement' },   // v6.424 own module
  social:     { label: 'Social Media', icon: '🌐', section: 'Engagement', adminOnly: true },   // v6.472 — compose once, share everywhere
  trials:     { label: 'Trials',     icon: '🎁', section: 'Membership' },
  transfers:  { label: 'Transfer Membership', icon: '🔁', section: 'Membership', adminOnly: true },
  onboarding: { label: 'Portal Onboarding', icon: '📲', section: 'Engagement' },   // v6.424 own module
  welcome:    { label: 'Welcome Messages', icon: '👋', section: 'Engagement', badge: () => (typeof pendingWelcomeCount === 'function' ? pendingWelcomeCount() : 0) },   // v6.510 — greet new joiners + renewals over WhatsApp with their membership details
  rentals:    { label: 'Rentals',    icon: '🏟', section: 'Activities' },
  coaches:    { label: 'Staff',      icon: '🥋', section: 'Team & Sports' },
  attendance: { label: 'Attendance', icon: '✓',  section: 'Attendance' },   // v6.427 own module
  coachattendance: { label: 'Attendance Report', icon: '📋', section: 'Attendance', coachOnly: true },   // v6.427 own module
  advice:     { label: 'Coach Advice', icon: '💬', section: 'Advice' },       // v6.424 own module
  posts:      { label: 'Advice & Articles', icon: '📢', section: 'Advice' },  // v6.424 own module
  invoices:   { label: 'Invoices',   icon: '📄', section: 'Finance' },
  dupinvoices:{ label: 'Duplicate Invoices', icon: '🔍', section: 'Finance', adminOnly: true, hidden: true },   // v6.424 disabled per owner
  cashcollection: { label: 'Cash Collection', icon: '💵', section: 'Finance' },
  cashinhand: { label: 'Cash in Hand', icon: '🧮', section: 'Finance' },   // admin + receptionist (via ROLE_ALLOWED); front-desk cash management
  bankaccount: { label: 'Bank Account', icon: '🏦', section: 'Finance', adminOnly: true, hidden: true },
  reconciliation: { label: 'Reconciliation', icon: '⚖️', section: 'Finance', adminOnly: true, hidden: true },
  expenses:   { label: 'Expenses',   icon: '💸', section: 'Finance' },
  salaries:   { label: 'Salaries',   icon: '💰', section: 'Finance' },
  citadel:    { label: 'Citadel',    icon: '🏛', section: 'Finance', adminOnly: true },
  products:   { label: 'Products',   icon: '📦', section: 'Shop' },       // v6.424 own module
  productsales:{ label: 'Product Sales', icon: '📊', section: 'Shop' },   // v6.424 own module
  dashboardkpi: { label: 'Owner Dashboard', icon: '📊', section: 'Insights', adminOnly: true, hidden: true },
  monthlyreport: { label: 'Monthly Report', icon: '🗓', section: 'Insights', adminOnly: true },
  payanalysis:{ label: 'Payments Analysis', icon: '💳', section: 'Insights', hidden: true },
  coachperf:  { label: 'Coach Performance', icon: '📊', section: 'Insights' },
  clubrevenue:{ label: 'Club Revenue Summary', icon: '💼', section: 'Insights', hidden: true },
  moneyflow:  { label: 'Financial Overview', icon: '💰', section: 'Insights', adminOnly: true, hidden: true },
  transactions:{ label: 'Transactions', icon: '🧾', section: 'Insights' },
  missinginvoices: { label: 'Missing Invoices', icon: '🧩', section: 'Insights', adminOnly: true, hidden: true },   // folded into Invoice Integrity (still deep-linkable)
  invoicechecker: { label: 'Invoice Integrity', icon: '🔎', section: 'Insights', adminOnly: true },
  membercommission: { label: 'Member Commission', icon: '🧾', section: 'Insights', adminOnly: true, hidden: true },
  renewals:   { label: 'Renewals',   icon: '🔄', section: 'Insights', hidden: true },   // v6.427 disabled per owner
  renewaldetail: { label: 'Renewal Potential', icon: '💰', section: 'Insights', adminOnly: true, hidden: true },   // v6.424 disabled per owner
  attreport:  { label: 'Attendance Report', icon: '📋', section: 'Attendance' },   // v6.427 own module
  sports:     { label: 'Sports',     icon: '🥋', section: 'Team & Sports' },
  dataimport: { label: 'Data Import', icon: '📥', section: 'System' },
  dataexport: { label: 'Data Export', icon: '📤', section: 'System' },
  audit:      { label: 'Audit Log',  icon: '📋', section: 'System', adminOnly: true },
  trash:      { label: 'Trash', icon: '🗑', section: 'System', adminOnly: true, badge: () => (typeof trashCount === 'function' ? trashCount() : 0) },   // v6.426 recover archived members/invoices
  users:      { label: 'Users & Roles', icon: '🔐', section: 'System', adminOnly: true },
  preferences:{ label: 'Preferences', icon: '🎛', section: 'System', adminOnly: true },
  club:       { label: 'Club Setup',  icon: '🏷', section: 'System', adminOnly: true },
  databackup: { label: 'Data & Backup', icon: '💾', section: 'System', adminOnly: true },
  cleanup:    { label: 'Cleanup Center', icon: '🧹', section: 'System', adminOnly: true },
  danger:     { label: 'Danger Zone', icon: '⚠️', section: 'System', adminOnly: true },
  settings:   { label: 'Settings',   icon: '⚙️', section: 'System', hidden: true },
};

// ─── Roles (preview/view layer) ─────────────────────────────────────
// Which nav routes each role sees. 'admin' sees everything (null = all).
// NOTE: this is a UI preview layer, not a security boundary — real per-role
// enforcement needs the (pending) Firebase Auth + server rules.
const ROLE_ALLOWED = {
  admin: null,
  // Coaches: their classes, attendance roll-call, trials. NOT salaries — their OWN pay
  // page ('coachsalary') is disabled per owner (v6.420), so it's removed here too (route
  // fully blocked, not just hidden from the menu) — and NOT the full members list / club financials.
  coach: ['coachhome', 'coachsalary', 'coachattendance', 'schedule', 'campschedule', 'attendance', 'trials', 'advice', 'posts'],
  // Students/members: their own membership + the class timetable. No other members.
  student: ['mymembership', 'schedule', 'campschedule', 'advice', 'posts'],
  // Receptionist: pure front-desk. Can manage members, families, trials,
  // attendance, schedule, rentals, advice and the Summer Camp tools. CAN view
  // Invoices (to look up a member's payment status — but with NO revenue totals,
  // just the invoice count) and Products (catalog + sell price, no cost/margin).
  // To avoid leaking the club's earnings: NO Dashboard, NO Cash Collection (owner
  // till-withdrawal totals), NO Salaries, NO Insights / Reports / Club Revenue,
  // NO Coach Performance, NO Renewal Potential, NO totals/net-profit views, NO CSV
  // exports, NO Sports admin, NO Users & Roles, NO Backup / Danger / Audit.
  receptionist: [
    'members', 'families', 'expiring', 'completed', 'duepayment', 'trials', 'reminders', 'welcome',
    'schedule', 'attendance', 'rentals', 'advice',
    'campschedule', 'campmembers', 'campdrivers', 'camproutes',
    'invoices', 'products', 'onboarding', 'expenses',
    // Cash management: front-desk collects cash + tracks the till (owner request).
    'cashcollection', 'cashinhand',
    // Owner request (v6.327): re-enable Staff roster ('coaches') + the Sports/Activities
    // screen ('sports') for reception; Invoices + Expenses were already enabled above.
    'coaches', 'sports',
    // 'onboarding' = WhatsApp portal invites (req #6, reception may send invites).
    // 'expenses' = reception may record/view expenses but the CSV/sheet EXPORT is hidden
    // for them (see the Expenses page).
  ],
};
const ROLE_LABELS = { admin: 'Admin', coach: 'Coach', student: 'Student', receptionist: 'Receptionist' };
// True when the current role has READ-ONLY access to finance pages (revenue,
// salaries, profit). Used to hide edit/save buttons on those pages.
function isViewerRole() { try { return currentRole() === 'receptionist'; } catch (_) { return false; } }
// Membership freezes may only be managed by Admin or Reception — never by the
// member themselves (or a coach). Enforced at every freeze/unfreeze entry point,
// not just by hiding the buttons.
function canManageFreeze() { try { return ['admin', 'receptionist'].includes(currentRole()); } catch (_) { return false; } }
// Arabic labels for the nav items so the menu is consistent in Arabic mode.
const NAV_AR = {
  coachattendance: 'تقرير الحضور',
  swimgroups: 'مجموعات السباحة',
  transfers: 'نقل العضوية',
  mymembership: 'عضويتي',
  coachhome: 'لوحة المدرب',
  dashboard: 'لوحة التحكم',
  notes: 'الملاحظات والتذكيرات',
  members: 'الأعضاء',
  families: 'العائلات',
  history: 'السجل',
  schedule: 'الجدول',
  classes: 'الحصص',
  campschedule: 'المعسكر الصيفي',
  campmembers: 'أعضاء المعسكر',
  campdrivers: 'السائقون',
  camproutes: 'طلاب كل سائق',
  campclosure: 'إغلاق المعسكر',
  expiring: 'قرب الانتهاء',
  completed: 'جاهز للتجديد',
  duepayment: 'المدفوعات المستحقة',
  reminders: 'التذكيرات',
  welcome: 'رسائل الترحيب',
  birthdays: 'أعياد الميلاد',
  social: 'وسائل التواصل',
  trials: 'الحصص التجريبية',
  rentals: 'الإيجارات',
  coaches: 'الطاقم',
  attendance: 'الحضور',
  advice: 'نصائح المدرب',
  posts: 'النصائح والمقالات',
  invoices: 'الفواتير',
  dupinvoices: 'الفواتير المكررة',
  cashcollection: 'تحصيل النقدية',
  bankaccount: 'الحساب البنكي',
  reconciliation: 'التسوية المالية',
  expenses: 'المصروفات',
  salaries: 'الرواتب',
  citadel: 'سيتاديل',
  products: 'المنتجات',
  productsales: 'مبيعات المنتجات',
  reports: 'التقارير',
  charts: 'الرسوم البيانية',
  dashboardkpi: 'لوحة المالك',
  monthlyreport: 'التقرير الشهري',
  coachperf: 'أداء المدربين',
  clubrevenue: 'ملخص إيرادات النادي',
  moneyflow: 'النظرة المالية',
  transactions: 'العمليات',
  missinginvoices: 'الفواتير الناقصة',
  invoicechecker: 'سلامة الفواتير',
  membercommission: 'عمولة الأعضاء',
  renewals: 'التجديدات',
  attreport: 'تقرير الحضور',
  dataimport: 'استيراد البيانات',
  dataexport: 'تصدير البيانات',
  sports: 'الرياضات',
  audit: 'سجل التدقيق',
  users: 'المستخدمون والصلاحيات',
  preferences: 'التفضيلات',
  club: 'إعداد النادي',
  databackup: 'البيانات والنسخ الاحتياطي',
  cleanup: 'مركز التنظيف',
  danger: 'منطقة الخطر',
  settings: 'الإعدادات',
};
const ROLE_LABELS_AR = { admin: 'مشرف', coach: 'مدرب', student: 'عضو' };
// The role of the logged-in ACCOUNT (set at sign-in from the Users & Roles map).
function accountRole() { return (state.user && state.user.role) || 'admin'; }
// The effective role NOW. Only an admin account may "preview" another role; a
// coach/student account is locked to its own role and cannot escalate.
function currentRole() {
  const acct = accountRole();
  if (acct !== 'admin') return acct;
  return (state.session && state.session.role) || 'admin';
}
function roleCanAccess(role, route) {
  if (!role || role === 'admin') return true;
  const allow = ROLE_ALLOWED[role];
  return !allow || allow.indexOf(route) >= 0;
}
function roleHome(role) {
  if (!role || role === 'admin') return 'dashboard';
  const allow = ROLE_ALLOWED[role];
  return (allow && allow[0]) || 'dashboard';
}
// The coach/member the app should scope to right now: the logged-in account's,
// unless an ADMIN is previewing as a specific coach/member (session carries the id).
function effectiveCoachId() {
  if (accountRole() === 'admin' && state.session && state.session.role === 'coach') return state.session.coachId ?? null;
  const mapped = (state.user && state.user.coachId) ?? null;
  // If the mapped id no longer resolves to a coach (stale/broken link), fall back
  // to matching the login email → coach.email so the account still works.
  if (mapped != null && (state.coaches || []).some(c => c.id === mapped)) return mapped;
  // Multi-coach account with a broken/empty primary: use the first mapped coach.
  const ids = effectiveCoachIds();
  if (ids.length) return ids[0];
  const healed = myCoach();
  return healed ? healed.id : mapped;
}
// The FULL set of coach ids a signed-in coach account may act for. Supports the
// multi-coach mapping (userRoles[email].coachIds) while staying back-compat with a
// single coachId. An admin PREVIEWING one coach is scoped to just that coach. The
// runtime "active coach" (state.user.coachId, set by the banner switcher) stays a
// member of this set, so effectiveCoachId() above always returns one of these. (v6.491)
function effectiveCoachIds() {
  if (accountRole() === 'admin' && state.session && state.session.role === 'coach') {
    const one = state.session.coachId ?? null; return one != null ? [one] : [];
  }
  let ids = (state.user && Array.isArray(state.user.coachIds)) ? state.user.coachIds.slice() : [];
  if (!ids.length && state.user && state.user.coachId != null) ids = [state.user.coachId];
  if (!ids.length) { const h = (typeof myCoach === 'function') ? myCoach() : null; if (h) ids = [h.id]; }
  const valid = ids.filter(id => (state.coaches || []).some(c => String(c.id) === String(id)));
  return valid.length ? valid : ids;
}
// Switch which of a multi-coach account's coaches is "active" — the one every
// coach-scoped screen (home, salary, attendance, schedule, students) focuses on.
// We move the PRIMARY (state.user.coachId) to the picked coach so every existing
// reader — effectiveCoachId(), myCoach(), state.user.coachId — follows it with no
// per-screen change. Session-only: never written back to the saved userRoles map. (v6.491)
window.setActiveCoach = function(id) {
  const n = parseInt(id, 10); const val = isNaN(n) ? id : n;
  const ids = effectiveCoachIds();
  if (!ids.some(x => String(x) === String(val))) return;   // only among this account's own coaches
  if (state.user) state.user.coachId = val;
  if (state.session) state.session.coachId = val;
  if (typeof render === 'function') render();
};
function effectiveMemberId() {
  if (accountRole() === 'admin' && state.session && state.session.role === 'student') return state.session.memberId ?? null;
  const mapped = (state.user && state.user.memberId) ?? null;
  if (mapped != null && (state.members || []).some(m => m.id === mapped)) return mapped;
  const ids = effectiveMemberIds();
  return ids.length ? ids[0] : mapped;
}
// The FULL set of member ids a signed-in login may view — the whole FAMILY for a family
// login (userRoles[email].familyId), else the single mapped member. Recomputed from
// familyMembers() so a sibling added LATER shows up automatically. The runtime "active
// member" (state.user.memberId, set by the banner switcher) stays one of these. (v6.492)
function effectiveMemberIds() {
  if (accountRole() === 'admin' && state.session && state.session.role === 'student') {
    const one = state.session.memberId ?? null; return one != null ? [one] : [];
  }
  const fam = (state.user && state.user.familyId != null) ? state.user.familyId : null;
  let ids = [];
  if (fam != null && typeof familyMembers === 'function') ids = familyMembers(fam).map(x => x.id);
  if (!ids.length && state.user && Array.isArray(state.user.memberIds)) ids = state.user.memberIds.slice();
  if (!ids.length && state.user && state.user.memberId != null) ids = [state.user.memberId];
  const valid = ids.filter(id => (state.members || []).some(m => m.id === id && !m.deleted));
  return valid.length ? valid : ids;
}
function effectiveFamilyId() {
  if (accountRole() === 'admin' && state.session && state.session.role === 'student') return null;
  return (state.user && state.user.familyId != null) ? state.user.familyId : null;
}
// Switch which family member the student-scoped screens focus on. Mirrors setActiveCoach:
// move the primary (state.user.memberId) to the picked member so effectiveMemberId() and
// every reader follows it with no per-screen change. Session-only. (v6.492)
window.setActiveMember = function(id) {
  const n = parseInt(id, 10); const val = isNaN(n) ? id : n;
  const ids = effectiveMemberIds();
  if (!ids.some(x => String(x) === String(val))) return;   // only among this login's own members
  if (state.user) state.user.memberId = val;
  if (state.session) state.session.memberId = val;
  if (typeof render === 'function') render();
};
// Resolve which role a signed-in email gets, from the cloud Users & Roles map.
// Unmapped emails fall back to settings.unmappedRole (default 'admin' so the
// owner is never locked out); if the map is empty we're bootstrapping → admin.
// Members log in with their MOBILE NUMBER. Internally that maps to a hidden
// Firebase Auth email so we can use standard email/password auth.
const MEMBER_EMAIL_DOMAIN = 'blackstars.com';
// Older builds provisioned logins under this domain; keep recognizing it so those
// already-created accounts still sign in.
const MEMBER_EMAIL_DOMAINS = ['blackstars.com', 'members.blackstars.qa'];
// Canonical mobile = digits only, with the Qatar country code stripped, so the
// SAME login works whether a member types "55512345" or "+974 5551 2345".
function canonicalMobile(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('974') && d.length > 8) d = d.slice(3);
  return d;
}
// True if `query` matches `storedPhone` regardless of formatting — spaces,
// dashes, a leading + or 00, and the 974 country code are all ignored on BOTH
// sides. So "5040 5905", "+974 5040 5905", "0097450405905" and "50405905" all
// match a stored "+97450405905". Used by search boxes across the app.
// ─── Recent searches ────────────────────────────────────────────────────────
// A small, shared "recent searches" memory for the app's search boxes. Each box
// keeps its own list under a key (e.g. 'members', 'invoices'). attachRecentSearch
// wires a dropdown that appears on focus and records committed searches.
const RECENT_SEARCH_MAX = 5;
function recentSearches(key) {
  const all = state.recentSearches || (state.recentSearches = {});
  return Array.isArray(all[key]) ? all[key] : (all[key] = []);
}
function recordRecentSearch(key, term) {
  term = (term || '').trim();
  if (term.length < 2) return;                       // ignore trivial/very short
  const list = recentSearches(key);
  const lc = term.toLowerCase();
  const idx = list.findIndex(t => t.toLowerCase() === lc);
  if (idx >= 0) list.splice(idx, 1);                 // move existing to front
  list.unshift(term);
  if (list.length > RECENT_SEARCH_MAX) list.length = RECENT_SEARCH_MAX;
  if (typeof save === 'function') save();
}
function clearRecentSearches(key) {
  const all = state.recentSearches || (state.recentSearches = {});
  all[key] = [];
  if (typeof save === 'function') save();
}

// Wire a search input (by element id) to a recent-searches dropdown stored under
// `key`. onPick(term) is called when the user clicks a recent item (so the page
// can apply it); if omitted, the input's own 'input' event is dispatched.
function attachRecentSearch(inputId, key, onPick) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const wrap = input.closest('.search') || input.parentElement;
  if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

  let menu = null;
  const close = () => { if (menu) { menu.remove(); menu = null; } };
  const open = () => {
    close();
    // Slice on read as well as on write: a list saved when the cap was 8 would
    // otherwise keep showing 8 entries until it churns.
    const items = recentSearches(key).slice(0, RECENT_SEARCH_MAX);
    if (!items.length) return;
    menu = document.createElement('div');
    menu.className = 'recent-search-menu';
    menu.innerHTML =
      `<div class="recent-search-head">${t('Recent searches', 'عمليات البحث الأخيرة')}<button type="button" class="recent-search-clear">${t('Clear', 'مسح')}</button></div>` +
      items.map(term =>
        `<button type="button" class="recent-search-item" data-term="${escapeHtml(term)}"><span class="rs-ico">🕘</span><span class="rs-term">${escapeHtml(term)}</span></button>`
      ).join('');
    wrap.appendChild(menu);
    menu.querySelector('.recent-search-clear').addEventListener('mousedown', (e) => {
      e.preventDefault(); clearRecentSearches(key); close();
    });
    menu.querySelectorAll('.recent-search-item').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const term = btn.getAttribute('data-term');
        input.value = term;
        if (typeof onPick === 'function') onPick(term);
        else input.dispatchEvent(new Event('input', { bubbles: true }));
        recordRecentSearch(key, term);
        close();
      });
    });
  };

  input.addEventListener('focus', open);
  input.addEventListener('blur', () => {
    recordRecentSearch(key, input.value);
    setTimeout(close, 150);
  });
  // Once the user starts typing, the recent list is stale — get it out of the way
  // (and off the top of any suggestion list the page draws under the same box).
  input.addEventListener('input', () => { if (input.value) close(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { recordRecentSearch(key, input.value); close(); }
    else if (e.key === 'Escape') close();
  });
}

// Recent searches as an inline chip row, for search boxes that ALREADY own a
// dropdown (e.g. the attendance student picker, which opens its own suggestion
// list on focus). Stacking a second menu on those would overlap; chips sit
// under the box instead. Same store as attachRecentSearch. (v6.337)
// `limit` lets a screen show fewer chips than the global cap (Attendance keeps the last 3 so the
// chips stay on one line under the student picker). Defaults to RECENT_SEARCH_MAX. (v6.384)
function recentSearchChipsHtml(key, containerId, limit) {
  const _max = (typeof limit === 'number' && limit > 0) ? limit : RECENT_SEARCH_MAX;
  const items = recentSearches(key).slice(0, _max);
  if (!items.length) return `<div id="${containerId}"></div>`;
  return `<div id="${containerId}" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:6px">
    <span style="font-size:11px;color:var(--text-mute)">${t('Recent', 'الأخيرة')}:</span>
    ${items.map(term => `<button type="button" class="recent-chip" data-term="${escapeHtml(term)}" style="font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer">🕘 ${escapeHtml(term)}</button>`).join('')}
    <button type="button" class="recent-chip-clear" style="font-size:11px;padding:2px 6px;border:none;background:none;color:var(--text-mute);cursor:pointer">${t('Clear', 'مسح')}</button>
  </div>`;
}
function bindRecentSearchChips(key, containerId, onPick) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.querySelectorAll('.recent-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const term = btn.getAttribute('data-term');
      recordRecentSearch(key, term);   // re-picking bumps it to the front
      if (typeof onPick === 'function') onPick(term);
    });
  });
  const clr = box.querySelector('.recent-chip-clear');
  if (clr) clr.addEventListener('click', () => { clearRecentSearches(key); if (typeof render === 'function') render(); });
}

function phoneQueryMatches(storedPhone, query) {
  const qDigits = canonicalMobile(query);
  if (!qDigits || qDigits.length < 4) return false;   // too short / not a phone
  const pDigits = canonicalMobile(storedPhone);
  if (!pDigits) return false;
  return pDigits.includes(qDigits) || qDigits.includes(pDigits);
}
function phoneToMemberEmail(input) {
  const digits = canonicalMobile(input);
  return digits ? digits + '@' + MEMBER_EMAIL_DOMAIN : '';
}
function isMemberEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.toLowerCase();
  return MEMBER_EMAIL_DOMAINS.some(dom => e.endsWith('@' + dom));
}
function memberByPhoneDigits(digits) {
  if (!digits) return null;
  return (state.members || []).find(m => {
    for (const p of [m.phone, m.phone2]) {
      const pd = String(p || '').replace(/\D/g, '');
      if (pd && (pd === digits || pd.endsWith(digits) || digits.endsWith(pd))) return true;
    }
    return false;
  }) || null;
}
function roleForEmail(email) {
  const map = (state.settings && state.settings.userRoles) || {};
  const e = (email || '').toLowerCase();
  const entry = map[e];
  if (entry && entry.role) return { role: entry.role, coachId: entry.coachId ?? null, coachIds: (Array.isArray(entry.coachIds) && entry.coachIds.length) ? entry.coachIds.slice() : (entry.coachId != null ? [entry.coachId] : []), memberId: entry.memberId ?? null, familyId: entry.familyId ?? null, memberIds: (Array.isArray(entry.memberIds) && entry.memberIds.length) ? entry.memberIds.slice() : (entry.memberId != null ? [entry.memberId] : []) };
  // Member mobile logins auto-resolve to the matching member (no manual mapping).
  if (isMemberEmail(e)) {
    const m = memberByPhoneDigits(e.split('@')[0].replace(/\D/g, ''));
    return { role: 'student', coachId: null, memberId: m ? m.id : null };
  }
  // A member signing in with their OWN real email auto-resolves to Student, linked
  // to that member — no manual Users & Roles entry needed.
  const byEmail = (state.members || []).find(m => !m.deleted && m.email && m.email.toLowerCase() === e);
  if (byEmail) return { role: 'student', coachId: null, memberId: byEmail.id };
  const keys = Object.keys(map);
  // Bootstrap: with NO mappings at all, the first account in is admin so the
  // owner can set things up. Once ANY mapping exists, an unmapped account gets
  // the configured default — which is least-privilege (Student) unless the admin
  // explicitly chose Admin. This stops a random new login getting full access.
  if (!keys.length) return { role: 'admin', coachId: null, memberId: null };
  const fallback = (state.settings && state.settings.unmappedRole) || 'student';
  return { role: fallback, coachId: null, memberId: null };
}

// History stack for the in-app Back button. Each entry remembers the route and the
// scroll position so Back returns the user to the exact spot. Page filter state lives
// in persistent window._*State / loadFilter globals, so those are restored automatically.
window._navStack = window._navStack || [];
// The element/position that actually scrolls. Most pages scroll the document, but if a
// .main/.content wrapper is the scroller we handle that too. Returns a getter/setter pair.
function _getScroll() {
  const m = document.querySelector('.main') || document.querySelector('main');
  if (m && m.scrollHeight > m.clientHeight + 4 && m.scrollTop > 0) return m.scrollTop;
  return window.scrollY || document.documentElement.scrollTop || 0;
}
function _setScroll(y) {
  const m = document.querySelector('.main') || document.querySelector('main');
  if (m && m.scrollHeight > m.clientHeight + 4) { m.scrollTop = y; }
  window.scrollTo(0, y);
}
function navigate(route, opts) {
  // Sales page was merged into Invoices in v89 — silently redirect old bookmarks.
  if (route === 'sales') route = 'invoices';
  // STUCK-OVERLAY GUARD (v6.451): a modal appends a full-screen #modal-backdrop to <body>
  // and sets body overflow:hidden. A re-render does NOT remove it, so if a navigation fires
  // while a popup is open (most often the browser BACK button, or a deep link), the invisible
  // backdrop survives on top of the new screen and swallows every click — the page looks frozen
  // ("links not clickable"). Force any open modal closed before rendering the new screen.
  try {
    if (typeof closeModal === 'function' && document.getElementById('modal-backdrop')) closeModal();
    else if (document.body) document.body.style.overflow = '';   // belt-and-braces: never leave scroll locked
  } catch (_) {}
  // Role guard: a non-admin preview can't open screens outside its allow-list.
  if (!roleCanAccess(currentRole(), route)) route = roleHome(currentRole());
  // Push the CURRENT location onto the back-stack before leaving it (unless this is a
  // back navigation, or we're re-opening the same route).
  if (!(opts && opts.isBack) && state.route && state.route !== route) {
    window._navStack.push({ route: state.route, scroll: _getScroll() });
    if (window._navStack.length > 50) window._navStack.shift();   // cap memory
  }
  state.route = route;
  render();
  // Mirror into the browser history so the device/browser Back button also works.
  try {
    if (!(opts && opts.isBack && opts.fromPop)) {
      if (opts && opts.isBack) { history.replaceState({ route }, '', '#' + route); }
      else history.pushState({ route }, '', '#' + route);
    }
  } catch (_) {}
  // Restore scroll if this navigation carried a saved position (a Back action).
  if (opts && typeof opts.scroll === 'number') {
    const y = opts.scroll;
    requestAnimationFrame(() => requestAnimationFrame(() => _setScroll(y)));
  } else if (!(opts && opts.isBack)) {
    requestAnimationFrame(() => _setScroll(0));
  }
}

// Go back to the previous screen, restoring its scroll position + filters.
function navigateBack() {
  if (!window._navStack || !window._navStack.length) return;
  const prev = window._navStack.pop();
  navigate(prev.route, { isBack: true, scroll: prev.scroll });
}
window.navigateBack = navigateBack;
function canGoBack() { return !!(window._navStack && window._navStack.length); }
window.canGoBack = canGoBack;

// Browser/device Back button → use our back-stack so scroll + filters are restored.
if (!window._popstateBound) {
  window._popstateBound = true;
  window.addEventListener('popstate', (ev) => {
    if (!state || !state.user) return;   // ignore before login
    if (window._navStack && window._navStack.length) {
      const prev = window._navStack.pop();
      navigate(prev.route, { isBack: true, fromPop: true, scroll: prev.scroll });
    } else if (ev.state && ev.state.route) {
      navigate(ev.state.route, { isBack: true, fromPop: true });
    }
  });
}

// ─── Sync refresh banner — REMOVED in v6.341 ─────────────────────────
// There used to be a "Newer data is available — Refresh?" bar here. It was never needed: by
// the time it appeared, the remote change had ALREADY been merged into state. It only asked
// the user to do the app's job. It now refreshes itself the moment the user is idle (see the
// onRemoteUpdate watcher), backed by a 5-minute poll in case the live listener dies.

// ─── Render ──────────────────────────────────────────────────────────
function render() {
  // Page-local hooks (e.g. the Invoices in-place refresh) must not survive a
  // full re-render onto another page.
  window._invoicesRefresh = null;
  if (!state.user) {
    loginScreen();
    return;
  }

  // If a toast is currently visible, preserve it across the body wipe.
  // (toast() calls before render() were getting silently erased — UX bug.)
  const liveToast = document.querySelector('.toast');
  const toastClone = liveToast ? liveToast.cloneNode(true) : null;

  document.body.innerHTML = '';

  // Mobile hamburger button — visible only via CSS at < 900px.
  // Toggles the .open class on .sidebar and .sidebar-backdrop.
  const menuBtn = el('button', {
    className: 'mobile-menu-btn',
    'aria-label': 'Toggle menu',
    title: 'Menu',
    innerHTML: '☰',
  });
  const backdrop = el('div', { className: 'sidebar-backdrop' });
  function closeDrawer() {
    document.querySelector('.sidebar')?.classList.remove('open');
    backdrop.classList.remove('open');
  }
  menuBtn.addEventListener('click', () => {
    const sb = document.querySelector('.sidebar');
    const isOpen = sb?.classList.contains('open');
    if (isOpen) {
      closeDrawer();
    } else {
      sb?.classList.add('open');
      backdrop.classList.add('open');
    }
  });
  backdrop.addEventListener('click', closeDrawer);
  document.body.append(menuBtn);
  document.body.append(backdrop);

  const app = el('div', { id: 'app' });
  const sidebar = renderSidebar();
  const main = el('main', { className: 'main' });

  app.append(sidebar);
  app.append(main);
  document.body.append(app);

  // Close drawer when a nav item is clicked (mobile UX)
  sidebar.addEventListener('click', e => {
    if (e.target.closest('.nav-item') && window.innerWidth <= 900) {
      closeDrawer();
    }
  });

  // Re-append the surviving toast (already on its timer; will fade naturally)
  if (toastClone) document.body.append(toastClone);

  // NOW main is in the DOM — page handler can safely query elements.
  // Enforce access on the CURRENT route too (not just on click): if this role
  // can't open state.route — e.g. a student left on 'dashboard' after login or a
  // refresh — send them to their own home instead of rendering a forbidden page.
  if (!roleCanAccess(currentRole(), state.route)) {
    state.route = roleHome(currentRole());
  }
  const handler = PAGES[state.route] || PAGES[roleHome(currentRole())] || PAGES.dashboard;
  handler(main);

  // ── Global Back button ── Inject a back arrow at the start of the page's topbar
  // (every screen has a .topbar). Returns to the previous screen, scroll + filters.
  try {
    if (canGoBack()) {
      const topbar = main.querySelector('.topbar');
      if (topbar && !topbar.querySelector('.back-btn')) {
        const back = document.createElement('button');
        back.className = 'btn ghost back-btn';
        back.type = 'button';
        back.title = t('Back', 'رجوع');
        back.setAttribute('aria-label', t('Back', 'رجوع'));
        back.style.cssText = 'margin-inline-end:10px;padding:8px 12px;font-size:16px;line-height:1;flex:0 0 auto';
        back.innerHTML = '←';
        back.addEventListener('click', () => navigateBack());
        // Place it before the title block so it reads as a leading control.
        topbar.insertBefore(back, topbar.firstChild);
        topbar.style.display = topbar.style.display || 'flex';
        topbar.style.alignItems = topbar.style.alignItems || 'center';
      }
    }
  } catch (_) {}

  // ── Global CLOUD-REFRESH button (v6.316.0) ── pull the latest data from the cloud WITHOUT a
  // full page reload. Present on every screen (top-right of the page header). Soft refresh:
  // reads the authoritative cloud, element-merges it into state (keeps your unsaved local
  // edits), and re-renders in place with scroll preserved.
  if (!window.refreshFromCloud) {
    window.refreshFromCloud = async function (btn) {
      if (!(window.Storage && window.Storage.isCloud && window.Storage.isCloud())) { try { toast(t('Offline — nothing to pull from the cloud', 'غير متصل — لا شيء لجلبه'), 'info'); } catch (_) {} return; }
      if (btn) { btn.classList.add('bs-spin'); btn.disabled = true; }
      try {
        const remote = await window.Storage.readCloud();
        if (remote && typeof mergeRemoteIntoState === 'function') {
          mergeRemoteIntoState(remote);
          try { (typeof _renderKeepScroll === 'function') ? _renderKeepScroll() : render(); } catch (_) { try { render(); } catch (__) {} }
          try { toast(t('✓ Refreshed from cloud', '✓ تم التحديث من السحابة'), 'success'); } catch (_) {}
        } else { try { toast(t('No cloud data to load', 'لا توجد بيانات'), 'info'); } catch (_) {} }
      } catch (e) {
        try { toast(t('Refresh failed — check your connection', 'فشل التحديث — تحقق من الاتصال'), 'error'); } catch (_) {}
      } finally { if (btn) { btn.classList.remove('bs-spin'); btn.disabled = false; } }
    };
    try { if (!document.getElementById('bs-spin-style')) { const st = document.createElement('style'); st.id = 'bs-spin-style'; st.textContent = '@keyframes bs-spin-kf{to{transform:rotate(360deg)}}.bs-spin{animation:bs-spin-kf .8s linear infinite}'; document.head.appendChild(st); } } catch (_) {}
  }
  // (The refresh button lives in the SIDEBAR footer — a clean, always-visible menu item —
  //  so it never disturbs a page's own header layout. See renderSidebar / #sidebar-refresh.)

  // ── Session control button — REMOVED in the multi-document multi-user model ──
  // The lock/take-over icon belonged to the old single-writer design. With
  // per-record concurrent editing there is no "editing session" to hold, so the
  // button is no longer rendered. (openSessionManager() still exists for the
  // settings "connected devices" view, but is no longer surfaced here.)

  // Make every data table sortable by clicking its column headers.
  try { makeTablesSortable(main); } catch (_) {}
  // Keep it working for tables that appear AFTER this render — filter refreshes
  // that rebuild a table, tables inside modals, and async-loaded tables.
  try { setupSortObserver(); } catch (_) {}

  // Gentle data-safety nudge if it's been a while since the last backup.
  try { maybeShowBackupReminder(); } catch (_) {}
}

// ─── Generic sortable tables ─────────────────────────────────────
// Every table on every page becomes sortable by clicking a column header
// (numeric-, currency- and date-aware). Headers that already implement their
// own sort (th[data-sortkey], e.g. the Members table) are left untouched.
// Sorting reorders the CURRENT tbody rows (the visible page when paginated).
function makeTablesSortable(root) {
  const tables = (root || document).querySelectorAll('table');
  tables.forEach(table => {
    const headRow = table.tHead && table.tHead.rows[0];
    const body = table.tBodies && table.tBodies[0];
    if (!headRow || !body) return;
    Array.from(headRow.cells).forEach((th, colIdx) => {
      if (th.dataset.sortkey != null) return;          // page has its own sort
      if (th.dataset.sortable === '0') return;          // explicitly opted out
      if (!th.textContent.trim()) return;               // empty / action columns
      if (th.querySelector('input,select,button')) return;
      if (!th.classList.contains('th-sort')) {
        th.classList.add('th-sort');
        th.title = th.title || 'Click to sort';
        const ic = document.createElement('span');
        ic.className = 'th-sort-ic';
        ic.textContent = '⇅';
        th.appendChild(ic);
        th.addEventListener('click', () => {
          const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
          headRow.querySelectorAll('th').forEach(o => { delete o.dataset.dir; const i = o.querySelector('.th-sort-ic'); if (i) i.textContent = '⇅'; });
          th.dataset.dir = dir;
          const icEl = th.querySelector('.th-sort-ic'); if (icEl) icEl.textContent = dir === 'asc' ? '↑' : '↓';
          const rows = Array.from(body.rows);
          // Don't sort empty-state / spanning rows; keep them at the end.
          const sortable = rows.filter(r => !Array.from(r.cells).some(c => c.colSpan > 2));
          const rest = rows.filter(r => !sortable.includes(r));
          const cellVal = r => (r.cells[colIdx] ? r.cells[colIdx].textContent.trim() : '');
          const toNum = v => { const n = parseFloat(String(v).replace(/[,٬\s]/g, '').replace(/QAR|ر\.ق|%/g, '')); return isNaN(n) ? null : n; };
          const toDate = v => { const ts = Date.parse(v); return isNaN(ts) ? null : ts; };
          sortable.sort((a, b) => {
            const va = cellVal(a), vb = cellVal(b);
            const na = toNum(va), nb = toNum(vb);
            let cmp;
            if (na != null && nb != null) cmp = na - nb;
            else {
              const da = toDate(va), db = toDate(vb);
              if (da != null && db != null) cmp = da - db;
              else cmp = va.localeCompare(vb, undefined, { sensitivity: 'base' });
            }
            return dir === 'asc' ? cmp : -cmp;
          });
          sortable.forEach(r => body.appendChild(r));
          rest.forEach(r => body.appendChild(r));
        });
      }
    });
  });
}

// Re-apply sortable headers when tables appear after the initial page render —
// e.g. a filter change that rebuilds a table, a table inside a modal, or async
// data. makeTablesSortable is idempotent (already-enhanced headers are skipped),
// so a debounced full re-scan is safe and cheap, and can't loop on itself.
function setupSortObserver() {
  if (window.__sortObserver) return;
  let timer = null;
  const obs = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; try { makeTablesSortable(document.body); } catch (_) {} }, 150);
  });
  try { obs.observe(document.body, { childList: true, subtree: true }); } catch (_) { return; }
  window.__sortObserver = obs;
}

// ─── Auto-backup reminder ───────────────────────────────────────
// Browser-stored data has no server copy, so nudge the admin to export a
// JSON backup if it's been more than 7 days (snoozes for 3 days on dismiss).
// Shows at most once per session.
function maybeShowBackupReminder() {
  if (!state.user) return;                       // only when signed in
  if (window.__backupReminderShown) return;      // once per session
  const dataCount = (state.members?.length || 0) + (state.invoices?.length || 0);
  if (dataCount === 0) return;                    // nothing to lose yet

  const DAY = 86400000, now = Date.now();
  const cloud = isCloudStorage();
  const last = parseInt(localStorage.getItem('bs-last-backup') || '0', 10) || 0;
  const snooze = parseInt(localStorage.getItem('bs-backup-snooze') || '0', 10) || 0;
  // Cloud data is already safe in Firestore, so nudge far less often (30d vs 7d).
  if (now - last < (cloud ? 30 : 7) * DAY) return;   // backed up recently
  if (now - snooze < (cloud ? 14 : 3) * DAY) return; // recently snoozed

  window.__backupReminderShown = true;
  document.getElementById('backup-reminder')?.remove();

  const daysSince = last ? Math.floor((now - last) / DAY) : null;
  const msg = cloud
    ? `Your ${dataCount} records are saved in the cloud and sync across devices. A JSON export is a handy extra offline copy — optional, but nice to have.`
    : (daysSince == null
      ? `You haven't saved a backup yet. Your ${dataCount} records live only in this browser.`
      : `It's been ${daysSince} day${daysSince === 1 ? '' : 's'} since your last backup.`);
  const title = cloud ? 'Keep an extra copy?' : 'Time for a backup?';
  const icon = cloud ? '☁️' : '💾';

  const bar = el('div', { id: 'backup-reminder' });
  bar.style.cssText =
    'position:fixed;left:16px;bottom:16px;z-index:60;max-width:330px;' +
    'background:var(--surface);border:1px solid var(--border);border-radius:12px;' +
    'box-shadow:var(--shadow-md);padding:14px 16px;font-size:13px;color:var(--text)';
  bar.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px">
      <span style="font-size:18px;line-height:1">${icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;margin-bottom:2px">${title}</div>
        <div style="color:var(--text-dim);font-size:12px;line-height:1.4">${msg}</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn primary sm" id="backup-reminder-now">💾 ${cloud ? 'Export a copy' : 'Back up now'}</button>
          <button class="btn ghost sm" id="backup-reminder-later">Later</button>
        </div>
      </div>
    </div>`;
  document.body.append(bar);

  window.__hideBackupReminder = () => { document.getElementById('backup-reminder')?.remove(); };
  bar.querySelector('#backup-reminder-now').addEventListener('click', () => {
    if (typeof window.downloadBackup === 'function') window.downloadBackup();
    window.__hideBackupReminder();
  });
  bar.querySelector('#backup-reminder-later').addEventListener('click', () => {
    try { localStorage.setItem('bs-backup-snooze', String(Date.now())); } catch (_) {}
    window.__hideBackupReminder();
  });
}

function renderSidebar() {
  const collapsed = (() => { try { return localStorage.getItem('bs-sidebar-collapsed') === '1'; } catch (_) { return false; } })();
  const sb = el('aside', { className: 'sidebar' + (collapsed ? ' sidebar-collapsed' : '') });

  // Brand
  const brand = el('div', { className: 'brand' });
  brand.innerHTML = `
    <div class="brand-logo" style="background-image:url('${BRAND_LOGO}');background-size:cover;background-position:center;font-size:0;flex:0 0 auto"></div>
    <div style="flex:1 1 auto;min-width:0;overflow:hidden">
      <div class="brand-text" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Black Stars</div>
      <div class="brand-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Sports Club</div>
    </div>
    <button id="quick-theme" title="Cycle theme (Dark → Light → Cream → Colorful)" style="flex:0 0 auto;background:var(--surface-2);border:1px solid var(--border);cursor:pointer;font-size:18px;padding:6px 8px;border-radius:8px;color:var(--text)">${(() => {
      const t = getTheme();
      if (t === 'light') return '☀️';
      if (t === 'cream') return '📜';
      if (t === 'colorful') return '🎨';
      return '🌙';
    })()}</button>
  `;
  sb.append(brand);
  const themeBtn = brand.querySelector('#quick-theme');
  // Language DROP-DOWN — English / العربية / Français. Affects the member-facing screens + RTL
  // (Arabic only; French is LTR). (v6.442 — was a cycle button)
  const langBtn = el('select', { id: 'quick-lang', title: 'English / العربية / Français' });
  // COMPACT language switcher — the selected value shows just a short code (EN/ع/FR) so it always fits
  // the narrow sidebar header + mobile without clipping; the 3 options are still the short codes when
  // opened. (v6.447 — full names clipped the header, so use codes.)
  langBtn.innerHTML = [['en', 'EN'], ['ar', 'ع'], ['fr', 'FR']]
    .map(([code, label]) => `<option value="${code}"${getLang() === code ? ' selected' : ''}>${label}</option>`).join('');
  langBtn.addEventListener('change', () => { setLang(langBtn.value); render(); });
  langBtn.style.cssText = 'flex:0 0 auto;width:auto;min-width:0;box-sizing:border-box;background:var(--surface-2);border:1px solid var(--border);cursor:pointer;font-size:12px;font-weight:700;padding:6px 4px;border-radius:8px;color:var(--text);margin-left:4px';
  brand.append(langBtn);

  // Notification bell (Facebook-style). Shows a red count badge and a dropdown
  // list of role-aware alerts (next class, expiry, low classes, balance, etc.).
  // v6.430 — Facebook-style floating notification bell pinned to the TOP-RIGHT corner of the
  // viewport. It lives on <body> (which render() wipes+rebuilds each pass, so no duplicates) so
  // no sidebar ancestor's positioning affects it. The dropdown opens below it, right-aligned.
  try { document.getElementById('bs-notif-float')?.remove(); } catch (_) {}
  const notifWrap = el('div', { id: 'bs-notif-float', className: 'notif-wrap' });
  notifWrap.style.cssText = 'position:fixed;top:12px;right:16px;z-index:1300';
  const notifCount = (() => { try { return notificationCount(); } catch (_) { return 0; } })();
  const bellBtn = el('button', { id: 'quick-notif', title: t('Notifications', 'الإشعارات') }, '🔔');
  bellBtn.style.cssText = 'background:var(--surface);border:1px solid var(--border);cursor:pointer;font-size:18px;width:42px;height:42px;border-radius:50%;color:var(--text);position:relative;box-shadow:0 4px 14px rgba(0,0,0,.18);display:inline-flex;align-items:center;justify-content:center';
  if (notifCount > 0) {
    const badge = el('span', { className: 'notif-badge' }, notifCount > 9 ? '9+' : String(notifCount));
    badge.style.cssText = 'position:absolute;top:-3px;right:-3px;background:var(--red);color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid var(--surface)';
    bellBtn.append(badge);
  }
  bellBtn.onclick = (ev) => { ev.stopPropagation(); toggleNotifPanel(notifWrap); };
  notifWrap.append(bellBtn);
  try { document.body.append(notifWrap); } catch (_) { brand.append(notifWrap); }

  // Collapse / expand toggle (desktop). Its own clearly-labelled row so it's easy
  // to find. Persists across sessions.
  const collapseBtn = el('button', {
    className: 'sidebar-collapse-btn',
    title: 'Collapse / expand the menu',
    onclick: () => {
      const isNow = sb.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem('bs-sidebar-collapsed', isNow ? '1' : '0'); } catch (_) {}
      collapseBtn.innerHTML = isNow ? '»' : '<span class="icon">«</span><span class="lbl">' + t('Collapse menu', 'طيّ القائمة') + '</span>';
    },
  });
  collapseBtn.innerHTML = sb.classList.contains('sidebar-collapsed') ? '»' : '<span class="icon">«</span><span class="lbl">' + t('Collapse menu', 'طيّ القائمة') + '</span>';
  sb.append(collapseBtn);

  if (themeBtn) themeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = THEMES.indexOf(getTheme());
    const next = THEMES[(idx + 1) % THEMES.length];
    // Apply theme BEFORE re-render so colors flip immediately via CSS variables
    setTheme(next);
    // Re-render so theme-card borders / "✓ Active" badges on Settings page refresh.
    // (Re-rendering wipes the body, so toast must come AFTER render or it'll be erased.)
    render();
    // Show confirmation AFTER render (otherwise the body wipe erases the toast)
    toast(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`);
  });

  // Role banner. An ADMIN previewing another role gets an "Exit" button back to
  // full access. A real coach/student login is locked to its role — no exit.
  if (currentRole() !== 'admin') {
    const isAdminPreview = accountRole() === 'admin';
    // Show the actual person's name (not just "Student"/"Coach"), and use a pink
    // accent for female members.
    let who = ROLE_LABELS[currentRole()] || currentRole();
    let pink = false;
    if (currentRole() === 'student') {
      const mm = state.members.find(x => x.id === effectiveMemberId());
      if (mm) { who = mm.name; pink = (mm.gender === 'Female'); }
    } else if (currentRole() === 'coach') {
      who = coachName(effectiveCoachId()) || who;
    }
    const accent = pink ? '236,72,153' : '245,158,11';   // pink vs amber
    // Multi-coach account (v6.491): a switcher to pick WHICH of the account's coaches is
    // active — every coach-scoped screen (home / salary / attendance / schedule / students)
    // then focuses on that coach. Only shown when the login is linked to more than one.
    let coachSwitcher = '';
    if (currentRole() === 'coach' && typeof effectiveCoachIds === 'function') {
      const myIds = effectiveCoachIds();
      if (myIds.length > 1) {
        const cur = effectiveCoachId();
        const opts = myIds.map(id => `<option value="${id}" ${String(id) === String(cur) ? 'selected' : ''}>${escapeHtml(coachName(id) || ('Coach ' + id))}</option>`).join('');
        coachSwitcher = `<select onchange="setActiveCoach(this.value)" title="${t('Switch which coach you are managing', 'بدّل المدرب الذي تديره')}" style="margin-inline-start:6px;padding:2px 6px;border-radius:6px;border:1px solid rgba(${accent},.55);background:var(--surface);color:var(--text);font-size:11px;max-width:120px">${opts}</select>`;
      }
    }
    // Family login (v6.492): a member switcher — pick which family member the student-scoped
    // screens focus on. Only shown when the login is linked to more than one member.
    if (currentRole() === 'student' && typeof effectiveMemberIds === 'function') {
      const myMids = effectiveMemberIds();
      if (myMids.length > 1) {
        const curM = effectiveMemberId();
        const optsM = myMids.map(id => { const mm = state.members.find(x => x.id === id) || {}; return `<option value="${id}" ${String(id) === String(curM) ? 'selected' : ''}>${escapeHtml(mm.name || ('Member ' + id))}</option>`; }).join('');
        coachSwitcher += `<select onchange="setActiveMember(this.value)" title="${t('Switch family member', 'بدّل فرد العائلة')}" style="margin-inline-start:6px;padding:2px 6px;border-radius:6px;border:1px solid rgba(${accent},.55);background:var(--surface);color:var(--text);font-size:11px;max-width:140px">${optsM}</select>`;
      }
    }
    const banner = el('div', {});
    banner.style.cssText = `margin:8px 12px;padding:8px 10px;background:rgba(${accent},.14);border:1px solid rgba(${accent},.4);border-radius:8px;font-size:11px;display:flex;align-items:center;gap:8px;flex-wrap:wrap`;
    const roleLbl = t(ROLE_LABELS[currentRole()] || currentRole(), ROLE_LABELS_AR[currentRole()]);
    banner.innerHTML = `<span style="flex:1">${isAdminPreview ? t('👁 Previewing as', '👁 معاينة كـ') : t('🔒 Signed in as', '🔒 تسجيل الدخول كـ')} <b>${escapeHtml(who)}</b> <span style="opacity:.7">· ${roleLbl}</span></span>${coachSwitcher}`;
    if (isAdminPreview) {
      const exit = el('button', {
        onclick: () => { state.session = { role: 'admin' }; save(); navigate('dashboard'); toast('Back to Admin'); },
        title: 'Exit preview and return to full Admin access',
      }, 'Exit');
      exit.style.cssText = 'background:var(--accent-2);color:#fff;border:none;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer';
      banner.append(exit);
    }
    sb.append(banner);
  }

  // Navigation. COACH & STUDENT get ONE flat, uncategorized list (their menus are short);
  // ADMIN & RECEPTION keep the classic collapsible CATEGORY groups (v6.422 — the flat list
  // was reverted for them per owner request; only the two simple roles stay flat).
  const nav = el('nav', { className: 'nav' });
  // Primary set first, then a visual SEPARATOR, then the "more" set (owner layout, v6.432).
  const sections = ['Main','Membership','Attendance','Activities','Finance','Shop','Summer Camp','Engagement','Advice','Team & Sports','Insights','System'];
  const MORE_SECTIONS = new Set(['Engagement','Advice','Team & Sports','Insights','System']);
  const SECTION_AR = { Main: 'الرئيسية', Membership: 'العضوية', Engagement: 'التواصل', Activities: 'الأنشطة', Attendance: 'الحضور', Advice: 'النصائح', 'Summer Camp': 'المعسكر الصيفي', 'Team & Sports': 'الفريق والرياضات', Finance: 'المالية', Shop: 'المتجر', Insights: 'التقارير', System: 'النظام' };
  const flatNav = (currentRole() === 'coach' || currentRole() === 'student');
  const accessibleIn = (section) => Object.entries(ROUTES).filter(([key, route]) =>
    route.section === section && !route.hidden && roleCanAccess(currentRole(), key)
    && (!route.memberOnly || currentRole() === 'student')
    && (!route.coachOnly || currentRole() === 'coach')
    && (!route.adminOnly || currentRole() === 'admin'));
  const makeNavItem = (key, route) => {
    const item = el('button', { className: 'nav-item' + (state.route === key ? ' active' : ''), onclick: () => navigate(key) });
    item.innerHTML = `<span class="icon">${route.icon}</span><span>${t(route.label, NAV_AR[key] || route.label)}</span>`;
    if (typeof route.badge === 'function') {
      let n = 0; try { n = route.badge() || 0; } catch (_) { n = 0; }
      if (n > 0) {
        const b = el('span', { className: 'nav-badge' });
        b.textContent = n > 99 ? '99+' : String(n);
        b.style.cssText = 'margin-left:auto;background:var(--red);color:#fff;font-size:10px;font-weight:700;min-width:18px;height:18px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px';
        item.append(b);
      }
    }
    return item;
  };

  if (flatNav) {
    // Coach & student — flat, in the same section order, no group headings.
    for (const section of sections) for (const [key, route] of accessibleIn(section)) nav.append(makeNavItem(key, route));
  } else {
    // Admin & reception — collapsible category groups (persisted; the group holding the
    // current route always stays open so you never lose your place).
    const collapsedGroups = (() => { try { return new Set(JSON.parse(localStorage.getItem('bs-nav-collapsed') || '[]')); } catch (_) { return new Set(); } })();
    let _dividerPlaced = false;
    for (const section of sections) {
      const entries = accessibleIn(section);
      if (!entries.length) continue;
      // Separator between the primary set and the "more" set (only once, only if both have content).
      if (!_dividerPlaced && MORE_SECTIONS.has(section) && nav.childNodes.length) {
        const div = el('div', { className: 'nav-divider' });
        div.style.cssText = 'height:1px;background:var(--border);margin:12px 14px;opacity:.7';
        nav.append(div);
        _dividerPlaced = true;
      }
      const hasActive = entries.some(([key]) => key === state.route);
      const startCollapsed = collapsedGroups.has(section) && !hasActive;
      const header = el('button', { className: 'nav-section nav-section-toggle' + (startCollapsed ? ' collapsed' : '') });
      header.innerHTML = `<span>${t(section, SECTION_AR[section] || section)}</span><span class="nav-section-chev">▾</span>`;
      const group = el('div', { className: 'nav-group' + (startCollapsed ? ' nav-group-collapsed' : '') });
      header.addEventListener('click', () => {
        const nowCollapsed = group.classList.toggle('nav-group-collapsed');
        header.classList.toggle('collapsed', nowCollapsed);
        if (nowCollapsed) collapsedGroups.add(section); else collapsedGroups.delete(section);
        try { localStorage.setItem('bs-nav-collapsed', JSON.stringify([...collapsedGroups])); } catch (_) {}
      });
      for (const [key, route] of entries) group.append(makeNavItem(key, route));
      nav.append(header); nav.append(group);
    }
  }
  sb.append(nav);

  // Footer (user info)
  const footer = el('div', { className: 'sidebar-footer' });
  const _nm = state.user.name || 'User';
  const _initials = (_nm.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') || 'U').toUpperCase();
  // A signed-in coach gets their sport-based avatar; everyone else keeps initials.
  const _coachRec = (accountRole() === 'coach' && typeof myCoach === 'function') ? myCoach() : null;
  const _avatarHtml = _coachRec ? coachAvatarHtml(_coachRec, 34) : `<div class="avatar">${escapeHtml(_initials)}</div>`;
  const _roleLabel = t(ROLE_LABELS[accountRole()] || 'Administrator', ROLE_LABELS_AR[accountRole()]);
  const _isCloud = !!(window.Storage && window.Storage.isCloud && window.Storage.isCloud());
  const _isAdmin = accountRole() === 'admin';
  const _footMoreCollapsed = (() => { try { return localStorage.getItem('bs-foot-collapsed') !== '0'; } catch (_) { return true; } })();
  footer.innerHTML = `
    <div class="nav-foot-sep" style="height:1px;background:var(--border);margin:0 12px 12px;opacity:.7"></div>
    <button class="nav-section nav-section-toggle${_footMoreCollapsed ? ' collapsed' : ''}" id="foot-more-toggle"><span>${t('More', 'المزيد')}</span><span class="nav-section-chev">▾</span></button>
    <div class="nav-group${_footMoreCollapsed ? ' nav-group-collapsed' : ''}" id="foot-more-group">
      <div class="user-pill" style="margin-bottom:6px">
        ${_avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(_nm)}</div>
          <div style="font-size:10px;color:var(--text-mute)">${escapeHtml(_roleLabel)} · v${APP_VERSION} · ${_isCloud ? '☁️ cloud' : '💾 offline'}</div>
        </div>
      </div>
      ${_isCloud ? `<button class="btn ghost sm full" id="sidebar-refresh" style="margin-bottom:6px;display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left" title="${t('Pull the latest data from the cloud — no page reload','جلب أحدث البيانات من السحابة — بدون إعادة تحميل')}"><span class="sidebar-refresh-ic" style="width:18px;text-align:center;flex-shrink:0">🔄</span><span style="flex:1;min-width:0">${t('Refresh from cloud','تحديث من السحابة')}</span></button>` : ''}
      ${_isAdmin ? `<button class="btn ghost sm full" id="sidebar-cmdk" style="margin-bottom:6px;display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left" title="Quick search (Ctrl+K / ⌘K)"><span style="width:18px;text-align:center;flex-shrink:0">🔎</span><span style="flex:1;min-width:0">${t('Quick search','بحث سريع')}</span><span style="margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:9px;padding:1px 4px;background:var(--surface);border:1px solid var(--border);border-radius:4px;flex-shrink:0">⌘K</span></button>` : ''}
      ${_isAdmin ? `<button class="btn ghost sm full" id="sidebar-backup" style="margin-bottom:6px;display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left" title="Download a full JSON backup of your data"><span style="width:18px;text-align:center;flex-shrink:0">💾</span><span style="flex:1;min-width:0">${t('Quick backup','نسخة احتياطية سريعة')}</span></button>` : ''}
      ${_isCloud ? `<button class="btn ghost sm full" id="sidebar-changepw" style="margin-bottom:6px;display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left" title="Change your sign-in password"><span style="width:18px;text-align:center;flex-shrink:0">🔐</span><span style="flex:1;min-width:0">${t('Change password','تغيير كلمة المرور')}</span></button>` : ''}
      <a href="guide.html" target="_blank" class="btn ghost sm full" style="margin-bottom:6px;text-decoration:none;display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left"><span style="width:18px;text-align:center;flex-shrink:0">📖</span><span style="flex:1;min-width:0">${t('User Guide','دليل الاستخدام')}</span></a>
    </div>
    <button class="btn ghost sm full" id="logout-btn" style="display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left"><span style="width:18px;text-align:center;flex-shrink:0">🚪</span><span style="flex:1;min-width:0">${t('Sign out','تسجيل الخروج')}</span></button>
  `;
  sb.append(footer);
  const _ft = footer.querySelector('#foot-more-toggle');
  const _fg = footer.querySelector('#foot-more-group');
  if (_ft && _fg) _ft.addEventListener('click', () => {
    const nowCollapsed = _fg.classList.toggle('nav-group-collapsed');
    _ft.classList.toggle('collapsed', nowCollapsed);
    try { localStorage.setItem('bs-foot-collapsed', nowCollapsed ? '1' : '0'); } catch (_) {}
  });
  footer.querySelector('#logout-btn').addEventListener('click', logout);
  const _bk = footer.querySelector('#sidebar-backup');
  if (_bk) _bk.addEventListener('click', () => {
    if (typeof window.downloadBackup === 'function') window.downloadBackup();
    else toast('Backup function not loaded yet', 'error');
  });
  const _ck = footer.querySelector('#sidebar-cmdk');
  if (_ck) _ck.addEventListener('click', () => { if (typeof openCmdK === 'function') openCmdK(); });
  const _cp = footer.querySelector('#sidebar-changepw');
  if (_cp) _cp.addEventListener('click', () => { if (typeof window.promptPasswordChange === 'function') window.promptPasswordChange(false); });
  const _rf = footer.querySelector('#sidebar-refresh');
  if (_rf) _rf.addEventListener('click', () => { const ic = _rf.querySelector('.sidebar-refresh-ic'); if (typeof window.refreshFromCloud === 'function') window.refreshFromCloud(ic); });

  return sb;
}

// ─── Page registry (filled in pages.js) ──────────────────────────
const PAGES = {};

// ─── Persistent filter helpers ──────────────────────────────────────
// Page-level filter state survives navigation within a session, so admin
// doesn't have to re-pick "Active" / sport / coach every time they switch
// pages. Stored in sessionStorage (per-tab); resets on browser close.
function loadFilter(pageKey, defaults) {
  try {
    const raw = sessionStorage.getItem('bs-filter-' + pageKey);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch { return { ...defaults }; }
}
function saveFilter(pageKey, filter) {
  try { sessionStorage.setItem('bs-filter-' + pageKey, JSON.stringify(filter)); }
  catch {}
}

// ─── Recently viewed members (last 5, per-tab) ──────────────────
function pushRecentMember(memberId) {
  if (!memberId) return;
  let list = [];
  try { list = JSON.parse(sessionStorage.getItem('bs-recent-members') || '[]'); }
  catch { list = []; }
  list = [memberId, ...list.filter(id => id !== memberId)].slice(0, 5);
  try { sessionStorage.setItem('bs-recent-members', JSON.stringify(list)); }
  catch {}
}
function getRecentMembers() {
  try {
    const ids = JSON.parse(sessionStorage.getItem('bs-recent-members') || '[]');
    return ids.map(id => state.members.find(m => m.id === id)).filter(Boolean);
  } catch { return []; }
}

// ─── Init ──────────────────────────────────────────────────────────
// ─── Theme manager ──────────────────────────────────────────────────
const THEMES = ['dark', 'light', 'cream', 'colorful'];
const LS_THEME_KEY = 'blackstars-crm-theme';
const DEFAULT_THEME = 'light';

function getTheme() {
  return localStorage.getItem(LS_THEME_KEY) || DEFAULT_THEME;
}
function setTheme(name) {
  if (!THEMES.includes(name)) name = DEFAULT_THEME;
  if (name === 'dark') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem(LS_THEME_KEY, name);
}
// Apply saved theme as early as possible (before render to avoid flash)
setTheme(getTheme());

// ─── Language (English / Arabic) ───────────────────────────────
// Member-facing screens (login, My Membership, My Advice, the student/coach nav,
// change-password) are translated. Admin/back-office screens stay English.
// FRENCH (fr) — added as a THIRD language (v6.437). To avoid editing the thousands of existing
// t(en, ar) call sites, French is a dictionary keyed by the ENGLISH string: when French is active,
// t() returns FR_STRINGS[en] if present, else falls back to the English text. French is LTR (unlike
// Arabic's RTL). Extend FR_STRINGS to translate more of the member-facing UI over time.
const FR_STRINGS = {
  // ── French batch 2 (v6.460) ──
  'Renewals by Member': 'Renouvellements par membre',
  'Students per Coach': 'Élèves par coach',
  'This month coaches': 'Coachs de ce mois',
  'Duplicate products': 'Produits en double',
  'No duplicate products': 'Aucun produit en double',
  'Clear date filters': 'Effacer les filtres de date',
  'Sign in to continue': 'Connectez-vous pour continuer',
  'Enter your password': 'Saisissez votre mot de passe',
  'Expired memberships': 'Adhésions expirées',
  'Revenue vs Expenses': 'Revenus vs dépenses',
  'No enrollment dates': 'Aucune date d’inscription',
  'To expire ≤ 30 days': 'Expire ≤ 30 jours',
  'Apply carry-forward': 'Appliquer le report',
  'students unassigned': 'élèves non assignés',
  'No members selected': 'Aucun membre sélectionné',
  'Household disbanded': 'Foyer dissous',
  'Enter a family name': 'Saisir un nom de famille',
  'Members in families': 'Membres dans des familles',
  'Remove this payment': 'Supprimer ce paiement',
  'Outstanding balance': 'Solde impayé',
  'Summary by activity': 'Résumé par activité',
  'Remind all expiring': 'Rappeler tous les expirants',
  'Delete this driver?': 'Supprimer ce chauffeur ?',
  'Assign selected to:': 'Assigner la sélection à :',
  'Pick a member first': 'Choisissez d’abord un membre',
  'Customer (snapshot)': 'Client (instantané)',
  'Collected by method': 'Encaissé par méthode',
  'Products in catalog': 'Produits au catalogue',
  'Start date required': 'Date de début requise',
  'Message on WhatsApp': 'Message sur WhatsApp',
  'No pay history yet.': 'Aucun historique de paie.',
  'Also notify coaches': 'Notifier aussi les coachs',
  'Attendance by Coach': 'Présence par coach',
  'Detailed Statistics': 'Statistiques détaillées',
  'Commission by Coach': 'Commission par coach',
  'Commission by member': 'Commission par membre',
  'Transfer membership': 'Transférer l’adhésion',
  'Enrollment mismatch': 'Incohérence d’inscription',
  'Re-sync enrollments': 'Resynchroniser les inscriptions',
  'Finished all classes': 'Tous les cours terminés',
  'finished all classes': 'tous les cours terminés',
  'Court Rental Revenue': 'Revenu de location de terrain',
  'e.g. Al-Marri family': 'ex. famille Al-Marri',
  'Shared contact phone': 'Téléphone de contact partagé',
  'Needs transportation': 'Nécessite un transport',
  'Company share to pay': 'Part de l’entreprise à payer',
  'Big balances (≥1000)': 'Gros soldes (≥1000)',
  'set gender/birthdate': 'définir sexe/date de naissance',
  'collected this month': 'encaissé ce mois',
  'Collapse every class': 'Réduire toutes les classes',
  'Create a group first': 'Créez d’abord un groupe',
  'Auto-group swimmers?': 'Grouper auto les nageurs ?',
  'Sport not on invoice': 'Sport absent de la facture',
  'Remove phantom & fix': 'Supprimer le fantôme et corriger',
  'earliest sport start': 'début de sport le plus tôt',
  'Needs a quick repair': 'Nécessite une réparation rapide',
  'duplicate payment(s)': 'paiement(s) en double',
  'duplicate invoice(s)': 'facture(s) en double',
  'Edit cash collection': 'Modifier l’encaissement',
  'Current cash in hand': 'Espèces en caisse actuelles',
  'Amount counted (QAR)': 'Montant compté (QAR)',
  'Your name (optional)': 'Votre nom (optionnel)',
  'No non-cash payments': 'Aucun paiement hors espèces',
  'Cash collected (all)': 'Espèces encaissées (tout)',
  'Salaries paid (cash)': 'Salaires payés (espèces)',
  'save this attendance': 'enregistrer cette présence',
  'clear this attendance': 'effacer cette présence',
  'Start / renewal date': 'Date de début / renouvellement',
  'Subscription updated': 'Abonnement mis à jour',
  'Freeze my membership': 'Geler mon adhésion',
  'No students to list.': 'Aucun élève à lister.',
  'My students expiring': 'Mes élèves expirant',
  'No coach advice yet.': 'Aucun conseil de coach.',
  'Confirm new password': 'Confirmer le nouveau mot de passe',
  'transferable members': 'membres transférables',
  'No misdated invoices': 'Aucune facture mal datée',
  'Consolidate invoices': 'Consolider les factures',
  'Ask an admin, or wait': 'Demandez à un admin, ou attendez',
  'removed on the server': 'supprimé sur le serveur',
  'present on the server': 'présent sur le serveur',
  'No cloud data to load': 'Aucune donnée cloud à charger',
  'Needs attention today': 'Nécessite attention aujourd’hui',
  'Local cache (offline)': 'Cache local (hors ligne)',
  'Memberships + classes': 'Adhésions + cours',
  'will be marked as due': 'sera marqué comme dû',
  'No other active coach': 'Aucun autre coach actif',
  'Collect a new payment': 'Encaisser un nouveau paiement',
  'No payments recorded.': 'Aucun paiement enregistré.',
  'Contributing invoices': 'Factures contributives',
  'No revenue this month': 'Aucun revenu ce mois',
  'Class name (optional)': 'Nom du cours (optionnel)',
  'Payment ledger review': 'Revue du registre des paiements',
  'Since your checkpoint': 'Depuis votre point de contrôle',
  'leakage (unaccounted)': 'fuite (non comptabilisée)',
  'Expected cash in hand': 'Espèces attendues en caisse',
  'Search description...': 'Rechercher description...',
  'Switch reconciliation': 'Réconciliation de changement',
  'amount paid for stock': 'montant payé pour le stock',
  'at or below threshold': 'au niveau ou sous le seuil',
  'All (reminded or not)': 'Tous (rappelés ou non)',
  'replies from students': 'réponses des élèves',
  'Write a message first': 'Écrivez d’abord un message',
  '🔐 Set a new password': '🔐 Définir un nouveau mot de passe',
  'at least 6 characters': 'au moins 6 caractères',
  'Salary cost per month': 'Coût salarial par mois',
  'receives a full reset': 'reçoit une réinitialisation complète',
  'No transactions match': 'Aucune transaction correspondante',
  'Messy payment ledgers': 'Registres de paiement désordonnés',
  'birthday(s) this month': 'anniversaire(s) ce mois',
  'number of days, e.g. 8': 'nombre de jours, ex. 8',
  'Removed from household': 'Retiré du foyer',
  'Edit pricing & payment': 'Modifier tarif et paiement',
  'Facility Company Share': 'Part de l’entreprise du site',
  'Reminded twice already': 'Déjà rappelé deux fois',
  'Auto from gender + age': 'Auto selon sexe + âge',
  'cash + card + transfer': 'espèces + carte + virement',
  'scheduled, no students': 'planifié, aucun élève',
  'Students in this class': 'Élèves de ce cours',
  'No unassigned swimmers': 'Aucun nageur non assigné',
  'Record cash collection': 'Enregistrer l’encaissement',
  'Where the revenue went': 'Où est passé le revenu',
  'Cash spent on expenses': 'Espèces dépensées en frais',
  'Enter a payment amount': 'Saisir un montant de paiement',
  'Payment saved to cloud': 'Paiement enregistré dans le cloud',
  'Coach Commission Rates': 'Taux de commission des coachs',
  'Detailed statistics': 'Statistiques détaillées',
  'Court Rental': 'Location de terrain',
  'Boxing Room': 'Salle de boxe',
  'Household': 'Foyer',
  // ── French batch (v6.460) ──
  'This cannot be undone.': 'Cette action est irréversible.',
  'Admins only.': 'Administrateurs uniquement.',
  'Excel export failed': 'Échec de l’export Excel',
  'Excel export unavailable': 'Export Excel indisponible',
  'NOT saved in the cloud': 'NON enregistré dans le cloud',
  'NOT saved to the cloud': 'NON enregistré dans le cloud',
  'Allow pop-ups to print': 'Autorisez les pop-ups pour imprimer',
  'years': 'années',
  'All years': 'Toutes les années',
  '— no driver —': '— aucun chauffeur —',
  'QAR sell value': 'Valeur de vente QAR',
  'QAR cost value': 'Valeur de coût QAR',
  'Corrupted / drift': 'Corrompu / dérive',
  'Invoice not found': 'Facture introuvable',
  'Data Health Check': 'Vérification des données',
  'Fix invoice dates': 'Corriger les dates de facture',
  'Record cash count': 'Enregistrer le comptage de caisse',
  'Refresh from cloud': 'Actualiser depuis le cloud',
  'Refreshed from cloud': 'Actualisé depuis le cloud',
  'Permanently delete': 'Supprimer définitivement',
  'Delete permanently': 'Supprimer définitivement',
  'Enter a driver name': 'Saisir un nom de chauffeur',
  'Cash count recorded': 'Comptage de caisse enregistré',
  'Cash count updated': 'Comptage de caisse mis à jour',
  'Cash taken by owner': 'Espèces prises par le propriétaire',
  'Write a reply first': 'Écrivez d’abord une réponse',
  'New advice / article': 'Nouveau conseil / article',
  'Verify against cloud': 'Vérifier avec le cloud',
  'paying in full (Cash)': 'paiement intégral (Espèces)',
  'Search name or phone…': 'Rechercher nom ou téléphone…',
  'Search name, phone, QID...': 'Rechercher nom, téléphone, QID...',
  'Search name (EN/AR) or mobile…': 'Rechercher nom (EN/AR) ou mobile…',
  'Duplicate enrollments': 'Inscriptions en double',
  'Duplicate subscriptions': 'Abonnements en double',
  'Create a new household': 'Créer un nouveau foyer',
  'e.g. Al-Jarboei family': 'ex. famille Al-Jarboei',
  'Filter by amount range': 'Filtrer par plage de montant',
  'Fix duplicate payments': 'Corriger les paiements en double',
  'Fix duplicate subscriptions': 'Corriger les abonnements en double',
  'Bank credit (non-cash)': 'Crédit bancaire (hors espèces)',
  'Renewal revenue potential': 'Potentiel de revenu de renouvellement',
  'Renewal potential': 'Potentiel de renouvellement',
  'Add to existing household': 'Ajouter à un foyer existant',
  'Invoice permanently deleted': 'Facture supprimée définitivement',
  'Paid now — amount per method': 'Payé maintenant — montant par méthode',
  'Admins or receptionists only': 'Administrateurs ou réceptionnistes uniquement',
  'Member added & saved to cloud': 'Membre ajouté et enregistré dans le cloud',
  'No advice from your coach yet.': 'Aucun conseil de votre coach pour le moment.',
  'Shared contact phone (optional)': 'Téléphone de contact partagé (optionnel)',
  'All 3 reminders sent this cycle': 'Les 3 rappels envoyés ce cycle',
  'No students assigned to you yet.': 'Aucun élève ne vous est assigné.',
  'Nothing to update on this invoice': 'Rien à mettre à jour sur cette facture',
  'Only an admin can apply an import': 'Seul un administrateur peut appliquer un import',
  'Still failing — will keep retrying': 'Échec persistant — nouvelle tentative en cours',
  'Only an admin can restore a backup': 'Seul un administrateur peut restaurer une sauvegarde',
  'Check your connection and try again.': 'Vérifiez votre connexion et réessayez.',
  'Pick a household or enter a new name': 'Choisissez un foyer ou saisissez un nouveau nom',
  'Filter:': 'Filtre :',
  '(rename)': '(renommer)',
  'statuses': 'statuts',
  '— pick —': '— choisir —',
  'member(s)': 'membre(s)',
  'Add Member': 'Ajouter un membre',
  'OVER LIMIT': 'LIMITE DÉPASSÉE',
  '(untitled)': '(sans titre)',
  'This device:': 'Cet appareil :',
  'another user': 'un autre utilisateur',
  'duplicate(s)': 'doublon(s)',
  'duplicate row(s)': 'ligne(s) en double',
  'nationalities': 'nationalités',
  'All nationalities': 'Toutes les nationalités',
  'Custom range…': 'Plage personnalisée…',
  'Custom (days)…': 'Personnalisé (jours)…',
  'installment(s)': 'versement(s)',
  'Exceeds fee by': 'Dépasse les frais de',
  'Camp to recalc': 'Camp à recalculer',
  '🔒 Signed in as': '🔒 Connecté en tant que',
  'Find Duplicates': 'Trouver les doublons',
  'amount mismatch': 'montant incohérent',
  'also settle the': 'régler aussi',
  'months selected': 'mois sélectionnés',
  'no months match': 'aucun mois correspondant',
  'Saving to cloud…': 'Enregistrement dans le cloud…',
  'Saving to the cloud…': 'Enregistrement dans le cloud…',
  'Auto sign-out in': 'Déconnexion auto dans',
  '👁 Previewing as': '👁 Aperçu en tant que',
  '(saved to cloud)': '(enregistré dans le cloud)',
  'Saved in the cloud': 'Enregistré dans le cloud',
  'Saved to household': 'Enregistré dans le foyer',
  'Membership billed': 'Adhésion facturée',
  'ready to generate': 'prêt à générer',
  'Update checkpoint': 'Mettre à jour le point de contrôle',
  'Set checkpoint now': 'Définir le point de contrôle',
  'Repair duplicates': 'Réparer les doublons',
  'Remove duplicates': 'Supprimer les doublons',
  'Already collected': 'Déjà encaissé',
  'not yet collected': 'pas encore encaissé',
  'Delete this entry': 'Supprimer cette entrée',
  'excludes salaries': 'hors salaires',
  'Record collection': 'Enregistrer l’encaissement',
  'Paid via expenses': 'Payé via les dépenses',
  'No products match': 'Aucun produit correspondant',
  'mark this absence': 'marquer cette absence',
  'Edit subscription': 'Modifier l’abonnement',
  'Attendance report': 'Rapport de présence',
  'Attendance summary': 'Résumé de présence',
  'Membership expiry': 'Expiration de l’adhésion',
  'Membership history': 'Historique d’adhésion',
  'This month salary': 'Salaire de ce mois',
  'Selected students': 'Élèves sélectionnés',
  'Nothing here yet.': 'Rien ici pour le moment.',
  'No notes here yet': 'Aucune note ici',
  'Delete this post?': 'Supprimer cette publication ?',
  'Delete this note?': 'Supprimer cette note ?',
  'Renewals by Sport': 'Renouvellements par sport',
  'Which membership?': 'Quelle adhésion ?',
  'Ready to transfer': 'Prêt à transférer',
  'Nothing to remove': 'Rien à supprimer',
  'in stock combined': 'en stock au total',
  'Misdated invoices': 'Factures mal datées',
  'Need renewal now →': 'À renouveler maintenant →',
  'renewing this week': 'renouvellement cette semaine',
  'Loaded from server': 'Chargé depuis le serveur',
  'documents in cloud': 'documents dans le cloud',
  'Nothing lost since': 'Rien perdu depuis',
  'Verify data safety': 'Vérifier la sécurité des données',
  'Monthly comparison': 'Comparaison mensuelle',
  'Active enrollments': 'Inscriptions actives',
  'Local auto-backups': 'Sauvegardes auto locales',
  'Filters are hiding': 'Les filtres masquent',
  'Click to filter by': 'Cliquer pour filtrer par',
  'To expire ≤ 3 days': 'Expire ≤ 3 jours',
  'To expire ≤ 7 days': 'Expire ≤ 7 jours',
  'Rename this device': 'Renommer cet appareil',
  'Family / household': 'Famille / foyer',
  'Remove from family': 'Retirer de la famille',
  'No households yet.': 'Aucun foyer pour le moment.',
  'to pay the company': 'à payer à l’entreprise',
  'Expand every class': 'Développer toutes les classes',
  'carry-forward from': 'report depuis',
  'Earlier this month': 'Plus tôt ce mois-ci',
  'No WhatsApp number': 'Aucun numéro WhatsApp',
  'Clear all payments': 'Effacer tous les paiements',
  'Sessions remaining': 'Séances restantes',
  'Renew Subscription': 'Renouveler l’abonnement',
  'one row per member': 'une ligne par membre',
  'Finished (classes)': 'Terminé (classes)',
  'Open the entry for': 'Ouvrir l’entrée pour',
  'Pending commission': 'Commission en attente',
  '⚠ = low attendance': '⚠ = faible présence',
  'e.g. Training tips': 'ex. conseils d’entraînement',
  'Club announcements': 'Annonces du club',
  'Coach advice (all)': 'Conseils du coach (tous)',
  '🔐 Change password': '🔐 Changer le mot de passe',
  'Delete this entry?': 'Supprimer cette entrée ?',
  'A new version is available': 'Une nouvelle version est disponible',
  'Email or mobile number': 'E-mail ou numéro de mobile',
  'Are you still there?': 'Êtes-vous toujours là ?',
  'Signed out for inactivity': 'Déconnecté pour inactivité',
  'Membership expiring soon': 'Adhésion expirant bientôt',
  'Memberships expiring soon': 'Adhésions expirant bientôt',
  'Students expiring soon': 'Élèves expirant bientôt',
  'Camp members expiring': 'Membres du camp expirant',
  'Classes running low': 'Cours bientôt épuisés',
  'Students with few classes left': 'Élèves avec peu de cours restants',
  'New students assigned': 'Nouveaux élèves assignés',
  'Notes need attention': 'Notes nécessitant attention',
  'Cannot reach the cloud': 'Impossible d’atteindre le cloud',
  'Remove all exact duplicates': 'Supprimer tous les doublons exacts',
  // Charts dashboard (v6.457)
  'Charts': 'Graphiques', 'Revenue vs Cost': 'Revenu vs Coût', 'Net Profit trend': 'Tendance du bénéfice net',
  'Revenue by Category': 'Revenu par catégorie', 'Revenue by Sport': 'Revenu par sport',
  'Coach Performance': 'Performance des coachs', 'Payroll by month': 'Salaires par mois',
  'New Members': 'Nouveaux membres', 'Net Profit': 'Bénéfice net', 'Payroll': 'Salaires',
  'Revenue': 'Revenu', 'Cost (expenses + payroll)': 'Coût (dépenses + salaires)', 'billed basis': 'base facturée',
  // Members table columns (v6.449)
  'Member': 'Membre', 'Arabic Name': 'Nom arabe', 'QID': 'QID', 'Nationality': 'Nationalité',
  'Phone 2': 'Téléphone 2', 'Joined': 'Inscrit', 'Created': 'Créé', 'Level': 'Niveau',
  'Birthdate': 'Date de naissance', 'Outstanding': 'Impayé', 'Attendance': 'Présence',
  'Last Renewal': 'Dernier renouvellement', 'Expiry': 'Expiration', 'Invoice': 'Facture',
  'Sort by': 'Trier par', 'always': 'toujours',
  // Members bulk bar + filters (v6.449)
  'selected': 'sélectionné(s)', 'Add to family': 'Ajouter à une famille', 'Freeze': 'Geler',
  'Export selected': 'Exporter la sélection', 'Archive selected': 'Archiver la sélection',
  'No members match your filters': 'Aucun membre ne correspond aux filtres',
  'Find records missing key fields': 'Trouver les fiches incomplètes', 'All data': 'Toutes les données',
  'Missing any field': 'Champ manquant', 'No phone': 'Sans téléphone', 'No QID': 'Sans QID',
  'No email': 'Sans e-mail', 'No birthdate': 'Sans date de naissance', 'No nationality': 'Sans nationalité',
  'No nationalities recorded': 'Aucune nationalité enregistrée',
  // Language names
  'English': 'English', 'العربية': 'Arabe', 'Arabic': 'Arabe', 'French': 'Français', 'Français': 'Français',
  // Auth / login
  'Sign in': 'Se connecter', 'Sign out': 'Se déconnecter', 'Log in': 'Se connecter', 'Log out': 'Se déconnecter',
  'Email': 'E-mail', 'Password': 'Mot de passe', 'Current password': 'Mot de passe actuel',
  'New password': 'Nouveau mot de passe', 'Confirm password': 'Confirmer le mot de passe',
  'Change password': 'Changer le mot de passe', 'Forgot password?': 'Mot de passe oublié ?',
  'Welcome': 'Bienvenue', 'Welcome back': 'Bon retour', 'Signing in…': 'Connexion…',
  // Common actions / buttons
  'Save': 'Enregistrer', 'Cancel': 'Annuler', 'Close': 'Fermer', 'Edit': 'Modifier', 'Delete': 'Supprimer',
  'Add': 'Ajouter', 'Remove': 'Retirer', 'Search': 'Rechercher', 'Filter': 'Filtrer', 'Filters': 'Filtres',
  'Clear': 'Effacer', 'Clear filters': 'Effacer les filtres', 'Export': 'Exporter', 'Print': 'Imprimer',
  'Back': 'Retour', 'Next': 'Suivant', 'Previous': 'Précédent', 'Confirm': 'Confirmer', 'Continue': 'Continuer',
  'Yes': 'Oui', 'No': 'Non', 'OK': 'OK', 'Done': 'Terminé', 'Apply': 'Appliquer', 'Reset': 'Réinitialiser',
  'View': 'Voir', 'Details': 'Détails', 'Refresh': 'Actualiser', 'Recalculate': 'Recalculer',
  'Loading...': 'Chargement...', 'Loading…': 'Chargement…', 'Saving…': 'Enregistrement…',
  'Admins only': 'Administrateurs uniquement', 'No results': 'Aucun résultat', 'No data': 'Aucune donnée',
  // Navigation / screens
  'Home': 'Accueil', 'Dashboard': 'Tableau de bord', 'My Dashboard': 'Mon tableau de bord',
  'Members': 'Membres', 'Member': 'Membre', 'Coaches': 'Entraîneurs', 'Coach': 'Entraîneur', 'Staff': 'Personnel',
  'Attendance': 'Présence', 'My Membership': 'Mon abonnement', 'My Attendance': 'Ma présence',
  'My Salary': 'Mon salaire', 'My Students': 'Mes élèves', 'Advice': 'Conseils', 'My Advice': 'Mes conseils',
  'Advice & Articles': 'Conseils et articles', 'Coach Advice': 'Conseils de l’entraîneur',
  'Invoices': 'Factures', 'Invoice': 'Facture', 'Payments': 'Paiements', 'Payment records': 'Registres de paiement',
  'Salaries': 'Salaires', 'Salaries & Commissions': 'Salaires et commissions', 'Expenses': 'Dépenses',
  'Families': 'Familles', 'Rentals': 'Locations', 'Trials': 'Essais', 'Product sales': 'Ventes de produits',
  'Products': 'Produits', 'Schedule': 'Emploi du temps', 'Classes': 'Cours', 'Reports': 'Rapports',
  'Settings': 'Paramètres', 'Profile': 'Profil', 'Notifications': 'Notifications', 'Birthdays': 'Anniversaires',
  'Summer Camp': 'Camp d’été', 'Expiring': 'Expirations', 'Reminders': 'Rappels',
  // Membership / member card
  'Sport': 'Sport', 'Sports': 'Sports', 'Start': 'Début', 'End': 'Fin', 'Status': 'Statut',
  'Class': 'Cours', 'Paid': 'Payé', 'Unpaid': 'Impayé', 'Balance': 'Solde', 'Amount': 'Montant',
  'Price': 'Prix', 'Total': 'Total', 'Subtotal': 'Sous-total', 'Discount': 'Remise', 'Method': 'Mode',
  'Cash': 'Espèces', 'Card': 'Carte', 'Date': 'Date', 'Month': 'Mois', 'Year': 'Année', 'Phone': 'Téléphone',
  'Name': 'Nom', 'Gender': 'Genre', 'Male': 'Homme', 'Female': 'Femme', 'Boy': 'Garçon', 'Girl': 'Fille',
  'Age': 'Âge', 'Notes': 'Notes', 'Note': 'Note', 'Level': 'Niveau', 'Expiry': 'Expiration',
  'Renew': 'Renouveler', 'Renewal': 'Renouvellement', 'Register': 'Inscrire', 'Registration': 'Inscription',
  // Statuses
  'Active': 'Actif', 'Expired': 'Expiré', 'Completed': 'Terminé', 'Frozen': 'Gelé', 'Pending': 'En attente',
  'Withdrawn': 'Retiré', 'Cancelled': 'Annulé', 'Paid in full': 'Payé intégralement', 'Partial': 'Partiel',
  // Attendance
  'Present': 'Présent', 'Absent': 'Absent', 'Attended': 'Présences', 'Remaining': 'Restant',
  'Classes attended': 'Cours suivis', 'Total classes': 'Total des cours', 'Attendance rate': 'Taux de présence',
  // Misc member-facing
  'Get Invoice': 'Obtenir la facture', 'Full History': 'Historique complet', 'Family': 'Famille',
  'Subscription History': 'Historique des abonnements', 'No subscriptions yet': 'Aucun abonnement pour le moment',
  'Administrator': 'Administrateur', 'Receptionist': 'Réceptionniste', 'Student': 'Élève',
  // v6.443 — bulk French labels (merged batch)
  "All": "Tous",
  "Any": "Tout",
  "Day": "Jour",
  "Due": "Dû",
  "For": "Pour",
  "Low": "Bas",
  "Net": "Net",
  "New": "Nouveau",
  "Now": "Maintenant",
  "Out": "Sorti",
  "Pay": "Payer",
  "Ref": "Réf",
  "You": "Vous",
  "all": "tous",
  "and": "et",
  "avg": "moy",
  "due": "dû",
  "for": "pour",
  "max": "max",
  "min": "min",
  "net": "net",
  "new": "nouveau",
  "was": "était",
  "you": "vous",
  "Auto": "Auto",
  "Base": "Base",
  "Boys": "Garçons",
  "Cost": "Coût",
  "Days": "Jours",
  "From": "De",
  "Grid": "Grille",
  "High": "Élevé",
  "Item": "Article",
  "Kids": "Enfants",
  "Left": "Restant",
  "Link": "Lien",
  "List": "Liste",
  "More": "Plus",
  "None": "Aucun",
  "Only": "Seulement",
  "Open": "Ouvrir",
  "Owes": "Doit",
  "Rate": "Taux",
  "Read": "Lu",
  "Rent": "Loyer",
  "Rows": "Lignes",
  "Send": "Envoyer",
  "Subs": "Abonn.",
  "Type": "Type",
  "Used": "Utilisé",
  "User": "Utilisateur",
  "What": "Quoi",
  "When": "Quand",
  "days": "jours",
  "done": "fait",
  "from": "de",
  "gets": "reçoit",
  "keep": "garder",
  "last": "dernier",
  "more": "plus",
  "none": "aucun",
  "note": "note",
  "paid": "payé",
  "read": "lu",
  "sale": "vente",
  "view": "voir",
  "About": "À propos",
  "Again": "À nouveau",
  "Churn": "Attrition",
  "Cloud": "Cloud",
  "Exact": "Exact",
  "Excel": "Excel",
  "Field": "Champ",
  "Fixed": "Fixe",
  "Found": "Trouvé",
  "Girls": "Filles",
  "Gross": "Brut",
  "Group": "Groupe",
  "Issue": "Problème",
  "Later": "Plus tard",
  "Other": "Autre",
  "RENEW": "RENOUVELER",
  "Reply": "Répondre",
  "Sales": "Ventes",
  "Saved": "Enregistré",
  "Share": "Partager",
  "Stock": "Stock",
  "TOTAL": "TOTAL",
  "Title": "Titre",
  "Today": "Aujourd’hui",
  "Trash": "Corbeille",
  "Units": "Unités",
  "Value": "Valeur",
  "Years": "Ans",
  "class": "cours",
  "exact": "exact",
  "gross": "brut",
  "needs": "nécessite",
  "notes": "notes",
  "sales": "ventes",
  "share": "partager",
  "shown": "affiché",
  "sport": "sport",
  "staff": "personnel",
  "today": "aujourd’hui",
  "total": "total",
  "trial": "essai",
  "units": "unités",
  "Action": "Action",
  "Agreed": "Convenu",
  "Assign": "Assigner",
  "Backup": "Sauvegarde",
  "Billed": "Facturé",
  "Buyers": "Acheteurs",
  "Change": "Modifier",
  "Differ": "Diffère",
  "Driver": "Chauffeur",
  "Fawran": "Fawran",
  "Freeze": "Geler",
  "Friday": "Vendredi",
  "Groups": "Groupes",
  "Manage": "Gérer",
  "Marked": "Marqué",
  "Medium": "Moyen",
  "Mobile": "Mobile",
  "Module": "Module",
  "Monday": "Lundi",
  "Months": "Mois",
  "Period": "Période",
  "Reason": "Raison",
  "Recent": "Récent",
  "Record": "Enregistrer",
  "Refund": "Remboursement",
  "Reject": "Rejeter",
  "Reload": "Recharger",
  "Remind": "Rappeler",
  "Rental": "Location",
  "Rescan": "Rescanner",
  "Resend": "Renvoyer",
  "Review": "Réviser",
  "Saving": "Enregistrement",
  "Settle": "Régler",
  "Sunday": "Dimanche",
  "Switch": "Changer",
  "UNPAID": "IMPAYÉ",
  "Update": "Mettre à jour",
  "across": "sur",
  "always": "toujours",
  "billed": "facturé",
  "copies": "copies",
  "expiry": "expiration",
  "family": "famille",
  "frozen": "gelé",
  "groups": "groupes",
  "margin": "marge",
  "member": "membre",
  "months": "mois",
  "reduce": "réduire",
  "rental": "location",
  "salary": "salaire",
  "select": "sélectionner",
  "sports": "sports",
  "trials": "essais",
  "Actions": "Actions",
  "Advance": "Avance",
  "Citadel": "Citadel",
  "Collect": "Encaisser",
  "Columns": "Colonnes",
  "Company": "Société",
  "Created": "Créé",
  "Current": "Actuel",
  "DELETED": "SUPPRIMÉ",
  "Deleted": "Supprimé",
  "Disband": "Dissoudre",
  "Drivers": "Chauffeurs",
  "Editing": "Édition",
  "Expires": "Expire",
  "Fix all": "Tout corriger",
  "Has due": "A un dû",
  "Keeping": "Conservé",
  "Message": "Message",
  "Missing": "Manquant",
  "Net due": "Net dû",
  "Not set": "Non défini",
  "Not yet": "Pas encore",
  "Old end": "Ancienne fin",
  "Orphans": "Orphelins",
  "Overdue": "En retard",
  "Package": "Forfait",
  "Planned": "Prévu",
  "Private": "Privé",
  "Product": "Produit",
  "Publish": "Publier",
  "Re-sync": "Resynchroniser",
  "Records": "Enregistrements",
  "Removed": "Retiré",
  "Renewed": "Renouvelé",
  "Restock": "Réapprovisionner",
  "Restore": "Restaurer",
  "Revenue": "Revenu",
  "Trigger": "Déclencher",
  "Tuesday": "Mardi",
  "Unknown": "Inconnu",
  "Walk-in": "Sans rendez-vous",
  "at risk": "à risque",
  "balance": "solde",
  "classes": "cours",
  "coaches": "entraîneurs",
  "current": "actuel",
  "drivers": "chauffeurs",
  "entries": "entrées",
  "expense": "dépense",
  "expired": "expiré",
  "expires": "expire",
  "invited": "invité",
  "invoice": "facture",
  "members": "membres",
  "methods": "modes",
  "min ago": "il y a min",
  "net due": "net dû",
  "not set": "non défini",
  "payment": "paiement",
  "product": "produit",
  "records": "enregistrements",
  "rentals": "locations",
  "student": "élève",
  "turning": "a bientôt",
  "updated": "mis à jour",
  "Activity": "Activité",
  "All days": "Tous les jours",
  "All time": "Tout le temps",
  "Archived": "Archivé",
  "Audience": "Audience",
  "Balanced": "Équilibré",
  "By sport": "Par sport",
  "Category": "Catégorie",
  "Collapse": "Réduire",
  "Contents": "Contenu",
  "Customer": "Client",
  "Duration": "Durée",
  "End date": "Date de fin",
  "Enrolled": "Inscrit",
  "Everyone": "Tout le monde",
  "Expected": "Attendu",
  "Fix date": "Corriger la date",
  "Football": "Football",
  "Generate": "Générer",
  "In stock": "En stock",
  "In trash": "Corbeille",
  "Keep one": "En garder un",
  "New note": "Nouvelle note",
  "Not paid": "Non payé",
  "Owes for": "Doit pour",
  "Paid now": "Payé maintenant",
  "Possible": "Possible",
  "Priority": "Priorité",
  "Reminded": "Rappelé",
  "Reminder": "Rappel",
  "Renewals": "Renouvellements",
  "Saturday": "Samedi",
  "Students": "Élèves",
  "Thursday": "Jeudi",
  "Tomorrow": "Demain",
  "Transfer": "Transfert",
  "Username": "Nom d’utilisateur",
  "Validity": "Validité",
  "View PDF": "Voir le PDF",
  "WhatsApp": "WhatsApp",
  "Withdraw": "Retirer",
  "all paid": "tout payé",
  "archived": "archivé",
  "bookings": "réservations",
  "coaching": "encadrement",
  "days off": "jours de congé",
  "enrolled": "inscrit",
  "expected": "attendu",
  "expenses": "dépenses",
  "expiring": "expire bientôt",
  "families": "familles",
  "filtered": "filtré",
  "in stock": "en stock",
  "invoices": "factures",
  "just now": "à l’instant",
  "messaged": "message envoyé",
  "non-cash": "hors espèces",
  "optional": "optionnel",
  "paid out": "versé",
  "payments": "paiements",
  "possible": "possible",
  "products": "produits",
  "recorded": "enregistré",
  "salaries": "salaires",
  "schedule": "emploi du temps",
  "selected": "sélectionné",
  "students": "élèves",
  "swimmers": "nageurs",
  "tomorrow": "demain",
  "All hours": "Toutes les heures",
  "All sales": "Toutes les ventes",
  "All types": "Tous les types",
  "All users": "Tous les utilisateurs",
  "Birthdate": "Date de naissance",
  "Collected": "Encaissé",
  "Due (QAR)": "Dû (QAR)",
  "Edit note": "Modifier la note",
  "All sports": "Tous les sports",
  "All coaches": "Tous les entraîneurs",
  "All status": "Tous les statuts",
  "All weeks": "Toutes les semaines",
  "All months": "Tous les mois",
  "All attendance": "Toute présence",
  "All statuses": "Tous les statuts",
  "Import CSV": "Importer CSV",
  "Export CSV": "Exporter CSV",
  "Export PDF": "Exporter PDF",
  "present": "présent",
  "absent": "absent",
  "not marked": "non marqué",
  "Week": "Semaine",
  "Commission": "Commission",
  // attendance screen French labels
  "Classes attended (present) by students in the current view — respects the day filter": "Cours suivis (présents) par les élèves dans la vue actuelle — selon le filtre du jour",
  "Image (EN)": "Image (EN)",
  "Image (AR)": "Image (AR)",
  "Download the sheet as an image (English)": "Télécharger la feuille en image (anglais)",
  "Download the sheet as an image (Arabic)": "Télécharger la feuille en image (arabe)",
  "Pick one or more days": "Choisir un ou plusieurs jours",
  "end": "fin",
  "Quick-pick a week (selects all 7 days)": "Sélection rapide d’une semaine (tous les 7 jours)",
  "All students (type to search)": "Tous les élèves (tapez pour rechercher)",
  "attendance rows": "lignes de présence",
  "month(s)": "mois",
  "all months": "tous les mois",
  "present (Y) per month": "présent (Y) par mois",
  "Total Y": "Total Y",
  // route + coach-view French labels
  "History": "Historique",
  "Swimming Groups": "Groupes de natation",
  "Due Payment": "Paiement dû",
  "Transfer Membership": "Transfert d’abonnement",
  "Attendance Report": "Rapport de présence",
  "Audit Log": "Journal d’audit",
  "Bank Account": "Compte bancaire",
  "Camp Members": "Membres du camp",
  "Cash Collection": "Encaissement",
  "Cash in Hand": "Caisse",
  "Cleanup Center": "Centre de nettoyage",
  "Club Revenue Summary": "Résumé des revenus",
  "Club Setup": "Configuration du club",
  "Coach Performance": "Performance de l’entraîneur",
  "Danger Zone": "Zone dangereuse",
  "Data & Backup": "Données et sauvegarde",
  "Data Export": "Exportation des données",
  "Data Import": "Importation des données",
  "Driver Students": "Élèves par chauffeur",
  "Duplicate Invoices": "Factures en double",
  "Financial Overview": "Aperçu financier",
  "Invoice Integrity": "Intégrité des factures",
  "Kids Stars (4-7)": "Kids Stars (4-7)",
  "Member Commission": "Commission par membre",
  "Missing Invoices": "Factures manquantes",
  "Monthly Report": "Rapport mensuel",
  "Notes & Reminders": "Notes et rappels",
  "Owner Dashboard": "Tableau de bord propriétaire",
  "Payments Analysis": "Analyse des paiements",
  "Portal Onboarding": "Intégration au portail",
  "Preferences": "Préférences",
  "Product Sales": "Ventes de produits",
  "Ready to Renew": "Prêt à renouveler",
  "Reconciliation": "Rapprochement",
  "Renewal Potential": "Potentiel de renouvellement",
  "Transactions": "Transactions",
  "Users & Roles": "Utilisateurs et rôles",
  "ATTENDED": "PRÉSENCES",
  "DAY": "JOUR",
  "DAYS": "JOURS",
  "ALL": "TOUT",
  "showing day": "affichage du jour",
  "of": "de",
  "only": "uniquement",
  "This month": "Ce mois-ci",
  "Last month": "Le mois dernier",
  // French labels batch
  "replies": "réponses",
  "no phone": "pas de téléphone",
  "Week PNG": "Semaine PNG",
  "Bad date": "Date invalide",
  "days left": "jours restants",
  "still due": "toujours dû",
  "Retry now": "Réessayer",
  "Recovered": "Récupéré",
  "transfers": "transferts",
  "Only here": "Ici seulement",
  "collected": "encaissé",
  "Read-only": "Lecture seule",
  "For sport": "Pour le sport",
  "Net price": "Prix net",
  "Yesterday": "Hier",
  "This week": "Cette semaine",
  "Generated": "Généré",
  "Need info": "Info requise",
  "collapsed": "réduit",
  "good size": "bonne taille",
  "New group": "Nouveau groupe",
  "Wednesday": "Mercredi",
  "Published": "Publié",
  "Gross due": "Dû brut",
  "gross due": "dû brut",
  "This year": "Cette année",
  "duplicate": "doublon",
  "should be": "devrait être",
  "Follow up": "Suivi",
  "Mark done": "Marquer fait",
  "Reload now": "Recharger",
  "Next class": "Prochain cours",
  "User Guide": "Guide",
  "Net Profit": "Bénéfice net",
  "Only cloud": "Cloud seulement",
  "Any expiry": "Toute expiration",
  "No members": "Aucun membre",
  "Households": "Foyers",
  "Total paid": "Total payé",
  "Expand all": "Tout déplier",
  "Entered By": "Saisi par",
  "Camp group": "Groupe du camp",
  "Kids (4-7)": "Enfants (4-7)",
  "enrolments": "inscriptions",
  "Start date": "Date de début",
  "Paid value": "Valeur payée",
  "Membership": "Abonnement",
  "Any amount": "Tout montant",
  "Ends today": "Se termine aujourd’hui",
  "All groups": "Tous les groupes",
  "Unassigned": "Non assigné",
  "Add driver": "Ajouter un chauffeur",
  "No changes": "Aucun changement",
  "Group name": "Nom du groupe",
  "Auto-group": "Groupe auto",
  "Day poster": "Affiche du jour",
  "categories": "catégories",
  "activities": "activités",
  "no invoice": "pas de facture",
  "No invoice": "Pas de facture",
  "uninvoiced": "non facturé",
  "Update all": "Tout mettre à jour",
  "Duplicates": "Doublons",
  "Cash (QAR)": "Espèces (QAR)",
  "Card (QAR)": "Carte (QAR)",
  "Collecting": "Encaissement",
  "Counted by": "Compté par",
  "Save count": "Enregistrer le comptage",
  "cash taken": "espèces prélevées",
  "No leakage": "Aucune fuite",
  "Owner took": "Le propriétaire a pris",
  "Net result": "Résultat net",
  "Paid (QAR)": "Payé (QAR)",
  "Fully paid": "Payé intégralement",
  "Pay salary": "Payer le salaire",
  "Correction": "Correction",
  "Reconciled": "Rapproché",
  "Sell price": "Prix de vente",
  "Date range": "Plage de dates",
  "Appearance": "Apparence",
  "New expiry": "Nouvelle expiration",
  "Resumes on": "Reprend le",
  "your email": "votre e-mail",
  "commission": "commission",
  "Roster CSV": "Liste CSV",
  "New advice": "Nouveau conseil",
  "No coaches": "Aucun entraîneur",
  "Club Admin": "Admin du club",
  "recipients": "destinataires",
  "Invited by": "Invité par",
  "Historical": "Historique",
  "Units sold": "Unités vendues",
  "Sort: Name": "Tri : Nom",
  "Note added": "Note ajoutée",
  "Revenue Mix": "Répartition des revenus",
  "cash counts": "comptages d’espèces",
  "this device": "cet appareil",
  "Group these": "Grouper ceux-ci",
  "Family name": "Nom de famille",
  "recoverable": "récupérable",
  "Price (QAR)": "Prix (QAR)",
  "Boys (7-12)": "Garçons (7-12)",
  "By category": "Par catégorie",
  "Correct end": "Fin correcte",
  "All genders": "Tous les genres",
  "All drivers": "Tous les chauffeurs",
  "Driver name": "Nom du chauffeur",
  "Edit driver": "Modifier le chauffeur",
  "Print / PDF": "Imprimer / PDF",
  "Top members": "Meilleurs membres",
  "All methods": "Tous les modes",
  "assigned to": "assigné à",
  "Quick Cards": "Cartes rapides",
  "Arabic name": "Nom en arabe",
  "Fix invoice": "Corriger la facture",
  "Open member": "Ouvrir le membre",
  "sport lines": "lignes de sport",
  "Next 7 days": "7 prochains jours",
  "Send wishes": "Envoyer des vœux",
  "Record type": "Type d’enregistrement",
  "Data Safety": "Sécurité des données",
  "Credit card": "Carte de crédit",
  "Undo settle": "Annuler le règlement",
  "Description": "Description",
  "Coach check": "Vérification entraîneur",
  "Not allowed": "Non autorisé",
  "Save amount": "Enregistrer le montant",
  "Add payment": "Ajouter un paiement",
  "outstanding": "impayé",
  "all settled": "tout réglé",
  "Re-credited": "Réattribué",
  "New Product": "Nouveau produit",
  "Stock value": "Valeur du stock",
  "Audit Trail": "Journal d’audit",
  "All modules": "Tous les modules",
  "All actions": "Toutes les actions",
  "Refresh now": "Actualiser",
  "not tracked": "non suivi",
  "avg/renewal": "moy/renouvellement",
  "Balance due": "Solde dû",
  "Most active": "Les plus actifs",
  "Advice sent": "Conseil envoyé",
  "Payslip PDF": "Fiche de paie PDF",
  "My students": "Mes élèves",
  "Per student": "Par élève",
  "Who read it": "Qui l’a lu",
  "No students": "Aucun élève",
  "not created": "non créé",
  "Not Created": "Non créé",
  "Best seller": "Meilleure vente",
  "Enrollments": "Inscriptions",
  "Re-sync all": "Tout resynchroniser",
  "Clear dates": "Effacer les dates",
  "Short title": "Titre court",
  "Quick search": "Recherche rapide",
  "Quick backup": "Sauvegarde rapide",
  "Most popular": "Les plus populaires",
  "All payments": "Tous les paiements",
  "Switch Sport": "Changer de sport",
  "Payment date": "Date de paiement",
  "is linked to": "est lié à",
  "Delete coach": "Supprimer l’entraîneur",
  "Currently in": "Actuellement dans",
  "Shared phone": "Téléphone partagé",
  "Family total": "Total famille",
  "Collapse all": "Tout réduire",
  "Deletion log": "Journal des suppressions",
  "Girls (7-12)": "Filles (7-12)",
  "Custom range": "Plage personnalisée",
  "transactions": "transactions",
  "Amount (QAR)": "Montant (QAR)",
  "1st reminder": "1er rappel",
  "2nd reminder": "2e rappel",
  "Final notice": "Dernier avis",
  "Open profile": "Ouvrir le profil",
  "Camp members": "Membres du camp",
  "No transport": "Pas de transport",
  "Driver added": "Chauffeur ajouté",
  "Not assigned": "Non assigné",
  "Top families": "Meilleures familles",
  "Print report": "Imprimer le rapport",
  "Delete group": "Supprimer le groupe",
  "Open invoice": "Ouvrir la facture",
  "Will link to": "Sera lié à",
  "Show walk-in": "Afficher sans RDV",
  "Hide walk-in": "Masquer sans RDV",
  "Next 90 days": "90 prochains jours",
  "more members": "membres de plus",
  "Collected by": "Encaissé par",
  "Last counted": "Dernier comptage",
  "Save changes": "Enregistrer",
  "cash in hand": "caisse",
  "Cash in hand": "Caisse",
  "Export Excel": "Exporter Excel",
  "Switch check": "Vérif. de changement",
  "Not paid yet": "Pas encore payé",
  "Fixed salary": "Salaire fixe",
  "Out of stock": "Rupture de stock",
  "Not attended": "Non présent",
  "Save Renewal": "Enregistrer le renouvellement",
  "Not reminded": "Non rappelé",
  "Remind again": "Rappeler à nouveau",
  "Already used": "Déjà utilisé",
  "Write advice": "Écrire un conseil",
  "Classes left": "Cours restants",
  "Reply posted": "Réponse publiée",
  "Clear search": "Effacer la recherche",
  "fresh expiry": "nouvelle expiration",
  "Set total to": "Fixer le total à",
  "Stored total": "Total enregistré",
  "Remind me on": "Me rappeler le",
  "Note updated": "Note mise à jour",
  "Note deleted": "Note supprimée",
  "This will put": "Ceci mettra",
  "Collapse menu": "Réduire le menu",
  "Total Revenue": "Revenu total",
  "Restored from": "Restauré depuis",
  "product sales": "ventes de produits",
  "past invoices": "factures passées",
  "Add to family": "Ajouter à la famille",
  "Rename / edit": "Renommer / modifier",
  "expiring soon": "expire bientôt",
  "Bank transfer": "Virement bancaire",
  "Add a payment": "Ajouter un paiement",
  "Camp duration": "Durée du camp",
  "Total revenue": "Revenu total",
  "Active sports": "Sports actifs",
  "Swimming Pool": "Piscine",
  "Company share": "Part de la société",
  "Last reminded": "Dernier rappel",
  "Expiring soon": "Expire bientôt",
  "All durations": "Toutes les durées",
  "All transport": "Tout transport",
  "Empty classes": "Cours vides",
  "Group deleted": "Groupe supprimé",
  "Carry-forward": "Report",
  "carry-forward": "report",
  "profile price": "prix du profil",
  "Invoice total": "Total de la facture",
  "sum of sports": "somme des sports",
  "Balance (due)": "Solde (dû)",
  "line-item sum": "somme des lignes",
  "Historique": "Historique",
  "minutes": "minutes",
  "potential": "potentiel",
  "Trial Log": "Journal des essais",
  "My sports": "Mes sports",
  // French labels batch 2
  "Re-credit": "Réattribuer",
  "completed": "terminé",
  "Reconcile": "Rapprocher",
  "Low stock": "Stock faible",
  "Resume on": "Reprendre le",
  "opening it": "en l’ouvrant",
  "line-items": "lignes",
  "walk-in ok": "sans RDV ok",
  "Paid field": "Champ payé",
  "new expiry": "nouvelle expiration",
  "reconstructed": "reconstruit",
  "Open payments": "Paiements ouverts",
  "At checkpoint": "Au point de contrôle",
  "Count history": "Historique des comptages",
  "cash expenses": "dépenses en espèces",
  "Cash expenses": "Dépenses en espèces",
  "Accounted for": "Comptabilisé",
  "Cash tracking": "Suivi des espèces",
  "Affects month": "Affecte le mois",
  "Over-advanced": "Sur-avancé",
  "Re-credit all": "Tout réattribuer",
  "marked absent": "marqué absent",
  "reminder sent": "rappel envoyé",
  "Members ready": "Membres prêts",
  "Sign-in sheet": "Feuille de présence",
  "active roster": "liste active",
  "Last attended": "Dernière présence",
  "your students": "vos élèves",
  "From the club": "Du club",
  "Pick students": "Choisir des élèves",
  "Save password": "Enregistrer le mot de passe",
  "Invite opened": "Invitation ouverte",
  "Send WhatsApp": "Envoyer WhatsApp",
  "moves with it": "se déplace avec",
  "KEEP (oldest)": "GARDER (le plus ancien)",
  "Products sold": "Produits vendus",
  "Sort: Revenue": "Tri : Revenu",
  "Invoice dated": "Facture datée du",
  "Mark not done": "Marquer non fait",
  "Action blocked": "Action bloquée",
  "Unpaid balance": "Solde impayé",
  "Saved to cloud": "Enregistré dans le cloud",
  "Sign in & save": "Se connecter et enregistrer",
  "Sign-in failed": "Échec de connexion",
  "Active Members": "Membres actifs",
  "Total Expenses": "Total des dépenses",
  "payroll earned": "paie acquise",
  "Cash Collected": "Espèces encaissées",
  "Attendance CSV": "Présence CSV",
  "Member updated": "Membre mis à jour",
  "Family balance": "Solde de la famille",
  "Edit household": "Modifier le foyer",
  "Sync conflicts": "Conflits de synchro",
  "New payment(s)": "Nouveau(x) paiement(s)",
  "Confirm & save": "Confirmer et enregistrer",
  "Recorded total": "Total enregistré",
  "Discount (QAR)": "Remise (QAR)",
  "in this period": "dans cette période",
  "Football total": "Total football",
  "Swimming total": "Total natation",
  "Reminded today": "Rappelé aujourd’hui",
  "Fix camp dates": "Corriger les dates du camp",
  "with transport": "avec transport",
  "Need transport": "Transport requis",
  "Transportation": "Transport",
  "Driver deleted": "Chauffeur supprimé",
  "Cash collected": "Espèces encaissées",
  "All activities": "Toutes les activités",
  "Student places": "Places élèves",
  "Group is empty": "Le groupe est vide",
  "Delete forever": "Supprimer définitivement",
  "Back to active": "Retour à actif",
  "All categories": "Toutes les catégories",
  "Review changes": "Réviser les changements",
  "Payment ledger": "Registre des paiements",
  "Nothing to fix": "Rien à corriger",
  "Corrected date": "Date corrigée",
  "of local cache": "du cache local",
  "Record payment": "Enregistrer le paiement",
  "Collected (in)": "Encaissé (entrée)",
  "Expenses (out)": "Dépenses (sortie)",
  "Salaries (out)": "Salaires (sortie)",
  "Partially paid": "Partiellement payé",
  "Net (computed)": "Net (calculé)",
  "Remove payment": "Retirer le paiement",
  "Salary history": "Historique des salaires",
  "marked present": "marqué présent",
  "Total to renew": "Total à renouveler",
  "reminders sent": "rappels envoyés",
  "Final reminder": "Dernier rappel",
  "Your allowance": "Votre allocation",
  "How many days?": "Combien de jours ?",
  "Attendance log": "Journal de présence",
  "Low attendance": "Faible présence",
  "Net this month": "Net ce mois-ci",
  "Write a reply…": "Écrire une réponse…",
  "Publish advice": "Publier le conseil",
  "Account Status": "Statut du compte",
  "transferred to": "transféré à",
  "Extra invoices": "Factures en trop",
  "Delete invoice": "Supprimer la facture",
  "Merge into one": "Fusionner en une",
  "Total ≠ sports": "Total ≠ sports",
  "Stop following": "Ne plus suivre",
  "Your next class": "Votre prochain cours",
  "Recent searches": "Recherches récentes",
  "Low stock items": "Articles en stock faible",
  "Equipment Sales": "Ventes d’équipement",
  "Uniforms & gear": "Tenues et matériel",
  "Recent Invoices": "Factures récentes",
  "Monthly Summary": "Résumé mensuel",
  "Has balance due": "A un solde dû",
  "Attendance (EN)": "Présence (EN)",
  "Attendance (AR)": "Présence (AR)",
  "Editing session": "Session d’édition",
  "Remove this row": "Retirer cette ligne",
  "Enter an amount": "Saisir un montant",
  "manual override": "remplacement manuel",
  "Earning coaches": "Entraîneurs rémunérés",
  "Total due (all)": "Total dû (tous)",
  "Expiring within": "Expire dans",
  "click to filter": "cliquer pour filtrer",
  "Member movement": "Mouvement des membres",
  "Filtered total:": "Total filtré :",
  "Payments Report": "Rapport des paiements",
  "Assign students": "Assigner des élèves",
  "Class not found": "Cours introuvable",
  "Search swimmer…": "Rechercher un nageur…",
  "paid this month": "payé ce mois-ci",
  "Export Detailed": "Export détaillé",
  "Delete selected": "Supprimer la sélection",
  "Amount mismatch": "Montant incohérent",
  "Orphan invoices": "Factures orphelines",
  "Data is healthy": "Données saines",
  "Total data size": "Taille totale des données",
  "Delete invoice?": "Supprimer la facture ?",
  "Edit this entry": "Modifier cette entrée",
  "No entries yet.": "Aucune entrée.",
  "Edit cash count": "Modifier le comptage",
  "paid to coaches": "payé aux entraîneurs",
  "Total collected": "Total encaissé",
  "Cash reconciles": "La caisse est équilibrée",
  "Unexplained gap": "Écart inexpliqué",
  "Money out vs in": "Sorties vs entrées",
  "Coach not found": "Entraîneur introuvable",
  "need restocking": "à réapprovisionner",
  "Data Management": "Gestion des données",
  "Data Statistics": "Statistiques des données",
  "Last updated by": "Dernière modif. par",
  "period starting": "période commençant",
  "Sports finished": "Sports terminés",
  "No coach (camp)": "Aucun entraîneur (camp)",
  "days this cycle": "jours ce cycle",
  "Add to calendar": "Ajouter au calendrier",
  "Payment history": "Historique des paiements",
  "Roster exported": "Liste exportée",
  "Monthly history": "Historique mensuel",
  "All my students": "Tous mes élèves",
  "Specific people": "Personnes précises",
  "Invitation Sent": "Invitation envoyée",
  "No transactions": "Aucune transaction",
  "left for review": "à réviser",
  "Recalculate all": "Tout recalculer",
  "Needs attention": "Nécessite attention",
  "Continue session": "Continuer la session",
  "Coaching Revenue": "Revenu d’encadrement",
  "distinct members": "membres distincts",
  "Members by Sport": "Membres par sport",
  "Backup not found": "Sauvegarde introuvable",
  "Reset to default": "Réinitialiser",
  "Freeze allowance": "Allocation de gel",
  "Exceeds total by": "Dépasse le total de",
  "members added to": "membres ajoutés à",
  "Combined balance": "Solde combiné",
  "Archived members": "Membres archivés",
  "Deleted invoices": "Factures supprimées",
  "Merge messy rows": "Fusionner les lignes",
  "Review & confirm": "Réviser et confirmer",
  "Edit camp member": "Modifier le membre du camp",
  "Revenue by sport": "Revenu par sport",
  "Revenue by coach": "Revenu par entraîneur",
  "Backup & fix all": "Sauvegarder et tout corriger",
  "members attended": "membres présents",
  "instant transfer": "transfert instantané",
  "Class list saved": "Liste de cours enregistrée",
  "Print this group": "Imprimer ce groupe",
  "Clear day filter": "Effacer le filtre du jour",
  "Generate invoice": "Générer la facture",
  "Approve & update": "Approuver et mettre à jour",
  "Member not found": "Membre introuvable",
  "invoices updated": "factures mises à jour",
  "Member (current)": "Membre (actuel)",
  "Missing invoices": "Factures manquantes",
  "invoices scanned": "factures analysées",
  "Total commission": "Commission totale",
  "Attendance marks": "Marques de présence",
  "Delete (archive)": "Supprimer (archiver)",
  "Invoice archived": "Facture archivée",
  "Invoice restored": "Facture restaurée",
  "Notes (optional)": "Notes (optionnel)",
  "Revenue (target)": "Revenu (cible)",
  "Cash in hand now": "Caisse actuelle",
  "accounting month": "mois comptable",
  "Payments cleared": "Paiements effacés",
  "All stock levels": "Tous les niveaux de stock",
  "Already migrated": "Déjà migré",
  "Not reminded yet": "Pas encore rappelé",
  "classes attended": "cours suivis",
  "paid as attended": "payé comme présent",
  "Title (optional)": "Titre (optionnel)",
  "Sign out instead": "Se déconnecter plutôt",
  "No members match": "Aucun membre ne correspond",
  "Revenue by Coach": "Revenu par entraîneur",
  "showing first 40": "affichage des 40 premiers",
  "Transfer history": "Historique des transferts",
  "No transfers yet": "Aucun transfert",
  "Confirm transfer": "Confirmer le transfert",
  "Sort: Units sold": "Tri : Unités vendues",
  "Write your note…": "Écrivez votre note…",
  "Take over session": "Prendre la session",
  "Saving your work…": "Enregistrement…",
  "Data & Cloud Sync": "Données et synchro cloud",
  "Save to cloud now": "Enregistrer dans le cloud",
  "All enroll months": "Tous les mois d’inscription",
  "Reset all filters": "Réinitialiser les filtres",
  "students moved to": "élèves déplacés vers",
  "Paid so far (QAR)": "Payé à ce jour (QAR)",
  "membership + rent": "abonnement + loyer",
  "Total due (shown)": "Total dû (affiché)",
  "add a phone first": "ajoutez d’abord un téléphone",
  "Expiring ≤ 7 days": "Expire ≤ 7 jours",
  "Students assigned": "Élèves assignés",
  "no mobile on file": "aucun mobile enregistré",
  "Revenue by method": "Revenu par mode",
  "Search a student…": "Rechercher un élève…",
  "Search by name...": "Rechercher par nom...",
  "admin can restore": "l’admin peut restaurer",
  "Clear all filters": "Effacer tous les filtres",
};
function getLang() {
  try { const l = localStorage.getItem('bs-lang'); return (l === 'ar' || l === 'fr') ? l : 'en'; } catch (_) { return 'en'; }
}
function setLang(l) {
  l = (l === 'ar' || l === 'fr') ? l : 'en';
  try { localStorage.setItem('bs-lang', l); } catch (_) {}
  applyLangDir();
}
function applyLangDir() {
  const l = getLang();
  try {
    document.documentElement.lang = l;
    document.documentElement.dir = (l === 'ar') ? 'rtl' : 'ltr';   // French + English are LTR
  } catch (_) {}
}
// t(english, arabic) → Arabic when Arabic is active; French (from the FR_STRINGS map, English
// fallback) when French is active; otherwise English.
function t(en, ar) {
  const l = getLang();
  if (l === 'ar') return ar || en;
  if (l === 'fr') return (FR_STRINGS[en] != null ? FR_STRINGS[en] : en);
  return en;
}
applyLangDir();
window.setLang = setLang; window.getLang = getLang; window.t = t; window.FR_STRINGS = FR_STRINGS;

async function init() {
  // Choose backend: Firebase if configured, otherwise localStorage.
  const backend = window.Storage.init();
  // Diagnostic: backend selection result is exposed via window.__storageBackend
  // for ops/debugging without polluting the console.
  window.__storageBackend = backend;

  // If the storage layer ever refuses to overwrite good data with an empty save
  // (the deploy/sync data-loss case), surface it loudly instead of failing silent.
  window.__onCloudWriteBlocked = (count, reason) => {
    if (document.getElementById('wipe-guard-banner')) return;
    const b = el('div', { id: 'wipe-guard-banner' });
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#b91c1c;color:#fff;' +
      'padding:12px 16px;font-size:13px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    b.innerHTML = `🛡️ <b>Your data was protected.</b> A risky save was blocked${reason ? ` (${reason})` : ''} so it could not overwrite your cloud data. Your saved data is safe. Please <b>reload this page</b> to resync from the cloud before making changes. <button id="wipe-guard-reload" style="margin-left:10px;background:#fff;color:#b91c1c;border:none;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer">Reload now</button>`;
    document.body.append(b);
    document.getElementById('wipe-guard-reload')?.addEventListener('click', () => location.reload());
  };

  // Live "cloud save" status pill (bottom-right) so staff can SEE every change reach
  // Firebase — Saving… → ✅ Saved to cloud · HH:MM:SS → (fades), or ⚠️ Not saved.
  // Cloud mode only (the storage layer calls this hook only for the Firebase backend).
  window.__onCloudSaveStatus = (() => {
    let hideTimer = null;
    // MONEY collections → a CRITICAL save gets a stronger, longer confirmation (lock icon
    // + held ~6.5s) so a payment/invoice/salary change is unmistakably confirmed. Members
    // are deliberately NOT here: an attendance mark writes the member doc, and rapid roll-
    // call must stay the quick flash — member-EDIT's wait-for-confirm lives at its call
    // site (withCloudConfirm), not in this visual pill. (v6.321)
    const CRITICAL = { invoices: t('invoice', 'فاتورة'), expenses: t('expense', 'مصروف'), salaries: t('salary', 'راتب'), sales: t('sale', 'مبيعة') };
    const LABELS = { ...CRITICAL, members: t('member', 'عضو'), coaches: t('staff', 'طاقم'), auditLog: t('log', 'سجل'), families: t('family', 'عائلة'), schedule: t('schedule', 'جدول'), notes: t('note', 'ملاحظة'), products: t('product', 'منتج'), trials: t('trial', 'تجربة'), rentals: t('rental', 'إيجار') };
    // Human summary of what was written, e.g. "1 payment · 1 member" → "invoice, member".
    const summarize = (byCol) => {
      if (!byCol) return '';
      const parts = [];
      for (const k of Object.keys(byCol)) { const n = byCol[k]; if (!n) continue; const lab = LABELS[k] || k; parts.push(n > 1 ? n + ' ' + lab : lab); }
      return parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ' …' : '');
    };
    const isCritical = (byCol) => !!byCol && Object.keys(CRITICAL).some(k => byCol[k]);
    const pill = () => {
      let p = document.getElementById('cloud-save-pill');
      if (!p) {
        p = document.createElement('div');
        p.id = 'cloud-save-pill';
        // Larger + higher-contrast than before so every save is genuinely NOTICED.
        p.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9998;font-size:13px;font-weight:800;padding:9px 15px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.32);pointer-events:none;transition:opacity .2s,transform .2s;font-family:system-ui,sans-serif;max-width:min(78vw,360px);letter-spacing:.1px';
        document.body.append(p);
      }
      return p;
    };
    return (s) => {
      try {
        const p = pill(); clearTimeout(hideTimer); p.style.opacity = '1';
        const what = summarize(s.byCollection);
        const crit = isCritical(s.byCollection);
        if (s.phase === 'saving') {
          window.__cloudSaveSummary = what || '';   // the blocking loader mirrors this live (v6.348)
          p.style.background = '#f59e0b'; p.style.color = '#fff'; p.style.transform = 'translateY(0) scale(1)';
          p.textContent = (crit ? '🔒 ' : '☁️ ') + t('Saving', 'جارٍ حفظ') + (what ? ' ' + what : '…') + (crit ? ' …' : '');
        } else if (s.phase === 'saved') {
          p.style.background = crit ? '#0f766e' : '#16a34a'; p.style.color = '#fff';
          // brief pop so the confirmation registers even mid-work
          p.style.transform = 'translateY(0) scale(1.04)'; setTimeout(() => { try { p.style.transform = 'scale(1)'; } catch (_) {} }, 160);
          const tm = new Date(s.at || Date.now()).toLocaleTimeString();
          p.textContent = (crit ? '🔒✅ ' : '✅ ') + (what ? t('Saved', 'حُفظ') + ': ' + what : t('Saved to cloud', 'حُفظ في السحابة')) + ' · ' + tm;
          hideTimer = setTimeout(() => { p.style.opacity = '0'; }, crit ? 6500 : 3500);
          // A write finally landed → tear down the persistent failure banner.
          try { const b = document.getElementById('cloud-save-fail-bar'); if (b) b.remove(); } catch (_) {}
        } else if (s.phase === 'error') { p.style.background = '#b91c1c'; p.style.color = '#fff'; p.style.transform = 'scale(1)'; p.textContent = '⚠️ ' + t('NOT saved — retrying…', 'لم يُحفظ — إعادة المحاولة…'); }
      } catch (_) {}
    };
  })();

  // Could not reach Firebase on load → the app is showing a read-only offline
  // copy and will NOT save to the cloud until reconnected. Warn loudly so the
  // user never assumes their changes were saved.
  window.__onCloudReadFailed = () => {
    if (document.getElementById('cloud-read-banner')) return;
    const b = el('div', { id: 'cloud-read-banner' });
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;background:#b45309;color:#fff;' +
      'padding:12px 16px;font-size:13px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    b.innerHTML = `⚠️ <b>Working offline — changes will NOT be saved.</b> The app could not reach the cloud, so it is showing your last copy in read-only mode to protect your data. <b>Do not enter new data.</b> Check your connection and <button id="cloud-read-reload" style="margin-left:6px;background:#fff;color:#b45309;border:none;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer">reload</button> to reconnect.`;
    document.body.append(b);
    document.getElementById('cloud-read-reload')?.addEventListener('click', () => location.reload());
  };

  // If a Firestore write fails, show a PERSISTENT banner that stays until the change
  // actually reaches the cloud — it is NOT dismissable, because the data is still only
  // on this device and would be lost on refresh. The app auto-retries in the background;
  // "↻ Retry now" forces an immediate attempt. The banner is torn down centrally the
  // moment any write succeeds (see phase:'saved' above), so it can never linger falsely.
  // ─── SEAMLESS SESSION RESUME (v6.389) ───────────────────────────────────────
  // Replaces the red "session expired — reload and sign in again" bar. Order of escalation:
  //   1. Try a SILENT token refresh + retry. Nearly every real case is just a stale token, and
  //      this resolves it with no UI at all — the save simply lands.
  //   2. Only if the session is genuinely gone, show a small centred sign-in card. Signing in
  //      re-authenticates IN PLACE and immediately flushes the pending write. No reload — a
  //      reload is what used to destroy the unsaved record.
  // The user is never told to reload, and never sees a scary bar for a recoverable hiccup.
  let _sessionPromptOpen = false;

  // The server REFUSED the write while the session is perfectly valid (a security-rule
  // rejection). Signing in cannot help, so say so plainly, keep it out of the way, and make
  // clear the work is safe and still retrying. (v6.394)
  function showServerRefusedBar() {
    try {
      let bar = document.getElementById('cloud-save-fail-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'cloud-save-fail-bar';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:10000;background:#7c2d12;color:#fff;' +
          'padding:12px 16px;font-size:13px;line-height:1.45;box-shadow:0 -4px 18px rgba(0,0,0,.4);' +
          'display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;text-align:center';
        document.body.appendChild(bar);
      }
      bar.innerHTML =
        `<span style="flex:1 1 auto;min-width:220px">🛑 <b>${t('The server refused this change', 'رفض الخادم هذا التغيير')}</b> — ` +
        `${t('you are still signed in, so signing in again will not help. Your work is saved on this device and keeps retrying.', 'ما زلت مسجّل الدخول، لذا لن تفيد إعادة تسجيل الدخول. عملك محفوظ على هذا الجهاز وتتم إعادة المحاولة.')}</span>` +
        `<button id="cloud-retry-now" style="background:#fff;color:#7c2d12;border:none;border-radius:8px;padding:8px 16px;font-weight:800;cursor:pointer;white-space:nowrap">↻ ${t('Retry now', 'أعد المحاولة الآن')}</button>`;
      const btn = document.getElementById('cloud-retry-now');
      if (btn) btn.onclick = () => {
        btn.disabled = true; btn.style.opacity = '.6';
        Promise.resolve(window.Storage && window.Storage.retryNow ? window.Storage.retryNow() : { ok: false })
          .then(r => {
            if (r && r.ok) { try { bar.remove(); } catch (_) {} try { toast('✅ ' + t('Saved to cloud', 'حُفظ في السحابة'), 'success'); } catch (_) {} }
            else { btn.disabled = false; btn.style.opacity = '1'; }
          })
          .catch(() => { btn.disabled = false; btn.style.opacity = '1'; });
      };
    } catch (_) {}
  }

  async function showSessionResumePrompt() {
    if (_sessionPromptOpen) return;
    // 1) Try to re-mint the ID token. refreshAuth() resolves to a BOOLEAN: true = a fresh token
    //    was obtained (the session is genuinely alive), false = it could NOT be refreshed (the
    //    sign-in has truly lapsed — a revoked/expired refresh token, a password change, a disabled
    //    account). Capture that answer; it decides the message below.
    let tokenAlive = false;
    try {
      const r = await (window.Storage.refreshAuth ? window.Storage.refreshAuth() : false);
      tokenAlive = !!r;
    } catch (_) {}
    // 2) Retry the write — with the fresh token if we got one. If it lands, we're done.
    try {
      const retry = await (window.Storage.retryNow ? window.Storage.retryNow() : Promise.resolve({ ok: false }));
      if (retry && retry.ok) { try { document.getElementById('cloud-save-fail-bar')?.remove(); } catch (_) {} return; }
    } catch (_) {}

    // 3) Still failing — choose the message by the REAL reason (v6.407):
    //    • token refreshed (session alive) but the write is STILL refused → a genuine SERVER/RULES
    //      rejection; re-signing-in cannot help, so show the "server refused" bar.
    //    • token could NOT be refreshed → the session really lapsed, EVEN THOUGH the SDK still holds
    //      a stale currentUser. Re-signing-in WILL fix it, so show the sign-in prompt. The old code
    //      keyed only off `currentUser != null` and so wrongly told a genuinely-lapsed user that
    //      "signing in will not help" — the exact complaint that surfaced this.
    const _who = (() => { try { return window.Storage.currentUser && window.Storage.currentUser(); } catch (_) { return null; } })();
    if (tokenAlive && _who) { showServerRefusedBar(); return; }

    // 3) genuinely signed out — ask, in place, without losing anything
    _sessionPromptOpen = true;
    // Breadcrumb WHY the box appeared (token could not be refreshed + whether a user object even
    // remained) so a recurrence can be diagnosed via window.__sessionLog(). (v6.468)
    try {
      const KEY = 'blackstars-session-log';
      const log = JSON.parse(localStorage.getItem(KEY) || '[]');
      log.push({ at: new Date().toISOString(), reason: `prompt-shown tokenAlive=${!!tokenAlive} hadUser=${!!_who}`, ua: (navigator.onLine ? 'online' : 'offline') });
      while (log.length > 40) log.shift();
      localStorage.setItem(KEY, JSON.stringify(log));
    } catch (_) {}
    try { document.getElementById('cloud-save-fail-bar')?.remove(); } catch (_) {}
    const email = (() => { try { return (window.Storage.currentUser() || {}).email || (state.user && state.user.email) || ''; } catch (_) { return ''; } })();
    const wrap = document.createElement('div');
    wrap.id = 'session-resume-overlay';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px';
    wrap.innerHTML = `
      <div style="background:var(--surface,#fff);color:var(--text,#0f172a);max-width:400px;width:100%;border-radius:14px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.35)">
        <div style="font-size:17px;font-weight:900;margin-bottom:6px">🔐 ${t('Sign in to continue', 'سجّل الدخول للمتابعة')}</div>
        <div style="font-size:13px;line-height:1.55;color:var(--text-mute,#64748b);margin-bottom:14px">
          ${t('Your sign-in timed out. Your work is safe on this device — sign in and it will be saved to the cloud straight away.', 'انتهت مدة تسجيل دخولك. عملك محفوظ على هذا الجهاز — سجّل الدخول وسيُحفظ في السحابة فوراً.')}
        </div>
        <div class="field" style="margin-bottom:10px">
          <label style="font-size:12px">${t('Email', 'البريد')}</label>
          <input id="sr-email" value="${escapeHtml(email)}" style="width:100%" />
        </div>
        <div class="field" style="margin-bottom:6px">
          <label style="font-size:12px">${t('Password', 'كلمة المرور')}</label>
          <div style="position:relative">
            <input id="sr-pass" type="password" autocomplete="current-password" style="width:100%;padding-inline-end:38px" />
            <button id="sr-eye" type="button" title="${t('Show / hide password', 'إظهار / إخفاء كلمة المرور')}" style="position:absolute;inset-inline-end:6px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;padding:2px 4px;line-height:1">👁</button>
          </div>
          <div style="font-size:11px;color:var(--text-mute,#64748b);margin-top:4px">${t('Tip: a saved password may be out of date — tap 👁 to check it.', 'ملاحظة: قد تكون كلمة المرور المحفوظة قديمة — اضغط 👁 للتحقق منها.')}</div>
        </div>
        <div id="sr-msg" style="font-size:12px;min-height:18px;color:var(--red,#dc2626)"></div>
        <div style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:10px;flex-wrap:wrap">
          <button id="sr-reload" class="btn ghost" style="font-size:12px" title="${t('Your work is saved on this device — reloading is safe', 'عملك محفوظ على هذا الجهاز — إعادة التحميل آمنة')}">↻ ${t('Reload &amp; sign in fresh', 'أعد التحميل وسجّل من جديد')}</button>
          <button id="sr-go" class="btn primary">${t('Sign in &amp; save', 'دخول وحفظ')}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => { _sessionPromptOpen = false; try { wrap.remove(); } catch (_) {} };
    // 👁 reveal — lets the admin confirm a stale auto-filled password (the #1 cause of a
    // "sign-in not working" loop after the session lapses). (v6.464)
    document.getElementById('sr-eye').onclick = () => {
      const p = document.getElementById('sr-pass'); if (!p) return;
      p.type = p.type === 'password' ? 'text' : 'password';
    };
    // ↻ Escape hatch — a clean full reload takes them to the normal login screen where sign-in
    // always works; the unsaved change is journaled to disk and replays after login, so no work
    // is lost. This guarantees recovery even if the in-place sign-in keeps failing. (v6.464)
    document.getElementById('sr-reload').onclick = () => {
      try { if (window.Storage && window.Storage.flushPending) window.Storage.flushPending(); } catch (_) {}
      try { location.reload(); } catch (_) { location.href = location.href; }
    };
    const go = async () => {
      const msg = document.getElementById('sr-msg');
      const goBtn = document.getElementById('sr-go');
      const pass = (document.getElementById('sr-pass') || {}).value || '';
      const em = (document.getElementById('sr-email') || {}).value || '';
      if (!pass) { msg.textContent = t('Enter your password', 'أدخل كلمة المرور'); return; }
      if (goBtn) { goBtn.disabled = true; goBtn.style.opacity = '.6'; }
      msg.style.color = 'var(--text-mute)'; msg.textContent = t('Signing in…', 'جارٍ الدخول…');
      // 1) Re-authenticate. ONLY a real sign-in failure (wrong password) keeps the box open.
      try {
        await window.Storage.signIn(em, pass);
      } catch (e) {
        if (goBtn) { goBtn.disabled = false; goBtn.style.opacity = '1'; }
        msg.style.color = 'var(--red,#dc2626)';
        msg.textContent = (e && e.message) || t('Sign-in failed', 'فشل تسجيل الدخول');
        // A wrong (often stale auto-filled) password is the usual cause — clear the field, reveal
        // it, and refocus so the admin can type the correct one instead of resubmitting the bad
        // saved value. The ↻ Reload button remains as the guaranteed fallback. (v6.464)
        if (e && e.authKind === 'bad-password') {
          const p = document.getElementById('sr-pass');
          if (p) { p.value = ''; p.type = 'text'; try { p.focus(); } catch (_) {} }
        }
        return;
      }
      // 2) Signed in — the session is RESTORED, so ALWAYS close the box. Pushing the pending
      //    write must never keep it open: if the retry throws or fails, the change is still
      //    journaled to disk and auto-retries, so a failed retry is not a reason to trap the
      //    admin in this dialog (this was the "signed in but the box won't go away" bug). (v6.471)
      msg.textContent = t('Saving your work…', 'جارٍ حفظ عملك…');
      let ok = true;
      try { const r = await (window.Storage.retryNow ? window.Storage.retryNow() : Promise.resolve({ ok: true })); ok = !(r && r.ok === false); } catch (_) { ok = false; }
      close();
      toast(ok ? ('✅ ' + t('Signed in — your work is saved to the cloud', 'تم الدخول — عملك محفوظ في السحابة'))
               : t('Signed in — still saving, it will retry automatically', 'تم الدخول — ما زال الحفظ جارياً وسيُعاد تلقائياً'),
            ok ? 'success' : 'info');
      try { render(); } catch (_) {}
    };
    document.getElementById('sr-go').onclick = go;
    document.getElementById('sr-pass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    setTimeout(() => { try { document.getElementById('sr-pass').focus(); } catch (_) {} }, 60);
  }
  window.showSessionResumePrompt = showSessionResumePrompt;

  window.__onCloudSaveError = (err) => {
    try {
      const code = (err && (err.code || err.message)) || '';
      const isQuota = /resource-exhausted|exhausted|quota/i.test(String(code));
      const isAuth = /permission-denied|unauthenticated/i.test(String(code));   // lapsed sign-in, not a dropped connection
      // SESSION HANDLING (v6.389): an auth failure is not something to scold the user about with
      // a red bar that tells them to reload (which used to throw the unsaved change away). The
      // storage layer has already journalled the data to disk, so nothing is at risk. Give them
      // a quiet, in-place "sign in to continue" box that re-authenticates and immediately
      // resumes the pending save — no reload, no red bar, no lost work.
      if (isAuth) { showSessionResumePrompt(); return; }
      let bar = document.getElementById('cloud-save-fail-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'cloud-save-fail-bar';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:10000;background:#7f1d1d;color:#fff;' +
          'padding:12px 16px;font-size:13px;line-height:1.45;box-shadow:0 -4px 18px rgba(0,0,0,.4);' +
          'display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;text-align:center';
        document.body.appendChild(bar);
      }
      const reason = isQuota
        ? t('the cloud is busy (too many rapid saves)', 'الخادم مشغول (عمليات حفظ سريعة كثيرة)')
        : isAuth
        ? t('your sign-in session expired — reload the page and sign in again to save it', 'انتهت جلسة دخولك — أعد تحميل الصفحة وسجّل الدخول مجدداً لحفظه')
        : t('the connection to the cloud dropped', 'انقطع الاتصال بالسحابة');
      bar.innerHTML =
        `<span style="flex:1 1 auto;min-width:220px">⚠️ <b>${t('Your last change is NOT saved to the cloud', 'آخر تغيير لم يُحفظ في السحابة')}</b> — ${reason}. ` +
        // v6.389: no longer "will be lost if you close" — the change is journalled to disk and
        // replayed on the next start, so the honest message is that it is safe and retrying.
        `${t('It is saved on this device and will be sent automatically — retrying…', 'محفوظ على هذا الجهاز وسيُرسل تلقائياً — تتم إعادة المحاولة…')}</span>` +
        `<button id="cloud-retry-now" style="background:#fff;color:#7f1d1d;border:none;border-radius:8px;padding:8px 16px;font-weight:800;cursor:pointer;white-space:nowrap">↻ ${t('Retry now', 'أعد المحاولة الآن')}</button>` +
        `<span id="cloud-retry-msg" style="opacity:.9;white-space:nowrap"></span>`;
      const btn = document.getElementById('cloud-retry-now');
      const msg = document.getElementById('cloud-retry-msg');
      if (btn) btn.onclick = () => {
        btn.disabled = true; btn.style.opacity = '.6'; if (msg) msg.textContent = t('Saving…', 'جارٍ الحفظ…');
        Promise.resolve(window.Storage && window.Storage.retryNow ? window.Storage.retryNow() : { ok: false })
          .then(r => {
            if (r && r.ok) { try { bar.remove(); } catch (_) {} try { toast('✅ ' + t('Saved to cloud', 'حُفظ في السحابة'), 'success'); } catch (_) {} }
            else { btn.disabled = false; btn.style.opacity = '1'; if (msg) msg.textContent = t('Still failing — will keep retrying', 'لا يزال يفشل — ستستمر المحاولة'); }
          })
          .catch(() => { btn.disabled = false; btn.style.opacity = '1'; if (msg) msg.textContent = t('Still failing — will keep retrying', 'لا يزال يفشل — ستستمر المحاولة'); });
      };
    } catch (_) {}
  };

  // A record is getting close to Firestore's 1 MB per-document limit — warn the admin
  // by name so it can be cleaned before writes to it start failing. Throttled to once
  // per record per 5 min so it never spams.
  window.__onOversizeRecord = (() => {
    const shown = new Map();
    return (info) => {
      try {
        if (!info || currentRole() !== 'admin') return;
        const key = info.collection + '/' + info.id;
        const now = Date.now();
        if (now - (shown.get(key) || 0) < 300000) return;
        shown.set(key, now);
        let label = key;
        if (info.collection === 'members') { const m = (state.members || []).find(x => String(x.id) === String(info.id)); if (m && m.name) label = m.name; }
        toast('⚠ ' + t(`Record "${label}" is very large (${Math.round(info.bytes / 1024)} KB) and near the storage limit — run 🧹 Fix duplicate subscriptions or contact support.`, `السجل "${label}" كبير جداً (${Math.round(info.bytes / 1024)} كيلوبايت) وقريب من حد التخزين — شغّل 🧹 إصلاح الاشتراكات المكررة.`), 'error');
      } catch (_) {}
    };
  })();

  // Try to load saved state (from cloud or local)
  const usedSaved = await load();
  // 'blocked' → network block screen shown; 'blocked-auth' → login screen shown (session expired).
  // Either way the UI is already handled — do NOT start the app on empty state. (v6.345)
  if (usedSaved === 'blocked' || usedSaved === 'blocked-auth') return;
  if (!usedSaved) {
    // First launch (or empty cloud): start with the empty defaults already declared
    window._firstLaunch = true;
    state.__schema = SCHEMA_VERSION;
    // Don't save() here on cloud — wait until admin actually does something,
    // to avoid creating an empty document in Firestore on every visitor.
    if (!window.Storage.isCloud()) save();
  }

  // AUTO-HEAL the duplicate-subscription bloat on load (v6.297.0). The clones grew a
  // few member documents to ~1 MB — Firestore's HARD per-document limit — so any
  // further write to them was REJECTED (invalid-argument): the "error while saving"
  // seen across machines. The save-time backstop fixes this on the next write; doing
  // it here too means every ADMIN device self-heals the instant it loads (no edit
  // needed), and the shrunk records propagate to every other machine via sync. One-shot
  // (only when duplicates are actually present), admin + cloud only (they can write
  // member records; member/coach logins are read-scoped).
  try {
    if (window.Storage.isCloud() && typeof currentRole === 'function' && currentRole() === 'admin') {
      const collapsed = (typeof _dedupeSubsGuard === 'function') ? _dedupeSubsGuard() : 0;
      if (collapsed > 0) {
        console.warn(`[auto-heal] collapsing ${collapsed} duplicate subscription row(s) and saving to shrink oversized member document(s)…`);
        setTimeout(() => {
          try {
            if (typeof saveConfirmed === 'function') {
              saveConfirmed().then(r => {
                try { toast((r && r.ok ? '🧹 ' : '⚠ ') + t(`Cleaned up ${collapsed} duplicate subscription row(s)`, `تم تنظيف ${collapsed} صف اشتراك مكرر`), r && r.ok ? 'success' : 'info'); } catch (_) {}
              }).catch(() => {});
            } else { save(); }
          } catch (_) {}
        }, 1500);
      }
    }
  } catch (_) {}

  // v6.485: AUTO-RECONCILE sport switches on load (admin + cloud). A switch leaves the OLD sport active
  // and the payment un-split, so the source coach was over-credited and the card looked wrong. This
  // completes the old sport at what was ATTENDED, moves the rest to the new sport, splits the one
  // payment and voids the redundant switch-credit — so the split is automatic (no manual screen) and
  // the member card is correct. Backup-first + audited (inside _autoReconcileSwitches). Idempotent.
  try {
    if (window.Storage.isCloud() && typeof currentRole === 'function' && currentRole() === 'admin' && typeof window._autoReconcileSwitches === 'function') {
      const fixed = window._autoReconcileSwitches();
      if (fixed > 0) {
        console.warn(`[auto-reconcile] split ${fixed} switched membership(s) on load`);
        setTimeout(() => {
          try {
            if (typeof saveConfirmed === 'function') {
              saveConfirmed().then(r => { try { toast((r && r.ok ? '🔀 ' : '⚠ ') + t(`Auto-split ${fixed} switched membership(s) — the old coach keeps the classes attended, the new coach gets the rest`, `تم تقسيم ${fixed} اشتراك مبدَّل — المدرب القديم يحتفظ بالحصص المحضورة والباقي للمدرب الجديد`), r && r.ok ? 'success' : 'info'); } catch (_) {} }).catch(() => {});
            } else { save(); }
          } catch (_) {}
        }, 1600);
      }
    }
  } catch (_) {}

  // Subscribe to remote updates from other users (cloud only) — REAL-TIME AUTO-MERGE.
  // In the multi-document model the storage layer pushes a fresh snapshot whenever
  // ANY record changes anywhere (another receptionist adds a member, a coach marks
  // attendance, the owner records a payment). We merge it into the open session with
  // the existing record-level merge engine (mergeRemoteIntoState keeps local edits on
  // a genuine clash), then re-render so other users' changes appear live — UNLESS this
  // user is mid-edit (a modal is open or a field is focused), in which case we defer
  // the re-render until they're idle so we never yank a half-typed form out from under
  // them. Their data is already safely merged into state in the meantime, and the
  // cloud copy is never corrupted (per-record, field-level, deep-merged writes).
  if (window.Storage.isCloud()) {
    let _remoteRenderPending = false, _remoteRenderTimer = null;
    // Track the last moment the user interacted, so we can tell "actively working"
    // (scrolling / reading / hovering / typing) from "idle". While active we DON'T
    // redraw the page under them — the change is already merged in state, and we
    // apply it the moment they pause, so the screen never jumps mid-work.
    window.__lastInteractAt = window.__lastInteractAt || 0;
    try {
      const mark = () => { window.__lastInteractAt = Date.now(); };
      // v6.432 — per owner: DO NOT auto-refresh the screen while the mouse or keyboard is being
      // used. Every pointer move / key / scroll now counts as activity and resets the idle timer;
      // an incoming remote change only repaints after the user has been idle for ACTIVE_MS (30s),
      // and even then it re-renders the SAME screen (filters/search persist in storage and reload,
      // scroll is preserved) — so it refreshes the DATA without disturbing what you were doing.
      ['pointermove', 'mousemove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'touchmove', 'scroll'].forEach(ev =>
        window.addEventListener(ev, mark, { passive: true, capture: true }));
    } catch (_) {}
    const ACTIVE_MS = 30000;   // consider the user "busy" for 30s after any mouse/keyboard activity
    // Routes whose screen is a big working grid — see _renderKeepScroll. (v6.402)
    const NO_AUTO_REPAINT_ROUTES = new Set(['attendance', 'campschedule', 'schedule']);
    const isBusyEditing = () => {
      try {
        if (document.querySelector('.modal-overlay, .modal, [role="dialog"], #blocked-save-modal')) return true;
        const a = document.activeElement;
        if (a) {
          const tag = (a.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable) return true;
        }
        if (Date.now() - (window.__lastInteractAt || 0) < ACTIVE_MS) return true;   // scrolling / hovering / reading
      } catch (_) {}
      return false;
    };
    // Redraw while KEEPING the current scroll position, so incoming changes update
    // the content in place instead of snapping the page to the top ("the flicker").
    const _renderKeepScroll = () => {
      // v6.402: screens that are a LARGE grid the user works down (Attendance: hundreds of
      // students × 31 day-columns) are not auto-repainted. The remote change is ALREADY merged
      // into state, and every action on those screens re-renders anyway, so the only thing the
      // automatic repaint added was a whole-page rebuild landing seconds after the user stopped
      // touching — reported as "why did the screen refresh suddenly". The data is not stale: the
      // next mark, filter or navigation shows it. Everywhere else still repaints live.
      if (NO_AUTO_REPAINT_ROUTES.has(state.route)) { _remoteRenderPending = false; return; }
      let y = 0;
      try { y = _getScroll(); } catch (_) {}
      try { render(); } catch (e) { console.warn('[sync] render failed:', e); return; }
      try { requestAnimationFrame(() => requestAnimationFrame(() => { try { _setScroll(y); } catch (_) {} })); } catch (_) {}
    };
    const applyRemote = (remoteState) => {
      if (!remoteState) return;
      let res;
      try { res = mergeRemoteIntoState(remoteState); }
      catch (e) { console.warn('[sync] merge failed:', e); return; }
      if (!res || !res.changed) return;
      if (res.conflicts > 0) {
        let _names = '';
        try { const _l = (window.__syncConflictLog || [])[0]; if (_l && _l.items) _names = _l.items.slice(0, 2).map(x => x.name).filter(Boolean).join(', '); } catch (_) {}
        try { toast(t(`↔ Another device also edited ${res.conflicts} record(s)${_names ? ` (${_names})` : ''} — your version was kept. Review in Trash → Sync conflicts.`, `↔ جهاز آخر عدّل أيضاً ${res.conflicts} سجل${_names ? ` (${_names})` : ''} — تم الاحتفاظ بنسختك. راجع في المهملات ← تعارضات المزامنة.`), 'info'); } catch (_) {}
      }
      if (isBusyEditing()) {
        // Don't touch the screen while they're working — the change is ALREADY merged into
        // state; just remember to redraw the moment they stop. No banner: the owner never has
        // to be asked to refresh, the app refreshes itself when it is safe to do so. (v6.341)
        _remoteRenderPending = true;
      } else {
        // Idle: coalesce a burst of remote snapshots into ONE scroll-preserving redraw
        // after a short quiet gap (and re-check they didn't just start interacting).
        clearTimeout(_remoteRenderTimer);
        _remoteRenderTimer = setTimeout(() => {
          if (isBusyEditing()) { _remoteRenderPending = true; return; }
          _renderKeepScroll();
        }, 400);
      }
    };
    window.Storage.onRemoteUpdate(applyRemote);
    // LAZY AUDIT LOG (v6.453): the audit log is no longer part of the hot sync (it was ~70% of the
    // synced data and kept a heavy live listener open). Fetch it ONCE, in the background, a few
    // seconds after boot — so login/first paint stay fast, but "last updated by" and the Audit/Trash
    // screens still have the data this session. mergeRemoteIntoState never clobbers state.auditLog
    // (it's absent from remote snapshots), so this fetched copy survives subsequent live updates.
    if (!window.ensureAuditLog) {
      window._auditLogLoaded = false;
      window._auditLogLoading = null;
      window.ensureAuditLog = function (force) {
        if (window._auditLogLoaded && !force) return Promise.resolve(state.auditLog);
        if (window._auditLogLoading) return window._auditLogLoading;
        if (!window.Storage || typeof window.Storage.loadAuditLog !== 'function') return Promise.resolve(state.auditLog);
        window._auditLogLoading = window.Storage.loadAuditLog().then(arr => {
          window._auditLogLoading = null;
          if (Array.isArray(arr)) {
            // Merge the fetched history with any entries created THIS session (dedupe by id) so a
            // just-recorded action is never dropped by the background fetch.
            const have = new Set((Array.isArray(state.auditLog) ? state.auditLog : []).map(a => String(a && a.id)));
            const merged = (Array.isArray(state.auditLog) ? state.auditLog : []).slice();
            for (const a of arr) if (a && a.id != null && !have.has(String(a.id))) merged.push(a);
            state.auditLog = merged;
            window._auditLogLoaded = true;
          }
          return state.auditLog;
        }).catch(() => { window._auditLogLoading = null; return state.auditLog; });
        return window._auditLogLoading;
      };
      setTimeout(() => { try { window.ensureAuditLog(); } catch (_) {} }, 6000);
    }
    setInterval(() => {
      if (_remoteRenderPending && !isBusyEditing()) {
        _remoteRenderPending = false;
        try { const n = document.getElementById('newer-data-note'); if (n) n.remove(); } catch (_) {}   // clear any legacy bar
        _renderKeepScroll();
      }
    }, 1500);

    // Safety-net poll (v6.341). onRemoteUpdate is a live listener, but a listener can die
    // quietly — a dropped socket, a sleeping laptop, a backgrounded phone tab. Every 5 minutes
    // pull the cloud and run it through the SAME merge, so a device can never sit on stale data
    // waiting for a push that is never coming. Skipped while the tab is hidden (nothing to
    // redraw) and while a cloud write is still in flight (don't race our own save).
    const CLOUD_POLL_MS = 5 * 60 * 1000;
    window.__cloudPollAt = 0;
    const pollCloud = async () => {
      try {
        if (window.__cloudUnavailable) return;
        if (document.visibilityState === 'hidden') return;
        if (window.Storage.hasUnsavedCloud && window.Storage.hasUnsavedCloud()) return;
        const remote = await window.Storage.readCloud();
        window.__cloudPollAt = Date.now();
        if (remote) applyRemote(remote);
      } catch (e) { console.warn('[sync] poll failed:', e); }
    };
    setInterval(pollCloud, CLOUD_POLL_MS);
    // Coming back to the tab after a while is exactly when the listener is most likely stale.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - (window.__cloudPollAt || 0) > CLOUD_POLL_MS) pollCloud();
    });

    // ── SESSION KEEP-ALIVE (v6.374): the Firebase ID token expires ~1h. Firestore's live listeners
    // normally refresh it, but a sleeping laptop / long-backgrounded tab drops the socket so the
    // refresh never fires — then the FIRST write on wake fails with permission-denied and the red
    // "not saved" bar appears "suddenly", and a reload in that window loses the day's change. Fix:
    // re-mint the token PROACTIVELY — on a timer well under the 1h expiry, and the instant the tab
    // regains focus or the network reconnects (precisely the wake moments) — so writes stay
    // authorised and the bar never fires from an expiry. Storage.refreshAuth() also re-sends
    // anything still unsaved once the fresh token lands, so recovery is automatic.
    // v6.468 — HARDENED so the session stays alive even after a long sleep. The old design was a
    // single 30-min fire-and-forget timer whose refresh error was swallowed: when a laptop woke
    // from sleep the wake-refresh fired BEFORE wifi reconnected, failed silently, the token then
    // expired, and the next click showed the "sign in to continue" box. Now: a shorter interval,
    // the wake/reconnect refresh RETRIES with backoff until it actually lands (covers the
    // no-network-yet moment), it also warms on user activity (an actively-working admin never
    // lapses), and every failure is recorded to a small local breadcrumb log for diagnosis.
    const TOKEN_REFRESH_MS = 15 * 60 * 1000;    // 15 min — well under the ~1h token life; survives 2× background timer throttling
    const ACTIVITY_WARM_MS = 8 * 60 * 1000;     // at most one activity-driven refresh per 8 min
    const _AUTH_RETRY_DELAYS = [3000, 8000, 20000, 45000, 90000];   // wake-retry backoff (ms)
    let _authRetryTimer = null, _authRetryAttempt = 0, _lastActivityWarm = 0;
    const _sessionBreadcrumb = (reason) => {
      try {
        const KEY = 'blackstars-session-log';
        const log = JSON.parse(localStorage.getItem(KEY) || '[]');
        log.push({ at: new Date().toISOString(), reason: String(reason).slice(0, 80), ua: (navigator.onLine ? 'online' : 'offline') });
        while (log.length > 40) log.shift();
        localStorage.setItem(KEY, JSON.stringify(log));
      } catch (_) {}
    };
    window.__sessionLog = () => { try { return JSON.parse(localStorage.getItem('blackstars-session-log') || '[]'); } catch (_) { return []; } };
    const _scheduleAuthRetry = () => {
      if (_authRetryTimer) return;
      const d = _AUTH_RETRY_DELAYS[Math.min(_authRetryAttempt, _AUTH_RETRY_DELAYS.length - 1)];
      _authRetryAttempt++;
      _authRetryTimer = setTimeout(() => { _authRetryTimer = null; _keepAuthAlive('retry'); }, d);
    };
    const _keepAuthAlive = (why) => {
      try {
        if (!(window.Storage && window.Storage.refreshAuth && window.Storage.isCloud && window.Storage.isCloud())) return;
        Promise.resolve(window.Storage.refreshAuth()).then(ok => {
          if (ok) {
            if (_authRetryTimer) { clearTimeout(_authRetryTimer); _authRetryTimer = null; }
            _authRetryAttempt = 0;
          } else {
            // refresh returned false — usually no network yet on wake, or a genuinely dead session.
            // Keep retrying with backoff; if it's truly dead the next write's error path shows the
            // (now escapable) sign-in box. Only start retrying for wake/reconnect/timer triggers.
            _sessionBreadcrumb('refresh-failed:' + (why || '?'));
            _scheduleAuthRetry();
          }
        }).catch(() => { _sessionBreadcrumb('refresh-threw:' + (why || '?')); _scheduleAuthRetry(); });
      } catch (_) {}
    };
    setInterval(() => _keepAuthAlive('interval'), TOKEN_REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') _keepAuthAlive('visible'); });
    window.addEventListener('online', () => _keepAuthAlive('online'));
    window.addEventListener('focus', () => _keepAuthAlive('focus'));
    window.addEventListener('pageshow', () => _keepAuthAlive('pageshow'));   // bfcache / back-forward restore
    // Keep the token warm while the admin is actually using the app — throttled so it costs at most
    // one refresh per 8 min. This means an ACTIVE session never expires out from under a click.
    const _onUserActivity = () => {
      const now = Date.now();
      if (now - _lastActivityWarm >= ACTIVITY_WARM_MS) { _lastActivityWarm = now; _keepAuthAlive('activity'); }
    };
    ['click', 'keydown', 'pointerdown'].forEach(ev => document.addEventListener(ev, _onUserActivity, { passive: true, capture: true }));
    _keepAuthAlive('boot');   // one refresh right after load so a resumed tab starts fresh
  }

  // ── DATA-LOSS SAFETY NET: never lose an in-flight change on tab close/hide ──
  // Flush any throttled-but-unsent cloud write immediately, and take a final local
  // backup snapshot. visibilitychange→hidden is the reliable hook (fires on
  // tab-switch / app-background, page still alive so async completes); pagehide /
  // beforeunload are best-effort belt-and-suspenders for a hard close.
  const _flushOnExit = () => {
    try { if (window.Storage && window.Storage.flushPending) window.Storage.flushPending(); } catch (_) {}
    try {
      if (window.Storage && window.Storage.snapshotBackup) {
        const { user, route, session, ...persistable } = state;
        window.Storage.snapshotBackup(persistable, 'exit', true);
      }
    } catch (_) {}
  };
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushOnExit(); });
    window.addEventListener('pagehide', _flushOnExit);
    window.addEventListener('beforeunload', (e) => {
      _flushOnExit();
      // If a change is confirmed NOT yet in the cloud, block the refresh/close with the
      // browser's native "Leave site?" prompt so it can't be lost by an accidental reload.
      try {
        if (window.Storage && window.Storage.hasUnsavedCloud && window.Storage.hasUnsavedCloud()) {
          e.preventDefault(); e.returnValue = ''; return '';
        }
      } catch (_) {}
    });
  } catch (_) {}

  // Set initial route from URL hash
  const hash = location.hash.slice(1);
  if (hash && ROUTES[hash]) state.route = hash;

  // Show login
  render();
  try { _idleReset(); } catch (_) {}   // start idle auto-logout if a session was restored

  // RECOVERED WORK from a session that died before its save landed (v6.389). Tell the user
  // plainly what came back and push it to the cloud now — silence here is what made staff
  // believe the app "eats" their entries.
  if (window.__pendingRecovery) {
    const rec = window.__pendingRecovery;
    window.__pendingRecovery = null;
    if (rec.restored && rec.restored.length) {
      const names = rec.restored.slice(0, 3).map(r => r.label).join(', ');
      const more = rec.restored.length > 3 ? ` +${rec.restored.length - 3} more` : '';
      setTimeout(() => {
        confirmSaved(`♻ ${t('Recovered', 'تم استرجاع')} ${rec.restored.length} ${t('unsaved record(s) from your last session', 'سجل لم يُحفظ من جلستك السابقة')} — ${names}${more}`);
      }, 900);
    }
    if (rec.conflicts && rec.conflicts.length) {
      setTimeout(() => {
        toast(`⚠ ${rec.conflicts.length} ${t('record(s) from the unsaved session differ from the cloud copy — the cloud version was kept. Ask an admin to review.', 'سجل من الجلسة غير المحفوظة يختلف عن نسخة السحابة — تم الإبقاء على نسخة السحابة. راجعها مع المشرف.')}`, 'info');
      }, 2600);
    }
  }

  // One-time notice if we migrated from an older data schema
  if (window._schemaMigrated) {
    const { from, to } = window._schemaMigrated;
    window._schemaMigrated = null;
    setTimeout(() => toast(`Data structure upgraded (v${from} → v${to}). Your records are preserved.`, 'success'), 600);
  }

  // Status sync notice — informational, only if changes actually happened
  if (window.__pendingStatusSync) {
    const n = window.__pendingStatusSync;
    window.__pendingStatusSync = null;
    // Save to persist the synced statuses
    
    setTimeout(() => confirmSaved(`✓ Refreshed status on ${n} member${n === 1 ? '' : 's'} (date-based)`), 1100);
  }

  // Banner: which backend
  if (window.Storage.isCloud()) {
    setTimeout(() => toast('☁️ Connected to cloud — data syncs across devices', 'success'), 400);
  }

  // ─── Global keyboard shortcuts ─────────────────────────────────
  // Press "/" to focus the first search box on the current page.
  // Ignored when the user is already typing in an input/textarea.
  document.addEventListener('keydown', (e) => {
    // F5 / Ctrl+R (or Cmd+R) → refresh the DATA IN PLACE (pull the latest from the cloud and
    // re-render, keeping your scroll/filters) instead of a full browser reload. A real reload
    // re-boots the app and can bounce the admin to the login screen; this never does — the
    // signed-in session stays live, so you just see fresh data. Ctrl+Shift+R (hard reload) is
    // deliberately left alone so a new app VERSION can still be picked up, and on the login
    // screen the keys do their normal browser thing. (v6.465)
    const _isSoftReloadKey = (e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) ||
                             ((e.key === 'r' || e.key === 'R') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey);
    if (_isSoftReloadKey) {
      const onLoginScreen = !!document.getElementById('login-btn') || !!document.getElementById('login-pass');
      const cloudUp = !!(window.Storage && window.Storage.isCloud && window.Storage.isCloud());
      if (!onLoginScreen && cloudUp && typeof window.refreshFromCloud === 'function') {
        e.preventDefault();
        // Flush any not-yet-saved change first so the pull can't race a pending write, then
        // pull + re-render in place (the sidebar refresh icon spins if present).
        try { if (window.Storage.flushPending) window.Storage.flushPending(); } catch (_) {}
        try { window.refreshFromCloud(document.querySelector('.sidebar-refresh-ic')); } catch (_) { try { window.refreshFromCloud(); } catch (__) {} }
        return;
      }
      // else (login screen / offline) → let the browser reload normally
    }
    // Cmd+K / Ctrl+K → global command palette (jump anywhere)
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openCmdK();
      return;
    }
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.target.isContentEditable) return;
    // Find the first visible input that looks like a search box
    const candidates = document.querySelectorAll('input[type="text"], input[type="search"], input[id*="search"], input[placeholder*="earch"]');
    for (const inp of candidates) {
      if (inp.offsetParent !== null) {  // visible
        e.preventDefault();
        inp.focus();
        inp.select?.();
        return;
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// Cmd+K Command Palette — global quick-jump search
// Triggered by Ctrl+K / Cmd+K from any page. Searches:
//   • Members (active first, then archived)
//   • Coaches/staff
//   • All navigation routes (pages)
// Selecting jumps to the page or opens member detail.
// ═══════════════════════════════════════════════════════════════════
function openCmdK() {
  // Security: the command palette can jump to members, coaches, money pages —
  // it must never be reachable before login. Bail out if no user is signed in.
  if (!state.user) return;
  // Don't open twice
  if (document.querySelector('.cmdk-backdrop')) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'cmdk-backdrop';
  backdrop.innerHTML = `
    <div class="cmdk-palette" role="dialog" aria-label="Quick search">
      <div class="cmdk-input-wrap">
        <span class="cmdk-icon">🔎</span>
        <input id="cmdk-input" class="cmdk-input" type="text" placeholder="Search members, coaches, pages…" autocomplete="off" spellcheck="false" />
        <span class="cmdk-hint">ESC</span>
      </div>
      <div id="cmdk-results" class="cmdk-results"></div>
      <div class="cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>esc</kbd> close</span>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const input = backdrop.querySelector('#cmdk-input');
  const results = backdrop.querySelector('#cmdk-results');
  let activeIdx = 0;
  let currentItems = [];

  function close() {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
  }

  function buildItems(query) {
    const q = query.trim().toLowerCase();
    const items = [];

    // Pages — always shown, filter by query
    const pages = Object.entries(ROUTES).map(([key, route]) => ({
      type: 'page',
      icon: route.icon,
      title: route.label,
      subtitle: route.section,
      action: () => { navigate(key); },
      score: scoreMatch(q, route.label.toLowerCase()),
    })).filter(p => !q || p.score > 0);

    // Members — active first, archived last
    const members = state.members.map(m => ({
      type: 'member',
      icon: m.deleted ? '📦' : '👤',
      title: m.name + (m.nameArabic ? ' · ' + m.nameArabic : ''),
      subtitle: [
        m.deleted ? 'Archived' : memberStatus(m),
        m.sport,
        m.phone ? formatPhone(m.phone) : null,
      ].filter(Boolean).join(' · '),
      action: () => { window.viewMember?.(m.id); },
      score: scoreMatch(q, (m.name + ' ' + (m.nameArabic || '') + ' ' + (m.phone || '') + ' ' + (m.phone2 || '') + ' ' + (m.qid || '')).toLowerCase()),
      _archived: !!m.deleted,
    })).filter(m => !q || m.score > 0);

    // Coaches
    const coaches = state.coaches.map(c => ({
      type: 'coach',
      icon: c.role === 'staff' ? '👔' : '🥋',
      title: c.name,
      subtitle: [
        c.role === 'staff' ? 'Staff' : 'Coach',
        isCoachActive(c) ? 'Active' : 'Inactive',
        c.phone ? formatPhone(c.phone) : null,
      ].filter(Boolean).join(' · '),
      action: () => { navigate('coaches'); },
      score: scoreMatch(q, (c.name + ' ' + (c.phone || '')).toLowerCase()),
    })).filter(c => !q || c.score > 0);

    // Sort each group by score (descending), then alphabetically
    pages.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    members.sort((a, b) => {
      if (a._archived !== b._archived) return a._archived ? 1 : -1;
      return b.score - a.score || a.title.localeCompare(b.title);
    });
    coaches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

    // Cap each section so the palette stays focused
    const capped = (arr, n) => arr.slice(0, n);

    if (!q) {
      items.push({ section: 'Pages' });
      capped(pages, 8).forEach(p => items.push(p));
    } else {
      if (members.length) { items.push({ section: 'Members' }); capped(members, 8).forEach(m => items.push(m)); }
      if (coaches.length) { items.push({ section: 'Team' });    capped(coaches, 5).forEach(c => items.push(c)); }
      if (pages.length)   { items.push({ section: 'Pages' });   capped(pages, 6).forEach(p => items.push(p)); }
    }
    return items;
  }

  // Simple fuzzy-ish scoring: exact match > startsWith > contains > word-boundary contains
  function scoreMatch(q, hay) {
    if (!q) return 1;
    if (!hay) return 0;
    if (hay === q) return 100;
    if (hay.startsWith(q)) return 80;
    // Word boundary match (any word starts with query)
    if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(hay)) return 60;
    if (hay.includes(q)) return 40;
    return 0;
  }

  function renderResults() {
    const q = input.value;
    const items = buildItems(q);
    currentItems = items.filter(i => !i.section);
    if (!currentItems.length) {
      results.innerHTML = '<div class="cmdk-empty">No matches. Try a member name, phone, or page name.</div>';
      activeIdx = 0;
      return;
    }
    activeIdx = Math.min(activeIdx, currentItems.length - 1);

    let html = '';
    let itemIdx = 0;
    for (const it of items) {
      if (it.section) {
        html += `<div class="cmdk-section">${escapeHtml(it.section)}</div>`;
      } else {
        const isActive = itemIdx === activeIdx;
        html += `
          <div class="cmdk-item ${isActive ? 'active' : ''}" data-idx="${itemIdx}">
            <div class="cmdk-item-icon">${it.icon}</div>
            <div class="cmdk-item-text">
              <div class="cmdk-item-title">${escapeHtml(it.title)}</div>
              <div class="cmdk-item-subtitle">${escapeHtml(it.subtitle || '')}</div>
            </div>
          </div>`;
        itemIdx++;
      }
    }
    results.innerHTML = html;

    // Bind clicks
    results.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        const item = currentItems[idx];
        if (item?.action) {
          close();
          item.action();
        }
      });
      el.addEventListener('mouseenter', () => {
        activeIdx = parseInt(el.dataset.idx);
        results.querySelectorAll('.cmdk-item').forEach((x, i) => x.classList.toggle('active', i === activeIdx));
      });
    });

    // Scroll active item into view
    const active = results.querySelector('.cmdk-item.active');
    active?.scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, currentItems.length - 1);
      renderResults();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderResults();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = currentItems[activeIdx];
      if (item?.action) {
        close();
        item.action();
      }
    }
  }

  input.addEventListener('input', renderResults);
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  renderResults();
  // Defer focus to next frame so the modal animation completes
  requestAnimationFrame(() => input.focus());
}
window.openCmdK = openCmdK;

// Helper: format a phone for display (uses parseStoredPhone if available)
function formatPhone(stored) {
  if (!stored) return '';
  try {
    const p = parseStoredPhone(stored);
    return p.code + ' ' + p.digits;
  } catch (e) {
    return stored;
  }
}

window.addEventListener('DOMContentLoaded', init);
// Watch the server for a newer deployed build (independent of init succeeding).
window.addEventListener('DOMContentLoaded', () => { try { startDeployWatch(); } catch (_) {} });
