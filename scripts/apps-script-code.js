/**
 * Google Apps Script — Sheet API for Agentic Posting + Blog System
 * Paste this into: Google Sheet → Extensions → Apps Script
 * Then redeploy as Web App
 *
 * === SOCIAL MEDIA ENDPOINTS (Agentic Sheet tab) ===
 *   GET  ?action=read                         → all rows
 *   GET  ?action=row&n=1                      → single row
 *   GET  ?action=unposted                     → unposted rows
 *   POST ?action=x-success   {row, tweet, url, batch}
 *   POST ?action=x-error     {row, error}
 *   POST ?action=fb-success  {row, post, url, batch}
 *   POST ?action=fb-error    {row, error}
 *   POST ?action=li-success  {row, post, url, batch}
 *   POST ?action=li-error    {row, error}
 *   POST ?action=update      {row, updates: {col: val, ...}}
 *
 * === BLOG ENDPOINTS (Agentic Blogs tab) ===
 *   GET  ?action=blog-read                    → all blog rows
 *   GET  ?action=blog-row&n=1                 → single blog row
 *   GET  ?action=blog-unposted                → unposted blog rows
 *   POST ?action=blog-update  {row, updates}  → update blog columns
 *   POST ?action=blog-init                    → create Agentic Blogs tab with headers
 */

var SHEET_NAME = "Agentic Sheet";
var BLOG_SHEET_NAME = "Agentic Blogs";

// ─── HELPERS ───

function getSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

function getBlogSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BLOG_SHEET_NAME);
}

function getHeaders(sheet) {
  if (!sheet) sheet = getSheet();
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function colIndex(headers, name) {
  var lower = name.toLowerCase().trim();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().toLowerCase().trim() === lower) return i;
  }
  return -1;
}

function nowIST() {
  var now = new Date();
  var ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  var y = ist.getUTCFullYear();
  var m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  var d = String(ist.getUTCDate()).padStart(2, '0');
  var h = String(ist.getUTCHours()).padStart(2, '0');
  var min = String(ist.getUTCMinutes()).padStart(2, '0');
  return y + '-' + m + '-' + d + ' ' + h + ':' + min;
}

// ─── GENERIC READ/WRITE ───

function readAllRowsFromSheet(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { rows: [], headers: data[0] || [] };
  var headers = data[0];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _dataRow: i, _sheetRow: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = (data[i][j] || "").toString();
    }
    rows.push(obj);
  }
  return { headers: headers, rows: rows, totalRows: rows.length };
}

function readRowFromSheet(sheet, n) {
  var headers = getHeaders(sheet);
  var sheetRow = parseInt(n) + 1;
  var rowData = sheet.getRange(sheetRow, 1, 1, headers.length).getValues()[0];
  var obj = { _dataRow: parseInt(n), _sheetRow: sheetRow };
  for (var i = 0; i < headers.length; i++) {
    obj[headers[i]] = (rowData[i] || "").toString();
  }
  return obj;
}

function writeMultipleToSheet(sheet, sheetRow, updates, headers) {
  if (!headers) headers = getHeaders(sheet);
  for (var colName in updates) {
    var idx = colIndex(headers, colName);
    if (idx === -1) continue;
    sheet.getRange(sheetRow, idx + 1).setValue(updates[colName]);
  }
}

// ─── SOCIAL MEDIA (Agentic Sheet) ───

function readAllRows() {
  return readAllRowsFromSheet(getSheet());
}

function readRow(n) {
  return readRowFromSheet(getSheet(), n);
}

function readUnposted() {
  var all = readAllRows();
  var unposted = [];
  for (var i = 0; i < all.rows.length; i++) {
    var r = all.rows[i];
    if (!(r["targetUrl"] || "")) continue;
    var xStatus = r["X Status"] || "";
    var fbStatus = r["FB Status"] || "";
    var liStatus = r["LinkedIn Status"] || "";
    if (!xStatus || !fbStatus || !liStatus) {
      var pending = [];
      if (!xStatus) pending.push("X");
      if (!fbStatus) pending.push("FB");
      if (!liStatus) pending.push("LI");
      r._pending = pending;
      unposted.push(r);
    }
    if (unposted.length >= 15) break;
  }
  return { rows: unposted, count: unposted.length };
}

function platformSuccess(dataRow, platform, postText, postUrl, batchLabel) {
  var sheet = getSheet();
  var headers = getHeaders(sheet);
  var sheetRow = parseInt(dataRow) + 1;
  var colMap = {
    "x":  { timestamp: "lastPostedX",  batch: "xBatch",  post: "X Post",       url: "X Post URL",       status: "X Status",       error: "X Error" },
    "fb": { timestamp: "lastPostedFb", batch: "fbBatch", post: "FB Post",      url: "FB Post URL",      status: "FB Status",      error: "FB Error" },
    "li": { timestamp: "lastPostedLi", batch: "liBatch", post: "LinkedIn Post", url: "LinkedIn Post URL", status: "LinkedIn Status", error: "LinkedIn Error" }
  };
  var cols = colMap[platform];
  if (!cols) return { error: "Unknown platform: " + platform };
  var updates = {};
  updates[cols.timestamp] = nowIST();
  updates[cols.batch]     = batchLabel;
  updates[cols.post]      = postText;
  updates[cols.url]       = postUrl;
  updates[cols.status]    = "posted";
  updates[cols.error]     = "";
  writeMultipleToSheet(sheet, sheetRow, updates, headers);
  return { ok: true, sheetRow: sheetRow, platform: platform.toUpperCase(), status: "posted" };
}

function platformError(dataRow, platform, errorMsg) {
  var sheet = getSheet();
  var headers = getHeaders(sheet);
  var sheetRow = parseInt(dataRow) + 1;
  var colMap = {
    "x":  { status: "X Status",       error: "X Error" },
    "fb": { status: "FB Status",      error: "FB Error" },
    "li": { status: "LinkedIn Status", error: "LinkedIn Error" }
  };
  var cols = colMap[platform];
  if (!cols) return { error: "Unknown platform: " + platform };
  var updates = {};
  updates[cols.status] = "error";
  updates[cols.error]  = errorMsg;
  writeMultipleToSheet(sheet, sheetRow, updates, headers);
  return { ok: true, sheetRow: sheetRow, platform: platform.toUpperCase(), status: "error", errorMsg: errorMsg };
}

// ─── BLOG SHEET ───

function initBlogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var blogSheet = ss.getSheetByName(BLOG_SHEET_NAME);

  var headers = [
    "targetUrl", "title", "Name",
    "Blog Title", "Blog Description", "Blog Content",
    "blogBatch", "lastPostedBlog",
    "Blog SEO Title", "Blog SEO Description", "Blog Caption",
    "LinkedIn Pulse URL", "LinkedIn Pulse Status", "LinkedIn Pulse Error",
    "Notion URL", "Notion Status", "Notion Error"
  ];

  if (!blogSheet) {
    // Create new sheet
    blogSheet = ss.insertSheet(BLOG_SHEET_NAME);
    blogSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    blogSheet.setFrozenRows(1);
    blogSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    return { ok: true, message: "Blog Sheet created with " + headers.length + " columns", headers: headers };
  }

  // Sheet exists — add any missing columns
  var existingHeaders = getHeaders(blogSheet);
  var added = [];
  headers.forEach(function(h) {
    if (existingHeaders.indexOf(h) === -1) {
      var nextCol = existingHeaders.length + added.length + 1;
      blogSheet.getRange(1, nextCol).setValue(h).setFontWeight("bold");
      added.push(h);
    }
  });

  if (added.length === 0) {
    return { ok: true, message: "All columns already exist", headers: existingHeaders };
  }
  return { ok: true, message: "Added " + added.length + " missing column(s): " + added.join(", "), added: added };
}

function readBlogRows() {
  var sheet = getBlogSheet();
  if (!sheet) return { error: "Blog Sheet tab not found. POST action=blog-init first." };
  return readAllRowsFromSheet(sheet);
}

function readBlogRow(n) {
  var sheet = getBlogSheet();
  if (!sheet) return { error: "Blog Sheet tab not found." };
  return readRowFromSheet(sheet, n);
}

function readBlogUnposted() {
  var sheet = getBlogSheet();
  if (!sheet) return { error: "Blog Sheet tab not found. POST action=blog-init first." };
  var all = readAllRowsFromSheet(sheet);
  var unposted = [];
  for (var i = 0; i < all.rows.length; i++) {
    var r = all.rows[i];
    if (!(r["targetUrl"] || "")) continue;
    var pulseStatus = r["LinkedIn Pulse Status"] || "";
    var notionStatus = r["Notion Status"] || "";
    if (!pulseStatus || !notionStatus) {
      var pending = [];
      var blogContent = r["Blog Content"] || "";
      if (!blogContent) pending.push("GENERATE");
      if (!pulseStatus) pending.push("LINKEDIN_PULSE");
      if (!notionStatus) pending.push("NOTION");
      r._pending = pending;
      unposted.push(r);
    }
    if (unposted.length >= 10) break;
  }
  return { rows: unposted, count: unposted.length };
}

function blogUpdate(dataRow, updates) {
  var sheet = getBlogSheet();
  if (!sheet) return { error: "Blog Sheet tab not found." };
  var headers = getHeaders(sheet);
  var sheetRow = parseInt(dataRow) + 1;
  // Auto-add timestamp if writing a status
  if (updates["LinkedIn Pulse Status"] === "posted" || updates["Notion Status"] === "posted") {
    updates["lastPostedBlog"] = nowIST();
  }
  writeMultipleToSheet(sheet, sheetRow, updates, headers);
  return { ok: true, sheetRow: sheetRow };
}

// ─── HTTP HANDLERS ───

function doGet(e) {
  var action = (e.parameter.action || "read").toLowerCase();
  var result;
  try {
    switch (action) {
      case "read":        result = readAllRows(); break;
      case "row":         result = readRow(e.parameter.n); break;
      case "unposted":    result = readUnposted(); break;
      case "blog-read":   result = readBlogRows(); break;
      case "blog-row":    result = readBlogRow(e.parameter.n); break;
      case "blog-unposted": result = readBlogUnposted(); break;
      default:            result = { error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    body = e.parameter || {};
  }
  var action = (body.action || e.parameter.action || "").toLowerCase();
  var result;
  try {
    switch (action) {
      case "x-success":
        result = platformSuccess(body.row, "x", body.tweet || body.post, body.url, body.batch);
        break;
      case "x-error":
        result = platformError(body.row, "x", body.error);
        break;
      case "fb-success":
        result = platformSuccess(body.row, "fb", body.post, body.url, body.batch);
        break;
      case "fb-error":
        result = platformError(body.row, "fb", body.error);
        break;
      case "li-success":
        result = platformSuccess(body.row, "li", body.post, body.url, body.batch);
        break;
      case "li-error":
        result = platformError(body.row, "li", body.error);
        break;
      case "update":
        var sheet = getSheet();
        var headers = getHeaders(sheet);
        var sheetRow = parseInt(body.row) + 1;
        writeMultipleToSheet(sheet, sheetRow, body.updates || {}, headers);
        result = { ok: true, sheetRow: sheetRow };
        break;
      case "blog-init":
        result = initBlogSheet();
        break;
      case "blog-update":
        result = blogUpdate(body.row, body.updates || {});
        break;
      default:
        result = { error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
