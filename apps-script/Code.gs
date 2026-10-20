// JSON API entry point. The site POSTs { idToken, action, payload } as text/plain.

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse(e && e.postData ? e.postData.contents : "");
    } catch (parseErr) {
      return fail_("bad_request", "Request body must be JSON");
    }
    if (!body || typeof body !== "object") return fail_("bad_request", "Request body must be a JSON object");

    var email = verifyIdToken_(body.idToken);
    if (!email) return fail_("unauthenticated", "Sign-in expired or invalid. Please sign in again.");

    var access = checkAccess(email, readAllowlist(), CONFIG.DIRECTOR_EMAIL);
    var authErr = authorize(body.action, access);
    if (authErr === "bad_request") return fail_("bad_request", "Unknown action: " + body.action);
    if (authErr) return fail_("forbidden", "You don't have access to do that.");

    var state = withScriptLock_(function () {
      if (body.action !== "getState") applyMutation_(body.action, body.payload);
      var st = buildState(email, access.isDirector);
      writeBudgetTotals(st.budgetLines);
      return st;
    });
    return respond_({ ok: true, state: state });
  } catch (err) {
    if (err && err.code === "bad_request") return fail_("bad_request", err.message);
    console.error(err && err.stack ? err.stack : String(err));
    return fail_("server_error", "Something went wrong. Please try again.");
  }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(error, message) {
  return respond_({ ok: false, error: error, message: message });
}

// ─── Auth ───────────────────────────────────────────────────────────────────

// Returns the verified email for a Google ID token, or null.
function verifyIdToken_(token) {
  if (typeof token !== "string" || !token) return null;
  var cache = CacheService.getScriptCache();
  var key = "idtok:" + sha256Hex_(token);
  var cached = cache.get(key);
  if (cached) return cached;

  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var info;
  try {
    info = JSON.parse(res.getContentText());
  } catch (err) {
    return null;
  }
  var expMs = Number(info.exp) * 1000;
  if (info.aud !== CONFIG.GOOGLE_CLIENT_ID) return null;
  if (info.email_verified !== "true") return null;
  if (!(expMs > Date.now())) return null;
  if (!info.email) return null;

  var ttl = Math.min(300, Math.floor((expMs - Date.now()) / 1000));
  if (ttl > 0) cache.put(key, info.email, ttl);
  return info.email;
}

function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}

// ─── Mutations ──────────────────────────────────────────────────────────────

function applyMutation_(action, payload) {
  var lines = readBudgetLines();
  var lineNames = lines.map(function (l) { return l.name; });
  var err = validatePatch(action, payload, lineNames);
  if (err) throw badRequest_(err);

  // Store the sheet's exact spelling of a matched budget line.
  function canonicalLine(name) {
    if (name === null || name === undefined) return null;
    var k = normalizeName(name);
    for (var i = 0; i < lineNames.length; i++) {
      if (normalizeName(lineNames[i]) === k) return lineNames[i];
    }
    return name;
  }
  function has(k) { return Object.prototype.hasOwnProperty.call(payload, k); }

  if (action === "updateRequest") {
    var req = readRequests().filter(function (r) { return r.id === payload.id; })[0];
    if (!req) throw badRequest_("No request with id " + payload.id);
    var fields = {};
    if (has("budgetLine")) fields.budgetLine = canonicalLine(payload.budgetLine);
    if (has("stage")) fields.stageChecks = checksForStage(payload.stage);
    if (has("amountOverride")) fields.amountOverride = payload.amountOverride;
    if (has("cancelled")) fields.cancelled = payload.cancelled;
    writeRequestFields(req.row, fields);
  } else if (action === "addOneOff") {
    appendOneOff({
      date: payload.date,
      description: payload.description.trim(),
      amount: payload.amount,
      budgetLine: canonicalLine(payload.budgetLine)
    });
  } else if (action === "updateOneOff") {
    var f = {};
    if (has("date")) f.date = payload.date;
    if (has("description")) f.description = payload.description.trim();
    if (has("amount")) f.amount = payload.amount;
    if (has("budgetLine")) f.budgetLine = canonicalLine(payload.budgetLine);
    updateOneOff(payload.id, f);
  } else if (action === "deleteOneOff") {
    deleteOneOff(payload.id);
  }
  SpreadsheetApp.flush();
}

// ─── State ──────────────────────────────────────────────────────────────────

// Reads the sheet and computes State. Does not write budget totals (doPost does).
function buildState(email, isDirector) {
  var raw = readRequests();
  var sheetLines = readBudgetLines();
  var oneOffs = readOneOffs();

  var known = {};
  sheetLines.forEach(function (l) { known[normalizeName(l.name)] = true; });
  var amounts = raw.map(function (r) { return requestAmount(r); });
  var budgets = computeBudgets(
    sheetLines,
    raw.map(function (r, i) { return { budgetLine: r.budgetLine, amount: amounts[i].amount, cancelled: r.cancelled }; }),
    oneOffs
  );

  var state = {
    user: { email: email, isDirector: !!isDirector },
    budgetLines: budgets.lines.map(function (l, i) {
      return { name: l.name, budget: l.budget, spent: l.spent, remaining: l.remaining, row: sheetLines[i].row };
    }),
    unassignedTotal: budgets.unassignedTotal,
    requests: raw.map(function (r, i) {
      var k = normalizeName(r.budgetLine);
      return toPublicRequest(r, amounts[i], !!k && !known[k]);
    }),
    oneOffs: oneOffs.map(function (o) {
      return { id: o.id, date: o.date, description: o.description, amount: o.amount, budgetLine: o.budgetLine };
    })
  };
  return state;
}

// Scratch check for the Apps Script editor: logs State as the director.
// Read-only except for backfilling missing Request IDs; does not write budget totals.
function debugState() {
  Logger.log(JSON.stringify(buildState(CONFIG.DIRECTOR_EMAIL, true)));
}
