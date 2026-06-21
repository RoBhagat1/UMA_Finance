# UMA Finance Reimbursement System — Setup Guide

## What This Does

Members fill out a Google Form to request reimbursement. You (the treasurer) get an email with all the details and three buttons: **Approve via Venmo**, **Approve via ASUC Reimburse**, or **Deny**. Clicking a button automatically updates the log sheet and deducts from the correct budget category.

---

## Step 1 — Open Apps Script

1. Open your UMA Finance **Google Sheet**
2. Click **Extensions → Apps Script**
3. Delete any existing code in the editor

---

## Step 2 — Paste the Script Files

Create the following files in the Apps Script editor. For each one, click the **+** button next to "Files" and choose **Script**, name it exactly as shown, then paste the contents.

| File | Contents |
|---|---|
| `config.gs` | Paste from `config.gs` |
| `Code.gs` | Paste from `Code.gs` (replaces the default `Code.gs`) |
| `formHandler.gs` | Paste from `formHandler.gs` |
| `email.gs` | Paste from `email.gs` |
| `approval.gs` | Paste from `approval.gs` |

---

## Step 3 — Configure `config.gs`

Open `config.gs` and fill in these three values:

```javascript
TREASURER_EMAIL: "your-email@berkeley.edu",
SECRET_TOKEN: "uma-finance-2024-abc123xyz",  // make up any random string
WEB_APP_URL: "PASTE_WEB_APP_URL_HERE",       // fill this in after Step 5
```

**For SECRET_TOKEN:** just type any random mix of letters and numbers. It's used to make approval links secure.

---

## Step 4 — Run One-Time Setup

In the Apps Script editor, run these two functions once (use the dropdown at the top to select each function, then click ▶ Run):

1. **`createSubmissionsSheet`** — creates the "Submissions" tab in your spreadsheet
2. **`setupTrigger`** — registers the form submission trigger

You'll be asked to grant permissions — click through and authorize.

---

## Step 5 — Deploy as Web App

This lets the approval buttons in email actually work.

1. Click **Deploy → New deployment**
2. Click the gear icon ⚙ next to "Type" → choose **Web app**
3. Set **"Execute as"** → Me
4. Set **"Who has access"** → Anyone
5. Click **Deploy**
6. Copy the **Web app URL** that appears

Now go back to `config.gs` and paste that URL into `WEB_APP_URL`.

> **Important:** Any time you edit the script after this, you must do **Deploy → Manage deployments → Edit → New version** to push the update. Just saving the file is not enough.

---

## Step 6 — Create the Google Form

Create a new Google Form with the following fields **in this exact order**. The question titles must match exactly — the script uses them to find the right data.

### Section 1: Personal Info
| Question | Type | Required |
|---|---|---|
| First Name | Short answer | Yes |
| Last Name | Short answer | Yes |
| Phone Number | Short answer | Yes |
| What is your UID? | Short answer | Yes |
| What is your Venmo @? | Short answer | Yes |

Add a description to the UID question:
> To find your UID, search your name in the [UC Berkeley Campus Directory](https://www.berkeley.edu/directory). Your UID is NOT your Student ID.

### Section 2: Expense Info
| Question | Type | Options / Notes |
|---|---|---|
| Date of Expense | Date | Must match your receipt |
| Budget Category | Dropdown | Use the 15 categories (see below) |
| Type of Expense | Multiple choice | food, copies/printing, supplies, travel, drink, other |
| If you chose "Other" above, please explain below | Short answer | Not required |
| Please explain what you bought in more detail | Paragraph | Yes |
| Did you buy this item? | Multiple choice | Yes, No |

Add a description to "Did you buy this item?":
> If you used a card not under your name (e.g. your parent's card), select No — we'll need additional info.

**Budget Category dropdown options** (add all 15):
- Welcome Dinner
- Recruitment Budget
- PR Budget
- Design Team Budget
- Events Team Budget
- Strategy Team 1 Budget
- Strategy Team 2 Budget
- Strategy Team 3 Budget
- EVP Budget
- Retreat
- Banquet
- Exec Social
- Merch
- IVP / Misc Social Budget
- Savings

### Section 3: Third-Party Card (conditional — only shown if "Did you buy this item?" = No)
| Question | Type |
|---|---|
| Name of person whose card you used | Short answer |
| Cardholder's full mailing address | Paragraph |

Add description:
> ASUC will mail them a check. Please provide their FULL mailing address including zip code.

Set up branching: in the "Did you buy this item?" question, click the three dots → **"Go to section based on answer"** → Yes → go to Section 4 (Item 1), No → go to Section 3 (Third-Party Card). After Section 3, go to Section 4.

### Section 4: Item 1
| Question | Type |
|---|---|
| Vendor/Store Name (Item 1) | Short answer |
| Physical Location (Item 1) | Short answer |
| Full Price (Item 1) | Short answer |
| Receipt (Item 1) | File upload (PDF) |
| Do you need to be reimbursed for another item? | Multiple choice: Yes, No |

Set branching: Yes → Section 5 (Item 2), No → Section 6 (Payment).

### Section 5: Item 2 (optional)
Same 4 item fields + another item question → Section 6 (Item 3) or Section 7 (Payment).

### Section 6: Item 3 (optional)
Same 4 item fields (no more items after this).

### Section 7: Payment
| Question | Type | Notes |
|---|---|---|
| How Would You Like To Be Paid Back? | Multiple choice | Direct Deposit, Pickup, Mailed Check |
| Full mailing address | Paragraph | In case check needs to be mailed |

Add a description to the payment question:
> **Note:** Pickup is quicker. Mailed check can get lost. For large amounts, we suggest pickup or direct deposit. Direct deposit is most convenient but requires a one-time sign-up with ASUC.

For Direct Deposit: add a section description or separate "text" question (not collected) explaining:
> If requesting direct deposit, please fill out the ASUC Direct Deposit form first: [ASUC Form Link]. **DO NOT submit this form until you have submitted the ASUC direct deposit form.** You only need to enroll once per year.

### Link the Form to the Sheet

1. In Google Forms, click the **Responses** tab
2. Click the green Sheets icon → **Select existing spreadsheet** → choose your UMA Finance sheet
3. This links the form so the trigger fires on submit

---

## Step 7 — Test It

1. Submit a test response through the form
2. Check that a new row appears in the **Submissions** tab with Status = "Pending"
3. Check that you received an approval email
4. Click **Approve — Venmo** → confirm the status updates and the Budget sheet's Spent/Remaining update
5. Try **Deny** on a second test → confirm no budget change

---

## Troubleshooting

**Approval buttons don't work**
→ Make sure `WEB_APP_URL` in `config.gs` is set and you redeployed after saving.

**Budget category not updating**
→ The category name in the form dropdown must match the Budget sheet column A exactly (including spacing and capitalization).

**Not receiving emails**
→ Check `TREASURER_EMAIL` in `config.gs`. Also check spam.

**"Already processed" message when clicking a button**
→ The submission was already approved or denied. Check the Submissions sheet for its current status.
