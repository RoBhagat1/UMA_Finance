# UMA Reimbursement Tracker Website — Design

Date: 2026-10-20
Owner: Rohan Bhagat

## Why

UMA's finances live in two Google Sheets in the same spreadsheet:

- **Finance Tracker** — revenues (PayPal, CalLink, dues, client donations) and an
  Expenses table of ~15 budget lines, each with Budget / Spent / Remaining.
  Spent is typed in by hand today; Remaining is blank; totals are broken.
- **Reimbursements Tracker** — the Google Form's response sheet, with four
  checkbox columns headed "Stage 2" … "Stage 5" that the director of finance
  ticks by hand as a reimbursement moves through ASUC. The orange "CalLink
  Balance" cell sits in the header row to their left; it is not a stage.

Exec can't easily see how much is left in each budget or where a given
reimbursement stands, and the director has to copy amounts from one sheet to the
other by hand. The goal is a website that shows each budget line going down as
money is committed, and lets the director move reimbursements through the ASUC
stages.

The existing Apps Script in this repo (email approve/deny flow) is replaced by this.

## Who uses it

- **Exec (main audience)** — view-only. They want to see budget remaining per line
  and the status of reimbursements.
- **Director of finance** — the only editor. Assigns requests to a budget line,
  ticks stages, logs one-off expenses.
- **Members** — never use the site. They keep submitting the existing Google Form.

## Goals

1. Show every budget line from the Finance Tracker's Expenses table with Budget,
   Spent, Remaining. Remaining may go negative and should be visibly so.
2. Show every reimbursement request with: submitter name, date, description,
   vendor(s), total amount, receipt link(s), assigned budget line, and stage.
3. Director can, on the site:
   - assign a request to a budget line (and change it later);
   - set its stage — Stage 1 through Stage 5;
   - cancel a request (denied / withdrawn), which returns its money to the budget;
   - fix the amount when the form price is unparseable or wrong;
   - add a **one-off expense** (e.g. cash reimbursement, direct CalLink payment):
     description, amount, budget line, date. Editable and deletable.
4. Spent for a budget line = sum of non-cancelled requests assigned to it +
   one-off expenses on it. It updates the moment the director assigns.
5. Requests not yet assigned appear in an "Unassigned" group with a running total.
6. Changes the director makes on the site are written back to the Google Sheet so
   the sheet remains the source of truth and stays usable if the site is down.

## Stages

- Stage 1 = the member submitted the form. Automatic; every request starts here.
- Stage 2 = the director has submitted the reimbursement to ASUC.
- Stages 3–5 = ASUC's subsequent steps.
- Stages 2–5 map one-to-one to the existing "Stage 2" … "Stage 5" checkbox
  columns; the site reads and writes those same cells.
- Labels are literally "Stage 1" … "Stage 5". No custom names, no extra statuses.
- Stages are sequential: setting Stage N implies 2..N are done (my call).

## Non-goals

- No member-facing view or member login.
- No changes to what members fill out on the Google Form (budget line is
  assigned by the director, not asked on the form).
- No revenue editing on the site. Revenues stay in the sheet. (Showing them
  read-only is optional, builder's call.)
- No email notifications.
- No custom stage names, notes fields, or extra workflow states beyond Stage 0–5
  and Cancelled.

## Anti-goals (failure even if it "works")

- Exposing phone numbers, UIDs, home/mailing addresses, or Venmo handles on the
  site. These must never be sent to the browser.
- The site being viewable by anyone with the link.
- The site silently disagreeing with the sheet.
- Filler UI the user didn't ask for.

## Access

- Sign in with Google. Only `@berkeley.edu` accounts on an **exec allowlist**
  may view.
- The director's Gmail address is hard-coded in config and is the only account
  that can edit. The director may use a non-berkeley Gmail; it is always allowed.
- The allowlist lives somewhere exec can update without redeploying
  (my call: a small "Site Access" tab in the spreadsheet, one email per row).

## How it gets made (decided)

- **Google Form** — unchanged; members keep using it.
- **Google Sheet** — source of truth. Existing Finance Tracker and Reimbursements
  Tracker tabs are kept. New columns/tabs are added as needed (e.g. Request ID,
  Budget Line, Cancelled, Amount Override on the reimbursements tab; a "One-off
  Expenses" tab; a "Site Access" tab).
- **Backend** — Google Apps Script in this repo, reworked into a JSON API
  deployed as a web app. It reads/writes the sheet and enforces who may do what.
- **Frontend** — a static site hosted free on Vercel, calling the Apps Script API.
- Budget lines are read from the Finance Tracker's Expenses table at runtime, not
  hard-coded (the current `BUDGET_CATEGORIES` list is stale — it differs from the
  sheet). Adding a line in the sheet makes it appear on the site.
- The old email approval flow (`email.gs`, approval links, `SECRET_TOKEN`) is removed.

## Data notes

- Form prices are messy: "$190.38", "1,198.30", "5", "SM", "$320.00 x 1 night".
  Parse what's parseable; anything that isn't parses to "needs amount" and is
  flagged for the director, who enters the amount via the override.
- Up to 3 items per request; total = sum of item prices.
- Receipt fields can contain multiple comma-separated Drive links.
- The response sheet holds only Fall 2026 requests; every row counts.
- The sheet's header row and the Expenses table's bounds are read from the real
  spreadsheet at setup and kept in config (the old `config.gs` describes a
  different, stale layout).

## Existing data (decided)

- Existing requests (~17) arrive Unassigned. The director assigns each to its
  budget line on the site; stages already ticked in the sheet are kept.
- Today's hand-typed Spent numbers are **not** kept as a starting amount. Any
  spending in them that isn't a reimbursement request (e.g. Savings $260) is
  entered by the director as a one-off expense.
- After that, Spent is fully computed. The site writes computed Spent and
  Remaining into the Finance Tracker's Spent/Remaining cells so the sheet and
  site agree (my call; supersedes the open item below).

## Left to the builder

- How Google sign-in is verified between Vercel and Apps Script (e.g. Google
  Identity Services ID token sent to Apps Script and verified there).
- Frontend framework (plain HTML/JS is fine), layout, styling.
- Exact column/tab names for new sheet data, and how to make sheet writes safe
  under concurrent edits (LockService).
- Setup instructions (replace SETUP.md).
