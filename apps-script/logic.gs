// Pure logic: money, stages, budgets. No Apps Script services used here.

function roundCents(x) {
  return Math.round(x * 100) / 100;
}

function parsePrice(raw) {
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  var s = raw.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}

function requestAmount(req) {
  if (req.amountOverride !== null && req.amountOverride !== undefined) {
    var o = parsePrice(req.amountOverride);
    if (o !== null) return { amount: roundCents(o), needsAmount: false };
  }
  var items = req.items || [];
  if (items.length === 0) return { amount: null, needsAmount: true };
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    var p = parsePrice(items[i].priceRaw);
    if (p === null) return { amount: null, needsAmount: true };
    total += p;
  }
  return { amount: roundCents(total), needsAmount: false };
}

function stageFromChecks(checks) {
  for (var i = 3; i >= 0; i--) {
    if (checks[i]) return i + 2;
  }
  return 1;
}

function checksForStage(stage) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 5) {
    throw new Error("Invalid stage: " + stage);
  }
  var out = [];
  for (var i = 0; i < 4; i++) out.push(i + 2 <= stage);
  return out;
}

function normalizeName(s) {
  return String(s === null || s === undefined ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Returns the sheet's spelling of a matching budget line; null stays null,
// unmatched values are returned as-is.
function canonicalLineName(name, lineNames) {
  if (name === null || name === undefined) return null;
  var k = normalizeName(name);
  for (var i = 0; i < lineNames.length; i++) {
    if (normalizeName(lineNames[i]) === k) return lineNames[i];
  }
  return name;
}

function computeBudgets(lines, requests, oneOffs) {
  var spentByKey = {};
  var refundsByKey = {};
  var known = {};
  lines.forEach(function (l) {
    var k = normalizeName(l.name);
    known[k] = true;
    spentByKey[k] = 0;
    refundsByKey[k] = 0;
  });
  var unassigned = 0;
  var orphaned = new Set();
  function add(budgetLine, amount) {
    var amt = amount || 0;
    var k = normalizeName(budgetLine);
    if (k && known[k]) {
      spentByKey[k] += amt;
    } else {
      unassigned += amt;
      if (k) orphaned.add(k);
    }
  }
  requests.forEach(function (r) {
    if (!r.cancelled) add(r.budgetLine, r.amount);
  });
  // Refunds (negative one-offs) add money back to Remaining without touching Spent.
  oneOffs.forEach(function (o) {
    if (o.amount < 0) {
      var k = normalizeName(o.budgetLine);
      if (k && known[k]) refundsByKey[k] -= o.amount;
      else if (k) orphaned.add(k);
      return;
    }
    add(o.budgetLine, o.amount);
  });
  return {
    lines: lines.map(function (l) {
      var k = normalizeName(l.name);
      var spent = roundCents(spentByKey[k]);
      return { name: l.name, budget: l.budget, spent: spent, remaining: roundCents(l.budget - spent + refundsByKey[k]) };
    }),
    unassignedTotal: roundCents(unassigned),
    orphanedLineNames: orphaned
  };
}

var FIELD_HEADERS = {
  email: "email", firstName: "first name", lastName: "last name", phone: "phone number", uid: "uid",
  date: "date", type: "type", otherExplanation: '"other" explanation', description: "name of expense",
  paymentMethod: "payment method", mailingAddress: "mailing address",
  stage2: "stage 2", stage3: "stage 3", stage4: "stage 4", stage5: "stage 5",
  requestId: "request id", budgetLine: "budget line", amountOverride: "amount override", cancelled: "cancelled"
};
var OPTIONAL_FIELDS = ["requestId", "budgetLine", "amountOverride", "cancelled"];

function mapColumns(headerRow) {
  var map = {};
  Object.keys(FIELD_HEADERS).forEach(function (k) { map[k] = -1; });
  map.items = [0, 1, 2].map(function () { return { vendor: -1, location: -1, price: -1, receipt: -1 }; });
  var counts = { vendor: 0, location: 0, receipt: 0 };
  var byHeader = {};
  Object.keys(FIELD_HEADERS).forEach(function (k) { byHeader[FIELD_HEADERS[k]] = k; });
  headerRow.forEach(function (h, i) {
    var n = normalizeName(h);
    var m = /^price of item #([1-3])$/.exec(n);
    if (m) { map.items[Number(m[1]) - 1].price = i; return; }
    var rep = n === "vendor name" ? "vendor" : n === "location" ? "location" : n === "receipt" ? "receipt" : null;
    if (rep) {
      if (counts[rep] < 3) map.items[counts[rep]][rep] = i;
      counts[rep]++;
      return;
    }
    var key = byHeader[n];
    if (key && map[key] === -1) map[key] = i;
  });
  return map;
}

function requiredMissing(colMap) {
  var missing = [];
  Object.keys(FIELD_HEADERS).forEach(function (k) {
    if (OPTIONAL_FIELDS.indexOf(k) === -1 && colMap[k] === -1) missing.push(titleHeader(FIELD_HEADERS[k]));
  });
  colMap.items.forEach(function (it, i) {
    if (it.vendor === -1) missing.push("Vendor Name (item " + (i + 1) + ")");
    if (it.location === -1) missing.push("Location (item " + (i + 1) + ")");
    if (it.price === -1) missing.push("Price of Item #" + (i + 1));
    if (it.receipt === -1) missing.push("Receipt (item " + (i + 1) + ")");
  });
  return missing;
}

function titleHeader(norm) {
  if (norm === "uid") return "UID";
  if (norm === '"other" explanation') return '"Other" Explanation';
  return norm.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
}

function rowsToRequests(values, colMap, firstDataRow) {
  function cell(row, idx) {
    if (idx < 0) return "";
    var v = row[idx];
    return v === null || v === undefined ? "" : v;
  }
  function text(row, idx) { return String(cell(row, idx)).trim(); }
  function isTrue(v) { return v === true || v === "TRUE"; }
  function dateOf(v) {
    if (Object.prototype.toString.call(v) === "[object Date]") {
      return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
    }
    return String(v).trim();
  }
  var out = [];
  values.forEach(function (row, i) {
    var email = text(row, colMap.email);
    var firstName = text(row, colMap.firstName);
    if (!email && !firstName) return;
    var items = [];
    colMap.items.forEach(function (c) {
      var vendor = text(row, c.vendor);
      var priceRaw = text(row, c.price);
      var receipts = text(row, c.receipt).split(",").map(function (r) { return r.trim(); }).filter(function (r) { return r; });
      if (!vendor && !priceRaw && !receipts.length) return;
      items.push({ vendor: vendor, location: text(row, c.location), priceRaw: priceRaw, receipts: receipts });
    });
    out.push({
      id: text(row, colMap.requestId),
      row: firstDataRow + i,
      firstName: firstName,
      lastName: text(row, colMap.lastName),
      date: dateOf(cell(row, colMap.date)),
      type: text(row, colMap.type),
      otherExplanation: text(row, colMap.otherExplanation),
      description: text(row, colMap.description),
      items: items,
      paymentMethod: text(row, colMap.paymentMethod),
      stageChecks: [colMap.stage2, colMap.stage3, colMap.stage4, colMap.stage5].map(function (c) { return isTrue(cell(row, c)); }),
      budgetLine: text(row, colMap.budgetLine) || null,
      amountOverride: parsePrice(cell(row, colMap.amountOverride)),
      cancelled: isTrue(cell(row, colMap.cancelled)),
      email: email,
      phone: text(row, colMap.phone),
      uid: text(row, colMap.uid),
      mailingAddress: text(row, colMap.mailingAddress)
    });
  });
  return out;
}

function toPublicRequest(raw, budget, orphaned) {
  return {
    id: raw.id,
    name: (raw.firstName + " " + raw.lastName).trim(),
    date: raw.date,
    type: raw.type,
    description: raw.description,
    items: raw.items.map(function (it) {
      return { vendor: it.vendor, location: it.location, priceRaw: it.priceRaw, receipts: it.receipts.slice() };
    }),
    paymentMethod: raw.paymentMethod,
    stage: stageFromChecks(raw.stageChecks),
    budgetLine: raw.budgetLine,
    amount: budget.amount,
    needsAmount: budget.needsAmount,
    amountOverridden: typeof raw.amountOverride === "number",
    cancelled: raw.cancelled,
    orphaned: !!orphaned
  };
}

// directorEmails: one email or a list; directors can edit and may use any domain.
function checkAccess(email, allowlist, directorEmails) {
  var e = normalizeName(email);
  if (!e) return { allowed: false, isDirector: false };
  var directors = [].concat(directorEmails || []);
  if (directors.some(function (d) { return normalizeName(d) === e; })) return { allowed: true, isDirector: true };
  var listed = allowlist.some(function (a) { return normalizeName(a) === e; });
  return { allowed: listed && /@berkeley\.edu$/.test(e), isDirector: false };
}

var READ_ACTIONS = ["getState"];
var MUTATION_ACTIONS = ["updateRequest", "addOneOff", "updateOneOff", "deleteOneOff"];

function authorize(action, access) {
  var isRead = READ_ACTIONS.indexOf(action) !== -1;
  var isMutation = MUTATION_ACTIONS.indexOf(action) !== -1;
  if (!isRead && !isMutation) return "bad_request";
  if (!access || !access.allowed) return "forbidden";
  if (isMutation && !access.isDirector) return "forbidden";
  return null;
}

function validatePatch(action, payload, lineNames) {
  if (READ_ACTIONS.indexOf(action) === -1 && MUTATION_ACTIONS.indexOf(action) === -1) return "Unknown action: " + action;
  if (action === "getState") return null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Payload must be an object";
  var p = payload;
  function has(k) { return Object.prototype.hasOwnProperty.call(p, k); }
  function checkId() {
    return typeof p.id === "string" && p.id.trim() ? null : "Missing or invalid id";
  }
  function checkLine(allowNull) {
    var v = p.budgetLine;
    if (v === null) return allowNull ? null : "Budget line is required";
    if (typeof v !== "string") return "Invalid budget line";
    var k = normalizeName(v);
    var ok = (lineNames || []).some(function (n) { return normalizeName(n) === k; });
    return ok ? null : "Unknown budget line: " + v;
  }
  function checkDate() {
    return typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? null : "Date must be YYYY-MM-DD";
  }
  function checkDescription() {
    return typeof p.description === "string" && p.description.trim() ? null : "Description must be non-empty";
  }
  function checkAmount() {
    // Positive = expense, negative = refund back into the budget line.
    return typeof p.amount === "number" && isFinite(p.amount) && p.amount !== 0 ? null : "Amount must be a non-zero number";
  }
  function first(checks) {
    for (var i = 0; i < checks.length; i++) {
      var err = checks[i]();
      if (err) return err;
    }
    return null;
  }
  if (action === "updateRequest") {
    var checks = [checkId];
    if (has("budgetLine")) checks.push(function () { return checkLine(true); });
    if (has("stage")) checks.push(function () {
      return Number.isInteger(p.stage) && p.stage >= 1 && p.stage <= 5 ? null : "Stage must be an integer from 1 to 5";
    });
    if (has("amountOverride")) checks.push(function () {
      var v = p.amountOverride;
      return v === null || (typeof v === "number" && isFinite(v) && v >= 0) ? null : "Amount override must be a non-negative number or null";
    });
    if (has("cancelled")) checks.push(function () {
      return typeof p.cancelled === "boolean" ? null : "Cancelled must be true or false";
    });
    return first(checks);
  }
  if (action === "addOneOff") {
    return first([checkDate, checkDescription, checkAmount, function () { return checkLine(true); }]);
  }
  if (action === "updateOneOff") {
    var c = [checkId];
    if (has("date")) c.push(checkDate);
    if (has("description")) c.push(checkDescription);
    if (has("amount")) c.push(checkAmount);
    if (has("budgetLine")) c.push(function () { return checkLine(true); });
    return first(c);
  }
  return checkId(); // deleteOneOff
}

if (typeof module !== "undefined") module.exports = { parsePrice, requestAmount, stageFromChecks, checksForStage, normalizeName, canonicalLineName, computeBudgets, mapColumns, requiredMissing, rowsToRequests, toPublicRequest, checkAccess, authorize, validatePatch };
