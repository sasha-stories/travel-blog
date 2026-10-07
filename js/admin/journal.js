// Sasha Travel Stories: the Journal in the dashboard. #/journal lists the stories; #/journal/new and #/journal/<id> open the editor.
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const A = SASHA.admin;
  const U = SASHA.util;
  const S = SASHA.schema;
  const C = SASHA.content;
  const esc = U.esc;
  const icon = SASHA.icon;

  const BLOCKS = {
    paragraph: { label: "Paragraph", icon: "pilcrow", make: () => ({ type: "paragraph", text: "" }) },
    heading: { label: "Heading", icon: "heading", make: () => ({ type: "heading", text: "", level: 2 }) },
    image: { label: "Photo", icon: "image", make: () => ({ type: "image", url: "", alt: "", caption: "", size: "normal" }) },
    gallery: { label: "Gallery", icon: "images", make: () => ({ type: "gallery", images: [], caption: "" }) },
    quote: { label: "Quote", icon: "quote", make: () => ({ type: "quote", text: "", cite: "" }) },
    tip: { label: "Travel tip", icon: "lightbulb", make: () => ({ type: "tip", title: "Travel note", text: "" }) },
    list: { label: "List", icon: "list", make: () => ({ type: "list", style: "bullet", items: [] }) },
    divider: { label: "Divider", icon: "divider", make: () => ({ type: "divider" }) },
    map: { label: "Map", icon: "map", make: () => ({ type: "map", lat: "", lng: "", label: "", zoom: 12 }) },
  };
  const PARAGRAPH_SIZES = [
    ["", "Normal size"],
    ["large", "Larger"],
    ["small", "Smaller"],
  ];
  const PARAGRAPH_FONTS = [["", "Story font"]].concat(S.READING.font.options.map(([value, label]) => [value, label.split(" ")[0]]));
  const READING_KEYS = Object.keys(S.READING);
  const sizeClass = (size) => (size === "large" ? "p-large" : size === "small" ? "p-small" : "");
  // Paragraph boxes show their own size and font, so the editor reads like the story.
  const paragraphLook = (b) => [sizeClass(b.size), b.font ? `pf-${b.font}` : ""].filter(Boolean).join(" ");
  const draftKey = (s) => `sasha.draft.${s.id || "new"}`;

  /* ---------- List ---------- */

  const TABS = [
    ["all", "All"],
    ["published", "Published"],
    ["scheduled", "Scheduled"],
    ["drafts", "Drafts"],
    ["bin", "Bin"],
  ];

  function inTab(s, tab) {
    if (tab === "bin") return s.status === "deleted";
    if (s.status === "deleted") return false;
    const state = A.storyState(s);
    if (tab === "published") return state === "published";
    if (tab === "scheduled") return state === "scheduled";
    if (tab === "drafts") return state === "draft";
    return true;
  }

  function row(s) {
    const state = A.storyState(s);
    const theme = A.themeOf(s.theme);
    const actions =
      s.status === "deleted"
        ? `<button class="icon-btn" type="button" data-restore="${esc(s.id)}" aria-label="Restore" title="Restore">${icon("rotate-ccw", { size: 18 })}</button>`
        : `<a class="icon-btn" href="#/journal/${esc(s.id)}" aria-label="Edit" title="Edit">${icon("pencil", { size: 18 })}</a>` +
          (state === "published" ? `<a class="icon-btn" href="${esc(C.links.story(s.slug))}" target="_blank" rel="noopener" aria-label="View on the blog" title="View on the blog">${icon("eye", { size: 18 })}</a>` : "") +
          `<button class="icon-btn" type="button" data-delete="${esc(s.id)}" aria-label="Move to the bin" title="Move to the bin">${icon("trash-2", { size: 18 })}</button>`;
    const meta = [
      A.badge(state),
      s.featured ? '<span class="badge badge-featured">Featured</span>' : "",
      theme ? `<span class="row-tone" style="--tone:${esc(C.themeCard(theme).accent)}">${esc(theme.name)}</span>` : "",
      s.location ? `<span>${esc(s.location)}</span>` : "",
      `<span>Edited ${esc(U.relativeTime(s.updatedAt))}</span>`,
    ].join("");
    return `<div class="row">${A.thumb(s.coverImage)}<div class="row-main"><a class="row-title" href="#/journal/${esc(s.id)}">${esc(s.title || "Untitled")}</a><div class="row-meta">${meta}</div></div><div class="row-actions">${actions}</div></div>`;
  }

  function listView(view, route) {
    let tab = TABS.some(([id]) => id === route.query.get("tab")) ? route.query.get("tab") : "all";
    let q = "";
    let theme = "";
    const themes = A.alive(A.data.themes);
    view.innerHTML =
      A.head({ title: "Journal", sub: "Write, edit and publish your stories.", actions: `<a class="btn btn-primary" href="#/journal/new">${icon("plus", { size: 18 })}New story</a>` }) +
      `<div class="list-toolbar">
        <div data-tabs></div>
        <div class="inline-list">
          <label class="search-input">${icon("search", { size: 16 })}<input class="input" type="search" placeholder="Search stories" data-q aria-label="Search stories"></label>
          ${themes.length ? `<span class="select"><select data-theme aria-label="Theme"><option value="">All themes</option>${themes.map((t) => `<option value="${esc(t.slug)}">${esc(t.name)}</option>`).join("")}</select></span>` : ""}
        </div>
      </div>
      <div class="card list" data-list></div>`;

    const draw = () => {
      view.querySelector("[data-tabs]").innerHTML = A.tabs(TABS.map(([id, label]) => ({ id, label, count: A.data.stories.filter((s) => inTab(s, id)).length })), tab);
      let list = A.data.stories.filter((s) => inTab(s, tab));
      if (theme) list = list.filter((s) => s.theme === theme);
      if (q) {
        const n = A.norm(q);
        list = list.filter((s) => A.norm(`${s.title} ${s.subtitle} ${s.location} ${(s.tags || []).join(" ")}`).includes(n));
      }
      view.querySelector("[data-list]").innerHTML = list.length
        ? list.map(row).join("")
        : A.empty({
            icon: tab === "bin" ? "trash-2" : "feather",
            title: tab === "bin" ? "The bin is empty" : q || theme ? "No stories match" : "Nothing here yet",
            action: tab === "bin" || q || theme ? "" : '<a class="btn btn-primary" href="#/journal/new">Write a story</a>',
          });
    };
    draw();

    view.addEventListener("click", async (e) => {
      const t = e.target.closest("[data-tab], [data-delete], [data-restore]");
      if (!t) return;
      if (t.dataset.tab) {
        tab = t.dataset.tab;
        draw();
        return;
      }
      const id = t.dataset.delete || t.dataset.restore;
      const s = A.data.stories.find((x) => x.id === id);
      if (!s) return;
      try {
        if (t.dataset.delete) {
          const ok = await A.confirm({ title: "Move to the bin?", text: `"${s.title}" will disappear from the blog. You can restore it from the Bin.`, confirmLabel: "Move to bin", danger: true });
          if (!ok) return;
          await A.remove("stories", id);
          A.toast("Moved to the bin");
        } else {
          await A.restore("stories", id);
          A.toast("Restored as a draft");
        }
        draw();
      } catch (err) {
        A.fail(err);
      }
    });
    view.querySelector("[data-q]").addEventListener(
      "input",
      U.debounce((e) => {
        q = e.target.value.trim();
        draw();
      }, 150)
    );
    const themeSelect = view.querySelector("[data-theme]");
    if (themeSelect) {
      themeSelect.addEventListener("change", (e) => {
        theme = e.target.value;
        draw();
      });
    }
  }

  /* ---------- Editor ---------- */

  function newStory() {
    return {
      id: "",
      slug: "",
      title: "",
      subtitle: "",
      excerpt: "",
      coverImage: "",
      coverAlt: "",
      location: "",
      placeId: "",
      theme: "",
      tags: [],
      tripStart: "",
      tripEnd: "",
      textSize: S.READING.textSize.fallback,
      font: S.READING.font.fallback,
      spacing: S.READING.spacing.fallback,
      publishedAt: "",
      featured: false,
      status: "draft",
      blocks: [BLOCKS.paragraph.make()],
    };
  }

  function draftNotice(draft, base) {
    const older = draft.base && draft.base !== base;
    return `<div class="notice notice-info draft-notice" data-draft>${icon("history", { size: 18 })}<span>Unsaved changes from ${esc(U.relativeTime(draft.at))} were kept in this browser${older ? ", before this story last changed elsewhere" : ""}.</span><span class="inline-list"><button class="btn btn-light btn-sm" type="button" data-restore-draft>Restore them</button><button class="btn btn-ghost btn-sm" type="button" data-discard-draft>Discard</button></span></div>`;
  }

  async function editorView(view, route) {
    view.innerHTML = '<div class="boot is-inline">Opening the story&hellip;</div>';
    let story;
    try {
      story = route.id === "new" ? newStory() : await A.api.get("stories", route.id);
    } catch (err) {
      A.fail(err);
      view.innerHTML = A.head({ title: "Story not found", back: "#/journal", backLabel: "Journal" });
      return;
    }
    if (!view.isConnected) return;
    const st = { story, blocks: U.clone(story.blocks || []), base: story.updatedAt || "", save: null, draft: U.storage.get(draftKey(story)) };
    // One shortcut per editor page: Ctrl+S (or Cmd+S) saves.
    const onKey = (e) => {
      if (!view.isConnected) {
        document.removeEventListener("keydown", onKey);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (st.save) st.save();
      }
    };
    document.addEventListener("keydown", onKey);
    renderEditor(view, st);
  }

  function renderEditor(view, st) {
    const s = st.story;
    const isNew = !s.id;
    const d = A.data;
    const state = isNew ? "draft" : A.storyState(s);
    const reading = S.readingStyle(s);
    const placeOptions = [["", "No place"]].concat(A.alive(d.places).map((p) => [p.id, p.name]));
    const themeOptions = [["", "No theme: the site's own colours"]].concat(A.alive(d.themes).map((t) => [t.slug, t.status === "hidden" ? `${t.name} (hidden)` : t.name]));
    const readingSelect = (key) => A.f.select({ name: key, label: S.READING[key].label, value: reading[key], options: S.READING[key].options });
    const savedText = isNew ? "Not saved yet" : "All changes saved";

    view.innerHTML =
      A.head({ title: isNew ? "New story" : "Edit story", back: "#/journal", backLabel: "Journal" }) +
      `<form class="editor" data-editor novalidate>
        <div class="stack">
          ${st.draft ? draftNotice(st.draft, st.base) : ""}
          <div class="card card-body">
            <input class="title-input" name="title" placeholder="Story title" value="${esc(s.title)}" maxlength="140" aria-label="Title">
            <input class="subtitle-input" name="subtitle" placeholder="A short subtitle (optional)" value="${esc(s.subtitle)}" maxlength="200" aria-label="Subtitle">
            ${A.f.textarea({ name: "excerpt", label: "Summary", value: s.excerpt, rows: 3, max: 400, help: "Shown on story cards and in search results." })}
          </div>
          <div>
            <div class="blocks" data-blocks></div>
            <div class="add-block"><span class="add-label">Add to the story</span>${Object.entries(BLOCKS)
              .map(([type, b]) => `<button class="btn btn-light" type="button" data-add="${type}">${icon(b.icon, { size: 16 })}${esc(b.label)}</button>`)
              .join("")}</div>
            <p class="format-hint">In paragraphs, lists, tips and quotes you can use <code>**bold**</code>, <code>*italic*</code> and <code>[link text](https://...)</code>.</p>
          </div>
        </div>
        <aside class="editor-aside">
          <div class="card">
            <div class="card-head"><h2 class="card-title">Publish</h2><span class="save-state" data-saved="${savedText}">${savedText}</span></div>
            <div class="card-body">
              ${A.f.select({ name: "status", label: "Status", value: s.status === "published" ? "published" : "draft", options: [["draft", "Draft: only you can see it"], ["published", "Published"]] })}
              ${A.f.text({ name: "publishedAt", label: "Publish date", type: "datetime-local", value: A.localInput(s.publishedAt), help: "Leave empty to use the moment you publish. A future date schedules the story." })}
              ${A.f.toggle({ name: "featured", label: "Feature on the home page", checked: s.featured })}
              <p class="editor-stats" data-stats></p>
              <div class="inline-list">
                <button class="btn btn-primary" type="submit" data-busy="Saving...">${icon("save", { size: 18 })}Save</button>
                ${state === "published" ? `<a class="btn btn-light" href="${esc(C.links.story(s.slug))}" target="_blank" rel="noopener">${icon("eye", { size: 18 })}View</a>` : ""}
                ${!isNew && s.status !== "deleted" ? `<button class="btn btn-ghost" type="button" data-delete-story>${icon("trash-2", { size: 16 })}Delete</button>` : ""}
              </div>
              ${s.status === "deleted" ? `<p class="notice notice-warn">${icon("info", { size: 16 })}<span>This story is in the bin. Saving it brings it back.</span></p>` : '<p class="help">Tip: press Ctrl+S to save.</p>'}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Look and feel</h2></div>
            <div class="card-body">
              ${A.f.select({ name: "theme", label: "Theme", value: s.theme, options: themeOptions, help: 'The colours of this story\'s page. Themes are made in <a href="#/themes">Themes</a>.' })}
              ${READING_KEYS.map(readingSelect).join("")}
              <div class="reading-preview" data-preview>
                <p class="rp-title">How this story reads</p>
                <p>The trail climbed through pine forest, and every bend opened onto another valley. We stopped for chai at a tin-roofed stall and watched the clouds roll in.</p>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Cover photo</h2></div>
            <div class="card-body">
              ${A.f.image({ name: "coverImage", label: "Photo", value: s.coverImage, alt: "coverAlt", wide: true, help: "Needed before publishing. Landscape photos work best." })}
              ${A.f.text({ name: "coverAlt", label: "Describe the photo", value: s.coverAlt, max: 200, help: "Read aloud to people using screen readers." })}
            </div>
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Details</h2></div>
            <div class="card-body">
              ${A.f.select({ name: "placeId", label: "Place", value: s.placeId, options: placeOptions })}
              ${A.f.text({ name: "location", label: "Location shown on the story", value: s.location, max: 120, placeholder: "e.g. Hampta Pass, Himachal Pradesh" })}
              ${A.f.text({ name: "tags", label: "Tags", value: (s.tags || []).join(", "), help: "Separate with commas, e.g. trekking, snow." })}
              <div class="form-grid">${A.f.text({ name: "tripStart", label: "Trip started", type: "date", value: s.tripStart })}${A.f.text({ name: "tripEnd", label: "Trip ended", type: "date", value: s.tripEnd })}</div>
              ${A.f.slug({ value: s.slug, from: "title", page: "story.html?slug=", example: "hampta-pass-in-the-snow" })}
            </div>
          </div>
        </aside>
      </form>`;

    const form = view.querySelector("[data-editor]");
    const list = form.querySelector("[data-blocks]");
    const preview = form.querySelector("[data-preview]");
    const stats = form.querySelector("[data-stats]");

    // Keeps a copy of unsaved work in this browser, so a closed tab or a dropped connection never loses a story.
    const keepDraft = U.debounce(() => {
      if (!A.dirty || !form.isConnected) return;
      try {
        U.storage.set(draftKey(st.story), { at: Date.now(), base: st.base, form: A.readForm(form), blocks: st.blocks });
      } catch (e) {
        console.warn("[Sasha] Couldn't keep a copy of the draft:", e.message);
      }
    }, 800);

    function updateStats() {
      const words = U.plainText(st.blocks).split(" ").filter(Boolean).length;
      stats.innerHTML = `<span>${icon("file-text", { size: 15 })}${words.toLocaleString()} ${words === 1 ? "word" : "words"}</span><span>${icon("clock", { size: 15 })}${U.readingTime(st.blocks)} min read</span>`;
    }

    const dirty = () => {
      A.setDirty(true);
      updateStats();
      keepDraft();
    };
    updateStats();

    // Shows the chosen theme and reading style on a sample paragraph, and writes the blocks below in the story's font.
    function updatePreview() {
      const theme = A.themeOf(form.elements.theme.value);
      const vars = theme ? C.themeVars(theme) : null;
      const style = {};
      READING_KEYS.forEach((key) => {
        style[key] = form.elements[key].value;
      });
      preview.className = `reading-preview ${C.readingClass(style)}`;
      preview.style.setProperty("--rp-bg", vars ? vars["--paper"] : "");
      preview.style.setProperty("--rp-accent", vars ? vars["--accent"] : "");
      list.className = `blocks sf-${style.font}`;
    }
    updatePreview();

    /* ----- Blocks ----- */

    const inp = (i, key, value, o) => {
      const x = o || {};
      return `<input class="input" data-b="${i}" data-k="${key}" value="${esc(value === undefined || value === null ? "" : value)}"${x.type ? ` type="${x.type}"` : ""}${x.step ? ` step="${x.step}"` : ""}${x.placeholder ? ` placeholder="${esc(x.placeholder)}"` : ""} aria-label="${esc(x.label || key)}">`;
    };
    const area = (i, key, value, o) => {
      const x = o || {};
      return `<textarea class="textarea${x.cls ? ` ${x.cls}` : ""}" data-b="${i}" data-k="${key}" rows="${x.rows || 5}"${x.placeholder ? ` placeholder="${esc(x.placeholder)}"` : ""} aria-label="${esc(x.label || key)}">${esc(value || "")}</textarea>`;
    };
    const sel = (i, key, value, options, label) =>
      `<span class="select"><select data-b="${i}" data-k="${key}" aria-label="${esc(label)}">${options
        .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`)
        .join("")}</select></span>`;
    const labelled = (text, inner) => `<label class="field"><span class="label">${esc(text)}</span>${inner}</label>`;

    function body(b, i) {
      switch (b.type) {
        case "paragraph":
          return `${area(i, "text", b.text, { rows: 5, placeholder: "Write here...", label: "Paragraph", cls: paragraphLook(b) })}
            <div class="block-options">${sel(i, "size", b.size || "", PARAGRAPH_SIZES, "Paragraph size")}${sel(i, "font", b.font || "", PARAGRAPH_FONTS, "Paragraph font")}<span class="format-hint">Give one paragraph its own size or font; the rest follow Look and feel.</span></div>`;
        case "heading":
          return `<div class="input-group">${inp(i, "text", b.text, { placeholder: "Heading", label: "Heading" })}${sel(i, "level", b.level || 2, [[2, "Large"], [3, "Small"]], "Heading size")}</div>`;
        case "image":
          return `<div class="image-field">
              <div class="image-preview">${b.url ? `<img src="${esc(SASHA.img.url(b.url, { w: 480 }))}" alt="">` : icon("image", { size: 28 })}</div>
              <div class="image-side">
                <div class="image-actions"><button class="btn btn-light btn-sm" type="button" data-pick="${i}">${icon("images", { size: 16 })}${b.url ? "Change photo" : "Choose photo"}</button></div>
                ${sel(i, "size", b.size || "normal", [["normal", "Normal width"], ["wide", "Wide"], ["full", "Full screen width"]], "Photo size")}
              </div>
            </div>
            <div class="form-grid">${labelled("Describe the photo", inp(i, "alt", b.alt, { label: "Photo description" }))}${labelled("Caption", inp(i, "caption", b.caption, { label: "Caption" }))}</div>`;
        case "gallery":
          return `<div class="gallery-edit">${(b.images || [])
            .map(
              (im, j) =>
                `<div class="thumb"><img src="${esc(SASHA.img.url(im.url, { w: 240, h: 180 }))}" alt="${esc(im.alt || "")}"><button class="icon-btn" type="button" data-gallery-remove="${i}:${j}" aria-label="Remove this photo">${icon("x", { size: 14 })}</button></div>`
            )
            .join("")}<button class="thumb-add" type="button" data-gallery-add="${i}">${icon("image-plus", { size: 20 })}Add photos</button></div>
            ${labelled("Caption", inp(i, "caption", b.caption, { label: "Gallery caption" }))}`;
        case "quote":
          return `${area(i, "text", b.text, { rows: 3, placeholder: "The quote", label: "Quote" })}${labelled("Who said it (optional)", inp(i, "cite", b.cite, { label: "Who said it" }))}`;
        case "tip":
          return `${labelled("Title", inp(i, "title", b.title, { label: "Tip title" }))}${area(i, "text", b.text, { rows: 4, placeholder: "Practical advice: when to go, what to carry, what it costs...", label: "Tip" })}`;
        case "list":
          return `${sel(i, "style", b.style || "bullet", [["bullet", "Bullet points"], ["number", "Numbered"]], "List style")}${area(i, "items", (b.items || []).join("\n"), { rows: 5, placeholder: "One item per line", label: "List items" })}<p class="format-hint">One item per line.</p>`;
        case "map":
          return `<div class="form-grid">
              ${labelled("Latitude", inp(i, "lat", b.lat, { type: "number", step: "any", placeholder: "32.2", label: "Latitude" }))}
              ${labelled("Longitude", inp(i, "lng", b.lng, { type: "number", step: "any", placeholder: "77.3", label: "Longitude" }))}
              ${labelled("Label", inp(i, "label", b.label, { placeholder: "Hampta Pass, Himachal Pradesh", label: "Map label" }))}
              ${labelled("Zoom, 3 (far) to 18 (close)", inp(i, "zoom", b.zoom, { type: "number", label: "Zoom" }))}
            </div>
            <div class="inline-list">
              <button class="btn btn-light btn-sm" type="button" data-map-find="${i}">${icon("locate-fixed", { size: 16 })}Find by name</button>
              <button class="btn btn-light btn-sm" type="button" data-map-place="${i}">${icon("map-pin", { size: 16 })}Use the story's place</button>
            </div>`;
        default:
          return "";
      }
    }

    function blockHtml(b, i, total) {
      const meta = BLOCKS[b.type] || { label: b.type, icon: "file-text" };
      return `<div class="block" data-i="${i}">
        <div class="block-head">${icon(meta.icon, { size: 16 })}<span>${esc(meta.label)}</span>
          <div class="block-tools">
            <button class="icon-btn" type="button" data-move="${i}:-1" aria-label="Move up"${i === 0 ? " disabled" : ""}>${icon("arrow-up", { size: 16 })}</button>
            <button class="icon-btn" type="button" data-move="${i}:1" aria-label="Move down"${i === total - 1 ? " disabled" : ""}>${icon("arrow-down", { size: 16 })}</button>
            <button class="icon-btn" type="button" data-dup="${i}" aria-label="Duplicate this block">${icon("copy", { size: 16 })}</button>
            <button class="icon-btn" type="button" data-remove="${i}" aria-label="Remove this block">${icon("trash-2", { size: 16 })}</button>
          </div>
        </div>
        ${b.type === "divider" ? "" : `<div class="block-body">${body(b, i)}</div>`}
      </div>`;
    }

    function drawBlocks() {
      list.innerHTML = st.blocks.length
        ? st.blocks.map((b, i) => blockHtml(b, i, st.blocks.length)).join("")
        : `<div class="card">${A.empty({ icon: "feather", title: "Start writing", text: "Add a paragraph, photo or tip below." })}</div>`;
    }
    drawBlocks();

    const onBlockInput = (e) => {
      const el = e.target.closest("[data-b]");
      if (!el) return;
      const b = st.blocks[Number(el.dataset.b)];
      if (!b) return;
      const key = el.dataset.k;
      if (key === "items") b.items = el.value.split("\n");
      else if (key === "level" || key === "zoom") b[key] = Number(el.value);
      else b[key] = el.value;
      if (b.type === "paragraph" && (key === "size" || key === "font")) {
        const textarea = el.closest(".block").querySelector("textarea");
        if (textarea) textarea.className = `textarea ${paragraphLook(b)}`.trim();
      }
      dirty();
    };
    list.addEventListener("input", onBlockInput);
    list.addEventListener("change", onBlockInput);

    async function pickInto(i) {
      const picked = await A.pickImage({});
      if (!picked || !st.blocks[i]) return;
      const b = st.blocks[i];
      b.url = picked.url;
      if (!b.alt && picked.alt) b.alt = picked.alt;
      if (!b.caption && picked.caption) b.caption = picked.caption;
      drawBlocks();
      dirty();
    }

    form.addEventListener("click", async (e) => {
      const t = e.target.closest("button");
      if (!t || t.disabled) return;
      const ds = t.dataset;
      if (t.hasAttribute("data-restore-draft")) {
        restoreDraft();
        return;
      }
      if (t.hasAttribute("data-discard-draft")) {
        U.storage.remove(draftKey(st.story));
        st.draft = null;
        t.closest("[data-draft]").remove();
        return;
      }
      if (ds.add) {
        st.blocks.push(BLOCKS[ds.add].make());
        drawBlocks();
        dirty();
        const last = st.blocks.length - 1;
        const field = list.querySelector(`.block[data-i="${last}"] textarea, .block[data-i="${last}"] input`);
        if (field) field.focus();
        else list.lastElementChild.scrollIntoView({ block: "center" });
        if (ds.add === "image") pickInto(last);
      } else if (ds.move) {
        const [i, step] = ds.move.split(":").map(Number);
        const j = i + step;
        if (j < 0 || j >= st.blocks.length) return;
        [st.blocks[i], st.blocks[j]] = [st.blocks[j], st.blocks[i]];
        drawBlocks();
        dirty();
        const again = list.querySelector(`[data-move="${j}:${step}"]`);
        if (again && !again.disabled) again.focus();
      } else if (ds.remove) {
        const i = Number(ds.remove);
        const b = st.blocks[i];
        const filled = b && (b.text || b.url || (b.images && b.images.length) || (b.items && b.items.join("").trim()));
        if (filled && !(await A.confirm({ title: "Remove this block?", text: "Its content will be taken out of the story.", confirmLabel: "Remove", danger: true }))) return;
        st.blocks.splice(i, 1);
        drawBlocks();
        dirty();
      } else if (ds.dup) {
        const i = Number(ds.dup);
        st.blocks.splice(i + 1, 0, U.clone(st.blocks[i]));
        drawBlocks();
        dirty();
      } else if (ds.pick) {
        pickInto(Number(ds.pick));
      } else if (ds.galleryAdd) {
        const i = Number(ds.galleryAdd);
        const picked = await A.pickImage({ multiple: true });
        if (!picked || !picked.length || !st.blocks[i]) return;
        st.blocks[i].images = (st.blocks[i].images || []).concat(picked.map((p) => ({ url: p.url, alt: p.alt || "", caption: p.caption || "" })));
        drawBlocks();
        dirty();
      } else if (ds.galleryRemove) {
        const [i, j] = ds.galleryRemove.split(":").map(Number);
        st.blocks[i].images.splice(j, 1);
        drawBlocks();
        dirty();
      } else if (ds.mapPlace) {
        const b = st.blocks[Number(ds.mapPlace)];
        const place = A.data.places.find((p) => p.id === form.elements.placeId.value);
        if (!place || place.lat === null || place.lat === undefined || place.lat === "") {
          A.toast("First choose a place that has a location, under Details.", "info");
          return;
        }
        Object.assign(b, { lat: place.lat, lng: place.lng, label: b.label || [place.name, place.region].filter(Boolean).join(", ") });
        drawBlocks();
        dirty();
      } else if (ds.mapFind) {
        const b = st.blocks[Number(ds.mapFind)];
        const text = await A.prompt({
          title: "Find a spot",
          label: "Place name",
          value: b.label || form.elements.location.value.trim(),
          placeholder: "e.g. Hampta Pass, Himachal Pradesh",
          help: "Searches OpenStreetMap. Adding the state or country helps.",
          confirmLabel: "Search",
        });
        if (!text) return;
        const spot = await A.findSpot(text);
        if (!spot || !st.blocks.includes(b)) return;
        Object.assign(b, { lat: spot.lat, lng: spot.lng, label: b.label || spot.name });
        drawBlocks();
        dirty();
      } else if (t.hasAttribute("data-delete-story")) {
        const ok = await A.confirm({ title: "Move this story to the bin?", text: "It disappears from the blog. You can restore it from the Bin.", confirmLabel: "Move to bin", danger: true });
        if (!ok) return;
        try {
          await A.remove("stories", st.story.id);
          A.setDirty(false);
          A.toast("Moved to the bin");
          A.go("#/journal");
        } catch (err) {
          A.fail(err);
        }
      }
    });

    form.elements.placeId.addEventListener("change", () => {
      const p = A.data.places.find((x) => x.id === form.elements.placeId.value);
      if (p && !form.elements.location.value.trim()) form.elements.location.value = [p.name, p.region].filter(Boolean).join(", ");
    });

    form.addEventListener("change", (e) => {
      if (e.target.name === "theme" || READING_KEYS.includes(e.target.name)) updatePreview();
    });

    /* ----- Saving ----- */

    A.wireForm(form, dirty);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      save();
    });

    async function save() {
      A.clearErrors(form);
      const v = A.readForm(form);
      const data = {
        title: v.title,
        subtitle: v.subtitle,
        excerpt: v.excerpt,
        coverImage: v.coverImage,
        coverAlt: v.coverAlt,
        location: v.location,
        placeId: v.placeId,
        theme: v.theme,
        tags: v.tags,
        tripStart: v.tripStart,
        tripEnd: v.tripEnd,
        textSize: v.textSize,
        font: v.font,
        spacing: v.spacing,
        publishedAt: A.fromLocalInput(v.publishedAt),
        featured: v.featured,
        status: v.status,
        blocks: st.blocks,
        slug: v.slug,
      };
      if (st.story.id) data.id = st.story.id;
      try {
        S.normalize("stories", data);
      } catch (err) {
        A.fail(err, form);
        return;
      }
      await A.busy(form.querySelector('button[type="submit"]'), async () => {
        try {
          const saved = await A.save("stories", data, st.base);
          const wasNew = !st.story.id;
          const lostFonts = st.blocks.some((b) => b.type === "paragraph" && b.font) && !(saved.blocks || []).some((b) => b.font);
          U.storage.remove(draftKey(st.story));
          st.draft = null;
          st.story = saved;
          st.base = saved.updatedAt;
          st.blocks = U.clone(saved.blocks || st.blocks);
          A.setDirty(false);
          const after = A.storyState(saved);
          A.toast(after === "published" ? "Saved and published" : after === "scheduled" ? "Saved and scheduled" : "Draft saved");
          if (lostFonts) A.toast("Paragraph fonts weren't kept. Paste the updated Sasha Blog Bridge.gs into Apps Script and deploy a new version.", "error");
          if (wasNew) A.replaceHash(`#/journal/${saved.id}`);
          renderEditor(view, st);
        } catch (err) {
          if (err.code === "CONFLICT") {
            const reload = await A.confirm({
              title: "This story changed somewhere else",
              text: "It was saved in another tab or on another device after you opened it. Load the latest version? Your unsaved changes here will be lost.",
              confirmLabel: "Load the latest",
              danger: true,
            });
            if (reload) {
              A.setDirty(false);
              editorView(view, { id: st.story.id, query: new URLSearchParams() });
            }
          } else {
            A.fail(err, form);
          }
        }
      });
    }
    // Puts back the unsaved work that was kept in this browser.
    function restoreDraft() {
      const f = st.draft.form || {};
      st.story = Object.assign({}, st.story, f, { tags: U.tagList(f.tags), featured: Boolean(f.featured), publishedAt: A.fromLocalInput(f.publishedAt) });
      if (Array.isArray(st.draft.blocks)) st.blocks = st.draft.blocks;
      st.draft = null;
      renderEditor(view, st);
      A.setDirty(true);
      A.toast("Your unsaved changes are back. Save to keep them.", "info");
    }

    // An empty link name is made from the title, so the empty field shows what it will be.
    const slugHint = () => {
      form.elements.slug.placeholder = U.slugify(form.elements.title.value) || "made-from-the-title";
    };
    form.elements.title.addEventListener("input", slugHint);
    slugHint();

    st.save = save;
  }

  A.register({
    id: "journal",
    label: "Journal",
    icon: "book-open",
    group: "collections",
    order: 2,
    count: (d) => A.alive(d.stories).length,
    render(view, route) {
      if (route.id) editorView(view, route);
      else listView(view, route);
    },
  });
})();
