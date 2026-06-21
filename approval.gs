// ─── Approval Handling ────────────────────────────────────────────────────────

/**
 * Called by doGet when the treasurer clicks an approval link.
 * Updates submission status and, if approved, deducts from the budget.
 * Returns an HTML string to display to the treasurer.
 */
function handleApproval(action, submissionId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SUBMISSIONS_SHEET_NAME);
  if (!sheet) {
    return confirmationPage("error", "Submissions sheet not found.", submissionId);
  }

  var rowNum = findSubmissionRow(submissionId);
  if (rowNum === -1) {
    return confirmationPage("error", "Submission ID not found. It may have already been processed.", submissionId);
  }

  var C = SUBMISSION_COLS;
  var currentStatus = sheet.getRange(rowNum, C.STATUS).getValue();

  // Prevent double-processing.
  if (currentStatus !== "Pending") {
    return confirmationPage("already_processed",
      "This submission was already actioned: <strong>" + currentStatus + "</strong>", submissionId);
  }

  var category = sheet.getRange(rowNum, C.BUDGET_CATEGORY).getValue();
  var amount   = parseFloat(sheet.getRange(rowNum, C.TOTAL_AMOUNT).getValue()) || 0;
  var name     = sheet.getRange(rowNum, C.FIRST_NAME).getValue()
               + " " + sheet.getRange(rowNum, C.LAST_NAME).getValue();

  var statusLabel;
  if (action === "approve_venmo") {
    statusLabel = "Approved (Venmo)";
    deductFromBudget(category, amount);
  } else if (action === "approve_asuc") {
    statusLabel = "Approved (ASUC Reimburse)";
    deductFromBudget(category, amount);
  } else {
    statusLabel = "Denied";
  }

  sheet.getRange(rowNum, C.STATUS).setValue(statusLabel);
  sheet.getRange(rowNum, C.DECISION_TIMESTAMP).setValue(new Date());

  var approved = action !== "deny";
  return confirmationPage(
    approved ? "approved" : "denied",
    "Submission for <strong>" + name + "</strong> ("
      + formatCurrency(amount) + " from " + category + ") has been marked: <strong>"
      + statusLabel + "</strong>.",
    submissionId
  );
}

// ─── Budget Deduction ─────────────────────────────────────────────────────────

/**
 * Finds the matching budget category row, adds amount to Spent,
 * and recalculates Remaining.
 */
function deductFromBudget(category, amount) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.BUDGET_SHEET_NAME);
  if (!sheet) {
    Logger.log("Budget sheet not found — skipping deduction.");
    return;
  }

  var normalizedCategory = normalizeString(category);
  var C = CONFIG;

  for (var r = C.BUDGET_START_ROW; r <= C.BUDGET_END_ROW; r++) {
    var cellValue = sheet.getRange(r, C.BUDGET_COL_CATEGORY).getValue();
    if (normalizeString(String(cellValue)) === normalizedCategory) {
      var budgetCell    = sheet.getRange(r, C.BUDGET_COL_BUDGET);
      var spentCell     = sheet.getRange(r, C.BUDGET_COL_SPENT);
      var remainingCell = sheet.getRange(r, C.BUDGET_COL_REMAINING);

      var currentSpent  = parseFloat(spentCell.getValue()) || 0;
      var budget        = parseFloat(budgetCell.getValue()) || 0;
      var newSpent      = currentSpent + amount;
      var newRemaining  = budget - newSpent;

      spentCell.setValue(newSpent);
      remainingCell.setValue(newRemaining);

      Logger.log("Deducted " + amount + " from " + category
        + ". Spent: " + newSpent + ", Remaining: " + newRemaining);
      return;
    }
  }

  Logger.log("Budget category not matched: " + category);
}

// ─── Confirmation Page ────────────────────────────────────────────────────────

function confirmationPage(type, message, submissionId) {
  var configs = {
    approved:          { color: "#27ae60", icon: "✓", title: "Approved" },
    denied:            { color: "#e74c3c", icon: "✗", title: "Denied" },
    already_processed: { color: "#f39c12", icon: "!", title: "Already Processed" },
    error:             { color: "#e74c3c", icon: "✗", title: "Error" },
  };
  var cfg = configs[type] || configs.error;

  return '<html><body style="font-family:Arial,sans-serif;background:#f8f9fa;display:flex;'
    + 'align-items:center;justify-content:center;min-height:100vh;margin:0">'
    + '<div style="background:#ffffff;border-radius:12px;padding:48px 40px;max-width:480px;'
    + 'text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.1)">'
    + '<div style="width:64px;height:64px;background:' + cfg.color + ';border-radius:50%;'
    + 'display:flex;align-items:center;justify-content:center;margin:0 auto 24px;'
    + 'font-size:32px;color:#fff;line-height:64px">' + cfg.icon + '</div>'
    + '<h2 style="color:' + cfg.color + ';margin:0 0 16px">' + cfg.title + '</h2>'
    + '<p style="color:#495057;font-size:15px;line-height:1.6">' + message + '</p>'
    + '<p style="color:#adb5bd;font-size:12px;margin-top:24px">Submission ID: ' + submissionId + '</p>'
    + '</div></body></html>';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeString(str) {
  return str.toLowerCase().replace(/\s+/g, " ").trim();
}
