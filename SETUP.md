# UMA Finance Reimbursement Tracker: Setup Guide

The site reads and writes your existing Google Sheet. The Director of Finance signs in with Google, assigns each reimbursement request to a budget line, and moves it through its stages. Execs on the allowlist can view. Everyone else sees an access message.

You need: edit access to the Google Sheet, a Google account, a GitHub account with this repo, and a Vercel account (free).

---

## 1. Create a Google sign-in key (OAuth Client ID)

This lets the site offer "Sign in with Google".

1. Go to https://console.cloud.google.com and create a project (any name, e.g. "UMA Finance").
2. Open **APIs & Services → OAuth consent screen**. Choose **External**, fill in the app name and your email, and save. If asked, add yourself as a test user or publish the app.
3. Open **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Under **Authorized JavaScript origins**, add both:
   - `http://localhost:3000`
   - your Vercel site URL (you will get it in step 5; come back and add it then)
6. Click **Create** and copy the **Client ID** (ends in `.apps.googleusercontent.com`).

## 2. Add the code to the Google Sheet

1. Open the finance Google Sheet. Click **Extensions → Apps Script**.
2. Delete any existing code. Create these files (the **+** next to "Files" → **Script**), named exactly, and paste in the matching file from the `apps-script` folder of this repo:
   - `logic.gs`
   - `config.gs`
   - `sheets.gs`
   - `Code.gs`
3. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Go back to the editor, open `appsscript.json`, and paste in the repo's `apps-script/appsscript.json`.
4. In `config.gs`, replace:
   - `DIRECTOR_EMAIL` with the Director of Finance's Google email
   - `GOOGLE_CLIENT_ID` with the Client ID from step 1
5. Click **Save**. Choose `setupSheets` in the function dropdown and click **Run**. Approve the permission prompts (click Advanced → Go to project if Google warns you).
6. Open **Execution log**. It should end with `requiredMissing: []`. If it lists names instead, a column header in the "Reimbursements Tracker" tab does not match what the site expects. Rename those headers in the sheet, then run `setupSheets` again.
7. `setupSheets` also creates two tabs: **One-off Expenses** and **Site Access**.
8. Check the data: choose `debugState` and click **Run**. In the log, confirm:
   - the number of requests looks right
   - the budget lines and their budgets match the Finance Tracker tab
   - no phone numbers, UIDs, or addresses appear

## 3. Deploy the Apps Script as a web app

1. Click **Deploy → New deployment**. Click the gear and choose **Web app**.
2. **Execute as:** Me. **Who has access:** Anyone. (The site checks who is signed in itself.)
3. Click **Deploy**, approve permissions, and copy the **Web app URL**.

**Important:** any time you change the code later, the live site will not update until you go to **Deploy → Manage deployments → pencil icon → Version: New version → Deploy**. The URL stays the same.

## 4. Put the URLs in the site config

Edit `web/config.js` in the repo:

```js
window.APP_CONFIG = {
  API_URL: "<Web app URL from step 3>",
  GOOGLE_CLIENT_ID: "<Client ID from step 1>"
};
```

Commit and push to GitHub.

## 5. Publish on Vercel

1. In Vercel, click **Add New → Project** and import the GitHub repo.
2. Set **Root Directory** to `web`, **Framework Preset** to **Other**, and leave the build command empty.
3. Click **Deploy**. Copy the site URL.
4. Return to the Google Cloud credentials (step 1) and add that URL as an Authorized JavaScript origin.

## 6. Give execs access

Open the **Site Access** tab in the Google Sheet. Column A holds one email per row (the director is already listed). Add each exec's Google email on a new row. To remove access, delete the row. Changes apply the next time the site loads.

Execs see the data but have no edit controls. Anyone not listed sees an access message.

## 7. Day-one migration (do this right away)

The site computes each budget line's **Spent** from the requests assigned to it, and **overwrites the hand-typed Spent cells in the Finance Tracker the first time it loads**. Until requests are assigned, those will likely show $0. Before the first load, copy the old Spent numbers somewhere safe.

Then, signed in as the director:

1. Assign each existing request to its budget line.
2. Enter any spending that is not a reimbursement (for example Savings $260) as a **one-off expense**.
3. Compare the Finance Tracker's Spent column with your saved numbers.

## 8. Quick end-to-end check

1. Sign in as the director. Assign one request to a budget line. The Finance Tracker's **Spent** cell for that line should change.
2. Set that request to **Stage 3**. The Stage 2 and Stage 3 checkboxes in the Reimbursements tab should both be ticked.
3. Cancel the request. **Spent** should go back to its earlier value.
4. Add a one-off expense, check it appears in the One-off Expenses tab, then delete it.
5. Sign in as an exec listed in Site Access. You should see data but no edit controls.
6. Sign in with an account not listed. You should see the access message.
