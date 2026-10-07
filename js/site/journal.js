// Sasha Travel Stories: the journal (journal.html?theme=&place=&tag=&sort=oldest&view=timeline). Choosing a theme recolours the page.
(function () {
  "use strict";
  const U = SASHA.util;
  const C = SASHA.content;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  const f = {
    theme: SITE.param("theme"),
    place: SITE.param("place"),
    tag: SITE.param("tag").toLowerCase(),
    sort: SITE.param("sort") === "oldest" ? "oldest" : "newest",
    view: SITE.param("view") === "timeline" ? "timeline" : "grid",
  };
  let site = null;
  let main = null;

  function filtered() {
    let list = site.stories.slice();
    if (f.theme) list = list.filter((s) => s.theme && s.theme.slug === f.theme);
    if (f.place) list = list.filter((s) => s.place && s.place.slug === f.place);
    if (f.tag) list = list.filter((s) => s.tags.includes(f.tag));
    if (f.sort === "oldest") list.reverse();
    return list;
  }

  const option = (value, label, selected) => `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

  function chip(key, value, label, count, ic) {
    return `<button class="chip" type="button" data-filter="${key}" data-value="${esc(value)}" aria-pressed="${f[key] === value}">${ic ? icon(ic, { size: 15 }) : ""}${esc(label)} <span class="chip-count">${count}</span></button>`;
  }

  function toolbar() {
    const themes = site.themes.filter((t) => t.count > 0);
    const places = site.places.filter((p) => p.stories.length);
    return `<div class="toolbar">
      <div class="chips" role="group" aria-label="Filter by theme">${chip("theme", "", "All", site.stories.length)}${themes.map((t) => chip("theme", t.slug, t.name, t.count, t.icon)).join("")}</div>
      <div class="toolbar-right">
        ${places.length ? `<label class="select"><span class="visually-hidden">Place</span><select data-filter="place">${option("", "All places", !f.place)}${places.map((p) => option(p.slug, p.name, f.place === p.slug)).join("")}</select></label>` : ""}
        <label class="select"><span class="visually-hidden">Order</span><select data-filter="sort">${option("newest", "Newest first", f.sort === "newest")}${option("oldest", "Oldest first", f.sort === "oldest")}</select></label>
        <div class="view-toggle" role="group" aria-label="Layout">
          <button type="button" data-filter="view" data-value="grid" aria-pressed="${f.view === "grid"}">${icon("layout-grid", { size: 16 })}Grid</button>
          <button type="button" data-filter="view" data-value="timeline" aria-pressed="${f.view === "timeline"}">${icon("history", { size: 16 })}Timeline</button>
        </div>
      </div>
    </div>`;
  }

  function timeline(list) {
    return `<div class="timeline">${C.timeline({ stories: list })
      .map(
        (g) => `<section class="timeline-year reveal">
          <h2 class="timeline-label">${g.year || "Undated"}</h2>
          <ol class="timeline-list">${g.stories
            .map(
              (s) => `<li class="timeline-item"><a class="timeline-link" href="${esc(s.url)}">
                ${SASHA.img.tag({ src: s.coverImage, alt: "", widths: [160, 280], sizes: "128px", ratio: [4, 3] })}
                <div>
                  <p class="timeline-date">${esc(s.tripStart ? U.formatRange(s.tripStart, s.tripEnd) : U.formatDate(s.publishedAt))}</p>
                  <h3 class="timeline-title">${esc(s.title)}</h3>
                  ${s.location ? `<p class="timeline-place">${esc(s.location)}</p>` : ""}
                </div>
              </a></li>`
            )
            .join("")}</ol>
        </section>`
      )
      .join("")}</div>`;
  }

  function render() {
    const list = filtered();
    const theme = f.theme ? C.findTheme(site, f.theme) : null;
    const place = f.place ? C.findPlace(site, f.place) : null;
    SITE.applyTheme(theme);
    SITE.setTitle(theme ? theme.name : "Journal");
    SITE.setDescription(theme && theme.description ? theme.description : "Every story from the journal, by theme, place and year.");
    const head = theme
      ? `${SITE.themePill(theme, false)}<h1 class="page-title">${esc(theme.name)}</h1><p class="page-intro">${esc(theme.description || `Stories with the ${theme.name} theme.`)}</p>`
      : '<p class="eyebrow">The journal</p><h1 class="page-title">Stories from the road</h1><p class="page-intro">Every story, newest first. Filter by theme or place, or switch to the timeline to travel back through the years.</p>';

    const extra = [];
    if (place) extra.push(`in ${esc(place.name)}`);
    if (f.tag) extra.push(`tagged <button class="tag" type="button" data-filter="tag" data-value="" aria-label="Remove the ${esc(f.tag)} filter">#${esc(f.tag)} &times;</button>`);
    const count = `<p class="result-count" aria-live="polite">${U.plural(list.length, "story", "stories")} ${extra.join(" ")}</p>`;

    let body;
    if (!site.stories.length) body = SITE.state({ icon: "feather", title: "No stories yet", text: "Published stories will appear here." });
    else if (!list.length) body = SITE.state({ icon: "search", title: "No stories match", text: "Try another theme or place.", action: '<button class="btn btn-light" type="button" data-clear>Show all stories</button>' });
    else body = f.view === "timeline" ? timeline(list) : `<div class="grid grid-3">${list.map(SITE.storyCard).join("")}</div>`;

    main.innerHTML = `<section class="page-hero${theme ? " glow" : ""}"><div class="container">${head}</div></section>
      <div class="container">${site.stories.length ? toolbar() + count : ""}${body}</div>`;
  }

  function update(changes, focusSelector) {
    Object.assign(f, changes);
    SITE.setParams({ theme: f.theme, place: f.place, tag: f.tag, sort: f.sort === "oldest" ? "oldest" : "", view: f.view === "timeline" ? "timeline" : "" });
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
          update({ theme: "", place: "", tag: "" }, 'button[data-filter="theme"]');
          return;
        }
        const btn = e.target.closest("button[data-filter]");
        if (!btn) return;
        const key = btn.dataset.filter;
        const value = btn.dataset.value;
        update({ [key]: value }, key === "tag" ? "" : `button[data-filter="${key}"][data-value="${CSS.escape(value)}"]`);
      });
      main.addEventListener("change", (e) => {
        const sel = e.target.closest("select[data-filter]");
        if (sel) update({ [sel.dataset.filter]: sel.value }, `select[data-filter="${sel.dataset.filter}"]`);
      });
    });
  });
})();
