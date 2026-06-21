// ─── Approval Email ───────────────────────────────────────────────────────────

function sendApprovalEmail(data, submissionId) {
  var total = formatCurrency(data.totalAmount);
  var subject = "[UMA Reimbursement] New Request — "
    + data.firstName + " " + data.lastName
    + " — " + total
    + " — " + data.budgetCategory;

  var body = buildEmailBody(data, submissionId);

  MailApp.sendEmail({
    to: CONFIG.TREASURER_EMAIL,
    subject: subject,
    htmlBody: body,
  });
}

function buildEmailBody(data, submissionId) {
  var approveVenmoUrl = buildActionUrl("approve_venmo", submissionId);
  var approveAsucUrl  = buildActionUrl("approve_asuc",  submissionId);
  var denyUrl         = buildActionUrl("deny",          submissionId);

  var html = "";
  html += emailHeader();
  html += section("Submission Details", [
    row("Submission ID",  submissionId),
    row("Name",           data.firstName + " " + data.lastName),
    row("Phone",          data.phone),
    row("UID",            data.uid),
    row("Venmo",          data.venmo ? "@" + data.venmo : "—"),
    row("Date of Expense",data.dateOfExpense),
    row("Budget Category",data.budgetCategory),
    row("Expense Type",   data.expenseType + (data.expenseTypeOther ? " — " + data.expenseTypeOther : "")),
    row("Description",    data.description),
  ]);

  if (data.ownCard === "No") {
    html += section("Third-Party Card", [
      row("Cardholder Name",    data.cardholderName),
      row("Cardholder Address", data.cardholderAddress),
      row("Note", "ASUC will mail a check to the cardholder at the address above."),
    ]);
  }

  html += itemsSection(data);

  html += section("Payment Preference", [
    row("Method",          data.paymentMethod),
    row("Mailing Address", data.mailingAddress || "—"),
  ]);

  html += totalSection(data.totalAmount);
  html += approvalButtons(approveVenmoUrl, approveAsucUrl, denyUrl);
  html += emailFooter(submissionId);

  return html;
}

// ─── Email Sections ───────────────────────────────────────────────────────────

function emailHeader() {
  return '<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto">'
    + '<div style="background:#1a3a5c;padding:20px 30px;border-radius:8px 8px 0 0">'
    + '<h2 style="color:#ffffff;margin:0;font-size:20px">UMA Reimbursement Request</h2>'
    + '</div>'
    + '<div style="background:#f8f9fa;padding:30px;border:1px solid #dee2e6">';
}

function section(title, rows) {
  var html = '<h3 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:6px;margin-top:24px">'
    + title + '</h3>'
    + '<table style="width:100%;border-collapse:collapse">';
  rows.forEach(function(r) { html += r; });
  html += '</table>';
  return html;
}

function row(label, value) {
  return '<tr>'
    + '<td style="padding:7px 12px 7px 0;color:#6c757d;font-size:14px;width:38%;vertical-align:top">'
    + label + '</td>'
    + '<td style="padding:7px 0;font-size:14px;font-weight:500;color:#212529">'
    + (value || "—") + '</td>'
    + '</tr>';
}

function itemsSection(data) {
  var items = [
    { vendor: data.item1Vendor, location: data.item1Location, price: data.item1Price, receipt: data.item1Receipt },
    { vendor: data.item2Vendor, location: data.item2Location, price: data.item2Price, receipt: data.item2Receipt },
    { vendor: data.item3Vendor, location: data.item3Location, price: data.item3Price, receipt: data.item3Receipt },
  ].filter(function(item) { return item.vendor || item.price > 0; });

  var html = '<h3 style="color:#1a3a5c;border-bottom:2px solid #1a3a5c;padding-bottom:6px;margin-top:24px">Items</h3>';
  items.forEach(function(item, idx) {
    html += '<div style="background:#ffffff;border:1px solid #dee2e6;border-radius:6px;padding:14px;margin-bottom:10px">';
    html += '<strong style="color:#1a3a5c">Item ' + (idx + 1) + '</strong>';
    html += '<table style="width:100%;border-collapse:collapse;margin-top:8px">';
    html += row("Vendor",   item.vendor);
    html += row("Location", item.location);
    html += row("Price",    formatCurrency(item.price));
    if (item.receipt) {
      html += row("Receipt", '<a href="' + item.receipt + '" style="color:#1a3a5c">View Receipt</a>');
    }
    html += '</table></div>';
  });
  return html;
}

function totalSection(total) {
  return '<div style="background:#1a3a5c;color:#ffffff;padding:16px 20px;border-radius:6px;margin:20px 0;text-align:right">'
    + '<span style="font-size:14px;opacity:0.8">Total Requested</span>'
    + '<span style="font-size:26px;font-weight:bold;margin-left:16px">' + formatCurrency(total) + '</span>'
    + '</div>';
}

function approvalButtons(venmoUrl, asucUrl, denyUrl) {
  var btnBase = 'display:inline-block;padding:14px 24px;border-radius:6px;'
    + 'text-decoration:none;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;margin:6px';

  return '<div style="text-align:center;padding:20px 0">'
    + '<p style="color:#6c757d;font-size:13px;margin-bottom:16px">Choose an action:</p>'
    + '<a href="' + venmoUrl + '" style="' + btnBase + 'background:#008CFF;color:#ffffff">Approve — Venmo</a>'
    + '<a href="' + asucUrl  + '" style="' + btnBase + 'background:#27ae60;color:#ffffff">Approve — ASUC Reimburse</a>'
    + '<a href="' + denyUrl  + '" style="' + btnBase + 'background:#e74c3c;color:#ffffff">Deny</a>'
    + '</div>';
}

function emailFooter(submissionId) {
  return '<p style="font-size:12px;color:#adb5bd;text-align:center;margin-top:20px">'
    + 'UMA Finance System &nbsp;|&nbsp; Submission ID: ' + submissionId
    + '</p></div></div>';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildActionUrl(action, submissionId) {
  return CONFIG.WEB_APP_URL
    + "?action=" + encodeURIComponent(action)
    + "&id="     + encodeURIComponent(submissionId)
    + "&token="  + encodeURIComponent(CONFIG.SECRET_TOKEN);
}

function formatCurrency(amount) {
  return "$" + (amount || 0).toFixed(2);
}
