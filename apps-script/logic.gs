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

if (typeof module !== "undefined") module.exports = { parsePrice, requestAmount, stageFromChecks, checksForStage, normalizeName, computeBudgets };
