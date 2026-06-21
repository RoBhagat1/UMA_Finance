// ─── Configuration ───────────────────────────────────────────────────────────
// Fill in these values before deploying.

var CONFIG = {
  TREASURER_EMAIL: "your-treasurer-email@example.com",

  // Generate a random string and paste it here. This is embedded in approval
  // links to prevent unauthorized approvals from guessed URLs.
  SECRET_TOKEN: "REPLACE_WITH_A_RANDOM_STRING",

  // After deploying this script as a Web App, paste the URL here.
  WEB_APP_URL: "PASTE_WEB_APP_URL_HERE",

  BUDGET_SHEET_NAME: "Budget",
  SUBMISSIONS_SHEET_NAME: "Submissions",

  // Row numbers in the Budget sheet where categories live (inclusive).
  BUDGET_START_ROW: 13,
  BUDGET_END_ROW: 27,

  // Column indices in the Budget sheet (1-based).
  BUDGET_COL_CATEGORY: 1,  // Column A — Expense name
  BUDGET_COL_BUDGET: 2,    // Column B — Budget amount
  BUDGET_COL_SPENT: 3,     // Column C — Spent (script writes here)
  BUDGET_COL_REMAINING: 4, // Column D — Remaining (script writes here)
};

// Budget categories exactly as they appear in the Budget sheet column A.
// These also populate the Google Form dropdown — keep them in sync.
var BUDGET_CATEGORIES = [
  "Welcome Dinner",
  "Recruitment Budget",
  "PR Budget",
  "Design Team Budget",
  "Events Team Budget",
  "Strategy Team 1 Budget",
  "Strategy Team 2 Budget",
  "Strategy Team 3 Budget",
  "EVP Budget",
  "Retreat",
  "Banquet",
  "Exec Social",
  "Merch",
  "IVP / Misc Social Budget",
  "Savings",
];

// Submission sheet column indices (1-based).
var SUBMISSION_COLS = {
  TIMESTAMP: 1,
  SUBMISSION_ID: 2,
  FIRST_NAME: 3,
  LAST_NAME: 4,
  PHONE: 5,
  UID: 6,
  VENMO: 7,
  DATE_OF_EXPENSE: 8,
  BUDGET_CATEGORY: 9,
  EXPENSE_TYPE: 10,
  EXPENSE_TYPE_OTHER: 11,
  DESCRIPTION: 12,
  OWN_CARD: 13,
  CARDHOLDER_NAME: 14,
  CARDHOLDER_ADDRESS: 15,
  ITEM1_VENDOR: 16,
  ITEM1_LOCATION: 17,
  ITEM1_PRICE: 18,
  ITEM1_RECEIPT: 19,
  ITEM2_VENDOR: 20,
  ITEM2_LOCATION: 21,
  ITEM2_PRICE: 22,
  ITEM2_RECEIPT: 23,
  ITEM3_VENDOR: 24,
  ITEM3_LOCATION: 25,
  ITEM3_PRICE: 26,
  ITEM3_RECEIPT: 27,
  PAYMENT_METHOD: 28,
  MAILING_ADDRESS: 29,
  TOTAL_AMOUNT: 30,
  STATUS: 31,
  DECISION_TIMESTAMP: 32,
};

var SUBMISSION_HEADERS = [
  "Timestamp", "Submission ID", "First Name", "Last Name", "Phone", "UID",
  "Venmo", "Date of Expense", "Budget Category", "Expense Type",
  "Expense Type (Other)", "Description", "Own Card?", "Cardholder Name",
  "Cardholder Address", "Item 1 Vendor", "Item 1 Location", "Item 1 Price",
  "Item 1 Receipt", "Item 2 Vendor", "Item 2 Location", "Item 2 Price",
  "Item 2 Receipt", "Item 3 Vendor", "Item 3 Location", "Item 3 Price",
  "Item 3 Receipt", "Payment Method", "Mailing Address", "Total Amount",
  "Status", "Decision Timestamp",
];
