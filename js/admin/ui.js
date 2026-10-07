// Sasha Travel Stories: dashboard helpers (SASHA.admin, written A below), loaded before the sections.
// Sections call A.register({ id, label, icon, group, order, count(data), render(view, route) }); route is { section, id, query }.
// A.data holds what loads at sign-in: settings, themes, stories (without their text), places, experiences, images and folders.
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const U = SASHA.util;
  const esc = U.esc;
  const icon = SASHA.icon;
  const A = (SASHA.admin = SASHA.admin || {});

  A.api = SASHA.store.admin;
  A.sections = [];
  A.data = null;
  A.dirty = false;

  A.register = function (section) {
    A.sections.push(section);
    A.sections.sort((a, b) => (a.order || 0) - (b.order || 0));
  };

  A.alive = (list) => (list || []).filter((r) => r.status !== "deleted");
  A.norm = (text) => SASHA.content.norm(text);
  A.cap = (text) => String(text || "").charAt(0).toUpperCase() + String(text || "").slice(1);
  A.themeOf = (slug) => (A.data && slug ? A.data.themes.find((t) => t.slug === slug && t.status !== "deleted") || null : null);

  const scripts = {};

  // Loads a script once, by its path from the project folder, for example "js/site/map.js".
  A.loadScript = function (path) {
    const src = U.url(path);
    if (!scripts[src]) {
      scripts[src] = new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = src;
        el.onload = () => resolve(true);
        el.onerror = () => resolve(false);
        document.head.appendChild(el);
      });
    }
    return scripts[src];
  };

  /* ---------- Messages ---------- */

  A.toast = function (message, type) {
    const kind = type || "success";
    const box = document.getElementById("toasts");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `toast toast-${kind}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    const ic = kind === "error" ? "circle-alert" : kind === "info" ? "info" : "circle-check";
    el.innerHTML = `${icon(ic, { size: 18 })}<span>${esc(message)}</span>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), kind === "error" ? 7000 : 3500);
  };

  /* ---------- Dialogs ---------- */

  const openModals = [];

  // A.modal({ title, body, foot, wide, onClose(value) }) returns { el, body, close(value) }; an element with data-autofocus gets the focus first.
  A.modal = function (o) {
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `<div class="modal${o.wide ? " modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(o.title || "Dialog")}">
        <div class="modal-head"><h2 class="modal-title">${esc(o.title || "")}</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
        <div class="modal-body">${o.body || ""}</div>
        ${o.foot ? `<div class="modal-foot">${o.foot}</div>` : ""}
      </div>`;
    const before = document.activeElement;
    let open = true;
    function onKey(e) {
      if (e.key === "Escape" && openModals[openModals.length - 1] === back) close(null);
    }
    function close(value) {
      if (!open) return;
      open = false;
      openModals.splice(openModals.indexOf(back), 1);
      back.remove();
      document.removeEventListener("keydown", onKey);
      if (before && before.focus && before.isConnected) before.focus();
      if (o.onClose) o.onClose(value === undefined ? null : value);
    }
    back.addEventListener("mousedown", (e) => {
      if (e.target === back) close(null);
    });
    back.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) close(null);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(back);
    openModals.push(back);
    setTimeout(() => {
      const first =
        back.querySelector("[data-autofocus]") ||
        back.querySelector(".modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea, .modal-foot [data-ok]") ||
        back.querySelector("[data-close]");
      if (first) first.focus();
    }, 30);
    return { el: back, body: back.querySelector(".modal-body"), close };
  };

  A.confirm = (o) =>
    new Promise((resolve) => {
      const m = A.modal({
        title: o.title || "Are you sure?",
        body: `<p>${esc(o.text || "")}</p>`,
        foot: `<button class="btn btn-light" type="button" data-close>Cancel</button><button class="btn ${o.danger ? "btn-danger" : "btn-primary"}" type="button" data-ok>${esc(o.confirmLabel || "OK")}</button>`,
        onClose: (v) => resolve(v === true),
      });
      m.el.querySelector("[data-ok]").addEventListener("click", () => m.close(true));
    });

  A.prompt = (o) =>
    new Promise((resolve) => {
      const m = A.modal({
        title: o.title || "",
        body: `<form class="field" data-prompt><label class="label" for="prompt-input">${esc(o.label || "")}</label><input class="input" id="prompt-input" value="${esc(o.value || "")}" placeholder="${esc(o.placeholder || "")}" autocomplete="off">${o.help ? `<p class="help">${esc(o.help)}</p>` : ""}</form>`,
        foot: `<button class="btn btn-light" type="button" data-close>Cancel</button><button class="btn btn-primary" type="button" data-ok>${esc(o.confirmLabel || "OK")}</button>`,
        onClose: (v) => resolve(typeof v === "string" && v ? v : null),
      });
      const input = m.el.querySelector("input");
      const ok = () => m.close(input.value.trim());
      m.el.querySelector("[data-ok]").addEventListener("click", ok);
      m.el.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        ok();
      });
    });

  // Looks a place up on OpenStreetMap and lets Sasha pick the right match. Resolves to { name, label, lat, lng } or null.
  A.findSpot = async function (text) {
    let results;
    try {
      results = await A.api.geocode(text);
    } catch (err) {
      A.fail(err);
      return null;
    }
    if (!results.length) {
      A.toast(`Nothing was found for "${text}". Try adding the state or country.`, "info");
      return null;
    }
    return new Promise((resolve) => {
      const m = A.modal({
        title: "Which place is it?",
        body: `<p class="help">Matches from OpenStreetMap for &ldquo;${esc(text)}&rdquo;.</p>
          <div class="choice-list">${results
            .map(
              (r, i) =>
                `<button class="choice" type="button" data-choice="${i}"${i === 0 ? " data-autofocus" : ""}><span class="choice-icon">${icon("map-pin", { size: 18 })}</span><span><strong>${esc(r.name)}</strong><small>${esc(r.label)}</small></span></button>`
            )
            .join("")}</div>`,
        foot: '<button class="btn btn-light" type="button" data-close>Cancel</button>',
        onClose: (v) => resolve(v || null),
      });
      m.el.querySelector(".choice-list").addEventListener("click", (e) => {
        const b = e.target.closest("[data-choice]");
        if (b) m.close(results[Number(b.dataset.choice)]);
      });
    });
  };

  /* ---------- Errors and busy buttons ---------- */

  A.fail = function (err, form) {
    console.error(err);
    if (err && err.code === "UNAUTHORIZED" && A.onUnauthorized) {
      A.onUnauthorized(err.message);
      return;
    }
    const message = (err && err.message) || "Something went wrong. Please try again.";
    if (form && err && err.field) A.fieldError(form, err.field, message);
    A.toast(message, "error");
  };

  A.fieldError = function (form, name, message) {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    const target = input.type === "hidden" ? input.closest(".image-field") || input : input;
    target.classList.add("is-invalid");
    const wrap = input.closest(".field") || input.parentElement;
    if (wrap && !wrap.querySelector(".field-error")) wrap.insertAdjacentHTML("beforeend", `<p class="field-error">${esc(message)}</p>`);
    if (input.type !== "hidden") input.focus({ preventScroll: true });
    (wrap || target).scrollIntoView({ block: "center", behavior: "smooth" });
  };

  A.clearErrors = function (root) {
    root.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
    root.querySelectorAll(".field-error").forEach((el) => el.remove());
  };

  // Disables the button and shows a spinner while fn runs.
  A.busy = async function (btn, fn) {
    if (!btn) return fn();
    if (btn.disabled) return undefined;
    const html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${icon("loader-circle", { size: 16, className: "spin" })}<span>${esc(btn.dataset.busy || "Working...")}</span>`;
    try {
      return await fn();
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.innerHTML = html;
      }
    }
  };

  /* ---------- Small pieces ---------- */

  A.storyState = (s) => (s.status === "published" && s.publishedAt && s.publishedAt > U.nowIso() ? "scheduled" : s.status);
  const LABELS = { published: "Published", draft: "Draft", scheduled: "Scheduled", deleted: "In the bin", active: "Shown", hidden: "Hidden" };
  A.badge = (state) => `<span class="badge badge-${esc(state)}">${esc(LABELS[state] || state)}</span>`;

  A.thumb = (src) =>
    src
      ? `<img class="row-thumb" src="${esc(SASHA.img.url(src, { w: 160, h: 120 }))}" alt="" loading="lazy">`
      : `<span class="row-thumb is-empty">${icon("image", { size: 18 })}</span>`;

  // A theme's two colours and its look's icon, in place of a photo.
  A.swatch = (theme) => {
    const t = SASHA.content.themeCard(theme || {}, 0);
    return `<span class="row-thumb row-swatch" style="--a:${esc(t.accent)};--t:${esc(t.tint)}">${icon(t.icon, { size: 18 })}</span>`;
  };

  // o.sub is trusted text from the dashboard's own code, so it may hold links.
  A.head = (o) =>
    `<div class="view-head"><div>${o.back ? `<a class="link-arrow" href="${esc(o.back)}">${icon("arrow-left", { size: 16 })}${esc(o.backLabel || "Back")}</a>` : ""}<h1 class="view-title">${esc(o.title)}</h1>${o.sub ? `<p class="view-sub">${o.sub}</p>` : ""}</div>${o.actions ? `<div class="inline-list">${o.actions}</div>` : ""}</div>`;

  A.empty = (o) =>
    `<div class="empty"><span class="empty-icon">${icon(o.icon || "sparkles", { size: 26 })}</span><h3>${esc(o.title)}</h3>${o.text ? `<p>${esc(o.text)}</p>` : ""}${o.action || ""}</div>`;

  A.tabs = (tabs, active) =>
    `<div class="tabs" role="tablist">${tabs
      .map((t) => `<button class="tab" type="button" role="tab" data-tab="${esc(t.id)}" aria-selected="${t.id === active}">${esc(t.label)}${t.count !== undefined ? ` <span class="tab-count">${t.count}</span>` : ""}</button>`)
      .join("")}</div>`;

  /* ---------- Form fields (all return HTML) ---------- */

  const attrs = (o) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined && v !== null && v !== false && v !== "")
      .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`))
      .join("");

  // Help is trusted text from the dashboard's own code, so it may hold small bits of HTML.
  function wrap(o, inner) {
    const count = o.max ? `<span class="char-count" data-count-for="${esc(o.name)}"></span>` : "";
    const label = o.label ? `<div class="label-row"><label class="label" for="f-${esc(o.name)}">${esc(o.label)}</label>${count}</div>` : "";
    return `<div class="field${o.span2 ? " span-2" : ""}">${label}${inner}${o.help ? `<p class="help">${o.help}</p>` : ""}</div>`;
  }

  A.f = {
    text: (o) =>
      wrap(
        o,
        `<input class="input" id="f-${esc(o.name)}" name="${esc(o.name)}"${attrs({
          type: o.type || "text",
          value: o.value === undefined || o.value === null ? "" : String(o.value),
          placeholder: o.placeholder,
          maxlength: o.max,
          list: o.list,
          step: o.step,
          required: o.required,
          readonly: o.readonly,
          autocomplete: "off",
        })}>`
      ),
    textarea: (o) =>
      wrap(o, `<textarea class="textarea" id="f-${esc(o.name)}" name="${esc(o.name)}"${attrs({ rows: o.rows || 4, maxlength: o.max, placeholder: o.placeholder })}>${esc(o.value || "")}</textarea>`),
    select: (o) =>
      wrap(
        o,
        `<span class="select"><select id="f-${esc(o.name)}" name="${esc(o.name)}">${(o.options || [])
          .map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(o.value === undefined || o.value === null ? "" : o.value) ? " selected" : ""}>${esc(l)}</option>`)
          .join("")}</select></span>`
      ),
    toggle: (o) =>
      `<div class="field${o.span2 ? " span-2" : ""}"><label class="check"><input type="checkbox" name="${esc(o.name)}"${o.checked ? " checked" : ""}>${esc(o.label)}</label>${o.help ? `<p class="help">${o.help}</p>` : ""}</div>`,
    color: (o) =>
      wrap(o, `<div class="color-field"><input class="input" type="color" id="f-${esc(o.name)}" name="${esc(o.name)}" value="${esc(o.value)}"><code data-hex-for="${esc(o.name)}">${esc(o.value)}</code></div>`),
    // The "Link name": the readable end of a page's address, for example places.html?place=hampi.
    slug: (o) =>
      A.f.text({
        name: "slug",
        label: "Link name",
        value: o.value,
        max: 80,
        span2: o.span2,
        placeholder: o.example,
        help: `The readable end of this page's address, as in <code>${esc(o.page)}${esc(o.value || o.example)}</code>. Left empty, it is made from the ${esc(o.from)}.`,
      }),
    // A photo: preview, "Choose photo" (media library), "Paste a link" and "Remove". o.alt names the description field to fill in.
    image: (o) => {
      const v = o.value || "";
      return `<div class="field${o.span2 === false ? "" : " span-2"}">
        <span class="label">${esc(o.label)}</span>
        <div class="image-field${o.wide ? " is-wide" : ""}" data-image-field${o.alt ? ` data-alt="${esc(o.alt)}"` : ""}>
          <div class="image-preview">${v ? `<img src="${esc(SASHA.img.url(v, { w: 480 }))}" alt="">` : icon("image", { size: 28 })}</div>
          <div class="image-side">
            <div class="image-actions">
              <button class="btn btn-light btn-sm" type="button" data-image="pick">${icon("images", { size: 16 })}Choose photo</button>
              <button class="btn btn-light btn-sm" type="button" data-image="link">${icon("link", { size: 16 })}Paste a link</button>
              <button class="btn btn-ghost btn-sm" type="button" data-image="clear"${v ? "" : " hidden"}>Remove</button>
            </div>
            ${o.help ? `<p class="help">${o.help}</p>` : ""}
          </div>
          <input type="hidden" name="${esc(o.name)}" value="${esc(v)}">
        </div>
      </div>`;
    },
  };

  A.readForm = function (form) {
    const out = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === "checkbox") out[el.name] = el.checked;
      else if (el.type === "radio") {
        if (el.checked) out[el.name] = el.value;
      } else out[el.name] = el.value;
    });
    return out;
  };

  function counter(input) {
    if (!input || !input.name || !input.form) return;
    const el = input.form.querySelector(`[data-count-for="${input.name}"]`);
    if (!el) return;
    const max = Number(input.getAttribute("maxlength")) || 0;
    el.textContent = max ? `${input.value.length}/${max}` : "";
    el.classList.toggle("is-over", Boolean(max) && input.value.length >= max);
  }

  function setImage(box, url, alt) {
    const input = box.querySelector('input[type="hidden"]');
    input.value = url;
    box.querySelector(".image-preview").innerHTML = url ? `<img src="${esc(SASHA.img.url(url, { w: 480 }))}" alt="">` : icon("image", { size: 28 });
    box.querySelector('[data-image="clear"]').hidden = !url;
    box.classList.remove("is-invalid");
    const form = box.closest("form");
    if (form && box.dataset.alt && alt) {
      const altInput = form.querySelector(`[name="${box.dataset.alt}"]`);
      if (altInput && !altInput.value.trim()) altInput.value = alt;
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Character counters, colour codes, photo fields and "something changed" for any form built with A.f.
  A.wireForm = function (form, onChange) {
    form.addEventListener("input", (e) => {
      counter(e.target);
      if (e.target.type === "color") {
        const code = form.querySelector(`[data-hex-for="${e.target.name}"]`);
        if (code) code.textContent = e.target.value;
      }
      if (onChange) onChange();
    });
    form.addEventListener("change", () => {
      if (onChange) onChange();
    });
    form.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-image]");
      if (!btn) return;
      const box = btn.closest("[data-image-field]");
      if (btn.dataset.image === "clear") {
        setImage(box, "", "");
      } else if (btn.dataset.image === "link") {
        const url = await A.prompt({ title: "Use a photo link", label: "Photo address", placeholder: "https://", help: "Paste a link that starts with https://", confirmLabel: "Use this photo" });
        if (url) setImage(box, url, "");
      } else {
        const picked = await A.pickImage({});
        if (picked) setImage(box, picked.url, picked.alt || "");
      }
    });
    form.querySelectorAll("[data-count-for]").forEach((el) => counter(form.querySelector(`[name="${el.dataset.countFor}"]`)));
  };

  /* ---------- Data ---------- */

  // Keeps A.data in step after a save, so lists update without loading everything again.
  A.upsert = function (collection, item) {
    if (!A.data || !item) return item;
    const list = A.data[collection] || (A.data[collection] = []);
    let copy = item;
    if (collection === "stories" && Array.isArray(item.blocks)) {
      copy = Object.assign({}, item, { blockCount: item.blocks.length });
      delete copy.blocks;
    }
    const i = list.findIndex((r) => r.id === item.id);
    if (i === -1) list.unshift(copy);
    else list[i] = copy;
    if (collection === "images") A.data.folders = SASHA.schema.listFolders(A.data);
    if (A.refreshNav) A.refreshNav();
    return item;
  };

  A.save = async (collection, data, baseUpdatedAt) => A.upsert(collection, await A.api.save(collection, data, baseUpdatedAt));
  A.remove = async (collection, id) => A.upsert(collection, await A.api.remove(collection, id));
  A.restore = async (collection, id) => A.upsert(collection, await A.api.restore(collection, id));

  // Opens the media library's photo picker (media.js). Resolves to { url, alt, caption }, a list of them with multiple: true, or null.
  A.pickImage = async function (opts) {
    const o = opts || {};
    if (A.media && A.media.pick) return A.media.pick(o);
    const url = await A.prompt({ title: "Use a photo link", label: "Photo address", placeholder: "https://", confirmLabel: "Use this photo" });
    if (!url) return null;
    return o.multiple ? [{ url, alt: "", caption: "" }] : { url, alt: "", caption: "" };
  };

  /* ---------- Other ---------- */

  const pad = (n) => String(n).padStart(2, "0");

  A.localInput = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  A.fromLocalInput = (value) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  };

  A.setDirty = function (on) {
    A.dirty = Boolean(on);
    document.querySelectorAll(".save-state").forEach((el) => {
      el.classList.toggle("is-dirty", A.dirty);
      el.textContent = A.dirty ? "Unsaved changes" : el.dataset.saved || "All changes saved";
    });
  };

  A.download = function (filename, text, type) {
    const blob = new Blob([text], { type: type || "application/json" });
    const link = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = link;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(link), 1000);
  };
})();
