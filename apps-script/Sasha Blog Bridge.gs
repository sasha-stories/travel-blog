// Sasha Travel Stories: the bridge between the blog and this Google Sheet. Paste it into Extensions > Apps Script.
// Script properties: ADMIN_PASSWORD, and for photo uploads CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
// Filled in automatically: SHEET_ID, TOKEN_SECRET, ADMIN_PASSWORD_HASH and CACHE_GEN. Guide: assets/setup.txt.

const VERSION = "2.1";
const SESSION_DAYS = 7;
const CACHE_SECONDS = 300;
const CLOUDINARY_ROOT = "Sasha Blog";

// Each tab: its name, an older name it may still have, and its columns as [field, header, older headers...].
const TABS = {
  stories: {
    name: "Journal",
    legacy: "Blogs",
    columns: [
      ["id", "ID"], ["slug", "Slug"], ["title", "Title"], ["subtitle", "Subtitle"], ["excerpt", "Excerpt"],
      ["coverImage", "Cover Image"], ["coverAlt", "Cover Alt"], ["location", "Location"], ["placeId", "Place ID"],
      ["theme", "Theme", "category"], ["tags", "Tags"], ["tripStart", "Trip Start"], ["tripEnd", "Trip End"],
      ["textSize", "Text Size"], ["font", "Font"], ["spacing", "Spacing"], ["featured", "Featured"], ["status", "Status"],
      ["publishedAt", "Published At"], ["blocks", "Blocks"], ["createdAt", "Created At"], ["updatedAt", "Updated At"],
    ],
  },
  places: {
    name: "Places",
    columns: [
      ["id", "ID"], ["slug", "Slug"], ["name", "Name"], ["region", "Region"], ["country", "Country"], ["summary", "Summary"],
      ["description", "Description"], ["coverImage", "Cover Image"], ["coverAlt", "Cover Alt"], ["lat", "Latitude"],
      ["lng", "Longitude"], ["bestTime", "Best Time"], ["visitedOn", "Visited On"], ["tags", "Tags"], ["featured", "Featured"],
      ["status", "Status"], ["sortOrder", "Sort Order"], ["createdAt", "Created At"], ["updatedAt", "Updated At"],
    ],
  },
  experiences: {
    name: "Experiences",
    columns: [
      ["id", "ID"], ["slug", "Slug"], ["title", "Title"], ["kind", "Kind"], ["placeId", "Place ID"], ["summary", "Summary"],
      ["image", "Image"], ["imageAlt", "Image Alt"], ["date", "Date"], ["rating", "Rating"], ["duration", "Duration"],
      ["cost", "Cost"], ["storySlug", "Story Slug"], ["link", "Link"], ["featured", "Featured"], ["status", "Status"],
      ["sortOrder", "Sort Order"], ["createdAt", "Created At"], ["updatedAt", "Updated At"],
    ],
  },
  themes: {
    name: "Themes",
    legacy: "Categories",
    columns: [
      ["id", "ID"], ["slug", "Slug"], ["name", "Name"], ["description", "Description"], ["look", "Look"],
      ["accent", "Accent", "color"], ["tint", "Background"], ["sortOrder", "Sort Order"], ["status", "Status"],
      ["createdAt", "Created At"], ["updatedAt", "Updated At"],
    ],
  },
  images: {
    name: "Media",
    legacy: "Images",
    columns: [
      ["id", "ID"], ["url", "URL"], ["publicId", "Public ID"], ["folder", "Folder"], ["alt", "Alt"], ["caption", "Caption"],
      ["credit", "Credit"], ["width", "Width"], ["height", "Height"], ["bytes", "Bytes"], ["source", "Source"],
      ["status", "Status"], ["createdAt", "Created At"], ["updatedAt", "Updated At"],
    ],
  },
  settings: { name: "Settings", columns: [["key", "Key"], ["value", "Value"]] },
};

const COLLECTIONS = {
  stories: { prefix: "st", slugFrom: "title", restoreTo: "draft" },
  places: { prefix: "pl", slugFrom: "name", restoreTo: "draft" },
  experiences: { prefix: "ex", slugFrom: "title", restoreTo: "draft" },
  themes: { prefix: "th", slugFrom: "name", restoreTo: "active" },
  images: { prefix: "im", slugFrom: "", restoreTo: "active" },
};

const NUMBER_FIELDS = ["sortOrder", "rating", "width", "height", "bytes"];
const TIME_FIELDS = ["publishedAt", "createdAt", "updatedAt"];

/* ---------- Web app entry points ---------- */

function doGet(e) {
  return respond(function () {
    const p = (e && e.parameter) || {};
    const action = String(p.action || "ping");
    if (action === "ping") return { sheet: book().getName(), version: VERSION, photos: Boolean(cloudinary()) };
    if (action === "site") return { data: publicSite() };
    if (action === "story") return { data: publicStory(p.slug) };
    throw fail("Unknown action.", "INVALID");
  });
}

function doPost(e) {
  return respond(function () {
    let body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    } catch (err) {
      throw fail("The request could not be read.", "INVALID");
    }
    const action = String(body.action || "");
    if (action === "login") return login(body.password);
    checkToken(body.token);
    const handler = ADMIN[action];
    if (!handler) throw fail("Unknown action.", "INVALID");
    return handler(body);
  });
}

function respond(fn) {
  let out;
  try {
    out = Object.assign({ ok: true }, fn());
  } catch (err) {
    if (!err.code) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err.code ? err.message : "Server error: " + (err && err.message ? err.message : err), code: err.code || "SERVER" };
    if (err.field) out.field = err.field;
    if (err.current) out.current = err.current;
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function fail(message, code, extra) {
  const err = new Error(message);
  err.code = code || "INVALID";
  if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
  return err;
}

// Ends every dashboard sign-in on every device. Run it from the editor when needed.
function signOutEverywhere() {
  props().setProperty("TOKEN_SECRET", Utilities.getUuid() + Utilities.getUuid());
  Logger.log("Done. Every dashboard session has been signed out.");
}

/* ---------- Sign-in ---------- */

function props() {
  return PropertiesService.getScriptProperties();
}

function hex(bytes) {
  return bytes.map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join("");
}

function sha256(text) {
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8));
}

// Salted and repeated, so the stored copy can't be turned back into the password.
function hashPassword(password, salt) {
  let h = salt + ":" + password;
  for (let i = 0; i < 300; i += 1) h = sha256(h + ":" + password);
  return salt + ":" + h;
}

function tokenSecret() {
  let secret = props().getProperty("TOKEN_SECRET");
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props().setProperty("TOKEN_SECRET", secret);
  }
  return secret;
}

function b64(text) {
  return Utilities.base64EncodeWebSafe(text, Utilities.Charset.UTF_8).replace(/=+$/, "");
}

function unb64(text) {
  const padded = text + "===".slice((text.length + 3) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString("UTF-8");
}

function hmac(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, tokenSecret())).replace(/=+$/, "");
}

function same(a, b) {
  const x = String(a);
  const y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

function login(password) {
  const cache = CacheService.getScriptCache();
  const misses = Number(cache.get("login-misses") || 0);
  if (misses >= 10) throw fail("Too many wrong passwords. Please wait 15 minutes, then try again.", "RATE_LIMITED");
  const p = props();
  const fresh = p.getProperty("ADMIN_PASSWORD");
  if (fresh) {
    p.setProperty("ADMIN_PASSWORD_HASH", hashPassword(fresh, Utilities.getUuid()));
    p.deleteProperty("ADMIN_PASSWORD");
    p.setProperty("TOKEN_SECRET", Utilities.getUuid() + Utilities.getUuid());
  }
  const stored = p.getProperty("ADMIN_PASSWORD_HASH");
  if (!stored) throw fail("No password has been set yet. Add ADMIN_PASSWORD in the script properties (assets/setup.txt, step 4).", "NOT_CONFIGURED");
  const salt = stored.split(":")[0];
  if (!password || !same(hashPassword(String(password), salt), stored)) {
    cache.put("login-misses", String(misses + 1), 900);
    Utilities.sleep(700);
    throw fail("That password isn't right.", "UNAUTHORIZED", { field: "password" });
  }
  cache.remove("login-misses");
  const expiresAt = Date.now() + SESSION_DAYS * 86400000;
  const payload = b64(JSON.stringify({ exp: expiresAt }));
  return { token: payload + "." + hmac(payload), expiresAt: expiresAt };
}

function checkToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !same(hmac(parts[0]), parts[1])) throw fail("Please sign in again.", "UNAUTHORIZED");
  let data = null;
  try {
    data = JSON.parse(unb64(parts[0]));
  } catch (err) {
    data = null;
  }
  if (!data || !data.exp || data.exp < Date.now()) throw fail("Your session has ended. Please sign in again.", "UNAUTHORIZED");
}

/* ---------- Google Sheet storage ---------- */

function book() {
  const id = props().getProperty("SHEET_ID");
  const found = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!found) throw fail("The Google Sheet isn't connected yet. Run setupSheets once from the Apps Script editor.", "NOT_CONFIGURED");
  return found;
}

// "Cover Image", "cover_image" and "coverImage" all match the same column.
function norm(text) {
  return String(text === null || text === undefined ? "" : text).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function headerMap(name) {
  const map = {};
  TABS[name].columns.forEach(function (col) {
    col.forEach(function (h) { map[norm(h)] = col[0]; });
  });
  return map;
}

function sheetFor(name) {
  const sheet = book().getSheetByName(TABS[name].name);
  if (!sheet) throw fail('The "' + TABS[name].name + '" tab is missing. Run setupSheets once, as assets/setup.txt explains.', "NOT_CONFIGURED");
  return sheet;
}

function readTable(name) {
  const sheet = sheetFor(name);
  const values = sheet.getDataRange().getValues();
  const map = headerMap(name);
  const fields = (values[0] || []).map(function (h) { return map[norm(h)] || ""; });
  return { sheet: sheet, fields: fields, values: values };
}

// Adds any missing columns at the end, so a sheet set up earlier keeps working.
function ensureColumns(t, name) {
  const missing = TABS[name].columns.filter(function (col) { return t.fields.indexOf(col[0]) === -1; });
  if (!missing.length) return;
  const start = t.sheet.getLastColumn() + 1;
  const extra = start - 1 + missing.length - t.sheet.getMaxColumns();
  if (extra > 0) t.sheet.insertColumnsAfter(t.sheet.getMaxColumns(), extra);
  t.sheet.getRange(1, start, 1, missing.length).setValues([missing.map(function (col) { return col[1]; })]).setFontWeight("bold");
  missing.forEach(function (col, i) { t.fields[start - 1 + i] = col[0]; });
  for (let i = 0; i < t.fields.length; i += 1) if (t.fields[i] === undefined) t.fields[i] = "";
  t.values.forEach(function (row) { while (row.length < t.fields.length) row.push(""); });
}

function parseJson(text, fallback) {
  try {
    const v = JSON.parse(String(text || ""));
    return v === null || v === undefined ? fallback : v;
  } catch (err) {
    return fallback;
  }
}

// Turns one cell back into the value the blog expects.
function decodeValue(f, value) {
  let v = value;
  if (v instanceof Date) {
    if (TIME_FIELDS.indexOf(f) !== -1) v = v.toISOString();
    else v = Utilities.formatDate(v, Session.getScriptTimeZone(), f === "visitedOn" ? "yyyy-MM" : "yyyy-MM-dd");
  }
  if (v === null || v === undefined) v = "";
  if (f === "blocks") return parseJson(v, []);
  if (f === "tags") return String(v).split(",").map(function (t) { return t.trim(); }).filter(Boolean);
  if (f === "featured") return v === true || /^(true|yes|1)$/i.test(String(v).trim());
  if (f === "lat" || f === "lng") {
    const n = parseFloat(v);
    return String(v).trim() === "" || !isFinite(n) ? null : n;
  }
  if (NUMBER_FIELDS.indexOf(f) !== -1) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  return String(v);
}

// Text that starts like a formula is kept as plain text.
function cell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function encodeRow(fields, record, old) {
  return fields.map(function (f, j) {
    if (!f || !Object.prototype.hasOwnProperty.call(record, f)) return old && old[j] !== undefined ? old[j] : "";
    const v = record[f];
    if (f === "blocks") return cell(JSON.stringify(v || []));
    if (f === "tags") return cell((v || []).join(", "));
    if (f === "featured") return v ? "TRUE" : "FALSE";
    return cell(v);
  });
}

function readAll(name) {
  const t = readTable(name);
  const out = [];
  for (let i = 1; i < t.values.length; i += 1) {
    const rec = {};
    t.fields.forEach(function (f, j) { if (f) rec[f] = decodeValue(f, t.values[i][j]); });
    if (rec.id) out.push(rec);
  }
  return out;
}

// Updates rows that already exist (matched by ID) and adds the rest at the bottom.
function writeMany(name, records) {
  if (!records.length) return;
  const t = readTable(name);
  ensureColumns(t, name);
  const idCol = t.fields.indexOf("id");
  const rowOf = {};
  for (let i = 1; i < t.values.length; i += 1) rowOf[String(t.values[i][idCol])] = i;
  const width = t.fields.length;
  const added = [];
  records.forEach(function (rec) {
    const i = rowOf[rec.id];
    if (i === undefined) added.push(encodeRow(t.fields, rec, null));
    else t.sheet.getRange(i + 1, 1, 1, width).setNumberFormat("@").setValues([encodeRow(t.fields, rec, t.values[i])]);
  });
  if (!added.length) return;
  const first = t.values.length + 1;
  const extra = first - 1 + added.length - t.sheet.getMaxRows();
  if (extra > 0) t.sheet.insertRowsAfter(t.sheet.getMaxRows(), extra);
  t.sheet.getRange(first, 1, added.length, width).setNumberFormat("@").setValues(added);
}

/* ---------- Settings tab (Key, Value) ---------- */

const SETTINGS = [
  { key: "siteTitle", label: "Site Title", max: 80 },
  { key: "tagline", label: "Tagline", max: 160 },
  { key: "footerNote", label: "Footer Note", max: 160 },
  { key: "authorName", label: "Author Name", max: 60 },
  { key: "authorBio", label: "Author Bio", type: "text", max: 400 },
  { key: "authorPhoto", label: "Author Photo", type: "image" },
  { key: "heroTitle", label: "Hero Title", max: 120 },
  { key: "heroSubtitle", label: "Hero Subtitle", type: "text", max: 320 },
  { key: "heroImage", label: "Hero Image", type: "image" },
  { key: "aboutTitle", label: "About Title", max: 100 },
  { key: "aboutBody", label: "About Body", type: "text", max: 5000 },
  { key: "aboutImage", label: "About Image", type: "image" },
  { key: "email", label: "Email", type: "email" },
  { key: "instagramUrl", label: "Instagram URL", type: "url" },
  { key: "youtubeUrl", label: "YouTube URL", type: "url" },
  { key: "mediaFolders", label: "Media Folders", type: "json", private: true },
];

const DEFAULT_SETTINGS = {
  siteTitle: "Sasha Travel Stories",
  tagline: "Slow journeys across India, written down before they fade.",
  footerNote: "Written slowly, one journey at a time.",
  authorName: "Sasha",
  authorBio: "I travel slowly, mostly by train and bus, and write about the places that stay with me long after I've left.",
  authorPhoto: "",
  heroTitle: "Notes from the road, kept like a journal.",
  heroSubtitle: "Stories, places and small moments from my travels across India, from Himalayan villages to temple towns and quiet coastlines.",
  heroImage: "",
  aboutTitle: "Hello, I'm Sasha",
  aboutBody: "This blog started as a paper notebook: train tickets taped between the pages, recipes scribbled in the margins and far too many sunsets described in far too many words.\n\nI travel slowly, usually for a few days at a time, and I write about the places that stay with me. Expect long walks, small towns, good food, honest tips and the occasional over-ambitious sunrise hike.\n\nIf a story here helps you plan a trip, or simply makes you want to go somewhere, it has done its job.",
  aboutImage: "",
  email: "",
  instagramUrl: "",
  youtubeUrl: "",
  mediaFolders: [],
};

function readSettings() {
  const values = sheetFor("settings").getDataRange().getValues();
  const raw = {};
  for (let i = 1; i < values.length; i += 1) {
    const key = norm(values[i][0]);
    if (!key) continue;
    const v = values[i][1];
    raw[key] = v instanceof Date ? v.toISOString() : v === null || v === undefined ? "" : String(v);
  }
  const out = {};
  SETTINGS.forEach(function (def) {
    const k = norm(def.key);
    const has = Object.prototype.hasOwnProperty.call(raw, k);
    if (def.type === "json") {
      const list = has ? parseJson(raw[k], []) : [];
      out[def.key] = Array.isArray(list) ? list.map(cleanFolder).filter(Boolean) : [];
    } else {
      out[def.key] = has ? raw[k] : DEFAULT_SETTINGS[def.key];
    }
  });
  return out;
}

// Rows with keys this file doesn't know are kept, unless dropOthers is true.
function writeSettings(settings, dropOthers) {
  const sheet = sheetFor("settings");
  const known = {};
  SETTINGS.forEach(function (def) { known[norm(def.key)] = true; });
  const others = dropOthers
    ? []
    : sheet.getDataRange().getValues().slice(1)
        .filter(function (r) { return norm(r[0]) && !known[norm(r[0])]; })
        .map(function (r) { return [r[0], r[1]]; });
  const rows = SETTINGS.map(function (def) {
    const v = settings[def.key];
    return [def.label, cell(def.type === "json" ? JSON.stringify(v || []) : v)];
  }).concat(others);
  const last = sheet.getLastRow();
  if (last > 1) sheet.getRange(2, 1, last - 1, Math.max(2, sheet.getLastColumn())).clearContent();
  const extra = rows.length + 1 - sheet.getMaxRows();
  if (extra > 0) sheet.insertRowsAfter(sheet.getMaxRows(), extra);
  sheet.getRange(2, 1, rows.length, 2).setNumberFormat("@").setValues(rows);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw fail("The sheet is busy with another save. Please try again in a moment.", "BUSY");
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Short-term copies, so the public blog stays fast ---------- */

function cacheGen() {
  return props().getProperty("CACHE_GEN") || "1";
}

// Called after every change: old copies are simply never used again.
function bumpCache() {
  props().setProperty("CACHE_GEN", String(Date.now()));
}

function cacheGet(name) {
  const cache = CacheService.getScriptCache();
  const key = name + ":" + cacheGen();
  const count = Number(cache.get(key + ":n") || 0);
  if (!count) return null;
  const keys = [];
  for (let i = 0; i < count; i += 1) keys.push(key + ":" + i);
  const parts = cache.getAll(keys);
  let text = "";
  for (let i = 0; i < keys.length; i += 1) {
    if (typeof parts[keys[i]] !== "string") return null;
    text += parts[keys[i]];
  }
  return parseJson(text, null);
}

function cachePut(name, value) {
  const text = JSON.stringify(value);
  const size = 24000;
  const count = Math.ceil(text.length / size);
  if (!count || count > 40) return;
  const key = name + ":" + cacheGen();
  const items = {};
  for (let i = 0; i < count; i += 1) items[key + ":" + i] = text.slice(i * size, (i + 1) * size);
  items[key + ":n"] = String(count);
  try {
    CacheService.getScriptCache().putAll(items, CACHE_SECONDS);
  } catch (err) {
    console.warn("Cache skipped: " + err);
  }
}

/* ---------- Public content (no sign-in needed) ---------- */

function isLive(story, now) {
  return story.status === "published" && (!story.publishedAt || story.publishedAt <= now);
}

function publicSite() {
  const hit = cacheGet("site");
  if (hit) return hit;
  const now = new Date().toISOString();
  const settings = readSettings();
  const shown = {};
  SETTINGS.forEach(function (def) { if (!def.private) shown[def.key] = settings[def.key]; });
  const data = {
    settings: shown,
    themes: readAll("themes").filter(function (t) { return t.status === "active"; }),
    stories: readAll("stories")
      .filter(function (s) { return isLive(s, now); })
      .map(function (s) {
        const card = Object.assign({}, s, { searchText: plainText(s.blocks).slice(0, 600), readingTime: readingTime(s.blocks) });
        delete card.blocks;
        return card;
      }),
    places: readAll("places").filter(function (p) { return p.status === "published"; }),
    experiences: readAll("experiences").filter(function (x) { return x.status === "published"; }),
  };
  cachePut("site", data);
  return data;
}

function publicStory(slug) {
  const clean = slugify(slug);
  if (!clean) throw fail("No story was asked for.", "NOT_FOUND");
  const hit = cacheGet("story:" + clean);
  if (hit) return hit;
  const now = new Date().toISOString();
  const story = readAll("stories").filter(function (s) { return s.slug === clean && isLive(s, now); })[0];
  if (!story) throw fail("This story doesn't exist or isn't published.", "NOT_FOUND");
  const data = Object.assign({}, story, { readingTime: readingTime(story.blocks) });
  cachePut("story:" + clean, data);
  return data;
}

/* ---------- Dashboard actions (need a sign-in) ---------- */

const ADMIN = {
  bootstrap: function () { return { data: adminData() }; },
  get: function (b) { return { item: findRecord(b.collection, b.id) }; },
  save: function (b) { return withLock(function () { return { item: saveRecord(b.collection, b.data, b.baseUpdatedAt) }; }); },
  remove: function (b) { return withLock(function () { return { item: changeStatus(b.collection, b.id, true) }; }); },
  restore: function (b) { return withLock(function () { return { item: changeStatus(b.collection, b.id, false) }; }); },
  settings: function (b) { return withLock(function () { return { settings: saveSettings(b.values) }; }); },
  folders: function (b) { return withLock(function () { return folderAction(b); }); },
  move: function (b) { return withLock(function () { return moveImages(b.ids, b.folder); }); },
  sign: function (b) { return signUpload(b.folder); },
  status: function () { return statusInfo(); },
  export: function () { return { data: exportAll() }; },
};

function collection(name) {
  if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, name)) throw fail("Unknown section.", "INVALID");
  return name;
}

function byOrder(a, b) {
  return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name || a.title || "").localeCompare(String(b.name || b.title || ""));
}

function byNewest(key) {
  return function (a, b) { return String(b[key] || "").localeCompare(String(a[key] || "")); };
}

function adminData() {
  const settings = readSettings();
  const images = readAll("images").sort(byNewest("createdAt"));
  return {
    settings: settings,
    themes: readAll("themes").sort(byOrder),
    stories: readAll("stories")
      .map(function (s) {
        const copy = Object.assign({}, s, { blockCount: (s.blocks || []).length });
        delete copy.blocks;
        return copy;
      })
      .sort(byNewest("updatedAt")),
    places: readAll("places").sort(byOrder),
    experiences: readAll("experiences").sort(byOrder),
    images: images,
    folders: listFolders(settings, images),
  };
}

function exportAll() {
  return {
    settings: readSettings(),
    themes: readAll("themes"),
    stories: readAll("stories"),
    places: readAll("places"),
    experiences: readAll("experiences"),
    images: readAll("images"),
  };
}

function findRecord(name, id) {
  const item = readAll(collection(name)).filter(function (r) { return r.id === id; })[0];
  if (!item) throw fail("That item no longer exists. It may have been deleted.", "NOT_FOUND");
  return item;
}

function saveRecord(name, input, base) {
  const list = readAll(collection(name));
  const data = input && typeof input === "object" ? input : {};
  const current = data.id ? list.filter(function (r) { return r.id === data.id; })[0] : null;
  if (data.id && !current) throw fail("That item no longer exists. It may have been deleted.", "NOT_FOUND");
  if (current && base && current.updatedAt && base !== current.updatedAt) {
    throw fail("This was changed somewhere else after you opened it. Reload to get the latest version, then make your changes again.", "CONFLICT", { current: current });
  }
  const record = normalize(name, Object.assign({}, current || {}, data));
  record.id = current ? current.id : newId(COLLECTIONS[name].prefix);
  prepare(name, record, current, list);
  writeMany(name, [record]);
  if (name === "images" && current && current.folder !== record.folder) syncAssetFolders([record], record.folder);
  bumpCache();
  return record;
}

function changeStatus(name, id, remove) {
  const current = findRecord(name, id);
  if (remove && name === "themes" && readAll("stories").some(function (s) { return s.theme === current.slug && s.status !== "deleted"; })) {
    throw fail("Some stories still use this theme. Move them to another theme first.", "CONFLICT");
  }
  const record = Object.assign({}, current, { status: remove ? "deleted" : COLLECTIONS[name].restoreTo, updatedAt: new Date().toISOString() });
  writeMany(name, [record]);
  bumpCache();
  return record;
}

function saveSettings(values) {
  const merged = Object.assign(readSettings(), cleanSettings(values || {}));
  writeSettings(merged);
  bumpCache();
  return merged;
}

/* ---------- Media library folders (kept in step with Cloudinary) ---------- */

function inside(folder, parent) {
  return folder === parent || folder.indexOf(parent + "/") === 0;
}

function listFolders(settings, images) {
  const set = {};
  (settings.mediaFolders || []).forEach(function (f) { const c = cleanFolder(f); if (c) set[c] = true; });
  images.forEach(function (im) { if (im.status !== "deleted" && im.folder) set[im.folder] = true; });
  Object.keys(set).forEach(function (f) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i += 1) set[parts.slice(0, i).join("/")] = true;
  });
  return Object.keys(set).sort(function (a, b) { return a.localeCompare(b); });
}

function folderAction(b) {
  const settings = readSettings();
  const images = readAll("images");
  const existing = listFolders(settings, images);
  const saved = settings.mediaFolders || [];
  const at = new Date().toISOString();
  let synced = false;
  if (b.op === "create") {
    const name = cleanFolder(b.name);
    if (!name) throw fail("Use letters, numbers, spaces or dashes for folder names.", "INVALID", { field: "name" });
    if (existing.indexOf(name) !== -1) throw fail("A folder with that name already exists.", "INVALID", { field: "name" });
    settings.mediaFolders = saved.concat([name]);
    synced = cloudApi("post", "/folders/" + urlPath(cloudPath(name)));
  } else if (b.op === "rename") {
    const from = cleanFolder(b.from);
    const to = cleanFolder(b.to);
    if (!from || !to) throw fail("Folder names can't be empty.", "INVALID", { field: "name" });
    if (from !== to) {
      if (existing.indexOf(to) !== -1) throw fail("A folder with that name already exists.", "INVALID", { field: "name" });
      writeMany(
        "images",
        images
          .filter(function (im) { return im.folder && inside(im.folder, from); })
          .map(function (im) { return Object.assign({}, im, { folder: to + im.folder.slice(from.length), updatedAt: at }); })
      );
      settings.mediaFolders = saved.map(function (f) { return inside(f, from) ? to + f.slice(from.length) : f; });
      synced = cloudApi("put", "/folders/" + urlPath(cloudPath(from)), { to_folder: cloudPath(to) });
    }
  } else if (b.op === "delete") {
    const name = cleanFolder(b.name);
    if (images.some(function (im) { return im.status !== "deleted" && im.folder && inside(im.folder, name); })) {
      throw fail("This folder still has photos in it. Move or delete them first.", "CONFLICT");
    }
    settings.mediaFolders = saved.filter(function (f) { return !inside(f, name); });
    synced = cloudApi("delete", "/folders/" + urlPath(cloudPath(name)));
  } else {
    throw fail("Unknown folder action.", "INVALID");
  }
  writeSettings(settings);
  bumpCache();
  return { folders: listFolders(settings, readAll("images")), synced: synced };
}

function moveImages(ids, folder) {
  const target = cleanFolder(folder);
  const wanted = {};
  (Array.isArray(ids) ? ids : []).forEach(function (id) { wanted[id] = true; });
  const at = new Date().toISOString();
  const moved = readAll("images")
    .filter(function (im) { return wanted[im.id]; })
    .map(function (im) { return Object.assign({}, im, { folder: target, updatedAt: at }); });
  writeMany("images", moved);
  const synced = syncAssetFolders(moved, target);
  bumpCache();
  return { images: moved, synced: synced };
}

/* ---------- Cloudinary ---------- */

function cloudinary() {
  const p = props();
  const cloud = String(p.getProperty("CLOUDINARY_CLOUD_NAME") || "").trim();
  const key = String(p.getProperty("CLOUDINARY_API_KEY") || "").trim();
  const secret = String(p.getProperty("CLOUDINARY_API_SECRET") || "").trim();
  return cloud && key && secret ? { cloud: cloud, key: key, secret: secret } : null;
}

// Library folder "Trips/Hampi" lives in Cloudinary as "Sasha Blog/Trips/Hampi".
function cloudPath(folder) {
  const clean = cleanFolder(folder);
  return clean ? CLOUDINARY_ROOT + "/" + clean : CLOUDINARY_ROOT;
}

function urlPath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function cloudAuth(c) {
  return { Authorization: "Basic " + Utilities.base64Encode(c.key + ":" + c.secret) };
}

// Best effort: the sheet is always right, Cloudinary follows when it can (needs Cloudinary's dynamic folders).
function cloudApi(method, path, payload) {
  const c = cloudinary();
  if (!c) return false;
  const options = { method: method, headers: cloudAuth(c), muteHttpExceptions: true };
  if (payload) options.payload = payload;
  try {
    return UrlFetchApp.fetch("https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloud) + path, options).getResponseCode() < 300;
  } catch (err) {
    console.warn("Cloudinary folder update skipped: " + err);
    return false;
  }
}

// Moves uploaded photos to another Cloudinary folder. Their links stay exactly the same.
function syncAssetFolders(images, folder) {
  const c = cloudinary();
  const list = images.filter(function (im) { return im.source === "cloudinary" && im.publicId; });
  if (!c || !list.length) return false;
  const requests = list.map(function (im) {
    return {
      url: "https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloud) + "/resources/image/upload/" + urlPath(im.publicId),
      method: "post",
      headers: cloudAuth(c),
      payload: { asset_folder: cloudPath(folder) },
      muteHttpExceptions: true,
    };
  });
  try {
    return UrlFetchApp.fetchAll(requests).every(function (r) { return r.getResponseCode() < 300; });
  } catch (err) {
    console.warn("Cloudinary move skipped: " + err);
    return false;
  }
}

// The browser uploads the photo straight to Cloudinary with this one-time signature. The secret stays here.
function signUpload(folder) {
  const c = cloudinary();
  if (!c) throw fail("Photo uploads aren't set up yet. Add your Cloudinary details to the script properties, or add photos by link.", "NOT_CONFIGURED");
  const library = cleanFolder(folder);
  const params = { folder: cloudPath(library), timestamp: String(Math.floor(Date.now() / 1000)) };
  const toSign = Object.keys(params).sort().map(function (k) { return k + "=" + params[k]; }).join("&") + c.secret;
  return {
    uploadUrl: "https://api.cloudinary.com/v1_1/" + encodeURIComponent(c.cloud) + "/image/upload",
    apiKey: c.key,
    params: params,
    signature: hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, toSign, Utilities.Charset.UTF_8)),
    folder: library,
  };
}

function statusInfo() {
  const c = cloudinary();
  return {
    content: { ok: true, message: 'Connected to the Google Sheet "' + book().getName() + '".' },
    photos: c
      ? { ok: true, message: "Photo uploads go to Cloudinary (" + c.cloud + "), inside the " + CLOUDINARY_ROOT + " folder." }
      : { ok: false, message: "Photo uploads aren't set up yet, so photos can only be added by link. Add your Cloudinary details to the script properties (assets/setup.txt, step 5)." },
  };
}

/* ---------- Content rules (the same as js/core/schema.js) ---------- */

const LOOKS = {
  journal: ["#a4532f", "#f7f2e8"],
  snow: ["#3d6e98", "#eef3f8"],
  mountain: ["#4e6a5b", "#eef1ec"],
  forest: ["#47773f", "#edf4e9"],
  coast: ["#2b7884", "#ebf4f3"],
  desert: ["#b0612b", "#f8eddd"],
  heritage: ["#93573a", "#f5ece2"],
  blossom: ["#b0546d", "#f9edf0"],
  dusk: ["#74588a", "#f2eef7"],
  spice: ["#a96f1f", "#faf1df"],
};

const READING = { textSize: ["small", "normal", "large", "xlarge"], font: ["modern", "book", "classic"], spacing: ["compact", "comfortable", "airy"] };
const PUBLISH = ["draft", "published", "deleted"];

function str(v) {
  return v === null || v === undefined ? "" : String(v);
}

function slugify(value) {
  return str(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function oneLine(v, max) { return str(v).replace(/\s+/g, " ").trim().slice(0, max || 200); }
function multiLine(v, max) { return str(v).replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max || 5000); }
function bool(v) { return v === true || /^(true|yes|1|on)$/i.test(str(v).trim()); }
function pick(v, allowed, fallback) { return allowed.indexOf(v) !== -1 ? v : fallback; }

function hexColor(v) {
  const s = str(v).trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : "";
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  return isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function coord(v, min, max) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) && n >= min && n <= max ? Math.round(n * 1e6) / 1e6 : null;
}

function day(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const raw = str(v).trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const t = new Date(raw);
  return isNaN(t.getTime()) ? "" : Utilities.formatDate(t, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function month(v) {
  const m = str(v).trim().match(/^(\d{4})-(\d{2})/);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? m[1] + "-" + m[2] : "";
}

function stamp(v) {
  if (v instanceof Date) return v.toISOString();
  const raw = str(v).trim();
  if (!raw) return "";
  const t = new Date(raw);
  return isNaN(t.getTime()) ? "" : t.toISOString();
}

function tagList(v) {
  const list = Array.isArray(v) ? v : str(v).split(",");
  const seen = {};
  return list
    .map(function (t) { return oneLine(t, 40).toLowerCase(); })
    .filter(function (t) { if (!t || seen[t]) return false; seen[t] = true; return true; })
    .slice(0, 12);
}

function plainText(blocks) {
  const out = [];
  (Array.isArray(blocks) ? blocks : []).forEach(function (b) {
    if (!b) return;
    if (b.title) out.push(b.title);
    if (b.text) out.push(b.text);
    if (Array.isArray(b.items)) out.push(b.items.join(" "));
    if (b.caption) out.push(b.caption);
  });
  return out.join(" ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`>#]/g, "").replace(/\s+/g, " ").trim();
}

function readingTime(blocks) {
  return Math.max(1, Math.round(plainText(blocks).split(" ").filter(Boolean).length / 200));
}

// Only https links, without spaces or quotes.
function cleanUrl(v) {
  const raw = str(v).trim();
  return raw.length <= 2000 && /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s"'<>]*)?$/i.test(raw) ? raw : "";
}

function urlField(x, key, message) {
  const raw = str(x[key]).trim();
  const url = cleanUrl(raw);
  if (raw && !url) throw fail(message || "Photo links must start with https://", "INVALID", { field: key });
  return url;
}

function cleanFolder(v) {
  return str(v)
    .split("/")
    .map(function (part) { return part.replace(/[^\p{L}\p{N} _-]/gu, "").replace(/\s+/g, " ").trim(); })
    .filter(Boolean)
    .slice(0, 3)
    .join("/")
    .slice(0, 80);
}

function cleanBlock(b) {
  if (!b || typeof b !== "object") return null;
  switch (b.type) {
    case "paragraph": {
      const text = multiLine(b.text, 6000);
      if (!text) return null;
      const p = { type: "paragraph", text: text };
      if (b.size === "large" || b.size === "small") p.size = b.size;
      if (READING.font.indexOf(b.font) !== -1) p.font = b.font;
      return p;
    }
    case "heading": { const text = oneLine(b.text, 160); return text ? { type: "heading", text: text, level: Number(b.level) === 3 ? 3 : 2 } : null; }
    case "image": {
      const url = cleanUrl(b.url);
      return url ? { type: "image", url: url, alt: oneLine(b.alt, 200), caption: oneLine(b.caption, 300), size: pick(b.size, ["normal", "wide", "full"], "normal") } : null;
    }
    case "gallery": {
      const images = (Array.isArray(b.images) ? b.images : [])
        .map(function (i) { return { url: cleanUrl(i && i.url), alt: oneLine(i && i.alt, 200), caption: oneLine(i && i.caption, 300) }; })
        .filter(function (i) { return i.url; })
        .slice(0, 24);
      return images.length ? { type: "gallery", images: images, caption: oneLine(b.caption, 300) } : null;
    }
    case "quote": { const text = multiLine(b.text, 1000); return text ? { type: "quote", text: text, cite: oneLine(b.cite, 120) } : null; }
    case "tip": { const text = multiLine(b.text, 2000); return text ? { type: "tip", title: oneLine(b.title, 80) || "Travel note", text: text } : null; }
    case "list": {
      const items = (Array.isArray(b.items) ? b.items : str(b.items).split("\n")).map(function (i) { return oneLine(i, 400); }).filter(Boolean).slice(0, 60);
      return items.length ? { type: "list", style: b.style === "number" ? "number" : "bullet", items: items } : null;
    }
    case "divider": return { type: "divider" };
    case "map": {
      const lat = coord(b.lat, -90, 90);
      const lng = coord(b.lng, -180, 180);
      return lat !== null && lng !== null ? { type: "map", lat: lat, lng: lng, label: oneLine(b.label, 120), zoom: clampInt(b.zoom, 3, 18, 12) } : null;
    }
    default: return null;
  }
}

function cleanBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, 250).map(cleanBlock).filter(Boolean);
}

const NORMALIZE = {
  stories: function (x) {
    const r = {
      slug: slugify(x.slug), title: oneLine(x.title, 140), subtitle: oneLine(x.subtitle, 200), excerpt: multiLine(x.excerpt, 400),
      coverImage: urlField(x, "coverImage", "The cover photo link must start with https://"), coverAlt: oneLine(x.coverAlt, 200),
      location: oneLine(x.location, 120), placeId: oneLine(x.placeId, 60), theme: slugify(x.theme), tags: tagList(x.tags),
      tripStart: day(x.tripStart), tripEnd: day(x.tripEnd),
      textSize: pick(x.textSize, READING.textSize, "normal"), font: pick(x.font, READING.font, "modern"), spacing: pick(x.spacing, READING.spacing, "comfortable"),
      featured: bool(x.featured), status: pick(x.status, PUBLISH, "draft"), publishedAt: stamp(x.publishedAt), blocks: cleanBlocks(x.blocks),
    };
    if (!r.title) throw fail("Give the story a title.", "INVALID", { field: "title" });
    if (r.tripStart && r.tripEnd && r.tripEnd < r.tripStart) throw fail("The trip can't end before it starts.", "INVALID", { field: "tripEnd" });
    if (r.status === "published" && !r.coverImage) throw fail("Add a cover photo before publishing.", "INVALID", { field: "coverImage" });
    if (JSON.stringify(r.blocks).length > 48000) throw fail("This story is too long for one Google Sheets cell (about 50,000 characters). Split it into two stories.", "INVALID", { field: "blocks" });
    return r;
  },
  places: function (x) {
    const r = {
      slug: slugify(x.slug), name: oneLine(x.name, 120), region: oneLine(x.region, 80), country: oneLine(x.country, 60) || "India",
      summary: multiLine(x.summary, 400), description: multiLine(x.description, 6000),
      coverImage: urlField(x, "coverImage", "The cover photo link must start with https://"), coverAlt: oneLine(x.coverAlt, 200),
      lat: coord(x.lat, -90, 90), lng: coord(x.lng, -180, 180), bestTime: oneLine(x.bestTime, 80), visitedOn: month(x.visitedOn),
      tags: tagList(x.tags), featured: bool(x.featured), status: pick(x.status, PUBLISH, "draft"), sortOrder: clampInt(x.sortOrder, 0, 9999, 0),
    };
    if (!r.name) throw fail("Give the place a name.", "INVALID", { field: "name" });
    if ((r.lat === null) !== (r.lng === null)) throw fail("Add both latitude and longitude, or leave both empty.", "INVALID", { field: "lat" });
    return r;
  },
  experiences: function (x) {
    const r = {
      slug: slugify(x.slug), title: oneLine(x.title, 140), kind: oneLine(x.kind, 40), placeId: oneLine(x.placeId, 60), summary: multiLine(x.summary, 400),
      image: urlField(x, "image", "The photo link must start with https://"), imageAlt: oneLine(x.imageAlt, 200), date: day(x.date),
      rating: clampInt(x.rating, 0, 5, 0), duration: oneLine(x.duration, 60), cost: oneLine(x.cost, 40), storySlug: slugify(x.storySlug),
      link: urlField(x, "link", "The link must start with https://"), featured: bool(x.featured), status: pick(x.status, PUBLISH, "draft"),
      sortOrder: clampInt(x.sortOrder, 0, 9999, 0),
    };
    if (!r.title) throw fail("Give the experience a title.", "INVALID", { field: "title" });
    return r;
  },
  themes: function (x) {
    const look = pick(x.look, Object.keys(LOOKS), "journal");
    const r = {
      slug: slugify(x.slug), name: oneLine(x.name, 60), description: multiLine(x.description, 300), look: look,
      accent: hexColor(x.accent) || LOOKS[look][0], tint: hexColor(x.tint) || LOOKS[look][1],
      sortOrder: clampInt(x.sortOrder, 0, 9999, 0), status: pick(x.status, ["active", "hidden", "deleted"], "active"),
    };
    if (!r.name) throw fail("Give the theme a name.", "INVALID", { field: "name" });
    return r;
  },
  images: function (x) {
    const url = urlField(x, "url", "Add a photo link that starts with https://");
    if (!url) throw fail("Add a photo link that starts with https://", "INVALID", { field: "url" });
    const guess = /^https:\/\/res\.cloudinary\.com\//i.test(url) ? "cloudinary" : /^https:\/\/images\.unsplash\.com\//i.test(url) ? "unsplash" : "link";
    return {
      url: url, publicId: oneLine(x.publicId, 200), folder: cleanFolder(x.folder), alt: oneLine(x.alt, 200), caption: multiLine(x.caption, 400),
      credit: oneLine(x.credit, 120), width: clampInt(x.width, 0, 100000, 0), height: clampInt(x.height, 0, 100000, 0),
      bytes: clampInt(x.bytes, 0, 10000000000, 0), source: pick(x.source, ["cloudinary", "unsplash", "link"], guess),
      status: pick(x.status, ["active", "deleted"], "active"),
    };
  },
};

function normalize(name, input) {
  return NORMALIZE[collection(name)](input || {});
}

function newId(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function uniqueSlug(base, list, selfId) {
  const root = slugify(base) || "untitled";
  const taken = {};
  (list || []).forEach(function (r) { if (r.id !== selfId) taken[r.slug] = true; });
  let slug = root;
  for (let n = 2; taken[slug]; n += 1) slug = root + "-" + n;
  return slug;
}

// Theme slugs never change once made, because stories point at them.
function prepare(name, record, current, list) {
  const at = new Date().toISOString();
  const def = COLLECTIONS[name];
  record.createdAt = (current && current.createdAt) || at;
  record.updatedAt = at;
  if (def.slugFrom) record.slug = name === "themes" && current ? current.slug : uniqueSlug(record.slug || record[def.slugFrom], list, record.id);
  if (name === "stories" && record.status === "published" && !record.publishedAt) record.publishedAt = at;
  return record;
}

function cleanSettings(values) {
  const out = {};
  SETTINGS.forEach(function (def) {
    if (def.private || !Object.prototype.hasOwnProperty.call(values, def.key)) return;
    const raw = values[def.key];
    if (def.type === "image" || def.type === "url") {
      const text = str(raw).trim();
      const url = cleanUrl(text);
      if (text && !url) throw fail(def.label + ": the link must start with https://", "INVALID", { field: def.key });
      out[def.key] = url;
    } else if (def.type === "email") {
      const email = oneLine(raw, 120);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail("That email address doesn't look right.", "INVALID", { field: def.key });
      out[def.key] = email;
    } else if (def.type === "text") {
      out[def.key] = multiLine(raw, def.max || 2000);
    } else {
      out[def.key] = oneLine(raw, def.max || 200);
    }
  });
  if (Object.prototype.hasOwnProperty.call(out, "siteTitle") && !out.siteTitle) throw fail("The blog needs a title.", "INVALID", { field: "siteTitle" });
  return out;
}
