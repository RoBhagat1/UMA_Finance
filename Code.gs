// ─── Entry Points ─────────────────────────────────────────────────────────────

/**
 * Triggered automatically when a linked Google Form is submitted.
 * Logs the submission and emails the treasurer for approval.
 */
function onFormSubmit(e) {
  var data = parseFormResponse(e);
  var submissionId = generateSubmissionId();
  appendSubmission(data, submissionId);
  sendApprovalEmail(data, submissionId);
}

/**
 * Web app entry point. Treasurer clicks an approval link in email,
 * which hits this function with ?action=...&id=...&token=...
 */
function doGet(e) {
  var params = e.parameter;
  var action = params.action;
  var submissionId = params.id;
  var token = params.token;

  if (!action || !submissionId || !token) {
    return HtmlService.createHtmlOutput(errorPage("Missing parameters."));
  }

  if (token !== CONFIG.SECRET_TOKEN) {
    return HtmlService.createHtmlOutput(errorPage("Invalid token. This link may have expired or been tampered with."));
  }

  if (action !== "approve_venmo" && action !== "approve_asuc" && action !== "deny") {
    return HtmlService.createHtmlOutput(errorPage("Unknown action."));
  }

  return HtmlService.createHtmlOutput(handleApproval(action, submissionId));
}

// ─── One-time Setup Functions ─────────────────────────────────────────────────

/**
 * Run once to create the Submissions sheet with headers.
 * Safe to re-run — skips creation if sheet already exists.
 */
function createSubmissionsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName(CONFIG.SUBMISSIONS_SHEET_NAME);
  if (existing) {
    Logger.log("Submissions sheet already exists — skipping.");
    return;
  }
  var sheet = ss.insertSheet(CONFIG.SUBMISSIONS_SHEET_NAME);
  sheet.appendRow(SUBMISSION_HEADERS);
  var headerRange = sheet.getRange(1, 1, 1, SUBMISSION_HEADERS.length);
  headerRange.setFontWeight("bold");
  headerRange.setBackground("#4a86c8");
  headerRange.setFontColor("#ffffff");
  sheet.setFrozenRows(1);
  Logger.log("Submissions sheet created.");
}

/**
 * Run once to register the form submit trigger.
 * The form must already be linked to this spreadsheet.
 */
function setupTrigger() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Remove any existing onFormSubmit triggers to avoid duplicates.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
  Logger.log("onFormSubmit trigger registered.");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errorPage(message) {
  return "<html><body style='font-family:sans-serif;padding:40px'>"
    + "<h2 style='color:#c0392b'>Error</h2><p>" + message + "</p></body></html>";
}
