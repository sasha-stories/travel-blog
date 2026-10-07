// Sasha Travel Stories: run setupSheets once from the Apps Script editor. It needs Sasha Blog Bridge.gs in the same project.
// It creates every tab with tidy headers, or tidies an existing sheet while keeping all your rows. Delete this file afterwards if you like.

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Open this script from your Google Sheet (Extensions > Apps Script) and run setupSheets again.");
  props().setProperty("SHEET_ID", ss.getId());
  tokenSecret();
  Object.keys(TABS).forEach(function (name) { setupTab_(ss, name); });
  const menus = ss.getSheetByName("Navigation");
  if (menus) ss.deleteSheet(menus);
  const blank = ss.getSheetByName("Sheet1");
  if (blank && ss.getSheets().length > 1 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  bumpCache();
  Logger.log("All set. Next: add ADMIN_PASSWORD under Project Settings > Script properties, then deploy a new version (assets/setup.txt).");
}

// Renames an older tab (Blogs, Categories, Images), rewrites it with the new headers and keeps every row.
function setupTab_(ss, name) {
  const tab = TABS[name];
  let sheet = ss.getSheetByName(tab.name) || (tab.legacy ? ss.getSheetByName(tab.legacy) : null);
  if (!sheet) sheet = ss.insertSheet(tab.name);
  else if (sheet.getName() !== tab.name) sheet.setName(tab.name);
  const headers = tab.columns.map(function (col) { return col[1]; });
  const fields = tab.columns.map(function (col) { return col[0]; });
  if (name === "settings") {
    const settings = readSettings();
    tidySettings_(settings);
    sheet.clear();
    sheet.getRange(1, 1, 1, 2).setValues([headers]);
    writeSettings(settings, true);
  } else {
    const records = sheet.getLastRow() > 1 ? readAll(name) : [];
    if (name === "themes") records.forEach(fillLook_);
    sheet.clear();
    grow_(sheet, records.length + 1, headers.length);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (records.length) {
      sheet.getRange(2, 1, records.length, fields.length).setNumberFormat("@").setValues(records.map(function (r) { return encodeRow(fields, r, null); }));
    }
  }
  styleTab_(sheet, name, headers.length);
  Logger.log('Tab "' + tab.name + '" is ready.');
}

function grow_(sheet, rows, cols) {
  if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
  if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
}

// Carries the blog's new name into settings saved under the old one.
function tidySettings_(settings) {
  Object.keys(settings).forEach(function (key) {
    if (typeof settings[key] !== "string") return;
    settings[key] = settings[key].replace(/Pratiksha['\u2019]s Travel Blog/g, "Sasha Travel Stories").replace(/Pratiksha/g, "Sasha");
  });
}

function fillLook_(theme) {
  if (!Object.prototype.hasOwnProperty.call(LOOKS, theme.look)) theme.look = "journal";
  theme.accent = hexColor(theme.accent) || LOOKS[theme.look][0];
  theme.tint = hexColor(theme.tint) || LOOKS[theme.look][1];
}

function styleTab_(sheet, name, count) {
  if (sheet.getMaxColumns() > count) sheet.deleteColumns(count + 1, sheet.getMaxColumns() - count);
  const rows = sheet.getMaxRows();
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, rows, count).setNumberFormat("@").setVerticalAlignment("top");
  sheet.getRange(1, 1, 1, count).setFontWeight("bold").setBackground("#efe7d8").setFontColor("#2a2622");
  if (name === "settings") {
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 560);
    return;
  }
  sheet.setColumnWidths(1, count, 140);
  const statuses = { themes: ["active", "hidden", "deleted"], images: ["active", "deleted"] }[name] || ["draft", "published", "deleted"];
  const col = TABS[name].columns.map(function (c) { return c[0]; }).indexOf("status") + 1;
  if (col > 0 && rows > 1) {
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(false).build();
    sheet.getRange(2, col, rows - 1, 1).setDataValidation(rule);
  }
}
