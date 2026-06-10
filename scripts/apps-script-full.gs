/**
 * Google Apps Script — Sheet API for Agentic Posting + Blog System + SERP Schedule
 * Paste this into: Google Sheet → Extensions → Apps Script → Replace all → Save → Redeploy
 */

var SS_ID           = '1p_N3zzJbUx-7t8sjuAtbQsHaUfVmYxytQU_gDd2MGwQ';
var SHEET_NAME      = "Agentic Sheet";
var BLOG_SHEET_NAME = "Blogs";
var URLS_TAB        = "URLs";
var SOCIAL_TAB      = "Social Media";

var SOCIAL_HEADERS = [
  'targetUrl', 'title', 'priority', 'seoIndexed', 'postDate',
  'X Post', 'FB Post', 'LinkedIn Post',
  'X Report URL', 'X Report Title',
  'FB Report URL', 'FB Report Title',
  'LI Report URL', 'LI Report Title'
];

// ─── HELPERS ───

function getSheet() {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_NAME);
}

function getBlogSheet() {
  return SpreadsheetApp.openById(SS_ID).getSheetByName(BLOG_SHEET_NAME);
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
  var y   = ist.getUTCFullYear();
  var m   = String(ist.getUTCMonth() + 1).padStart(2, '0');
  var d   = String(ist.getUTCDate()).padStart(2, '0');
  var h   = String(ist.getUTCHours()).padStart(2, '0');
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
    var xStatus  = r["X Status"]        || "";
    var fbStatus = r["FB Status"]       || "";
    var liStatus = r["LinkedIn Status"] || "";
    if (!xStatus || !fbStatus || !liStatus) {
      var pending = [];
      if (!xStatus)  pending.push("X");
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
  var sheet   = getSheet();
  var headers = getHeaders(sheet);
  var sheetRow = parseInt(dataRow) + 1;
  var colMap = {
    "x":  { timestamp: "lastPostedX",  batch: "xBatch",  post: "X Post",        url: "X Post URL",        status: "X Status",        error: "X Error" },
    "fb": { timestamp: "lastPostedFb", batch: "fbBatch", post: "FB Post",       url: "FB Post URL",       status: "FB Status",       error: "FB Error" },
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
  var sheet   = getSheet();
  var headers = getHeaders(sheet);
  var sheetRow = parseInt(dataRow) + 1;
  var colMap = {
    "x":  { status: "X Status",        error: "X Error" },
    "fb": { status: "FB Status",       error: "FB Error" },
    "li": { status: "LinkedIn Status", error: "LinkedIn Error" }
  };
  var cols = colMap[platform];
  if (!cols) return { error: "Unknown platform: " + platform };
  var updates = {};
  updates[cols.status] = "error";
  updates[cols.error]  = errorMsg;
  writeMultipleToSheet(sheet, sheetRow, updates, headers);
  return { ok: true, sheetRow: sheetRow, platform: platform.toUpperCase(), status: "error" };
}

// ─── BLOG SHEET ───

function initBlogSheet() {
  var ss        = SpreadsheetApp.openById(SS_ID);
  var blogSheet = ss.getSheetByName(BLOG_SHEET_NAME);
  var headers   = [
    "targetUrl", "title", "Name",
    "Blog Title", "Blog Description", "Blog Content",
    "blogBatch", "lastPostedBlog",
    "Blog SEO Title", "Blog SEO Description", "Blog Caption",
    "LinkedIn Pulse URL", "LinkedIn Pulse Status", "LinkedIn Pulse Error",
    "Notion URL", "Notion Status", "Notion Error"
  ];
  if (!blogSheet) {
    blogSheet = ss.insertSheet(BLOG_SHEET_NAME);
    blogSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    blogSheet.setFrozenRows(1);
    blogSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    return { ok: true, message: "Blog Sheet created", headers: headers };
  }
  var existingHeaders = getHeaders(blogSheet);
  var added = [];
  headers.forEach(function(h) {
    if (existingHeaders.indexOf(h) === -1) {
      blogSheet.getRange(1, existingHeaders.length + added.length + 1).setValue(h).setFontWeight("bold");
      added.push(h);
    }
  });
  return added.length === 0
    ? { ok: true, message: "All columns exist" }
    : { ok: true, message: "Added: " + added.join(", "), added: added };
}

function readBlogRows()     { var s = getBlogSheet(); if (!s) return { error: "Blog tab not found" }; return readAllRowsFromSheet(s); }
function readBlogRow(n)     { var s = getBlogSheet(); if (!s) return { error: "Blog tab not found" }; return readRowFromSheet(s, n); }

function readBlogUnposted() {
  var sheet = getBlogSheet();
  if (!sheet) return { error: "Blog Sheet tab not found." };
  var all = readAllRowsFromSheet(sheet);
  var unposted = [];
  for (var i = 0; i < all.rows.length; i++) {
    var r = all.rows[i];
    if (!(r["targetUrl"] || "")) continue;
    var pulseStatus  = r["LinkedIn Pulse Status"] || "";
    var notionStatus = r["Notion Status"]         || "";
    if (!pulseStatus || !notionStatus) {
      var pending = [];
      if (!(r["Blog Content"] || "")) pending.push("GENERATE");
      if (!pulseStatus)  pending.push("LINKEDIN_PULSE");
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
  var headers  = getHeaders(sheet);
  var sheetRow = parseInt(dataRow) + 1;
  if (updates["LinkedIn Pulse Status"] === "posted" || updates["Notion Status"] === "posted") {
    updates["lastPostedBlog"] = nowIST();
  }
  writeMultipleToSheet(sheet, sheetRow, updates, headers);
  return { ok: true, sheetRow: sheetRow };
}

// ─── SERP SCHEDULE (URLs tab → Social Media tab) ──────────────────────────────

function handleUrlsUnpicked() {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(URLS_TAB);
  if (!sheet) return { error: 'Tab not found: ' + URLS_TAB };

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var urlCol    = headers.indexOf('report url');
  var titleCol  = headers.indexOf('title');
  var pickedCol = headers.indexOf('picked');

  if (urlCol < 0 || titleCol < 0) return { error: 'Columns "report url" / "title" not found in URLs tab' };

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var picked = pickedCol >= 0 ? String(data[i][pickedCol] || '').trim() : '';
    if (picked) continue;
    var url = String(data[i][urlCol] || '').trim();
    if (!url) continue;
    rows.push({ row: i + 1, targetUrl: url, title: String(data[i][titleCol] || '').trim() });
    if (rows.length >= 75) break;
  }
  return rows;
}

function handleUrlsMarkPicked(rowNum) {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(URLS_TAB);
  if (!sheet) return { error: 'Tab not found: ' + URLS_TAB };
  var headers   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                    .map(function(h) { return String(h).trim().toLowerCase(); });
  var pickedCol = headers.indexOf('picked');
  if (pickedCol < 0) return { error: '"picked" column not found' };
  sheet.getRange(rowNum, pickedCol + 1).setValue('picked');
  return { ok: true };
}

function handleUrlsMarkPickedBulk(rows) {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(URLS_TAB);
  if (!sheet) return { error: 'Tab not found: ' + URLS_TAB };
  var headers   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                    .map(function(h) { return String(h).trim().toLowerCase(); });
  var pickedCol = headers.indexOf('picked');
  if (pickedCol < 0) return { error: '"picked" column not found' };
  for (var i = 0; i < rows.length; i++) {
    sheet.getRange(parseInt(rows[i]), pickedCol + 1).setValue('picked');
  }
  return { ok: true, marked: rows.length };
}

function handleSocialMediaWrite(updates) {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SOCIAL_TAB);

  if (!sheet) {
    sheet = ss.insertSheet(SOCIAL_TAB);
    sheet.getRange(1, 1, 1, SOCIAL_HEADERS.length).setValues([SOCIAL_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SOCIAL_HEADERS.length).setFontWeight("bold");
  }

  var headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), SOCIAL_HEADERS.length))
                    .getValues()[0].map(function(h) { return String(h).trim(); });
  if (!headerRow[0]) {
    sheet.getRange(1, 1, 1, SOCIAL_HEADERS.length).setValues([SOCIAL_HEADERS]);
    headerRow = SOCIAL_HEADERS.slice();
  }

  // Find existing row by targetUrl — append to columns. If not found, create new row.
  // Use getValues on col A to find actual last row with data (avoids blank-row getLastRow() bug)
  var rawLastRow = sheet.getLastRow();
  var actualLastRow = 1; // default = header only
  if (rawLastRow > 1) {
    var colAVals = sheet.getRange(2, 1, rawLastRow - 1, 1).getValues();
    for (var r = colAVals.length - 1; r >= 0; r--) {
      if (String(colAVals[r][0]).trim() !== '') { actualLastRow = r + 2; break; }
    }
  }

  var targetRow = actualLastRow + 1;
  var isNewRow  = true;

  if (actualLastRow > 1) {
    var urlColIdx = headerRow.indexOf('targetUrl');
    if (urlColIdx >= 0) {
      var urlData = sheet.getRange(2, urlColIdx + 1, actualLastRow - 1, 1).getValues();
      for (var i = 0; i < urlData.length; i++) {
        if (String(urlData[i][0]).trim() === String(updates.targetUrl || '').trim()) {
          targetRow = i + 2;
          isNewRow  = false;
          break;
        }
      }
    }
  }

  if (isNewRow) {
    // First time this URL is written — write all values as-is
    var rowData = new Array(headerRow.length).fill('');
    for (var key in updates) {
      var idx = headerRow.indexOf(key);
      if (idx >= 0) rowData[idx] = updates[key] != null ? updates[key] : '';
    }
    sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // URL already exists — append date-stamped value to each column
    var existingRow = sheet.getRange(targetRow, 1, 1, headerRow.length).getValues()[0];
    for (var key in updates) {
      if (key === 'targetUrl' || key === 'title') continue; // never append to these
      var idx = headerRow.indexOf(key);
      if (idx < 0) continue;
      var existing = String(existingRow[idx] || '').trim();
      var newVal   = updates[key] != null ? String(updates[key]) : '';
      existingRow[idx] = existing ? existing + ' | ' + newVal : newVal;
    }
    sheet.getRange(targetRow, 1, 1, headerRow.length).setValues([existingRow]);
  }

  return { ok: true, row: targetRow };
}

// ── Read rows from Social Media tab (optionally filtered by week) ────────────
function handleSocialMediaRead(week) {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SOCIAL_TAB);
  if (!sheet) return { error: 'Tab not found: ' + SOCIAL_TAB };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var postDateIdx = headers.indexOf('postDate');

  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = { _dataRow: i, _sheetRow: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = String(data[i][j] || '');
    }
    // If week filter provided, only return rows whose postDate falls Mon–Fri of that week
    if (week && postDateIdx >= 0) {
      var pd = String(data[i][postDateIdx] || '').trim().substring(0, 10);
      if (pd < week) continue;
      var weekEnd = new Date(week); weekEnd.setDate(weekEnd.getDate() + 4);
      var weekEndStr = weekEnd.toISOString().substring(0, 10);
      if (pd > weekEndStr) continue;
    }
    rows.push(obj);
  }
  return rows;
}

// ── Update specific columns of a Social Media row by targetUrl ───────────────
function handleSocialMediaUpdate(targetUrl, updates) {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(SOCIAL_TAB);
  if (!sheet) return { error: 'Tab not found: ' + SOCIAL_TAB };

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                  .map(function(h) { return String(h).trim(); });
  var urlIdx  = headers.indexOf('targetUrl');
  if (urlIdx < 0) return { error: '"targetUrl" column not found' };

  var rawLast = sheet.getLastRow();
  var actualLast = 1;
  if (rawLast > 1) {
    var colA = sheet.getRange(2, 1, rawLast - 1, 1).getValues();
    for (var r = colA.length - 1; r >= 0; r--) {
      if (String(colA[r][0]).trim() !== '') { actualLast = r + 2; break; }
    }
  }
  var targetRow = -1;
  if (actualLast > 1) {
    var urlData = sheet.getRange(2, urlIdx + 1, actualLast - 1, 1).getValues();
    for (var i = 0; i < urlData.length; i++) {
      if (String(urlData[i][0]).trim() === String(targetUrl || '').trim()) {
        targetRow = i + 2;
        break;
      }
    }
  }
  if (targetRow < 0) return { error: 'Row not found for targetUrl: ' + targetUrl };

  writeMultipleToSheet(sheet, targetRow, updates, headers);
  return { ok: true, row: targetRow };
}

// ─── HTTP HANDLERS ───

function doGet(e) {
  var action = (e.parameter.action || "read").toLowerCase();
  var result;
  try {
    switch (action) {
      case "read":           result = readAllRows();            break;
      case "row":            result = readRow(e.parameter.n);  break;
      case "unposted":       result = readUnposted();           break;
      case "blog-read":      result = readBlogRows();           break;
      case "blog-row":       result = readBlogRow(e.parameter.n); break;
      case "blog-unposted":  result = readBlogUnposted();       break;
      case "urls-unpicked":    result = handleUrlsUnpicked();                        break;
      case "social-media-read": result = handleSocialMediaRead(e.parameter.week);   break;
      default:                 result = { error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); }
  catch (err) { body = e.parameter || {}; }
  var action = (body.action || e.parameter.action || "").toLowerCase();
  var result;
  try {
    switch (action) {
      case "x-success":
        result = platformSuccess(body.row, "x", body.tweet || body.post, body.url, body.batch); break;
      case "x-error":
        result = platformError(body.row, "x", body.error); break;
      case "fb-success":
        result = platformSuccess(body.row, "fb", body.post, body.url, body.batch); break;
      case "fb-error":
        result = platformError(body.row, "fb", body.error); break;
      case "li-success":
        result = platformSuccess(body.row, "li", body.post, body.url, body.batch); break;
      case "li-error":
        result = platformError(body.row, "li", body.error); break;
      case "update":
        var sheet    = getSheet();
        var headers  = getHeaders(sheet);
        var sheetRow = parseInt(body.row) + 1;
        writeMultipleToSheet(sheet, sheetRow, body.updates || {}, headers);
        result = { ok: true, sheetRow: sheetRow };
        break;
      case "blog-init":
        result = initBlogSheet(); break;
      case "blog-update":
        result = blogUpdate(body.row, body.updates || {}); break;
      case "urls-mark-picked":
        result = handleUrlsMarkPicked(body.row); break;
      case "urls-mark-picked-bulk":
        result = handleUrlsMarkPickedBulk(body.rows || []); break;
      case "social-media-write":
        result = handleSocialMediaWrite(body.updates || {}); break;
      case "social-media-update":
        result = handleSocialMediaUpdate(body.targetUrl, body.updates || {}); break;
      default:
        result = { error: "Unknown action: " + action };
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
