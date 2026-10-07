// Sasha Travel Stories: all places (places.html?region=) and one place (places.html?place=slug), with maps from js/site/map.js.
(function () {
  "use strict";
  const U = SASHA.util;
  const C = SASHA.content;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  let region = SITE.param("region");

  function showMap(id, draw) {
    const el = document.getElementById(id);
    if (!el) return;
    SITE.loadScript("js/site/map.js").then((ok) => {
      if (!ok || !SASHA.map || !document.body.contains(el)) return;
      el.hidden = false;
      draw(SASHA.map, el);
    });
  }

  function listView(site, main) {
    SITE.setTitle("Places");
    SITE.setDescription("The places I have travelled to, with stories, tips and favourite experiences from each.");
    const regions = [...new Set(site.places.map((p) => p.region).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (region && !regions.includes(region)) region = "";
    const list = region ? site.places.filter((p) => p.region === region) : site.places;
    const mapped = list.filter((p) => p.lat !== null && p.lng !== null);
    const chip = (value, label, count) =>
      `<button class="chip" type="button" data-region="${esc(value)}" aria-pressed="${region === value}">${esc(label)} <span class="chip-count">${count}</span></button>`;
    const chips =
      regions.length > 1
        ? `<div class="toolbar"><div class="chips" role="group" aria-label="Filter by region">${chip("", "All", site.places.length)}${regions.map((r) => chip(r, r, site.places.filter((p) => p.region === r).length)).join("")}</div></div>`
        : "";
    const count = U.plural(site.places.length, "place", "places");
    main.innerHTML = `<section class="page-hero"><div class="container">
        <p class="eyebrow">Places</p>
        <h1 class="page-title">Where I've been</h1>
        <p class="page-intro">${esc(regions.length ? `${count} across ${U.plural(regions.length, "region", "regions")}.` : `${count}.`)} Pick one to read its stories, tips and favourite experiences.</p>
      </div></section>
      <div class="container">
        ${mapped.length ? '<div class="map-panel" id="places-map" hidden></div>' : ""}
        ${chips}
        ${list.length ? `<div class="grid grid-4">${list.map(SITE.placeCard).join("")}</div>` : SITE.state({ icon: "map", title: "No places yet", text: "Places appear here once they are published." })}
      </div>`;
    if (mapped.length) showMap("places-map", (map, el) => map.places(el, mapped));
  }

  function detailView(site, main, slug) {
    const p = C.findPlace(site, slug);
    if (!p) {
      SITE.setTitle("Place not found");
      main.innerHTML = `<div class="container">${SITE.state({
        icon: "map-pin",
        heading: "h1",
        title: "Place not found",
        text: "This place may have been renamed or unpublished.",
        action: `<a class="btn btn-primary" href="${esc(C.links.places())}">See all places</a>`,
      })}</div>`;
      return;
    }
    SITE.setTitle(p.name);
    SITE.setDescription(p.summary);
    const where = [p.region, p.country].filter(Boolean).join(", ");
    const stories = site.stories.filter((s) => s.place && s.place.id === p.id);
    const experiences = site.experiences.filter((e) => e.placeId === p.id);
    const others = site.places.filter((o) => o.id !== p.id).slice(0, 4);
    const hasMap = p.lat !== null && p.lng !== null;
    const facts = [
      ["map-pin", "Where", where],
      ["sun", "Best time to go", p.bestTime],
      ["calendar", "I visited", p.visitedOn ? U.formatMonth(p.visitedOn) : ""],
      ["book-open", "On the blog", stories.length ? U.plural(stories.length, "story", "stories") : ""],
    ].filter((fact) => fact[2]);

    main.innerHTML = `<article class="place-detail">
      <div class="container">
        <a class="back-link" href="${esc(C.links.places())}">${icon("arrow-left", { size: 16 })}All places</a>
        <header class="place-hero">
          <div class="place-hero-media torn-bottom">${SASHA.img.tag({ src: p.coverImage, alt: p.coverAlt, widths: [800, 1400, 2000], sizes: "(max-width: 1240px) 100vw, 1200px", eager: true })}</div>
          <div class="place-hero-text paper taped">
            ${where ? `<p class="eyebrow">${esc(where)}</p>` : ""}
            <h1 class="page-title">${esc(p.name)}</h1>
            ${p.summary ? `<p class="page-intro">${esc(p.summary)}</p>` : ""}
          </div>
        </header>
        <div class="place-layout">
          <div class="prose">
            ${U.paragraphs(p.description) || (p.summary ? `<p>${esc(p.summary)}</p>` : "")}
            ${p.tags.length ? `<p>${p.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join(" ")}</p>` : ""}
          </div>
          <aside class="facts paper" aria-label="Quick facts">
            <dl>${facts.map(([ic, label, value]) => `<div><dt>${icon(ic, { size: 15 })}${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>
            ${hasMap ? '<div class="mini-map" id="place-map" hidden></div>' : ""}
          </aside>
        </div>
      </div>
      ${stories.length ? `<section class="section"><div class="container">${SITE.sectionHead({ eyebrow: "Stories", title: `Stories from ${p.name}` })}<div class="grid grid-3">${stories.map(SITE.storyCard).join("")}</div></div></section>` : ""}
      ${experiences.length ? `<section class="section"><div class="container">${SITE.sectionHead({ eyebrow: "Experiences", title: `Things I loved in ${p.name}`, href: C.links.experiences({ place: p.slug }), link: "See them all" })}<div class="grid grid-3">${experiences.map(SITE.expCard).join("")}</div></div></section>` : ""}
      ${others.length ? `<section class="section"><div class="container">${SITE.sectionHead({ eyebrow: "Keep exploring", title: "Other places", href: C.links.places(), link: "All places" })}${SITE.scroller(others.map(SITE.placeCard).join(""), "Other places")}</div></section>` : ""}
    </article>`;
    if (hasMap) showMap("place-map", (map, el) => map.single(el, { lat: p.lat, lng: p.lng, label: p.name, zoom: 9 }));
  }

  SITE.boot((site, ctx) => {
    const slug = SITE.param("place");
    if (slug) detailView(site, ctx.main, slug);
    else listView(site, ctx.main);
    ctx.once("events", () => {
      ctx.main.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-region]");
        if (!btn) return;
        region = btn.dataset.region;
        SITE.setParams({ region });
        listView(SITE.site, ctx.main);
        SITE.finish(ctx.main);
        const again = ctx.main.querySelector(`button[data-region="${CSS.escape(region)}"]`);
        if (again) again.focus();
      });
    });
  });
})();
