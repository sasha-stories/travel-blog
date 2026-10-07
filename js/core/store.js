// Sasha Travel Stories: the data store (SASHA.store). Pages and the dashboard only talk to this file; it talks to the bridge and to Cloudinary.
(function () {
  "use strict";
  const SASHA = (window.SASHA = window.SASHA || {});
  const CFG = window.SASHA_CONFIG || {};
  const U = SASHA.util;
  const S = SASHA.schema;
  const C = SASHA.content;
  const api = SASHA.api;

  const KEYS = { site: "sasha.site.v1", session: "sasha.session.v1", story: "sasha.story." };
  const fail = (message, code, extra) => new api.ApiError(message, Object.assign({ code }, extra || {}));
  const cacheMs = () => Math.max(0, Number(CFG.cacheMinutes ?? 5)) * 60000;

  // Saved copies only make pages faster, so a full or blocked browser storage is fine.
  function keep(area, key, value) {
    try {
      area.set(key, value);
    } catch (e) {
      console.warn("[Sasha] Couldn't save a copy:", e.message);
    }
  }

  /* ---------- Public pages ---------- */

  let siteMemo = null;
  let siteFetch = null;

  function fetchSite() {
    if (!siteFetch) {
      siteFetch = api
        .get("site")
        .then((res) => {
          const entry = { at: Date.now(), raw: res.data || {} };
          siteMemo = entry;
          keep(U.storage, KEYS.site, entry);
          return entry.raw;
        })
        .finally(() => {
          siteFetch = null;
        });
    }
    return siteFetch;
  }

  // Answers from the saved copy at once; when it's older than cacheMinutes, checks the bridge in the background and calls opts.onUpdate if anything changed.
  async function getSite(opts = {}) {
    const saved = siteMemo || U.storage.get(KEYS.site);
    if (saved && saved.raw && !opts.force) {
      siteMemo = saved;
      if (Date.now() - (saved.at || 0) > cacheMs()) {
        fetchSite()
          .then((raw) => {
            if (opts.onUpdate && JSON.stringify(raw) !== JSON.stringify(saved.raw)) opts.onUpdate(C.site(raw));
          })
          .catch((err) => console.warn("[Sasha] Showing the saved copy:", err.message));
      }
      return C.site(saved.raw);
    }
    try {
      return C.site(await fetchSite());
    } catch (err) {
      if (saved && saved.raw) return C.site(saved.raw);
      throw err;
    }
  }

  async function storyRecord(slug) {
    const key = KEYS.story + slug;
    let entry = U.session.get(key);
    if (entry && Date.now() - (entry.at || 0) <= cacheMs()) return entry.record;
    try {
      const res = await api.get("story", { slug });
      entry = { at: Date.now(), record: res.data };
      keep(U.session, key, entry);
      return entry.record;
    } catch (err) {
      if (err.code === "NOT_FOUND") return null;
      if (entry) return entry.record;
      throw err;
    }
  }

  // Resolves to the story page data (SASHA.content.story), or null when there is no such live story.
  async function getStory(slug) {
    const clean = U.slugify(slug);
    if (!clean) return null;
    const [siteModel, record] = await Promise.all([getSite(), storyRecord(clean)]);
    if (!record) return null;
    const model = C.story(siteModel, record);
    // A story published moments ago may be missing from the saved copy of the site.
    if (!model && C.isLive(record)) return C.story(await getSite({ force: true }), record);
    return model;
  }

  function clearCaches() {
    siteMemo = null;
    U.storage.remove(KEYS.site);
    U.session
      .keys()
      .filter((key) => key && key.indexOf(KEYS.story) === 0)
      .forEach((key) => U.session.remove(key));
  }

  // Calls fn when the dashboard saves something in another tab of this browser, so open pages refresh themselves.
  function onChange(fn) {
    const onStorage = (e) => {
      if (e.key !== null && !(e.key === KEYS.site && e.newValue === null)) return;
      clearCaches();
      fn();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  /* ---------- Dashboard sign-in ---------- */

  const session = {
    get() {
      const s = U.storage.get(KEYS.session);
      return s && s.token && s.exp > Date.now() ? s : null;
    },
    set(value) {
      try {
        U.storage.set(KEYS.session, value);
      } catch (e) {
        throw fail("This browser blocked saving your sign-in. Private browsing may be on.", "STORAGE_BLOCKED");
      }
    },
    clear() {
      U.storage.remove(KEYS.session);
    },
  };

  async function signIn(password) {
    const pw = String(password || "");
    if (!pw) throw fail("Enter your password.", "INVALID", { field: "password" });
    const res = await api.post("login", { password: pw });
    session.set({ token: res.token, exp: Number(res.expiresAt) || Date.now() + 7 * 86400000 });
  }

  async function call(action, payload) {
    const s = session.get();
    if (!s) throw fail("Your session has ended. Please sign in again.", "UNAUTHORIZED");
    try {
      return await api.post(action, Object.assign({ token: s.token }, payload || {}));
    } catch (err) {
      if (err.code === "UNAUTHORIZED") session.clear();
      throw err;
    }
  }

  // Every change empties the saved copies, so the site, and other open tabs, fetch fresh content.
  const written = (pick) => (res) => {
    clearCaches();
    return pick(res);
  };

  const save = (col, data, baseUpdatedAt) => call("save", { collection: col, data, baseUpdatedAt: baseUpdatedAt || "" }).then(written((r) => r.item));

  /* ---------- Photo uploads ---------- */

  function sendToCloudinary(url, form, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.timeout = 180000;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      };
      xhr.onload = () => {
        let body = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch (e) {
          body = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.secure_url) {
          if (onProgress) onProgress(100);
          resolve(body);
        } else {
          const why = body && body.error && body.error.message ? `: ${body.error.message}` : "";
          reject(fail(`The photo upload failed${why}. Please try again.`, "UPLOAD"));
        }
      };
      xhr.onerror = () => reject(fail("The photo upload failed. Check your internet connection and try again.", "NETWORK"));
      xhr.ontimeout = () => reject(fail("The photo upload took too long. Please try again.", "TIMEOUT"));
      xhr.send(form);
    });
  }

  const PHOTO_NAME = /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i;

  // Asks the bridge to sign the upload, makes a big photo smaller, sends it straight to Cloudinary and saves its Media row.
  async function upload(file, opts = {}) {
    const isPhoto = file && (/^image\//.test(file.type || "") || PHOTO_NAME.test(file.name || ""));
    if (!isPhoto) throw fail("Please choose a photo (JPG, PNG, WebP or HEIC).", "INVALID");
    if (file.size > 25 * 1024 * 1024) throw fail("That photo is larger than 25 MB. Please choose a smaller one.", "INVALID");
    const sig = await call("sign", { folder: S.cleanFolder(opts.folder) });
    const prepared = await SASHA.img.shrink(file, { max: 2400, quality: 0.88 });
    const form = new FormData();
    form.append("file", prepared.blob, prepared.name);
    form.append("api_key", sig.apiKey);
    form.append("signature", sig.signature);
    Object.keys(sig.params || {}).forEach((key) => form.append(key, sig.params[key]));
    const result = await sendToCloudinary(sig.uploadUrl, form, opts.onProgress);
    return save("images", {
      url: result.secure_url,
      publicId: result.public_id,
      folder: sig.folder || "",
      alt: opts.alt || "",
      caption: opts.caption || "",
      source: "cloudinary",
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    });
  }

  /* ---------- Finding places on the map ---------- */

  // Looks a place up with OpenStreetMap's free search (Nominatim) and resolves to up to five matches.
  async function geocode(text) {
    const q = U.oneLine(text, 200);
    if (!q) throw fail("Type the place's name first.", "INVALID", { field: "name" });
    const params = new URLSearchParams({ format: "jsonv2", limit: "5", "accept-language": "en", q });
    let list;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
      if (!res.ok) throw new Error(String(res.status));
      list = await res.json();
    } catch (err) {
      throw fail("OpenStreetMap's search couldn't be reached. Please try again in a minute.", "NETWORK");
    }
    return (Array.isArray(list) ? list : [])
      .map((r) => ({
        name: r.name || String(r.display_name || "").split(",")[0],
        label: String(r.display_name || ""),
        lat: U.coord(r.lat, -90, 90),
        lng: U.coord(r.lon, -180, 180),
      }))
      .filter((r) => r.lat !== null && r.lng !== null);
  }

  const admin = {
    isSignedIn: () => Boolean(session.get()),
    signIn,
    signOut: () => session.clear(),
    bootstrap: () => call("bootstrap").then((r) => r.data),
    get: (col, id) => call("get", { collection: col, id }).then((r) => r.item),
    save,
    remove: (col, id) => call("remove", { collection: col, id }).then(written((r) => r.item)),
    restore: (col, id) => call("restore", { collection: col, id }).then(written((r) => r.item)),
    saveSettings: (values) => call("settings", { values }).then(written((r) => r.settings)),
    // op is "create" { name }, "rename" { from, to } or "delete" { name }; resolves to { folders, synced }.
    folders: (op, args) => call("folders", Object.assign({ op }, args || {})).then(written((r) => ({ folders: r.folders || [], synced: Boolean(r.synced) }))),
    // Resolves to { images, synced }; synced is false when Cloudinary didn't follow the move.
    moveImages: (ids, folder) => call("move", { ids, folder }).then(written((r) => ({ images: r.images || [], synced: Boolean(r.synced) }))),
    status: () => call("status"),
    exportAll: () => call("export").then((r) => r.data),
    upload,
    geocode,
  };

  SASHA.store = { getSite, getStory, onChange, clearCaches, admin };
})();
