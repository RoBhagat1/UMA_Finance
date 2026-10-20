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

function computeBudgets(lines, requests, oneOffs) {
  var spentByKey = {};
  var known = {};
  lines.forEach(function (l) {
    var k = normalizeName(l.name);
    known[k] = true;
    spentByKey[k] = 0;
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
  oneOffs.forEach(function (o) {
    add(o.budgetLine, o.amount);
  });
  return {
    lines: lines.map(function (l) {
      var spent = roundCents(spentByKey[normalizeName(l.name)]);
      return { name: l.name, budget: l.budget, spent: spent, remaining: roundCents(l.budget - spent) };
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
    cancelled: raw.cancelled,
    orphaned: !!orphaned
  };
}

function checkAccess(email, allowlist, directorEmail) {
  var e = normalizeName(email);
  if (!e) return { allowed: false, isDirector: false };
  if (e === normalizeName(directorEmail)) return { allowed: true, isDirector: true };
  var listed = allowlist.some(function (a) { return normalizeName(a) === e; });
  return { allowed: listed && /@berkeley\.edu$/.test(e), isDirector: false };
}

if (typeof module !== "undefined") module.exports = { parsePrice, requestAmount, stageFromChecks, checksForStage, normalizeName, computeBudgets, mapColumns, requiredMissing, rowsToRequests, toPublicRequest, checkAccess };
