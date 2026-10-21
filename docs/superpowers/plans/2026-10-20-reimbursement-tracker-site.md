# Reimbursement Tracker Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Vercel-hosted, Google-sign-in-protected site where UMA exec see each budget line's Budget/Spent/Remaining and every reimbursement's stage, and the director of finance assigns budget lines, sets stages, cancels requests, fixes amounts, and logs one-off expenses — all stored in the existing Google Sheet.

**Architecture:** The Google Sheet stays the source of truth. A Google Apps Script web app (`apps-script/`) is a JSON API: it verifies the caller's Google ID token, checks the allowlist, reads/writes the sheet, and writes computed Spent/Remaining back into the Finance Tracker. All business logic lives in pure functions in `apps-script/logic.gs`, which also loads in Node for tests. A static site (`web/`) on Vercel signs users in with Google Identity Services and calls the API.

**Tech Stack:** Google Apps Script (V8), Google Sheets, Google Identity Services, plain HTML/CSS/JS (no framework, no build), Node ≥18 built-in test runner (`node --test`), Vercel static hosting.

**Spec:** `docs/superpowers/specs/2026-10-20-reimbursement-tracker-site-design.md`

## Global Constraints

- Phone Number, UID, Mailing Address, Venmo, and Email from the form are **never** sent to the browser. The API serializes requests through a whitelist (`toPublicRequest`), never by copying rows.
- Only the director (`CONFIG.DIRECTOR_EMAIL`) can mutate. Viewers must be on the "Site Access" tab **and** end in `@berkeley.edu`; the director is always allowed regardless of domain.
- Stage labels are exactly `"Stage 1"` … `"Stage 5"`. Stage 1 = form submitted (automatic). Stages 2–5 = the existing `Stage 2`…`Stage 5` checkbox columns. Setting stage N ticks Stage 2..N and unticks N+1..5. No other statuses except Cancelled.
- Remaining = Budget − Spent and may be negative; negatives display as `−$370.45` in a warning color.
- Spent per line = sum of amounts of non-cancelled requests assigned to it + one-off expenses on it. No carried-over starting amount.
- Budget lines come from the Finance Tracker's Expenses table at runtime, never hard-coded.
- Sheet columns are located by header text, never by fixed index (the old `config.gs` layout is stale).
- No filler UI: no custom stage names, notes, emails, dashboards, or charts beyond what the spec lists.
- Commit after every task (small, frequent commits).

## Review Focus

1. Hundreds of blank rows with empty checkboxes below the real data (visible in the current sheet) → ignored; a row is a request only if Email or First Name is non-empty. *(Task 2 test `rowsToRequests skips blank checkbox rows`)*
2. Price cells that Sheets returns as numbers (`1198.3`, `5`) as well as strings (`"$190.38"`, `"1,198.30"`, `"SM"`, `"$320.00 x 1 night"`) → numbers and clean strings parse; anything else flags "needs amount" and the request contributes $0 until the director overrides. *(Task 1)*
3. A budget line renamed/removed in the Finance Tracker after requests were assigned to it → those requests count as Unassigned and are flagged `orphaned`, not silently dropped. *(Task 1 test `computeBudgets treats unknown line as unassigned`)*
4. An allowed viewer (non-director) POSTing a mutation directly → `{ok:false, error:"forbidden"}`, nothing written. *(Task 3 test `authorize rejects viewer mutation`)*
5. ID token expired after ~1 hour → API returns `unauthenticated`; the site clears the token and shows the sign-in button instead of a broken page. *(Task 4 manual check, step 6)*

---

## File Structure

```
apps-script/
  appsscript.json   manifest (V8, timezone America/Los_Angeles)
  config.gs         CONFIG: tab names, DIRECTOR_EMAIL, GOOGLE_CLIENT_ID
  logic.gs          pure functions (no Apps Script globals); module.exports for Node
  sheets.gs         all SpreadsheetApp reads/writes; setup function
  Code.gs           doPost router, token verification, action handlers
web/
  index.html        markup + GIS script tag
  config.js         window.APP_CONFIG = { API_URL, GOOGLE_CLIENT_ID }
  format.js         formatCurrency, stageLabel (pure; module.exports for Node)
  api.js            call(action, payload) → Promise<state>
  app.js            sign-in, rendering, director controls
  style.css
tests/
  logic.test.js
  format.test.js
package.json        { "scripts": { "test": "node --test tests/" } }
SETUP.md            rewritten
```

Delete: `Code.gs`, `config.gs`, `email.gs`, `approval.gs`, `formHandler.gs` at repo root (replaced by `apps-script/`).

## Shared data shapes (used by every task)

```js
// Raw request built from a sheet row (server-side only)
RawRequest = { id, row, firstName, lastName, date, type, otherExplanation,
  description,            // "Name of Expense"
  items: [{ vendor, location, priceRaw, receipts: string[] }],  // 1–3, only non-empty
  paymentMethod, stageChecks: [bool,bool,bool,bool],   // Stage 2..5
  budgetLine, amountOverride /* number|null */, cancelled /* bool */,
  // private, never serialized:
  email, phone, uid, mailingAddress }

PublicRequest = { id, name, date, type, description, items, paymentMethod,
  stage /* 1..5 */, budgetLine /* string|null */, amount /* number|null */,
  needsAmount, cancelled, orphaned }

BudgetLine = { name, budget, spent, remaining, row }
OneOff     = { id, date, description, amount, budgetLine }

State = { user: { email, isDirector }, budgetLines: BudgetLine[],
  unassignedTotal, requests: PublicRequest[], oneOffs: OneOff[] }
```

---

### Task 1: Pure money and stage logic

**Files:**
- Create: `package.json`, `apps-script/logic.gs`, `tests/logic.test.js`

**Interfaces:**
- Produces (exported from `logic.gs`):
  - `parsePrice(raw: string|number|null) -> number|null`
  - `requestAmount(req: {items, amountOverride}) -> { amount: number|null, needsAmount: boolean }`
  - `stageFromChecks(checks: bool[4]) -> 1..5`
  - `checksForStage(stage: 1..5) -> bool[4]`
  - `normalizeName(s: string) -> string` (lowercase, collapse whitespace, trim)
  - `computeBudgets(lines: {name,budget}[], requests: {budgetLine, amount, cancelled}[], oneOffs: {budgetLine, amount}[]) -> { lines: {name,budget,spent,remaining}[], unassignedTotal: number, orphanedLineNames: Set<string> }`

- [ ] **Step 1: Write failing tests** in `tests/logic.test.js` (`const L = require('../apps-script/logic.gs')`, `node:test` + `node:assert/strict`):

```js
test('parsePrice', () => {
  assert.equal(L.parsePrice('$190.38'), 190.38);
  assert.equal(L.parsePrice('1,198.30'), 1198.3);
  assert.equal(L.parsePrice(' 5 '), 5);
  assert.equal(L.parsePrice(1198.3), 1198.3);
  assert.equal(L.parsePrice('$25'), 25);
  assert.equal(L.parsePrice('SM'), null);
  assert.equal(L.parsePrice('$320.00 x 1 night'), null);
  assert.equal(L.parsePrice(''), null);
  assert.equal(L.parsePrice(null), null);
});
test('requestAmount sums items', () => {
  const r = { amountOverride: null, items: [{priceRaw:'75.65'},{priceRaw:'90.09'},{priceRaw:'43.53'}] };
  assert.deepEqual(L.requestAmount(r), { amount: 209.27, needsAmount: false });
});
test('requestAmount flags unparseable item', () => {
  const r = { amountOverride: null, items: [{priceRaw:'$25'},{priceRaw:'SM'}] };
  assert.deepEqual(L.requestAmount(r), { amount: null, needsAmount: true });
});
test('requestAmount override wins', () => {
  const r = { amountOverride: 320, items: [{priceRaw:'$320.00 x 1 night'}] };
  assert.deepEqual(L.requestAmount(r), { amount: 320, needsAmount: false });
});
test('stages', () => {
  assert.equal(L.stageFromChecks([false,false,false,false]), 1);
  assert.equal(L.stageFromChecks([true,true,false,false]), 3);
  assert.equal(L.stageFromChecks([true,false,true,false]), 4); // highest ticked wins
  assert.deepEqual(L.checksForStage(1), [false,false,false,false]);
  assert.deepEqual(L.checksForStage(4), [true,true,true,false]);
  assert.throws(() => L.checksForStage(6));
});
test('computeBudgets allows negative and ignores cancelled', () => {
  const out = L.computeBudgets(
    [{name:'Welcome Dinner', budget:1000}, {name:'Retreat', budget:4000}],
    [{budgetLine:'welcome dinner', amount:1198.30, cancelled:false},
     {budgetLine:'Welcome Dinner', amount:172.15, cancelled:false},
     {budgetLine:'Retreat', amount:500, cancelled:true},
     {budgetLine:null, amount:51.26, cancelled:false},
     {budgetLine:null, amount:null, cancelled:false}],
    [{budgetLine:'Retreat', amount:260}]);
  assert.equal(out.lines[0].spent, 1370.45);
  assert.equal(out.lines[0].remaining, -370.45);
  assert.equal(out.lines[1].spent, 260);
  assert.equal(out.unassignedTotal, 51.26);
});
test('computeBudgets treats unknown line as unassigned', () => {
  const out = L.computeBudgets([{name:'Retreat', budget:4000}],
    [{budgetLine:'Old Line', amount:10, cancelled:false}], []);
  assert.equal(out.unassignedTotal, 10);
  assert.ok(out.orphanedLineNames.has('old line'));
});
```

- [ ] **Step 2:** Create `package.json` (`{"name":"uma-finance","private":true,"scripts":{"test":"node --test tests/"}}`). Run `npm test`. Expected: FAIL (cannot find module / not a function).

- [ ] **Step 3: Implement** the six functions in `apps-script/logic.gs` with ES5-compatible-looking `function` declarations (Apps Script V8 is fine with modern JS, but no `require`/`import`). `parsePrice`: numbers pass through if finite; strings strip `$`, `,`, whitespace, then must match `/^\d+(\.\d+)?$/`. Round all money sums to cents (`Math.round(x*100)/100`). `requestAmount` with no items and no override → `{amount:null, needsAmount:true}`. End the file with:

```js
if (typeof module !== "undefined") module.exports = { parsePrice, requestAmount, stageFromChecks, checksForStage, normalizeName, computeBudgets };
```

- [ ] **Step 4:** Run `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit** `git add package.json apps-script/logic.gs tests/logic.test.js && git commit -m "Add pure budget, price, and stage logic with tests"`

---

### Task 2: Row mapping, privacy whitelist, and access check

**Files:**
- Modify: `apps-script/logic.gs`, `tests/logic.test.js`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces:
  - `mapColumns(headerRow: string[]) -> colMap` — object keyed by logical field; repeated headers (`Vendor Name`, `Location`, `Receipt`) resolve by occurrence into `items[0..2]`. Keys: `email, firstName, lastName, phone, uid, date, type, otherExplanation, description, paymentMethod, mailingAddress, stage2..stage5, requestId, budgetLine, amountOverride, cancelled, items: [{vendor, location, price, receipt}]` (0-based column indices; missing → `-1`). Header text matched with `normalizeName`. Exact header strings: `Email, First Name, Last Name, Phone Number, UID, Date, Type, "Other" Explanation, Name of Expense, Vendor Name, Location, Price of Item #1|#2|#3, Receipt, Payment Method, Mailing Address, Stage 2, Stage 3, Stage 4, Stage 5, Request ID, Budget Line, Amount Override, Cancelled`.
  - `requiredMissing(colMap) -> string[]` — names of required headers absent (all of the above except `requestId, budgetLine, amountOverride, cancelled`, which setup adds).
  - `rowsToRequests(values: any[][], colMap, firstDataRow: number) -> RawRequest[]` — `row` is the 1-based sheet row; receipts split on commas, trimmed, empties dropped; an item is included only if vendor, price, or receipt is non-empty; `amountOverride` via `parsePrice`; checkbox/cancelled cells true only when `=== true` or `"TRUE"`.
  - `toPublicRequest(raw: RawRequest, budget: {amount, needsAmount}, orphaned: bool) -> PublicRequest`
  - `checkAccess(email: string, allowlist: string[], directorEmail: string) -> { allowed: bool, isDirector: bool }`

- [ ] **Step 1: Write failing tests** using a fixture header row copied from the spec's sheet plus two real-shaped rows (Alex Rivera's 3-item gas row; Sam's Wingstop row) and three blank rows containing only `false` checkbox values.

```js
test('mapColumns resolves repeated item headers by occurrence', () => {
  const c = L.mapColumns(HEADERS);
  assert.equal(c.items.length, 3);
  assert.equal(HEADERS[c.items[1].price], 'Price of Item #2');
  assert.ok(c.items[2].vendor > c.items[1].vendor);
  assert.deepEqual(L.requiredMissing(c), []);
});
test('rowsToRequests skips blank checkbox rows', () => {
  const reqs = L.rowsToRequests(ROWS, L.mapColumns(HEADERS), 2);
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].items.length, 3);
  assert.equal(reqs[1].items.length, 1);
  assert.equal(reqs[0].row, 2);
});
test('toPublicRequest never leaks private fields', () => {
  const raw = L.rowsToRequests(ROWS, L.mapColumns(HEADERS), 2)[0];
  const pub = L.toPublicRequest(raw, L.requestAmount(raw), false);
  const json = JSON.stringify(pub);
  for (const secret of ['alex.rivera@berkeley.edu','5105550101','1000001','100 Example St'])
    assert.ok(!json.includes(secret), secret);
  assert.equal(pub.name, 'Alex Rivera');
  assert.equal(pub.amount, 209.27);
});
test('checkAccess', () => {
  const allow = ['Exec@Berkeley.edu', 'friend@gmail.com'];
  assert.deepEqual(L.checkAccess('exec@berkeley.edu', allow, 'dir@gmail.com'), {allowed:true,isDirector:false});
  assert.deepEqual(L.checkAccess('friend@gmail.com', allow, 'dir@gmail.com'), {allowed:false,isDirector:false});
  assert.deepEqual(L.checkAccess('stranger@berkeley.edu', allow, 'dir@gmail.com'), {allowed:false,isDirector:false});
  assert.deepEqual(L.checkAccess('DIR@gmail.com', [], 'dir@gmail.com'), {allowed:true,isDirector:true});
});
```

- [ ] **Step 2:** `npm test` → new tests FAIL.
- [ ] **Step 3:** Implement the five functions in `logic.gs`; add them to `module.exports`. `toPublicRequest` builds the object field-by-field from the `PublicRequest` shape — no spreading of `raw`. `name` = first + " " + last, trimmed. Dates: pass through as ISO date string (`YYYY-MM-DD`) when the cell is a `Date`, else the string as-is.
- [ ] **Step 4:** `npm test` → all PASS.
- [ ] **Step 5: Commit** `git commit -am "Add sheet row mapping, privacy whitelist, and access check"`

---

### Task 3: Sheet I/O and the JSON API

**Files:**
- Create: `apps-script/appsscript.json`, `apps-script/config.gs`, `apps-script/sheets.gs`, `apps-script/Code.gs`
- Modify: `apps-script/logic.gs`, `tests/logic.test.js`
- Delete: `Code.gs`, `config.gs`, `email.gs`, `approval.gs`, `formHandler.gs` (repo root)

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `CONFIG = { REIMB_SHEET_NAME: "Reimbursements Tracker", FINANCE_SHEET_NAME: "Finance Tracker", ONEOFF_SHEET_NAME: "One-off Expenses", ACCESS_SHEET_NAME: "Site Access", REIMB_HEADER_ROW: 1, DIRECTOR_EMAIL: "REPLACE_ME@gmail.com", GOOGLE_CLIENT_ID: "REPLACE_ME.apps.googleusercontent.com" }`
  - Pure, in `logic.gs`: `authorize(action: string, access: {allowed,isDirector}) -> null | "forbidden"` (read action: `getState`; mutations: `updateRequest, addOneOff, updateOneOff, deleteOneOff`; unknown action → `"bad_request"`), and `validatePatch(action, payload, lineNames: string[]) -> string|null` (error message or null).
  - `sheets.gs`: `setupSheets()` (one-time, safe to re-run: appends missing `Request ID, Budget Line, Amount Override, Cancelled` headers to the reimbursements tab; creates `One-off Expenses` tab with headers `ID, Date, Description, Amount, Budget Line` and `Site Access` tab with header `Email` and `CONFIG.DIRECTOR_EMAIL` pre-filled; logs `requiredMissing` results), `readRequests() -> RawRequest[]` (backfills missing Request IDs with `Utilities.getUuid().slice(0,8)` for rows that are requests), `readBudgetLines() -> BudgetLine[]` (finds the row whose first column is `Expenses` and has `Budget`, `Spent`, `Remaining` headers; reads rows until `Total Expenses` or a blank name), `readOneOffs() -> OneOff[]`, `readAllowlist() -> string[]`, `writeRequestFields(row, fields: {budgetLine?, stageChecks?, amountOverride?, cancelled?})`, `appendOneOff / updateOneOff / deleteOneOff`, `writeBudgetTotals(lines)` (writes only cells whose value differs).
  - `Code.gs`: `doPost(e)` — body is JSON `{ idToken, action, payload }` sent as `text/plain`. Response is always `ContentService` JSON `{ ok: true, state }` or `{ ok: false, error }` with `error ∈ {"unauthenticated","forbidden","bad_request","server_error"}` plus `message`. `buildState(email, isDirector) -> State`.

- [ ] **Step 1: Write failing tests** for the two new pure functions:

```js
test('authorize rejects viewer mutation', () => {
  const viewer = {allowed:true, isDirector:false};
  assert.equal(L.authorize('getState', viewer), null);
  assert.equal(L.authorize('updateRequest', viewer), 'forbidden');
  assert.equal(L.authorize('getState', {allowed:false,isDirector:false}), 'forbidden');
  assert.equal(L.authorize('updateRequest', {allowed:true,isDirector:true}), null);
  assert.equal(L.authorize('dropTables', {allowed:true,isDirector:true}), 'bad_request');
});
test('validatePatch', () => {
  const lines = ['Retreat','Welcome Dinner'];
  assert.equal(L.validatePatch('updateRequest', {id:'a1', budgetLine:'Retreat'}, lines), null);
  assert.equal(L.validatePatch('updateRequest', {id:'a1', budgetLine:null}, lines), null); // unassign
  assert.match(L.validatePatch('updateRequest', {id:'a1', budgetLine:'Nope'}, lines), /budget line/i);
  assert.match(L.validatePatch('updateRequest', {id:'a1', stage:0}, lines), /stage/i);
  assert.match(L.validatePatch('updateRequest', {budgetLine:'Retreat'}, lines), /id/i);
  assert.match(L.validatePatch('addOneOff', {description:'Cash', amount:-5, budgetLine:'Retreat', date:'2026-10-01'}, lines), /amount/i);
  assert.equal(L.validatePatch('addOneOff', {description:'Cash reimbursement', amount:40, budgetLine:'Retreat', date:'2026-10-01'}, lines), null);
});
```

- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `authorize` and `validatePatch` in `logic.gs` (export them). `amountOverride` may be a non-negative number or `null` (clears it). One-off `amount` must be a finite number > 0; `description` non-empty; `date` matches `YYYY-MM-DD`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Implement `config.gs`, `sheets.gs`, `Code.gs`, and `appsscript.json` (`{"timeZone":"America/Los_Angeles","runtimeVersion":"V8","exceptionLogging":"STACKDRIVER","webapp":{"executeAs":"USER_DEPLOYING","access":"ANYONE_ANONYMOUS"}}`). Token verification in `Code.gs`: `UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(t), {muteHttpExceptions:true})`; accept only if HTTP 200, `aud === CONFIG.GOOGLE_CLIENT_ID`, `email_verified === "true"`, `Number(exp)*1000 > Date.now()`; cache the verified email in `CacheService.getScriptCache()` keyed by a SHA-256 of the token for 300 s. Wrap every mutation and the ID backfill in `LockService.getScriptLock().waitLock(10000)`. Every successful call ends by recomputing via `computeBudgets`, calling `writeBudgetTotals`, and returning `buildState`. Catch all exceptions → `server_error` (log the stack, never return it).
- [ ] **Step 6:** Delete the five old root `.gs` files.
- [ ] **Step 7: Verify in Apps Script** (needs the real spreadsheet; if you can't access it, hand these steps to the user): paste the four `apps-script/` files (plus `logic.gs`) into the spreadsheet's Apps Script project, set `DIRECTOR_EMAIL`, run `setupSheets` → log shows `requiredMissing: []` and the three new headers/tabs exist. Run a scratch function `function debugState(){ Logger.log(JSON.stringify(buildState(CONFIG.DIRECTOR_EMAIL, true))); }` → log shows ~17 requests, 15 budget lines whose `budget` values match the sheet, no phone/UID/address strings.
- [ ] **Step 8: Commit** `git add -A apps-script && git rm Code.gs config.gs email.gs approval.gs formHandler.gs && git commit -m "Replace email approval flow with sheet-backed JSON API"`

---

### Task 4: Website

**Files:**
- Create: `web/index.html`, `web/config.js`, `web/format.js`, `web/api.js`, `web/app.js`, `web/style.css`, `tests/format.test.js`

**Interfaces:**
- Consumes: the API contract from Task 3 (`POST API_URL`, body `{idToken, action, payload}` as `text/plain;charset=utf-8`, response `{ok, state|error}`).
- Produces: `format.js` exports `formatCurrency(n: number|null) -> string` and `stageLabel(n) -> string`.

- [ ] **Step 1: Write failing tests** in `tests/format.test.js`:

```js
const F = require('../web/format.js');
test('formatCurrency', () => {
  assert.equal(F.formatCurrency(1370.45), '$1,370.45');
  assert.equal(F.formatCurrency(-370.45), '−$370.45'); // U+2212 minus
  assert.equal(F.formatCurrency(0), '$0.00');
  assert.equal(F.formatCurrency(null), 'Needs amount');
});
test('stageLabel', () => { assert.equal(F.stageLabel(3), 'Stage 3'); });
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implement `format.js` (attach to `window` in the browser, `module.exports` in Node). **Step 4:** `npm test` → PASS.

- [ ] **Step 5: Build the page.** Screens and behavior (nothing beyond this list):
  - **Signed out:** title "UMA Reimbursements" and the Google sign-in button (`google.accounts.id.renderButton`). Token kept in `sessionStorage` (wrapped in try/catch).
  - **Not allowed** (`forbidden` on `getState`): "Your account doesn't have access. Ask the director of finance to add you." + sign out.
  - **Budgets:** table of every budget line — Name, Budget, Spent, Remaining (negative in warning color) — then an "Unassigned" row with `unassignedTotal`.
  - **Reimbursements:** list grouped as Unassigned first, then by budget line; cancelled ones collapsed at the bottom. Each shows name, date, description, vendor(s), amount (or "Needs amount" badge), receipt links (open in new tab), payment method, and a 5-step stage indicator labeled Stage 1–5. `orphaned` requests show "Budget line not found".
  - **Director only** (`state.user.isDirector`): per request — budget-line `<select>` (plus "Unassigned"), stage `<select>` Stage 1–5, amount-override input, Cancel/Restore toggle. A "One-off expenses" section: list with edit/delete, and an add form (date, description, amount, budget line). Each control calls the API and re-renders from the returned `state`; disable the control while the call is in flight and show the error `message` inline on failure.
  - Any `unauthenticated` response: clear the stored token and return to the signed-out screen.
  - Layout works at 375px width.
- [ ] **Step 6: Manual verification** with `npx serve web` against the deployed API (authorized JS origin must include `http://localhost:3000`): sign in as the director → budgets match the sheet; assign one request → its line's Spent and the Finance Tracker's Spent cell both change; set Stage 3 → Stage 2 and 3 boxes ticked in the sheet; cancel → Spent goes back; add/delete a one-off. Sign in as an allowlisted exec → no edit controls. Sign in as a non-listed account → access message. Clear `sessionStorage` token to an invalid string and reload → returns to sign-in.
- [ ] **Step 7: Commit** `git add web tests/format.test.js && git commit -m "Add reimbursement tracker website"`

---

### Task 5: Setup guide and deploy

**Files:**
- Modify: `SETUP.md` (full rewrite)

- [ ] **Step 1:** Rewrite `SETUP.md` for the treasurer/director, in order: (1) Google Cloud: create an OAuth Client ID (Web), add the Vercel URL and `http://localhost:3000` as authorized JavaScript origins; (2) Apps Script: paste `apps-script/*` files into the spreadsheet's project, fill `DIRECTOR_EMAIL` and `GOOGLE_CLIENT_ID`, run `setupSheets`; (3) Deploy → Web app, execute as Me, access Anyone; copy URL; note that every code change needs Manage deployments → Edit → New version; (4) put `API_URL` and `GOOGLE_CLIENT_ID` in `web/config.js`; (5) Vercel: import the GitHub repo, Root Directory `web`, Framework "Other", no build command; (6) add exec emails to the "Site Access" tab; (7) day-one migration: director assigns each existing request to a budget line on the site, and enters any non-reimbursement spending (e.g. Savings $260) as one-off expenses — the old hand-typed Spent numbers get overwritten.
- [ ] **Step 2:** Verify `npm test` passes and `grep -rn "SECRET_TOKEN\|TREASURER_EMAIL\|sendApprovalEmail" .` (excluding `.git` and `docs/`) returns nothing.
- [ ] **Step 3: Commit** `git commit -am "Rewrite setup guide for website deployment"`
