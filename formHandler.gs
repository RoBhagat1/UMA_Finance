// ─── Form Response Parsing ────────────────────────────────────────────────────

/**
 * Extracts all fields from the form submit event into a plain object.
 * Field titles must match exactly what's set in the Google Form.
 */
function parseFormResponse(e) {
  var responses = e.namedValues;

  function get(key) {
    var val = responses[key];
    return val && val[0] ? val[0].trim() : "";
  }

  function getPrice(key) {
    var raw = get(key).replace(/[$,\s]/g, "");
    var num = parseFloat(raw);
    return isNaN(num) ? 0 : num;
  }

  var data = {
    firstName:          get("First Name"),
    lastName:           get("Last Name"),
    phone:              get("Phone Number"),
    uid:                get("What is your UID?"),
    venmo:              get("What is your Venmo @?"),
    dateOfExpense:      get("Date of Expense"),
    budgetCategory:     get("Budget Category"),
    expenseType:        get("Type of Expense"),
    expenseTypeOther:   get("If you chose \"Other\" above, please explain below"),
    description:        get("Please explain what you bought in more detail"),
    ownCard:            get("Did you buy this item?"),
    cardholderName:     get("Name of person whose card you used"),
    cardholderAddress:  get("Cardholder's full mailing address"),

    item1Vendor:        get("Vendor/Store Name (Item 1)"),
    item1Location:      get("Physical Location (Item 1)"),
    item1Price:         getPrice("Full Price (Item 1)"),
    item1Receipt:       get("Receipt (Item 1)"),

    item2Vendor:        get("Vendor/Store Name (Item 2)"),
    item2Location:      get("Physical Location (Item 2)"),
    item2Price:         getPrice("Full Price (Item 2)"),
    item2Receipt:       get("Receipt (Item 2)"),

    item3Vendor:        get("Vendor/Store Name (Item 3)"),
    item3Location:      get("Physical Location (Item 3)"),
    item3Price:         getPrice("Full Price (Item 3)"),
    item3Receipt:       get("Receipt (Item 3)"),

    paymentMethod:      get("How Would You Like To Be Paid Back?"),
    mailingAddress:     get("Full mailing address"),
  };

  data.totalAmount = data.item1Price + data.item2Price + data.item3Price;
  return data;
}

// ─── Submissions Sheet ────────────────────────────────────────────────────────

function appendSubmission(data, submissionId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SUBMISSIONS_SHEET_NAME);
  if (!sheet) {
    createSubmissionsSheet();
    sheet = ss.getSheetByName(CONFIG.SUBMISSIONS_SHEET_NAME);
  }

  var row = new Array(SUBMISSION_HEADERS.length).fill("");
  var C = SUBMISSION_COLS;

  row[C.TIMESTAMP - 1]         = new Date();
  row[C.SUBMISSION_ID - 1]     = submissionId;
  row[C.FIRST_NAME - 1]        = data.firstName;
  row[C.LAST_NAME - 1]         = data.lastName;
  row[C.PHONE - 1]             = data.phone;
  row[C.UID - 1]               = data.uid;
  row[C.VENMO - 1]             = data.venmo;
  row[C.DATE_OF_EXPENSE - 1]   = data.dateOfExpense;
  row[C.BUDGET_CATEGORY - 1]   = data.budgetCategory;
  row[C.EXPENSE_TYPE - 1]      = data.expenseType;
  row[C.EXPENSE_TYPE_OTHER - 1]= data.expenseTypeOther;
  row[C.DESCRIPTION - 1]       = data.description;
  row[C.OWN_CARD - 1]          = data.ownCard;
  row[C.CARDHOLDER_NAME - 1]   = data.cardholderName;
  row[C.CARDHOLDER_ADDRESS - 1]= data.cardholderAddress;
  row[C.ITEM1_VENDOR - 1]      = data.item1Vendor;
  row[C.ITEM1_LOCATION - 1]    = data.item1Location;
  row[C.ITEM1_PRICE - 1]       = data.item1Price;
  row[C.ITEM1_RECEIPT - 1]     = data.item1Receipt;
  row[C.ITEM2_VENDOR - 1]      = data.item2Vendor;
  row[C.ITEM2_LOCATION - 1]    = data.item2Location;
  row[C.ITEM2_PRICE - 1]       = data.item2Price;
  row[C.ITEM2_RECEIPT - 1]     = data.item2Receipt;
  row[C.ITEM3_VENDOR - 1]      = data.item3Vendor;
  row[C.ITEM3_LOCATION - 1]    = data.item3Location;
  row[C.ITEM3_PRICE - 1]       = data.item3Price;
  row[C.ITEM3_RECEIPT - 1]     = data.item3Receipt;
  row[C.PAYMENT_METHOD - 1]    = data.paymentMethod;
  row[C.MAILING_ADDRESS - 1]   = data.mailingAddress;
  row[C.TOTAL_AMOUNT - 1]      = data.totalAmount;
  row[C.STATUS - 1]            = "Pending";
  row[C.DECISION_TIMESTAMP - 1]= "";

  sheet.appendRow(row);
}

/**
 * Finds the row number (1-based) of a submission by its ID.
 * Returns -1 if not found.
 */
function findSubmissionRow(submissionId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SUBMISSIONS_SHEET_NAME);
  if (!sheet) return -1;

  var data = sheet.getDataRange().getValues();
  var idCol = SUBMISSION_COLS.SUBMISSION_ID - 1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][idCol] === submissionId) {
      return i + 1; // Convert 0-based array index to 1-based sheet row
    }
  }
  return -1;
}

/**
 * Generates a unique submission ID based on timestamp + random suffix.
 */
function generateSubmissionId() {
  return "UMA-" + Date.now() + "-" + Math.floor(Math.random() * 9000 + 1000);
}
