// Fill in DIRECTOR_EMAILS and FINANCE_SPREADSHEET_ID in the Apps Script editor (keep real values out of this public repo).
// This script lives in the Reimbursements Tracker spreadsheet; the Finance Tracker is a separate file.
var CONFIG = {
  REIMB_SHEET_NAME: "CalLink",
  // The long ID in the Finance Tracker's URL: docs.google.com/spreadsheets/d/<THIS PART>/edit
  FINANCE_SPREADSHEET_ID: "PASTE_FINANCE_TRACKER_SPREADSHEET_ID",
  FINANCE_SHEET_NAME: "Fall 2026",
  ONEOFF_SHEET_NAME: "One-off Expenses",
  ACCESS_SHEET_NAME: "Site Access",
  REIMB_HEADER_ROW: 1,
  // Everyone here can edit on the site (assign, stages, one-offs).
  DIRECTOR_EMAILS: ["PASTE_DIRECTOR_EMAIL"],
  GOOGLE_CLIENT_ID: "450711685592-dnaija6i662rvcgjj7j8goavnstu0dc8.apps.googleusercontent.com"
};
