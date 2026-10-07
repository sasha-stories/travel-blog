// Sasha Travel Stories: places and experiences in the dashboard. Each has a list (#/places) and an editor (#/places/new, #/places/<id>).
(function () {
  "use strict";
  const SASHA = window.SASHA;
  const A = SASHA.admin;
  const U = SASHA.util;
  const S = SASHA.schema;
  const C = SASHA.content;
  const esc = U.esc;
  const icon = SASHA.icon;

  const STATUS = [
    ["draft", "Draft: hidden from the blog"],
    ["published", "Published"],
  ];
  const TABS = [
    ["all", "All", (r) => r.status !== "deleted"],
    ["published", "Published", (r) => r.status === "published"],
    ["drafts", "Drafts", (r) => r.status === "draft"],
    ["bin", "Bin", (r) => r.status === "deleted"],
  ];
  const hasSpot = (p) => [p.lat, p.lng].every((v) => v !== null && v !== undefined && v !== "");

  function row(r, cfg) {
    const link = cfg.viewUrl(r);
    const actions =
      r.status === "deleted"
        ? `<button class="icon-btn" type="button" data-restore="${esc(r.id)}" aria-label="Restore" title="Restore">${icon("rotate-ccw", { size: 18 })}</button>`
        : `<a class="icon-btn" href="#/${cfg.id}/${esc(r.id)}" aria-label="Edit" title="Edit">${icon("pencil", { size: 18 })}</a>` +
          (link ? `<a class="icon-btn" href="${esc(link)}" target="_blank" rel="noopener" aria-label="View on the blog" title="View on the blog">${icon("eye", { size: 18 })}</a>` : "") +
          `<button class="icon-btn" type="button" data-delete="${esc(r.id)}" aria-label="Move to the bin" title="Move to the bin">${icon("trash-2", { size: 18 })}</button>`;
    const meta = [A.badge(r.status), r.featured ? '<span class="badge badge-featured">Featured</span>' : ""]
      .concat(cfg.meta(r).filter(Boolean).map((m) => `<span>${esc(m)}</span>`))
      .join("");
    return `<div class="row">${A.thumb(cfg.image(r))}<div class="row-main"><a class="row-title" href="#/${cfg.id}/${esc(r.id)}">${esc(cfg.title(r))}</a><div class="row-meta">${meta}</div></div><div class="row-actions">${actions}</div></div>`;
  }

  function listView(view, route, cfg) {
    let tab = TABS.some((t) => t[0] === route.query.get("tab")) ? route.query.get("tab") : "all";
    let q = "";
    view.innerHTML =
      A.head({ title: cfg.label, sub: cfg.sub, actions: `<a class="btn btn-primary" href="#/${cfg.id}/new">${icon("plus", { size: 18 })}New ${esc(cfg.singular)}</a>` }) +
      `<div class="list-toolbar"><div data-tabs></div><label class="search-input">${icon("search", { size: 16 })}<input class="input" type="search" placeholder="Search" data-q aria-label="Search ${esc(cfg.plural)}"></label></div>
      <div class="card list" data-list></div>`;
    const items = () => A.data[cfg.collection];
    const draw = () => {
      view.querySelector("[data-tabs]").innerHTML = A.tabs(TABS.map(([id, label, fn]) => ({ id, label, count: items().filter(fn).length })), tab);
      const fn = (TABS.find((t) => t[0] === tab) || TABS[0])[2];
      let list = items().filter(fn);
      if (q) {
        const n = A.norm(q);
        list = list.filter((r) => A.norm(`${cfg.title(r)} ${cfg.meta(r).join(" ")}`).includes(n));
      }
      view.querySelector("[data-list]").innerHTML = list.length
        ? list.map((r) => row(r, cfg)).join("")
        : A.empty({
            icon: tab === "bin" ? "trash-2" : cfg.icon,
            title: tab === "bin" ? "The bin is empty" : q ? "Nothing matches" : `No ${cfg.plural} here yet`,
            action: tab === "bin" || q ? "" : `<a class="btn btn-primary" href="#/${cfg.id}/new">New ${esc(cfg.singular)}</a>`,
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
      const r = items().find((x) => x.id === id);
      if (!r) return;
      try {
        if (t.dataset.delete) {
          const ok = await A.confirm({ title: "Move to the bin?", text: `"${cfg.title(r)}" will disappear from the blog. You can restore it from the Bin.`, confirmLabel: "Move to bin", danger: true });
          if (!ok) return;
          await A.remove(cfg.collection, id);
          A.toast("Moved to the bin");
        } else {
          await A.restore(cfg.collection, id);
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
  }

  function editorView(view, route, cfg) {
    let isNew = route.id === "new";
    let item = isNew ? cfg.defaults() : A.data[cfg.collection].find((r) => r.id === route.id);
    if (!item) {
      view.innerHTML = A.head({ title: `This ${cfg.singular} wasn't found`, back: `#/${cfg.id}`, backLabel: `All ${cfg.plural}` });
      return;
    }
    let base = item.updatedAt || "";
    const draw = () => {
      const savedText = isNew ? "Not saved yet" : "All changes saved";
      const link = isNew ? "" : cfg.viewUrl(item);
      view.innerHTML =
        A.head({ title: isNew ? `New ${cfg.singular}` : cfg.title(item), back: `#/${cfg.id}`, backLabel: `All ${cfg.plural}` }) +
        `<form class="card" data-form novalidate>
          <div class="card-body"><div class="form-grid">${cfg.fields(item)}</div></div>
          <div class="card-foot">
            ${!isNew && item.status !== "deleted" ? `<button class="btn btn-ghost push" type="button" data-del>${icon("trash-2", { size: 16 })}Move to bin</button>` : ""}
            <span class="save-state" data-saved="${savedText}">${savedText}</span>
            ${link ? `<a class="btn btn-light" href="${esc(link)}" target="_blank" rel="noopener">${icon("eye", { size: 18 })}View</a>` : ""}
            <button class="btn btn-primary" type="submit" data-busy="Saving...">${icon("save", { size: 18 })}Save</button>
          </div>
        </form>`;
      const form = view.querySelector("[data-form]");
      A.wireForm(form, () => A.setDirty(true));
      if (cfg.wire) cfg.wire(form, item);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        A.clearErrors(form);
        const data = A.readForm(form);
        if (item.id) data.id = item.id;
        try {
          S.normalize(cfg.collection, Object.assign({}, item, data));
        } catch (err) {
          A.fail(err, form);
          return;
        }
        await A.busy(form.querySelector('button[type="submit"]'), async () => {
          try {
            item = await A.save(cfg.collection, data, base);
            base = item.updatedAt;
            A.setDirty(false);
            A.toast(`${A.cap(cfg.singular)} saved`);
            if (isNew) {
              isNew = false;
              A.replaceHash(`#/${cfg.id}/${item.id}`);
            }
            draw();
          } catch (err) {
            if (err.code === "CONFLICT") A.toast("This was changed somewhere else after you opened it. Reload the page to see the latest version.", "error");
            else A.fail(err, form);
          }
        });
      });
      const del = form.querySelector("[data-del]");
      if (del) {
        del.addEventListener("click", async () => {
          const ok = await A.confirm({ title: "Move to the bin?", text: `"${cfg.title(item)}" will disappear from the blog. You can restore it from the Bin.`, confirmLabel: "Move to bin", danger: true });
          if (!ok) return;
          try {
            await A.remove(cfg.collection, item.id);
            A.setDirty(false);
            A.toast("Moved to the bin");
            A.go(`#/${cfg.id}`);
          } catch (err) {
            A.fail(err);
          }
        });
      }
    };
    draw();
  }

  function section(cfg) {
    A.register({
      id: cfg.id,
      label: cfg.label,
      icon: cfg.icon,
      group: "collections",
      order: cfg.order,
      count: (d) => A.alive(d[cfg.collection]).length,
      render(view, route) {
        if (route.id) editorView(view, route, cfg);
        else listView(view, route, cfg);
      },
    });
  }

  const placeOptions = () => [["", "No place"]].concat(A.alive(A.data.places).map((p) => [p.id, p.name]));
  const storyOptions = () => [["", "None"]].concat(A.alive(A.data.stories).map((s) => [s.slug, s.title]));
  const orderField = (r) => A.f.text({ name: "sortOrder", label: "Order", type: "number", value: r.sortOrder || 0, help: "Lower numbers come first." });

  /* ---------- Places: finding the spot on the map ---------- */

  function geoField(p) {
    return `<div class="field span-2">
      <span class="label">Location on the map</span>
      <div class="geo-box">
        <div class="geo-row">
          <button class="btn btn-light btn-sm" type="button" data-geo-find>${icon("locate-fixed", { size: 16 })}Find on the map</button>
          <span class="help" data-geo-status>Looks the place up by its name, region and country.</span>
        </div>
        <div class="geo-map" data-geo-map hidden></div>
        <div class="form-grid">
          ${A.f.text({ name: "lat", label: "Latitude", type: "number", step: "any", value: p.lat, placeholder: "15.335" })}
          ${A.f.text({ name: "lng", label: "Longitude", type: "number", step: "any", value: p.lng, placeholder: "76.46" })}
        </div>
      </div>
      <p class="help">Then drag the pin, or click the map, to mark the exact spot. Typing the numbers works too.</p>
    </div>`;
  }

  // Finds the place on OpenStreetMap and keeps the pin, the map and the two number fields in step.
  function wireGeo(form) {
    const mapEl = form.querySelector("[data-geo-map]");
    const status = form.querySelector("[data-geo-status]");
    const lat = form.elements.lat;
    const lng = form.elements.lng;
    let opening = null;
    let picker = null;

    const moved = (la, ln) => {
      lat.value = la;
      lng.value = ln;
      A.setDirty(true);
    };

    // The first call loads the map; later calls only move the pin.
    function showMap(point) {
      if (!opening) {
        mapEl.hidden = false;
        opening = A.loadScript("js/site/map.js")
          .then((ok) => (ok && SASHA.map && mapEl.isConnected ? SASHA.map.picker(mapEl, point, moved) : null))
          .then((p) => {
            picker = p;
            if (!p) mapEl.hidden = true;
          });
        return opening;
      }
      return opening.then(() => {
        if (picker && point) picker.set(point.lat, point.lng, point.zoom);
      });
    }

    const typedPoint = () => {
      const la = U.coord(lat.value, -90, 90);
      const ln = U.coord(lng.value, -180, 180);
      return la !== null && ln !== null ? { lat: la, lng: ln } : null;
    };

    const start = typedPoint();
    if (!start) status.textContent = "Find it by name, or click the map to drop a pin.";
    showMap(start ? Object.assign(start, { zoom: 10 }) : null);

    form.querySelector("[data-geo-find]").addEventListener("click", async () => {
      const v = A.readForm(form);
      if (!String(v.name || "").trim()) {
        A.fieldError(form, "name", "Type the place's name first.");
        return;
      }
      const spot = await A.findSpot([v.name, v.region, v.country].map((x) => String(x || "").trim()).filter(Boolean).join(", "));
      if (!spot || !form.isConnected) return;
      moved(spot.lat, spot.lng);
      status.textContent = `Found ${spot.label}. Drag the pin if it needs fine-tuning.`;
      showMap({ lat: spot.lat, lng: spot.lng, zoom: 11 });
    });

    const onTyped = () => {
      const p = typedPoint();
      if (p) showMap(p);
    };
    lat.addEventListener("change", onTyped);
    lng.addEventListener("change", onTyped);
  }

  /* ---------- Places ---------- */

  section({
    id: "places",
    label: "Places",
    singular: "place",
    plural: "places",
    icon: "map-pin",
    order: 3,
    collection: "places",
    sub: "The destinations on your map. Each place gets its own page with its stories and experiences.",
    title: (p) => p.name || "Untitled place",
    image: (p) => p.coverImage,
    meta: (p) => [p.region, U.plural(A.alive(A.data.stories).filter((s) => s.placeId === p.id).length, "story", "stories"), hasSpot(p) ? "" : "Not on the map yet"],
    viewUrl: (p) => (p.status === "published" && p.slug ? C.links.place(p.slug) : ""),
    defaults: () => ({ name: "", region: "", country: "India", summary: "", description: "", coverImage: "", coverAlt: "", lat: null, lng: null, bestTime: "", visitedOn: "", tags: [], featured: false, status: "draft", sortOrder: 0, slug: "" }),
    fields: (p) =>
      [
        A.f.text({ name: "name", label: "Name", value: p.name, max: 120, placeholder: "e.g. Hampi" }),
        A.f.text({ name: "region", label: "State or region", value: p.region, max: 80, placeholder: "e.g. Karnataka" }),
        A.f.text({ name: "country", label: "Country", value: p.country || "India", max: 60 }),
        A.f.text({ name: "bestTime", label: "Best time to go", value: p.bestTime, max: 80, placeholder: "October to February" }),
        A.f.textarea({ name: "summary", label: "Short summary", value: p.summary, rows: 2, max: 400, span2: true, help: "Shown on place cards." }),
        A.f.textarea({ name: "description", label: "About this place", value: p.description, rows: 8, max: 6000, span2: true, help: "Leave an empty line between paragraphs." }),
        A.f.image({ name: "coverImage", label: "Cover photo", value: p.coverImage, alt: "coverAlt" }),
        A.f.text({ name: "coverAlt", label: "Describe the photo", value: p.coverAlt, max: 200, span2: true }),
        geoField(p),
        A.f.text({ name: "visitedOn", label: "When you visited", type: "month", value: p.visitedOn }),
        A.f.text({ name: "tags", label: "Tags", value: (p.tags || []).join(", "), help: "Separate with commas." }),
        A.f.select({ name: "status", label: "Status", value: p.status === "published" ? "published" : "draft", options: STATUS }),
        orderField(p),
        A.f.toggle({ name: "featured", label: "Show first on the home page", checked: p.featured }),
        A.f.slug({ value: p.slug, from: "name", page: "places.html?place=", example: "hampi" }),
      ].join(""),
    wire: wireGeo,
  });

  /* ---------- Experiences ---------- */

  section({
    id: "experiences",
    label: "Experiences",
    singular: "experience",
    plural: "experiences",
    icon: "sparkles",
    order: 4,
    collection: "experiences",
    sub: "Favourite meals, walks, treks and moments, with honest notes on time and cost.",
    title: (e) => e.title || "Untitled experience",
    image: (e) => e.image,
    meta: (e) => {
      const place = A.data.places.find((p) => p.id === e.placeId);
      return [e.kind, place ? place.name : "", e.date ? U.formatMonth(e.date) : ""];
    },
    viewUrl: (e) => (e.status === "published" && e.slug ? `${C.links.experiences()}#${encodeURIComponent(e.slug)}` : ""),
    defaults: () => ({ title: "", kind: "", placeId: "", summary: "", image: "", imageAlt: "", date: "", rating: 0, duration: "", cost: "", storySlug: "", link: "", featured: false, status: "draft", sortOrder: 0, slug: "" }),
    fields: (e) =>
      [
        A.f.text({ name: "title", label: "Title", value: e.title, max: 140, span2: true }),
        A.f.text({ name: "kind", label: "Kind", value: e.kind, max: 40, list: "exp-kinds", placeholder: "Food, Trek, Stay..." }) +
          `<datalist id="exp-kinds">${S.EXPERIENCE_KINDS.map((k) => `<option value="${esc(k)}"></option>`).join("")}</datalist>`,
        A.f.select({ name: "placeId", label: "Place", value: e.placeId, options: placeOptions() }),
        A.f.textarea({ name: "summary", label: "Summary", value: e.summary, rows: 3, max: 400, span2: true }),
        A.f.image({ name: "image", label: "Photo", value: e.image, alt: "imageAlt" }),
        A.f.text({ name: "imageAlt", label: "Describe the photo", value: e.imageAlt, max: 200, span2: true }),
        A.f.text({ name: "date", label: "Date", type: "date", value: e.date }),
        A.f.select({
          name: "rating",
          label: "Your rating",
          value: String(e.rating || 0),
          options: [["0", "No rating"], ["5", "5: unforgettable"], ["4", "4: loved it"], ["3", "3: good"], ["2", "2: okay"], ["1", "1: skip it"]],
        }),
        A.f.text({ name: "duration", label: "How long it takes", value: e.duration, max: 60, placeholder: "2 hours" }),
        A.f.text({ name: "cost", label: "Cost", value: e.cost, max: 40, placeholder: "Free, or about \u20b9 500" }),
        A.f.select({ name: "storySlug", label: "Related story", value: e.storySlug, options: storyOptions() }),
        A.f.text({ name: "link", label: "Booking or info link", value: e.link, type: "url", placeholder: "https://" }),
        A.f.select({ name: "status", label: "Status", value: e.status === "published" ? "published" : "draft", options: STATUS }),
        orderField(e),
        A.f.toggle({ name: "featured", label: "Show on the home page", checked: e.featured }),
        A.f.slug({ value: e.slug, from: "title", page: "experiences.html#", example: "sunset-boat-ride" }),
      ].join(""),
  });
})();
