// Sasha Travel Stories: experiences (experiences.html?kind=&place=, and #slug to jump to one).
(function () {
  "use strict";
  const U = SASHA.util;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  const f = { kind: SITE.param("kind"), place: SITE.param("place") };
  let site = null;
  let main = null;

  function kinds() {
    const map = new Map();
    site.experiences.forEach((e) => {
      if (!e.kind) return;
      const key = e.kind.toLowerCase();
      if (!map.has(key)) map.set(key, { label: e.kind, count: 0 });
      map.get(key).count += 1;
    });
    return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  function render() {
    SITE.setTitle("Experiences");
    SITE.setDescription("Favourite meals, walks, treks and journeys from my travels.");
    const all = kinds();
    const places = site.places.filter((p) => site.experiences.some((e) => e.placeId === p.id));
    let list = site.experiences;
    if (f.kind) list = list.filter((e) => e.kind.toLowerCase() === f.kind.toLowerCase());
    if (f.place) list = list.filter((e) => e.place && e.place.slug === f.place);

    const chip = (value, label, count, ic) =>
      `<button class="chip" type="button" data-kind="${esc(value)}" aria-pressed="${f.kind.toLowerCase() === value.toLowerCase()}">${ic ? icon(ic, { size: 15 }) : ""}${esc(label)} <span class="chip-count">${count}</span></button>`;
    const option = (value, label) => `<option value="${esc(value)}"${f.place === value ? " selected" : ""}>${esc(label)}</option>`;
    const toolbar = site.experiences.length
      ? `<div class="toolbar">
          <div class="chips" role="group" aria-label="Filter by kind">${chip("", "All", site.experiences.length)}${all.map((k) => chip(k.label, k.label, k.count, SITE.kindIcon(k.label))).join("")}</div>
          ${places.length > 1 ? `<div class="toolbar-right"><label class="select"><span class="visually-hidden">Place</span><select data-place>${option("", "All places")}${places.map((p) => option(p.slug, p.name)).join("")}</select></label></div>` : ""}
        </div>
        <p class="result-count" aria-live="polite">${U.plural(list.length, "experience", "experiences")}</p>`
      : "";

    let body;
    if (!site.experiences.length) body = SITE.state({ icon: "sparkles", title: "No experiences yet", text: "Favourite moments from the road will appear here." });
    else if (!list.length) body = SITE.state({ icon: "search", title: "Nothing matches", text: "Try another kind of experience or place.", action: '<button class="btn btn-light" type="button" data-clear>Show everything</button>' });
    else body = `<div class="grid grid-3">${list.map(SITE.expCard).join("")}</div>`;

    main.innerHTML = `<section class="page-hero"><div class="container">
        <p class="eyebrow">Experiences</p>
        <h1 class="page-title">Moments worth the journey</h1>
        <p class="page-intro">The meals, walks, sunrises and small adventures I would happily do again, with honest notes on time and cost.</p>
      </div></section>
      <div class="container">${toolbar}${body}</div>`;
  }

  function update(changes, focusSelector) {
    Object.assign(f, changes);
    SITE.setParams({ kind: f.kind, place: f.place });
    render();
    SITE.finish(main);
    const el = focusSelector && main.querySelector(focusSelector);
    if (el) el.focus();
  }

  SITE.boot((data, ctx) => {
    site = data;
    main = ctx.main;
    render();
    ctx.once("events", () => {
      main.addEventListener("click", (e) => {
        if (e.target.closest("[data-clear]")) {
          update({ kind: "", place: "" }, 'button[data-kind=""]');
          return;
        }
        const btn = e.target.closest("button[data-kind]");
        if (btn) update({ kind: btn.dataset.kind }, `button[data-kind="${CSS.escape(btn.dataset.kind)}"]`);
      });
      main.addEventListener("change", (e) => {
        const sel = e.target.closest("select[data-place]");
        if (sel) update({ place: sel.value }, "select[data-place]");
      });
    });
    ctx.once("hash", () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const el = id && document.getElementById(id);
      if (el) setTimeout(() => el.scrollIntoView({ block: "center" }), 80);
    });
  });
})();
