// Sheet I/O. All SpreadsheetApp access lives here; business logic is in logic.gs.

var ONEOFF_HEADERS = ["ID", "Date", "Description", "Amount", "Budget Line"];
var NEW_REIMB_HEADERS = { requestId: "Request ID", budgetLine: "Budget Line", amountOverride: "Amount Override", cancelled: "Cancelled" };

// Error that doPost maps to { error: "bad_request", message }.
function badRequest_(message) {
  var err = new Error(message);
  err.code = "bad_request";
  return err;
}

// Script lock that is safe to nest within one execution.
var LOCK_DEPTH_ = 0;
function withScriptLock_(fn) {
  if (LOCK_DEPTH_ > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  LOCK_DEPTH_++;
  try {
    return fn();
  } finally {
    LOCK_DEPTH_--;
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

function getSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet tab "' + name + '". Run setupSheets.');
  return sheet;
}

function formatDate_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return isNaN(v.getTime()) ? "" : Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(v === null || v === undefined ? "" : v).trim();
}

// ─── Setup ──────────────────────────────────────────────────────────────────

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var reimb = getSheet_(CONFIG.REIMB_SHEET_NAME);
  var header = reimbHeader_(reimb);
  var colMap = mapColumns(header);
  var col = header.length;
  Object.keys(NEW_REIMB_HEADERS).forEach(function (k) {
    if (colMap[k] === -1) {
      col++;
      reimb.getRange(CONFIG.REIMB_HEADER_ROW, col).setValue(NEW_REIMB_HEADERS[k]);
      Logger.log("Added header: " + NEW_REIMB_HEADERS[k]);
    }
  });

  if (!ss.getSheetByName(CONFIG.ONEOFF_SHEET_NAME)) {
    var o = ss.insertSheet(CONFIG.ONEOFF_SHEET_NAME);
    o.appendRow(ONEOFF_HEADERS);
    o.getRange(1, 1, 1, ONEOFF_HEADERS.length).setFontWeight("bold");
    o.setFrozenRows(1);
    Logger.log("Created tab: " + CONFIG.ONEOFF_SHEET_NAME);
  }
  if (!ss.getSheetByName(CONFIG.ACCESS_SHEET_NAME)) {
    var a = ss.insertSheet(CONFIG.ACCESS_SHEET_NAME);
    a.appendRow(["Email"]);
    a.appendRow([CONFIG.DIRECTOR_EMAIL]);
    a.getRange(1, 1).setFontWeight("bold");
    a.setFrozenRows(1);
    Logger.log("Created tab: " + CONFIG.ACCESS_SHEET_NAME);
  }

  SpreadsheetApp.flush();
  Logger.log("requiredMissing: " + JSON.stringify(requiredMissing(mapColumns(reimbHeader_(reimb)))));
}

// ─── Reimbursements ─────────────────────────────────────────────────────────

function reimbHeader_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(CONFIG.REIMB_HEADER_ROW, 1, 1, lastCol).getValues()[0];
}

function reimbContext_() {
  var sheet = getSheet_(CONFIG.REIMB_SHEET_NAME);
  var header = reimbHeader_(sheet);
  return { sheet: sheet, header: header, colMap: mapColumns(header) };
}

function readRequests() {
  var ctx = reimbContext_();
  var sheet = ctx.sheet, colMap = ctx.colMap;
  if (colMap.requestId === -1) throw new Error('Missing "Request ID" column. Run setupSheets.');
  var firstDataRow = CONFIG.REIMB_HEADER_ROW + 1;
  var lastRow = sheet.getLastRow();
  if (lastRow < firstDataRow) return [];
  var values = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, ctx.header.length).getValues();
  if (colMap.date !== -1) {
    values.forEach(function (row) { row[colMap.date] = formatDate_(row[colMap.date]); });
  }
  var requests = rowsToRequests(values, colMap, firstDataRow);
  var missing = requests.filter(function (r) { return !r.id; });
  if (missing.length) {
    withScriptLock_(function () {
      missing.forEach(function (r) {
        var cell = sheet.getRange(r.row, colMap.requestId + 1);
        var current = String(cell.getValue()).trim();
        if (current) {
          r.id = current;
        } else {
          r.id = Utilities.getUuid().slice(0, 8);
          cell.setValue(r.id);
        }
      });
    });
  }
  return requests;
}

function writeRequestFields(row, fields) {
  var ctx = reimbContext_();
  var sheet = ctx.sheet, colMap = ctx.colMap;
  function put(key, value) {
    if (colMap[key] === -1) throw new Error("Missing column for " + key + ". Run setupSheets.");
    sheet.getRange(row, colMap[key] + 1).setValue(value);
  }
  if (fields.hasOwnProperty("budgetLine")) put("budgetLine", fields.budgetLine === null ? "" : fields.budgetLine);
  if (fields.hasOwnProperty("amountOverride")) put("amountOverride", fields.amountOverride === null ? "" : fields.amountOverride);
  if (fields.hasOwnProperty("cancelled")) put("cancelled", !!fields.cancelled);
  if (fields.hasOwnProperty("stageChecks")) {
    ["stage2", "stage3", "stage4", "stage5"].forEach(function (k, i) { put(k, !!fields.stageChecks[i]); });
  }
}

// ─── Finance Tracker budget lines ───────────────────────────────────────────

// Locates the Expenses table: header row index (0-based) and Budget/Spent/Remaining columns.
function findExpensesTable_(values) {
  for (var r = 0; r < values.length; r++) {
    if (normalizeName(values[r][0]) !== "expenses") continue;
    var cols = { budget: -1, spent: -1, remaining: -1 };
    values[r].forEach(function (h, c) {
      var n = normalizeName(h);
      if (cols.hasOwnProperty(n) && cols[n] === -1) cols[n] = c;
    });
    if (cols.budget !== -1 && cols.spent !== -1 && cols.remaining !== -1) {
      return { headerIndex: r, budgetCol: cols.budget, spentCol: cols.spent, remainingCol: cols.remaining };
    }
  }
  throw new Error('Finance Tracker: no "Expenses" row with Budget/Spent/Remaining headers found.');
}

function readBudgetLines() {
  var values = getSheet_(CONFIG.FINANCE_SHEET_NAME).getDataRange().getValues();
  var t = findExpensesTable_(values);
  var lines = [];
  for (var r = t.headerIndex + 1; r < values.length; r++) {
    var name = String(values[r][0]).trim();
    if (!name || normalizeName(name) === "total expenses") break;
    lines.push({
      name: name,
      budget: parsePrice(values[r][t.budgetCol]) || 0,
      spent: parsePrice(values[r][t.spentCol]) || 0,
      remaining: parsePrice(values[r][t.remainingCol]) || 0,
      row: r + 1
    });
  }
  return lines;
}

// lines: [{ row, spent, remaining }]. Writes only cells whose value differs.
function writeBudgetTotals(lines) {
  var sheet = getSheet_(CONFIG.FINANCE_SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var t = findExpensesTable_(values);
  lines.forEach(function (l) {
    var current = values[l.row - 1] || [];
    if (current[t.spentCol] !== l.spent) sheet.getRange(l.row, t.spentCol + 1).setValue(l.spent);
    if (current[t.remainingCol] !== l.remaining) sheet.getRange(l.row, t.remainingCol + 1).setValue(l.remaining);
  });
}

// ─── One-off expenses ───────────────────────────────────────────────────────

function oneOffValues_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, ONEOFF_HEADERS.length).getValues();
}

function readOneOffs() {
  var out = [];
  oneOffValues_(getSheet_(CONFIG.ONEOFF_SHEET_NAME)).forEach(function (row, i) {
    var id = String(row[0]).trim();
    if (!id) return;
    out.push({
      id: id,
      date: formatDate_(row[1]),
      description: String(row[2]).trim(),
      amount: parsePrice(row[3]) || 0,
      budgetLine: String(row[4]).trim() || null,
      row: i + 2
    });
  });
  return out;
}

function findOneOffRow_(sheet, id) {
  var values = oneOffValues_(sheet);
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === id) return i + 2;
  }
  throw badRequest_("No one-off expense with id " + id);
}

function appendOneOff(o) {
  var id = Utilities.getUuid().slice(0, 8);
  getSheet_(CONFIG.ONEOFF_SHEET_NAME).appendRow([id, o.date, o.description, o.amount, o.budgetLine || ""]);
  return id;
}

function updateOneOff(id, fields) {
  var sheet = getSheet_(CONFIG.ONEOFF_SHEET_NAME);
  var row = findOneOffRow_(sheet, id);
  if (fields.hasOwnProperty("date")) sheet.getRange(row, 2).setValue(fields.date);
  if (fields.hasOwnProperty("description")) sheet.getRange(row, 3).setValue(fields.description);
  if (fields.hasOwnProperty("amount")) sheet.getRange(row, 4).setValue(fields.amount);
  if (fields.hasOwnProperty("budgetLine")) sheet.getRange(row, 5).setValue(fields.budgetLine || "");
}

function deleteOneOff(id) {
  var sheet = getSheet_(CONFIG.ONEOFF_SHEET_NAME);
  sheet.deleteRow(findOneOffRow_(sheet, id));
}

// ─── Access ─────────────────────────────────────────────────────────────────

function readAllowlist() {
  var sheet = getSheet_(CONFIG.ACCESS_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (e) { return e; });
}
