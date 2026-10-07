// Sasha Travel Stories: search (search.html?q=...). Searches stories, places and experiences in the browser, and updates while typing.
(function () {
  "use strict";
  const U = SASHA.util;
  const C = SASHA.content;
  const SITE = SASHA.site;
  const esc = U.esc;
  const icon = SASHA.icon;

  let query = SITE.param("q").trim();
  let site = null;
  let main = null;

  function suggestions() {
    const counts = new Map();
    site.stories.forEach((s) => s.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const regions = [...new Set(site.places.map((p) => p.region).filter(Boolean))];
    return [...new Set([...regions.slice(0, 4), ...tags])].slice(0, 10);
  }

  function suggestHtml(label) {
    const list = suggestions();
    if (!list.length) return "";
    return `<div class="search-suggest"><span>${esc(label)}</span>${list.map((s) => `<button class="chip" type="button" data-q="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
  }

  const block = (title, count, inner) => `<section class="results-section"><h2 class="results-title">${esc(title)} <span>${count}</span></h2>${inner}</section>`;

  function resultsHtml() {
    if (!query) return suggestHtml("Try:");
    const r = C.search(site, query);
    if (!r.total) {
      return SITE.state({ icon: "search", title: "Nothing found", text: `No stories, places or experiences match "${query}". Check the spelling, or try one of these.` }) + suggestHtml("Ideas:");
    }
    return `<p class="result-count">${U.plural(r.total, "result", "results")}</p>
      ${r.stories.length ? block("Stories", r.stories.length, `<div class="grid grid-3">${r.stories.map(SITE.storyCard).join("")}</div>`) : ""}
      ${r.places.length ? block("Places", r.places.length, `<div class="grid grid-4">${r.places.map(SITE.placeCard).join("")}</div>`) : ""}
      ${r.experiences.length ? block("Experiences", r.experiences.length, `<div class="grid grid-3">${r.experiences.map(SITE.expCard).join("")}</div>`) : ""}`;
  }

  const heading = () => (query ? `Results for &ldquo;${esc(query)}&rdquo;` : "What are you looking for?");

  function render() {
    SITE.setTitle(query ? `Search: ${query}` : "Search");
    main.innerHTML = `<section class="page-hero"><div class="container">
        <p class="eyebrow">Search</p>
        <h1 class="page-title">${heading()}</h1>
        <form class="search-page-form" role="search" action="${esc(C.links.search())}" method="get">
          ${icon("search")}
          <input type="search" name="q" value="${esc(query)}" placeholder="Search stories, places, food..." aria-label="Search the blog" autocomplete="off">
          <button class="btn btn-primary btn-sm" type="submit">Search</button>
        </form>
      </div></section>
      <div class="container" id="search-results" aria-live="polite">${resultsHtml()}</div>`;
  }

  function update(value) {
    query = String(value || "").trim();
    SITE.setParams({ q: query });
    SITE.setTitle(query ? `Search: ${query}` : "Search");
    const title = main.querySelector(".page-title");
    if (title) title.innerHTML = heading();
    const box = main.querySelector("#search-results");
    if (box) {
      box.innerHTML = resultsHtml();
      SITE.finish(box);
    }
  }

  SITE.boot((data, ctx) => {
    site = data;
    main = ctx.main;
    if (main.querySelector(".search-page-form")) update(query);
    else render();
    ctx.once("events", () => {
      const typed = U.debounce((value) => update(value), 250);
      main.addEventListener("submit", (e) => {
        const form = e.target.closest(".search-page-form");
        if (!form) return;
        e.preventDefault();
        update(form.q.value);
      });
      main.addEventListener("input", (e) => {
        if (e.target.matches('.search-page-form input[name="q"]')) typed(e.target.value);
      });
      main.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-q]");
        if (!chip) return;
        const input = main.querySelector('.search-page-form input[name="q"]');
        if (input) {
          input.value = chip.dataset.q;
          input.focus();
        }
        update(chip.dataset.q);
      });
    });
    if (!query) {
      const input = main.querySelector('.search-page-form input[name="q"]');
      if (input) input.focus();
    }
  });
})();
